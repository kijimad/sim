import type { Strategy } from "../slots.js";
import {
  continentShape as continentShapeStage,
  twoIslands as twoIslandsStage,
  multiIslands as multiIslandsStage,
  randomShape as randomShapeStage,
  flatPlains as flatPlainsStage,
} from "../stages/continent.js";

/**
 * landmass スロット用のストラテジ群。
 *
 * 各ストラテジは対応する既存ステージ関数を呼ぶだけの薄いラッパー。
 * P2 では挙動を一切変えず、P1 で導入したスロット構造に既存ロジックを載せ替える。
 */

export const continentShape = (): Strategy => ({
  name: "continentShape",
  slot: "landmass",
  run: continentShapeStage,
  provides: ["elevation"],
});

export const twoIslands = (): Strategy => ({
  name: "twoIslands",
  slot: "landmass",
  run: twoIslandsStage,
  provides: ["elevation"],
});

export const multiIslands = (): Strategy => ({
  name: "multiIslands",
  slot: "landmass",
  run: multiIslandsStage,
  provides: ["elevation"],
});

export const randomShape = (): Strategy => ({
  name: "randomShape",
  slot: "landmass",
  run: randomShapeStage,
  provides: ["elevation"],
});

export const flatPlains = (): Strategy => ({
  name: "flatPlains",
  slot: "landmass",
  run: flatPlainsStage,
  provides: ["elevation"],
});
