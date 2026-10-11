import React, { useEffect, useRef, useState, useCallback } from 'react';
import {
  BlobData,
  Vector2D,
  GameMode,
  RenderMode,
  Particle,
  Shockwave,
  FloatingText,
  GameStats,
  QueuedBlob,
} from '../types';
import {
  updatePhysics,
  createBlob,
  triggerSupernova,
  getCenterOfMass,
  getAttractorWells,
  DANGER_RING_RATIO,
} from '../utils/physics';
import { ConfigMap } from '../config/gameConfig';
import { getBlobColor, formatBlobValue, trimTrailingZeroDecimals } from '../utils/colors';
import { soundEngine } from '../utils/audio';
import { SpawnerPoolInfo, calculateAllowedPowerPool, getBlobValueForMode } from '../utils/spawnerPool';
import { SerializedBlob } from '../utils/gameStateStorage';
import { telemetryLogger } from '../utils/telemetryLogger';

interface BlobCanvasProps {
  mode: GameMode;
  isPlaying: boolean;
  isSlowMotion?: boolean;
  gravityStrength: number;
  config?: ConfigMap;
  queuedBlob: QueuedBlob;
  nextQueuedBlob: QueuedBlob;
  onLaunch: (boardBlobs?: Array<{ power: number; group: number }>) => void;
  onScoreUpdate: (points: number, combo: number) => void;
  onNovaTriggered: () => void;
  onGameOver: () => void;
  onStatsUpdate: (blobCount: number, maxPower: number, boardBlobs?: Array<{ power: number; group: number }>) => void;
  turnMultiplier: number;
  setTurnMultiplier: React.Dispatch<React.SetStateAction<number>>;
  stats?: GameStats;
  spawnerPoolInfo?: SpawnerPoolInfo;
  resetTrigger?: number;
  initialBlobs?: SerializedBlob[];
  initialFlyingBlob?: SerializedBlob | null;
  onSaveBlobs?: (blobs: SerializedBlob[], flyingBlob: SerializedBlob | null) => void;
}

export const BlobCanvas: React.FC<BlobCanvasProps> = ({
  mode,
  isPlaying,
  isSlowMotion = false,
  gravityStrength,
  config,
  queuedBlob,
  nextQueuedBlob,
  onLaunch,
  onScoreUpdate,
  onNovaTriggered,
  onGameOver,
  onStatsUpdate,
  turnMultiplier,
  setTurnMultiplier,
  stats,
  spawnerPoolInfo,
  resetTrigger,
  initialBlobs,
  initialFlyingBlob,
  onSaveBlobs,
}) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);

  const frameCountRef = useRef<number>(0);

  // Config ref for loop access
  const configRef = useRef<ConfigMap | undefined>(config);
  useEffect(() => {
    configRef.current = config;
  }, [config]);

  // Launcher state
  const launcherAngleRef = useRef<number>(-Math.PI / 2); // Default pointing top to center
  const [launcherAngle, setLauncherAngle] = useState<number>(-Math.PI / 2);
  const isAimingRef = useRef<boolean>(false);

  // Physics entities refs (for high 60fps performance without React re-renders overhead)
  const blobsRef = useRef<BlobData[]>([]);
  const particlesRef = useRef<Particle[]>([]);
  const shockwavesRef = useRef<Shockwave[]>([]);
  const floatingTextsRef = useRef<FloatingText[]>([]);
  const flyingBlobRef = useRef<BlobData | null>(null);

  // Center & Dimensions ref
  const centerRef = useRef<Vector2D>({ x: 400, y: 400 });
  const radiusRef = useRef<number>(300);
  const dangerTimerRef = useRef<number>(0);

  // Combo state
  const comboRef = useRef<{ value: number; lastMergeTime: number }>({
    value: 1,
    lastMergeTime: 0,
  });

  // Track if initial cluster initialized
  const initializedRef = useRef<boolean>(false);

  // Initialize central cluster of random power-of-two blobs or restore from state
  const initCluster = useCallback((restoredBlobs?: SerializedBlob[], restoredFlying?: SerializedBlob | null) => {
    const center = centerRef.current;
    const baseBlobSize = (configRef.current?.baseBlobSize?.value as number) ?? 20;

    if (restoredBlobs && restoredBlobs.length > 0) {
      const initialBlobs: BlobData[] = restoredBlobs.map((sb) => {
        const px = center.x + sb.relX;
        const py = center.y + sb.relY;
        const b = createBlob(px, py, sb.power, sb.group, sb.vx, sb.vy, baseBlobSize, mode);
        b.id = sb.id;
        if (sb.bondedBlobIds && sb.bondedBlobIds.length > 0) {
          b.bondedBlobIds = sb.bondedBlobIds;
        }
        return b;
      });
      blobsRef.current = initialBlobs;

      if (restoredFlying) {
        const fbX = center.x + restoredFlying.relX;
        const fbY = center.y + restoredFlying.relY;
        const fb = createBlob(fbX, fbY, restoredFlying.power, restoredFlying.group, restoredFlying.vx, restoredFlying.vy, baseBlobSize, mode);
        fb.id = restoredFlying.id;
        flyingBlobRef.current = fb;
      } else {
        flyingBlobRef.current = null;
      }
    } else {
      const initialBlobs: BlobData[] = [];
      const count = 10 + Math.floor(Math.random() * 4); // 10-13 initial central blobs

      for (let i = 0; i < count; i++) {
        const angle = (i / count) * Math.PI * 2 + (Math.random() - 0.5) * 0.4;
        const dist = 20 + Math.random() * 80;
        const px = center.x + Math.cos(angle) * dist;
        const py = center.y + Math.sin(angle) * dist;

        // Random power exponent 0..3 (values 1, 2, 4, 8)
        const power = Math.floor(Math.random() * 4);
        const numGroupings = (configRef.current?.numGroupings?.value as number) ?? 4;
        const group = Math.floor(Math.random() * numGroupings);
        const b = createBlob(
          px,
          py,
          power,
          group,
          0,
          0,
          baseBlobSize,
          mode
        );
        
        // Give tiny initial tangential swirl velocity
        b.vx = -Math.sin(angle) * (0.3 + Math.random() * 0.5);
        b.vy = Math.cos(angle) * (0.3 + Math.random() * 0.5);
        initialBlobs.push(b);
      }

      blobsRef.current = initialBlobs;
      flyingBlobRef.current = null;
    }

    particlesRef.current = [];
    shockwavesRef.current = [];
    floatingTextsRef.current = [];
    dangerTimerRef.current = 0;
    comboRef.current = { value: 1, lastMergeTime: 0 };
    setTurnMultiplier(1);
    initializedRef.current = true;
  }, [mode, setTurnMultiplier]);

  // Restart trigger effect
  const prevResetTriggerRef = useRef<number | undefined>(resetTrigger);
  useEffect(() => {
    if (prevResetTriggerRef.current !== resetTrigger) {
      prevResetTriggerRef.current = resetTrigger;
      initCluster(); // fresh restart!
    }
  }, [resetTrigger, initCluster]);

  // Handle Launch Action
  const handleFire = useCallback(() => {
    if (!isPlaying || flyingBlobRef.current !== null) return;

    const center = centerRef.current;
    const launcherRadius = radiusRef.current * 0.9;
    const angle = launcherAngleRef.current;

    const baseBlobSize = (configRef.current?.baseBlobSize?.value as number) ?? 20;
    const launchImpulse = (configRef.current?.launchImpulse?.value as number) ?? 1.0;

    // Start position at launcher perimeter
    const lx = center.x + Math.cos(angle) * launcherRadius;
    const ly = center.y + Math.sin(angle) * launcherRadius;

    // Aim velocity towards center with speed
    const launchSpeed = 8.5 * launchImpulse;
    const vx = -Math.cos(angle) * launchSpeed;
    const vy = -Math.sin(angle) * launchSpeed;

    const firedBlob = createBlob(
      lx,
      ly,
      queuedBlob.power,
      queuedBlob.group,
      vx,
      vy,
      baseBlobSize,
      mode
    );
    // Align rotation along velocity vector and squish elongated in flight direction
    firedBlob.rotation = Math.atan2(vy, vx);
    firedBlob.squishX = 1.38;
    firedBlob.squishY = 0.72;
    flyingBlobRef.current = firedBlob;

    soundEngine.playShoot();
    const dtTint = (configRef.current?.digitTint?.value as number) ?? 0.03;
    telemetryLogger.log(
      'INFO',
      'LAUNCH',
      `Launched ${getBlobColor(queuedBlob.power, queuedBlob.group, dtTint, mode).groupInfo.name} projectile exponent power ${queuedBlob.power} (value ${getBlobValueForMode(queuedBlob.power, mode)})`
    );
    onLaunch(blobsRef.current.map((b) => ({ power: b.power, group: b.group })));
  }, [isPlaying, queuedBlob, onLaunch, mode]);

  // Handle Pointer Movement for 360° launcher rotation
  const handlePointerMove = useCallback((e: React.PointerEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const rect = canvas.getBoundingClientRect();
    const px = e.clientX - rect.left;
    const py = e.clientY - rect.top;

    // Viewport center is rect.width / 2, rect.height / 2
    const dx = px - rect.width / 2;
    const dy = py - rect.height / 2;

    const newAngle = Math.atan2(dy, dx);
    launcherAngleRef.current = newAngle;
    setLauncherAngle(newAngle);
  }, []);

  // Handle Pointer Down to start aiming
  const handlePointerDown = useCallback(
    (e: React.PointerEvent<HTMLCanvasElement>) => {
      isAimingRef.current = true;
      handlePointerMove(e);
      try {
        e.currentTarget.setPointerCapture(e.pointerId);
      } catch (_err) {
        // ignore fallback
      }
    },
    [handlePointerMove]
  );

  // Handle Pointer Up to Fire on Release
  const handlePointerUp = useCallback(
    (e: React.PointerEvent<HTMLCanvasElement>) => {
      if (isAimingRef.current) {
        handlePointerMove(e);
        isAimingRef.current = false;
        try {
          if (e.currentTarget.hasPointerCapture(e.pointerId)) {
            e.currentTarget.releasePointerCapture(e.pointerId);
          }
        } catch (_err) {
          // ignore fallback
        }
        handleFire();
      }
    },
    [handlePointerMove, handleFire]
  );

  // Handle Pointer Cancel
  const handlePointerCancel = useCallback(() => {
    isAimingRef.current = false;
  }, []);

  // Handle Keyboard Spacebar to Fire
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.code === 'Space') {
        e.preventDefault();
        handleFire();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleFire]);

  // Canvas Resize Observer
  useEffect(() => {
    const container = containerRef.current;
    const canvas = canvasRef.current;
    if (!container || !canvas) return;

    const resizeObserver = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const { width, height } = entry.contentRect;
        const dpr = window.devicePixelRatio || 1;

        canvas.width = width * dpr;
        canvas.height = height * dpr;
        canvas.style.width = `${width}px`;
        canvas.style.height = `${height}px`;

        const ctx = canvas.getContext('2d');
        if (ctx) {
          ctx.scale(dpr, dpr);
        }

        const size = Math.min(width, height);
        const newCenter = { x: width / 2, y: height / 2 };
        const oldCenter = centerRef.current;

        if (initializedRef.current && (oldCenter.x !== newCenter.x || oldCenter.y !== newCenter.y)) {
          const dx = newCenter.x - oldCenter.x;
          const dy = newCenter.y - oldCenter.y;
          for (const b of blobsRef.current) {
            b.x += dx;
            b.y += dy;
          }
        }

        centerRef.current = newCenter;
        radiusRef.current = size / 2;

        if (!initializedRef.current) {
          initCluster(initialBlobs, initialFlyingBlob);
        }
      }
    });

    resizeObserver.observe(container);
    return () => resizeObserver.disconnect();
  }, [initCluster, initialBlobs, initialFlyingBlob]);

  // Reset when isPlaying or Mode changes
  useEffect(() => {
    if (isPlaying && !initializedRef.current) {
      initCluster(initialBlobs, initialFlyingBlob);
    }
  }, [isPlaying, initCluster, initialBlobs, initialFlyingBlob]);

  // MAIN ANIMATION / PHYSICS LOOP
  useEffect(() => {
    let animationFrameId: number;
    let lastTime = performance.now();

    const render = (time: number) => {
      const dt = Math.min(32, time - lastTime) / 1000;
      lastTime = time;

      const canvas = canvasRef.current;
      if (!canvas) return;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      const width = canvas.width / (window.devicePixelRatio || 1);
      const height = canvas.height / (window.devicePixelRatio || 1);
      const center = centerRef.current;
      const maxRadius = radiusRef.current;

      // ----------------------------------------------------
      // 1. UPDATE PHYSICS (if playing)
      // ----------------------------------------------------
      if (isPlaying) {
        const blobs = blobsRef.current;
        const particles = particlesRef.current;
        const shockwaves = shockwavesRef.current;
        const floatingTexts = floatingTextsRef.current;

        // Smoothly update view anchor to track emergent Center of Mass
        const viewportCenter = { x: width / 2, y: height / 2 };
        const targetCoM = getCenterOfMass(blobs, viewportCenter);

        const cameraLerp = 1 - Math.pow(1 - 0.08, dt * 60);
        centerRef.current.x += (targetCoM.x - centerRef.current.x) * cameraLerp;
        centerRef.current.y += (targetCoM.y - centerRef.current.y) * cameraLerp;

        // Flying projectile integration
        if (flyingBlobRef.current) {
          const fb = flyingBlobRef.current;
          const subStep = dt / 0.016;
          fb.x += fb.vx * subStep;
          fb.y += fb.vy * subStep;

          // Check if flying blob hits any central blob or reaches center area
          let hit = false;
          for (const target of blobs) {
            const dx = target.x - fb.x;
            const dy = target.y - fb.y;
            const distSq = dx * dx + dy * dy;
            const minDist = fb.radius + target.radius;
            if (distSq <= minDist * minDist) {
              hit = true;
              break;
            }
          }

          const distToCenter = Math.hypot(fb.x - center.x, fb.y - center.y);
          if (hit || distToCenter < 35) {
            blobs.push(fb);
            flyingBlobRef.current = null;
          }
        }

        // Step physics simulation with timing metric
        const physicsStart = performance.now();
        const physicsResult = updatePhysics(
          blobs,
          center,
          gravityStrength,
          mode,
          comboRef.current,
          isSlowMotion,
          configRef.current,
          dt
        );
        const stepTimeMs = performance.now() - physicsStart;

        comboRef.current = physicsResult.newCombo;

        // Process physics events (side effects: sounds, particles, score callbacks, telemetry)
        for (const evt of physicsResult.events) {
          if (evt.type === 'merge') {
            const points = evt.mergedValue * evt.combo;
            onScoreUpdate(points, evt.combo);
            setTurnMultiplier(evt.combo);

            soundEngine.playMerge(evt.newPower, evt.combo);

            const colorInfo = getBlobColor(evt.newPower, evt.group ?? 0);
            const isMultiMerge = (evt.mergedCount ?? 2) > 2;
            const extraScale = isMultiMerge ? 1.5 : 1.0;

            telemetryLogger.log(
              'INFO',
              'MERGE',
              `${isMultiMerge ? `${evt.mergedCount}-Way Merge!` : 'Blob Merge'} Created value ${evt.mergedValue} (Power ${evt.newPower}) (+${points} pts, ${evt.combo}x combo)`,
              { newPower: evt.newPower, mergedValue: evt.mergedValue, combo: evt.combo, count: evt.mergedCount }
            );

            spawnMergeParticles(
              evt.x,
              evt.y,
              colorInfo.hex,
              particles,
              Math.floor(evt.combo * extraScale)
            );

            shockwaves.push({
              x: evt.x,
              y: evt.y,
              radius: 16,
              maxRadius: (56 + evt.combo * 5) * extraScale,
              color: colorInfo.hex,
              alpha: 0.85,
              lineWidth: 3 + Math.min(8, evt.combo + (isMultiMerge ? 3 : 0)),
            });

            let textStr = `+${formatBlobValue(evt.mergedValue)}`;
            if (isMultiMerge) {
              textStr = `+${formatBlobValue(evt.mergedValue * evt.combo)} (${evt.mergedCount}-WAY MERGE!)`;
            } else if (evt.combo > 1) {
              textStr = `+${formatBlobValue(evt.mergedValue * evt.combo)} (${evt.combo}x!)`;
            }

            floatingTexts.push({
              id: 'ft_' + Math.random(),
              x: evt.x,
              y: evt.y - 10,
              vy: -1.2,
              text: textStr,
              color: isMultiMerge ? '#fef08a' : colorInfo.lightHex,
              fontSize: isMultiMerge ? 24 : evt.combo > 1 ? 22 : 18,
              alpha: 1,
              scale: isMultiMerge ? 1.4 : 1.2,
            });
          } else if (evt.type === 'bond') {
            soundEngine.playBond();
            const colorInfo = getBlobColor(evt.power, evt.group ?? 0);
            telemetryLogger.log(
              'INFO',
              'BOND',
              `Bond formed between identical blobs (Power ${evt.power})`,
              { power: evt.power, group: evt.group }
            );

            floatingTexts.push({
              id: 'ft_' + Math.random(),
              x: evt.x,
              y: evt.y - 12,
              vy: -0.8,
              text: 'BONDED!',
              color: colorInfo.lightHex,
              fontSize: 15,
              alpha: 1,
              scale: 1.1,
            });
          } else if (evt.type === 'collision') {
            soundEngine.playCollision(evt.impact);
          }
        }

        // Check NOVA RESPAWN condition: "getting down to one spawns a bunch of new random blobs"
        if (blobs.length === 1 && flyingBlobRef.current === null) {
          const survivor = blobs[0];
          const { newBlobs, power, group } = triggerSupernova(center, survivor, blobs, mode);
          blobsRef.current = newBlobs;

          soundEngine.playNova();

          telemetryLogger.log(
            'INFO',
            'SUPERNOVA',
            `Gravity Nova triggered! Field reset around survivor value ${getBlobValueForMode(survivor.power, mode)}`
          );

          const colorInfo = getBlobColor(power, group);
          shockwaves.push({
            x: center.x,
            y: center.y,
            radius: 10,
            maxRadius: 280,
            color: '#38bdf8',
            alpha: 1,
            lineWidth: 8,
          });

          shockwaves.push({
            x: center.x,
            y: center.y,
            radius: 10,
            maxRadius: 220,
            color: colorInfo.hex,
            alpha: 0.9,
            lineWidth: 5,
          });

          for (let i = 0; i < 60; i++) {
            const angle = Math.random() * Math.PI * 2;
            const speed = 2 + Math.random() * 7;
            particles.push({
              x: center.x,
              y: center.y,
              vx: Math.cos(angle) * speed,
              vy: Math.sin(angle) * speed,
              radius: 3 + Math.random() * 4,
              color: Math.random() > 0.5 ? '#f43f5e' : '#38bdf8',
              alpha: 1,
              decay: 0.015 + Math.random() * 0.01,
            });
          }

          floatingTexts.push({
            id: 'nova_' + Math.random(),
            x: center.x,
            y: center.y - 40,
            vy: -1.5,
            text: 'GRAVITY NOVA! +2,000 BONUS',
            color: '#facc15',
            fontSize: 26,
            alpha: 1,
            scale: 1.4,
          });

          onNovaTriggered();
        }

        // Danger ring check (Classic mode game over)
        if (mode === 'classic') {
          const dangerRadius = maxRadius * DANGER_RING_RATIO;
          let isDanger = false;
          for (const b of blobs) {
            const dist = Math.hypot(b.x - center.x, b.y - center.y);
            if (dist > dangerRadius) {
              isDanger = true;
              break;
            }
          }

          if (isDanger) {
            dangerTimerRef.current += dt;
            if (dangerTimerRef.current > 6.5) {
              soundEngine.playGameOver();
              onGameOver();
            }
          } else {
            dangerTimerRef.current = Math.max(0, dangerTimerRef.current - dt * 2.5);
          }
        }

        // Check if destroyOnPoolExclusion mode is active
        const destroyOnExcl = config?.destroyOnPoolExclusion?.value === true;
        if (destroyOnExcl && blobs.length > 0) {
          let currentMaxP = 0;
          for (const b of blobs) {
            if (b.power > currentMaxP) currentMaxP = b.power;
          }
          const poolInterval = (config?.poolGrowthInterval?.value as number) ?? 2;
          const poolStartSize = (config?.initialPoolSize?.value as number) ?? 4;
          const currentPoolInfo = calculateAllowedPowerPool(currentMaxP, poolInterval, poolStartSize, [], true, mode);
          const minP = currentPoolInfo.minAllowedPower;

          if (minP > 0) {
            const remainingBlobs: BlobData[] = [];
            for (const b of blobs) {
              if (b.power < minP) {
                // Destroy this blob on the field!
                const digitTint = (configRef.current?.digitTint?.value as number) ?? 0.03;
                const cInfo = getBlobColor(b.power, b.group, digitTint);
                spawnMergeParticles(b.x, b.y, cInfo.hex, particlesRef.current, 1);
                floatingTextsRef.current.push({
                  id: 'excl_' + Math.random(),
                  x: b.x,
                  y: b.y,
                  vy: -1.2,
                  text: `EXCLUDED (${formatBlobValue(b.value)})`,
                  color: '#f87171',
                  fontSize: 16,
                  alpha: 1,
                  scale: 1,
                });
                soundEngine.playCollision(1.5);
                telemetryLogger.log(
                  'INFO',
                  'POOL',
                  `Destroyed power ${b.power} (val ${b.value}) on field due to min pool threshold ${minP}`
                );
              } else {
                remainingBlobs.push(b);
              }
            }
            if (remainingBlobs.length !== blobs.length) {
              blobsRef.current = remainingBlobs;
            }
          }
        }

        // Stats update
        let maxP = 0;
        for (const b of blobsRef.current) {
          if (b.power > maxP) maxP = b.power;
        }
        onStatsUpdate(
          blobsRef.current.length,
          maxP,
          blobsRef.current.map((b) => ({ power: b.power, group: b.group }))
        );

        // Periodic state persistence to browser storage
        if (onSaveBlobs && frameCountRef.current % 30 === 0 && centerRef.current) {
          const center = centerRef.current;
          const serialized: SerializedBlob[] = blobsRef.current.map((b) => ({
            id: b.id,
            relX: b.x - center.x,
            relY: b.y - center.y,
            vx: b.vx,
            vy: b.vy,
            power: b.power,
            group: b.group,
            bondedBlobIds: b.bondedBlobIds || [],
          }));

          const serializedFlying: SerializedBlob | null = flyingBlobRef.current
            ? {
                id: flyingBlobRef.current.id,
                relX: flyingBlobRef.current.x - center.x,
                relY: flyingBlobRef.current.y - center.y,
                vx: flyingBlobRef.current.vx,
                vy: flyingBlobRef.current.vy,
                power: flyingBlobRef.current.power,
                group: flyingBlobRef.current.group,
              }
            : null;

          onSaveBlobs(serialized, serializedFlying);
        }

        // Telemetry periodic inventory update & integrity audit
        frameCountRef.current++;
        if (frameCountRef.current % 15 === 0) {
          const fps = dt > 0 ? Math.round(1 / dt) : 60;
          const powers = blobs.map((b) => b.power);
          const maxPower = powers.length > 0 ? Math.max(...powers) : 0;
          const minPower = powers.length > 0 ? Math.min(...powers) : 0;
          const maxVal = getBlobValueForMode(maxPower, mode);
          const totalMass = blobs.reduce((s, b) => s + b.mass, 0);
          const uniquePowers = new Set(powers).size;
          const activeMergeAnims = blobs.filter((b) => b.mergeAnim).length;

          let maxDist = 0;
          for (const b of blobs) {
            const d = Math.hypot(b.x - center.x, b.y - center.y);
            if (d > maxDist) maxDist = d;
          }
          const dangerRatio = maxRadius > 0 ? maxDist / (maxRadius * DANGER_RING_RATIO) : 0;

          telemetryLogger.updateSnapshot({
            fps,
            physicsStepMs: stepTimeMs,
            blobCount: blobs.length,
            maxFieldPower: maxPower,
            maxFieldValue: maxVal,
            minFieldPower: minPower,
            totalFieldMass: totalMass,
            uniquePowersCount: uniquePowers,
            activeMergeAnims,
            queuedPower: queuedBlob.power,
            spawnerPoolRange: spawnerPoolInfo
              ? [spawnerPoolInfo.minAllowedPower, spawnerPoolInfo.maxAllowedPower]
              : [0, 3],
            score: stats?.score ?? 0,
            highScore: stats?.highScore ?? 0,
            comboMultiplier: comboRef.current.value,
            blobsLaunched: stats?.blobsLaunched ?? 0,
            maxDangerDistanceRatio: dangerRatio,
          });
        }

        if (frameCountRef.current % 60 === 0 && stats) {
          telemetryLogger.auditRunIntegrity(
            blobs,
            center,
            maxRadius,
            stats,
            spawnerPoolInfo,
            queuedBlob.power
          );
        }

        // Update Particles
        for (let i = particles.length - 1; i >= 0; i--) {
          const p = particles[i];
          p.x += p.vx;
          p.y += p.vy;
          p.alpha -= p.decay;
          if (p.alpha <= 0) particles.splice(i, 1);
        }

        // Update Shockwaves
        for (let i = shockwaves.length - 1; i >= 0; i--) {
          const sw = shockwaves[i];
          sw.radius += (sw.maxRadius - sw.radius) * 0.12 + 1;
          sw.alpha -= 0.035;
          if (sw.alpha <= 0 || sw.radius >= sw.maxRadius) {
            shockwaves.splice(i, 1);
          }
        }

        // Update Floating Texts
        for (let i = floatingTexts.length - 1; i >= 0; i--) {
          const ft = floatingTexts[i];
          ft.y += ft.vy;
          ft.alpha -= 0.018;
          ft.scale = Math.max(1, ft.scale - 0.01);
          if (ft.alpha <= 0) floatingTexts.splice(i, 1);
        }
      }

      // ----------------------------------------------------
      // 2. CANVAS DRAWING / RENDERING
      // ----------------------------------------------------
      ctx.clearRect(0, 0, width, height);

      // Background Radial Gradient
      const bgGrad = ctx.createRadialGradient(
        width / 2,
        height / 2,
        10,
        width / 2,
        height / 2,
        maxRadius * 1.2
      );
      bgGrad.addColorStop(0, '#18181b'); // Zinc 900
      bgGrad.addColorStop(0.6, '#09090b'); // Zinc 950
      bgGrad.addColorStop(1, '#000000'); // Pure Black
      ctx.fillStyle = bgGrad;
      ctx.fillRect(0, 0, width, height);

      // Camera view translation: keep centerRef.current (Center of Mass) aligned to viewport center
      ctx.save();
      const viewOffsetX = width / 2 - center.x;
      const viewOffsetY = height / 2 - center.y;
      ctx.translate(viewOffsetX, viewOffsetY);

      // Apply Cluster View Scale Zoom transform centered at cluster center
      const clusterScale = (configRef.current?.clusterSizeRatio?.value as number) ?? 0.94;
      ctx.translate(center.x, center.y);
      ctx.scale(clusterScale, clusterScale);
      ctx.translate(-center.x, -center.y);

      // Subtle Background Gravity Grid / Concentric Rings
      ctx.lineWidth = 1;
      for (let r = 50; r < maxRadius * 0.95; r += 60) {
        ctx.beginPath();
        ctx.arc(center.x, center.y, r, 0, Math.PI * 2);
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.05)'; // Dark subtle grey grid
        ctx.stroke();
      }

      // Central Gravity Core / Event Horizon Glow
      const coreGrad = ctx.createRadialGradient(
        center.x,
        center.y,
        0,
        center.x,
        center.y,
        35
      );
      coreGrad.addColorStop(0, 'rgba(255, 255, 255, 0.12)'); // Neutral core glow
      coreGrad.addColorStop(0.5, 'rgba(161, 161, 170, 0.05)');
      coreGrad.addColorStop(1, 'rgba(0, 0, 0, 0)');
      ctx.fillStyle = coreGrad;
      ctx.beginPath();
      ctx.arc(center.x, center.y, 45, 0, Math.PI * 2);
      ctx.fill();

      // Attractor Wells / Harmonic Traps Visual Indicators
      const showAttractors = (configRef.current?.showAttractorVisuals?.value as boolean) ?? true;
      if (showAttractors) {
        const wells = getAttractorWells(center, configRef.current);
        const pulse = (Math.sin(time * 0.004) + 1) * 0.5;
        for (let idx = 0; idx < wells.length; idx++) {
          const w = wells[idx];
          // Harmonic well ambient gradient aura
          const wellGrad = ctx.createRadialGradient(w.x, w.y, 0, w.x, w.y, 40);
          wellGrad.addColorStop(0, 'rgba(255, 255, 255, 0.12)');
          wellGrad.addColorStop(0.5, 'rgba(255, 255, 255, 0.04)');
          wellGrad.addColorStop(1, 'rgba(0, 0, 0, 0)');
          ctx.fillStyle = wellGrad;
          ctx.beginPath();
          ctx.arc(w.x, w.y, 40, 0, Math.PI * 2);
          ctx.fill();

          // Pulsing focal trap ring
          ctx.beginPath();
          ctx.arc(w.x, w.y, 14 + pulse * 4, 0, Math.PI * 2);
          ctx.strokeStyle = 'rgba(255, 255, 255, 0.25)';
          ctx.setLineDash([3, 3]);
          ctx.lineWidth = 1.2;
          ctx.stroke();
          ctx.setLineDash([]);

          // Center pulsar dot
          ctx.beginPath();
          ctx.arc(w.x, w.y, 3, 0, Math.PI * 2);
          ctx.fillStyle = '#e4e4e7';
          ctx.fill();
        }
      }

      // Danger Ring Boundary (Classic mode)
      const dangerRadius = maxRadius * DANGER_RING_RATIO;
      ctx.beginPath();
      ctx.arc(center.x, center.y, dangerRadius, 0, Math.PI * 2);
      const isDangerActive = dangerTimerRef.current > 0;
      if (isDangerActive) {
        const pulse = (Math.sin(time * 0.01) + 1) * 0.5;
        ctx.strokeStyle = `rgba(244, 63, 94, ${0.4 + pulse * 0.5})`; // Rose 500
        ctx.lineWidth = 3;
      } else {
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.12)'; // Sleek neutral border
        ctx.setLineDash([6, 6]);
        ctx.lineWidth = 1.5;
      }
      ctx.stroke();
      ctx.setLineDash([]); // Reset line dash

      // 360° Launcher Outer Ring Track
      const digitTint = (configRef.current?.digitTint?.value as number) ?? 0.03;
      const launcherRadius = maxRadius * 0.9;
      ctx.beginPath();
      ctx.arc(center.x, center.y, launcherRadius, 0, Math.PI * 2);
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.15)';
      ctx.lineWidth = 2;
      ctx.stroke();

      // Launcher Node Position & Trajectory Line
      const currAngle = launcherAngleRef.current;
      const dirX = Math.cos(currAngle);
      const dirY = Math.sin(currAngle);

      // Primary loaded blob position on launcher ring
      const lx = center.x + dirX * launcherRadius;
      const ly = center.y + dirY * launcherRadius;

      // Next blob preview position directly behind loaded blob (further outward along radial line)
      const nextOffset = 38; // 38px behind loaded blob center
      const nextLx = center.x + dirX * (launcherRadius + nextOffset);
      const nextLy = center.y + dirY * (launcherRadius + nextOffset);

      // Trajectory Aim Line
      ctx.beginPath();
      ctx.moveTo(lx, ly);
      ctx.lineTo(center.x, center.y);
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.3)';
      ctx.lineWidth = 1.8;
      ctx.setLineDash([4, 6]);
      ctx.stroke();
      ctx.setLineDash([]);

      // Draw Dual-Chamber Launcher Pod Body (Enclosing loaded blob chamber and next blob chamber)
      ctx.save();
      ctx.translate(lx, ly);
      ctx.rotate(currAngle);

      ctx.beginPath();
      ctx.arc(0, 0, 22, Math.PI * 0.5, Math.PI * 1.5);
      ctx.arc(nextOffset, 0, 16, Math.PI * 1.5, Math.PI * 0.5);
      ctx.closePath();
      ctx.fillStyle = 'rgba(18, 18, 18, 0.95)';
      ctx.strokeStyle = '#a1a1aa';
      ctx.lineWidth = 2.2;
      ctx.fill();
      ctx.stroke();

      // Small directional feed arrows inside housing between chambers (pointing from next chamber into loaded chamber)
      ctx.beginPath();
      ctx.moveTo(nextOffset - 8, -4);
      ctx.lineTo(nextOffset - 14, 0);
      ctx.lineTo(nextOffset - 8, 4);
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.5)';
      ctx.lineWidth = 1.5;
      ctx.stroke();

      ctx.restore();

      const nowSec = time * 0.001;

      const digitScale = (configRef.current?.digitScale?.value as number) ?? 0.67;
      const enableDarkDigits = (configRef.current?.enableDarkDigits?.value as boolean) ?? false;
      const darkDigitThreshold = (configRef.current?.darkDigitThreshold?.value as number) ?? 68;

      // Draw Next Queue Preview Blob directly behind loaded blob
      drawBlobEntity(
        ctx,
        {
          id: 'next_preview',
          x: nextLx,
          y: nextLy,
          vx: 0,
          vy: 0,
          power: nextQueuedBlob.power,
          group: nextQueuedBlob.group,
          value: getBlobValueForMode(nextQueuedBlob.power, mode),
          radius: 13.5,
          targetRadius: 13.5,
          mass: 1,
          squishX: 1,
          squishY: 1,
          rotation: 0,
          wobblePhase: time * 0.002,
          wobbleSpeed: 0,
          mergeFlash: 0,
          birthAnim: 1,
        },
        digitTint,
        false,
        nowSec,
        mode,
        digitScale,
        enableDarkDigits,
        darkDigitThreshold
      );

      // Draw Launcher Queued Preview Blob inside primary launcher chamber
      if (flyingBlobRef.current === null) {
        drawBlobEntity(
          ctx,
          {
            id: 'staged_preview',
            x: lx,
            y: ly,
            vx: 0,
            vy: 0,
            power: queuedBlob.power,
            group: queuedBlob.group,
            value: getBlobValueForMode(queuedBlob.power, mode),
            radius: 18,
            targetRadius: 18,
            mass: 1,
            squishX: 1,
            squishY: 1,
            rotation: 0,
            wobblePhase: time * 0.002,
            wobbleSpeed: 0,
            mergeFlash: 0,
            birthAnim: 1,
          },
          digitTint,
          false,
          nowSec,
          mode,
          digitScale,
          enableDarkDigits,
          darkDigitThreshold
        );
      }

      // Draw Blobs & Gooey Liquid Bridges
      const activeBlobs = [...blobsRef.current];
      if (flyingBlobRef.current) {
        activeBlobs.push(flyingBlobRef.current);
      }

      // 1. Draw Liquid Bridges & Glowing Bond Tethers
      const drawnPairs = new Set<string>();
      for (let i = 0; i < activeBlobs.length; i++) {
        const b1 = activeBlobs[i];
        for (let j = i + 1; j < activeBlobs.length; j++) {
          const b2 = activeBlobs[j];

          // Check if b1 and b2 should form a liquid bridge or energy bond
          const isBonded = Boolean(b1.bondedBlobIds?.includes(b2.id));
          const isMergingPair = Boolean(b1.mergeAnim || b2.mergeAnim);
          const isSamePowerAndGroupTouch = b1.power === b2.power && b1.group === b2.group;

          if (isBonded || isMergingPair || isSamePowerAndGroupTouch) {
            const dx = b2.x - b1.x;
            const dy = b2.y - b1.y;
            const dist = Math.hypot(dx, dy);

            const maxDist = (b1.radius + b2.radius) * 1.8;
            if (dist < maxDist && dist > 0.5) {
              const pairKey = [b1.id, b2.id].sort().join(':');
              if (!drawnPairs.has(pairKey)) {
                drawnPairs.add(pairKey);
                const colorDetails = getBlobColor(b1.power, b1.group, digitTint, mode);
                drawLiquidBridge(
                  ctx,
                  b1.x,
                  b1.y,
                  b1.radius,
                  b2.x,
                  b2.y,
                  b2.radius,
                  colorDetails.hex,
                  colorDetails.hex
                );
              }
            }
          }
        }
      }

      // Calculate max power among board blobs for glimmer effect on largest value(s)
      let maxBoardPower = -1;
      for (const b of blobsRef.current) {
        if (b.power > maxBoardPower) maxBoardPower = b.power;
      }

      // 2. Draw Blob Entities
      if (flyingBlobRef.current) {
        drawBlobEntity(ctx, flyingBlobRef.current, digitTint, false, nowSec, mode, digitScale, enableDarkDigits, darkDigitThreshold);
      }
      for (const b of blobsRef.current) {
        const isLargest = maxBoardPower >= 0 && b.power === maxBoardPower;
        drawBlobEntity(ctx, b, digitTint, isLargest, nowSec, mode, digitScale, enableDarkDigits, darkDigitThreshold);
      }

      // 3. Draw Emerging Merged Number overlay at target midpoint during merge animation
      const processedMergeCenters = new Set<string>();
      for (const b of blobsRef.current) {
        if (b.mergeAnim && b.mergeAnim.progress > 0.25) {
          const key = `${b.mergeAnim.targetX.toFixed(1)}:${b.mergeAnim.targetY.toFixed(1)}`;
          if (!processedMergeCenters.has(key)) {
            processedMergeCenters.add(key);

            const p = b.mergeAnim.progress;
            const fadeAlpha = Math.min(1, (p - 0.25) / 0.75);
            const scale = 0.5 + fadeAlpha * 0.5;

            const nextPower = b.mergeAnim.targetPower ?? (b.power + 1);
            const nextVal = b.mergeAnim.mergedValue ?? getBlobValueForMode(nextPower, mode);
            const valStr = formatBlobValue(nextVal);

            ctx.save();
            ctx.translate(b.mergeAnim.targetX, b.mergeAnim.targetY);
            ctx.scale(scale, scale);
            ctx.globalAlpha = fadeAlpha;

            ctx.fillStyle = getBlobColor(nextPower, b.group, digitTint, mode, enableDarkDigits, darkDigitThreshold).digitHex;
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';

            let fontSize = Math.max(14, Math.min(46, b.radius * 1.28)) * digitScale;
            if (valStr.length > 3) fontSize *= 0.82;

            ctx.font = `800 ${fontSize}px "Plus Jakarta Sans", system-ui, sans-serif`;
            ctx.fillText(valStr, 0, 0);
            ctx.restore();
          }
        }
      }

      // Draw Shockwaves
      for (const sw of shockwavesRef.current) {
        ctx.beginPath();
        ctx.arc(sw.x, sw.y, sw.radius, 0, Math.PI * 2);
        ctx.strokeStyle = sw.color;
        ctx.globalAlpha = sw.alpha;
        ctx.lineWidth = sw.lineWidth;
        ctx.stroke();
        ctx.globalAlpha = 1;
      }

      // Draw Particles
      for (const p of particlesRef.current) {
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.radius, 0, Math.PI * 2);
        ctx.fillStyle = p.color;
        ctx.globalAlpha = p.alpha;
        ctx.fill();
        ctx.globalAlpha = 1;
      }

      // Draw Floating Texts
      for (const ft of floatingTextsRef.current) {
        ctx.save();
        ctx.globalAlpha = ft.alpha;
        ctx.font = `900 ${ft.fontSize * ft.scale}px "Plus Jakarta Sans", system-ui, sans-serif`;
        ctx.fillStyle = ft.color;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.shadowColor = '#000';
        ctx.shadowBlur = 6;
        ctx.fillText(ft.text, ft.x, ft.y);
        ctx.restore();
      }

      // Danger Warning Progress Overlay Text
      if (isDangerActive) {
        const warnSecs = trimTrailingZeroDecimals(Math.max(0, 3.2 - dangerTimerRef.current).toFixed(1));
        ctx.save();
        ctx.font = '800 16px "Plus Jakarta Sans", sans-serif';
        ctx.fillStyle = '#f43f5e';
        ctx.textAlign = 'center';
        ctx.fillText(`⚠️ GRAVITY OVERFLOW IN ${warnSecs}s`, center.x, center.y + dangerRadius + 22);
        ctx.restore();
      }

      ctx.restore(); // Restore camera view translation

      animationFrameId = requestAnimationFrame(render);
    };

    animationFrameId = requestAnimationFrame(render);
    return () => cancelAnimationFrame(animationFrameId);
  }, [
    isPlaying,
    mode,
    gravityStrength,
    queuedBlob,
    nextQueuedBlob,
    onScoreUpdate,
    onNovaTriggered,
    onGameOver,
    onStatsUpdate,
    setTurnMultiplier,
  ]);

  return (
    <div
      ref={containerRef}
      className="relative w-full h-full flex items-center justify-center overflow-hidden rounded-2xl bg-slate-950 select-none"
    >
      {/* Canvas Layer */}
      <canvas
        ref={canvasRef}
        onPointerMove={handlePointerMove}
        onPointerDown={handlePointerDown}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerCancel}
        className="w-full h-full cursor-crosshair touch-none"
      />

      {/* Touch/Mouse 360° Launcher Direction Hint Overlay */}
      <div className="absolute bottom-3 left-1/2 -translate-x-1/2 pointer-events-none px-3 py-1 rounded-full bg-slate-900/80 backdrop-blur border border-slate-800 text-[11px] text-slate-400 font-medium tracking-wide flex items-center gap-2 shadow-lg">
        <span className="w-2 h-2 rounded-full bg-cyan-400 animate-ping"></span>
        <span>Aim 360° around perimeter • Release to Launch</span>
      </div>
    </div>
  );
};

/**
 * Render a single blob entity with soft organic wobble, radial gradient & power label
 */
function drawBlobEntity(
  ctx: CanvasRenderingContext2D,
  b: BlobData,
  digitTint: number = 0.03,
  isLargest: boolean = false,
  nowSec: number = 0,
  mode: GameMode = 'bonded',
  digitScale: number = 0.67,
  enableDarkDigits: boolean = false,
  darkDigitThreshold: number = 68
) {
  const colorInfo = getBlobColor(b.power, b.group, digitTint, mode, enableDarkDigits, darkDigitThreshold);
  const r = b.radius * (b.birthAnim || 1);

  ctx.save();
  ctx.translate(b.x, b.y);

  ctx.shadowBlur = 0;
  ctx.shadowColor = 'transparent';

  ctx.beginPath();
  ctx.arc(0, 0, r, 0, Math.PI * 2);
  ctx.fillStyle = colorInfo.hex;
  ctx.fill();

  // Shimmering Light Sweep for Largest Value(s)
  if (isLargest) {
    ctx.save();
    ctx.beginPath();
    ctx.arc(0, 0, r, 0, Math.PI * 2);
    ctx.clip();

    const sweepCycle = (nowSec % 2.2) / 2.2; // 0 to 1
    const sweepX = -r * 2.5 + sweepCycle * (r * 5);

    const sweepGrad = ctx.createLinearGradient(sweepX - r * 0.35, -r, sweepX + r * 0.35, r);
    sweepGrad.addColorStop(0, 'rgba(255, 255, 255, 0)');
    sweepGrad.addColorStop(0.45, 'rgba(255, 255, 255, 0.45)');
    sweepGrad.addColorStop(0.55, 'rgba(255, 255, 255, 0.7)');
    sweepGrad.addColorStop(1, 'rgba(255, 255, 255, 0)');

    ctx.fillStyle = sweepGrad;
    ctx.fillRect(-r * 1.5, -r * 1.5, r * 3, r * 3);
    ctx.restore();
  }

  const digitAlpha = b.mergeAnim ? Math.max(0, 1 - b.mergeAnim.progress * 1.8) : 1;
  if (digitAlpha > 0.01) {
    ctx.save();
    ctx.globalAlpha = digitAlpha;
    ctx.fillStyle = colorInfo.digitHex;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    if (isLargest) {
      ctx.shadowColor = '#facc15';
      ctx.shadowBlur = 10;
    }

    const valStr = formatBlobValue(b.value);
    let fontSize = Math.max(12, Math.min(44, r * 1.24)) * digitScale;
    if (valStr.length > 3) fontSize *= 0.82;

    ctx.font = `700 ${fontSize}px "Plus Jakarta Sans", system-ui, sans-serif`;
    ctx.fillText(valStr, 0, 0);
    ctx.restore();
  }

  // Twinkling Glint Starbursts for Largest Value(s)
  if (isLargest) {
    const drawGlint = (gx: number, gy: number, gSize: number, rot: number, alpha: number) => {
      if (alpha <= 0.02) return;
      ctx.save();
      ctx.translate(gx, gy);
      ctx.rotate(rot);
      ctx.globalAlpha = alpha;
      ctx.fillStyle = '#ffffff';
      ctx.shadowColor = '#fef08a';
      ctx.shadowBlur = 8;

      ctx.beginPath();
      for (let i = 0; i < 8; i++) {
        const a = (i * Math.PI) / 4;
        const rad = i % 2 === 0 ? gSize : gSize * 0.22;
        const sx = Math.cos(a) * rad;
        const sy = Math.sin(a) * rad;
        if (i === 0) ctx.moveTo(sx, sy);
        else ctx.lineTo(sx, sy);
      }
      ctx.closePath();
      ctx.fill();
      ctx.restore();
    };

    const s1Alpha = Math.max(0, Math.sin(nowSec * 5));
    if (s1Alpha > 0.02) {
      drawGlint(r * 0.55, -r * 0.55, r * 0.35, nowSec * 2.2, s1Alpha);
    }

    const s2Alpha = Math.max(0, Math.sin(nowSec * 5 + Math.PI));
    if (s2Alpha > 0.02) {
      drawGlint(-r * 0.6, r * 0.45, r * 0.28, -nowSec * 1.8, s2Alpha);
    }
  }

  ctx.restore();
}

/**
 * Helper to spawn particle burst on merge
 */
function spawnMergeParticles(
  x: number,
  y: number,
  color: string,
  particles: Particle[],
  comboValue: number
) {
  const count = Math.min(30, 12 + comboValue * 4);
  for (let i = 0; i < count; i++) {
    const angle = Math.random() * Math.PI * 2;
    const speed = 1.5 + Math.random() * (3.5 + comboValue * 0.5);
    particles.push({
      x,
      y,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed,
      radius: 2 + Math.random() * 3.5,
      color,
      alpha: 1,
      decay: 0.02 + Math.random() * 0.02,
    });
  }
}

/**
 * Draws a smooth gooey liquid metaball bridge between two circular blobs
 */
function drawLiquidBridge(
  ctx: CanvasRenderingContext2D,
  x1: number,
  y1: number,
  r1: number,
  x2: number,
  y2: number,
  r2: number,
  color1: string,
  color2: string
) {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const dist = Math.hypot(dx, dy);

  const maxBridgeDist = (r1 + r2) * 1.35;
  const minDist = Math.abs(r1 - r2) + 0.1;
  if (dist >= maxBridgeDist || dist <= minDist) return;

  // Normalized closeness [0, 1]
  const u = Math.max(0, Math.min(1, (maxBridgeDist - dist) / (maxBridgeDist - minDist)));

  const angle = Math.atan2(dy, dx);

  // Spread angle on circle perimeter: opens up smoothly as distance decreases
  const spread = 0.48 + u * 0.52;

  // Tangent attachment points on Circle 1
  const p1aX = x1 + Math.cos(angle + spread) * r1;
  const p1aY = y1 + Math.sin(angle + spread) * r1;
  const p1bX = x1 + Math.cos(angle - spread) * r1;
  const p1bY = y1 + Math.sin(angle - spread) * r1;

  // Tangent attachment points on Circle 2
  const p2aX = x2 + Math.cos(angle + Math.PI - spread) * r2;
  const p2aY = y2 + Math.sin(angle + Math.PI - spread) * r2;
  const p2bX = x2 + Math.cos(angle + Math.PI + spread) * r2;
  const p2bY = y2 + Math.sin(angle + Math.PI + spread) * r2;

  // Center midpoint between blob centers
  const midX = (x1 + x2) / 2;
  const midY = (y1 + y2) / 2;

  // Straight line midpoints for Side A and Side B
  const mAx = (p1aX + p2aX) / 2;
  const mAy = (p1aY + p2aY) / 2;
  const mBx = (p1bX + p2bX) / 2;
  const mBy = (p1bY + p2bY) / 2;

  // Pinch factor pulls control points towards center line (0.7 -> 0 as u: 0 -> 1)
  const pinch = (1 - u) * 0.7;

  const ctrlAx = mAx + (midX - mAx) * pinch;
  const ctrlAy = mAy + (midY - mAy) * pinch;

  const ctrlBx = mBx + (midX - mBx) * pinch;
  const ctrlBy = mBy + (midY - mBy) * pinch;

  ctx.save();
  ctx.beginPath();
  ctx.moveTo(p1aX, p1aY);
  ctx.quadraticCurveTo(ctrlAx, ctrlAy, p2aX, p2aY);
  ctx.lineTo(p2bX, p2bY);
  ctx.quadraticCurveTo(ctrlBx, ctrlBy, p1bX, p1bY);
  ctx.closePath();

  // Linear color gradient across bridge
  const bridgeGrad = ctx.createLinearGradient(x1, y1, x2, y2);
  bridgeGrad.addColorStop(0, color1);
  bridgeGrad.addColorStop(1, color2);

  ctx.fillStyle = bridgeGrad;
  ctx.fill();
  ctx.restore();
}

