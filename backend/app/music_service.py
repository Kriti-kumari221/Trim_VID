import math
import struct
import time
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
    "emotional": [261.63, 293.66, 329.63, 392.00, 440.00, 523.25], # C Major / A Minor pentatonic
    "motivational": [293.66, 329.63, 369.99, 440.00, 493.88, 587.33], # D Major uplifting
    "educational": [261.63, 311.13, 349.23, 392.00, 466.16, 523.25], # Chill Lo-Fi / Ambient
    "dramatic": [220.00, 246.94, 261.63, 293.66, 329.63, 349.23], # A Minor cinematic
    "energetic": [329.63, 369.99, 392.00, 440.00, 493.88, 587.33]  # E Minor high energy
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
