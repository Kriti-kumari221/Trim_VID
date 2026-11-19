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
  tempo?: string; energy?: string; acousticness?: string; description?: string;
  url: string; is_preset: boolean; analysis_reason?: string; detected_mood?: string;
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

const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL ?? "").replace(/\/+$/, "");

export const apiUrl = (path: string) => {
  if (/^https?:\/\//i.test(path)) return path;
  return `${API_BASE_URL}${path.startsWith("/") ? path : `/${path}`}`;
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
  fetch(apiUrl(u), { method: "POST", headers: { "Content-Type": "application/json" }, body: body ? JSON.stringify(body) : undefined });

const put = (u: string, body?: unknown) =>
  fetch(apiUrl(u), { method: "PUT", headers: { "Content-Type": "application/json" }, body: body ? JSON.stringify(body) : undefined });

const del = (u: string) => fetch(apiUrl(u), { method: "DELETE" });

export const api = {
  // Existing baseline methods
  config: () => fetch(apiUrl("/api/config")).then(j<{ max_upload_mb: number; hw_encoders: string[]; formats: string[] }>),
  upload: (file: File, onProgress: (p: number) => void) =>
    new Promise<Loaded>((res, rej) => {
      const x = new XMLHttpRequest();
      x.open("POST", apiUrl("/api/upload"));
      x.upload.onprogress = (e) => e.lengthComputable && onProgress(e.loaded / e.total);
      x.onload = () => {
        let b: any;
        try {
          b = JSON.parse(x.responseText);
        } catch {
          const isHtml = x.getResponseHeader("content-type")?.includes("text/html") || /^\s*</.test(x.responseText);
          const detail = isHtml
            ? "The upload request reached a web page, not the video API. If your frontend and backend are deployed separately, set VITE_API_BASE_URL to the backend URL and rebuild the frontend."
            : x.responseText.slice(0, 150) || x.statusText || "empty response";
          rej(new Error(`Server returned HTTP ${x.status}: ${detail}`));
          return;
        }
        if (x.status < 300) res(b);
        else rej(new Error(typeof b.detail === "string" ? b.detail : `Server error (${x.status}): ${JSON.stringify(b)}`));
      };
      x.onerror = () => rej(new Error("Network connection error to server"));
      const fd = new FormData(); fd.append("file", file); x.send(fd);
    }),
  importUrl: (url: string) => post("/api/import-url", { url }).then(j<Job>),
  importJobResult: (jobId: string) => fetch(apiUrl(`/api/jobs/${jobId}/result`)).then(j<Loaded>),
  importLocalPath: (filePath: string, name = "") => post("/api/import-local-path", { file_path: filePath, name }).then(j<Loaded>),
  remove: (id: string) => del(`/api/video/${id}`),
  trim: (id: string, o: Opts) => post(`/api/video/${id}/trim`, o).then(j<Job>),
  preview: (id: string, o: Opts) => post(`/api/video/${id}/preview`, o)
    .then(j<{ preview_url: string }>)
    .then((result) => ({ ...result, preview_url: apiUrl(result.preview_url) })),
  job: (id: string) => fetch(apiUrl(`/api/jobs/${id}`)).then(j<Job>),
  cancel: (id: string) => post(`/api/jobs/${id}/cancel`).then(j<Job>),

  // Projects
  projects: {
    list: (search = "", folder = "") => fetch(apiUrl(`/api/projects?search=${encodeURIComponent(search)}&folder=${encodeURIComponent(folder)}`)).then(j<Project[]>),
    create: (name: string, folder = "General", video_id?: string) => post("/api/projects", { name, folder, video_id }).then(j<Project>),
    get: (id: string) => fetch(apiUrl(`/api/projects/${id}`)).then(j<Project>),
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
    transcribeYouTube: (projectId: string, url: string) =>
      post(`/api/projects/${projectId}/transcribe-youtube`, { url }).then(j<TranscriptData>),
    transcribe: (projectId: string, language = "auto", model_size = "base") =>
      post(`/api/projects/${projectId}/transcribe`, { language, model_size }).then(j<{ task_id: string; status: string }>),
    pollTask: (taskId: string) => fetch(apiUrl(`/api/studio-tasks/${taskId}`)).then(j<{ id: string; type: string; status: string; progress: number; error: string | null }>),
    taskResult: (taskId: string) => fetch(apiUrl(`/api/studio-tasks/${taskId}/result`)).then(j<TranscriptData>),
    update: (projectId: string, segments: TranscriptSegment[]) => put(`/api/projects/${projectId}/transcript`, { segments }).then(j<TranscriptData>),
    importFile: (projectId: string, file: File) => {
      const fd = new FormData();
      fd.append("file", file);
      return fetch(apiUrl(`/api/projects/${projectId}/transcript/import-file`), { method: "POST", body: fd }).then(j<TranscriptData>);
    },
    chunks: (projectId: string, words_per_cue = 3) =>
      fetch(apiUrl(`/api/projects/${projectId}/transcript/chunks?words_per_cue=${words_per_cue}`)).then(j<Array<{ start: number; end: number; speaker: string; text: string }>>),
    exportUrl: (projectId: string, format = "srt", start?: number, end?: number) => {
      let u = `/api/projects/${projectId}/transcript/export?format=${format}`;
      if (start !== undefined && end !== undefined) {
        u += `&start=${start}&end=${end}`;
      }
      return apiUrl(u);
    },
  },

  // Content Analysis & AI Scripts
  analysis: {
    analyze: (projectId: string) => post(`/api/projects/${projectId}/analyze`).then(j<AnalysisData>),
    generateScript: (
      projectId: string,
      topic_id?: string,
      duration_target = 60,
      style = "educational",
      api_key?: string,
      provider = "gemini"
    ) => post(`/api/projects/${projectId}/scripts/generate`, { topic_id, duration_target, style, api_key, provider }).then(j<ScriptData>),
    importCustomScript: (projectId: string, scriptText: string) =>
      post(`/api/projects/${projectId}/scripts/import-custom`, { script_text: scriptText }).then(j<ScriptData>),
    mapToClips: (projectId: string, scriptId: string, folder_name = "Script Clips") =>
      post(`/api/projects/${projectId}/scripts/${scriptId}/map-to-clips`, { folder_name }).then(j<{ created_clips: ProjectClip[] }>),
  },

  // Music
  music: {
    list: (projectId?: string) => fetch(apiUrl(`/api/music${projectId ? `?project_id=${projectId}` : ""}`)).then(j<MusicTrack[]>),
    generate: (mood: string, genre = "cinematic", duration = 60, projectId?: string) =>
      post(`/api/music/generate${projectId ? `?project_id=${projectId}` : ""}`, { mood, genre, duration }).then(j<MusicTrack>),
    composeFromScript: (projectId: string, scriptId?: string, scriptText?: string, apiKey?: string) =>
      post(`/api/projects/${projectId}/music/detect-and-compose`, { script_id: scriptId, script_text: scriptText, api_key: apiKey }).then(j<MusicTrack>),
    auditTrack: (trackId: string, data: { name?: string; mood?: string; genre?: string; tempo?: number; energy?: string; re_render?: boolean }) =>
      put(`/api/music/${trackId}/audit`, data).then(j<MusicTrack>),
    deleteTrack: (trackId: string) => del(`/api/music/${trackId}`).then(j<{ deleted: boolean; track_id: string }>),
  },

  // Subtitles
  subtitles: {
    presets: () => fetch(apiUrl("/api/subtitles/presets")).then(j<SubtitlePreset[]>),
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
    }) => post(`/api/projects/${projectId}/assemble`, options)
      .then(j<{ export_id: string; filename: string; file_size: number; download_url: string }>)
      .then((result) => ({ ...result, download_url: apiUrl(result.download_url) })),
    exports: (projectId: string) => fetch(apiUrl(`/api/projects/${projectId}/exports`)).then(j<ExportItem[]>),
    exportZipUrl: (projectId: string) => apiUrl(`/api/projects/${projectId}/export-zip`),
  },

  // Settings & Cloud YouTube Authentication
  settings: {
    getCookieStatus: () => fetch(apiUrl("/api/settings/cookies")).then(j<{ configured: boolean }>),
    saveCookies: (cookies: string) => post("/api/settings/cookies", { cookies }).then(j<{ saved: boolean; size: number }>),
  },

  // Auto Shorts Pipeline & Templates
  autoShorts: {
    listTemplates: () => fetch(apiUrl("/api/templates")).then(j<Array<{ id: string; name: string; canvas: any }>>),
    getTemplate: (templateId: string) => fetch(apiUrl(`/api/templates/${templateId}`)).then(j<any>),
    listFonts: () => fetch(apiUrl("/api/fonts")).then(j<Array<{ name: string; filename: string }>>),
    createJob: (youtubeUrl: string, templateId = "acharya_prashant_classic", numClips = 5, projectId?: string) =>
      post("/api/auto-shorts/create", { youtube_url: youtubeUrl, template_id: templateId, num_clips: numClips, project_id: projectId })
        .then(j<{ id: string; status: string; stage: string; progress: number }>),
    getJob: (jobId: string) => fetch(apiUrl(`/api/auto-shorts/jobs/${jobId}`)).then(j<{
      id: string; project_id: string; youtube_url: string; template_id: string;
      status: string; stage: string; progress: number; num_clips: number;
      step_detail?: string;
      transcript?: Array<{ start: number; duration: number; text: string }>;
      script_content?: string;
      clips: Array<{
        id: string; start: number; end: number; hook_title: string; virality_score: number;
        reason: string; summary: string; script_content?: string; accepted?: boolean; crop_rect?: any; custom_subtitles?: any[];
      }>;
      renders: Array<{
        clip_id: string; export_id: string; title: string; file_path: string; download_url: string;
      }>;
      error?: string;
    }>),
    proceedToAI: (jobId: string, customTranscript?: any[]) => post(`/api/auto-shorts/jobs/${jobId}/proceed-ai`, { custom_transcript: customTranscript }).then(j<any>),
    renderApproved: (jobId: string, clips: any[], fontFile?: string, casing = "uppercase", animationEffect = "scale_pop") =>
      post(`/api/auto-shorts/jobs/${jobId}/render`, { clips, font_file: fontFile, casing, animation_effect: animationEffect }).then(j<any>),
    parseScript: (scriptText: string) => post("/api/auto-shorts/parse-script", { script_text: scriptText }).then(j<{ overall_range: [number, number] | null; scenes: any[]; total_scenes: number }>),
    parseTranscript: (rawText: string) => post("/api/auto-shorts/parse-transcript", { raw_text: rawText }).then(j<{ segments: any[]; total_segments: number }>),
  }
};
