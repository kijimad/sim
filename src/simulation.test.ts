import { describe, expect, it } from "vitest";
import { Graph, NodeKind } from "./graph.js";
import { RouteMode, Simulation, TrainState } from "./simulation.js";

function run(sim: Simulation, graph: Graph, seconds: number, dt = 0.1): void {
  const steps = Math.ceil(seconds / dt);
  for (let i = 0; i < steps; i++) {
    sim.update(dt, graph);
  }
}

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

describe("Route", () => {
  it("creates and retrieves a route", () => {
    const sim = new Simulation();
    const route = sim.addRoute([1, 2, 3], RouteMode.Shuttle);
    expect(route.stops).toEqual([1, 2, 3]);
    expect(sim.getRoute(route.id)).toBe(route);
  });
});

describe("Shuttle route", () => {
  it("train travels A -> B and back", () => {
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

  it("train traverses A -> B -> C -> B -> A", () => {
    const graph = new Graph();
    const a = graph.addNode(NodeKind.Station, 0, 0, "A");
    const b = graph.addNode(NodeKind.Station, 5, 0, "B");
    const c = graph.addNode(NodeKind.Station, 10, 0, "C");
    graph.addEdge(a.id, b.id, makePath(6, 0));
    graph.addEdge(b.id, c.id, makePath(6, 5));

    const sim = new Simulation();
    const route = sim.addRoute([a.id, b.id, c.id], RouteMode.Shuttle);
    sim.addTrain(route.id, graph);
    const train = sim.getAllTrains()[0];
    if (train === undefined) return;

    const reachedC = runUntil(sim, graph, () =>
      train.state === TrainState.AtNode && train.nodeId === c.id,
    );
    expect(reachedC).toBe(true);

    const backToA = runUntil(sim, graph, () =>
      train.state === TrainState.AtNode && train.nodeId === a.id,
    );
    expect(backToA).toBe(true);
  });
});

describe("Loop route", () => {
  it("train loops A -> B -> C -> A", () => {
    const graph = new Graph();
    const a = graph.addNode(NodeKind.Station, 0, 0, "A");
    const b = graph.addNode(NodeKind.Station, 5, 0, "B");
    const c = graph.addNode(NodeKind.Station, 5, 5, "C");
    graph.addEdge(a.id, b.id, makePath(6, 0));
    graph.addEdge(b.id, c.id, [{ x: 5, y: 0 }, { x: 5, y: 1 }, { x: 5, y: 2 }, { x: 5, y: 3 }, { x: 5, y: 4 }, { x: 5, y: 5 }]);
    graph.addEdge(c.id, a.id, [{ x: 5, y: 5 }, { x: 4, y: 4 }, { x: 3, y: 3 }, { x: 2, y: 2 }, { x: 1, y: 1 }, { x: 0, y: 0 }]);

    const sim = new Simulation();
    const route = sim.addRoute([a.id, b.id, c.id], RouteMode.Loop);
    sim.addTrain(route.id, graph);
    const train = sim.getAllTrains()[0];
    if (train === undefined) return;

    // Go around: A -> B -> C -> A
    const reachedB = runUntil(sim, graph, () =>
      train.state === TrainState.AtNode && train.nodeId === b.id,
    );
    expect(reachedB).toBe(true);

    const reachedC = runUntil(sim, graph, () =>
      train.state === TrainState.AtNode && train.nodeId === c.id,
    );
    expect(reachedC).toBe(true);

    const backToA = runUntil(sim, graph, () =>
      train.state === TrainState.AtNode && train.nodeId === a.id,
    );
    expect(backToA).toBe(true);
  });
});

describe("Edge blocking with routes", () => {
  it("second train waits while first is on edge", () => {
    const graph = new Graph();
    const a = graph.addNode(NodeKind.Station, 0, 0, "A", 2);
    const b = graph.addNode(NodeKind.Station, 5, 0, "B");
    graph.addEdge(a.id, b.id, makePath(6, 0));

    const sim = new Simulation();
    const route = sim.addRoute([a.id, b.id], RouteMode.Shuttle);
    sim.addTrain(route.id, graph);
    sim.addTrain(route.id, graph);

    run(sim, graph, 3);

    const trains = sim.getAllTrains();
    const atNode = trains.filter((t) => t.state === TrainState.AtNode);
    expect(atNode.length).toBeGreaterThanOrEqual(1);
  });

  it("two trains with signal stations: following", () => {
    const graph = new Graph();
    const a = graph.addNode(NodeKind.Station, 0, 0, "A", 2);
    const s1 = graph.addNode(NodeKind.SignalStation, 3, 0, "S1");
    const s2 = graph.addNode(NodeKind.SignalStation, 6, 0, "S2");
    const b = graph.addNode(NodeKind.Station, 9, 0, "B", 2);

    graph.addEdge(a.id, s1.id, makePath(4, 0));
    graph.addEdge(s1.id, s2.id, makePath(4, 3));
    graph.addEdge(s2.id, b.id, makePath(4, 6));

    const sim = new Simulation();
    const route = sim.addRoute([a.id, b.id], RouteMode.Shuttle);
    sim.addTrain(route.id, graph);
    sim.addTrain(route.id, graph);

    const visited = new Set<number>();
    const both = runUntil(sim, graph, () => {
      for (const t of sim.getAllTrains()) {
        if (t.state === TrainState.AtNode && t.nodeId === b.id) {
          visited.add(t.id);
        }
      }
      return visited.size >= 2;
    }, 60);

    expect(both).toBe(true);
  });

  it("opposing trains pass at signal station", () => {
    // A --e1-- S(cap2) --e2-- B
    const graph = new Graph();
    const a = graph.addNode(NodeKind.Station, 0, 0, "A");
    const s = graph.addNode(NodeKind.SignalStation, 5, 0, "S");
    const b = graph.addNode(NodeKind.Station, 10, 0, "B");

    graph.addEdge(a.id, s.id, makePath(6, 0));
    graph.addEdge(s.id, b.id, makePath(6, 5));

    const sim = new Simulation();
    const routeAB = sim.addRoute([a.id, b.id], RouteMode.Shuttle);
    const routeBA = sim.addRoute([b.id, a.id], RouteMode.Shuttle);
    sim.addTrain(routeAB.id, graph);
    sim.addTrain(routeBA.id, graph);

    // Train1 should reach B, Train2 should reach A
    const t1 = sim.getAllTrains()[0];
    const t2 = sim.getAllTrains()[1];
    if (t1 === undefined || t2 === undefined) return;

    const bothArrived = runUntil(sim, graph, () => {
      const t1AtB = t1.state === TrainState.AtNode && t1.nodeId === b.id;
      const t2AtA = t2.state === TrainState.AtNode && t2.nodeId === a.id;
      return t1AtB && t2AtA;
    }, 60);

    expect(bothArrived).toBe(true);
  });
});
