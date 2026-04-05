import type { TerrainStage } from "./context.js";
import { continentShape, twoIslands, multiIslands, elongatedIsland, flatPlains } from "./stages/continent.js";
import { formBays } from "./stages/bay.js";
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
  stages: [continentShape, applyBiomes, formBays, erode, computeRivers, flattenValleys],
};

/** 2島型 */
export const TWO_ISLANDS: TerrainPipeline = {
  name: "Two Islands",
  stages: [twoIslands, applyBiomes, formBays, erode, computeRivers, flattenValleys],
};

/** 多島型（群島） */
export const ARCHIPELAGO: TerrainPipeline = {
  name: "Archipelago",
  stages: [multiIslands, applyBiomes, formBays, erode, computeRivers, flattenValleys],
};

/** 細長い島 */
export const ELONGATED: TerrainPipeline = {
  name: "Elongated Island",
  stages: [elongatedIsland, applyBiomes, formBays, erode, computeRivers, flattenValleys],
};

/** 平原 + 川 */
export const FLAT_RIVERS: TerrainPipeline = {
  name: "Flat Rivers",
  stages: [flatPlains, erode, computeRivers],
};

export const ALL_PIPELINES: readonly TerrainPipeline[] = [
  STANDARD, TWO_ISLANDS, ARCHIPELAGO, ELONGATED, FLAT_RIVERS,
];
