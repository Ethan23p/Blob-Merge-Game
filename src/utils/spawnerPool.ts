import { QueuedBlob, GameMode } from '../types';

export interface SpawnerPoolInfo {
  maxFieldPower: number;
  minAllowedPower: number;
  maxAllowedPower: number;
  poolSize: number;
  allowedPowers: number[];
  allowedValues: number[];
  excludedValues: number[];
  growthInterval: number;
  initialPoolSize: number;
  retainedPowerGroups?: Array<{ power: number; group: number; value: number }>;
}

export function getBlobValueForMode(power: number, mode: GameMode | string = 'bonded'): number {
  if (mode === 'unbonded') {
    return 2 * Math.pow(2, power);
  }
  return 2 * Math.pow(3, power);
}

export function calculateAllowedPowerPool(
  maxFieldPower: number,
  growthInterval: number = 2,
  initialPoolSize: number = 4,
  boardBlobs?: Array<{ power: number; group: number }>,
  destroyOnExclusion: boolean = false,
  mode: GameMode | string = 'bonded'
): SpawnerPoolInfo {
  // Baseline peak is power 3
  const basePower = 3;
  const peaksAboveBase = Math.max(0, maxFieldPower - basePower);

  // Target pool size grows by 1 every K peaks
  const targetPoolSize = Math.max(
    initialPoolSize,
    initialPoolSize + Math.floor(peaksAboveBase / Math.max(1, growthInterval))
  );

  // Max allowed power in launcher is maxFieldPower - 1 (min 3)
  const maxAllowedPower = Math.max(basePower, maxFieldPower - 1);

  // Min allowed power shifts up as maxAllowedPower grows, unless pool size expanded
  const minAllowedPower = Math.max(0, maxAllowedPower - targetPoolSize + 1);

  const baselineAllowedPowers: number[] = [];
  for (let p = minAllowedPower; p <= maxAllowedPower; p++) {
    baselineAllowedPowers.push(p);
  }

  // Track retained power-groups (values < minAllowedPower that are still present on the board)
  const retainedPowerGroups: Array<{ power: number; group: number; value: number }> = [];
  const retainedPowersSet = new Set<number>();

  if (!destroyOnExclusion && boardBlobs && boardBlobs.length > 0) {
    const seenPG = new Set<string>();
    for (const b of boardBlobs) {
      if (b.power < minAllowedPower) {
        const key = `${b.power}:${b.group}`;
        if (!seenPG.has(key)) {
          seenPG.add(key);
          retainedPowerGroups.push({
            power: b.power,
            group: b.group,
            value: getBlobValueForMode(b.power, mode),
          });
          retainedPowersSet.add(b.power);
        }
      }
    }
  }

  const allAllowedPowersSet = new Set<number>([...baselineAllowedPowers, ...retainedPowersSet]);
  const allowedPowers = Array.from(allAllowedPowersSet).sort((a, b) => a - b);
  const allowedValues = allowedPowers.map((p) => getBlobValueForMode(p, mode));

  const excludedValues: number[] = [];
  for (let p = 0; p < minAllowedPower; p++) {
    if (!retainedPowersSet.has(p)) {
      excludedValues.push(getBlobValueForMode(p, mode));
    }
  }

  return {
    maxFieldPower,
    minAllowedPower,
    maxAllowedPower,
    poolSize: allowedPowers.length,
    allowedPowers,
    allowedValues,
    excludedValues,
    growthInterval,
    initialPoolSize,
    retainedPowerGroups,
  };
}

export function getRandomBlobFromPool(
  allowedPowers: number[],
  numGroups: number = 4,
  minAllowedPower: number = 0,
  boardBlobs?: Array<{ power: number; group: number }>,
  destroyOnExclusion: boolean = false
): QueuedBlob {
  const selectedGroup = Math.floor(Math.random() * numGroups);

  const groupPowersSet = new Set<number>(allowedPowers.filter((p) => p >= minAllowedPower));

  if (!destroyOnExclusion && boardBlobs && boardBlobs.length > 0) {
    for (const b of boardBlobs) {
      if (b.group === selectedGroup && b.power < minAllowedPower) {
        groupPowersSet.add(b.power);
      }
    }
  }

  const validPowers = Array.from(groupPowersSet).sort((a, b) => a - b);

  if (validPowers.length === 0) {
    return {
      power: Math.max(0, minAllowedPower),
      group: selectedGroup,
    };
  }

  const n = validPowers.length;
  const weights: number[] = [];
  let totalWeight = 0;

  for (let i = 0; i < n; i++) {
    const weight = 1.0 / Math.pow(1.25, i);
    weights.push(weight);
    totalWeight += weight;
  }

  let selectedPower = validPowers[0];
  let roll = Math.random() * totalWeight;
  for (let i = 0; i < n; i++) {
    if (roll < weights[i]) {
      selectedPower = validPowers[i];
      break;
    }
    roll -= weights[i];
  }

  return {
    power: selectedPower,
    group: selectedGroup,
  };
}

export function createInitialPoolQueue(
  maxFieldPower: number,
  queueLength: number = 12,
  growthInterval: number = 2,
  initialPoolSize: number = 4,
  numGroups: number = 4,
  boardBlobs?: Array<{ power: number; group: number }>,
  destroyOnExclusion: boolean = false,
  mode: GameMode | string = 'bonded'
): QueuedBlob[] {
  const info = calculateAllowedPowerPool(maxFieldPower, growthInterval, initialPoolSize, boardBlobs, destroyOnExclusion, mode);
  const queue: QueuedBlob[] = [];
  for (let i = 0; i < queueLength; i++) {
    queue.push(getRandomBlobFromPool(info.allowedPowers, numGroups, info.minAllowedPower, boardBlobs, destroyOnExclusion));
  }
  return queue;
}

export function isBlobValidInPool(
  blob: QueuedBlob,
  poolInfo: SpawnerPoolInfo,
  boardBlobs?: Array<{ power: number; group: number }>,
  destroyOnExclusion: boolean = false
): boolean {
  if (blob.power >= poolInfo.minAllowedPower && blob.power <= poolInfo.maxAllowedPower) {
    return true;
  }
  if (!destroyOnExclusion && blob.power < poolInfo.minAllowedPower && boardBlobs && boardBlobs.length > 0) {
    return boardBlobs.some((b) => b.group === blob.group && b.power === blob.power);
  }
  return false;
}

export function sanitizeQueuedBlob(
  blob: QueuedBlob,
  poolInfo: SpawnerPoolInfo,
  numGroups: number = 4,
  boardBlobs?: Array<{ power: number; group: number }>,
  destroyOnExclusion: boolean = false
): QueuedBlob {
  if (isBlobValidInPool(blob, poolInfo, boardBlobs, destroyOnExclusion)) {
    return blob;
  }
  return getRandomBlobFromPool(poolInfo.allowedPowers, numGroups, poolInfo.minAllowedPower, boardBlobs, destroyOnExclusion);
}

export function sanitizePoolQueue(
  queue: QueuedBlob[],
  maxFieldPower: number,
  growthInterval: number = 2,
  initialPoolSize: number = 4,
  numGroups: number = 4,
  boardBlobs?: Array<{ power: number; group: number }>,
  destroyOnExclusion: boolean = false,
  mode: GameMode | string = 'bonded'
): QueuedBlob[] {
  const info = calculateAllowedPowerPool(maxFieldPower, growthInterval, initialPoolSize, boardBlobs, destroyOnExclusion, mode);
  return queue.map((b) => sanitizeQueuedBlob(b, info, numGroups, boardBlobs, destroyOnExclusion));
}

export function replenishPoolQueue(
  currentQueue: QueuedBlob[],
  maxFieldPower: number,
  targetLength: number = 2,
  growthInterval: number = 2,
  initialPoolSize: number = 4,
  numGroups: number = 4,
  boardBlobs?: Array<{ power: number; group: number }>,
  destroyOnExclusion: boolean = false,
  mode: GameMode | string = 'bonded'
): { firedBlob: QueuedBlob; nextBlob: QueuedBlob; updatedQueue: QueuedBlob[] } {
  const info = calculateAllowedPowerPool(maxFieldPower, growthInterval, initialPoolSize, boardBlobs, destroyOnExclusion, mode);

  let queue = currentQueue.map((b) => sanitizeQueuedBlob(b, info, numGroups, boardBlobs, destroyOnExclusion));

  while (queue.length < 2) {
    queue.push(getRandomBlobFromPool(info.allowedPowers, numGroups, info.minAllowedPower, boardBlobs, destroyOnExclusion));
  }

  const firedBlob = queue.shift()!;

  while (queue.length < targetLength) {
    queue.push(getRandomBlobFromPool(info.allowedPowers, numGroups, info.minAllowedPower, boardBlobs, destroyOnExclusion));
  }

  const nextBlob = queue[0];

  return {
    firedBlob,
    nextBlob,
    updatedQueue: queue,
  };
}
