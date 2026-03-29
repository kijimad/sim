import type { PathNode } from "./pathfinding.js";

export const NodeKind = {
  Station: 0,
} as const;

export type NodeKind = (typeof NodeKind)[keyof typeof NodeKind];

const DEFAULT_CAPACITY: Record<NodeKind, number> = {
  [NodeKind.Station]: 2,
};

export const NODE_KIND_NAMES: Record<NodeKind, string> = {
  [NodeKind.Station]: "Station",
};

export interface GraphNode {
  readonly id: number;
  readonly kind: NodeKind;
  readonly tileX: number;
  readonly tileY: number;
  name: string;
  capacity: number;
}

export interface GraphEdge {
  readonly id: number;
  readonly fromId: number;
  readonly toId: number;
  /** 始点ノードから終点ノードまでのタイルパス（両端を含む） */
  readonly path: readonly PathNode[];
}

/** 閉塞区間の間隔（タイル数） */
const SIGNAL_INTERVAL = 10;

/** セクションID用のキー文字列（方向別） */
export function sectionKey(edgeId: number, section: number, forward: boolean): string {
  return `${String(edgeId)}:${String(section)}:${forward ? "f" : "b"}`;
}

/**
 * エッジ内のセクション数とセクション境界位置を計算する。
 * 短すぎるセクション（SIGNAL_INTERVAL/2未満）は前のセクションに統合する。
 */
function computeSignalPositions(pathLength: number): number[] {
  const positions: number[] = [];
  for (let i = SIGNAL_INTERVAL; i < pathLength - 1; i += SIGNAL_INTERVAL) {
    // 最後のセクションが短すぎないか確認
    const remaining = pathLength - 1 - i;
    if (remaining >= SIGNAL_INTERVAL / 2) {
      positions.push(i);
    }
  }
  return positions;
}

/** パス長→信号位置のキャッシュ（同じ長さなら同じ結果） */
const signalPositionCache = new Map<number, number[]>();

/** キャッシュ付きで信号位置を取得する */
function getCachedSignalPositions(pathLength: number): number[] {
  let cached = signalPositionCache.get(pathLength);
  if (cached === undefined) {
    cached = computeSignalPositions(pathLength);
    signalPositionCache.set(pathLength, cached);
  }
  return cached;
}

/** エッジ内のセクション数 */
export function getSectionCount(edge: GraphEdge): number {
  return getCachedSignalPositions(edge.path.length).length + 1;
}

/** パスインデックスが属するセクションインデックスを返す */
export function getSectionAt(edge: GraphEdge, pathIndex: number): number {
  const positions = getCachedSignalPositions(edge.path.length);
  for (let i = 0; i < positions.length; i++) {
    const pos = positions[i];
    if (pos !== undefined && pathIndex < pos) return i;
  }
  return positions.length;
}

/** セクション境界のパスインデックスリストを返す（描画用） */
export function getSignalPositions(edge: GraphEdge): number[] {
  return getCachedSignalPositions(edge.path.length);
}

/**
 * 新パスが既存エッジ群と重なるタイルで、直交（90度）以外の交差がないか判定する。
 * 新パスの端点（index 0 と最終）はノード位置なので判定から除外する。
 */
export function hasNonPerpendicularOverlap(
  newPath: readonly { x: number; y: number }[],
  existingEdges: Iterable<GraphEdge>,
): boolean {
  // 既存エッジのタイル→方向のインデックスを構築する
  const existingDirs = new Map<string, { dx: number; dy: number }[]>();
  for (const edge of existingEdges) {
    for (let i = 0; i < edge.path.length - 1; i++) {
      const p = edge.path[i];
      const next = edge.path[i + 1];
      if (p === undefined || next === undefined) continue;
      const key = `${String(p.x)},${String(p.y)}`;
      let dirs = existingDirs.get(key);
      if (dirs === undefined) {
        dirs = [];
        existingDirs.set(key, dirs);
      }
      dirs.push({ dx: next.x - p.x, dy: next.y - p.y });
    }
  }

  // 新パスの各タイル（端点を除く）で重なりを確認する
  for (let i = 1; i < newPath.length - 1; i++) {
    const p = newPath[i];
    const next = newPath[i + 1];
    if (p === undefined || next === undefined) continue;

    const key = `${String(p.x)},${String(p.y)}`;
    const dirs = existingDirs.get(key);
    if (dirs === undefined) continue;

    const ndx = next.x - p.x;
    const ndy = next.y - p.y;

    for (const ed of dirs) {
      // 内積: 0なら直交、非0なら平行または斜め
      if (ndx * ed.dx + ndy * ed.dy !== 0) return true;
    }
  }
  return false;
}

export class Graph {
  private nodes = new Map<number, GraphNode>();
  private edges = new Map<number, GraphEdge>();
  private nextId = 1;

  addNode(
    kind: NodeKind,
    tileX: number,
    tileY: number,
    name: string,
    capacity?: number,
  ): GraphNode {
    const id = this.nextId++;
    const cap = capacity ?? DEFAULT_CAPACITY[kind];
    const node: GraphNode = { id, kind, tileX, tileY, name, capacity: cap };
    this.nodes.set(id, node);
    return node;
  }

  /** ノード削除。エッジ2本の場合は結合する */
  removeNode(id: number): {
    deleted: boolean;
    mergedEdge?: GraphEdge | undefined;
    oldEdgeIds?: [number, number] | undefined;
    splitPathIndex?: number | undefined;
  } {
    const connectedEdges: GraphEdge[] = [];
    for (const edge of this.edges.values()) {
      if (edge.fromId === id || edge.toId === id) {
        connectedEdges.push(edge);
      }
    }

    let mergedEdge: GraphEdge | undefined;
    let oldEdgeIds: [number, number] | undefined;
    let splitPathIndex: number | undefined;

    if (connectedEdges.length === 2) {
      const e1 = connectedEdges[0];
      const e2 = connectedEdges[1];
      if (e1 !== undefined && e2 !== undefined) {
        const other1 = e1.fromId === id ? e1.toId : e1.fromId;
        const other2 = e2.fromId === id ? e2.toId : e2.fromId;

        const path1 = e1.toId === id ? [...e1.path] : [...e1.path].reverse();
        const path2 = e2.fromId === id ? e2.path.slice(1) : [...e2.path].reverse().slice(1);
        const mergedPath = [...path1, ...path2];

        oldEdgeIds = [e1.id, e2.id];
        splitPathIndex = path1.length - 1;

        this.edges.delete(e1.id);
        this.edges.delete(e2.id);
        mergedEdge = this.addEdge(other1, other2, mergedPath);
      }
    } else {
      for (const edge of connectedEdges) {
        this.edges.delete(edge.id);
      }
    }

    const deleted = this.nodes.delete(id);
    return { deleted, mergedEdge, oldEdgeIds, splitPathIndex };
  }

  getNode(id: number): GraphNode | undefined {
    return this.nodes.get(id);
  }

  getNodeAt(tileX: number, tileY: number): GraphNode | undefined {
    for (const node of this.nodes.values()) {
      if (node.tileX === tileX && node.tileY === tileY) {
        return node;
      }
    }
    return undefined;
  }

  getAllNodes(): IterableIterator<GraphNode> {
    return this.nodes.values();
  }

  get nodeCount(): number {
    return this.nodes.size;
  }

  /** 隣接駅を取得する（マンハッタン距離1、上下左右のみ） */
  getAdjacentStations(nodeId: number): GraphNode[] {
    const node = this.nodes.get(nodeId);
    if (node === undefined) return [];
    const result: GraphNode[] = [];
    for (const other of this.nodes.values()) {
      if (other.id === nodeId) continue;
      const dx = Math.abs(other.tileX - node.tileX);
      const dy = Math.abs(other.tileY - node.tileY);
      if (dx + dy === 1) {
        result.push(other);
      }
    }
    return result;
  }

  /**
   * 駅複合体を取得する（隣接の連鎖で繋がった全駅）。
   * チェビシェフ距離1以内の隣接関係をBFSでたどり、連結成分を返す。
   */
  getStationComplex(nodeId: number): GraphNode[] {
    const start = this.nodes.get(nodeId);
    if (start === undefined) return [];

    const visited = new Set<number>([nodeId]);
    const queue: GraphNode[] = [start];
    const result: GraphNode[] = [start];

    while (queue.length > 0) {
      const current = queue.shift();
      if (current === undefined) break;
      for (const adj of this.getAdjacentStations(current.id)) {
        if (visited.has(adj.id)) continue;
        visited.add(adj.id);
        queue.push(adj);
        result.push(adj);
      }
    }
    return result;
  }

  /**
   * エッジの方向がノードの隣接駅と平行でないか判定する。
   * 隣接駅がなければ true（制約なし）。
   * edgeDx, edgeDy はノードから見たエッジの進行方向。
   */
  isEdgeDirectionValid(nodeId: number, edgeDx: number, edgeDy: number): boolean {
    const node = this.nodes.get(nodeId);
    if (node === undefined) return false;

    for (const adj of this.getAdjacentStations(nodeId)) {
      const adjDx = adj.tileX - node.tileX;
      const adjDy = adj.tileY - node.tileY;
      // 内積が0でなければ平行方向に隣接駅がある
      if (adjDx * edgeDx + adjDy * edgeDy !== 0) return false;
    }
    return true;
  }

  /**
   * 指定座標がノードのエッジ方向に対して垂直かどうかを判定する。
   * エッジがない場合は true（どこでも隣接可能）。
   */
  isPerpendicularToEdges(nodeId: number, tileX: number, tileY: number): boolean {
    const node = this.nodes.get(nodeId);
    if (node === undefined) return false;

    const edges = this.getEdgesFor(nodeId);
    if (edges.length === 0) return true;

    const adjDx = tileX - node.tileX;
    const adjDy = tileY - node.tileY;

    for (const edge of edges) {
      // ノードから見たエッジの進行方向（パスの最初の1セグメント）
      let edgeDx: number;
      let edgeDy: number;
      if (edge.fromId === nodeId) {
        const next = edge.path[1];
        if (next === undefined) continue;
        edgeDx = next.x - node.tileX;
        edgeDy = next.y - node.tileY;
      } else {
        const prev = edge.path[edge.path.length - 2];
        if (prev === undefined) continue;
        edgeDx = prev.x - node.tileX;
        edgeDy = prev.y - node.tileY;
      }

      // 内積が0なら垂直
      if (adjDx * edgeDx + adjDy * edgeDy !== 0) return false;
    }
    return true;
  }

  addEdge(fromId: number, toId: number, path: readonly PathNode[]): GraphEdge {
    const from = this.nodes.get(fromId);
    const to = this.nodes.get(toId);
    if (from === undefined || to === undefined) {
      throw new Error(`Node not found: from=${String(fromId)}, to=${String(toId)}`);
    }
    const id = this.nextId++;
    const edge: GraphEdge = { id, fromId, toId, path };
    this.edges.set(id, edge);
    return edge;
  }

  removeEdge(id: number): boolean {
    return this.edges.delete(id);
  }

  getEdge(id: number): GraphEdge | undefined {
    return this.edges.get(id);
  }

  getEdgesBetween(nodeIdA: number, nodeIdB: number): GraphEdge | undefined {
    for (const edge of this.edges.values()) {
      if (
        (edge.fromId === nodeIdA && edge.toId === nodeIdB) ||
        (edge.fromId === nodeIdB && edge.toId === nodeIdA)
      ) {
        return edge;
      }
    }
    return undefined;
  }

  getEdgesFor(nodeId: number): readonly GraphEdge[] {
    const result: GraphEdge[] = [];
    for (const edge of this.edges.values()) {
      if (edge.fromId === nodeId || edge.toId === nodeId) {
        result.push(edge);
      }
    }
    return result;
  }

  getAllEdges(): IterableIterator<GraphEdge> {
    return this.edges.values();
  }

  get edgeCount(): number {
    return this.edges.size;
  }

  splitEdge(
    edgeId: number,
    node: GraphNode,
    pathIndex: number,
  ): { edge1: GraphEdge; edge2: GraphEdge } | null {
    const edge = this.edges.get(edgeId);
    if (edge === undefined) return null;
    if (pathIndex <= 0 || pathIndex >= edge.path.length - 1) return null;

    const path1 = edge.path.slice(0, pathIndex + 1);
    const path2 = edge.path.slice(pathIndex);

    this.edges.delete(edgeId);

    const edge1 = this.addEdge(edge.fromId, node.id, path1);
    const edge2 = this.addEdge(node.id, edge.toId, path2);

    return { edge1, edge2 };
  }

  findClosestEdgePoint(
    tileX: number,
    tileY: number,
  ): { edge: GraphEdge; pathIndex: number; distance: number } | null {
    let best: { edge: GraphEdge; pathIndex: number; distance: number } | null = null;

    for (const edge of this.edges.values()) {
      for (let i = 1; i < edge.path.length - 1; i++) {
        const p = edge.path[i];
        if (p === undefined) continue;
        const dx = p.x - tileX;
        const dy = p.y - tileY;
        const dist = dx * dx + dy * dy;
        if (best === null || dist < best.distance) {
          best = { edge, pathIndex: i, distance: dist };
        }
      }
    }

    return best;
  }
}
