import type { TileMap } from "./tilemap.js";
import { Terrain } from "./types.js";

export interface PathNode {
  readonly x: number;
  readonly y: number;
}

const TERRAIN_COST: Record<Terrain, number> = {
  [Terrain.Flat]: 1,
  [Terrain.Mountain]: 5,
  [Terrain.Water]: Infinity,
};

function heuristic(ax: number, ay: number, bx: number, by: number): number {
  return Math.abs(ax - bx) + Math.abs(ay - by);
}

const NEIGHBORS: readonly (readonly [number, number])[] = [
  [0, -1],
  [1, 0],
  [0, 1],
  [-1, 0],
];

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
): PathNode[] | null {
  if (!map.inBounds(startX, startY) || !map.inBounds(endX, endY)) {
    return null;
  }

  const key = (x: number, y: number): number => y * map.width + x;

  const startKey = key(startX, startY);
  const endKey = key(endX, endY);

  const gScore = new Map<number, number>();
  gScore.set(startKey, 0);

  const fScore = new Map<number, number>();
  const startH = heuristic(startX, startY, endX, endY);
  fScore.set(startKey, startH);

  const cameFrom = new Map<number, number>();

  // ソート挿入による簡易優先度キュー（ゲーム用途には十分）
  const open: number[] = [startKey];
  const inOpen = new Set<number>([startKey]);

  const getFScore = (k: number): number => fScore.get(k) ?? Infinity;

  while (open.length > 0) {
    // 最小fScoreのノードを探す
    let bestIdx = 0;
    let bestF = getFScore(open[0] ?? 0);
    for (let i = 1; i < open.length; i++) {
      const f = getFScore(open[i] ?? 0);
      if (f < bestF) {
        bestF = f;
        bestIdx = i;
      }
    }

    const currentKey = open[bestIdx] ?? 0;
    open.splice(bestIdx, 1);
    inOpen.delete(currentKey);

    if (currentKey === endKey) {
      return reconstructPath(cameFrom, currentKey, map.width);
    }

    const cx = currentKey % map.width;
    const cy = Math.floor(currentKey / map.width);
    const currentG = gScore.get(currentKey) ?? Infinity;

    for (const [dx, dy] of NEIGHBORS) {
      const nx = cx + dx;
      const ny = cy + dy;

      if (!map.inBounds(nx, ny)) continue;

      const tile = map.get(nx, ny);
      const moveCost = TERRAIN_COST[tile.terrain];
      if (moveCost === Infinity) continue;

      const tentativeG = currentG + moveCost;
      const neighborKey = key(nx, ny);
      const prevG = gScore.get(neighborKey) ?? Infinity;

      if (tentativeG < prevG) {
        cameFrom.set(neighborKey, currentKey);
        gScore.set(neighborKey, tentativeG);
        fScore.set(neighborKey, tentativeG + heuristic(nx, ny, endX, endY));

        if (!inOpen.has(neighborKey)) {
          open.push(neighborKey);
          inOpen.add(neighborKey);
        }
      }
    }
  }

  return null;
}

function reconstructPath(
  cameFrom: Map<number, number>,
  endKey: number,
  width: number,
): PathNode[] {
  const path: PathNode[] = [];
  let current: number | undefined = endKey;
  while (current !== undefined) {
    path.push({ x: current % width, y: Math.floor(current / width) });
    current = cameFrom.get(current);
  }
  path.reverse();
  return path;
}
