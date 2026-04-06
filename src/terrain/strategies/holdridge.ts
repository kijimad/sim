import type { StageContext } from "../context.js";
import type { Strategy } from "../slots.js";
import type { BiomeDef } from "../biome-registry.js";
import { BIOME_TAGS } from "../biome-registry.js";
import { Terrain } from "../../types.js";
import { ARCTIC_TUNDRA, ARCTIC_TAIGA, ARCTIC_GLACIER } from "./arctic.js";

/**
 * Holdridge 風の気候駆動バイオーム割当ストラテジ。
 *
 * 気温（`temperature`）と降水量（`precipitation`）の 2 軸で、
 * Hills/Highland/Plateau の汎用地形を climate-adjusted バイオームに上書きする。
 *
 * **上書き対象**（generic terrain biomes）:
 * - `terrain.hills`, `terrain.highland`, `terrain.plateau`
 *
 * **上書きしない**（地形特徴・水域・features）:
 * - `water.*`, `coastal.beach`, `terrain.island`, `terrain.canyon`,
 *   `terrain.cliff`, `terrain.wetland`, `terrain.alluvial`, `volcanic.*`
 *
 * **バイオーム選択の T×P マトリクス**（T, P は [0, 1] 正規化）:
 *
 * ```
 *                 arid (P<0.2)  semi (0.2..0.4)  moist (>=0.4)
 *   polar T<0.1   tundra/ice    tundra/ice       tundra/ice
 *   boreal <0.25  tundra        taiga            taiga
 *   cool   <0.5   steppe        (keep)           (keep)
 *   warm   <0.7   desert        (keep)           (keep)
 *   tropic >=0.7  desert        savanna          rainforest
 * ```
 *
 * `polar` の高標高（`iceMinElev` 以上）では `glacier` を割り当てる。
 */

// --- 新バイオーム定義（steppe / desert / savanna / rainforest） ---

const ARID_STEPPE: BiomeDef = {
  tag: "arid.steppe",
  displayName: "Steppe",
  climate: { minTemp: 0.25, maxTemp: 0.5, maxPrecip: 0.2 },
  traversal: { baseCost: 1, passable: true },
  color: [180, 170, 110],
  terrainType: Terrain.Flat,
};

const ARID_DESERT: BiomeDef = {
  tag: "arid.desert",
  displayName: "Desert",
  climate: { minTemp: 0.5, maxPrecip: 0.2 },
  traversal: { baseCost: 1.5, passable: true },
  color: [230, 200, 130],
  terrainType: Terrain.Sand,
};

const TROPICAL_SAVANNA: BiomeDef = {
  tag: "tropical.savanna",
  displayName: "Savanna",
  climate: { minTemp: 0.7, minPrecip: 0.2, maxPrecip: 0.4 },
  traversal: { baseCost: 1.2, passable: true },
  color: [200, 180, 100],
  terrainType: Terrain.Flat,
};

const TROPICAL_RAINFOREST: BiomeDef = {
  tag: "tropical.rainforest",
  displayName: "Rainforest",
  climate: { minTemp: 0.7, minPrecip: 0.4 },
  traversal: { baseCost: 1.8, passable: true },
  color: [30, 90, 40],
  terrainType: Terrain.Flat,
};

// --- ストラテジ ---

export interface HoldridgeBiomesParams {
  /** 極地と亜寒帯の境界 */
  readonly polarMax?: number;
  /** 亜寒帯と冷温帯の境界 */
  readonly borealMax?: number;
  /** 冷温帯と暖温帯の境界 */
  readonly coolMax?: number;
  /** 暖温帯と熱帯の境界 */
  readonly warmMax?: number;
  /** 乾燥と半乾燥の境界 */
  readonly aridMax?: number;
  /** 半乾燥と湿潤の境界 */
  readonly semiAridMax?: number;
  /** polar で glacier になる最低標高 */
  readonly iceMinElev?: number;
}

const DEFAULT_PARAMS: Required<HoldridgeBiomesParams> = {
  polarMax: 0.1,
  borealMax: 0.25,
  coolMax: 0.5,
  warmMax: 0.7,
  aridMax: 0.2,
  semiAridMax: 0.4,
  iceMinElev: 0.45,
};

/**
 * Holdridge 風気候駆動バイオームストラテジ。
 *
 * `biome` スロットの後（`biomeFeatures` スロット）で走り、
 * 汎用地形バイオーム（Hills/Highland/Plateau）のみを上書きする。
 */
export function holdridgeBiomes(params: HoldridgeBiomesParams = {}): Strategy {
  const cfg = { ...DEFAULT_PARAMS, ...params };

  return {
    name: "holdridgeBiomes",
    slot: "biomeFeatures",
    requires: ["temperature", "precipitation", "biomeId"],
    provides: ["biomeId"],
    run: (ctx: StageContext) => {
      const { elevation, temperature, precipitation, biomeId, biomeRegistry } = ctx;

      // 上書き対象となる generic terrain biomes の ID
      const HILLS = biomeRegistry.idOf(BIOME_TAGS.Hills);
      const HIGHLAND = biomeRegistry.idOf(BIOME_TAGS.Highland);
      const PLATEAU = biomeRegistry.idOf(BIOME_TAGS.Plateau);

      // 新規バイオームを idempotent に登録
      const TUNDRA = biomeRegistry.ensureBiome(ARCTIC_TUNDRA);
      const TAIGA = biomeRegistry.ensureBiome(ARCTIC_TAIGA);
      const GLACIER = biomeRegistry.ensureBiome(ARCTIC_GLACIER);
      const STEPPE = biomeRegistry.ensureBiome(ARID_STEPPE);
      const DESERT = biomeRegistry.ensureBiome(ARID_DESERT);
      const SAVANNA = biomeRegistry.ensureBiome(TROPICAL_SAVANNA);
      const RAINFOREST = biomeRegistry.ensureBiome(TROPICAL_RAINFOREST);

      for (let i = 0; i < biomeId.length; i++) {
        const curr = biomeId[i] ?? 0;
        // 上書き対象の汎用地形のみ処理する
        if (curr !== HILLS && curr !== HIGHLAND && curr !== PLATEAU) continue;

        const t = temperature[i] ?? 0;
        const p = precipitation[i] ?? 0;
        const e = elevation[i] ?? 0;

        if (t < cfg.polarMax) {
          // 極地: 高標高なら氷河、それ以外は tundra
          biomeId[i] = (e >= cfg.iceMinElev) ? GLACIER : TUNDRA;
        } else if (t < cfg.borealMax) {
          // 亜寒帯: 乾燥なら tundra、湿潤なら taiga
          biomeId[i] = (p < cfg.aridMax) ? TUNDRA : TAIGA;
        } else if (t < cfg.coolMax) {
          // 冷温帯: 乾燥なら steppe、それ以外は既存（Hills/Highland）を維持
          if (p < cfg.aridMax) biomeId[i] = STEPPE;
        } else if (t < cfg.warmMax) {
          // 暖温帯: 乾燥なら desert
          if (p < cfg.aridMax) biomeId[i] = DESERT;
        } else {
          // 熱帯
          if (p < cfg.aridMax) biomeId[i] = DESERT;
          else if (p < cfg.semiAridMax) biomeId[i] = SAVANNA;
          else biomeId[i] = RAINFOREST;
        }
      }
    },
  };
}
