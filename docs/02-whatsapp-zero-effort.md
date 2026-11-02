# WhatsApp Zero-Effort Design

**Status:** Draft  
**Hackathon:** Meta Global AI Developer Hackathon (Oct 27 – Nov 4, 2026)

---

## 1. The Core Idea

**Zero messages per upload.** A teacher in zero-effort mode sends a photo of the board, a voice note, or a quick text — and gets **no reply**. The evidence is silently captured, batched, and processed into the live diary. The teacher receives **one message per day** (evening digest) and **signs once**.

This is the "teaching diary that writes itself" — no friction, no chat noise, no buttons to tap for every period.

---

## 2. User Journey

### 2.1 Enrollment

- Teacher is added to `ZERO_EFFORT_PHONES` (comma-separated list, or `"all"`)
- At startup, `capture.loadEnrolled()` loads these numbers into memory
- New zero-effort teachers can be added via `capture.enroll(phone)` at runtime

### 2.2 Daily Flow

```
07:30          09:15           11:30           16:30           20:00
  │             │              │              │              │
  ▼             ▼              ▼              ▼              ▼
Today's      Teacher        Teacher         Evening       Auto-lock
Log sent     uploads        uploads         digest        (if unsigned)
(optional)   photo/voice/   photo/voice/    (one msg)     
             text           text                                    
             (no reply)     (no reply)                                
```

### 2.3 Message Cap

- `ZERO_EFFORT_DAILY_CAP` (default 3) = max unsolicited messages per IST day
- Admin numbers (`ADMIN_PHONES`) are exempt
- Replies to teacher's own messages don't count
- Every bot message logged in `outbound_messages` with `purpose` + `category`

---

## 3. Capture Pipeline (capture.js)

### 3.1 What Gets Captured

For enrolled teachers, `handleInbound` routes these to `inbound_messages` **silently**:

| Message Type | Captured? | Reply? |
|--------------|-----------|--------|
| Photo (board) | ✅ | ❌ |
| Voice note | ✅ | ❌ |
| Class note text | ✅ | ❌ |
| "Delete for everyone" (error 131051) | ✅ (as "unsupported") | ❌ |
| Commands (`menu`, `today`, `sign`) | ❌ | ✅ (normal flow) |
| Numbered menu answers | ❌ | ✅ (normal flow) |
| Greetings (`hi`, `hello`) | ❌ | ✅ (normal flow) |

### 3.2 Storage

```sql
CREATE TABLE inbound_messages (
  id UUID PRIMARY KEY,
  teacher_id TEXT REFERENCES teachers(tdx_id),
  chat_id TEXT,                    -- WhatsApp number
  type TEXT,                       -- 'photo' | 'voice' | 'text' | 'unsupported'
  mime_type TEXT,
  storage_path TEXT,               -- Supabase Storage path
  hash TEXT,                       -- SHA-256 of content
  text_content TEXT,               -- For text messages
  meta JSONB,                      -- WhatsApp message metadata
  captured_at TIMESTAMPTZ DEFAULT now(),
  processed BOOLEAN DEFAULT FALSE  -- Set true when batched to AI
);
```

### 3.3 Batching Trigger

Two mechanisms ensure timely processing:

1. **Quiet timer:** After each upload, `canvas.nudge(teacher)` starts a `CANVAS_QUIET_SECONDS` (default 10s) timer. If no new message arrives, the batch is sent to AI.
2. **Scheduler fallback:** Every 20s, `canvas.js` checks for unprocessed messages older than `CANVAS_QUIET_SECONDS` and processes them.

This guarantees: **no message waits more than ~30s after the teacher goes quiet**.

---

## 4. Process Pipeline (canvas.js + ai.js)

### 4.1 Single AI Call Per Teacher Per Day

When the quiet timer fires:

```javascript
// canvas.js ~line 233-244
const drafts = await gemini.generate({
  contents: [{
    role: 'user',
    parts: [
      { text: prompt },
      ...evidenceParts  // All photos + voice transcripts + texts
    ]
  }]
}, { user: teacherPhone });
```

**One Gemini/Meta call** processes **all evidence since last digest**, returning **one draft per class**.

### 4.2 Live Drafts → Live Diary

Each AI draft is immediately mirrored:

- `draft_entries` — AI's working copy (can be rebuilt)
- `diary_entries` — `lifecycle_state = 'draft'` ("Not signed yet")
- `daily_registers` — status `draft`, listed for HM/MEO/DEO dashboards

**Result:** Teacher's diary and admin dashboards are live within seconds.

### 4.3 Corrections & Removals

Teacher sends corrections as normal messages:

| Message | Action |
|---------|--------|
| `"9A homework is page 42"` | Updates that field in the draft |
| `"delete that photo"` | Removes last photo, rebuilds draft |
| `"remove 8B"` | Hard-deletes 8B entry + photo + draft |

---

## 5. Daily Digest (16:30 IST)

One message per teacher with drafts:

```
वाईकुनेरम काइमट्टम:
• 8B: Photosynthesis — Light reactions explained ⚠
• 9A: Kerala History — State formation

[View in diary] [Sign diary]
```

- `⚠` = guessed field (AI confidence < 0.95)
- "View in diary" → `/d/<token>#e=<entryId>` (deep link to entry)
- "Sign diary" → signs all drafts at once

---

## 6. Signing Flow

### 6.1 Teacher Sign

- Tap "Sign diary" in digest OR diary page
- All `draft` → `confirmed_locked` (teacher)
- `daily_registers` status → `signed_teacher`
- Headmaster notified once

### 6.2 Headmaster Countersign

- HM sees "Countersign" on dashboard
- Tap → all `confirmed_locked` (final)
- `daily_registers` status → `signed_both`

### 6.3 Auto-Lock (20:00 IST)

- Unsigned days → `auto_locked`
- Leftover draft rows deleted
- Flags preserved in audit trail

---

## 7. Meta Hackathon Integration

### 7.1 SAM 3.1 Board Crop (boardcrop.js)

Before `ai.js` processes a board photo:

```
Teacher photo
    │
    ▼
SAM 3.1 (boardcrop.detectAndCrop)
    │
    ▼
Cropped board region
    │
    ▼
Muse Spark (vision) → structured entry
```

**Visible second Meta model doing real work.**

### 7.2 Muse Voice Transcribe (muse.js)

Voice notes (OGG/Opus from WhatsApp):

```
Teacher voice note (Malayalam/Telugu/Hindi/English)
    │
    ▼
Muse Voice Transcribe (muse.transcribeAudio)
    │
    ▼
Text transcript + detected language
    │
    ▼
Muse Spark (text + board) → structured entry
```

### 7.3 Malayalam End-to-End (malayalam.js)

- `ml` added to `WORDS` tables
- `teachers.language` learns from messages
- Bot replies in Malayalam, entries stored in English

---

## 8. Configuration

```bash
# Zero-effort mode
ZERO_EFFORT_PHONES=919876543210,919812345678  # or "all"
ZERO_EFFORT_DAILY_CAP=3
CANVAS_QUIET_SECONDS=10

# Digest timing
DIGEST_TIME=16:30
AUTO_SUBMIT_TIME=20:00

# Meta AI (hackathon)
AI_BACKEND=meta
META_API_KEY=...
META_MODEL_CHAT=...
META_MODEL_VISION=...
META_MODEL_TRANSCRIBE=...
META_MODEL_SAM=sam-3.1
META_AI_PHONES=919876543210  # demo/test only
```

---

## 9. Admin Commands

| Command | Description |
|---------|-------------|
| `captured [number]` | List today's captured messages |
| `process <num>` | Preview AI processing for teacher |
| `digest <num>` | Send evening digest now |
| `autosubmit <num>` | Trigger auto-lock now |
| `enroll <num>` | Add teacher to zero-effort |
| `unenroll <num>` | Remove from zero-effort |

---

## 10. Invariants (Must Hold)

1. **No per-upload replies** for zero-effort teachers
2. **One evening message max** per day (plus sign confirmation)
3. **Message cap enforced** — `ZERO_EFFORT_DAILY_CAP` hard limit
4. **AI called once per quiet spell** — never per upload
5. **Live diary always current** — drafts mirrored immediately
6. **Admin exempt** from caps and zero-effort mode

---

*This design is implemented in `capture.js`, `canvas.js`, `muse.js`, `boardcrop.js`, `malayalam.js` — all built during the Meta Hackathon (Oct 27 – Nov 4, 2026).*