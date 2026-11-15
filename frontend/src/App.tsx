import { useEffect, useRef, useState } from "react";
import { Scissors, Upload, Link2, Play, Pause, Volume2, VolumeX, Maximize, ZoomIn, ZoomOut, Download,
  X, ChevronLeft, ChevronRight, Home, HelpCircle, Settings, Loader2, Eye } from "lucide-react";
import { api, Meta, Job, Loaded } from "./api";

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
  const [txt, setTxt] = useState(fmt(value)); const [bad, setBad] = useState(false);
  useEffect(() => { setTxt(fmt(value)); setBad(false); }, [value]);
  const commit = () => {
    const v = parse(txt);
    if (isNaN(v)) return setBad(true);
    setBad(false); setTxt(fmt(onCommit(v)));
  };
  return (
    <label className="block text-xs text-mute">{label}
      <input value={txt} onChange={(e) => setTxt(e.target.value)} onBlur={commit}
        onKeyDown={(e) => e.key === "Enter" && commit()} aria-invalid={bad}
        className={`mt-1 w-full rounded-md bg-ink border px-3 py-2 text-base text-paper ${bad ? "border-red-400" : "border-line"}`} />
    </label>
  );
}

function Seg({ value, options, onChange, disabled }: { value: string; options: [string, string][]; onChange: (v: string) => void; disabled?: boolean }) {
  return (
    <div className={`flex rounded-md border border-line overflow-hidden ${disabled ? "opacity-40 pointer-events-none" : ""}`}>
      {options.map(([v, l]) => (
        <button key={v} onClick={() => onChange(v)}
          className={`flex-1 px-2 py-2 text-sm ${value === v ? "bg-trim text-ink font-semibold" : "bg-ink hover:bg-panel"}`}>{l}</button>
      ))}
    </div>
  );
}

export default function App() {
  const [vid, setVid] = useState<string | null>(null);
  const [meta, setMeta] = useState<Meta | null>(null);
  const [start, setStartS] = useState(0), [end, setEndS] = useState(0), [cur, setCur] = useState(0);
  const [playing, setPlaying] = useState(false), [muted, setMuted] = useState(false), [vol, setVol] = useState(1);
  const [zoom, setZoom] = useState(1);
  const [busy, setBusy] = useState(""), [pct, setPct] = useState(0), [err, setErr] = useState(""), [url, setUrl] = useState("");
  const [panel, setPanel] = useState<"" | "help" | "settings">("");
  const [cfg, setCfg] = useState<Awaited<ReturnType<typeof api.config>> | null>(null);
  const [opt, setOpt] = useState({ mode: "precise", codec: "h264", resolution: "original", quality: "high" });
  const [job, setJob] = useState<Job | null>(null), [preview, setPreview] = useState(""), [drag, setDrag] = useState(false);
  const v = useRef<HTMLVideoElement>(null), strip = useRef<HTMLDivElement>(null), selOnly = useRef(false);
  const sel = useRef({ s: 0, e: 0 }); sel.current = { s: start, e: end };
  const dur = meta?.duration ?? 0, frame = meta && meta.fps > 0 ? 1 / meta.fps : 0.04;

  useEffect(() => { api.config().then(setCfg).catch(() => {}); }, []);
  useEffect(() => {
    if (!job || ["done", "failed", "cancelled"].includes(job.status)) return;
    const t = setInterval(() => api.job(job.id).then(setJob).catch((e) => setErr(e.message)), 600);
    return () => clearInterval(t);
  }, [job?.id, job?.status]);
  useEffect(() => { if (v.current) { v.current.volume = vol; v.current.muted = muted; } }, [vol, muted, vid]);

  const setStart = (x: number) => { const n = r3(clamp(x, 0, sel.current.e - frame)); setStartS(n); return n; };
  const setEnd = (x: number) => { const n = r3(clamp(x, sel.current.s + frame, dur)); setEndS(n); return n; };
  const seek = (t: number) => { const n = clamp(t, 0, dur); if (v.current) v.current.currentTime = n; setCur(n); };

  const loaded = (r: Loaded) => {
    setVid(r.video_id); setMeta(r.metadata); setStartS(0); setEndS(r.metadata.duration); setCur(0);
    setJob(null); setPreview(""); setErr("");
  };
  const run = async (label: string, f: () => Promise<Loaded>) => {
    setErr(""); setBusy(label); setPct(0);
    try { loaded(await f()); } catch (e: any) { setErr(e.message); } finally { setBusy(""); }
  };
  const home = async () => { if (vid) api.remove(vid); setVid(null); setMeta(null); setJob(null); setPreview(""); setErr(""); setPanel(""); };
  const opts = () => ({ start, end, ...opt });

  const startDrag = (which: "s" | "e" | "h") => (ev: React.PointerEvent) => {
    ev.preventDefault(); ev.stopPropagation();
    const move = (m: PointerEvent) => {
      const r = strip.current!.getBoundingClientRect();
      const t = clamp(((m.clientX - r.left) / r.width) * dur, 0, dur);
      seek(which === "s" ? setStart(t) : which === "e" ? setEnd(t) : t);
    };
    const up = () => { window.removeEventListener("pointermove", move); window.removeEventListener("pointerup", up); };
    window.addEventListener("pointermove", move); window.addEventListener("pointerup", up);
  };
  const pct_ = (t: number) => `${(t / (dur || 1)) * 100}%`;
  const togglePlay = () => { selOnly.current = false; const el = v.current!; el.paused ? el.play() : el.pause(); };
  const playSel = () => { selOnly.current = true; seek(start); v.current!.play(); };
  const exporting = job && ["queued", "running"].includes(job.status);
  const fast = opt.mode === "fast";

  return (
    <div className="min-h-screen">
      <header className="flex items-center justify-between border-b border-line px-5 py-3">
        <div className="flex items-center gap-2 text-lg font-extrabold"><Scissors className="text-trim" size={20} />ClipTrim HD</div>
        <nav className="flex gap-2">
          <button className={ghost} onClick={home}><Home size={16} />Home</button>
          <button className={ghost} onClick={() => setPanel(panel === "help" ? "" : "help")}><HelpCircle size={16} />Help</button>
          <button className={ghost} onClick={() => setPanel(panel === "settings" ? "" : "settings")}><Settings size={16} />Settings</button>
        </nav>
      </header>
      {panel && (
        <div className="mx-5 mt-4 max-w-3xl rounded-lg border border-line bg-panel p-4 text-sm leading-relaxed">
          {panel === "help" ? (<>
            <p><b>Fast export</b> copies the video without re-encoding: it is quick and lossless, but the clip starts at the nearest keyframe before your start time.</p>
            <p className="mt-2"><b>Precise export</b> re-encodes the clip so it begins and ends on the exact frame you chose, with audio kept in sync.</p>
            <p className="mt-2">Drag the amber handles, type a timestamp, or use the frame buttons. Paste a YouTube link or direct video URL.</p>
          </>) : (<>
            <p>Upload limit: <b>{cfg?.max_upload_mb ?? "–"} MB</b></p>
            <p>Formats: {cfg?.formats.join(", ")}</p>
            <p>Hardware encoders: <b>{cfg?.hw_encoders.length ? cfg.hw_encoders.join(", ") : "none enabled (software x264/x265)"}</b></p>
          </>)}
        </div>
      )}
      {err && <div role="alert" className="mx-5 mt-4 flex max-w-3xl justify-between rounded-lg border border-red-400/60 bg-red-950/40 p-3 text-sm">{err}<button onClick={() => setErr("")} aria-label="Dismiss"><X size={16} /></button></div>}

      {!meta ? (
        <main className="mx-auto max-w-2xl px-5 py-16">
          <h1 className="text-4xl font-extrabold leading-tight">Cut the part you need.<br />Keep every pixel of it.</h1>
          <label onDragOver={(e) => { e.preventDefault(); setDrag(true); }} onDragLeave={() => setDrag(false)}
            onDrop={(e) => { e.preventDefault(); setDrag(false); const f = e.dataTransfer.files[0]; if (f) run("Uploading", () => api.upload(f, setPct)); }}
            className={`mt-8 flex cursor-pointer flex-col items-center gap-3 rounded-xl border-2 border-dashed p-12 text-center transition-colors ${drag ? "border-trim bg-panel" : "border-line"}`}>
            <Upload className="text-trim" />
            <span className="font-semibold">Drop a video here, or browse files</span>
            <span className="text-sm text-mute">{cfg ? cfg.formats.join(", ") : "mp4, mov, mkv, webm"} · up to {cfg?.max_upload_mb ?? 2048} MB</span>
            <input type="file" accept="video/*,.mkv,.mts" className="sr-only"
              onChange={(e) => { const f = e.target.files?.[0]; if (f) run("Uploading", () => api.upload(f, setPct)); e.target.value = ""; }} />
          </label>
          <div className="mt-6 flex gap-2">
            <div className="relative flex-1"><Link2 size={16} className="absolute left-3 top-3 text-mute" />
              <input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="Paste YouTube link or direct video file URL"
                className="w-full rounded-md border border-line bg-panel py-2 pl-9 pr-3 text-sm" /></div>
            <button className={solid} disabled={!url || !!busy} onClick={() => run("Importing", () => api.importUrl(url))}>Import</button>
          </div>
          {busy && (<div className="mt-6" role="status"><div className="mb-1 flex items-center gap-2 text-sm"><Loader2 className="animate-spin" size={16} />{busy}…{busy === "Uploading" && ` ${Math.round(pct * 100)}%`}</div>
            <div className="h-2 rounded bg-panel"><div className="h-2 rounded bg-trim transition-all" style={{ width: busy === "Uploading" ? `${pct * 100}%` : "40%" }} /></div></div>)}
        </main>
      ) : (
        <main className="grid gap-5 p-5 lg:grid-cols-[1fr_340px]">
          <section className="min-w-0">
            <video ref={v} src={`/api/video/${vid}/source`} className="aspect-video w-full rounded-lg bg-black" onClick={togglePlay}
              onPlay={() => setPlaying(true)} onPause={() => setPlaying(false)}
              onTimeUpdate={(e) => { const t = e.currentTarget.currentTime; setCur(t); if (selOnly.current && t >= sel.current.e) { e.currentTarget.pause(); selOnly.current = false; } }} />
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <button className={ghost} onClick={togglePlay} aria-label={playing ? "Pause" : "Play"}>{playing ? <Pause size={16} /> : <Play size={16} />}</button>
              <button className={ghost} onClick={() => seek(cur - frame)} aria-label="Previous frame"><ChevronLeft size={16} /></button>
              <button className={ghost} onClick={() => seek(cur + frame)} aria-label="Next frame"><ChevronRight size={16} /></button>
              <span className="px-2 text-sm">{fmt(cur)} <span className="text-mute">/ {fmt(dur)}</span></span>
              <button className={ghost} onClick={() => setMuted(!muted)} aria-label="Mute">{muted || vol === 0 ? <VolumeX size={16} /> : <Volume2 size={16} />}</button>
              <input type="range" min={0} max={1} step={0.05} value={muted ? 0 : vol} onChange={(e) => { setVol(+e.target.value); setMuted(false); }} className="w-24 accent-amber-400" aria-label="Volume" />
              <button className={`${ghost} ml-auto`} onClick={() => v.current?.requestFullscreen()} aria-label="Fullscreen"><Maximize size={16} /></button>
            </div>

            <div className="mt-5 rounded-lg border border-line bg-panel p-3">
              <div className="mb-2 flex items-center gap-2">
                <span className="text-sm font-semibold">Clip length <span className="text-trim">{fmt(end - start)}</span></span>
                <button className={`${ghost} ml-auto`} onClick={() => setZoom(Math.max(1, zoom / 2))} aria-label="Zoom out"><ZoomOut size={16} /></button>
                <button className={ghost} onClick={() => setZoom(Math.min(16, zoom * 2))} aria-label="Zoom in"><ZoomIn size={16} /></button>
              </div>
              <div className="overflow-x-auto px-3 pb-2">
                <div ref={strip} style={{ width: `${zoom * 100}%` }} className="relative h-20 touch-none select-none"
                  onPointerDown={(e) => { const r = strip.current!.getBoundingClientRect(); seek(((e.clientX - r.left) / r.width) * dur); startDrag("h")(e); }}>
                  <div className="absolute inset-0 flex overflow-hidden rounded">
                    {Array.from({ length: meta.thumbs }, (_, i) => (
                      <img key={i} src={`/api/video/${vid}/thumbs/${i}`} draggable={false} alt="" className="h-full min-w-0 flex-1 object-cover" onError={(e) => (e.currentTarget.style.visibility = "hidden")} />))}
                  </div>
                  <div className="absolute inset-y-0 left-0 bg-black/65" style={{ width: pct_(start) }} />
                  <div className="absolute inset-y-0 right-0 bg-black/65" style={{ left: pct_(end) }} />
                  <div className="pointer-events-none absolute inset-y-0 border-y-2 border-trim" style={{ left: pct_(start), width: `calc(${pct_(end)} - ${pct_(start)})` }} />
                  <div role="slider" aria-label="Start" aria-valuenow={start} onPointerDown={startDrag("s")} className="absolute -bottom-1 -top-1 w-3 -translate-x-full cursor-ew-resize rounded-l bg-trim" style={{ left: pct_(start) }} />
                  <div role="slider" aria-label="End" aria-valuenow={end} onPointerDown={startDrag("e")} className="absolute -bottom-1 -top-1 w-3 cursor-ew-resize rounded-r bg-trim" style={{ left: pct_(end) }} />
                  <div className="pointer-events-none absolute -bottom-2 -top-2 w-0.5 bg-white" style={{ left: pct_(cur) }} />
                </div>
              </div>
              <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-[1fr_1fr_auto]">
                <TimeField label="Start (HH:MM:SS.mmm)" value={start} onCommit={(x) => { const n = setStart(x); seek(n); return n; }} />
                <TimeField label="End (HH:MM:SS.mmm)" value={end} onCommit={(x) => { const n = setEnd(x); seek(n); return n; }} />
                <div className="col-span-2 flex flex-wrap items-end gap-2 sm:col-span-1">
                  <button className={ghost} onClick={() => setStart(cur)}>Start here</button>
                  <button className={ghost} onClick={() => setEnd(cur)}>End here</button>
                  <button className={ghost} onClick={playSel}><Play size={14} />Play clip</button>
                </div>
              </div>
              <p className="mt-2 text-xs text-mute">Frame step {(frame * 1000).toFixed(1)} ms · {meta.fps} fps · {meta.width}×{meta.height} · {meta.video_codec}{meta.has_audio ? ` + ${meta.audio_codec}` : " · no audio"}</p>
            </div>
          </section>

          <aside className="h-fit space-y-4 rounded-lg border border-line bg-panel p-4">
            <h2 className="text-lg font-extrabold">Export</h2>
            <div><div className="mb-1 text-xs text-mute">Mode</div>
              <Seg value={opt.mode} onChange={(m) => setOpt({ ...opt, mode: m })} options={[["precise", "Precise"], ["fast", "Fast"]]} />
              <p className="mt-1 text-xs text-mute">{fast ? "Stream copy: instant, but the start snaps to the previous keyframe." : "Re-encodes for frame-accurate cuts."}</p></div>
            <div><div className="mb-1 text-xs text-mute">Resolution (never upscaled)</div>
              <Seg disabled={fast} value={opt.resolution} onChange={(x) => setOpt({ ...opt, resolution: x })} options={[["original", "Orig"], ["720p", "720p"], ["1080p", "1080p"], ["1440p", "1440p"], ["4k", "4K"]]} /></div>
            <div className="grid grid-cols-2 gap-3">
              <div><div className="mb-1 text-xs text-mute">Codec (MP4)</div>
                <Seg disabled={fast} value={opt.codec} onChange={(x) => setOpt({ ...opt, codec: x })} options={[["h264", "H.264"], ["h265", "H.265"]]} /></div>
              <div><div className="mb-1 text-xs text-mute">Quality</div>
                <Seg disabled={fast} value={opt.quality} onChange={(x) => setOpt({ ...opt, quality: x })} options={[["high", "High"], ["balanced", "Mid"], ["small", "Small"]]} /></div>
            </div>
            <div className="flex gap-2">
              <button className={`${solid} flex-1 justify-center`} disabled={!!exporting} onClick={() => { setErr(""); setJob(null); api.trim(vid!, opts()).then(setJob).catch((e) => setErr(e.message)); }}>
                <Scissors size={16} />Export clip</button>
              <button className={ghost} disabled={!!exporting || !!busy} onClick={async () => { setBusy("Preview"); try { setPreview((await api.preview(vid!, opts())).preview_url); } catch (e: any) { setErr(e.message); } finally { setBusy(""); } }}>
                {busy === "Preview" ? <Loader2 className="animate-spin" size={16} /> : <Eye size={16} />}Preview</button>
            </div>
            {job && (<div role="status">
              <div className="mb-1 flex justify-between text-sm"><span>{{ queued: "Queued", running: "Processing", done: "Ready", failed: "Failed", cancelled: "Cancelled" }[job.status]}</span><span>{Math.round(job.progress * 100)}%</span></div>
              <div className="h-2 rounded bg-ink"><div className="h-2 rounded bg-trim transition-all" style={{ width: `${job.progress * 100}%` }} /></div>
              {job.error && <p className="mt-2 break-words text-xs text-red-300">{job.error}</p>}
              {exporting && <button className={`${ghost} mt-3`} onClick={() => api.cancel(job.id).then(setJob)}><X size={14} />Cancel</button>}
              {job.status === "done" && <a className={`${solid} mt-3 w-full justify-center`} href={`/api/jobs/${job.id}/download`}><Download size={16} />Download clip</a>}
            </div>)}
            {preview && <div><div className="mb-1 text-xs text-mute">Preview (480p, first 30 s of the selection)</div><video src={preview} controls className="w-full rounded bg-black" /></div>}
          </aside>
        </main>
      )}
    </div>
  );
}
