import type { StageContext } from "../context.js";
import { Biome } from "../context.js";
import { createGradientNoise } from "./continent.js";

/**
 * 湾形成ステージ:
 * 海岸線の特定区間を大きく沈降させて明確な湾を作る。
 * 128タイル規模のバイオームとして機能し、湾内の陸地は Bay バイオームに設定される。
 */
export function formBays(ctx: StageContext): void {
  const { width: w, height: h, elevation, rng } = ctx;
  const WATER_TH = 0.2;

  // 湾の位置を制御する低周波ノイズ（128タイルスケール）
  const bayNoise = createGradientNoise(rng);
  const angle = rng() * Math.PI * 2;
  const bcos = Math.cos(angle);
  const bsin = Math.sin(angle);
  const box = rng() * 500;
  const boy = rng() * 500;

  const size = w * h;

  // 海岸線からの距離を計算する（BFS）
  const coastDist = new Float32Array(size).fill(Infinity);
  const queue: number[] = [];
  const DX = [0, 1, 0, -1];
  const DY = [-1, 0, 1, 0];

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = y * w + x;
      if ((elevation[i] ?? 0) < WATER_TH) continue;

      let nearWater = false;
      for (let d = 0; d < 4; d++) {
        const nx = x + (DX[d] ?? 0);
        const ny = y + (DY[d] ?? 0);
        if (nx < 0 || nx >= w || ny < 0 || ny >= h) continue;
        if ((elevation[ny * w + nx] ?? 0) < WATER_TH) {
          nearWater = true;
          break;
        }
      }
      if (nearWater) {
        coastDist[i] = 0;
        queue.push(i);
      }
    }
  }

  // 湾の最大奥行き（マップサイズに比例させてプレビューと本番で一致させる）
  const BAY_DEPTH = Math.max(20, Math.floor(Math.min(w, h) * 0.1));
  let head = 0;
  while (head < queue.length) {
    const ci = queue[head++] ?? 0;
    const cx = ci % w;
    const cy = (ci - cx) / w;
    const cd = coastDist[ci] ?? 0;
    if (cd >= BAY_DEPTH) continue;

    for (let d = 0; d < 4; d++) {
      const nx = cx + (DX[d] ?? 0);
      const ny = cy + (DY[d] ?? 0);
      if (nx < 0 || nx >= w || ny < 0 || ny >= h) continue;
      const ni = ny * w + nx;
      if ((elevation[ni] ?? 0) < WATER_TH) continue;
      const nd = cd + 1;
      if (nd < (coastDist[ni] ?? Infinity)) {
        coastDist[ni] = nd;
        queue.push(ni);
      }
    }
  }

  // 海岸近傍をノイズで沈降させて湾を形成する
  // マップの約1/4スケールで湾が出現する区間を決定する
  const bayFreq = 4 / Math.min(w, h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = y * w + x;
      const dist = coastDist[i] ?? Infinity;
      if (dist > BAY_DEPTH || dist === Infinity) continue;

      const elev = elevation[i] ?? 0;
      if (elev < WATER_TH) continue;
      // 高地は湾で沈降させない
      if (elev > 0.5) continue;

      // マップの1/4スケールのノイズで湾エリアを決定する
      const fx = x * bayFreq;
      const fy = y * bayFreq;
      const nv = bayNoise(fx * bcos - fy * bsin + box, fx * bsin + fy * bcos + boy);

      // ノイズ値が高い領域で湾を形成する（約35%の海岸線）
      if (nv < 0.58) continue;

      // 沈降の強さ（ノイズ値に応じて深さが変わる）
      const bayPower = (nv - 0.58) / 0.42; // 0〜1
      // 海岸からの距離に応じた沈降量（海岸に近いほど深い）
      const distFactor = 1 - dist / BAY_DEPTH;
      // 強く沈降させて明確な湾にする
      const sink = distFactor * distFactor * bayPower * 0.5;

      const newElev = elev - sink;
      elevation[i] = Math.max(0, newElev);

      // 湾エリアを Bay バイオームに設定する
      ctx.biomeId[i] = Biome.Bay;
    }
  }

  // トンボロ検出: 両側が水に挟まれた狭い陸橋を Tombolo バイオームにする
  detectTombolos(ctx);

  // 島検出: 海に囲まれた小さい陸塊を Island バイオームにする
  detectIslands(ctx);

}

/**
 * トンボロ（陸繋砂州）検出:
 * 4軸方向（水平・垂直・斜め2方向）で対岸の水を探し、
 * 幅が一定以下の陸橋を Tombolo バイオームに設定する。
 * さらに陸橋の標高をなだらかにして砂州らしい地形にする。
 */
function detectTombolos(ctx: StageContext): void {
  const { width: w, height: h, elevation } = ctx;
  const WATER_TH = 0.2;
  // トンボロと判定する最大幅（マップサイズに比例）
  const MAX_HALF_WIDTH = Math.max(4, Math.floor(Math.min(w, h) * 0.02));
  // 4軸方向
  const AXES = [
    { dx: 1, dy: 0 },  // 水平
    { dx: 0, dy: 1 },  // 垂直
    { dx: 1, dy: 1 },  // 斜め右下
    { dx: 1, dy: -1 }, // 斜め右上
  ];

  // 各陸地セルについて、いずれかの軸方向で両側に水があるかチェックする
  const tomboloCells: number[] = [];

  for (let y = MAX_HALF_WIDTH; y < h - MAX_HALF_WIDTH; y++) {
    for (let x = MAX_HALF_WIDTH; x < w - MAX_HALF_WIDTH; x++) {
      const i = y * w + x;
      const elev = elevation[i] ?? 0;
      if (elev < WATER_TH) continue;
      // 高地は除外（トンボロは低地でのみ形成される）
      if (elev > 0.4) continue;

      for (const axis of AXES) {
        // 正方向で水までの距離を測る
        let distPos = 0;
        for (let r = 1; r <= MAX_HALF_WIDTH; r++) {
          const nx = x + axis.dx * r;
          const ny = y + axis.dy * r;
          if (nx < 0 || nx >= w || ny < 0 || ny >= h) break;
          if ((elevation[ny * w + nx] ?? 0) < WATER_TH) {
            distPos = r;
            break;
          }
        }
        if (distPos === 0) continue;

        // 負方向で水までの距離を測る
        let distNeg = 0;
        for (let r = 1; r <= MAX_HALF_WIDTH; r++) {
          const nx = x - axis.dx * r;
          const ny = y - axis.dy * r;
          if (nx < 0 || nx >= w || ny < 0 || ny >= h) break;
          if ((elevation[ny * w + nx] ?? 0) < WATER_TH) {
            distNeg = r;
            break;
          }
        }
        if (distNeg === 0) continue;

        // 両側に水があり、合計幅が MAX_HALF_WIDTH*2 以下
        const totalWidth = distPos + distNeg - 1;
        if (totalWidth <= MAX_HALF_WIDTH * 2) {
          tomboloCells.push(i);
          break; // 1軸でも条件を満たせばトンボロ
        }
      }
    }
  }

  // トンボロの連続領域が一定サイズ以上の場合のみ採用する（ノイズ除去）
  // BFS で連結成分を求める
  const tomboloSet = new Set(tomboloCells);
  const visited = new Set<number>();
  const DX4 = [0, 1, 0, -1];
  const DY4 = [-1, 0, 1, 0];
  // 最小領域サイズ（マップサイズに比例）
  const MIN_TOMBOLO_SIZE = Math.max(5, Math.floor(Math.min(w, h) * 0.03));

  for (const startCell of tomboloCells) {
    if (visited.has(startCell)) continue;

    // BFS で連結成分を収集する
    const component: number[] = [startCell];
    visited.add(startCell);
    let qi = 0;
    while (qi < component.length) {
      const ci = component[qi++] ?? 0;
      const cx = ci % w;
      const cy = (ci - cx) / w;
      for (let d = 0; d < 4; d++) {
        const nx = cx + (DX4[d] ?? 0);
        const ny = cy + (DY4[d] ?? 0);
        const ni = ny * w + nx;
        if (tomboloSet.has(ni) && !visited.has(ni)) {
          visited.add(ni);
          component.push(ni);
        }
      }
    }

    // 一定サイズ以上の連結成分のみ Tombolo バイオームに設定する
    if (component.length >= MIN_TOMBOLO_SIZE) {
      for (const ci of component) {
        ctx.biomeId[ci] = Biome.Tombolo;
        // 標高をなだらかにする（砂州らしい低い地形）
        const current = elevation[ci] ?? 0;
        const lowered = WATER_TH + (current - WATER_TH) * 0.4;
        elevation[ci] = Math.max(WATER_TH + 0.01, lowered);
      }
    }
  }
}

/**
 * 島検出:
 * 陸地セルをBFSで連結成分に分け、面積が小さい陸塊を Island バイオームに設定する。
 * マップ端に接する陸塊は大陸とみなし、島にしない。
 */
function detectIslands(ctx: StageContext): void {
  const { width: w, height: h, elevation } = ctx;
  const size = w * h;
  const WATER_TH = 0.2;
  const DX4 = [0, 1, 0, -1];
  const DY4 = [-1, 0, 1, 0];

  // 島と判定する最大面積（マップ面積の一定割合以下）
  const MAX_ISLAND_AREA = Math.floor(size * 0.02);

  const visited = new Uint8Array(size);

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = y * w + x;
      if (visited[i] === 1) continue;
      if ((elevation[i] ?? 0) < WATER_TH) continue;

      // BFS で陸地の連結成分を収集する
      const component: number[] = [i];
      visited[i] = 1;
      let touchesEdge = false;
      let qi = 0;

      while (qi < component.length) {
        const ci = component[qi++] ?? 0;
        const cx = ci % w;
        const cy = (ci - cx) / w;

        // マップ端に接しているか
        if (cx === 0 || cx === w - 1 || cy === 0 || cy === h - 1) {
          touchesEdge = true;
        }

        for (let d = 0; d < 4; d++) {
          const nx = cx + (DX4[d] ?? 0);
          const ny = cy + (DY4[d] ?? 0);
          if (nx < 0 || nx >= w || ny < 0 || ny >= h) continue;
          const ni = ny * w + nx;
          if (visited[ni] === 1) continue;
          if ((elevation[ni] ?? 0) < WATER_TH) continue;
          visited[ni] = 1;
          component.push(ni);
        }
      }

      // マップ端に接していない小さい陸塊を Island バイオームにする
      if (!touchesEdge && component.length <= MAX_ISLAND_AREA) {
        for (const ci of component) {
          ctx.biomeId[ci] = Biome.Island;
        }
      }
    }
  }
}

