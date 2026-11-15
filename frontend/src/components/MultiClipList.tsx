import React, { useState } from "react";
import { Folder, Film, Plus, Play, Trash2, Copy, ArrowUp, ArrowDown, Hash, Scissors, Download, Loader2 } from "lucide-react";
import { api, ProjectClip, ProjectFolder } from "../api";

interface Props {
  projectId: string;
  folders: ProjectFolder[];
  clips: ProjectClip[];
  activeClipId: string | null;
  onSelectClip: (clip: ProjectClip) => void;
  onRefreshClips: () => void;
  onAddClipCurrentSelection: () => void;
  onPlayClip: (clip: ProjectClip) => void;
}

export function MultiClipList({
  projectId,
  folders,
  clips,
  activeClipId,
  onSelectClip,
  onRefreshClips,
  onAddClipCurrentSelection,
  onPlayClip,
}: Props) {
  const [newFolderName, setNewFolderName] = useState("");
  const [addingFolder, setAddingFolder] = useState(false);
  const [activeFolderId, setActiveFolderId] = useState<string | null>(null);
  const [loadingAction, setLoadingAction] = useState(false);

  const handleCreateFolder = async () => {
    if (!newFolderName.trim()) return;
    try {
      await api.folders.create(projectId, newFolderName.trim());
      setNewFolderName("");
      setAddingFolder(false);
      onRefreshClips();
    } catch (e: any) {
      alert(e.message);
    }
  };

  const handleDeleteFolder = async (folderId: string) => {
    if (!confirm("Delete this folder? Clips will be moved to Unassigned.")) return;
    try {
      await api.folders.delete(folderId);
      onRefreshClips();
    } catch (e: any) {
      alert(e.message);
    }
  };

  const handleDeleteClip = async (clipId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      await api.clips.delete(clipId);
      onRefreshClips();
    } catch (e: any) {
      alert(e.message);
    }
  };

  const handleDuplicateClip = async (clipId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      await api.clips.duplicate(clipId);
      onRefreshClips();
    } catch (e: any) {
      alert(e.message);
    }
  };

  const handleMoveClip = async (clipId: string, direction: "up" | "down", e: React.MouseEvent) => {
    e.stopPropagation();
    const idx = clips.findIndex((c) => c.id === clipId);
    if (idx === -1) return;
    if (direction === "up" && idx === 0) return;
    if (direction === "down" && idx === clips.length - 1) return;

    const newClips = [...clips];
    const targetIdx = direction === "up" ? idx - 1 : idx + 1;
    const temp = newClips[idx];
    newClips[idx] = newClips[targetIdx];
    newClips[targetIdx] = temp;

    try {
      await api.clips.reorder(projectId, newClips.map((c) => c.id));
      onRefreshClips();
    } catch (e: any) {
      alert(e.message);
    }
  };

  const handleAutoNumber = async (folderId: string | null) => {
    setLoadingAction(true);
    try {
      await api.clips.autoNumber(projectId, folderId);
      onRefreshClips();
    } catch (e: any) {
      alert(e.message);
    } finally {
      setLoadingAction(false);
    }
  };

  const fmtTime = (s: number) => {
    const mins = Math.floor(s / 60);
    const secs = Math.floor(s % 60);
    const ms = Math.floor((s % 1) * 10);
    return `${String(mins).padStart(2, "0")}:${String(secs).padStart(2, "0")}.${ms}`;
  };

  // Group clips by folder
  const unassignedClips = clips.filter((c) => !c.folder_id);

  return (
    <div className="flex h-full flex-col bg-panel border-r border-line select-none">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-line bg-ink/60 px-4 py-3">
        <div className="flex items-center gap-2">
          <Film size={18} className="text-trim" />
          <h3 className="font-bold text-paper text-sm">Clips & Folders ({clips.length})</h3>
        </div>

        <button
          onClick={onAddClipCurrentSelection}
          className="inline-flex items-center gap-1.5 rounded bg-trim px-2.5 py-1 text-xs font-bold text-ink hover:bg-amber-300 transition-colors"
        >
          <Plus size={14} />
          Add Clip
        </button>
      </div>

      {/* Toolbar */}
      <div className="flex items-center justify-between border-b border-line/60 bg-ink/30 px-4 py-2 text-xs">
        <div className="flex items-center gap-2">
          <button
            onClick={() => setAddingFolder(true)}
            className="flex items-center gap-1 text-mute hover:text-paper"
          >
            <Folder size={12} />
            <span>+ Folder</span>
          </button>
          <button
            onClick={() => handleAutoNumber(activeFolderId)}
            disabled={loadingAction || clips.length === 0}
            className="flex items-center gap-1 text-mute hover:text-paper disabled:opacity-40"
          >
            <Hash size={12} />
            <span>Auto Number</span>
          </button>
        </div>
      </div>

      {/* Folder creation input */}
      {addingFolder && (
        <div className="flex items-center gap-2 border-b border-line p-3 bg-panel">
          <input
            type="text"
            placeholder="Folder Name (e.g. Intro)"
            value={newFolderName}
            onChange={(e) => setNewFolderName(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleCreateFolder()}
            className="flex-1 rounded border border-line bg-ink px-2.5 py-1 text-xs text-paper focus:outline-none"
            autoFocus
          />
          <button onClick={handleCreateFolder} className="rounded bg-trim px-2 py-1 text-xs font-bold text-ink">
            Save
          </button>
          <button onClick={() => setAddingFolder(false)} className="rounded px-2 py-1 text-xs text-mute hover:text-paper">
            Cancel
          </button>
        </div>
      )}

      {/* Clips Tree */}
      <div className="flex-1 overflow-y-auto p-3 space-y-4">
        {clips.length === 0 ? (
          <div className="flex h-48 flex-col items-center justify-center text-center p-4">
            <Scissors size={32} className="text-mute/40 mb-2" />
            <h5 className="font-semibold text-paper text-xs">No Clips Created</h5>
            <p className="text-[11px] text-mute mt-1">
              Select any timeline segment and click "Add Clip" to save it into this project.
            </p>
          </div>
        ) : (
          <>
            {/* Defined Folders */}
            {folders.map((folder) => {
              const folderClips = clips.filter((c) => c.folder_id === folder.id);
              return (
                <div key={folder.id} className="rounded-lg border border-line/70 bg-ink/40 overflow-hidden">
                  <div
                    onClick={() => setActiveFolderId(activeFolderId === folder.id ? null : folder.id)}
                    className="flex items-center justify-between px-3 py-2 bg-ink/80 hover:bg-panel cursor-pointer"
                  >
                    <div className="flex items-center gap-2 text-xs font-bold text-paper">
                      <Folder size={14} className="text-trim" />
                      <span>{folder.name}</span>
                      <span className="text-[10px] text-mute">({folderClips.length})</span>
                    </div>

                    <div className="flex items-center gap-1">
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleDeleteFolder(folder.id);
                        }}
                        className="rounded p-1 text-mute hover:text-red-400"
                      >
                        <Trash2 size={12} />
                      </button>
                    </div>
                  </div>

                  {/* Folder Clips */}
                  <div className="divide-y divide-line/30">
                    {folderClips.map((clip) => renderClipRow(clip))}
                  </div>
                </div>
              );
            })}

            {/* Unassigned Clips */}
            {unassignedClips.length > 0 && (
              <div className="rounded-lg border border-line/70 bg-ink/40 overflow-hidden">
                <div className="px-3 py-1.5 bg-ink/80 text-[11px] font-bold text-mute uppercase tracking-wider">
                  Unassigned Clips ({unassignedClips.length})
                </div>
                <div className="divide-y divide-line/30">
                  {unassignedClips.map((clip) => renderClipRow(clip))}
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );

  function renderClipRow(clip: ProjectClip) {
    const isSelected = clip.id === activeClipId;
    const dur = clip.end_time - clip.start_time;

    return (
      <div
        key={clip.id}
        onClick={() => onSelectClip(clip)}
        className={`group flex items-center justify-between px-3 py-2 text-xs cursor-pointer transition-colors ${
          isSelected ? "bg-panel border-l-2 border-trim" : "hover:bg-panel/70"
        }`}
      >
        <div className="min-w-0 flex-1 pr-2">
          <div className="flex items-center gap-1.5 font-semibold text-paper truncate">
            <span>{clip.name}</span>
          </div>
          <div className="flex items-center gap-2 text-[10px] text-mute font-mono mt-0.5">
            <span>
              {fmtTime(clip.start_time)} - {fmtTime(clip.end_time)}
            </span>
            <span>({dur.toFixed(1)}s)</span>
          </div>
        </div>

        <div className="flex items-center gap-1">
          <button
            onClick={(e) => {
              e.stopPropagation();
              onPlayClip(clip);
            }}
            title="Preview Clip"
            className="rounded p-1 text-trim hover:bg-ink"
          >
            <Play size={12} />
          </button>
          <button
            onClick={(e) => handleMoveClip(clip.id, "up", e)}
            title="Move Up"
            className="rounded p-1 text-mute hover:text-paper"
          >
            <ArrowUp size={12} />
          </button>
          <button
            onClick={(e) => handleMoveClip(clip.id, "down", e)}
            title="Move Down"
            className="rounded p-1 text-mute hover:text-paper"
          >
            <ArrowDown size={12} />
          </button>
          <button
            onClick={(e) => handleDuplicateClip(clip.id, e)}
            title="Duplicate"
            className="rounded p-1 text-mute hover:text-paper"
          >
            <Copy size={12} />
          </button>
          <button
            onClick={(e) => handleDeleteClip(clip.id, e)}
            title="Delete"
            className="rounded p-1 text-mute hover:text-red-400"
          >
            <Trash2 size={12} />
          </button>
        </div>
      </div>
    );
  }
}
