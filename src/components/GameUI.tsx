import React, { useState } from 'react';
import { GameStats, QueuedBlob, GameMode } from '../types';
import { getBlobColor, formatBlobValue, BLOB_GROUPS } from '../utils/colors';
import { SpawnerPoolInfo, getBlobValueForMode } from '../utils/spawnerPool';
import {
  Play,
  RotateCcw,
  Volume2,
  VolumeX,
  Settings,
  Trophy,
  Layers,
  Info,
  X,
  Sparkles,
  Activity,
  Palette,
} from 'lucide-react';

interface GameUIProps {
  stats: GameStats;
  turnMultiplier: number;
  queuedBlob: QueuedBlob;
  nextQueuedBlob: QueuedBlob;
  ballPool?: QueuedBlob[];
  spawnerPoolInfo?: SpawnerPoolInfo;
  destroyOnPoolExclusion?: boolean;
  digitTint?: number;
  enableDarkDigits?: boolean;
  darkDigitThreshold?: number;
  mode?: GameMode;
  isPlaying: boolean;
  isMuted: boolean;
  onTogglePlay: () => void;
  onRestart: () => void;
  onToggleMute: () => void;
  onOpenTelemetry?: () => void;
}

export const GameUI: React.FC<GameUIProps> = ({
  stats,
  turnMultiplier,
  queuedBlob,
  nextQueuedBlob,
  spawnerPoolInfo,
  destroyOnPoolExclusion = false,
  digitTint = 0.03,
  enableDarkDigits = false,
  darkDigitThreshold = 68,
  mode = 'bonded' as GameMode,
  isPlaying,
  isMuted,
  onTogglePlay,
  onRestart,
  onToggleMute,
  onOpenTelemetry,
}) => {
  const [showPoolModal, setShowPoolModal] = useState<boolean>(false);

  const currentBlobColor = getBlobColor(queuedBlob.power, queuedBlob.group, digitTint, mode, enableDarkDigits, darkDigitThreshold);
  const nextBlobColor = getBlobColor(nextQueuedBlob.power, nextQueuedBlob.group, digitTint, mode, enableDarkDigits, darkDigitThreshold);

  const activeVal = getBlobValueForMode(queuedBlob.power, mode);
  const nextVal = getBlobValueForMode(nextQueuedBlob.power, mode);

  const minVal = spawnerPoolInfo ? getBlobValueForMode(spawnerPoolInfo.minAllowedPower, mode) : 2;
  const maxVal = spawnerPoolInfo ? getBlobValueForMode(spawnerPoolInfo.maxAllowedPower, mode) : (mode === 'unbonded' ? 32 : 54);

  return (
    <>
      <div className="absolute top-3 left-3 right-3 z-20 flex items-center justify-between pointer-events-none select-none gap-2">
        {/* Left: Score & High Score */}
        <div className="pointer-events-auto flex items-center gap-2 bg-black/80 border border-zinc-800/90 backdrop-blur-md px-3.5 py-1.5 rounded-full shadow-lg">
          <div className="flex flex-col">
            <div className="flex items-center gap-1.5">
              <span className="text-base sm:text-lg font-black text-white tracking-tight leading-none">
                {stats.score.toLocaleString()}
              </span>
              {turnMultiplier > 1 && (
                <span className="px-1.5 py-0.5 text-[9px] font-black bg-rose-500/20 text-rose-300 border border-rose-500/30 rounded-full animate-pulse">
                  {turnMultiplier}x
                </span>
              )}
            </div>
            {stats.highScore > 0 && (
              <span className="text-[10px] text-zinc-400 font-medium flex items-center gap-1 leading-none mt-0.5">
                <Trophy className="w-2.5 h-2.5 text-amber-400 inline" /> {stats.highScore.toLocaleString()}
              </span>
            )}
          </div>
        </div>

        {/* Center: Drop Queue & Launcher Pool Preview */}
        <div className="pointer-events-auto flex items-center gap-2 bg-black/80 border border-zinc-800/90 backdrop-blur-md px-3 py-1.5 rounded-full shadow-lg overflow-hidden">
          {/* Active Drop */}
          <div className="flex items-center gap-1.5">
            <span className="text-[9px] font-black text-zinc-300 tracking-wider">NEXT</span>
            <div
              className="w-6 h-6 rounded-full flex items-center justify-center font-black text-[10px] text-white border border-white/40 shadow-sm transition-transform"
              style={{ backgroundColor: currentBlobColor.hex }}
              title={`Active Launcher Ball: ${currentBlobColor.groupInfo.name} (Value ${formatBlobValue(activeVal)})`}
            >
              {formatBlobValue(activeVal)}
            </div>
            <span
              className="hidden md:inline px-1.5 py-0.5 rounded text-[8px] font-black tracking-wider text-white uppercase border border-white/20"
              style={{ backgroundColor: currentBlobColor.darkHex }}
            >
              {currentBlobColor.groupInfo.shortName}
            </span>
          </div>

          <span className="text-zinc-600 text-xs font-bold">→</span>

          {/* Next Drop */}
          <div
            className="w-4 h-4 rounded-full flex items-center justify-center font-bold text-[8px] text-white/90 opacity-80"
            style={{ backgroundColor: nextBlobColor.hex }}
            title={`Next Ball: ${nextBlobColor.groupInfo.name} (Value ${formatBlobValue(nextVal)})`}
          >
            {formatBlobValue(nextVal)}
          </div>

          {/* Mode Badge Indicator */}
          <span className={`px-2 py-0.5 rounded-full text-[9px] font-extrabold uppercase border ${
            mode === 'bonded' ? 'bg-amber-500/20 text-amber-300 border-amber-500/40' : 'bg-cyan-500/20 text-cyan-300 border-cyan-500/40'
          }`}>
            {mode === 'bonded' ? 'Bonded (3x)' : 'Unbonded (2x)'}
          </span>

          {/* Pool Range Badge Button */}
          <button
            onClick={() => setShowPoolModal(true)}
            className="ml-0.5 px-2 py-0.5 rounded-full bg-zinc-900 hover:bg-zinc-800 border border-zinc-700/60 text-[9px] font-semibold text-zinc-300 hover:text-white flex items-center gap-1 transition"
            title="View Color Groupings & Spawner Pool"
          >
            <Layers className="w-2.5 h-2.5 text-zinc-400" />
            <span>
              Pool: {formatBlobValue(minVal)}–{formatBlobValue(maxVal)}
            </span>
          </button>
        </div>

        {/* Right: Essential Action Controls */}
        <div className="pointer-events-auto flex items-center gap-1 bg-black/80 border border-zinc-800/90 backdrop-blur-md p-1 rounded-full shadow-lg">
          {onOpenTelemetry && (
            <button
              onClick={onOpenTelemetry}
              className="p-1.5 rounded-full text-zinc-400 hover:text-white hover:bg-zinc-800/80 transition"
              title="Run Telemetry & Diagnostics Inspector"
            >
              <Activity className="w-4 h-4 text-zinc-300" />
            </button>
          )}

          <button
            onClick={onToggleMute}
            className="p-1.5 rounded-full text-zinc-400 hover:text-white hover:bg-zinc-800/80 transition"
            title={isMuted ? 'Unmute' : 'Mute'}
          >
            {isMuted ? <VolumeX className="w-4 h-4 text-rose-400" /> : <Volume2 className="w-4 h-4 text-zinc-300" />}
          </button>

          <button
            onClick={onRestart}
            className="p-1.5 rounded-full text-zinc-400 hover:text-white hover:bg-zinc-800/80 transition"
            title="Restart Game"
          >
            <RotateCcw className="w-4 h-4" />
          </button>

          <button
            onClick={onTogglePlay}
            className="p-1.5 rounded-full text-zinc-400 hover:text-white hover:bg-zinc-800/80 transition"
            title={isPlaying ? 'Settings & Pause' : 'Resume'}
          >
            {isPlaying ? <Settings className="w-4 h-4" /> : <Play className="w-4 h-4 text-zinc-200" />}
          </button>
        </div>
      </div>

      {/* Spawner Pool Formula & Allowed Values Modal */}
      {showPoolModal && spawnerPoolInfo && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-md animate-fadeIn select-none">
          <div className="relative w-full max-w-md bg-slate-900/95 border border-slate-800 rounded-2xl p-5 shadow-2xl text-slate-100 flex flex-col gap-4 max-h-[90vh] overflow-y-auto">
            {/* Header */}
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div className="flex items-center gap-2">
                <div className="p-2 rounded-lg bg-cyan-500/10 border border-cyan-500/30 text-cyan-400">
                  <Layers className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-black text-white tracking-tight">Launcher Spawner Pool</h3>
                  <p className="text-xs text-slate-400">Grouping colors & value formulas</p>
                </div>
              </div>
              <button
                onClick={() => setShowPoolModal(false)}
                className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Active Color Groupings */}
            <div className="bg-slate-950/80 border border-slate-800/80 rounded-xl p-3.5 flex flex-col gap-2">
              <div className="flex items-center justify-between text-xs font-semibold">
                <span className="text-amber-400 flex items-center gap-1">
                  <Palette className="w-3.5 h-3.5" /> 4 Color Groupings (Independent Merging)
                </span>
              </div>
              <div className="grid grid-cols-2 gap-2 mt-1">
                {BLOB_GROUPS.map((g) => {
                  const sampleLow = getBlobColor(0, g.id, digitTint, mode, enableDarkDigits, darkDigitThreshold);
                  const sampleHigh = getBlobColor(12, g.id, digitTint, mode, enableDarkDigits, darkDigitThreshold);
                  return (
                    <div
                      key={g.id}
                      className="p-2 rounded-lg bg-slate-900 border border-slate-800 flex flex-col gap-1 text-[11px]"
                    >
                      <div className="flex items-center justify-between font-bold text-white">
                        <span className="flex items-center gap-1">
                          <span
                            className="w-2.5 h-2.5 rounded-full inline-block"
                            style={{ backgroundColor: g.badgeHex }}
                          />
                          {g.name}
                        </span>
                      </div>
                      <div className="flex items-center gap-1.5 text-[9px] text-slate-400">
                        <span
                          className="px-1.5 py-0.5 rounded text-white font-mono"
                          style={{ backgroundColor: sampleLow.hex }}
                        >
                          Low (Dark)
                        </span>
                        <span>→</span>
                        <span
                          className="px-1.5 py-0.5 rounded text-white font-mono"
                          style={{ backgroundColor: sampleHigh.hex }}
                        >
                          High (Light)
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Current Active Pool Values */}
            <div className="bg-slate-950/80 border border-slate-800/80 rounded-xl p-3.5 flex flex-col gap-2">
              <div className="flex items-center justify-between text-xs font-semibold">
                <span className="text-cyan-400 flex items-center gap-1">
                  <Sparkles className="w-3.5 h-3.5" /> Allowed Spawner Values ({spawnerPoolInfo.poolSize} Total)
                </span>
                <span className="text-slate-400 text-[11px]">
                  Peak Field Value: {formatBlobValue(getBlobValueForMode(spawnerPoolInfo.maxFieldPower, mode))}
                </span>
              </div>

              {/* Badges of allowed values */}
              <div className="flex flex-wrap gap-1.5 mt-1">
                {spawnerPoolInfo.allowedValues.map((val) => {
                  return (
                    <div
                      key={val}
                      className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg border border-slate-700 bg-slate-900 text-xs font-bold text-white shadow-sm"
                    >
                      <span>{formatBlobValue(val)}</span>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Pool Exclusion Mode Status */}
            {destroyOnPoolExclusion ? (
              <div className="bg-rose-950/50 border border-rose-800/60 rounded-xl p-3 flex flex-col gap-1 text-xs text-rose-200 shadow-sm">
                <div className="font-bold text-rose-300 flex items-center gap-1.5">
                  <Sparkles className="w-3.5 h-3.5 text-rose-400" /> Mode: Destroy Matching Field Blobs
                </div>
                <p className="text-[11px] text-rose-300/80 leading-relaxed">
                  When a value drops below the minimum pool threshold ({spawnerPoolInfo.minAllowedPower > 0 ? formatBlobValue(getBlobValueForMode(spawnerPoolInfo.minAllowedPower, mode)) : '2'}), any matching blobs remaining on the field are automatically destroyed.
                </p>
              </div>
            ) : (
              spawnerPoolInfo.retainedPowerGroups && spawnerPoolInfo.retainedPowerGroups.length > 0 && (
                <div className="bg-amber-950/40 border border-amber-800/50 rounded-xl p-3 flex flex-col gap-1.5 text-xs text-amber-200">
                  <div className="font-bold text-amber-300 flex items-center gap-1.5">
                    <Sparkles className="w-3.5 h-3.5 text-amber-400" /> Board-Retained Pool Values
                  </div>
                  <p className="text-[11px] text-amber-300/80 leading-relaxed">
                    These lower values remain active in the spawner pool for their color grouping because they are still present on the field:
                  </p>
                  <div className="flex flex-wrap gap-1.5 mt-0.5">
                    {spawnerPoolInfo.retainedPowerGroups.map((rg, idx) => {
                      const c = getBlobColor(rg.power, rg.group, digitTint, mode, enableDarkDigits, darkDigitThreshold);
                      return (
                        <span
                          key={idx}
                          className="px-2 py-0.5 rounded text-[10px] font-bold text-white flex items-center gap-1 border border-white/20"
                          style={{ backgroundColor: c.hex }}
                        >
                          <span>{c.groupInfo.shortName}</span>
                          <span className="font-mono">({formatBlobValue(rg.value)})</span>
                        </span>
                      );
                    })}
                  </div>
                </div>
              )
            )}

            {/* Formula Explanation */}
            <div className="text-xs text-slate-300 space-y-2 leading-relaxed bg-slate-950/40 p-3 rounded-xl border border-slate-800/50">
              <div className="font-bold text-white flex items-center gap-1">
                <Info className="w-3.5 h-3.5 text-cyan-400" /> Grouping & Progression Mechanics
              </div>
              <p>
                • <strong>Strict Color Matching:</strong> Blobs will ONLY merge if they belong to the <strong>SAME color group</strong> AND have the <strong>SAME numerical value</strong>.
              </p>
              <p>
                • <strong>Shade Progression:</strong> Inside a group, values start dark and get lighter/brighter as they double.
              </p>
              <p>
                • <strong>Peak Scaling:</strong> Max launcher value scales with your peak field blob (<code className="text-cyan-300">2^(peak - 1)</code>).
              </p>
            </div>

            {/* Close Button */}
            <button
              onClick={() => setShowPoolModal(false)}
              className="mt-1 w-full py-2 bg-cyan-600 hover:bg-cyan-500 font-bold text-xs text-white rounded-xl transition shadow-lg"
            >
              Close & Continue Playing
            </button>
          </div>
        </div>
      )}
    </>
  );
};
