import type { StageContext } from "../context.js";
import type { Strategy } from "../slots.js";
import { fillDepressions } from "../stages/rivers.js";

/**
 * Stream Power Law (SPL) による流路侵食。
 *
 * **参考文献:**
 * - Cordonnier et al. 2016, "Large Scale Terrain Generation from Tectonic Uplift and Fluvial Erosion"
 * - Braun & Willett 2013, "A very efficient O(n), implicit and parallel method for solving
 *   the stream power equation governing fluvial incision and landscape evolution" (FastScape)
 *
 * **数式:**
 * ```
 * ∂h/∂t = U - K · A^m · S^n
 * ```
 * - U: 隆起速度（本実装では 0。地形は初期状態から侵食のみ）
 * - K: 侵食係数
 * - A: drainage area（上流側の累積流量に相当）
 * - m: 面積指数（典型 0.4〜0.5）
 * - n: 傾斜指数（本実装では 1 固定＝FastScape の線形ケース）
 * - S: 下流方向への局所勾配
 *
 * **アルゴリズム（1 イテレーション）:**
 * 1. `fillDepressions` で窪地を埋める（流路連続性を保証）
 * 2. 各セルの D8 下流隣接を計算
 * 3. drainage area A を高さ降順トポロジカル順で蓄積
 * 4. FastScape 陰解法で各セルを更新（低い順＝下流側から処理）:
 *    ```
 *    C = K × dt × A[i]^m / L
 *    h_new[i] = (h[i] + C × h_new[d(i)]) / (1 + C)
 *    ```
 *    これは n=1 かつ無条件安定な暗黙解法。
 *
 * SPL は dendritic（樹状）な谷網を物理的に形成する。ノイズで谷を描くのと異なり、
 * パターンは流量と勾配から **必然的に** 生じるため、閉鎖谷は発生しない。
 */
export interface StreamPowerLawParams {
  /** 侵食係数 K（大きいほど強く侵食する） */
  readonly k?: number;
  /** 面積指数 m（典型 0.4〜0.5） */
  readonly m?: number;
  /** 時間刻み dt（大きいほど 1 ステップでの進行が速いが数値的に不安定になる可能性） */
  readonly dt?: number;
  /** イテレーション回数（多いほど平衡に近づく） */
  readonly iterations?: number;
}

const DEFAULT_PARAMS: Required<StreamPowerLawParams> = {
  k: 0.3,
  m: 0.45,
  dt: 1.0,
  iterations: 3,
};

// 8 方向 (D8): N, NE, E, SE, S, SW, W, NW
const D8_DX: readonly number[] = [0, 1, 1, 1, 0, -1, -1, -1];
const D8_DY: readonly number[] = [-1, -1, 0, 1, 1, 1, 0, -1];
const D8_DIST: readonly number[] = [1, Math.SQRT2, 1, Math.SQRT2, 1, Math.SQRT2, 1, Math.SQRT2];

/** 各セルの D8 下流インデックス（なければ -1）と下流までの距離を計算する */
function computeDownstream(
  w: number, h: number,
  elevation: Float32Array,
): { downstream: Int32Array; distance: Float32Array } {
  const size = w * h;
  const downstream = new Int32Array(size);
  const distance = new Float32Array(size);
  downstream.fill(-1);

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = y * w + x;
      const eh = elevation[i] ?? 0;
      let bestIdx = -1;
      let bestDrop = 0;
      for (let d = 0; d < 8; d++) {
        const nx = x + (D8_DX[d] ?? 0);
        const ny = y + (D8_DY[d] ?? 0);
        if (nx < 0 || nx >= w || ny < 0 || ny >= h) continue;
        const ni = ny * w + nx;
        const drop = eh - (elevation[ni] ?? 0);
        const dist = D8_DIST[d] ?? 1;
        // 勾配（drop/dist）が最大の隣接を選ぶ
        const slope = drop / dist;
        const bestSlope = bestIdx >= 0 ? bestDrop / (distance[i] ?? 1) : 0;
        if (slope > bestSlope) {
          bestIdx = ni;
          bestDrop = drop;
          distance[i] = dist;
        }
      }
      downstream[i] = bestIdx;
    }
  }

  return { downstream, distance };
}

/** drainage area を計算する（高さ降順でトポロジカルに蓄積） */
function computeDrainageArea(
  size: number,
  elevation: Float32Array,
  downstream: Int32Array,
): Float32Array {
  const area = new Float32Array(size);
  area.fill(1); // 各セルの単位降水

  // インデックスを elevation 降順でソート
  const indices = new Uint32Array(size);
  for (let i = 0; i < size; i++) indices[i] = i;
  const arr = Array.from(indices);
  arr.sort((a, b) => (elevation[b] ?? 0) - (elevation[a] ?? 0));

  for (const idx of arr) {
    const d = downstream[idx] ?? -1;
    if (d >= 0) {
      area[d] = (area[d] ?? 0) + (area[idx] ?? 0);
    }
  }
  return area;
}

/**
 * FastScape 陰解法による SPL 1 イテレーション。
 *
 * 昇順ソート（低い順＝下流側）で各セルを処理する。
 * 下流セルは既に更新済みなので h_new[d(i)] を使える。
 */
function applySPLIteration(
  size: number,
  elevation: Float32Array,
  downstream: Int32Array,
  distance: Float32Array,
  area: Float32Array,
  k: number,
  m: number,
  dt: number,
): void {
  // 昇順ソート: 下流セル（低い）から処理する
  const indices = new Uint32Array(size);
  for (let i = 0; i < size; i++) indices[i] = i;
  const arr = Array.from(indices);
  arr.sort((a, b) => (elevation[a] ?? 0) - (elevation[b] ?? 0));

  for (const i of arr) {
    const d = downstream[i] ?? -1;
    if (d < 0) continue; // 出口セルは更新しない

    const L = distance[i] ?? 1;
    const A = area[i] ?? 1;
    // C = K × dt × A^m / L
    const C = k * dt * Math.pow(A, m) / L;

    const hi = elevation[i] ?? 0;
    const hd = elevation[d] ?? 0;

    // h_new[i] = (hi + C × hd) / (1 + C)
    // ただし下流より低くならないようクランプ
    const hNew = (hi + C * hd) / (1 + C);
    elevation[i] = Math.max(hNew, hd);
  }
}

/**
 * Stream Power Law 侵食ストラテジ。
 *
 * 各イテレーションで pit fill → D8 → flow accumulation → FastScape 1 ステップを実行。
 * 反復ごとに地形が変化するため、毎回 pit fill し直す必要がある。
 */
export function streamPowerLaw(params: StreamPowerLawParams = {}): Strategy {
  const cfg = { ...DEFAULT_PARAMS, ...params };

  return {
    name: "streamPowerLaw",
    slot: "erosion",
    requires: ["elevation"],
    provides: ["elevation"],
    run: (ctx: StageContext) => {
      const { width: w, height: h, elevation } = ctx;
      const size = w * h;

      for (let iter = 0; iter < cfg.iterations; iter++) {
        // 1. Pit fill
        fillDepressions(w, h, elevation);

        // 2. D8 下流
        const { downstream, distance } = computeDownstream(w, h, elevation);

        // 3. Drainage area
        const area = computeDrainageArea(size, elevation, downstream);

        // 4. FastScape 陰解法
        applySPLIteration(size, elevation, downstream, distance, area, cfg.k, cfg.m, cfg.dt);
      }
    },
  };
}
