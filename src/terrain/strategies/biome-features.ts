import type { Strategy } from "../slots.js";
import {
  applyLakeDepth,
  carveCanyonVShape,
  applyAlluvialFlatten,
  roundMountainTops,
  applyOceanDepth,
  smoothElevation,
} from "../stages/biome.js";
import { flattenValleys as flattenValleysStage } from "../stages/erosion.js";

/**
 * biomeFeatures スロット用のストラテジ群。
 *
 * P2 では legacy `applyBiomeFeatures` の内部処理と、その後に走る `flattenValleys` を
 * 個別のストラテジに分解する。配列の順序は legacy 実行順を厳密に再現する:
 *
 *   1. lakeDepth
 *   2. canyonCarve
 *   3. alluvialFlatten
 *   4. roundPeaks
 *   5. oceanDepth
 *   6. smoothPass
 *   7. smoothPass
 *   8. flattenValleys  (Flat Rivers パイプラインでは省略)
 */

export const lakeDepth = (): Strategy => ({
  name: "lakeDepth",
  slot: "biomeFeatures",
  run: applyLakeDepth,
  requires: ["elevation", "biomeId"],
  provides: ["elevation"],
});

export const canyonCarve = (): Strategy => ({
  name: "canyonCarve",
  slot: "biomeFeatures",
  run: carveCanyonVShape,
  requires: ["elevation", "biomeId"],
  provides: ["elevation"],
});

export const alluvialFlatten = (): Strategy => ({
  name: "alluvialFlatten",
  slot: "biomeFeatures",
  run: applyAlluvialFlatten,
  requires: ["elevation", "biomeId"],
  provides: ["elevation"],
});

export const roundPeaks = (): Strategy => ({
  name: "roundPeaks",
  slot: "biomeFeatures",
  run: (ctx) => {
    roundMountainTops(ctx.width, ctx.height, ctx.elevation);
  },
  requires: ["elevation"],
  provides: ["elevation"],
});

export const oceanDepth = (): Strategy => ({
  name: "oceanDepth",
  slot: "biomeFeatures",
  run: applyOceanDepth,
  requires: ["elevation", "biomeId"],
  provides: ["elevation"],
});

export const smoothPass = (): Strategy => ({
  name: "smoothPass",
  slot: "biomeFeatures",
  run: (ctx) => {
    smoothElevation(ctx.elevation, ctx.width, ctx.height);
  },
  requires: ["elevation"],
  provides: ["elevation"],
});

export const flattenValleys = (): Strategy => ({
  name: "flattenValleys",
  slot: "biomeFeatures",
  run: flattenValleysStage,
  requires: ["elevation", "flow"],
  provides: ["elevation"],
});
