import { useState, useEffect, useCallback, useRef } from 'react';
import { GameMode, GameStats, QueuedBlob } from './types';
import { BlobCanvas } from './components/BlobCanvas';
import { GameUI } from './components/GameUI';
import { HowToPlayModal } from './components/HowToPlayModal';
import { StatsModal } from './components/StatsModal';
import { TelemetryInspectorModal } from './components/TelemetryInspectorModal';
import { ConfigTopBar } from './components/ConfigTopBar';
import { ConfigPauseList } from './components/ConfigPauseList';
import {
  ConfigMap,
  ConfigItem,
  DEFAULT_CONFIG,
  loadSavedConfig,
  saveConfigToStorage,
} from './config/gameConfig';
import {
  createInitialPoolQueue,
  replenishPoolQueue,
  calculateAllowedPowerPool,
  sanitizePoolQueue,
} from './utils/spawnerPool';
import { soundEngine } from './utils/audio';
import {
  SavedGameState,
  loadSavedGameState,
  saveGameState,
  clearSavedGameState,
  SerializedBlob,
} from './utils/gameStateStorage';
import { RotateCcw, Orbit, Play, Sparkles, Sliders, HelpCircle, BarChart3, Activity } from 'lucide-react';
import { trimTrailingZeroDecimals } from './utils/colors';

const HIGH_SCORE_KEY = 'gravity_blobs_high_score_v1';

export default function App() {
  // Load saved state from localStorage on initial render
  const savedStateRef = useRef<SavedGameState | null>(null);
  if (savedStateRef.current === null && typeof window !== 'undefined') {
    savedStateRef.current = loadSavedGameState();
  }
  const savedState = savedStateRef.current;

  // Game Stats
  const [stats, setStats] = useState<GameStats>(() => {
    let savedHighScore = 0;
    if (typeof window !== 'undefined') {
      const stored = localStorage.getItem(HIGH_SCORE_KEY);
      if (stored) savedHighScore = parseInt(stored, 10) || 0;
    }
    if (savedState?.stats) {
      return {
        ...savedState.stats,
        highScore: Math.max(savedHighScore, savedState.stats.highScore || 0),
      };
    }
    return {
      score: 0,
      highScore: savedHighScore,
      maxPowerAchieved: 0, // 2 * 3^0 = 2
      totalMerges: 0,
      maxCombo: 1,
      novasTriggered: 0,
      blobsLaunched: 0,
    };
  });

  // Settings & Controls
  const [mode, setMode] = useState<GameMode>(() => savedState?.mode || 'bonded');
  const [isPlaying, setIsPlaying] = useState<boolean>(true);
  const [isMuted, setIsMuted] = useState<boolean>(() => savedState?.isMuted ?? false);

  // Turn Multiplier state
  const [turnMultiplier, setTurnMultiplier] = useState<number>(() => savedState?.turnMultiplier || 1);

  // Game Over overlay state
  const [isGameOver, setIsGameOver] = useState<boolean>(() => savedState?.isGameOver || false);

  // Reset Trigger to force BlobCanvas to wipe & re-initialize cluster on Restart
  const [resetTrigger, setResetTrigger] = useState<number>(0);

  // Central Configuration State
  const [config, setConfig] = useState<ConfigMap>(() => loadSavedConfig());

  const handleUpdateConfig = useCallback((id: string, value: number | boolean) => {
    setConfig((prev) => {
      if (!prev[id]) return prev;
      const nextConfig = {
        ...prev,
        [id]: {
          ...prev[id],
          value,
        },
      };
      saveConfigToStorage(nextConfig);
      return nextConfig;
    });
  }, []);

  const handleToggleTopBarPin = useCallback((id: string, enabled: boolean) => {
    setConfig((prev) => {
      if (!prev[id]) return prev;
      const nextConfig = {
        ...prev,
        [id]: {
          ...prev[id],
          enabledInTopBar: enabled,
        },
      };
      saveConfigToStorage(nextConfig);
      return nextConfig;
    });
  }, []);

  const handleResetItem = useCallback((id: string) => {
    setConfig((prev) => {
      if (!prev[id]) return prev;
      const nextConfig = {
        ...prev,
        [id]: {
          ...prev[id],
          value: prev[id].defaultValue,
        },
      };
      saveConfigToStorage(nextConfig);
      return nextConfig;
    });
  }, []);

  const handleResetAll = useCallback(() => {
    setConfig(DEFAULT_CONFIG);
    saveConfigToStorage(DEFAULT_CONFIG);
  }, []);

  const handleEnableAllTopBar = useCallback((enable: boolean) => {
    setConfig((prev) => {
      const nextConfig: ConfigMap = {};
      for (const [key, item] of Object.entries(prev)) {
        nextConfig[key] = {
          ...(item as ConfigItem),
          enabledInTopBar: enable,
        };
      }
      saveConfigToStorage(nextConfig);
      return nextConfig;
    });
  }, []);

  // Derived config parameters
  const gravityStrength = (config.gravityStrength?.value as number) ?? 1.0;
  const poolGrowthInterval = (config.poolGrowthInterval?.value as number) ?? 2;
  const initialPoolSize = (config.initialPoolSize?.value as number) ?? 4;
  const numGroupings = (config.numGroupings?.value as number) ?? 4;
  const destroyOnExclusion = Boolean(config.destroyOnPoolExclusion?.value);
  const digitTint = (config.digitTint?.value as number) ?? 0.03;
  const enableDarkDigits = Boolean(config.enableDarkDigits?.value);
  const darkDigitThreshold = (config.darkDigitThreshold?.value as number) ?? 68;

  // Canvas State Metrics
  const [blobCount, setBlobCount] = useState<number>(12);
  const [maxBlobPower, setMaxBlobPower] = useState<number>(3);
  const [boardBlobs, setBoardBlobs] = useState<Array<{ power: number; group: number }>>([]);
  const boardSigRef = useRef<string>('');

  // Launcher Active & Next Drop Pool
  const [ballPool, setBallPool] = useState<QueuedBlob[]>(() => {
    if (savedState?.ballPool && savedState.ballPool.length >= 2) {
      return savedState.ballPool;
    }
    return createInitialPoolQueue(3, 2, poolGrowthInterval, initialPoolSize, numGroupings, [], destroyOnExclusion, mode);
  });

  // Active drop and next drop powers derived from ballPool
  const queuedBlob: QueuedBlob = ballPool[0] ?? { power: 0, group: 0 };
  const nextQueuedBlob: QueuedBlob = ballPool[1] ?? { power: 1, group: 1 };

  // Modals
  const [isHowToPlayOpen, setIsHowToPlayOpen] = useState<boolean>(false);
  const [isStatsOpen, setIsStatsOpen] = useState<boolean>(false);
  const [isTelemetryOpen, setIsTelemetryOpen] = useState<boolean>(false);

  // Sync mute state with sound engine
  useEffect(() => {
    soundEngine.setMuted(isMuted);
  }, [isMuted]);

  // Ref to hold current canvas blobs for persistence
  const lastBlobsRef = useRef<{ blobs: SerializedBlob[]; flyingBlob: SerializedBlob | null }>({
    blobs: savedState?.blobs || [],
    flyingBlob: savedState?.flyingBlob || null,
  });

  const handleSaveBlobs = useCallback((blobs: SerializedBlob[], flyingBlob: SerializedBlob | null) => {
    lastBlobsRef.current = { blobs, flyingBlob };
  }, []);

  // Save game state to browser localStorage on changes and window unload
  useEffect(() => {
    if (isGameOver) {
      clearSavedGameState();
      return;
    }

    saveGameState({
      version: 2,
      mode,
      isMuted,
      turnMultiplier,
      stats,
      ballPool,
      isGameOver,
      blobs: lastBlobsRef.current.blobs,
      flyingBlob: lastBlobsRef.current.flyingBlob,
    });
  }, [mode, isMuted, turnMultiplier, stats, ballPool, isGameOver]);

  useEffect(() => {
    const handleBeforeUnload = () => {
      if (!isGameOver) {
        saveGameState({
          version: 2,
          mode,
          isMuted,
          turnMultiplier,
          stats,
          ballPool,
          isGameOver,
          blobs: lastBlobsRef.current.blobs,
          flyingBlob: lastBlobsRef.current.flyingBlob,
        });
      }
    };
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [mode, isMuted, turnMultiplier, stats, ballPool, isGameOver]);

  // ESC key for pause toggle
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !isGameOver) {
        setIsPlaying((p) => !p);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isGameOver]);

  // Spawner Pool Info for HUD UI breakdown
  const spawnerPoolInfo = calculateAllowedPowerPool(
    maxBlobPower,
    poolGrowthInterval,
    initialPoolSize,
    boardBlobs,
    destroyOnExclusion,
    mode
  );

  // Auto-sanitize launcher ballPool whenever spawner parameters or board state updates so NO excluded value ever remains in launcher
  useEffect(() => {
    setBallPool((prevPool) =>
      sanitizePoolQueue(
        prevPool,
        maxBlobPower,
        poolGrowthInterval,
        initialPoolSize,
        numGroupings,
        boardBlobs,
        destroyOnExclusion,
        mode
      )
    );
  }, [maxBlobPower, boardBlobs, destroyOnExclusion, poolGrowthInterval, initialPoolSize, numGroupings, mode]);

  // Cycle queued powers upon firing launcher
  const handleLaunch = useCallback((currentBoardBlobs?: Array<{ power: number; group: number }>) => {
    setBallPool((prevPool) => {
      const activeBlobs = currentBoardBlobs ?? boardBlobs;
      const { updatedQueue } = replenishPoolQueue(
        prevPool,
        maxBlobPower,
        2,
        poolGrowthInterval,
        initialPoolSize,
        numGroupings,
        activeBlobs,
        destroyOnExclusion,
        mode
      );
      return updatedQueue;
    });

    setStats((prev) => ({
      ...prev,
      blobsLaunched: prev.blobsLaunched + 1,
    }));
  }, [maxBlobPower, poolGrowthInterval, initialPoolSize, numGroupings, boardBlobs, destroyOnExclusion, mode]);

  // Score & Merge Callback
  const handleScoreUpdate = useCallback((points: number, comboMultiplier: number) => {
    setStats((prev) => {
      const newScore = prev.score + points;
      const newHighScore = Math.max(prev.highScore, newScore);

      if (newHighScore > prev.highScore) {
        localStorage.setItem(HIGH_SCORE_KEY, newHighScore.toString());
      }

      return {
        ...prev,
        score: newScore,
        highScore: newHighScore,
        totalMerges: prev.totalMerges + 1,
        maxCombo: Math.max(prev.maxCombo, comboMultiplier),
      };
    });
  }, []);

  // Nova Trigger Callback (+2,000 pts bonus)
  const handleNovaTriggered = useCallback(() => {
    setStats((prev) => {
      const bonus = 2000;
      const newScore = prev.score + bonus;
      const newHighScore = Math.max(prev.highScore, newScore);

      if (newHighScore > prev.highScore) {
        localStorage.setItem(HIGH_SCORE_KEY, newHighScore.toString());
      }

      return {
        ...prev,
        score: newScore,
        highScore: newHighScore,
        novasTriggered: prev.novasTriggered + 1,
      };
    });
  }, []);

  // Stats Update from Canvas loop
  const handleStatsUpdate = useCallback(
    (count: number, maxP: number, currentBlobs?: Array<{ power: number; group: number }>) => {
      setBlobCount(count);
      setMaxBlobPower(maxP);

      if (currentBlobs) {
        const sig = currentBlobs.map((b) => `${b.power}:${b.group}`).sort().join(',');
        if (sig !== boardSigRef.current) {
          boardSigRef.current = sig;
          setBoardBlobs(currentBlobs);
        }
      }

      setStats((prev) => {
        if (maxP > prev.maxPowerAchieved) {
          return {
            ...prev,
            maxPowerAchieved: maxP,
          };
        }
        return prev;
      });
    },
    []
  );

  // Game Over
  const handleGameOver = useCallback(() => {
    setIsPlaying(false);
    setIsGameOver(true);
  }, []);

  // Restart
  const handleRestart = useCallback(() => {
    clearSavedGameState();
    lastBlobsRef.current = { blobs: [], flyingBlob: null };
    setStats((prev) => ({
      ...prev,
      score: 0,
      totalMerges: 0,
      maxCombo: 1,
      novasTriggered: 0,
      blobsLaunched: 0,
    }));
    setTurnMultiplier(1);
    boardSigRef.current = '';
    setBoardBlobs([]);
    setBallPool(
      createInitialPoolQueue(3, 2, poolGrowthInterval, initialPoolSize, numGroupings, [], destroyOnExclusion, mode)
    );
    setIsGameOver(false);
    setIsPlaying(true);
    setResetTrigger((prev) => prev + 1);
  }, [poolGrowthInterval, initialPoolSize, numGroupings, destroyOnExclusion, mode]);

  // Mute Toggle
  const handleToggleMute = useCallback(() => {
    setIsMuted((prev) => {
      const next = !prev;
      soundEngine.setMuted(next);
      return next;
    });
  }, []);

  return (
    <div className="h-screen h-[100dvh] w-full bg-black text-zinc-100 font-sans p-0 sm:p-2 flex flex-col items-center justify-center overflow-hidden select-none">
      {/* MAIN GAME CONTAINER - FULL CANVAS WITH FLOATING HUD */}
      <main className="relative w-full h-full flex-1 flex flex-col min-h-0 sm:rounded-2xl overflow-hidden border border-zinc-900 bg-black shadow-2xl">
        {/* Sleek Floating Top Game HUD */}
        <GameUI
          stats={stats}
          turnMultiplier={turnMultiplier}
          queuedBlob={queuedBlob}
          nextQueuedBlob={nextQueuedBlob}
          ballPool={ballPool}
          spawnerPoolInfo={spawnerPoolInfo}
          destroyOnPoolExclusion={destroyOnExclusion}
          digitTint={digitTint}
          enableDarkDigits={enableDarkDigits}
          darkDigitThreshold={darkDigitThreshold}
          mode={mode}
          isPlaying={isPlaying}
          isMuted={isMuted}
          onTogglePlay={() => setIsPlaying((p) => !p)}
          onRestart={handleRestart}
          onToggleMute={handleToggleMute}
          onOpenTelemetry={() => setIsTelemetryOpen(true)}
        />

        {/* 2D Canvas Playfield - Full view fill */}
        <div className="relative w-full h-full flex-1 min-h-0">
          <ConfigTopBar
            config={config}
            onUpdateConfig={handleUpdateConfig}
            onToggleTopBarPin={handleToggleTopBarPin}
            onResetItem={handleResetItem}
          />

          <BlobCanvas
            mode={mode}
            isPlaying={isPlaying}
            gravityStrength={gravityStrength}
            config={config}
            queuedBlob={queuedBlob}
            nextQueuedBlob={nextQueuedBlob}
            onLaunch={handleLaunch}
            onScoreUpdate={handleScoreUpdate}
            onNovaTriggered={handleNovaTriggered}
            onGameOver={handleGameOver}
            onStatsUpdate={handleStatsUpdate}
            turnMultiplier={turnMultiplier}
            setTurnMultiplier={setTurnMultiplier}
            stats={stats}
            spawnerPoolInfo={spawnerPoolInfo}
            resetTrigger={resetTrigger}
            initialBlobs={savedState?.blobs}
            initialFlyingBlob={savedState?.flyingBlob}
            onSaveBlobs={handleSaveBlobs}
          />

          {/* Pause & Settings Overlay */}
          {!isPlaying && !isGameOver && (
            <div className="absolute inset-0 bg-black/85 backdrop-blur-md z-30 flex flex-col items-center justify-center p-4 overflow-y-auto animate-fade-in">
              <div className="bg-zinc-900/95 border border-zinc-800 rounded-2xl p-4 sm:p-6 w-full max-w-xl shadow-2xl flex flex-col gap-4 text-center my-auto">
                <div className="flex flex-col items-center gap-1">
                  <div className="p-2.5 rounded-full bg-zinc-800 border border-zinc-700 text-zinc-200 shadow-xl">
                    <Orbit className="w-7 h-7 animate-spin-slow" />
                  </div>
                  <h3 className="text-xl font-black text-white tracking-tight mt-1">GAME SETTINGS</h3>
                  <p className="text-xs text-zinc-400">Game Modes • Aesthetics • Controls • Custom Config</p>
                </div>

                {/* Game Physics Mode Selection */}
                <div className="flex flex-col gap-1.5 text-left bg-black/80 border border-zinc-800 p-2.5 rounded-xl">
                  <span className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider flex items-center gap-1.5">
                    <Sparkles className="w-3.5 h-3.5 text-zinc-300" /> Game Mode
                  </span>
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      onClick={() => {
                        setMode('bonded');
                        handleRestart();
                      }}
                      className={`p-2.5 rounded-xl text-xs font-bold transition flex flex-col items-center gap-0.5 border ${
                        mode === 'bonded'
                          ? 'bg-amber-500/20 text-amber-200 border-amber-500/50 shadow'
                          : 'bg-zinc-950 text-zinc-400 border-zinc-800 hover:text-white'
                      }`}
                    >
                      <span className="font-extrabold text-sm">Bonded (3x)</span>
                      <span className="text-[10px] font-normal text-zinc-400">2 blobs bond, 3rd triggers merge</span>
                    </button>
                    <button
                      onClick={() => {
                        setMode('unbonded');
                        handleRestart();
                      }}
                      className={`p-2.5 rounded-xl text-xs font-bold transition flex flex-col items-center gap-0.5 border ${
                        mode === 'unbonded'
                          ? 'bg-cyan-500/20 text-cyan-200 border-cyan-500/50 shadow'
                          : 'bg-zinc-950 text-zinc-400 border-zinc-800 hover:text-white'
                      }`}
                    >
                      <span className="font-extrabold text-sm">Unbonded (2x)</span>
                      <span className="text-[10px] font-normal text-zinc-400">Classic rules: 2 blobs combine directly</span>
                    </button>
                  </div>
                </div>

                {/* Config System Checklist & Controls */}
                <ConfigPauseList
                  config={config}
                  onUpdateConfig={handleUpdateConfig}
                  onToggleTopBarPin={handleToggleTopBarPin}
                  onResetItem={handleResetItem}
                  onResetAll={handleResetAll}
                  onEnableAllTopBar={handleEnableAllTopBar}
                />

                {/* Info Modals Quick Trigger Buttons */}
                <div className="grid grid-cols-3 gap-2">
                  <button
                    onClick={() => setIsHowToPlayOpen(true)}
                    className="p-2 rounded-xl bg-black/80 hover:bg-zinc-800 border border-zinc-800 text-zinc-300 text-xs font-bold transition flex items-center justify-center gap-1.5"
                  >
                    <HelpCircle className="w-3.5 h-3.5 text-amber-400" /> Help
                  </button>
                  <button
                    onClick={() => setIsStatsOpen(true)}
                    className="p-2 rounded-xl bg-black/80 hover:bg-zinc-800 border border-zinc-800 text-zinc-300 text-xs font-bold transition flex items-center justify-center gap-1.5"
                  >
                    <BarChart3 className="w-3.5 h-3.5 text-violet-400" /> Stats
                  </button>
                  <button
                    onClick={() => setIsTelemetryOpen(true)}
                    className="p-2 rounded-xl bg-black/80 hover:bg-zinc-800 border border-zinc-800 text-zinc-300 text-xs font-bold transition flex items-center justify-center gap-1.5"
                  >
                    <Activity className="w-3.5 h-3.5 text-emerald-400" /> Telemetry
                  </button>
                </div>

                {/* Primary Action Buttons */}
                <div className="flex items-center gap-2 pt-1">
                  <button
                    onClick={() => setIsPlaying(true)}
                    className="flex-1 py-2.5 rounded-xl bg-zinc-100 hover:bg-white text-black font-black text-sm tracking-wide transition shadow-lg flex items-center justify-center gap-2"
                  >
                    <Play className="w-4 h-4 fill-black" /> Resume Game
                  </button>
                  <button
                    onClick={handleRestart}
                    className="p-2.5 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-zinc-200 transition border border-zinc-700 shadow"
                    title="Restart Game"
                  >
                    <RotateCcw className="w-4 h-4" />
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Game Over Modal Overlay */}
          {isGameOver && (
            <div className="absolute inset-0 bg-black/90 backdrop-blur-md z-40 flex flex-col items-center justify-center p-6 text-center animate-fade-in">
              <div className="p-4 rounded-full bg-rose-500/10 border border-rose-500/30 text-rose-400 mb-3 shadow-2xl">
                <Orbit className="w-12 h-12" />
              </div>
              <h3 className="text-3xl font-black text-white mb-1 tracking-tight">
                GRAVITY OVERFLOW!
              </h3>
              <p className="text-sm text-zinc-400 mb-6 max-w-sm">
                The central cluster expanded beyond the danger threshold for too long.
              </p>

              <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4 w-full max-w-xs flex flex-col gap-2 mb-6">
                <div className="flex justify-between items-center text-xs text-zinc-400">
                  <span>Final Score:</span>
                  <span className="font-extrabold text-white text-lg">
                    {stats.score.toLocaleString()}
                  </span>
                </div>
                <div className="flex justify-between items-center text-xs text-zinc-400">
                  <span>Best High Score:</span>
                  <span className="font-extrabold text-amber-300">
                    {stats.highScore.toLocaleString()}
                  </span>
                </div>
                <div className="flex justify-between items-center text-xs text-zinc-400">
                  <span>Total Merges:</span>
                  <span className="font-bold text-zinc-100">{stats.totalMerges}</span>
                </div>
              </div>

              <button
                onClick={handleRestart}
                className="px-8 py-3 rounded-xl bg-zinc-100 hover:bg-white text-black font-black text-sm tracking-wide transition shadow-lg flex items-center gap-2"
              >
                <RotateCcw className="w-4 h-4" /> Play Again
              </button>
            </div>
          )}
        </div>
      </main>

      {/* MODALS */}
      <HowToPlayModal
        isOpen={isHowToPlayOpen}
        onClose={() => setIsHowToPlayOpen(false)}
      />

      <StatsModal
        isOpen={isStatsOpen}
        onClose={() => setIsStatsOpen(false)}
        stats={stats}
        mode={mode}
      />

      <TelemetryInspectorModal
        isOpen={isTelemetryOpen}
        onClose={() => setIsTelemetryOpen(false)}
      />
    </div>
  );
}
