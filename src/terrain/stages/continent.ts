import type { StageContext } from "../context.js";

/** マスク関数の型: 正規化座標(0〜1)を受け取り、0〜1のマスク値を返す */
type MaskFn = (nx: number, ny: number, rng: () => number) => number;

/**
 * fBm + マスクによる地形生成の共通処理。
 * マスク関数で陸地の形状を制御する。
 */
function generateWithMask(ctx: StageContext, mask: MaskFn): void {
  const { width: w, height: h, elevation, rng, relief } = ctx;

  const baseFreq = 1 / 64;
  const numOctaves = Math.min(14, 8 + Math.floor(Math.log2(Math.max(1, ctx.noiseSize / 64))));

  // 各オクターブに独立した勾配ノイズ + 回転 + オフセット
  type OctaveData = { noise: (x: number, y: number) => number; cos: number; sin: number; ox: number; oy: number };
  const octaves: OctaveData[] = [];
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
  const baseFreq2 = 1 / 49;
  const octaves2: OctaveData[] = [];
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
        const rx = fx * o.cos - fy * o.sin + o.ox;
        const ry = fx * o.sin + fy * o.cos + o.oy;
        value += o.noise(rx, ry) * amplitude;
        totalAmp += amplitude;
        amplitude *= 0.5;
        frequency *= 2;
      }
      value /= totalAmp;

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

      const blended = value * 0.6 + value2 * 0.4;

      // マスク適用
      const nx = x / w;
      const ny = y / h;
      const m = mask(nx, ny, rng);

      const baseLevel = 0.35;
      const heightVal = baseLevel + (blended - 0.5) * 2.0 * relief;

      elevation[y * w + x] = Math.max(0, Math.min(1, heightVal * m));
    }
  }

  // 分離ガウシアンブラーで格子の段差を滑らかにする（7tap、5パス）
  for (let pass = 0; pass < 5; pass++) {
    smoothElevation(elevation, w, h);
  }
}

/** 大陸型: 中央に大きな1つの大陸 */
export function continentShape(ctx: StageContext): void {
  generateWithMask(ctx, (nx, ny) => {
    const edgeX = Math.min(nx, 1 - nx) * 2;
    const edgeY = Math.min(ny, 1 - ny) * 2;
    const edgeDist = Math.min(edgeX, edgeY);
    return Math.min(1, edgeDist * 8);
  });
}

/** 2島型: 左右に2つの島 */
export function twoIslands(ctx: StageContext): void {
  generateWithMask(ctx, (nx, ny) => {
    // 左の島（中心 0.25, 0.5）— 楕円形で分離を確保する
    const dx1 = (nx - 0.25) * 3.5;
    const dy1 = (ny - 0.5) * 2.5;
    const d1 = Math.sqrt(dx1 * dx1 + dy1 * dy1);
    const m1 = Math.max(0, 1 - d1);
    // 右の島（中心 0.75, 0.5）
    const dx2 = (nx - 0.75) * 3.5;
    const dy2 = (ny - 0.5) * 2.5;
    const d2 = Math.sqrt(dx2 * dx2 + dy2 * dy2);
    const m2 = Math.max(0, 1 - d2);
    // 中央の海峡を確保するために中央部を強く沈める
    const centerGap = Math.exp(-((nx - 0.5) * (nx - 0.5)) / 0.005) * 0.8;
    return Math.min(1, Math.max(0, (m1 + m2) * 2.5 - centerGap));
  });
}

/** 多島型: 複数の小島が散在する群島 */
export function multiIslands(ctx: StageContext): void {
  // ノイズでランダムな島の配置を決める
  const islandNoise = createGradientNoise(ctx.rng);
  const angle = ctx.rng() * Math.PI * 2;
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  const ox = ctx.rng() * 500;
  const oy = ctx.rng() * 500;

  generateWithMask(ctx, (nx, ny) => {
    // 端フォールオフ
    const edgeX = Math.min(nx, 1 - nx) * 2;
    const edgeY = Math.min(ny, 1 - ny) * 2;
    const edge = Math.min(1, Math.min(edgeX, edgeY) * 4);
    // 低周波ノイズで島のパターンを作る
    const freq = 4;
    const fx = nx * freq;
    const fy = ny * freq;
    const nv = islandNoise(fx * cos - fy * sin + ox, fx * sin + fy * cos + oy);
    // ノイズ値が高い箇所だけ陸地にする（島が点在する）
    const landMask = Math.max(0, (nv - 0.35) * 3);
    return Math.min(1, landMask * edge);
  });
}

/** 細長い島型: 横に長い島 */
export function elongatedIsland(ctx: StageContext): void {
  // ノイズで海岸線を不規則にする
  const coastNoise = createGradientNoise(ctx.rng);
  const cAngle = ctx.rng() * Math.PI * 2;
  const cCos = Math.cos(cAngle);
  const cSin = Math.sin(cAngle);
  const cOx = ctx.rng() * 500;
  const cOy = ctx.rng() * 500;

  generateWithMask(ctx, (nx, ny) => {
    // 中央の帯（y方向に狭く、x方向に長い）
    const centerDist = Math.abs(ny - 0.5) * 2;
    // 海岸線ノイズで幅を不規則にする
    const coastVar = coastNoise(nx * 3 * cCos - ny * 3 * cSin + cOx,
                                 nx * 3 * cSin + ny * 3 * cCos + cOy) * 0.15;
    const width = 0.35 + coastVar;
    const bandMask = Math.max(0, 1 - centerDist / width);
    // x方向の端フォールオフ
    const edgeX = Math.min(nx, 1 - nx) * 2;
    const xFade = Math.min(1, edgeX * 6);
    return Math.min(1, bandMask * bandMask * xFade * 2);
  });
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
