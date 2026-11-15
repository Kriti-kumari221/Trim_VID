export type Meta = { duration: number; width: number; height: number; fps: number; video_codec: string;
  audio_codec: string | null; has_audio: boolean; size: number; name: string; thumbs: number };
export type Job = { id: string; status: "queued" | "running" | "done" | "failed" | "cancelled"; progress: number; error: string | null };
export type Loaded = { video_id: string; metadata: Meta };
export type Opts = { start: number; end: number; mode: string; codec: string; resolution: string; quality: string };

async function j<T>(r: Response): Promise<T> {
  const b = await r.json().catch(() => ({}));
  if (!r.ok) {
    const d = (b as any).detail;
    throw new Error(typeof d === "string" ? d : d ? "Invalid values: check the timestamps." : r.statusText);
  }
  return b as T;
}
const post = (u: string, body?: unknown) =>
  fetch(u, { method: "POST", headers: { "Content-Type": "application/json" }, body: body ? JSON.stringify(body) : undefined });

export const api = {
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
  remove: (id: string) => fetch(`/api/video/${id}`, { method: "DELETE" }),
  trim: (id: string, o: Opts) => post(`/api/video/${id}/trim`, o).then(j<Job>),
  preview: (id: string, o: Opts) => post(`/api/video/${id}/preview`, o).then(j<{ preview_url: string }>),
  job: (id: string) => fetch(`/api/jobs/${id}`).then(j<Job>),
  cancel: (id: string) => post(`/api/jobs/${id}/cancel`).then(j<Job>),
};
