"""
Rule-based fallback implementations for when AI is unavailable.
These are simple heuristics that always work, even without any API keys.
"""
import re
from typing import Optional
from datetime import datetime, timedelta, timezone


def _extract_decisions(text: str) -> list[str]:
    """
    Find lines containing "Decision:", "Decided:", "We agreed", "Agreed to" etc.
    """
    decisions = []
    patterns = [
        r"(?:Decision|Decided|Resolved|Agreed)[:\s]+(.+)",
        r"(?:We agreed|Team agreed)[:\s]+(.+)",
    ]
    for line in text.splitlines():
        for pat in patterns:
            m = re.search(pat, line, re.IGNORECASE)
            if m:
                decisions.append(m.group(1).strip())
                break
    return decisions[:5]  # cap at 5 to avoid noise


def _extract_action_items(text: str, participants: list[str], meeting_date: Optional[datetime] = None) -> list[dict]:
    """
    Find patterns like:
    - "Alice will X by Friday"
    - "Action: X – owner: Alice"
    - "@Alice: X"
    """
    items = []
    patterns = [
        # "Name will/to do X by date"
        r"([A-Z][a-z]+)\s+(?:will|to)\s+(.+?)(?:\s+by\s+(.+?))?[\.;]?\s*$",
        # "Action: X – owner: Name"
        r"Action(?:\s+item)?[:\s]+(.+?)(?:[–-]\s*owner[:\s]+(.+?))?[\.;]?\s*$",
        # "@Name: action"
        r"@([A-Z][a-z]+)[:\s]+(.+)",
    ]

    participant_lower = {p.lower(): p for p in participants}

    for line in text.splitlines():
        line = line.strip()
        if not line or len(line) < 10:
            continue
        for pat in patterns:
            m = re.match(pat, line, re.IGNORECASE)
            if m:
                groups = m.groups()
                # Try to find owner from first captured group
                potential_owner = groups[0].strip() if groups[0] else None
                # Validate owner is in participants
                owner = None
                if potential_owner:
                    owner = participant_lower.get(potential_owner.lower())

                action_text = groups[1].strip() if len(groups) > 1 and groups[1] else line
                due_raw = groups[2].strip() if len(groups) > 2 and groups[2] else None

                # Try to resolve relative dates
                due_date = None
                if due_raw and meeting_date:
                    due_date = _resolve_relative_date(due_raw, meeting_date)

                items.append({
                    "title": action_text[:200],
                    "description": None,
                    "owner": owner,
                    "due_date": due_date.strftime("%Y-%m-%d") if due_date else None,
                    "confidence": 0.5,
                    "needs_owner": owner is None,
                })
                break

    return items[:10]


def _resolve_relative_date(text: str, reference: datetime) -> Optional[datetime]:
    """Very simple relative date resolver for fallback mode."""
    text_lower = text.lower().strip()
    weekdays = ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"]

    if "today" in text_lower:
        return reference
    if "tomorrow" in text_lower:
        return reference + timedelta(days=1)
    if "next week" in text_lower:
        return reference + timedelta(weeks=1)
    if "end of week" in text_lower or "eow" in text_lower:
        # Find Friday of the reference week
        days_to_friday = (4 - reference.weekday()) % 7
        return reference + timedelta(days=days_to_friday)

    for i, day in enumerate(weekdays):
        if day in text_lower:
            # "by Friday" = next occurrence of that weekday
            target_weekday = i
            days_ahead = (target_weekday - reference.weekday()) % 7
            if days_ahead == 0:
                days_ahead = 7
            return reference + timedelta(days=days_ahead)

    return None


def recap_fallback(
    raw_notes: str,
    participants: list[str],
    meeting_date: Optional[datetime] = None,
) -> dict:
    """
    Rule-based recap: first 3 sentences as summary, regex decisions and items.
    Used when AI is unavailable.
    """
    # Summary: first 3 non-empty sentences
    sentences = re.split(r"(?<=[.!?])\s+", raw_notes.strip())
    summary_sentences = [s.strip() for s in sentences if s.strip()][:3]
    summary = " ".join(summary_sentences) or "No summary available (AI offline)."

    decisions = _extract_decisions(raw_notes)
    action_items = _extract_action_items(raw_notes, participants, meeting_date)

    return {
        "summary": summary,
        "decisions": decisions,
        "action_items": action_items,
    }


def brief_fallback(
    for_person: str,
    title: str,
    meeting_type: str,
    meeting_date: str,
    summary: str,
    decisions: list[str],
    owned_items: list[dict],
    other_open: list[dict],
    overdue_items: list[dict],
    carried_items: list[dict],
) -> str:
    """
    Template-based catchup brief for when AI is unavailable.
    """
    lines = [
        f"Catchup Brief for {for_person}",
        f"Meeting: {title} ({meeting_type}) – {meeting_date}",
        "",
    ]

    if summary:
        lines += ["SUMMARY", summary, ""]

    if decisions:
        lines += ["KEY DECISIONS"]
        for d in decisions[:3]:
            lines.append(f"• {d}")
        lines.append("")

    if owned_items:
        lines += [f"YOUR ACTION ITEMS ({len(owned_items)})"]
        for item in owned_items[:5]:
            due = f" – due {item.get('due_date', 'TBD')}" if item.get("due_date") else ""
            lines.append(f"• [{item['status'].upper()}] {item['title']}{due}")
        lines.append("")

    if overdue_items:
        lines += [f"OVERDUE ITEMS ({len(overdue_items)})"]
        for item in overdue_items[:3]:
            lines.append(f"• {item['title']} (owner: {item.get('owner', 'unassigned')})")
        lines.append("")

    if carried_items:
        lines.append(f"Note: {len(carried_items)} item(s) carried forward from previous meeting.")

    return "\n".join(lines)


def kb_fallback(tfidf_results: list[dict]) -> dict:
    """Return TF-IDF top 3 as fallback KB suggestions (no LLM reranking)."""
    selected = [
        {
            "document_id": r["document_id"],
            "reason": f"TF-IDF similarity score: {r['score']:.2f}",
        }
        for r in tfidf_results[:3]
    ]
    return {"selected": selected}


def radar_fallback(signals: list[str], title: str, owner: Optional[str]) -> dict:
    """Rule-based risk explanation and nudge for Open-Loop Radar."""
    reasons = []
    if not owner:
        reasons.append("no owner assigned")
    if "overdue" in signals:
        reasons.append("past due date")
    if "vague_title" in signals:
        reasons.append("title is vague")
    if "stale" in signals:
        reasons.append("no recent activity")
    if "carried_multiple" in signals:
        reasons.append("carried forward multiple times")

    risk_reason = "Risk: " + "; ".join(reasons) if reasons else "Low activity on this item"
    nudge = (
        f"Hi{' ' + owner if owner else ''}, just checking in on '{title}'. "
        "Could you provide a quick status update? "
        "If you need help or it's blocked, let the team know."
    )

    return {
        "risk_reason": risk_reason,
        "rewritten_title": title,  # can't rewrite without AI
        "suggested_owner": None,
        "nudge_message": nudge,
    }


def agenda_fallback(
    carried_items: list[dict],
    overdue_items: list[dict],
    unresolved_decisions: list[str],
) -> dict:
    """Build a simple agenda ordered by urgency (overdue first)."""
    agenda_items = []
    order = 1

    for item in overdue_items[:3]:
        agenda_items.append({
            "order": order,
            "title": f"Review overdue: {item['title']}",
            "description": f"Status check – item is past due. Owner: {item.get('owner', 'TBD')}",
            "time_minutes": 5,
        })
        order += 1

    for item in carried_items[:4]:
        agenda_items.append({
            "order": order,
            "title": f"Follow-up: {item['title']}",
            "description": "Carried from previous meeting – confirm status or next steps",
            "time_minutes": 5,
        })
        order += 1

    for decision in unresolved_decisions[:2]:
        agenda_items.append({
            "order": order,
            "title": f"Revisit: {decision[:80]}",
            "description": "Decision from previous meeting may need follow-through",
            "time_minutes": 5,
        })
        order += 1

    return {"agenda_items": agenda_items or [{"order": 1, "title": "General sync", "description": "Team update", "time_minutes": 30}]}

