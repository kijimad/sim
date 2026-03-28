import type { PathNode } from "./pathfinding.js";

export const NodeKind = {
  Station: 0,
  SignalStation: 1,
  Signal: 2,
} as const;

export type NodeKind = (typeof NodeKind)[keyof typeof NodeKind];

const DEFAULT_CAPACITY: Record<NodeKind, number> = {
  [NodeKind.Station]: 2,
  [NodeKind.SignalStation]: 2,
  [NodeKind.Signal]: 1,
};

/**
 * 信号場の線路配置。
 * - passing: 方向ごとに1線路（対向列車がすれ違い可能）
 * - overtaking: 同方向に2線路（後続列車が待機可能）
 */
export const SignalLayout = {
  Passing: 0,
  Overtaking: 1,
} as const;

export type SignalLayout = (typeof SignalLayout)[keyof typeof SignalLayout];

export const NODE_KIND_NAMES: Record<NodeKind, string> = {
  [NodeKind.Station]: "Station",
  [NodeKind.SignalStation]: "Signal Station",
  [NodeKind.Signal]: "Signal",
};

export const SIGNAL_LAYOUT_NAMES: Record<SignalLayout, string> = {
  [SignalLayout.Passing]: "Passing",
  [SignalLayout.Overtaking]: "Overtaking",
};

export interface GraphNode {
  readonly id: number;
  readonly kind: NodeKind;
  readonly tileX: number;
  readonly tileY: number;
  name: string;
  capacity: number;
  readonly signalLayout: SignalLayout;
}

export interface GraphEdge {
  readonly id: number;
  readonly fromId: number;
  readonly toId: number;
  /** 始点ノードから終点ノードまでのタイルパス（両端を含む） */
  readonly path: readonly PathNode[];
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
    signalLayout?: SignalLayout,
  ): GraphNode {
    const id = this.nextId++;
    const cap = capacity ?? DEFAULT_CAPACITY[kind];
    const layout = signalLayout ?? SignalLayout.Passing;
    const node: GraphNode = { id, kind, tileX, tileY, name, capacity: cap, signalLayout: layout };
    this.nodes.set(id, node);
    return node;
  }

  removeNode(id: number): boolean {
    // 接続エッジを収集
    const connectedEdges: GraphEdge[] = [];
    for (const edge of this.edges.values()) {
      if (edge.fromId === id || edge.toId === id) {
        connectedEdges.push(edge);
      }
    }

    // エッジが2本の場合、前後のノードを直接接続し直す（パスを結合）
    if (connectedEdges.length === 2) {
      const e1 = connectedEdges[0];
      const e2 = connectedEdges[1];
      if (e1 !== undefined && e2 !== undefined) {
        // e1の相手ノードとe2の相手ノードを特定
        const other1 = e1.fromId === id ? e1.toId : e1.fromId;
        const other2 = e2.fromId === id ? e2.toId : e2.fromId;

        // パスを結合: e1のパス(other1→id) + e2のパス(id→other2)
        const path1 = e1.toId === id ? [...e1.path] : [...e1.path].reverse();
        const path2 = e2.fromId === id ? e2.path.slice(1) : [...e2.path].reverse().slice(1);
        const mergedPath = [...path1, ...path2];

        // 古いエッジを削除して新しいエッジを作成
        this.edges.delete(e1.id);
        this.edges.delete(e2.id);
        this.addEdge(other1, other2, mergedPath);
      }
    } else {
      // 2本以外: エッジを単純に削除
      for (const edge of connectedEdges) {
        this.edges.delete(edge.id);
      }
    }

    return this.nodes.delete(id);
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

  /**
   * 指定されたパスインデックスにノードを挿入してエッジを分割する。
   * 元のエッジは削除され、2つの新しいエッジに置き換えられる。
   * 新しいノードと2つの新しいエッジを返す。無効な場合はnullを返す。
   */
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

  /**
   * タイル座標に最も近いエッジ上のパスポイントを見つける。
   * エッジ、パスインデックス、距離を返す。見つからない場合はnullを返す。
   */
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
