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

    // fBm ノイズ — 正規化座標ベース（細部の起伏）
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

    // 大規模地形特徴ノイズ（山脈・盆地・高原を大胆に生成する）
    // 低周波ノイズで広域の標高変動を作る
    const featureNoise1 = createGradientNoise(rng);
    const fa1 = rng() * Math.PI * 2;
    const fc1 = Math.cos(fa1); const fs1 = Math.sin(fa1);
    const fo1 = rng() * 500; const fp1 = rng() * 500;

    // 第2軸: 別方向の大規模変動
    const featureNoise2 = createGradientNoise(rng);
    const fa2 = rng() * Math.PI * 2;
    const fc2 = Math.cos(fa2); const fs2 = Math.sin(fa2);
    const fo2 = rng() * 500; const fp2 = rng() * 500;

    // 中周波の丘ノイズ（山の手のような緩やかな丘と谷を作る）
    const hillNoise = createGradientNoise(rng);
    const ha = rng() * Math.PI * 2;
    const hc = Math.cos(ha); const hs = Math.sin(ha);
    const ho = rng() * 500; const hp = rng() * 500;

    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const i = y * w + x;
        const nx = x / w;
        const ny = y / h;

        // fBm（細部の起伏）
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

        const detailNoise = value * 0.6 + value2 * 0.4;

        // 大規模地形特徴（マップ全体で1〜2周期の超低周波）
        const ff1 = 1.5; // マップ全体で1.5周期
        const fv1 = featureNoise1(nx * ff1 * fc1 - ny * ff1 * fs1 + fo1,
                                    nx * ff1 * fs1 + ny * ff1 * fc1 + fp1);
        const ff2 = 2.5; // やや高い周波数
        const fv2 = featureNoise2(nx * ff2 * fc2 - ny * ff2 * fs2 + fo2,
                                    nx * ff2 * fs2 + ny * ff2 * fc2 + fp2);

        // 大規模変動: 山脈（高い）/ 盆地（低い）/ 高原（中間で平坦）
        // fv1: -0.3〜+0.3 の広域標高変動
        // fv2: -0.15〜+0.15 の二次変動
        const featureShift = (fv1 - 0.5) * 0.6 + (fv2 - 0.5) * 0.3;

        // 中周波の丘ノイズ（マップ全体で5〜8周期の緩やかな起伏）
        const hf = 6;
        const hv = hillNoise(nx * hf * hc - ny * hf * hs + ho,
                              nx * hf * hs + ny * hf * hc + hp);

        const m = mask(nx, ny);
        const baseLevel = 0.35 + featureShift * relief;
        // 標高に応じて起伏の振幅を変える（高い場所ほど起伏が大きい）
        const elevFactor = 0.8 + Math.max(0, baseLevel) * 2.0;
        // 丘ノイズ: 中間標高で緩やかな丘と谷を追加する
        const hillContrib = (hv - 0.5) * 0.15 * relief;
        const heightVal = baseLevel + (detailNoise - 0.5) * elevFactor * relief + hillContrib;

        elevation[i] = Math.max(0, Math.min(1, heightVal * m));
      }
    }

    // ブラーで格子アーティファクトを滑らかにする（3パスに抑えて起伏を保つ）
    for (let pass = 0; pass < 3; pass++) {
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

  // バイオーム軸: 渓谷ノイズ
  const canyonNoise = createGradientNoise(rng);
  const a2 = rng() * Math.PI * 2;
  const cos2 = Math.cos(a2); const sin2 = Math.sin(a2);
  const ox2 = rng() * 1000; const oy2 = rng() * 1000;

  // 砂浜ノイズ（海岸線の一部にだけ砂浜を配置するため）
  const beachNoise = createGradientNoise(rng);
  const a3 = rng() * Math.PI * 2;
  const cos3 = Math.cos(a3); const sin3 = Math.sin(a3);
  const ox3 = rng() * 1000; const oy3 = rng() * 1000;

  const biomeScale = 4;
  const DX4 = [0, 1, 0, -1];
  const DY4 = [-1, 0, 1, 0];

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


      // 渓谷ノイズ
      const fx = nx * biomeScale; const fy = ny * biomeScale;
      const cf = biomeScale * 6;
      const cfx = nx * cf; const cfy = ny * cf;
      const canyonVal = Math.max(0, Math.min(1,
        canyonNoise(cfx * cos2 - cfy * sin2 + ox2, cfx * sin2 + cfy * cos2 + oy2)));

      // 高地系バイオーム（標高 > 0.5）
      if (elev > 0.5) {
        // 渓谷: Highland 内のノイズ帯
        const beachVal = beachNoise(fx * cos3 - fy * sin3 + ox3, fx * sin3 + fy * cos3 + oy3);
        const canyonWidth = 0.02 + beachVal * 0.04;
        const canyonDist = Math.abs(canyonVal - 0.5);
        if (canyonDist < canyonWidth) {
          biomeId[i] = Biome.Canyon;
          continue;
        }

        // 台地: 高地で周囲との標高差が小さい（平坦な高地）
        let maxDiff = 0;
        const PR = 3;
        for (let dy = -PR; dy <= PR; dy++) {
          for (let dx = -PR; dx <= PR; dx++) {
            if (dx * dx + dy * dy > PR * PR) continue;
            const nnx = x + dx; const nny = y + dy;
            if (nnx < 0 || nnx >= w || nny < 0 || nny >= h) continue;
            const diff = Math.abs(elev - (elevation[nny * w + nnx] ?? 0));
            if (diff > maxDiff) maxDiff = diff;
          }
        }
        if (maxDiff < 0.04) {
          biomeId[i] = Biome.Plateau;
        } else {
          biomeId[i] = Biome.Highland;
        }
        continue;
      }

      // 断崖: 海岸沿いで急な標高変化がある（水面と隣接しつつ標高差が大きい）
      if (elev > WATER_TH + 0.1) {
        let hasWaterNeighbor = false;
        let maxWaterDiff = 0;
        for (let d = 0; d < 4; d++) {
          const nnx = x + (DX4[d] ?? 0); const nny = y + (DY4[d] ?? 0);
          if (nnx < 0 || nnx >= w || nny < 0 || nny >= h) continue;
          const ne = elevation[nny * w + nnx] ?? 0;
          if (ne < WATER_TH) {
            hasWaterNeighbor = true;
            const diff = elev - ne;
            if (diff > maxWaterDiff) maxWaterDiff = diff;
          }
        }
        if (hasWaterNeighbor && maxWaterDiff > 0.1) {
          biomeId[i] = Biome.Cliff;
          continue;
        }
      }

      // 湿地: 低地で流量が多い（川沿いの湿潤地帯）
      const localFlow = flow[i] ?? 0;
      if (localFlow > 200 && elev < WATER_TH + 0.08) {
        biomeId[i] = Biome.Wetland;
        continue;
      }

      // 沖積平野: 大河川の近くの低地で平坦な場所（下町）
      // 丘陵: それ以外の中間標高（山の手）
      biomeId[i] = Biome.Hills;
    }
  }

  // 砂浜配置
  placeBeaches(w, h, elevation, biomeId, beachNoise, cos3, sin3, ox3, oy3, biomeScale, WATER_TH);

  // 沖積平野配置: 大河川沿いの低地を Alluvial にする
  placeAlluvial(w, h, elevation, flow, biomeId, WATER_TH);
}

/**
 * 沖積平野配置:
 * 大河川（flow > 1000）からBFSで距離を計算し、近くの低い Hills を Alluvial にする。
 * Alluvial は applyBiomeFeatures で標高を平坦化する。
 */
function placeAlluvial(
  w: number, h: number,
  elevation: Float32Array, flow: Float32Array,
  biomeId: Uint8Array, waterTh: number,
): void {
  const DX4 = [0, 1, 0, -1];
  const DY4 = [-1, 0, 1, 0];
  const FLOW_MIN = 1000;
  const ALLUVIAL_RADIUS = Math.max(8, Math.floor(Math.min(w, h) * 0.04));

  // 大河川からの距離をBFSで計算する
  const riverDist = new Float32Array(w * h).fill(Infinity);
  const queue: number[] = [];
  for (let i = 0; i < w * h; i++) {
    if ((flow[i] ?? 0) > FLOW_MIN) {
      riverDist[i] = 0;
      queue.push(i);
    }
  }

  let head = 0;
  while (head < queue.length) {
    const ci = queue[head++] ?? 0;
    const cd = riverDist[ci] ?? 0;
    if (cd >= ALLUVIAL_RADIUS) continue;
    const cx = ci % w; const cy = (ci - cx) / w;
    for (let d = 0; d < 4; d++) {
      const nnx = cx + (DX4[d] ?? 0); const nny = cy + (DY4[d] ?? 0);
      if (nnx < 0 || nnx >= w || nny < 0 || nny >= h) continue;
      const ni = nny * w + nnx;
      const nd = cd + 1;
      if (nd < (riverDist[ni] ?? Infinity)) {
        riverDist[ni] = nd;
        queue.push(ni);
      }
    }
  }

  // 大河川に近い低地の Hills を Alluvial に変更する
  for (let i = 0; i < w * h; i++) {
    if (biomeId[i] !== Biome.Hills && biomeId[i] !== Biome.Wetland) continue;
    const dist = riverDist[i] ?? Infinity;
    if (dist > ALLUVIAL_RADIUS) continue;
    const elev = elevation[i] ?? 0;
    // 低い場所ほど沖積平野になりやすい（標高に応じた距離閾値）
    const maxDist = ALLUVIAL_RADIUS * Math.max(0, 1 - (elev - waterTh) / 0.2);
    if (dist <= maxDist) {
      biomeId[i] = Biome.Alluvial;
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

  // 渓谷を掘り込む
  for (let i = 0; i < size; i++) {
    if (biomeId[i] !== Biome.Canyon) continue;
    const elev = elevation[i] ?? 0;
    elevation[i] = WATER_TH + (elev - WATER_TH) * 0.3;
  }

  // 沖積平野を平坦化する（大河川に向かってなだらかに下がる下町のような地形）
  for (let i = 0; i < size; i++) {
    if (biomeId[i] !== Biome.Alluvial) continue;
    const elev = elevation[i] ?? 0;
    // 標高を水面に近づける（起伏を潰す）
    const target = WATER_TH + 0.05;
    elevation[i] = target + (elev - target) * 0.3;
  }

  // 海底深度: 海岸から離れるほど深くする
  applyOceanDepth(w, h, elevation, biomeId, WATER_TH);

  // 最終ブラーで加工の段差を滑らかにする
  smoothElevation(elevation, w, h);
  smoothElevation(elevation, w, h);
}

/**
 * 砂浜配置:
 * 低周波ノイズのピークに「砂浜の種」を置き、海岸沿いにBFSで広げて
 * 大きめの半円状の砂浜を形成する。
 */
function placeBeaches(
  w: number, h: number,
  elevation: Float32Array, biomeId: Uint8Array,
  beachNoise: (x: number, y: number) => number,
  cos3: number, sin3: number, ox3: number, oy3: number,
  biomeScale: number, waterTh: number,
): void {
  const DX4 = [0, 1, 0, -1];
  const DY4 = [-1, 0, 1, 0];
  const DX8 = [0, 1, 1, 1, 0, -1, -1, -1];
  const DY8 = [-1, -1, 0, 1, 1, 1, 0, -1];

  // 砂浜の最大半径（マップサイズに比例）
  const BEACH_RADIUS = Math.max(5, Math.floor(Math.min(w, h) * 0.025));

  // 砂浜の種を探す: 海岸沿いの低地で、ノイズのピーク
  const seeds: number[] = [];
  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      const i = y * w + x;
      if (biomeId[i] !== Biome.Hills) continue;
      const elev = elevation[i] ?? 0;
      // 水面すぐ上の低地のみ
      if (elev > waterTh + 0.05) continue;

      // 隣接に水域があること
      let nearWater = false;
      for (let d = 0; d < 8; d++) {
        const nnx = x + (DX8[d] ?? 0); const nny = y + (DY8[d] ?? 0);
        if (nnx < 0 || nnx >= w || nny < 0 || nny >= h) continue;
        if ((elevation[nny * w + nnx] ?? 0) < waterTh) { nearWater = true; break; }
      }
      if (!nearWater) continue;

      // 低周波ノイズのピーク（> 0.75）にだけ種を置く
      const nx = x / w; const ny = y / h;
      const fx = nx * biomeScale * 2; const fy = ny * biomeScale * 2;
      const nv = beachNoise(fx * cos3 - fy * sin3 + ox3, fx * sin3 + fy * cos3 + oy3);
      if (nv > 0.75) {
        seeds.push(i);
      }
    }
  }

  // 各種からBFSで海岸に沿って砂浜を広げる
  const beachDist = new Float32Array(w * h).fill(Infinity);
  const queue: number[] = [];
  for (const si of seeds) {
    beachDist[si] = 0;
    queue.push(si);
    biomeId[si] = Biome.Beach;
  }

  let head = 0;
  while (head < queue.length) {
    const ci = queue[head++] ?? 0;
    const cd = beachDist[ci] ?? 0;
    if (cd >= BEACH_RADIUS) continue;
    const cx = ci % w; const cy = (ci - cx) / w;

    for (let d = 0; d < 4; d++) {
      const nnx = cx + (DX4[d] ?? 0); const nny = cy + (DY4[d] ?? 0);
      if (nnx < 0 || nnx >= w || nny < 0 || nny >= h) continue;
      const ni = nny * w + nnx;
      if (biomeId[ni] !== Biome.Hills) continue;
      // 標高が低い場所だけ広がる（高地に登らない）
      if ((elevation[ni] ?? 0) > waterTh + 0.06) continue;
      const nd = cd + 1;
      if (nd < (beachDist[ni] ?? Infinity)) {
        beachDist[ni] = nd;
        biomeId[ni] = Biome.Beach;
        queue.push(ni);
      }
    }
  }
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
