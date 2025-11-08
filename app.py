import logging
import os
import tempfile
from pathlib import Path
from typing import Dict, List

import whisper
from flask import Flask, jsonify, render_template, request

logging.basicConfig(level=logging.INFO)

app = Flask(__name__)
app.config["MAX_CONTENT_LENGTH"] = 40 * 1024 * 1024  # 40 MB upload limit
ALLOWED_EXTENSIONS = {".mp3", ".wav", ".m4a", ".flac", ".ogg", ".webm"}

MODEL_NAME = os.environ.get("WHISPER_MODEL", "large-v3")
DEFAULT_LANGUAGE = os.environ.get("WHISPER_LANGUAGE")
_MODEL = None

def get_model():
    global _MODEL
    if _MODEL is None:
        app.logger.info("Loading Whisper model '%s'…", MODEL_NAME)
        _MODEL = whisper.load_model(MODEL_NAME)
        app.logger.info("Whisper model '%s' ready", MODEL_NAME)
    return _MODEL

def allowed_file(filename: str) -> bool:
    return Path(filename).suffix.lower() in ALLOWED_EXTENSIONS

@app.route("/")
def index():
    return render_template("index.html")

@app.post("/transcribe")
def transcribe():
    if "audio" not in request.files:
        return jsonify({"error": "No audio file provided"}), 400

    upload = request.files["audio"]

    if upload.filename == "":
        return jsonify({"error": "Empty filename"}), 400

    if not allowed_file(upload.filename):
        return jsonify({"error": "Unsupported file type"}), 400

    suffix = Path(upload.filename).suffix
    with tempfile.NamedTemporaryFile(delete=False, suffix=suffix) as tmp:
        upload.save(tmp)
        tmp_path = tmp.name

    language = request.form.get("language") or DEFAULT_LANGUAGE
    if language:
        language = language.strip().lower()
        if language in {"auto", "default"}:
            language = None
        elif language in {"id", "indo", "bahasa"}:
            language = "indonesian"
        elif language in {"en", "eng"}:
            language = "english"

    try:
        app.logger.info("Starting transcription for %s with %s", upload.filename, MODEL_NAME)
        model = get_model()
        transcribe_kwargs = dict(fp16=False, verbose=True)
        if language:
            transcribe_kwargs["language"] = language
            app.logger.info("Using language override: %s", language)
        result: Dict = model.transcribe(tmp_path, **transcribe_kwargs)
        app.logger.info("Completed transcription for %s", upload.filename)
    except Exception as exc:  # pragma: no cover - runtime guard
        return jsonify({"error": str(exc)}), 500
    finally:
        Path(tmp_path).unlink(missing_ok=True)

    segments: List[Dict] = [
        {
            "start": round(segment["start"], 2),
            "end": round(segment["end"], 2),
            "text": segment["text"].strip(),
        }
        for segment in result.get("segments", [])
    ]

    return jsonify(
        {
            "text": result.get("text", "").strip(),
            "language": result.get("language"),
            "segments": segments,
        }
    )


if __name__ == "__main__":
    debug = os.environ.get("FLASK_DEBUG", "0") == "1"
    app.run(host="0.0.0.0", port=int(os.environ.get("PORT", 5000)), debug=debug)
