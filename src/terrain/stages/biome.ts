import type { StageContext } from "../context.js";
import { Biome } from "../context.js";
import { createGradientNoise } from "./noise.js";

/** マスク関数: 正規化座標(0〜1) → 0〜1の陸地確率 */
export type LandMask = (nx: number, ny: number) => number;

/**
 * 基本標高生成:
 * fBm ノイズ + マスク関数で地形の骨格を作る。
 * バイオームには依存しない純粋な標高生成。
 */
export function createGenerateElevation(mask: LandMask): (ctx: StageContext) => void {
  return (ctx: StageContext): void => {
    const { width: w, height: h, elevation, rng, relief } = ctx;

    // fBm ノイズ — 正規化座標ベース
    const noiseScale = ctx.noiseSize / 64;
    const baseFreq = noiseScale;
    const numOctaves = Math.min(14, 8 + Math.floor(Math.log2(Math.max(1, noiseScale))));

    type OctaveData = { noise: (x: number, y: number) => number; cos: number; sin: number; ox: number; oy: number };
    const octaves: OctaveData[] = [];
    for (let i = 0; i < numOctaves; i++) {
      const angle = rng() * Math.PI * 2;
      octaves.push({
        noise: createGradientNoise(rng),
        cos: Math.cos(angle), sin: Math.sin(angle),
        ox: rng() * 1000 - 500, oy: rng() * 1000 - 500,
      });
    }
    const baseFreq2 = ctx.noiseSize / 49;
    const octaves2: OctaveData[] = [];
    for (let i = 0; i < numOctaves; i++) {
      const angle = rng() * Math.PI * 2;
      octaves2.push({
        noise: createGradientNoise(rng),
        cos: Math.cos(angle), sin: Math.sin(angle),
        ox: rng() * 1000 - 500, oy: rng() * 1000 - 500,
      });
    }

    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const i = y * w + x;
        const nx = x / w;
        const ny = y / h;

        // fBm
        let value = 0; let amplitude = 1; let frequency = baseFreq; let totalAmp = 0;
        for (let oct = 0; oct < numOctaves; oct++) {
          const o = octaves[oct];
          if (o === undefined) continue;
          const fx = nx * frequency; const fy = ny * frequency;
          value += o.noise(fx * o.cos - fy * o.sin + o.ox, fx * o.sin + fy * o.cos + o.oy) * amplitude;
          totalAmp += amplitude; amplitude *= 0.5; frequency *= 2;
        }
        value /= totalAmp;

        let value2 = 0; let amp2 = 1; let freq2 = baseFreq2; let totalAmp2 = 0;
        for (let oct = 0; oct < numOctaves; oct++) {
          const o = octaves2[oct];
          if (o === undefined) continue;
          const fx2 = nx * freq2; const fy2 = ny * freq2;
          value2 += o.noise(fx2 * o.cos - fy2 * o.sin + o.ox, fx2 * o.sin + fy2 * o.cos + o.oy) * amp2;
          totalAmp2 += amp2; amp2 *= 0.5; freq2 *= 2;
        }
        value2 /= totalAmp2;

        const noise = value * 0.6 + value2 * 0.4;
        const m = mask(nx, ny);
        const baseLevel = 0.35;
        const heightVal = baseLevel + (noise - 0.5) * 2.0 * relief;

        elevation[i] = Math.max(0, Math.min(1, heightVal * m));
      }
    }

    // ブラーで格子アーティファクトを滑らかにする
    for (let pass = 0; pass < 5; pass++) {
      smoothElevation(elevation, w, h);
    }
  };
}

/**
 * バイオーム割当ステージ:
 * 標高・流量・ノイズに基づいてバイオームを決定する。
 * 地形に合ったバイオームが自然に配置される。
 */
export function assignBiomes(ctx: StageContext): void {
  const { width: w, height: h, elevation, flow, biomeId, rng } = ctx;
  const WATER_TH = 0.2;

  // バイオーム軸: 乾燥度ノイズ
  const aridityNoise = createGradientNoise(rng);
  const a1 = rng() * Math.PI * 2;
  const cos1 = Math.cos(a1); const sin1 = Math.sin(a1);
  const ox1 = rng() * 1000; const oy1 = rng() * 1000;

  // バイオーム軸: 渓谷ノイズ
  const canyonNoise = createGradientNoise(rng);
  const a2 = rng() * Math.PI * 2;
  const cos2 = Math.cos(a2); const sin2 = Math.sin(a2);
  const ox2 = rng() * 1000; const oy2 = rng() * 1000;

  const biomeScale = 4; // 正規化座標で約4周期

  // 陸地の連結成分を求めて島を検出する
  const isIsland = detectIslandCells(w, h, elevation, WATER_TH);

  // 内陸水域（マップ端に繋がらない水域）を検出して Lake にする
  const isLake = detectLakeCells(w, h, elevation, WATER_TH);

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = y * w + x;
      const elev = elevation[i] ?? 0;
      const nx = x / w;
      const ny = y / h;

      // 水域
      if (elev < WATER_TH) {
        if (isLake[i] === 1) {
          biomeId[i] = Biome.Lake;
        } else {
          biomeId[i] = Biome.Ocean;
        }
        continue;
      }

      // 島（マップ端に接しない小さい陸塊）
      if (isIsland[i] === 1) {
        biomeId[i] = Biome.Island;
        continue;
      }

      // 海岸沿いの低地で三方水に囲まれている → Bay 周辺（Tombolo）
      // 両側の水が近い狭い陸地 → Tombolo
      if (elev < WATER_TH + 0.05) {
        let waterNeighbors = 0;
        const DX8 = [0, 1, 1, 1, 0, -1, -1, -1];
        const DY8 = [-1, -1, 0, 1, 1, 1, 0, -1];
        for (let d = 0; d < 8; d++) {
          const nnx = x + (DX8[d] ?? 0);
          const nny = y + (DY8[d] ?? 0);
          if (nnx < 0 || nnx >= w || nny < 0 || nny >= h) continue;
          if ((elevation[nny * w + nnx] ?? 0) < WATER_TH) waterNeighbors++;
        }
        if (waterNeighbors >= 5) {
          biomeId[i] = Biome.Tombolo;
          continue;
        }
      }

      // 乾燥度ノイズ
      const fx = nx * biomeScale; const fy = ny * biomeScale;
      const aridity = Math.max(0, Math.min(1,
        aridityNoise(fx * cos1 - fy * sin1 + ox1, fx * sin1 + fy * cos1 + oy1)));

      // 渓谷ノイズ
      const cf = biomeScale * 6;
      const cfx = nx * cf; const cfy = ny * cf;
      const canyonVal = Math.max(0, Math.min(1,
        canyonNoise(cfx * cos2 - cfy * sin2 + ox2, cfx * sin2 + cfy * cos2 + oy2)));

      // Highland: 標高が高い
      if (elev > 0.5) {
        // Highland の中で渓谷ノイズが 0.5 付近の細い帯を Canyon にする
        const canyonDist = Math.abs(canyonVal - 0.5);
        if (canyonDist < 0.04) {
          biomeId[i] = Biome.Canyon;
        } else {
          biomeId[i] = Biome.Highland;
        }
        continue;
      }

      // Desert: 乾燥度が高く、標高が低め、流量が少ない
      const localFlow = flow[i] ?? 0;
      if (aridity > 0.7 && elev < 0.4 && localFlow < 50) {
        biomeId[i] = Biome.Desert;
        continue;
      }

      // Plains（デフォルト）
      biomeId[i] = Biome.Plains;
    }
  }
}

/**
 * バイオーム特有の地形加工ステージ:
 * バイオームに応じて標高を微調整する（湖の深度、渓谷の掘り込みなど）。
 */
export function applyBiomeFeatures(ctx: StageContext): void {
  const { width: w, height: h, elevation, biomeId } = ctx;
  const size = w * h;
  const WATER_TH = 0.2;

  // 湖の深度を岸からの距離で設定する
  applyLakeDepth(w, h, elevation, biomeId);

  // 渓谷を掘り込む（Highland の標高の半分まで下げる）
  for (let i = 0; i < size; i++) {
    if (biomeId[i] !== Biome.Canyon) continue;
    const elev = elevation[i] ?? 0;
    // 周囲の Highland の平均標高に対して谷底を作る
    elevation[i] = WATER_TH + (elev - WATER_TH) * 0.3;
  }

  // Tombolo の標高をなだらかにする
  for (let i = 0; i < size; i++) {
    if (biomeId[i] !== Biome.Tombolo) continue;
    const elev = elevation[i] ?? 0;
    elevation[i] = WATER_TH + (elev - WATER_TH) * 0.3;
  }

  // 海底深度: 海岸から離れるほど深くする
  applyOceanDepth(w, h, elevation, biomeId, WATER_TH);

  // 最終ブラーで加工の段差を滑らかにする
  smoothElevation(elevation, w, h);
  smoothElevation(elevation, w, h);
}

/** 内陸水域（マップ端に繋がらない水域）を検出する */
function detectLakeCells(w: number, h: number, elevation: Float32Array, waterTh: number): Uint8Array {
  const size = w * h;
  const DX4 = [0, 1, 0, -1];
  const DY4 = [-1, 0, 1, 0];
  const visited = new Uint8Array(size);
  const isLake = new Uint8Array(size);

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = y * w + x;
      if (visited[i] === 1 || (elevation[i] ?? 0) >= waterTh) continue;

      const component: number[] = [i];
      visited[i] = 1;
      let touchesEdge = false;
      let qi = 0;
      while (qi < component.length) {
        const ci = component[qi++] ?? 0;
        const cx = ci % w; const cy = (ci - cx) / w;
        if (cx === 0 || cx === w - 1 || cy === 0 || cy === h - 1) touchesEdge = true;
        for (let d = 0; d < 4; d++) {
          const nnx = cx + (DX4[d] ?? 0); const nny = cy + (DY4[d] ?? 0);
          if (nnx < 0 || nnx >= w || nny < 0 || nny >= h) continue;
          const ni = nny * w + nnx;
          if (visited[ni] === 1 || (elevation[ni] ?? 0) >= waterTh) continue;
          visited[ni] = 1;
          component.push(ni);
        }
      }
      if (!touchesEdge) {
        for (const ci of component) isLake[ci] = 1;
      }
    }
  }
  return isLake;
}

/** 島（マップ端に接しない小さい陸塊）を検出する */
function detectIslandCells(w: number, h: number, elevation: Float32Array, waterTh: number): Uint8Array {
  const size = w * h;
  const MAX_ISLAND_AREA = Math.floor(size * 0.02);
  const DX4 = [0, 1, 0, -1];
  const DY4 = [-1, 0, 1, 0];
  const visited = new Uint8Array(size);
  const isIsland = new Uint8Array(size);

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = y * w + x;
      if (visited[i] === 1 || (elevation[i] ?? 0) < waterTh) continue;

      const component: number[] = [i];
      visited[i] = 1;
      let touchesEdge = false;
      let qi = 0;
      while (qi < component.length) {
        const ci = component[qi++] ?? 0;
        const cx = ci % w; const cy = (ci - cx) / w;
        if (cx === 0 || cx === w - 1 || cy === 0 || cy === h - 1) touchesEdge = true;
        for (let d = 0; d < 4; d++) {
          const nnx = cx + (DX4[d] ?? 0); const nny = cy + (DY4[d] ?? 0);
          if (nnx < 0 || nnx >= w || nny < 0 || nny >= h) continue;
          const ni = nny * w + nnx;
          if (visited[ni] === 1 || (elevation[ni] ?? 0) < waterTh) continue;
          visited[ni] = 1;
          component.push(ni);
        }
      }
      if (!touchesEdge && component.length <= MAX_ISLAND_AREA) {
        for (const ci of component) isIsland[ci] = 1;
      }
    }
  }
  return isIsland;
}

/** 湖の深度を岸からの距離で設定する */
function applyLakeDepth(w: number, h: number, elevation: Float32Array, biomeId: Uint8Array): void {
  const size = w * h;
  const DX4 = [0, 1, 0, -1];
  const DY4 = [-1, 0, 1, 0];

  const lakeDist = new Float32Array(size).fill(-1);
  const queue: number[] = [];

  // Lake の岸セルを探す
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = y * w + x;
      if (biomeId[i] !== Biome.Lake) continue;
      let isShore = false;
      for (let d = 0; d < 4; d++) {
        const nnx = x + (DX4[d] ?? 0); const nny = y + (DY4[d] ?? 0);
        if (nnx < 0 || nnx >= w || nny < 0 || nny >= h) { isShore = true; break; }
        if (biomeId[nny * w + nnx] !== Biome.Lake) { isShore = true; break; }
      }
      if (isShore) { lakeDist[i] = 0; queue.push(i); }
    }
  }

  let head = 0;
  while (head < queue.length) {
    const ci = queue[head++] ?? 0;
    const cd = lakeDist[ci] ?? 0;
    const cx = ci % w; const cy = (ci - cx) / w;
    for (let d = 0; d < 4; d++) {
      const nnx = cx + (DX4[d] ?? 0); const nny = cy + (DY4[d] ?? 0);
      if (nnx < 0 || nnx >= w || nny < 0 || nny >= h) continue;
      const ni = nny * w + nnx;
      if (biomeId[ni] !== Biome.Lake || (lakeDist[ni] ?? -1) >= 0) continue;
      lakeDist[ni] = cd + 1;
      queue.push(ni);
    }
  }

  const MAX_DEPTH = Math.max(5, Math.floor(Math.min(w, h) * 0.03));
  for (let i = 0; i < size; i++) {
    const dist = lakeDist[i] ?? -1;
    if (dist < 0) continue;
    const depthRatio = Math.min(1, dist / MAX_DEPTH);
    // 岸辺: 元の標高を少し下げる、中心: 大きく下げる
    const baseElev = elevation[i] ?? 0;
    elevation[i] = baseElev * (1 - depthRatio * 0.8);
  }
}

/** 海底深度: 海岸から離れるほど深くする */
function applyOceanDepth(w: number, h: number, elevation: Float32Array, biomeId: Uint8Array, waterTh: number): void {
  const size = w * h;
  const DX4 = [0, 1, 0, -1];
  const DY4 = [-1, 0, 1, 0];

  const coastDist = new Float32Array(size).fill(Infinity);
  const queue: number[] = [];

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = y * w + x;
      if ((elevation[i] ?? 0) >= waterTh) continue;
      if (biomeId[i] === Biome.Lake) continue; // 湖は別処理済み

      let nearLand = false;
      for (let d = 0; d < 4; d++) {
        const nnx = x + (DX4[d] ?? 0); const nny = y + (DY4[d] ?? 0);
        if (nnx < 0 || nnx >= w || nny < 0 || nny >= h) continue;
        if ((elevation[nny * w + nnx] ?? 0) >= waterTh) { nearLand = true; break; }
      }
      if (nearLand || x === 0 || x === w - 1 || y === 0 || y === h - 1) {
        coastDist[i] = 0;
        queue.push(i);
      }
    }
  }

  const MAX_DIST = Math.max(20, Math.floor(Math.min(w, h) * 0.15));
  let head = 0;
  while (head < queue.length) {
    const ci = queue[head++] ?? 0;
    const cd = coastDist[ci] ?? 0;
    if (cd >= MAX_DIST) continue;
    const cx = ci % w; const cy = (ci - cx) / w;
    for (let d = 0; d < 4; d++) {
      const nnx = cx + (DX4[d] ?? 0); const nny = cy + (DY4[d] ?? 0);
      if (nnx < 0 || nnx >= w || nny < 0 || nny >= h) continue;
      const ni = nny * w + nnx;
      if ((elevation[ni] ?? 0) >= waterTh || biomeId[ni] === Biome.Lake) continue;
      const nd = cd + 1;
      if (nd < (coastDist[ni] ?? Infinity)) {
        coastDist[ni] = nd;
        queue.push(ni);
      }
    }
  }

  for (let i = 0; i < size; i++) {
    const dist = coastDist[i] ?? Infinity;
    if (dist === Infinity || dist === 0) continue;
    if (biomeId[i] === Biome.Lake) continue;
    const elev = elevation[i] ?? 0;
    if (elev >= waterTh) continue;
    const depthFactor = Math.min(1, dist / MAX_DIST);
    elevation[i] = elev * (1 - depthFactor * 0.7);
  }
}

/** 分離型 7-tap ガウシアンブラー */
function smoothElevation(elevation: Float32Array, w: number, h: number): void {
  const temp = new Float32Array(w * h);
  const K = [1, 6, 15, 20, 15, 6, 1];
  const KSUM = 64;

  for (let y = 0; y < h; y++) {
    const row = y * w;
    for (let x = 0; x < w; x++) {
      let sum = 0;
      for (let k = -3; k <= 3; k++) {
        const sx = Math.max(0, Math.min(w - 1, x + k));
        sum += (elevation[row + sx] ?? 0) * (K[k + 3] ?? 0);
      }
      temp[row + x] = sum / KSUM;
    }
  }

  for (let y = 0; y < h; y++) {
    const row = y * w;
    for (let x = 0; x < w; x++) {
      let sum = 0;
      for (let k = -3; k <= 3; k++) {
        const sy = Math.max(0, Math.min(h - 1, y + k));
        sum += (temp[sy * w + x] ?? 0) * (K[k + 3] ?? 0);
      }
      elevation[row + x] = sum / KSUM;
    }
  }
}
