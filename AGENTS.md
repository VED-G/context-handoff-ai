# AI-Powered Knowledge & Tasks Management Platform
# DigiPlus Technical Assessment - AGENTS.md (Project Rules)

Re-read this file at the start of every phase.

## Project: context-handoff-ai
GitHub: https://github.com/VED-G/context-handoff-ai
Deploy: Render (Docker) + Neon Postgres

## Stack
- Backend: Python 3.12, FastAPI, Pydantic v2, SQLAlchemy 2.x, Uvicorn
- Frontend: React 18 + Vite + TypeScript + Tailwind + React Router (in frontend/)
- DB: SQLite locally, Neon Postgres in prod
- AI: Groq primary, Gemini secondary, rule-based fallback
- KB: TF-IDF (scikit-learn) + LLM rerank

## Key Rules
1. Never write real keys into code, logs, README, commits or chat
2. .env is gitignored
3. All errors return { "error": { "code", "message", "request_id", "details" } }
4. AI failures must degrade gracefully
5. Logging: JSON format, request ID per request, key events logged
6. React SPA served by FastAPI from frontend/dist with SPA fallback

## Phases
- Phase 0: Foundation + deploy skeleton
- Phase 1: Core domain models + CRUD + UI
- Phase 2: AI layer (recap, brief, fallback)
- Phase 3: Carry-forward + KB
- Phase 4: Open-Loop Radar + Auto-Agenda + Dashboard
- Phase 5: Seed data + tests + README + deploy

