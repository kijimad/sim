import type { StageContext } from "../context.js";
import type { Strategy } from "../slots.js";
import dem523950Data from "../data/dem/dem-523950.json" with { type: "json" };
import dem533844Data from "../data/dem/dem-533844.json" with { type: "json" };
import dem533901Data from "../data/dem/dem-533901.json" with { type: "json" };
import dem533914Data from "../data/dem/dem-533914.json" with { type: "json" };
import dem533945Data from "../data/dem/dem-533945.json" with { type: "json" };

/**
 * 実 DEM (国土地理院 基盤地図情報 FG-GML-483001、九州南部) をベースとする
 * landmass ストラテジ。
 *
 * ビルド時に `scripts/build-dem.mjs` で GML の等高線・標高点・海岸線をパースし、
 * 256×256 の正規化 heightmap として JSON に出力しておき、ここではそれを
 * ctx のグリッドサイズにリサンプルして `elevation` に書き込む。
 *
 * 正規化: 0m → 0.2 (既存の waterThreshold と整合), 最高峰 (~191m) → 1.0
 */

export interface DemHeightmapParams {
  /** 使用するメッシュ ID（"483001" or "533945"） */
  readonly mesh?: string;
}

interface DemData {
  readonly width: number;
  readonly height: number;
  readonly data: readonly number[];
}

/** 利用可能な DEM データセット */
export const DEM_DATASETS: Record<string, DemData> = {
  "523950": dem523950Data as DemData,   // 湯河原（海+山）, max 908m
  "533844": dem533844Data as DemData,   // 甲府（盆地+山地）, max 1437m
  "533901": dem533901Data as DemData,   // 秦野（丹沢南麓）, max 712m
  "533914": dem533914Data as DemData,   // 横浜〜鎌倉, max 99m
  "533945": dem533945Data as DemData,   // 東京近郊（低地）, max 52m
};

/** バイリニア補間で (u, v) ∈ [0, 1] の位置の elevation をサンプル */
function sampleBilinear(data: readonly number[], w: number, h: number, u: number, v: number): number {
  const x = Math.max(0, Math.min(w - 1.001, u * (w - 1)));
  const y = Math.max(0, Math.min(h - 1.001, v * (h - 1)));
  const x0 = Math.floor(x);
  const y0 = Math.floor(y);
  const x1 = x0 + 1;
  const y1 = y0 + 1;
  const fx = x - x0;
  const fy = y - y0;
  const v00 = data[y0 * w + x0] ?? 0;
  const v10 = data[y0 * w + x1] ?? 0;
  const v01 = data[y1 * w + x0] ?? 0;
  const v11 = data[y1 * w + x1] ?? 0;
  const top = v00 * (1 - fx) + v10 * fx;
  const bot = v01 * (1 - fx) + v11 * fx;
  return top * (1 - fy) + bot * fy;
}

/**
 * 実 DEM を elevation に書き込む landmass ストラテジ。
 * ctx のグリッドサイズに合わせてバイリニア補間でリサンプルする。
 */
export function demHeightmap(params: DemHeightmapParams = {}): Strategy {
  const meshId = params.mesh ?? "483001";
  const demData = DEM_DATASETS[meshId];
  if (demData === undefined) {
    throw new Error(`Unknown DEM mesh: "${meshId}". Available: ${Object.keys(DEM_DATASETS).join(", ")}`);
  }

  return {
    name: `demHeightmap(${meshId})`,
    slot: "landmass",
    provides: ["elevation"],
    run: (ctx: StageContext) => {
      const { width: w, height: h, elevation } = ctx;
      const demW = demData.width;
      const demH = demData.height;
      const data = demData.data;

      for (let y = 0; y < h; y++) {
        const v = y / (h - 1);
        for (let x = 0; x < w; x++) {
          const u = x / (w - 1);
          elevation[y * w + x] = sampleBilinear(data, demW, demH, u, v);
        }
      }
    },
  };
}
