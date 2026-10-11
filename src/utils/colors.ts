import { GameMode } from '../types';

export interface BlobGroupDef {
  id: number;
  name: string;
  shortName: string;
  hue: number;
  badgeHex: string;
  description: string;
}

export const BLOB_GROUPS: BlobGroupDef[] = [
  { id: 0, name: 'Azure Ice', shortName: 'Azure', hue: 195, badgeHex: '#38bdf8', description: 'Deep Ice Blue → Radiant Cyan' },
  { id: 1, name: 'Emerald Jade', shortName: 'Emerald', hue: 150, badgeHex: '#34d399', description: 'Deep Forest Green → Bio Emerald' },
  { id: 2, name: 'Crimson Ruby', shortName: 'Crimson', hue: 345, badgeHex: '#fb7185', description: 'Deep Wine Ruby → Vibrant Crimson' },
  { id: 3, name: 'Amethyst Violet', shortName: 'Violet', hue: 270, badgeHex: '#c084fc', description: 'Deep Night Violet → Vivid Amethyst' },
  { id: 4, name: 'Amber Gold', shortName: 'Amber', hue: 48, badgeHex: '#facc15', description: 'Deep Bronze → Glowing Amber' },
  { id: 5, name: 'Solar Orange', shortName: 'Solar', hue: 24, badgeHex: '#fb923c', description: 'Deep Ochre → Solar Flare Orange' },
  { id: 6, name: 'Rose Quartz', shortName: 'Rose', hue: 325, badgeHex: '#f472b6', description: 'Deep Magenta → Radiant Rose' },
  { id: 7, name: 'Cobalt Electric', shortName: 'Cobalt', hue: 220, badgeHex: '#60a5fa', description: 'Deep Indigo → Electric Cobalt' },
];

export function getGroupInfo(groupIndex: number = 0): BlobGroupDef {
  const normalizedIndex = Math.abs(Math.floor(groupIndex)) % BLOB_GROUPS.length;
  return BLOB_GROUPS[normalizedIndex];
}

// Convert HSL to RGB
function hslToRgb(h: number, s: number, l: number): { r: number; g: number; b: number } {
  const hNorm = (h % 360 + 360) % 360;
  const sNorm = Math.min(100, Math.max(0, s)) / 100;
  const lNorm = Math.min(100, Math.max(0, l)) / 100;

  const k = (n: number) => (n + hNorm / 30) % 12;
  const a = sNorm * Math.min(lNorm, 1 - lNorm);
  const f = (n: number) => lNorm - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));

  return {
    r: Math.round(255 * f(0)),
    g: Math.round(255 * f(8)),
    b: Math.round(255 * f(4)),
  };
}

// Helper to convert RGB to hex
function rgbToHex(r: number, g: number, b: number): string {
  const clamp = (n: number) => Math.min(255, Math.max(0, Math.round(n)));
  return '#' + [r, g, b].map((x) => clamp(x).toString(16).padStart(2, '0')).join('');
}

/**
 * Calculates a white text fill with a ~3% tint of the complementary color of the blob's hue.
 */
export function getComplementaryDigitColor(
  groupIndex: number = 0,
  tintAmount: number = 0.03
): { hex: string; compHex: string } {
  const group = getGroupInfo(groupIndex);
  const compHue = (group.hue + 180) % 360;
  const compRgb = hslToRgb(compHue, 100, 50);

  // Blend tintAmount of compRgb into (1 - tintAmount) of white (255, 255, 255)
  const r = Math.round(255 * (1 - tintAmount) + compRgb.r * tintAmount);
  const g = Math.round(255 * (1 - tintAmount) + compRgb.g * tintAmount);
  const b = Math.round(255 * (1 - tintAmount) + compRgb.b * tintAmount);

  return {
    hex: rgbToHex(r, g, b),
    compHex: rgbToHex(compRgb.r, compRgb.g, compRgb.b),
  };
}

/**
 * Gets a distinct group color for any power exponent and grouping index.
 * Blobs start off a bit darker, get gradually lighter per value level until ~1M,
 * and then go back gradually to darker over the next equivalent steps, cycling every 1M step interval.
 */
export function getBlobColor(
  powerExponent: number,
  groupIndex: number = 0,
  digitTintAmount: number = 0.03,
  mode: GameMode = 'bonded',
  enableDarkDigits: boolean = false,
  darkDigitThreshold: number = 68
): {
  hex: string;
  rgb: { r: number; g: number; b: number };
  glow: string;
  lightHex: string;
  darkHex: string;
  digitHex: string;
  groupInfo: BlobGroupDef;
} {
  const group = getGroupInfo(groupIndex);

  const clampedPower = Math.max(0, powerExponent);

  // Number of value level steps to reach ~1M (1,000,000)
  // For 2 * 3^k (bonded mode), k=12 gives 1,062,882 (~1M) -> 12 steps
  // For 2 * 2^k (unbonded mode), k=19 gives 1,048,576 (~1M) -> 19 steps
  const base = mode === 'unbonded' ? 2 : 3;
  const stepsTo1M = Math.max(1, Math.round(Math.log(1000000 / 2) / Math.log(base)));

  // Triangle wave cycle across stepsTo1M (0 -> 1 -> 0)
  const cyclePeriod = stepsTo1M * 2;
  const pos = clampedPower % cyclePeriod;
  const t = pos <= stepsTo1M ? pos / stepsTo1M : (cyclePeriod - pos) / stepsTo1M;

  // Lightness starts off darker (22%) for starting levels, gradually increases to 82% at ~1M,
  // then gradually decreases back to 22% over the next stepsTo1M steps.
  const minLightness = 22;
  const maxLightness = 82;
  const lightness = minLightness + t * (maxLightness - minLightness);

  // Saturation stays rich & vibrant
  const saturation = 92 - t * 10;

  const rgb = hslToRgb(group.hue, saturation, lightness);
  const colorRes = formatColorResult(rgb);
  const digitInfo = getComplementaryDigitColor(groupIndex, digitTintAmount);

  // Use dark charcoal text when body lightness is high IF enableDarkDigits is true, else light complementary tint
  const digitHex = (enableDarkDigits && lightness > darkDigitThreshold) ? '#09090b' : digitInfo.hex;

  return {
    ...colorRes,
    digitHex,
    groupInfo: group,
  };
}

function formatColorResult(rgb: { r: number; g: number; b: number }) {
  const hex = rgbToHex(rgb.r, rgb.g, rgb.b);
  const glow = `rgba(${Math.round(rgb.r)}, ${Math.round(rgb.g)}, ${Math.round(rgb.b)}, 0.6)`;
  
  // Create lighter and darker variants for gradient stops
  const lightRgb = {
    r: Math.min(255, rgb.r + 55),
    g: Math.min(255, rgb.g + 55),
    b: Math.min(255, rgb.b + 55),
  };
  
  const darkRgb = {
    r: Math.max(0, rgb.r - 45),
    g: Math.max(0, rgb.g - 45),
    b: Math.max(0, rgb.b - 45),
  };

  return {
    hex,
    rgb,
    glow,
    lightHex: rgbToHex(lightRgb.r, lightRgb.g, lightRgb.b),
    darkHex: rgbToHex(darkRgb.r, darkRgb.g, darkRgb.b),
  };
}

/**
 * Trims trailing .0 from number strings or numbers (e.g., "2.0" -> "2", "2.0K" -> "2K", "1.0x" -> "1x")
 */
export function trimTrailingZeroDecimals(val: string | number): string {
  const str = typeof val === 'number' ? val.toString() : val;
  return str.replace(/\.0+(?=$|[^\d])/g, '');
}

/**
 * Format large power-of-two values cleanly (1, 2, 4, ... 1K, 2K, 4M, 1B, etc.)
 */
export function formatBlobValue(value: number): string {
  if (value < 1000) return value.toString();
  if (value < 1000000) {
    const k = value / 1024;
    return Number.isInteger(k) ? `${k}K` : `${k.toFixed(1).replace(/\.0$/, '')}K`;
  }
  if (value < 1000000000) {
    const m = value / (1024 * 1024);
    return Number.isInteger(m) ? `${m}M` : `${m.toFixed(1).replace(/\.0$/, '')}M`;
  }
  const g = value / (1024 * 1024 * 1024);
  return Number.isInteger(g) ? `${g}G` : `${g.toFixed(1).replace(/\.0$/, '')}G`;
}
