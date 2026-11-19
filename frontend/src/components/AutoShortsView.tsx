import React, { useState, useEffect } from "react";
import {
  Sparkles, Play, Pause, Check, X, RefreshCw, Download, Video,
  Layers, Sliders, ChevronRight, AlertCircle, CheckCircle2, Clock,
  FileText, Edit3, Type, ArrowRight, Eye, Plus
} from "lucide-react";
import { api, apiUrl } from "../api";

interface AutoShortsViewProps {
  projectId: string;
  defaultUrl?: string;
  onClipsGenerated?: () => void;
  onSeek?: (t: number) => void;
}

export function AutoShortsView({ projectId, defaultUrl = "", onClipsGenerated, onSeek }: AutoShortsViewProps) {
  const [url, setUrl] = useState(defaultUrl || "https://www.youtube.com/watch?v=NkMC9IXCRRs");
  const [templateId, setTemplateId] = useState("acharya_prashant_classic");
  const [selectedFont, setSelectedFont] = useState("Khand-Bold.ttf");
  const [subtitleCasing, setSubtitleCasing] = useState<string>("uppercase");
  const [animationEffect, setAnimationEffect] = useState<string>("scale_pop");
  const [numClips, setNumClips] = useState(5);
  const [templates, setTemplates] = useState<any[]>([]);
  const [fonts, setFonts] = useState<any[]>([]);
  
  const [jobId, setJobId] = useState<string | null>(null);
  const [job, setJob] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Active sub-step tab inside Auto Shorts for review
  const [currentViewTab, setCurrentViewTab] = useState<"pipeline" | "transcript" | "clips" | "renders">("pipeline");

  // Editable state
  const [transcriptSegments, setTranscriptSegments] = useState<any[]>([]);
  const [editingTranscriptIndex, setEditingTranscriptIndex] = useState<number | null>(null);
  const [clips, setClips] = useState<any[]>([]);
  const [batchMode, setBatchMode] = useState(false);
  const [batchUrls, setBatchUrls] = useState("");
  const [pastedCustomScript, setPastedCustomScript] = useState("");
  const [showScriptModal, setShowScriptModal] = useState(false);
  const [pastedRawTranscript, setPastedRawTranscript] = useState("");
  const [showTranscriptModal, setShowTranscriptModal] = useState(false);
  const [editingSubtitleClipIndex, setEditingSubtitleClipIndex] = useState<number | null>(null);
  const [subtitleEditText, setSubtitleEditText] = useState<string>("");

  // Load templates & fonts on mount
  useEffect(() => {
    api.autoShorts.listTemplates().then(setTemplates).catch(() => {});
    api.autoShorts.listFonts().then(setFonts).catch(() => {});
  }, []);

  // Poll job status
  useEffect(() => {
    if (!jobId) return;

    const interval = setInterval(async () => {
      try {
        const j = await api.autoShorts.getJob(jobId);
        setJob(j);

        // Populate transcript if newly arrived
        if (j.transcript && j.transcript.length > 0 && transcriptSegments.length === 0) {
          setTranscriptSegments(j.transcript);
        }

        // Populate clips if newly arrived
        if (j.clips && j.clips.length > 0 && clips.length === 0) {
          setClips(j.clips);
        }

        // Auto-switch tabs when states complete
        if (j.status === "transcript_ready" && currentViewTab === "pipeline") {
          setCurrentViewTab("transcript");
        } else if (j.status === "awaiting_review" && currentViewTab === "transcript") {
          setCurrentViewTab("clips");
        } else if (j.status === "completed") {
          setCurrentViewTab("renders");
          clearInterval(interval);
          if (onClipsGenerated) onClipsGenerated();
        } else if (j.status === "error") {
          clearInterval(interval);
        }
      } catch (err: any) {
        console.error("Job poll error:", err);
      }
    }, 1800);

    return () => clearInterval(interval);
  }, [jobId, transcriptSegments.length, clips.length, currentViewTab, onClipsGenerated]);

  const handleStartPipeline = async () => {
    if (!url.trim()) return;
    setLoading(true);
    setError(null);
    setClips([]);
    setTranscriptSegments([]);
    setCurrentViewTab("pipeline");
    try {
      const res = await api.autoShorts.createJob(url.trim(), templateId, numClips, projectId);
      setJobId(res.id);
      setJob(res);
    } catch (err: any) {
      setError(err.message || "Failed to start pipeline");
    } finally {
      setLoading(false);
    }
  };

  const handleProceedToAI = async () => {
    if (!jobId) return;
    setLoading(true);
    try {
      await api.autoShorts.proceedToAI(jobId, transcriptSegments);
      setCurrentViewTab("pipeline");
    } catch (err: any) {
      setError(err.message || "Failed to proceed to AI selection");
    } finally {
      setLoading(false);
    }
  };

  const handleRenderShorts = async () => {
    if (!jobId) return;
    const accepted = clips.filter((c) => c.accepted !== false);
    if (accepted.length === 0) {
      alert("Please accept at least one clip to render.");
      return;
    }
    setLoading(true);
    try {
      await api.autoShorts.renderApproved(jobId, accepted, selectedFont, subtitleCasing, animationEffect);
      setCurrentViewTab("pipeline");
    } catch (err: any) {
      setError(err.message || "Failed to trigger rendering");
    } finally {
      setLoading(false);
    }
  };

  const handleUpdateTranscriptSnippet = (idx: number, newText: string) => {
    const updated = [...transcriptSegments];
    updated[idx].text = newText;
    setTranscriptSegments(updated);
  };

  const handleApplyCustomScript = async () => {
    if (!pastedCustomScript.trim()) return;
    setLoading(true);
    try {
      const res = await api.autoShorts.parseScript(pastedCustomScript);
      if (res.overall_range && res.scenes.length > 0) {
        // Option 1: Map scenes directly as project clips
        const parsedClips = res.scenes.map((sc, i) => ({
          id: `script_scene_${sc.scene_num}_${Date.now()}`,
          start: sc.original_start,
          end: sc.original_end,
          hook_title: sc.on_screen_text || `Scene #${sc.scene_num}`,
          virality_score: 95,
          reason: sc.role || "Structured Reel Scene",
          summary: sc.dialogue,
          script_content: sc.dialogue,
          accepted: true,
          crop_rect: {}
        }));
        
        // Also add full continuous video clip covering overall range
        const continuousShort = {
          id: `full_continuous_${Date.now()}`,
          start: res.overall_range[0],
          end: res.overall_range[1],
          hook_title: `Full Reel: ${Math.round(res.overall_range[0]/60)}m - ${Math.round(res.overall_range[1]/60)}m`,
          virality_score: 98,
          reason: "Complete Continuous Short/Reel as scripted",
          summary: "Continuous sequence from custom script",
          script_content: pastedCustomScript,
          accepted: true,
          crop_rect: {}
        };
        
        setClips([continuousShort, ...parsedClips]);
        setShowScriptModal(false);
        setCurrentViewTab("clips");
      } else {
        alert("Could not detect timestamped scenes in script. Please check formatting.");
      }
    } catch (e: any) {
      alert("Failed to parse script: " + e.message);
    } finally {
      setLoading(false);
    }
  };

  const handleApplyRawTranscript = async () => {
    if (!pastedRawTranscript.trim()) return;
    setLoading(true);
    try {
      const res = await api.autoShorts.parseTranscript(pastedRawTranscript);
      if (res.segments.length > 0) {
        setTranscriptSegments(res.segments);
        setShowTranscriptModal(false);
        setCurrentViewTab("transcript");
      } else {
        alert("No timestamped lines detected. Expected format: '00:00:00.000 Text...'");
      }
    } catch (e: any) {
      alert("Failed to parse transcript: " + e.message);
    } finally {
      setLoading(false);
    }
  };

  const handleAddManualClip = () => {
    const newClip = {
      id: "manual_" + Date.now(),
      start: 0,
      end: 45,
      hook_title: "Custom Discourse Highlight",
      virality_score: 95,
      reason: "Manually created custom short",
      summary: "Manual user edit",
      script_content: "",
      accepted: true,
      crop_rect: {}
    };
    setClips([newClip, ...clips]);
  };

  const handleUpdateClip = (idx: number, field: string, val: any) => {
    const updated = [...clips];
    updated[idx][field] = val;
    setClips(updated);
  };

  return (
    <div className="flex flex-col h-full bg-canvas text-paper overflow-y-auto p-6 space-y-6">
      {/* Top Header */}
      <div className="flex items-center justify-between border-b border-line pb-4">
        <div>
          <div className="flex items-center gap-2">
            <Sparkles className="text-amber-400" size={22} />
            <h2 className="text-xl font-black text-paper">Auto Shorts AI Pipeline</h2>
            <span className="rounded bg-amber-500/20 px-2.5 py-0.5 text-[10px] font-bold text-amber-300">
              Production Studio Mode
            </span>
          </div>
          <p className="text-xs text-mute mt-1">
            Automated step-by-step pipeline with instant inspection, interactive script editing, and custom typography.
          </p>
        </div>

        {/* Step Navigation Tabs if Job is Active */}
        <div className="flex items-center gap-2">
          {job && (
            <button
              onClick={() => {
                if (confirm("Go back and start a new YouTube video / link?")) {
                  setJobId(null);
                  setJob(null);
                  setClips([]);
                  setTranscriptSegments([]);
                  setUrl("");
                  setCurrentViewTab("pipeline");
                }
              }}
              className="px-3 py-1.5 text-xs font-bold rounded-lg border border-line bg-panel hover:bg-canvas text-paper flex items-center gap-1.5 shadow-sm transition-all"
              title="Enter a new YouTube URL or change video"
            >
              <RotateCcw size={13} className="text-amber-400" />
              <span>&larr; New Video Link</span>
            </button>
          )}

          {job && (
            <div className="flex items-center gap-1.5 bg-panel border border-line p-1 rounded-lg">
              <button
                onClick={() => setCurrentViewTab("pipeline")}
                className={`px-3 py-1.5 text-xs font-bold rounded-md transition-all flex items-center gap-1.5 ${
                  currentViewTab === "pipeline" ? "bg-amber-400 text-ink shadow-sm" : "text-mute hover:text-paper"
                }`}
              >
                <Clock size={13} />
                Progress
              </button>
              <button
                onClick={() => setCurrentViewTab("transcript")}
                disabled={!job.transcript || job.transcript.length === 0}
                className={`px-3 py-1.5 text-xs font-bold rounded-md transition-all flex items-center gap-1.5 disabled:opacity-30 ${
                  currentViewTab === "transcript" ? "bg-amber-400 text-ink shadow-sm" : "text-mute hover:text-paper"
                }`}
              >
                <FileText size={13} />
                Transcript & Script ({transcriptSegments.length})
              </button>
              <button
                onClick={() => setCurrentViewTab("clips")}
                disabled={!job.clips || job.clips.length === 0}
                className={`px-3 py-1.5 text-xs font-bold rounded-md transition-all flex items-center gap-1.5 disabled:opacity-30 ${
                  currentViewTab === "clips" ? "bg-amber-400 text-ink shadow-sm" : "text-mute hover:text-paper"
                }`}
              >
                <Sliders size={13} />
                AI Clips ({clips.length})
              </button>
              {job.renders && job.renders.length > 0 && (
                <button
                  onClick={() => setCurrentViewTab("renders")}
                  className={`px-3 py-1.5 text-xs font-bold rounded-md transition-all flex items-center gap-1.5 ${
                    currentViewTab === "renders" ? "bg-emerald-500 text-ink shadow-sm" : "text-emerald-400 hover:text-emerald-300"
                  }`}
                >
                  <CheckCircle2 size={13} />
                  Exports ({job.renders.length})
                </button>
              )}
            </div>
          )}
        </div>
      </div>

      {error && (
        <div className="flex items-center gap-2 rounded-lg bg-red-950/80 border border-red-500/50 p-3.5 text-xs text-red-200">
          <AlertCircle size={16} />
          <span>{error}</span>
        </div>
      )}

      {/* Input Setup Card (if no active job or starting new) */}
      {!jobId && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 bg-panel border border-line rounded-xl p-5 shadow-sm">
          <div className="lg:col-span-2 space-y-4">
            <div>
              <label className="block text-xs font-bold text-mute uppercase tracking-wider mb-1.5">
                YouTube Video Link
              </label>
              <input
                type="text"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                placeholder="https://www.youtube.com/watch?v=..."
                style={{ backgroundColor: "#14161b", color: "#f3f4f6" }}
                className="w-full rounded-lg border-2 border-line/80 px-3.5 py-2.5 text-sm font-medium focus:outline-none focus:border-amber-400 placeholder:text-gray-500 shadow-inner"
              />
            </div>

            <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
              <div>
                <label className="block text-xs font-bold text-mute uppercase tracking-wider mb-1.5">
                  Design Template
                </label>
                <select
                  value={templateId}
                  onChange={(e) => setTemplateId(e.target.value)}
                  style={{ backgroundColor: "#14161b", color: "#f3f4f6" }}
                  className="w-full rounded-lg border-2 border-line/80 px-3 py-2 text-xs focus:outline-none focus:border-amber-400"
                >
                  <option value="acharya_prashant_classic">Acharya Prashant Classic (1080x1920)</option>
                  <option value="acharya_prashant_split">Acharya Prashant Dual Split (Multi-Speaker)</option>
                  {templates.map((t) => (
                    <option key={t.id} value={t.id}>{t.name}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-bold text-mute uppercase tracking-wider mb-1.5">
                  Subtitle Font
                </label>
                <select
                  value={selectedFont}
                  onChange={(e) => setSelectedFont(e.target.value)}
                  style={{ backgroundColor: "#14161b", color: "#f3f4f6" }}
                  className="w-full rounded-lg border-2 border-line/80 px-3 py-2 text-xs focus:outline-none focus:border-amber-400"
                >
                  <option value="Khand-Bold.ttf">Khand Bold (Hindi + Latin)</option>
                  <option value="NotoSansDevanagari-Bold.ttf">Noto Sans Devanagari</option>
                  <option value="Arial-Bold.ttf">Arial Bold</option>
                  <option value="Impact.ttf">Impact</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-bold text-mute uppercase tracking-wider mb-1.5">
                  Subtitle Casing
                </label>
                <select
                  value={subtitleCasing}
                  onChange={(e) => setSubtitleCasing(e.target.value)}
                  style={{ backgroundColor: "#14161b", color: "#f3f4f6" }}
                  className="w-full rounded-lg border-2 border-line/80 px-3 py-2 text-xs focus:outline-none focus:border-amber-400"
                >
                  <option value="uppercase">UPPERCASE (Standard)</option>
                  <option value="lowercase">lowercase</option>
                  <option value="default">Default / Normal</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-bold text-mute uppercase tracking-wider mb-1.5">
                  Animation Effect
                </label>
                <select
                  value={animationEffect}
                  onChange={(e) => setAnimationEffect(e.target.value)}
                  style={{ backgroundColor: "#14161b", color: "#f3f4f6" }}
                  className="w-full rounded-lg border-2 border-line/80 px-3 py-2 text-xs focus:outline-none focus:border-amber-400"
                >
                  <option value="scale_pop">Scale Pop (Punch-in Zoom)</option>
                  <option value="glow_punch">Glow Punch & Bold</option>
                  <option value="clean">Clean Minimal</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-bold text-mute uppercase tracking-wider mb-1.5">
                  Clip Count
                </label>
                <select
                  value={numClips}
                  onChange={(e) => setNumClips(parseInt(e.target.value))}
                  style={{ backgroundColor: "#14161b", color: "#f3f4f6" }}
                  className="w-full rounded-lg border-2 border-line/80 px-3 py-2 text-xs focus:outline-none focus:border-amber-400"
                >
                  <option value={3}>3 Viral Clips (30-60s)</option>
                  <option value={5}>5 Viral Clips (30-75s)</option>
                  <option value={8}>8 Viral Clips</option>
                </select>
              </div>
            </div>
          </div>

          <div className="flex flex-col justify-between border-t lg:border-t-0 lg:border-l border-line lg:pl-6 pt-4 lg:pt-0 space-y-4">
            <div className="space-y-1.5 text-xs text-mute">
              <span className="font-bold text-paper block">Production Pipeline:</span>
              <p>&bull; YouTube download with mobile client acceleration</p>
              <p>&bull; Live transcript inspection & manual correction</p>
              <p>&bull; Intelligent AI discourse chunking & face tracking</p>
              <p>&bull; Frame-accurate 1080x1920 render with soft glow captions</p>
            </div>

            <button
              onClick={handleStartPipeline}
              disabled={loading || !url.trim()}
              className="w-full rounded-lg bg-amber-400 px-4 py-3 font-bold text-sm text-ink hover:bg-amber-300 disabled:opacity-40 transition-all flex items-center justify-center gap-2 shadow-lg shadow-amber-400/20"
            >
              <Sparkles size={16} />
              {loading ? "Starting..." : "Start Auto Shorts"}
            </button>
          </div>
        </div>
      )}

      {/* Main View Tabs */}
      {job && currentViewTab === "pipeline" && (
        <div className="bg-panel border border-line rounded-xl p-6 space-y-6">
          <div className="flex items-center justify-between">
            <div className="space-y-1">
              <div className="flex items-center gap-2.5">
                <div className="h-3 w-3 rounded-full bg-amber-400 animate-pulse" />
                <h3 className="text-base font-bold text-paper">
                  {job.step_detail || "Processing..."}
                </h3>
              </div>
              <p className="text-xs text-mute">
                Current Stage: <span className="uppercase text-amber-300 font-semibold">{job.stage}</span> &bull; Status: <span className="text-paper">{job.status}</span>
              </p>
            </div>
            <div className="text-right">
              <span className="font-mono text-2xl font-black text-amber-400">
                {Math.round((job.progress || 0) * 100)}%
              </span>
            </div>
          </div>

          {/* Progress Bar */}
          <div className="h-2.5 w-full rounded-full bg-line overflow-hidden">
            <div
              className="h-full bg-amber-400 transition-all duration-300"
              style={{ width: `${Math.round((job.progress || 0) * 100)}%` }}
            />
          </div>

          {/* Stepper with click-to-inspect */}
          <div className="grid grid-cols-4 gap-3 text-center text-xs">
            <button
              onClick={() => setCurrentViewTab("pipeline")}
              className={`p-3 rounded-lg border font-bold flex flex-col items-center gap-1.5 ${
                job.stage === "ingest"
                  ? "border-amber-400 bg-amber-400/10 text-amber-300"
                  : (job.progress || 0) >= 0.3
                  ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-400"
                  : "border-line bg-canvas text-mute"
              }`}
            >
              <span>1. Download Stream</span>
              <span className="text-[10px] font-normal text-mute">yt-dlp stream</span>
            </button>

            <button
              onClick={() => transcriptSegments.length > 0 && setCurrentViewTab("transcript")}
              disabled={transcriptSegments.length === 0}
              className={`p-3 rounded-lg border font-bold flex flex-col items-center gap-1.5 disabled:opacity-40 ${
                job.stage === "transcript" || job.status === "transcript_ready"
                  ? "border-amber-400 bg-amber-400/10 text-amber-300"
                  : (job.progress || 0) >= 0.5
                  ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-400"
                  : "border-line bg-canvas text-mute"
              }`}
            >
              <span>2. Transcript & Script</span>
              <span className="text-[10px] font-normal text-mute">
                {transcriptSegments.length > 0 ? `${transcriptSegments.length} snippets (Click to Edit)` : "Extracting..."}
              </span>
            </button>

            <button
              onClick={() => clips.length > 0 && setCurrentViewTab("clips")}
              disabled={clips.length === 0}
              className={`p-3 rounded-lg border font-bold flex flex-col items-center gap-1.5 disabled:opacity-40 ${
                job.stage === "ai_selection" || job.status === "awaiting_review"
                  ? "border-amber-400 bg-amber-400/10 text-amber-300"
                  : (job.progress || 0) >= 0.75
                  ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-400"
                  : "border-line bg-canvas text-mute"
              }`}
            >
              <span>3. AI Clip Selection</span>
              <span className="text-[10px] font-normal text-mute">
                {clips.length > 0 ? `${clips.length} proposed clips` : "AI Analysis"}
              </span>
            </button>

            <button
              onClick={() => job.renders && job.renders.length > 0 && setCurrentViewTab("renders")}
              disabled={!job.renders || job.renders.length === 0}
              className={`p-3 rounded-lg border font-bold flex flex-col items-center gap-1.5 disabled:opacity-40 ${
                job.stage === "render"
                  ? "border-amber-400 bg-amber-400/10 text-amber-300"
                  : job.status === "completed"
                  ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-400"
                  : "border-line bg-canvas text-mute"
              }`}
            >
              <span>4. 9:16 HD Render</span>
              <span className="text-[10px] font-normal text-mute">
                {job.renders?.length ? `${job.renders.length} completed` : "Export 1080x1920"}
              </span>
            </button>
          </div>

          {/* Action Callout if paused at transcript_ready */}
          {job.status === "transcript_ready" && (
            <div className="flex items-center justify-between bg-amber-400/10 border border-amber-400/30 rounded-lg p-4">
              <div className="space-y-0.5">
                <span className="text-xs font-bold text-amber-300">Transcript extraction complete!</span>
                <p className="text-[11px] text-mute">
                  You can inspect or correct the script now, or immediately proceed to AI clip generation.
                </p>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setCurrentViewTab("transcript")}
                  className="rounded-md border border-line bg-panel px-3 py-1.5 text-xs font-semibold text-paper hover:bg-canvas flex items-center gap-1.5"
                >
                  <Edit3 size={13} />
                  Edit Script
                </button>
                <button
                  onClick={handleProceedToAI}
                  disabled={loading}
                  className="rounded-md bg-amber-400 px-3.5 py-1.5 text-xs font-bold text-ink hover:bg-amber-300 flex items-center gap-1.5 shadow"
                >
                  Proceed to AI Selection
                  <ArrowRight size={13} />
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Interactive Transcript & Script Editor View */}
      {job && currentViewTab === "transcript" && (
        <div className="bg-panel border border-line rounded-xl p-5 space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between border-b border-line pb-3 gap-3">
            <div>
              <h3 className="text-sm font-bold text-paper flex items-center gap-2">
                <FileText size={16} className="text-amber-400" />
                Discourse Transcript & Spoken Script
              </h3>
              <p className="text-xs text-mute mt-0.5">
                Review and edit any word or sentence before passing to AI, or paste your Tactiq / YouTube transcript directly.
              </p>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setShowTranscriptModal(true)}
                className="rounded-lg border border-line bg-canvas hover:bg-line text-paper font-semibold px-3 py-1.5 text-xs flex items-center gap-1.5"
              >
                <Plus size={13} />
                Paste Custom Transcript
              </button>
              <button
                onClick={handleProceedToAI}
                disabled={loading}
                className="rounded-lg bg-amber-400 hover:bg-amber-300 text-ink font-bold px-4 py-2 text-xs flex items-center gap-1.5 shadow-md shadow-amber-400/20"
              >
                Save & Proceed to AI Clips
                <ArrowRight size={14} />
              </button>
            </div>
          </div>

          <div className="max-h-[460px] overflow-y-auto space-y-2 pr-2">
            {transcriptSegments.map((snip, idx) => (
              <div
                key={idx}
                className="flex items-start gap-3 bg-canvas/60 border border-line/50 rounded-lg p-2.5 text-xs hover:border-amber-400/40 transition-colors"
              >
                <span className="font-mono text-[10px] text-mute whitespace-nowrap pt-1">
                  {Math.floor(snip.start / 60)}:{(Math.floor(snip.start % 60)).toString().padStart(2, "0")}
                </span>
                <input
                  type="text"
                  value={snip.text}
                  onChange={(e) => handleUpdateTranscriptSnippet(idx, e.target.value)}
                  className="flex-1 bg-transparent border-0 text-paper text-xs focus:outline-none focus:ring-1 focus:ring-amber-400 rounded px-1.5 py-0.5"
                />
                {onSeek && (
                  <button
                    onClick={() => onSeek(snip.start)}
                    className="p-1 text-mute hover:text-amber-300"
                    title="Play at this point"
                  >
                    <Play size={13} />
                  </button>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* AI Clips Review & Manual Edit View */}
      {job && currentViewTab === "clips" && (
        <div className="space-y-4">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 bg-panel p-4 rounded-xl border border-line">
            <div>
              <h3 className="text-base font-bold text-paper">Review & Adjust Selected Shorts</h3>
              <p className="text-xs text-mute">
                Edit titles, adjust start/end timings, and customize typography effects before rendering.
              </p>
            </div>
            
            <div className="flex flex-wrap items-center gap-2">
              <div className="flex items-center gap-1.5 bg-canvas px-2.5 py-1 rounded-lg border border-line text-xs">
                <span className="text-mute font-medium">Font:</span>
                <select
                  value={selectedFont}
                  onChange={(e) => setSelectedFont(e.target.value)}
                  className="bg-transparent text-paper font-bold focus:outline-none"
                >
                  <option value="Khand-Bold.ttf">Khand Bold</option>
                  <option value="NotoSansDevanagari-Bold.ttf">Noto Sans Devanagari</option>
                  <option value="Arial-Bold.ttf">Arial Bold</option>
                  <option value="Impact.ttf">Impact</option>
                </select>
              </div>

              <div className="flex items-center gap-1.5 bg-canvas px-2.5 py-1 rounded-lg border border-line text-xs">
                <span className="text-mute font-medium">Case:</span>
                <select
                  value={subtitleCasing}
                  onChange={(e) => setSubtitleCasing(e.target.value)}
                  className="bg-transparent text-paper font-bold focus:outline-none"
                >
                  <option value="uppercase">UPPERCASE</option>
                  <option value="lowercase">lowercase</option>
                  <option value="default">Default</option>
                </select>
              </div>

              <div className="flex items-center gap-1.5 bg-canvas px-2.5 py-1 rounded-lg border border-line text-xs">
                <span className="text-mute font-medium">FX:</span>
                <select
                  value={animationEffect}
                  onChange={(e) => setAnimationEffect(e.target.value)}
                  className="bg-transparent text-paper font-bold focus:outline-none"
                >
                  <option value="scale_pop">Scale Pop (Punch-in)</option>
                  <option value="word_highlight">Pop &amp; Large Keyword</option>
                  <option value="glow_punch">Warm Glow Punch</option>
                  <option value="clean">Clean Minimal</option>
                </select>
              </div>

              <button
                onClick={() => setShowScriptModal(true)}
                className="rounded-lg border border-amber-400/40 bg-amber-400/10 hover:bg-amber-400/20 text-amber-300 font-semibold px-3 py-1.5 text-xs flex items-center gap-1.5"
              >
                <FileText size={13} />
                Paste Custom Script / Reel
              </button>
              <button
                onClick={handleAddManualClip}
                className="rounded-lg border border-line bg-panel hover:bg-canvas text-xs font-semibold px-3 py-1.5 text-paper flex items-center gap-1"
              >
                <Plus size={13} />
                Add Custom Clip
              </button>
              <button
                onClick={handleRenderShorts}
                disabled={loading}
                className="rounded-lg bg-emerald-500 hover:bg-emerald-400 text-ink font-bold px-4 py-2 text-xs flex items-center gap-1.5 shadow-md shadow-emerald-500/20"
              >
                <Check size={14} />
                Render Approved Shorts ({clips.filter((c) => c.accepted !== false).length})
              </button>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {clips.map((clip, idx) => (
              <div
                key={clip.id || idx}
                className={`border rounded-xl p-4 transition-all ${
                  clip.accepted !== false
                    ? "border-amber-500/40 bg-panel"
                    : "border-line bg-canvas opacity-40"
                }`}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0 space-y-2">
                    <div className="flex items-center gap-2">
                      <span className="rounded bg-amber-400/20 px-2 py-0.5 text-[10px] font-bold text-amber-300">
                        Virality {clip.virality_score || 90}/100
                      </span>
                      <span className="text-[11px] font-mono text-mute">
                        {Math.round(clip.start)}s &rarr; {Math.round(clip.end)}s ({Math.round(clip.end - clip.start)}s)
                      </span>
                    </div>

                    <input
                      type="text"
                      value={clip.hook_title || ""}
                      onChange={(e) => handleUpdateClip(idx, "hook_title", e.target.value)}
                      placeholder="Catchy Hook Title"
                      style={{ backgroundColor: "#14161b", color: "#f3f4f6" }}
                      className="w-full border border-line rounded px-3 py-1.5 text-sm font-bold focus:outline-none focus:border-amber-400 placeholder:text-mute/40"
                    />

                    {clip.reason && (
                      <p className="text-[11px] text-mute line-clamp-2 italic">
                        "{clip.reason}"
                      </p>
                    )}

                    {clip.summary && (
                      <div className="space-y-1">
                        <div className="flex items-center justify-between text-[10px] text-mute font-semibold">
                          <span>Subtitles / Script:</span>
                          <button
                            onClick={() => {
                              setEditingSubtitleClipIndex(idx);
                              setSubtitleEditText(clip.script_content || clip.summary || "");
                            }}
                            className="text-amber-400 hover:underline flex items-center gap-1"
                          >
                            <Edit3 size={11} /> Edit Subtitles (SRT)
                          </button>
                        </div>
                        <p className="text-[11px] text-paper/90 bg-black/40 p-2 rounded border border-line/40 line-clamp-3 font-sans">
                          {clip.script_content || clip.summary}
                        </p>
                      </div>
                    )}
                  </div>

                  <div className="flex flex-col gap-1.5">
                    <button
                      onClick={() => handleUpdateClip(idx, "accepted", clip.accepted === false)}
                      className={`p-1.5 rounded-md border ${
                        clip.accepted !== false
                          ? "border-emerald-500 bg-emerald-500/20 text-emerald-400"
                          : "border-line text-mute hover:text-paper"
                      }`}
                      title={clip.accepted !== false ? "Accepted" : "Rejected"}
                    >
                      <Check size={14} />
                    </button>
                    {onSeek && (
                      <button
                        onClick={() => onSeek(clip.start)}
                        className="p-1.5 rounded-md border border-line hover:border-amber-400 text-mute hover:text-amber-300"
                        title="Seek in player"
                      >
                        <Play size={14} />
                      </button>
                    )}
                  </div>
                </div>

                {/* Timing Handles */}
                <div className="grid grid-cols-2 gap-2 mt-3 pt-3 border-t border-line/60 text-xs">
                  <div>
                    <label className="text-[10px] text-mute uppercase font-bold block mb-1">
                      Start Time ({fmtTime(clip.start || 0)})
                    </label>
                    <input
                      type="text"
                      value={clip.start_str !== undefined ? clip.start_str : clip.start}
                      onChange={(e) => {
                        const val = e.target.value;
                        let sec = parseFloat(val);
                        if (val.includes(":")) {
                          const pts = val.split(":").map(Number);
                          sec = pts.length === 2 ? pts[0]*60 + pts[1] : pts.length === 3 ? pts[0]*3600 + pts[1]*60 + pts[2] : sec;
                        }
                        const updated = [...clips];
                        updated[idx].start_str = val;
                        if (!isNaN(sec)) updated[idx].start = sec;
                        setClips(updated);
                      }}
                      onBlur={() => {
                        const updated = [...clips];
                        delete updated[idx].start_str;
                        setClips(updated);
                      }}
                      style={{ backgroundColor: "#14161b", color: "#f3f4f6" }}
                      className="w-full border border-line rounded px-2 py-1 text-xs font-mono focus:border-amber-400 focus:outline-none"
                      placeholder="e.g. 54:00 or 3240"
                    />
                  </div>
                  <div>
                    <label className="text-[10px] text-mute uppercase font-bold block mb-1">
                      End Time ({fmtTime(clip.end || 0)})
                    </label>
                    <input
                      type="text"
                      value={clip.end_str !== undefined ? clip.end_str : clip.end}
                      onChange={(e) => {
                        const val = e.target.value;
                        let sec = parseFloat(val);
                        if (val.includes(":")) {
                          const pts = val.split(":").map(Number);
                          sec = pts.length === 2 ? pts[0]*60 + pts[1] : pts.length === 3 ? pts[0]*3600 + pts[1]*60 + pts[2] : sec;
                        }
                        const updated = [...clips];
                        updated[idx].end_str = val;
                        if (!isNaN(sec)) updated[idx].end = sec;
                        setClips(updated);
                      }}
                      onBlur={() => {
                        const updated = [...clips];
                        delete updated[idx].end_str;
                        setClips(updated);
                      }}
                      style={{ backgroundColor: "#14161b", color: "#f3f4f6" }}
                      className="w-full border border-line rounded px-2 py-1 text-xs font-mono focus:border-amber-400 focus:outline-none"
                      placeholder="e.g. 57:01 or 3421"
                    />
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Renders / Exports View */}
      {job && currentViewTab === "renders" && job.renders && job.renders.length > 0 && (
        <div className="bg-panel border border-line rounded-xl p-5 space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <CheckCircle2 className="text-emerald-400" size={18} />
              <h3 className="text-base font-bold text-paper">Exported 9:16 Shorts Ready</h3>
            </div>
            <button
              onClick={() => {
                setJobId(null);
                setJob(null);
                setClips([]);
                setTranscriptSegments([]);
                setCurrentViewTab("pipeline");
              }}
              className="text-xs text-amber-400 hover:underline"
            >
              Start New Auto Shorts
            </button>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
            {job.renders.map((r: any, idx: number) => (
              <div key={r.export_id || idx} className="border border-line rounded-lg p-3 bg-canvas flex flex-col justify-between space-y-3">
                <div>
                  <div className="font-bold text-xs text-paper truncate">{r.title || `Short #${idx + 1}`}</div>
                  <div className="text-[10px] text-mute font-mono mt-1">1080x1920 MP4 &bull; 30fps &bull; Khand Captions</div>
                </div>
                <a
                  href={apiUrl(r.download_url)}
                  download
                  className="rounded bg-amber-400 px-3 py-1.5 text-center text-xs font-bold text-ink hover:bg-amber-300 flex items-center justify-center gap-1.5"
                >
                  <Download size={13} />
                  Download Short
                </a>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Modal for Custom Script / Reel */}
      {showScriptModal && (
        <div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4">
          <div className="bg-panel border border-line rounded-xl max-w-2xl w-full p-5 space-y-4 shadow-2xl">
            <div className="flex items-center justify-between border-b border-line pb-3">
              <div className="flex items-center gap-2">
                <FileText className="text-amber-400" size={18} />
                <h3 className="text-base font-bold text-paper">Paste Custom Reel / Scene Script</h3>
              </div>
              <button
                onClick={() => setShowScriptModal(false)}
                className="text-mute hover:text-paper"
              >
                <X size={18} />
              </button>
            </div>

            <p className="text-xs text-mute">
              Paste your hand-crafted Short script with scene timestamps (e.g. <code>[Opening — 00:54:00]</code> or <code>00:54:00 – 00:57:01</code>). ClipTrim will map the scenes and generate a <strong>Continuous Full Short</strong>.
            </p>

            <textarea
              rows={12}
              value={pastedCustomScript}
              onChange={(e) => setPastedCustomScript(e.target.value)}
              placeholder="Paste script here... Example:
00:54:00 – 00:57:01

[Opening — 00:54:00]
Acharya Prashant:
“That is why I am first of all contesting the popular meaning of education...”"
              style={{ backgroundColor: "#14161b", color: "#f3f4f6" }}
              className="w-full border-2 border-line/80 rounded-lg p-3 text-xs font-mono focus:outline-none focus:border-amber-400 placeholder-mute/60"
            />

            <div className="flex items-center justify-end gap-3 pt-2">
              <button
                onClick={() => setShowScriptModal(false)}
                className="px-4 py-2 rounded-lg border border-line text-xs font-semibold text-mute hover:text-paper"
              >
                Cancel
              </button>
              <button
                onClick={handleApplyCustomScript}
                disabled={loading || !pastedCustomScript.trim()}
                className="px-4 py-2 rounded-lg bg-amber-400 hover:bg-amber-300 text-ink text-xs font-bold flex items-center gap-1.5 shadow"
              >
                <Check size={14} />
                Parse & Add to Clips
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal for Raw Tactiq / YouTube Transcript */}
      {showTranscriptModal && (
        <div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4">
          <div className="bg-panel border border-line rounded-xl max-w-2xl w-full p-5 space-y-4 shadow-2xl">
            <div className="flex items-center justify-between border-b border-line pb-3">
              <div className="flex items-center gap-2">
                <FileText className="text-amber-400" size={18} />
                <h3 className="text-base font-bold text-paper">Paste Full YouTube / Tactiq Transcript</h3>
              </div>
              <button
                onClick={() => setShowTranscriptModal(false)}
                className="text-mute hover:text-paper"
              >
                <X size={18} />
              </button>
            </div>

            <p className="text-xs text-mute">
              Paste timestamped lines exported from Tactiq.io or YouTube (e.g. <code>00:00:00.000 We work on democracy...</code>).
            </p>

            <textarea
              rows={12}
              value={pastedRawTranscript}
              onChange={(e) => setPastedRawTranscript(e.target.value)}
              placeholder="Paste raw transcript with timestamps here...
00:00:00.000 We work on democracy and you talk about
00:00:03.000 Vedanta and Advait. Can you tell us if
00:00:06.560 you see any link between the two..."
              style={{ backgroundColor: "#14161b", color: "#f3f4f6" }}
              className="w-full border-2 border-line/80 rounded-lg p-3 text-xs font-mono focus:outline-none focus:border-amber-400 placeholder-mute/60"
            />

            <div className="flex items-center justify-end gap-3 pt-2">
              <button
                onClick={() => setShowTranscriptModal(false)}
                className="px-4 py-2 rounded-lg border border-line text-xs font-semibold text-mute hover:text-paper"
              >
                Cancel
              </button>
              <button
                onClick={handleApplyRawTranscript}
                disabled={loading || !pastedRawTranscript.trim()}
                className="px-4 py-2 rounded-lg bg-amber-400 hover:bg-amber-300 text-ink text-xs font-bold flex items-center gap-1.5 shadow"
              >
                <Check size={14} />
                Import Transcript Segments
              </button>
            </div>
          </div>
        </div>
      )}
      {/* Modal for Editing Clip Subtitles / SRT */}
      {editingSubtitleClipIndex !== null && (
        <div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4">
          <div className="bg-panel border border-line rounded-xl max-w-xl w-full p-5 space-y-4 shadow-2xl">
            <div className="flex items-center justify-between border-b border-line pb-3">
              <div className="flex items-center gap-2">
                <Edit3 className="text-amber-400" size={18} />
                <h3 className="text-base font-bold text-paper">Review & Edit Clip Subtitles</h3>
              </div>
              <button
                onClick={() => setEditingSubtitleClipIndex(null)}
                className="text-mute hover:text-paper"
              >
                <X size={18} />
              </button>
            </div>

            <p className="text-xs text-mute">
              Adjust words or timing text for this Short. ClipTrim will burn your exact edited wording as animated glowing subtitles!
            </p>

            <textarea
              rows={8}
              value={subtitleEditText}
              onChange={(e) => setSubtitleEditText(e.target.value)}
              style={{ backgroundColor: "#14161b", color: "#f3f4f6" }}
              className="w-full border-2 border-line/80 rounded-lg p-3 text-xs font-mono focus:outline-none focus:border-amber-400"
              placeholder="Enter spoken words for this Short..."
            />

            <div className="flex items-center justify-end gap-3 pt-2">
              <button
                onClick={() => setEditingSubtitleClipIndex(null)}
                className="px-4 py-2 rounded-lg border border-line text-xs font-semibold text-mute hover:text-paper"
              >
                Cancel
              </button>
              <button
                onClick={() => {
                  const updated = [...clips];
                  updated[editingSubtitleClipIndex].script_content = subtitleEditText;
                  updated[editingSubtitleClipIndex].summary = subtitleEditText;
                  setClips(updated);
                  setEditingSubtitleClipIndex(null);
                }}
                className="px-4 py-2 rounded-lg bg-amber-400 hover:bg-amber-300 text-ink text-xs font-bold flex items-center gap-1.5 shadow"
              >
                <Check size={14} />
                Save Subtitle Changes
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
