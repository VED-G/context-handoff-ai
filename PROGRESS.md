# PROGRESS.md — context-handoff-ai

## Phase 0 — Foundation ✅
- Cloned repo, .gitignore, .env.example
- FastAPI skeleton: app/main.py, config, database, models, schemas
- Logging setup: JSON formatter, request-ID middleware, redaction filter
- All API routers: meetings, items, ai_routes, kb, dashboard
- AI layer: client.py (Groq→Gemini→fallback), prompts.py, fallback.py, tasks.py
- Services: radar.py (scoring), kb.py (TF-IDF)
- React frontend: App.tsx, all pages (Dashboard, MeetingsList, MeetingDetail, ItemsBoard, KnowledgeBase)
- Shared components, typed api.ts module
- Dockerfile (multi-stage), .dockerignore

## Phase 1 — Core Domain ✅
- All models: Meeting, Participant, Decision, ActionItem, ItemEvent, KBDocument, KBLink, Brief
- Full CRUD with validation and status transition enforcement
- Outcome required on item close, carry-forward with event logging
- All React UI screens built alongside backend

## Phase 2 — AI Layer ✅  
- Groq primary → Gemini failover → rule-based fallback
- Recap generate + review/apply screen
- Catchup brief (structured data input, not raw notes)
- AI/Basic mode badges in UI
- Per-call logging: provider, model, latency_ms, outcome, input_length

## Phase 3 — Continuity & Knowledge ✅
- Carry-forward: open items moved to next meeting, carried_from_id preserved, ItemEvents logged
- Closed meetings auto-added to KB as past_meeting documents
- KB CRUD, TF-IDF retrieval + LLM reranking
- Link confirm/reject UI in Knowledge Base page

## Phase 4 — Special Feature & Dashboard ✅
- Open-Loop Radar: 7-signal scoring in radar.py (pure, unit-testable)
- AI explains risk, rewrites vague titles, suggests owners, drafts nudge
- Auto-Agenda: AI drafts agenda from carried/overdue items + decisions
- Dashboard: stats cards, Radar panel, overdue panel, my-items lookup
- Nudge copy-to-clipboard modal

## Phase 5 — Ship ✅
- Seed data: 5 meetings, 13 items, 6 KB docs, 4 links — realistic Atlas team story
- Tests: carry-forward, validation, transitions, radar scoring, AI fallback
- Full README with all required sections
- Dockerfile ready for Render deploy

## Known Issues
- None blocking. See README "Known Limitations" section.

## Next: Deploy
1. Human creates Neon DB and Render service
2. Human sets env vars in Render dashboard
3. Human runs: `render run python -m seed.seed_data`
4. Live URL: https://context-handoff-ai.onrender.com
