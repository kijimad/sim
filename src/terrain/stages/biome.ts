import type { StageContext } from "../context.js";
import { Biome } from "../context.js";
import { createGradientNoise } from "./continent.js";

/**
 * ノイズベースのバイオームゾーニング:
 * 2軸のノイズ（気温・湿度に相当）でバイオーム種別を決定し、
 * 各バイオームに応じた標高変調を適用する。
 */
export function applyBiomes(ctx: StageContext): void {
  const { width: w, height: h, elevation, biomeId, rng, relief } = ctx;

  // バイオーム軸1: 高度感（Highland / Plains の軸）
  const noise1 = createGradientNoise(rng);
  const a1 = rng() * Math.PI * 2;
  const cos1 = Math.cos(a1);
  const sin1 = Math.sin(a1);
  const ox1 = rng() * 1000;
  const oy1 = rng() * 1000;

  // バイオーム軸2: 乾燥度（Desert の軸）
  const noise2 = createGradientNoise(rng);
  const a2 = rng() * Math.PI * 2;
  const cos2 = Math.cos(a2);
  const sin2 = Math.sin(a2);
  const ox2 = rng() * 1000;
  const oy2 = rng() * 1000;

  // バイオーム軸3: 湖ノイズ（内陸の低地に湖を配置する）
  const noise3 = createGradientNoise(rng);
  const a3 = rng() * Math.PI * 2;
  const cos3 = Math.cos(a3);
  const sin3 = Math.sin(a3);
  const ox3 = rng() * 1000;
  const oy3 = rng() * 1000;

  // 128タイル単位でバイオームが変わるスケール
  const biomeFreq = 1 / 128;

  const WATER_TH = 0.2;

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = y * w + x;
      const current = elevation[i] ?? 0;

      // 軸1: 高度感ノイズ
      const fx = x * biomeFreq;
      const fy = y * biomeFreq;
      const v1 = noise1(fx * cos1 - fy * sin1 + ox1, fx * sin1 + fy * cos1 + oy1);
      const highland = Math.max(0, Math.min(1, v1));

      // 軸2: 乾燥度ノイズ
      const v2 = noise2(fx * cos2 - fy * sin2 + ox2, fx * sin2 + fy * cos2 + oy2);
      const aridity = Math.max(0, Math.min(1, v2));

      // 水域は Ocean バイオーム
      if (current < WATER_TH) {
        biomeId[i] = Biome.Ocean;
        continue;
      }

      // 軸3: 湖ノイズ
      const lakeFreq = biomeFreq * 1.5; // 湖はやや小さいスケール
      const lfx = x * lakeFreq;
      const lfy = y * lakeFreq;
      const v3 = noise3(lfx * cos3 - lfy * sin3 + ox3, lfx * sin3 + lfy * cos3 + oy3);
      const lakeVal = Math.max(0, Math.min(1, v3));

      // 陸地バイオーム決定（128タイル単位で劇的に変化する）
      let biome: Biome;
      if (highland > 0.55) {
        biome = Biome.Highland;
      } else if (aridity > 0.65 && highland < 0.45) {
        biome = Biome.Desert;
      } else if (lakeVal > 0.72 && highland < 0.45 && aridity < 0.5) {
        // 低地かつ湿潤なエリアに湖を配置する
        biome = Biome.Lake;
      } else {
        biome = Biome.Plains;
      }
      // Bay は formBays で後から設定される

      biomeId[i] = biome;

      // バイオームごとの標高変調（劇的な差を出す）
      const deviation = current - 0.35;
      let newElev: number;

      if (biome === Biome.Lake) {
        // 湖: 標高を水面以下に沈降させる
        const lakePower = (lakeVal - 0.72) / 0.28; // 0〜1
        newElev = WATER_TH - lakePower * 0.1;
      } else if (biome === Biome.Highland) {
        // 山岳地帯: 大幅に持ち上げて急峻な地形にする
        const baseHeight = highland * highland * 0.35;
        const roughness = 0.8 + highland * 0.6;
        newElev = 0.35 + baseHeight * relief + deviation * roughness * relief;
      } else if (biome === Biome.Desert) {
        // 砂漠: 平坦で標高が低い
        const roughness = 0.25 + aridity * 0.15;
        newElev = 0.25 + deviation * roughness * relief;
      } else {
        // 平原: 中程度の起伏
        const roughness = 0.5 + highland * 0.4;
        newElev = 0.35 + deviation * roughness * relief;
      }

      elevation[i] = Math.max(0, Math.min(1, newElev));
    }
  }

  // 海洋の深度変調: 海岸から離れるほど深くする
  applyOceanDepth(ctx, WATER_TH);
}

/** 海岸からの距離に基づいて海底の深度を変調する */
function applyOceanDepth(ctx: StageContext, waterTh: number): void {
  const { width: w, height: h, elevation } = ctx;
  const size = w * h;
  const DX = [0, 1, 0, -1];
  const DY = [-1, 0, 1, 0];

  // 海岸線（水域で隣接に陸地がある）からの距離を計算する
  const coastDist = new Float32Array(size).fill(Infinity);
  const queue: number[] = [];

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = y * w + x;
      if ((elevation[i] ?? 0) >= waterTh) continue;

      let nearLand = false;
      for (let d = 0; d < 4; d++) {
        const nx = x + (DX[d] ?? 0);
        const ny = y + (DY[d] ?? 0);
        if (nx < 0 || nx >= w || ny < 0 || ny >= h) continue;
        if ((elevation[ny * w + nx] ?? 0) >= waterTh) {
          nearLand = true;
          break;
        }
      }
      // マップ端の水域も海岸線扱い（外海への接続）
      if (nearLand || x === 0 || x === w - 1 || y === 0 || y === h - 1) {
        coastDist[i] = 0;
        queue.push(i);
      }
    }
  }

  const MAX_DEPTH_DIST = Math.max(20, Math.floor(Math.min(w, h) * 0.15));
  let head = 0;
  while (head < queue.length) {
    const ci = queue[head++] ?? 0;
    const cx = ci % w;
    const cy = (ci - cx) / w;
    const cd = coastDist[ci] ?? 0;
    if (cd >= MAX_DEPTH_DIST) continue;

    for (let d = 0; d < 4; d++) {
      const nx = cx + (DX[d] ?? 0);
      const ny = cy + (DY[d] ?? 0);
      if (nx < 0 || nx >= w || ny < 0 || ny >= h) continue;
      const ni = ny * w + nx;
      if ((elevation[ni] ?? 0) >= waterTh) continue;
      const nd = cd + 1;
      if (nd < (coastDist[ni] ?? Infinity)) {
        coastDist[ni] = nd;
        queue.push(ni);
      }
    }
  }

  // 海岸からの距離に応じて標高を下げる（深海化）
  for (let i = 0; i < size; i++) {
    const dist = coastDist[i] ?? Infinity;
    if (dist === Infinity || dist === 0) continue;
    const elev = elevation[i] ?? 0;
    if (elev >= waterTh) continue;

    // 距離に応じた深度（浅海→深海のグラデーション）
    const depthFactor = Math.min(1, dist / MAX_DEPTH_DIST);
    // 元の標高をさらに下げる（海岸付近は浅く、沖合は深い）
    elevation[i] = elev * (1 - depthFactor * 0.7);
  }
}
