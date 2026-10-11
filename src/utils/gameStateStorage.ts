import { GameMode, RenderMode, GameStats, QueuedBlob } from '../types';

export interface SerializedBlob {
  id: string;
  relX: number;
  relY: number;
  vx: number;
  vy: number;
  power: number;
  group: number;
  bondedBlobIds?: string[];
}

export interface SavedGameState {
  version: number;
  mode: GameMode;
  renderMode?: RenderMode;
  isMuted: boolean;
  turnMultiplier: number;
  stats: GameStats;
  ballPool: QueuedBlob[];
  isGameOver: boolean;
  blobs: SerializedBlob[];
  flyingBlob?: SerializedBlob | null;
}

export const GAME_STATE_STORAGE_KEY = 'gravity_blobs_saved_game_v2';

export function saveGameState(state: SavedGameState): void {
  try {
    localStorage.setItem(GAME_STATE_STORAGE_KEY, JSON.stringify(state));
  } catch (err) {
    console.error('Failed to save game state to localStorage:', err);
  }
}

export function loadSavedGameState(): SavedGameState | null {
  try {
    const raw = localStorage.getItem(GAME_STATE_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as SavedGameState;
    if (parsed && typeof parsed.stats === 'object' && Array.isArray(parsed.blobs)) {
      return parsed;
    }
  } catch (err) {
    console.error('Failed to load saved game state:', err);
  }
  return null;
}

export function clearSavedGameState(): void {
  try {
    localStorage.removeItem(GAME_STATE_STORAGE_KEY);
  } catch (err) {
    console.error('Failed to clear saved game state:', err);
  }
}
