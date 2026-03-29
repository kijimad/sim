import { describe, expect, it } from "vitest";
import { Graph, NodeKind, hasNonPerpendicularOverlap } from "./graph.js";

describe("Graph - Nodes", () => {
  it("adds a node and retrieves it by id", () => {
    const graph = new Graph();
    const node = graph.addNode(NodeKind.Station, 5, 10, "A駅");
    expect(node.kind).toBe(NodeKind.Station);
    expect(node.tileX).toBe(5);
    expect(node.tileY).toBe(10);
    expect(node.name).toBe("A駅");

    const retrieved = graph.getNode(node.id);
    expect(retrieved).toBe(node);
  });

  it("assigns unique ids", () => {
    const graph = new Graph();
    const a = graph.addNode(NodeKind.Station, 0, 0, "A");
    const b = graph.addNode(NodeKind.Station, 1, 1, "B");
    expect(a.id).not.toBe(b.id);
  });

  it("getNodeAt finds node by tile coordinate", () => {
    const graph = new Graph();
    graph.addNode(NodeKind.Station, 3, 7, "X");
    const found = graph.getNodeAt(3, 7);
    expect(found).toBeDefined();
    expect(found?.name).toBe("X");
  });

  it("getNodeAt returns undefined for empty tile", () => {
    const graph = new Graph();
    graph.addNode(NodeKind.Station, 3, 7, "X");
    expect(graph.getNodeAt(0, 0)).toBeUndefined();
  });

  it("removes a node", () => {
    const graph = new Graph();
    const node = graph.addNode(NodeKind.Station, 0, 0, "A");
    expect(graph.removeNode(node.id).deleted).toBe(true);
    expect(graph.getNode(node.id)).toBeUndefined();
    expect(graph.nodeCount).toBe(0);
  });

  it("removeNode returns false for unknown id", () => {
    const graph = new Graph();
    expect(graph.removeNode(999).deleted).toBe(false);
  });

  it("getAllNodes returns all nodes", () => {
    const graph = new Graph();
    graph.addNode(NodeKind.Station, 0, 0, "A");
    graph.addNode(NodeKind.Station, 1, 1, "B");
    graph.addNode(NodeKind.Station, 2, 2, "C");
    expect([...graph.getAllNodes()]).toHaveLength(3);
  });

  it("nodeCount reflects additions and removals", () => {
    const graph = new Graph();
    expect(graph.nodeCount).toBe(0);
    const a = graph.addNode(NodeKind.Station, 0, 0, "A");
    expect(graph.nodeCount).toBe(1);
    graph.addNode(NodeKind.Station, 1, 1, "B");
    expect(graph.nodeCount).toBe(2);
    graph.removeNode(a.id);
    expect(graph.nodeCount).toBe(1);
  });
});

describe("Graph - Edges", () => {
  it("adds an edge between two nodes", () => {
    const graph = new Graph();
    const a = graph.addNode(NodeKind.Station, 0, 0, "A");
    const b = graph.addNode(NodeKind.Station, 5, 0, "B");
    const path = [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 2, y: 0 }, { x: 3, y: 0 }, { x: 4, y: 0 }, { x: 5, y: 0 }];
    const edge = graph.addEdge(a.id, b.id, path);

    expect(edge.fromId).toBe(a.id);
    expect(edge.toId).toBe(b.id);
    expect(edge.path).toEqual(path);
    expect(graph.edgeCount).toBe(1);
  });

  it("throws when adding edge with invalid node", () => {
    const graph = new Graph();
    const a = graph.addNode(NodeKind.Station, 0, 0, "A");
    expect(() => { graph.addEdge(a.id, 999, []); }).toThrow();
  });

  it("getEdgesBetween finds edge regardless of direction", () => {
    const graph = new Graph();
    const a = graph.addNode(NodeKind.Station, 0, 0, "A");
    const b = graph.addNode(NodeKind.Station, 1, 0, "B");
    graph.addEdge(a.id, b.id, [{ x: 0, y: 0 }, { x: 1, y: 0 }]);

    expect(graph.getEdgesBetween(a.id, b.id)).toBeDefined();
    expect(graph.getEdgesBetween(b.id, a.id)).toBeDefined();
  });

  it("getEdgesFor returns all edges for a node", () => {
    const graph = new Graph();
    const a = graph.addNode(NodeKind.Station, 0, 0, "A");
    const b = graph.addNode(NodeKind.Station, 1, 0, "B");
    const c = graph.addNode(NodeKind.Station, 0, 1, "C");
    graph.addEdge(a.id, b.id, [{ x: 0, y: 0 }, { x: 1, y: 0 }]);
    graph.addEdge(a.id, c.id, [{ x: 0, y: 0 }, { x: 0, y: 1 }]);

    expect(graph.getEdgesFor(a.id)).toHaveLength(2);
    expect(graph.getEdgesFor(b.id)).toHaveLength(1);
  });

  it("removeNode also removes connected edges", () => {
    const graph = new Graph();
    const a = graph.addNode(NodeKind.Station, 0, 0, "A");
    const b = graph.addNode(NodeKind.Station, 1, 0, "B");
    graph.addEdge(a.id, b.id, [{ x: 0, y: 0 }, { x: 1, y: 0 }]);

    graph.removeNode(a.id);
    expect(graph.edgeCount).toBe(0);
    expect(graph.getEdgesFor(b.id)).toHaveLength(0);
  });

  it("removeEdge removes only the edge", () => {
    const graph = new Graph();
    const a = graph.addNode(NodeKind.Station, 0, 0, "A");
    const b = graph.addNode(NodeKind.Station, 1, 0, "B");
    const edge = graph.addEdge(a.id, b.id, [{ x: 0, y: 0 }, { x: 1, y: 0 }]);

    expect(graph.removeEdge(edge.id)).toBe(true);
    expect(graph.edgeCount).toBe(0);
    expect(graph.nodeCount).toBe(2);
  });
});

describe("Graph - splitEdge", () => {
  it("splits an edge into two at a path index", () => {
    const graph = new Graph();
    const a = graph.addNode(NodeKind.Station, 0, 0, "A");
    const b = graph.addNode(NodeKind.Station, 5, 0, "B");
    const path = Array.from({ length: 6 }, (_, i) => ({ x: i, y: 0 }));
    const edge = graph.addEdge(a.id, b.id, path);

    const s = graph.addNode(NodeKind.Station, 3, 0, "S");
    const result = graph.splitEdge(edge.id, s, 3);

    expect(result).not.toBeNull();
    if (result === null) return;

    // Original edge removed
    expect(graph.getEdge(edge.id)).toBeUndefined();
    expect(graph.edgeCount).toBe(2);

    // Edge1: A -> S, path [0..3]
    expect(result.edge1.fromId).toBe(a.id);
    expect(result.edge1.toId).toBe(s.id);
    expect(result.edge1.path).toHaveLength(4);
    expect(result.edge1.path[0]).toEqual({ x: 0, y: 0 });
    expect(result.edge1.path[3]).toEqual({ x: 3, y: 0 });

    // Edge2: S -> B, path [3..5]
    expect(result.edge2.fromId).toBe(s.id);
    expect(result.edge2.toId).toBe(b.id);
    expect(result.edge2.path).toHaveLength(3);
    expect(result.edge2.path[0]).toEqual({ x: 3, y: 0 });
    expect(result.edge2.path[2]).toEqual({ x: 5, y: 0 });
  });

  it("returns null for invalid path index", () => {
    const graph = new Graph();
    const a = graph.addNode(NodeKind.Station, 0, 0, "A");
    const b = graph.addNode(NodeKind.Station, 2, 0, "B");
    const path = [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 2, y: 0 }];
    const edge = graph.addEdge(a.id, b.id, path);
    const s = graph.addNode(NodeKind.Station, 1, 0, "S");

    // Index 0 and last are endpoints, not valid split points
    expect(graph.splitEdge(edge.id, s, 0)).toBeNull();
    expect(graph.splitEdge(edge.id, s, 2)).toBeNull();
  });

  it("returns null for unknown edge", () => {
    const graph = new Graph();
    const s = graph.addNode(NodeKind.Station, 0, 0, "S");
    expect(graph.splitEdge(999, s, 1)).toBeNull();
  });
});

describe("Graph - findClosestEdgePoint", () => {
  it("finds the closest point on an edge", () => {
    const graph = new Graph();
    const a = graph.addNode(NodeKind.Station, 0, 0, "A");
    const b = graph.addNode(NodeKind.Station, 5, 0, "B");
    const path = Array.from({ length: 6 }, (_, i) => ({ x: i, y: 0 }));
    graph.addEdge(a.id, b.id, path);

    const result = graph.findClosestEdgePoint(3, 0);
    expect(result).not.toBeNull();
    if (result === null) return;
    expect(result.pathIndex).toBe(3);
    expect(result.distance).toBe(0);
  });

  it("excludes endpoints from results", () => {
    const graph = new Graph();
    const a = graph.addNode(NodeKind.Station, 0, 0, "A");
    const b = graph.addNode(NodeKind.Station, 2, 0, "B");
    graph.addEdge(a.id, b.id, [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 2, y: 0 }]);

    // Closest to (0,0) would be index 0, but that's excluded
    const result = graph.findClosestEdgePoint(0, 0);
    expect(result).not.toBeNull();
    if (result === null) return;
    expect(result.pathIndex).toBe(1);
  });
});

describe("hasNonPerpendicularOverlap - 交差判定", () => {
  it("平行な重なりを拒否する（同方向）", () => {
    const graph = new Graph();
    const a = graph.addNode(NodeKind.Station, 0, 0, "A");
    const b = graph.addNode(NodeKind.Station, 5, 0, "B");
    graph.addEdge(a.id, b.id, [
      { x: 0, y: 0 }, { x: 1, y: 0 }, { x: 2, y: 0 }, { x: 3, y: 0 }, { x: 4, y: 0 }, { x: 5, y: 0 },
    ]);

    // 新パス: 同じ水平方向で重なる
    const newPath = [
      { x: 0, y: 1 }, { x: 1, y: 0 }, { x: 2, y: 0 }, { x: 3, y: 0 }, { x: 4, y: 1 },
    ];
    expect(hasNonPerpendicularOverlap(newPath, graph.getAllEdges())).toBe(true);
  });

  it("平行な重なりを拒否する（逆方向）", () => {
    const graph = new Graph();
    const a = graph.addNode(NodeKind.Station, 0, 0, "A");
    const b = graph.addNode(NodeKind.Station, 3, 0, "B");
    graph.addEdge(a.id, b.id, [
      { x: 0, y: 0 }, { x: 1, y: 0 }, { x: 2, y: 0 }, { x: 3, y: 0 },
    ]);

    // 新パス: 逆方向で重なる（内積 < 0も非直交）
    const newPath = [
      { x: 4, y: 1 }, { x: 2, y: 0 }, { x: 1, y: 0 }, { x: 0, y: 1 },
    ];
    expect(hasNonPerpendicularOverlap(newPath, graph.getAllEdges())).toBe(true);
  });

  it("直交する交差を許可する", () => {
    const graph = new Graph();
    const a = graph.addNode(NodeKind.Station, 0, 2, "A");
    const b = graph.addNode(NodeKind.Station, 4, 2, "B");
    graph.addEdge(a.id, b.id, [
      { x: 0, y: 2 }, { x: 1, y: 2 }, { x: 2, y: 2 }, { x: 3, y: 2 }, { x: 4, y: 2 },
    ]);

    // 新パス: 垂直方向で(2,2)を通過する
    const newPath = [
      { x: 2, y: 0 }, { x: 2, y: 1 }, { x: 2, y: 2 }, { x: 2, y: 3 }, { x: 2, y: 4 },
    ];
    expect(hasNonPerpendicularOverlap(newPath, graph.getAllEdges())).toBe(false);
  });

  it("重なりがなければ許可する", () => {
    const graph = new Graph();
    const a = graph.addNode(NodeKind.Station, 0, 0, "A");
    const b = graph.addNode(NodeKind.Station, 3, 0, "B");
    graph.addEdge(a.id, b.id, [
      { x: 0, y: 0 }, { x: 1, y: 0 }, { x: 2, y: 0 }, { x: 3, y: 0 },
    ]);

    const newPath = [
      { x: 0, y: 5 }, { x: 1, y: 5 }, { x: 2, y: 5 }, { x: 3, y: 5 },
    ];
    expect(hasNonPerpendicularOverlap(newPath, graph.getAllEdges())).toBe(false);
  });

  it("端点（ノード位置）は判定から除外する", () => {
    const graph = new Graph();
    const a = graph.addNode(NodeKind.Station, 0, 0, "A");
    const b = graph.addNode(NodeKind.Station, 3, 0, "B");
    graph.addEdge(a.id, b.id, [
      { x: 0, y: 0 }, { x: 1, y: 0 }, { x: 2, y: 0 }, { x: 3, y: 0 },
    ]);

    // 端点(0,0)はスキップ、中間は重なりなし
    const newPath = [
      { x: 0, y: 0 }, { x: 0, y: 1 }, { x: 0, y: 2 }, { x: 3, y: 0 },
    ];
    expect(hasNonPerpendicularOverlap(newPath, graph.getAllEdges())).toBe(false);
  });

  it("既存エッジがなければ常に許可する", () => {
    const newPath = [
      { x: 0, y: 0 }, { x: 1, y: 0 }, { x: 2, y: 0 },
    ];
    expect(hasNonPerpendicularOverlap(newPath, [])).toBe(false);
  });
});
