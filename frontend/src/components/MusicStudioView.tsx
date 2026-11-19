import React, { useState, useEffect } from "react";
import {
  Music,
  Play,
  Pause,
  Volume2,
  VolumeX,
  Sparkles,
  Check,
  Download,
  Loader2,
  AlertCircle,
  Wand2,
  FileText,
  Sliders,
  Trash2,
  RefreshCw,
  Edit3,
  X,
} from "lucide-react";
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

  // Script Mode: "project" (from project scripts/transcript) or "custom" (pasted script)
  const [scriptMode, setScriptMode] = useState<"project" | "custom">("project");
  const [customScriptText, setCustomScriptText] = useState("");

  const scripts = project?.scripts || [];
  const [selectedScriptId, setSelectedScriptId] = useState<string>(scripts[0]?.id || "");
  const [lastDetected, setLastDetected] = useState<{ mood?: string; reason?: string } | null>(null);

  // Auditing / Fine-Tuning state
  const [auditingTrack, setAuditingTrack] = useState<MusicTrack | null>(null);
  const [auditName, setAuditName] = useState("");
  const [auditMood, setAuditMood] = useState("philosophical");
  const [auditGenre, setAuditGenre] = useState("cinematic");
  const [auditTempo, setAuditTempo] = useState<number>(80);
  const [auditEnergy, setAuditEnergy] = useState<"low" | "medium" | "high">("medium");
  const [auditSaving, setAuditSaving] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  useEffect(() => {
    if (scripts.length > 0 && !selectedScriptId) {
      setSelectedScriptId(scripts[0].id);
    }
  }, [scripts]);

  const loadTracks = () => {
    setLoading(true);
    api.music
      .list(projectId)
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
      const scriptId = scriptMode === "project" ? (selectedScriptId || undefined) : undefined;
      const scriptText = scriptMode === "custom" ? customScriptText.trim() : undefined;

      if (scriptMode === "custom" && !scriptText) {
        throw new Error("Please paste or type a script text first.");
      }

      const newTrack = await api.music.composeFromScript(
        projectId,
        scriptId,
        apiKey,
        scriptText
      );
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
      a.volume = 0.55;
      a.play();
      a.onended = () => setPlayingId(null);
      setAudioEl(a);
      setPlayingId(t.id);
    }
  };

  const openAuditModal = (t: MusicTrack) => {
    setAuditingTrack(t);
    setAuditName(t.name);
    setAuditMood(t.mood || "philosophical");
    setAuditGenre(t.genre || "cinematic");
    setAuditTempo(typeof t.tempo === "number" ? t.tempo : parseInt(String(t.tempo || 80), 10) || 80);
    setAuditEnergy((t.energy as "low" | "medium" | "high") || "medium");
  };

  const handleSaveAudit = async (reRender: boolean = true) => {
    if (!auditingTrack) return;
    setAuditSaving(true);
    setError("");
    try {
      const updated = await api.music.auditTrack(auditingTrack.id, {
        name: auditName,
        mood: auditMood,
        genre: auditGenre,
        tempo: auditTempo,
        energy: auditEnergy,
        re_render: reRender,
      });

      setTracks((prev) => prev.map((t) => (t.id === updated.id ? updated : t)));
      if (playingId === updated.id && audioEl) {
        audioEl.pause();
        setPlayingId(null);
      }
      setAuditingTrack(null);
    } catch (e: any) {
      setError(e.message || "Failed to audit and re-render music.");
    } finally {
      setAuditSaving(false);
    }
  };

  const handleDeleteTrack = async (trackId: string) => {
    if (!confirm("Are you sure you want to remove this music track?")) return;
    setDeletingId(trackId);
    try {
      await api.music.deleteTrack(trackId);
      setTracks((prev) => prev.filter((t) => t.id !== trackId));
      if (selectedTrackId === trackId) {
        onSelectTrack(null);
      }
      if (playingId === trackId && audioEl) {
        audioEl.pause();
        setPlayingId(null);
      }
    } catch (e: any) {
      setError(e.message || "Failed to delete track");
    } finally {
      setDeletingId(null);
    }
  };

  return (
    <div className="flex h-full flex-col bg-panel border-r border-line relative">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-line bg-ink/60 px-5 py-3">
        <div className="flex items-center gap-2">
          <Music size={18} className="text-pink-400" />
          <h3 className="font-bold text-paper text-sm">AI Instrumental Music Studio</h3>
          <span className="rounded bg-pink-500/20 px-2 py-0.5 text-[10px] font-bold text-pink-300">
            Script Intelligence & Auditing
          </span>
        </div>

        {/* Global Optional Music (Mute / None) Status */}
        <div className="flex items-center gap-2">
          {selectedTrackId ? (
            <button
              onClick={() => onSelectTrack(null)}
              className="inline-flex items-center gap-1.5 rounded border border-red-500/40 bg-red-950/30 px-2.5 py-1 text-xs font-semibold text-red-300 hover:bg-red-900/50 transition-colors"
              title="Click to disable background music in exported video"
            >
              <VolumeX size={13} />
              Music Active (Click to Mute / Optional)
            </button>
          ) : (
            <span className="inline-flex items-center gap-1.5 rounded border border-line bg-ink/50 px-2.5 py-1 text-xs text-mute font-medium">
              <VolumeX size={13} className="text-mute/70" />
              Music is Optional / Muted
            </span>
          )}
        </div>
      </div>

      {error && (
        <div className="mx-4 mt-3 flex items-center gap-2 rounded bg-red-950/60 p-2.5 text-xs text-red-200 border border-red-500/40">
          <AlertCircle size={14} className="text-red-400 shrink-0" />
          <span className="flex-1">{error}</span>
          <button onClick={() => setError("")} className="text-red-400 hover:text-white">
            <X size={14} />
          </button>
        </div>
      )}

      {/* Script-to-Music Auto Composer Card */}
      <div className="border-b border-line/60 bg-gradient-to-br from-purple-950/30 via-ink/60 to-pink-950/20 p-5 space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="flex h-6 w-6 items-center justify-center rounded-full bg-pink-500/20 text-pink-400">
              <Wand2 size={13} />
            </div>
            <div>
              <h4 className="text-xs font-bold uppercase tracking-wider text-pink-300">
                Instant Music from Script Analysis (Gemini 2.5)
              </h4>
              <p className="text-[11px] text-mute">
                Analyzes your discourse or script, detects emotional tempo & depth, and composes layered instrumentation instantly.
              </p>
            </div>
          </div>

          {/* Script Input Mode Toggle */}
          <div className="flex rounded-lg border border-line bg-panel p-0.5 text-xs">
            <button
              onClick={() => setScriptMode("project")}
              className={`px-3 py-1 font-semibold rounded-md transition-colors ${
                scriptMode === "project"
                  ? "bg-pink-600 text-white"
                  : "text-mute hover:text-paper"
              }`}
            >
              Project Script / Transcript
            </button>
            <button
              onClick={() => setScriptMode("custom")}
              className={`px-3 py-1 font-semibold rounded-md transition-colors ${
                scriptMode === "custom"
                  ? "bg-pink-600 text-white"
                  : "text-mute hover:text-paper"
              }`}
            >
              Paste Custom Script
            </button>
          </div>
        </div>

        {scriptMode === "project" ? (
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
                Using project transcript & discourse structure automatically
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
                  Analyze Script & Generate Instant Music
                </>
              )}
            </button>
          </div>
        ) : (
          <div className="space-y-2 pt-1">
            <textarea
              value={customScriptText}
              onChange={(e) => setCustomScriptText(e.target.value)}
              placeholder="Paste discourse dialogue, speech, or short script here... e.g. 'Thoughtful people, when they reflect on life and attachment, realize that real freedom comes from clarity...'"
              rows={3}
              className="w-full rounded-lg border border-line bg-panel p-2.5 text-xs text-paper placeholder-mute/60 focus:border-pink-500 focus:outline-none resize-none font-sans"
            />
            <div className="flex justify-end">
              <button
                onClick={handleDetectAndCompose}
                disabled={detecting || !customScriptText.trim()}
                className="inline-flex items-center gap-1.5 rounded bg-gradient-to-r from-pink-500 via-purple-600 to-indigo-600 px-4 py-2 text-xs font-bold text-white shadow-md shadow-pink-500/20 hover:opacity-95 disabled:opacity-40 transition-all"
              >
                {detecting ? (
                  <>
                    <Loader2 size={14} className="animate-spin" />
                    Analyzing Custom Script & Composing...
                  </>
                ) : (
                  <>
                    <Sparkles size={14} />
                    Analyze & Compose Music Now
                  </>
                )}
              </button>
            </div>
          </div>
        )}

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

      {/* Manual Synthesizer (Preset Moods) */}
      <div className="border-b border-line/60 bg-ink/30 px-5 py-3 space-y-3">
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
                <option value="philosophical">Philosophical & Reflective (Slow Pad + Chime)</option>
                <option value="motivational">Motivational (Inspirational Build-up)</option>
                <option value="emotional">Emotional Storytelling (Soft Piano)</option>
                <option value="dramatic">Dramatic Tension (Cinematic Bass & Strings)</option>
                <option value="energetic">Energetic (High Tempo Beats)</option>
                <option value="ambient">Serene Ambient (Lo-Fi Calm)</option>
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
        <div className="flex items-center justify-between mb-3">
          <h4 className="text-xs font-bold uppercase tracking-wider text-mute">
            Soundtrack Library ({tracks.length} Tracks)
          </h4>

          {/* Quick optional toggle */}
          <button
            onClick={() => onSelectTrack(null)}
            className={`text-xs px-2.5 py-1 rounded border transition-colors ${
              selectedTrackId === null
                ? "border-amber-500/70 bg-amber-500/20 text-amber-300 font-bold"
                : "border-line text-mute hover:text-paper"
            }`}
          >
            No Background Music (Mute)
          </button>
        </div>

        {loading ? (
          <div className="flex h-32 items-center justify-center text-mute gap-2 text-xs">
            <Loader2 className="animate-spin" size={16} />
            Loading tracks...
          </div>
        ) : tracks.length === 0 ? (
          <div className="flex h-32 flex-col items-center justify-center text-center text-xs text-mute border border-dashed border-line rounded-xl">
            <Music size={28} className="text-mute/40 mb-2" />
            <span>No music generated yet. Click "Analyze Script & Generate Instant Music" above!</span>
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
                      className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full transition-colors ${
                        isPlaying
                          ? "bg-pink-600 text-white shadow-md shadow-pink-500/30"
                          : "bg-line/60 text-paper hover:bg-pink-600 hover:text-white"
                      }`}
                      title={isPlaying ? "Pause" : "Play preview"}
                    >
                      {isPlaying ? <Pause size={15} /> : <Play size={15} className="ml-0.5" />}
                    </button>

                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <h5 className="font-bold text-xs text-paper truncate">{t.name}</h5>
                        {t.detected_mood && (
                          <span className="rounded bg-pink-500/20 px-1.5 py-0.5 text-[9px] font-bold text-pink-300 uppercase shrink-0">
                            {t.detected_mood}
                          </span>
                        )}
                        {t.tempo && (
                          <span className="rounded bg-purple-500/20 px-1.5 py-0.5 text-[9px] font-bold text-purple-300 shrink-0">
                            {t.tempo} BPM
                          </span>
                        )}
                        {t.energy && (
                          <span className="rounded bg-indigo-500/20 px-1.5 py-0.5 text-[9px] font-bold text-indigo-300 uppercase shrink-0">
                            {t.energy} energy
                          </span>
                        )}
                      </div>
                      <p className="text-[10px] text-mute truncate mt-0.5">
                        {t.mood} • {t.genre || "cinematic"} • {Math.round(t.duration)}s • 44.1kHz Stereo
                        {t.analysis_reason && (
                          <span className="text-pink-300/80 ml-1.5 font-normal">
                            — {t.analysis_reason}
                          </span>
                        )}
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 shrink-0 ml-3">
                    {/* Auditing / Fine-Tune Button */}
                    <button
                      onClick={() => openAuditModal(t)}
                      className="inline-flex items-center gap-1 rounded border border-purple-500/40 bg-purple-950/30 px-2 py-1 text-xs text-purple-200 hover:bg-purple-950/60 transition-colors"
                      title="Audit, tweak BPM, energy or mood and re-render audio"
                    >
                      <Sliders size={12} />
                      Audit / Fine-Tune
                    </button>

                    <a
                      href={apiUrl(t.url)}
                      download={`${t.name.replace(/\s+/g, "_")}.mp3`}
                      className="inline-flex items-center gap-1 rounded border border-line bg-ink px-2 py-1 text-xs text-mute hover:text-paper hover:border-mute transition-colors"
                      title="Download MP3"
                    >
                      <Download size={12} />
                      MP3
                    </a>

                    <button
                      onClick={() => handleDeleteTrack(t.id)}
                      disabled={deletingId === t.id}
                      className="inline-flex items-center justify-center h-7 w-7 rounded border border-line bg-ink text-mute hover:text-red-400 hover:border-red-500/40 transition-colors"
                      title="Delete track"
                    >
                      {deletingId === t.id ? <Loader2 size={12} className="animate-spin" /> : <Trash2 size={12} />}
                    </button>

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
                          Selected
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

      {/* Audition & Fine-Tuning Modal / Drawer */}
      {auditingTrack && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm">
          <div className="w-full max-w-lg rounded-xl border border-purple-500/40 bg-ink p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b border-line pb-3">
              <div className="flex items-center gap-2">
                <Sliders size={18} className="text-purple-400" />
                <h3 className="text-sm font-bold text-paper">
                  Track Auditor & Customizer
                </h3>
              </div>
              <button
                onClick={() => setAuditingTrack(null)}
                className="text-mute hover:text-paper"
              >
                <X size={16} />
              </button>
            </div>

            <p className="text-xs text-mute">
              Audition and fine-tune your soundtrack. Change the tempo (BPM), mood style, or energy level, and re-synthesize high-fidelity audio on the fly.
            </p>

            <div className="space-y-3">
              <div>
                <label className="block text-[11px] font-semibold text-mute mb-1">Track Title</label>
                <input
                  type="text"
                  value={auditName}
                  onChange={(e) => setAuditName(e.target.value)}
                  className="w-full rounded border border-line bg-panel px-3 py-1.5 text-xs text-paper focus:outline-none focus:border-purple-500"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] font-semibold text-mute mb-1">Mood Character</label>
                  <select
                    value={auditMood}
                    onChange={(e) => setAuditMood(e.target.value)}
                    className="w-full rounded border border-line bg-panel px-3 py-1.5 text-xs text-paper focus:outline-none focus:border-purple-500"
                  >
                    <option value="philosophical">Philosophical & Wisdom</option>
                    <option value="reflective">Deeply Reflective</option>
                    <option value="emotional">Emotional & Heartfelt</option>
                    <option value="motivational">Motivational & Elevating</option>
                    <option value="dramatic">Dramatic Tension</option>
                    <option value="energetic">Energetic & Fast</option>
                    <option value="ambient">Serene Ambient</option>
                  </select>
                </div>

                <div>
                  <label className="block text-[11px] font-semibold text-mute mb-1">Instrumentation Genre</label>
                  <select
                    value={auditGenre}
                    onChange={(e) => setAuditGenre(e.target.value)}
                    className="w-full rounded border border-line bg-panel px-3 py-1.5 text-xs text-paper focus:outline-none focus:border-purple-500"
                  >
                    <option value="cinematic">Cinematic Multi-layer</option>
                    <option value="acoustic">Acoustic Strings & Piano</option>
                    <option value="ambient">Ambient Atmospheric Pad</option>
                    <option value="electronic">Lo-Fi Pulse & Beat</option>
                  </select>
                </div>
              </div>

              <div>
                <div className="flex justify-between items-center text-[11px] font-semibold text-mute mb-1">
                  <span>Tempo (BPM): <strong className="text-purple-300">{auditTempo} BPM</strong></span>
                  <span className="text-[10px] text-mute">
                    {auditTempo < 70 ? "Very Slow / Contemplative" : auditTempo < 95 ? "Moderate Flow" : "Fast / Driving"}
                  </span>
                </div>
                <input
                  type="range"
                  min={55}
                  max={135}
                  step={1}
                  value={auditTempo}
                  onChange={(e) => setAuditTempo(Number(e.target.value))}
                  className="w-full accent-purple-500"
                />
              </div>

              <div>
                <label className="block text-[11px] font-semibold text-mute mb-1">Dynamic Energy Level</label>
                <div className="grid grid-cols-3 gap-2">
                  {(["low", "medium", "high"] as const).map((lvl) => (
                    <button
                      key={lvl}
                      type="button"
                      onClick={() => setAuditEnergy(lvl)}
                      className={`rounded-lg border px-3 py-1.5 text-xs font-bold capitalize transition-colors ${
                        auditEnergy === lvl
                          ? "border-purple-500 bg-purple-600 text-white"
                          : "border-line bg-panel text-mute hover:text-paper"
                      }`}
                    >
                      {lvl} Energy
                    </button>
                  ))}
                </div>
              </div>

              {auditingTrack.analysis_reason && (
                <div className="rounded border border-purple-500/20 bg-purple-950/20 p-2 text-[11px] text-purple-200">
                  <span className="font-semibold text-purple-300">Original AI Script Analysis: </span>
                  {auditingTrack.analysis_reason}
                </div>
              )}
            </div>

            <div className="flex items-center justify-between border-t border-line pt-3">
              <button
                type="button"
                onClick={() => handleSaveAudit(false)}
                disabled={auditSaving}
                className="text-xs text-mute hover:text-paper"
              >
                Save Details Only
              </button>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setAuditingTrack(null)}
                  className="rounded border border-line px-3 py-1.5 text-xs text-mute hover:text-paper"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={() => handleSaveAudit(true)}
                  disabled={auditSaving}
                  className="inline-flex items-center gap-1.5 rounded bg-gradient-to-r from-purple-600 to-pink-600 px-4 py-1.5 text-xs font-bold text-white shadow-md shadow-purple-500/20 hover:opacity-95 disabled:opacity-40"
                >
                  {auditSaving ? (
                    <>
                      <Loader2 size={13} className="animate-spin" />
                      Re-rendering Audio...
                    </>
                  ) : (
                    <>
                      <RefreshCw size={13} />
                      Apply & Re-Synthesize Audio
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
