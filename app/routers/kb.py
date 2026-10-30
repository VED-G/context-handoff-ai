"""
Knowledge Base API router: document CRUD, link suggestions, link confirm/reject.
"""
import logging
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from app.database import get_db
from app.models import KBDocument, KBLink, ActionItem
from app.schemas import (
    KBDocumentCreate, KBDocumentUpdate, KBDocumentOut,
    KBLinkCreate, KBLinkOut, KBSuggestion,
)
from app.services.kb import get_tfidf_candidates
from app.ai.tasks import rerank_kb_candidates

router = APIRouter(prefix="/api/kb", tags=["knowledge-base"])

# Secondary router for item-scoped KB operations (under /api/kb/items/...)
# This allows /api/kb/items/{id}/suggest to work without conflicting with /api/items
item_kb_router = APIRouter(prefix="/api/kb", tags=["knowledge-base"])
logger = logging.getLogger(__name__)


# ─── KB Documents ─────────────────────────────────────────────────────────────

@router.get("/documents", response_model=list[KBDocumentOut])
def list_documents(
    doc_type: Optional[str] = Query(None),
    db: Session = Depends(get_db),
):
    q = db.query(KBDocument)
    if doc_type:
        q = q.filter(KBDocument.doc_type == doc_type)
    return q.order_by(KBDocument.created_at.desc()).all()


@router.post("/documents", response_model=KBDocumentOut, status_code=201)
def create_document(payload: KBDocumentCreate, db: Session = Depends(get_db)):
    doc = KBDocument(**payload.model_dump())
    db.add(doc)
    db.commit()
    db.refresh(doc)
    return doc


@router.get("/documents/{doc_id}", response_model=KBDocumentOut)
def get_document(doc_id: int, db: Session = Depends(get_db)):
    doc = db.query(KBDocument).filter(KBDocument.id == doc_id).first()
    if not doc:
        raise HTTPException(status_code=404, detail="Document not found")
    return doc


@router.put("/documents/{doc_id}", response_model=KBDocumentOut)
def update_document(doc_id: int, payload: KBDocumentUpdate, db: Session = Depends(get_db)):
    doc = db.query(KBDocument).filter(KBDocument.id == doc_id).first()
    if not doc:
        raise HTTPException(status_code=404, detail="Document not found")
    update_data = payload.model_dump(exclude_unset=True)
    for key, val in update_data.items():
        setattr(doc, key, val)
    db.commit()
    db.refresh(doc)
    return doc


@router.delete("/documents/{doc_id}", status_code=204)
def delete_document(doc_id: int, db: Session = Depends(get_db)):
    doc = db.query(KBDocument).filter(KBDocument.id == doc_id).first()
    if not doc:
        raise HTTPException(status_code=404, detail="Document not found")
    db.delete(doc)
    db.commit()


# ─── KB Links ────────────────────────────────────────────────────────────────

@router.post("/links", response_model=KBLinkOut, status_code=201)
def confirm_link(payload: KBLinkCreate, db: Session = Depends(get_db)):
    """Confirm (save) a KB link between an item/meeting and a document."""
    # Verify document exists
    doc = db.query(KBDocument).filter(KBDocument.id == payload.document_id).first()
    if not doc:
        raise HTTPException(status_code=404, detail="Document not found")

    link = KBLink(**payload.model_dump())
    db.add(link)
    db.commit()
    db.refresh(link)
    logger.info(
        "kb.link_confirmed",
        extra={
            "event": "kb.link_confirmed",
            "source_type": payload.source_type,
            "source_id": payload.source_id,
            "document_id": payload.document_id,
        },
    )
    return link


@router.delete("/links/{link_id}", status_code=204)
def delete_link(link_id: int, db: Session = Depends(get_db)):
    link = db.query(KBLink).filter(KBLink.id == link_id).first()
    if not link:
        raise HTTPException(status_code=404, detail="Link not found")
    db.delete(link)
    db.commit()


# ─── Suggest links for an item ──────────────────────────────────────────────

@router.post("/items/{item_id}/suggest", response_model=list[KBSuggestion])
def suggest_links(item_id: int, db: Session = Depends(get_db)):
    """
    Suggest KB documents for an action item.
    Uses TF-IDF retrieval (always) + LLM reranking (when AI available).
    """
    item = db.query(ActionItem).filter(ActionItem.id == item_id).first()
    if not item:
        raise HTTPException(status_code=404, detail="Action item not found")

    # Get all KB documents
    docs = db.query(KBDocument).all()
    if not docs:
        return []

    doc_dicts = [
        {"id": d.id, "title": d.title, "content": d.content}
        for d in docs
    ]

    query = f"{item.title} {item.description or ''}"
    candidates = get_tfidf_candidates(query, doc_dicts, top_k=5)

    if not candidates:
        return []

    # LLM rerank
    selected, mode = rerank_kb_candidates(
        item_title=item.title,
        item_description=item.description or "",
        candidates=candidates,
    )

    suggestions = []
    for sel in selected:
        # Match back to full candidate
        candidate = next(
            (c for c in candidates if c["document_id"] == sel["document_id"]), None
        )
        if candidate:
            suggestions.append(KBSuggestion(
                document_id=sel["document_id"],
                title=candidate["title"],
                score=candidate["score"],
                reason=sel.get("reason", "Relevant document"),
                ai_reranked=(mode == "ai"),
            ))

    return suggestions

