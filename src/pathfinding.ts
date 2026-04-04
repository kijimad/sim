import type { TileMap } from "./tilemap.js";
import { Terrain } from "./types.js";

export interface PathNode {
  readonly x: number;
  readonly y: number;
}

export const TERRAIN_COST: Record<Terrain, number> = {
  [Terrain.Flat]: 1,
  [Terrain.Mountain]: 5,
  [Terrain.Water]: Infinity,
};

/** 1タイルの標高差あたりの追加建設コスト。大きいほど等高線に沿ったルートが選ばれる */
const SLOPE_COST_FACTOR = 500;

/** パスの建設コストを計算する（地形コスト + 高低差コスト） */
export function calcPathCost(map: TileMap, path: readonly PathNode[]): number {
  let cost = 0;
  for (let i = 0; i < path.length; i++) {
    const p = path[i];
    if (p === undefined || !map.inBounds(p.x, p.y)) continue;
    const tile = map.get(p.x, p.y);
    const tc = TERRAIN_COST[tile.terrain];
    cost += tc === Infinity ? 0 : tc;
    // 隣接タイルとの高低差コスト
    if (i > 0) {
      const prev = path[i - 1];
      if (prev !== undefined && map.inBounds(prev.x, prev.y)) {
        const prevTile = map.get(prev.x, prev.y);
        cost += Math.abs(tile.elevation - prevTile.elevation) * SLOPE_COST_FACTOR;
      }
    }
  }
  return Math.round(cost);
}

function heuristic(ax: number, ay: number, bx: number, by: number): number {
  // admissible なヒューリスティック: 最小コスト（平地1/タイル）× マンハッタン距離
  return Math.abs(ax - bx) + Math.abs(ay - by);
}

const DX = [0, 1, 0, -1];
const DY = [-1, 0, 1, 0];

// --- バイナリヒープ（最小ヒープ） ---

class MinHeap {
  private readonly keys: number[] = [];
  private readonly priorities: number[] = [];
  private size = 0;

  get length(): number {
    return this.size;
  }

  push(key: number, priority: number): void {
    this.keys[this.size] = key;
    this.priorities[this.size] = priority;
    this.size++;
    this.bubbleUp(this.size - 1);
  }

  pop(): number {
    const top = this.keys[0] ?? 0;
    this.size--;
    if (this.size > 0) {
      this.keys[0] = this.keys[this.size] ?? 0;
      this.priorities[0] = this.priorities[this.size] ?? 0;
      this.sinkDown(0);
    }
    return top;
  }

  private bubbleUp(i: number): void {
    while (i > 0) {
      const parent = (i - 1) >> 1;
      if ((this.priorities[i] ?? 0) >= (this.priorities[parent] ?? 0)) break;
      this.swap(i, parent);
      i = parent;
    }
  }

  private sinkDown(i: number): void {
    for (;;) {
      let smallest = i;
      const left = 2 * i + 1;
      const right = 2 * i + 2;
      if (left < this.size && (this.priorities[left] ?? 0) < (this.priorities[smallest] ?? 0)) {
        smallest = left;
      }
      if (right < this.size && (this.priorities[right] ?? 0) < (this.priorities[smallest] ?? 0)) {
        smallest = right;
      }
      if (smallest === i) break;
      this.swap(i, smallest);
      i = smallest;
    }
  }

  private swap(a: number, b: number): void {
    const tmpK = this.keys[a] ?? 0;
    const tmpP = this.priorities[a] ?? 0;
    this.keys[a] = this.keys[b] ?? 0;
    this.priorities[a] = this.priorities[b] ?? 0;
    this.keys[b] = tmpK;
    this.priorities[b] = tmpP;
  }
}

// --- A* 経路探索 ---

/**
 * タイルマップ上のA*経路探索。開始点と終了点を含む経路を返す。
 * 経路が存在しない場合はnullを返す。
 */
export function findPath(
  map: TileMap,
  startX: number,
  startY: number,
  endX: number,
  endY: number,
  blocked?: ReadonlySet<string>,
): PathNode[] | null {
  if (!map.inBounds(startX, startY) || !map.inBounds(endX, endY)) {
    return null;
  }

  const w = map.width;
  const totalTiles = w * map.height;
  const startKey = startY * w + startX;
  const endKey = endY * w + endX;

  if (startKey === endKey) {
    return [{ x: startX, y: startY }];
  }

  // フラット配列で高速アクセス
  const gScore = new Float64Array(totalTiles);
  gScore.fill(Infinity);
  gScore[startKey] = 0;

  // cameFrom: -1 = 未訪問
  const cameFrom = new Int32Array(totalTiles);
  cameFrom.fill(-1);

  // 方向記録（ジグザグ用）: -1=未設定, 0=水平, 1=垂直
  const dirMap = new Int8Array(totalTiles);
  dirMap.fill(-1);

  // closed セット
  const closed = new Uint8Array(totalTiles);

  const heap = new MinHeap();
  heap.push(startKey, heuristic(startX, startY, endX, endY));

  while (heap.length > 0) {
    const currentKey = heap.pop();

    if (currentKey === endKey) {
      return reconstructPath(cameFrom, endKey, w);
    }

    if (closed[currentKey] === 1) continue;
    closed[currentKey] = 1;

    const cx = currentKey % w;
    const cy = (currentKey - cx) / w;
    const currentG = gScore[currentKey] ?? Infinity;
    const currentDir = dirMap[currentKey] ?? -1;

    for (let d = 0; d < 4; d++) {
      const nx = cx + (DX[d] ?? 0);
      const ny = cy + (DY[d] ?? 0);

      if (nx < 0 || nx >= w || ny < 0 || ny >= map.height) continue;

      const neighborKey = ny * w + nx;
      if (closed[neighborKey] === 1) continue;

      // ブロックタイル判定（始点・終点は除外）
      if (blocked !== undefined && neighborKey !== endKey && neighborKey !== startKey && blocked.has(`${String(nx)},${String(ny)}`)) continue;

      const tile = map.get(nx, ny);
      const moveCost = TERRAIN_COST[tile.terrain];
      if (moveCost === Infinity) continue;

      // 高低差コスト: 標高差が大きいほど建設費が高い
      const currentTile = map.get(cx, cy);
      const elevDiff = Math.abs(tile.elevation - currentTile.elevation);
      const slopeCost = elevDiff * SLOPE_COST_FACTOR;

      // ジグザグ誘導
      const stepDir = (DX[d] ?? 0) !== 0 ? 0 : 1;
      const straightPenalty = (currentDir >= 0 && currentDir === stepDir) ? 0.01 : 0;

      const tentativeG = currentG + moveCost + slopeCost + straightPenalty;
      if (tentativeG < (gScore[neighborKey] ?? Infinity)) {
        gScore[neighborKey] = tentativeG;
        cameFrom[neighborKey] = currentKey;
        dirMap[neighborKey] = stepDir;
        const f = tentativeG + heuristic(nx, ny, endX, endY);
        heap.push(neighborKey, f);
      }
    }
  }

  return null;
}

function reconstructPath(
  cameFrom: Int32Array,
  endKey: number,
  width: number,
): PathNode[] {
  const path: PathNode[] = [];
  let current = endKey;
  while (current >= 0) {
    path.push({ x: current % width, y: (current - current % width) / width });
    current = cameFrom[current] ?? -1;
  }
  path.reverse();
  return path;
}
