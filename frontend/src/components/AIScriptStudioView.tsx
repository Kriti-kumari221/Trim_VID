import React, { useState } from "react";
import { Sparkles, Brain, Clock, Flame, Film, Check, ArrowRight, Play, Loader2, AlertCircle, Key, Settings, Plus, FileText, X } from "lucide-react";
import { api, AnalysisData, ScriptData } from "../api";

interface Props {
  projectId: string;
  analysis: AnalysisData | null;
  scripts: ScriptData[];
  onSeek: (seconds: number) => void;
  onSelectCut?: (start: number, end: number) => void;
  onAnalysisUpdated: (a: AnalysisData) => void;
  onScriptsUpdated: (scripts: ScriptData[]) => void;
  onClipsCreated: () => void;
}

export function AIScriptStudioView({
  projectId,
  analysis,
  scripts,
  onSeek,
  onSelectCut,
  onAnalysisUpdated,
  onScriptsUpdated,
  onClipsCreated,
}: Props) {
  const [analyzing, setAnalyzing] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [mapping, setMapping] = useState(false);
  const [error, setError] = useState("");
  const [selectedTopicId, setSelectedTopicId] = useState<string>("");
  const [durationTarget, setDurationTarget] = useState(60);
  const [contentStyle, setContentStyle] = useState("motivational");
  const [activeTab, setActiveTab] = useState<"analysis" | "scripts">("scripts");
  const [aiProvider, setAiProvider] = useState<string>("gemini");
  const [apiKey, setApiKey] = useState<string>(() => localStorage.getItem("cliptrim_ai_key") || "");
  const [showKeyInput, setShowKeyInput] = useState<boolean>(false);
  const [showCustomModal, setShowCustomModal] = useState<boolean>(false);
  const [customScriptText, setCustomScriptText] = useState<string>("");
  const [importingCustom, setImportingCustom] = useState<boolean>(false);

  const updateApiKey = (k: string) => {
    setApiKey(k);
    localStorage.setItem("cliptrim_ai_key", k);
  };

  const handleAnalyze = async () => {
    setAnalyzing(true);
    setError("");
    try {
      const res = await api.analysis.analyze(projectId);
      onAnalysisUpdated(res);
      setActiveTab("analysis");
    } catch (e: any) {
      setError(e.message);
    } finally {
      setAnalyzing(false);
    }
  };

  const handleGenerateScript = async () => {
    setGenerating(true);
    setError("");
    try {
      const res = await api.analysis.generateScript(
        projectId,
        selectedTopicId || undefined,
        durationTarget,
        contentStyle,
        apiKey.trim() || undefined,
        aiProvider
      );
      onScriptsUpdated([res, ...scripts]);
      setActiveTab("scripts");
    } catch (e: any) {
      setError(e.message);
    } finally {
      setGenerating(false);
    }
  };

  const handleImportCustomScript = async () => {
    if (!customScriptText.trim()) return;
    setImportingCustom(true);
    setError("");
    try {
      let res: ScriptData;
      try {
        // Try direct backend entity persistence endpoint first
        res = await api.analysis.importCustomScript(projectId, customScriptText);
      } catch (err: any) {
        // Fallback: If running without backend restart, parse directly via parseScript and construct ScriptData client-side
        console.warn("importCustomScript server endpoint error, running client-side parser fallback:", err);
        const parsed = await api.autoShorts.parseScript(customScriptText);
        if (!parsed.scenes || parsed.scenes.length === 0) {
          throw new Error("Could not detect timestamped scenes in script.");
        }
        res = {
          id: `custom_script_${Date.now()}`,
          title: `Custom Reel Script (${parsed.scenes.length} Scenes)`,
          duration_target: parsed.overall_range ? Math.round(parsed.overall_range[1] - parsed.overall_range[0]) : 60,
          style: "custom_reel",
          scenes: parsed.scenes,
          created_at: Date.now() / 1000
        };
      }
      onScriptsUpdated([res, ...scripts]);
      setShowCustomModal(false);
      setCustomScriptText("");
      setActiveTab("scripts");
    } catch (e: any) {
      setError(e.message || "Failed to parse and import script");
    } finally {
      setImportingCustom(false);
    }
  };

  const handleMapScriptToClips = async (scriptId: string) => {
    setMapping(true);
    setError("");
    try {
      // Find the script in local state
      const targetScript = scripts.find((s) => s.id === scriptId);

      // If this script was generated with a temporary client-side ID (or not yet in DB)
      if (scriptId.startsWith("custom_script_") && targetScript) {
        // Create clips directly through project clips API
        for (const scene of targetScript.scenes) {
          if (!scene.approved) continue;
          const cName = `Scene_${String(scene.scene_num).padStart(2, "0")}_${scene.role.replace(/\s+/g, "_")}`;
          await api.clips.create(projectId, {
            name: cName,
            start_time: scene.original_start,
            end_time: scene.original_end
          });
        }
      } else {
        await api.analysis.mapToClips(projectId, scriptId, "AI Script Clips");
      }
      onClipsCreated();
      alert("Clips successfully created and mapped to project!");
    } catch (e: any) {
      setError(e.message);
    } finally {
      setMapping(false);
    }
  };

  const fmtTime = (s: number) => {
    const mins = Math.floor(s / 60);
    const secs = Math.floor(s % 60);
    return `${String(mins).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;
  };

  return (
    <div className="flex h-full flex-col bg-panel border-r border-line">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line bg-ink/60 px-5 py-3">
        <div className="flex items-center gap-2">
          <Brain size={18} className="text-purple-400" />
          <h3 className="font-bold text-paper text-sm">AI Content Analyzer & Script Generator</h3>
        </div>

        <div className="flex items-center gap-2">
          <div className="flex rounded-md border border-line bg-ink/40 p-0.5 text-xs">
            <button
              onClick={() => setActiveTab("analysis")}
              className={`rounded px-3 py-1 font-semibold transition-colors ${
                activeTab === "analysis" ? "bg-purple-900/80 text-purple-200" : "text-mute hover:text-paper"
              }`}
            >
              Content Structure
            </button>
            <button
              onClick={() => setActiveTab("scripts")}
              className={`rounded px-3 py-1 font-semibold transition-colors ${
                activeTab === "scripts" ? "bg-purple-900/80 text-purple-200" : "text-mute hover:text-paper"
              }`}
            >
              Shorts Scripts ({scripts.length})
            </button>
          </div>

          <button
            onClick={handleAnalyze}
            disabled={analyzing}
            className="inline-flex items-center gap-1.5 rounded bg-purple-600 px-3 py-1 text-xs font-bold text-white hover:bg-purple-500 disabled:opacity-40"
          >
            {analyzing ? <Loader2 size={14} className="animate-spin" /> : <Sparkles size={14} />}
            Analyze Video
          </button>
        </div>
      </div>

      {error && (
        <div className="mx-4 mt-3 flex items-center gap-2 rounded bg-red-950/60 p-2 text-xs text-red-200 border border-red-500/40">
          <AlertCircle size={14} className="text-red-400 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* Script Generator Controls Bar */}
      <div className="border-b border-line/60 bg-ink/40 px-5 py-3">
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-2 text-xs">
            <span className="text-mute font-medium">Style:</span>
            <select
              value={contentStyle}
              onChange={(e) => setContentStyle(e.target.value)}
              className="rounded border border-line bg-panel px-2 py-1 text-xs text-paper focus:outline-none"
            >
              <option value="educational">Educational</option>
              <option value="motivational">Motivational</option>
              <option value="storytelling">Storytelling</option>
              <option value="documentary">Documentary</option>
              <option value="shorts">Viral Shorts / Hook</option>
              <option value="emotional">Emotional</option>
            </select>
          </div>

          <div className="flex items-center gap-2 text-xs">
            <span className="text-mute font-medium">Duration:</span>
            <select
              value={durationTarget}
              onChange={(e) => setDurationTarget(Number(e.target.value))}
              className="rounded border border-line bg-panel px-2 py-1 text-xs text-paper focus:outline-none"
            >
              <option value={30}>30s (Ultra Punchy)</option>
              <option value={45}>45s (Reels / TikTok)</option>
              <option value={60}>60s (Standard Short)</option>
              <option value={90}>90s (Extended)</option>
              <option value={120}>2 Minutes</option>
            </select>
          </div>

          {analysis && analysis.topics.length > 0 && (
            <div className="flex items-center gap-2 text-xs">
              <span className="text-mute font-medium">Topic:</span>
              <select
                value={selectedTopicId}
                onChange={(e) => setSelectedTopicId(e.target.value)}
                className="rounded border border-line bg-panel px-2 py-1 text-xs text-paper max-w-[180px] truncate focus:outline-none"
              >
                <option value="">Highest Scoring Topic</option>
                {analysis.topics.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.title} ({t.relevance_score}%)
                  </option>
                ))}
              </select>
            </div>
          )}

          {/* AI Provider selector */}
          <div className="flex items-center gap-2 text-xs">
            <span className="text-mute font-medium">AI Model:</span>
            <select
              value={aiProvider}
              onChange={(e) => setAiProvider(e.target.value)}
              className="rounded border border-line bg-panel px-2 py-1 text-xs text-paper focus:outline-none"
            >
              <option value="gemini">Google Gemini 2.0 Flash</option>
              <option value="groq">Groq (Llama 3.3 70B)</option>
              <option value="openai">OpenAI GPT-4o Mini</option>
              <option value="smart">Smart Story Extractor (Built-in)</option>
            </select>
            <button
              onClick={() => setShowKeyInput(!showKeyInput)}
              className={`p-1 rounded border transition-colors ${apiKey ? "border-emerald-500/50 text-emerald-400 bg-emerald-950/40" : "border-line text-mute hover:text-paper"}`}
              title="Configure AI API Key (Gemini / Groq / OpenAI)"
            >
              <Key size={14} />
            </button>
          </div>

          <div className="ml-auto flex items-center gap-2">
            <button
              onClick={() => setShowCustomModal(true)}
              className="inline-flex items-center gap-1.5 rounded border border-amber-400/40 bg-amber-400/10 px-3 py-1 text-xs font-bold text-amber-300 hover:bg-amber-400/20 shadow-sm"
              title="Paste your custom timestamped reel script directly"
            >
              <Plus size={13} />
              Paste Custom Script
            </button>
            <button
              onClick={handleGenerateScript}
              disabled={generating}
              className="inline-flex items-center gap-1.5 rounded bg-trim px-3 py-1 text-xs font-bold text-ink hover:bg-amber-300 disabled:opacity-40"
            >
              {generating ? <Loader2 size={14} className="animate-spin" /> : <Film size={14} />}
              Generate Short-Video Script
            </button>
          </div>
        </div>

        {/* API Key Drawer */}
        {showKeyInput && (
          <div className="mt-2.5 pt-2.5 border-t border-line/40 flex flex-wrap items-center gap-2 text-xs">
            <Key size={13} className="text-amber-400 shrink-0" />
            <span className="text-mute">
              {aiProvider === "gemini" ? "Google Gemini API Key:" : (aiProvider === "groq" ? "Groq API Key:" : "OpenAI API Key:")}
            </span>
            <input
              type="password"
              placeholder={`Paste your ${aiProvider.toUpperCase()} API key here...`}
              value={apiKey}
              onChange={(e) => updateApiKey(e.target.value)}
              className="flex-1 min-w-[200px] rounded border border-line bg-panel px-2 py-1 text-xs text-paper focus:border-trim focus:outline-none font-mono"
            />
            {apiKey && (
              <span className="text-[11px] text-emerald-400 font-semibold flex items-center gap-1">
                <Check size={12} /> Key Saved
              </span>
            )}
            <span className="text-[10px] text-mute">
              {aiProvider === "gemini" && "(Free key at aistudio.google.com)"}
              {aiProvider === "groq" && "(Free ultra-fast key at console.groq.com)"}
            </span>
          </div>
        )}
      </div>

      {/* Main Tab Content */}
      <div className="flex-1 overflow-y-auto p-5">
        {activeTab === "analysis" ? (
          !analysis ? (
            <div className="flex h-64 flex-col items-center justify-center text-center p-6">
              <Sparkles size={40} className="text-purple-400/40 mb-3" />
              <h4 className="font-semibold text-paper text-sm">Video Content Not Analyzed Yet</h4>
              <p className="text-xs text-mute mt-1 max-w-sm">
                Click "Analyze Video" to identify main topics, interesting discussions, viral hooks, and emotional quotes.
              </p>
            </div>
          ) : (
            <div className="space-y-6">
              {/* Summary box */}
              <div className="rounded-lg border border-purple-500/30 bg-purple-950/20 p-4">
                <h4 className="font-bold text-xs uppercase tracking-wider text-purple-300 mb-1">
                  Executive Content Summary
                </h4>
                <p className="text-xs text-paper/90 leading-relaxed">{analysis.summary}</p>
              </div>

              {/* Topics Grid */}
              <div>
                <h4 className="font-bold text-xs uppercase tracking-wider text-paper mb-3">
                  Detected Thematic Topics ({analysis.topics.length})
                </h4>
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  {analysis.topics.map((t) => (
                    <div
                      key={t.id}
                      className="rounded-lg border border-line bg-ink/60 p-3 hover:border-purple-400/50 transition-colors"
                    >
                      <div className="flex items-center justify-between text-xs mb-1">
                        <span className="font-bold text-paper truncate">{t.title}</span>
                        <span className="rounded bg-purple-900/60 px-1.5 py-0.5 font-mono text-[10px] text-purple-200">
                          {t.relevance_score}% Score
                        </span>
                      </div>
                      <p className="text-[11px] text-mute mb-2 line-clamp-2">{t.summary}</p>
                      <div className="flex items-center justify-between pt-2 border-t border-line/40 text-[11px]">
                        <button
                          onClick={() => onSeek(t.start)}
                          className="flex items-center gap-1 font-mono text-trim hover:underline"
                        >
                          <Play size={10} />
                          {fmtTime(t.start)} - {fmtTime(t.end)}
                        </button>
                        <span className="text-[10px] text-mute">{t.reason}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Viral Hooks */}
              {analysis.viral_hooks && analysis.viral_hooks.length > 0 && (
                <div>
                  <h4 className="font-bold text-xs uppercase tracking-wider text-paper mb-3 flex items-center gap-1.5">
                    <Flame size={14} className="text-amber-400" />
                    High-Retention Hooks & Viral Moments
                  </h4>
                  <div className="space-y-2">
                    {analysis.viral_hooks.map((h) => (
                      <div
                        key={h.id}
                        className="flex items-start gap-3 rounded-lg border border-line bg-ink/40 p-3 hover:bg-panel transition-colors"
                      >
                        <span className="shrink-0 rounded bg-amber-950/80 text-amber-300 border border-amber-500/40 px-2 py-0.5 text-[10px] font-bold">
                          {h.type}
                        </span>
                        <div className="min-w-0 flex-1">
                          <p className="text-xs italic text-paper">"{h.quote}"</p>
                          <p className="text-[10px] text-mute mt-1">{h.rationale}</p>
                        </div>
                        <button
                          onClick={() => onSeek(h.start)}
                          className="flex shrink-0 items-center gap-1 rounded bg-ink px-2 py-1 font-mono text-[11px] text-trim hover:bg-trim hover:text-ink transition-colors"
                        >
                          <Play size={10} />
                          {fmtTime(h.start)}
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )
        ) : (
          /* Scripts List */
          scripts.length === 0 ? (
            <div className="flex h-64 flex-col items-center justify-center text-center p-6">
              <Film size={40} className="text-mute/40 mb-3" />
              <h4 className="font-semibold text-paper text-sm">No Scripts Generated Yet</h4>
              <p className="text-xs text-mute mt-1 max-w-sm">
                Select your desired style and duration above, then click "Generate Short-Video Script".
              </p>
            </div>
          ) : (
            <div className="space-y-6">
              {scripts.map((script) => (
                <div key={script.id} className="rounded-xl border border-line bg-ink/60 overflow-hidden">
                  <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line bg-panel px-4 py-3">
                    <div>
                      <h4 className="font-bold text-sm text-paper">{script.title}</h4>
                      <p className="text-[11px] text-mute">
                        Style: {script.style} • Target Duration: {script.duration_target}s • {script.scenes.length} Scenes
                      </p>
                    </div>

                    <button
                      onClick={() => handleMapScriptToClips(script.id)}
                      disabled={mapping}
                      className="inline-flex items-center gap-1.5 rounded bg-emerald-600 px-3 py-1.5 text-xs font-bold text-white hover:bg-emerald-500 disabled:opacity-40"
                    >
                      {mapping ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />}
                      Map to Project Clips
                    </button>
                  </div>

                  {/* Scenes Table */}
                  <div className="overflow-x-auto">
                    <table className="w-full text-left text-xs border-collapse">
                      <thead>
                        <tr className="border-b border-line bg-ink/90 text-mute">
                          <th className="p-3 w-16">Scene</th>
                          <th className="p-3 w-28">Script Timeline</th>
                          <th className="p-3 w-28">Source Cut</th>
                          <th className="p-3">Visual / Footage</th>
                          <th className="p-3">Dialogue / Voiceover</th>
                          <th className="p-3 w-36">On-Screen Text</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-line/40">
                        {script.scenes.map((scene) => (
                          <tr key={scene.scene_num} className="hover:bg-panel/40">
                            <td className="p-3 font-bold text-paper">#{scene.scene_num}</td>
                            <td className="p-3 font-mono text-mute">{scene.script_timeline}</td>
                            <td className="p-3">
                              <button
                                onClick={() => {
                                  onSeek(scene.original_start);
                                  if (onSelectCut) {
                                    onSelectCut(scene.original_start, scene.original_end);
                                  }
                                }}
                                className="flex items-center gap-1 font-mono text-trim hover:underline"
                                title="Click to seek and set cut in timeline"
                              >
                                <Play size={10} />
                                {fmtTime(scene.original_start)} - {fmtTime(scene.original_end)}
                              </button>
                            </td>
                            <td className="p-3 text-paper/90">{scene.visual_description}</td>
                            <td className="p-3 italic text-paper/80">"{scene.dialogue}"</td>
                            <td className="p-3">
                              <span className="rounded bg-amber-400/20 text-amber-300 font-bold px-1.5 py-0.5 text-[10px]">
                                {scene.on_screen_text}
                              </span>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              ))}
            </div>
          )
        )}
      </div>

      {/* Modal for Pasting Custom Structured Script */}
      {showCustomModal && (
        <div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4">
          <div className="bg-panel border border-line rounded-xl max-w-2xl w-full p-5 space-y-4 shadow-2xl">
            <div className="flex items-center justify-between border-b border-line pb-3">
              <div className="flex items-center gap-2">
                <FileText className="text-purple-400" size={18} />
                <h3 className="text-base font-bold text-paper">Paste Your Own Reel / Scene Script</h3>
              </div>
              <button
                onClick={() => setShowCustomModal(false)}
                className="text-mute hover:text-paper"
              >
                <X size={18} />
              </button>
            </div>

            <p className="text-xs text-mute">
              Paste your hand-crafted Short script with scene timestamps (e.g. <code>[Opening — 00:54:00]</code> or <code>00:54:00 – 00:57:01</code>). It will automatically map each scene with its exact source cut, visual notes, and on-screen text!
            </p>

            <textarea
              rows={12}
              value={customScriptText}
              onChange={(e) => setCustomScriptText(e.target.value)}
              placeholder="Paste script here... Example:
00:54:00 – 00:57:01

[Opening — 00:54:00]
Acharya Prashant:
“That is why I am first of all contesting the popular meaning of education...”

[The main concept — 00:54:26]
“See, if you go into Shruti...”"
              style={{ backgroundColor: "#14161b", color: "#f3f4f6" }}
              className="w-full rounded-lg p-3.5 text-xs font-mono border-2 border-line/80 focus:border-purple-400 focus:outline-none placeholder:text-gray-500 shadow-inner"
            />

            <div className="flex items-center justify-end gap-3 pt-2">
              <button
                onClick={() => setShowCustomModal(false)}
                className="px-4 py-2 rounded-lg border border-line text-xs font-semibold text-mute hover:text-paper"
              >
                Cancel
              </button>
              <button
                onClick={handleImportCustomScript}
                disabled={importingCustom || !customScriptText.trim()}
                className="px-4 py-2 rounded-lg bg-purple-600 hover:bg-purple-500 text-white text-xs font-bold flex items-center gap-1.5 shadow"
              >
                {importingCustom ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />}
                Parse & Add to Shorts Scripts
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
