import json
import logging
from typing import List, Dict, Any, Optional
from . import gemini_client

logger = logging.getLogger(__name__)

SYSTEM_PROMPT = """You are an elite viral Shorts & Reels editor and scriptwriter specializing in high-retention philosophical and discourse videos (such as Acharya Prashant discourses).
Your job is to identify high-impact, provocative, profound moments from the transcript and shape them into engaging Short clips.

Selection & Scripting Rules:
1. Duration: 30 to 75 seconds per clip (ideal for YouTube Shorts / Reels retention).
2. Clean Hook: Every clip must open with a curiosity-inducing, punchy hook in the first 3 seconds.
3. Sentence Boundaries: Start and end strictly on natural sentence/thought boundaries. Never cut mid-thought.
4. Language Preservation: Retain the native spoken language (Hindi/Devanagari, Hinglish, or English) without distorting the speaker's original words.
5. Virality Score & Reason: Assess emotional resonance, counter-intuitive insight, and hook strength (1-100).
6. Output Format: Return strictly a valid JSON array matching the requested schema.
"""

def select_viral_clips_from_transcript(
    transcript_segments: List[Dict[str, Any]],
    num_clips: int = 5,
    target_min_s: int = 30,
    target_max_s: int = 75,
    api_key: Optional[str] = None
) -> List[Dict[str, Any]]:
    """
    Analyzes timestamped transcript segments with Gemini Flash to identify
    the top N viral Short candidates with start, end, hook title, score, and reason.
    """
    if not transcript_segments:
        return []

    lines = []
    for s in transcript_segments:
        start = float(s.get("start", 0))
        duration = float(s.get("duration", 0))
        end = start + duration
        text = s.get("text", "").strip()
        if text:
            lines.append(f"[{start:.2f} - {end:.2f}] {text}")

    formatted_transcript = "\n".join(lines)

    prompt = f"""Analyze this discourse transcript and select the {num_clips} most viral, insightful Short/Reel clips.

Requirements:
- Number of clips: {num_clips}
- Duration: between {target_min_s}s and {target_max_s}s
- Must have an irresistible opening hook
- Keep speaker's original language (Hindi/English)

Return a JSON array of objects with the schema:
[
  {{
    "start": float,
    "end": float,
    "hook_title": "Catchy punchy title (Hindi/English)",
    "virality_score": int (80-99),
    "reason": "Why this specific hook & insight stops the scroll",
    "summary": "Key thesis/point conveyed in this clip",
    "script_content": "The exact spoken discourse snippet for this short"
  }}
]

TRANSCRIPT:
{formatted_transcript}
"""

    try:
        res = gemini_client.gemini_json(
            prompt=prompt,
            system=SYSTEM_PROMPT,
            api_key=api_key,
            temperature=0.3
        )
        if isinstance(res, list) and len(res) > 0:
            return res
        if isinstance(res, dict) and "clips" in res and isinstance(res["clips"], list):
            return res["clips"]
    except Exception as e:
        logger.warning(f"Gemini AI clip selection fallback: {e}")

    # High quality intelligent heuristic fallback
    return _smart_transcript_chunking(transcript_segments, num_clips, target_min_s, target_max_s)

def _smart_transcript_chunking(
    segments: List[Dict[str, Any]],
    num_clips: int = 5,
    min_s: int = 30,
    max_s: int = 70
) -> List[Dict[str, Any]]:
    """
    Heuristically groups sentences into meaningful 30-70s viral short candidates
    detecting punctuation ends and question marks as hooks.
    """
    if not segments:
        return []

    total_duration = float(segments[-1].get("start", 0)) + float(segments[-1].get("duration", 0))
    if total_duration < min_s:
        full_text = " ".join(s.get("text", "") for s in segments)
        return [{
            "start": 0.0,
            "end": total_duration,
            "hook_title": "Discourse Core Truth",
            "virality_score": 92,
            "reason": "Complete discourse core thought",
            "summary": full_text[:120],
            "script_content": full_text
        }]

    # Identify candidate start points (preferring questions or emphatic sentences)
    hooks = []
    current_chunk = []
    chunk_start = float(segments[0].get("start", 0))

    for s in segments:
        current_chunk.append(s)
        dur = (float(s.get("start", 0)) + float(s.get("duration", 0))) - chunk_start
        txt = s.get("text", "").strip()

        # Check for natural sentence conclusion between min_s and max_s
        if dur >= min_s and (dur >= max_s or txt.endswith((".", "?", "!", "|", "।"))):
            chunk_end = float(s.get("start", 0)) + float(s.get("duration", 0))
            chunk_text = " ".join(item.get("text", "").strip() for item in current_chunk)
            
            # Score virality based on question marks or key reflective words
            is_question = "?" in chunk_text or "क्यों" in chunk_text or "क्या" in chunk_text or "why" in chunk_text.lower()
            v_score = 94 if is_question else 88

            # Extract first sentence as hook title
            first_sentence = chunk_text.split(".")[0].split("।")[0].strip()
            hook_title = (first_sentence[:45] + "...") if len(first_sentence) > 45 else first_sentence
            if not hook_title:
                hook_title = f"Discourse Insight #{len(hooks)+1}"

            hooks.append({
                "start": round(chunk_start, 2),
                "end": round(chunk_end, 2),
                "hook_title": hook_title,
                "virality_score": v_score,
                "reason": "Deep reflective question with high engagement potential" if is_question else "Core philosophical conclusion",
                "summary": chunk_text[:150] + "...",
                "script_content": chunk_text
            })

            current_chunk = []
            chunk_start = chunk_end

            if len(hooks) >= num_clips * 2:
                break

    # Pick top num_clips spaced throughout
    if not hooks:
        return _fallback_simple_slices(segments, num_clips, min_s, max_s)
    
    # Sort or stride to get balanced coverage
    stride = max(1, len(hooks) // num_clips)
    selected = [hooks[i * stride] for i in range(min(num_clips, len(hooks)))]
    return selected

def _fallback_simple_slices(segments: List[Dict[str, Any]], num_clips: int, min_s: int, max_s: int) -> List[Dict[str, Any]]:
    total = float(segments[-1].get("start", 0)) + float(segments[-1].get("duration", 0))
    step = max(total / (num_clips + 1), min_s)
    clips = []
    curr = 0.0
    for i in range(num_clips):
        c_end = min(curr + max_s, total)
        if c_end - curr >= min_s:
            text_snips = [s.get("text", "") for s in segments if curr <= float(s.get("start", 0)) <= c_end]
            script_txt = " ".join(text_snips)
            clips.append({
                "start": round(curr, 2),
                "end": round(c_end, 2),
                "hook_title": f"Key Discourse Insight #{i+1}",
                "virality_score": 85 + i,
                "reason": "Spaced high-impact discourse moment",
                "summary": script_txt[:120] + "...",
                "script_content": script_txt
            })
        curr += step
        if curr + min_s > total:
            break
    return clips
