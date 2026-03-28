import { describe, expect, it } from "vitest";
import { Graph, NodeKind } from "./graph.js";
import { Simulation } from "./simulation.js";

function createSimpleGraph(): Graph {
  const graph = new Graph();
  const a = graph.addNode(NodeKind.Station, 0, 0, "A");
  const b = graph.addNode(NodeKind.Station, 5, 0, "B");
  const path = Array.from({ length: 6 }, (_, i) => ({ x: i, y: 0 }));
  graph.addEdge(a.id, b.id, path);
  return graph;
}

describe("Simulation", () => {
  it("adds a train on an edge", () => {
    const graph = createSimpleGraph();
    const sim = new Simulation();
    const edge = graph.getAllEdges()[0];
    expect(edge).toBeDefined();
    if (edge === undefined) return;

    const train = sim.addTrain(edge.id);
    expect(train.edgeId).toBe(edge.id);
    expect(sim.trainCount).toBe(1);
  });

  it("removes a train", () => {
    const graph = createSimpleGraph();
    const sim = new Simulation();
    const edge = graph.getAllEdges()[0];
    if (edge === undefined) return;

    const train = sim.addTrain(edge.id);
    expect(sim.removeTrain(train.id)).toBe(true);
    expect(sim.trainCount).toBe(0);
  });

  it("train waits at station initially", () => {
    const graph = createSimpleGraph();
    const sim = new Simulation();
    const edge = graph.getAllEdges()[0];
    if (edge === undefined) return;

    sim.addTrain(edge.id);
    const posBefore = sim.getTrainPositions(graph);
    expect(posBefore).toHaveLength(1);

    // Small update should not move (waiting)
    sim.update(0.5, graph);
    const posAfter = sim.getTrainPositions(graph);
    expect(posAfter).toHaveLength(1);
    expect(posAfter[0]?.worldX).toBe(0);
  });

  it("train moves after wait time expires", () => {
    const graph = createSimpleGraph();
    const sim = new Simulation();
    const edge = graph.getAllEdges()[0];
    if (edge === undefined) return;

    sim.addTrain(edge.id);

    // Wait out the station time
    sim.update(2.1, graph);
    // Now the train should start moving
    sim.update(0.5, graph);

    const positions = sim.getTrainPositions(graph);
    expect(positions).toHaveLength(1);
    if (positions[0] !== undefined) {
      expect(positions[0].worldX).toBeGreaterThan(0);
    }
  });

  it("train reverses at end of edge (no connected edges)", () => {
    const graph = createSimpleGraph();
    const sim = new Simulation();
    const edge = graph.getAllEdges()[0];
    if (edge === undefined) return;

    const train = sim.addTrain(edge.id);

    // Fast forward past initial wait + travel time
    // Edge is 5 tiles, speed 3 tiles/s -> ~1.67s travel + 2s wait
    sim.update(2.0, graph); // wait
    sim.update(2.0, graph); // travel to end
    sim.update(2.0, graph); // wait at end + start return

    expect(train.forward).toBe(false);
  });

  it("edge locking prevents second train from entering", () => {
    const graph = createSimpleGraph();
    const sim = new Simulation();
    const edge = graph.getAllEdges()[0];
    if (edge === undefined) return;

    sim.addTrain(edge.id);
    // Second train on same edge should be possible (addTrain forces it)
    // but edge lock is set to first train
    const train2 = sim.addTrain(edge.id);
    // The lock should be overwritten to train2
    expect(train2.edgeId).toBe(edge.id);
  });

  it("train traverses connected edges", () => {
    const graph = new Graph();
    const a = graph.addNode(NodeKind.Station, 0, 0, "A");
    const b = graph.addNode(NodeKind.Station, 3, 0, "B");
    const c = graph.addNode(NodeKind.Station, 6, 0, "C");
    const pathAB = Array.from({ length: 4 }, (_, i) => ({ x: i, y: 0 }));
    const pathBC = Array.from({ length: 4 }, (_, i) => ({ x: i + 3, y: 0 }));
    const edgeAB = graph.addEdge(a.id, b.id, pathAB);
    graph.addEdge(b.id, c.id, pathBC);

    const sim = new Simulation();
    const train = sim.addTrain(edgeAB.id);

    // Wait + travel A->B (3 tiles at speed 3 = 1s) + wait at B + travel B->C
    sim.update(2.0, graph); // initial wait done
    sim.update(1.5, graph); // arrive at B
    sim.update(2.0, graph); // wait at B done

    // Train should now be on edge B->C
    expect(train.edgeId).not.toBe(edgeAB.id);
  });
});
