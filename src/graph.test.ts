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

describe("Graph - getAdjacentStations / getStationComplex", () => {
  it("チェビシェフ距離1以内の駅を返す", () => {
    const graph = new Graph();
    const a = graph.addNode(NodeKind.Station, 5, 5, "A");
    const b = graph.addNode(NodeKind.Station, 6, 5, "B"); // 右隣接
    const c = graph.addNode(NodeKind.Station, 5, 6, "C"); // 下隣接
    graph.addNode(NodeKind.Station, 6, 6, "D"); // 斜め → 含まない
    graph.addNode(NodeKind.Station, 8, 5, "E"); // 距離2 → 含まない

    const adj = graph.getAdjacentStations(a.id);
    const ids = adj.map((n) => n.id);
    expect(ids).toContain(b.id);
    expect(ids).toContain(c.id);
    expect(ids).toHaveLength(2);
  });

  it("孤立駅の隣接は空", () => {
    const graph = new Graph();
    const a = graph.addNode(NodeKind.Station, 0, 0, "A");
    graph.addNode(NodeKind.Station, 10, 10, "Far");
    expect(graph.getAdjacentStations(a.id)).toHaveLength(0);
  });

  it("連鎖的に隣接した駅を1つの複合体にまとめる", () => {
    const graph = new Graph();
    //  B1(5,5) - B2(6,5) - B3(7,5)  (チェーン状)
    const b1 = graph.addNode(NodeKind.Station, 5, 5, "B1");
    const b2 = graph.addNode(NodeKind.Station, 6, 5, "B2");
    const b3 = graph.addNode(NodeKind.Station, 7, 5, "B3");
    graph.addNode(NodeKind.Station, 20, 20, "Far"); // 別の場所

    const complex = graph.getStationComplex(b1.id);
    const ids = complex.map((n) => n.id);
    expect(ids).toContain(b1.id);
    expect(ids).toContain(b2.id);
    expect(ids).toContain(b3.id);
    expect(ids).toHaveLength(3);
  });

  it("B1からでもB3からでも同じ複合体を返す", () => {
    const graph = new Graph();
    const b1 = graph.addNode(NodeKind.Station, 5, 5, "B1");
    graph.addNode(NodeKind.Station, 6, 5, "B2");
    const b3 = graph.addNode(NodeKind.Station, 7, 5, "B3");

    const fromB1 = graph.getStationComplex(b1.id).map((n) => n.id).sort();
    const fromB3 = graph.getStationComplex(b3.id).map((n) => n.id).sort();
    expect(fromB1).toEqual(fromB3);
  });

  it("L字型の隣接も1つの複合体になる", () => {
    const graph = new Graph();
    // B1(5,5) - B2(6,5)
    //            B3(6,6)
    const b1 = graph.addNode(NodeKind.Station, 5, 5, "B1");
    const b2 = graph.addNode(NodeKind.Station, 6, 5, "B2");
    const b3 = graph.addNode(NodeKind.Station, 6, 6, "B3");

    const complex = graph.getStationComplex(b1.id);
    expect(complex).toHaveLength(3);
    const ids = complex.map((n) => n.id);
    expect(ids).toContain(b1.id);
    expect(ids).toContain(b2.id);
    expect(ids).toContain(b3.id);
  });

  it("孤立駅の複合体は自分のみ", () => {
    const graph = new Graph();
    const a = graph.addNode(NodeKind.Station, 0, 0, "A");
    const complex = graph.getStationComplex(a.id);
    expect(complex).toHaveLength(1);
    expect(complex[0]?.id).toBe(a.id);
  });
});

describe("isPerpendicularToEdges - 隣接方向制限", () => {
  it("エッジの進行方向と平行な隣接を拒否する", () => {
    const graph = new Graph();
    // A(0,0) -- B(5,0)  水平エッジ
    const a = graph.addNode(NodeKind.Station, 0, 0, "A");
    const b = graph.addNode(NodeKind.Station, 5, 0, "B");
    graph.addEdge(a.id, b.id, [
      { x: 0, y: 0 }, { x: 1, y: 0 }, { x: 2, y: 0 }, { x: 3, y: 0 }, { x: 4, y: 0 }, { x: 5, y: 0 },
    ]);

    // Bの右(6,0) = エッジと同方向 → 拒否
    expect(graph.isPerpendicularToEdges(b.id, 6, 0)).toBe(false);
    // Bの左(4,0) = エッジと逆方向 → 拒否
    expect(graph.isPerpendicularToEdges(b.id, 4, 0)).toBe(false);
    // Bの下(5,1) = エッジと垂直 → 許可
    expect(graph.isPerpendicularToEdges(b.id, 5, 1)).toBe(true);
    // Bの上(5,-1) = エッジと垂直 → 許可
    expect(graph.isPerpendicularToEdges(b.id, 5, -1)).toBe(true);
  });

  it("エッジがない駅はどの方向でも許可する", () => {
    const graph = new Graph();
    const a = graph.addNode(NodeKind.Station, 5, 5, "A");
    expect(graph.isPerpendicularToEdges(a.id, 6, 5)).toBe(true);
    expect(graph.isPerpendicularToEdges(a.id, 5, 6)).toBe(true);
  });

  it("垂直エッジに対して水平方向の隣接を許可する", () => {
    const graph = new Graph();
    const a = graph.addNode(NodeKind.Station, 0, 0, "A");
    const b = graph.addNode(NodeKind.Station, 0, 5, "B");
    graph.addEdge(a.id, b.id, [
      { x: 0, y: 0 }, { x: 0, y: 1 }, { x: 0, y: 2 }, { x: 0, y: 3 }, { x: 0, y: 4 }, { x: 0, y: 5 },
    ]);

    // Aの右(1,0) = 垂直エッジに対して水平 → 許可
    expect(graph.isPerpendicularToEdges(a.id, 1, 0)).toBe(true);
    // Aの下(0,1) = 垂直エッジと同方向 → 拒否
    expect(graph.isPerpendicularToEdges(a.id, 0, 1)).toBe(false);
  });
});

describe("isEdgeDirectionValid - エッジ方向と隣接駅の制約", () => {
  it("隣接駅と平行な方向のエッジを拒否する", () => {
    const graph = new Graph();
    // A(5,5) と B(6,5) が隣接（水平方向）
    const a = graph.addNode(NodeKind.Station, 5, 5, "A");
    graph.addNode(NodeKind.Station, 6, 5, "B");

    // Aから右方向(1,0)のエッジ → Bと平行 → 拒否
    expect(graph.isEdgeDirectionValid(a.id, 1, 0)).toBe(false);
    // Aから左方向(-1,0) → Bと平行 → 拒否
    expect(graph.isEdgeDirectionValid(a.id, -1, 0)).toBe(false);
    // Aから下方向(0,1) → Bと垂直 → 許可
    expect(graph.isEdgeDirectionValid(a.id, 0, 1)).toBe(true);
  });

  it("隣接駅がなければどの方向でも許可する", () => {
    const graph = new Graph();
    const a = graph.addNode(NodeKind.Station, 5, 5, "A");
    graph.addNode(NodeKind.Station, 20, 20, "Far");

    expect(graph.isEdgeDirectionValid(a.id, 1, 0)).toBe(true);
    expect(graph.isEdgeDirectionValid(a.id, 0, 1)).toBe(true);
  });

  it("エッジなし + 隣接駅ありの場合でもチェックが効く", () => {
    const graph = new Graph();
    // A, B は隣接（垂直方向）。どちらもエッジなし
    const a = graph.addNode(NodeKind.Station, 5, 5, "A");
    graph.addNode(NodeKind.Station, 5, 6, "B");

    // Aから下方向(0,1) → Bと平行 → 拒否
    expect(graph.isEdgeDirectionValid(a.id, 0, 1)).toBe(false);
    // Aから右方向(1,0) → Bと垂直 → 許可
    expect(graph.isEdgeDirectionValid(a.id, 1, 0)).toBe(true);
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
