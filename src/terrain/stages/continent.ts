import type { LandMask } from "./biome.js";
import type { StageContext } from "../context.js";
import { createGradientNoise } from "./noise.js";
import { createGenerateElevation } from "./biome.js";

/** 大陸型マスク生成 */
export function createContinentMask(rng: () => number): LandMask {
  const shapeNoise1 = createGradientNoise(rng);
  const a1 = rng() * Math.PI * 2;
  const c1 = Math.cos(a1); const s1 = Math.sin(a1);
  const ox1 = rng() * 500; const oy1 = rng() * 500;

  const shapeNoise2 = createGradientNoise(rng);
  const a2 = rng() * Math.PI * 2;
  const c2 = Math.cos(a2); const s2 = Math.sin(a2);
  const ox2 = rng() * 500; const oy2 = rng() * 500;

  return (nx, ny) => {
    const edgeX = Math.min(nx, 1 - nx) * 2;
    const edgeY = Math.min(ny, 1 - ny) * 2;
    const edgeDist = Math.min(edgeX, edgeY);
    const baseMask = Math.min(1, edgeDist * 5);

    const freq1 = 2.5;
    const fx1 = nx * freq1; const fy1 = ny * freq1;
    const warp1 = (shapeNoise1(fx1 * c1 - fy1 * s1 + ox1, fx1 * s1 + fy1 * c1 + oy1) - 0.5) * 0.8;

    const freq2 = 5;
    const fx2 = nx * freq2; const fy2 = ny * freq2;
    const warp2 = (shapeNoise2(fx2 * c2 - fy2 * s2 + ox2, fx2 * s2 + fy2 * c2 + oy2) - 0.5) * 0.4;

    return Math.max(0, Math.min(1, baseMask + warp1 + warp2));
  };
}

/** 2島型マスク生成 */
export function createTwoIslandsMask(rng: () => number): LandMask {
  const shapeNoise = createGradientNoise(rng);
  const a = rng() * Math.PI * 2;
  const c = Math.cos(a); const s = Math.sin(a);
  const ox = rng() * 500; const oy = rng() * 500;

  return (nx, ny) => {
    const dx1 = (nx - 0.25) * 3.5; const dy1 = (ny - 0.5) * 2.5;
    const m1 = Math.max(0, 1 - Math.sqrt(dx1 * dx1 + dy1 * dy1));
    const dx2 = (nx - 0.75) * 3.5; const dy2 = (ny - 0.5) * 2.5;
    const m2 = Math.max(0, 1 - Math.sqrt(dx2 * dx2 + dy2 * dy2));
    const centerGap = Math.exp(-((nx - 0.5) * (nx - 0.5)) / 0.005) * 0.8;
    const baseMask = Math.max(0, (m1 + m2) * 2.5 - centerGap);

    const freq = 4; const fx = nx * freq; const fy = ny * freq;
    const warp = (shapeNoise(fx * c - fy * s + ox, fx * s + fy * c + oy) - 0.5) * 0.5;
    return Math.max(0, Math.min(1, baseMask + warp));
  };
}

/** 多島型マスク生成 */
export function createMultiIslandsMask(rng: () => number): LandMask {
  const islandNoise = createGradientNoise(rng);
  const angle = rng() * Math.PI * 2;
  const cos = Math.cos(angle); const sin = Math.sin(angle);
  const ox = rng() * 500; const oy = rng() * 500;

  return (nx, ny) => {
    const edgeX = Math.min(nx, 1 - nx) * 2;
    const edgeY = Math.min(ny, 1 - ny) * 2;
    const edge = Math.min(1, Math.min(edgeX, edgeY) * 4);
    const freq = 4; const fx = nx * freq; const fy = ny * freq;
    const nv = islandNoise(fx * cos - fy * sin + ox, fx * sin + fy * cos + oy);
    const landMask = Math.max(0, (nv - 0.35) * 3);
    return Math.min(1, landMask * edge);
  };
}

// --- マスク一覧とステージ関数 ---

const MASK_FACTORIES: ((rng: () => number) => LandMask)[] = [
  createContinentMask,
  createTwoIslandsMask,
  createMultiIslandsMask,
];

/** ランダム地形: seed に基づいてマスク種類をランダムに選択する */
export function randomShape(ctx: StageContext): void {
  const idx = Math.floor(ctx.rng() * MASK_FACTORIES.length);
  const factory = MASK_FACTORIES[idx] ?? createContinentMask;
  createGenerateElevation(factory(ctx.rng))(ctx);
}

/** 大陸型 */
export function continentShape(ctx: StageContext): void {
  createGenerateElevation(createContinentMask(ctx.rng))(ctx);
}

/** 2島型 */
export function twoIslands(ctx: StageContext): void {
  createGenerateElevation(createTwoIslandsMask(ctx.rng))(ctx);
}

/** 多島型 */
export function multiIslands(ctx: StageContext): void {
  createGenerateElevation(createMultiIslandsMask(ctx.rng))(ctx);
}

/** 平原 */
export function flatPlains(ctx: StageContext): void {
  const { width: w, height: h, elevation, rng } = ctx;
  const n1 = createGradientNoise(rng);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const freq = 1 / 48;
      elevation[y * w + x] = 0.3 + n1(x * freq, y * freq) * 0.15;
    }
  }
}
