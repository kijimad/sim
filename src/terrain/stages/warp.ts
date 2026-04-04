import type { StageContext } from "../context.js";
import { createTileNoise } from "../noise.js";

/**
 * ドメインワーピング + 区域roughnessで起伏を加える:
 * - ノイズの入力をノイズで歪ませて自然な地形を作る
 * - roughness（provinces で flow に格納済み）で振幅を制御する
 * - 平原は平坦、山岳は急峻になる
 */
export function domainWarp(ctx: StageContext): void {
  const { width: w, height: h, elevation, flow, rng } = ctx;
  const ns = ctx.noiseSize;

  // ワーピング用ノイズ
  const warpX = createTileNoise(rng, ns, w, h, 80);
  const warpY = createTileNoise(rng, ns, w, h, 80);
  // 地形ディテールノイズ（複数オクターブ）
  const detail1 = createTileNoise(rng, ns, w, h, 48);
  const detail2 = createTileNoise(rng, ns, w, h, 24);
  const detail3 = createTileNoise(rng, ns, w, h, 12);

  // ワーピング強度（タイル単位）
  const warpStrength = ns * 0.08;

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = y * w + x;
      const roughness = flow[i] ?? 0; // provinces が格納した roughness

      // ドメインワーピング: ノイズで座標を歪ませる
      const wx = x + (warpX(x, y) - 0.5) * warpStrength;
      const wy = y + (warpY(x, y) - 0.5) * warpStrength;

      // FBM: 歪んだ座標でノイズを重ねる
      const n1 = detail1(wx, wy);
      const n2 = detail2(wx, wy);
      const n3 = detail3(wx, wy);
      const fbm = n1 * 0.5 + n2 * 0.3 + n3 * 0.2;

      // roughness で振幅を制御する: 平原(0.02)→微小、山岳(0.25)→中程度
      const detail = (fbm - 0.5) * roughness * ctx.relief * 0.8;

      elevation[i] = Math.max(0, Math.min(1, (elevation[i] ?? 0) + detail));
    }
  }

  // flow を清掃する（roughness の一時保存を消す）
  flow.fill(0);
}
