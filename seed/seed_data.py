"""
Seed data script for context-handoff-ai.
Idempotent: safe to run multiple times (checks for existing data).

Represents a realistic product team story: 4 weekly syncs + 1 work handover,
~12 action items across statuses, decisions, KB documents, messy raw notes demo.

Run with:
    python -m seed.seed_data
or set DATABASE_URL env var for production seeding.
"""
import sys
import os
from datetime import datetime, timezone, timedelta

# Ensure app is importable
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from app.database import SessionLocal, engine, Base
from app.models import (
    Meeting, Participant, Decision, ActionItem, ItemEvent,
    KBDocument, KBLink, Brief
)

Base.metadata.create_all(bind=engine)

def ts(days_offset: int, hour: int = 10) -> datetime:
    """Return a timezone-aware datetime N days from 'today' (negative = past)."""
    base = datetime(2026, 10, 20, hour, 0, 0, tzinfo=timezone.utc)
    return base + timedelta(days=days_offset)


def seed():
    db = SessionLocal()
    try:
        # ── Idempotency guard ──────────────────────────────────────────────
        if db.query(Meeting).count() > 0:
            print("Database already seeded – skipping.")
            return

        print("Seeding database...")

        # ── KB Documents ──────────────────────────────────────────────────
        kb_docs = [
            KBDocument(
                title="Release Checklist v2.0",
                content="""Pre-release checklist for the Atlas platform:
1. All critical bugs closed in Jira
2. Load test results reviewed and signed off by Priya
3. DB migrations tested on staging (run: alembic upgrade head)
4. Rollback plan documented and shared with Neha
5. Feature flags configured: dark_mode=off, new_dashboard=20%
6. On-call schedule confirmed for release weekend
7. Status page updated
8. Stakeholder email sent 24h before go-live
9. Post-release monitoring dashboard bookmarked
10. Runbook link sent to support team""",
                doc_type="doc",
            ),
            KBDocument(
                title="System Architecture – Atlas Platform",
                content="""Atlas Platform Architecture (Oct 2026):

Frontend: React 18 + Vite, deployed on Vercel (CDN edge)
Backend: FastAPI (Python 3.12), running on Render (Docker)
Database: PostgreSQL 16 on Neon (serverless, auto-scale)
Cache: Redis (Upstash free tier)
Auth: Auth0 (JWT, PKCE flow)
AI: Groq (primary), Gemini (fallback)
Storage: Cloudflare R2 (user uploads)
Monitoring: Sentry (errors), Grafana Cloud (metrics)

Key design decisions:
- Single-service FastAPI serves both API and React SPA (no CORS in prod)
- All AI calls have timeout + failover to ensure resilience
- DB schema uses soft deletes for audit compliance
- Feature flags via environment variables (simple, no external dependency)""",
                doc_type="doc",
            ),
            KBDocument(
                title="On-Call Runbook – Production Incidents",
                content="""On-Call Runbook for Atlas Platform

== First Response (0-5 min) ==
1. Check Sentry for error spikes
2. Check Grafana: API p99 latency, DB connections, error rate
3. Check Render dashboard: service health, deploy status

== Common Issues ==
High DB connections: scale Neon compute tier (Settings > Compute)
API timeouts: check if AI provider (Groq/Gemini) is down; app auto-falls back
Memory spike: restart service from Render dashboard

== Escalation ==
Tier 1 (on-call): Ravi, Priya
Tier 2 (lead): Neha (PM), Arjun (CTO)
Contact: Slack #incidents, PagerDuty

== Post-Incident ==
Write incident report within 24h (template in Notion)
Add to retrospective agenda""",
                doc_type="doc",
            ),
            KBDocument(
                title="Team Norms & Working Agreement",
                content="""Atlas Team – Working Agreement (updated Oct 2026)

Meetings: Weekly sync every Monday 10am IST (30 min max)
Async-first: Use Slack for questions, Notion for docs
PRs: Max 400 lines, reviewed within 1 business day
On-call rotation: Ravi → Priya → Arjun → repeat (2-week cycles)
Definition of Done: Code reviewed, tests passing, deployed to staging
Handover protocol: Use context-handoff-ai to capture all open items
Action items: Owner assigned within 24h, due date within 2 weeks max
Status updates: Every Friday EOD in #team-updates Slack channel""",
                doc_type="doc",
            ),
            KBDocument(
                title="Dark Mode Feature – Design Notes",
                content="""Dark Mode Implementation Notes

Approach: CSS custom properties (--color-bg, --color-text etc.) toggled by data-theme attribute
Storage: User preference in localStorage, synced to DB for logged-in users
Affected components: All (use design token classes, never hardcode colors)
Known issues:
- Charts (recharts) need explicit darkMode prop
- Third-party embeds (Intercom, Auth0 widget) won't respect theme
Test: Check on Windows (high contrast mode), macOS (system dark mode)
Owner: Ravi Singh
Target: v2.3 release (Nov 15)""",
                doc_type="doc",
            ),
            KBDocument(
                title="Past Meeting – Sprint 10 Retrospective",
                content="""Summary:
Sprint 10 went mostly well. We shipped the dashboard v2 on time but the dark mode feature was delayed due to design sign-off taking longer than expected. Team morale is good.

Decisions:
- Dark mode design review must happen in week 1 of sprint (not week 2)
- Load testing to be done 5 days before release (not 2)
- Ravi to pair with Arjun on the auth refactor

Action Items:
- [DONE] Priya: Update sprint planning template to include design review slot
- [DONE] Arjun: Write ADR for auth token storage decision
- [IN PROGRESS] Ravi: Complete dark mode CSS token mapping""",
                doc_type="past_meeting",
            ),
        ]
        db.add_all(kb_docs)
        db.flush()
        print(f"  Added {len(kb_docs)} KB documents")

        # ── Meeting 1: Sprint 11 Planning (held, 2 weeks ago) ─────────────
        m1 = Meeting(
            type="meeting",
            title="Sprint 11 Planning – Atlas Dashboard",
            status="closed",
            agenda="1. Review Sprint 10 outcomes\n2. Sprint 11 goals\n3. Assign action items\n4. Risk review",
            raw_notes="""Sprint 11 planning notes - Monday Oct 6

Attendees: Ravi, Priya, Arjun, Neha (joined late)
Simi - no response to invite, probably traveling

Ravi kicked off - sprint 10 was mostly good. Dashboard v2 shipped. Dark mode still pending - design took too long.

DECISIONS:
- We're targeting v2.3 for Nov 15 release. Dark mode must be in.
- Load test is now mandatory 5 days before release (Priya pushed for this after last sprint's scare)
- decided to move standup from 9am to 10am IST to accommodate Arjun's timezone

Action items from the meeting:
Ravi will finish the dark mode CSS token mapping by October 20th. 
Priya to set up load test environment by next Friday (Oct 13).
Arjun - write the auth refactor ADR by end of sprint
Neha will send updated roadmap to stakeholders, should be done by Oct 10.
Someone needs to look into the Redis cache hit rate issue - Ravi mentioned it's been low. No owner yet.
Follow up on the Intercom integration bug - blocking enterprise onboarding. Priya said she'd check but wasn't sure.

Other notes:
- Team lunch next Thursday
- Arjun requested 2 days for spike on new payment provider
- Budget review meeting with finance is TBD (Neha to schedule)""",
            summary="Sprint 11 planning completed. Team aligned on v2.3 Nov 15 release with dark mode as the key feature. Load testing moved earlier (5 days before release). Standups rescheduled to 10am IST. Several action items assigned with some still needing owners.",
            scheduled_at=ts(-14),
        )
        db.add(m1)
        db.flush()

        # Participants for m1
        m1_participants = [
            Participant(meeting_id=m1.id, name="Ravi Singh", email="ravi@atlas.dev", attendance="attended"),
            Participant(meeting_id=m1.id, name="Priya Sharma", email="priya@atlas.dev", attendance="attended"),
            Participant(meeting_id=m1.id, name="Arjun Mehta", email="arjun@atlas.dev", attendance="attended"),
            Participant(meeting_id=m1.id, name="Neha Kapoor", email="neha@atlas.dev", attendance="attended"),
            Participant(meeting_id=m1.id, name="Simi Tran", email="simi@atlas.dev", attendance="no_response"),
        ]
        db.add_all(m1_participants)

        # Decisions for m1
        m1_decisions = [
            Decision(meeting_id=m1.id, text="Target v2.3 release on November 15 with dark mode as key feature"),
            Decision(meeting_id=m1.id, text="Load testing mandatory 5 days before any release"),
            Decision(meeting_id=m1.id, text="Move daily standup to 10am IST"),
        ]
        db.add_all(m1_decisions)
        db.flush()

        # KB document for m1 (closed meeting → auto-added)
        kb_m1 = KBDocument(
            title="[Past Meeting] Sprint 11 Planning – Atlas Dashboard",
            content=f"Summary:\n{m1.summary}\n\nDecisions:\n- Target v2.3 release on November 15\n- Load testing mandatory 5 days before release\n- Move standup to 10am IST",
            doc_type="past_meeting",
        )
        db.add(kb_m1)
        db.flush()

        # ── Meeting 2: Sprint 11 Mid-Sprint Sync (held, 1 week ago) ───────
        m2 = Meeting(
            type="meeting",
            title="Sprint 11 Mid-Sprint Sync",
            status="held",
            agenda="1. Status check on dark mode\n2. Load test setup\n3. Blockers\n4. Redis cache issue",
            raw_notes="""Mid-sprint sync - Oct 13

Present: Ravi, Priya, Arjun. Neha was on a call (missed). Simi still no response.

Dark mode update from Ravi: CSS tokens done (70%). Blocked on the chart library dark theme - recharts doesn't support CSS variables well. Will look into workaround.

Priya: load test environment is up. Running first test tomorrow. Found an issue - test data isn't representative. Needs prod-like volume.

Arjun: ADR written, needs Neha's review before merging.

Redis cache issue: still no owner. Team agreed Arjun will take a look this week.

Intercom bug: Priya checked - it's an upstream Intercom bug. Logged ticket with their support. ETA unknown. We should consider a workaround.

Action items:
- Ravi: resolve recharts dark mode issue by Oct 18
- Arjun: look into Redis cache hit rate issue, report findings by Oct 16
- Priya: run load test with representative data by Oct 17
- Someone to follow up with Neha on ADR review (no owner yet, she's been hard to reach)

Neha's action: budget review meeting - still not scheduled. Need to chase her.""",
            scheduled_at=ts(-7),
            previous_meeting_id=m1.id,
        )
        db.add(m2)
        db.flush()

        m2_participants = [
            Participant(meeting_id=m2.id, name="Ravi Singh", email="ravi@atlas.dev", attendance="attended"),
            Participant(meeting_id=m2.id, name="Priya Sharma", email="priya@atlas.dev", attendance="attended"),
            Participant(meeting_id=m2.id, name="Arjun Mehta", email="arjun@atlas.dev", attendance="attended"),
            Participant(meeting_id=m2.id, name="Neha Kapoor", email="neha@atlas.dev", attendance="missed"),
            Participant(meeting_id=m2.id, name="Simi Tran", email="simi@atlas.dev", attendance="no_response"),
        ]
        db.add_all(m2_participants)
        db.flush()

        # ── Meeting 3: Upcoming Sprint 11 Review (scheduled, next week) ───
        m3 = Meeting(
            type="meeting",
            title="Sprint 11 Review & Demo",
            status="scheduled",
            agenda="1. Demo dark mode feature\n2. Load test results review\n3. v2.3 go/no-go decision\n4. Sprint 12 preview",
            scheduled_at=ts(7),
            previous_meeting_id=m2.id,
        )
        db.add(m3)
        db.flush()

        m3_participants = [
            Participant(meeting_id=m3.id, name="Ravi Singh", email="ravi@atlas.dev", attendance="invited"),
            Participant(meeting_id=m3.id, name="Priya Sharma", email="priya@atlas.dev", attendance="invited"),
            Participant(meeting_id=m3.id, name="Arjun Mehta", email="arjun@atlas.dev", attendance="invited"),
            Participant(meeting_id=m3.id, name="Neha Kapoor", email="neha@atlas.dev", attendance="invited"),
            Participant(meeting_id=m3.id, name="Simi Tran", email="simi@atlas.dev", attendance="invited"),
        ]
        db.add_all(m3_participants)
        db.flush()

        # ── Meeting 4: Emergency Prod Incident Debrief (held, 3 days ago) ─
        m4 = Meeting(
            type="meeting",
            title="Production Incident Debrief – Oct 17 Outage",
            status="held",
            agenda="1. Incident timeline\n2. Root cause\n3. Prevention measures\n4. Action items",
            raw_notes="""Incident debrief - Oct 17 outage

All hands. Ravi led the session.

Timeline:
- 14:32 IST: Spike in 500 errors, Sentry alert fired
- 14:35: Ravi paged, started investigating
- 14:47: Identified root cause - DB connection pool exhausted (Neon free tier limit)
- 15:10: Scaled Neon compute, errors dropped
- 15:20: All clear

Root cause: Traffic spike from a marketing campaign (not communicated to engineering). DB connection pool limit hit. No auto-scaling configured.

Prevention:
1. DECISION: Upgrade Neon to paid tier with auto-scaling - Arjun to action by Oct 20
2. DECISION: Marketing must give 48h notice before campaigns
3. DECISION: Add DB connection count to monitoring dashboard

Action items:
- Arjun: Upgrade Neon plan and configure connection pooling (PgBouncer) by Oct 20
- Ravi: Add DB metrics to Grafana dashboard by Oct 22
- Priya: Write incident report and publish to team by Oct 19
- Neha: Send memo to marketing about engineering communication process
- investigate whether Redis can offload some DB reads - vague, no owner, no date""",
            summary="Production incident debrief for Oct 17 outage. Root cause: DB connection pool exhausted due to unexpected marketing traffic spike. Team decided to upgrade Neon plan, enforce marketing communication process, and improve monitoring.",
            scheduled_at=ts(-3),
        )
        db.add(m4)
        db.flush()

        m4_participants = [
            Participant(meeting_id=m4.id, name="Ravi Singh", email="ravi@atlas.dev", attendance="attended"),
            Participant(meeting_id=m4.id, name="Priya Sharma", email="priya@atlas.dev", attendance="attended"),
            Participant(meeting_id=m4.id, name="Arjun Mehta", email="arjun@atlas.dev", attendance="attended"),
            Participant(meeting_id=m4.id, name="Neha Kapoor", email="neha@atlas.dev", attendance="attended"),
            Participant(meeting_id=m4.id, name="Simi Tran", email="simi@atlas.dev", attendance="missed"),
        ]
        db.add_all(m4_participants)

        m4_decisions = [
            Decision(meeting_id=m4.id, text="Upgrade Neon to paid tier with auto-scaling enabled"),
            Decision(meeting_id=m4.id, text="Marketing must give 48h notice before any campaign launches"),
            Decision(meeting_id=m4.id, text="Add DB connection count and pool utilization to Grafana monitoring dashboard"),
        ]
        db.add_all(m4_decisions)
        db.flush()

        # ── Handover: Neha goes on leave ───────────────────────────────────
        m5 = Meeting(
            type="handover",
            title="Neha Kapoor → Priya Sharma: PM Handover (Maternity Leave)",
            status="held",
            agenda="1. Open stakeholder commitments\n2. Ongoing vendor negotiations\n3. Budget status\n4. Team action items Neha owns",
            raw_notes="""Handover session - Oct 16

Neha handing over to Priya. Arjun present as backup.

Key open items Neha owns:
1. Stakeholder roadmap email (Priya now owns - send by Oct 21)
2. Budget review meeting with finance (needs scheduling - Priya to take over)
3. Marketing communication process memo (due ASAP after the incident)
4. Renewal negotiation with Intercom - at 30% discount stage. Next call Oct 25.

Context: Intercom renewal is strategic. We're looking to negotiate a 30% discount. Key contact: Sarah Chen (Intercom Enterprise). Notes in Notion.

Priya is empowered to make decisions up to $5k. Anything above needs Arjun's sign-off.

Neha will be back Dec 1. Emergency contact via WhatsApp only.""",
            summary="Neha handing over PM responsibilities to Priya during maternity leave. Key items: stakeholder communications, budget reviews, Intercom renewal negotiation (targeting 30% discount, contact: Sarah Chen). Priya has authority up to $5k.",
            scheduled_at=ts(-4),
        )
        db.add(m5)
        db.flush()

        m5_participants = [
            Participant(meeting_id=m5.id, name="Neha Kapoor", email="neha@atlas.dev", attendance="attended"),
            Participant(meeting_id=m5.id, name="Priya Sharma", email="priya@atlas.dev", attendance="attended"),
            Participant(meeting_id=m5.id, name="Arjun Mehta", email="arjun@atlas.dev", attendance="attended"),
        ]
        db.add_all(m5_participants)
        db.flush()

        print(f"  Added 5 meetings (4 meeting + 1 handover)")

        # ── Action Items ──────────────────────────────────────────────────
        # Helper to add an item with its initial "created" event

        def make_item(db, title, description, owner, due_date_offset, status,
                      origin_id, current_id, ai_generated=False,
                      outcome=None, carried_from_id=None):
            due = ts(due_date_offset) if due_date_offset is not None else None
            item = ActionItem(
                title=title,
                description=description,
                owner=owner,
                due_date=due,
                status=status,
                outcome=outcome,
                origin_meeting_id=origin_id,
                current_meeting_id=current_id,
                ai_generated=ai_generated,
                carried_from_id=carried_from_id,
            )
            db.add(item)
            db.flush()
            db.add(ItemEvent(item_id=item.id, event_type="created",
                             old_value=None, new_value=title, actor="system"))
            return item

        # Item 1: Done – load test environment (from m1, completed)
        i1 = make_item(db,
            "Set up load test environment with representative production data",
            "Configure k6 load test scripts with prod-like traffic patterns and data volume",
            "Priya Sharma", -7, "done",
            m1.id, m1.id, outcome="Load test environment configured. k6 scripts running with 10k user simulation.")
        db.add(ItemEvent(item_id=i1.id, event_type="status_changed",
                         old_value="open", new_value="in_progress", actor="Priya Sharma"))
        db.add(ItemEvent(item_id=i1.id, event_type="closed",
                         old_value="in_progress", new_value="done", actor="Priya Sharma"))

        # Item 2: In progress – dark mode CSS tokens (from m1)
        i2 = make_item(db,
            "Complete dark mode CSS token mapping for all components",
            "Map all hardcoded colors to CSS custom properties; test in Storybook",
            "Ravi Singh", -4, "in_progress",
            m1.id, m2.id, ai_generated=True)
        db.add(ItemEvent(item_id=i2.id, event_type="status_changed",
                         old_value="open", new_value="in_progress", actor="Ravi Singh"))
        db.add(ItemEvent(item_id=i2.id, event_type="carried_forward",
                         old_value=str(m1.id), new_value=str(m2.id), actor="system"))

        # Item 3: Open OVERDUE – recharts dark mode (from m2, overdue)
        i3 = make_item(db,
            "Resolve recharts library dark mode compatibility issue",
            "recharts doesn't support CSS variables; investigate wrapper or fork approach",
            "Ravi Singh", -2, "open",
            m2.id, m2.id)

        # Item 4: Open – Arjun ADR review by Neha (vague, no owner after Neha left)
        i4 = make_item(db,
            "Follow up on auth refactor ADR review",
            "ADR written by Arjun, needs PM sign-off before merging. Neha is on leave - reassign.",
            None, -1, "open",
            m2.id, m2.id)

        # Item 5: Open OVERDUE – Redis cache investigation (no owner originally, carried twice)
        i5 = make_item(db,
            "Investigate Redis cache hit rate degradation",
            "Cache hit rate dropped from 85% to 60% over 2 weeks. Potential memory leak or eviction policy issue.",
            "Arjun Mehta", -4, "open",
            m1.id, m2.id, carried_from_id=None)
        db.add(ItemEvent(item_id=i5.id, event_type="reassigned",
                         old_value=None, new_value="Arjun Mehta", actor="team"))
        db.add(ItemEvent(item_id=i5.id, event_type="carried_forward",
                         old_value=str(m1.id), new_value=str(m2.id), actor="system"))
        i5.carried_from_id = i5.id  # self-reference indicating it was carried

        # Item 6: Open – Neon upgrade (from m4, OVERDUE - due Oct 20)
        i6 = make_item(db,
            "Upgrade Neon PostgreSQL to paid tier and configure PgBouncer connection pooling",
            "Current free tier maxes at 20 connections. Upgrade to Neon Pro, configure PgBouncer to pool 100 connections.",
            "Arjun Mehta", -0, "in_progress",
            m4.id, m4.id)
        db.add(ItemEvent(item_id=i6.id, event_type="status_changed",
                         old_value="open", new_value="in_progress", actor="Arjun Mehta"))

        # Item 7: Open – Grafana dashboard (from m4)
        i7 = make_item(db,
            "Add DB connection count and pool utilization metrics to Grafana dashboard",
            "Use Neon metrics API. Add panels: active_connections, pool_utilization %, query latency p99.",
            "Ravi Singh", 2, "open",
            m4.id, m4.id)

        # Item 8: In progress – incident report (from m4, Priya)
        i8 = make_item(db,
            "Write and publish production incident report for Oct 17 outage",
            "Use incident report template in Notion. Include timeline, RCA, action items, prevention measures.",
            "Priya Sharma", -1, "in_progress",
            m4.id, m4.id)
        db.add(ItemEvent(item_id=i8.id, event_type="status_changed",
                         old_value="open", new_value="in_progress", actor="Priya Sharma"))

        # Item 9: Open – Neha's marketing memo (from m4, now Priya owns via handover)
        i9 = make_item(db,
            "Send marketing communication process memo to all marketing stakeholders",
            "After Oct 17 incident, engineering needs 48h notice before campaigns. Priya to draft and send.",
            "Priya Sharma", 1, "open",
            m4.id, m4.id)
        db.add(ItemEvent(item_id=i9.id, event_type="reassigned",
                         old_value="Neha Kapoor", new_value="Priya Sharma", actor="handover"))

        # Item 10: VAGUE – investigate Redis for DB offload (from m4, no owner)
        i10 = make_item(db,
            "Look into Redis for database read offloading",
            None,
            None, None, "open",
            m4.id, m4.id)

        # Item 11: Open – stakeholder roadmap email (handover item, from m5)
        i11 = make_item(db,
            "Send updated product roadmap to all stakeholders",
            "Q4 roadmap with v2.3 highlights. Use Neha's template in Notion. BCC Arjun.",
            "Priya Sharma", 1, "open",
            m5.id, m5.id)

        # Item 12: Open – Intercom renewal negotiation (from m5, vague follow-up)
        i12 = make_item(db,
            "Prepare for Intercom renewal negotiation call",
            "Target 30% discount. Contact: Sarah Chen (sarah.chen@intercom.io). Talking points in Notion handover doc.",
            "Priya Sharma", 5, "open",
            m5.id, m5.id)

        # Item 13: Dropped – budget review (won't happen while Neha is on leave)
        i13 = make_item(db,
            "Schedule Q4 budget review with finance team",
            "Originally Neha's responsibility. Deferred until she returns in December.",
            "Neha Kapoor", -5, "dropped",
            m1.id, m1.id, outcome="Deferred to December when Neha returns from maternity leave.")
        db.add(ItemEvent(item_id=i13.id, event_type="closed",
                         old_value="open", new_value="dropped", actor="Arjun Mehta"))

        db.flush()
        print(f"  Added 13 action items")

        # ── KB Links (confirmed) ───────────────────────────────────────────
        links = [
            KBLink(source_type="item", source_id=i2.id,
                   document_id=kb_docs[4].id, score=0.82,
                   reason="Dark mode item directly relates to the dark mode design notes document"),
            KBLink(source_type="item", source_id=i6.id,
                   document_id=kb_docs[1].id, score=0.71,
                   reason="Neon upgrade relates to the system architecture document"),
            KBLink(source_type="item", source_id=i7.id,
                   document_id=kb_docs[2].id, score=0.65,
                   reason="Grafana monitoring setup relates to on-call runbook"),
            KBLink(source_type="meeting", source_id=m4.id,
                   document_id=kb_docs[2].id, score=0.78,
                   reason="Production incident debrief relates to on-call runbook"),
        ]
        db.add_all(links)

        db.commit()
        print("✓ Seed data committed successfully!")
        print(f"\nSummary:")
        print(f"  - 5 meetings (4 team syncs + 1 work handover)")
        print(f"  - 13 action items (mix of open/done/dropped/overdue/carried/vague)")
        print(f"  - 6 KB documents (runbook, arch notes, release checklist, etc.)")
        print(f"  - 4 KB links (confirmed)")
        print(f"\nDemo highlights:")
        print(f"  - Meeting {m2.id} has Neha as 'missed' – brief for her shows what she missed")
        print(f"  - Items {i4.id}, {i5.id}, {i10.id} are vague/ownerless – perfect for Radar demo")
        print(f"  - Items {i3.id}, {i5.id} are overdue – show up in overdue panel")
        print(f"  - Item {i5.id} was carried forward – shows carry history")
        print(f"  - Meeting {m1.id} raw_notes is messy – great for AI recap demo")

    except Exception as e:
        db.rollback()
        print(f"Seed failed: {e}")
        raise
    finally:
        db.close()


if __name__ == "__main__":
    seed()

