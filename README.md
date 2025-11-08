# Recall

Recall is a lightweight meeting-transcript workspace: drop any recording in the browser, choose the Whisper checkpoint that fits your hardware, and get polished text with timestamps in one go. Everything runs locally on your machine—audio files are deleted as soon as transcription finishes.

## Highlights

- **Private-by-default** – uploads are written to a temp file, processed with Whisper, then removed immediately.
- **Model picker** – switch between tiny/fast checkpoints and large/high-accuracy ones without redeploying.
- **Language hints** – auto-detect by default, with quick overrides for English and Bahasa Indonesia (extendable).
- **Segment view** – inspect timestamped chunks for rapid skim-throughs or editing.
- **Progress feedback** – see a live status bar while uploads/transcriptions complete.

## Requirements

- macOS / Linux / Windows with Python 3.10+
- `ffmpeg` on your `$PATH` (Whisper uses it to decode audio)
- CPU or GPU VRAM capable of running the chosen Whisper model (defaults to `large-v3`; swap to `base`/`small` if needed)
- First run needs internet access so Whisper can download weights

## Setup

```bash
python3 -m venv .venv
source .venv/bin/activate          # Windows: .venv\Scripts\activate
pip install -r requirements.txt
```

## Running Recall locally

```bash
# Optional overrides before launching
export WHISPER_MODEL=medium        # default: large-v3
export WHISPER_LANGUAGE=en         # default: auto
export PORT=5050                   # default: 5000

python app.py
```

Then visit `http://localhost:<PORT>` (e.g., `http://localhost:5050`) and:

1. Upload a meeting recording (`.mp3`, `.wav`, `.m4a`, `.flac`, `.ogg`, `.webm`, up to ~40 MB).
2. Optionally pick the language and Whisper model in the form.
3. Watch the progress indicator; once complete, the transcript plus per-segment timestamps appear instantly.
4. Copy or download the text—nothing is stored server-side after the page refreshes.

## Environment knobs

| Variable | Purpose | Notes |
| --- | --- | --- |
| `WHISPER_MODEL` | Default checkpoint | Any model from `WHISPER_MODELS` list |
| `WHISPER_MODELS` | Comma-delimited allowlist | Example: `tiny,base,small,medium,large-v2` |
| `WHISPER_LANGUAGE` | Default language hint | Use ISO codes (`en`, `id`) or spelled-out names |
| `PORT` | Flask port | Defaults to `5000` |

These values populate the UI dropdowns so end users can still override them per upload.

## Notes & tips

- Upload limit is 40 MB (`app.config["MAX_CONTENT_LENGTH"]`); raise it if you need longer calls.
- On CPU-only hardware, `fp16=False` keeps things stable. If you have a GPU with FP16 support, you can enable mixed precision in `app.py` for faster runs.
- The first time you choose a new Whisper model, the weights download (~1 GB for base, ~3 GB for large). Subsequent runs reuse the cached files.
- If you extend the UI with more languages or models, remember to update both `WHISPER_MODELS` (backend) and the dropdown labels (frontend).
