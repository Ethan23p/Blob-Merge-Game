import React from 'react';
import { ConfigMap, ConfigItem, PHYSICS_PRESETS } from '../config/gameConfig';
import { Sliders, RotateCcw, CheckSquare, Square, Sparkles, Droplets } from 'lucide-react';
import { trimTrailingZeroDecimals } from '../utils/colors';

interface ConfigPauseListProps {
  config: ConfigMap;
  onUpdateConfig: (id: string, value: number | boolean) => void;
  onToggleTopBarPin: (id: string, enabled: boolean) => void;
  onResetItem: (id: string) => void;
  onResetAll: () => void;
  onEnableAllTopBar: (enable: boolean) => void;
}

export const ConfigPauseList: React.FC<ConfigPauseListProps> = ({
  config,
  onUpdateConfig,
  onToggleTopBarPin,
  onResetItem,
  onResetAll,
  onEnableAllTopBar,
}) => {
  const items = Object.values(config) as ConfigItem[];

  return (
    <div className="flex flex-col gap-2 bg-black/80 border border-zinc-800 p-3 rounded-xl text-left">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-zinc-800 pb-2">
        <div className="flex items-center gap-1.5">
          <Sliders className="w-4 h-4 text-zinc-300" />
          <span className="text-xs font-black uppercase text-zinc-200 tracking-wider">
            Configuration Overrides
          </span>
        </div>
        <span className="text-[10px] text-zinc-400">
          Check box = Pin to Play Field Top Bar
        </span>
      </div>

      {/* Physics Presets Toolbar */}
      <div className="flex flex-col gap-1 border-b border-zinc-800 pb-2 pt-1">
        <div className="flex items-center gap-1.5">
          <Droplets className="w-3 h-3 text-cyan-400" />
          <span className="text-[10px] font-bold uppercase tracking-wider text-zinc-300">
            Fluid Physics Presets
          </span>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-1">
          {Object.values(PHYSICS_PRESETS).map((preset) => (
            <button
              key={preset.id}
              onClick={() => {
                Object.entries(preset.values).forEach(([k, v]) => {
                  if (v !== undefined) onUpdateConfig(k, v);
                });
              }}
              title={preset.description}
              className="px-2 py-1 rounded bg-zinc-800 hover:bg-zinc-700 text-zinc-200 hover:text-white text-[10px] font-bold transition border border-zinc-700 hover:border-zinc-500 truncate text-center"
            >
              {preset.name}
            </button>
          ))}
        </div>
      </div>

      {/* Quick Action Toolbar */}
      <div className="flex items-center justify-between gap-1 py-1">
        <div className="flex items-center gap-1">
          <button
            onClick={() => onEnableAllTopBar(true)}
            className="text-[10px] font-bold px-2 py-1 rounded bg-zinc-800 hover:bg-zinc-700 text-zinc-200 transition border border-zinc-700"
          >
            Check All
          </button>
          <button
            onClick={() => onEnableAllTopBar(false)}
            className="text-[10px] font-bold px-2 py-1 rounded bg-zinc-800 hover:bg-zinc-700 text-zinc-400 transition border border-zinc-700"
          >
            Uncheck All
          </button>
        </div>

        <button
          onClick={onResetAll}
          className="text-[10px] font-bold px-2 py-1 rounded bg-zinc-800 hover:bg-rose-950 hover:text-rose-300 text-zinc-400 transition border border-zinc-700 flex items-center gap-1"
        >
          <RotateCcw className="w-3 h-3" /> Reset Defaults
        </button>
      </div>

      {/* Long Scrollable Checklist */}
      <div className="flex flex-col gap-2 max-h-64 overflow-y-auto pr-1 scrollbar-thin">
        {items.map((item) => {
          return (
            <div
              key={item.id}
              className={`p-2.5 rounded-xl border transition flex flex-col gap-1.5 ${
                item.enabledInTopBar
                  ? 'bg-zinc-900/90 border-zinc-700 shadow-sm'
                  : 'bg-black/60 border-zinc-800/80 hover:border-zinc-700'
              }`}
            >
              <div className="flex items-start gap-2.5">
                {/* Pin Checkbox */}
                <button
                  onClick={() => onToggleTopBarPin(item.id, !item.enabledInTopBar)}
                  title={
                    item.enabledInTopBar
                      ? 'Uncheck to hide from play field top bar'
                      : 'Check to place UI element at top of play field'
                  }
                  className="mt-0.5 text-zinc-300 hover:scale-110 transition flex-shrink-0"
                >
                  {item.enabledInTopBar ? (
                    <CheckSquare className="w-4 h-4 text-zinc-200 fill-zinc-800" />
                  ) : (
                    <Square className="w-4 h-4 text-zinc-600 hover:text-zinc-400" />
                  )}
                </button>

                {/* Info & Value */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between gap-1">
                    <span className="text-xs font-black text-zinc-100 truncate">
                      {item.label}
                    </span>
                    <span className="text-[11px] font-mono font-bold text-zinc-300 flex-shrink-0">
                      {item.type === 'boolean'
                        ? item.value
                          ? 'ON'
                          : 'OFF'
                        : `${trimTrailingZeroDecimals(item.value.toString())}${item.unit ? ' ' + item.unit : ''}`}
                    </span>
                  </div>

                  <p className="text-[10px] text-zinc-400 leading-tight mt-0.5">
                    {item.description}
                  </p>
                </div>
              </div>

              {/* Inline Direct Control inside Pause Menu */}
              <div className="pl-6 pt-1 flex items-center gap-2 border-t border-zinc-800/60 mt-1">
                {item.type === 'number' ? (
                  <>
                    <input
                      type="range"
                      min={item.min ?? 0}
                      max={item.max ?? 10}
                      step={item.step ?? 0.01}
                      value={typeof item.value === 'number' ? item.value : item.defaultValue as number}
                      onChange={(e) => onUpdateConfig(item.id, parseFloat(e.target.value) || 0)}
                      className="flex-1 accent-zinc-200 cursor-pointer h-1.5 bg-zinc-800 rounded-lg"
                    />
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
                      className="w-16 bg-zinc-900 border border-zinc-700 rounded px-1.5 py-0.5 text-right font-mono text-xs font-bold text-zinc-100 focus:outline-none"
                    />
                  </>
                ) : (
                  <button
                    onClick={() => onUpdateConfig(item.id, !item.value)}
                    className={`px-3 py-1 rounded text-xs font-bold transition flex items-center gap-1.5 border ${
                      item.value
                        ? 'bg-zinc-800 text-zinc-200 border-zinc-600'
                        : 'bg-zinc-900 text-zinc-500 border-zinc-800'
                    }`}
                  >
                    <Sparkles className="w-3 h-3" />
                    <span>{item.value ? 'Active (Enabled)' : 'Inactive (Disabled)'}</span>
                  </button>
                )}

                <button
                  onClick={() => onResetItem(item.id)}
                  title="Reset to default"
                  className="p-1 rounded text-zinc-500 hover:text-amber-400 transition"
                >
                  <RotateCcw className="w-3 h-3" />
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
