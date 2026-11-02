# TeacherDox — Meta Hackathon Modules

**Meta Global AI Developer Hackathon** (Oct 27 – Nov 4, 2026)  
Track: Startup — "Build for Your World"

This repository contains **only the work built during the hackathon** for TeacherDox. The main TeacherDox product (private repo) imports these modules.

## What was built (Oct 26 – Nov 4, 2026)

| Module | Description | Meta Model |
|--------|-------------|------------|
| `muse.js` | Meta Model API client + router (`AI_BACKEND=meta\|gemini`) | Muse Spark, Muse Voice Transcribe |
| `boardcrop.js` | SAM 3.1 board detection & crop for classroom photos | SAM 3.1 |
| `malayalam.js` | Malayalam bot replies (`ml` in `WORDS`) | — |
| `eval/` | Evaluation harness: 30–50 real photos/voice notes, Meta vs Gemini comparison | — |
| `.tdx` spec | Open data standard for academic records (docs/) | — |

## Architecture

```
WhatsApp evidence (board photo + Indian-language voice note)
   → SAM 3.1: locate and crop the board (boardcrop.js)
   → Muse Voice Transcribe: voice note → text (muse.js)
   → Muse Spark: read board + transcript → structured entry with confidence flags (muse.js)
   → teacher reviews / signs → headmaster countersigns → open .tdx record
   (Gemini = fallback if a Meta call fails or a limit is reached)
```

## Integration with TeacherDox

TeacherDox (private) calls `gemini.generate(body, { timeout, user })` from:
- `ai.js` → `generateDiaryEntry`, `transcribeAudio`
- `canvas.js` → live-diary batch call (most important)
- `agent.js` → scheduled briefs

This repo provides a **drop-in router** at the `gemini.generate` boundary:
- `AI_BACKEND=meta|gemini` (default `gemini`)
- Translates Gemini-shaped request → Meta request → Gemini-shaped response
- On any Meta error/timeout → logs once, falls back to Gemini
- Records which backend/model produced each entry

## Environment variables

```bash
AI_BACKEND=gemini          # or "meta"
META_API_KEY=              # Meta Model API key (dev.meta.ai)
META_MODEL_CHAT=           # optional override
META_MODEL_VISION=         # optional override
META_MODEL_TRANSCRIBE=     # optional override
META_AI_PHONES=            # allow-list for Meta backend (privacy: free credits = content may be used for improvement)
GEMINI_API_KEY=            # existing
GEMINI_DAILY_LIMIT=500     # reused/mirrored for Meta
```

## Privacy

Default `AI_BACKEND=gemini` for real teachers. Meta backend only for demo/test accounts and consenting teachers (via `META_AI_PHONES`). Evaluation set uses consented data only.

## Hackathon timeline

| Date (IST) | Goal |
|---|---|
| Tue Oct 27 | `muse.js` + router, first Meta call; public repo created |
| Wed Oct 28 | Board photo → entry on Muse Spark; fallback works |
| Thu Oct 29 | Muse Voice Transcribe; Malayalam replies |
| Fri Oct 30 | SAM 3.1 board crop; Telugu/Hindi checks |
| Sat Oct 31 | Evaluation harness + results table |
| Sun Nov 1 | Polish, logs/admin view, edge cases |
| Mon Nov 2 | Public repo README, write-up, demo footage |
| Tue Nov 3 | Demo video edit, final tests |
| Wed Nov 4 | Submit (evening IST) |

## License

MIT — open for the hackathon submission.
