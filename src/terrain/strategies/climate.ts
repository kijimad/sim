import type { StageContext } from "../context.js";
import type { Strategy } from "../slots.js";

/**
 * 緯度＋卓越風モデルによる気温・降水量の計算。
 *
 * モデルは物理シミュレーションではなく、ゲーム目的の**粗い近似**:
 *
 * - **気温 `temperature[i]`**: 緯度（y 座標）で線形グラデーション、
 *   標高で adiabatic に低下する。
 *   `T = latFactor × (1 - elevation × lapseRate)`
 *
 * - **降水量 `precipitation[i]`**: 卓越風の方向に沿って空気中の水分を
 *   スキャン伝播させる。地形の上昇が orographic rainfall を起こし、
 *   下流側では rain shadow で降水が減る。海上では蒸発で水分が回復する。
 *
 * 卓越風は東西方向（水平）のみをサポート。対角方向が必要になったら
 * ray-based 実装に拡張する。
 */
export interface LatitudeWindParams {
  /** 卓越風の方向 */
  readonly windDirection?: "east" | "west";
  /** 標高による冷却の強さ [0, 1]（0.6 なら elev=1.0 で -60%） */
  readonly lapseRate?: number;
  /** 地形上昇に対する orographic rainfall の係数（強いほど山の風上側で雨が降る） */
  readonly orographicFactor?: number;
  /** 陸上での基礎降水量 [0, 1] */
  readonly baseLandPrecip?: number;
  /** 海上での基礎降水量 [0, 1]（通常は陸より高く、蒸発源になる） */
  readonly baseOceanPrecip?: number;
  /** 海上での水分回復率（蒸発）[0, 1] */
  readonly evaporationRate?: number;
  /** 陸海判定の標高閾値 */
  readonly waterThreshold?: number;
}

const DEFAULT_PARAMS: Required<LatitudeWindParams> = {
  windDirection: "east",
  lapseRate: 0.6,
  orographicFactor: 3.0,
  baseLandPrecip: 0.25,
  baseOceanPrecip: 0.5,
  evaporationRate: 0.08,
  waterThreshold: 0.2,
};

/** 緯度＋卓越風ベースの気候ストラテジ */
export function latitudeWind(params: LatitudeWindParams = {}): Strategy {
  const cfg = { ...DEFAULT_PARAMS, ...params };

  return {
    name: "latitudeWind",
    slot: "climate",
    requires: ["elevation"],
    provides: ["temperature", "precipitation"],
    run: (ctx: StageContext) => {
      const { width: w, height: h, elevation, temperature, precipitation } = ctx;

      // --- 気温: 緯度 + 標高 adiabatic ---
      // y=0 が北（寒）、y=h-1 が南（暖）の線形勾配
      const hMinus1 = Math.max(1, h - 1);
      for (let y = 0; y < h; y++) {
        const latFactor = y / hMinus1; // 0=北, 1=南
        for (let x = 0; x < w; x++) {
          const i = y * w + x;
          const elev = elevation[i] ?? 0;
          const t = latFactor * (1 - elev * cfg.lapseRate);
          temperature[i] = Math.max(0, Math.min(1, t));
        }
      }

      // --- 降水量: 卓越風方向にスキャン伝播 ---
      // east: x=0→w-1, west: x=w-1→0
      const eastward = cfg.windDirection === "east";
      const xStart = eastward ? 0 : w - 1;
      const xStep = eastward ? 1 : -1;
      const xEnd = eastward ? w : -1;

      for (let y = 0; y < h; y++) {
        // 上流端の水分量は 1（開放境界から湿った空気が入ってくる想定）
        let airMoisture = 1;
        // 境界ショックを防ぐため、prevElev を初期セルの標高で初期化する
        // （外部からは同じ標高の空気が流れてくる、と仮定）
        const firstI = y * w + xStart;
        let prevElev = elevation[firstI] ?? 0;
        for (let x = xStart; x !== xEnd; x += xStep) {
          const i = y * w + x;
          const elev = elevation[i] ?? 0;
          const isLand = elev >= cfg.waterThreshold;

          // 地形上昇による orographic rainfall
          const rise = Math.max(0, elev - prevElev);
          const orographic = airMoisture * rise * cfg.orographicFactor;
          airMoisture = Math.max(0, airMoisture - orographic);

          // 基礎降水量（陸海で差）
          const base = isLand ? cfg.baseLandPrecip : cfg.baseOceanPrecip;
          const p = Math.min(1, orographic + base * airMoisture);
          precipitation[i] = p;

          // 海上では蒸発で水分回復
          if (!isLand) {
            airMoisture = Math.min(1, airMoisture + cfg.evaporationRate);
          }

          prevElev = elev;
        }
      }
    },
  };
}
