# RFC-002: Lifecycle & Trust

**Status:** Draft  
**Authors:** TeacherDox Team  
**Created:** 2026-10-27  
**Hackathon:** Meta Global AI Developer Hackathon (Oct 27 – Nov 4, 2026)

---

## 1. Abstract

This RFC defines the **lifecycle states** of a `.tdx` capsule, the **confidence-gated attestation** model, and the **trust boundaries** between pipeline stages. It ensures that every record progresses through a verifiable chain: Capture → Process → Capsule → Consume, with explicit confidence routing at each step.

---

## 2. Lifecycle States

A `.tdx` capsule transitions through these states:

```
draft
    │
    ▼ (teacher reviews)
teacher_review
    │
    ▼ (teacher signs)
confirmed_locked (teacher)
    │
    ▼ (headmaster reviews)
headmaster_review
    │
    ▼ (headmaster countersigns)
confirmed_locked (final)
    │
    ▼ (20:00 IST if unsigned)
auto_locked
    │
    ▼ (archival)
archived
```

### State Definitions

| State | Trigger | Who Can Edit | Who Can Sign | Visible To |
|-------|---------|--------------|--------------|------------|
| `draft` | AI generates entry | — | — | Teacher, HM, MEO, DEO |
| `teacher_review` | First entry of day → "View in diary" | Teacher (text only) | — | Teacher, HM, MEO, DEO |
| `confirmed_locked` (teacher) | Teacher taps "Sign diary" / "submit" | — | Teacher | Teacher, HM, MEO, DEO |
| `headmaster_review` | Teacher signed | — | Headmaster | HM, MEO, DEO |
| `confirmed_locked` (final) | Headmaster taps "Countersign" | — | — | Everyone (immutable) |
| `auto_locked` | 20:00 IST, unsigned | — | System | Everyone (immutable) |
| `archived` | End of academic year | — | — | Audit only |

---

## 3. Confidence Routing

The AI pipeline assigns per-field confidence scores (0.0–1.0). These drive **confidence-gated attestation**:

### Confidence Thresholds

| Threshold | Action |
|-----------|--------|
| `≥ 0.95` | Auto-accept; no flag shown |
| `0.80 – 0.94` | Flag with ⚠ in digest; teacher can one-tap fix |
| `0.60 – 0.79` | Flag with ⚠⚠; teacher must edit before sign |
| `< 0.60` | Reject field; fall back to manual entry |

### Flag Display

- **Teacher's evening digest:** ⚠ next to guessed fields
- **Diary view:** Yellow highlight on low-confidence fields
- **PDF register:** Footnote listing all flagged fields
- **Admin dashboard:** Aggregate confidence heatmap

### Routing Rules

1. **No field with confidence < 0.60 may reach `confirmed_locked`**
2. **Teacher must explicitly acknowledge ⚠⚠ fields before signing**
3. **Headmaster sees all flags; can reject back to teacher**
3. **Auto-lock at 20:00 applies flags as-is (with audit trail)**

---

## 4. Trust Boundaries

### 4.1 Capture → Process (WhatsApp → AI)

**Invariant:** Capture never blocks on AI.

- Evidence (photo/voice/text) stored immediately in `inbound_messages`
- AI processing is async; teacher gets no per-upload reply
- If AI fails/times out → entry falls back to manual typing
- **Trust:** Teacher's raw input is immutable once stored

### 4.2 Process → Capsule (AI → Structured Entry)

**Invariant:** The `.tdx` capsule is the only contract between stages.

- `ai.js` outputs structured draft → `canvas.js` wraps in capsule
- No internal AI state leaks into capsule
- Capsule includes full `ai` metadata (backend, model, confidence, flags)
- **Trust:** Capsule is auditable; AI is a black box with declared outputs

### 4.3 Capsule → Consume (Capsule → Diary/PDF)

**Invariant:** Consumers read only locked capsules.

- `diary.js` renders `confirmed_locked` + `auto_locked` capsules
- `pdf.js` generates deterministic PDFs from locked capsules
- Neither reaches back into `draft_entries` or AI internals
- **Trust:** Consumption is read-only; no retroactive changes

---

## 5. Signing & Attestation

### 5.1 Teacher Signing

- Trigger: "Sign diary" button in evening digest OR diary page
- Action: Creates `teacherSignature` over capsule `hash`
- Effect: `lifecycle.state` → `confirmed_locked` (teacher)
- Entry moves to `daily_registers` with status `signed_teacher`

### 5.2 Headmaster Countersigning

- Trigger: "Countersign" button on HM dashboard
- Action: Creates `headmasterSignature` over capsule `hash`
- Effect: `lifecycle.state` → `confirmed_locked` (final)
- Entry moves to `daily_registers` with status `signed_both`

### 5.3 Auto-Lock (20:00 IST)

- Trigger: Scheduler runs at `AUTO_SUBMIT_TIME`
- Condition: `daily_registers` status = `draft` or `signed_teacher`
- Action: System signature (`auto_locked`), no human key
- Effect: Immutable record; flagged fields noted in audit log

### 5.4 MEO/DEO Endorsement (Optional)

- For compliance audits, MEO/DEO can add endorsement signature
- Stored in `signatures.meo` / `signatures.deo`
- Does not change lifecycle state (already final)

---

## 6. Audit Trail

Every state transition is logged in `capsule_audit` table:

```sql
CREATE TABLE capsule_audit (
  id UUID PRIMARY KEY,
  capsule_id TEXT NOT NULL,
  from_state TEXT,
  to_state TEXT,
  actor TEXT,           -- 'teacher', 'headmaster', 'system', 'meo', 'deo'
  actor_id TEXT,        -- phone or tdx_id
  signature TEXT,       -- Ed25519 signature or 'auto'
  flags_snapshot JSONB, -- ai.flags at time of transition
  created_at TIMESTAMPTZ DEFAULT now()
);
```

This enables:
- Full reconstruction of capsule history
- Detection of any post-signing modifications
- Compliance reporting for MEO/DEO

---

## 7. Revocation & Correction

**No revocation.** Once `confirmed_locked` (final) or `auto_locked`, a capsule is immutable.

**Corrections** create a new capsule:
- Teacher edits → new `draft` capsule with `supersedes: <old_capsule_id>`
- Re-signing flow repeats
- Audit trail links old → new

---

## 8. Privacy & Data Retention

| Data | Retention | Notes |
|------|-----------|-------|
| Raw evidence (photos/voice) | 1 year | Then hashed reference only |
| AI confidence metadata | Permanent | Part of capsule |
| Signatures | Permanent | Non-repudiation |
| Audit log | Permanent | Compliance |
| Teacher PII | Per policy | `teachers` table, GDPR/PDPB compliant |

---

## 9. Implementation Checklist

- [ ] `canvas.js` enforces state machine
- [ ] `diary.js` renders only locked capsules
- [ ] `pdf.js` consumes only locked capsules
- [ ] `tdx.js` serializes with full `ai` metadata
- [ ] `capsule_audit` table + triggers
- [ ] Confidence thresholds in `ai.js` / `gemini.js` / `muse.js`
- [ ] Auto-lock scheduler in `agent.js`
- [ ] MEO/DEO endorsement API in `index.js`

---

*This RFC is part of the TeacherDox Meta Hackathon submission (Oct 27 – Nov 4, 2026).*