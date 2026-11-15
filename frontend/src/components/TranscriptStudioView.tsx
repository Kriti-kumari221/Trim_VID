import React, { useState } from "react";
import { Mic, Search, Download, Edit2, Check, Play, Loader2, FileText, AlertCircle, Zap } from "lucide-react";
import { api, TranscriptData, TranscriptSegment } from "../api";

interface Props {
  projectId: string;
  transcript: TranscriptData | null;
  onSeek: (seconds: number) => void;
  onTranscriptUpdated: (t: TranscriptData) => void;
  defaultUrl?: string;
}

export function TranscriptStudioView({ projectId, transcript, onSeek, onTranscriptUpdated, defaultUrl = "" }: Props) {
  const [loading, setLoading] = useState(false);
  const [loadingMsg, setLoadingMsg] = useState("Running faster-whisper AI transcription...");
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [modelSize, setModelSize] = useState("base");
  const [language, setLanguage] = useState("auto");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editText, setEditText] = useState("");
  const [ytUrlInput, setYtUrlInput] = useState(defaultUrl);

  const handleFetchInstantYouTube = async () => {
    const targetUrl = ytUrlInput.trim();
    if (!targetUrl) {
      setError("Please paste a YouTube URL first.");
      return;
    }
    setLoading(true);
    setError("");
    setLoadingMsg("Fetching instant YouTube captions with timestamps (~1s)...");
    try {
      const res = await api.transcription.transcribeYouTube(projectId, targetUrl);
      onTranscriptUpdated(res);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  const handleTranscribe = async () => {
    setLoading(true);
    setError("");
    setLoadingMsg("Starting transcription engine...");
    try {
      const { task_id } = await api.transcription.transcribe(projectId, language, modelSize);
      setLoadingMsg("Extracting audio from video...");
      // Poll until done
      let attempts = 0;
      while (true) {
        await new Promise((r) => setTimeout(r, 2000));
        const task = await api.transcription.pollTask(task_id);
        attempts++;
        if (task.status === "done") {
          const result = await api.transcription.taskResult(task_id);
          onTranscriptUpdated(result);
          break;
        } else if (task.status === "failed") {
          throw new Error(task.error || "Transcription failed");
        }
        // Update loading message based on elapsed time
        if (attempts < 5) setLoadingMsg("Extracting audio from video...");
        else if (attempts < 15) setLoadingMsg("Detecting speech segments...");
        else setLoadingMsg("Almost done — finalizing timestamps...");
      }
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  const startEdit = (seg: TranscriptSegment) => {
    setEditingId(seg.id);
    setEditText(seg.text);
  };

  const saveEdit = async (segId: string) => {
    if (!transcript) return;
    const updated = transcript.segments.map((s) => (s.id === segId ? { ...s, text: editText } : s));
    try {
      const res = await api.transcription.update(projectId, updated);
      onTranscriptUpdated(res);
      setEditingId(null);
    } catch (e: any) {
      setError(e.message);
    }
  };

  const fmtTime = (s: number) => {
    const mins = Math.floor(s / 60);
    const secs = Math.floor(s % 60);
    const ms = Math.floor((s % 1) * 10);
    return `${String(mins).padStart(2, "0")}:${String(secs).padStart(2, "0")}.${ms}`;
  };

  const filteredSegments = (transcript?.segments || []).filter((s) =>
    search ? s.text.toLowerCase().includes(search.toLowerCase()) || s.speaker.toLowerCase().includes(search.toLowerCase()) : true
  );

  return (
    <div className="flex h-full flex-col bg-panel border-r border-line">
      {/* Top Controls */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line bg-ink/60 px-5 py-3">
        <div className="flex items-center gap-2">
          <Mic size={18} className="text-trim" />
          <h3 className="font-bold text-paper text-sm">Transcript Studio</h3>
          {transcript && (
            <span className="rounded bg-emerald-950/80 px-2 py-0.5 text-xs text-emerald-300 border border-emerald-500/30">
              {transcript.segments.length} sentences
            </span>
          )}
        </div>

        <div className="flex items-center gap-2">
          {!transcript ? (
            <div className="flex flex-wrap items-center gap-2">
              <select
                value={language}
                onChange={(e) => setLanguage(e.target.value)}
                className="rounded border border-line bg-panel px-2 py-1 text-xs text-paper focus:outline-none"
              >
                <option value="auto">Auto Language</option>
                <option value="en">English</option>
                <option value="hi">Hindi (हिंदी)</option>
                <option value="es">Spanish</option>
                <option value="fr">French</option>
              </select>

              <select
                value={modelSize}
                onChange={(e) => setModelSize(e.target.value)}
                className="rounded border border-line bg-panel px-2 py-1 text-xs text-paper focus:outline-none"
              >
                <option value="tiny">Tiny (Fastest)</option>
                <option value="base">Base (Balanced)</option>
                <option value="small">Small (High Accuracy)</option>
              </select>

              <button
                onClick={handleTranscribe}
                disabled={loading}
                className="inline-flex items-center gap-1.5 rounded border border-line bg-panel px-3 py-1 text-xs font-semibold text-paper hover:bg-ink disabled:opacity-40"
                title="Transcribes audio with faster-whisper AI"
              >
                {loading ? <Loader2 size={14} className="animate-spin" /> : <Mic size={14} />}
                Whisper Audio
              </button>
            </div>
          ) : (
            <div className="flex items-center gap-2">
              <button
                onClick={handleTranscribe}
                disabled={loading}
                className="text-xs text-mute hover:text-paper underline"
              >
                Regenerate
              </button>
              {/* Exports */}
              <div className="flex items-center gap-1 border-l border-line pl-2">
                <a
                  href={api.transcription.exportUrl(projectId, "srt")}
                  download
                  className="rounded border border-line bg-panel px-2 py-1 text-xs font-medium text-paper hover:bg-ink"
                >
                  SRT
                </a>
                <a
                  href={api.transcription.exportUrl(projectId, "vtt")}
                  download
                  className="rounded border border-line bg-panel px-2 py-1 text-xs font-medium text-paper hover:bg-ink"
                >
                  VTT
                </a>
                <a
                  href={api.transcription.exportUrl(projectId, "docx")}
                  download
                  className="rounded border border-line bg-panel px-2 py-1 text-xs font-medium text-paper hover:bg-ink"
                >
                  DOCX
                </a>
                <a
                  href={api.transcription.exportUrl(projectId, "txt")}
                  download
                  className="rounded border border-line bg-panel px-2 py-1 text-xs font-medium text-paper hover:bg-ink"
                >
                  TXT
                </a>
              </div>
            </div>
          )}
        </div>
      </div>

      {error && (
        <div className="mx-4 mt-3 flex items-center gap-2 rounded bg-red-950/60 p-2 text-xs text-red-200 border border-red-500/40">
          <AlertCircle size={14} className="text-red-400 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* Search Input */}
      {transcript && (
        <div className="border-b border-line/60 bg-ink/30 px-5 py-2">
          <div className="relative">
            <Search size={14} className="absolute left-3 top-2.5 text-mute" />
            <input
              type="text"
              placeholder="Search words, phrases, or speakers..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full rounded border border-line bg-panel py-1.5 pl-8 pr-3 text-xs text-paper focus:border-trim focus:outline-none"
            />
          </div>
        </div>
      )}

      {/* Transcript Table / Feed */}
      <div className="flex-1 overflow-y-auto p-4 space-y-2">
        {loading ? (
          <div className="flex h-64 flex-col items-center justify-center text-mute gap-3">
            <Loader2 size={28} className="animate-spin text-trim" />
            <span className="text-sm font-semibold">{loadingMsg}</span>
            <span className="text-xs">This may take a few minutes for long videos</span>
            <div className="mt-2 w-48 h-1.5 rounded bg-line overflow-hidden">
              <div className="h-full bg-trim animate-pulse rounded" style={{ width: "60%" }} />
            </div>
          </div>
        ) : !transcript ? (
          <div className="flex flex-col items-center justify-center p-6 max-w-xl mx-auto space-y-6">
            {/* Instant YouTube Captions Option */}
            <div className="w-full rounded-xl border border-amber-500/40 bg-gradient-to-b from-amber-950/20 to-panel p-5 text-center shadow-lg space-y-3">
              <div className="flex items-center justify-center gap-2 text-amber-300 font-bold text-sm">
                <Zap size={18} className="text-amber-400" />
                <span>Instant YouTube Transcript (1-Second Extraction)</span>
              </div>
              <p className="text-xs text-mute">
                Like Tactiq — fetches native YouTube timestamped captions instantly without waiting for audio processing.
              </p>
              <div className="flex gap-2 pt-1">
                <input
                  type="text"
                  placeholder="Paste YouTube URL (e.g. https://www.youtube.com/watch?v=...)"
                  value={ytUrlInput}
                  onChange={(e) => setYtUrlInput(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && handleFetchInstantYouTube()}
                  className="flex-1 rounded-md border border-line bg-ink px-3 py-2 text-xs text-paper focus:border-trim focus:outline-none"
                />
                <button
                  onClick={handleFetchInstantYouTube}
                  disabled={loading || !ytUrlInput.trim()}
                  className="inline-flex items-center gap-1.5 rounded-md bg-trim px-4 py-2 text-xs font-bold text-ink hover:bg-amber-300 disabled:opacity-40"
                >
                  <Zap size={14} />
                  Fetch (1s)
                </button>
              </div>
            </div>

            {/* Whisper Audio Option */}
            <div className="w-full rounded-xl border border-line bg-ink/40 p-5 text-center space-y-3">
              <Mic size={24} className="mx-auto text-mute/60" />
              <h4 className="font-semibold text-paper text-sm">Or AI Audio Speech-to-Text</h4>
              <p className="text-xs text-mute max-w-sm mx-auto">
                For local files, lectures, or videos without YouTube captions. Runs faster-whisper AI to transcribe speech directly from audio.
              </p>
              <button
                onClick={handleTranscribe}
                disabled={loading}
                className="inline-flex items-center gap-1.5 rounded-md border border-line bg-panel px-4 py-2 text-xs font-bold text-paper hover:bg-ink disabled:opacity-40"
              >
                <Mic size={14} />
                Run Whisper Speech-to-Text
              </button>
            </div>
          </div>
        ) : filteredSegments.length === 0 ? (
          <div className="py-8 text-center text-xs text-mute">No segments matching "{search}"</div>
        ) : (
          <div className="divide-y divide-line/40 rounded-lg border border-line bg-ink/40">
            {filteredSegments.map((s) => {
              const isEditing = editingId === s.id;
              return (
                <div key={s.id} className="group flex items-start gap-3 p-3 hover:bg-panel/80 transition-colors">
                  {/* Timestamp Playhead button */}
                  <button
                    onClick={() => onSeek(s.start)}
                    className="flex shrink-0 items-center gap-1 rounded bg-ink px-2 py-1 font-mono text-[11px] text-trim hover:bg-trim hover:text-ink transition-colors"
                  >
                    <Play size={10} />
                    {fmtTime(s.start)}
                  </button>

                  {/* Speaker Label */}
                  <span className="shrink-0 rounded bg-line/60 px-1.5 py-0.5 text-[10px] font-semibold text-mute">
                    {s.speaker}
                  </span>

                  {/* Text Content */}
                  <div className="min-w-0 flex-1">
                    {isEditing ? (
                      <div className="flex items-center gap-2">
                        <input
                          type="text"
                          value={editText}
                          onChange={(e) => setEditText(e.target.value)}
                          onKeyDown={(e) => e.key === "Enter" && saveEdit(s.id)}
                          className="flex-1 rounded border border-trim bg-panel px-2 py-1 text-xs text-paper focus:outline-none"
                          autoFocus
                        />
                        <button onClick={() => saveEdit(s.id)} className="rounded p-1 text-emerald-400 hover:bg-line">
                          <Check size={14} />
                        </button>
                      </div>
                    ) : (
                      <p
                        onClick={() => onSeek(s.start)}
                        className="text-xs text-paper/90 hover:text-paper cursor-pointer leading-relaxed"
                      >
                        {search ? (
                          s.text.split(new RegExp(`(${search})`, "gi")).map((part, i) =>
                            part.toLowerCase() === search.toLowerCase() ? (
                              <mark key={i} className="bg-trim text-ink px-0.5 rounded">
                                {part}
                              </mark>
                            ) : (
                              part
                            )
                          )
                        ) : (
                          s.text
                        )}
                      </p>
                    )}
                  </div>

                  {/* Edit button */}
                  {!isEditing && (
                    <button
                      onClick={() => startEdit(s)}
                      className="opacity-0 group-hover:opacity-100 rounded p-1 text-mute hover:text-paper transition-opacity"
                    >
                      <Edit2 size={12} />
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
