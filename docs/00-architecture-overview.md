# Architecture Overview

**Status:** Draft  
**Hackathon:** Meta Global AI Developer Hackathon (Oct 27 – Nov 4, 2026)

---

## 1. System Boundaries

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                           TEACHERDOX SYSTEM                                 │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  ┌──────────┐    ┌──────────┐    ┌──────────┐    ┌──────────┐            │
│  │ CAPTURE  │───▶│ PROCESS  │───▶│ CAPSULE  │───▶│ CONSUME  │            │
│  └──────────┘    └──────────┘    └──────────┘    └──────────┘            │
│       │              │              │              │                       │
│       ▼              ▼              ▼              ▼                       │
│  WhatsApp       AI Models      .tdx          Diary /                      │
│  inbound        (Gemini/       Capsule       PDF /                        │
│  messages       Meta)                         Dashboards                  │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

### Invariants

1. **Capture never blocks on AI** — Evidence stored immediately, AI async
2. **The `.tdx` capsule is the only contract** — No internal state leaks between stages
3. **Consumers read only locked capsules** — Diary/PDF never touch draft/AI internals
4. **IST is canonical** — All "day" boundaries use Asia/Kolkata
5. **Single-instance state** — Server runs as exactly one process (sessions, scheduler in memory)

---

## 2. Data Flow

### 2.1 Capture Stage (WhatsApp → `inbound_messages`)

```
Teacher (WhatsApp)
    │  photo / voice / text
    ▼
Silent capture (inbound_messages)
    │
    ├──▶ Zero-effort teachers: no reply, stored for batch
    └──▶ Normal teachers: Today's Log flow
```

**Tables:** `inbound_messages`, `whatsapp_contacts`

**Modules:** `index.js` (webhook), `wa.js` (channel), `capture.js` (zero-effort)

### 2.2 Process Stage (AI Pipeline)

```
inbound_messages (batched)
    │
    ▼
Gemini / Meta (Muse Spark + Voice Transcribe)
    │
    ├──▶ Board photo → SAM 3.1 crop → Muse Spark vision
    ├──▶ Voice note → Muse Voice Transcribe
    └──▶ Text → Muse Spark text
    │
    ▼
Structured draft entry (draft_entries)
```

**Modules:** `ai.js` (pipeline), `gemini.js` (Gemini client), `muse.js` (Meta client), `boardcrop.js` (SAM)

### 2.3 Capsule Stage (`.tdx` Creation)

```
draft_entries + evidence + ai metadata
    │
    ▼
tdx.js → .tdx capsule
    │
    ▼
diary_entries (lifecycle_state='draft') + daily_registers
```

**Modules:** `canvas.js` (live diary), `tdx.js` (serialization)

### 2.4 Consume Stage (Diary / PDF / Dashboards)

```
.tdx capsules (locked)
    │
    ├──▶ diary.js → Interactive web diary (/d/<token>)
    ├──▶ pdf.js → Deterministic PDFs (register, entry card, ID card)
    ├──▶ staff.js → HM/MEO/DEO dashboards
    └──▶ agent.js → Scheduled briefs, digests, weekly reports
```

**Modules:** `diary.js`, `pdf.js`, `staff.js`, `agent.js`

---

## 3. Key Components

| Module | Responsibility | Tables |
|--------|----------------|--------|
| `index.js` | Express, webhook, routing, boot | — |
| `wa.js` | WhatsApp channel core (send, buttons, 24h window, outbox) | `outbound_messages` |
| `aisensy.js` / `meta.js` | WhatsApp providers | — |
| `capture.js` | Zero-effort silent capture | `inbound_messages` |
| `canvas.js` | Live diary: drafts, digest, signing | `draft_entries`, `diary_entries`, `daily_registers` |
| `onboard.js` | Teacher sign-up on WhatsApp | `teachers`, `schools` |
| `gemini.js` | Gemini model selection, daily limits | — |
| `muse.js` | Meta Model API client, router, fallback | — |
| `boardcrop.js` | SAM 3.1 board detection & crop | — |
| `ai.js` | Multimodal pipeline (photo+voice+text → entry) | — |
| `db.js` | Supabase data layer (ledger) | All |
| `agent.js` | Scheduler: briefs, alerts, digests | — |
| `diary.js` | Interactive web diary | `diary_entries` |
| `pdf.js` | PDFKit generator | — |
| `tdx.js` | `.tdx` capsule serialization | — |
| `access.js` / `authz.js` | Sign-in, authorization | `login_otps` |
| `register.js` | Website registration API | `web_registrations` |
| `geo.js` | UDISE+ school directory | `geo.sqlite` |
| `billing.js` | Razorpay subscriptions | `billing_links`, `payments` |
| `members.js` | Founding 1000, invites | `teachers.member_no` |

---

## 4. External Dependencies

| Service | Purpose | Fallback |
|---------|---------|----------|
| WhatsApp (AiSensy / Meta) | Messaging channel | Queue in `outbox_messages` |
| Supabase (Postgres + Storage) | Database, file storage | Self-hosted Supabase |
| Gemini (AI Studio / Vertex) | Primary AI | Meta (Muse) |
| Meta Model API | Hackathon AI (Muse Spark, Voice, SAM) | Gemini |
| Razorpay | Billing | Manual `markpaid` |
| UDISE+ | School directory | Static `geo.sqlite` |
| Caddy + systemd | HTTPS, process mgmt | — |

---

## 5. Security Boundaries

- **WhatsApp verification:** `WHATSAPP_APP_SECRET` / `AISENSY_WEBHOOK_SECRET`
- **Sign-in:** WhatsApp OTP (Authentication template), session cookie signed with `SESSION_SECRET`
- **Authorization:** Roles from live tables (teacher, HM, MEO, DEO, admin)
- **Diary links:** HMAC-signed tokens (`/d/<token>`), no login required
- **Admin endpoints:** Guarded by `ADMIN_PHONES` + `authz.js`
- **Secrets:** Never in code; GitHub secrets → `/etc/teacherdox.env` at deploy

---

## 6. Scaling Constraints

- **Single instance only** — In-memory sessions, scheduler, caches
- **No serverless** — WebSocket-like WhatsApp connection, long-running scheduler
- **Database connection pooling** — Supabase handles this
- **File storage** — Supabase Storage (or `PUBLIC_STORAGE_URL` for self-hosted)

---

*This document describes the target architecture. Current implementation is a synchronous monolith moving toward these invariants.*