import type { StageContext } from "../context.js";
import { createTileNoise } from "../noise.js";

/** 細部ノイズを加算する */
export function fbmDetail(ctx: StageContext): void {
  const { width: w, height: h, elevation, rng } = ctx;
  const fine = createTileNoise(rng, ctx.noiseSize, w, h, 24);
  const micro = createTileNoise(rng, ctx.noiseSize, w, h, 10);

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = y * w + x;
      const d = fine(x, y) * 0.06 + micro(x, y) * 0.03;
      elevation[i] = Math.max(0, Math.min(1, (elevation[i] ?? 0) + d - 0.045));
    }
  }
}
