"""
High-level AI task functions: recap, brief, KB linking, radar, auto-agenda.
Each function uses call_ai() with automatic fallback.
"""
import logging
from datetime import datetime, timezone
from typing import Optional

from app.ai.client import call_ai
from app.ai.prompts import (
    RECAP_SYSTEM, RECAP_USER_TEMPLATE,
    BRIEF_SYSTEM, BRIEF_USER_TEMPLATE,
    KB_RERANK_SYSTEM, KB_RERANK_USER_TEMPLATE,
    RADAR_SYSTEM, RADAR_ITEM_TEMPLATE,
    AGENDA_SYSTEM, AGENDA_USER_TEMPLATE,
)
from app.ai.fallback import (
    recap_fallback, brief_fallback, kb_fallback, radar_fallback, agenda_fallback
)

logger = logging.getLogger(__name__)


def generate_recap(
    raw_notes: str,
    participants: list[str],
    meeting_date: Optional[datetime] = None,
) -> tuple[dict, str]:
    """
    Generate a meeting recap (summary, decisions, action items).
    Returns (proposal_dict, mode) where mode is "ai" or "fallback".
    """
    date_str = meeting_date.strftime("%Y-%m-%d") if meeting_date else "unknown date"
    participants_str = ", ".join(participants) if participants else "unknown"

    messages = [
        {"role": "system", "content": RECAP_SYSTEM},
        {"role": "user", "content": RECAP_USER_TEMPLATE.format(
            meeting_date=date_str,
            participants=participants_str,
            raw_notes=raw_notes,
        )},
    ]

    return call_ai(
        messages,
        task="recap",
        fallback_fn=recap_fallback,
        fallback_args={
            "raw_notes": raw_notes,
            "participants": participants,
            "meeting_date": meeting_date,
        },
    )


def generate_brief(
    for_person: str,
    meeting_data: dict,
) -> tuple[str, str]:
    """
    Generate a catchup brief for a specific person.
    Returns (brief_text, mode).
    """
    messages = [
        {"role": "system", "content": BRIEF_SYSTEM},
        {"role": "user", "content": BRIEF_USER_TEMPLATE.format(
            for_person=for_person,
            title=meeting_data.get("title", ""),
            meeting_type=meeting_data.get("type", "meeting"),
            meeting_date=meeting_data.get("meeting_date", ""),
            status=meeting_data.get("status", ""),
            summary=meeting_data.get("summary", "No summary available"),
            decisions=", ".join(meeting_data.get("decisions", [])) or "None",
            owned_items=str(meeting_data.get("owned_items", [])),
            other_items=str(meeting_data.get("other_items", [])),
            overdue_items=str(meeting_data.get("overdue_items", [])),
            carried_items=str(meeting_data.get("carried_items", [])),
        )},
    ]

    try:
        result, mode = call_ai(
            messages,
            task="brief",
            fallback_fn=brief_fallback,
            fallback_args={
                "for_person": for_person,
                "title": meeting_data.get("title", ""),
                "meeting_type": meeting_data.get("type", "meeting"),
                "meeting_date": meeting_data.get("meeting_date", ""),
                "summary": meeting_data.get("summary", ""),
                "decisions": meeting_data.get("decisions", []),
                "owned_items": meeting_data.get("owned_items", []),
                "other_open": meeting_data.get("other_items", []),
                "overdue_items": meeting_data.get("overdue_items", []),
                "carried_items": meeting_data.get("carried_items", []),
            },
        )
        # AI returns a dict with "brief" key or plain string
        if isinstance(result, dict):
            text = result.get("brief") or result.get("text") or str(result)
        else:
            text = str(result)
        return text, mode
    except Exception as e:
        logger.error(f"Brief generation failed completely: {e}")
        text = brief_fallback(
            for_person=for_person,
            title=meeting_data.get("title", ""),
            meeting_type=meeting_data.get("type", "meeting"),
            meeting_date=meeting_data.get("meeting_date", ""),
            summary=meeting_data.get("summary", ""),
            decisions=meeting_data.get("decisions", []),
            owned_items=meeting_data.get("owned_items", []),
            other_open=meeting_data.get("other_items", []),
            overdue_items=meeting_data.get("overdue_items", []),
            carried_items=meeting_data.get("carried_items", []),
        )
        return text, "fallback"


def rerank_kb_candidates(
    item_title: str,
    item_description: str,
    candidates: list[dict],
) -> tuple[list[dict], str]:
    """
    LLM-reranks TF-IDF candidates for KB linking.
    Returns (selected_list, mode).
    """
    candidates_str = "\n".join(
        f"- ID {c['document_id']}: [{c['title']}] {c['content_snippet']}"
        for c in candidates
    )

    messages = [
        {"role": "system", "content": KB_RERANK_SYSTEM},
        {"role": "user", "content": KB_RERANK_USER_TEMPLATE.format(
            item_title=item_title,
            item_description=item_description or "",
            candidates=candidates_str,
        )},
    ]

    result, mode = call_ai(
        messages,
        task="kb_rerank",
        fallback_fn=kb_fallback,
        fallback_args={"tfidf_results": candidates},
    )
    return result.get("selected", []), mode


def explain_radar_item(
    title: str,
    owner: Optional[str],
    due_date: Optional[datetime],
    status: str,
    stale_days: int,
    carry_count: int,
    signals: list[str],
    team_members: list[str],
) -> tuple[dict, str]:
    """
    AI explains risk and rewrites a vague item for the Open-Loop Radar.
    Returns (explanation_dict, mode).
    """
    due_str = due_date.strftime("%Y-%m-%d") if due_date else "no due date"
    messages = [
        {"role": "system", "content": RADAR_SYSTEM},
        {"role": "user", "content": RADAR_ITEM_TEMPLATE.format(
            title=title,
            owner=owner or "none",
            due_date=due_str,
            status=status,
            stale_days=stale_days,
            carry_count=carry_count,
            signals=", ".join(signals) or "none",
            team_members=", ".join(team_members) if team_members else "unknown",
        )},
    ]

    return call_ai(
        messages,
        task="radar",
        fallback_fn=radar_fallback,
        fallback_args={
            "signals": signals,
            "title": title,
            "owner": owner,
        },
    )


def generate_auto_agenda(
    carried_items: list[dict],
    overdue_items: list[dict],
    unresolved_decisions: list[str],
    prev_summary: str = "",
) -> tuple[dict, str]:
    """
    AI drafts an agenda for the next meeting.
    Returns (agenda_dict, mode).
    """
    messages = [
        {"role": "system", "content": AGENDA_SYSTEM},
        {"role": "user", "content": AGENDA_USER_TEMPLATE.format(
            carried_items=str(carried_items[:5]),
            overdue_items=str(overdue_items[:5]),
            unresolved_decisions=str(unresolved_decisions[:3]),
            prev_summary=prev_summary or "No previous summary",
        )},
    ]

    return call_ai(
        messages,
        task="auto_agenda",
        fallback_fn=agenda_fallback,
        fallback_args={
            "carried_items": carried_items,
            "overdue_items": overdue_items,
            "unresolved_decisions": unresolved_decisions,
        },
    )

