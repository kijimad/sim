import type { TileMap } from "../tilemap.js";
import { createContext } from "./context.js";
import type { BiomeRegistry } from "./biome-registry.js";
import { createClassifyBiome } from "./stages/classify.js";
import { runPipeline } from "./slots.js";
import { RANDOM } from "./pipeline.js";
import type { Pipeline } from "./slots.js";

export type { Pipeline, Strategy, SlotName } from "./slots.js";
export { runPipeline, noopStrategy, SLOT_ORDER, MULTI_SLOTS } from "./slots.js";
export { RANDOM, TEMPERATE_CONTINENT, TWO_ISLANDS, ARCHIPELAGO, FLAT_RIVERS, VOLCANIC_ARCHIPELAGO, ALL_PIPELINES } from "./pipeline.js";
export type { StageContext, TerrainStage, BiomeId, BiomeDef } from "./context.js";
export { createContext, createRng, BiomeRegistry, BIOME_TAGS, registerStandardBiomes } from "./context.js";

export interface TerrainGenConfig {
  readonly seed: number;
  readonly waterThreshold: number;
  readonly mountainThreshold: number;
  /** 起伏の強さ [0.5=なだらか, 1.0=標準, 2.0=急峻] */
  readonly relief: number;
  /** 実マップサイズ（プレビュー用: ノイズスケールの基準） */
  readonly targetSize?: number;
  readonly pipeline?: Pipeline;
}

const DEFAULT_CONFIG: TerrainGenConfig = {
  seed: 42,
  waterThreshold: 0.2,
  mountainThreshold: 0.5,
  relief: 1.0,
};

/** TileMap に地形を生成し、使用された BiomeRegistry を返す */
export function generateTerrain(
  map: TileMap,
  config: Partial<TerrainGenConfig> = {},
): BiomeRegistry {
  const cfg = { ...DEFAULT_CONFIG, ...config };
  const ctx = createContext(map.width, map.height, cfg.seed, cfg.relief);
  const pipeline = cfg.pipeline ?? RANDOM;

  // パイプライン実行
  runPipeline(pipeline, ctx);

  // バイオーム分類
  const classify = createClassifyBiome({
    waterThreshold: cfg.waterThreshold,
    mountainThreshold: cfg.mountainThreshold,
  });
  const biomes = classify(ctx);

  // TileMap に書き込む（地形タイプ + 標高）
  for (let y = 0; y < map.height; y++) {
    for (let x = 0; x < map.width; x++) {
      const i = y * map.width + x;
      const terrain = biomes[i];
      if (terrain !== undefined) {
        map.set(x, y, { terrain, elevation: ctx.elevation[i] ?? 0, biomeId: ctx.biomeId[i] ?? 0 });
      }
    }
  }

  return ctx.biomeRegistry;
}

export interface TerrainPreviewData {
  /** 地形タイプ（0=Flat, 1=Mountain, 2=Water） */
  readonly terrain: Uint8Array;
  /** 標高 [0, 1] */
  readonly elevation: Float32Array;
}

/** プレビュー用の地形データ生成 */
export function generateTerrainPreview(
  previewSize: number,
  config: TerrainGenConfig,
): TerrainPreviewData {
  const noiseSize = config.targetSize ?? previewSize;
  const ctx = createContext(previewSize, previewSize, config.seed, config.relief, noiseSize);
  const pipeline = config.pipeline ?? RANDOM;

  runPipeline(pipeline, ctx);

  const classify = createClassifyBiome({
    waterThreshold: config.waterThreshold,
    mountainThreshold: config.mountainThreshold,
  });
  const biomes = classify(ctx);

  const terrain = new Uint8Array(previewSize * previewSize);
  for (let i = 0; i < biomes.length; i++) {
    terrain[i] = biomes[i] ?? 0;
  }
  return { terrain, elevation: ctx.elevation };
}
