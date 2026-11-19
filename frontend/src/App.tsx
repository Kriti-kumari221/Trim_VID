import React, { useEffect, useRef, useState } from "react";
import {
  Scissors, Upload, Link2, Play, Pause, Volume2, VolumeX, Maximize, ZoomIn, ZoomOut,
  Download, X, ChevronLeft, ChevronRight, Home, HelpCircle, Settings, Loader2, Eye,
  Film, Folder, Mic, Sparkles, Music, Type, HardDrive, Plus, Check, RefreshCw, RotateCcw, FileText
} from "lucide-react";

import { api, apiUrl, Meta, Job, Loaded, Project, ProjectClip, MusicTrack } from "./api";
import { ProjectsModal } from "./components/ProjectsModal";
import { GDriveModal } from "./components/GDriveModal";
import { TranscriptStudioView } from "./components/TranscriptStudioView";
import { AIScriptStudioView } from "./components/AIScriptStudioView";
import { MultiClipList } from "./components/MultiClipList";
import { MusicStudioView } from "./components/MusicStudioView";
import { ExportCenterView } from "./components/ExportCenterView";
import { AutoShortsView } from "./components/AutoShortsView";
import { SubtitleCustomizerPanel } from "./components/SubtitleCustomizerPanel";
import { SubtitleStyle, SubtitlePreset } from "./api";

const fmt = (t: number) => {
  const ms = Math.round(Math.max(0, t) * 1000), p = (n: number, w = 2) => String(n).padStart(w, "0");
  return `${p(Math.floor(ms / 3600000))}:${p(Math.floor((ms % 3600000) / 60000))}:${p(Math.floor((ms % 60000) / 1000))}.${p(ms % 1000, 3)}`;
};

const parse = (s: string) => {
  const p = s.trim().split(":");
  return p.length > 3 || p.some((x) => !/^\d+(\.\d+)?$/.test(x)) ? NaN : p.reduce((a, x) => a * 60 + parseFloat(x), 0);
};

const clamp = (x: number, a: number, b: number) => Math.min(b, Math.max(a, x));
const r3 = (x: number) => Math.round(x * 1000) / 1000;
const btn = "inline-flex items-center gap-2 rounded-md px-3 py-2 text-sm font-semibold transition-colors disabled:opacity-40 disabled:pointer-events-none";
const ghost = `${btn} bg-panel border border-line hover:border-mute`;
const solid = `${btn} bg-trim text-ink hover:bg-amber-300`;

function TimeField({ label, value, onCommit }: { label: string; value: number; onCommit: (v: number) => number }) {
  const [txt, setTxt] = useState(fmt(value));
  const [bad, setBad] = useState(false);
  useEffect(() => { setTxt(fmt(value)); setBad(false); }, [value]);
  const commit = () => {
    const v = parse(txt);
    if (isNaN(v)) return setBad(true);
    setBad(false);
    setTxt(fmt(onCommit(v)));
  };
  return (
    <label className="block text-xs text-mute">
      {label}
      <input
        value={txt}
        onChange={(e) => setTxt(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => e.key === "Enter" && commit()}
        aria-invalid={bad}
        className={`mt-1 w-full rounded-md bg-ink border px-3 py-2 text-base text-paper font-mono ${bad ? "border-red-400" : "border-line"}`}
      />
    </label>
  );
}

function Seg({ value, options, onChange, disabled }: { value: string; options: [string, string][]; onChange: (v: string) => void; disabled?: boolean }) {
  return (
    <div className={`flex rounded-md border border-line overflow-hidden ${disabled ? "opacity-40 pointer-events-none" : ""}`}>
      {options.map(([v, l]) => (
        <button
          key={v}
          onClick={() => onChange(v)}
          className={`flex-1 px-2 py-2 text-sm ${value === v ? "bg-trim text-ink font-semibold" : "bg-ink hover:bg-panel"}`}
        >
          {l}
        </button>
      ))}
    </div>
  );
}

export default function App() {
  // Current active project
  const [project, setProject] = useState<Project | null>(null);
  const [showProjectsModal, setShowProjectsModal] = useState(false);
  const [showGDriveModal, setShowGDriveModal] = useState(false);
  const [showNewLinkModal, setShowNewLinkModal] = useState(false);
  const [newLinkInput, setNewLinkInput] = useState("");

  // Active studio tab
  type StudioTab = "editor" | "auto_shorts" | "transcript" | "scripts" | "music" | "exports";
  const [activeTab, setActiveTab] = useState<StudioTab>("editor");

  // Video and timeline states
  const [vid, setVid] = useState<string | null>(null);
  const [meta, setMeta] = useState<Meta | null>(null);
  const [start, setStartS] = useState(0);
  const [end, setEndS] = useState(0);
  const [cur, setCur] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [muted, setMuted] = useState(false);
  const [vol, setVol] = useState(1);
  const [zoom, setZoom] = useState(1);
  const [busy, setBusy] = useState("");
  const [pct, setPct] = useState(0);
  const [err, setErr] = useState("");
  const [url, setUrl] = useState("");
  const [panel, setPanel] = useState<"" | "help" | "settings">("");
  const [cfg, setCfg] = useState<Awaited<ReturnType<typeof api.config>> | null>(null);
  const [opt, setOpt] = useState({ mode: "precise", codec: "h264", resolution: "original", quality: "high" });
  const [job, setJob] = useState<Job | null>(null);
  const [preview, setPreview] = useState("");
  const [drag, setDrag] = useState(false);

  // Studio selections
  const [activeClipId, setActiveClipId] = useState<string | null>(null);
  const [selectedMusicId, setSelectedMusicId] = useState<string | null>(null);
  const [selectedSubtitlePreset, setSelectedSubtitlePreset] = useState("viral_yellow");
  const [musicTracks, setMusicTracks] = useState<MusicTrack[]>([]);
  const [cookieTxt, setCookieTxt] = useState("");
  const [cookieConfigured, setCookieConfigured] = useState(false);
  const [cookieSaving, setCookieSaving] = useState(false);
  const [cookieMsg, setCookieMsg] = useState("");
  const [transcribing, setTranscribing] = useState(false);
  const [transcribeMsg, setTranscribeMsg] = useState("");

  // Real-time Subtitle Overlay on Video Player & Timeline
  const [showSubtitlesOverlay, setShowSubtitlesOverlay] = useState(true);
  const [subFont, setSubFont] = useState("Khand"); // Khand, Impact, Arial, Devanagari, Georgia
  const [subEffect, setSubEffect] = useState("popup"); // popup, pop_keyword, bounce, shake, flip, spin, pulse, stretch, glitch, wave, neon, 3d, liquid, boxed
  const [subCase, setSubCase] = useState("uppercase"); // uppercase, normal, lowercase
  const [subColor, setSubColor] = useState("#F8F0AE"); // Cream yellow (AP classic), Yellow, Neon Green, White, Cyan
  const [subSize, setSubSize] = useState<"sm" | "md" | "lg" | "xl">("lg");
  const [playerAspectRatio, setPlayerAspectRatio] = useState<"auto" | "9:16" | "16:9" | "1:1" | "fit">("auto");
  const [previewChunks, setPreviewChunks] = useState<Array<{ start: number; end: number; speaker: string; text: string }>>([]);

  // VEED-Inspired Professional Subtitle Customizer State
  const [subtitlePresets, setSubtitlePresets] = useState<SubtitlePreset[]>([]);
  const [currentSubtitleStyle, setCurrentSubtitleStyle] = useState<SubtitleStyle>({
    id: "pop_ap_yellow",
    name: "Khand Viral Yellow",
    category: "Popular",
    font_family: "Khand",
    font_size: 28,
    font_weight: "bold",
    primary_color: "#F8F0AE",
    outline_color: "#000000",
    outline_width: 4,
    shadow_color: "#000000",
    shadow_depth: 2,
    shadow_blur: 4,
    bg_color: "transparent",
    border_style: 1,
    alignment: 2,
    margin_v: 70,
    pos_x: 50,
    pos_y: 85,
    rotation: 0,
    casing: "uppercase",
    animation: "popup",
    highlight_color: "#FFFF00",
  });
  const [individualSubtitleStyles, setIndividualSubtitleStyles] = useState<Record<string, SubtitleStyle>>({});
  const [selectedSubtitleCueKey, setSelectedSubtitleCueKey] = useState<string | null>(null);
  const [isSubtitleDragging, setIsSubtitleDragging] = useState(false);
  const [showSubtitlePanel, setShowSubtitlePanel] = useState(true);

  // Load backend subtitle presets on mount
  useEffect(() => {
    api.subtitles.presets()
      .then((res) => {
        if (res && res.length > 0) setSubtitlePresets(res);
      })
      .catch(() => {});
  }, []);

  // Text-to-Timeline & Auto-Cut State
  const [timelineTextQuery, setTimelineTextQuery] = useState("");
  const [timelineMatching, setTimelineMatching] = useState(false);
  const [timelineMatchInfo, setTimelineMatchInfo] = useState<{ start: number; end: number; duration: number; matched_text: string; confidence: number } | null>(null);

  // Fetch or update preview chunks whenever project transcript updates or project changes
  useEffect(() => {
    if (project?.id) {
      // First, if project transcript segments exist locally, convert them to preview chunks immediately
      if (project.transcript && project.transcript.segments && project.transcript.segments.length > 0) {
        // Build fallback chunks locally so preview works even before API returns
        const fallbackChunks: Array<{ start: number; end: number; speaker: string; text: string }> = [];
        for (const seg of project.transcript.segments) {
          const words = seg.text.trim().split(/\s+/);
          if (words.length <= 4) {
            fallbackChunks.push({ start: seg.start, end: seg.end, speaker: seg.speaker, text: seg.text });
          } else {
            const dur = Math.max(seg.end - seg.start, 0.5);
            const wDur = dur / words.length;
            for (let i = 0; i < words.length; i += 3) {
              const slice = words.slice(i, i + 3);
              const cStart = seg.start + (i * wDur);
              const cEnd = Math.min(seg.end, cStart + (slice.length * wDur));
              fallbackChunks.push({ start: cStart, end: cEnd, speaker: seg.speaker, text: slice.join(" ") });
            }
          }
        }
        setPreviewChunks(fallbackChunks);
      }
      
      // Also fetch the refined server-side speech-cadence chunks
      api.transcription.chunks(project.id, 3)
        .then((chunks) => {
          if (chunks && chunks.length > 0) {
            setPreviewChunks(chunks);
          }
        })
        .catch(() => {});
    } else {
      setPreviewChunks([]);
    }
  }, [project?.id, project?.transcript]);

  // Compute currently active chunk at playback time `cur`
  // Added tolerance of 0.15s to prevent flicker between speech boundaries
  const activeChunk = previewChunks.find((c) => cur >= (c.start - 0.05) && cur <= (c.end + 0.15));

  useEffect(() => {
    if (panel === "settings") {
      api.settings.getCookieStatus().then((r) => setCookieConfigured(r.configured)).catch(() => {});
    }
  }, [panel]);

  const handleSaveCookies = async () => {
    if (!cookieTxt.trim()) return;
    setCookieSaving(true);
    setCookieMsg("");
    try {
      await api.settings.saveCookies(cookieTxt);
      setCookieConfigured(true);
      setCookieMsg("Cookies saved successfully! YouTube downloads will now use authentication.");
      setCookieTxt("");
    } catch (e: any) {
      setCookieMsg(`Failed to save cookies: ${e.message}`);
    } finally {
      setCookieSaving(false);
    }
  };

  const v = useRef<HTMLVideoElement>(null);
  const strip = useRef<HTMLDivElement>(null);
  const selOnly = useRef(false);
  const sel = useRef({ s: 0, e: 0 });
  sel.current = { s: start, e: end };
  const dur = meta?.duration ?? 0;
  const frame = meta && meta.fps > 0 ? 1 / meta.fps : 0.04;

  // Initialize config, load or create default project
  useEffect(() => {
    api.config().then(setCfg).catch(() => {});
    api.music.list().then(setMusicTracks).catch(() => {});

    // Load recent project or create default
    api.projects.list().then((list) => {
      if (list.length > 0) {
        loadFullProject(list[0].id);
      } else {
        api.projects.create("Untitled Studio Project", "General").then((p) => {
          setProject(p);
        });
      }
    });
  }, []);

  const loadFullProject = async (projectId: string) => {
    try {
      const full = await api.projects.get(projectId);
      setProject(full);
      if (full.video_id) {
        setVid(full.video_id);
        const m = await fetch(apiUrl(`/api/video/${full.video_id}/metadata`)).then((r) => r.json());
        setMeta(m);
        setStartS(0);
        setEndS(m.duration);
        setCur(0);
      } else {
        setVid(null);
        setMeta(null);
      }
    } catch (e: any) {
      setErr(e.message);
    }
  };

  useEffect(() => {
    if (!job || ["done", "failed", "cancelled"].includes(job.status)) return;
    const t = setInterval(() => api.job(job.id).then(setJob).catch((e) => setErr(e.message)), 600);
    return () => clearInterval(t);
  }, [job?.id, job?.status]);

  useEffect(() => {
    if (v.current) {
      v.current.volume = vol;
      v.current.muted = muted;
    }
  }, [vol, muted, vid]);

  const setStart = (x: number) => {
    const n = r3(clamp(x, 0, sel.current.e - frame));
    setStartS(n);
    return n;
  };
  const setEnd = (x: number) => {
    const n = r3(clamp(x, sel.current.s + frame, dur));
    setEndS(n);
    return n;
  };
  const seek = (t: number) => {
    const n = clamp(t, 0, dur);
    if (v.current) v.current.currentTime = n;
    setCur(n);
  };

  const loaded = async (r: Loaded & { initial_transcript?: any }) => {
    setVid(r.video_id);
    setMeta(r.metadata);
    setStartS(0);
    setEndS(r.metadata.duration);
    setCur(0);
    setJob(null);
    setPreview("");
    setErr("");

    // Attach to current project or auto-create project so tabs work immediately
    if (project) {
      const updated = await api.projects.update(project.id, {
        video_id: r.video_id,
        video_name: r.metadata.name,
        video_duration: r.metadata.duration,
        thumbnail_url: apiUrl(`/api/video/${r.video_id}/thumbs/0`),
      });
      if (updated) {
        if (r.initial_transcript?.segments && !updated.has_transcript) {
          try {
            await api.transcription.update(project.id, r.initial_transcript.segments);
            const fresh = await api.projects.get(project.id);
            setProject(fresh);
          } catch {
            setProject(updated);
          }
        } else {
          setProject(updated);
        }
      }
    } else {
      try {
        const title = r.metadata.name?.replace(/\.[^/.]+$/, "") || "Studio Video Project";
        const newProj = await api.projects.create(title, "Projects", r.video_id);
        if (newProj) {
          if (r.initial_transcript?.segments) {
            try {
              await api.transcription.update(newProj.id, r.initial_transcript.segments);
              const fresh = await api.projects.get(newProj.id);
              setProject(fresh);
            } catch {
              setProject(newProj);
            }
          } else {
            setProject(newProj);
          }
        }
      } catch (e) {
        console.warn("Auto project creation error:", e);
      }
    }
  };

  const run = async (label: string, f: () => Promise<Loaded>) => {
    setErr("");
    setBusy(label);
    setPct(0);
    try {
      loaded(await f());
    } catch (e: any) {
      setErr(e.message);
    } finally {
      setBusy("");
    }
  };

  const importFromUrl = async () => {
    if (!url.trim() || busy) return;
    let targetUrl = url.trim();
    if (!targetUrl.startsWith("http://") && !targetUrl.startsWith("https://")) {
      targetUrl = "https://" + targetUrl;
    }
    setErr("");
    setBusy("Connecting to YouTube…");
    setPct(0);
    try {
      // Start async import job on the backend
      const importJob = await api.importUrl(targetUrl);
      let j = importJob;
      // Poll until done
      while (j.status === "queued" || j.status === "running") {
        await new Promise((r) => setTimeout(r, 1200));
        j = await api.job(j.id);
        setPct(j.progress || 0);
        if (j.status === "running" && (!j.progress || j.progress < 0.05)) {
          setBusy("Extracting video & audio streams…");
        } else if (j.status === "running") {
          setBusy(`Downloading YouTube video… ${Math.round((j.progress || 0) * 100)}%`);
        }
      }
      if (j.status === "failed") throw new Error(j.error || "Import failed");
      if (j.status === "cancelled") throw new Error("Import was cancelled");
      // Fetch the actual video metadata result
      const result = await api.importJobResult(j.id);
      await loaded(result);
      setUrl("");
    } catch (e: any) {
      setErr(e.message || "Failed to import video from URL");
    } finally {
      setBusy("");
      setPct(0);
    }
  };

  const opts = () => ({
    start,
    end,
    ...opt,
    burn_subtitles: showSubtitlesOverlay,
    subtitle_config: currentSubtitleStyle,
    individual_subtitle_styles: individualSubtitleStyles,
    project_id: project?.id,
  });

  const startDrag = (which: "s" | "e" | "h") => (ev: React.PointerEvent) => {
    ev.preventDefault();
    ev.stopPropagation();
    const move = (m: PointerEvent) => {
      const r = strip.current!.getBoundingClientRect();
      const t = clamp(((m.clientX - r.left) / r.width) * dur, 0, dur);
      seek(which === "s" ? setStart(t) : which === "e" ? setEnd(t) : t);
    };
    const up = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  };

  const pct_ = (t: number) => `${(t / (dur || 1)) * 100}%`;
  const togglePlay = () => {
    selOnly.current = false;
    const el = v.current!;
    el.paused ? el.play() : el.pause();
  };
  const playSel = () => {
    selOnly.current = true;
    seek(start);
    v.current!.play();
  };
  const exporting = job && ["queued", "running"].includes(job.status);
  const fast = opt.mode === "fast";

  const handleAddClip = async () => {
    if (!project) return;
    const clipName = `Clip_${(project.clips.length + 1).toString().padStart(2, "0")}`;
    try {
      await api.clips.create(project.id, {
        name: clipName,
        start_time: start,
        end_time: end,
        folder_id: project.folders[0]?.id || null,
      });
      loadFullProject(project.id);
    } catch (e: any) {
      setErr(e.message);
    }
  };

  const handleSelectClip = (clip: ProjectClip) => {
    setActiveClipId(clip.id);
    setStartS(clip.start_time);
    setEndS(clip.end_time);
    seek(clip.start_time);
  };

  const handlePlayClip = (clip: ProjectClip) => {
    setActiveClipId(clip.id);
    setStartS(clip.start_time);
    setEndS(clip.end_time);
    seek(clip.start_time);
    selOnly.current = true;
    v.current?.play();
  };

  const handleGenerateCaptions = async () => {
    if (!project || !vid) return;
    setTranscribing(true);
    setTranscribeMsg("Starting AI Speech-to-Text for device video...");
    try {
      const { task_id } = await api.transcription.transcribe(project.id, "auto", "base");
      setTranscribeMsg("Extracting audio from video...");
      let attempts = 0;
      while (true) {
        await new Promise((r) => setTimeout(r, 2000));
        const task = await api.transcription.pollTask(task_id);
        attempts++;
        if (task.status === "done") {
          const result = await api.transcription.taskResult(task_id);
          setProject({ ...project, transcript: result });
          setTranscribeMsg("Captions generated successfully!");
          setTimeout(() => setTranscribeMsg(""), 3000);
          break;
        } else if (task.status === "failed") {
          throw new Error(task.error || "Caption generation failed");
        }
        if (attempts < 5) setTranscribeMsg("Extracting audio from video...");
        else if (attempts < 15) setTranscribeMsg("AI recognizing speech & generating timestamps...");
        else setTranscribeMsg("Almost done — finalizing sentences...");
      }
    } catch (e: any) {
      setTranscribeMsg(`Error: ${e.message}`);
    } finally {
      setTranscribing(false);
    }
  };

  return (
    <div className="flex h-screen flex-col bg-ink text-paper overflow-hidden">
      {/* Top Studio Navbar */}
      <header className="flex h-14 shrink-0 items-center justify-between border-b border-line bg-panel px-5">
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2 text-base font-black tracking-tight text-paper">
            <Scissors className="text-trim" size={22} />
            <span>ClipTrim HD Studio</span>
          </div>

          {/* Project Switcher Pill */}
          <button
            onClick={() => setShowProjectsModal(true)}
            className="flex items-center gap-2 rounded-lg border border-line bg-ink/70 px-3 py-1.5 text-xs font-semibold text-paper hover:border-trim transition-colors"
          >
            <Folder size={14} className="text-trim" />
            <span className="max-w-[140px] truncate">{project?.name || "Select Project"}</span>
            <span className="rounded bg-line/60 px-1.5 py-0.2 text-[10px] text-mute">
              {project?.clips.length ?? 0} clips
            </span>
          </button>
        </div>

        {/* Center Workspace Tabs */}
        <nav className="hidden md:flex items-center gap-1 rounded-lg border border-line bg-ink/50 p-1 text-xs">
          <button
            onClick={() => setActiveTab("editor")}
            className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 font-bold transition-all ${
              activeTab === "editor" ? "bg-trim text-ink shadow-sm" : "text-mute hover:text-paper"
            }`}
          >
            <Film size={14} />
            Editor
          </button>
          <button
            onClick={() => setActiveTab("auto_shorts")}
            className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 font-bold transition-all ${
              activeTab === "auto_shorts" ? "bg-amber-400 text-ink shadow-sm" : "text-amber-400/80 hover:text-amber-300"
            }`}
          >
            <Sparkles size={14} className="text-amber-500" />
            Auto Shorts
          </button>
          <button
            onClick={() => setActiveTab("transcript")}
            className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 font-bold transition-all ${
              activeTab === "transcript" ? "bg-trim text-ink shadow-sm" : "text-mute hover:text-paper"
            }`}
          >
            <Mic size={14} />
            Transcript
          </button>
          <button
            onClick={() => setActiveTab("scripts")}
            className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 font-bold transition-all ${
              activeTab === "scripts" ? "bg-trim text-ink shadow-sm" : "text-mute hover:text-paper"
            }`}
          >
            <Sparkles size={14} />
            AI Scripts
          </button>
          <button
            onClick={() => setActiveTab("music")}
            className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 font-bold transition-all ${
              activeTab === "music" ? "bg-trim text-ink shadow-sm" : "text-mute hover:text-paper"
            }`}
          >
            <Music size={14} />
            Music
          </button>
          <button
            onClick={() => setActiveTab("exports")}
            className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 font-bold transition-all ${
              activeTab === "exports" ? "bg-trim text-ink shadow-sm" : "text-mute hover:text-paper"
            }`}
          >
            <Download size={14} />
            Export Center
          </button>
        </nav>

        {/* Right Tools */}
        <div className="flex items-center gap-2">
          {meta && (
            <button
              onClick={() => setShowNewLinkModal(true)}
              className="inline-flex items-center gap-1.5 rounded-md border border-amber-500/40 bg-panel px-3 py-1.5 text-xs font-semibold text-amber-300 hover:bg-amber-500/10 transition-colors"
              title="Change YouTube URL or load another video into Editor"
            >
              <RotateCcw size={13} className="text-amber-400" />
              <span>Change Video / Link</span>
            </button>
          )}
          <button
            onClick={() => setShowGDriveModal(true)}
            className="hidden sm:inline-flex items-center gap-1.5 rounded-md border border-line bg-panel px-3 py-1.5 text-xs font-semibold text-paper hover:bg-ink"
          >
            <HardDrive size={14} className="text-blue-400" />
            Drive / ZIP
          </button>
          <button
            onClick={() => setPanel(panel === "settings" ? "" : "settings")}
            className="rounded-md border border-line bg-panel p-1.5 text-mute hover:text-paper"
            title="Settings"
          >
            <Settings size={16} />
          </button>
        </div>
      </header>

      {/* Settings / Info Drawer */}
      {panel === "settings" && (
        <div className="border-b border-line bg-panel px-6 py-4 text-xs space-y-4">
          <div className="flex items-center justify-between">
            <h4 className="font-bold text-sm text-paper">Studio System Status & Cloud Settings</h4>
            <button onClick={() => setPanel("")} className="text-mute hover:text-paper">
              <X size={16} />
            </button>
          </div>
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-4 text-mute">
            <div>
              Upload Limit: <b className="text-paper">{cfg?.max_upload_mb ?? 2048} MB</b>
            </div>
            <div>
              Hardware Encode: <b className="text-paper">{cfg?.hw_encoders.length ? cfg.hw_encoders.join(", ") : "CPU software"}</b>
            </div>
            <div>
              AI Engine: <b className="text-paper">faster-whisper (Int8)</b>
            </div>
            <div>
              Audio Engine: <b className="text-paper">Procedural Synthesizer</b>
            </div>
          </div>

          {/* YouTube Cloud Authentication Box */}
          <div className="rounded-lg border border-line/70 bg-ink/50 p-3 space-y-2">
            <div className="flex items-center justify-between">
              <span className="font-bold text-paper text-xs">
                YouTube Cloud Downloader Auth
              </span>
              <span className={`rounded px-2 py-0.5 text-[10px] font-bold ${cookieConfigured ? "bg-emerald-950 text-emerald-300 border border-emerald-500/30" : "bg-panel text-mute border border-line"}`}>
                {cookieConfigured ? "Authenticated (cookies.txt active)" : "Android Player Profile (Default)"}
              </span>
            </div>
            <p className="text-[11px] text-mute">
              On cloud servers like Render or AWS, YouTube sometimes blocks video downloads from datacenter IPs. You can paste your browser's Netscape <code>cookies.txt</code> below to authenticate the server.
            </p>
            <div className="rounded bg-panel/70 p-2 text-[10.5px] text-mute space-y-1 border border-line/40">
              <b className="text-paper">What to paste & how to get it (30 seconds):</b>
              <ol className="list-decimal list-inside space-y-0.5 text-paper/80">
                <li>Install Chrome extension: <a href="https://chromewebstore.google.com/detail/get-cookiestxt-locally/cclelndahbckbenkjhflpdbgdldlbecc" target="_blank" rel="noreferrer" className="text-trim underline">Get cookies.txt LOCALLY</a></li>
                <li>Go to <a href="https://www.youtube.com" target="_blank" rel="noreferrer" className="text-trim underline">youtube.com</a></li>
                <li>Click the extension icon &rarr; click <b>Export</b> (or copy all text) &rarr; paste into the box below &rarr; click <b>Save Cookies</b>.</li>
              </ol>
            </div>
            <div className="flex gap-2">
              <textarea
                value={cookieTxt}
                onChange={(e) => setCookieTxt(e.target.value)}
                placeholder="# Netscape HTTP Cookie File&#10;.youtube.com TRUE / FALSE 1750000000 SID ... (paste exported cookies here)"
                rows={3}
                className="flex-1 rounded border border-line bg-panel px-2.5 py-1.5 font-mono text-[10px] text-paper focus:outline-none"
              />
              <button
                onClick={handleSaveCookies}
                disabled={cookieSaving || !cookieTxt.trim()}
                className="self-end rounded bg-trim px-3 py-1.5 font-bold text-xs text-ink hover:bg-amber-300 disabled:opacity-40"
              >
                {cookieSaving ? "Saving..." : "Save Cookies"}
              </button>
            </div>
            {cookieMsg && (
              <p className="text-[11px] text-emerald-400 font-medium">{cookieMsg}</p>
            )}
          </div>
        </div>
      )}

      {/* Error Banner */}
      {err && (
        <div role="alert" className="flex items-center justify-between border-b border-red-500/50 bg-red-950/80 px-5 py-2 text-xs text-red-200">
          <div className="flex items-center gap-3">
            <span>{err}</span>
            {err.toLowerCase().includes("bot") && (
              <button
                onClick={() => setPanel("settings")}
                className="rounded bg-red-800/80 px-2 py-0.5 text-[11px] font-bold text-white underline hover:bg-red-700"
              >
                Open YouTube Settings
              </button>
            )}
          </div>
          <button onClick={() => setErr("")}>
            <X size={14} />
          </button>
        </div>
      )}

      {/* Main Studio Viewport */}
      <div className="flex flex-1 min-h-0 overflow-hidden">
        {activeTab === "auto_shorts" && project && (
          <div className="flex-1 min-w-0">
            <AutoShortsView
              projectId={project.id}
              defaultUrl={url}
              onSeek={seek}
              onSelectCut={(s, e) => {
                setStartS(s);
                setEndS(e);
                seek(s);
                setActiveTab("editor");
              }}
              onClipsGenerated={() => loadFullProject(project.id)}
            />
          </div>
        )}

        {activeTab === "transcript" && project && (
          <div className="flex-1 min-w-0">
            <TranscriptStudioView
              projectId={project.id}
              transcript={project.transcript}
              defaultUrl={url}
              onSeek={seek}
              onSelectCut={(s, e) => {
                setStartS(s);
                setEndS(e);
                seek(s);
                setActiveTab("editor");
              }}
              onTranscriptUpdated={(t) => setProject({ ...project, transcript: t })}
            />
          </div>
        )}

        {activeTab === "scripts" && project && (
          <div className="flex-1 min-w-0">
            <AIScriptStudioView
              projectId={project.id}
              analysis={project.analysis}
              scripts={project.scripts}
              onSeek={seek}
              onSelectCut={(s, e) => {
                setStartS(s);
                setEndS(e);
                seek(s);
                setActiveTab("editor");
              }}
              onAnalysisUpdated={(a) => setProject({ ...project, analysis: a })}
              onScriptsUpdated={(s) => setProject({ ...project, scripts: s })}
              onClipsCreated={() => loadFullProject(project.id)}
            />
          </div>
        )}

        {activeTab === "music" && project && (
          <div className="flex-1 min-w-0">
            <MusicStudioView
              project={project}
              projectId={project.id}
              selectedTrackId={selectedMusicId}
              onSelectTrack={setSelectedMusicId}
            />
          </div>
        )}

        {activeTab === "exports" && project && (
          <div className="flex-1 min-w-0">
            <ExportCenterView
              projectId={project.id}
              projectName={project.name}
              clips={project.clips}
              musicTracks={musicTracks}
              selectedMusicId={selectedMusicId}
              selectedSubtitlePreset={selectedSubtitlePreset}
              subtitleConfig={currentSubtitleStyle}
            />
          </div>
        )}

        {/* Primary 3-Panel Studio Editor */}
        {activeTab === "editor" && (
          <>
            {/* Left Panel: Clips & Folders Tree */}
            <aside className="w-72 shrink-0 border-r border-line bg-panel flex flex-col hidden lg:flex">
              {project && (
                <MultiClipList
                  projectId={project.id}
                  folders={project.folders}
                  clips={project.clips}
                  activeClipId={activeClipId}
                  onSelectClip={handleSelectClip}
                  onPlayClip={handlePlayClip}
                  onRefreshClips={() => loadFullProject(project.id)}
                  onAddClipCurrentSelection={handleAddClip}
                />
              )}
            </aside>

            {/* Center Panel: Video Player & Timeline */}
            <main className="flex-1 min-w-0 flex flex-col bg-ink overflow-y-auto">
              {!meta ? (
                /* Import / Dropzone Landing if no video */
                <div className="m-auto max-w-xl p-8 text-center space-y-6">
                  <div>
                    <h2 className="text-3xl font-extrabold text-paper">ClipTrim HD Studio</h2>
                    <p className="text-sm text-mute mt-2">
                      Professional AI video editing, clipping, transcription, and short-video assembly.
                    </p>
                  </div>

                  <label
                    onDragOver={(e) => { e.preventDefault(); setDrag(true); }}
                    onDragLeave={() => setDrag(false)}
                    onDrop={(e) => {
                      e.preventDefault();
                      setDrag(false);
                      const f = e.dataTransfer.files[0];
                      if (f) run("Uploading", () => api.upload(f, setPct));
                    }}
                    className={`flex cursor-pointer flex-col items-center gap-3 rounded-xl border-2 border-dashed p-10 text-center transition-all ${
                      drag ? "border-trim bg-panel" : "border-line hover:border-mute"
                    }`}
                  >
                    <Upload className="text-trim" size={32} />
                    <span className="font-semibold text-paper">Drop a video here, or browse files</span>
                    <span className="text-xs text-mute">
                      MP4, MOV, MKV, WebM, MTS • up to {cfg?.max_upload_mb ?? 2048} MB
                    </span>
                    <input
                      type="file"
                      accept="video/*,.mkv,.mts"
                      className="sr-only"
                      onChange={(e) => {
                        const f = e.target.files?.[0];
                        if (f) run("Uploading", () => api.upload(f, setPct));
                        e.target.value = "";
                      }}
                    />
                  </label>

                  {/* YouTube Import Input */}
                  <div className="flex gap-2">
                    <div className="relative flex-1">
                      <Link2 size={16} className="absolute left-3 top-3 text-mute" />
                      <input
                        value={url}
                        onChange={(e) => setUrl(e.target.value)}
                        onKeyDown={(e) => e.key === "Enter" && importFromUrl()}
                        placeholder="Paste YouTube link or direct video file URL"
                        className="w-full rounded-md border border-line bg-panel py-2 pl-9 pr-3 text-sm text-paper focus:border-trim focus:outline-none"
                      />
                    </div>
                    <button
                      className={solid}
                      disabled={!url || !!busy}
                      onClick={importFromUrl}
                    >
                      Import
                    </button>
                  </div>

                  {busy && (
                    <div className="mt-4" role="status">
                      <div className="mb-1 flex items-center justify-center gap-2 text-sm text-paper">
                        <Loader2 className="animate-spin text-trim" size={16} />
                        {busy}
                      </div>
                      <div className="h-2 rounded bg-panel overflow-hidden max-w-sm mx-auto">
                        <div
                          className="h-2 rounded bg-trim transition-all duration-500"
                          style={{ width: pct > 0 ? `${pct * 100}%` : (busy.startsWith("Uploading") ? "30%" : "15%") }}
                        />
                      </div>
                      {pct > 0 && (
                        <p className="text-center text-xs text-mute mt-1">{Math.round(pct * 100)}% complete</p>
                      )}
                    </div>
                  )}
                </div>
              ) : (
                /* Interactive Player & Timeline */
                <div className="p-5 flex-1 flex flex-col justify-between max-w-5xl mx-auto w-full space-y-4">
                  {/* Top Bar with Title, Screen Aspect Ratio Switcher, and Change Link Button */}
                  <div className="flex flex-wrap items-center justify-between gap-2 bg-panel border border-line px-4 py-2.5 rounded-lg">
                    <div className="flex items-center gap-2 min-w-0">
                      <Film size={16} className="text-trim shrink-0" />
                      <span className="text-xs font-semibold text-paper truncate max-w-xs sm:max-w-md">
                        {meta?.name || "Active Video"}
                      </span>
                    </div>

                    <div className="flex items-center gap-2">
                      {/* Screen / Aspect Ratio Selector (Auto Source vs 9:16 Shorts vs 16:9 Landscape vs 1:1 Square) */}
                      <div className="flex items-center gap-1 rounded-lg border border-line bg-ink px-2 py-1 text-xs">
                        <span className="text-[11px] text-mute font-semibold">Frame:</span>
                        <div className="flex rounded overflow-hidden border border-line/60">
                          <button
                            onClick={() => setPlayerAspectRatio("auto")}
                            className={`px-2 py-0.5 text-[11px] font-bold transition-colors ${playerAspectRatio === "auto" ? "bg-amber-400 text-ink" : "text-mute hover:text-paper"}`}
                            title="Auto Detect Source Aspect Ratio (9:16 vertical or 16:9 widescreen)"
                          >
                            Auto ({meta?.height && meta?.width ? (meta.height > meta.width ? "9:16" : "16:9") : "Auto"})
                          </button>
                          <button
                            onClick={() => setPlayerAspectRatio("9:16")}
                            className={`px-2 py-0.5 text-[11px] font-bold transition-colors ${playerAspectRatio === "9:16" ? "bg-amber-400 text-ink" : "text-mute hover:text-paper"}`}
                            title="9:16 Vertical Short / Reel (TikTok, Reels, Shorts)"
                          >
                            9:16 Short
                          </button>
                          <button
                            onClick={() => setPlayerAspectRatio("16:9")}
                            className={`px-2 py-0.5 text-[11px] font-bold transition-colors ${playerAspectRatio === "16:9" ? "bg-amber-400 text-ink" : "text-mute hover:text-paper"}`}
                            title="16:9 Landscape (YouTube Standard)"
                          >
                            16:9
                          </button>
                          <button
                            onClick={() => setPlayerAspectRatio("1:1")}
                            className={`px-2 py-0.5 text-[11px] font-bold transition-colors ${playerAspectRatio === "1:1" ? "bg-amber-400 text-ink" : "text-mute hover:text-paper"}`}
                            title="1:1 Square Center Crop"
                          >
                            1:1
                          </button>
                        </div>
                      </div>

                      <button
                        onClick={() => setShowNewLinkModal(true)}
                        className="inline-flex items-center gap-1.5 rounded-md border border-amber-500/40 bg-ink px-3 py-1.5 text-xs font-semibold text-amber-300 hover:bg-amber-500/10 transition-colors shrink-0"
                      >
                        <RotateCcw size={13} className="text-amber-400" />
                        <span>&larr; Put Another Link / Video</span>
                      </button>
                    </div>
                  </div>

                  {/* Video Screen Container with Dynamic Frame Aspect Ratio */}
                  {(() => {
                    const isVerticalSource = meta?.height && meta?.width ? meta.height > meta.width : false;
                    const effectiveAspect = playerAspectRatio === "auto" ? (isVerticalSource ? "9:16" : "16:9") : playerAspectRatio;

                    return (
                      <div className="flex justify-center w-full">
                        <div
                          className={`relative rounded-lg bg-black overflow-hidden shadow-2xl border border-line select-none group transition-all duration-300 ${
                            effectiveAspect === "9:16"
                              ? "w-[340px] sm:w-[380px] aspect-[9/16]"
                              : effectiveAspect === "1:1"
                              ? "w-[480px] aspect-square"
                              : effectiveAspect === "fit"
                              ? "w-full max-h-[580px]"
                              : "w-full aspect-video"
                          }`}
                        >
                          <video
                            ref={v}
                            src={apiUrl(`/api/video/${vid}/source`)}
                            className="h-full w-full object-contain cursor-pointer"
                            onClick={togglePlay}
                            onPlay={() => setPlaying(true)}
                            onPause={() => setPlaying(false)}
                            onTimeUpdate={(e) => {
                              const t = e.currentTarget.currentTime;
                              setCur(t);
                              if (selOnly.current && t >= sel.current.e) {
                                e.currentTarget.pause();
                                selOnly.current = false;
                              }
                            }}
                          />

                          {/* Live Interactive Subtitle Overlay with Direct Visual Selection, Dragging & Resizing */}
                          {showSubtitlesOverlay && activeChunk && (() => {
                            const cueKey = `${activeChunk.start}_${activeChunk.end}`;
                            const isSelected = selectedSubtitleCueKey === cueKey;
                            const effectiveStyle = individualSubtitleStyles[cueKey] || currentSubtitleStyle;

                            const posX = effectiveStyle.pos_x ?? 50;
                            const posY = effectiveStyle.pos_y ?? (effectiveAspect === "9:16" ? 85 : 82);
                            const rot = effectiveStyle.rotation ?? 0;
                            const fontSizeRem = ((effectiveStyle.font_size || 28) / 16);
                            const animName = effectiveStyle.animation || "popup";

                            return (
                              <div
                                style={{
                                  position: "absolute",
                                  left: `${posX}%`,
                                  top: `${posY}%`,
                                  transform: `translate(-50%, -50%) rotate(${rot}deg)`,
                                  zIndex: 40,
                                }}
                                onPointerDown={(e) => {
                                  e.stopPropagation();
                                  setSelectedSubtitleCueKey(cueKey);
                                  setIsSubtitleDragging(true);

                                  const videoContainer = e.currentTarget.parentElement;
                                  if (!videoContainer) return;
                                  const containerRect = videoContainer.getBoundingClientRect();

                                  const onMove = (moveEv: PointerEvent) => {
                                    const rawX = ((moveEv.clientX - containerRect.left) / containerRect.width) * 100;
                                    const rawY = ((moveEv.clientY - containerRect.top) / containerRect.height) * 100;
                                    const clampedX = Math.max(5, Math.min(95, Math.round(rawX)));
                                    const clampedY = Math.max(5, Math.min(95, Math.round(rawY)));

                                    // Flexible independent positioning per cue:
                                    // Moving this specific subtitle persists directly for this cue
                                    setIndividualSubtitleStyles((prev) => ({
                                      ...prev,
                                      [cueKey]: {
                                        ...(prev[cueKey] || currentSubtitleStyle),
                                        pos_x: clampedX,
                                        pos_y: clampedY,
                                      },
                                    }));
                                  };

                                  const onUp = () => {
                                    setIsSubtitleDragging(false);
                                    window.removeEventListener("pointermove", onMove);
                                    window.removeEventListener("pointerup", onUp);
                                  };

                                  window.addEventListener("pointermove", onMove);
                                  window.addEventListener("pointerup", onUp);
                                }}
                                className={`cursor-move touch-none select-none transition-shadow ${
                                  isSelected
                                    ? "ring-2 ring-amber-400 ring-offset-2 ring-offset-black/60 rounded p-1 shadow-2xl"
                                    : "hover:ring-1 hover:ring-amber-400/50"
                                }`}
                                tabIndex={0}
                                onKeyDown={(e) => {
                                  if (["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"].includes(e.key)) {
                                    e.preventDefault();
                                    const step = e.shiftKey ? 3 : 1;
                                    const curX = effectiveStyle.pos_x ?? 50;
                                    const curY = effectiveStyle.pos_y ?? 85;
                                    const newX = e.key === "ArrowLeft" ? curX - step : e.key === "ArrowRight" ? curX + step : curX;
                                    const newY = e.key === "ArrowUp" ? curY - step : e.key === "ArrowDown" ? curY + step : curY;
                                    setIndividualSubtitleStyles((prev) => ({
                                      ...prev,
                                      [cueKey]: {
                                        ...(prev[cueKey] || currentSubtitleStyle),
                                        pos_x: newX,
                                        pos_y: newY,
                                      },
                                    }));
                                  }
                                }}
                              >
                                <div
                                  className={`text-center font-extrabold tracking-wide transition-transform ${
                                    animName === "popup"
                                      ? "anim-popup"
                                      : animName === "bounce"
                                      ? "anim-bounce"
                                      : animName === "shake"
                                      ? "anim-shake"
                                      : animName === "flip"
                                      ? "anim-flip"
                                      : animName === "spin"
                                      ? "anim-spin"
                                      : animName === "pulse"
                                      ? "anim-pulse"
                                      : animName === "stretch"
                                      ? "anim-stretch"
                                      : animName === "glitch"
                                      ? "anim-glitch"
                                      : animName === "wave"
                                      ? "anim-wave"
                                      : animName === "neon"
                                      ? "anim-neon"
                                      : animName === "gradient"
                                      ? "anim-gradient"
                                      : animName === "slide_up"
                                      ? "anim-slide_up"
                                      : animName === "scale_in"
                                      ? "anim-scale_in"
                                      : animName === "spring"
                                      ? "anim-spring"
                                      : animName === "smooth_reveal"
                                      ? "anim-smooth_reveal"
                                      : "anim-popup"
                                  }`}
                                  style={{
                                    fontFamily:
                                      effectiveStyle.font_family === "Khand"
                                        ? "'Khand', sans-serif"
                                        : effectiveStyle.font_family === "Impact"
                                        ? "Impact, Charcoal, sans-serif"
                                        : effectiveStyle.font_family === "Devanagari" || effectiveStyle.font_family === "NotoSansDevanagari"
                                        ? "'Noto Sans Devanagari', sans-serif"
                                        : effectiveStyle.font_family === "Georgia"
                                        ? "Georgia, serif"
                                        : "Arial, sans-serif",
                                    color: effectiveStyle.primary_color || "#FFFF00",
                                    fontSize: `${fontSizeRem}rem`,
                                    fontWeight: effectiveStyle.bold !== false ? "bold" : "normal",
                                    fontStyle: effectiveStyle.italic ? "italic" : "normal",
                                    textDecoration: effectiveStyle.underline ? "underline" : "none",
                                    backgroundColor:
                                      effectiveStyle.border_style === 3 || (effectiveStyle.bg_color && effectiveStyle.bg_color !== "transparent")
                                        ? effectiveStyle.bg_color || "#000000"
                                        : "transparent",
                                    padding: effectiveStyle.border_style === 3 ? "4px 12px" : "0",
                                    borderRadius: effectiveStyle.border_style === 3 ? "8px" : "0",
                                    textShadow:
                                      effectiveStyle.border_style === 3
                                        ? "none"
                                        : `-2px -2px 0 ${effectiveStyle.outline_color || "#000"}, 2px -2px 0 ${effectiveStyle.outline_color || "#000"}, -2px 2px 0 ${effectiveStyle.outline_color || "#000"}, 2px 2px 0 ${effectiveStyle.outline_color || "#000"}, 0 4px 12px rgba(0,0,0,0.95)`,
                                    lineHeight: 1.15,
                                    whiteSpace: "nowrap",
                                  }}
                                >
                                  {(() => {
                                    let txt = activeChunk.text;
                                    if (effectiveStyle.casing === "uppercase") txt = txt.toUpperCase();
                                    else if (effectiveStyle.casing === "lowercase") txt = txt.toLowerCase();

                                    if (effectiveStyle.animation === "pop_keyword" || effectiveStyle.animation === "karaoke") {
                                      const words = txt.split(" ");
                                      if (words.length > 1) {
                                        const longestIdx = words.reduce((maxI, w, i, arr) => (w.length > arr[maxI].length ? i : maxI), 0);
                                        return words.map((w, idx) => (
                                          <span
                                            key={idx}
                                            className={`inline-block mx-1 transition-transform ${
                                              idx === longestIdx
                                                ? "scale-125 font-black drop-shadow-[0_0_12px_rgba(255,255,0,0.85)] underline decoration-amber-400 decoration-2"
                                                : "opacity-90"
                                            }`}
                                            style={{
                                              color: idx === longestIdx ? effectiveStyle.highlight_color || "#00FF66" : effectiveStyle.primary_color,
                                            }}
                                          >
                                            {w}
                                          </span>
                                        ));
                                      }
                                    }
                                    return txt;
                                  })()}
                                </div>

                                {isSelected && (
                                  <>
                                    <div className="absolute -top-1.5 -left-1.5 h-3 w-3 rounded-full bg-amber-400 border border-black shadow" />
                                    <div className="absolute -top-1.5 -right-1.5 h-3 w-3 rounded-full bg-amber-400 border border-black shadow" />
                                    <div className="absolute -bottom-1.5 -left-1.5 h-3 w-3 rounded-full bg-amber-400 border border-black shadow" />
                                    <div className="absolute -bottom-1.5 -right-1.5 h-3 w-3 rounded-full bg-amber-400 border border-black shadow" />
                                    <div className="absolute -top-6 left-1/2 -translate-x-1/2 rounded bg-amber-400 px-1.5 py-0.2 text-[9px] font-bold text-ink whitespace-nowrap shadow">
                                      Drag or use arrows to position
                                    </div>
                                  </>
                                )}
                              </div>
                            );
                          })()}
                        </div>
                      </div>
                    );
                  })()}

                  {/* Real-time Subtitle & Typography Effects Studio Bar */}
                  <div className="flex flex-wrap items-center justify-between gap-2.5 rounded-lg border border-amber-500/30 bg-ink/90 p-2.5 shadow-lg">
                    <div className="flex items-center gap-2">
                      <span className="flex items-center gap-1.5 text-xs font-bold text-amber-300">
                        <Type size={14} className="text-amber-400" />
                        <span>Subtitle Live FX:</span>
                      </span>

                      <button
                        onClick={() => setShowSubtitlesOverlay(!showSubtitlesOverlay)}
                        className={`rounded px-2.5 py-1 text-xs font-bold transition-all ${
                          showSubtitlesOverlay
                            ? "bg-amber-400 text-ink shadow-sm"
                            : "bg-panel text-mute hover:text-paper border border-line"
                        }`}
                        title="Toggle live subtitle preview on video player"
                      >
                        {showSubtitlesOverlay ? "ON" : "OFF"}
                      </button>

                      {previewChunks.length === 0 && (
                        <button
                          onClick={handleGenerateCaptions}
                          disabled={transcribing}
                          className="rounded bg-amber-500/20 hover:bg-amber-500/30 border border-amber-500/40 px-2 py-0.5 text-[11px] font-bold text-amber-300 flex items-center gap-1 transition-colors"
                        >
                          <Sparkles size={11} />
                          {transcribing ? "Generating Captions..." : "Generate Captions First"}
                        </button>
                      )}

                      {previewChunks.length > 0 && (
                        <span className="rounded bg-emerald-950/80 px-2 py-0.5 text-[10px] text-emerald-300 border border-emerald-500/30">
                          {previewChunks.length} cues synced
                        </span>
                      )}

                      <button
                        onClick={() => setShowSubtitlePanel(!showSubtitlePanel)}
                        className={`rounded px-2.5 py-1 text-xs font-bold transition-all flex items-center gap-1.5 ${
                          showSubtitlePanel
                            ? "bg-amber-500/30 text-amber-200 border border-amber-400/50"
                            : "bg-panel text-mute hover:text-paper border border-line"
                        }`}
                        title="Toggle VEED-style Subtitle Styles Library"
                      >
                        <Sparkles size={12} className="text-amber-400" />
                        <span>Style Library (VEED)</span>
                      </button>
                    </div>

                    <div className="flex flex-wrap items-center gap-2 text-xs">
                      <div className="flex items-center gap-1 bg-panel px-2 py-1 rounded border border-line">
                        <span className="text-mute text-[11px]">Font:</span>
                        <select
                          value={currentSubtitleStyle.font_family || "Khand"}
                          onChange={(e) => {
                            setCurrentSubtitleStyle((prev) => ({ ...prev, font_family: e.target.value }));
                            setSubFont(e.target.value);
                          }}
                          className="bg-transparent text-paper font-semibold focus:outline-none text-xs cursor-pointer"
                        >
                          <option value="Khand">Khand Bold (AP Style)</option>
                          <option value="Impact">Impact (Viral Big)</option>
                          <option value="Devanagari">Noto Sans Devanagari</option>
                          <option value="Arial">Arial Bold</option>
                          <option value="Georgia">Georgia (Cinematic Serif)</option>
                        </select>
                      </div>

                      <div className="flex items-center gap-1 bg-panel px-2 py-1 rounded border border-line">
                        <span className="text-mute text-[11px]">FX:</span>
                        <select
                          value={currentSubtitleStyle.animation || "popup"}
                          onChange={(e) => {
                            setCurrentSubtitleStyle((prev) => ({ ...prev, animation: e.target.value }));
                            setSubEffect(e.target.value);
                          }}
                          className="bg-transparent text-amber-300 font-bold focus:outline-none text-xs cursor-pointer max-w-[180px] truncate"
                        >
                          <option value="popup">Word Pop (Punch-In)</option>
                          <option value="pop_keyword">AI Keyword Focus</option>
                          <option value="karaoke">Karaoke Highlight</option>
                          <option value="bounce">Word Bounce</option>
                          <option value="slide_up">Slide Up</option>
                          <option value="smooth_reveal">Smooth Reveal</option>
                          <option value="spring">Spring Elastic</option>
                          <option value="glitch">RGB Glitch Split</option>
                          <option value="neon">Cyberpunk Neon</option>
                        </select>
                      </div>

                      <div className="flex items-center gap-1 bg-panel px-2 py-1 rounded border border-line">
                        <span className="text-mute text-[11px]">Color:</span>
                        <select
                          value={currentSubtitleStyle.primary_color || "#F8F0AE"}
                          onChange={(e) => {
                            setCurrentSubtitleStyle((prev) => ({ ...prev, primary_color: e.target.value }));
                            setSubColor(e.target.value);
                          }}
                          className="bg-transparent font-bold focus:outline-none text-xs cursor-pointer"
                          style={{ color: currentSubtitleStyle.primary_color || "#F8F0AE" }}
                        >
                          <option value="#F8F0AE">Cream Yellow (#F8F0AE)</option>
                          <option value="#FFFF00">Vibrant Yellow (#FFFF00)</option>
                          <option value="#00FF66">Neon Green (#00FF66)</option>
                          <option value="#FFFFFF">Crisp White (#FFFFFF)</option>
                          <option value="#00FFFF">Cyan Pop (#00FFFF)</option>
                          <option value="#FF3366">Neon Coral (#FF3366)</option>
                        </select>
                      </div>

                      <div className="flex items-center gap-1 bg-panel px-2 py-1 rounded border border-line">
                        <span className="text-mute text-[11px]">Case:</span>
                        <select
                          value={currentSubtitleStyle.casing || "uppercase"}
                          onChange={(e) => {
                            setCurrentSubtitleStyle((prev) => ({ ...prev, casing: e.target.value as any }));
                            setSubCase(e.target.value);
                          }}
                          className="bg-transparent text-paper font-semibold focus:outline-none text-xs cursor-pointer"
                        >
                          <option value="uppercase">UPPERCASE (Shorts)</option>
                          <option value="normal">Normal Speech</option>
                          <option value="lowercase">lowercase</option>
                        </select>
                      </div>
                    </div>
                  </div>

                  {/* Player Transport Controls */}
                  <div className="flex flex-wrap items-center gap-2 bg-panel p-3 rounded-lg border border-line">
                    <button className={ghost} onClick={togglePlay} aria-label={playing ? "Pause" : "Play"}>
                      {playing ? <Pause size={16} /> : <Play size={16} />}
                    </button>
                    <button className={ghost} onClick={() => seek(cur - frame)} aria-label="Previous frame">
                      <ChevronLeft size={16} />
                    </button>
                    <button className={ghost} onClick={() => seek(cur + frame)} aria-label="Next frame">
                      <ChevronRight size={16} />
                    </button>
                    <span className="px-3 text-sm font-mono text-paper">
                      {fmt(cur)} <span className="text-mute">/ {fmt(dur)}</span>
                    </span>
                    <button className={ghost} onClick={() => setMuted(!muted)} aria-label="Mute">
                      {muted || vol === 0 ? <VolumeX size={16} /> : <Volume2 size={16} />}
                    </button>
                    <input
                      type="range"
                      min={0}
                      max={1}
                      step={0.05}
                      value={muted ? 0 : vol}
                      onChange={(e) => { setVol(+e.target.value); setMuted(false); }}
                      className="w-20 accent-amber-400"
                    />

                    {/* Add to project clips button */}
                    <button
                      onClick={handleAddClip}
                      className="ml-auto inline-flex items-center gap-1.5 rounded bg-emerald-600 px-3 py-1.5 text-xs font-bold text-white hover:bg-emerald-500"
                    >
                      <Plus size={14} />
                      Save as Clip
                    </button>
                    <button className={ghost} onClick={() => v.current?.requestFullscreen()} aria-label="Fullscreen">
                      <Maximize size={16} />
                    </button>
                  </div>

                  {/* Timeline Strip */}
                  <div className="rounded-lg border border-line bg-panel p-4 space-y-3">
                    {/* Text-to-Timeline & Auto-Cut Dialogue Bar */}
                    <div className="rounded-lg border border-amber-500/40 bg-gradient-to-r from-amber-950/30 via-ink to-amber-950/20 p-2.5">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="flex items-center gap-1.5 text-xs font-bold text-amber-300 shrink-0">
                          <Scissors size={14} className="text-amber-400" />
                          <span>Text-to-Timeline Cut:</span>
                        </span>

                        <div className="relative flex-1 min-w-[220px]">
                          <input
                            type="text"
                            placeholder="Type or paste spoken sentence / dialogue to auto-snap timeline..."
                            value={timelineTextQuery}
                            onChange={(e) => setTimelineTextQuery(e.target.value)}
                            onKeyDown={async (e) => {
                              if (e.key === "Enter" && timelineTextQuery.trim().length > 2 && project?.id) {
                                setTimelineMatching(true);
                                setErr("");
                                try {
                                  const res = await api.transcription.matchText(project.id, timelineTextQuery.trim());
                                  setTimelineMatchInfo(res);
                                  setStartS(res.start);
                                  setEndS(res.end);
                                  seek(res.start);
                                } catch (err: any) {
                                  setErr(err.message || "Could not find spoken dialogue in video transcript.");
                                } finally {
                                  setTimelineMatching(false);
                                }
                              }
                            }}
                            className="w-full rounded border border-line bg-ink px-3 py-1 text-xs text-paper placeholder-mute/60 focus:border-amber-400 focus:outline-none"
                          />
                        </div>

                        <button
                          onClick={async () => {
                            if (!timelineTextQuery.trim() || !project?.id) return;
                            setTimelineMatching(true);
                            setErr("");
                            try {
                              const res = await api.transcription.matchText(project.id, timelineTextQuery.trim());
                              setTimelineMatchInfo(res);
                              setStartS(res.start);
                              setEndS(res.end);
                              seek(res.start);
                            } catch (err: any) {
                              setErr(err.message || "Could not find spoken dialogue in video transcript.");
                            } finally {
                              setTimelineMatching(false);
                            }
                          }}
                          disabled={timelineMatching || !timelineTextQuery.trim()}
                          className="inline-flex items-center gap-1.5 rounded bg-amber-400 px-3 py-1 text-xs font-bold text-ink hover:bg-amber-300 disabled:opacity-40 transition-colors shrink-0 shadow-sm"
                        >
                          {timelineMatching ? <Loader2 size={13} className="animate-spin" /> : <Sparkles size={13} />}
                          Snap & Cut Here
                        </button>
                      </div>

                      {timelineMatchInfo && (
                        <div className="mt-2 flex items-center justify-between border-t border-amber-500/20 pt-1.5 text-[11px] text-amber-200">
                          <span className="truncate">
                            âœ“ Matched: <strong>{fmt(timelineMatchInfo.start)} &rarr; {fmt(timelineMatchInfo.end)}</strong> ({timelineMatchInfo.duration}s) &bull; {timelineMatchInfo.confidence}% accuracy &bull; "{timelineMatchInfo.matched_text}"
                          </span>
                          <button
                            onClick={() => setTimelineMatchInfo(null)}
                            className="text-mute hover:text-paper ml-2 shrink-0"
                          >
                            &times;
                          </button>
                        </div>
                      )}
                    </div>

                    <div className="flex items-center justify-between">
                      <div className="text-xs font-bold uppercase tracking-wider text-mute">
                        Selection Length: <span className="text-trim font-mono">{fmt(end - start)}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <button className={ghost} onClick={() => setZoom(Math.max(1, zoom / 2))}>
                          <ZoomOut size={14} />
                        </button>
                        <button className={ghost} onClick={() => setZoom(Math.min(16, zoom * 2))}>
                          <ZoomIn size={14} />
                        </button>
                      </div>
                    </div>

                    <div className="overflow-x-auto px-2 pb-2">
                      <div
                        ref={strip}
                        style={{ width: `${zoom * 100}%` }}
                        className="relative h-20 touch-none select-none"
                        onPointerDown={(e) => {
                          const r = strip.current!.getBoundingClientRect();
                          seek(((e.clientX - r.left) / r.width) * dur);
                          startDrag("h")(e);
                        }}
                      >
                        {/* Filmstrip thumbnails */}
                        <div className="absolute inset-0 flex overflow-hidden rounded">
                          {Array.from({ length: meta.thumbs }, (_, i) => (
                            <img
                              key={i}
                              src={apiUrl(`/api/video/${vid}/thumbs/${i}`)}
                              draggable={false}
                              alt=""
                              className="h-full min-w-0 flex-1 object-cover"
                              onError={(e) => (e.currentTarget.style.visibility = "hidden")}
                            />
                          ))}
                        </div>

                        {/* Dimmed regions */}
                        <div className="absolute inset-y-0 left-0 bg-black/70" style={{ width: pct_(start) }} />
                        <div className="absolute inset-y-0 right-0 bg-black/70" style={{ left: pct_(end) }} />

                        {/* Selected range border */}
                        <div
                          className="pointer-events-none absolute inset-y-0 border-y-2 border-trim"
                          style={{ left: pct_(start), width: `calc(${pct_(end)} - ${pct_(start)})` }}
                        />

                        {/* Handles */}
                        <div
                          role="slider"
                          aria-label="Start"
                          aria-valuenow={start}
                          onPointerDown={startDrag("s")}
                          className="absolute -bottom-1 -top-1 w-3.5 -translate-x-full cursor-ew-resize rounded-l bg-trim shadow-md"
                          style={{ left: pct_(start) }}
                        />
                        <div
                          role="slider"
                          aria-label="End"
                          aria-valuenow={end}
                          onPointerDown={startDrag("e")}
                          className="absolute -bottom-1 -top-1 w-3.5 cursor-ew-resize rounded-r bg-trim shadow-md"
                          style={{ left: pct_(end) }}
                        />
                        {/* Playhead */}
                        <div className="pointer-events-none absolute -bottom-2 -top-2 w-0.5 bg-white shadow-lg" style={{ left: pct_(cur) }} />
                      </div>
                    </div>

                    {/* Numeric Fields */}
                    <div className="grid grid-cols-2 gap-3 sm:grid-cols-[1fr_1fr_auto]">
                      <TimeField label="Start (HH:MM:SS.mmm)" value={start} onCommit={(x) => { const n = setStart(x); seek(n); return n; }} />
                      <TimeField label="End (HH:MM:SS.mmm)" value={end} onCommit={(x) => { const n = setEnd(x); seek(n); return n; }} />
                      <div className="col-span-2 flex flex-wrap items-end gap-2 sm:col-span-1">
                        <button className={ghost} onClick={() => setStart(cur)}>Start here</button>
                        <button className={ghost} onClick={() => setEnd(cur)}>End here</button>
                        <button className={ghost} onClick={playSel}><Play size={14} />Play selection</button>
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </main>

            {/* Right Inspector Panel */}
            <aside className="w-80 shrink-0 border-l border-line bg-panel space-y-4 overflow-y-auto hidden xl:flex flex-col">
              {/* Toggle Header for Export vs Subtitle Customizer */}
              {showSubtitlePanel ? (
                <div className="flex flex-col h-full">
                  <div className="flex items-center justify-between border-b border-line px-4 py-2.5 bg-ink/40">
                    <span className="text-xs font-bold text-amber-300 flex items-center gap-1.5">
                      <Sparkles size={13} className="text-amber-400" />
                      Subtitle Customizer (VEED)
                    </span>
                    <button
                      onClick={() => setShowSubtitlePanel(false)}
                      className="text-xs text-mute hover:text-paper"
                    >
                      Show Export Settings &rarr;
                    </button>
                  </div>
                  <div className="flex-1 overflow-hidden">
                    <SubtitleCustomizerPanel
                      presets={subtitlePresets}
                      currentStyle={
                        selectedSubtitleCueKey && individualSubtitleStyles[selectedSubtitleCueKey]
                          ? individualSubtitleStyles[selectedSubtitleCueKey]
                          : currentSubtitleStyle
                      }
                      onStyleChange={(updates) => {
                        if (selectedSubtitleCueKey) {
                          setIndividualSubtitleStyles((prev) => ({
                            ...prev,
                            [selectedSubtitleCueKey]: {
                              ...(prev[selectedSubtitleCueKey] || currentSubtitleStyle),
                              ...updates,
                            },
                          }));
                        } else {
                          setCurrentSubtitleStyle((prev) => ({ ...prev, ...updates }));
                        }
                      }}
                      onApplyPreset={(preset) => {
                        const newStyle: SubtitleStyle = {
                          ...currentSubtitleStyle,
                          id: preset.id,
                          name: preset.name,
                          category: preset.category,
                          font_family: preset.font_family,
                          font_size: preset.font_size,
                          font_weight: preset.font_weight,
                          primary_color: preset.primary_color,
                          highlight_color: preset.highlight_color,
                          outline_color: preset.outline_color,
                          outline_width: preset.outline_width,
                          shadow_color: preset.shadow_color,
                          shadow_depth: preset.shadow_depth,
                          shadow_blur: preset.shadow_blur,
                          bg_color: preset.bg_color,
                          border_style: preset.border_style,
                          alignment: preset.alignment,
                          margin_v: preset.margin_v,
                          casing: preset.casing,
                          animation: preset.animation,
                        };
                        if (selectedSubtitleCueKey) {
                          setIndividualSubtitleStyles((prev) => ({
                            ...prev,
                            [selectedSubtitleCueKey]: newStyle,
                          }));
                        } else {
                          setCurrentSubtitleStyle(newStyle);
                        }
                        setSubFont(preset.font_family);
                        setSubColor(preset.primary_color);
                        setSubEffect(preset.animation || "popup");
                        setSubCase(preset.casing || "uppercase");
                      }}
                      selectedSegmentId={selectedSubtitleCueKey}
                      selectedSegmentText={
                        activeChunk && `${activeChunk.start}_${activeChunk.end}` === selectedSubtitleCueKey
                          ? activeChunk.text
                          : undefined
                      }
                      onResetIndividualStyle={() => {
                        if (selectedSubtitleCueKey) {
                          setIndividualSubtitleStyles((prev) => {
                            const copy = { ...prev };
                            delete copy[selectedSubtitleCueKey];
                            return copy;
                          });
                          setSelectedSubtitleCueKey(null);
                        }
                      }}
                      onApplyPositionToAll={() => {
                        if (selectedSubtitleCueKey && individualSubtitleStyles[selectedSubtitleCueKey]) {
                          const customPos = individualSubtitleStyles[selectedSubtitleCueKey];
                          setCurrentSubtitleStyle((prev) => ({
                            ...prev,
                            pos_x: customPos.pos_x,
                            pos_y: customPos.pos_y,
                            alignment: customPos.alignment,
                            rotation: customPos.rotation,
                          }));
                          // Clear per-cue position overrides so all match this new global position
                          setIndividualSubtitleStyles({});
                        }
                      }}
                    />
                  </div>
                </div>
              ) : (
                <div className="p-5 space-y-4">
                  <div className="flex items-center justify-between border-b border-line pb-2">
                    <h3 className="font-extrabold text-sm uppercase tracking-wider text-paper">Export Selection</h3>
                    <button
                      onClick={() => setShowSubtitlePanel(true)}
                      className="text-xs font-bold text-amber-400 hover:text-amber-300 underline"
                    >
                      &larr; Subtitle Styles
                    </button>
                  </div>
                  <div>
                    <div className="mb-1 text-xs text-mute">Mode</div>
                    <Seg
                      value={opt.mode}
                      onChange={(m) => setOpt({ ...opt, mode: m })}
                      options={[["precise", "Precise"], ["fast", "Fast"]]}
                    />
                    <p className="mt-1 text-xs text-mute">
                      {fast ? "Stream copy: instant, but starts at previous keyframe." : "Re-encodes for frame-accurate cuts."}
                    </p>
                  </div>

              <div>
                <div className="mb-1 text-xs text-mute">Resolution</div>
                <Seg
                  disabled={fast}
                  value={opt.resolution}
                  onChange={(x) => setOpt({ ...opt, resolution: x })}
                  options={[["original", "Orig"], ["720p", "720p"], ["1080p", "1080p"], ["4k", "4K"]]}
                />
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <div className="mb-1 text-xs text-mute">Codec</div>
                  <Seg
                    disabled={fast}
                    value={opt.codec}
                    onChange={(x) => setOpt({ ...opt, codec: x })}
                    options={[["h264", "H.264"], ["h265", "H.265"]]}
                  />
                </div>
                <div>
                  <div className="mb-1 text-xs text-mute">Quality</div>
                  <Seg
                    disabled={fast}
                    value={opt.quality}
                    onChange={(x) => setOpt({ ...opt, quality: x })}
                    options={[["high", "High"], ["balanced", "Mid"]]}
                  />
                </div>
              </div>

              <div className="flex gap-2 pt-2">
                <button
                  className={`${solid} flex-1 justify-center`}
                  disabled={!vid || !!exporting}
                  onClick={() => {
                    setErr("");
                    setJob(null);
                    api.trim(vid!, opts()).then(setJob).catch((e) => setErr(e.message));
                  }}
                >
                  <Scissors size={16} />
                  Export Clip
                </button>
                <button
                  className={ghost}
                  disabled={!vid || !!exporting || !!busy}
                  onClick={async () => {
                    setBusy("Preview");
                    try {
                      setPreview((await api.preview(vid!, opts())).preview_url);
                    } catch (e: any) {
                      setErr(e.message);
                    } finally {
                      setBusy("");
                    }
                  }}
                >
                  {busy === "Preview" ? <Loader2 className="animate-spin" size={16} /> : <Eye size={16} />}
                  Preview
                </button>
              </div>

              {job && (
                <div role="status" className="rounded-lg border border-line bg-ink/60 p-3">
                  <div className="mb-1 flex justify-between text-xs text-paper">
                    <span>{{ queued: "Queued", running: "Processing", done: "Ready", failed: "Failed", cancelled: "Cancelled" }[job.status]}</span>
                    <span>{Math.round(job.progress * 100)}%</span>
                  </div>
                  <div className="h-1.5 rounded bg-ink overflow-hidden">
                    <div className="h-1.5 rounded bg-trim transition-all" style={{ width: `${job.progress * 100}%` }} />
                  </div>
                  {job.status === "done" && (
                    <a className={`${solid} mt-3 w-full justify-center text-xs`} href={apiUrl(`/api/jobs/${job.id}/download`)}>
                      <Download size={14} />
                      Download Clip
                    </a>
                  )}
                </div>
              )}

              {preview && (
                <div>
                  <div className="mb-1 text-xs text-mute">Preview (480p)</div>
                  <video src={preview} controls className="w-full rounded bg-black" />
                </div>
              )}

              {/* Captions & Subtitles Section (for Device & Uploaded Videos) */}
              <div className="border-t border-line pt-4 space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1.5 font-bold text-xs text-paper">
                    <FileText size={14} className="text-amber-400" />
                    <span>Captions & Subtitles</span>
                  </div>
                  {project?.transcript && (
                    <span className="rounded bg-emerald-950/80 px-2 py-0.5 text-[10px] text-emerald-300 border border-emerald-500/30">
                      {project.transcript.segments.length} lines ready
                    </span>
                  )}
                </div>

                <p className="text-[11px] text-mute leading-relaxed">
                  Generate AI speech-to-text captions directly from your device video or download timestamped subtitles.
                </p>

                {/* Generate Captions Button */}
                <button
                  onClick={handleGenerateCaptions}
                  disabled={!vid || transcribing}
                  className="w-full inline-flex items-center justify-center gap-2 rounded-md border border-amber-400/50 bg-amber-400/10 hover:bg-amber-400/20 px-3 py-2 text-xs font-bold text-amber-300 disabled:opacity-40 transition-colors shadow-sm"
                  title="Generate speech-to-text subtitles directly from the video file"
                >
                  {transcribing ? <Loader2 size={14} className="animate-spin text-amber-400" /> : <Mic size={14} className="text-amber-400" />}
                  <span>{transcribing ? "Generating Captions..." : project?.transcript ? "Regenerate AI Captions" : "✨ Generate Captions from Video"}</span>
                </button>

                {transcribeMsg && (
                  <p className="text-[11px] text-center text-amber-300/90 font-mono animate-pulse">
                    {transcribeMsg}
                  </p>
                )}

                {/* Download Subtitles / Captions (SRT & TXT) */}
                {project && (
                  <div className="space-y-2 pt-1">
                    <div className="text-[10px] uppercase font-bold tracking-wider text-mute">
                      Download Timeline Captions
                    </div>

                    {/* Full Video Subtitles */}
                    <div className="grid grid-cols-2 gap-2">
                      <a
                        href={api.transcription.exportUrl(project.id, "srt")}
                        download
                        className={`inline-flex items-center justify-center gap-1.5 rounded-md border border-line bg-panel px-2.5 py-1.5 text-xs font-semibold text-paper hover:bg-ink hover:border-amber-400/50 transition-colors ${!project.transcript ? "opacity-40 pointer-events-none" : ""}`}
                        title="Download full video subtitles in standard SRT format"
                      >
                        <Download size={13} className="text-amber-400" />
                        <span>SRT (Full)</span>
                      </a>
                      <a
                        href={api.transcription.exportUrl(project.id, "txt")}
                        download
                        className={`inline-flex items-center justify-center gap-1.5 rounded-md border border-line bg-panel px-2.5 py-1.5 text-xs font-semibold text-paper hover:bg-ink hover:border-amber-400/50 transition-colors ${!project.transcript ? "opacity-40 pointer-events-none" : ""}`}
                        title="Download full video transcript with timestamps in TXT format"
                      >
                        <Download size={13} className="text-amber-400" />
                        <span>TXT (Timeline)</span>
                      </a>
                    </div>

                    {/* Selected Clip Subtitles (Range) */}
                    {start > 0 || (end > 0 && dur > 0 && end < dur) ? (
                      <div className="pt-1">
                        <div className="text-[10px] text-mute mb-1">
                          Current Selection ({Math.round(start)}s &rarr; {Math.round(end)}s):
                        </div>
                        <div className="grid grid-cols-2 gap-2">
                          <a
                            href={api.transcription.exportUrl(project.id, "srt", start, end)}
                            download
                            className={`inline-flex items-center justify-center gap-1.5 rounded-md border border-line bg-ink px-2 py-1 text-[11px] font-semibold text-amber-300 hover:bg-panel transition-colors ${!project.transcript ? "opacity-40 pointer-events-none" : ""}`}
                            title="Download SRT only for the selected cut range"
                          >
                            <Download size={12} />
                            <span>SRT (Cut)</span>
                          </a>
                          <a
                            href={api.transcription.exportUrl(project.id, "txt", start, end)}
                            download
                            className={`inline-flex items-center justify-center gap-1.5 rounded-md border border-line bg-ink px-2 py-1 text-[11px] font-semibold text-amber-300 hover:bg-panel transition-colors ${!project.transcript ? "opacity-40 pointer-events-none" : ""}`}
                            title="Download TXT with timestamps only for the selected cut range"
                          >
                            <Download size={12} />
                            <span>TXT (Cut)</span>
                          </a>
                        </div>
                      </div>
                    ) : null}

                    {/* Link to Transcript Tab for Word-by-Word Editing */}
                    <div className="pt-2 text-center">
                      <button
                        onClick={() => setActiveTab("transcript")}
                        className="text-[11px] text-amber-400/80 hover:text-amber-300 hover:underline inline-flex items-center gap-1"
                      >
                        <span>Open Transcript Studio to edit words &rarr;</span>
                      </button>
                    </div>
                  </div>
                )}
                </div>
              </div>
            )}
          </aside>
        </>
      )}
    </div>

      {/* Modals */}
      {showProjectsModal && (
        <ProjectsModal
          currentProjectId={project?.id || null}
          onSelectProject={(id) => loadFullProject(id)}
          onClose={() => setShowProjectsModal(false)}
        />
      )}

      {showGDriveModal && (
        <GDriveModal
          onImportVideo={(path, name) => {
            run("Loading Drive Video", () => api.importLocalPath(path, name));
          }}
          onClose={() => setShowGDriveModal(false)}
        />
      )}

      {/* Put Another Video Link / Change Video Modal */}
      {showNewLinkModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
          <div className="w-full max-w-lg rounded-2xl border border-line bg-panel p-6 shadow-2xl space-y-5 animate-in fade-in zoom-in-95">
            <div className="flex items-center justify-between border-b border-line pb-4">
              <div className="flex items-center gap-2 text-paper font-bold text-base">
                <Link2 className="text-amber-400" size={20} />
                <span>Load Another Video / YouTube Link</span>
              </div>
              <button
                onClick={() => setShowNewLinkModal(false)}
                className="text-mute hover:text-paper rounded-lg p-1 transition-colors"
              >
                <X size={18} />
              </button>
            </div>

            <p className="text-xs text-mute leading-relaxed">
              Paste a new YouTube discourse link or pick a video file directly from your computer/device. The editor and timeline will update instantly.
            </p>

            <div className="space-y-4">
              {/* Option 1: Device File Upload */}
              <div className="rounded-xl border border-line bg-ink/60 p-4 space-y-2">
                <span className="text-xs font-bold text-paper flex items-center gap-1.5">
                  <Upload size={14} className="text-amber-400" />
                  <span>Option A: Pick Video from Device / Computer</span>
                </span>
                <p className="text-[11px] text-mute">
                  Select any MP4, MOV, MKV, or WebM video file directly from your storage.
                </p>
                <label className="flex cursor-pointer items-center justify-center gap-2 rounded-lg border border-dashed border-amber-400/50 bg-amber-400/10 hover:bg-amber-400/20 py-2.5 px-3 text-xs font-bold text-amber-300 transition-colors">
                  <Upload size={15} />
                  <span>Choose Video File from Device</span>
                  <input
                    type="file"
                    accept="video/*,.mkv,.mts"
                    className="sr-only"
                    onChange={(e) => {
                      const f = e.target.files?.[0];
                      if (f) {
                        setShowNewLinkModal(false);
                        run("Uploading video from device", () => api.upload(f, setPct));
                      }
                      e.target.value = "";
                    }}
                  />
                </label>
              </div>

              {/* Option 2: YouTube or Video URL */}
              <div className="rounded-xl border border-line bg-ink/60 p-4 space-y-2">
                <span className="text-xs font-bold text-paper flex items-center gap-1.5">
                  <Link2 size={14} className="text-amber-400" />
                  <span>Option B: Paste YouTube or Video Link</span>
                </span>
                <div className="flex gap-2">
                  <div className="relative flex-1">
                    <Link2 size={16} className="absolute left-3 top-3 text-mute" />
                    <input
                      type="text"
                      value={newLinkInput}
                      onChange={(e) => setNewLinkInput(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" && newLinkInput.trim() && !busy) {
                          const target = newLinkInput.trim();
                          setShowNewLinkModal(false);
                          setUrl(target);
                          setTimeout(() => {
                            let u = target;
                            if (!u.startsWith("http://") && !u.startsWith("https://")) u = "https://" + u;
                            setBusy("Connecting to YouTube…");
                            api.importUrl(u).then(async (j) => {
                              while (j.status === "queued" || j.status === "running") {
                                await new Promise((r) => setTimeout(r, 1200));
                                j = await api.job(j.id);
                                setPct(j.progress || 0);
                                if (j.status === "running") {
                                  setBusy(`Downloading YouTube video… ${Math.round((j.progress || 0) * 100)}%`);
                                }
                              }
                              if (j.status === "done") {
                                const result = await api.importJobResult(j.id);
                                await loaded(result);
                              }
                            }).catch((err) => setErr(err.message || "Import failed")).finally(() => {
                              setBusy("");
                              setNewLinkInput("");
                            });
                          }, 50);
                        }
                      }}
                      placeholder="https://www.youtube.com/watch?v=..."
                      className="w-full rounded-lg border border-line bg-panel py-2 pl-9 pr-3 text-xs text-paper focus:border-amber-400 focus:outline-none"
                    />
                  </div>
                  <button
                    onClick={() => {
                      if (!newLinkInput.trim() || busy) return;
                      const target = newLinkInput.trim();
                      setShowNewLinkModal(false);
                      setUrl(target);
                      setTimeout(() => {
                        let u = target;
                        if (!u.startsWith("http://") && !u.startsWith("https://")) u = "https://" + u;
                        setBusy("Connecting to YouTube…");
                        api.importUrl(u).then(async (j) => {
                          while (j.status === "queued" || j.status === "running") {
                            await new Promise((r) => setTimeout(r, 1200));
                            j = await api.job(j.id);
                            setPct(j.progress || 0);
                            if (j.status === "running") {
                              setBusy(`Downloading YouTube video… ${Math.round((j.progress || 0) * 100)}%`);
                            }
                          }
                          if (j.status === "done") {
                            const result = await api.importJobResult(j.id);
                            await loaded(result);
                          }
                        }).catch((err) => setErr(err.message || "Import failed")).finally(() => {
                          setBusy("");
                          setNewLinkInput("");
                        });
                      }, 50);
                    }}
                    disabled={!newLinkInput.trim() || !!busy}
                    className="rounded-lg bg-amber-400 px-4 py-2 text-xs font-bold text-ink hover:bg-amber-300 disabled:opacity-40 transition-colors"
                  >
                    Import Link
                  </button>
                </div>
              </div>
            </div>

            <div className="pt-2 flex items-center justify-between border-t border-line text-xs">
              <button
                onClick={() => {
                  setShowNewLinkModal(false);
                  setVid(null);
                  setMeta(null);
                }}
                className="text-mute hover:text-paper underline"
              >
                Clear current video & return to upload dropzone
              </button>
              <button
                onClick={() => setShowNewLinkModal(false)}
                className="rounded-lg border border-line bg-panel px-3 py-1.5 text-xs text-mute hover:text-paper"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
