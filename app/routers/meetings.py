"""
Meetings API router: CRUD, status transitions, carry-forward.
"""
import logging
from datetime import datetime, timezone
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session, selectinload

from app.database import get_db
from app.models import Meeting, Participant, Decision, ActionItem, ItemEvent, KBDocument
from app.schemas import (
    MeetingCreate, MeetingUpdate, MeetingStatusChange, MeetingOut, MeetingListOut,
    ParticipantCreate, ParticipantUpdate, ParticipantOut,
    DecisionCreate, DecisionUpdate, DecisionOut,
    CarryForwardRequest, CarryForwardResult,
    VALID_MEETING_TRANSITIONS,
)
from app.logging_setup import request_id_var

router = APIRouter(prefix="/api/meetings", tags=["meetings"])
logger = logging.getLogger(__name__)


def _get_meeting_or_404(meeting_id: int, db: Session) -> Meeting:
    meeting = db.query(Meeting).options(
        selectinload(Meeting.participants),
        selectinload(Meeting.decisions),
        selectinload(Meeting.action_items).selectinload(ActionItem.events),
    ).filter(Meeting.id == meeting_id).first()
    if not meeting:
        raise HTTPException(status_code=404, detail=f"Meeting {meeting_id} not found")
    return meeting


# ─── Meetings CRUD ────────────────────────────────────────────────────────────

@router.post("", response_model=MeetingOut, status_code=201)
def create_meeting(payload: MeetingCreate, db: Session = Depends(get_db)):
    meeting = Meeting(**payload.model_dump())
    db.add(meeting)
    db.commit()
    db.refresh(meeting)
    logger.info(
        "meeting.created",
        extra={"event": "meeting.created", "meeting_id": meeting.id, "type": meeting.type},
    )
    return _get_meeting_or_404(meeting.id, db)


@router.get("", response_model=list[MeetingListOut])
def list_meetings(
    type: Optional[str] = Query(None),
    status: Optional[str] = Query(None),
    db: Session = Depends(get_db),
):
    q = db.query(Meeting)
    if type:
        q = q.filter(Meeting.type == type)
    if status:
        q = q.filter(Meeting.status == status)
    return q.order_by(Meeting.created_at.desc()).all()


@router.get("/{meeting_id}", response_model=MeetingOut)
def get_meeting(meeting_id: int, db: Session = Depends(get_db)):
    return _get_meeting_or_404(meeting_id, db)


@router.put("/{meeting_id}", response_model=MeetingOut)
def update_meeting(meeting_id: int, payload: MeetingUpdate, db: Session = Depends(get_db)):
    meeting = _get_meeting_or_404(meeting_id, db)
    update_data = payload.model_dump(exclude_unset=True)
    for key, val in update_data.items():
        setattr(meeting, key, val)
    meeting.updated_at = datetime.now(timezone.utc)
    db.commit()
    return _get_meeting_or_404(meeting_id, db)


@router.patch("/{meeting_id}/status", response_model=MeetingOut)
def change_meeting_status(
    meeting_id: int, payload: MeetingStatusChange, db: Session = Depends(get_db)
):
    meeting = _get_meeting_or_404(meeting_id, db)
    allowed = VALID_MEETING_TRANSITIONS.get(meeting.status, set())
    if payload.status not in allowed:
        raise HTTPException(
            status_code=422,
            detail=f"Cannot transition from '{meeting.status}' to '{payload.status}'. Allowed: {allowed}",
        )
    old_status = meeting.status
    meeting.status = payload.status
    meeting.updated_at = datetime.now(timezone.utc)

    # When a meeting is closed, add it to the KB as a past_meeting doc
    if payload.status == "closed":
        _add_meeting_to_kb(meeting, db)

    db.commit()
    logger.info(
        "meeting.status_changed",
        extra={
            "event": "meeting.status_changed",
            "meeting_id": meeting_id,
            "old": old_status,
            "new": payload.status,
        },
    )
    return _get_meeting_or_404(meeting_id, db)


def _add_meeting_to_kb(meeting: Meeting, db: Session) -> None:
    """Add a closed meeting's summary to the KB as a past_meeting document."""
    if not meeting.summary:
        return  # nothing useful to store

    decisions_text = "\n".join(
        f"- {d.text}" for d in (meeting.decisions or [])
    )
    items_text = "\n".join(
        f"- [{i.status}] {i.title} (owner: {i.owner or 'TBD'})"
        for i in (meeting.action_items or [])
    )
    content = (
        f"Summary:\n{meeting.summary}\n\n"
        f"Decisions:\n{decisions_text or 'None'}\n\n"
        f"Action Items:\n{items_text or 'None'}"
    )
    doc = KBDocument(
        title=f"[Past Meeting] {meeting.title}",
        content=content,
        doc_type="past_meeting",
    )
    db.add(doc)
    logger.info(
        "kb.meeting_added",
        extra={"event": "kb.meeting_added", "meeting_id": meeting.id},
    )


@router.delete("/{meeting_id}", status_code=204)
def delete_meeting(meeting_id: int, db: Session = Depends(get_db)):
    meeting = db.query(Meeting).filter(Meeting.id == meeting_id).first()
    if not meeting:
        raise HTTPException(status_code=404, detail="Meeting not found")
    # Block deletion if there are action items
    if meeting.action_items:
        raise HTTPException(
            status_code=409,
            detail="Cannot delete a meeting with existing action items. Close or reassign items first.",
        )
    db.delete(meeting)
    db.commit()


# ─── Participants ─────────────────────────────────────────────────────────────

@router.post("/{meeting_id}/participants", response_model=ParticipantOut, status_code=201)
def add_participant(
    meeting_id: int, payload: ParticipantCreate, db: Session = Depends(get_db)
):
    _get_meeting_or_404(meeting_id, db)
    p = Participant(meeting_id=meeting_id, **payload.model_dump())
    db.add(p)
    db.commit()
    db.refresh(p)
    return p


@router.put("/{meeting_id}/participants/{participant_id}", response_model=ParticipantOut)
def update_participant(
    meeting_id: int,
    participant_id: int,
    payload: ParticipantUpdate,
    db: Session = Depends(get_db),
):
    p = db.query(Participant).filter(
        Participant.id == participant_id, Participant.meeting_id == meeting_id
    ).first()
    if not p:
        raise HTTPException(status_code=404, detail="Participant not found")
    update_data = payload.model_dump(exclude_unset=True)
    for key, val in update_data.items():
        setattr(p, key, val)
    db.commit()
    db.refresh(p)
    return p


@router.delete("/{meeting_id}/participants/{participant_id}", status_code=204)
def remove_participant(
    meeting_id: int, participant_id: int, db: Session = Depends(get_db)
):
    p = db.query(Participant).filter(
        Participant.id == participant_id, Participant.meeting_id == meeting_id
    ).first()
    if not p:
        raise HTTPException(status_code=404, detail="Participant not found")
    db.delete(p)
    db.commit()


# ─── Decisions ────────────────────────────────────────────────────────────────

@router.post("/{meeting_id}/decisions", response_model=DecisionOut, status_code=201)
def add_decision(
    meeting_id: int, payload: DecisionCreate, db: Session = Depends(get_db)
):
    _get_meeting_or_404(meeting_id, db)
    d = Decision(meeting_id=meeting_id, **payload.model_dump())
    db.add(d)
    db.commit()
    db.refresh(d)
    return d


@router.put("/{meeting_id}/decisions/{decision_id}", response_model=DecisionOut)
def edit_decision(
    meeting_id: int,
    decision_id: int,
    payload: DecisionUpdate,
    db: Session = Depends(get_db),
):
    d = db.query(Decision).filter(
        Decision.id == decision_id, Decision.meeting_id == meeting_id
    ).first()
    if not d:
        raise HTTPException(status_code=404, detail="Decision not found")
    d.text = payload.text
    db.commit()
    db.refresh(d)
    return d


@router.delete("/{meeting_id}/decisions/{decision_id}", status_code=204)
def delete_decision(
    meeting_id: int, decision_id: int, db: Session = Depends(get_db)
):
    d = db.query(Decision).filter(
        Decision.id == decision_id, Decision.meeting_id == meeting_id
    ).first()
    if not d:
        raise HTTPException(status_code=404, detail="Decision not found")
    db.delete(d)
    db.commit()


# ─── Carry-forward ────────────────────────────────────────────────────────────

@router.post("/{meeting_id}/carry-forward", response_model=CarryForwardResult)
def carry_forward(
    meeting_id: int,
    payload: CarryForwardRequest,
    db: Session = Depends(get_db),
):
    """
    Carry all open/in_progress items from meeting_id into the next meeting.
    If next_meeting_id is provided, adds to that meeting.
    Otherwise creates a new meeting with an auto-generated title.
    Preserves carried_from_id chain and logs ItemEvent for each item.
    """
    source_meeting = _get_meeting_or_404(meeting_id, db)

    # Determine target meeting
    if payload.next_meeting_id:
        target = db.query(Meeting).filter(Meeting.id == payload.next_meeting_id).first()
        if not target:
            raise HTTPException(status_code=404, detail="Target meeting not found")
    else:
        title = payload.next_meeting_title or f"Follow-up: {source_meeting.title}"
        target = Meeting(
            type=source_meeting.type,
            title=title,
            status="draft",
            previous_meeting_id=meeting_id,
        )
        db.add(target)
        db.flush()  # get target.id

    # Find open/in_progress items in the source meeting
    open_items = db.query(ActionItem).filter(
        ActionItem.current_meeting_id == meeting_id,
        ActionItem.status.in_(["open", "in_progress"]),
    ).all()

    carried_ids = []
    for item in open_items:
        # Update the item to now belong to the target meeting
        old_meeting_id = item.current_meeting_id
        item.current_meeting_id = target.id
        item.carried_from_id = item.id  # self-reference to preserve origin

        # Log the carry-forward event
        event = ItemEvent(
            item_id=item.id,
            event_type="carried_forward",
            old_value=str(old_meeting_id),
            new_value=str(target.id),
            actor="system",
        )
        db.add(event)
        carried_ids.append(item.id)
        logger.info(
            "item.carried_forward",
            extra={
                "event": "item.carried_forward",
                "item_id": item.id,
                "from_meeting": meeting_id,
                "to_meeting": target.id,
            },
        )

    db.commit()

    return CarryForwardResult(
        next_meeting_id=target.id,
        carried_count=len(carried_ids),
        item_ids=carried_ids,
    )

