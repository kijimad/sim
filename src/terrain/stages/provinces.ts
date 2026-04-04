import type { StageContext } from "../context.js";
import { createTileNoise } from "../noise.js";

/** 地質区域のタイプ */
export const ProvinceType = {
  Ocean: 0,
  Coastal: 1,
  Plains: 2,
  Hills: 3,
  Highlands: 4,
  Mountains: 5,
} as const;

export type ProvinceType = (typeof ProvinceType)[keyof typeof ProvinceType];

interface ProvinceParams {
  readonly baseHeight: number;
  readonly roughness: number;
}

const PROVINCE_PARAMS: Record<ProvinceType, ProvinceParams> = {
  [ProvinceType.Ocean]: { baseHeight: 0.05, roughness: 0.01 },
  [ProvinceType.Coastal]: { baseHeight: 0.16, roughness: 0.02 },
  [ProvinceType.Plains]: { baseHeight: 0.25, roughness: 0.03 },
  [ProvinceType.Hills]: { baseHeight: 0.35, roughness: 0.1 },
  [ProvinceType.Highlands]: { baseHeight: 0.5, roughness: 0.15 },
  [ProvinceType.Mountains]: { baseHeight: 0.65, roughness: 0.25 },
};

interface ProvinceSeed {
  readonly x: number;
  readonly y: number;
  readonly type: ProvinceType;
  readonly driftX: number;
  readonly driftY: number;
}

/**
 * Voronoi Province + プレート境界山脈:
 * - ドメインワーピングで Voronoi 境界を曲線化
 * - 収束プレート境界に山脈を隆起
 */
export function generateProvinces(ctx: StageContext): void {
  const { width: w, height: h, elevation, rng, relief } = ctx;
  const ns = ctx.noiseSize;

  // シード数を多めにしてセルを小さくする
  const numSeeds = Math.max(15, Math.round(ns / 25));

  // ドメインワーピング用ノイズ（境界を曲線にする）
  const warpNx = createTileNoise(rng, ns, w, h, 100);
  const warpNy = createTileNoise(rng, ns, w, h, 100);
  const warpStrength = ns * 0.12;

  // シード点を生成する
  const seeds: ProvinceSeed[] = [];

  // 端に海洋シードを配置する
  const edgeCount = Math.max(6, Math.round(numSeeds * 0.3));
  for (let i = 0; i < edgeCount; i++) {
    const angle = (i / edgeCount) * Math.PI * 2 + rng() * 0.5;
    const r = 0.45 + rng() * 0.05;
    seeds.push({
      x: (0.5 + Math.cos(angle) * r) * w,
      y: (0.5 + Math.sin(angle) * r) * h,
      type: ProvinceType.Ocean,
      driftX: (rng() - 0.5) * 2,
      driftY: (rng() - 0.5) * 2,
    });
  }

  // 内陸シード
  const landTypes: ProvinceType[] = [
    ProvinceType.Plains, ProvinceType.Plains, ProvinceType.Plains,
    ProvinceType.Coastal, ProvinceType.Hills, ProvinceType.Hills,
    ProvinceType.Highlands, ProvinceType.Mountains,
  ];
  for (let i = edgeCount; i < numSeeds; i++) {
    seeds.push({
      x: (0.1 + rng() * 0.8) * w,
      y: (0.1 + rng() * 0.8) * h,
      type: landTypes[Math.floor(rng() * landTypes.length)] ?? ProvinceType.Plains,
      driftX: (rng() - 0.5) * 2,
      driftY: (rng() - 0.5) * 2,
    });
  }

  // 広いブレンド半径で滑らかな遷移にする
  const blendRadius = ns * 0.12;
  const mountainWidth = ns * 0.06;

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      // ドメインワーピング: 座標を歪ませてVoronoi境界を曲線にする
      const wx = x + (warpNx(x, y) - 0.5) * warpStrength;
      const wy = y + (warpNy(x, y) - 0.5) * warpStrength;

      // 最寄り2つのシードを見つける（歪んだ座標で）
      let best1Dist = Infinity;
      let best2Dist = Infinity;
      let best1Idx = 0;
      let best2Idx = 0;
      for (let s = 0; s < seeds.length; s++) {
        const seed = seeds[s];
        if (seed === undefined) continue;
        const dx = wx - seed.x;
        const dy = wy - seed.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist < best1Dist) {
          best2Dist = best1Dist;
          best2Idx = best1Idx;
          best1Dist = dist;
          best1Idx = s;
        } else if (dist < best2Dist) {
          best2Dist = dist;
          best2Idx = s;
        }
      }

      const p1 = seeds[best1Idx];
      const p2 = seeds[best2Idx];
      if (p1 === undefined || p2 === undefined) continue;

      const params1 = PROVINCE_PARAMS[p1.type];
      const params2 = PROVINCE_PARAMS[p2.type];

      // 境界からの距離でブレンドする
      const edgeDist = best2Dist - best1Dist;
      const blendT = Math.min(1, Math.max(0, edgeDist / blendRadius));
      const smooth = blendT * blendT * (3 - 2 * blendT);

      const baseHeight = params1.baseHeight * smooth + params2.baseHeight * (1 - smooth);
      const roughness = params1.roughness * smooth + params2.roughness * (1 - smooth);

      // --- プレート境界の山脈 ---
      let mountainBoost = 0;
      if (edgeDist < mountainWidth * 3) {
        const bx = p2.x - p1.x;
        const by = p2.y - p1.y;
        const bLen = Math.sqrt(bx * bx + by * by);
        if (bLen > 0) {
          const nx = bx / bLen;
          const ny = by / bLen;
          const convergence = (p1.driftX - p2.driftX) * nx + (p1.driftY - p2.driftY) * ny;
          if (convergence > 0) {
            const sigma = mountainWidth;
            const gauss = Math.exp(-(edgeDist * edgeDist) / (2 * sigma * sigma));
            mountainBoost = convergence * gauss * 0.15 * relief;
          }
        }
      }

      elevation[y * w + x] = Math.max(0, Math.min(1, baseHeight * relief + mountainBoost));
      // roughness を flow に一時保存する
      ctx.flow[y * w + x] = roughness;
    }
  }
}
