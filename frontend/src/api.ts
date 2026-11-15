export type Meta = {
  duration: number; width: number; height: number; fps: number; video_codec: string;
  audio_codec: string | null; has_audio: boolean; size: number; name: string; thumbs: number
};

export type Job = {
  id: string; status: "queued" | "running" | "done" | "failed" | "cancelled";
  progress: number; error: string | null
};

export type Loaded = { video_id: string; metadata: Meta };

export type Opts = {
  start: number; end: number; mode: string; codec: string; resolution: string; quality: string
};

export type ProjectFolder = {
  id: string; project_id: string; name: string; sort_order: number; created_at: number
};

export type ProjectClip = {
  id: string; project_id: string; folder_id: string | null; name: string;
  start_time: number; end_time: number; sort_order: number; status: string;
  job_id?: string; output_file?: string; created_at: number
};

export type TranscriptSegment = {
  id: string; start: number; end: number; speaker: string; text: string
};

export type TranscriptData = {
  id: string; language: string; full_text: string; segments: TranscriptSegment[]; created_at: number
};

export type AnalysisTopic = {
  id: string; title: string; start: number; end: number; relevance_score: number;
  summary: string; reason: string
};

export type ViralHook = {
  id: string; type: string; quote: string; start: number; end: number; rationale: string; score: number
};

export type AnalysisMoment = {
  id: string; start: number; end: number; speaker: string; text: string; category: string; virality: number
};

export type AnalysisData = {
  id: string; summary: string; topics: AnalysisTopic[]; moments: AnalysisMoment[]; viral_hooks: ViralHook[];
  created_at: number
};

export type ScriptScene = {
  scene_num: number; role: string; script_timeline: string; duration: number;
  original_start: number; original_end: number; dialogue: string; visual_description: string;
  on_screen_text: string; approved: boolean
};

export type ScriptData = {
  id: string; title: string; duration_target: number; style: string; scenes: ScriptScene[]; created_at: number
};

export type MusicTrack = {
  id: string; project_id?: string; name: string; mood: string; genre: string; duration: number;
  url: string; is_preset: boolean
};

export type SubtitlePreset = {
  id: string; name: string; font_name: string; font_size: number; primary_color: string;
  outline_color: string; outline_width: number; alignment: number; margin_v: number;
  bold: boolean; uppercase: boolean
};

export type ExportItem = {
  id: string; project_id: string; name: string; export_type: string; format: string;
  resolution: string; file_path: string; file_size: number; duration: number; status: string;
  created_at: number
};

export type Project = {
  id: string; name: string; folder: string; video_id: string | null; video_name: string;
  video_duration: number; thumbnail_url: string; status: string; settings: Record<string, any>;
  folders: ProjectFolder[]; clips: ProjectClip[]; transcript: TranscriptData | null;
  analysis: AnalysisData | null; scripts: ScriptData[]; exports: ExportItem[];
  clip_count?: number; has_transcript?: boolean; has_analysis?: boolean;
  created_at: number; updated_at: number
};

export type GDriveFileItem = {
  filename: string; name: string; size: number; category: "video" | "audio" | "subtitle" | "image" | "document";
  ext: string
};

export type VideoAssessment = {
  assessment_id: string; name: string; size: number; duration: number; width: number; height: number;
  fps: number; video_codec: string; audio_codec: string | null; has_audio: boolean; bitrate: number;
  thumbnail_url: string | null; path: string
};

async function j<T>(r: Response): Promise<T> {
  const b = await r.json().catch(() => ({}));
  if (!r.ok) {
    const d = (b as any).detail;
    throw new Error(typeof d === "string" ? d : d ? "Invalid values or server error." : r.statusText);
  }
  return b as T;
}

const post = (u: string, body?: unknown) =>
  fetch(u, { method: "POST", headers: { "Content-Type": "application/json" }, body: body ? JSON.stringify(body) : undefined });

const put = (u: string, body?: unknown) =>
  fetch(u, { method: "PUT", headers: { "Content-Type": "application/json" }, body: body ? JSON.stringify(body) : undefined });

const del = (u: string) => fetch(u, { method: "DELETE" });

export const api = {
  // Existing baseline methods
  config: () => fetch("/api/config").then(j<{ max_upload_mb: number; hw_encoders: string[]; formats: string[] }>),
  upload: (file: File, onProgress: (p: number) => void) =>
    new Promise<Loaded>((res, rej) => {
      const x = new XMLHttpRequest();
      x.open("POST", "/api/upload");
      x.upload.onprogress = (e) => e.lengthComputable && onProgress(e.loaded / e.total);
      x.onload = () => {
        try {
          const b = JSON.parse(x.responseText);
          x.status < 300 ? res(b) : rej(new Error(typeof b.detail === "string" ? b.detail : "Upload failed"));
        } catch { rej(new Error("Upload failed")); }
      };
      x.onerror = () => rej(new Error("Network error"));
      const fd = new FormData(); fd.append("file", file); x.send(fd);
    }),
  importUrl: (url: string) => post("/api/import-url", { url }).then(j<Loaded>),
  remove: (id: string) => del(`/api/video/${id}`),
  trim: (id: string, o: Opts) => post(`/api/video/${id}/trim`, o).then(j<Job>),
  preview: (id: string, o: Opts) => post(`/api/video/${id}/preview`, o).then(j<{ preview_url: string }>),
  job: (id: string) => fetch(`/api/jobs/${id}`).then(j<Job>),
  cancel: (id: string) => post(`/api/jobs/${id}/cancel`).then(j<Job>),

  // Projects
  projects: {
    list: (search = "", folder = "") => fetch(`/api/projects?search=${encodeURIComponent(search)}&folder=${encodeURIComponent(folder)}`).then(j<Project[]>),
    create: (name: string, folder = "General", video_id?: string) => post("/api/projects", { name, folder, video_id }).then(j<Project>),
    get: (id: string) => fetch(`/api/projects/${id}`).then(j<Project>),
    update: (id: string, updates: Partial<Project>) => put(`/api/projects/${id}`, updates).then(j<Project>),
    delete: (id: string) => del(`/api/projects/${id}`).then(j<{ deleted: boolean }>),
    duplicate: (id: string) => post(`/api/projects/${id}/duplicate`).then(j<Project>),
  },

  // Folders & Clips
  folders: {
    create: (projectId: string, name: string) => post(`/api/projects/${projectId}/folders`, { name }).then(j<ProjectFolder>),
    update: (folderId: string, updates: Partial<ProjectFolder>) => put(`/api/folders/${folderId}`, updates).then(j<ProjectFolder>),
    delete: (folderId: string) => del(`/api/folders/${folderId}`).then(j<{ deleted: boolean }>),
  },
  clips: {
    create: (projectId: string, data: { name: string; start_time: number; end_time: number; folder_id?: string | null }) =>
      post(`/api/projects/${projectId}/clips`, data).then(j<ProjectClip>),
    update: (clipId: string, updates: Partial<ProjectClip>) => put(`/api/clips/${clipId}`, updates).then(j<ProjectClip>),
    delete: (clipId: string) => del(`/api/clips/${clipId}`).then(j<{ deleted: boolean }>),
    duplicate: (clipId: string) => post(`/api/clips/${clipId}/duplicate`).then(j<ProjectClip>),
    reorder: (projectId: string, clip_ids: string[]) => post(`/api/projects/${projectId}/clips/reorder`, { clip_ids }).then(j<{ reordered: boolean }>),
    autoNumber: (projectId: string, folder_id?: string | null) => post(`/api/projects/${projectId}/clips/auto-number`, { folder_id }).then(j<Array<{ id: string; name: string }>>),
  },

  // Google Drive & ZIP
  gdrive: {
    import: (url: string) => post("/api/gdrive/import", { url }).then(j<{ type: "zip" | "video"; zip_path?: string; files?: GDriveFileItem[]; assessment?: VideoAssessment }>),
    extract: (zip_path: string, selected_filenames: string[]) => post("/api/gdrive/zip/extract", { zip_path, selected_filenames }).then(j<{ extracted_count: number; video_assessments: VideoAssessment[] }>),
  },

  // Transcription
  transcription: {
    transcribe: (projectId: string, language = "auto", model_size = "base") => post(`/api/projects/${projectId}/transcribe`, { language, model_size }).then(j<TranscriptData>),
    update: (projectId: string, segments: TranscriptSegment[]) => put(`/api/projects/${projectId}/transcript`, { segments }).then(j<TranscriptData>),
    exportUrl: (projectId: string, format = "srt") => `/api/projects/${projectId}/transcript/export?format=${format}`,
  },

  // Content Analysis & AI Scripts
  analysis: {
    analyze: (projectId: string) => post(`/api/projects/${projectId}/analyze`).then(j<AnalysisData>),
    generateScript: (projectId: string, topic_id?: string, duration_target = 60, style = "educational") =>
      post(`/api/projects/${projectId}/scripts/generate`, { topic_id, duration_target, style }).then(j<ScriptData>),
    mapToClips: (projectId: string, scriptId: string, folder_name = "Script Clips") =>
      post(`/api/projects/${projectId}/scripts/${scriptId}/map-to-clips`, { folder_name }).then(j<{ created_clips: ProjectClip[] }>),
  },

  // Music
  music: {
    list: (projectId?: string) => fetch(`/api/music${projectId ? `?project_id=${projectId}` : ""}`).then(j<MusicTrack[]>),
    generate: (mood: string, genre = "cinematic", duration = 60, projectId?: string) =>
      post(`/api/music/generate${projectId ? `?project_id=${projectId}` : ""}`, { mood, genre, duration }).then(j<MusicTrack>),
  },

  // Subtitles
  subtitles: {
    presets: () => fetch("/api/subtitles/presets").then(j<SubtitlePreset[]>),
  },

  // Video Assembly & Export Center
  assembly: {
    detectSilence: (projectId: string) => post(`/api/projects/${projectId}/detect-silence`).then(j<{ silences: Array<{ start: number; end: number; duration: number }> }>),
    assemble: (projectId: string, options: {
      clip_ids: string[];
      music_track_id?: string | null;
      music_volume?: number;
      subtitle_preset?: string | null;
      aspect_ratio?: string;
      resolution?: string;
      enhancements?: Record<string, any>;
      export_name?: string;
    }) => post(`/api/projects/${projectId}/assemble`, options).then(j<{ export_id: string; filename: string; file_size: number; download_url: string }>),
    exports: (projectId: string) => fetch(`/api/projects/${projectId}/exports`).then(j<ExportItem[]>),
    exportZipUrl: (projectId: string) => `/api/projects/${projectId}/export-zip`,
  }
};
