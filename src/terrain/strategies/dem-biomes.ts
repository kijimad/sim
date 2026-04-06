import type { StageContext } from "../context.js";
import type { Strategy } from "../slots.js";
import { BIOME_TAGS } from "../biome-registry.js";

/**
 * DEM 用の標高＋傾斜ベースバイオー��割当。
 *
 * 手��き型の `geometric` (assignBiomes) を置き換え、`biome` スロットに直接入る。
 * DEM は実地形なので Canyon ノイズ・島検出・Wetland 流量判定等は全部不要。
 * **標高と傾斜だけ**で単純に決める:
 *
 * - 低標高 → Ocean
 * - 急傾斜 → Highland (Mountain タイル)
 * - 緩傾斜 → Hills (Flat タイル)
 */
export interface DemBiomesParams {
  /** この傾斜（隣接差��以上を Mountain 扱い */
  readonly slopeThreshold?: number;
  /** この正規化標高以下��� Water 扱い */
  readonly waterNorm?: number;
  /** この正規化標高以上は傾斜に関わらず Mountain（山頂の平坦部も山として扱う） */
  readonly mountainNorm?: number;
}

const DEFAULT_PARAMS: Required<DemBiomesParams> = {
  slopeThreshold: 0.015,
  waterNorm: 0.10,
  mountainNorm: 0.35,
};

export function demBiomes(params: DemBiomesParams = {}): Strategy {
  const cfg = { ...DEFAULT_PARAMS, ...params };

  return {
    name: "demBiomes",
    slot: "biome",
    requires: ["elevation"],
    provides: ["biomeId"],
    run: (ctx: StageContext) => {
      const { width: w, height: h, elevation, biomeId, biomeRegistry } = ctx;

      const HILLS = biomeRegistry.idOf(BIOME_TAGS.Hills);
      const HIGHLAND = biomeRegistry.idOf(BIOME_TAGS.Highland);
      const OCEAN = biomeRegistry.idOf(BIOME_TAGS.Ocean);

      for (let y = 0; y < h; y++) {
        for (let x = 0; x < w; x++) {
          const i = y * w + x;
          const e = elevation[i] ?? 0;

          // 低標高セル → 海
          if (e < cfg.waterNorm) {
            biomeId[i] = OCEAN;
            continue;
          }

          // 局所傾斜: 4 近傍との最大標高差
          let maxSlope = 0;
          if (x > 0) maxSlope = Math.max(maxSlope, Math.abs(e - (elevation[i - 1] ?? 0)));
          if (x < w - 1) maxSlope = Math.max(maxSlope, Math.abs(e - (elevation[i + 1] ?? 0)));
          if (y > 0) maxSlope = Math.max(maxSlope, Math.abs(e - (elevation[i - w] ?? 0)));
          if (y < h - 1) maxSlope = Math.max(maxSlope, Math.abs(e - (elevation[i + w] ?? 0)));

          // 高標高 OR 急傾斜 → Mountain
          biomeId[i] = (e >= cfg.mountainNorm || maxSlope >= cfg.slopeThreshold) ? HIGHLAND : HILLS;
        }
      }
    },
  };
}
