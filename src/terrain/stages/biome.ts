import type { StageContext } from "../context.js";
import { createGradientNoise } from "./continent.js";

/**
 * ノイズベースのバイオームゾーニング:
 * 勾配ノイズ（格子アーティファクトなし）で「平原度」と「山岳度」を制御する。
 */
export function applyBiomes(ctx: StageContext): void {
  const { width: w, height: h, elevation, rng, relief } = ctx;

  // バイオーム用の低周波勾配ノイズ + ランダム回転
  const biomeNoise = createGradientNoise(rng);
  const angle = rng() * Math.PI * 2;
  const bcos = Math.cos(angle);
  const bsin = Math.sin(angle);
  const box = rng() * 1000;
  const boy = rng() * 1000;
  const biomeFreq = 1 / 200;

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = y * w + x;

      // 回転 + オフセットで格子整列を崩す
      const fx = x * biomeFreq;
      const fy = y * biomeFreq;
      const rx = fx * bcos - fy * bsin + box;
      const ry = fx * bsin + fy * bcos + boy;
      const bv = biomeNoise(rx, ry);
      const biomeVal = Math.max(0, Math.min(1, bv));

      const baseHeight = biomeVal * biomeVal * 0.25;
      // roughness の最小値を高くして、平原でも起伏を残す
      const roughness = 0.6 + biomeVal * 0.6;

      const current = elevation[i] ?? 0;
      const deviation = current - 0.35;
      elevation[i] = Math.max(0, Math.min(1,
        0.35 + baseHeight * relief + deviation * roughness * relief,
      ));
    }
  }
}
