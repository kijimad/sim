import type { TerrainStage } from "./context.js";
import { randomShape, continentShape, twoIslands, multiIslands, flatPlains } from "./stages/continent.js";
import { assignBiomes, applyBiomeFeatures } from "./stages/biome.js";
import { erode, flattenValleys } from "./stages/erosion.js";
import { computeRivers } from "./stages/rivers.js";

export interface TerrainPipeline {
  readonly name: string;
  readonly stages: readonly TerrainStage[];
}

// 新しいパイプライン順序:
// 1. 基本標高生成（fBm + マスク）
// 2. 侵食・河川（自然な水流を形成）
// 3. バイオーム割当（標高・流量に基づく）
// 4. バイオーム特有の加工（湖深度、渓谷掘り込みなど）
// 5. 谷の拡張

/** ランダム */
export const RANDOM: TerrainPipeline = {
  name: "Random",
  stages: [randomShape, erode, computeRivers, assignBiomes, applyBiomeFeatures, flattenValleys],
};

/** 大陸型 */
export const CONTINENT: TerrainPipeline = {
  name: "Continent",
  stages: [continentShape, erode, computeRivers, assignBiomes, applyBiomeFeatures, flattenValleys],
};

/** 2島型 */
export const TWO_ISLANDS: TerrainPipeline = {
  name: "Two Islands",
  stages: [twoIslands, erode, computeRivers, assignBiomes, applyBiomeFeatures, flattenValleys],
};

/** 多島型（群島） */
export const ARCHIPELAGO: TerrainPipeline = {
  name: "Archipelago",
  stages: [multiIslands, erode, computeRivers, assignBiomes, applyBiomeFeatures, flattenValleys],
};

/** 平原 + 川 */
export const FLAT_RIVERS: TerrainPipeline = {
  name: "Flat Rivers",
  stages: [flatPlains, erode, computeRivers, assignBiomes, applyBiomeFeatures],
};

export const ALL_PIPELINES: readonly TerrainPipeline[] = [
  RANDOM, CONTINENT, TWO_ISLANDS, ARCHIPELAGO, FLAT_RIVERS,
];
