import { BlobData, GameStats } from '../types';
import { SpawnerPoolInfo } from './spawnerPool';

export type LogLevel = 'INFO' | 'WARN' | 'ERROR';

export interface LogEntry {
  id: string;
  timestamp: string;
  level: LogLevel;
  category: string;
  message: string;
  details?: Record<string, unknown>;
}

export interface RunSnapshot {
  fps: number;
  physicsStepMs: number;
  blobCount: number;
  maxFieldPower: number;
  maxFieldValue: number;
  minFieldPower: number;
  totalFieldMass: number;
  uniquePowersCount: number;
  activeMergeAnims: number;
  queuedPower: number;
  spawnerPoolRange: [number, number];
  score: number;
  highScore: number;
  comboMultiplier: number;
  blobsLaunched: number;
  maxDangerDistanceRatio: number;
  anomaliesDetectedCount: number;
}

export interface AnomalyReport {
  code: string;
  level: LogLevel;
  message: string;
  details?: Record<string, unknown>;
}

class TelemetryLogger {
  private logs: LogEntry[] = [];
  private maxLogs = 100;
  private listeners: Set<() => void> = new Set();
  private snapshotListeners: Set<(snapshot: RunSnapshot) => void> = new Set();

  private totalAnomaliesCount = 0;
  private currentSnapshot: RunSnapshot = {
    fps: 60,
    physicsStepMs: 0,
    blobCount: 0,
    maxFieldPower: 0,
    maxFieldValue: 1,
    minFieldPower: 0,
    totalFieldMass: 0,
    uniquePowersCount: 0,
    activeMergeAnims: 0,
    queuedPower: 0,
    spawnerPoolRange: [0, 3],
    score: 0,
    highScore: 0,
    comboMultiplier: 1,
    blobsLaunched: 0,
    maxDangerDistanceRatio: 0,
    anomaliesDetectedCount: 0,
  };

  public subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  public subscribeSnapshot(listener: (s: RunSnapshot) => void): () => void {
    this.snapshotListeners.add(listener);
    return () => this.snapshotListeners.delete(listener);
  }

  private notify(): void {
    this.listeners.forEach((fn) => fn());
  }

  private notifySnapshot(): void {
    this.snapshotListeners.forEach((fn) => fn(this.currentSnapshot));
  }

  public log(level: LogLevel, category: string, message: string, details?: Record<string, unknown>): void {
    const timeStr = new Date().toISOString().split('T')[1].slice(0, 8);
    const entry: LogEntry = {
      id: Math.random().toString(36).substring(2, 9),
      timestamp: timeStr,
      level,
      category,
      message,
      details,
    };

    if (level === 'ERROR' || level === 'WARN') {
      this.totalAnomaliesCount++;
      this.currentSnapshot.anomaliesDetectedCount = this.totalAnomaliesCount;
    }

    this.logs.unshift(entry);
    if (this.logs.length > this.maxLogs) {
      this.logs.pop();
    }

    // Mirror to native browser developer console
    const formatted = `[RunTelemetry][${level}][${category}] ${message}`;
    if (level === 'ERROR') {
      console.error(formatted, details || '');
    } else if (level === 'WARN') {
      console.warn(formatted, details || '');
    } else {
      console.info(formatted, details || '');
    }

    this.notify();
  }

  public getLogs(): LogEntry[] {
    return [...this.logs];
  }

  public clearLogs(): void {
    this.logs = [];
    this.totalAnomaliesCount = 0;
    this.currentSnapshot.anomaliesDetectedCount = 0;
    this.notify();
    this.notifySnapshot();
  }

  public updateSnapshot(snapshot: Partial<RunSnapshot>): void {
    this.currentSnapshot = {
      ...this.currentSnapshot,
      ...snapshot,
      anomaliesDetectedCount: this.totalAnomaliesCount,
    };
    this.notifySnapshot();
  }

  public getSnapshot(): RunSnapshot {
    return { ...this.currentSnapshot };
  }

  /**
   * Performs an inventory audit of runtime values and checks for clearly wrong physical & game state behaviors.
   */
  public auditRunIntegrity(
    blobs: BlobData[],
    canvasCenter: { x: number; y: number },
    canvasRadius: number,
    stats: GameStats,
    poolInfo?: SpawnerPoolInfo,
    queuedPower?: number
  ): AnomalyReport[] {
    const anomalies: AnomalyReport[] = [];
    const seenIds = new Set<string>();

    let maxDistFromCenter = 0;

    for (let i = 0; i < blobs.length; i++) {
      const b = blobs[i];

      // 1. NaN or Infinite physical coordinates/velocities
      if (!Number.isFinite(b.x) || !Number.isFinite(b.y) || !Number.isFinite(b.vx) || !Number.isFinite(b.vy)) {
        anomalies.push({
          code: 'ANOMALY_NaN_PHYSICS',
          level: 'ERROR',
          message: `Blob #${b.id} has non-finite coordinate or velocity (x:${b.x}, y:${b.y}, vx:${b.vx}, vy:${b.vy})`,
          details: { id: b.id, x: b.x, y: b.y, vx: b.vx, vy: b.vy },
        });
      }

      // 2. Duplicate ID check
      if (seenIds.has(b.id)) {
        anomalies.push({
          code: 'ANOMALY_DUPLICATE_ID',
          level: 'ERROR',
          message: `Duplicate blob ID detected on field: "${b.id}"`,
          details: { id: b.id },
        });
      } else {
        seenIds.add(b.id);
      }

      // 3. Physical boundaries check (out-of-bounds drift)
      const dist = Math.hypot(b.x - canvasCenter.x, b.y - canvasCenter.y);
      if (dist > maxDistFromCenter) maxDistFromCenter = dist;

      if (canvasRadius > 0 && dist > canvasRadius * 2.2) {
        anomalies.push({
          code: 'ANOMALY_OUT_OF_BOUNDS',
          level: 'WARN',
          message: `Blob #${b.id} drifted out of bounds (${Math.round(dist)}px from center, max allowed ${Math.round(canvasRadius * 2.2)}px)`,
          details: { id: b.id, dist, canvasRadius },
        });
      }

      // 4. Invalid Power value
      if (!Number.isInteger(b.power) || b.power < 0 || b.power > 30) {
        anomalies.push({
          code: 'ANOMALY_INVALID_POWER',
          level: 'ERROR',
          message: `Blob #${b.id} has invalid exponent power: ${b.power}`,
          details: { id: b.id, power: b.power },
        });
      }

      // 5. Zero or negative mass/radius
      if (!Number.isFinite(b.mass) || b.mass <= 0 || !Number.isFinite(b.radius) || b.radius <= 0) {
        anomalies.push({
          code: 'ANOMALY_INVALID_MASS_OR_RADIUS',
          level: 'ERROR',
          message: `Blob #${b.id} has invalid mass (${b.mass}) or radius (${b.radius})`,
          details: { id: b.id, mass: b.mass, radius: b.radius },
        });
      }

      // 6. Extreme speed spike
      const speed = Math.hypot(b.vx, b.vy);
      if (speed > 3500) {
        anomalies.push({
          code: 'ANOMALY_VELOCITY_SPIKE',
          level: 'WARN',
          message: `Blob #${b.id} velocity spike detected: ${Math.round(speed)} px/s`,
          details: { id: b.id, speed },
        });
      }

      // 7. Stuck or corrupted merge animation state
      if (b.mergeAnim) {
        if (!Number.isFinite(b.mergeAnim.progress) || b.mergeAnim.progress < 0 || b.mergeAnim.progress > 2.0) {
          anomalies.push({
            code: 'ANOMALY_CORRUPT_MERGE_ANIM',
            level: 'ERROR',
            message: `Blob #${b.id} has invalid merge animation progress: ${b.mergeAnim.progress}`,
            details: { id: b.id, progress: b.mergeAnim.progress },
          });
        }
      }
    }

    // 8. Launcher queue vs Spawner Pool bounds check
    if (poolInfo && queuedPower !== undefined) {
      if (queuedPower < poolInfo.minAllowedPower || queuedPower > poolInfo.maxAllowedPower) {
        anomalies.push({
          code: 'ANOMALY_POOL_BOUNDS_MISMATCH',
          level: 'WARN',
          message: `Queued launcher power (${queuedPower}) is outside active spawner pool bounds [${poolInfo.minAllowedPower}, ${poolInfo.maxAllowedPower}]`,
          details: { queuedPower, poolMin: poolInfo.minAllowedPower, poolMax: poolInfo.maxAllowedPower },
        });
      }
    }

    // 9. Negative score or high score check
    if (stats.score < 0 || stats.highScore < 0) {
      anomalies.push({
        code: 'ANOMALY_NEGATIVE_SCORE',
        level: 'ERROR',
        message: `Invalid negative score detected: score=${stats.score}, highScore=${stats.highScore}`,
        details: { score: stats.score, highScore: stats.highScore },
      });
    }

    // Log caught anomalies
    for (const anomaly of anomalies) {
      this.log(anomaly.level, 'ANOMALY', `[${anomaly.code}] ${anomaly.message}`, anomaly.details);
    }

    return anomalies;
  }
}

export const telemetryLogger = new TelemetryLogger();
