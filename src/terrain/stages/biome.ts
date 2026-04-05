import type { StageContext } from "../context.js";
import { BIOME_TAGS } from "../biome-registry.js";
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

    // 丘ノイズ（複数スケールで丘陵の起伏を作る）
    const hillNoise = createGradientNoise(rng);
    const ha = rng() * Math.PI * 2;
    const hc = Math.cos(ha); const hs = Math.sin(ha);
    const ho = rng() * 500; const hp = rng() * 500;

    // 丘の頂上に微細な凸凹を加えるノイズ
    const ridgeNoise = createGradientNoise(rng);
    const ra = rng() * Math.PI * 2;
    const rc = Math.cos(ra); const rs = Math.sin(ra);
    const ro = rng() * 500; const rp = rng() * 500;

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

        // 大規模地形特徴（超低周波で広いスケールの変動を作る）
        // DEM実測: 低地が大半を占め、山は一部だけ突き出る
        const ff1 = 1.2; // マップ全体で1.2周期（よりなだらかに）
        const fv1 = featureNoise1(nx * ff1 * fc1 - ny * ff1 * fs1 + fo1,
                                    nx * ff1 * fs1 + ny * ff1 * fc1 + fp1);
        const ff2 = 2.0;
        const fv2 = featureNoise2(nx * ff2 * fc2 - ny * ff2 * fs2 + fo2,
                                    nx * ff2 * fs2 + ny * ff2 * fc2 + fp2);

        // 大規模変動を非線形にする:
        // 低い値は平坦に近づけ、高い値だけが山になる（二乗で低地を広く）
        const rawShift = (fv1 - 0.5) * 0.6 + (fv2 - 0.5) * 0.3;
        // 正の値（山）は二乗で突き出させ、負の値（盆地）はそのまま
        const featureShift = rawShift > 0
          ? rawShift * rawShift * 3  // 山は二乗で急に立ち上がる
          : rawShift * 0.5;          // 盆地は浅く

        // 丘ノイズ: 3層で丘陵の起伏を作る
        // 層1: 大きな丘（マップの1/4スケール）
        const hf1 = 4;
        const hv1 = hillNoise(nx * hf1 * hc - ny * hf1 * hs + ho,
                               nx * hf1 * hs + ny * hf1 * hc + hp);
        // 層2: 中程度の谷（マップの1/8スケール）
        const hf2 = 8;
        const hv2 = hillNoise(nx * hf2 * hc - ny * hf2 * hs + ho + 100,
                               nx * hf2 * hs + ny * hf2 * hc + hp + 100);
        // 層3: 丘の頂上の細かい凸凹（別ノイズで独立したパターン）
        const rf = 14;
        const rv = ridgeNoise(nx * rf * rc - ny * rf * rs + ro,
                               nx * rf * rs + ny * rf * rc + rp);

        const m = mask(nx, ny);
        const baseLevel = 0.35 + featureShift * relief;
        // 標高帯に応じた起伏の振幅
        // 低地: 平坦（DEM実測で75%が<0.005の差）
        // 丘陵: 中程度の起伏
        // 高地: なだらかな山脈
        // DEM実測に基づく標高帯別の起伏振幅
        // 低地: 平坦率82-97% → 弱いノイズ
        // 丘陵(0.2-0.3): 平坦率56% → 中程度のノイズ
        // 山岳(0.3+): 平坦率35% → 強いノイズ（尾根と谷）
        let elevFactor: number;
        let hillContrib: number;
        if (baseLevel > 0.3) {
          // 山岳〜丘陵上部: 尾根と谷の連なり（DEM平坦率35%に合わせて強い起伏）
          elevFactor = 1.5 + baseLevel * 2.5;
          hillContrib = ((hv1 - 0.5) * 0.6 + (hv2 - 0.5) * 0.3) * relief;
        } else if (baseLevel > 0.2) {
          // 丘陵: 中程度の起伏（DEM平坦率56%）
          elevFactor = 1.5 + baseLevel * 1.5;
          hillContrib = ((hv1 - 0.5) * 0.5 + (hv2 - 0.5) * 0.25 + (rv - 0.5) * 0.12) * relief;
        } else {
          // 低地: 平坦（DEM平坦率82-97%）
          elevFactor = 0.3;
          hillContrib = (hv1 - 0.5) * 0.08 * relief;
        }
        const heightVal = baseLevel + (detailNoise - 0.5) * elevFactor * relief + hillContrib;

        elevation[i] = Math.max(0, Math.min(1, heightVal * m));
      }
    }

    // ブラーで格子アーティファクトを滑らかにする
    for (let pass = 0; pass < 4; pass++) {
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
  const { width: w, height: h, elevation, flow, biomeId, rng, biomeRegistry } = ctx;
  const WATER_TH = 0.2;

  // ホットループ用に ID をキャッシュする
  const HILLS = biomeRegistry.idOf(BIOME_TAGS.Hills);
  const HIGHLAND = biomeRegistry.idOf(BIOME_TAGS.Highland);
  const BEACH = biomeRegistry.idOf(BIOME_TAGS.Beach);
  const OCEAN = biomeRegistry.idOf(BIOME_TAGS.Ocean);
  const ISLAND = biomeRegistry.idOf(BIOME_TAGS.Island);
  const LAKE = biomeRegistry.idOf(BIOME_TAGS.Lake);
  const CANYON = biomeRegistry.idOf(BIOME_TAGS.Canyon);
  const WETLAND = biomeRegistry.idOf(BIOME_TAGS.Wetland);
  const CLIFF = biomeRegistry.idOf(BIOME_TAGS.Cliff);
  const PLATEAU = biomeRegistry.idOf(BIOME_TAGS.Plateau);
  const ALLUVIAL = biomeRegistry.idOf(BIOME_TAGS.Alluvial);

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
          biomeId[i] = LAKE;
        } else {
          biomeId[i] = OCEAN;
        }
        continue;
      }

      // 島（マップ端に接しない小さい陸塊）
      if (isIsland[i] === 1) {
        biomeId[i] = ISLAND;
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
          biomeId[i] = CANYON;
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
          biomeId[i] = PLATEAU;
        } else {
          biomeId[i] = HIGHLAND;
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
          biomeId[i] = CLIFF;
          continue;
        }
      }

      // 湿地: 低地で流量が多い（川沿いの湿潤地帯）
      const localFlow = flow[i] ?? 0;
      if (localFlow > 200 && elev < WATER_TH + 0.08) {
        biomeId[i] = WETLAND;
        continue;
      }

      // 沖積平野: 大河川の近くの低地で平坦な場所（下町）
      // 丘陵: それ以外の中間標高（山の手）
      biomeId[i] = HILLS;
    }
  }

  // 砂浜配置
  placeBeaches(w, h, elevation, biomeId, beachNoise, cos3, sin3, ox3, oy3, biomeScale, WATER_TH, HILLS, BEACH);

  // 沖積平野配置: 大河川沿いの低地を Alluvial にする
  placeAlluvial(w, h, elevation, flow, biomeId, WATER_TH, HILLS, WETLAND, ALLUVIAL);
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
  HILLS: number, WETLAND: number, ALLUVIAL: number,
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
    if (biomeId[i] !== HILLS && biomeId[i] !== WETLAND) continue;
    const dist = riverDist[i] ?? Infinity;
    if (dist > ALLUVIAL_RADIUS) continue;
    const elev = elevation[i] ?? 0;
    // 低い場所ほど沖積平野になりやすい（標高に応じた距離閾値）
    const maxDist = ALLUVIAL_RADIUS * Math.max(0, 1 - (elev - waterTh) / 0.2);
    if (dist <= maxDist) {
      biomeId[i] = ALLUVIAL;
    }
  }
}

/**
 * バイオーム特有の地形加工ステージ:
 * バイオームに応じて標高を微調整する（湖の深度、渓谷の掘り込みなど）。
 */
/** biomeFeatures フェーズで共通に使う水面閾値 */
export const BIOME_WATER_TH = 0.2;

/** 沖積平野の平坦化: 大河川に向かってなだらかに下がる下町のような地形 */
export function applyAlluvialFlatten(ctx: StageContext): void {
  const { elevation, biomeId, biomeRegistry } = ctx;
  const ALLUVIAL = biomeRegistry.idOf(BIOME_TAGS.Alluvial);
  const size = elevation.length;
  for (let i = 0; i < size; i++) {
    if (biomeId[i] !== ALLUVIAL) continue;
    const elev = elevation[i] ?? 0;
    // 標高を水面に近づける（起伏を潰す）
    const target = BIOME_WATER_TH + 0.05;
    elevation[i] = target + (elev - target) * 0.3;
  }
}

export function applyBiomeFeatures(ctx: StageContext): void {
  const { width: w, height: h, elevation } = ctx;

  // 湖の深度を岸からの距離で設定する
  applyLakeDepth(ctx);

  // 渓谷をV字型に掘り込む（Canyon の中心が最も深く、縁はなだらかに Highland に戻る）
  carveCanyonVShape(ctx);

  // 沖積平野を平坦化する
  applyAlluvialFlatten(ctx);

  // 山頂を丸める: 高標高の平坦部を近傍の最低値に向かって削り、尾根状にする
  roundMountainTops(w, h, elevation);

  // 海底深度: 海岸から離れるほど深くする
  applyOceanDepth(ctx);

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
  HILLS: number, BEACH: number,
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
      if (biomeId[i] !== HILLS) continue;
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
    biomeId[si] = BEACH;
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
      if (biomeId[ni] !== HILLS) continue;
      // 標高が低い場所だけ広がる（高地に登らない）
      if ((elevation[ni] ?? 0) > waterTh + 0.06) continue;
      const nd = cd + 1;
      if (nd < (beachDist[ni] ?? Infinity)) {
        beachDist[ni] = nd;
        biomeId[ni] = BEACH;
        queue.push(ni);
      }
    }
  }
}

/**
 * 山頂の丸め処理:
 * 高標高の平坦な頂上部分を、周囲の最低値との差に応じて削る。
 * 結果として尾根はシャープに残り、広い平坦面だけが丸くなる。
 */
export function roundMountainTops(w: number, h: number, elevation: Float32Array): void {
  const ELEV_TH = 0.3; // この標高以上の高地に適用する
  const R = 3; // チェック半径

  // 各セルの近傍最低値を計算する
  const localMin = new Float32Array(w * h);
  for (let y = R; y < h - R; y++) {
    for (let x = R; x < w - R; x++) {
      const i = y * w + x;
      const here = elevation[i] ?? 0;
      if (here < ELEV_TH) { localMin[i] = here; continue; }

      let minH = here;
      for (let dy = -R; dy <= R; dy++) {
        for (let dx = -R; dx <= R; dx++) {
          if (dx * dx + dy * dy > R * R) continue;
          const nh = elevation[(y + dy) * w + (x + dx)] ?? 0;
          if (nh < minH) minH = nh;
        }
      }
      localMin[i] = minH;
    }
  }

  // 平坦な頂上を丸める: 近傍最低値との差が小さい（＝平坦）場所ほど削る
  for (let y = R; y < h - R; y++) {
    for (let x = R; x < w - R; x++) {
      const i = y * w + x;
      const here = elevation[i] ?? 0;
      if (here < ELEV_TH) continue;

      const minH = localMin[i] ?? 0;
      const localRelief = here - minH; // この地点の局所起伏

      // 局所起伏が小さい（平坦な頂上）場所を削る
      // 起伏が大きい場所（尾根の縁）は残す
      if (localRelief < 0.02) {
        // 近傍平均に向かって引き下げる（山頂を丸くする）
        let sum = 0; let cnt = 0;
        for (let dy = -R; dy <= R; dy++) {
          for (let dx = -R; dx <= R; dx++) {
            if (dx * dx + dy * dy > R * R) continue;
            sum += elevation[(y + dy) * w + (x + dx)] ?? 0;
            cnt++;
          }
        }
        const avg = sum / cnt;
        // 平均値に向かって30%引き下げる
        elevation[i] = here + (avg - here) * 0.3;
      }
    }
  }
}

/**
 * 渓谷のV字型掘り込み:
 * Canyon セルの中心からの距離でV字プロファイルを適用する。
 * さらに Canyon 周辺の Highland もなだらかに引き下げて三角の山にする。
 */
export function carveCanyonVShape(ctx: StageContext): void {
  const { width: w, height: h, elevation, biomeId, biomeRegistry } = ctx;
  const CANYON = biomeRegistry.idOf(BIOME_TAGS.Canyon);
  const waterTh = BIOME_WATER_TH;
  const size = w * h;
  const DX4 = [0, 1, 0, -1];
  const DY4 = [-1, 0, 1, 0];

  // Canyon セルから Highland へ向かってBFSで距離を計算する
  const canyonDist = new Float32Array(size).fill(Infinity);
  const queue: number[] = [];

  for (let i = 0; i < size; i++) {
    if (biomeId[i] === CANYON) {
      canyonDist[i] = 0;
      queue.push(i);
    }
  }

  // 渓谷の影響半径（V字の傾斜がかかる範囲）
  const V_RADIUS = Math.max(6, Math.floor(Math.min(w, h) * 0.025));
  let head = 0;
  while (head < queue.length) {
    const ci = queue[head++] ?? 0;
    const cd = canyonDist[ci] ?? 0;
    if (cd >= V_RADIUS) continue;
    const cx = ci % w; const cy = (ci - cx) / w;
    for (let d = 0; d < 4; d++) {
      const nx = cx + (DX4[d] ?? 0); const ny = cy + (DY4[d] ?? 0);
      if (nx < 0 || nx >= w || ny < 0 || ny >= h) continue;
      const ni = ny * w + nx;
      const nd = cd + 1;
      if (nd < (canyonDist[ni] ?? Infinity)) {
        canyonDist[ni] = nd;
        queue.push(ni);
      }
    }
  }

  // V字型に掘り込む
  for (let i = 0; i < size; i++) {
    const dist = canyonDist[i] ?? Infinity;
    if (dist >= V_RADIUS) continue;
    const elev = elevation[i] ?? 0;
    if (elev <= waterTh) continue;

    // V字プロファイル: dist=0 で谷底、dist=V_RADIUS で元の高さ
    const t = dist / V_RADIUS;
    // 谷底の深さ（元の標高の30%まで下げる）
    const valleyFloor = waterTh + (elev - waterTh) * 0.25;
    // V字の傾斜（t² で谷底付近が急、縁がなだらか）
    const profile = t * t;
    const targetElev = valleyFloor + (elev - valleyFloor) * profile;

    if (targetElev < elev) {
      elevation[i] = targetElev;
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
export function applyLakeDepth(ctx: StageContext): void {
  const { width: w, height: h, elevation, biomeId, biomeRegistry } = ctx;
  const LAKE = biomeRegistry.idOf(BIOME_TAGS.Lake);
  const size = w * h;
  const DX4 = [0, 1, 0, -1];
  const DY4 = [-1, 0, 1, 0];

  const lakeDist = new Float32Array(size).fill(-1);
  const queue: number[] = [];

  // Lake の岸セルを探す
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = y * w + x;
      if (biomeId[i] !== LAKE) continue;
      let isShore = false;
      for (let d = 0; d < 4; d++) {
        const nnx = x + (DX4[d] ?? 0); const nny = y + (DY4[d] ?? 0);
        if (nnx < 0 || nnx >= w || nny < 0 || nny >= h) { isShore = true; break; }
        if (biomeId[nny * w + nnx] !== LAKE) { isShore = true; break; }
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
      if (biomeId[ni] !== LAKE || (lakeDist[ni] ?? -1) >= 0) continue;
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
export function applyOceanDepth(ctx: StageContext): void {
  const { width: w, height: h, elevation, biomeId, biomeRegistry } = ctx;
  const LAKE = biomeRegistry.idOf(BIOME_TAGS.Lake);
  const waterTh = BIOME_WATER_TH;
  const size = w * h;
  const DX4 = [0, 1, 0, -1];
  const DY4 = [-1, 0, 1, 0];

  const coastDist = new Float32Array(size).fill(Infinity);
  const queue: number[] = [];

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = y * w + x;
      if ((elevation[i] ?? 0) >= waterTh) continue;
      if (biomeId[i] === LAKE) continue; // 湖は別処理済み

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
      if ((elevation[ni] ?? 0) >= waterTh || biomeId[ni] === LAKE) continue;
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
    if (biomeId[i] === LAKE) continue;
    const elev = elevation[i] ?? 0;
    if (elev >= waterTh) continue;
    const depthFactor = Math.min(1, dist / MAX_DIST);
    elevation[i] = elev * (1 - depthFactor * 0.7);
  }
}

/** 分離型 7-tap ガウシアンブラー */
export function smoothElevation(elevation: Float32Array, w: number, h: number): void {
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
