# RFC-001: The `.tdx` Capsule Specification

**Status:** Draft  
**Authors:** TeacherDox Team  
**Created:** 2026-10-27  
**Hackathon:** Meta Global AI Developer Hackathon (Oct 27 – Nov 4, 2026)

---

## 1. Abstract

The `.tdx` (TeacherDox) capsule is a structured, verifiable, portable data format for a single period's academic record. It serves as the canonical contract between the **Capture → Process → Capsule → Consume** pipeline stages, ensuring that a record created in a rural government school and one created in an international school are equally trustworthy under audit.

---

## 2. Motivation

Current school record-keeping suffers from:
- **Fragmentation:** Paper diaries, WhatsApp forwards, Excel sheets, portal entries — no single source of truth
- **Non-verifiability:** No way to prove when a record was created, by whom, or whether it was modified
- **Non-portability:** Records locked in proprietary systems, impossible to transfer between schools/boards
- **Audit gaps:** Inspectors cannot cryptographically verify record integrity

The `.tdx` capsule solves this by defining a **self-contained, signed, versioned record** that flows from teacher's WhatsApp input → AI processing → teacher/headmaster signing → permanent storage.

---

## 3. Capsule Structure

A `.tdx` capsule is a JSON object with the following top-level fields:

```json
{
  "tdxVersion": "1.0",
  "capsuleId": "tdx-20261027-919876543210-8b-period3-abc123def",
  "createdAt": "2026-10-27T09:15:00+05:30",
  "teacher": {
    "tdxId": "TDX-T-AP0412-7K3Q-0042",
    "name": "Priya Sharma",
    "phone": "919876543210",
    "schoolCode": "TDX-S-AP0412-7K3Q"
  },
  "class": {
    "grade": "8",
    "section": "B",
    "subject": "Science",
    "period": 3,
    "date": "2026-10-27"
  },
  "content": {
    "topic": "Photosynthesis",
    "summary": "Explained light-dependent reactions with diagram on board. Students identified chlorophyll role.",
    "method": "Lecture + diagram + Q&A",
    "attendance": "42/45",
    "homework": "Questions 1-5 page 120",
    "carryForward": "Calvin cycle tomorrow",
    "language": "en"
  },
  "evidence": {
    "photos": [
      {
        "url": "https://app.teacherdox.in/storage/photos/abc123.jpg",
        "hash": "sha256:abc123...",
        "capturedAt": "2026-10-27T09:10:00+05:30",
        "boardCrop": { "x": 0.15, "y": 0.12, "width": 0.72, "height": 0.68 }
      }
    ],
    "voiceNotes": [
      {
        "url": "https://app.teacherdox.in/storage/audio/def456.ogg",
        "hash": "sha256:def456...",
        "durationSec": 45,
        "transcript": "Today we covered photosynthesis light reactions...",
        "language": "en",
        "confidence": 0.94
      }
    ],
    "textNotes": [
      "Students asked about ATP formation"
    ]
  },
  "ai": {
    "backend": "meta",
    "model": "muse-spark-1026",
    "processedAt": "2026-10-27T09:15:02+05:30",
    "confidence": {
      "topic": 0.98,
      "summary": 0.92,
      "method": 0.88,
      "attendance": 0.95,
      "homework": 0.90,
      "carryForward": 0.85
    },
    "flags": {
      "guessedFields": ["carryForward"],
      "lowConfidence": [],
      "unreadableEvidence": []
    }
  },
  "lifecycle": {
    "state": "confirmed_locked",
    "teacherSignedAt": "2026-10-27T16:45:00+05:30",
    "teacherSignature": "ed25519:abc123...",
    "headmasterSignedAt": "2026-10-27T17:20:00+05:30",
    "headmasterSignature": "ed25519:def456...",
    "autoSubmittedAt": null
  },
  "signatures": {
    "teacher": "ed25519:abc123...",
    "headmaster": "ed25519:def456...",
    "meo": null,
    "deo": null
  },
  "hash": "sha256:final_capsule_hash..."
}
```

---

## 4. Field Definitions

### 4.1 Required Fields

| Field | Type | Description |
|-------|------|-------------|
| `tdxVersion` | string | Semantic version of this spec (e.g., "1.0") |
| `capsuleId` | string | Globally unique ID: `tdx-{date}-{teacherPhone}-{classCode}-{random}` |
| `createdAt` | ISO8601 | Timestamp when capsule was first created (IST) |
| `teacher` | object | Teacher identity (tdxId, name, phone, schoolCode) |
| `class` | object | Class context (grade, section, subject, period, date) |
| `content` | object | Structured entry fields (topic, summary, method, attendance, homework, carryForward, language) |
| `evidence` | object | References to source evidence (photos, voiceNotes, textNotes) |
| `ai` | object | AI processing metadata (backend, model, confidence, flags) |
| `lifecycle` | object | Signing state and timestamps |
| `signatures` | object | Cryptographic signatures |
| `hash` | string | SHA-256 of the canonicalized capsule (excluding this field) |

### 4.2 Evidence Objects

**Photo:**
```json
{
  "url": "https://...",
  "hash": "sha256:...",
  "capturedAt": "ISO8601",
  "boardCrop": { "x": 0.15, "y": 0.12, "width": 0.72, "height": 0.68 }
}
```

**Voice Note:**
```json
{
  "url": "https://...",
  "hash": "sha256:...",
  "durationSec": 45,
  "transcript": "text",
  "language": "en|ml|te|hi",
  "confidence": 0.94
}
```

### 4.3 AI Metadata

```json
{
  "backend": "meta|gemini",
  "model": "model-id-used",
  "processedAt": "ISO8601",
  "confidence": { "field": 0.0-1.0 },
  "flags": {
    "guessedFields": ["fieldName"],
    "lowConfidence": ["fieldName"],
    "unreadableEvidence": ["evidenceId"]
  }
}
```

### 4.4 Lifecycle States

| State | Meaning |
|-------|---------|
| `draft` | AI-generated, not yet reviewed |
| `teacher_review` | Teacher editing/viewing |
| `confirmed_locked` | Teacher signed, awaiting headmaster |
| `headmaster_review` | Headmaster reviewing |
| `confirmed_locked` | Headmaster countersigned (final) |
| `auto_locked` | Auto-signed at 20:00 IST if unsigned |
| `archived` | Immutable, stored permanently |

---

## 5. Canonicalization & Hashing

The `hash` field is computed as:

1. Remove `hash` field from capsule
2. Sort all keys recursively (lexicographic)
3. Serialize to JSON with no whitespace (`JSON.stringify(obj, null, 0)`)
4. Compute SHA-256
5. Prefix with `sha256:`

This ensures deterministic hashing for verification.

---

## 6. Signing

- **Algorithm:** Ed25519 (fast, small signatures, widely supported)
- **Key derivation:** Teacher's key derived from `SESSION_SECRET` + phone number (HKDF)
- **What is signed:** The capsule `hash` (not the full JSON)
- **Signature format:** `ed25519:{base64_signature}`

---

## 7. Verification

Anyone with the capsule can verify:

1. **Integrity:** Recompute `hash` → matches stored `hash`
2. **Authenticity:** Verify Ed25519 signatures against known public keys
3. **Timeline:** `createdAt` ≤ `teacherSignedAt` ≤ `headmasterSignedAt`
4. **AI accountability:** `ai.backend`, `ai.model`, `ai.confidence` present
5. **Evidence linkage:** `evidence.*.hash` matches stored blobs

---

## 8. Portability

A `.tdx` capsule is:
- **Self-contained:** All data needed for verification is inside
- **Board-agnostic:** Works for CBSE, ICSE, IB, State boards
- **Transferable:** Can be exported/imported between TeacherDox instances
- **Archival:** Valid indefinitely; no external dependencies for verification

---

## 9. Versioning

- `tdxVersion` follows semver
- Breaking changes require major version bump
- Minor versions add optional fields only
- Old versions remain verifiable

---

## 10. Example Minimal Capsule

```json
{
  "tdxVersion": "1.0",
  "capsuleId": "tdx-20261027-919876543210-8b-period3-abc123def",
  "createdAt": "2026-10-27T09:15:00+05:30",
  "teacher": { "tdxId": "TDX-T-AP0412-7K3Q-0042", "phone": "919876543210" },
  "class": { "grade": "8", "section": "B", "subject": "Science", "period": 3, "date": "2026-10-27" },
  "content": { "topic": "Photosynthesis", "summary": "...", "method": "Lecture", "attendance": "42/45", "homework": "Q1-5 p120", "carryForward": "Calvin cycle", "language": "en" },
  "evidence": { "photos": [], "voiceNotes": [], "textNotes": [] },
  "ai": { "backend": "gemini", "model": "gemini-2.5-flash", "processedAt": "2026-10-27T09:15:01+05:30", "confidence": {}, "flags": {} },
  "lifecycle": { "state": "draft" },
  "signatures": {},
  "hash": "sha256:..."
}
```

---

## 11. Implementation Notes

- TeacherDox `tdx.js` serializes `diary_entries` DB rows → `.tdx` capsule
- `pdf.js` consumes `.tdx` capsules for deterministic PDF generation
- `diary.js` renders `.tdx` capsules in the interactive timeline
- Evaluation harness (`eval/run.js`) outputs capsules for comparison

---

*This specification is part of the TeacherDox Meta Hackathon submission (Oct 27 – Nov 4, 2026).*