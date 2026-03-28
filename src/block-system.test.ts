import { describe, expect, it } from "vitest";
import { Graph, NodeKind, SignalLayout } from "./graph.js";
import { BlockSystem } from "./block-system.js";

function makeGraph(): Graph {
  return new Graph();
}

describe("BlockSystem - エッジ占有", () => {
  it("空きエッジは利用可能", () => {
    const bs = new BlockSystem();
    expect(bs.isEdgeFree(1)).toBe(true);
  });

  it("占有エッジは利用不可", () => {
    const graph = makeGraph();
    const a = graph.addNode(NodeKind.Station, 0, 0, "A");
    const b = graph.addNode(NodeKind.Station, 5, 0, "B");
    const edge = graph.addEdge(a.id, b.id, [{ x: 0, y: 0 }, { x: 5, y: 0 }]);

    const bs = new BlockSystem();
    bs.placeAtNode(a.id, 1);
    bs.tryDepart(1, a.id, edge.id, b.id, graph);

    expect(bs.isEdgeFree(edge.id)).toBe(false);
    expect(bs.isEdgeFree(edge.id, 1)).toBe(true); // 自分自身は除外
  });

  it("複線エッジは2台まで利用可能", () => {
    const graph = makeGraph();
    const a = graph.addNode(NodeKind.Station, 0, 0, "A", 3);
    const b = graph.addNode(NodeKind.Station, 5, 0, "B", 3);
    const edge = graph.addEdge(a.id, b.id, [{ x: 0, y: 0 }, { x: 5, y: 0 }]);

    const bs = new BlockSystem();
    bs.setEdgeCapacity(edge.id, 2);
    bs.placeAtNode(a.id, 1);
    bs.placeAtNode(a.id, 2);
    bs.placeAtNode(a.id, 3);

    expect(bs.tryDepart(1, a.id, edge.id, b.id, graph)).toBe(true);
    expect(bs.isEdgeFree(edge.id)).toBe(true); // まだ容量1残り
    expect(bs.tryDepart(2, a.id, edge.id, b.id, graph)).toBe(true);
    expect(bs.isEdgeFree(edge.id)).toBe(false); // 容量2で満杯
    expect(bs.tryDepart(3, a.id, edge.id, b.id, graph)).toBe(false);
  });
});

describe("BlockSystem - ノード占有", () => {
  it("空きノードは入場可能", () => {
    const graph = makeGraph();
    const a = graph.addNode(NodeKind.Station, 0, 0, "A");
    const bs = new BlockSystem();
    expect(bs.canEnterNode(a.id, 1, graph)).toBe(true);
  });

  it("容量超過では入場不可", () => {
    const graph = makeGraph();
    const a = graph.addNode(NodeKind.Station, 0, 0, "A", 1);
    const bs = new BlockSystem();
    bs.placeAtNode(a.id, 1);
    expect(bs.canEnterNode(a.id, 2, graph)).toBe(false);
  });

  it("getNodeTrainCountが正しい", () => {
    const bs = new BlockSystem();
    expect(bs.getNodeTrainCount(1)).toBe(0);
    bs.placeAtNode(1, 10);
    expect(bs.getNodeTrainCount(1)).toBe(1);
    bs.placeAtNode(1, 20);
    expect(bs.getNodeTrainCount(1)).toBe(2);
  });
});

describe("BlockSystem - tryDepart", () => {
  it("エッジ空き + 到着先容量あり → 成功", () => {
    const graph = makeGraph();
    const a = graph.addNode(NodeKind.Station, 0, 0, "A");
    const b = graph.addNode(NodeKind.Station, 5, 0, "B");
    const edge = graph.addEdge(a.id, b.id, [{ x: 0, y: 0 }, { x: 5, y: 0 }]);

    const bs = new BlockSystem();
    bs.placeAtNode(a.id, 1);

    expect(bs.tryDepart(1, a.id, edge.id, b.id, graph)).toBe(true);
    expect(bs.getNodeTrainCount(a.id)).toBe(0);
    expect(bs.isEdgeFree(edge.id)).toBe(false);
  });

  it("エッジ占有 → 失敗、状態変更なし", () => {
    const graph = makeGraph();
    const a = graph.addNode(NodeKind.Station, 0, 0, "A", 2);
    const b = graph.addNode(NodeKind.Station, 5, 0, "B");
    const edge = graph.addEdge(a.id, b.id, [{ x: 0, y: 0 }, { x: 5, y: 0 }]);

    const bs = new BlockSystem();
    bs.placeAtNode(a.id, 1);
    bs.placeAtNode(a.id, 2);
    bs.tryDepart(1, a.id, edge.id, b.id, graph);

    // 列車2は出発できない
    expect(bs.tryDepart(2, a.id, edge.id, b.id, graph)).toBe(false);
    // 列車2はまだAにいる
    expect(bs.getNodeTrainCount(a.id)).toBe(1);
  });

  it("到着先ノード満杯 → 失敗、状態変更なし", () => {
    const graph = makeGraph();
    const a = graph.addNode(NodeKind.Station, 0, 0, "A");
    const b = graph.addNode(NodeKind.Station, 5, 0, "B", 1);
    const edge = graph.addEdge(a.id, b.id, [{ x: 0, y: 0 }, { x: 5, y: 0 }]);

    const bs = new BlockSystem();
    bs.placeAtNode(a.id, 1);
    bs.placeAtNode(b.id, 2); // Bは満杯

    expect(bs.tryDepart(1, a.id, edge.id, b.id, graph)).toBe(false);
    expect(bs.getNodeTrainCount(a.id)).toBe(1); // 変更なし
    expect(bs.isEdgeFree(edge.id)).toBe(true); // 変更なし
  });
});

describe("BlockSystem - tryArrive", () => {
  it("ノード容量あり → 成功", () => {
    const graph = makeGraph();
    const a = graph.addNode(NodeKind.Station, 0, 0, "A");
    const b = graph.addNode(NodeKind.Station, 5, 0, "B");
    const edge = graph.addEdge(a.id, b.id, [{ x: 0, y: 0 }, { x: 5, y: 0 }]);

    const bs = new BlockSystem();
    bs.placeAtNode(a.id, 1);
    bs.tryDepart(1, a.id, edge.id, b.id, graph);

    expect(bs.tryArrive(1, edge.id, b.id, graph)).toBe(true);
    expect(bs.isEdgeFree(edge.id)).toBe(true);
    expect(bs.getNodeTrainCount(b.id)).toBe(1);
  });

  it("ノード満杯 → 失敗、状態変更なし", () => {
    const graph = makeGraph();
    const a = graph.addNode(NodeKind.Station, 0, 0, "A");
    const b = graph.addNode(NodeKind.Station, 5, 0, "B", 2);
    const c = graph.addNode(NodeKind.Station, 10, 0, "C");
    const e1 = graph.addEdge(a.id, b.id, [{ x: 0, y: 0 }, { x: 5, y: 0 }]);
    graph.addEdge(b.id, c.id, [{ x: 5, y: 0 }, { x: 10, y: 0 }]);

    const bs = new BlockSystem();
    // Bに2台配置して満杯にする
    bs.placeAtNode(b.id, 2);
    bs.placeAtNode(b.id, 3);
    // 列車1をAからe1に出発させる（B満杯だがtryDepartが弾く…）
    // → 直接エッジに配置してテスト
    bs.placeAtNode(a.id, 1);
    // tryDepartはBが満杯で失敗するはずなので、エッジに手動配置はできない
    // 代わりにBの容量を3にして出発後に満杯にする
    // テスト戦略を変更: 先に出発→後からBを満杯にする

    // やり直し: B容量2、列車1をe1に出発させた後にBに別の列車を追加
    bs.removeTrain(2, 0, b.id, -1);
    bs.removeTrain(3, 0, b.id, -1);

    // 列車1がe1に出発
    expect(bs.tryDepart(1, a.id, e1.id, b.id, graph)).toBe(true);
    // Bに2台配置して満杯にする
    bs.placeAtNode(b.id, 2);
    bs.placeAtNode(b.id, 3);

    // 列車1のarrive → B満杯で失敗
    expect(bs.tryArrive(1, e1.id, b.id, graph)).toBe(false);
    expect(bs.isEdgeFree(e1.id)).toBe(false); // エッジに残る
    expect(bs.getNodeTrainCount(b.id)).toBe(2); // 変更なし
  });
});

describe("BlockSystem - 信号場レイアウト", () => {
  it("Passing: 異なる方向から2台入場可能", () => {
    const graph = makeGraph();
    const a = graph.addNode(NodeKind.Station, 0, 0, "A");
    const s = graph.addNode(NodeKind.SignalStation, 5, 0, "S", 2, SignalLayout.Passing);
    const b = graph.addNode(NodeKind.Station, 10, 0, "B");
    const e1 = graph.addEdge(a.id, s.id, [{ x: 0, y: 0 }, { x: 5, y: 0 }]);
    const e2 = graph.addEdge(s.id, b.id, [{ x: 5, y: 0 }, { x: 10, y: 0 }]);

    const bs = new BlockSystem();
    // e1から到着
    expect(bs.canEnterNode(s.id, e1.id, graph)).toBe(true);
    bs.placeAtNode(a.id, 1);
    bs.tryDepart(1, a.id, e1.id, s.id, graph);
    bs.tryArrive(1, e1.id, s.id, graph);

    // e2から到着（異なる方向）
    expect(bs.canEnterNode(s.id, e2.id, graph)).toBe(true);
  });

  it("Passing: 同じ方向から2台入場不可", () => {
    const graph = makeGraph();
    const a = graph.addNode(NodeKind.Station, 0, 0, "A", 3);
    const s = graph.addNode(NodeKind.SignalStation, 5, 0, "S", 2, SignalLayout.Passing);
    const e1 = graph.addEdge(a.id, s.id, [{ x: 0, y: 0 }, { x: 5, y: 0 }]);

    const bs = new BlockSystem();
    bs.placeAtNode(a.id, 1);
    bs.tryDepart(1, a.id, e1.id, s.id, graph);
    bs.tryArrive(1, e1.id, s.id, graph);

    // 同じe1方向からの2台目は不可
    expect(bs.canEnterNode(s.id, e1.id, graph)).toBe(false);
  });

  it("Overtaking: 同方向から2台入場可能", () => {
    const graph = makeGraph();
    const a = graph.addNode(NodeKind.Station, 0, 0, "A", 3);
    const s = graph.addNode(NodeKind.SignalStation, 5, 0, "S", 2, SignalLayout.Overtaking);
    const e1 = graph.addEdge(a.id, s.id, [{ x: 0, y: 0 }, { x: 5, y: 0 }]);

    const bs = new BlockSystem();
    bs.placeAtNode(a.id, 1);
    bs.tryDepart(1, a.id, e1.id, s.id, graph);
    bs.tryArrive(1, e1.id, s.id, graph);

    expect(bs.canEnterNode(s.id, e1.id, graph)).toBe(true);
  });

  it("Overtaking: 異なる方向からは入場不可", () => {
    const graph = makeGraph();
    const a = graph.addNode(NodeKind.Station, 0, 0, "A");
    const s = graph.addNode(NodeKind.SignalStation, 5, 0, "S", 2, SignalLayout.Overtaking);
    const b = graph.addNode(NodeKind.Station, 10, 0, "B");
    const e1 = graph.addEdge(a.id, s.id, [{ x: 0, y: 0 }, { x: 5, y: 0 }]);
    const e2 = graph.addEdge(s.id, b.id, [{ x: 5, y: 0 }, { x: 10, y: 0 }]);

    const bs = new BlockSystem();
    bs.placeAtNode(a.id, 1);
    bs.tryDepart(1, a.id, e1.id, s.id, graph);
    bs.tryArrive(1, e1.id, s.id, graph);

    // e2方向からは入場不可（方向が違う）
    expect(bs.canEnterNode(s.id, e2.id, graph)).toBe(false);
  });
});

describe("BlockSystem - removeTrain", () => {
  it("AtNodeの列車を削除するとノードが解放される", () => {
    const bs = new BlockSystem();
    bs.placeAtNode(1, 10);
    expect(bs.getNodeTrainCount(1)).toBe(1);

    bs.removeTrain(10, 0, 1, -1); // state=0=AtNode
    expect(bs.getNodeTrainCount(1)).toBe(0);
  });

  it("OnEdgeの列車を削除するとエッジが解放される", () => {
    const graph = makeGraph();
    const a = graph.addNode(NodeKind.Station, 0, 0, "A");
    const b = graph.addNode(NodeKind.Station, 5, 0, "B");
    const edge = graph.addEdge(a.id, b.id, [{ x: 0, y: 0 }, { x: 5, y: 0 }]);

    const bs = new BlockSystem();
    bs.placeAtNode(a.id, 1);
    bs.tryDepart(1, a.id, edge.id, b.id, graph);
    expect(bs.isEdgeFree(edge.id)).toBe(false);

    bs.removeTrain(1, 1, a.id, edge.id); // state=1=OnEdge
    expect(bs.isEdgeFree(edge.id)).toBe(true);
  });
});

describe("BlockSystem - checkInvariants", () => {
  it("正常状態では例外を投げない", () => {
    const graph = makeGraph();
    const a = graph.addNode(NodeKind.Station, 0, 0, "A");
    graph.addNode(NodeKind.Station, 5, 0, "B");

    const bs = new BlockSystem();
    bs.placeAtNode(a.id, 1);

    expect(() => { bs.checkInvariants(graph); }).not.toThrow();
  });
});
