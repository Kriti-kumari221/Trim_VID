import React, { useState, useEffect } from "react";
import { Download, Film, Sparkles, Music, Type, Check, AlertCircle, Loader2, FileArchive, Sliders, Play } from "lucide-react";
import { api, ProjectClip, MusicTrack, ExportItem } from "../api";

interface Props {
  projectId: string;
  projectName: string;
  clips: ProjectClip[];
  musicTracks: MusicTrack[];
  selectedMusicId: string | null;
  selectedSubtitlePreset: string;
}

export function ExportCenterView({
  projectId,
  projectName,
  clips,
  musicTracks,
  selectedMusicId,
  selectedSubtitlePreset,
}: Props) {
  const [aspectRatio, setAspectRatio] = useState("9:16");
  const [resolution, setResolution] = useState("1080p");
  const [exportName, setExportName] = useState(`${projectName}_Short`);
  const [musicTrackId, setMusicTrackId] = useState<string | null>(selectedMusicId);
  const [musicVolume, setMusicVolume] = useState(0.2);
  const [subtitlePreset, setSubtitlePreset] = useState<string | null>(selectedSubtitlePreset);

  // Audio Enhancements
  const [noiseReduction, setNoiseReduction] = useState(true);
  const [voiceEnhancement, setVoiceEnhancement] = useState(true);
  const [audioNormalization, setAudioNormalization] = useState(true);

  const [exporting, setExporting] = useState(false);
  const [error, setError] = useState("");
  const [exportsList, setExportsList] = useState<ExportItem[]>([]);
  const [activeResult, setActiveResult] = useState<{ download_url: string; filename: string } | null>(null);

  const loadExports = () => {
    api.assembly.exports(projectId).then(setExportsList).catch(() => {});
  };

  useEffect(() => {
    loadExports();
  }, [projectId]);

  const handleAssemble = async () => {
    if (clips.length === 0) {
      setError("No clips in project to assemble. Please add or map clips first.");
      return;
    }
    setExporting(true);
    setError("");
    setActiveResult(null);

    try {
      const res = await api.assembly.assemble(projectId, {
        clip_ids: clips.map((c) => c.id),
        music_track_id: musicTrackId,
        music_volume: musicVolume,
        subtitle_preset: subtitlePreset,
        aspect_ratio: aspectRatio,
        resolution: resolution,
        enhancements: {
          noise_reduction: noiseReduction,
          voice_enhancement: voiceEnhancement,
          audio_normalization: audioNormalization,
        },
        export_name: exportName.trim() || "Assembled_Short",
      });

      setActiveResult({ download_url: res.download_url, filename: res.filename });
      loadExports();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setExporting(false);
    }
  };

  return (
    <div className="flex h-full flex-col bg-panel border-r border-line">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-line bg-ink/60 px-5 py-3">
        <div className="flex items-center gap-2">
          <Download size={18} className="text-trim" />
          <h3 className="font-bold text-paper text-sm">Professional Export Center & Video Assembly</h3>
        </div>

        <a
          href={api.assembly.exportZipUrl(projectId)}
          download
          className="inline-flex items-center gap-1.5 rounded border border-line bg-panel px-3 py-1.5 text-xs font-semibold text-paper hover:bg-ink"
        >
          <FileArchive size={14} className="text-amber-400" />
          Download Project Assets ZIP
        </a>
      </div>

      <div className="flex-1 overflow-y-auto p-5 space-y-6">
        {error && (
          <div className="flex items-center gap-2 rounded bg-red-950/60 p-3 text-xs text-red-200 border border-red-500/40">
            <AlertCircle size={16} className="text-red-400 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {/* Success Alert */}
        {activeResult && (
          <div className="flex items-center justify-between rounded-lg border border-emerald-500/50 bg-emerald-950/30 p-4">
            <div className="flex items-center gap-3">
              <Check size={20} className="text-emerald-400" />
              <div>
                <h4 className="font-bold text-sm text-paper">Video Assembly Complete!</h4>
                <p className="text-xs text-mute">{activeResult.filename}</p>
              </div>
            </div>
            <a
              href={activeResult.download_url}
              download
              className="inline-flex items-center gap-1.5 rounded bg-emerald-600 px-4 py-2 text-xs font-bold text-white hover:bg-emerald-500 shadow-md"
            >
              <Download size={14} />
              Download Ready Video
            </a>
          </div>
        )}

        {/* Assembly Studio Form */}
        <div className="rounded-xl border border-line bg-ink/40 p-5 space-y-5">
          <h4 className="text-xs font-bold uppercase tracking-wider text-mute flex items-center gap-2">
            <Sliders size={14} />
            Short-Video Assembly Configuration
          </h4>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {/* Aspect Ratio */}
            <div>
              <label className="block text-[11px] text-mute mb-1 font-medium">Aspect Ratio</label>
              <select
                value={aspectRatio}
                onChange={(e) => setAspectRatio(e.target.value)}
                className="w-full rounded border border-line bg-panel px-3 py-1.5 text-xs text-paper focus:outline-none"
              >
                <option value="9:16">9:16 Vertical (TikTok/Reels/Shorts)</option>
                <option value="16:9">16:9 Landscape (YouTube)</option>
                <option value="1:1">1:1 Square (Feed)</option>
              </select>
            </div>

            {/* Resolution */}
            <div>
              <label className="block text-[11px] text-mute mb-1 font-medium">Resolution</label>
              <select
                value={resolution}
                onChange={(e) => setResolution(e.target.value)}
                className="w-full rounded border border-line bg-panel px-3 py-1.5 text-xs text-paper focus:outline-none"
              >
                <option value="1080p">1080p Full HD</option>
                <option value="720p">720p HD</option>
                <option value="1440p">1440p 2K</option>
                <option value="4k">4K Ultra HD (if supported)</option>
              </select>
            </div>

            {/* Background Music */}
            <div>
              <label className="block text-[11px] text-mute mb-1 font-medium">Background Music</label>
              <select
                value={musicTrackId || ""}
                onChange={(e) => setMusicTrackId(e.target.value || null)}
                className="w-full rounded border border-line bg-panel px-3 py-1.5 text-xs text-paper focus:outline-none"
              >
                <option value="">No Background Music</option>
                {musicTracks.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.name} ({m.mood})
                  </option>
                ))}
              </select>
            </div>

            {/* Subtitles */}
            <div>
              <label className="block text-[11px] text-mute mb-1 font-medium">Burn Subtitles</label>
              <select
                value={subtitlePreset || ""}
                onChange={(e) => setSubtitlePreset(e.target.value || null)}
                className="w-full rounded border border-line bg-panel px-3 py-1.5 text-xs text-paper focus:outline-none"
              >
                <option value="viral_yellow">Viral Shorts (Yellow)</option>
                <option value="viral_green">Viral Shorts (Neon Green)</option>
                <option value="cinematic_white">Cinematic Minimal</option>
                <option value="boxed_modern">Boxed Modern Pill</option>
                <option value="">No Burn-in Subtitles</option>
              </select>
            </div>
          </div>

          {/* Music Volume Slider if track chosen */}
          {musicTrackId && (
            <div className="pt-2 border-t border-line/40">
              <div className="flex items-center justify-between text-xs text-mute mb-1">
                <span>Music Volume Ducking: {Math.round(musicVolume * 100)}%</span>
                <span>(Speech remains loud and clear)</span>
              </div>
              <input
                type="range"
                min={0.05}
                max={0.5}
                step={0.05}
                value={musicVolume}
                onChange={(e) => setMusicVolume(Number(e.target.value))}
                className="w-full accent-pink-500"
              />
            </div>
          )}

          {/* Enhancement Toggles */}
          <div className="pt-2 border-t border-line/40 space-y-2">
            <span className="block text-xs font-bold text-mute uppercase tracking-wider">
              Audio & Video AI Enhancements
            </span>
            <div className="flex flex-wrap gap-4 text-xs">
              <label className="flex items-center gap-2 cursor-pointer text-paper">
                <input
                  type="checkbox"
                  checked={noiseReduction}
                  onChange={(e) => setNoiseReduction(e.target.checked)}
                  className="rounded accent-trim"
                />
                Audio Noise Reduction (FFmpeg Afftdn)
              </label>

              <label className="flex items-center gap-2 cursor-pointer text-paper">
                <input
                  type="checkbox"
                  checked={voiceEnhancement}
                  onChange={(e) => setVoiceEnhancement(e.target.checked)}
                  className="rounded accent-trim"
                />
                Voice Enhancement & Clarity EQ
              </label>

              <label className="flex items-center gap-2 cursor-pointer text-paper">
                <input
                  type="checkbox"
                  checked={audioNormalization}
                  onChange={(e) => setAudioNormalization(e.target.checked)}
                  className="rounded accent-trim"
                />
                EBU R128 Loudness Normalization
              </label>
            </div>
          </div>

          {/* Assembly Action */}
          <div className="pt-3 border-t border-line/60 flex items-center justify-between">
            <div className="text-xs text-mute">
              Assembling <span className="font-bold text-paper">{clips.length} clips</span> in sequence order.
            </div>

            <button
              onClick={handleAssemble}
              disabled={exporting || clips.length === 0}
              className="inline-flex items-center gap-2 rounded-lg bg-trim px-6 py-2.5 text-sm font-extrabold text-ink hover:bg-amber-300 disabled:opacity-40 transition-colors shadow-lg"
            >
              {exporting ? <Loader2 size={16} className="animate-spin" /> : <Sparkles size={16} />}
              {exporting ? "Rendering Video with FFmpeg..." : "Assemble & Render Short Video"}
            </button>
          </div>
        </div>

        {/* Export History Table */}
        {exportsList.length > 0 && (
          <div>
            <h4 className="text-xs font-bold uppercase tracking-wider text-mute mb-3">
              Export History & Downloads ({exportsList.length})
            </h4>

            <div className="rounded-lg border border-line bg-ink/40 overflow-hidden divide-y divide-line/40">
              {exportsList.map((item) => (
                <div key={item.id} className="flex items-center justify-between p-3 hover:bg-panel text-xs transition-colors">
                  <div className="flex items-center gap-3">
                    <Film size={16} className="text-trim shrink-0" />
                    <div>
                      <h5 className="font-bold text-paper">{item.name}</h5>
                      <p className="text-[10px] text-mute">
                        {item.resolution} • {item.format.toUpperCase()} • {(item.file_size / (1024 * 1024)).toFixed(1)} MB • {Math.round(item.duration)}s
                      </p>
                    </div>
                  </div>

                  <a
                    href={`/api/exports/${item.id}/download`}
                    download
                    className="inline-flex items-center gap-1.5 rounded bg-line/60 px-3 py-1 font-semibold text-paper hover:bg-trim hover:text-ink transition-colors"
                  >
                    <Download size={12} />
                    Download
                  </a>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
