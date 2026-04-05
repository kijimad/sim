import type { Pipeline } from "./slots.js";
import { noopStrategy } from "./slots.js";
import {
  continentShape,
  twoIslands as twoIslandsLandmass,
  multiIslands,
  randomShape,
  flatPlains,
} from "./strategies/landmass.js";
import { particleErode } from "./strategies/macroshape.js";
import { latitudeWind } from "./strategies/climate.js";
import { priorityFlood } from "./strategies/hydrology.js";
import { streamPowerLaw } from "./strategies/erosion.js";
import { geometric } from "./strategies/biome.js";
import { hotspotChain, volcano, lavaFlow } from "./strategies/volcanic.js";
import {
  lakeDepth,
  canyonCarve,
  alluvialFlatten,
  roundPeaks,
  oceanDepth,
  smoothPass,
  flattenValleys,
} from "./strategies/biome-features.js";

/**
 * 標準的な biomeFeatures シーケンス。
 * legacy `applyBiomeFeatures` の内部処理と `flattenValleys` を分解した
 * 順序どおりのストラテジ配列。
 */
const STANDARD_BIOME_FEATURES = [
  lakeDepth(),
  canyonCarve(),
  alluvialFlatten(),
  roundPeaks(),
  oceanDepth(),
  smoothPass(),
  smoothPass(),
  flattenValleys(),
];

/** Flat Rivers 用: flattenValleys を含まない biomeFeatures シーケンス */
const FLAT_BIOME_FEATURES = [
  lakeDepth(),
  canyonCarve(),
  alluvialFlatten(),
  roundPeaks(),
  oceanDepth(),
  smoothPass(),
  smoothPass(),
];

/**
 * 温帯大陸: ワープノイズで形作られる単一大陸。現在のゲームのメインターゲット。
 *
 * 旧 `CONTINENT` パイプラインと同等。
 */
export const TEMPERATE_CONTINENT: Pipeline = {
  name: "Temperate Continent",
  slots: {
    landmass: continentShape(),
    tectonics: noopStrategy("tectonics"),
    // macroshape の particleErode は legacy behavior を維持するため残す（SPL と直交する）
    macroshape: particleErode(),
    climate: latitudeWind(),
    hydrology: priorityFlood(),
    // SPL: dendritic 水脈パターンを物理ベースで形成する
    erosion: streamPowerLaw({ k: 0.2, m: 0.45, dt: 1.0, iterations: 3 }),
    features: [],
    biome: geometric(),
    biomeFeatures: STANDARD_BIOME_FEATURES,
    finalize: noopStrategy("finalize"),
  },
};

/** 2 つの円形島型 */
export const TWO_ISLANDS: Pipeline = {
  name: "Two Islands",
  slots: {
    landmass: twoIslandsLandmass(),
    tectonics: noopStrategy("tectonics"),
    macroshape: particleErode(),
    climate: noopStrategy("climate"),
    hydrology: priorityFlood(),
    erosion: noopStrategy("erosion"),
    features: [],
    biome: geometric(),
    biomeFeatures: STANDARD_BIOME_FEATURES,
    finalize: noopStrategy("finalize"),
  },
};

/** 多島型（群島） */
export const ARCHIPELAGO: Pipeline = {
  name: "Archipelago",
  slots: {
    landmass: multiIslands(),
    tectonics: noopStrategy("tectonics"),
    macroshape: particleErode(),
    climate: noopStrategy("climate"),
    hydrology: priorityFlood(),
    erosion: noopStrategy("erosion"),
    features: [],
    biome: geometric(),
    biomeFeatures: STANDARD_BIOME_FEATURES,
    finalize: noopStrategy("finalize"),
  },
};

/** 平原 + 川（山岳なし） */
export const FLAT_RIVERS: Pipeline = {
  name: "Flat Rivers",
  slots: {
    landmass: flatPlains(),
    tectonics: noopStrategy("tectonics"),
    macroshape: particleErode(),
    climate: noopStrategy("climate"),
    hydrology: priorityFlood(),
    erosion: noopStrategy("erosion"),
    features: [],
    biome: geometric(),
    biomeFeatures: FLAT_BIOME_FEATURES,
    finalize: noopStrategy("finalize"),
  },
};

/** ランダム: seed によって大陸形状がランダムに決まる */
export const RANDOM: Pipeline = {
  name: "Random",
  slots: {
    landmass: randomShape(),
    tectonics: noopStrategy("tectonics"),
    macroshape: particleErode(),
    climate: noopStrategy("climate"),
    hydrology: priorityFlood(),
    erosion: noopStrategy("erosion"),
    features: [],
    biome: geometric(),
    biomeFeatures: STANDARD_BIOME_FEATURES,
    finalize: noopStrategy("finalize"),
  },
};

/**
 * 火山群島: ホットスポット列が生み出す火山島の連なり。
 *
 * **P7 PoC** - 既存コード（strategies / pipeline / biome-registry 以外）を
 * 1 行も変更せずに新しい地形タイプを追加できることを実証する。
 *
 * 使用する新ストラテジ:
 * - tectonics: `hotspotChain`（metadata にホットスポット位置を保存）
 * - features: `volcano`（円錐＋カルデラを描画）
 * - biomeFeatures: `lavaFlow`（溶岩原を配置）
 *
 * landmass は multiIslands を再利用（海に浮かぶ島の骨格）、
 * そこに火山チェーンを重ねることで意味ある火山群島を作る。
 */
export const VOLCANIC_ARCHIPELAGO: Pipeline = {
  name: "Volcanic Archipelago",
  slots: {
    landmass: multiIslands(),
    tectonics: hotspotChain({ count: 6, peak: 0.5, radius: 20 }),
    macroshape: noopStrategy("macroshape"),
    climate: latitudeWind({ baseLandPrecip: 0.4 }),
    hydrology: priorityFlood(),
    erosion: streamPowerLaw({ k: 0.15, m: 0.45, dt: 1.0, iterations: 3 }),
    features: [],
    biome: geometric(),
    biomeFeatures: [
      ...FLAT_BIOME_FEATURES, // lake/canyon/alluvial/roundPeaks/ocean/smooth×2
      volcano(),              // 火山錐＋カルデラ（biome 上書き）
      lavaFlow(),             // 溶岩原（biome 上書き）
    ],
    finalize: noopStrategy("finalize"),
  },
};

export const ALL_PIPELINES: readonly Pipeline[] = [
  RANDOM,
  TEMPERATE_CONTINENT,
  TWO_ISLANDS,
  ARCHIPELAGO,
  FLAT_RIVERS,
  VOLCANIC_ARCHIPELAGO,
];
