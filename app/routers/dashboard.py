"""
Dashboard + Open-Loop Radar + Auto-Agenda endpoints.
"""
import logging
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from app.database import get_db
from app.models import Meeting, ActionItem, ItemEvent, Participant
from app.schemas import DashboardStats, RadarItem
from app.services.radar import compute_risk_score, format_risk_reason
from app.ai.tasks import explain_radar_item, generate_auto_agenda

router = APIRouter(prefix="/api", tags=["dashboard"])
logger = logging.getLogger(__name__)


@router.get("/dashboard", response_model=DashboardStats)
def get_dashboard(db: Session = Depends(get_db)):
    """Aggregate stats for the dashboard header."""
    now = datetime.now(timezone.utc)
    total_meetings = db.query(Meeting).count()
    open_items = db.query(ActionItem).filter(ActionItem.status == "open").count()
    in_progress = db.query(ActionItem).filter(ActionItem.status == "in_progress").count()
    overdue = db.query(ActionItem).filter(
        ActionItem.due_date < now,
        ActionItem.status.in_(["open", "in_progress"]),
    ).count()
    closed = db.query(ActionItem).filter(
        ActionItem.status.in_(["done", "dropped"])
    ).count()

    return DashboardStats(
        total_meetings=total_meetings,
        open_items=open_items,
        overdue_items=overdue,
        in_progress_items=in_progress,
        closed_items=closed,
    )


@router.get("/dashboard/overdue", response_model=list)
def get_overdue_items(db: Session = Depends(get_db)):
    """Items past their due date and still open/in_progress."""
    now = datetime.now(timezone.utc)
    items = db.query(ActionItem).filter(
        ActionItem.due_date < now,
        ActionItem.status.in_(["open", "in_progress"]),
    ).order_by(ActionItem.due_date.asc()).limit(20).all()
    return [
        {
            "id": i.id,
            "title": i.title,
            "owner": i.owner,
            "due_date": i.due_date,
            "status": i.status,
            "current_meeting_id": i.current_meeting_id,
        }
        for i in items
    ]


@router.get("/dashboard/my-items")
def get_my_items(owner: str = Query(...), db: Session = Depends(get_db)):
    """Open/in_progress items for a specific owner."""
    items = db.query(ActionItem).filter(
        ActionItem.owner == owner,
        ActionItem.status.in_(["open", "in_progress"]),
    ).order_by(ActionItem.due_date.asc()).limit(20).all()
    return [
        {
            "id": i.id,
            "title": i.title,
            "due_date": i.due_date,
            "status": i.status,
            "current_meeting_id": i.current_meeting_id,
        }
        for i in items
    ]


@router.get("/radar", response_model=list[RadarItem])
def get_radar(
    use_ai: bool = Query(True),
    db: Session = Depends(get_db),
):
    """
    Open-Loop Radar: score all open/in_progress items for slip risk.
    Returns items sorted by risk score descending (highest risk first).
    If use_ai=True, AI explains and rewrites each high-risk item (score >= 40).
    """
    now = datetime.now(timezone.utc)

    # Load all open items
    open_items = db.query(ActionItem).filter(
        ActionItem.status.in_(["open", "in_progress"])
    ).all()

    # Get all team members (from participants across all meetings)
    team_members = list({
        p.name
        for p in db.query(Participant).all()
    })

    results = []
    for item in open_items:
        # Find the owner's attendance in the current meeting (if any)
        owner_attendance = None
        if item.current_meeting_id and item.owner:
            participant = db.query(Participant).filter(
                Participant.meeting_id == item.current_meeting_id,
                Participant.name == item.owner,
            ).first()
            if participant:
                owner_attendance = participant.attendance

        # How many times has this item been carried forward?
        carry_count = db.query(ItemEvent).filter(
            ItemEvent.item_id == item.id,
            ItemEvent.event_type == "carried_forward",
        ).count()

        # Last event time (for staleness)
        last_event = db.query(ItemEvent).filter(
            ItemEvent.item_id == item.id
        ).order_by(ItemEvent.created_at.desc()).first()
        last_event_at = last_event.created_at if last_event else None

        risk_score, signals = compute_risk_score(
            title=item.title,
            owner=item.owner,
            due_date=item.due_date,
            status=item.status,
            last_event_at=last_event_at,
            carry_count=carry_count,
            owner_attendance=owner_attendance,
        )

        # Build result with rule-based defaults first
        radar_item = RadarItem(
            item_id=item.id,
            title=item.title,
            owner=item.owner,
            due_date=item.due_date,
            status=item.status,
            risk_score=risk_score,
            risk_reason=format_risk_reason(signals),
        )

        # For high-risk items, ask AI to explain and rewrite (if enabled)
        if use_ai and risk_score >= 40 and signals:
            try:
                explanation, mode = explain_radar_item(
                    title=item.title,
                    owner=item.owner,
                    due_date=item.due_date,
                    status=item.status,
                    stale_days=int((now - (last_event_at or item.created_at).replace(tzinfo=timezone.utc)).total_seconds() / 86400),
                    carry_count=carry_count,
                    signals=signals,
                    team_members=team_members,
                )
                radar_item.risk_reason = explanation.get("risk_reason", radar_item.risk_reason)
                radar_item.rewritten_title = explanation.get("rewritten_title")
                radar_item.suggested_owner = explanation.get("suggested_owner")
                radar_item.nudge_message = explanation.get("nudge_message")
                radar_item.ai_explained = (mode == "ai")
            except Exception as e:
                logger.warning(f"Radar AI explanation failed for item {item.id}: {e}")

        results.append(radar_item)

    # Sort by risk score descending
    results.sort(key=lambda r: r.risk_score, reverse=True)
    return results


@router.get("/meetings/{meeting_id}/auto-agenda")
def get_auto_agenda(meeting_id: int, db: Session = Depends(get_db)):
    """
    Draft an AI-generated agenda for the next meeting using:
    - Items carried from the previous meeting
    - Overdue items
    - Unresolved decisions from previous meeting
    """
    meeting = db.query(Meeting).filter(Meeting.id == meeting_id).first()
    if not meeting:
        from fastapi import HTTPException
        raise HTTPException(status_code=404, detail="Meeting not found")

    now = datetime.now(timezone.utc)

    carried_items = db.query(ActionItem).filter(
        ActionItem.current_meeting_id == meeting_id,
        ActionItem.carried_from_id.isnot(None),
    ).all()

    overdue_items = db.query(ActionItem).filter(
        ActionItem.current_meeting_id == meeting_id,
        ActionItem.due_date < now,
        ActionItem.status.in_(["open", "in_progress"]),
    ).all()

    # Previous meeting decisions that don't have a corresponding done item
    prev_decisions = []
    if meeting.previous_meeting_id:
        prev_meeting = db.query(Meeting).filter(Meeting.id == meeting.previous_meeting_id).first()
        if prev_meeting:
            from app.models import Decision
            prev_decisions = [d.text for d in db.query(Decision).filter(
                Decision.meeting_id == prev_meeting.id
            ).all()]

    prev_summary = ""
    if meeting.previous_meeting_id:
        prev = db.query(Meeting).filter(Meeting.id == meeting.previous_meeting_id).first()
        if prev:
            prev_summary = prev.summary or ""

    result, mode = generate_auto_agenda(
        carried_items=[{"title": i.title, "owner": i.owner, "status": i.status} for i in carried_items],
        overdue_items=[{"title": i.title, "owner": i.owner, "due_date": str(i.due_date)} for i in overdue_items],
        unresolved_decisions=prev_decisions,
        prev_summary=prev_summary,
    )

    return {
        "agenda_items": result.get("agenda_items", []),
        "generated_by": mode,
        "meeting_id": meeting_id,
    }

