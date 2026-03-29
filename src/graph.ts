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

/** エッジ内のセクション数 */
export function getSectionCount(edge: GraphEdge): number {
  return computeSignalPositions(edge.path.length).length + 1;
}

/** パスインデックスが属するセクションインデックスを返す */
export function getSectionAt(edge: GraphEdge, pathIndex: number): number {
  const positions = computeSignalPositions(edge.path.length);
  for (let i = 0; i < positions.length; i++) {
    const pos = positions[i];
    if (pos !== undefined && pathIndex < pos) return i;
  }
  return positions.length;
}

/** セクション境界のパスインデックスリストを返す（描画用） */
export function getSignalPositions(edge: GraphEdge): number[] {
  return computeSignalPositions(edge.path.length);
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

  getAllNodes(): readonly GraphNode[] {
    return [...this.nodes.values()];
  }

  get nodeCount(): number {
    return this.nodes.size;
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

  getAllEdges(): readonly GraphEdge[] {
    return [...this.edges.values()];
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
