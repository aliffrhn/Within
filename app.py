import json
import logging
import os
import tempfile
from pathlib import Path
from typing import Dict, List, Optional, Tuple

import requests
import whisper
from flask import Flask, jsonify, render_template, request

logging.basicConfig(level=logging.INFO)

app = Flask(__name__)
app.config["MAX_CONTENT_LENGTH"] = 40 * 1024 * 1024  # 40 MB upload limit
ALLOWED_EXTENSIONS = {".mp3", ".wav", ".m4a", ".flac", ".ogg", ".webm"}

MODEL_CHOICES_ENV = os.environ.get("WHISPER_MODELS")
if MODEL_CHOICES_ENV:
    MODEL_CHOICES = [item.strip() for item in MODEL_CHOICES_ENV.split(",") if item.strip()]
else:
    MODEL_CHOICES = [
        "tiny",
        "base",
        "small",
        "medium",
        "large-v2",
        "large-v3",
    ]

RECOMMENDED_MODEL = os.environ.get("WHISPER_RECOMMENDED_MODEL", "medium")
DEFAULT_MODEL = os.environ.get("WHISPER_MODEL")
if not DEFAULT_MODEL:
    DEFAULT_MODEL = RECOMMENDED_MODEL if RECOMMENDED_MODEL in MODEL_CHOICES else MODEL_CHOICES[-1]
if DEFAULT_MODEL not in MODEL_CHOICES:
    MODEL_CHOICES.append(DEFAULT_MODEL)

MODEL_DESCRIPTIONS = {
    "tiny": "Fastest speed · lowest accuracy",
    "base": "Very fast speed · moderate accuracy",
    "small": "Fast speed · good accuracy",
    "medium": "Moderate speed · high accuracy",
    "large-v2": "Slow speed · very high accuracy",
    "large-v3": "Slowest speed · highest accuracy",
}

DEFAULT_LANGUAGE = os.environ.get("WHISPER_LANGUAGE")
_MODEL_CACHE: Dict[str, whisper.Whisper] = {}

DEFAULT_OPENAI_MODEL = os.environ.get("OPENAI_SUMMARY_MODEL", "gpt-4o-mini")
DEFAULT_OPENAI_KEY = os.environ.get("OPENAI_API_KEY")
OPENAI_BASE_URL = os.environ.get("OPENAI_API_BASE", "https://api.openai.com/v1").rstrip("/")


def get_model(model_name: str):
    if model_name not in _MODEL_CACHE:
        app.logger.info("Loading Whisper model '%s'…", model_name)
        _MODEL_CACHE[model_name] = whisper.load_model(model_name)
        app.logger.info("Whisper model '%s' ready", model_name)
    return _MODEL_CACHE[model_name]


def summarize_transcript(text: str, api_key: str, language: Optional[str]) -> Tuple[Optional[str], Optional[str]]:
    if not api_key:
        return None, "Add an OpenAI API key to generate a summary."
    transcript = text.strip()
    if not transcript:
        return None, "Transcript is empty, nothing to summarize."

    endpoint = f"{OPENAI_BASE_URL}/chat/completions"
    payload = {
        "model": DEFAULT_OPENAI_MODEL,
        "temperature": 0.4,
        "max_tokens": 320,
        "messages": [
            {
                "role": "system",
                "content": (
                    "You are an intelligent assistant that turns meeting transcripts into concise summaries. "
                    "Your goal is to capture the essence of the discussion in a few clear sentences or bullet points.\n\n"
                    "Analyze the transcript and write a summary that includes: main topics discussed, important insights or updates, key decisions or agreements (if any), and next steps or follow-up notes (only if mentioned).\n\n"
                    "Guidelines: keep it short, neutral, and easy to skim; avoid unnecessary details or greetings; if something is unclear, summarize what’s understood instead of guessing; write in plain, natural language.\n\n"
                    "Output format: summarize meeting with no title or intro."
                ),
            },
            {
                "role": "user",
                "content": (
                    "Meeting language: {lang}\n"
                    "Provide a concise summary (sentences or bullet points as appropriate) for this transcript:\n\n{transcript}"
                ).format(lang=language or "auto", transcript=transcript),
            },
        ],
    }

    try:
        response = requests.post(
            endpoint,
            json=payload,
            headers={"Authorization": f"Bearer {api_key}"},
            timeout=60,
        )
        response.raise_for_status()
        try:
            data = response.json()
        except ValueError as exc:  # pragma: no cover - network guard
            app.logger.exception("Failed to parse OpenAI response: %s", exc)
            return None, "OpenAI response could not be parsed."
        choices = data.get("choices") or []
        if not choices:
            return None, "OpenAI response did not contain choices."
        summary = choices[0].get("message", {}).get("content", "").strip()
        if not summary:
            return None, "OpenAI response did not include text."
        return summary, None
    except requests.RequestException as exc:
        app.logger.exception("Summary generation failed: %s", exc)
        return None, str(exc)

def allowed_file(filename: str) -> bool:
    return Path(filename).suffix.lower() in ALLOWED_EXTENSIONS

@app.route("/")
def index():
    recommended_model = RECOMMENDED_MODEL if RECOMMENDED_MODEL in MODEL_CHOICES else None
    selected_model = recommended_model or DEFAULT_MODEL
    selected_model_description = MODEL_DESCRIPTIONS.get(selected_model, "Balanced performance")
    model_options = []
    for model_name in MODEL_CHOICES:
        description = MODEL_DESCRIPTIONS.get(model_name, "Balanced performance")
        pretty_name = model_name.replace("-", " ").title()
        label = f"{pretty_name} · {description}"
        display_label = label
        model_options.append(
            {
                "value": model_name,
                "label": display_label,
                "description": description,
                "is_recommended": model_name == RECOMMENDED_MODEL,
            }
        )
    return render_template(
        "index.html",
        model_choices=MODEL_CHOICES,
        model_options=model_options,
        selected_model=selected_model,
        selected_model_description=selected_model_description,
        has_default_openai=bool(DEFAULT_OPENAI_KEY),
    )

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

    model_name = (request.form.get("model") or DEFAULT_MODEL).strip()
    if model_name not in MODEL_CHOICES:
        return jsonify({"error": f"Unsupported model '{model_name}'"}), 400

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
        app.logger.info("Starting transcription for %s with %s", upload.filename, model_name)
        model = get_model(model_name)
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


@app.post("/summarize")
def summarize():
    payload = request.get_json(silent=True) or {}
    transcript_text = (payload.get("text") or "").strip()
    language = payload.get("language")
    provided_api_key = (payload.get("openai_api_key") or "").strip()
    summary_api_key = provided_api_key or (DEFAULT_OPENAI_KEY or "")

    summary_text, summary_error = summarize_transcript(transcript_text, summary_api_key, language)

    if summary_text:
        return jsonify({"summary": summary_text, "summary_model": DEFAULT_OPENAI_MODEL})

    error_message = summary_error or "Unable to create a summary."
    return jsonify({"error": error_message}), 400


if __name__ == "__main__":
    debug = os.environ.get("FLASK_DEBUG", "0") == "1"
    app.run(host="0.0.0.0", port=int(os.environ.get("PORT", 5000)), debug=debug)
