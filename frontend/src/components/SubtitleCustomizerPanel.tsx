import React, { useState, useMemo } from "react";
import {
  Sparkles,
  Search,
  Sliders,
  Type,
  Move,
  RotateCw,
  Palette,
  Eye,
  Check,
  RotateCcw,
  Layers,
  Lock,
  Unlock,
  AlignLeft,
  AlignCenter,
  AlignRight,
  Flame,
  Zap,
  Play,
  X,
  ChevronDown,
  LayoutGrid
} from "lucide-react";
import { SubtitlePreset, SubtitleStyle } from "../api";

interface Props {
  presets: SubtitlePreset[];
  currentStyle: SubtitleStyle;
  onStyleChange: (updates: Partial<SubtitleStyle>) => void;
  onApplyPreset: (preset: SubtitlePreset) => void;
  selectedSegmentId: string | null;
  selectedSegmentText?: string;
  onResetIndividualStyle?: () => void;
  onApplyPositionToAll?: () => void;
}

const CATEGORIES = [
  "All",
  "Popular",
  "Dynamic AI",
  "Social",
  "Minimal",
  "Classic",
  "Karaoke",
  "Highlight",
  "Animated",
  "Professional",
  "Cinematic",
];

const FONTS = [
  { name: "Khand Bold (AP Style)", value: "Khand", family: "'Khand', sans-serif" },
  { name: "Impact (Viral Big)", value: "Impact", family: "Impact, Charcoal, sans-serif" },
  { name: "Noto Sans Devanagari", value: "Devanagari", family: "'Noto Sans Devanagari', sans-serif" },
  { name: "Arial Bold (Modern Sans)", value: "Arial", family: "Arial, sans-serif" },
  { name: "Georgia (Cinematic Serif)", value: "Georgia", family: "Georgia, serif" },
];

const ANIMATIONS = [
  { id: "popup", name: "Pop Up (Punch-In)", category: "Punch" },
  { id: "pop_down", name: "Pop Down", category: "Punch" },
  { id: "scale_in", name: "Scale In", category: "Punch" },
  { id: "zoom_out", name: "Zoom Out", category: "Punch" },
  { id: "bounce", name: "Word Bounce", category: "Motion" },
  { id: "spring", name: "Spring Elastic", category: "Motion" },
  { id: "shake", name: "Word Shake", category: "Motion" },
  { id: "flip", name: "3D Word Flip", category: "Motion" },
  { id: "spin", name: "Word Spin", category: "Motion" },
  { id: "pulse", name: "Word Pulse", category: "Motion" },
  { id: "stretch", name: "Word Stretch", category: "Motion" },
  { id: "slide_up", name: "Slide Up", category: "Slide" },
  { id: "slide_down", name: "Slide Down", category: "Slide" },
  { id: "slide_left", name: "Slide Left", category: "Slide" },
  { id: "slide_right", name: "Slide Right", category: "Slide" },
  { id: "fade_in", name: "Fade In", category: "Fade" },
  { id: "fade_out", name: "Fade Out", category: "Fade" },
  { id: "blur_in", name: "Blur In Reveal", category: "Reveal" },
  { id: "smooth_reveal", name: "Smooth Wipe Reveal", category: "Reveal" },
  { id: "typewriter", name: "Typewriter Step", category: "Reveal" },
  { id: "karaoke", name: "Karaoke Highlight", category: "AI & Karaoke" },
  { id: "pop_keyword", name: "AI Magnified Keyword", category: "AI & Karaoke" },
  { id: "glitch", name: "RGB Glitch Split", category: "Visual FX" },
  { id: "neon", name: "Cyberpunk Neon Glow", category: "Visual FX" },
  { id: "wave", name: "Liquid Text Wave", category: "Visual FX" },
  { id: "gradient", name: "Dynamic Gradient Shift", category: "Visual FX" },
];

export function SubtitleCustomizerPanel({
  presets,
  currentStyle,
  onStyleChange,
  onApplyPreset,
  selectedSegmentId,
  selectedSegmentText,
  onResetIndividualStyle,
  onApplyPositionToAll,
}: Props) {
  const [activeTab, setActiveTab] = useState<"style" | "edit">("style");
  const [selectedCategory, setSelectedCategory] = useState("All");
  const [searchQuery, setSearchQuery] = useState("");
  const [animCategory, setAnimCategory] = useState("All");

  const filteredPresets = useMemo(() => {
    return presets.filter((p) => {
      const matchCat = selectedCategory === "All" || p.category === selectedCategory;
      const matchSearch =
        !searchQuery.trim() ||
        p.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        (p.description && p.description.toLowerCase().includes(searchQuery.toLowerCase())) ||
        p.font_family.toLowerCase().includes(searchQuery.toLowerCase());
      return matchCat && matchSearch;
    });
  }, [presets, selectedCategory, searchQuery]);

  return (
    <div className="flex flex-col h-full bg-panel text-paper border-l border-line select-none overflow-hidden">
      {/* Top Header with Style / Edit Tabs */}
      <div className="border-b border-line bg-ink/70 px-4 py-3 shrink-0">
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2">
            <Type size={16} className="text-amber-400" />
            <h3 className="text-xs font-black uppercase tracking-wider text-paper">
              Subtitle Customizer
            </h3>
            <span className="rounded bg-amber-500/20 px-1.5 py-0.5 text-[9px] font-bold text-amber-300">
              VEED Pro
            </span>
          </div>

          {selectedSegmentId ? (
            <span className="rounded bg-purple-500/20 border border-purple-500/40 px-2 py-0.5 text-[10px] font-bold text-purple-300">
              Editing Single Subtitle
            </span>
          ) : (
            <span className="rounded bg-line/80 px-2 py-0.5 text-[10px] font-medium text-mute">
              Global Style Mode
            </span>
          )}
        </div>

        {/* Tab Switcher */}
        <div className="grid grid-cols-2 gap-1 rounded-lg border border-line bg-panel p-1">
          <button
            onClick={() => setActiveTab("style")}
            className={`py-1.5 text-xs font-bold rounded-md transition-all flex items-center justify-center gap-1.5 ${
              activeTab === "style"
                ? "bg-amber-400 text-ink shadow-sm"
                : "text-mute hover:text-paper"
            }`}
          >
            <Sparkles size={13} />
            STYLE (Presets & FX)
          </button>
          <button
            onClick={() => setActiveTab("edit")}
            className={`py-1.5 text-xs font-bold rounded-md transition-all flex items-center justify-center gap-1.5 ${
              activeTab === "edit"
                ? "bg-amber-400 text-ink shadow-sm"
                : "text-mute hover:text-paper"
            }`}
          >
            <Sliders size={13} />
            EDIT (Typography & Pos)
          </button>
        </div>
      </div>

      {/* Selected Subtitle Context Indicator */}
      {selectedSegmentId && (
        <div className="bg-purple-950/40 border-b border-purple-500/30 px-4 py-2 flex items-center justify-between text-xs shrink-0">
          <div className="flex items-center gap-1.5 min-w-0">
            <span className="h-2 w-2 rounded-full bg-purple-400 shrink-0 animate-pulse" />
            <span className="text-[11px] text-purple-200 truncate">
              "{selectedSegmentText || "Selected cue"}"
            </span>
          </div>
          {onResetIndividualStyle && (
            <button
              onClick={onResetIndividualStyle}
              className="text-[10px] text-purple-300 hover:text-white underline shrink-0 ml-2"
              title="Reset this subtitle to match global style"
            >
              Reset to Global
            </button>
          )}
        </div>
      )}

      {/* Content Area */}
      <div className="flex-1 overflow-y-auto p-4 space-y-5">
        {/* ============================================================== */}
        {/* TAB 1: STYLE (PRESET LIBRARY & ANIMATION GALLERY)               */}
        {/* ============================================================== */}
        {activeTab === "style" && (
          <div className="space-y-4">
            {/* Search and Category Filter */}
            <div className="space-y-2.5">
              <div className="relative">
                <Search size={13} className="absolute left-2.5 top-2.5 text-mute" />
                <input
                  type="text"
                  placeholder="Search styles (e.g. Yellow, TikTok, Minimal)..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full rounded-lg border border-line bg-ink py-1.5 pl-8 pr-3 text-xs text-paper placeholder-mute/60 focus:border-amber-400 focus:outline-none"
                />
                {searchQuery && (
                  <button
                    onClick={() => setSearchQuery("")}
                    className="absolute right-2.5 top-2 text-mute hover:text-paper"
                  >
                    &times;
                  </button>
                )}
              </div>

              {/* Horizontal Category Carousel */}
              <div className="flex items-center gap-1.5 overflow-x-auto pb-1 scrollbar-thin">
                {CATEGORIES.map((cat) => (
                  <button
                    key={cat}
                    onClick={() => setSelectedCategory(cat)}
                    className={`shrink-0 rounded-full px-2.5 py-1 text-[11px] font-semibold transition-all ${
                      selectedCategory === cat
                        ? "bg-amber-400 text-ink shadow-sm font-bold"
                        : "bg-ink border border-line/60 text-mute hover:text-paper hover:border-line"
                    }`}
                  >
                    {cat}
                  </button>
                ))}
              </div>
            </div>

            {/* Presets Visual Cards Grid */}
            <div className="space-y-2">
              <div className="flex items-center justify-between text-xs text-mute font-bold uppercase tracking-wider">
                <span>Styles ({filteredPresets.length})</span>
                <span className="text-[10px] text-mute/80">Click card to apply instantly</span>
              </div>

              <div className="grid grid-cols-2 gap-2.5">
                {filteredPresets.map((preset) => {
                  const isSelected =
                    currentStyle.id === preset.id ||
                    (currentStyle.font_family === preset.font_family &&
                      currentStyle.primary_color === preset.primary_color);

                  return (
                    <div
                      key={preset.id}
                      onClick={() => onApplyPreset(preset)}
                      className={`group relative flex flex-col justify-between rounded-xl border p-3 cursor-pointer transition-all ${
                        isSelected
                          ? "border-amber-400 bg-amber-500/10 shadow-md shadow-amber-400/10 ring-1 ring-amber-400"
                          : "border-line bg-ink/40 hover:bg-ink hover:border-amber-400/50"
                      }`}
                    >
                      {/* Live visual preview card matching actual styling */}
                      <div className="flex h-16 w-full items-center justify-center overflow-hidden rounded-lg bg-black/70 p-2 border border-line/40">
                        <span
                          className={`inline-block text-center font-bold transition-transform group-hover:scale-105 ${
                            preset.animation === "popup"
                              ? "anim-popup"
                              : preset.animation === "bounce"
                              ? "anim-bounce"
                              : preset.animation === "neon"
                              ? "anim-neon"
                              : preset.animation === "glitch"
                              ? "anim-glitch"
                              : ""
                          }`}
                          style={{
                            fontFamily:
                              preset.font_family === "Khand"
                                ? "'Khand', sans-serif"
                                : preset.font_family === "Impact"
                                ? "Impact, Charcoal, sans-serif"
                                : preset.font_family === "NotoSansDevanagari"
                                ? "'Noto Sans Devanagari', sans-serif"
                                : preset.font_family === "Georgia"
                                ? "Georgia, serif"
                                : "Arial, sans-serif",
                            color: preset.primary_color,
                            fontSize: "0.85rem",
                            lineHeight: 1.1,
                            backgroundColor:
                              preset.bg_color && preset.bg_color !== "transparent"
                                ? preset.bg_color
                                : "transparent",
                            padding: preset.bg_padding ? `${preset.bg_padding / 2}px` : "0",
                            borderRadius: preset.bg_radius ? `${preset.bg_radius}px` : "0",
                            textShadow:
                              preset.border_style === 3
                                ? "none"
                                : `-1.5px -1.5px 0 ${preset.outline_color}, 1.5px -1.5px 0 ${preset.outline_color}, -1.5px 1.5px 0 ${preset.outline_color}, 1.5px 1.5px 0 ${preset.outline_color}`,
                          }}
                        >
                          {preset.casing === "uppercase" ? "SUBTITLES" : "Subtitles"}
                        </span>
                      </div>

                      <div className="mt-2 flex items-center justify-between">
                        <div className="min-w-0 pr-1">
                          <h4 className="text-xs font-bold text-paper truncate">
                            {preset.name}
                          </h4>
                          <span className="text-[10px] text-mute block truncate">
                            {preset.category} &bull; {preset.animation}
                          </span>
                        </div>

                        {isSelected && (
                          <div className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-amber-400 text-ink">
                            <Check size={12} strokeWidth={3} />
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Subtitle Animation Library */}
            <div className="border-t border-line/60 pt-4 space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-1.5">
                  <Zap size={14} className="text-amber-400" />
                  <h4 className="text-xs font-bold uppercase tracking-wider text-paper">
                    Animation Library
                  </h4>
                </div>
                <span className="text-[10px] text-amber-300 font-semibold">
                  {currentStyle.animation || "popup"}
                </span>
              </div>

              <div className="grid grid-cols-2 gap-1.5 max-h-48 overflow-y-auto pr-1">
                {ANIMATIONS.map((anim) => {
                  const isActive = (currentStyle.animation || "popup") === anim.id;
                  return (
                    <button
                      key={anim.id}
                      onClick={() => onStyleChange({ animation: anim.id })}
                      className={`flex items-center justify-between rounded-lg border px-2.5 py-1.5 text-xs text-left transition-all ${
                        isActive
                          ? "border-amber-400 bg-amber-400/20 text-amber-300 font-bold"
                          : "border-line bg-ink/30 text-mute hover:text-paper hover:border-line/80"
                      }`}
                    >
                      <span className="truncate">{anim.name}</span>
                      {isActive && <Check size={12} className="shrink-0 text-amber-400 ml-1" />}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        )}

        {/* ============================================================== */}
        {/* TAB 2: EDIT (DIRECT TYPOGRAPHY, POSITION, STROKE, SHADOW)       */}
        {/* ============================================================== */}
        {activeTab === "edit" && (
          <div className="space-y-4">
            {/* Direct Position & Canvas Alignment */}
            <div className="rounded-xl border border-line bg-ink/40 p-3 space-y-2.5">
              <div className="flex items-center justify-between">
                <span className="flex items-center gap-1.5 text-xs font-bold text-paper">
                  <Move size={13} className="text-amber-400" />
                  <span>Position & Alignment</span>
                </span>
                <div className="flex items-center gap-2">
                  {selectedSegmentId && onApplyPositionToAll && (
                    <button
                      onClick={onApplyPositionToAll}
                      className="text-[10px] text-amber-400 hover:text-amber-300 underline font-semibold"
                      title="Apply this exact position to all subtitles across video"
                    >
                      Apply Pos to All
                    </button>
                  )}
                  <button
                    onClick={() => onStyleChange({ pos_x: 50, pos_y: 85, rotation: 0 })}
                    className="inline-flex items-center gap-1 text-[10px] text-mute hover:text-paper"
                    title="Reset position to bottom center"
                  >
                    <RotateCcw size={10} />
                    Reset
                  </button>
                </div>
              </div>

              {/* Quick Placement Snap Buttons */}
              <div className="grid grid-cols-3 gap-1.5">
                <button
                  onClick={() => onStyleChange({ pos_x: 50, pos_y: 18, alignment: 8 })}
                  className={`py-1 rounded border text-[11px] font-semibold transition-colors ${
                    (currentStyle.pos_y || 85) <= 25
                      ? "border-amber-400 bg-amber-400/20 text-amber-300"
                      : "border-line bg-panel text-mute hover:text-paper"
                  }`}
                >
                  Top
                </button>
                <button
                  onClick={() => onStyleChange({ pos_x: 50, pos_y: 50, alignment: 5 })}
                  className={`py-1 rounded border text-[11px] font-semibold transition-colors ${
                    (currentStyle.pos_y || 85) > 25 && (currentStyle.pos_y || 85) < 70
                      ? "border-amber-400 bg-amber-400/20 text-amber-300"
                      : "border-line bg-panel text-mute hover:text-paper"
                  }`}
                >
                  Center
                </button>
                <button
                  onClick={() => onStyleChange({ pos_x: 50, pos_y: 85, alignment: 2 })}
                  className={`py-1 rounded border text-[11px] font-semibold transition-colors ${
                    (currentStyle.pos_y || 85) >= 70
                      ? "border-amber-400 bg-amber-400/20 text-amber-300"
                      : "border-line bg-panel text-mute hover:text-paper"
                  }`}
                >
                  Bottom (Reels)
                </button>
              </div>

              {/* Sliders for micro adjustment */}
              <div className="space-y-1.5 pt-1 text-[11px]">
                <div className="flex justify-between text-mute">
                  <span>Horizontal (X): {Math.round(currentStyle.pos_x ?? 50)}%</span>
                  <span>Vertical (Y): {Math.round(currentStyle.pos_y ?? 85)}%</span>
                </div>
                <input
                  type="range"
                  min={10}
                  max={90}
                  value={currentStyle.pos_x ?? 50}
                  onChange={(e) => onStyleChange({ pos_x: Number(e.target.value) })}
                  className="w-full accent-amber-400"
                />
                <input
                  type="range"
                  min={10}
                  max={92}
                  value={currentStyle.pos_y ?? 85}
                  onChange={(e) => onStyleChange({ pos_y: Number(e.target.value) })}
                  className="w-full accent-amber-400"
                />
              </div>

              {/* Rotation Slider */}
              <div className="pt-1 text-[11px]">
                <div className="flex justify-between text-mute mb-1">
                  <span className="flex items-center gap-1">
                    <RotateCw size={11} />
                    Rotation Angle
                  </span>
                  <span className="font-mono">{currentStyle.rotation ?? 0}&deg;</span>
                </div>
                <input
                  type="range"
                  min={-45}
                  max={45}
                  value={currentStyle.rotation ?? 0}
                  onChange={(e) => onStyleChange({ rotation: Number(e.target.value) })}
                  className="w-full accent-amber-400"
                />
              </div>
            </div>

            {/* Typography Controls */}
            <div className="space-y-3">
              <div>
                <label className="block text-[11px] font-bold text-mute uppercase tracking-wider mb-1">
                  Font Family
                </label>
                <select
                  value={currentStyle.font_family || "Khand"}
                  onChange={(e) => onStyleChange({ font_family: e.target.value })}
                  className="w-full rounded-lg border border-line bg-ink px-3 py-1.5 text-xs text-paper focus:border-amber-400 focus:outline-none"
                >
                  {FONTS.map((f) => (
                    <option key={f.value} value={f.value}>
                      {f.name}
                    </option>
                  ))}
                </select>
              </div>

              {/* Font Size & Weight */}
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <div className="flex justify-between text-[11px] font-bold text-mute uppercase tracking-wider mb-1">
                    <span>Size</span>
                    <span className="text-amber-300 font-mono">{currentStyle.font_size || 28}px</span>
                  </div>
                  <input
                    type="range"
                    min={14}
                    max={54}
                    value={currentStyle.font_size || 28}
                    onChange={(e) => onStyleChange({ font_size: Number(e.target.value) })}
                    className="w-full accent-amber-400 mt-1"
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-bold text-mute uppercase tracking-wider mb-1">
                    Casing
                  </label>
                  <select
                    value={currentStyle.casing || "uppercase"}
                    onChange={(e) => onStyleChange({ casing: e.target.value as any })}
                    className="w-full rounded-lg border border-line bg-ink px-2 py-1.5 text-xs text-paper focus:border-amber-400 focus:outline-none"
                  >
                    <option value="uppercase">UPPERCASE</option>
                    <option value="normal">Normal Speech</option>
                    <option value="lowercase">lowercase</option>
                  </select>
                </div>
              </div>

              {/* Text Styles & Alignments */}
              <div className="flex items-center gap-2">
                <button
                  onClick={() => onStyleChange({ bold: !currentStyle.bold })}
                  className={`flex-1 py-1 rounded border text-xs font-bold transition-colors ${
                    currentStyle.bold !== false
                      ? "border-amber-400 bg-amber-400/20 text-amber-300"
                      : "border-line bg-ink text-mute hover:text-paper"
                  }`}
                >
                  Bold
                </button>
                <button
                  onClick={() => onStyleChange({ italic: !currentStyle.italic })}
                  className={`flex-1 py-1 rounded border text-xs italic font-serif transition-colors ${
                    currentStyle.italic
                      ? "border-amber-400 bg-amber-400/20 text-amber-300"
                      : "border-line bg-ink text-mute hover:text-paper"
                  }`}
                >
                  Italic
                </button>
                <button
                  onClick={() => onStyleChange({ underline: !currentStyle.underline })}
                  className={`flex-1 py-1 rounded border text-xs underline transition-colors ${
                    currentStyle.underline
                      ? "border-amber-400 bg-amber-400/20 text-amber-300"
                      : "border-line bg-ink text-mute hover:text-paper"
                  }`}
                >
                  Underline
                </button>
              </div>
            </div>

            {/* Colors: Text, Highlight, Outline */}
            <div className="space-y-3 border-t border-line/60 pt-3">
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-[11px] font-bold text-mute uppercase tracking-wider mb-1">
                    Text Color
                  </label>
                  <div className="flex items-center gap-1.5 rounded-lg border border-line bg-ink p-1">
                    <input
                      type="color"
                      value={currentStyle.primary_color || "#FFFF00"}
                      onChange={(e) => onStyleChange({ primary_color: e.target.value })}
                      className="h-6 w-6 cursor-pointer rounded border-0 bg-transparent p-0"
                    />
                    <input
                      type="text"
                      value={currentStyle.primary_color || "#FFFF00"}
                      onChange={(e) => onStyleChange({ primary_color: e.target.value })}
                      className="w-full bg-transparent text-xs font-mono uppercase text-paper focus:outline-none"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-[11px] font-bold text-mute uppercase tracking-wider mb-1">
                    Highlight / Accent
                  </label>
                  <div className="flex items-center gap-1.5 rounded-lg border border-line bg-ink p-1">
                    <input
                      type="color"
                      value={currentStyle.highlight_color || "#00FF66"}
                      onChange={(e) => onStyleChange({ highlight_color: e.target.value })}
                      className="h-6 w-6 cursor-pointer rounded border-0 bg-transparent p-0"
                    />
                    <input
                      type="text"
                      value={currentStyle.highlight_color || "#00FF66"}
                      onChange={(e) => onStyleChange({ highlight_color: e.target.value })}
                      className="w-full bg-transparent text-xs font-mono uppercase text-paper focus:outline-none"
                    />
                  </div>
                </div>
              </div>

              {/* Stroke / Outline */}
              <div>
                <div className="flex justify-between text-[11px] font-bold text-mute uppercase tracking-wider mb-1">
                  <span>Outline Thickness</span>
                  <span className="font-mono text-paper">{currentStyle.outline_width ?? 3}px</span>
                </div>
                <div className="flex items-center gap-2">
                  <input
                    type="color"
                    value={currentStyle.outline_color || "#000000"}
                    onChange={(e) => onStyleChange({ outline_color: e.target.value })}
                    className="h-7 w-7 cursor-pointer rounded border border-line bg-transparent p-0"
                    title="Outline color"
                  />
                  <input
                    type="range"
                    min={0}
                    max={8}
                    step={0.5}
                    value={currentStyle.outline_width ?? 3}
                    onChange={(e) => onStyleChange({ outline_width: Number(e.target.value) })}
                    className="flex-1 accent-amber-400"
                  />
                </div>
              </div>

              {/* Background Pill / Box */}
              <div>
                <div className="flex justify-between text-[11px] font-bold text-mute uppercase tracking-wider mb-1">
                  <span>Background Box</span>
                  <button
                    onClick={() =>
                      onStyleChange({
                        bg_color: currentStyle.bg_color === "transparent" ? "#000000" : "transparent",
                        border_style: currentStyle.border_style === 3 ? 1 : 3,
                      })
                    }
                    className="text-[10px] text-amber-400 hover:underline"
                  >
                    {currentStyle.border_style === 3 ? "Disable Box" : "Enable Box Pill"}
                  </button>
                </div>
                <div className="flex items-center gap-2">
                  <input
                    type="color"
                    value={
                      currentStyle.bg_color && currentStyle.bg_color !== "transparent"
                        ? currentStyle.bg_color
                        : "#000000"
                    }
                    onChange={(e) =>
                      onStyleChange({ bg_color: e.target.value, border_style: 3 })
                    }
                    className="h-7 w-7 cursor-pointer rounded border border-line bg-transparent p-0"
                  />
                  <div className="flex-1 text-[11px] text-mute">
                    {currentStyle.border_style === 3
                      ? "Box background enabled (Opaque pill)"
                      : "Transparent (Outline only)"}
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
