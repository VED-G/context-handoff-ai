# context-handoff-ai

> AI-enabled web platform that manages meeting summaries and work handovers across individuals in teams

[![Live Demo](https://img.shields.io/badge/Live_Demo-Render-brightgreen)](https://context-handoff-ai.onrender.com)

---

## Overview

Teams lose context every time work changes hands. Context Handoff AI captures what was discussed and decided, transfers that context to the right people, and follows up on open items until they are closed. Built for DigiPlus Technical Assessment, 30 Oct 2026.

**Live URL:** `https://context-handoff-ai.onrender.com`

---

## Architecture

```mermaid
flowchart TD
    Browser["Browser (React SPA)"]
    FastAPI["FastAPI (Python 3.12)\nUvicorn · REST /api/*\nServes frontend/dist"]
    DB[(SQLite / Neon Postgres)]
    Groq["Groq API\n(primary AI)"]
    Gemini["Gemini API\n(failover AI)"]
    Rules["Rule-based Fallback\n(always works)"]
    TF-IDF["TF-IDF (scikit-learn)\nKB Retrieval"]
    Render["Render\n(Docker Web Service)"]

    Browser -->|HTTP| FastAPI
    FastAPI -->|SQLAlchemy 2.x| DB
    FastAPI -->|HTTPS| Groq
    FastAPI -->|HTTPS| Gemini
    FastAPI --> Rules
    FastAPI --> TF-IDF
    Render -->|auto-deploy on push| FastAPI
```

### Tech choices and reasons

| Layer | Choice | Reason |
|-------|--------|--------|
| Backend | FastAPI + Pydantic v2 | Fast, typed, auto-generates OpenAPI docs. React listed in JD, so full-stack Python+React demonstrates range |
| Frontend | React 18 + Vite + TypeScript + Tailwind | Fast build, typed, Tailwind for rapid UI without a heavy component lib |
| DB | SQLite (local) / Neon Postgres (prod) | Free tier friendly. SQLAlchemy 2.x ORM means no migration needed to swap |
| AI Primary | Groq (llama-3.3-70b-versatile) | Fastest inference, free tier, JSON mode |
| AI Failover | Gemini 2.0 Flash | Google's reliable fallback, JSON mode |
| KB Retrieval | TF-IDF (scikit-learn) | No API call, always works offline, fast enough for team-sized KBs |
| Deploy | Render + Docker | Single Docker image = one service, one URL, no CORS complexity |

---

## AI Configuration

### Providers & Models
- **Primary:** Groq — model set by `GROQ_MODEL` env var (default: `llama-3.3-70b-versatile`)
- **Failover:** Gemini — model set by `GEMINI_MODEL` env var (default: `gemini-2.0-flash`)
- **Fallback:** Rule-based Python (no API key required)

### Failover Chain
```
Groq (attempt 1)
  → Groq (retry once on timeout/429/5xx)
    → Gemini (failover)
      → Rule-based fallback (always succeeds)
```

### Prompt Location
All prompts live in [`app/ai/prompts.py`](app/ai/prompts.py) as versioned string constants (`PROMPT_VERSION = "v1.0"`). Each prompt instructs the model to treat user-provided notes as **data only** (prompt injection guard).

### AI Tasks & Data Flow
| Task | Endpoint | Input | Output |
|------|----------|-------|--------|
| Recap | `POST /api/meetings/{id}/ai/recap` | raw_notes + participant list + meeting date | `{summary, decisions[], action_items[]}` |
| Apply recap | `POST /api/meetings/{id}/ai/recap/apply` | Human-reviewed recap proposal | Saves to DB |
| Catchup brief | `GET /api/meetings/{id}/brief?for=Name` | **Structured DB data** (not raw notes) | Short brief ≤ 200 words |
| KB rerank | Internal | TF-IDF top-5 candidates | Up to 3 selected with reasons |
| Radar explain | `GET /api/radar` | Item signals (no content) | Risk reason, rewritten title, nudge |
| Auto-agenda | `GET /api/meetings/{id}/auto-agenda` | Carried/overdue items list | Ordered agenda with time estimates |

### Fallback Behaviour
- **Recap fallback:** First-3-sentences summary + regex extraction of `"Decision:"` lines and `"Name will X by date"` patterns
- **Brief fallback:** Template-rendered text from structured DB data
- **KB fallback:** TF-IDF top-3 without LLM reranking
- **Radar fallback:** Rule-based risk label from detected signals
- **Agenda fallback:** Simple list ordered by: overdue first, then carried items, then decisions

The UI shows an **"⚡ Basic mode"** badge when AI is unavailable, so users always know what generated the content.

### Guardrails
- Owner names in AI-generated items are validated against the participant list; hallucinated names are set to `null` with `needs_owner: true`
- Relative dates ("by Friday") are resolved against the meeting date server-side
- Raw notes are **never** passed to the brief endpoint (only structured DB fields)
- Prompts explicitly instruct the model to ignore instructions inside user content

---

## Data Source

Seed data (`seed/seed_data.py`) represents a realistic product team (Atlas Platform, 5 members) over 4 weeks:

- **5 meetings:** 3 sprint syncs (held/closed), 1 production incident debrief, 1 work handover (PM on maternity leave)
- **13 action items:** mix of open, in-progress, done, dropped; some overdue, some carried forward, some vague/ownerless (ideal for Radar demo)
- **6 KB documents:** release checklist, architecture notes, on-call runbook, team norms, dark mode design notes, past meeting summary
- **4 confirmed KB links**
- **Messy raw notes** on Meeting 1 ready to demo the AI recap (paste, click "Generate AI Recap")

Team members: Ravi Singh (eng), Priya Sharma (eng/PM), Arjun Mehta (eng lead), Neha Kapoor (PM, on leave), Simi Tran (eng, frequent no-response)

---

## Logging Setup

### Format
Structured JSON, one log line per event. Example:
```json
{"ts": "2026-10-30T06:00:00Z", "level": "INFO", "logger": "app.routers.meetings", "msg": "meeting.created", "request_id": "a1b2c3d4-...", "event": "meeting.created", "meeting_id": 1, "type": "meeting"}
{"ts": "2026-10-30T06:00:01Z", "level": "INFO", "msg": "ai_call task=recap provider=groq outcome=ok", "request_id": "a1b2c3d4-...", "event": "ai.call", "task": "recap", "provider": "groq", "model": "llama-3.3-70b-versatile", "latency_ms": 1840.5, "outcome": "ok", "input_length": 2300}
{"ts": "2026-10-30T06:00:02Z", "level": "WARNING", "msg": "ai_call task=recap provider=groq outcome=retry", "event": "ai.call", "outcome": "retry"}
```

### File path
`logs/app.log` (set by `LOG_FILE` env var). Rotating: 10 MB max, 5 backups. Created automatically.

### Request ID
Every request gets a UUID (or accepts `X-Request-ID` header). Injected via `contextvars` into every log record in that request. Returned as `X-Request-ID` response header. Shown in error toasts in the UI.

### Key events logged (INFO)
- `meeting.created`, `meeting.status_changed`
- `item.created`, `item.reassigned`, `item.status_changed`, `item.closed`, `item.carried_forward`
- `kb.link_confirmed`, `kb.meeting_added`

### AI events (INFO/WARNING/ERROR)
- Every AI call: `task`, `provider`, `model`, `latency_ms`, `outcome` (`ok|retry|failover|fallback|error`), `input_length`
- WARNING on retry/failover/fallback; ERROR on total failure

### Redaction
A `RedactionFilter` masks anything matching `api_key=`, `token=`, `password=` etc. Raw notes and prompts are **never** logged in full — only their byte lengths or hashes are logged.

---

## Special Feature: Open-Loop Radar + Auto-Agenda

### The Problem
Items silently slip between meetings. A ticket gets carried forward twice, the owner misses the meeting, the title is too vague to act on — and nothing happens.

### Open-Loop Radar
A dashboard panel that **scores every open item for slip risk** using 7 deterministic signals:

| Signal | Weight |
|--------|--------|
| No owner assigned | 30 pts |
| Overdue | 25 pts |
| Stale (no activity for 7+ days) | 20 pts |
| Owner missed the meeting | 20 pts |
| Carried forward 2+ times | 20 pts |
| Vague title ("look into", "follow up"...) | 15 pts |
| No due date | 15 pts |

For high-risk items (score ≥ 40), AI:
1. **Explains** the risk in one sentence
2. **Rewrites** the vague title into a specific, measurable action
3. **Suggests** the most likely owner from team history
4. **Drafts** a follow-up nudge message (copy to clipboard, send via Slack/email)

Degrades gracefully: if AI is unavailable, rule-based labels and template nudges are used instead.

### Auto-Agenda
When creating the next meeting, AI drafts a prioritised agenda from carried-over items, overdue items, and unresolved decisions — with time estimates per topic. Editable before saving. Available on the meeting detail page → Carry Forward tab → "Draft Auto-Agenda".

### Why it adds value
> Without the Radar, managers must manually scan every item in every meeting to find what's slipping. With the Radar, the system proactively surfaces the 3-5 items most likely to fall through the cracks, rewrites vague tasks into actionable ones, and even drafts the follow-up nudge. It turns passive tracking into active loop-closing.

---

## Setup and Run

### Prerequisites
- Python 3.11+
- Node.js 20+
- (Optional) Docker

### Local development

```bash
# 1. Clone
git clone https://github.com/VED-G/context-handoff-ai.git
cd context-handoff-ai

# 2. Backend setup
python -m venv .venv
.venv\Scripts\activate   # Windows
# source .venv/bin/activate  # Linux/Mac

pip install -r requirements.txt

# 3. Environment
cp .env.example .env
# Edit .env: add GROQ_API_KEY and/or GEMINI_API_KEY

# 4. Seed data
python -m seed.seed_data

# 5. Run FastAPI
uvicorn app.main:app --reload --port 8000

# 6. Frontend dev server (separate terminal)
cd frontend
npm install
npm run dev
# → React at http://localhost:5173 (proxies /api to FastAPI)
```

### Build and run with Docker

```bash
docker build -t context-handoff-ai .
docker run -p 8000:8000 \
  -e GROQ_API_KEY=your_key \
  -e GEMINI_API_KEY=your_key \
  -e DATABASE_URL=sqlite:///./app.db \
  context-handoff-ai
```

### Run tests

```bash
pip install -r requirements.txt
pytest tests/ -v
```

---

## API Overview

All endpoints under `/api`. Full interactive docs at `/docs`.

| Method | Path | Description |
|--------|------|-------------|
| GET | `/health` | Health probe |
| POST | `/api/meetings` | Create meeting/handover |
| GET | `/api/meetings` | List (filter by type/status) |
| GET | `/api/meetings/{id}` | Meeting detail with participants, decisions, items |
| PATCH | `/api/meetings/{id}/status` | Change meeting status |
| POST | `/api/meetings/{id}/participants` | Add participant |
| POST | `/api/meetings/{id}/decisions` | Add decision |
| POST | `/api/meetings/{id}/carry-forward` | Carry open items to next meeting |
| POST | `/api/meetings/{id}/ai/recap` | Generate AI recap (proposal) |
| POST | `/api/meetings/{id}/ai/recap/apply` | Save reviewed recap |
| GET | `/api/meetings/{id}/brief?for=Name` | Catchup brief |
| GET | `/api/meetings/{id}/auto-agenda` | Draft AI agenda |
| POST | `/api/items` | Create action item |
| GET | `/api/items` | List (filter by owner/status/overdue/meeting) |
| PATCH | `/api/items/{id}/status` | Change status (close requires outcome) |
| PATCH | `/api/items/{id}/reassign` | Reassign to new owner |
| GET | `/api/kb/documents` | List KB documents |
| POST | `/api/kb/documents` | Add document |
| POST | `/api/kb/items/{id}/suggest` | Suggest KB links (TF-IDF + AI) |
| POST | `/api/kb/links` | Confirm a KB link |
| GET | `/api/dashboard` | Stats |
| GET | `/api/radar` | Open-Loop Radar scores |
| GET | `/api/dashboard/overdue` | Overdue items |

All errors return: `{ "error": { "code", "message", "request_id", "details" } }`

---

## Deployment (Render + Neon)

### Steps for the human (one-time setup)
1. Create a [Neon](https://neon.tech) Postgres database. Copy the connection string.
2. Create a [Render](https://render.com) account.
3. New Web Service → connect GitHub repo `VED-G/context-handoff-ai` → Docker environment.
4. Set environment variables in Render dashboard:
   ```
   DATABASE_URL=postgresql+psycopg2://user:pass@host/db?sslmode=require
   GROQ_API_KEY=gsk_...
   GEMINI_API_KEY=AI...
   GROQ_MODEL=llama-3.3-70b-versatile
   GEMINI_MODEL=gemini-2.0-flash
   LOG_LEVEL=INFO
   LOG_FILE=logs/app.log
   AI_TIMEOUT_SECONDS=20
   ```
5. Deploy. After first deploy, run seed:
   ```
   render run python -m seed.seed_data
   ```
6. Auto-deploy is enabled: every push to `main` triggers a redeploy.

> **Note on `DATABASE_URL`:** The app automatically normalises `postgres://` → `postgresql+psycopg2://` with `sslmode=require`. Neon's connection string format is supported directly.

---

## Assumptions

- **No authentication:** A simple "acting as" name field is used for event attribution. All data is shared across all users of the instance. Documented assumption: a real deployment would add Auth0 or similar.
- **Single team / single tenant:** No multi-tenancy. All meetings and items are visible to all users.
- **No real email/calendar integration:** The app manages context internally; actual sending of nudge messages or calendar invites is out of scope (copy-to-clipboard is the integration point).
- **Action item owners are participant names:** Owner is a free-text string matching a participant name. No user account system.
- **Idempotent seed:** Seed script checks for existing data and skips if already populated.

---

## Known Limitations

- **Free-tier cold starts:** Render free tier spins down after 15 min idle. First request after idle takes ~30s. Upgrade to a paid tier for production use.
- **SQLite in prod:** SQLite is used locally; Neon Postgres is strongly recommended for deployed instances (ephemeral Render disks would lose SQLite data on redeploy).
- **TF-IDF is not semantic:** KB retrieval uses keyword overlap, not embeddings. Works well for team-sized KBs (< 1000 docs); for larger corpora, replace with a vector DB (pgvector on Neon is a natural upgrade).
- **No real-time updates:** The UI polls on page load; there's no WebSocket push. A refresh is needed to see updates from another user.
- **AI rate limits:** Groq free tier has token-per-minute limits; heavy use in a demo may hit failover. Gemini free tier covers this adequately.
- **Prompt injection:** Notes are treated as data and the model is instructed to ignore embedded instructions, but no LLM-based system is fully immune. Do not use with adversarial untrusted inputs in production.

---

*Built by Vedant — DigiPlus Technical Assessment, Oct 2026*
