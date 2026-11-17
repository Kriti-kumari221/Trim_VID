import json
import os
import re

import requests

# Model names change over time. Check AI Studio for the current Flash model
# and override with the GEMINI_MODEL env var if this one is retired.
GEMINI_MODEL = os.getenv("GEMINI_MODEL", "gemini-2.5-flash")


def _session() -> requests.Session:
    s = requests.Session()
    # Same local-only SSL workaround as the YouTube code
    if os.getenv("YT_INSECURE_SSL") == "1":
        import urllib3
        urllib3.disable_warnings()
        s.verify = False
    return s


def gemini_json(prompt: str, api_key: str | None = None, system: str | None = None,
                model: str | None = None, temperature: float = 0.7):
    """Call Gemini and return parsed JSON."""
    key = api_key or os.getenv("GEMINI_API_KEY")
    if not key:
        raise ValueError("No Gemini API key. Set GEMINI_API_KEY or pass one in the request.")

    url = f"https://generativelanguage.googleapis.com/v1beta/models/{model or GEMINI_MODEL}:generateContent"
    body = {
        "contents": [{"role": "user", "parts": [{"text": prompt}]}],
        "generationConfig": {
            "temperature": temperature,
            "responseMimeType": "application/json",
        },
    }
    if system:
        body["systemInstruction"] = {"parts": [{"text": system}]}

    r = _session().post(url, headers={"x-goog-api-key": key, "Content-Type": "application/json"},
                        json=body, timeout=120)
    if r.status_code == 429:
        raise RuntimeError("Gemini rate limit reached. Wait a minute and retry.")
    if not r.ok:
        raise RuntimeError(f"Gemini error {r.status_code}: {r.text[:300]}")

    data = r.json()
    try:
        text = data["candidates"][0]["content"]["parts"][0]["text"]
    except (KeyError, IndexError):
        raise RuntimeError(f"Gemini returned no content: {str(data)[:300]}")

    text = re.sub(r"^```(?:json)?|```$", "", text.strip(), flags=re.M).strip()
    return json.loads(text)