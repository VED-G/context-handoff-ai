"""
ORM models for context-handoff-ai.
All tables are created automatically via Base.metadata.create_all().
"""
from datetime import datetime, timezone
from typing import Optional
from sqlalchemy import (
    Boolean, DateTime, Enum, ForeignKey, Integer, String, Text, Float
)
from sqlalchemy.orm import Mapped, mapped_column, relationship
from app.database import Base


def _now() -> datetime:
    return datetime.now(timezone.utc)


# ---------------------------------------------------------------------------
# Meeting
# ---------------------------------------------------------------------------
class Meeting(Base):
    __tablename__ = "meetings"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    type: Mapped[str] = mapped_column(
        Enum("meeting", "handover", name="meeting_type"), default="meeting"
    )
    title: Mapped[str] = mapped_column(String(255), nullable=False)
    status: Mapped[str] = mapped_column(
        Enum("draft", "scheduled", "held", "closed", name="meeting_status"),
        default="draft",
    )
    agenda: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    raw_notes: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    summary: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    scheduled_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    # FK to the previous meeting (for series / carry-forward chain)
    previous_meeting_id: Mapped[Optional[int]] = mapped_column(
        Integer, ForeignKey("meetings.id", ondelete="SET NULL"), nullable=True
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=_now
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=_now, onupdate=_now
    )

    # Relationships
    participants: Mapped[list["Participant"]] = relationship(
        back_populates="meeting", cascade="all, delete-orphan"
    )
    decisions: Mapped[list["Decision"]] = relationship(
        back_populates="meeting", cascade="all, delete-orphan"
    )
    action_items: Mapped[list["ActionItem"]] = relationship(
        "ActionItem",
        foreign_keys="ActionItem.current_meeting_id",
        back_populates="current_meeting",
    )
    origin_items: Mapped[list["ActionItem"]] = relationship(
        "ActionItem",
        foreign_keys="ActionItem.origin_meeting_id",
        back_populates="origin_meeting",
    )
    briefs: Mapped[list["Brief"]] = relationship(
        back_populates="meeting", cascade="all, delete-orphan"
    )


# ---------------------------------------------------------------------------
# Participant
# ---------------------------------------------------------------------------
class Participant(Base):
    __tablename__ = "participants"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    meeting_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("meetings.id", ondelete="CASCADE"), nullable=False
    )
    name: Mapped[str] = mapped_column(String(100), nullable=False)
    email: Mapped[Optional[str]] = mapped_column(String(200), nullable=True)
    attendance: Mapped[str] = mapped_column(
        Enum("invited", "attended", "missed", "no_response", name="attendance_status"),
        default="invited",
    )

    meeting: Mapped["Meeting"] = relationship(back_populates="participants")


# ---------------------------------------------------------------------------
# Decision
# ---------------------------------------------------------------------------
class Decision(Base):
    __tablename__ = "decisions"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    meeting_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("meetings.id", ondelete="CASCADE"), nullable=False
    )
    text: Mapped[str] = mapped_column(Text, nullable=False)

    meeting: Mapped["Meeting"] = relationship(back_populates="decisions")


# ---------------------------------------------------------------------------
# ActionItem
# ---------------------------------------------------------------------------
class ActionItem(Base):
    __tablename__ = "action_items"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    title: Mapped[str] = mapped_column(String(500), nullable=False)
    description: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    owner: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)
    due_date: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    status: Mapped[str] = mapped_column(
        Enum("open", "in_progress", "done", "dropped", name="item_status"),
        default="open",
    )
    outcome: Mapped[Optional[str]] = mapped_column(Text, nullable=True)

    # Meeting linkage
    origin_meeting_id: Mapped[Optional[int]] = mapped_column(
        Integer, ForeignKey("meetings.id", ondelete="SET NULL"), nullable=True
    )
    current_meeting_id: Mapped[Optional[int]] = mapped_column(
        Integer, ForeignKey("meetings.id", ondelete="SET NULL"), nullable=True
    )
    # FK to the item it was carried from (preserves history chain)
    carried_from_id: Mapped[Optional[int]] = mapped_column(
        Integer, ForeignKey("action_items.id", ondelete="SET NULL"), nullable=True
    )

    ai_generated: Mapped[bool] = mapped_column(Boolean, default=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=_now, onupdate=_now
    )

    # Relationships
    origin_meeting: Mapped[Optional["Meeting"]] = relationship(
        "Meeting", foreign_keys=[origin_meeting_id], back_populates="origin_items"
    )
    current_meeting: Mapped[Optional["Meeting"]] = relationship(
        "Meeting", foreign_keys=[current_meeting_id], back_populates="action_items"
    )
    events: Mapped[list["ItemEvent"]] = relationship(
        back_populates="item", cascade="all, delete-orphan", order_by="ItemEvent.created_at"
    )
    kb_links: Mapped[list["KBLink"]] = relationship(
        "KBLink",
        primaryjoin="and_(KBLink.source_type=='item', foreign(KBLink.source_id)==ActionItem.id)",
        viewonly=True,
    )


# ---------------------------------------------------------------------------
# ItemEvent  (audit/history log per action item)
# ---------------------------------------------------------------------------
class ItemEvent(Base):
    __tablename__ = "item_events"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    item_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("action_items.id", ondelete="CASCADE"), nullable=False
    )
    event_type: Mapped[str] = mapped_column(
        Enum(
            "created", "reassigned", "status_changed", "due_changed",
            "carried_forward", "closed", "reopened",
            name="item_event_type",
        ),
        nullable=False,
    )
    old_value: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    new_value: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    actor: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now)

    item: Mapped["ActionItem"] = relationship(back_populates="events")


# ---------------------------------------------------------------------------
# KBDocument  (knowledge-base entries)
# ---------------------------------------------------------------------------
class KBDocument(Base):
    __tablename__ = "kb_documents"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    title: Mapped[str] = mapped_column(String(500), nullable=False)
    content: Mapped[str] = mapped_column(Text, nullable=False)
    doc_type: Mapped[str] = mapped_column(
        Enum("doc", "past_meeting", "note", name="doc_type"), default="doc"
    )
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now)


# ---------------------------------------------------------------------------
# KBLink  (confirmed links between items/meetings and KB docs)
# ---------------------------------------------------------------------------
class KBLink(Base):
    __tablename__ = "kb_links"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    # source can be "item" or "meeting"
    source_type: Mapped[str] = mapped_column(
        Enum("item", "meeting", name="kb_source_type"), nullable=False
    )
    source_id: Mapped[int] = mapped_column(Integer, nullable=False)
    document_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("kb_documents.id", ondelete="CASCADE"), nullable=False
    )
    score: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    reason: Mapped[Optional[str]] = mapped_column(Text, nullable=True)

    document: Mapped["KBDocument"] = relationship()


# ---------------------------------------------------------------------------
# Brief  (cached AI/fallback catchup briefs)
# ---------------------------------------------------------------------------
class Brief(Base):
    __tablename__ = "briefs"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    meeting_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("meetings.id", ondelete="CASCADE"), nullable=False
    )
    for_person: Mapped[str] = mapped_column(String(100), nullable=False)
    text: Mapped[str] = mapped_column(Text, nullable=False)
    generated_by: Mapped[str] = mapped_column(
        Enum("ai", "fallback", name="brief_source"), default="ai"
    )
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now)

    meeting: Mapped["Meeting"] = relationship(back_populates="briefs")

