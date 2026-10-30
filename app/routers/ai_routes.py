"""
AI endpoints: recap generation + apply, catchup brief.
"""
import logging
from datetime import datetime, timezone
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session, selectinload

from app.database import get_db
from app.models import Meeting, ActionItem, ItemEvent, Decision, Participant, Brief
from app.schemas import RecapProposal, BriefOut
from app.ai.tasks import generate_recap, generate_brief

router = APIRouter(prefix="/api/meetings", tags=["ai"])
logger = logging.getLogger(__name__)


@router.post("/{meeting_id}/ai/recap", response_model=RecapProposal)
def generate_recap_endpoint(meeting_id: int, db: Session = Depends(get_db)):
    """
    Generate an AI recap proposal from the meeting's raw notes.
    Returns a PROPOSAL only – does NOT save anything yet.
    The user reviews and calls /ai/recap/apply to save.
    """
    meeting = db.query(Meeting).options(
        selectinload(Meeting.participants),
    ).filter(Meeting.id == meeting_id).first()

    if not meeting:
        raise HTTPException(status_code=404, detail="Meeting not found")
    if not meeting.raw_notes or not meeting.raw_notes.strip():
        raise HTTPException(status_code=422, detail="Meeting has no raw notes to process")

    participants = [p.name for p in meeting.participants]

    result, mode = generate_recap(
        raw_notes=meeting.raw_notes,
        participants=participants,
        meeting_date=meeting.scheduled_at or meeting.created_at,
    )

    # Validate and normalise action items
    action_items = []
    for ai_item in result.get("action_items", []):
        # Security: ensure owner is from participant list or null
        owner = ai_item.get("owner")
        needs_owner = ai_item.get("needs_owner", False)
        if owner and owner not in participants:
            logger.warning(f"AI hallucinated owner '{owner}', setting to null")
            owner = None
            needs_owner = True

        action_items.append({
            "title": ai_item.get("title", "Untitled")[:200],
            "description": ai_item.get("description"),
            "owner": owner,
            "due_date": ai_item.get("due_date"),
            "confidence": float(ai_item.get("confidence", 0.8)),
            "needs_owner": needs_owner,
        })

    return RecapProposal(
        summary=result.get("summary", ""),
        decisions=result.get("decisions", []),
        action_items=action_items,
        ai_mode=mode,
    )


@router.post("/{meeting_id}/ai/recap/apply")
def apply_recap(
    meeting_id: int, payload: RecapProposal, db: Session = Depends(get_db)
):
    """
    Save a (possibly human-edited) recap proposal to the database.
    Creates Decision and ActionItem records, updates meeting summary.
    """
    meeting = db.query(Meeting).filter(Meeting.id == meeting_id).first()
    if not meeting:
        raise HTTPException(status_code=404, detail="Meeting not found")

    # Save summary
    meeting.summary = payload.summary
    meeting.updated_at = datetime.now(timezone.utc)

    # Save decisions
    for decision_text in payload.decisions:
        d = Decision(meeting_id=meeting_id, text=decision_text)
        db.add(d)

    # Save action items
    now = datetime.now(timezone.utc)
    for item_data in payload.action_items:
        due_date = None
        if item_data.due_date:
            try:
                due_date = datetime.fromisoformat(str(item_data.due_date))
                if due_date.tzinfo is None:
                    due_date = due_date.replace(tzinfo=timezone.utc)
            except (ValueError, TypeError):
                due_date = None

        item = ActionItem(
            title=item_data.title,
            description=item_data.description,
            owner=item_data.owner,
            due_date=due_date,
            status="open",
            origin_meeting_id=meeting_id,
            current_meeting_id=meeting_id,
            ai_generated=True,
        )
        db.add(item)
        db.flush()
        event = ItemEvent(
            item_id=item.id,
            event_type="created",
            old_value=None,
            new_value=item.title,
            actor="ai",
        )
        db.add(event)

    db.commit()
    logger.info(
        "meeting.recap_applied",
        extra={
            "event": "meeting.recap_applied",
            "meeting_id": meeting_id,
            "decisions": len(payload.decisions),
            "items": len(payload.action_items),
        },
    )
    return {"status": "ok", "meeting_id": meeting_id}


@router.get("/{meeting_id}/brief")
def get_brief(
    meeting_id: int,
    for_person: str = Query(..., alias="for"),
    db: Session = Depends(get_db),
):
    """
    Generate or retrieve a cached catchup brief for a specific person.
    Input is structured DB data (not raw notes) for privacy.
    """
    meeting = db.query(Meeting).options(
        selectinload(Meeting.participants),
        selectinload(Meeting.decisions),
        selectinload(Meeting.action_items),
    ).filter(Meeting.id == meeting_id).first()

    if not meeting:
        raise HTTPException(status_code=404, detail="Meeting not found")

    # Check cache (reuse if generated in last hour)
    cached = db.query(Brief).filter(
        Brief.meeting_id == meeting_id,
        Brief.for_person == for_person,
    ).order_by(Brief.created_at.desc()).first()

    # Build structured data (NEVER pass raw notes to AI for the brief)
    now = datetime.now(timezone.utc)
    all_items = meeting.action_items

    owned = [
        {"title": i.title, "status": i.status, "due_date": i.due_date.strftime("%Y-%m-%d") if i.due_date else None}
        for i in all_items if i.owner == for_person
    ]
    other = [
        {"title": i.title, "owner": i.owner, "status": i.status}
        for i in all_items if i.owner != for_person and i.status in ("open", "in_progress")
    ]
    overdue = [
        {"title": i.title, "owner": i.owner}
        for i in all_items
        if i.due_date and i.due_date.replace(tzinfo=timezone.utc) < now and i.status in ("open", "in_progress")
    ]
    carried = [
        {"title": i.title}
        for i in all_items if i.carried_from_id is not None
    ]

    meeting_data = {
        "title": meeting.title,
        "type": meeting.type,
        "meeting_date": (meeting.scheduled_at or meeting.created_at).strftime("%Y-%m-%d"),
        "status": meeting.status,
        "summary": meeting.summary or "",
        "decisions": [d.text for d in meeting.decisions],
        "owned_items": owned,
        "other_items": other,
        "overdue_items": overdue,
        "carried_items": carried,
    }

    text, mode = generate_brief(for_person=for_person, meeting_data=meeting_data)

    # Cache it
    brief = Brief(
        meeting_id=meeting_id,
        for_person=for_person,
        text=text,
        generated_by=mode,
    )
    db.add(brief)
    db.commit()
    db.refresh(brief)

    return {"brief": text, "generated_by": mode, "brief_id": brief.id}

