import React, { useState, useEffect } from "react";
import { Music, Play, Pause, Volume2, Sparkles, Check, Download, Loader2, AlertCircle, Wand2, FileText } from "lucide-react";
import { api, apiUrl, MusicTrack, Project } from "../api";

interface Props {
  project?: Project;
  projectId: string;
  selectedTrackId: string | null;
  onSelectTrack: (trackId: string | null) => void;
}

export function MusicStudioView({ project, projectId, selectedTrackId, onSelectTrack }: Props) {
  const [tracks, setTracks] = useState<MusicTrack[]>([]);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [detecting, setDetecting] = useState(false);
  const [error, setError] = useState("");
  const [mood, setMood] = useState("emotional");
  const [genre, setGenre] = useState("cinematic");
  const [duration, setDuration] = useState(60);
  const [playingId, setPlayingId] = useState<string | null>(null);
  const [audioEl, setAudioEl] = useState<HTMLAudioElement | null>(null);

  const scripts = project?.scripts || [];
  const [selectedScriptId, setSelectedScriptId] = useState<string>(scripts[0]?.id || "");
  const [lastDetected, setLastDetected] = useState<{ mood?: string; reason?: string } | null>(null);

  useEffect(() => {
    if (scripts.length > 0 && !selectedScriptId) {
      setSelectedScriptId(scripts[0].id);
    }
  }, [scripts]);

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

  const handleDetectAndCompose = async () => {
    setDetecting(true);
    setError("");
    setLastDetected(null);
    try {
      const apiKey = localStorage.getItem("clip_gemini_key") || undefined;
      const newTrack = await api.music.composeFromScript(projectId, selectedScriptId || undefined, apiKey);
      setTracks((prev) => [newTrack, ...prev]);
      onSelectTrack(newTrack.id);
      if (newTrack.detected_mood || newTrack.analysis_reason) {
        setLastDetected({
          mood: newTrack.detected_mood || newTrack.mood,
          reason: newTrack.analysis_reason || `Tailored soundtrack for ${newTrack.name}`,
        });
      }
    } catch (e: any) {
      setError(e.message || "Failed to analyze script and compose music.");
    } finally {
      setDetecting(false);
    }
  };

  const handleGenerate = async () => {
    setGenerating(true);
    setError("");
    try {
      const newTrack = await api.music.generate(mood, genre, duration, projectId);
      setTracks((prev) => [newTrack, ...prev]);
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
        <div className="mx-4 mt-3 flex items-center gap-2 rounded bg-red-950/60 p-2.5 text-xs text-red-200 border border-red-500/40">
          <AlertCircle size={14} className="text-red-400 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* Script-to-Music Auto Composer Card */}
      <div className="border-b border-line/60 bg-gradient-to-br from-purple-950/30 via-ink/60 to-pink-950/20 p-5 space-y-3">
        <div className="flex items-center gap-2">
          <div className="flex h-6 w-6 items-center justify-center rounded-full bg-pink-500/20 text-pink-400">
            <Wand2 size={13} />
          </div>
          <div>
            <h4 className="text-xs font-bold uppercase tracking-wider text-pink-300">
              AI Script-to-Music Composer
            </h4>
            <p className="text-[11px] text-mute">
              Analyzes your short script or video transcript, detects emotional tone (wisdom, motivational, suspense, grief, cinematic), and composes a custom soundtrack.
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-3 pt-1">
          {scripts.length > 0 ? (
            <div className="flex items-center gap-2">
              <FileText size={13} className="text-mute" />
              <select
                value={selectedScriptId}
                onChange={(e) => setSelectedScriptId(e.target.value)}
                className="rounded border border-line bg-panel px-3 py-1.5 text-xs text-paper focus:outline-none"
              >
                {scripts.map((s) => (
                  <option key={s.id} value={s.id}>
                    Script: {s.title} ({s.scenes.length} scenes)
                  </option>
                ))}
              </select>
            </div>
          ) : (
            <span className="text-[11px] text-mute italic">
              Using project transcript & narrative structure
            </span>
          )}

          <button
            onClick={handleDetectAndCompose}
            disabled={detecting}
            className="inline-flex items-center gap-1.5 rounded bg-gradient-to-r from-pink-500 via-purple-600 to-indigo-600 px-4 py-2 text-xs font-bold text-white shadow-md shadow-pink-500/20 hover:opacity-95 disabled:opacity-40 transition-all"
          >
            {detecting ? (
              <>
                <Loader2 size={14} className="animate-spin" />
                Analyzing Script & Composing...
              </>
            ) : (
              <>
                <Sparkles size={14} />
                Auto-Detect & Compose from Script
              </>
            )}
          </button>
        </div>

        {lastDetected && (
          <div className="mt-2 rounded-lg border border-pink-500/30 bg-pink-950/30 p-2.5 text-xs">
            <div className="flex items-center gap-1.5 font-semibold text-pink-300">
              <Sparkles size={13} />
              <span>Detected Emotional Tone: {lastDetected.mood}</span>
            </div>
            <p className="mt-1 text-[11px] text-pink-200/80 leading-relaxed">
              {lastDetected.reason}
            </p>
          </div>
        )}
      </div>

      {/* Manual Synthesizer (Optional / Secondary) */}
      <div className="border-b border-line/60 bg-ink/30 px-5 py-4 space-y-3">
        <details className="group">
          <summary className="cursor-pointer text-xs font-bold uppercase tracking-wider text-mute hover:text-paper flex items-center justify-between select-none">
            <span>Manual Synth Controls (Preset Moods)</span>
            <span className="text-[10px] text-mute group-open:rotate-180 transition-transform">▼</span>
          </summary>

          <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-3">
            <div>
              <label className="block text-[11px] text-mute mb-1 font-medium">Preset Mood</label>
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

          <div className="mt-3">
            <button
              onClick={handleGenerate}
              disabled={generating}
              className="inline-flex items-center gap-1.5 rounded border border-pink-500/40 bg-pink-950/30 px-3 py-1.5 text-xs font-semibold text-pink-200 hover:bg-pink-950/60 disabled:opacity-40"
            >
              {generating ? <Loader2 size={13} className="animate-spin" /> : <Music size={13} />}
              Synthesize Selected Preset
            </button>
          </div>
        </details>
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
            <span>No music generated yet. Click "Auto-Detect & Compose from Script" above!</span>
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
                    isSelected ? "border-pink-500/70 bg-pink-950/20 shadow-sm" : "border-line bg-ink/40 hover:bg-panel"
                  }`}
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <button
                      onClick={() => togglePlay(t)}
                      className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-line/60 text-paper hover:bg-pink-600 hover:text-white transition-colors"
                      title={isPlaying ? "Pause" : "Play preview"}
                    >
                      {isPlaying ? <Pause size={14} /> : <Play size={14} className="ml-0.5" />}
                    </button>

                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <h5 className="font-bold text-xs text-paper truncate">{t.name}</h5>
                        {t.detected_mood && (
                          <span className="rounded bg-pink-500/20 px-1.5 py-0.5 text-[9px] font-bold text-pink-300 uppercase shrink-0">
                            {t.detected_mood}
                          </span>
                        )}
                      </div>
                      <p className="text-[10px] text-mute truncate mt-0.5">
                        {t.mood} • {Math.round(t.duration)}s • 44.1kHz Stereo
                        {t.analysis_reason && (
                          <span className="text-pink-300/80 ml-1.5 font-normal">
                            — {t.analysis_reason}
                          </span>
                        )}
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 shrink-0 ml-3">
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
