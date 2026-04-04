import type { StageContext } from "../context.js";

/**
 * fBm with gradient noise:
 * 各オクターブに独立したハッシュ・ランダム回転・ランダムオフセットを使い
 * 格子の整列を完全に崩す。ドメインワーピングは使わない（格子を増幅するため）。
 */
export function continentShape(ctx: StageContext): void {
  const { width: w, height: h, elevation, rng, relief } = ctx;

  const baseFreq = 1 / 64;
  const numOctaves = Math.min(14, 8 + Math.floor(Math.log2(Math.max(1, ctx.noiseSize / 64))));

  // 各オクターブに独立した勾配ノイズ + 回転 + オフセット
  const octaves: { noise: (x: number, y: number) => number; cos: number; sin: number; ox: number; oy: number }[] = [];
  for (let i = 0; i < numOctaves; i++) {
    const angle = rng() * Math.PI * 2;
    octaves.push({
      noise: createGradientNoise(rng),
      cos: Math.cos(angle),
      sin: Math.sin(angle),
      ox: rng() * 1000 - 500,
      oy: rng() * 1000 - 500,
    });
  }

  // 格子整列を崩すために2つの異なる基本周波数でfBmを合成する
  // 互いの格子線がずれるため、整列が相殺される
  const baseFreq2 = 1 / 49; // 素数に近い値で格子をずらす
  const octaves2: typeof octaves = [];
  for (let i = 0; i < numOctaves; i++) {
    const angle = rng() * Math.PI * 2;
    octaves2.push({
      noise: createGradientNoise(rng),
      cos: Math.cos(angle),
      sin: Math.sin(angle),
      ox: rng() * 1000 - 500,
      oy: rng() * 1000 - 500,
    });
  }

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let value = 0;
      let amplitude = 1;
      let frequency = baseFreq;
      let totalAmp = 0;

      for (let oct = 0; oct < numOctaves; oct++) {
        const o = octaves[oct];
        if (o === undefined) continue;
        const fx = x * frequency;
        const fy = y * frequency;
        // オクターブごとに回転 + オフセット（格子整列を崩す）
        const rx = fx * o.cos - fy * o.sin + o.ox;
        const ry = fx * o.sin + fy * o.cos + o.oy;
        value += o.noise(rx, ry) * amplitude;
        totalAmp += amplitude;
        amplitude *= 0.5;
        frequency *= 2;
      }
      value /= totalAmp;

      // 2つめのfBm（異なる基本周波数で格子線をずらす）
      let value2 = 0;
      let amp2 = 1;
      let freq2 = baseFreq2;
      let totalAmp2 = 0;
      for (let oct = 0; oct < numOctaves; oct++) {
        const o = octaves2[oct];
        if (o === undefined) continue;
        const fx2 = x * freq2;
        const fy2 = y * freq2;
        const rx2 = fx2 * o.cos - fy2 * o.sin + o.ox;
        const ry2 = fx2 * o.sin + fy2 * o.cos + o.oy;
        value2 += o.noise(rx2, ry2) * amp2;
        totalAmp2 += amp2;
        amp2 *= 0.5;
        freq2 *= 2;
      }
      value2 /= totalAmp2;

      // 2つのfBmをブレンド（格子線が互いに相殺される）
      const blended = value * 0.6 + value2 * 0.4;

      // 端フォールオフ
      const nx = x / w;
      const ny = y / h;
      const edgeX = Math.min(nx, 1 - nx) * 2;
      const edgeY = Math.min(ny, 1 - ny) * 2;
      const edgeDist = Math.min(edgeX, edgeY);
      const edgeMask = Math.min(1, edgeDist * 8);

      const baseLevel = 0.35;
      const heightVal = baseLevel + (blended - 0.5) * 2.0 * relief;

      elevation[y * w + x] = Math.max(0, Math.min(1, heightVal * edgeMask));
    }
  }

  // 分離ガウシアンブラーで格子の段差を滑らかにする（7tap、5パス）
  for (let pass = 0; pass < 5; pass++) {
    smoothElevation(elevation, w, h);
  }
}

/**
 * 分離型 7-tap ガウシアンブラー（水平→垂直）:
 * カーネル重み [1, 6, 15, 20, 15, 6, 1] / 64 — radius=3 で格子境界を広く平滑化する。
 */
function smoothElevation(elevation: Float32Array, w: number, h: number): void {
  const temp = new Float32Array(w * h);
  // 7-tap ガウシアンカーネル（二項分布 n=6）
  const K = [1, 6, 15, 20, 15, 6, 1];
  const KSUM = 64;

  // 水平パス
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

  // 垂直パス
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

// --- 勾配ノイズ（Perlin式、独立ハッシュ、連続角度勾配） ---

export function createGradientNoise(rng: () => number): (x: number, y: number) => number {
  // 大きなパーミュテーションテーブル（4096エントリ）でパターン繰り返しを防ぐ
  const TABLE_SIZE = 4096;
  const MASK = TABLE_SIZE - 1;
  const perm = new Uint16Array(TABLE_SIZE * 2);
  const angles = new Float32Array(TABLE_SIZE);

  // シャッフルしたパーミュテーション
  const p = new Uint16Array(TABLE_SIZE);
  for (let i = 0; i < TABLE_SIZE; i++) p[i] = i;
  for (let i = TABLE_SIZE - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    const tmp = p[i] ?? 0;
    p[i] = p[j] ?? 0;
    p[j] = tmp;
  }
  for (let i = 0; i < TABLE_SIZE * 2; i++) perm[i] = p[i & MASK] ?? 0;

  // 連続角度の勾配テーブル（cos/sin をプリ計算）
  const gradX = new Float32Array(TABLE_SIZE);
  const gradY = new Float32Array(TABLE_SIZE);
  for (let i = 0; i < TABLE_SIZE; i++) {
    angles[i] = rng() * Math.PI * 2;
    gradX[i] = Math.cos(angles[i] ?? 0);
    gradY[i] = Math.sin(angles[i] ?? 0);
  }

  const gradDot = (idx: number, dx: number, dy: number): number => {
    const gi = idx & MASK;
    return (gradX[gi] ?? 0) * dx + (gradY[gi] ?? 0) * dy;
  };

  return (x: number, y: number): number => {
    const xi = Math.floor(x);
    const yi = Math.floor(y);
    const fx = x - xi;
    const fy = y - yi;

    // 5次 smoothstep
    const sx = fx * fx * fx * (fx * (fx * 6 - 15) + 10);
    const sy = fy * fy * fy * (fy * (fy * 6 - 15) + 10);

    const xi0 = xi & MASK;
    const yi0 = yi & MASK;
    const xi1 = (xi + 1) & MASK;
    const yi1 = (yi + 1) & MASK;

    const h00 = perm[(perm[xi0] ?? 0) + yi0] ?? 0;
    const h10 = perm[(perm[xi1] ?? 0) + yi0] ?? 0;
    const h01 = perm[(perm[xi0] ?? 0) + yi1] ?? 0;
    const h11 = perm[(perm[xi1] ?? 0) + yi1] ?? 0;

    const g00 = gradDot(h00, fx, fy);
    const g10 = gradDot(h10, fx - 1, fy);
    const g01 = gradDot(h01, fx, fy - 1);
    const g11 = gradDot(h11, fx - 1, fy - 1);

    const top = g00 + (g10 - g00) * sx;
    const bottom = g01 + (g11 - g01) * sx;
    return (top + (bottom - top) * sy) * 0.7 + 0.5;
  };
}

/** 群島形状 */
export function islandShape(ctx: StageContext): void {
  const { width: w, height: h, elevation, rng } = ctx;
  const n1 = createGradientNoise(rng);
  const n2 = createGradientNoise(rng);

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const freq = 1 / 64;
      const v1 = n1(x * freq, y * freq);
      const v2 = n2(x * freq * 2, y * freq * 2);
      const v = v1 * 0.6 + v2 * 0.4;
      elevation[y * w + x] = Math.max(0, v - 0.35) * 2.5;
    }
  }
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
