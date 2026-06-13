"""Unit tests for the pure matcher helpers (no DB required)."""

import random

from server.matcher import tag_match_score, weighted_choice


def test_tag_match_score_tag_overlap():
    score = tag_match_score(
        ad_category="defi",
        ad_tags=["defi", "dex"],
        context="looking at token swaps",
        req_tags=["defi", "dex"],
    )
    # 2 (category requested) + 2*2 (two tag overlaps) = 6
    assert score == 6


def test_tag_match_score_context_mention():
    score = tag_match_score(
        ad_category="security",
        ad_tags=["audit"],
        context="please audit my security contract",
        req_tags=[],
    )
    # category 'security' in context (2) + tag 'audit' in context (1) = 3
    assert score == 3


def test_tag_match_score_general_category_ignored():
    # 'general' category should not score just for appearing in context.
    assert tag_match_score("general", [], "general chatter", []) == 0


def test_tag_match_score_no_match():
    assert tag_match_score("nft", ["art"], "defi yields", ["lending"]) == 0


def test_weighted_choice_empty():
    assert weighted_choice([]) is None


def test_weighted_choice_respects_weight():
    candidates = [
        {"id": "low", "_weight": 0.0001},
        {"id": "high", "_weight": 1000.0},
    ]
    rng = random.Random(42)
    picks = [weighted_choice(candidates, rng)["id"] for _ in range(200)]
    # The heavily-weighted candidate should dominate.
    assert picks.count("high") > picks.count("low")


def test_weighted_choice_zero_weights_uniform_fallback():
    candidates = [{"id": "a", "_weight": 0.0}, {"id": "b", "_weight": 0.0}]
    # Should not raise and must return one of the candidates.
    assert weighted_choice(candidates, random.Random(1))["id"] in {"a", "b"}
