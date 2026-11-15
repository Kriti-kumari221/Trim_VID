import React, { useState } from "react";
import { HardDrive, FileArchive, CheckSquare, Square, Download, Video, Music, FileText, Check, AlertCircle, Loader2, X } from "lucide-react";
import { api, apiUrl, GDriveFileItem, VideoAssessment } from "../api";

interface Props {
  onImportVideo: (file_path: string, name: string) => void;
  onClose: () => void;
}

export function GDriveModal({ onImportVideo, onClose }: Props) {
  const [url, setUrl] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [zipData, setZipData] = useState<{ zip_path: string; files: GDriveFileItem[] } | null>(null);
  const [selectedFiles, setSelectedFiles] = useState<string[]>([]);
  const [extracting, setExtracting] = useState(false);
  const [assessments, setAssessments] = useState<VideoAssessment[]>([]);

  const handleFetchDrive = async () => {
    if (!url.trim()) return;
    setLoading(true);
    setError("");
    setZipData(null);
    setAssessments([]);

    try {
      const res = await api.gdrive.import(url.trim());
      if (res.type === "zip" && res.zip_path && res.files) {
        setZipData({ zip_path: res.zip_path, files: res.files });
        // Select all video files by default
        const videos = res.files.filter((f) => f.category === "video").map((f) => f.filename);
        setSelectedFiles(videos);
      } else if (res.type === "video" && res.assessment) {
        setAssessments([res.assessment]);
      }
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  const handleExtract = async () => {
    if (!zipData || selectedFiles.length === 0) return;
    setExtracting(true);
    setError("");

    try {
      const res = await api.gdrive.extract(zipData.zip_path, selectedFiles);
      setAssessments(res.video_assessments);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setExtracting(false);
    }
  };

  const toggleFile = (filename: string) => {
    setSelectedFiles((prev) =>
      prev.includes(filename) ? prev.filter((x) => x !== filename) : [...prev, filename]
    );
  };

  const selectAll = (cat?: string) => {
    if (!zipData) return;
    if (cat) {
      const catFiles = zipData.files.filter((f) => f.category === cat).map((f) => f.filename);
      setSelectedFiles(Array.from(new Set([...selectedFiles, ...catFiles])));
    } else {
      setSelectedFiles(zipData.files.map((f) => f.filename));
    }
  };

  const deselectAll = () => {
    setSelectedFiles([]);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
      <div className="flex h-[85vh] w-full max-w-4xl flex-col rounded-xl border border-line bg-panel shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-line px-6 py-4">
          <div className="flex items-center gap-3">
            <HardDrive className="text-blue-400" size={24} />
            <div>
              <h2 className="text-lg font-bold text-paper">Google Drive & ZIP Import</h2>
              <p className="text-xs text-mute">Import shareable Drive links, inspect ZIP packages, and assess videos</p>
            </div>
          </div>
          <button onClick={onClose} className="rounded-lg p-2 text-mute hover:bg-ink hover:text-paper">
            <X size={20} />
          </button>
        </div>

        {/* Input */}
        <div className="border-b border-line bg-ink/40 p-6">
          <label className="block text-xs font-semibold text-mute uppercase tracking-wider mb-2">
            Google Drive File or Share Link
          </label>
          <div className="flex gap-2">
            <input
              type="text"
              placeholder="https://drive.google.com/file/d/1A2B3C.../view or open?id=..."
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleFetchDrive()}
              className="flex-1 rounded-md border border-line bg-panel px-4 py-2 text-sm text-paper focus:border-trim focus:outline-none"
            />
            <button
              onClick={handleFetchDrive}
              disabled={loading || !url.trim()}
              className="inline-flex items-center gap-2 rounded-md bg-blue-600 px-5 py-2 text-sm font-semibold text-white hover:bg-blue-500 disabled:opacity-40"
            >
              {loading ? <Loader2 size={16} className="animate-spin" /> : <Download size={16} />}
              Fetch Drive File
            </button>
          </div>
        </div>

        {error && (
          <div className="mx-6 mt-4 flex items-center gap-2 rounded-lg border border-red-500/50 bg-red-950/40 p-3 text-sm text-red-200">
            <AlertCircle size={16} className="text-red-400 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {/* Content area */}
        <div className="flex-1 overflow-y-auto p-6">
          {zipData && (
            <div className="space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-line bg-ink/70 p-4">
                <div className="flex items-center gap-2">
                  <FileArchive size={20} className="text-amber-400" />
                  <div>
                    <h4 className="text-sm font-bold text-paper">ZIP Archive Detected</h4>
                    <p className="text-xs text-mute">{zipData.files.length} total files inside archive</p>
                  </div>
                </div>

                <div className="flex items-center gap-2 text-xs">
                  <button onClick={() => selectAll("video")} className="rounded bg-line px-2.5 py-1 text-mute hover:text-paper">
                    Select All Videos
                  </button>
                  <button onClick={() => selectAll()} className="rounded bg-line px-2.5 py-1 text-mute hover:text-paper">
                    Select All
                  </button>
                  <button onClick={deselectAll} className="rounded bg-line px-2.5 py-1 text-mute hover:text-paper">
                    Deselect
                  </button>
                  <button
                    onClick={handleExtract}
                    disabled={extracting || selectedFiles.length === 0}
                    className="inline-flex items-center gap-1.5 rounded bg-trim px-3 py-1 font-semibold text-ink hover:bg-amber-300 disabled:opacity-40"
                  >
                    {extracting ? <Loader2 size={14} className="animate-spin" /> : <Download size={14} />}
                    Extract Selected ({selectedFiles.length})
                  </button>
                </div>
              </div>

              {/* ZIP File List */}
              <div className="max-h-56 overflow-y-auto rounded-lg border border-line bg-ink/40 divide-y divide-line/40">
                {zipData.files.map((file) => {
                  const isChecked = selectedFiles.includes(file.filename);
                  return (
                    <div
                      key={file.filename}
                      onClick={() => toggleFile(file.filename)}
                      className="flex items-center justify-between px-4 py-2 hover:bg-panel cursor-pointer text-xs transition-colors"
                    >
                      <div className="flex items-center gap-3 truncate">
                        <button className="text-mute hover:text-paper">
                          {isChecked ? <CheckSquare size={16} className="text-trim" /> : <Square size={16} />}
                        </button>
                        {file.category === "video" && <Video size={14} className="text-blue-400 shrink-0" />}
                        {file.category === "audio" && <Music size={14} className="text-purple-400 shrink-0" />}
                        {file.category === "subtitle" && <FileText size={14} className="text-emerald-400 shrink-0" />}
                        {file.category === "document" && <FileText size={14} className="text-mute shrink-0" />}
                        <span className="truncate text-paper">{file.filename}</span>
                      </div>
                      <span className="text-mute shrink-0 font-mono">
                        {(file.size / (1024 * 1024)).toFixed(1)} MB
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Video Assessment Cards */}
          {assessments.length > 0 && (
            <div className="mt-6 space-y-3">
              <h3 className="text-sm font-bold text-paper uppercase tracking-wider flex items-center gap-2">
                <Check size={16} className="text-emerald-400" />
                Video Technical Assessment
              </h3>

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                {assessments.map((v) => (
                  <div key={v.assessment_id} className="rounded-lg border border-line bg-ink/70 p-4 space-y-3">
                    <div className="flex gap-3">
                      {v.thumbnail_url ? (
                        <img src={apiUrl(v.thumbnail_url)} alt="" className="h-20 w-32 rounded object-cover border border-line shrink-0" />
                      ) : (
                        <div className="flex h-20 w-32 items-center justify-center rounded bg-black border border-line shrink-0">
                          <Video size={24} className="text-mute" />
                        </div>
                      )}

                      <div className="min-w-0 flex-1">
                        <h4 className="font-bold text-sm text-paper truncate">{v.name}</h4>
                        <p className="text-xs text-mute mt-1">
                          {v.width} × {v.height} • {v.fps} FPS
                        </p>
                        <p className="text-xs text-mute">
                          Duration: {Math.round(v.duration)}s • {(v.size / (1024 * 1024)).toFixed(1)} MB
                        </p>
                        <p className="text-xs text-mute">
                          Codec: {v.video_codec} {v.has_audio ? `+ ${v.audio_codec}` : "• no audio"}
                        </p>
                      </div>
                    </div>

                    <button
                      onClick={() => {
                        onImportVideo(v.path, v.name);
                        onClose();
                      }}
                      className="w-full rounded bg-trim py-1.5 text-xs font-bold text-ink hover:bg-amber-300 transition-colors"
                    >
                      Use as Active Video in Project
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
