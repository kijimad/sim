import { describe, expect, it } from "vitest";
import { Graph, NodeKind } from "./graph.js";
import { BlockSystem } from "./block-system.js";

describe("BlockSystem - キューベース", () => {
  it("ノードへのenqueueは常に成功する", () => {
    const bs = new BlockSystem();
    bs.enqueueNode(1, 10);
    bs.enqueueNode(1, 20);
    bs.enqueueNode(1, 30);
    expect(bs.getNodeTrainCount(1)).toBe(3);
  });

  it("スロット内の列車のみ出発可能", () => {
    const graph = new Graph();
    const a = graph.addNode(NodeKind.Station, 0, 0, "A", 2);
    const edge = graph.addEdge(a.id, graph.addNode(NodeKind.Station, 5, 0, "B").id, [
      { x: 0, y: 0 }, { x: 1, y: 0 }, { x: 2, y: 0 }, { x: 3, y: 0 }, { x: 4, y: 0 }, { x: 5, y: 0 },
    ]);

    const bs = new BlockSystem();
    bs.placeAtNode(a.id, 1);
    bs.placeAtNode(a.id, 2);
    bs.placeAtNode(a.id, 3);

    expect(bs.isInSlot(a.id, 1, graph)).toBe(true);
    expect(bs.isInSlot(a.id, 2, graph)).toBe(true);
    expect(bs.isInSlot(a.id, 3, graph)).toBe(false);

    expect(bs.tryDepart(1, a.id, edge.id, 0, true, graph)).toBe(true);
    expect(bs.isInSlot(a.id, 3, graph)).toBe(true);
  });

  it("セクションが空でないと出発できない", () => {
    const graph = new Graph();
    const a = graph.addNode(NodeKind.Station, 0, 0, "A", 2);
    const edge = graph.addEdge(a.id, graph.addNode(NodeKind.Station, 5, 0, "B").id, [
      { x: 0, y: 0 }, { x: 5, y: 0 },
    ]);

    const bs = new BlockSystem();
    bs.placeAtNode(a.id, 1);
    bs.placeAtNode(a.id, 2);

    expect(bs.tryDepart(1, a.id, edge.id, 0, true, graph)).toBe(true);
    expect(bs.tryDepart(2, a.id, edge.id, 0, true, graph)).toBe(false);
  });

  it("対向方向は独立", () => {
    const graph = new Graph();
    const a = graph.addNode(NodeKind.Station, 0, 0, "A");
    const b = graph.addNode(NodeKind.Station, 5, 0, "B");
    const edge = graph.addEdge(a.id, b.id, [{ x: 0, y: 0 }, { x: 5, y: 0 }]);

    const bs = new BlockSystem();
    bs.placeAtNode(a.id, 1);
    bs.placeAtNode(b.id, 2);

    expect(bs.tryDepart(1, a.id, edge.id, 0, true, graph)).toBe(true);
    expect(bs.tryDepart(2, b.id, edge.id, 0, false, graph)).toBe(true);
  });

  it("arriveは常にノードキューに入る", () => {
    const graph = new Graph();
    const a = graph.addNode(NodeKind.Station, 0, 0, "A");
    const b = graph.addNode(NodeKind.Station, 5, 0, "B", 1);
    const edge = graph.addEdge(a.id, b.id, [{ x: 0, y: 0 }, { x: 5, y: 0 }]);

    const bs = new BlockSystem();
    bs.placeAtNode(b.id, 2);
    bs.placeAtNode(a.id, 1);
    bs.tryDepart(1, a.id, edge.id, 0, true, graph);

    bs.arrive(1, edge.id, 0, true, b.id);
    expect(bs.getNodeTrainCount(b.id)).toBe(2);
    expect(bs.isInSlot(b.id, 1, graph)).toBe(false);
    expect(bs.isInSlot(b.id, 2, graph)).toBe(true);
  });

  it("tryAdvanceSection", () => {
    const bs = new BlockSystem();
    bs.enqueueSection(1, 0, true, 10);

    expect(bs.tryAdvanceSection(10, 1, 0, 1, true)).toBe(true);
    expect(bs.isSectionEmpty(1, 0, true)).toBe(true);
    expect(bs.isSectionEmpty(1, 1, true)).toBe(false);
  });

  it("tryAdvanceSectionは占有中なら失敗", () => {
    const bs = new BlockSystem();
    bs.enqueueSection(1, 0, true, 10);
    bs.enqueueSection(1, 1, true, 20);

    expect(bs.tryAdvanceSection(10, 1, 0, 1, true)).toBe(false);
  });

  it("removeTrain", () => {
    const bs = new BlockSystem();
    bs.placeAtNode(1, 10);
    bs.removeTrain(10, true, 1, -1, 0, true);
    expect(bs.getNodeTrainCount(1)).toBe(0);
  });

  it("getQueuePosition returns correct order", () => {
    const bs = new BlockSystem();
    bs.placeAtNode(1, 10);
    bs.placeAtNode(1, 20);
    bs.placeAtNode(1, 30);

    expect(bs.getQueuePosition(1, 10)).toBe(0);
    expect(bs.getQueuePosition(1, 20)).toBe(1);
    expect(bs.getQueuePosition(1, 30)).toBe(2);
  });

  it("slot and wait counts are correct", () => {
    const graph = new Graph();
    const a = graph.addNode(NodeKind.Station, 0, 0, "A", 2);

    const bs = new BlockSystem();
    bs.placeAtNode(a.id, 1);
    bs.placeAtNode(a.id, 2);
    bs.placeAtNode(a.id, 3);

    expect(bs.getNodeSlotCount(a.id, graph)).toBe(2);
    expect(bs.getNodeWaitCount(a.id, graph)).toBe(1);
    expect(bs.isInSlot(a.id, 1, graph)).toBe(true);
    expect(bs.isInSlot(a.id, 2, graph)).toBe(true);
    expect(bs.isInSlot(a.id, 3, graph)).toBe(false);

    // 1が出発すると3がスロットに繰り上がる
    bs.dequeueNode(a.id, 1);
    expect(bs.isInSlot(a.id, 3, graph)).toBe(true);
    expect(bs.getNodeWaitCount(a.id, graph)).toBe(0);
  });

  it("checkInvariants", () => {
    const graph = new Graph();
    graph.addNode(NodeKind.Station, 0, 0, "A");
    const bs = new BlockSystem();
    bs.placeAtNode(1, 10);
    expect(() => { bs.checkInvariants(); }).not.toThrow();
  });

  it("removeTrain at node", () => {
    const bs = new BlockSystem();
    bs.placeAtNode(1, 10);
    bs.placeAtNode(1, 20);
    expect(bs.getNodeTrainCount(1)).toBe(2);

    bs.removeTrain(10, true, 1, -1, 0, true);
    expect(bs.getNodeTrainCount(1)).toBe(1);
  });

  it("removeTrain on edge", () => {
    const graph = new Graph();
    const s1 = graph.addNode(NodeKind.Station, 0, 0, "A");
    const s2 = graph.addNode(NodeKind.Station, 5, 0, "B");
    const edge = graph.addEdge(s1.id, s2.id, [
      { x: 0, y: 0 }, { x: 1, y: 0 }, { x: 2, y: 0 }, { x: 3, y: 0 }, { x: 4, y: 0 }, { x: 5, y: 0 },
    ]);

    const bs = new BlockSystem();
    bs.placeAtNode(s1.id, 10);
    bs.tryDepart(10, s1.id, edge.id, 0, true, graph);

    bs.removeTrain(10, false, -1, edge.id, 0, true);
    // エッジ上の列車が除去されている
    expect(bs.isSectionEmpty(edge.id, 0, true)).toBe(true);
  });
});
