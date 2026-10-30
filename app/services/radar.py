"""
Open-Loop Radar scoring service.
Scores every open action item for slip risk using deterministic signals,
then optionally enriches with AI explanations.

Risk signals and weights:
- no_owner: 30 points
- no_due_date: 15 points
- overdue: 25 points
- vague_title: 15 points  (fuzzy match on keywords like "look into", "follow up")
- stale: 20 points        (no events for > 7 days)
- missed_owner: 20 points (owner marked as missed in any recent meeting)
- carried_multiple: 20 points (carried forward > 1 time)

Max meaningful score is ~145; normalized to 0-1 internally, returned as 0-100.
"""
import logging
import re
from datetime import datetime, timezone, timedelta
from typing import Optional

logger = logging.getLogger(__name__)

# Words that suggest vague action items
_VAGUE_PATTERNS = re.compile(
    r"\b(look into|follow up|check|investigate|explore|discuss|review|consider|maybe|possibly|sort out)\b",
    re.IGNORECASE,
)

_SIGNAL_WEIGHTS = {
    "no_owner": 30,
    "no_due_date": 15,
    "overdue": 25,
    "vague_title": 15,
    "stale": 20,
    "missed_owner": 20,
    "carried_multiple": 20,
}


def compute_risk_score(
    title: str,
    owner: Optional[str],
    due_date: Optional[datetime],
    status: str,
    last_event_at: Optional[datetime],
    carry_count: int,
    owner_attendance: Optional[str] = None,  # "missed" | "no_response" | etc.
    stale_days_threshold: int = 7,
) -> tuple[float, list[str]]:
    """
    Compute a risk score (0–100) for a single action item.
    Returns (score, list_of_active_signals).
    This function is pure (no DB, no AI) so it's easy to unit-test.
    """
    now = datetime.now(timezone.utc)
    signals: list[str] = []
    raw_score = 0

    # Signal: no owner
    if not owner:
        signals.append("no_owner")
        raw_score += _SIGNAL_WEIGHTS["no_owner"]

    # Signal: no due date
    if not due_date:
        signals.append("no_due_date")
        raw_score += _SIGNAL_WEIGHTS["no_due_date"]

    # Signal: overdue (has due date and it's in the past)
    if due_date and due_date.replace(tzinfo=timezone.utc) < now:
        signals.append("overdue")
        raw_score += _SIGNAL_WEIGHTS["overdue"]

    # Signal: vague title
    if _VAGUE_PATTERNS.search(title):
        signals.append("vague_title")
        raw_score += _SIGNAL_WEIGHTS["vague_title"]

    # Signal: stale (no event for stale_days_threshold days)
    if last_event_at:
        # Ensure timezone-aware comparison
        if last_event_at.tzinfo is None:
            last_event_at = last_event_at.replace(tzinfo=timezone.utc)
        days_since = (now - last_event_at).days
        if days_since >= stale_days_threshold:
            signals.append("stale")
            raw_score += _SIGNAL_WEIGHTS["stale"]
    else:
        # No events at all → treat as stale
        signals.append("stale")
        raw_score += _SIGNAL_WEIGHTS["stale"]

    # Signal: owner marked as missed or no_response in the meeting
    if owner_attendance in ("missed", "no_response"):
        signals.append("missed_owner")
        raw_score += _SIGNAL_WEIGHTS["missed_owner"]

    # Signal: carried forward more than once
    if carry_count > 1:
        signals.append("carried_multiple")
        raw_score += _SIGNAL_WEIGHTS["carried_multiple"]

    # Normalize to 0-100
    max_possible = sum(_SIGNAL_WEIGHTS.values())
    score = min(100.0, (raw_score / max_possible) * 100)

    return round(score, 1), signals


def format_risk_reason(signals: list[str]) -> str:
    """Human-readable summary of active risk signals (fallback text)."""
    label_map = {
        "no_owner": "no owner assigned",
        "no_due_date": "no due date set",
        "overdue": "past due date",
        "vague_title": "vague/unclear title",
        "stale": "no recent activity",
        "missed_owner": "owner missed the meeting",
        "carried_multiple": "carried forward multiple times",
    }
    parts = [label_map.get(s, s) for s in signals]
    if not parts:
        return "Low risk – no signals detected"
    return "Risk factors: " + "; ".join(parts)

