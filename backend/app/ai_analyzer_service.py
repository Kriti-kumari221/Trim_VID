import json
import os
import re
import uuid
import time
import urllib.request
from typing import Optional, List, Dict, Any
from . import db

def _call_llm_for_script(prompt: str, api_key: str, provider: str = "gemini") -> Optional[str]:
    """Calls Gemini, Groq, or OpenAI REST API directly without heavy dependencies."""
    provider = provider.lower()
    try:
        if provider == "gemini":
            # Gemini 2.0 Flash / 1.5 Flash endpoint
            url = f"https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key={api_key}"
            body = {
                "contents": [{"parts": [{"text": prompt}]}],
                "generationConfig": {"temperature": 0.4, "maxOutputTokens": 2048}
            }
            req = urllib.request.Request(
                url,
                data=json.dumps(body).encode("utf-8"),
                headers={"Content-Type": "application/json"}
            )
            with urllib.request.urlopen(req, timeout=25) as r:
                res = json.loads(r.read().decode("utf-8"))
                return res["candidates"][0]["content"]["parts"][0]["text"]
                
        elif provider in ("groq", "openai"):
            endpoint = (
                "https://api.groq.com/openai/v1/chat/completions"
                if provider == "groq"
                else "https://api.openai.com/v1/chat/completions"
            )
            model = "llama-3.3-70b-versatile" if provider == "groq" else "gpt-4o-mini"
            body = {
                "model": model,
                "messages": [
                    {"role": "system", "content": "You are a professional video editor specializing in YouTube Shorts, TikTok, and Instagram Reels. Output ONLY valid JSON."},
                    {"role": "user", "content": prompt}
                ],
                "temperature": 0.4
            }
            req = urllib.request.Request(
                endpoint,
                data=json.dumps(body).encode("utf-8"),
                headers={"Content-Type": "application/json", "Authorization": f"Bearer {api_key}"}
            )
            with urllib.request.urlopen(req, timeout=25) as r:
                res = json.loads(r.read().decode("utf-8"))
                return res["choices"][0]["message"]["content"]
    except Exception as e:
        print(f"Warning: LLM generation error ({e}). Falling back to Smart Story Extractor.")
        return None

def analyze_transcript_content(project_id: str, transcript_segments: List[Dict[str, Any]], video_duration: float) -> Dict[str, Any]:
    """Analyzes transcript segments to extract structured topics, highlights, viral hooks, and moments."""
    if not transcript_segments:
        return {"summary": "No transcript available to analyze.", "topics": [], "moments": [], "viral_hooks": []}

    total_words = sum(len(s.get("text", "").split()) for s in transcript_segments)
    duration_min = round(video_duration / 60, 1)
    
    # Heuristic segmentation into 3-6 topics based on timeline chunking and keyword shifts
    num_topics = max(3, min(6, int(video_duration // 180) + 1))
    interval = video_duration / num_topics if num_topics else video_duration
    
    topics = []
    topic_names = [
        "Introduction & Core Theme",
        "Key Concept Breakdown",
        "Deep Dive & Perspectives",
        "Practical Examples & Case Studies",
        "Surprising Insights & Counter-Intuitions",
        "Conclusion & Actionable Takeaways"
    ]
    
    for i in range(num_topics):
        t_start = round(i * interval, 2)
        t_end = round(min(video_duration, (i + 1) * interval), 2)
        # Find matching segments in this range
        sub_segs = [s for s in transcript_segments if (s["start"] >= t_start and s["start"] < t_end) or (s["end"] > t_start and s["end"] <= t_end)]
        sub_text = " ".join(s["text"] for s in sub_segs)
        
        # Calculate relevance score based on question marks, emotional/emphatic words, sentence density
        questions = sub_text.count("?")
        exclamations = sub_text.count("!")
        word_count = len(sub_text.split())
        rel_score = min(98, max(65, 70 + (questions * 5) + (exclamations * 3) + min(15, word_count // 20)))
        
        title = topic_names[i] if i < len(topic_names) else f"Topic {i+1}: Critical Discussion"
        summary = (sub_text[:140] + "...") if len(sub_text) > 140 else sub_text or "Detailed topic exploration."
        
        topics.append({
            "id": f"top_{i+1}",
            "title": title,
            "start": t_start,
            "end": t_end,
            "relevance_score": rel_score,
            "summary": summary,
            "reason": f"High engagement potential ({rel_score}%); clear discussion structure suitable for a standalone clip."
        })

    # Extract viral moments & hooks
    viral_hooks = []
    moments = []
    
    hook_patterns = [
        (r"\b(why|how|what if|the secret|never|always|mistake|truth)\b", "Curiosity Hook", "Questions conventional thinking; captures immediate viewer retention."),
        (r"\b(story|remember|one day|happened|experienced|told me)\b", "Storytelling Moment", "Narrative arc with emotional connection; high retention on Reels/Shorts."),
        (r"\b(important|crucial|remember this|key takeaway|lesson)\b", "High Impact Takeaway", "Actionable lesson that drives saves and shares.")
    ]
    
    for idx, seg in enumerate(transcript_segments):
        txt = seg.get("text", "")
        # Check against patterns
        for pattern, m_type, rationale in hook_patterns:
            if re.search(pattern, txt, re.IGNORECASE) and len(viral_hooks) < 6:
                hook_start = max(0.0, round(seg["start"] - 0.5, 2))
                hook_end = min(video_duration, round(seg["end"] + 15.0, 2))
                viral_hooks.append({
                    "id": f"hook_{len(viral_hooks)+1}",
                    "type": m_type,
                    "quote": txt,
                    "start": hook_start,
                    "end": hook_end,
                    "rationale": rationale,
                    "score": 92
                })
                break
                
        # Key moment detection
        if len(moments) < 8 and ("?" in txt or len(txt.split()) > 12):
            moments.append({
                "id": f"mom_{len(moments)+1}",
                "start": seg["start"],
                "end": min(video_duration, seg["end"] + 10.0),
                "speaker": seg.get("speaker", "Speaker"),
                "text": txt,
                "category": "Educational Explanation" if "?" not in txt else "Q&A Insight",
                "virality": 85 + (len(moments) % 10)
            })

    summary = (
        f"This video spans {duration_min} minutes with {total_words} spoken words across "
        f"{len(transcript_segments)} sentence segments. It features strong thematic progression "
        f"with {len(topics)} core topics and {len(viral_hooks)} high-potential short-form hooks."
    )

    analysis_res = {
        "project_id": project_id,
        "summary": summary,
        "topics": topics,
        "moments": moments,
        "viral_hooks": viral_hooks
    }

    # Save to database
    conn = db.get_connection()
    c = conn.cursor()
    c.execute("""
        INSERT OR REPLACE INTO ai_analyses (id, project_id, summary, topics_json, moments_json, viral_hooks_json, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?)
    """, (uuid.uuid4().hex, project_id, summary, json.dumps(topics), json.dumps(moments), json.dumps(viral_hooks), time.time()))
    conn.commit()
    conn.close()

    return analysis_res

def generate_short_script(
    project_id: str,
    topic_id: Optional[str] = None,
    duration_target: int = 60,
    style: str = "educational",
    api_key: Optional[str] = None,
    provider: Optional[str] = "gemini"
) -> Dict[str, Any]:
    """Generates a structured short-video script using real AI (Gemini/Groq/OpenAI) or Smart Story Extractor."""
    conn = db.get_connection()
    c = conn.cursor()
    t_row = c.execute("SELECT * FROM transcripts WHERE project_id = ?", (project_id,)).fetchone()
    a_row = c.execute("SELECT * FROM ai_analyses WHERE project_id = ?", (project_id,)).fetchone()
    p_row = c.execute("SELECT * FROM projects WHERE id = ?", (project_id,)).fetchone()
    conn.close()

    if not t_row:
        raise ValueError("Transcript required to generate script.")

    segments = json.loads(t_row["segments_json"] or "[]")
    if not segments:
        raise ValueError("Transcript has no speech segments.")

    # Target slice based on topic or beginning of high-scoring topic
    target_start = 0.0
    video_dur = p_row["video_duration"] if p_row else 180.0
    target_end = min(video_dur, target_start + duration_target * 1.8)
    
    if a_row:
        topics = json.loads(a_row["topics_json"] or "[]")
        if topic_id:
            match = next((t for t in topics if t["id"] == topic_id), None)
            if match:
                target_start = match["start"]
                target_end = match["end"]
        elif topics:
            best_top = max(topics, key=lambda x: x.get("relevance_score", 0))
            target_start = best_top["start"]
            target_end = best_top["end"]

    relevant_segs = [s for s in segments if s["start"] >= target_start and s["start"] <= target_end]
    if not relevant_segs:
        relevant_segs = segments[:min(35, len(segments))]

    # 1. Check for AI API key (from param or environment variables)
    active_key = (
        api_key
        or os.getenv("GEMINI_API_KEY")
        or os.getenv("GOOGLE_API_KEY")
        or os.getenv("GROQ_API_KEY")
        or os.getenv("OPENAI_API_KEY")
    )
    active_provider = provider or "gemini"
    if not api_key:
        if os.getenv("GROQ_API_KEY"):
            active_provider = "groq"
            active_key = os.getenv("GROQ_API_KEY")
        elif os.getenv("OPENAI_API_KEY"):
            active_provider = "openai"
            active_key = os.getenv("OPENAI_API_KEY")

    scenes = None

    if active_key:
        # Build prompt with actual transcript segments
        sample_transcript = "\n".join(
            f"[{s['start']:.2f}s - {s['end']:.2f}s] {s.get('speaker', 'Speaker')}: {s['text']}"
            for s in relevant_segs[:40]
        )
        prompt = (
            f"You are an expert short-form video editor for YouTube Shorts, TikTok, and Instagram Reels.\n"
            f"Given this video transcript with timestamps, craft a high-retention viral short video script.\n"
            f"Target Duration: {duration_target} seconds. Content Style: {style}.\n\n"
            f"TRANSCRIPT WITH TIMESTAMPS:\n{sample_transcript}\n\n"
            f"Select the single most engaging narrative or insight arc.\n"
            f"Break it into 3 to 5 scenes. For each scene, specify:\n"
            f"- scene_num (integer 1..N)\n"
            f"- role (e.g. 'Opening Hook', 'Curiosity Spike', 'Story Narrative', 'Core Twist', 'Key Takeaway')\n"
            f"- script_timeline (e.g. '00:00 - 00:08')\n"
            f"- duration (float)\n"
            f"- original_start (float matching start timestamp from transcript)\n"
            f"- original_end (float matching end timestamp from transcript)\n"
            f"- dialogue (exact quote spoken in footage)\n"
            f"- visual_description (cinematic camera directions, zoom, speaker framing)\n"
            f"- on_screen_text (punchy uppercase 3-5 word hook overlay)\n\n"
            f"Output ONLY a valid JSON array of scene objects. Do not include markdown codeblocks or explanation."
        )
        llm_raw = _call_llm_for_script(prompt, active_key, active_provider)
        if llm_raw:
            try:
                clean_json = re.sub(r"^```(?:json)?|```$", "", llm_raw.strip(), flags=re.MULTILINE).strip()
                parsed = json.loads(clean_json)
                if isinstance(parsed, list) and len(parsed) >= 2:
                    scenes = []
                    for s in parsed:
                        scenes.append({
                            "scene_num": int(s.get("scene_num", len(scenes) + 1)),
                            "role": str(s.get("role", f"Scene {len(scenes) + 1}")),
                            "script_timeline": str(s.get("script_timeline", "")),
                            "duration": round(float(s.get("duration", 10.0)), 1),
                            "original_start": round(float(s.get("original_start", 0.0)), 2),
                            "original_end": round(float(s.get("original_end", 10.0)), 2),
                            "dialogue": str(s.get("dialogue", "")),
                            "visual_description": str(s.get("visual_description", "")),
                            "on_screen_text": str(s.get("on_screen_text", "")).upper(),
                            "approved": True
                        })
            except Exception as e:
                print(f"Failed to parse LLM JSON response: {e}")
                scenes = None

    # 2. Smart Story Extractor Fallback (extracts REAL quotes & narrative from transcript)
    if not scenes:
        num_scenes = 3 if duration_target <= 30 else (4 if duration_target <= 60 else 5)
        scene_dur = duration_target / num_scenes
        scenes = []
        seg_step = max(1, len(relevant_segs) // num_scenes)

        for i in range(num_scenes):
            s_start_time = round(i * scene_dur, 1)
            s_end_time = round((i + 1) * scene_dur, 1)
            
            seg_idx = min(len(relevant_segs) - 1, i * seg_step)
            seg = relevant_segs[seg_idx]
            orig_start = seg["start"]
            orig_end = min(orig_start + (s_end_time - s_start_time), seg.get("end", orig_start + 10.0))
            if orig_end <= orig_start:
                orig_end = orig_start + 6.0
                
            raw_text = seg.get("text", "").strip()
            # Generate punchy on-screen hook from the real dialogue
            words = [w.strip('.,;:"!?') for w in raw_text.split() if len(w) > 2]
            
            if i == 0:
                role = "Opening Hook"
                visual = "Speaker tight close-up; dynamic punch-in zoom; bold entrance."
                on_screen_text = " ".join(words[:4]).upper() or "WATCH THIS"
            elif i == num_scenes - 1:
                role = "Twist & Takeaway"
                visual = "Wide framing; lingering pause on final statement; text highlight."
                on_screen_text = " ".join(words[-4:]).upper() if len(words) >= 4 else "REMEMBER THIS"
            else:
                role = f"Narrative Arc {i}"
                visual = f"Authentic source footage; pacing matched to natural speech cadence."
                on_screen_text = " ".join(words[:3]).upper() if words else "KEY MOMENT"

            scenes.append({
                "scene_num": i + 1,
                "role": role,
                "script_timeline": f"{s_start_time:.1f}s - {s_end_time:.1f}s",
                "duration": round(s_end_time - s_start_time, 1),
                "original_start": round(orig_start, 2),
                "original_end": round(orig_end, 2),
                "dialogue": raw_text,
                "visual_description": visual,
                "on_screen_text": on_screen_text,
                "approved": True
            })

    title = f"{style.capitalize()} Short - {duration_target}s"
    script_id = uuid.uuid4().hex
    
    conn = db.get_connection()
    c = conn.cursor()
    c.execute("""
        INSERT INTO scripts (id, project_id, title, duration_target, style, scenes_json, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?)
    """, (script_id, project_id, title, duration_target, style, json.dumps(scenes), time.time()))
    conn.commit()
    conn.close()

    return {
        "id": script_id,
        "project_id": project_id,
        "title": title,
        "duration_target": duration_target,
        "style": style,
        "scenes": scenes
    }

def map_script_to_project_clips(project_id: str, script_id: str, folder_name: str = "Script Clips") -> List[Dict[str, Any]]:
    """Converts approved script scenes into real clips in a dedicated project folder."""
    conn = db.get_connection()
    c = conn.cursor()
    s_row = c.execute("SELECT * FROM scripts WHERE id = ?", (script_id,)).fetchone()
    if not s_row:
        conn.close()
        raise ValueError("Script not found.")
        
    scenes = json.loads(s_row["scenes_json"] or "[]")
    
    # Create or find folder
    f_row = c.execute("SELECT id FROM project_folders WHERE project_id = ? AND name = ?", (project_id, folder_name)).fetchone()
    if f_row:
        folder_id = f_row["id"]
    else:
        folder_id = uuid.uuid4().hex
        c.execute("""
            INSERT INTO project_folders (id, project_id, name, sort_order, created_at)
            VALUES (?, ?, ?, 10, ?)
        """, (folder_id, project_id, folder_name, time.time()))
        
    created_clips = []
    now = time.time()
    for scene in scenes:
        if not scene.get("approved", True):
            continue
        clip_id = uuid.uuid4().hex
        scene_num = scene["scene_num"]
        c_name = f"Scene_{scene_num:02d}_{scene['role'].replace(' ', '_')}"
        start_t = float(scene["original_start"])
        end_t = float(scene["original_end"])
        
        c.execute("""
            INSERT INTO clips (id, project_id, folder_id, name, start_time, end_time, sort_order, status, created_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, 'ready', ?)
        """, (clip_id, project_id, folder_id, c_name, start_t, end_t, scene_num, now))
        
        created_clips.append({
            "id": clip_id,
            "project_id": project_id,
            "folder_id": folder_id,
            "name": c_name,
            "start_time": start_t,
            "end_time": end_t,
            "sort_order": scene_num
        })
        
    conn.commit()
    conn.close()
    return created_clips
