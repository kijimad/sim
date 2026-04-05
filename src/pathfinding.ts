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
  [Terrain.Sand]: 1.5,
};

/** 1タイルの標高差あたりの追加建設コスト。大きいほど等高線に沿ったルートが選ばれる */
const SLOPE_COST_FACTOR = 5000;

/** 隣接タイル間の最大許容標高差。これを超えるとレール敷設不可 */
const MAX_SLOPE = 0.015;

/** コスト内訳 */
export interface PathCostBreakdown {
  readonly total: number;
  readonly terrain: number;
  readonly slope: number;
  readonly length: number;
  readonly maxElevDiff: number;
  readonly totalElevGain: number;
  readonly impossible: boolean;
}

/** パスの建設コストを計算する（地形コスト + 高低差コスト） */
export function calcPathCost(map: TileMap, path: readonly PathNode[]): number {
  return calcPathCostDetail(map, path).total;
}

/** パスの建設コスト内訳を計算する */
export function calcPathCostDetail(map: TileMap, path: readonly PathNode[]): PathCostBreakdown {
  let terrainCost = 0;
  let slopeCost = 0;
  let maxElevDiff = 0;
  let totalElevGain = 0;
  let impossible = false;

  for (let i = 0; i < path.length; i++) {
    const p = path[i];
    if (p === undefined || !map.inBounds(p.x, p.y)) continue;
    const tile = map.get(p.x, p.y);
    const tc = TERRAIN_COST[tile.terrain];
    terrainCost += tc === Infinity ? 0 : tc;

    if (i > 0) {
      const prev = path[i - 1];
      if (prev !== undefined && map.inBounds(prev.x, prev.y)) {
        const prevTile = map.get(prev.x, prev.y);
        const elevDiff = Math.abs(tile.elevation - prevTile.elevation);
        if (elevDiff > MAX_SLOPE) impossible = true;
        if (elevDiff > maxElevDiff) maxElevDiff = elevDiff;
        if (tile.elevation > prevTile.elevation) totalElevGain += tile.elevation - prevTile.elevation;
        slopeCost += elevDiff * SLOPE_COST_FACTOR;
      }
    }
  }

  return {
    total: impossible ? Infinity : Math.round(terrainCost + slopeCost),
    terrain: Math.round(terrainCost),
    slope: Math.round(slopeCost),
    length: path.length,
    maxElevDiff: Math.round(maxElevDiff * 1000) / 1000,
    totalElevGain: Math.round(totalElevGain * 1000) / 1000,
    impossible,
  };
}

function heuristic(ax: number, ay: number, bx: number, by: number): number {
  // admissible なヒューリスティック: 最小地形コスト（平地1）× マンハッタン距離
  // 勾配コストは0以上なので加算しなくても admissible
  return (Math.abs(ax - bx) + Math.abs(ay - by)) * 1;
}

/** 探索上限ノード数（大きいマップでも最適解に近い解を返すため） */
const MAX_SEARCH_NODES = 500000;

// 8方向移動（斜め含む）で等高線に沿ったルートを見つけやすくする
const DX = [0, 1, 0, -1, 1, 1, -1, -1];
const DY = [-1, 0, 1, 0, -1, 1, 1, -1];
const MOVE_DIST = [1, 1, 1, 1, 1.414, 1.414, 1.414, 1.414];

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

  let nodesExpanded = 0;
  while (heap.length > 0) {
    const currentKey = heap.pop();

    if (currentKey === endKey) {
      return reconstructPath(cameFrom, endKey, w);
    }

    if (closed[currentKey] === 1) continue;
    closed[currentKey] = 1;
    nodesExpanded++;
    if (nodesExpanded > MAX_SEARCH_NODES) return null;

    const cx = currentKey % w;
    const cy = (currentKey - cx) / w;
    const currentG = gScore[currentKey] ?? Infinity;
    const currentDir = dirMap[currentKey] ?? -1;

    const currentTile = map.get(cx, cy);

    for (let d = 0; d < 8; d++) {
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

      // 斜め移動の距離補正
      const dist = MOVE_DIST[d] ?? 1;

      // 高低差コスト: 閾値を超えると敷設不可（斜めは距離で補正）
      const elevDiff = Math.abs(tile.elevation - currentTile.elevation);
      if (elevDiff > MAX_SLOPE * dist) continue;
      const slopeCost = elevDiff * SLOPE_COST_FACTOR;

      // ジグザグ誘導
      const stepDir = d < 4 ? d : -1;
      const straightPenalty = (currentDir >= 0 && currentDir === stepDir) ? 0.01 : 0;

      const tentativeG = currentG + moveCost * dist + slopeCost + straightPenalty;
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
