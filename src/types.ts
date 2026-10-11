export type GameMode = 'bonded' | 'unbonded';

export type RenderMode = 'flat';

export type GameStatus = 'idle' | 'playing' | 'paused' | 'gameover';

export interface Vector2D {
  x: number;
  y: number;
}

export interface QueuedBlob {
  power: number;
  group: number;
}

export interface BlobMergeAnim {
  startX: number;
  startY: number;
  targetX: number;
  targetY: number;
  progress: number; // 0.0 -> 1.0 (over mergeDurationSecs)
  isPrimary: boolean;
  targetPower: number;
  group?: number;
  mergedCount?: number;
  mergedValue?: number;
}

export interface BlobData {
  id: string;
  x: number;
  y: number;
  vx: number;
  vy: number;
  ax?: number;
  ay?: number;
  power: number; // power tier index k where value = 2 * 3^k (0 = 2, 1 = 6, 2 = 18, 3 = 54, 4 = 162, etc.)
  group: number; // 0 = Azure, 1 = Emerald, 2 = Crimson, 3 = Violet
  value: number; // 2 * 3^k
  radius: number;
  targetRadius: number;
  mass: number;
  bondedBlobIds?: string[]; // IDs of blobs currently bonded with this blob
  
  // Soft body / animation parameters
  squishX: number;
  squishY: number;
  rotation: number;
  wobblePhase: number;
  wobbleSpeed: number;
  
  // Visual state
  mergeFlash: number; // 0 to 1 decay timer for merge glow
  birthAnim: number;  // 0 to 1 spawn scale up
  
  // Merge animation state
  mergeAnim?: BlobMergeAnim;
}

export interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  radius: number;
  color: string;
  alpha: number;
  decay: number;
  power?: number;
}

export interface FloatingText {
  id: string;
  x: number;
  y: number;
  vy: number;
  text: string;
  color: string;
  fontSize: number;
  alpha: number;
  scale: number;
}

export interface Shockwave {
  x: number;
  y: number;
  radius: number;
  maxRadius: number;
  color: string;
  alpha: number;
  lineWidth: number;
}

export interface GameStats {
  score: number;
  highScore: number;
  maxPowerAchieved: number;
  totalMerges: number;
  maxCombo: number;
  novasTriggered: number;
  blobsLaunched: number;
}

export interface KeyColor {
  powerExponent: number; // e.g. 0 (1), 3 (8), 6 (64), 9 (512), 12 (4096), 15 (32768)
  hex: string;
  name: string;
}
