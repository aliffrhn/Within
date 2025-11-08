# Whisper Web Transcriber

Small Flask web app that wraps [openai/whisper](https://github.com/openai/whisper) so you can upload an audio file and read the generated transcript in the browser.

## Requirements

- Python 3.10+
- `ffmpeg` (required by Whisper for audio decoding)
- A CPU/GPU capable of running the chosen Whisper model (default: `base`)

## Setup

```bash
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
```

## Running the dev server

```bash
# optional; override if you want a different checkpoint than the default large-v3
export WHISPER_MODEL=large-v3
# optional; set a fixed language (ISO code or spelled-out). Default is Indonesian.
export WHISPER_LANGUAGE=indonesian
python app.py
```

Then open http://localhost:5000 and drop an audio file (`.mp3`, `.wav`, `.m4a`, `.flac`, `.ogg`, `.webm`). Use the language dropdown (Auto, English, Bahasa Indonesia) before submitting if you want to bypass auto-detection. The server streams the file to Whisper, returns the transcript, and the UI shows the full text plus optional time-coded segments.

## Notes

- The server limits uploads to ~40 MB. Adjust `app.config["MAX_CONTENT_LENGTH"]` in `app.py` for bigger files.
- If you run on CPU-only hardware, forcing `fp16=False` keeps the app compatible. For GPUs, remove that flag to enable faster FP16 inference.
- Whisper downloads model weights on first run; keep an internet connection the first time you launch. The default `large-v3` checkpoint provides the highest accuracy but needs a strong GPU (or patience on CPU); switch to `small`/`base` in `WHISPER_MODEL` if resources are limited. Use `WHISPER_LANGUAGE` to preselect the server-side default language (the browser dropdown can still override it per request).
