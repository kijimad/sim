import type { Strategy } from "../slots.js";
import { erode } from "../stages/erosion.js";

/**
 * 粒子ベース水力侵食 (legacy)。
 *
 * 本来は erosion スロットの意味合いだが、legacy パイプラインの実行順序を
 * 維持するため macroshape スロットに配置する。SPL 実装完了後 (P6) に erosion
 * スロットへ移動する見込み。
 */
export const particleErode = (): Strategy => ({
  name: "particleErode",
  slot: "macroshape",
  run: erode,
});
