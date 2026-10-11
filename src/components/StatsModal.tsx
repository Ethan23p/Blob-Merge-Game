import React from 'react';
import { X, Award, Sparkles, BarChart2, Flame, Palette } from 'lucide-react';
import { GameStats, GameMode } from '../types';
import { BLOB_GROUPS, getBlobColor, formatBlobValue } from '../utils/colors';
import { getBlobValueForMode } from '../utils/spawnerPool';

interface StatsModalProps {
  isOpen: boolean;
  onClose: () => void;
  stats: GameStats;
  mode?: GameMode;
}

export const StatsModal: React.FC<StatsModalProps> = ({ isOpen, onClose, stats, mode = 'bonded' }) => {
  if (!isOpen) return null;

  const samplePowers = [0, 2, 4, 6, 8, 10, 12];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/85 backdrop-blur-md animate-fade-in">
      <div className="relative w-full max-w-lg bg-zinc-900 border border-zinc-800 rounded-2xl shadow-2xl p-6 text-zinc-100 flex flex-col gap-5 max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-zinc-800 pb-3">
          <div className="flex items-center gap-2">
            <BarChart2 className="w-6 h-6 text-zinc-300" />
            <h2 className="text-xl font-extrabold text-white tracking-tight">
              Statistics & Color Groupings
            </h2>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-zinc-400 hover:text-white hover:bg-zinc-800 transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Stats Grid */}
        <div className="grid grid-cols-2 gap-3">
          <div className="bg-black/70 border border-zinc-800 p-3 rounded-xl flex flex-col gap-1">
            <span className="text-xs font-semibold text-zinc-400 flex items-center gap-1">
              <Award className="w-3.5 h-3.5 text-amber-400" /> High Score
            </span>
            <span className="text-xl font-black text-amber-300">
              {stats.highScore.toLocaleString()}
            </span>
          </div>

          <div className="bg-black/70 border border-zinc-800 p-3 rounded-xl flex flex-col gap-1">
            <span className="text-xs font-semibold text-zinc-400 flex items-center gap-1">
              <Flame className="w-3.5 h-3.5 text-rose-400" /> Max Multiplier
            </span>
            <span className="text-xl font-black text-rose-400">
              {stats.maxCombo}x Multi
            </span>
          </div>

          <div className="bg-black/70 border border-zinc-800 p-3 rounded-xl flex flex-col gap-1">
            <span className="text-xs font-semibold text-zinc-400 flex items-center gap-1">
              <Sparkles className="w-3.5 h-3.5 text-zinc-300" /> Total Merges
            </span>
            <span className="text-xl font-black text-zinc-100">
              {stats.totalMerges.toLocaleString()}
            </span>
          </div>

          <div className="bg-black/70 border border-zinc-800 p-3 rounded-xl flex flex-col gap-1">
            <span className="text-xs font-semibold text-zinc-400 flex items-center gap-1">
              <Sparkles className="w-3.5 h-3.5 text-emerald-400" /> Novas Cleared
            </span>
            <span className="text-xl font-black text-emerald-300">
              {stats.novasTriggered} Novas
            </span>
          </div>
        </div>

        {/* Color Groupings Hierarchy Section */}
        <div>
          <h3 className="text-sm font-bold text-zinc-300 mb-2.5 flex items-center gap-2">
            <Palette className="w-4 h-4 text-amber-400" /> 4 Color Groupings (Value Spectrum: Dark → Light)
          </h3>
          <div className="flex flex-col gap-2.5">
            {BLOB_GROUPS.map((group) => {
              return (
                <div
                  key={group.id}
                  className="flex flex-col gap-2 bg-black/60 p-3 rounded-xl border border-zinc-800/80 text-xs"
                >
                  <div className="flex items-center justify-between font-bold text-white">
                    <span className="flex items-center gap-1.5">
                      <span
                        className="w-3 h-3 rounded-full"
                        style={{ backgroundColor: group.badgeHex }}
                      />
                      {group.name} Grouping
                    </span>
                    <span className="text-[10px] text-zinc-400 font-normal">
                      {group.description}
                    </span>
                  </div>

                  <div className="flex items-center gap-1 overflow-x-auto pt-1">
                    {samplePowers.map((pow) => {
                      const colorDetails = getBlobColor(pow, group.id);
                      const val = getBlobValueForMode(pow, mode);
                      return (
                        <div
                          key={pow}
                          className="flex flex-col items-center gap-1 min-w-[36px]"
                        >
                          <div
                            className="w-7 h-7 rounded-full flex items-center justify-center font-extrabold text-[9px] text-white border border-white/20 shadow-sm"
                            style={{ backgroundColor: colorDetails.hex }}
                            title={`${group.name} 2*3^${pow} = ${val}`}
                          >
                            {formatBlobValue(val)}
                          </div>
                          <span className="text-[8px] text-zinc-400 font-mono">
                            {formatBlobValue(val)}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Close Button */}
        <button
          onClick={onClose}
          className="w-full py-2.5 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-white font-bold text-sm transition"
        >
          Close
        </button>
      </div>
    </div>
  );
};
