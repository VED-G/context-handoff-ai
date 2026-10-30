"""
Action Items API router: CRUD, status transitions, reassign, history.
"""
import logging
from datetime import datetime, timezone
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session, selectinload

from app.database import get_db
from app.models import ActionItem, ItemEvent, Meeting
from app.schemas import (
    ActionItemCreate, ActionItemUpdate, ActionItemOut,
    ActionItemStatusChange, ActionItemReassign,
    VALID_TRANSITIONS,
)
from app.logging_setup import request_id_var

router = APIRouter(prefix="/api/items", tags=["items"])
logger = logging.getLogger(__name__)


def _get_item_or_404(item_id: int, db: Session) -> ActionItem:
    item = db.query(ActionItem).options(
        selectinload(ActionItem.events)
    ).filter(ActionItem.id == item_id).first()
    if not item:
        raise HTTPException(status_code=404, detail=f"Action item {item_id} not found")
    return item


def _log_item_event(
    db: Session,
    item_id: int,
    event_type: str,
    old_value: Optional[str],
    new_value: Optional[str],
    actor: Optional[str] = None,
) -> None:
    event = ItemEvent(
        item_id=item_id,
        event_type=event_type,
        old_value=old_value,
        new_value=new_value,
        actor=actor or "system",
    )
    db.add(event)


@router.post("", response_model=ActionItemOut, status_code=201)
def create_item(payload: ActionItemCreate, db: Session = Depends(get_db)):
    # Validate due_date not before now for new items
    if payload.due_date and payload.due_date < datetime.now(timezone.utc):
        # Allow it but log a warning (requirement says "not before creation date")
        logger.warning(f"Creating item with past due date: {payload.due_date}")

    item = ActionItem(**payload.model_dump())
    item.origin_meeting_id = payload.current_meeting_id
    db.add(item)
    db.flush()

    _log_item_event(db, item.id, "created", None, item.title)
    db.commit()

    logger.info(
        "item.created",
        extra={"event": "item.created", "item_id": item.id, "title": item.title[:80]},
    )
    return _get_item_or_404(item.id, db)


@router.get("", response_model=list[ActionItemOut])
def list_items(
    owner: Optional[str] = Query(None),
    status: Optional[str] = Query(None),
    overdue: Optional[bool] = Query(None),
    meeting_id: Optional[int] = Query(None),
    db: Session = Depends(get_db),
):
    q = db.query(ActionItem).options(selectinload(ActionItem.events))
    if owner:
        q = q.filter(ActionItem.owner == owner)
    if status:
        q = q.filter(ActionItem.status == status)
    if meeting_id:
        q = q.filter(ActionItem.current_meeting_id == meeting_id)
    if overdue is True:
        now = datetime.now(timezone.utc)
        q = q.filter(
            ActionItem.due_date < now,
            ActionItem.status.in_(["open", "in_progress"]),
        )
    return q.order_by(ActionItem.created_at.desc()).all()


@router.get("/{item_id}", response_model=ActionItemOut)
def get_item(item_id: int, db: Session = Depends(get_db)):
    return _get_item_or_404(item_id, db)


@router.put("/{item_id}", response_model=ActionItemOut)
def update_item(item_id: int, payload: ActionItemUpdate, db: Session = Depends(get_db)):
    item = _get_item_or_404(item_id, db)
    update_data = payload.model_dump(exclude_unset=True)
    for key, val in update_data.items():
        if key == "due_date" and val != getattr(item, "due_date"):
            _log_item_event(
                db, item.id, "due_changed",
                str(item.due_date), str(val)
            )
        setattr(item, key, val)
    item.updated_at = datetime.now(timezone.utc)
    db.commit()
    return _get_item_or_404(item_id, db)


@router.patch("/{item_id}/status", response_model=ActionItemOut)
def change_item_status(
    item_id: int, payload: ActionItemStatusChange, db: Session = Depends(get_db)
):
    item = _get_item_or_404(item_id, db)
    allowed = VALID_TRANSITIONS.get(item.status, set())

    if payload.status not in allowed:
        raise HTTPException(
            status_code=422,
            detail=f"Cannot transition from '{item.status}' to '{payload.status}'. Allowed: {list(allowed)}",
        )

    old_status = item.status
    item.status = payload.status

    # Closing requires outcome
    if payload.status in ("done", "dropped"):
        if not payload.outcome:
            raise HTTPException(status_code=422, detail="outcome is required when closing an item")
        item.outcome = payload.outcome
        _log_item_event(db, item.id, "closed", old_status, payload.status, payload.actor)
        logger.info(
            "item.closed",
            extra={
                "event": "item.closed",
                "item_id": item_id,
                "status": payload.status,
                "actor": payload.actor,
            },
        )
    elif old_status in ("done", "dropped") and payload.status == "open":
        # Reopening
        _log_item_event(db, item.id, "reopened", old_status, "open", payload.actor)
        logger.info("item.reopened", extra={"event": "item.reopened", "item_id": item_id})
    else:
        _log_item_event(db, item.id, "status_changed", old_status, payload.status, payload.actor)
        logger.info(
            "item.status_changed",
            extra={"event": "item.status_changed", "item_id": item_id, "new": payload.status},
        )

    item.updated_at = datetime.now(timezone.utc)
    db.commit()
    return _get_item_or_404(item_id, db)


@router.patch("/{item_id}/reassign", response_model=ActionItemOut)
def reassign_item(
    item_id: int, payload: ActionItemReassign, db: Session = Depends(get_db)
):
    item = _get_item_or_404(item_id, db)
    old_owner = item.owner
    item.owner = payload.owner
    item.updated_at = datetime.now(timezone.utc)
    _log_item_event(db, item.id, "reassigned", old_owner, payload.owner, payload.actor)
    db.commit()
    logger.info(
        "item.reassigned",
        extra={
            "event": "item.reassigned",
            "item_id": item_id,
            "old_owner": old_owner,
            "new_owner": payload.owner,
        },
    )
    return _get_item_or_404(item_id, db)


@router.delete("/{item_id}", status_code=204)
def delete_item(item_id: int, db: Session = Depends(get_db)):
    item = db.query(ActionItem).filter(ActionItem.id == item_id).first()
    if not item:
        raise HTTPException(status_code=404, detail="Item not found")
    db.delete(item)
    db.commit()

