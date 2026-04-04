import type { StageContext } from "../context.js";

const DX = [0, 1, 1, 1, 0, -1, -1, -1];
const DY = [-1, -1, 0, 1, 1, 1, 0, -1];

/**
 * 河川検出:
 * 1. 窪地を埋めて全ての水が端（海）まで流れるようにする
 * 2. 高い→低いへ水を流して流量を蓄積する
 */
export function computeRivers(ctx: StageContext): void {
  const { width: w, height: h, elevation, flow, rng } = ctx;
  const size = w * h;

  // 窪地を埋める（全セルから端まで排水可能にする）
  fillDepressions(w, h, elevation);

  // 窪地埋め後に微小ノイズを加えて排水方向を分散させる
  for (let i = 0; i < size; i++) {
    elevation[i] = (elevation[i] ?? 0) + rng() * 0.0001;
  }

  // 各セルに1の降水
  flow.fill(1);

  // 全セルを高さ降順でソート
  const indices = new Uint32Array(size);
  for (let i = 0; i < size; i++) {
    indices[i] = i;
  }
  indices.sort((a, b) => (elevation[b] ?? 0) - (elevation[a] ?? 0));

  for (const idx of indices) {
    const cx = idx % w;
    const cy = (idx - cx) / w;
    const ch = elevation[idx] ?? 0;

    // 最も低い隣を探す
    let bestIdx = -1;
    let bestH = ch;
    for (let d = 0; d < 8; d++) {
      const nx = cx + (DX[d] ?? 0);
      const ny = cy + (DY[d] ?? 0);
      if (nx < 0 || nx >= w || ny < 0 || ny >= h) continue;
      const ni = ny * w + nx;
      const nh = elevation[ni] ?? 0;
      if (nh < bestH) {
        bestH = nh;
        bestIdx = ni;
      }
    }
    if (bestIdx >= 0) {
      flow[bestIdx] = (flow[bestIdx] ?? 0) + (flow[idx] ?? 0);
    }
  }
}

/**
 * 窪地埋め: Priority-Flood アルゴリズム。
 * 端のセルから始めて、まだ処理していないセルを高さ順に処理する。
 * 窪地のセルは流出先の高さ + ε まで引き上げられる。
 */
function fillDepressions(w: number, h: number, elevation: Float32Array): void {
  const size = w * h;
  const epsilon = 0.0001;
  const visited = new Uint8Array(size);

  // 簡易ヒープ（ソート済み配列で代用）
  // 端のセルを初期キューに入れる
  const queue: { idx: number; h: number }[] = [];
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (x === 0 || x === w - 1 || y === 0 || y === h - 1) {
        const i = y * w + x;
        queue.push({ idx: i, h: elevation[i] ?? 0 });
        visited[i] = 1;
      }
    }
  }

  // 高さ昇順でソート
  queue.sort((a, b) => a.h - b.h);

  let queueStart = 0;
  while (queueStart < queue.length) {
    const current = queue[queueStart];
    queueStart++;
    if (current === undefined) continue;

    const cx = current.idx % w;
    const cy = (current.idx - cx) / w;

    for (let d = 0; d < 8; d++) {
      const nx = cx + (DX[d] ?? 0);
      const ny = cy + (DY[d] ?? 0);
      if (nx < 0 || nx >= w || ny < 0 || ny >= h) continue;
      const ni = ny * w + nx;
      if (visited[ni] === 1) continue;
      visited[ni] = 1;

      const nh = elevation[ni] ?? 0;
      if (nh < current.h + epsilon) {
        // 窪地: 高さを引き上げる
        elevation[ni] = current.h + epsilon;
      }

      // キューに挿入（ソート位置を探す）
      const insertH = elevation[ni] ?? 0;
      // 末尾に追加してソート（シンプルだがO(n)。実用上はヒープが望ましい）
      queue.push({ idx: ni, h: insertH });
    }

    // 定期的に再ソートする（パフォーマンス改善）
    if (queueStart > 1000 && queueStart % 1000 === 0) {
      const remaining = queue.slice(queueStart);
      remaining.sort((a, b) => a.h - b.h);
      queue.length = 0;
      queue.push(...remaining);
      queueStart = 0;
    }
  }
}
