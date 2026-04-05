import type { StageContext } from "../context.js";
import type { Strategy } from "../slots.js";
import type { BiomeDef } from "../biome-registry.js";
import { Terrain } from "../../types.js";

/**
 * 火山地形向けのストラテジ群。
 *
 * パイプラインの **tectonics → features → biomeFeatures** の 3 スロットに分かれて動作する:
 *
 * 1. `hotspotChain` (tectonics): マップ上にホットスポット列を計画し、metadata に記録。
 *    各ホットスポットでゆるやかな uplift を加える。
 * 2. `volcano` (features): metadata のホットスポット位置に円錐状の火山体＋カルデラを描画。
 *    `volcanic.cone` / `volcanic.crater` バイオームを割り当てる。
 * 3. `lavaFlow` (biomeFeatures): 火山錐周辺のセルに溶岩原を形成し、
 *    `volcanic.lava_field` バイオームを割り当てる。
 *
 * **設計ポリシー:**
 * - 新バイオームは `registry.ensureBiome` で idempotent に登録（既存コード不変）
 * - ホットスポット情報は `metadata.set(HOTSPOTS_KEY, ...)` で strategy 間を伝搬
 * - 既存のストラテジ・パイプライン・レジストリコードには一切触れない
 */

/** metadata キー: ホットスポットのリスト */
export const HOTSPOTS_KEY = "volcanic.hotspots";

/** ホットスポット 1 つ分の情報 */
export interface Hotspot {
  /** タイル座標 */
  readonly x: number;
  readonly y: number;
  /** 火山錐の頂点標高（既存標高に加算） */
  readonly peak: number;
  /** 火山錐の底面半径（タイル単位） */
  readonly radius: number;
  /** カルデラ（頂点凹み）の半径 */
  readonly craterRadius: number;
}

// --- バイオーム定義 ---

const VOLCANIC_CONE: BiomeDef = {
  tag: "volcanic.cone",
  displayName: "Volcanic Cone",
  traversal: { baseCost: 6, passable: true },
  color: [90, 60, 50],
  terrainType: Terrain.Mountain,
};

const VOLCANIC_CRATER: BiomeDef = {
  tag: "volcanic.crater",
  displayName: "Crater",
  traversal: { baseCost: Infinity, passable: false },
  color: [60, 30, 30],
  terrainType: Terrain.Mountain,
};

const VOLCANIC_LAVA_FIELD: BiomeDef = {
  tag: "volcanic.lava_field",
  displayName: "Lava Field",
  traversal: { baseCost: 3, passable: true },
  color: [40, 25, 25],
  terrainType: Terrain.Flat,
};

// --- tectonics スロット: hotspotChain ---

export interface HotspotChainParams {
  /** ホットスポットの個数 */
  readonly count?: number;
  /** 各火山の最大標高（既存標高からの加算分） */
  readonly peak?: number;
  /** 底面半径のタイル数 */
  readonly radius?: number;
  /** カルデラ半径のタイル数 */
  readonly craterRadius?: number;
  /** 鎖の幅（直線からの揺らぎ） */
  readonly jitter?: number;
}

const DEFAULT_HOTSPOT_PARAMS: Required<HotspotChainParams> = {
  count: 5,
  peak: 0.45,
  radius: 18,
  craterRadius: 2,
  jitter: 0.1,
};

/**
 * ホットスポット列を配置する tectonics ストラテジ。
 *
 * マップを対角線に横切る直線上に count 個のホットスポットを配置する。
 * 位置は rng で微妙に揺らぎ、各ホットスポットを中心とした gaussian-like uplift を加える。
 * ホットスポット座標は metadata に保存され、後段の `volcano` / `lavaFlow` が参照する。
 */
export function hotspotChain(params: HotspotChainParams = {}): Strategy {
  const cfg = { ...DEFAULT_HOTSPOT_PARAMS, ...params };

  return {
    name: "hotspotChain",
    slot: "tectonics",
    requires: ["elevation"],
    provides: ["elevation"],
    run: (ctx: StageContext) => {
      const { width: w, height: h, elevation, rng, metadata } = ctx;

      // 鎖の方向をランダムに決める（対角線ベース + jitter）
      const startX = rng() * 0.2 + 0.1;
      const startY = rng() * 0.3 + 0.1;
      const endX = rng() * 0.2 + 0.7;
      const endY = rng() * 0.3 + 0.6;

      const hotspots: Hotspot[] = [];
      for (let i = 0; i < cfg.count; i++) {
        const t = (i + 0.5) / cfg.count;
        const jx = (rng() - 0.5) * cfg.jitter;
        const jy = (rng() - 0.5) * cfg.jitter;
        const nx = Math.max(0.05, Math.min(0.95, startX + (endX - startX) * t + jx));
        const ny = Math.max(0.05, Math.min(0.95, startY + (endY - startY) * t + jy));
        hotspots.push({
          x: Math.floor(nx * w),
          y: Math.floor(ny * h),
          peak: cfg.peak,
          radius: cfg.radius,
          craterRadius: cfg.craterRadius,
        });
      }

      // metadata に保存（後続ストラテジが読む）
      metadata.set(HOTSPOTS_KEY, hotspots);

      // ゆるやかな uplift を加える（volcano strategy が最終的な円錐を描くので、
      // ここでは海面から島を持ち上げる土台だけ作る）
      const upliftRadius = cfg.radius * 1.5;
      for (const hs of hotspots) {
        const r0 = upliftRadius;
        const yMin = Math.max(0, Math.floor(hs.y - r0));
        const yMax = Math.min(h - 1, Math.ceil(hs.y + r0));
        const xMin = Math.max(0, Math.floor(hs.x - r0));
        const xMax = Math.min(w - 1, Math.ceil(hs.x + r0));
        for (let y = yMin; y <= yMax; y++) {
          for (let x = xMin; x <= xMax; x++) {
            const dx = x - hs.x;
            const dy = y - hs.y;
            const distSq = dx * dx + dy * dy;
            if (distSq > r0 * r0) continue;
            const dist = Math.sqrt(distSq);
            // ゆるやかな釣鐘型
            const t = dist / r0;
            const uplift = cfg.peak * 0.3 * Math.exp(-t * t * 3);
            const i = y * w + x;
            elevation[i] = Math.min(1, (elevation[i] ?? 0) + uplift);
          }
        }
      }
    },
  };
}

// --- biomeFeatures スロット: volcano ---

export interface VolcanoParams {
  /** 円錐プロファイルの急峻さ（大きいほど急） */
  readonly coneSteepness?: number;
  /** カルデラの深さ（円錐頂点からの引き下げ量） */
  readonly craterDepth?: number;
}

const DEFAULT_VOLCANO_PARAMS: Required<VolcanoParams> = {
  coneSteepness: 1.5,
  craterDepth: 0.1,
};

/**
 * 火山錐を配置する biomeFeatures ストラテジ。
 *
 * metadata のホットスポット位置に円錐状の隆起とカルデラを描画し、
 * `volcanic.cone` / `volcanic.crater` バイオームを割り当てる。
 *
 * スロットが `biomeFeatures` なのは、`biome` スロットの後に走って
 * バイオーム割当を上書きする必要があるため。
 */
export function volcano(params: VolcanoParams = {}): Strategy {
  const cfg = { ...DEFAULT_VOLCANO_PARAMS, ...params };

  return {
    name: "volcano",
    slot: "biomeFeatures",
    requires: ["elevation", "biomeId"],
    provides: ["elevation", "biomeId"],
    run: (ctx: StageContext) => {
      const { width: w, height: h, elevation, biomeId, biomeRegistry, metadata } = ctx;

      const hotspots = metadata.get(HOTSPOTS_KEY) as readonly Hotspot[] | undefined;
      if (hotspots === undefined || hotspots.length === 0) return;

      // 新バイオームを idempotent に登録
      const CONE = biomeRegistry.ensureBiome(VOLCANIC_CONE);
      const CRATER = biomeRegistry.ensureBiome(VOLCANIC_CRATER);

      for (const hs of hotspots) {
        const { x: cx, y: cy, peak, radius: R, craterRadius } = hs;
        const yMin = Math.max(0, cy - R);
        const yMax = Math.min(h - 1, cy + R);
        const xMin = Math.max(0, cx - R);
        const xMax = Math.min(w - 1, cx + R);

        for (let y = yMin; y <= yMax; y++) {
          for (let x = xMin; x <= xMax; x++) {
            const dx = x - cx;
            const dy = y - cy;
            const dist = Math.sqrt(dx * dx + dy * dy);
            if (dist > R) continue;

            // 円錐プロファイル: dist=0 で peak、dist=R で 0
            const t = 1 - dist / R;
            // smoothstep の冪でクッキリした円錐にする
            const profile = Math.pow(t, cfg.coneSteepness);
            const add = peak * profile;

            const i = y * w + x;
            // 既存標高に加算（海面下に沈まない）
            elevation[i] = Math.min(1, (elevation[i] ?? 0) + add);

            // カルデラ: 頂点近くを掘り下げる
            if (dist < craterRadius) {
              const craterT = 1 - dist / craterRadius;
              elevation[i] = Math.max(0, (elevation[i] ?? 0) - cfg.craterDepth * craterT);
              biomeId[i] = CRATER;
            } else if (profile > 0.1) {
              // 円錐部分（カルデラ外）は cone バイオーム
              biomeId[i] = CONE;
            }
          }
        }
      }
    },
  };
}

// --- biomeFeatures スロット: lavaFlow ---

export interface LavaFlowParams {
  /** 溶岩原の半径（火山錐底面からさらに外側にどれだけ広がるか） */
  readonly flowRadius?: number;
  /** 溶岩原を配置する確率閾値（0-1、ノイズを使うが簡易実装では距離 deterministic） */
  readonly density?: number;
}

const DEFAULT_LAVA_PARAMS: Required<LavaFlowParams> = {
  flowRadius: 8,
  density: 0.6,
};

/**
 * 火山錐周辺に溶岩原を配置する biomeFeatures ストラテジ。
 *
 * metadata のホットスポット位置から flowRadius タイル以内の
 * 陸上セルを `volcanic.lava_field` に書き換える（Beach, Ocean, Lake 等は除く）。
 */
export function lavaFlow(params: LavaFlowParams = {}): Strategy {
  const cfg = { ...DEFAULT_LAVA_PARAMS, ...params };

  return {
    name: "lavaFlow",
    slot: "biomeFeatures",
    requires: ["elevation", "biomeId"],
    provides: ["biomeId"],
    run: (ctx: StageContext) => {
      const { width: w, height: h, elevation, biomeId, biomeRegistry, metadata } = ctx;

      const hotspots = metadata.get(HOTSPOTS_KEY) as readonly Hotspot[] | undefined;
      if (hotspots === undefined || hotspots.length === 0) return;

      const LAVA = biomeRegistry.ensureBiome(VOLCANIC_LAVA_FIELD);

      for (const hs of hotspots) {
        const R = hs.radius + cfg.flowRadius;
        const yMin = Math.max(0, hs.y - R);
        const yMax = Math.min(h - 1, hs.y + R);
        const xMin = Math.max(0, hs.x - R);
        const xMax = Math.min(w - 1, hs.x + R);

        for (let y = yMin; y <= yMax; y++) {
          for (let x = xMin; x <= xMax; x++) {
            const dx = x - hs.x;
            const dy = y - hs.y;
            const dist = Math.sqrt(dx * dx + dy * dy);
            // 火山錐の外側、flow 半径以内
            if (dist <= hs.radius || dist > R) continue;

            const i = y * w + x;
            const elev = elevation[i] ?? 0;
            // 陸上のみ対象（海に流れ込んだ溶岩は別モデル）
            if (elev < 0.2) continue;
            // radial density (近いほど溶岩、遠いほど散発的)
            const t = (dist - hs.radius) / cfg.flowRadius;
            if (t > cfg.density) continue;

            biomeId[i] = LAVA;
          }
        }
      }
    },
  };
}
