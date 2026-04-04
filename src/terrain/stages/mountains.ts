import type { StageContext } from "../context.js";
import { createTileNoise } from "../noise.js";

/** 山岳の細部を追加 */
export function mountainRanges(ctx: StageContext): void {
  const { width: w, height: h, elevation, rng } = ctx;
  const detail = createTileNoise(rng, ctx.noiseSize, w, h, 32);

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = y * w + x;
      const base = elevation[i] ?? 0;
      if (base > 0.4) {
        const mask = (base - 0.4) / 0.6;
        const d = (detail(x, y) - 0.5) * 0.1 * mask;
        elevation[i] = Math.max(0, Math.min(1, base + d));
      }
    }
  }
}
