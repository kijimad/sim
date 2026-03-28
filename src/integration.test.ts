import { describe, expect, it } from "vitest";
import { Graph, NodeKind } from "./graph.js";
import { RouteMode, Simulation, TrainState } from "./simulation.js";

function runUntil(
  sim: Simulation,
  graph: Graph,
  cond: () => boolean,
  maxSeconds = 30,
): boolean {
  const dt = 0.1;
  const steps = Math.ceil(maxSeconds / dt);
  for (let i = 0; i < steps; i++) {
    sim.update(dt, graph);
    if (cond()) return true;
  }
  return false;
}

function makePath(length: number, startX: number, y = 0): { x: number; y: number }[] {
  return Array.from({ length }, (_, i) => ({ x: startX + i, y }));
}

describe("Integration: full line operation", () => {
  it("single train runs A->B->A continuously", () => {
    const graph = new Graph();
    const a = graph.addNode(NodeKind.Station, 0, 0, "A");
    const b = graph.addNode(NodeKind.Station, 5, 0, "B");
    graph.addEdge(a.id, b.id, makePath(6, 0));

    const sim = new Simulation();
    const route = sim.addRoute([a.id, b.id], RouteMode.Shuttle);
    sim.addTrain(route.id, graph);
    const train = sim.getAllTrains()[0];
    if (train === undefined) return;

    const reachedB = runUntil(sim, graph, () =>
      train.state === TrainState.AtNode && train.nodeId === b.id,
    );
    expect(reachedB).toBe(true);

    const reachedA = runUntil(sim, graph, () =>
      train.state === TrainState.AtNode && train.nodeId === a.id,
    );
    expect(reachedA).toBe(true);
  });

  it("train traverses three-station line", () => {
    const graph = new Graph();
    const a = graph.addNode(NodeKind.Station, 0, 0, "A");
    const b = graph.addNode(NodeKind.Station, 5, 0, "B");
    const c = graph.addNode(NodeKind.Station, 10, 0, "C");
    graph.addEdge(a.id, b.id, makePath(6, 0));
    graph.addEdge(b.id, c.id, makePath(6, 5));

    const sim = new Simulation();
    const route = sim.addRoute([a.id, c.id], RouteMode.Shuttle);
    sim.addTrain(route.id, graph);
    const train = sim.getAllTrains()[0];
    if (train === undefined) return;

    const reached = runUntil(sim, graph, () =>
      train.state === TrainState.AtNode && train.nodeId === c.id,
    );
    expect(reached).toBe(true);
  });
});
