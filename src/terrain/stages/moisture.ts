import type { StageContext } from "../context.js";

/** 湿度マップ: 河川の流量から周囲に拡散する */
export function computeMoisture(ctx: StageContext): void {
  const { width: w, height: h, flow, moisture } = ctx;
  const radius = Math.max(3, Math.min(8, Math.round(w / 64)));

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const f = flow[y * w + x] ?? 0;
      if (f < 20) continue;

      const moistureVal = Math.min(1, Math.log(1 + f) * 0.1);
      for (let dy = -radius; dy <= radius; dy++) {
        for (let dx = -radius; dx <= radius; dx++) {
          const nx = x + dx;
          const ny = y + dy;
          if (nx < 0 || nx >= w || ny < 0 || ny >= h) continue;
          const dist = Math.sqrt(dx * dx + dy * dy);
          if (dist > radius) continue;
          const falloff = 1 - dist / radius;
          const ni = ny * w + nx;
          moisture[ni] = Math.max(moisture[ni] ?? 0, moistureVal * falloff);
        }
      }
    }
  }
}
