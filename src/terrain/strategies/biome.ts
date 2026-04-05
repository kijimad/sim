import type { Strategy } from "../slots.js";
import { assignBiomes } from "../stages/biome.js";

/**
 * 幾何的バイオーム割当 (legacy)。
 * 既存 `assignBiomes` をラップ。
 *
 * 将来的にはここに Holdridge 等の気候駆動バイオーム決定が並ぶ。
 */
export const geometric = (): Strategy => ({
  name: "geometric",
  slot: "biome",
  run: assignBiomes,
  requires: ["elevation", "flow"],
  provides: ["biomeId"],
});
