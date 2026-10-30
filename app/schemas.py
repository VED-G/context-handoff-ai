"""
Pydantic v2 schemas for request/response validation.
All schemas use model_config = ConfigDict(from_attributes=True) for ORM compatibility.
"""
from datetime import datetime
from typing import Optional, List
from pydantic import BaseModel, ConfigDict, field_validator, model_validator
import re


# ─── Shared helpers ──────────────────────────────────────────────────────────

class ErrorDetail(BaseModel):
    code: str
    message: str
    request_id: str = ""
    details: Optional[dict] = None


class ErrorResponse(BaseModel):
    error: ErrorDetail


# ─── Participant ──────────────────────────────────────────────────────────────

class ParticipantCreate(BaseModel):
    name: str
    email: Optional[str] = None
    attendance: str = "invited"

    @field_validator("attendance")
    @classmethod
    def valid_attendance(cls, v: str) -> str:
        allowed = {"invited", "attended", "missed", "no_response"}
        if v not in allowed:
            raise ValueError(f"attendance must be one of {allowed}")
        return v

    @field_validator("name")
    @classmethod
    def name_not_empty(cls, v: str) -> str:
        if not v.strip():
            raise ValueError("name cannot be empty")
        return v.strip()


class ParticipantUpdate(BaseModel):
    attendance: Optional[str] = None
    name: Optional[str] = None
    email: Optional[str] = None


class ParticipantOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    meeting_id: int
    name: str
    email: Optional[str]
    attendance: str


# ─── Decision ────────────────────────────────────────────────────────────────

class DecisionCreate(BaseModel):
    text: str

    @field_validator("text")
    @classmethod
    def text_not_empty(cls, v: str) -> str:
        if not v.strip():
            raise ValueError("decision text cannot be empty")
        return v.strip()


class DecisionUpdate(BaseModel):
    text: str


class DecisionOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    meeting_id: int
    text: str


# ─── ActionItem ──────────────────────────────────────────────────────────────

VALID_ITEM_STATUSES = {"open", "in_progress", "done", "dropped"}

# Valid status transitions map
VALID_TRANSITIONS = {
    "open": {"in_progress", "done", "dropped"},
    "in_progress": {"open", "done", "dropped"},
    "done": {"open"},       # can reopen
    "dropped": {"open"},    # can reopen
}


class ActionItemCreate(BaseModel):
    title: str
    description: Optional[str] = None
    owner: Optional[str] = None
    due_date: Optional[datetime] = None
    current_meeting_id: Optional[int] = None
    ai_generated: bool = False

    @field_validator("title")
    @classmethod
    def title_not_empty(cls, v: str) -> str:
        if not v.strip():
            raise ValueError("title cannot be empty")
        return v.strip()


class ActionItemUpdate(BaseModel):
    title: Optional[str] = None
    description: Optional[str] = None
    owner: Optional[str] = None
    due_date: Optional[datetime] = None


class ActionItemStatusChange(BaseModel):
    status: str
    outcome: Optional[str] = None
    actor: Optional[str] = None

    @field_validator("status")
    @classmethod
    def valid_status(cls, v: str) -> str:
        if v not in VALID_ITEM_STATUSES:
            raise ValueError(f"status must be one of {VALID_ITEM_STATUSES}")
        return v

    @model_validator(mode="after")
    def outcome_required_on_close(self) -> "ActionItemStatusChange":
        if self.status in ("done", "dropped") and not self.outcome:
            raise ValueError("outcome is required when closing an item (done/dropped)")
        return self


class ActionItemReassign(BaseModel):
    owner: str
    actor: Optional[str] = None


class ItemEventOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    item_id: int
    event_type: str
    old_value: Optional[str]
    new_value: Optional[str]
    actor: Optional[str]
    created_at: datetime


class ActionItemOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    title: str
    description: Optional[str]
    owner: Optional[str]
    due_date: Optional[datetime]
    status: str
    outcome: Optional[str]
    origin_meeting_id: Optional[int]
    current_meeting_id: Optional[int]
    carried_from_id: Optional[int]
    ai_generated: bool
    created_at: datetime
    updated_at: datetime
    events: List[ItemEventOut] = []


# ─── Meeting ─────────────────────────────────────────────────────────────────

VALID_MEETING_STATUSES = {"draft", "scheduled", "held", "closed"}
VALID_MEETING_TYPES = {"meeting", "handover"}

# Valid meeting status transitions
VALID_MEETING_TRANSITIONS = {
    "draft": {"scheduled", "held", "closed"},
    "scheduled": {"held", "closed", "draft"},
    "held": {"closed"},
    "closed": set(),  # terminal
}


class MeetingCreate(BaseModel):
    type: str = "meeting"
    title: str
    agenda: Optional[str] = None
    scheduled_at: Optional[datetime] = None
    previous_meeting_id: Optional[int] = None

    @field_validator("type")
    @classmethod
    def valid_type(cls, v: str) -> str:
        if v not in VALID_MEETING_TYPES:
            raise ValueError(f"type must be one of {VALID_MEETING_TYPES}")
        return v

    @field_validator("title")
    @classmethod
    def title_not_empty(cls, v: str) -> str:
        if not v.strip():
            raise ValueError("title cannot be empty")
        return v.strip()


class MeetingUpdate(BaseModel):
    title: Optional[str] = None
    agenda: Optional[str] = None
    raw_notes: Optional[str] = None
    summary: Optional[str] = None
    scheduled_at: Optional[datetime] = None


class MeetingStatusChange(BaseModel):
    status: str

    @field_validator("status")
    @classmethod
    def valid_status(cls, v: str) -> str:
        if v not in VALID_MEETING_STATUSES:
            raise ValueError(f"status must be one of {VALID_MEETING_STATUSES}")
        return v


class MeetingOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    type: str
    title: str
    status: str
    agenda: Optional[str]
    raw_notes: Optional[str]
    summary: Optional[str]
    scheduled_at: Optional[datetime]
    previous_meeting_id: Optional[int]
    created_at: datetime
    updated_at: datetime
    participants: List[ParticipantOut] = []
    decisions: List[DecisionOut] = []
    action_items: List[ActionItemOut] = []


class MeetingListOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    type: str
    title: str
    status: str
    scheduled_at: Optional[datetime]
    created_at: datetime
    updated_at: datetime


# ─── KB ──────────────────────────────────────────────────────────────────────

class KBDocumentCreate(BaseModel):
    title: str
    content: str
    doc_type: str = "doc"

    @field_validator("doc_type")
    @classmethod
    def valid_doc_type(cls, v: str) -> str:
        allowed = {"doc", "past_meeting", "note"}
        if v not in allowed:
            raise ValueError(f"doc_type must be one of {allowed}")
        return v


class KBDocumentUpdate(BaseModel):
    title: Optional[str] = None
    content: Optional[str] = None


class KBDocumentOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    title: str
    content: str
    doc_type: str
    created_at: datetime


class KBLinkCreate(BaseModel):
    source_type: str
    source_id: int
    document_id: int
    score: Optional[float] = None
    reason: Optional[str] = None


class KBLinkOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    source_type: str
    source_id: int
    document_id: int
    score: Optional[float]
    reason: Optional[str]
    document: KBDocumentOut


class KBSuggestion(BaseModel):
    document_id: int
    title: str
    score: float
    reason: str
    ai_reranked: bool = False


# ─── Brief ───────────────────────────────────────────────────────────────────

class BriefOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    meeting_id: int
    for_person: str
    text: str
    generated_by: str
    created_at: datetime


# ─── AI Recap ─────────────────────────────────────────────────────────────────

class RecapActionItem(BaseModel):
    title: str
    description: Optional[str] = None
    owner: Optional[str] = None
    due_date: Optional[str] = None    # string (may need parsing)
    confidence: float = 0.8
    needs_owner: bool = False


class RecapProposal(BaseModel):
    summary: str
    decisions: List[str]
    action_items: List[RecapActionItem]
    ai_mode: str = "ai"   # "ai" | "fallback"


# ─── Carry-forward ──────────────────────────────────────────────────────────

class CarryForwardRequest(BaseModel):
    next_meeting_id: Optional[int] = None   # if omitted, create a new meeting
    next_meeting_title: Optional[str] = None


class CarryForwardResult(BaseModel):
    next_meeting_id: int
    carried_count: int
    item_ids: List[int]


# ─── Dashboard ───────────────────────────────────────────────────────────────

class DashboardStats(BaseModel):
    total_meetings: int
    open_items: int
    overdue_items: int
    in_progress_items: int
    closed_items: int


# ─── Radar ───────────────────────────────────────────────────────────────────

class RadarItem(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    item_id: int
    title: str
    owner: Optional[str]
    due_date: Optional[datetime]
    status: str
    risk_score: float
    risk_reason: str
    rewritten_title: Optional[str] = None
    suggested_owner: Optional[str] = None
    nudge_message: Optional[str] = None
    ai_explained: bool = False

