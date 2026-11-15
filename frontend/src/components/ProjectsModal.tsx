import React, { useState, useEffect } from "react";
import { Folder, Film, Plus, Search, Trash2, Copy, Clock, Calendar, CheckCircle, X, Loader2 } from "lucide-react";
import { api, Project } from "../api";

interface Props {
  currentProjectId: string | null;
  onSelectProject: (projectId: string) => void;
  onClose: () => void;
}

export function ProjectsModal({ currentProjectId, onSelectProject, onClose }: Props) {
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [selectedFolder, setSelectedFolder] = useState("");
  const [newProjectName, setNewProjectName] = useState("");
  const [newProjectFolder, setNewProjectFolder] = useState("General");
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState("");

  const loadProjects = () => {
    setLoading(true);
    api.projects.list(search, selectedFolder)
      .then(setProjects)
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    loadProjects();
  }, [search, selectedFolder]);

  const handleCreate = async () => {
    if (!newProjectName.trim()) return;
    setCreating(true);
    setError("");
    try {
      const p = await api.projects.create(newProjectName.trim(), newProjectFolder.trim());
      setNewProjectName("");
      loadProjects();
      onSelectProject(p.id);
      onClose();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setCreating(false);
    }
  };

  const handleDelete = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!confirm("Are you sure you want to delete this project?")) return;
    try {
      await api.projects.delete(id);
      loadProjects();
    } catch (e: any) {
      setError(e.message);
    }
  };

  const handleDuplicate = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      await api.projects.duplicate(id);
      loadProjects();
    } catch (e: any) {
      setError(e.message);
    }
  };

  const folders = Array.from(new Set(projects.map((p) => p.folder || "General"))).filter(Boolean);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
      <div className="flex h-[85vh] w-full max-w-5xl flex-col rounded-xl border border-line bg-panel shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-line px-6 py-4">
          <div className="flex items-center gap-3">
            <Film className="text-trim" size={24} />
            <div>
              <h2 className="text-lg font-bold text-paper">Video Projects</h2>
              <p className="text-xs text-mute">Manage, reopen, and organize your editing workspaces</p>
            </div>
          </div>
          <button onClick={onClose} className="rounded-lg p-2 text-mute hover:bg-ink hover:text-paper">
            <X size={20} />
          </button>
        </div>

        {/* Toolbar */}
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line bg-ink/40 px-6 py-3">
          <div className="flex flex-1 items-center gap-2 max-w-md">
            <div className="relative w-full">
              <Search size={16} className="absolute left-3 top-2.5 text-mute" />
              <input
                type="text"
                placeholder="Search projects..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full rounded-md border border-line bg-panel py-1.5 pl-9 pr-3 text-sm text-paper focus:border-trim focus:outline-none"
              />
            </div>
            {folders.length > 0 && (
              <select
                value={selectedFolder}
                onChange={(e) => setSelectedFolder(e.target.value)}
                className="rounded-md border border-line bg-panel px-3 py-1.5 text-sm text-paper focus:border-trim focus:outline-none"
              >
                <option value="">All Folders</option>
                {folders.map((f) => (
                  <option key={f} value={f}>{f}</option>
                ))}
              </select>
            )}
          </div>

          {/* Quick Create */}
          <div className="flex items-center gap-2">
            <input
              type="text"
              placeholder="Project name"
              value={newProjectName}
              onChange={(e) => setNewProjectName(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleCreate()}
              className="rounded-md border border-line bg-panel px-3 py-1.5 text-sm text-paper focus:border-trim focus:outline-none"
            />
            <input
              type="text"
              placeholder="Folder (e.g. YouTube)"
              value={newProjectFolder}
              onChange={(e) => setNewProjectFolder(e.target.value)}
              className="w-32 rounded-md border border-line bg-panel px-3 py-1.5 text-sm text-paper focus:border-trim focus:outline-none"
            />
            <button
              onClick={handleCreate}
              disabled={creating || !newProjectName.trim()}
              className="inline-flex items-center gap-1.5 rounded-md bg-trim px-3 py-1.5 text-sm font-semibold text-ink hover:bg-amber-300 disabled:opacity-40"
            >
              {creating ? <Loader2 size={16} className="animate-spin" /> : <Plus size={16} />}
              New Project
            </button>
          </div>
        </div>

        {error && (
          <div className="mx-6 mt-3 rounded-lg border border-red-500/50 bg-red-950/40 px-4 py-2 text-xs text-red-200">
            {error}
          </div>
        )}

        {/* Project Grid */}
        <div className="flex-1 overflow-y-auto p-6">
          {loading ? (
            <div className="flex h-64 items-center justify-center text-mute gap-2">
              <Loader2 className="animate-spin" size={24} />
              <span>Loading projects...</span>
            </div>
          ) : projects.length === 0 ? (
            <div className="flex h-64 flex-col items-center justify-center text-center">
              <Folder size={48} className="text-mute/40 mb-3" />
              <h3 className="font-semibold text-paper">No projects found</h3>
              <p className="text-sm text-mute mt-1">Create your first video editing project using the input above.</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {projects.map((p) => {
                const isSelected = p.id === currentProjectId;
                return (
                  <div
                    key={p.id}
                    onClick={() => {
                      onSelectProject(p.id);
                      onClose();
                    }}
                    className={`group relative flex flex-col justify-between overflow-hidden rounded-lg border p-4 transition-all cursor-pointer ${
                      isSelected
                        ? "border-trim bg-panel ring-1 ring-trim"
                        : "border-line bg-ink/70 hover:border-mute/60 hover:bg-panel"
                    }`}
                  >
                    <div>
                      {/* Top Badges */}
                      <div className="flex items-center justify-between text-xs mb-2">
                        <span className="rounded bg-line/60 px-2 py-0.5 font-medium text-mute">
                          {p.folder || "General"}
                        </span>
                        <div className="flex items-center gap-1">
                          {p.has_transcript && (
                            <span className="rounded bg-emerald-950/80 text-emerald-300 border border-emerald-500/40 px-1.5 py-0.5 text-[10px]">
                              Transcript
                            </span>
                          )}
                          {p.has_analysis && (
                            <span className="rounded bg-purple-950/80 text-purple-300 border border-purple-500/40 px-1.5 py-0.5 text-[10px]">
                              AI Analyzed
                            </span>
                          )}
                        </div>
                      </div>

                      {/* Title & Video */}
                      <h4 className="font-bold text-paper group-hover:text-trim transition-colors truncate">
                        {p.name}
                      </h4>
                      <p className="text-xs text-mute truncate mt-0.5">
                        {p.video_name ? p.video_name : "No source video yet"}
                      </p>
                    </div>

                    {/* Stats & Actions */}
                    <div className="mt-4 pt-3 border-t border-line/60 flex items-center justify-between text-xs text-mute">
                      <div className="flex items-center gap-3">
                        <span className="flex items-center gap-1">
                          <Film size={12} />
                          {p.clip_count ?? 0} clips
                        </span>
                        {p.video_duration > 0 && (
                          <span className="flex items-center gap-1">
                            <Clock size={12} />
                            {Math.round(p.video_duration)}s
                          </span>
                        )}
                      </div>

                      <div className="flex items-center gap-1 opacity-80 group-hover:opacity-100">
                        <button
                          onClick={(e) => handleDuplicate(p.id, e)}
                          title="Duplicate Project"
                          className="rounded p-1 text-mute hover:bg-line hover:text-paper"
                        >
                          <Copy size={14} />
                        </button>
                        <button
                          onClick={(e) => handleDelete(p.id, e)}
                          title="Delete Project"
                          className="rounded p-1 text-mute hover:bg-red-950/80 hover:text-red-400"
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
