import type { PathNode } from "./pathfinding.js";

export const NodeKind = {
  Station: 0,
  SignalStation: 1,
  Signal: 2,
} as const;

export type NodeKind = (typeof NodeKind)[keyof typeof NodeKind];

export interface GraphNode {
  readonly id: number;
  readonly kind: NodeKind;
  /** Tile coordinate X */
  readonly tileX: number;
  /** Tile coordinate Y */
  readonly tileY: number;
  readonly name: string;
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
  ): GraphNode {
    const id = this.nextId++;
    const node: GraphNode = { id, kind, tileX, tileY, name };
    this.nodes.set(id, node);
    return node;
  }

  removeNode(id: number): boolean {
    // Remove all edges connected to this node
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
}
