import json
import math
import os
import re
import struct
import time
import urllib.request
import uuid
import wave
import subprocess
from pathlib import Path
from typing import Optional, List, Dict, Any
from . import db, config

MUSIC_DIR = config.DATA_DIR / "music"
MUSIC_DIR.mkdir(parents=True, exist_ok=True)

# Musical scale frequencies (in Hz)
SCALES = {
    "emotional": [261.63, 293.66, 329.63, 392.00, 440.00, 523.25],       # C Major / A Minor tender piano
    "motivational": [293.66, 329.63, 369.99, 440.00, 493.88, 587.33],    # D Major triumphant build-up
    "educational": [261.63, 311.13, 349.23, 392.00, 466.16, 523.25],     # Chill Lo-Fi / Ambient
    "dramatic": [220.00, 246.94, 261.63, 293.66, 329.63, 349.23],       # A Minor cinematic tension
    "energetic": [329.63, 369.99, 392.00, 440.00, 493.88, 587.33],      # E Minor driving tempo
    "philosophical": [246.94, 293.66, 329.63, 392.00, 440.00, 493.88],  # B Minor / D Major reflective wisdom
    "ambient": [261.63, 293.66, 349.23, 392.00, 440.00, 523.25],        # F Major airy meditative
    "playful": [261.63, 293.66, 329.63, 392.00, 440.00, 523.25],        # G Major upbeat storytelling
}

def synthesize_instrumental_track(
    mood: str,
    genre: str,
    duration: float,
    out_wav: Path,
    tempo_bpm: int = 76,
    energy: str = "medium",
    acousticness: float = 0.85
) -> Path:
    """
    Procedurally synthesizes studio-grade multi-layered instrumental music:
    - Layer 1: Lush Stereo Pad / Strings with organic vibrato & warmth
    - Layer 2: Deep Sub-Bass and warm contrabass foundation
    - Layer 3: Dynamic Melodic Arpeggio / Piano acoustic pluck
    - Layer 4: Percussive heartbeat / gentle rhythmic pulse based on tempo & energy
    """
    sample_rate = 44100
    total_samples = int(sample_rate * duration)
    scale = SCALES.get(mood.lower(), SCALES["emotional"])
    
    # Calculate chord duration and beat length from tempo BPM
    # At 76 BPM: 1 beat = 60/76 = 0.789s, 4 beats per bar = 3.158s
    beat_s = max(0.4, min(1.2, 60.0 / max(40, tempo_bpm)))
    bar_s = beat_s * 4.0
    
    # Chord progressions (cycles of 4 harmonic roots with richer voicing)
    root_chords = [
        [scale[0], scale[2], scale[4], scale[1 % len(scale)] * 2.0],
        [scale[3 % len(scale)], scale[5 % len(scale)], scale[1 % len(scale)], scale[0] * 2.0],
        [scale[1 % len(scale)], scale[3 % len(scale)], scale[5 % len(scale)], scale[2 % len(scale)] * 2.0],
        [scale[2 % len(scale)], scale[4 % len(scale)], scale[0], scale[5 % len(scale)]]
    ]
    
    # Energy scaling factors
    energy_mult = 1.3 if energy == "high" else (0.75 if energy == "low" else 1.0)
    arp_rate = 4.0 if energy == "low" else (8.0 if energy == "high" else 6.0) # notes per second
    
    with wave.open(str(out_wav), 'w') as wav_file:
        wav_file.setnchannels(2) # Stereo
        wav_file.setsampwidth(2) # 16-bit
        wav_file.setframerate(sample_rate)
        
        frames = bytearray()
        
        for n in range(total_samples):
            t = n / sample_rate
            chord_idx = int(t / bar_s) % len(root_chords)
            chord = root_chords[chord_idx]
            
            # Layer 1: Warm ambient pad (chords with organic slow vibrato)
            pad_val = 0.0
            for i, freq in enumerate(chord):
                vib = math.sin(2 * math.pi * 3.2 * t) * 1.6
                harmonic = math.sin(2 * math.pi * (freq + vib) * t)
                # Soft overdrive for analog warmth
                pad_val += harmonic * (0.09 if i < 3 else 0.04)
                
            # Layer 2: Deep bass note (sub-octave + second harmonic)
            bass_freq = chord[0] / 2.0
            bass_val = (
                math.sin(2 * math.pi * bass_freq * t) * 0.22 +
                math.sin(2 * math.pi * (bass_freq * 2.0) * t) * 0.08
            )
            
            # Layer 3: Melodic arpeggio (acoustic piano / bell pluck)
            step_idx = int(t * arp_rate) % len(scale)
            arp_freq = scale[step_idx] * 2.0
            arp_phase = (t * arp_rate) % 1.0
            arp_decay = math.exp(-arp_phase * (3.5 if acousticness > 0.6 else 2.0))
            # Acoustic chime harmonic
            melody_val = (
                math.sin(2 * math.pi * arp_freq * t) * 0.16 +
                math.sin(2 * math.pi * (arp_freq * 2.0) * t) * 0.05
            ) * arp_decay * energy_mult
            
            # Layer 4: Gentle rhythmic pulse / heartbeat (syncopated on each beat)
            beat_phase = (t / beat_s) % 1.0
            pulse_decay = math.exp(-beat_phase * 12.0)
            pulse_val = math.sin(2 * math.pi * 55.0 * t) * pulse_decay * (0.12 if energy != "low" else 0.04)
            
            # Master mix
            sample_val = pad_val + bass_val + melody_val + pulse_val
            
            # Master volume envelope (fade in 1.8s, fade out 2.2s)
            env = 1.0
            if t < 1.8:
                env = t / 1.8
            elif t > duration - 2.2:
                env = max(0.0, (duration - t) / 2.2)
                
            sample_val *= env
            
            # Soft tape saturation limiter
            sample_val = math.tanh(sample_val * 1.1) * 0.92
            
            # Convert to 16-bit PCM with wide stereo field
            left_sample = int(sample_val * 31500)
            right_sample = int((sample_val * 0.95 + pad_val * 0.3) * 31500)
            
            frames.extend(struct.pack('<hh', max(-32767, min(32767, left_sample)), max(-32767, min(32767, right_sample))))
            
        wav_file.writeframes(frames)
        
    return out_wav

def generate_music_for_project(
    project_id: Optional[str],
    mood: str = "emotional",
    genre: str = "cinematic",
    duration: float = 60.0,
    tempo: int = 76,
    energy: str = "medium",
    acousticness: float = 0.85,
    custom_title: Optional[str] = None,
    analysis_reason: Optional[str] = None
) -> Dict[str, Any]:
    track_id = uuid.uuid4().hex
    filename = f"music_{track_id}.mp3"
    wav_path = MUSIC_DIR / f"temp_{track_id}.wav"
    mp3_path = MUSIC_DIR / filename
    
    synthesize_instrumental_track(
        mood=mood,
        genre=genre,
        duration=duration,
        out_wav=wav_path,
        tempo_bpm=tempo,
        energy=energy,
        acousticness=acousticness
    )
    
    # Convert to high-quality 256k MP3
    subprocess.run([
        "ffmpeg", "-y", "-hide_banner", "-loglevel", "error",
        "-i", str(wav_path), "-c:a", "libmp3lame", "-b:a", "256k",
        str(mp3_path)
    ], check=True)
    
    wav_path.unlink(missing_ok=True)
    
    name = custom_title or f"{mood.capitalize()} {genre.capitalize()} Theme"
    desc = f"{tempo} BPM • {energy.capitalize()} Energy • {genre.capitalize()}"
    now = time.time()
    
    conn = db.get_connection()
    c = conn.cursor()
    c.execute("""
        INSERT INTO music_tracks (id, project_id, name, mood, genre, duration, filename, is_preset, created_at, tempo, energy, acousticness, description, analysis_reason)
        VALUES (?, ?, ?, ?, ?, ?, ?, 0, ?, ?, ?, ?, ?, ?)
    """, (track_id, project_id, name, mood, genre, duration, filename, now, str(tempo), energy, str(acousticness), desc, analysis_reason or ""))
    conn.commit()
    conn.close()
    
    return {
        "id": track_id,
        "project_id": project_id,
        "name": name,
        "mood": mood,
        "genre": genre,
        "duration": duration,
        "filename": filename,
        "tempo": str(tempo),
        "energy": energy,
        "acousticness": str(acousticness),
        "description": desc,
        "analysis_reason": analysis_reason or "",
        "url": f"/api/music/{track_id}/audio"
    }

def detect_and_compose_from_script(
    project_id: str,
    script_id: Optional[str] = None,
    custom_script_text: Optional[str] = None,
    api_key: Optional[str] = None
) -> Dict[str, Any]:
    """Analyzes the active script or transcript to detect mood, emotion, and style, then synthesizes a tailored soundtrack."""
    conn = db.get_connection()
    c = conn.cursor()
    
    script_row = None
    if script_id:
        script_row = c.execute("SELECT * FROM scripts WHERE id = ?", (script_id,)).fetchone()
    if not script_row and not custom_script_text:
        script_row = c.execute("SELECT * FROM scripts WHERE project_id = ? ORDER BY created_at DESC", (project_id,)).fetchone()
        
    t_row = c.execute("SELECT * FROM transcripts WHERE project_id = ?", (project_id,)).fetchone()
    conn.close()

    script_text = custom_script_text or ""
    target_duration = 60.0
    detected_mood = "motivational"
    detected_genre = "cinematic"
    track_title = "Narrative Soundtrack"
    analysis_reason = "Harmonic progression matched to overall speech flow."
    tempo = 76
    energy = "medium"
    acousticness = 0.85

    if not script_text:
        if script_row:
            scenes = json.loads(script_row["scenes_json"] or "[]")
            target_duration = float(script_row["duration_target"] or 60.0)
            script_text = " ".join(f"{s.get('role', '')}: {s.get('dialogue', '')} [{s.get('on_screen_text', '')}]" for s in scenes)
            track_title = f"{script_row['title']} - Custom Score"
        elif t_row:
            script_text = t_row["full_text"][:3000]

    # Step 1: Attempt deep analysis using Gemini LLM if API key or env var is available
    gemini_succeeded = False
    gemini_key = api_key or os.getenv("GEMINI_API_KEY")
    if gemini_key and len(script_text.strip()) > 20:
        try:
            from . import gemini_client
            prompt = f"""
You are an award-winning film music director & sound designer.
Analyze this video script/transcript excerpt and determine the perfect musical score:

SCRIPT:
\"\"\"{script_text[:2500]}\"\"\"

Output a JSON object with:
- "mood": One of ["philosophical", "emotional", "motivational", "dramatic", "energetic", "ambient", "playful"]
- "genre": One of ["cinematic", "acoustic", "ambient", "electronic"]
- "tempo_bpm": integer between 60 and 125
- "energy": One of ["low", "medium", "high"]
- "acousticness": float between 0.1 and 1.0 (1.0 = organic acoustic piano/strings, 0.2 = modern electronic)
- "track_title": catchy short title (3-5 words)
- "analysis_reason": concise 1-2 sentence explanation of why this musical tone matches the speaker's emotional arc.
"""
            res = gemini_client.gemini_json(prompt, api_key=gemini_key, temperature=0.4)
            if isinstance(res, dict) and "mood" in res:
                mood_cand = str(res.get("mood", "")).lower()
                if mood_cand in SCALES:
                    detected_mood = mood_cand
                detected_genre = str(res.get("genre", "cinematic")).lower()
                tempo = int(res.get("tempo_bpm", 76))
                energy = str(res.get("energy", "medium")).lower()
                acousticness = float(res.get("acousticness", 0.85))
                track_title = str(res.get("track_title", track_title))
                analysis_reason = str(res.get("analysis_reason", analysis_reason))
                gemini_succeeded = True
        except Exception as e:
            print(f"Gemini music analysis fallback: {e}")

    # Step 2: Advanced heuristic NLP if Gemini is unavailable
    if not gemini_succeeded:
        text_lower = script_text.lower()
        
        # Check for philosophical / spiritual / wisdom / Vedanta themes
        if any(k in text_lower for k in ["vedanta", "spiritual", "self", "mind", "consciousness", "acharya", "prashant", "sufi", "donkey", "nasrudin", "wisdom", "parable", "truth", "education"]):
            detected_mood = "philosophical"
            detected_genre = "acoustic"
            tempo = 72
            energy = "medium"
            acousticness = 0.92
            track_title = "Philosophical Clarity & Wisdom"
            analysis_reason = "Deep discourse on self-knowledge and consciousness detected. Composed thoughtful acoustic piano in B-minor/D-major."
        # Motivational / Triumph
        elif any(k in text_lower for k in ["success", "win", "achieve", "never give up", "hard work", "goal", "dream", "inspire", "champion", "future"]):
            detected_mood = "motivational"
            detected_genre = "cinematic"
            tempo = 88
            energy = "high"
            acousticness = 0.80
            track_title = "Inspiring Victory & Triumph"
            analysis_reason = "High-energy motivational discourse detected. Composed triumphant ascending chords with emotional build-up."
        # Emotional / Vulnerable
        elif any(k in text_lower for k in ["pain", "cry", "loss", "sad", "love", "heart", "tears", "remember", "miss", "grief", "lonely"]):
            detected_mood = "emotional"
            detected_genre = "acoustic"
            tempo = 65
            energy = "low"
            acousticness = 0.95
            track_title = "Heartfelt Emotional Reflection"
            analysis_reason = "Tender emotional narrative detected. Composed intimate soft piano in minor key."
        # Dramatic / Tension / Suspense
        elif any(k in text_lower for k in ["danger", "secret", "shock", "warning", "mistake", "crime", "dark", "fear", "alert", "war", "crisis"]):
            detected_mood = "dramatic"
            detected_genre = "cinematic"
            tempo = 82
            energy = "high"
            acousticness = 0.70
            track_title = "Cinematic Suspense & Tension"
            analysis_reason = "Dramatic tension and urgency detected. Composed intense cinematic minor progressions."
        # Energetic / Shorts Hooks
        elif any(k in text_lower for k in ["fast", "quick", "hack", "trick", "money", "crazy", "unbelievable", "viral", "challenge"]):
            detected_mood = "energetic"
            detected_genre = "electronic"
            tempo = 104
            energy = "high"
            acousticness = 0.40
            track_title = "Viral Energy & Punchy Beats"
            analysis_reason = "Fast-paced viral hook tone detected. Composed driving high-tempo electronic arpeggios."
        else:
            detected_mood = "ambient"
            detected_genre = "ambient"
            tempo = 68
            energy = "low"
            acousticness = 0.90
            track_title = "Reflective Ambient Score"
            analysis_reason = "Educational narrative detected. Composed calm atmospheric lo-fi texture."

    # Synthesize the music track with full metadata audit
    track = generate_music_for_project(
        project_id=project_id,
        mood=detected_mood,
        genre=detected_genre,
        duration=max(15.0, min(180.0, target_duration)),
        tempo=tempo,
        energy=energy,
        acousticness=acousticness,
        custom_title=track_title,
        analysis_reason=analysis_reason
    )
    
    track["detected_mood"] = detected_mood
    track["detected_genre"] = detected_genre
    track["analysis_reason"] = analysis_reason
    return track

def audit_and_update_track(
    track_id: str,
    name: Optional[str] = None,
    mood: Optional[str] = None,
    genre: Optional[str] = None,
    tempo: Optional[int] = None,
    energy: Optional[str] = None,
    re_render: bool = False
) -> Dict[str, Any]:
    """Allows auditioning, fine-tuning, and regenerating an existing music track."""
    conn = db.get_connection()
    c = conn.cursor()
    row = c.execute("SELECT * FROM music_tracks WHERE id = ?", (track_id,)).fetchone()
    if not row:
        conn.close()
        raise ValueError("Track not found")
        
    current_mood = mood or row["mood"] or "emotional"
    current_genre = genre or row["genre"] or "cinematic"
    current_name = name or row["name"]
    current_tempo = int(tempo or row["tempo"] or 76)
    current_energy = energy or row["energy"] or "medium"
    duration = float(row["duration"] or 60.0)
    
    if re_render:
        # Re-synthesize audio with newly adjusted parameters
        filename = row["filename"]
        wav_path = MUSIC_DIR / f"temp_{track_id}.wav"
        mp3_path = MUSIC_DIR / filename
        
        synthesize_instrumental_track(
            mood=current_mood,
            genre=current_genre,
            duration=duration,
            out_wav=wav_path,
            tempo_bpm=current_tempo,
            energy=current_energy
        )
        
        subprocess.run([
            "ffmpeg", "-y", "-hide_banner", "-loglevel", "error",
            "-i", str(wav_path), "-c:a", "libmp3lame", "-b:a", "256k",
            str(mp3_path)
        ], check=True)
        wav_path.unlink(missing_ok=True)
        
    desc = f"{current_tempo} BPM • {current_energy.capitalize()} Energy • {current_genre.capitalize()}"
    c.execute("""
        UPDATE music_tracks
        SET name = ?, mood = ?, genre = ?, tempo = ?, energy = ?, description = ?
        WHERE id = ?
    """, (current_name, current_mood, current_genre, str(current_tempo), current_energy, desc, track_id))
    conn.commit()
    conn.close()
    
    return {
        "id": track_id,
        "project_id": row["project_id"],
        "name": current_name,
        "mood": current_mood,
        "genre": current_genre,
        "duration": duration,
        "tempo": str(current_tempo),
        "energy": current_energy,
        "description": desc,
        "url": f"/api/music/{track_id}/audio?v={int(time.time())}"
    }

def list_music_tracks(project_id: Optional[str] = None) -> List[Dict[str, Any]]:
    conn = db.get_connection()
    c = conn.cursor()
    if project_id:
        rows = c.execute("SELECT * FROM music_tracks WHERE project_id = ? OR is_preset = 1 ORDER BY created_at DESC", (project_id,)).fetchall()
    else:
        rows = c.execute("SELECT * FROM music_tracks ORDER BY created_at DESC").fetchall()
    conn.close()
    
    tracks = []
    for r in rows:
        tracks.append({
            "id": r["id"],
            "project_id": r["project_id"],
            "name": r["name"],
            "mood": r["mood"],
            "genre": r["genre"],
            "duration": r["duration"],
            "tempo": r["tempo"] or "76",
            "energy": r["energy"] or "medium",
            "description": r["description"] or f"{r['mood']} {r['genre']}",
            "analysis_reason": r["analysis_reason"] or "",
            "url": f"/api/music/{r['id']}/audio",
            "is_preset": bool(r["is_preset"])
        })
    return tracks
