import React, { useState } from "react";
import { Mic, Search, Download, Edit2, Check, Play, Loader2, FileText, AlertCircle } from "lucide-react";
import { api, TranscriptData, TranscriptSegment } from "../api";

interface Props {
  projectId: string;
  transcript: TranscriptData | null;
  onSeek: (seconds: number) => void;
  onTranscriptUpdated: (t: TranscriptData) => void;
}

export function TranscriptStudioView({ projectId, transcript, onSeek, onTranscriptUpdated }: Props) {
  const [loading, setLoading] = useState(false);
  const [loadingMsg, setLoadingMsg] = useState("Running faster-whisper AI transcription...");
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [modelSize, setModelSize] = useState("base");
  const [language, setLanguage] = useState("auto");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editText, setEditText] = useState("");

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
            <div className="flex items-center gap-2">
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
                className="inline-flex items-center gap-1.5 rounded bg-trim px-3 py-1 text-xs font-bold text-ink hover:bg-amber-300 disabled:opacity-40"
              >
                {loading ? <Loader2 size={14} className="animate-spin" /> : <Mic size={14} />}
                Generate Speech-to-Text
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
          <div className="flex h-64 flex-col items-center justify-center text-center p-6">
            <Mic size={40} className="text-mute/40 mb-3" />
            <h4 className="font-semibold text-paper text-sm">No Transcript Generated Yet</h4>
            <p className="text-xs text-mute mt-1 max-w-sm">
              Click "Generate Speech-to-Text" to transcribe the entire video with timestamps, sentence alignment, and speaker detection.
            </p>
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
