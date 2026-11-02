# Evaluation Test Data

Place your test case JSON files here. Each file should be named `tc-XXX.json` and contain a single test case object.

## Test Case Format

```json
{
  "id": "tc-001",
  "type": "photo|voice|photo+voice",
  "language": "en|ml|te|hi",
  "base64Image": "base64-encoded-image-data",
  "imageMimeType": "image/jpeg|image/png",
  "base64Audio": "base64-encoded-audio-data",
  "audioMimeType": "audio/ogg|audio/opus",
  "expected": {
    "topic": "Topic name",
    "summary": "Lesson summary",
    "method": "Teaching method",
    "attendance": "42/45",
    "homework": "Homework assigned",
    "carryForward": "Next class plan"
  }
}
```

## Generating Base64

### From image file:
```bash
# Linux/macOS
base64 -i photo.jpg

# Windows PowerShell
[Convert]::ToBase64String([IO.File]::ReadAllBytes("photo.jpg"))
```

### From audio file:
```bash
# Linux/macOS
base64 -i voice.ogg

# Windows PowerShell
[Convert]::ToBase64String([IO.File]::ReadAllBytes("voice.ogg"))
```

## Privacy

- Only use **consented** teacher data for evaluation
- Do NOT commit real base64 data to the repo
- Add `eval/data/*.json` to `.gitignore` (already configured)
- For hackathon demo, use the sample data or a small consented subset

## Running Evaluation

```bash
# With real data in eval/data/
npm run eval

# With just inline samples (no API keys needed - uses gemini.js stub)
npm run eval
```