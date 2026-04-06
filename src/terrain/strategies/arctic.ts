import type { StageContext } from "../context.js";
import type { Strategy } from "../slots.js";
import type { BiomeDef } from "../biome-registry.js";
import { Terrain } from "../../types.js";

/**
 * 寒冷地のバイオーム戦略群。
 *
 * `climateBiomes` (biomeFeatures スロット) が temperature 配列を読み、
 * 気温帯に応じて tundra / taiga バイオームを上書きする。
 *
 * 将来的には Holdridge 式の温度×降水量マトリクスに拡張する予定だが、
 * P7 の時点ではまず寒冷帯の 2 種に絞って実装する。
 */

// --- バイオーム定義（他ストラテジでも再利用できるよう export） ---

export const ARCTIC_TUNDRA: BiomeDef = {
  tag: "arctic.tundra",
  displayName: "Tundra",
  climate: { maxTemp: 0.15 },
  traversal: { baseCost: 2, passable: true },
  color: [200, 210, 220],
  terrainType: Terrain.Flat,
};

export const ARCTIC_TAIGA: BiomeDef = {
  tag: "arctic.taiga",
  displayName: "Taiga",
  climate: { minTemp: 0.15, maxTemp: 0.35 },
  traversal: { baseCost: 1.5, passable: true },
  color: [60, 100, 75],
  terrainType: Terrain.Flat,
};

export const ARCTIC_GLACIER: BiomeDef = {
  tag: "arctic.glacier",
  displayName: "Glacier",
  climate: { maxTemp: 0.08 },
  traversal: { baseCost: 8, passable: true },
  color: [230, 240, 250],
  terrainType: Terrain.Mountain,
};

// --- biomeFeatures スロット: climateBiomes ---

export interface ClimateBiomesParams {
  /** tundra と taiga の境界温度 */
  readonly tundraThreshold?: number;
  /** taiga の上限温度（これ以上なら上書きしない） */
  readonly taigaThreshold?: number;
  /** 氷河の境界温度（これ未満かつ高標高で glacier） */
  readonly glacierThreshold?: number;
  /** 氷河になる最低標高 */
  readonly glacierMinElev?: number;
}

const DEFAULT_PARAMS: Required<ClimateBiomesParams> = {
  tundraThreshold: 0.15,
  taigaThreshold: 0.35,
  glacierThreshold: 0.08,
  glacierMinElev: 0.45,
};

/**
 * 気温駆動で寒冷バイオームを上書きするストラテジ。
 *
 * - `temperature[i] < glacierThreshold` かつ `elevation[i] > glacierMinElev`
 *   → `arctic.glacier`
 * - `temperature[i] < tundraThreshold`
 *   → `arctic.tundra`
 * - `temperature[i] < taigaThreshold`
 *   → `arctic.taiga`
 * - それ以上は上書きしない（既存バイオームを維持）
 *
 * 水域（既存の Ocean / Lake / Bay）は対象外。
 */
export function climateBiomes(params: ClimateBiomesParams = {}): Strategy {
  const cfg = { ...DEFAULT_PARAMS, ...params };

  return {
    name: "climateBiomes",
    slot: "biomeFeatures",
    requires: ["temperature", "biomeId"],
    provides: ["biomeId"],
    run: (ctx: StageContext) => {
      const { elevation, temperature, biomeId, biomeRegistry } = ctx;
      const TUNDRA = biomeRegistry.ensureBiome(ARCTIC_TUNDRA);
      const TAIGA = biomeRegistry.ensureBiome(ARCTIC_TAIGA);
      const GLACIER = biomeRegistry.ensureBiome(ARCTIC_GLACIER);

      // 水域バイオームは標準レジストリから取得してスキップ対象にする
      const OCEAN = biomeRegistry.idOf("water.ocean");
      const LAKE = biomeRegistry.idOf("water.lake");
      const BAY = biomeRegistry.idOf("water.bay");

      for (let i = 0; i < temperature.length; i++) {
        const curr = biomeId[i] ?? 0;
        if (curr === OCEAN || curr === LAKE || curr === BAY) continue;

        const t = temperature[i] ?? 0;
        const e = elevation[i] ?? 0;

        if (t < cfg.glacierThreshold && e >= cfg.glacierMinElev) {
          biomeId[i] = GLACIER;
        } else if (t < cfg.tundraThreshold) {
          biomeId[i] = TUNDRA;
        } else if (t < cfg.taigaThreshold) {
          biomeId[i] = TAIGA;
        }
        // それ以上は既存バイオーム（Hills, Highland 等）を維持
      }
    },
  };
}
