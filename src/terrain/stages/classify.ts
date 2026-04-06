import type { StageContext } from "../context.js";
import { BIOME_TAGS } from "../biome-registry.js";
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
    const { width: w, height: h, elevation, flow, biomeId, biomeRegistry } = ctx;
    const size = w * h;

    const OCEAN = biomeRegistry.idOf(BIOME_TAGS.Ocean);
    const BAY = biomeRegistry.idOf(BIOME_TAGS.Bay);
    const LAKE = biomeRegistry.idOf(BIOME_TAGS.Lake);
    const BEACH = biomeRegistry.idOf(BIOME_TAGS.Beach);

    // バイオームIDを尊重した分類
    const result: Terrain[] = new Array<Terrain>(size);
    for (let i = 0; i < size; i++) {
      const biome = biomeId[i] ?? 0;
      const elev = elevation[i] ?? 0;

      // 水域バイオームは常に Water にする（標高に関わらず）
      if (biome === OCEAN || biome === BAY || biome === LAKE) {
        result[i] = Terrain.Water;
        continue;
      }

      // Beach バイオームは標高に応じて Sand / Mountain を使い分ける
      if (biome === BEACH) {
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

    // 形態学的クリーンアップ: 標高ベースで Water になった孤立セル（1 マスの川）を
    // 除去する。SPL 侵食や biomeFeatures のカービングで陸地セルが waterThreshold
    // をわずかに下回ったときに生じる「1 マスの川」アーティファクトが対象。
    //
    // 除外:
    // - 水域バイオーム (Ocean/Lake/Bay/Beach) のセルは触らない（本物の水）
    // - この段階では river loop はまだ走っていないので、後段の river loop が
    //   描く大河川は影響を受けない
    //
    // 閾値: 8 近傍の Water < 3。2x2 以上の塊は角でも 3 neighbors なので残る。
    const DX8 = [0, 1, 1, 1, 0, -1, -1, -1];
    const DY8 = [-1, -1, 0, 1, 1, 1, 0, -1];
    const toRevert: number[] = [];
    for (let i = 0; i < size; i++) {
      if (result[i] !== Terrain.Water) continue;
      const b = biomeId[i] ?? 0;
      // 本物の水域バイオームは除外
      if (b === OCEAN || b === LAKE || b === BAY || b === BEACH) continue;

      const cx = i % w; const cy = (i - cx) / w;
      let waterNeighbors = 0;
      for (let d = 0; d < 8; d++) {
        const nx = cx + (DX8[d] ?? 0);
        const ny = cy + (DY8[d] ?? 0);
        if (nx < 0 || nx >= w || ny < 0 || ny >= h) continue;
        if (result[ny * w + nx] === Terrain.Water) waterNeighbors++;
      }
      if (waterNeighbors < 3) toRevert.push(i);
    }
    for (const i of toRevert) {
      const elev = elevation[i] ?? 0;
      result[i] = elev > cfg.mountainThreshold ? Terrain.Mountain : Terrain.Flat;
    }

    // 河川: flow が閾値を超えるセルの周囲を Water にする。
    // 1 マス幅の点線状流路は見た目の品質を下げるので、半径 2 以上のまとまった
    // 川のみ描画する（小さい流路は地形の SPL 谷筋として視認できれば十分）。
    // クリーンアップは河川描画の前に完了しているので、ここで描く川は保護される。
    const MIN_RIVER_RADIUS = 2;
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const i = y * w + x;
        const f = flow[i] ?? 0;
        if (f <= cfg.riverFlowThreshold) continue;

        const elev = elevation[i] ?? 0;
        const isMountainRiver = elev > cfg.mountainThreshold;

        // 流量比の対数で川幅を決定する（+1 で閾値直上からある程度の幅を与える）
        const logFlow = Math.log(f / cfg.riverFlowThreshold);
        const riverRadius = isMountainRiver
          ? Math.min(3, Math.floor(logFlow * 1.0) + 1)
          : Math.min(8, Math.floor(logFlow * 2.5) + 1);

        // 2 マス未満の流路は描画しない
        if (riverRadius < MIN_RIVER_RADIUS) continue;

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
