import type { StageContext } from "../context.js";
import { Biome } from "../context.js";
import { Terrain } from "../../types.js";

export interface ClassifyConfig {
  readonly waterThreshold: number;
  readonly mountainThreshold: number;
  readonly riverFlowThreshold: number;
}

const DEFAULT_CLASSIFY: ClassifyConfig = {
  waterThreshold: 0.2,
  mountainThreshold: 0.5,
  riverFlowThreshold: 3000,
};

/** バイオーム分類: 河川は flow に応じた幅を持ち、山地でも渓谷を刻む。水辺に砂浜を配置する */
export function createClassifyBiome(config?: Partial<ClassifyConfig>): (ctx: StageContext) => Terrain[] {
  const cfg = { ...DEFAULT_CLASSIFY, ...config };

  return (ctx: StageContext): Terrain[] => {
    const { width: w, height: h, elevation, flow, biomeId } = ctx;
    const size = w * h;

    // バイオームIDを尊重した分類
    const result: Terrain[] = new Array<Terrain>(size);
    for (let i = 0; i < size; i++) {
      const biome = biomeId[i] as Biome;
      const elev = elevation[i] ?? 0;

      // 水域バイオームは常に Water にする（標高に関わらず）
      if (biome === Biome.Ocean || biome === Biome.Bay || biome === Biome.Lake) {
        result[i] = Terrain.Water;
        continue;
      }

      // Desert / Tombolo バイオームは標高に応じて Sand / Mountain を使い分ける
      if (biome === Biome.Beach) {
        if (elev < cfg.waterThreshold) {
          result[i] = Terrain.Water;
        } else if (elev > cfg.mountainThreshold) {
          result[i] = Terrain.Mountain;
        } else {
          result[i] = Terrain.Sand;
        }
        continue;
      }

      // 陸地バイオームは標高で Flat/Mountain を判定する
      if (elev < cfg.waterThreshold) {
        result[i] = Terrain.Water;
      } else if (elev > cfg.mountainThreshold) {
        result[i] = Terrain.Mountain;
      } else {
        result[i] = Terrain.Flat;
      }
    }

    // 河川: flow が閾値を超えるセルの周囲を Water にする
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const i = y * w + x;
        const f = flow[i] ?? 0;
        if (f <= cfg.riverFlowThreshold) continue;

        const elev = elevation[i] ?? 0;
        const isMountainRiver = elev > cfg.mountainThreshold;

        // 流量比の対数で川幅を決定する
        const logFlow = Math.log(f / cfg.riverFlowThreshold);
        const riverRadius = isMountainRiver
          ? Math.min(3, Math.max(1, Math.floor(logFlow * 1.0)))
          : Math.min(8, Math.max(1, Math.floor(logFlow * 2.5)));

        for (let dy = -riverRadius; dy <= riverRadius; dy++) {
          for (let dx = -riverRadius; dx <= riverRadius; dx++) {
            if (dx * dx + dy * dy > riverRadius * riverRadius) continue;
            const nx = x + dx;
            const ny = y + dy;
            if (nx < 0 || nx >= w || ny < 0 || ny >= h) continue;
            const ni = ny * w + nx;
            // 渓谷: 山タイルも Water に上書きする
            result[ni] = Terrain.Water;
          }
        }
      }
    }

    return result;
  };
}
