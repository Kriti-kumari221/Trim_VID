import React, { useState, useEffect } from "react";
import { Type, Check, Download, Eye, Sparkles } from "lucide-react";
import { api, SubtitlePreset } from "../api";

interface Props {
  selectedPresetId: string;
  onSelectPreset: (presetId: string) => void;
  previewText?: string;
}

export function SubtitleStudioView({ selectedPresetId, onSelectPreset, previewText = "CUT THE PART YOU NEED. KEEP EVERY PIXEL." }: Props) {
  const [presets, setPresets] = useState<SubtitlePreset[]>([]);

  useEffect(() => {
    api.subtitles.presets().then(setPresets).catch(() => {});
  }, []);

  return (
    <div className="flex h-full flex-col bg-panel border-r border-line">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-line bg-ink/60 px-5 py-3">
        <div className="flex items-center gap-2">
          <Type size={18} className="text-emerald-400" />
          <h3 className="font-bold text-paper text-sm">Subtitle & Caption Studio</h3>
        </div>
      </div>

      <div className="p-5 space-y-6 flex-1 overflow-y-auto">
        {/* Real-time Subtitle Visual Preview */}
        <div>
          <h4 className="text-xs font-bold uppercase tracking-wider text-mute mb-2 flex items-center gap-1.5">
            <Eye size={14} />
            Live Caption Style Preview
          </h4>
          <div className="relative flex aspect-video w-full items-center justify-center rounded-xl bg-gradient-to-b from-gray-950 to-black border border-line p-6 overflow-hidden">
            <div className="absolute inset-0 bg-black/40" />

            {/* Subtitle Display */}
            <div className="relative z-10 text-center max-w-md">
              {selectedPresetId === "viral_yellow" && (
                <span className="font-black text-2xl tracking-wide uppercase text-yellow-300 drop-shadow-[0_4px_4px_rgba(0,0,0,1)]">
                  <span className="text-emerald-400">CUT THE PART </span>
                  YOU NEED. KEEP EVERY PIXEL.
                </span>
              )}
              {selectedPresetId === "viral_green" && (
                <span className="font-black text-2xl tracking-wide uppercase text-green-400 drop-shadow-[0_4px_4px_rgba(0,0,0,1)]">
                  <span className="text-blue-400">CUT THE PART </span>
                  YOU NEED. KEEP EVERY PIXEL.
                </span>
              )}
              {selectedPresetId === "cinematic_white" && (
                <span className="font-serif text-lg tracking-widest text-white/95 drop-shadow-[0_2px_4px_rgba(0,0,0,0.8)]">
                  Cut the part you need. Keep every pixel.
                </span>
              )}
              {selectedPresetId === "boxed_modern" && (
                <span className="rounded-md bg-black/80 px-4 py-1.5 font-bold text-base text-white border border-white/20">
                  Cut the part you need. Keep every pixel.
                </span>
              )}
            </div>
          </div>
        </div>

        {/* Style Presets Grid */}
        <div>
          <h4 className="text-xs font-bold uppercase tracking-wider text-mute mb-3">
            Select Caption Preset
          </h4>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {presets.map((p) => {
              const isSelected = p.id === selectedPresetId;
              return (
                <div
                  key={p.id}
                  onClick={() => onSelectPreset(p.id)}
                  className={`flex flex-col justify-between rounded-lg border p-4 cursor-pointer transition-all ${
                    isSelected
                      ? "border-emerald-500 bg-emerald-950/20 ring-1 ring-emerald-500"
                      : "border-line bg-ink/50 hover:bg-panel hover:border-mute"
                  }`}
                >
                  <div>
                    <div className="flex items-center justify-between">
                      <h5 className="font-bold text-xs text-paper">{p.name}</h5>
                      {isSelected && <Check size={14} className="text-emerald-400" />}
                    </div>
                    <p className="text-[11px] text-mute mt-1">
                      Font: {p.font_name} • {p.uppercase ? "UPPERCASE" : "Standard"} • Position: Bottom Center
                    </p>
                  </div>

                  <div className="mt-4 pt-2 border-t border-line/40 text-[11px] font-semibold text-paper/80">
                    {p.id.includes("viral") ? "Inspired by Alex Hormozi & Viral Shorts" : "Clean Documentary & Film Style"}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
