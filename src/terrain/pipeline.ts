import type { TerrainStage } from "./context.js";
import { continentShape, islandShape, flatPlains } from "./stages/continent.js";
import { applyBiomes } from "./stages/biome.js";
import { erode, flattenValleys } from "./stages/erosion.js";
import { computeRivers } from "./stages/rivers.js";

export interface TerrainPipeline {
  readonly name: string;
  readonly stages: readonly TerrainStage[];
}

/** 標準: fBm + バイオーム区分 + 水力侵食 + 河川 + 氾濫原 */
export const STANDARD: TerrainPipeline = {
  name: "Standard",
  stages: [continentShape, applyBiomes, erode, computeRivers, flattenValleys],
};

/** 群島マップ */
export const ARCHIPELAGO: TerrainPipeline = {
  name: "Archipelago",
  stages: [islandShape, erode, computeRivers],
};

/** 平原 + 川 */
export const FLAT_RIVERS: TerrainPipeline = {
  name: "Flat Rivers",
  stages: [flatPlains, erode, computeRivers],
};

export const ALL_PIPELINES: readonly TerrainPipeline[] = [STANDARD, ARCHIPELAGO, FLAT_RIVERS];
