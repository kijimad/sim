import type { StageContext } from "../context.js";
import type { Strategy } from "../slots.js";
import { createGradientNoise } from "../stages/noise.js";

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
  /**
   * 気温全体のスケール係数（デフォルト 1.0）。
   * 寒冷大陸には 0.3〜0.5、暑い大陸には 1.0 のままを渡す。
   * 0 に近いほど全体が寒冷になる（例: 0.4 なら最高気温が 0.4）。
   */
  readonly tempScale?: number;
  /**
   * 気温ベースのオフセット（デフォルト 0）。
   * tempScale の後に加算される。[−1, 1] の範囲で効く（最終 clamp で [0, 1]）。
   */
  readonly tempBias?: number;
  /**
   * 降水量に加えるノイズの振幅（デフォルト 0）。
   * 正の値にすると低周波 Perlin ノイズで降水分布にムラが加わり、
   * 同緯度・同標高でも湿潤帯と乾燥帯が混在する。
   * Holdridge バイオーム（desert / savanna 等）を出現させるのに必要。
   */
  readonly precipNoiseAmplitude?: number;
  /**
   * 降水ノイズの周波数（デフォルト 2.5）。
   * 大きいほど細かいパッチになる。
   */
  readonly precipNoiseFrequency?: number;
}

const DEFAULT_PARAMS: Required<LatitudeWindParams> = {
  windDirection: "east",
  lapseRate: 0.6,
  orographicFactor: 3.0,
  baseLandPrecip: 0.25,
  baseOceanPrecip: 0.5,
  evaporationRate: 0.08,
  waterThreshold: 0.2,
  tempScale: 1.0,
  tempBias: 0.0,
  precipNoiseAmplitude: 0.0,
  precipNoiseFrequency: 2.5,
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
      const { width: w, height: h, elevation, temperature, precipitation, rng } = ctx;

      // 降水ノイズ（precipNoiseAmplitude > 0 のときだけ生成）
      // 毎 run で rng から作るので、同じ seed なら同じノイズになる
      let precipNoise: ((x: number, y: number) => number) | null = null;
      if (cfg.precipNoiseAmplitude > 0) {
        precipNoise = createGradientNoise(rng);
      }

      // --- 気温: 緯度 + 標高 adiabatic ---
      // y=0 が北（寒）、y=h-1 が南（暖）の線形勾配
      const hMinus1 = Math.max(1, h - 1);
      for (let y = 0; y < h; y++) {
        const latFactor = y / hMinus1; // 0=北, 1=南
        for (let x = 0; x < w; x++) {
          const i = y * w + x;
          const elev = elevation[i] ?? 0;
          const base = latFactor * (1 - elev * cfg.lapseRate);
          const t = base * cfg.tempScale + cfg.tempBias;
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
          let p = orographic + base * airMoisture;

          // 降水ノイズ: 低周波ノイズで湿潤帯と乾燥帯のムラを加える
          if (precipNoise !== null) {
            const nx = x / w;
            const ny = y / h;
            const nv = precipNoise(nx * cfg.precipNoiseFrequency, ny * cfg.precipNoiseFrequency);
            p += (nv - 0.5) * 2 * cfg.precipNoiseAmplitude;
          }

          precipitation[i] = Math.max(0, Math.min(1, p));

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
