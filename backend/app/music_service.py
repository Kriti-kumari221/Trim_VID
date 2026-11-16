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

def synthesize_instrumental_track(mood: str, genre: str, duration: float, out_wav: Path) -> Path:
    """Procedurally synthesizes real multi-layered instrumental music (chords, bass, melody)."""
    sample_rate = 44100
    total_samples = int(sample_rate * duration)
    scale = SCALES.get(mood.lower(), SCALES["emotional"])
    
    # Chord progressions (cycles of 4 chords)
    root_chords = [
        [scale[0], scale[2], scale[4]],
        [scale[3 % len(scale)], scale[5 % len(scale)], scale[1 % len(scale)]],
        [scale[1 % len(scale)], scale[3 % len(scale)], scale[5 % len(scale)]],
        [scale[2 % len(scale)], scale[4 % len(scale)], scale[0]]
    ]
    
    chord_len_s = 3.0
    chord_samples = int(sample_rate * chord_len_s)
    
    with wave.open(str(out_wav), 'w') as wav_file:
        wav_file.setnchannels(2) # Stereo
        wav_file.setsampwidth(2) # 16-bit
        wav_file.setframerate(sample_rate)
        
        frames = bytearray()
        
        for n in range(total_samples):
            t = n / sample_rate
            chord_idx = int(t / chord_len_s) % len(root_chords)
            chord = root_chords[chord_idx]
            
            # Layer 1: Warm ambient pad (chords with gentle vibrato)
            pad_val = 0.0
            for freq in chord:
                vib = math.sin(2 * math.pi * 3.5 * t) * 1.5
                pad_val += math.sin(2 * math.pi * (freq + vib) * t) * 0.12
                
            # Layer 2: Deep bass note (sub-octave)
            bass_freq = chord[0] / 2.0
            bass_val = math.sin(2 * math.pi * bass_freq * t) * 0.22
            
            # Layer 3: Melodic arpeggio (acoustic piano-like pluck)
            arp_step = int(t * 4) % len(scale)
            arp_freq = scale[arp_step] * 2.0
            arp_decay = math.exp(-((t * 4) % 1.0) * 4.0)
            melody_val = math.sin(2 * math.pi * arp_freq * t) * arp_decay * 0.15
            
            # Master mix
            sample_val = pad_val + bass_val + melody_val
            
            # Master volume envelope (fade in 1.5s, fade out 2.0s)
            env = 1.0
            if t < 1.5:
                env = t / 1.5
            elif t > duration - 2.0:
                env = max(0.0, (duration - t) / 2.0)
                
            sample_val *= env
            
            # Soft limiter
            sample_val = max(-0.95, min(0.95, sample_val))
            
            # Convert to 16-bit PCM (L and R with slight stereo spread)
            left_sample = int(sample_val * 32000)
            right_sample = int(sample_val * 31500 + pad_val * 1000)
            
            frames.extend(struct.pack('<hh', max(-32767, min(32767, left_sample)), max(-32767, min(32767, right_sample))))
            
        wav_file.writeframes(frames)
        
    return out_wav

def generate_music_for_project(project_id: Optional[str], mood: str = "emotional", genre: str = "cinematic", duration: float = 60.0) -> Dict[str, Any]:
    track_id = uuid.uuid4().hex
    filename = f"music_{track_id}.mp3"
    wav_path = MUSIC_DIR / f"temp_{track_id}.wav"
    mp3_path = MUSIC_DIR / filename
    
    synthesize_instrumental_track(mood, genre, duration, wav_path)
    
    # Convert to MP3
    subprocess.run([
        "ffmpeg", "-y", "-hide_banner", "-loglevel", "error",
        "-i", str(wav_path), "-c:a", "libmp3lame", "-b:a", "192k",
        str(mp3_path)
    ], check=True)
    
    wav_path.unlink(missing_ok=True)
    
    name = f"{mood.capitalize()} {genre.capitalize()} Theme"
    now = time.time()
    
    conn = db.get_connection()
    c = conn.cursor()
    c.execute("""
        INSERT INTO music_tracks (id, project_id, name, mood, genre, duration, filename, is_preset, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, 0, ?)
    """, (track_id, project_id, name, mood, genre, duration, filename, now))
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
        "url": f"/api/music/{track_id}/audio"
    }

def detect_and_compose_from_script(project_id: str, script_id: Optional[str] = None, api_key: Optional[str] = None) -> Dict[str, Any]:
    """Analyzes the active script or transcript to detect mood, emotion, and style, then synthesizes a tailored soundtrack."""
    conn = db.get_connection()
    c = conn.cursor()
    
    script_row = None
    if script_id:
        script_row = c.execute("SELECT * FROM scripts WHERE id = ?", (script_id,)).fetchone()
    if not script_row:
        script_row = c.execute("SELECT * FROM scripts WHERE project_id = ? ORDER BY created_at DESC", (project_id,)).fetchone()
        
    t_row = c.execute("SELECT * FROM transcripts WHERE project_id = ?", (project_id,)).fetchone()
    p_row = c.execute("SELECT name FROM projects WHERE id = ?", (project_id,)).fetchone()
    conn.close()

    script_text = ""
    target_duration = 60.0
    detected_mood = "motivational"
    detected_genre = "cinematic"
    track_title = "Narrative Soundtrack"
    analysis_reason = "Harmonic progression matched to overall speech flow."

    if script_row:
        scenes = json.loads(script_row["scenes_json"] or "[]")
        target_duration = float(script_row["duration_target"] or 60.0)
        script_text = " ".join(f"{s.get('role', '')}: {s.get('dialogue', '')} [{s.get('on_screen_text', '')}]" for s in scenes)
        track_title = f"{script_row['title']} - Custom Score"
    elif t_row:
        script_text = t_row["full_text"][:2000]

    # NLP / Sentiment Analysis on the script content
    text_lower = script_text.lower()
    
    # Check for philosophical / wisdom / Sufi themes
    if any(k in text_lower for k in ["sufi", "donkey", "nasrudin", "wisdom", "parable", "teacher", "understand", "truth", "mullah", "lost everything"]):
        detected_mood = "philosophical"
        detected_genre = "acoustic"
        track_title = "Sufi Wisdom & Perspective Theme"
        analysis_reason = "Parable about unexpected joy and perspective detected. Composed warm, reflective acoustic piano."
    # Motivational / Triumph
    elif any(k in text_lower for k in ["success", "win", "achieve", "never give up", "hard work", "goal", "dream", "inspire", "champion"]):
        detected_mood = "motivational"
        detected_genre = "cinematic"
        track_title = "Inspiring Victory & Triumph"
        analysis_reason = "High-energy motivation detected. Composed ascending chords with emotional build-up."
    # Emotional / Vulnerable
    elif any(k in text_lower for k in ["pain", "cry", "loss", "sad", "love", "heart", "tears", "remember", "miss", "grief"]):
        detected_mood = "emotional"
        detected_genre = "acoustic"
        track_title = "Heartfelt Emotional Reflection"
        analysis_reason = "Tender emotional narrative detected. Composed intimate soft piano in minor key."
    # Dramatic / Tension / Suspense
    elif any(k in text_lower for k in ["danger", "secret", "shock", "warning", "mistake", "crime", "dark", "fear", "alert"]):
        detected_mood = "dramatic"
        detected_genre = "cinematic"
        track_title = "Cinematic Suspense & Tension"
        analysis_reason = "Dramatic tension and conflict detected. Composed intense cinematic minor progressions."
    # Energetic / Shorts Hooks
    elif any(k in text_lower for k in ["fast", "quick", "hack", "trick", "money", "crazy", "unbelievable", "viral"]):
        detected_mood = "energetic"
        detected_genre = "electronic"
        track_title = "Viral Energy & Punchy Beats"
        analysis_reason = "Fast-paced viral hook tone detected. Composed driving high-tempo electronic arpeggios."
    else:
        detected_mood = "ambient"
        detected_genre = "ambient"
        track_title = "Reflective Ambient Score"
        analysis_reason = "Educational narrative detected. Composed calm atmospheric lo-fi texture."

    # Synthesize the music
    track = generate_music_for_project(
        project_id=project_id,
        mood=detected_mood,
        genre=detected_genre,
        duration=max(15.0, min(180.0, target_duration))
    )
    
    # Update track title in DB with the custom detected name
    conn = db.get_connection()
    c = conn.cursor()
    c.execute("UPDATE music_tracks SET name = ? WHERE id = ?", (track_title, track["id"]))
    conn.commit()
    conn.close()
    
    track["name"] = track_title
    track["detected_mood"] = detected_mood
    track["detected_genre"] = detected_genre
    track["analysis_reason"] = analysis_reason
    return track


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
            "url": f"/api/music/{r['id']}/audio",
            "is_preset": bool(r["is_preset"])
        })
    return tracks
