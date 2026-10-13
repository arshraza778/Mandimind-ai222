"""
Configurable AI Provider & Cloud TTS Adapter for Mitanin Signal (Mitanin Sahayak).
Reads configuration strictly from environment variables (or root .env file).
Never exposes API keys in responses, logs, or frontend payloads.
"""

from __future__ import annotations

import json
import os
import urllib.error
import urllib.request
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple


def _load_dotenv_if_present(override: bool = False) -> None:
    """Loads key=value pairs from root .env into os.environ."""
    root_dir = Path(__file__).resolve().parent.parent.parent
    dotenv_path = root_dir / ".env"
    if not dotenv_path.exists():
        return
    try:
        for raw_line in dotenv_path.read_text(encoding="utf-8").splitlines():
            line = raw_line.strip()
            if not line or line.startswith("#") or "=" not in line:
                continue
            key, val = line.split("=", 1)
            key = key.strip()
            val = val.strip().strip('"').strip("'")
            if key and (override or key not in os.environ):
                os.environ[key] = val
    except Exception:
        pass


_load_dotenv_if_present()


def get_ai_env_config() -> Dict[str, Any]:
    """Reads live AI provider and TTS settings from environment variables (and reloads .env)."""
    _load_dotenv_if_present(override=True)
    provider = (os.getenv("CHATBOT_PROVIDER") or "gemini").strip().lower()
    api_key = (os.getenv("CHATBOT_API_KEY") or "").strip()
    model = (os.getenv("CHATBOT_MODEL") or "gemini-2.5-flash").strip()
    base_url = (os.getenv("CHATBOT_BASE_URL") or "").strip()

    # Smart auto-routing based on standard API key prefixes so pasting any key into CHATBOT_API_KEY just works
    if api_key.startswith("gsk_"):
        provider = "openai_compatible"
        if "gemini" in model:
            model = "llama-3.3-70b-versatile"
        if not base_url or "googleapis.com" in base_url:
            base_url = "https://api.groq.com/openai/v1/chat/completions"
    elif api_key.startswith("AIza"):
        provider = "gemini"
        if "gemini" not in model:
            model = "gemini-2.5-flash"
        if not base_url or "groq.com" in base_url or "aiplatform.googleapis.com" in base_url:
            base_url = "https://generativelanguage.googleapis.com/v1beta"
    elif api_key.startswith("sk-ant-"):
        provider = "anthropic"
        if "claude" not in model:
            model = "claude-3-5-sonnet-latest"

    try:
        timeout_seconds = float(os.getenv("CHATBOT_TIMEOUT_SECONDS") or "25")
    except ValueError:
        timeout_seconds = 25.0

    try:
        rate_limit_per_minute = int(os.getenv("CHATBOT_RATE_LIMIT_PER_MINUTE") or "30")
    except ValueError:
        rate_limit_per_minute = 30

    tts_provider = (os.getenv("TTS_PROVIDER") or "none").strip().lower()
    tts_api_key = (os.getenv("TTS_API_KEY") or "").strip()
    tts_base_url = (os.getenv("TTS_BASE_URL") or "").strip()
    tts_voice_en = (os.getenv("TTS_VOICE_EN") or "en-IN-Standard-A").strip()
    tts_voice_hi = (os.getenv("TTS_VOICE_HI") or "hi-IN-Standard-A").strip()
    tts_voice_hne = (os.getenv("TTS_VOICE_HNE") or "").strip()

    return {
        "provider": provider,
        "api_key": api_key,
        "model": model,
        "base_url": base_url,
        "timeout_seconds": max(3.0, min(timeout_seconds, 120.0)),
        "rate_limit_per_minute": max(1, rate_limit_per_minute),
        "tts_provider": tts_provider,
        "tts_api_key": tts_api_key,
        "tts_base_url": tts_base_url,
        "tts_voice_en": tts_voice_en,
        "tts_voice_hi": tts_voice_hi,
        "tts_voice_hne": tts_voice_hne,
    }


def get_public_chatbot_config() -> Dict[str, Any]:
    """
    Returns safe configuration metadata for the frontend.
    NEVER includes CHATBOT_API_KEY or TTS_API_KEY.
    """
    cfg = get_ai_env_config()
    api_key_configured = bool(cfg["api_key"])
    tts_hne_cloud_configured = bool(
        cfg["tts_provider"] not in ("", "none")
        and cfg["tts_api_key"]
        and cfg["tts_voice_hne"]
    )

    if api_key_configured:
        status_message = {
            "en": f"Connected to {cfg['provider'].upper()} ({cfg['model']}) with grounded Mitanin Signal retrieval.",
            "hi": f"ग्राउंडेड मितानिन सिग्नल डेटा के साथ {cfg['provider'].upper()} ({cfg['model']}) से जुड़ा है।",
            "hne": f"मितानीन सिग्नल के असली डेटा संग {cfg['provider'].upper()} ({cfg['model']}) ले जुड़े हावय।",
        }
    else:
        status_message = {
            "en": (
                "AI provider API key (CHATBOT_API_KEY) is not configured yet in .env. "
                "Operating in Grounded Local Health & Task Mode using verified application records."
            ),
            "hi": (
                "एआई प्रदाता एपीआई कुंजी (CHATBOT_API_KEY) अभी .env में कॉन्फ़िगर नहीं है। "
                "सत्यापित एप्लिकेशन रिकॉर्ड का उपयोग करके ग्राउंडेड लोकल सहायता मोड में कार्यरत है।"
            ),
            "hne": (
                "एआई मॉडल के एपीआई चाबी (CHATBOT_API_KEY) अभो .env मं नइ डलाय हे। "
                "अभी ऐप के असली सरकारी-स्वास्थ्य अउ बूता रिकॉर्ड ले सीधा जवाब दे जावत हे।"
            ),
        }

    return {
        "chatbot_name": "Mitanin Sahayak",
        "supported_languages": [
            {"code": "en", "name": "English", "native_name": "English"},
            {"code": "hi", "name": "Hindi", "native_name": "हिन्दी"},
            {"code": "hne", "name": "Chhattisgarhi", "native_name": "छत्तीसगढ़ी"},
        ],
        "provider": cfg["provider"],
        "model": cfg["model"],
        "api_key_configured": api_key_configured,
        "grounded_retrieval_enabled": True,
        "rate_limit_per_minute": cfg["rate_limit_per_minute"],
        "timeout_seconds": cfg["timeout_seconds"],
        "status_message": status_message,
        "tts": {
            "provider": cfg["tts_provider"],
            "cloud_tts_configured": bool(cfg["tts_provider"] not in ("", "none") and cfg["tts_api_key"]),
            "hne_cloud_voice_available": tts_hne_cloud_configured,
            "honesty_policy": (
                "Browser Web Speech API is used when a matching locale voice is installed. "
                "Hindi voices (hi-IN) are never labeled as Chhattisgarhi (hne)."
            ),
        },
    }


def call_configured_llm(
    system_prompt: str,
    user_message: str,
    history: Optional[List[Dict[str, str]]] = None,
) -> Tuple[Optional[str], str, Optional[str]]:
    """
    Calls the configured external LLM provider if CHATBOT_API_KEY is present.
    Returns (response_text, provider_status, error_detail).
    provider_status values:
      - "llm_success": external model responded
      - "missing_api_key": CHATBOT_API_KEY is empty
      - "provider_error": network/HTTP/timeout error from external provider
      - "unsupported_provider": CHATBOT_PROVIDER not recognized
    """
    cfg = get_ai_env_config()
    api_key = cfg["api_key"]
    provider = cfg["provider"]
    model = cfg["model"]
    timeout = cfg["timeout_seconds"]

    if not api_key:
        return None, "missing_api_key", "CHATBOT_API_KEY is not configured in environment."

    history = history or []

    try:
        if provider == "gemini" or (api_key.startswith("AQ.") and "groq.com" not in (cfg["base_url"] or "")):
            gemini_model = model if "gemini" in model else "gemini-2.5-flash"
            contents = []
            for turn in history[-8:]:
                role = "model" if turn.get("role") == "assistant" else "user"
                contents.append({"role": role, "parts": [{"text": turn.get("content", "")}]})
            contents.append({"role": "user", "parts": [{"text": user_message}]})
            payload = {
                "systemInstruction": {"parts": [{"text": system_prompt}]},
                "contents": contents,
                "generationConfig": {"temperature": 0.25, "maxOutputTokens": 900},
            }
            candidate_bases = []
            if cfg["base_url"] and "googleapis.com" in cfg["base_url"]:
                candidate_bases.append(cfg["base_url"].rstrip("/"))
            if api_key.startswith("AQ."):
                candidate_bases.append("https://aiplatform.googleapis.com/v1/publishers/google")
                candidate_bases.append("https://generativelanguage.googleapis.com/v1beta")
            else:
                candidate_bases.append("https://generativelanguage.googleapis.com/v1beta")
                candidate_bases.append("https://aiplatform.googleapis.com/v1/publishers/google")

            last_err = None
            for base in candidate_bases:
                url = f"{base}/models/{gemini_model}:generateContent?key={api_key}"
                req = urllib.request.Request(
                    url,
                    data=json.dumps(payload).encode("utf-8"),
                    headers={
                        "Content-Type": "application/json",
                        "User-Agent": "MitaninSignal/1.0",
                    },
                    method="POST",
                )
                try:
                    with urllib.request.urlopen(req, timeout=timeout) as resp:
                        data = json.loads(resp.read().decode("utf-8"))
                    candidates = data.get("candidates") or []
                    if candidates:
                        parts = candidates[0].get("content", {}).get("parts") or []
                        text_out = "".join(p.get("text", "") for p in parts).strip()
                        if text_out:
                            return text_out, "llm_success", None
                except Exception as exc:
                    last_err = exc
                    continue
            if last_err:
                raise last_err
            return None, "provider_error", "Empty response from Gemini API."

        elif provider in ("openai", "openai_compatible"):
            base = (cfg["base_url"] or "https://api.openai.com/v1").rstrip("/")
            url = base if base.endswith("/chat/completions") else f"{base}/chat/completions"
            messages = [{"role": "system", "content": system_prompt}]
            for turn in history[-8:]:
                messages.append({
                    "role": "assistant" if turn.get("role") == "assistant" else "user",
                    "content": turn.get("content", ""),
                })
            messages.append({"role": "user", "content": user_message})
            payload = {
                "model": model,
                "messages": messages,
                "temperature": 0.25,
                "max_tokens": 900,
            }
            req = urllib.request.Request(
                url,
                data=json.dumps(payload).encode("utf-8"),
                headers={
                    "Content-Type": "application/json",
                    "Authorization": f"Bearer {api_key}",
                    "User-Agent": "MitaninSignal/1.0",
                },
                method="POST",
            )
            try:
                with urllib.request.urlopen(req, timeout=timeout) as resp:
                    data = json.loads(resp.read().decode("utf-8"))
                choices = data.get("choices") or []
                if choices:
                    text_out = (choices[0].get("message", {}).get("content") or "").strip()
                    if text_out:
                        return text_out, "llm_success", None
            except urllib.error.HTTPError as http_exc:
                # If the user pasted a Google Vertex/Gemini key (AQ.*) while leaving Groq URL in .env, try Google Vertex/Gemini endpoint automatically
                if api_key.startswith("AQ."):
                    for g_base in (
                        "https://aiplatform.googleapis.com/v1/publishers/google",
                        "https://generativelanguage.googleapis.com/v1beta",
                    ):
                        g_url = f"{g_base}/models/gemini-2.5-flash:generateContent?key={api_key}"
                        g_contents = []
                        for turn in history[-8:]:
                            g_role = "model" if turn.get("role") == "assistant" else "user"
                            g_contents.append({"role": g_role, "parts": [{"text": turn.get("content", "")}]})
                        g_contents.append({"role": "user", "parts": [{"text": user_message}]})
                        g_payload = {
                            "systemInstruction": {"parts": [{"text": system_prompt}]},
                            "contents": g_contents,
                            "generationConfig": {"temperature": 0.25, "maxOutputTokens": 900},
                        }
                        g_req = urllib.request.Request(
                            g_url,
                            data=json.dumps(g_payload).encode("utf-8"),
                            headers={
                                "Content-Type": "application/json",
                                "User-Agent": "MitaninSignal/1.0",
                            },
                            method="POST",
                        )
                        try:
                            with urllib.request.urlopen(g_req, timeout=timeout) as g_resp:
                                g_data = json.loads(g_resp.read().decode("utf-8"))
                            g_cands = g_data.get("candidates") or []
                            if g_cands:
                                g_parts = g_cands[0].get("content", {}).get("parts") or []
                                g_text = "".join(p.get("text", "") for p in g_parts).strip()
                                if g_text:
                                    return g_text, "llm_success", None
                        except Exception:
                            continue
                raise http_exc
            return None, "provider_error", "Empty response from OpenAI-compatible API."

        elif provider == "anthropic":
            base = (cfg["base_url"] or "https://api.anthropic.com/v1").rstrip("/")
            url = base if base.endswith("/messages") else f"{base}/messages"
            messages = []
            for turn in history[-8:]:
                messages.append({
                    "role": "assistant" if turn.get("role") == "assistant" else "user",
                    "content": turn.get("content", ""),
                })
            messages.append({"role": "user", "content": user_message})
            payload = {
                "model": model,
                "max_tokens": 900,
                "system": system_prompt,
                "messages": messages,
            }
            req = urllib.request.Request(
                url,
                data=json.dumps(payload).encode("utf-8"),
                headers={
                    "Content-Type": "application/json",
                    "x-api-key": api_key,
                    "anthropic-version": "2023-06-01",
                    "User-Agent": "MitaninSignal/1.0",
                },
                method="POST",
            )
            with urllib.request.urlopen(req, timeout=timeout) as resp:
                data = json.loads(resp.read().decode("utf-8"))
            content_blocks = data.get("content") or []
            text_out = "".join(b.get("text", "") for b in content_blocks if b.get("type") == "text").strip()
            if text_out:
                return text_out, "llm_success", None
            return None, "provider_error", "Empty response from Anthropic API."

        else:
            return (
                None,
                "unsupported_provider",
                f"Provider '{provider}' is not supported. Use 'gemini', 'openai', 'anthropic', or 'openai_compatible'.",
            )

    except urllib.error.HTTPError as exc:
        return None, "provider_error", f"Provider HTTP {exc.code} error from {provider}."
    except urllib.error.URLError as exc:
        return None, "provider_error", f"Network/timeout error connecting to {provider}: {exc.reason}"
    except Exception as exc:
        return None, "provider_error", f"Unexpected provider error ({type(exc).__name__})."


def _split_text_for_tts(text: str, max_chars: int = 165) -> List[str]:
    """Splits text into natural sentence/phrase chunks <= max_chars for server-side TTS."""
    import re as _re
    cleaned = _re.sub(r"\*\*|__|\*|#", "", text or "").strip()
    if not cleaned:
        return []
    raw_parts = _re.split(r"(?<=[।.!?;\n])\s+", cleaned)
    chunks: List[str] = []
    for part in raw_parts:
        part = part.strip()
        if not part:
            continue
        while len(part) > max_chars:
            split_idx = part.rfind(" ", 0, max_chars)
            if split_idx <= 20:
                split_idx = max_chars
            chunks.append(part[:split_idx].strip())
            part = part[split_idx:].strip()
        if part:
            chunks.append(part)
    return chunks[:10]


def _synthesize_builtin_server_tts(text: str, language: str) -> Optional[str]:
    """
    Synthesizes MP3 audio server-side for English ('en'), Hindi ('hi'), or
    Devanagari-script Chhattisgarhi ('hne') text without requiring an external API key.
    Returns base64-encoded MP3 bytes or None if offline.
    """
    import base64
    import urllib.parse

    chunks = _split_text_for_tts(text)
    if not chunks:
        return None

    # Chhattisgarhi (hne) and Hindi (hi) both use Devanagari script; 'hi' phonetic engine reads Devanagari
    tl = "en" if language == "en" else "hi"
    mp3_buffers: List[bytes] = []

    for chunk in chunks:
        q = urllib.parse.quote(chunk)
        url = f"https://translate.googleapis.com/translate_tts?ie=UTF-8&client=tw-ob&tl={tl}&q={q}"
        req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0"})
        try:
            with urllib.request.urlopen(req, timeout=8.0) as resp:
                audio_bytes = resp.read()
                if audio_bytes:
                    mp3_buffers.append(audio_bytes)
        except Exception:
            return None

    if not mp3_buffers:
        return None
    return base64.b64encode(b"".join(mp3_buffers)).decode("ascii")


def synthesize_cloud_tts(text: str, language: str, speed: float = 1.0) -> Dict[str, Any]:
    """
    Synthesizes speech via configured Cloud TTS or built-in Server-Side Devanagari/English TTS.
    Strictly enforces Chhattisgarhi (hne) voice honesty:
    - Never claims a Devanagari/Hindi acoustic model is a native Chhattisgarhi (hne) voice
      (`native_hne_voice: False`).
    - Speaks the authentic Chhattisgarhi (`hne`) text aloud while explicitly disclosing the
      phonetic voice engine used.
    """
    cfg = get_ai_env_config()
    provider = cfg["tts_provider"]
    api_key = cfg["tts_api_key"]

    honesty_notice = {
        "en": (
            "Speaking Chhattisgarhi (hne) task text aloud using the Server Devanagari Phonetic TTS engine "
            "(a separate native hne acoustic voice model is not installed; Devanagari engine is disclosed transparently and never mislabeled as a native hne voice)."
        ),
        "hi": (
            "छत्तीसगढ़ी (hne) कार्य निर्देश को सर्वर देवनागरी फोनेटिक टीटीएस इंजन से पढ़ा जा रहा है "
            "(अलग नेटिव छत्तीसगढ़ी ध्वनि मॉडल स्थापित नहीं है; इसे पारदर्शी रूप से देवनागरी इंजन के रूप में दर्शाया गया है)।"
        ),
        "hne": (
            "छत्तीसगढ़ी (hne) भाखा के बूता ला सर्वर देवनागरी आवाज इंजन ले पढ़के सुनाय जावत हे "
            "(अलग नेटिव hne आवाज मॉडल नइ हे, तेकर सेती एला साफ-साफ देवनागरी इंजन बताय जावत हे)।"
        ),
    }

    # 1. If Google Cloud TTS is explicitly configured with an API key and voice
    voice_name = (
        cfg["tts_voice_hne"]
        if language == "hne"
        else (cfg["tts_voice_hi"] if language == "hi" else cfg["tts_voice_en"])
    )
    lang_code = "hne-IN" if language == "hne" else ("hi-IN" if language == "hi" else "en-IN")

    if provider == "google_cloud_tts" and api_key and (language != "hne" or cfg["tts_voice_hne"]):
        try:
            url = cfg["tts_base_url"] or f"https://texttospeech.googleapis.com/v1/text:synthesize?key={api_key}"
            payload = {
                "input": {"text": text},
                "voice": {"languageCode": lang_code, "name": voice_name},
                "audioConfig": {"audioEncoding": "MP3", "speakingRate": speed},
            }
            req = urllib.request.Request(
                url,
                data=json.dumps(payload).encode("utf-8"),
                headers={"Content-Type": "application/json"},
                method="POST",
            )
            with urllib.request.urlopen(req, timeout=12.0) as resp:
                data = json.loads(resp.read().decode("utf-8"))
            audio_content = data.get("audioContent")
            if audio_content:
                return {
                    "available": True,
                    "language": language,
                    "native_hne_voice": bool(language == "hne" and cfg["tts_voice_hne"]),
                    "voice_name": voice_name,
                    "provider": provider,
                    "mime_type": "audio/mp3",
                    "audio_base64": audio_content,
                    "honesty_notice": honesty_notice if language == "hne" else None,
                }
        except Exception:
            pass

    # 2. Built-in Server-Side TTS synthesis (works out-of-the-box without requiring a paid Cloud TTS key)
    builtin_b64 = _synthesize_builtin_server_tts(text, language)
    if builtin_b64:
        if language == "hne":
            v_label = "छत्तीसगढ़ी पाठ · Server Devanagari TTS (Phonetic Engine — Not Native hne Voice)"
        elif language == "hi":
            v_label = "हिन्दी (Server Devanagari TTS — hi-IN)"
        else:
            v_label = "English (Server TTS — en-IN)"
        return {
            "available": True,
            "language": language,
            "native_hne_voice": False,
            "voice_name": v_label,
            "provider": "server_devanagari_tts",
            "mime_type": "audio/mp3",
            "audio_base64": builtin_b64,
            "honesty_notice": honesty_notice if language == "hne" else None,
        }

    # 3. Offline fallback if no internet connection is available for server-side TTS
    return {
        "available": False,
        "language": language,
        "native_hne_voice": False,
        "provider": provider or "none",
        "audio_base64": None,
        "honesty_notice": honesty_notice,
    }

