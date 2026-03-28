import { describe, expect, it } from "vitest";
import { Graph, NodeKind } from "./graph.js";

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
    expect(graph.removeNode(node.id)).toBe(true);
    expect(graph.getNode(node.id)).toBeUndefined();
    expect(graph.nodeCount).toBe(0);
  });

  it("removeNode returns false for unknown id", () => {
    const graph = new Graph();
    expect(graph.removeNode(999)).toBe(false);
  });

  it("getAllNodes returns all nodes", () => {
    const graph = new Graph();
    graph.addNode(NodeKind.Station, 0, 0, "A");
    graph.addNode(NodeKind.SignalStation, 1, 1, "B");
    graph.addNode(NodeKind.Signal, 2, 2, "C");
    expect(graph.getAllNodes()).toHaveLength(3);
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
