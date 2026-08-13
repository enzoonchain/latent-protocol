"""Pydantic models for API requests/responses."""

from pydantic import BaseModel, Field
from datetime import datetime
from typing import Optional


# ── Ad Requests ──

class AdRequest(BaseModel):
    user_wallet: str
    agent: str = "hermes"
    context: str = "general"
    surface: str = "any"
    tags: list[str] = Field(default_factory=list)


class AdResponse(BaseModel):
    ad_id: str
    title: str
    body: str
    cta_text: str
    cta_url: str
    earn_amount: float
    image_url: Optional[str] = None
    # Signed token the client must echo back on POST /ad/impression.
    impression_token: str = ""


class ImpressionRequest(BaseModel):
    ad_id: str
    user_wallet: str
    token: str = ""  # signed impression token from the /ad/request response
    agent: str = "plugin"
    surface: str = "direct"
    context: str = ""


class ClickRequest(BaseModel):
    ad_id: str
    user_wallet: str
    agent: str = ""
    surface: str = ""
    context: str = ""


# ── Campaign Requests ──

class CampaignCreate(BaseModel):
    advertiser_wallet: str
    name: str
    total_budget: float
    daily_cap: Optional[float] = None


class CampaignFund(BaseModel):
    amount: float = Field(gt=0)  # USDC to add to the campaign budget


class BlockPurchase(BaseModel):
    blocks: int = Field(gt=0, le=1000)
    bid_per_impression: Optional[float] = Field(None, gt=0)  # overrides the DB-computed bid


class AdCreate(BaseModel):
    # Sourced from the URL path; optional in the request body.
    campaign_id: Optional[str] = None
    title: str = Field(max_length=30)
    body: str = Field(max_length=140)
    cta_text: str = "Learn more"
    cta_url: str
    image_url: Optional[str] = None
    category: str = "general"
    tags: list[str] = Field(default_factory=list)
    bid_per_impression: float = 0.005


# ── Earnings ──

class EarningsResponse(BaseModel):
    wallet_address: str
    balance: float
    total_earned: float
    total_impressions: int
    total_clicks: int


class PayoutRequest(BaseModel):
    wallet_address: str


class PayoutResponse(BaseModel):
    payout_id: str
    amount: float
    tx_hash: str
    status: str


# ── Pre-launch ──

class PrelaunchMetricsPayload(BaseModel):
    scan_version: str = "1"
    days_scanned: int = 30
    billable_slots: int = 0
    missed_usd_estimate: float = 0.0
    top_bid: float = 0.005
    per_agent: list[dict] = Field(default_factory=list)


class PrelaunchRegisterRequest(BaseModel):
    wallet: str
    agents: list[str] = Field(default_factory=list)
    metrics: PrelaunchMetricsPayload = Field(default_factory=PrelaunchMetricsPayload)


class PrelaunchRegisterResponse(BaseModel):
    wallet: str
    registered: bool
    updated: bool
