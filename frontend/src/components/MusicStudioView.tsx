import React, { useState, useEffect } from "react";
import { Music, Play, Pause, Volume2, Sparkles, Check, Download, Loader2, AlertCircle } from "lucide-react";
import { api, apiUrl, MusicTrack } from "../api";

interface Props {
  projectId: string;
  selectedTrackId: string | null;
  onSelectTrack: (trackId: string | null) => void;
}

export function MusicStudioView({ projectId, selectedTrackId, onSelectTrack }: Props) {
  const [tracks, setTracks] = useState<MusicTrack[]>([]);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState("");
  const [mood, setMood] = useState("emotional");
  const [genre, setGenre] = useState("cinematic");
  const [duration, setDuration] = useState(60);
  const [playingId, setPlayingId] = useState<string | null>(null);
  const [audioEl, setAudioEl] = useState<HTMLAudioElement | null>(null);

  const loadTracks = () => {
    setLoading(true);
    api.music.list(projectId)
      .then(setTracks)
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    loadTracks();
  }, [projectId]);

  const handleGenerate = async () => {
    setGenerating(true);
    setError("");
    try {
      const newTrack = await api.music.generate(mood, genre, duration, projectId);
      setTracks([newTrack, ...tracks]);
      onSelectTrack(newTrack.id);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setGenerating(false);
    }
  };

  const togglePlay = (t: MusicTrack) => {
    if (playingId === t.id && audioEl) {
      audioEl.pause();
      setPlayingId(null);
    } else {
      if (audioEl) audioEl.pause();
      const a = new Audio(apiUrl(t.url));
      a.volume = 0.5;
      a.play();
      a.onended = () => setPlayingId(null);
      setAudioEl(a);
      setPlayingId(t.id);
    }
  };

  return (
    <div className="flex h-full flex-col bg-panel border-r border-line">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-line bg-ink/60 px-5 py-3">
        <div className="flex items-center gap-2">
          <Music size={18} className="text-pink-400" />
          <h3 className="font-bold text-paper text-sm">AI Instrumental Music Studio</h3>
        </div>
      </div>

      {error && (
        <div className="mx-4 mt-3 flex items-center gap-2 rounded bg-red-950/60 p-2 text-xs text-red-200 border border-red-500/40">
          <AlertCircle size={14} className="text-red-400 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* Generator Form */}
      <div className="border-b border-line/60 bg-ink/40 p-5 space-y-4">
        <h4 className="text-xs font-bold uppercase tracking-wider text-mute">Synthesize Background Music</h4>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <div>
            <label className="block text-[11px] text-mute mb-1 font-medium">Script Mood</label>
            <select
              value={mood}
              onChange={(e) => setMood(e.target.value)}
              className="w-full rounded border border-line bg-panel px-3 py-1.5 text-xs text-paper focus:outline-none"
            >
              <option value="emotional">Emotional Storytelling (Soft Piano)</option>
              <option value="motivational">Motivational (Inspirational Build-up)</option>
              <option value="educational">Educational (Light Ambient / Lo-Fi)</option>
              <option value="dramatic">Dramatic Tension (Cinematic Strings)</option>
              <option value="energetic">Energetic (High Tempo Beats)</option>
            </select>
          </div>

          <div>
            <label className="block text-[11px] text-mute mb-1 font-medium">Genre / Texture</label>
            <select
              value={genre}
              onChange={(e) => setGenre(e.target.value)}
              className="w-full rounded border border-line bg-panel px-3 py-1.5 text-xs text-paper focus:outline-none"
            >
              <option value="cinematic">Cinematic Score</option>
              <option value="acoustic">Acoustic Piano</option>
              <option value="ambient">Ambient Atmospheric</option>
              <option value="electronic">Electronic Lo-Fi</option>
            </select>
          </div>

          <div>
            <label className="block text-[11px] text-mute mb-1 font-medium">Duration: {duration}s</label>
            <input
              type="range"
              min={15}
              max={180}
              step={5}
              value={duration}
              onChange={(e) => setDuration(Number(e.target.value))}
              className="w-full accent-pink-500 mt-2"
            />
          </div>
        </div>

        <button
          onClick={handleGenerate}
          disabled={generating}
          className="inline-flex items-center gap-1.5 rounded bg-gradient-to-r from-pink-500 to-purple-600 px-4 py-2 text-xs font-bold text-white hover:opacity-95 disabled:opacity-40"
        >
          {generating ? <Loader2 size={14} className="animate-spin" /> : <Sparkles size={14} />}
          Generate Instrumental Music
        </button>
      </div>

      {/* Tracks Library */}
      <div className="flex-1 overflow-y-auto p-5">
        <h4 className="text-xs font-bold uppercase tracking-wider text-mute mb-3">
          Available Background Tracks ({tracks.length})
        </h4>

        {loading ? (
          <div className="flex h-32 items-center justify-center text-mute gap-2 text-xs">
            <Loader2 className="animate-spin" size={16} />
            Loading tracks...
          </div>
        ) : tracks.length === 0 ? (
          <div className="flex h-32 flex-col items-center justify-center text-center text-xs text-mute">
            <Music size={28} className="text-mute/40 mb-2" />
            <span>No music generated yet. Create one above!</span>
          </div>
        ) : (
          <div className="space-y-2">
            {tracks.map((t) => {
              const isSelected = t.id === selectedTrackId;
              const isPlaying = t.id === playingId;
              return (
                <div
                  key={t.id}
                  className={`flex items-center justify-between rounded-lg border p-3 transition-colors ${
                    isSelected ? "border-pink-500/70 bg-pink-950/20" : "border-line bg-ink/40 hover:bg-panel"
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <button
                      onClick={() => togglePlay(t)}
                      className="flex h-8 w-8 items-center justify-center rounded-full bg-line/60 text-paper hover:bg-pink-600 hover:text-white transition-colors"
                    >
                      {isPlaying ? <Pause size={14} /> : <Play size={14} className="ml-0.5" />}
                    </button>

                    <div>
                      <h5 className="font-bold text-xs text-paper">{t.name}</h5>
                      <p className="text-[10px] text-mute">
                        Mood: {t.mood} • {Math.round(t.duration)}s • 44.1kHz Stereo
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    <a
                      href={apiUrl(t.url)}
                      download={`${t.name.replace(/\s+/g, "_")}.mp3`}
                      className="inline-flex items-center gap-1 rounded border border-line bg-ink px-2.5 py-1 text-xs text-mute hover:text-paper hover:border-mute transition-colors"
                      title="Download MP3"
                    >
                      <Download size={12} />
                      MP3
                    </a>

                    <button
                      onClick={() => onSelectTrack(isSelected ? null : t.id)}
                      className={`inline-flex items-center gap-1 rounded px-3 py-1 text-xs font-bold transition-colors ${
                        isSelected
                          ? "bg-pink-600 text-white"
                          : "border border-line bg-ink text-mute hover:text-paper"
                      }`}
                    >
                      {isSelected ? (
                        <>
                          <Check size={12} />
                          Selected for Mix
                        </>
                      ) : (
                        "Select Track"
                      )}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
