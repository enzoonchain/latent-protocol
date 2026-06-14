"""Campaign management endpoints (advertiser side)."""

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from server.auction import block_cost, blocks_affordable
from server.database import get_db
from server.models import AdCreate, BlockPurchase, CampaignCreate, CampaignFund

router = APIRouter()

MIN_CAMPAIGN_BUDGET = 1.0  # minimum campaign budget in USDC


@router.post("/create", status_code=status.HTTP_201_CREATED)
async def create_campaign(req: CampaignCreate, db: AsyncSession = Depends(get_db)):
    """Create a campaign (and register the advertiser if new)."""
    if req.total_budget < MIN_CAMPAIGN_BUDGET:
        raise HTTPException(
            status.HTTP_400_BAD_REQUEST,
            f"Minimum campaign budget is ${MIN_CAMPAIGN_BUDGET:.2f} USDC",
        )

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
                    (advertiser_wallet, name, total_budget, budget_remaining, daily_cap)
                VALUES (:w, :name, :budget, :budget, :cap)
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
    campaign_id: str, req: CampaignFund, db: AsyncSession = Depends(get_db)
):
    """Top up a campaign budget (block purchase).

    In production this is gated by an x402 payment; here we apply the budget
    once funding is confirmed. Reactivates an exhausted campaign.
    """
    row = (
        await db.execute(
            text(
                """
                UPDATE campaigns
                SET total_budget = total_budget + :amt,
                    budget_remaining = budget_remaining + :amt,
                    status = CASE WHEN status = 'exhausted' THEN 'active'
                                  ELSE status END
                WHERE id = CAST(:id AS uuid)
                RETURNING budget_remaining, status
                """
            ),
            {"amt": req.amount, "id": campaign_id},
        )
    ).mappings().first()
    if not row:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "campaign not found")
    await db.commit()
    return {
        "campaign_id": campaign_id,
        "budget_remaining": float(row["budget_remaining"]),
        "status": row["status"],
    }


@router.post("/{campaign_id}/buy")
async def buy_blocks(
    campaign_id: str, req: BlockPurchase, db: AsyncSession = Depends(get_db)
):
    """Buy impression blocks for a campaign.

    In production this is gated by x402 (advertiser pays USDC per block).
    The cost is: blocks × 1000 × bid_per_impression.

    This endpoint expects the x402 payment to have been made separately
    (via the middleware or client-side x402 flow). We apply the budget
    once the payment is confirmed.
    """
    # Get campaign + its ads' bid to calculate block cost
    c = (
        await db.execute(
            text(
                "SELECT id, status, COALESCE(MIN(a.bid_per_impression), 0.005) AS min_bid "
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

    bid = float(c["min_bid"]) if c["min_bid"] else 0.005
    cost = block_cost(bid, req.blocks)

    row = (
        await db.execute(
            text(
                """
                UPDATE campaigns
                SET total_budget = total_budget + :cost,
                    budget_remaining = budget_remaining + :cost,
                    status = CASE WHEN status = 'exhausted' THEN 'active'
                                  ELSE status END
                WHERE id = CAST(:id AS uuid)
                RETURNING budget_remaining, status, total_budget
                """
            ),
            {"cost": cost, "id": campaign_id},
        )
    ).mappings().first()
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
async def list_campaigns(wallet: str = "", db: AsyncSession = Depends(get_db)):
    """List campaigns for an advertiser wallet."""
    if not wallet:
        return {"campaigns": [], "wallet": wallet}
    rows = (
        await db.execute(
            text(
                "SELECT id, name, total_budget, budget_remaining, status, created_at "
                "FROM campaigns WHERE advertiser_wallet = :w "
                "ORDER BY created_at DESC"
            ),
            {"w": wallet},
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
            }
            for r in rows
        ],
    }
