import { BlobData, Vector2D, GameMode } from '../types';
import { ConfigMap } from '../config/gameConfig';

// Default Fluid Particle Physics Fallbacks
export const UNIFORM_RADIUS = 20;   // Base particle radius
export const DAMPING = 0.815;        // Viscous fluid damping (per-frame retention)
export const DANGER_RING_RATIO = 0.94; // 94% of canvas min dimension

export type PhysicsEvent =
  | {
      type: 'merge';
      x: number;
      y: number;
      newPower: number;
      group?: number;
      mergedValue: number;
      combo: number;
      mergedCount?: number;
    }
  | {
      type: 'bond';
      x: number;
      y: number;
      power: number;
      group: number;
    }
  | { type: 'collision'; impact: number };

export interface PhysicsStepResult {
  newCombo: { value: number; lastMergeTime: number };
  events: PhysicsEvent[];
}

export interface AttractorWell {
  x: number;
  y: number;
}

export function getAttractorWells(
  center: { x: number; y: number },
  config?: ConfigMap | null
): AttractorWell[] {
  const enableAttractors = (config?.enableAttractorWells?.value as boolean) ?? true;
  if (!enableAttractors) return [];

  const count = Math.max(1, Math.min(4, Math.round((config?.attractorWellCount?.value as number) ?? 2)));
  const spacing = (config?.attractorWellSpacing?.value as number) ?? 120;

  if (count === 1) {
    return [{ x: center.x, y: center.y }];
  } else if (count === 2) {
    return [
      { x: center.x - spacing, y: center.y },
      { x: center.x + spacing, y: center.y },
    ];
  } else if (count === 3) {
    return [
      { x: center.x - spacing, y: center.y + spacing * 0.4 },
      { x: center.x + spacing, y: center.y + spacing * 0.4 },
      { x: center.x, y: center.y - spacing * 0.7 },
    ];
  } else {
    return [
      { x: center.x - spacing, y: center.y - spacing },
      { x: center.x + spacing, y: center.y - spacing },
      { x: center.x - spacing, y: center.y + spacing },
      { x: center.x + spacing, y: center.y + spacing },
    ];
  }
}

export function getRadiusForPower(
  powerExponent: number,
  baseBlobSize: number = UNIFORM_RADIUS
): number {
  return baseBlobSize;
}

export function createBlob(
  x: number,
  y: number,
  powerExponent: number,
  groupIndex: number = 0,
  vx: number = 0,
  vy: number = 0,
  baseBlobSize: number = UNIFORM_RADIUS,
  mode: GameMode = 'bonded'
): BlobData {
  const radius = baseBlobSize;
  const val = mode === 'unbonded' ? 2 * Math.pow(2, powerExponent) : 2 * Math.pow(3, powerExponent);

  return {
    id: 'blob_' + Math.random().toString(36).substring(2, 9) + '_' + Date.now(),
    x,
    y,
    vx,
    vy,
    power: powerExponent,
    group: groupIndex,
    value: val,
    radius,
    targetRadius: radius,
    mass: 1.0, // Uniform particle mass for fluid physics equation
    bondedBlobIds: [],
    squishX: 1,
    squishY: 1,
    rotation: 0,
    wobblePhase: Math.random() * Math.PI * 2,
    wobbleSpeed: 0.02,
    mergeFlash: 0,
    birthAnim: 0,
  };
}

export function getCenterOfMass(blobs: BlobData[], defaultCenter: Vector2D): Vector2D {
  if (blobs.length === 0) return defaultCenter;
  let sumX = 0;
  let sumY = 0;
  for (let i = 0; i < blobs.length; i++) {
    sumX += blobs[i].x;
    sumY += blobs[i].y;
  }
  return {
    x: sumX / blobs.length,
    y: sumY / blobs.length,
  };
}

/**
 * Step fluid particle physics engine forward using the pair-wise Lennard-Jones inter-particle potential equation:
 * F(r) = (24 * epsilon / r) * [ 2 * (sigma / r)^12 - (sigma / r)^6 ]
 *
 * Repulsive core (1/r^12) provides short-range particle repulsion;
 * Attractive tail (1/r^6) provides cohesive surface tension.
 */
export function updatePhysics(
  blobs: BlobData[],
  center: Vector2D,
  gravityStrength: number,
  mode: GameMode,
  currentCombo: { value: number; lastMergeTime: number },
  isSlowMotion: boolean = false,
  config?: ConfigMap,
  deltaSec: number = 0.016
): PhysicsStepResult {
  const now = Date.now();
  let combo = { ...currentCombo };
  const events: PhysicsEvent[] = [];

  const baseBlobSize = (config?.baseBlobSize?.value as number) ?? UNIFORM_RADIUS;

  // Lennard-Jones Fluid Equation Parameters
  const epsilon = (config?.ljEpsilon?.value as number) ?? 3.4;
  const sigma = (config?.ljSigma?.value as number) ?? 35.0;
  const cutoffMultiplier = (config?.ljCutoffMultiplier?.value as number) ?? 2.5;
  const maxForce = (config?.ljMaxForce?.value as number) ?? 2000.0;
  const dampingVal = Math.min(1.0, Math.max(0.0, (config?.damping?.value as number) ?? DAMPING));
  const mergeDurationSecs = Math.max(0.001, (config?.mergeDuration?.value as number) ?? 0.28);
  const slowMoActive = isSlowMotion || ((config?.slowMotion?.value as boolean) ?? false);

  // Reset combo if 1.4s passed without merges
  if (combo.value > 1 && now - combo.lastMergeTime > 1400) {
    combo.value = 1;
  }

  const timeScale = slowMoActive ? 0.12 : 1.0;
  const clampedDelta = Math.min(0.05, Math.max(0.001, deltaSec));
  const dt = clampedDelta * timeScale;
  const subStepFactor = dt / 0.016;

  const n = blobs.length;

  const enableAttractors = (config?.enableAttractorWells?.value as boolean) ?? true;
  const pullStrength = (config?.attractorPullStrength?.value as number) ?? 0.05;
  const attractorRadius = Math.max(1, (config?.attractorRadius?.value as number) ?? 450.0);
  const springK = (config?.springK?.value as number) ?? 0.15;
  const wells = enableAttractors ? getAttractorWells(center, config) : [];

  // Update particle visual timers & radii
  for (let i = 0; i < n; i++) {
    const b = blobs[i];
    b.radius = baseBlobSize;
    b.targetRadius = baseBlobSize;
    b.mass = 1.0;

    if (b.birthAnim < 1) {
      b.birthAnim = Math.min(1, b.birthAnim + 0.1 * timeScale * subStepFactor);
    }

    if (b.mergeFlash > 0) {
      b.mergeFlash = Math.max(0, b.mergeFlash - 0.05 * timeScale * subStepFactor);
    }
  }

  // Step 2 & 3: Multi-substep Symplectic Euler Integration with Soft-Core Regularization
  // Prevents numerical instability & velocity explosions caused by the steep 1/r^12 repulsive core
  const SUB_STEPS = Math.max(1, Math.round((config?.subSteps?.value as number) ?? 4));
  const subDt = dt / SUB_STEPS;
  const subDamping = Math.pow(dampingVal, subStepFactor / SUB_STEPS);
  const cutoffDistance = sigma * cutoffMultiplier;
  const cutoffDistSq = cutoffDistance * cutoffDistance;
  const minSafeDist = Math.max(2.0, sigma * 0.35); // Soft-core distance singularity guard against 1/r^12 blowing up on overlap. Note: 2.0 floor is unreachable unless sigma < 5.71, so real floor is 0.35 * sigma.

  for (let sub = 0; sub < SUB_STEPS; sub++) {
    // Clear accelerations & apply attractor wells for non-merging particles
    for (let i = 0; i < n; i++) {
      const b = blobs[i];
      b.ax = 0;
      b.ay = 0;

      if (enableAttractors && pullStrength !== 0 && wells.length > 0 && !b.mergeAnim) {
        let minDistSq = Infinity;
        let targetWell = wells[0];
        for (let k = 0; k < wells.length; k++) {
          const w = wells[k];
          const dxW = b.x - w.x;
          const dyW = b.y - w.y;
          const dSq = dxW * dxW + dyW * dyW;
          if (dSq < minDistSq) {
            minDistSq = dSq;
            targetWell = w;
          }
        }
        const dist = Math.sqrt(minDistSq);
        if (dist > 0.001) {
          // Saturating pull: zero force at center, scaling up to pullStrength at attractorRadius
          const pullFactor = Math.min(dist / attractorRadius, 1.0);
          const force = pullStrength * pullFactor;
          b.ax += ((targetWell.x - b.x) / dist) * force;
          b.ay += ((targetWell.y - b.y) / dist) * force;
        }
      }
    }

    // Lennard-Jones pair-wise force calculation
    for (let i = 0; i < n; i++) {
      const pA = blobs[i];
      if (pA.mergeAnim) continue;

      for (let j = i + 1; j < n; j++) {
        const pB = blobs[j];
        if (pB.mergeAnim) continue;

        const dx = pA.x - pB.x;
        const dy = pA.y - pB.y;
        const distSq = dx * dx + dy * dy;

        if (distSq < cutoffDistSq && distSq > 0.0001) {
          const dist = Math.sqrt(distSq);
          const safeDist = Math.max(dist, minSafeDist);

          const isBonded = mode === 'bonded' && pA.bondedBlobIds && pA.bondedBlobIds.includes(pB.id);

          // Lennard-Jones calculation: Force = (24 * epsilon / r) * [ 2 * (sigma / r)^12 - (sigma / r)^6 ]
          const s_over_r = sigma / safeDist;
          const s_over_r_6 = Math.pow(s_over_r, 6);
          const s_over_r_12 = s_over_r_6 * s_over_r_6;

          // For bonded pairs, suppress the LJ attractive r^-6 term (spring handles attraction past rest distance)
          let forceMagnitude = (24.0 * epsilon / safeDist) * (2.0 * s_over_r_12 - (isBonded ? 0 : s_over_r_6));

          // Cap maximum force magnitude per particle pair
          if (forceMagnitude > maxForce) forceMagnitude = maxForce;
          if (forceMagnitude < -maxForce) forceMagnitude = -maxForce;

          const fx = (dx / dist) * forceMagnitude;
          const fy = (dy / dist) * forceMagnitude;

          pA.ax += fx;
          pA.ay += fy;
          pB.ax -= fx;
          pB.ay -= fy;
        }
      }
    }

    // Spring tether forces for bonded pairs (ONLY in bonded mode)
    if (mode === 'bonded') {
      for (let i = 0; i < n; i++) {
        const pA = blobs[i];
        if (pA.mergeAnim || !pA.bondedBlobIds || pA.bondedBlobIds.length === 0) continue;

        for (let j = i + 1; j < n; j++) {
          const pB = blobs[j];
          if (pB.mergeAnim || !pB.bondedBlobIds || !pB.bondedBlobIds.includes(pA.id)) continue;

          const dx = pA.x - pB.x;
          const dy = pA.y - pB.y;
          const dist = Math.hypot(dx, dy) || 0.001;
          const restDist = (pA.radius + pB.radius) * 1.05;

          if (dist > restDist) {
            const diff = dist - restDist;
            const fx = (dx / dist) * diff * springK;
            const fy = (dy / dist) * diff * springK;

            pA.ax -= fx;
            pA.ay -= fy;
            pB.ax += fx;
            pB.ay += fy;
          }
        }
      }
    }

    // Sub-step velocity and position integration
    for (let i = 0; i < n; i++) {
      const p = blobs[i];

      if (p.mergeAnim) {
        if (sub === 0) {
          p.mergeAnim.progress += dt / mergeDurationSecs;
          const t = Math.min(1, p.mergeAnim.progress);
          const ease = t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;

          p.x = p.mergeAnim.startX + (p.mergeAnim.targetX - p.mergeAnim.startX) * ease;
          p.y = p.mergeAnim.startY + (p.mergeAnim.targetY - p.mergeAnim.startY) * ease;
          p.vx = 0;
          p.vy = 0;
        }
      } else {
        // Cap net acceleration per particle to prevent multi-neighbor cumulative force spikes
        const netAccel = Math.hypot(p.ax, p.ay);
        const maxNetAccel = maxForce * 1.5;
        if (netAccel > maxNetAccel) {
          const scale = maxNetAccel / netAccel;
          p.ax *= scale;
          p.ay *= scale;
        }

        // Update velocities
        p.vx += p.ax * subDt;
        p.vy += p.ay * subDt;

        // Apply viscous fluid damping
        p.vx *= subDamping;
        p.vy *= subDamping;

        // Velocity cap per sub-step to prevent tunneling
        const speed = Math.hypot(p.vx, p.vy);
        const maxSpeed = baseBlobSize * 0.75;
        if (speed > maxSpeed) {
          const scale = maxSpeed / speed;
          p.vx *= scale;
          p.vy *= scale;
        }

        // Update positions (subDt * 60 converts px/frame velocity to sub-step delta position)
        p.x += p.vx * subDt * 60;
        p.y += p.vy * subDt * 60;
      }
    }
  }

  // Step 4: Resolve completed merge animations
  const remainingBlobs: BlobData[] = [];
  for (let i = 0; i < n; i++) {
    const b = blobs[i];
    if (b.mergeAnim) {
      if (b.mergeAnim.progress >= 1) {
        if (b.mergeAnim.isPrimary) {
          const nextPower = b.mergeAnim.targetPower ?? (b.power + 1);
          const count = b.mergeAnim.mergedCount ?? 3;
          const mergedValue = b.mergeAnim.mergedValue ?? (mode === 'unbonded' ? 2 * Math.pow(2, nextPower) : 2 * Math.pow(3, nextPower));

          combo.value += Math.max(1, count - 1);
          combo.lastMergeTime = now;

          const mx = b.mergeAnim.targetX;
          const my = b.mergeAnim.targetY;

          const targetGroup = b.mergeAnim.group ?? b.group ?? 0;
          const newBlob = createBlob(
            mx,
            my,
            nextPower,
            targetGroup,
            0,
            0,
            baseBlobSize,
            mode
          );
          newBlob.mergeFlash = 1;
          remainingBlobs.push(newBlob);

          events.push({
            type: 'merge',
            x: mx,
            y: my,
            newPower: nextPower,
            group: targetGroup,
            mergedValue,
            combo: combo.value,
            mergedCount: count,
          });
        }
      } else {
        remainingBlobs.push(b);
      }
    } else {
      remainingBlobs.push(b);
    }
  }

  blobs.length = 0;
  blobs.push(...remainingBlobs);

  // Step 5: Bonding and Combination Logic
  const m = blobs.length;

  if (mode === 'bonded') {
    // 5a. Form bonds when 2 unbonded identical blobs touch
    for (let i = 0; i < m; i++) {
      const b1 = blobs[i];
      if (b1.mergeAnim) continue;

      for (let j = i + 1; j < m; j++) {
        const b2 = blobs[j];
        if (b2.mergeAnim) continue;

        if (b1.power === b2.power && b1.group === b2.group) {
          const dx = b2.x - b1.x;
          const dy = b2.y - b1.y;
          const dist = Math.hypot(dx, dy) || 0.001;
          const touchDist = (b1.radius + b2.radius) * 1.15;

          if (dist < touchDist) {
            if (!b1.bondedBlobIds) b1.bondedBlobIds = [];
            if (!b2.bondedBlobIds) b2.bondedBlobIds = [];

            if (!b1.bondedBlobIds.includes(b2.id)) {
              b1.bondedBlobIds.push(b2.id);
              b2.bondedBlobIds.push(b1.id);

              events.push({
                type: 'bond',
                x: (b1.x + b2.x) / 2,
                y: (b1.y + b2.y) / 2,
                power: b1.power,
                group: b1.group,
              });
            }
          }
        }
      }
    }
  } else {
    // Unbonded mode: ensure no residual bonded IDs exist
    for (let i = 0; i < m; i++) {
      if (blobs[i].bondedBlobIds && blobs[i].bondedBlobIds!.length > 0) {
        blobs[i].bondedBlobIds = [];
      }
    }
  }

  // 5b. Find connected components of matching blobs (connected by touch or bond)
  const adj: number[][] = Array.from({ length: m }, () => []);

  for (let i = 0; i < m; i++) {
    const b1 = blobs[i];
    if (b1.mergeAnim) continue;

    for (let j = i + 1; j < m; j++) {
      const b2 = blobs[j];
      if (b2.mergeAnim) continue;

      if (b1.power === b2.power && b1.group === b2.group) {
        const isBonded = mode === 'bonded' && Boolean(b1.bondedBlobIds?.includes(b2.id));
        const dx = b2.x - b1.x;
        const dy = b2.y - b1.y;
        const dist = Math.hypot(dx, dy) || 0.001;
        const touchDist = (b1.radius + b2.radius) * 1.25;

        if (isBonded || dist < touchDist) {
          adj[i].push(j);
          adj[j].push(i);
        }
      }
    }
  }

  const visited = new Array(m).fill(false);

  for (let i = 0; i < m; i++) {
    if (visited[i] || blobs[i].mergeAnim) continue;
    if (adj[i].length === 0) continue;

    const component: number[] = [];
    const queue = [i];
    visited[i] = true;

    while (queue.length > 0) {
      const curr = queue.shift()!;
      component.push(curr);
      for (const neighbor of adj[curr]) {
        if (!visited[neighbor] && !blobs[neighbor].mergeAnim) {
          visited[neighbor] = true;
          queue.push(neighbor);
        }
      }
    }

    if (mode === 'bonded') {
      // BONDED MODE: 3x matching (component.length >= 3)
      if (component.length >= 3) {
        const numTrios = Math.floor(component.length / 3);

        for (let t = 0; t < numTrios; t++) {
          const trioIndices = component.slice(t * 3, (t + 1) * 3);

          let sumX = 0;
          let sumY = 0;
          for (const idx of trioIndices) {
            sumX += blobs[idx].x;
            sumY += blobs[idx].y;
          }
          const centroidX = sumX / 3;
          const centroidY = sumY / 3;

          let centerIdx = trioIndices[0];
          let minCentroidDistSq = Infinity;
          for (const idx of trioIndices) {
            const dx = blobs[idx].x - centroidX;
            const dy = blobs[idx].y - centroidY;
            const dSq = dx * dx + dy * dy;
            if (dSq < minCentroidDistSq) {
              minCentroidDistSq = dSq;
              centerIdx = idx;
            }
          }
          const centerBlob = blobs[centerIdx];

          const basePower = centerBlob.power;
          const baseGroup = centerBlob.group;
          const targetPower = basePower + 1;
          const mergedValue = 3 * centerBlob.value;

          for (const idx of trioIndices) {
            const b = blobs[idx];
            if (b.bondedBlobIds) {
              for (const partnerId of b.bondedBlobIds) {
                const partner = blobs.find((x) => x.id === partnerId);
                if (partner && partner.bondedBlobIds) {
                  partner.bondedBlobIds = partner.bondedBlobIds.filter((id) => id !== b.id);
                }
              }
              b.bondedBlobIds = [];
            }

            b.mergeAnim = {
              startX: b.x,
              startY: b.y,
              targetX: centerBlob.x,
              targetY: centerBlob.y,
              progress: 0,
              isPrimary: idx === centerIdx,
              targetPower,
              group: baseGroup,
              mergedCount: 3,
              mergedValue,
            };
          }
        }
      }
    } else {
      // UNBONDED MODE: 2x matching (component.length >= 2)
      if (component.length >= 2) {
        const numPairs = Math.floor(component.length / 2);

        for (let p = 0; p < numPairs; p++) {
          const pairIndices = component.slice(p * 2, (p + 1) * 2);

          let sumX = 0;
          let sumY = 0;
          for (const idx of pairIndices) {
            sumX += blobs[idx].x;
            sumY += blobs[idx].y;
          }
          const centroidX = sumX / 2;
          const centroidY = sumY / 2;

          const primaryIdx = pairIndices[0];
          const primaryBlob = blobs[primaryIdx];

          const basePower = primaryBlob.power;
          const baseGroup = primaryBlob.group;
          const targetPower = basePower + 1;
          const mergedValue = 2 * primaryBlob.value;

          for (const idx of pairIndices) {
            const b = blobs[idx];
            b.mergeAnim = {
              startX: b.x,
              startY: b.y,
              targetX: centroidX,
              targetY: centroidY,
              progress: 0,
              isPrimary: idx === primaryIdx,
              targetPower,
              group: baseGroup,
              mergedCount: 2,
              mergedValue,
            };
          }
        }
      }
    }
  }

  return {
    newCombo: combo,
    events,
  };
}

export function triggerSupernova(
  center: Vector2D,
  survivor: BlobData,
  blobs: BlobData[],
  mode: GameMode = 'bonded'
): { newBlobs: BlobData[]; power: number; group: number } {
  const nextPower = survivor.power + 2;
  const count = 12;
  const newBlobs: BlobData[] = [];

  for (let i = 0; i < count; i++) {
    const angle = (i / count) * Math.PI * 2;
    const dist = 30 + Math.random() * 40;
    const px = center.x + Math.cos(angle) * dist;
    const py = center.y + Math.sin(angle) * dist;
    const power = Math.max(0, nextPower - 2 - Math.floor(Math.random() * 2));
    const randomGroup = Math.floor(Math.random() * 4);
    const b = createBlob(px, py, power, randomGroup, 0, 0, UNIFORM_RADIUS, mode);
    b.vx = Math.cos(angle) * (2 + Math.random() * 3);
    b.vy = Math.sin(angle) * (2 + Math.random() * 3);
    newBlobs.push(b);
  }

  return { newBlobs, power: survivor.power, group: survivor.group };
}

