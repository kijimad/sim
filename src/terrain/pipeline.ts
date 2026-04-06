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
import { climateBiomes } from "./strategies/arctic.js";
import { holdridgeBiomes } from "./strategies/holdridge.js";
import { demHeightmap } from "./strategies/dem.js";
import { demBiomes } from "./strategies/dem-biomes.js";
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
 * DEM 用の biomeFeatures シーケンス。
 * 実 DEM は既に本物の地形なので、全ての標高改変系を外して元データを完全に保持する。
 * DEM は実地形なので気候駆動バイオーム上書き (holdridgeBiomes) も不要。
 */
const DEM_BIOME_FEATURES: never[] = [];

/**
 * 温帯大陸: ワープノイズで形作られる単一大陸。現在のゲームのメインターゲット。
 *
 * 旧 `CONTINENT` パイプラインと同等。
 */
/**
 * 温帯大陸（内部多様性モデル）: Minecraft 風に、1 つの大陸マップ内に
 * 通常の丘陵・森林と並んで散在する火山、北部の寒冷帯（タイガ・ツンドラ）が
 * 混在するメインパイプライン。
 *
 * - `hotspotChain` で 2 つの火山を散らして配置
 * - `climateBiomes` で北端の寒冷セルに tundra/taiga/glacier を割り当て
 * - SPL で dendritic 水脈を形成
 */
export const TEMPERATE_CONTINENT: Pipeline = {
  name: "Temperate Continent",
  slots: {
    landmass: continentShape(),
    // 2 個の火山ホットスポットをマップに散らして配置（高 jitter で直線配列を崩す）
    tectonics: hotspotChain({ count: 2, jitter: 0.5, peak: 0.4, radius: 16 }),
    // macroshape の particleErode は legacy behavior を維持するため残す
    macroshape: particleErode(),
    // 降水ノイズを加えて大陸内部に湿潤帯・乾燥帯のムラを作る → desert / savanna 等が出現
    climate: latitudeWind({ precipNoiseAmplitude: 0.35, precipNoiseFrequency: 2.0 }),
    hydrology: priorityFlood(),
    // SPL: dendritic 水脈パターンを物理ベースで形成する
    erosion: streamPowerLaw({ k: 0.35, m: 0.45, dt: 0.8, iterations: 6 }),
    features: [],
    biome: geometric(),
    biomeFeatures: [
      ...STANDARD_BIOME_FEATURES,
      volcano(),         // 散在した火山錐とカルデラを描画
      lavaFlow(),        // 火山周辺の溶岩原
      holdridgeBiomes(), // T×P マトリクスで tundra/taiga/glacier/steppe/desert/savanna/rainforest を割当
    ],
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
/**
 * 寒冷大陸: 低気温の温帯〜亜寒帯大陸。
 *
 * TEMPERATE_CONTINENT の骨格を流用しつつ、`latitudeWind` の `tempScale` を下げて
 * 全体気温を低く抑え、`climateBiomes` で tundra / taiga / glacier を割り当てる。
 *
 * 新規ストラテジ追加は `climateBiomes` のみ。既存ストラテジの再利用性を示す。
 */
export const ARCTIC_CONTINENT: Pipeline = {
  name: "Arctic Continent",
  slots: {
    landmass: continentShape(),
    tectonics: noopStrategy("tectonics"),
    macroshape: noopStrategy("macroshape"),
    // 全体気温を 40% にスケール＋若干下方バイアス → 全土がタイガ〜ツンドラ圏
    climate: latitudeWind({ tempScale: 0.4, tempBias: -0.05, baseLandPrecip: 0.2 }),
    hydrology: priorityFlood(),
    erosion: streamPowerLaw({ k: 0.25, m: 0.45, dt: 0.8, iterations: 5 }),
    features: [],
    biome: geometric(),
    biomeFeatures: [
      ...STANDARD_BIOME_FEATURES, // 既存の地形加工
      climateBiomes(),             // 気候駆動で tundra/taiga/glacier を上書き
    ],
    finalize: noopStrategy("finalize"),
  },
};

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

/**
 * 九州 DEM: 国土地理院 基盤地図情報（FG-GML-483001、九州南部）の等高線を
 * ラスタライズした実 DEM ヒートマップをベースとする。手続き型生成ではなく、
 * 実地形を読み込んで加工パイプラインを適用する。
 *
 * 目的: fBm ノイズベースの生成では出せない「本物の山脈・谷筋・海岸線」を
 * 視覚的に確認し、手続き型の改善目標にする。
 */
// DEM パイプラインの閾値:
// 正規化 norm = 0.08 + (elev / max(200, maxE)) × 0.92
// waterThreshold = 0.10 → 実標高 ~5m（海面近傍）
// mountainThreshold: DEM の maxE に応じて調整
//   箱根 (712m): 0.08 + (200/712)*0.92 = 0.34 → 200m 以上が Mountain
//   横浜 (99m):  0.08 + (30/200)*0.92 = 0.22  → 30m 以上が Mountain
//   九州 (210m): 0.08 + (60/210)*0.92 = 0.34  → 60m 以上が Mountain

function demPipeline(name: string, mesh: string, mountainThreshold: number = 0.30): Pipeline {
  return {
    name,
    waterThreshold: 0.10,
    mountainThreshold,
    slots: {
      landmass: demHeightmap({ mesh }),
      tectonics: noopStrategy("tectonics"),
      macroshape: noopStrategy("macroshape"),
      climate: noopStrategy("climate"),
      hydrology: noopStrategy("hydrology"),
      erosion: noopStrategy("erosion"),
      features: [],
      // DEM は標高と傾斜だけでバイオームを決める。
      // mountainNorm を mountainThreshold と連動させて classify との一貫性を保つ
      biome: demBiomes({ mountainNorm: mountainThreshold, slopeThreshold: 0.008 }),
      biomeFeatures: DEM_BIOME_FEATURES,
      finalize: noopStrategy("finalize"),
    },
  };
}

export const KOFU_DEM = demPipeline("Kofu DEM (533844)", "533844", 0.25);
export const YUGAWARA_DEM = demPipeline("Yugawara DEM (523950)", "523950", 0.30);
export const HADANO_DEM = demPipeline("Hadano DEM (533901)", "533901", 0.34);
export const YOKOHAMA_DEM = demPipeline("Yokohama DEM (533914)", "533914", 0.22);


export const ALL_PIPELINES: readonly Pipeline[] = [
  RANDOM,
  TEMPERATE_CONTINENT,
  TWO_ISLANDS,
  ARCHIPELAGO,
  FLAT_RIVERS,
  VOLCANIC_ARCHIPELAGO,
  ARCTIC_CONTINENT,
  KOFU_DEM,
  YUGAWARA_DEM,
  HADANO_DEM,
  YOKOHAMA_DEM,
];
