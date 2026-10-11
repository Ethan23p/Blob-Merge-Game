import React, { useState } from 'react';
import { ConfigMap, ConfigItem } from '../config/gameConfig';
import { RotateCcw, X, Sliders, ChevronDown, ChevronUp } from 'lucide-react';

interface ConfigTopBarProps {
  config: ConfigMap;
  onUpdateConfig: (id: string, value: number | boolean) => void;
  onToggleTopBarPin: (id: string, enabled: boolean) => void;
  onResetItem: (id: string) => void;
}

export const ConfigTopBar: React.FC<ConfigTopBarProps> = ({
  config,
  onUpdateConfig,
  onToggleTopBarPin,
  onResetItem,
}) => {
  const [isCollapsed, setIsCollapsed] = useState(false);

  // Get active controls checked in pause menu
  const activeItems = (Object.values(config) as ConfigItem[]).filter((item) => item.enabledInTopBar);

  if (activeItems.length === 0) return null;

  return (
    <div className="absolute top-16 sm:top-20 left-2 right-2 sm:left-4 sm:right-4 z-20 pointer-events-auto flex flex-col items-center">
      <div className="w-full max-w-4xl bg-zinc-900/95 border border-zinc-800/90 backdrop-blur-md rounded-2xl p-2 sm:p-3 shadow-2xl transition-all">
        {/* Top Header / Collapse Toggle */}
        <div className="flex items-center justify-between px-2 pb-1.5 border-b border-zinc-800/80 mb-2">
          <div className="flex items-center gap-2">
            <div className="p-1.5 rounded-lg bg-zinc-800 border border-zinc-700 text-zinc-300">
              <Sliders className="w-3.5 h-3.5" />
            </div>
            <span className="text-xs font-black tracking-wide text-zinc-200 uppercase">
              Live Config Controls
            </span>
            <span className="text-[10px] font-extrabold px-1.5 py-0.5 rounded-full bg-zinc-800 text-zinc-300 border border-zinc-700">
              {activeItems.length} Active
            </span>
          </div>

          <button
            onClick={() => setIsCollapsed((prev) => !prev)}
            className="flex items-center gap-1 text-[11px] font-bold text-zinc-400 hover:text-white px-2 py-1 rounded-lg bg-zinc-800/80 hover:bg-zinc-800 transition border border-zinc-700/60"
          >
            <span>{isCollapsed ? 'Show Controls' : 'Hide Bar'}</span>
            {isCollapsed ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronUp className="w-3.5 h-3.5" />}
          </button>
        </div>

        {/* Control Widgets Grid / Row */}
        {!isCollapsed && (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2 max-h-[40vh] overflow-y-auto pr-1 scrollbar-thin">
            {activeItems.map((item) => {
              return (
                <div
                  key={item.id}
                  className="bg-black/80 border border-zinc-800/90 rounded-xl p-2.5 flex flex-col gap-1.5 relative group hover:border-zinc-700 transition"
                >
                  {/* Item Header */}
                  <div className="flex items-center justify-between gap-1">
                    <span className="text-[11px] font-extrabold text-zinc-200 tracking-tight truncate">
                      {item.label}
                    </span>
                    <div className="flex items-center gap-1">
                      <button
                        onClick={() => onResetItem(item.id)}
                        title="Reset to default"
                        className="p-1 rounded text-zinc-500 hover:text-amber-400 hover:bg-zinc-800 transition"
                      >
                        <RotateCcw className="w-3 h-3" />
                      </button>
                      <button
                        onClick={() => onToggleTopBarPin(item.id, false)}
                        title="Dismiss from top bar"
                        className="p-1 rounded text-zinc-500 hover:text-rose-400 hover:bg-zinc-800 transition"
                      >
                        <X className="w-3 h-3" />
                      </button>
                    </div>
                  </div>

                  {/* Input Control according to type */}
                  {item.type === 'number' ? (
                    <div className="flex items-center gap-2">
                      {/* Slider */}
                      <input
                        type="range"
                        min={item.min ?? 0}
                        max={item.max ?? 10}
                        step={item.step ?? 0.01}
                        value={typeof item.value === 'number' ? item.value : item.defaultValue as number}
                        onChange={(e) => onUpdateConfig(item.id, parseFloat(e.target.value) || 0)}
                        className="flex-1 accent-zinc-200 cursor-pointer h-1.5 bg-zinc-800 rounded-lg"
                      />

                      {/* Direct Unbounded Input Field */}
                      <div className="flex items-center gap-0.5 bg-zinc-900 border border-zinc-700 rounded-lg px-2 py-0.5 w-20">
                        <input
                          type="text"
                          inputMode="decimal"
                          value={item.value.toString()}
                          onChange={(e) => {
                            const valStr = e.target.value;
                            if (valStr === '' || valStr === '-') {
                              onUpdateConfig(item.id, 0);
                            } else {
                              const parsed = parseFloat(valStr);
                              if (!isNaN(parsed)) {
                                onUpdateConfig(item.id, parsed);
                              }
                            }
                          }}
                          className="w-full bg-transparent text-right font-mono font-bold text-xs text-zinc-100 focus:outline-none"
                        />
                        {item.unit && (
                          <span className="text-[10px] font-bold text-zinc-500">{item.unit}</span>
                        )}
                      </div>
                    </div>
                  ) : (
                    /* Boolean Toggle Control */
                    <div className="flex items-center justify-between bg-zinc-900 border border-zinc-800 p-1.5 rounded-lg">
                      <span className="text-[10px] font-semibold text-zinc-400">
                        {item.value ? 'Enabled' : 'Disabled'}
                      </span>
                      <button
                        onClick={() => onUpdateConfig(item.id, !item.value)}
                        className={`relative inline-flex h-5 w-9 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                          item.value ? 'bg-zinc-200' : 'bg-zinc-700'
                        }`}
                      >
                        <span
                          className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-black shadow ring-0 transition duration-200 ease-in-out ${
                            item.value ? 'translate-x-4 bg-black' : 'translate-x-0 bg-white'
                          }`}
                        />
                      </button>
                    </div>
                  )}

                  <p className="text-[9px] text-zinc-400 leading-tight">
                    {item.description}
                  </p>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};
