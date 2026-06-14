"""Campaign management endpoints (advertiser side)."""

from fastapi import APIRouter, Depends, HTTPException, Request, status
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from server.auction import block_cost, blocks_affordable
from server.database import get_db
from server.models import AdCreate, BlockPurchase, CampaignCreate, CampaignFund
from server.x402_payments import settle_payment_or_402

router = APIRouter()

MIN_CAMPAIGN_BUDGET = 0.0  # budget starts at 0; grows with each block purchase


async def _record_payment(
    db: AsyncSession,
    campaign_id: str,
    kind: str,
    amount: float,
    settlement: dict,
) -> None:
    """Audit a settled advertiser payment. No-op when x402 is disabled
    (settlement is empty / not settled), so dev flows leave no rows."""
    if not settlement.get("settled"):
        return
    await db.execute(
        text(
            """
            INSERT INTO payments (campaign_id, kind, amount, network, payer, tx_hash, status)
            VALUES (CAST(:cid AS uuid), :kind, :amount, :network, :payer, :tx_hash, 'settled')
            """
        ),
        {
            "cid": campaign_id,
            "kind": kind,
            "amount": amount,
            "network": settlement.get("network", ""),
            "payer": settlement.get("payer"),
            "tx_hash": settlement.get("tx_hash"),
        },
    )


@router.post("/create", status_code=status.HTTP_201_CREATED)
async def create_campaign(req: CampaignCreate, db: AsyncSession = Depends(get_db)):
    """Create a campaign (and register the advertiser if new)."""
    await db.execute(
        text(
            "INSERT INTO advertisers (wallet_address) VALUES (:w) "
            "ON CONFLICT (wallet_address) DO NOTHING"
        ),
        {"w": req.advertiser_wallet},
    )
    row = (
        await db.execute(
            text(
                """
                INSERT INTO campaigns
                    (advertiser_wallet, name, total_budget, budget_remaining, daily_cap, status)
                VALUES (:w, :name, :budget, :budget, :cap, 'active')
                RETURNING id
                """
            ),
            {
                "w": req.advertiser_wallet,
                "name": req.name,
                "budget": req.total_budget,
                "cap": req.daily_cap,
            },
        )
    ).mappings().first()
    await db.commit()
    return {"campaign_id": str(row["id"]), "status": "active"}


@router.post("/{campaign_id}/ad", status_code=status.HTTP_201_CREATED)
async def add_ad_to_campaign(
    campaign_id: str, req: AdCreate, db: AsyncSession = Depends(get_db)
):
    """Add an ad creative to a campaign."""
    exists = (
        await db.execute(
            text("SELECT 1 FROM campaigns WHERE id = CAST(:id AS uuid)"),
            {"id": campaign_id},
        )
    ).first()
    if not exists:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "campaign not found")

    row = (
        await db.execute(
            text(
                """
                INSERT INTO ads
                    (campaign_id, title, body, cta_text, cta_url, image_url,
                     category, tags, bid_per_impression)
                VALUES
                    (CAST(:cid AS uuid), :title, :body, :cta_text, :cta_url,
                     :image_url, :category, CAST(:tags AS text[]), :bid)
                RETURNING id
                """
            ),
            {
                "cid": campaign_id,
                "title": req.title,
                "body": req.body,
                "cta_text": req.cta_text,
                "cta_url": req.cta_url,
                "image_url": req.image_url,
                "category": req.category,
                "tags": list(req.tags),
                "bid": req.bid_per_impression,
            },
        )
    ).mappings().first()
    await db.commit()
    return {"ad_id": str(row["id"]), "status": "active"}


@router.post("/{campaign_id}/fund")
async def fund_campaign(
    campaign_id: str,
    req: CampaignFund,
    request: Request,
    db: AsyncSession = Depends(get_db),
):
    """Top up a campaign budget.

    Gated by x402: when payments are enabled the budget is credited only after
    the facilitator settles the payment on-chain. Reactivates an exhausted
    campaign.
    """
    settlement = await settle_payment_or_402(
        request, req.amount, resource=f"/campaign/{campaign_id}/fund"
    )
    row = (
        await db.execute(
            text(
                """
                UPDATE campaigns
                SET total_budget = total_budget + :amt,
                    budget_remaining = budget_remaining + :amt,
                    status = 'active'
                WHERE id = CAST(:id AS uuid)
                RETURNING budget_remaining, status
                """
            ),
            {"amt": req.amount, "id": campaign_id},
        )
    ).mappings().first()
    if not row:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "campaign not found")
    await _record_payment(db, campaign_id, "fund", req.amount, settlement)
    await db.commit()
    return {
        "campaign_id": campaign_id,
        "budget_remaining": float(row["budget_remaining"]),
        "status": row["status"],
        "tx_hash": settlement.get("tx_hash"),
    }


@router.post("/{campaign_id}/buy")
async def buy_blocks(
    campaign_id: str,
    req: BlockPurchase,
    request: Request,
    db: AsyncSession = Depends(get_db),
):
    """Buy impression blocks for a campaign.

    Gated by x402 (advertiser pays USDC per block).
    The cost is: blocks × 1000 × bid_per_impression.

    When payments are enabled the budget is only credited after the
    facilitator settles the x402 payment on-chain — `settle_payment_or_402`
    returns a signable 402 (or fails) otherwise, so blocks can never be
    acquired for free.
    """
    # Get campaign + its ads' bid to calculate block cost
    c = (
        await db.execute(
            text(
                "SELECT c.id, c.status, COALESCE(MIN(a.bid_per_impression), 0.005) AS min_bid "
                "FROM campaigns c "
                "LEFT JOIN ads a ON a.campaign_id = c.id "
                "WHERE c.id = CAST(:id AS uuid) "
                "GROUP BY c.id"
            ),
            {"id": campaign_id},
        )
    ).mappings().first()
    if not c:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "campaign not found")

    bid = req.bid_per_impression or (float(c["min_bid"]) if c["min_bid"] else 0.005)
    cost = block_cost(bid, req.blocks)

    # Fail closed: verify + settle the payment on-chain before crediting budget.
    settlement = await settle_payment_or_402(
        request, cost, resource=f"/campaign/{campaign_id}/buy"
    )

    row = (
        await db.execute(
            text(
                """
                UPDATE campaigns
                SET total_budget = total_budget + :cost,
                    budget_remaining = budget_remaining + :cost,
                    status = 'active'
                WHERE id = CAST(:id AS uuid)
                RETURNING budget_remaining, status, total_budget
                """
            ),
            {"cost": cost, "id": campaign_id},
        )
    ).mappings().first()
    await _record_payment(db, campaign_id, "buy", cost, settlement)
    await db.commit()

    return {
        "campaign_id": campaign_id,
        "blocks_purchased": req.blocks,
        "impressions_added": req.blocks * 1000,
        "cost_usdc": cost,
        "bid_per_impression": bid,
        "budget_remaining": float(row["budget_remaining"]),
        "total_budget": float(row["total_budget"]),
        "status": row["status"],
        "tx_hash": settlement.get("tx_hash"),
    }


@router.get("/{campaign_id}/status")
async def get_campaign_status(campaign_id: str, db: AsyncSession = Depends(get_db)):
    """Debug endpoint: detailed campaign + ad status for troubleshooting."""
    c = (
        await db.execute(
            text(
                """
                SELECT c.id, c.advertiser_wallet, c.name, c.total_budget,
                       c.budget_remaining, c.status AS campaign_status, c.created_at
                FROM campaigns c
                WHERE c.id = CAST(:id AS uuid)
                """
            ),
            {"id": campaign_id},
        )
    ).mappings().first()
    if not c:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "campaign not found")

    ads = (
        await db.execute(
            text(
                """
                SELECT a.id, a.title, a.status AS ad_status, a.bid_per_impression,
                       a.created_at
                FROM ads a
                WHERE a.campaign_id = CAST(:id AS uuid)
                """
            ),
            {"id": campaign_id},
        )
    ).mappings().all()

    impressions = (
        await db.execute(
            text(
                """
                SELECT count(*) AS total,
                       count(*) FILTER (WHERE clicked) AS clicks
                FROM impressions i
                JOIN ads a ON a.id = i.ad_id
                WHERE a.campaign_id = CAST(:id AS uuid)
                """
            ),
            {"id": campaign_id},
        )
    ).mappings().first()

    return {
        "campaign": {
            "id": str(c["id"]),
            "name": c["name"],
            "status": c["campaign_status"],
            "total_budget": float(c["total_budget"]),
            "budget_remaining": float(c["budget_remaining"]),
            "created_at": c["created_at"].isoformat(),
        },
        "ads": [
            {
                "id": str(a["id"]),
                "title": a["title"],
                "status": a["ad_status"],
                "bid_per_impression": float(a["bid_per_impression"]),
                "created_at": a["created_at"].isoformat(),
            }
            for a in ads
        ],
        "stats": {
            "total_impressions": int(impressions["total"]),
            "total_clicks": int(impressions["clicks"]),
        },
        "checks": {
            "budget_positive": float(c["budget_remaining"]) > 0,
            "has_active_ads": any(a["ad_status"] == "active" for a in ads),
            "can_serve": (
                float(c["budget_remaining"]) > 0
                and any(a["ad_status"] == "active" for a in ads)
            ),
        },
    }


@router.get("/{campaign_id}")
async def get_campaign(campaign_id: str, db: AsyncSession = Depends(get_db)):
    """Campaign details + serving stats."""
    c = (
        await db.execute(
            text(
                "SELECT id, advertiser_wallet, name, total_budget, "
                "budget_remaining, daily_cap, status, created_at "
                "FROM campaigns WHERE id = CAST(:id AS uuid)"
            ),
            {"id": campaign_id},
        )
    ).mappings().first()
    if not c:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "campaign not found")

    stats = (
        await db.execute(
            text(
                """
                SELECT
                    count(i.*) AS impressions,
                    count(i.*) FILTER (WHERE i.clicked) AS clicks,
                    min(a.bid_per_impression) AS min_bid
                FROM ads a
                LEFT JOIN impressions i ON i.ad_id = a.id
                WHERE a.campaign_id = CAST(:id AS uuid)
                """
            ),
            {"id": campaign_id},
        )
    ).mappings().first()

    impressions = int(stats["impressions"] or 0)
    clicks = int(stats["clicks"] or 0)
    min_bid = float(stats["min_bid"]) if stats["min_bid"] is not None else 0.0
    budget_remaining = float(c["budget_remaining"])
    ctr = round(clicks / impressions, 4) if impressions else 0.0

    return {
        "campaign_id": str(c["id"]),
        "advertiser_wallet": c["advertiser_wallet"],
        "name": c["name"],
        "total_budget": float(c["total_budget"]),
        "budget_remaining": budget_remaining,
        "status": c["status"],
        "impressions": impressions,
        "clicks": clicks,
        "ctr": ctr,
        "blocks_remaining": blocks_affordable(budget_remaining, min_bid),
    }


@router.get("/")
async def list_campaigns(wallet: str = "", status: str = "", db: AsyncSession = Depends(get_db)):
    """List campaigns. Optional wallet and status filters.
    
    - No wallet: returns ALL campaigns (for live marketplace)
    - With wallet: returns campaigns for that wallet
    - With status: filters by status (active, paused, exhausted)
    """
    conditions = []
    params = {}

    if wallet:
        conditions.append("c.advertiser_wallet = :w")
        params["w"] = wallet
    
    if status:
        conditions.append("c.status = :status")
        params["status"] = status

    where_clause = "WHERE " + " AND ".join(conditions) if conditions else ""

    rows = (
        await db.execute(
            text(
                f"""
                SELECT c.id, c.name, c.total_budget, c.budget_remaining, c.status,
                       COALESCE(MIN(a.bid_per_impression), 0.005) AS min_bid
                FROM campaigns c
                LEFT JOIN ads a ON a.campaign_id = c.id
                {where_clause}
                GROUP BY c.id
                ORDER BY MAX(c.created_at) DESC
                """
            ),
            params,
        )
    ).mappings().all()
    return {
        "wallet": wallet,
        "campaigns": [
            {
                "campaign_id": str(r["id"]),
                "name": r["name"],
                "total_budget": float(r["total_budget"]),
                "budget_remaining": float(r["budget_remaining"]),
                "status": r["status"],
                "min_bid": float(r["min_bid"]),
                "block_cost_usdc": round(float(r["min_bid"]) * 1000, 6),
            }
            for r in rows
        ],
    }
