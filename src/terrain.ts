import type { TileMap } from "./tilemap.js";
import { Terrain } from "./types.js";

/**
 * Xorshift32 疑似乱数生成器。[0, 1) の範囲の値を生成する関数を返す。
 */
function createRng(seed: number): () => number {
  let state = seed | 0 || 1;
  return (): number => {
    state ^= state << 13;
    state ^= state >> 17;
    state ^= state << 5;
    return ((state >>> 0) / 0x100000000);
  };
}

/**
 * 2Dグリッドのランダム値を生成し、バイリニア補間でサンプリングする。
 */
function createNoiseLayer(
  rng: () => number,
  gridW: number,
  gridH: number,
): (x: number, y: number) => number {
  const grid: number[] = Array.from({ length: gridW * gridH }, () => rng());

  return (x: number, y: number): number => {
    const gx = x * (gridW - 1);
    const gy = y * (gridH - 1);
    const x0 = Math.floor(gx);
    const y0 = Math.floor(gy);
    const x1 = Math.min(x0 + 1, gridW - 1);
    const y1 = Math.min(y0 + 1, gridH - 1);
    const fx = gx - x0;
    const fy = gy - y0;

    // より滑らかな補間のためのSmoothstep
    const sx = fx * fx * (3 - 2 * fx);
    const sy = fy * fy * (3 - 2 * fy);

    const v00 = grid[y0 * gridW + x0] ?? 0;
    const v10 = grid[y0 * gridW + x1] ?? 0;
    const v01 = grid[y1 * gridW + x0] ?? 0;
    const v11 = grid[y1 * gridW + x1] ?? 0;

    const top = v00 + (v10 - v00) * sx;
    const bottom = v01 + (v11 - v01) * sx;
    return top + (bottom - top) * sy;
  };
}

export interface TerrainGenConfig {
  readonly seed: number;
  readonly waterThreshold: number;
  readonly mountainThreshold: number;
}

const DEFAULT_CONFIG: TerrainGenConfig = {
  seed: 42,
  waterThreshold: 0.35,
  mountainThreshold: 0.65,
};

/**
 * 地形プレビュー用: 指定サイズの Uint8Array を生成する（0=Flat, 1=Mountain, 2=Water）。
 * previewSize はプレビュー画像のピクセル数。mapSize は実際のマップサイズ（比率計算用）。
 */
export function generateTerrainPreview(
  previewSize: number,
  config: TerrainGenConfig,
): Uint8Array {
  const { seed, waterThreshold, mountainThreshold } = config;
  const rng = createRng(seed);
  const coarse = createNoiseLayer(rng, 16, 16);
  const detail = createNoiseLayer(rng, 32, 32);
  const data = new Uint8Array(previewSize * previewSize);

  for (let y = 0; y < previewSize; y++) {
    for (let x = 0; x < previewSize; x++) {
      const nx = x / previewSize;
      const ny = y / previewSize;
      const value = coarse(nx, ny) * 0.7 + detail(nx, ny) * 0.3;

      let t: number;
      if (value < waterThreshold) {
        t = 2; // Water
      } else if (value > mountainThreshold) {
        t = 1; // Mountain
      } else {
        t = 0; // Flat
      }
      data[y * previewSize + x] = t;
    }
  }
  return data;
}

export function generateTerrain(
  map: TileMap,
  config: Partial<TerrainGenConfig> = {},
): void {
  const { seed, waterThreshold, mountainThreshold } = {
    ...DEFAULT_CONFIG,
    ...config,
  };

  const rng = createRng(seed);
  const coarse = createNoiseLayer(rng, 16, 16);
  const detail = createNoiseLayer(rng, 32, 32);

  for (let y = 0; y < map.height; y++) {
    for (let x = 0; x < map.width; x++) {
      const nx = x / map.width;
      const ny = y / map.height;
      const value = coarse(nx, ny) * 0.7 + detail(nx, ny) * 0.3;

      let terrain: Terrain;
      if (value < waterThreshold) {
        terrain = Terrain.Water;
      } else if (value > mountainThreshold) {
        terrain = Terrain.Mountain;
      } else {
        terrain = Terrain.Flat;
      }

      map.set(x, y, { terrain });
    }
  }
}
