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

export interface GraphNode {
  readonly id: number;
  readonly kind: NodeKind;
  /** Tile coordinate X */
  readonly tileX: number;
  /** Tile coordinate Y */
  readonly tileY: number;
  readonly name: string;
  /** Number of trains that can occupy this node simultaneously */
  readonly capacity: number;
}

export interface GraphEdge {
  readonly id: number;
  readonly fromId: number;
  readonly toId: number;
  /** Tile path from source node to destination node (inclusive) */
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
  ): GraphNode {
    const id = this.nextId++;
    const cap = capacity ?? DEFAULT_CAPACITY[kind];
    const node: GraphNode = { id, kind, tileX, tileY, name, capacity: cap };
    this.nodes.set(id, node);
    return node;
  }

  removeNode(id: number): boolean {
    for (const edge of this.edges.values()) {
      if (edge.fromId === id || edge.toId === id) {
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
   * Split an edge by inserting a node at a given path index.
   * The original edge is removed and replaced by two new edges.
   * Returns the new node and the two new edges, or null if invalid.
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
   * Find the closest path point on any edge to a tile coordinate.
   * Returns the edge, path index, and distance, or null if none found.
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
