import React, { useState, useEffect } from 'react';
import { telemetryLogger, LogEntry, RunSnapshot } from '../utils/telemetryLogger';
import { formatBlobValue, trimTrailingZeroDecimals } from '../utils/colors';
import {
  Activity,
  AlertTriangle,
  CheckCircle2,
  Info,
  X,
  Trash2,
  RefreshCw,
  Gauge,
  Layers,
  ShieldCheck,
  Terminal,
} from 'lucide-react';

interface TelemetryInspectorModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const TelemetryInspectorModal: React.FC<TelemetryInspectorModalProps> = ({ isOpen, onClose }) => {
  const [snapshot, setSnapshot] = useState<RunSnapshot>(telemetryLogger.getSnapshot());
  const [logs, setLogs] = useState<LogEntry[]>(telemetryLogger.getLogs());
  const [filter, setFilter] = useState<'ALL' | 'INFO' | 'WARN' | 'ERROR'>('ALL');

  useEffect(() => {
    if (!isOpen) return;

    const unsubscribeLog = telemetryLogger.subscribe(() => {
      setLogs(telemetryLogger.getLogs());
    });

    const unsubscribeSnapshot = telemetryLogger.subscribeSnapshot((s) => {
      setSnapshot(s);
    });

    setLogs(telemetryLogger.getLogs());
    setSnapshot(telemetryLogger.getSnapshot());

    return () => {
      unsubscribeLog();
      unsubscribeSnapshot();
    };
  }, [isOpen]);

  if (!isOpen) return null;

  const filteredLogs = logs.filter((l) => (filter === 'ALL' ? true : l.level === filter));

  const errorCount = logs.filter((l) => l.level === 'ERROR').length;
  const warnCount = logs.filter((l) => l.level === 'WARN').length;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/85 backdrop-blur-md animate-fadeIn select-none">
      <div className="relative w-full max-w-3xl bg-zinc-900/95 border border-zinc-800 rounded-2xl p-5 shadow-2xl text-zinc-100 flex flex-col gap-4 max-h-[90vh]">
        {/* Modal Header */}
        <div className="flex items-center justify-between border-b border-zinc-800 pb-3">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-lg bg-zinc-800 border border-zinc-700 text-zinc-300">
              <Activity className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-base font-black text-white tracking-tight">Run Telemetry & Diagnostics Inspector</h3>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-zinc-800 text-zinc-300 border border-zinc-700">
                  Live Audit Log
                </span>
              </div>
              <p className="text-xs text-zinc-400">Inventory of active run metrics and anomaly diagnostics</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-zinc-400 hover:text-white hover:bg-zinc-800 transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Top: Basic Run Values Inventory Grid */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
          {/* Box 1: Performance */}
          <div className="bg-black/80 border border-zinc-800/80 p-3 rounded-xl flex flex-col gap-1">
            <span className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider flex items-center gap-1">
              <Gauge className="w-3 h-3 text-zinc-300" /> Engine Perf
            </span>
            <div className="flex items-baseline gap-2">
              <span className="text-lg font-black text-white">{snapshot.fps} <span className="text-xs font-normal text-zinc-400">FPS</span></span>
            </div>
            <span className="text-[10px] text-zinc-400">Step: {trimTrailingZeroDecimals(snapshot.physicsStepMs.toFixed(1))}ms</span>
          </div>

          {/* Box 2: Field Inventory */}
          <div className="bg-black/80 border border-zinc-800/80 p-3 rounded-xl flex flex-col gap-1">
            <span className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider flex items-center gap-1">
              <Layers className="w-3 h-3 text-emerald-400" /> Field Inventory
            </span>
            <div className="flex items-baseline gap-1.5">
              <span className="text-lg font-black text-white">{snapshot.blobCount}</span>
              <span className="text-xs text-zinc-400">blobs</span>
            </div>
            <span className="text-[10px] text-zinc-400">
              Peak: <strong className="text-emerald-400">{formatBlobValue(snapshot.maxFieldValue)}</strong> (P{snapshot.maxFieldPower})
            </span>
          </div>

          {/* Box 3: Spawner Pool */}
          <div className="bg-black/80 border border-zinc-800/80 p-3 rounded-xl flex flex-col gap-1">
            <span className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider flex items-center gap-1">
              <RefreshCw className="w-3 h-3 text-amber-400" /> Spawner Pool
            </span>
            <div className="text-sm font-bold text-amber-300">
              P{snapshot.spawnerPoolRange[0]} – P{snapshot.spawnerPoolRange[1]}
            </div>
            <span className="text-[10px] text-zinc-400">Queued Power: P{snapshot.queuedPower}</span>
          </div>

          {/* Box 4: Integrity Status */}
          <div className="bg-black/80 border border-zinc-800/80 p-3 rounded-xl flex flex-col gap-1">
            <span className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider flex items-center gap-1">
              <ShieldCheck className="w-3 h-3 text-rose-400" /> Integrity Status
            </span>
            <div className="flex items-center gap-1.5">
              {snapshot.anomaliesDetectedCount === 0 ? (
                <span className="text-xs font-bold text-emerald-400 flex items-center gap-1">
                  <CheckCircle2 className="w-3.5 h-3.5" /> Healthy
                </span>
              ) : (
                <span className="text-xs font-bold text-rose-400 flex items-center gap-1">
                  <AlertTriangle className="w-3.5 h-3.5" /> {snapshot.anomaliesDetectedCount} Anomaly{snapshot.anomaliesDetectedCount > 1 ? 'ies' : ''}
                </span>
              )}
            </div>
            <span className="text-[10px] text-zinc-400">
              {errorCount} errors / {warnCount} warnings
            </span>
          </div>
        </div>

        {/* Extended Metrics Strip */}
        <div className="bg-black/50 border border-zinc-800/50 p-2.5 rounded-xl text-xs flex flex-wrap items-center justify-between gap-3 text-zinc-300">
          <div>
            Total Mass: <strong className="text-white">{trimTrailingZeroDecimals(snapshot.totalFieldMass.toFixed(1))}</strong>
          </div>
          <div>
            Distinct Values: <strong className="text-white">{snapshot.uniquePowersCount}</strong>
          </div>
          <div>
            Active Merges: <strong className="text-white">{snapshot.activeMergeAnims}</strong>
          </div>
          <div>
            Score / Multiplier: <strong className="text-white">{snapshot.score}</strong> ({snapshot.comboMultiplier}x)
          </div>
          <div>
            Danger Ratio: <strong className={`${snapshot.maxDangerDistanceRatio > 0.85 ? 'text-rose-400 font-bold' : 'text-zinc-300'}`}>{(snapshot.maxDangerDistanceRatio * 100).toFixed(0)}%</strong>
          </div>
        </div>

        {/* Log Viewer Controls */}
        <div className="flex items-center justify-between pt-1">
          <div className="flex items-center gap-1">
            <span className="text-xs font-bold text-zinc-400 flex items-center gap-1 mr-2">
              <Terminal className="w-3.5 h-3.5" /> Filter Log:
            </span>
            {(['ALL', 'INFO', 'WARN', 'ERROR'] as const).map((lvl) => (
              <button
                key={lvl}
                onClick={() => setFilter(lvl)}
                className={`px-2.5 py-1 rounded-lg text-xs font-bold transition ${
                  filter === lvl
                    ? lvl === 'ERROR'
                      ? 'bg-rose-500 text-white'
                      : lvl === 'WARN'
                      ? 'bg-amber-500 text-white'
                      : 'bg-zinc-200 text-black'
                    : 'bg-zinc-800/80 text-zinc-400 hover:text-white'
                }`}
              >
                {lvl}
              </button>
            ))}
          </div>

          <button
            onClick={() => telemetryLogger.clearLogs()}
            className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-300 text-xs font-semibold transition"
          >
            <Trash2 className="w-3.5 h-3.5 text-zinc-400" /> Clear Logs
          </button>
        </div>

        {/* Log Output List */}
        <div className="flex-1 bg-black border border-zinc-800 rounded-xl p-3 overflow-y-auto font-mono text-xs flex flex-col gap-1.5 min-h-[220px] max-h-[300px]">
          {filteredLogs.length === 0 ? (
            <div className="text-zinc-500 italic text-center py-8">
              No log entries recorded for filter &quot;{filter}&quot;.
            </div>
          ) : (
            filteredLogs.map((log) => {
              const badgeColor =
                log.level === 'ERROR'
                  ? 'bg-rose-500/20 text-rose-400 border-rose-500/30'
                  : log.level === 'WARN'
                  ? 'bg-amber-500/20 text-amber-400 border-amber-500/30'
                  : 'bg-zinc-800 text-zinc-300 border-zinc-700';

              return (
                <div
                  key={log.id}
                  className="p-2 rounded bg-zinc-900/60 border border-zinc-800/60 flex flex-col gap-1 text-zinc-200"
                >
                  <div className="flex items-center justify-between text-[11px]">
                    <div className="flex items-center gap-2">
                      <span className="text-zinc-500 font-mono">{log.timestamp}</span>
                      <span className={`px-1.5 py-0.2 rounded text-[9px] font-bold border ${badgeColor}`}>
                        {log.level}
                      </span>
                      <span className="text-zinc-400 font-bold">[{log.category}]</span>
                    </div>
                  </div>
                  <div className="text-zinc-200 font-sans text-xs">{log.message}</div>
                  {log.details && Object.keys(log.details).length > 0 && (
                    <div className="text-[10px] text-zinc-400 font-mono bg-black p-1.5 rounded border border-zinc-800/80 overflow-x-auto">
                      {JSON.stringify(log.details)}
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>

        {/* Footer */}
        <div className="flex justify-end pt-1">
          <button
            onClick={onClose}
            className="px-4 py-2 bg-zinc-800 hover:bg-zinc-700 text-white font-bold text-xs rounded-xl transition"
          >
            Close Inspector
          </button>
        </div>
      </div>
    </div>
  );
};
