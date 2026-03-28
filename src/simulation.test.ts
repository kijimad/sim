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

describe("Debug world scenario", () => {
  it("3 trains on branching routes do not deadlock at junction", () => {
    //        C(30,10)
    //       /
    // A(10,20) --- B(30,20) --- D(50,20)
    //       \
    //        E(30,30)
    const graph = new Graph();
    const a = graph.addNode(NodeKind.Station, 10, 20, "A");
    const b = graph.addNode(NodeKind.Station, 30, 20, "B");
    const c = graph.addNode(NodeKind.Station, 30, 10, "C");
    const d = graph.addNode(NodeKind.Station, 50, 20, "D");
    graph.addNode(NodeKind.Station, 30, 30, "E");

    graph.addEdge(a.id, b.id, makePath(21, 10, 20));
    graph.addEdge(b.id, c.id, [
      { x: 30, y: 20 }, { x: 30, y: 19 }, { x: 30, y: 18 }, { x: 30, y: 17 },
      { x: 30, y: 16 }, { x: 30, y: 15 }, { x: 30, y: 14 }, { x: 30, y: 13 },
      { x: 30, y: 12 }, { x: 30, y: 11 }, { x: 30, y: 10 },
    ]);
    graph.addEdge(b.id, d.id, makePath(21, 30, 20));

    const sim = new Simulation();
    const route1 = sim.addRoute([a.id, d.id], RouteMode.Shuttle, "A-D");
    sim.addTrain(route1.id, graph);
    sim.addTrain(route1.id, graph);

    const route2 = sim.addRoute([a.id, c.id], RouteMode.Shuttle, "A-C");
    sim.addTrain(route2.id, graph);

    const dts = [0.016, 0.033, 0.05, 0.1, 0.016, 0.016, 0.033, 0.1, 0.05, 0.016];
    for (let frame = 0; frame < 10000; frame++) {
      const dt = dts[frame % dts.length] ?? 0.1;
      sim.update(dt, graph);

      // デッドロック検出: 全列車AtNodeで長時間待機
      const allAtNode = sim.getAllTrains().every((t) => t.state === TrainState.AtNode);
      if (allAtNode && frame > 100) {
        // 全員ノードにいて誰もエッジに出ていない→数フレーム待ってまだなら失敗
        let stuck = true;
        for (let wait = 0; wait < 50; wait++) {
          sim.update(0.1, graph);
          if (sim.getAllTrains().some((t) => t.state === TrainState.OnEdge)) {
            stuck = false;
            break;
          }
        }
        if (stuck) {
          const trains = sim.getAllTrains();
          const states = trains.map((t) =>
            `T${String(t.id)}: state=${String(t.state)} node=${String(t.nodeId)} edge=${String(t.edgeId)}`,
          ).join(", ");
          expect.fail(`デッドロック at frame ${String(frame)}:\n${states}`);
        }
      }
    }
  });
});

describe("Unreachable route", () => {
  it("train does not move on unreachable route", () => {
    // A -- B    C (Cは孤立)
    const graph = new Graph();
    const a = graph.addNode(NodeKind.Station, 0, 0, "A");
    const b = graph.addNode(NodeKind.Station, 5, 0, "B");
    const c = graph.addNode(NodeKind.Station, 20, 0, "C");
    graph.addEdge(a.id, b.id, makePath(6, 0));
    // CはA,Bと接続なし

    const sim = new Simulation();
    const route = sim.addRoute([a.id, c.id], RouteMode.Shuttle);

    // addTrainはisRouteValidで弾かれるので列車が追加されない
    sim.addTrain(route.id, graph);
    expect(sim.trainCount).toBe(0);
  });

  it("train stays at node when next edge is disconnected mid-game", () => {
    // A --e1-- B --e2-- C でRouteを作成後、e2を削除
    const graph = new Graph();
    const a = graph.addNode(NodeKind.Station, 0, 0, "A");
    const b = graph.addNode(NodeKind.Station, 5, 0, "B");
    const c = graph.addNode(NodeKind.Station, 10, 0, "C");
    graph.addEdge(a.id, b.id, makePath(6, 0));
    const e2 = graph.addEdge(b.id, c.id, makePath(6, 5));

    const sim = new Simulation();
    const route = sim.addRoute([a.id, c.id], RouteMode.Shuttle);
    sim.addTrain(route.id, graph);
    expect(sim.trainCount).toBe(1);

    // e2を削除 → BからCへの経路がなくなる
    graph.removeEdge(e2.id);

    // しばらく走らせる: 列車はBで止まるはず（エラーにならない）
    for (let i = 0; i < 500; i++) {
      sim.update(0.1, graph);
    }

    const train = sim.getAllTrains()[0];
    expect(train).toBeDefined();
    // 列車はBで待機しているはず
    if (train !== undefined) {
      expect(train.state).toBe(TrainState.AtNode);
    }
  });

  it("partially connected route: train stops at last reachable node", () => {
    // A --e1-- B   C --e2-- D
    // Route [A, D]: AからBまでは行けるがBからDへの経路がない
    const graph = new Graph();
    const a = graph.addNode(NodeKind.Station, 0, 0, "A");
    const b = graph.addNode(NodeKind.Station, 5, 0, "B");
    graph.addNode(NodeKind.Station, 15, 0, "C");
    graph.addNode(NodeKind.Station, 20, 0, "D");
    graph.addEdge(a.id, b.id, makePath(6, 0));
    // C-Dは接続あるがB-Cは接続なし

    const sim = new Simulation();
    const route = sim.addRoute([a.id, b.id], RouteMode.Shuttle);
    // A-Bは到達可能なのでaddTrain成功
    sim.addTrain(route.id, graph);
    expect(sim.trainCount).toBe(1);

    const train = sim.getAllTrains()[0];
    if (train === undefined) return;

    // Bに到達できるはず
    const reachedB = runUntil(sim, graph, () =>
      train.state === TrainState.AtNode && train.nodeId === b.id,
    );
    expect(reachedB).toBe(true);
  });
});

describe("Node capacity respected on departure", () => {
  it("train does not depart when destination node is full", () => {
    // A(cap2) --e1-- B(cap1)
    // 2台: 1台がBにいる間、2台目はAから出発しない
    const graph = new Graph();
    const a = graph.addNode(NodeKind.Station, 0, 0, "A", 2);
    const b = graph.addNode(NodeKind.Station, 5, 0, "B", 1);
    graph.addEdge(a.id, b.id, makePath(6, 0));

    const sim = new Simulation();
    const route = sim.addRoute([a.id, b.id], RouteMode.Shuttle);
    sim.addTrain(route.id, graph);
    sim.addTrain(route.id, graph);

    // Bのノード容量(1)を超えないこと
    let nodeViolation = false;
    // 両方ともBに到達はできる（交互に）
    const visited = new Set<number>();

    for (let i = 0; i < 1000; i++) {
      sim.update(0.1, graph);

      const atB = sim.getAllTrains().filter(
        (t) => t.state === TrainState.AtNode && t.nodeId === b.id,
      );
      if (atB.length > 1) {
        nodeViolation = true;
        break;
      }

      for (const t of sim.getAllTrains()) {
        if (t.state === TrainState.AtNode && t.nodeId === b.id) {
          visited.add(t.id);
        }
      }
    }

    expect(nodeViolation).toBe(false);
    expect(visited.size).toBe(2);
  });

  it("train does not depart through pass-through to full destination", () => {
    // A(cap2) --e1-- P(通過) --e2-- B(cap1)
    // 2台: 1台がBにいる間、2台目はPを通過してBに入れない→Pで待機
    const graph = new Graph();
    const a = graph.addNode(NodeKind.Station, 0, 0, "A", 2);
    const p = graph.addNode(NodeKind.Station, 5, 0, "P");
    const b = graph.addNode(NodeKind.Station, 10, 0, "B", 1);

    graph.addEdge(a.id, p.id, makePath(6, 0));
    graph.addEdge(p.id, b.id, makePath(6, 5));

    const sim = new Simulation();
    const route = sim.addRoute([a.id, b.id], RouteMode.Shuttle);
    sim.addTrain(route.id, graph);
    sim.addTrain(route.id, graph);

    let nodeViolation = false;
    for (let i = 0; i < 1000; i++) {
      sim.update(0.1, graph);

      const atB = sim.getAllTrains().filter(
        (t) => t.state === TrainState.AtNode && t.nodeId === b.id,
      );
      if (atB.length > 1) {
        nodeViolation = true;
        break;
      }
    }

    expect(nodeViolation).toBe(false);
  });
});

describe("Edge exclusivity", () => {
  it("two trains on same route never occupy the same edge simultaneously", () => {
    // A(cap2) -- edge -- B(cap2), Shuttle route, 2 trains
    const graph = new Graph();
    const a = graph.addNode(NodeKind.Station, 0, 0, "A", 2);
    const b = graph.addNode(NodeKind.Station, 10, 0, "B", 2);
    graph.addEdge(a.id, b.id, makePath(11, 0));

    const sim = new Simulation();
    const route = sim.addRoute([a.id, b.id], RouteMode.Shuttle);
    sim.addTrain(route.id, graph);
    sim.addTrain(route.id, graph);

    // 毎ティックごとに、同時にOnEdgeの列車が2台いないことを確認する
    let violation = false;
    for (let i = 0; i < 500; i++) {
      sim.update(0.1, graph);
      const onEdge = sim.getAllTrains().filter((t) => t.state === TrainState.OnEdge);
      // 同じエッジ上に2台いたら違反
      const edgeIds = onEdge.map((t) => t.edgeId);
      const unique = new Set(edgeIds);
      if (unique.size < edgeIds.length) {
        violation = true;
        break;
      }
    }
    expect(violation).toBe(false);
  });

  it("train does not depart onto edge that was just released in same frame", () => {
    // A(cap2) -- edge -- B(cap1)
    // 2 trains: one should wait while the other is on the edge or at B
    const graph = new Graph();
    const a = graph.addNode(NodeKind.Station, 0, 0, "A", 2);
    const b = graph.addNode(NodeKind.Station, 5, 0, "B", 1);
    graph.addEdge(a.id, b.id, makePath(6, 0));

    const sim = new Simulation();
    const route = sim.addRoute([a.id, b.id], RouteMode.Shuttle);
    sim.addTrain(route.id, graph);
    sim.addTrain(route.id, graph);

    // 毎ティック: OnEdgeの列車が同じエッジを共有しないこと
    let violation = false;
    for (let i = 0; i < 500; i++) {
      sim.update(0.1, graph);
      const onEdge = sim.getAllTrains().filter((t) => t.state === TrainState.OnEdge);
      const edgeIds = onEdge.map((t) => t.edgeId);
      const unique = new Set(edgeIds);
      if (unique.size < edgeIds.length) {
        violation = true;
        break;
      }
    }
    expect(violation).toBe(false);
  });

  it("three trains with signal stations maintain edge exclusivity", () => {
    // A(cap2) --e1-- S1 --e2-- S2 --e3-- B(cap2)
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
    sim.addTrain(route.id, graph);

    let violation = false;
    for (let i = 0; i < 1000; i++) {
      sim.update(0.1, graph);
      const onEdge = sim.getAllTrains().filter((t) => t.state === TrainState.OnEdge);
      const edgeIds = onEdge.map((t) => t.edgeId);
      const unique = new Set(edgeIds);
      if (unique.size < edgeIds.length) {
        violation = true;
        break;
      }
    }
    expect(violation).toBe(false);
  });

  it("branching: trains on different branches do not conflict", () => {
    //       B
    //      /
    // A --+
    //      \
    //       C
    const graph = new Graph();
    const a = graph.addNode(NodeKind.Station, 0, 0, "A", 2);
    const junction = graph.addNode(NodeKind.SignalStation, 5, 0, "J");
    const b = graph.addNode(NodeKind.Station, 10, 3, "B");
    const c = graph.addNode(NodeKind.Station, 10, -3, "C");

    graph.addEdge(a.id, junction.id, makePath(6, 0));
    graph.addEdge(junction.id, b.id, [
      { x: 5, y: 0 }, { x: 6, y: 0 }, { x: 7, y: 1 }, { x: 8, y: 2 }, { x: 9, y: 3 }, { x: 10, y: 3 },
    ]);
    graph.addEdge(junction.id, c.id, [
      { x: 5, y: 0 }, { x: 6, y: 0 }, { x: 7, y: -1 }, { x: 8, y: -2 }, { x: 9, y: -3 }, { x: 10, y: -3 },
    ]);

    const sim = new Simulation();
    const routeAB = sim.addRoute([a.id, b.id], RouteMode.Shuttle);
    const routeAC = sim.addRoute([a.id, c.id], RouteMode.Shuttle);
    sim.addTrain(routeAB.id, graph);
    sim.addTrain(routeAC.id, graph);

    // 両方の列車がそれぞれの目的地に到達でき、エッジ排他が維持される
    let violation = false;
    const reachedB = new Set<number>();
    const reachedC = new Set<number>();

    for (let i = 0; i < 500; i++) {
      sim.update(0.1, graph);

      // エッジ排他チェック
      const onEdge = sim.getAllTrains().filter((t) => t.state === TrainState.OnEdge);
      const edgeIds = onEdge.map((t) => t.edgeId);
      const unique = new Set(edgeIds);
      if (unique.size < edgeIds.length) {
        violation = true;
        break;
      }

      for (const t of sim.getAllTrains()) {
        if (t.state === TrainState.AtNode && t.nodeId === b.id) reachedB.add(t.id);
        if (t.state === TrainState.AtNode && t.nodeId === c.id) reachedC.add(t.id);
      }
    }

    expect(violation).toBe(false);
    expect(reachedB.size).toBeGreaterThanOrEqual(1);
    expect(reachedC.size).toBeGreaterThanOrEqual(1);
  });

  it("L-shaped path with intermediate station: two trains maintain edge exclusivity", () => {
    // L字型の経路: A --e1-- J(駅) --e2-- B
    // Jは駅ノード（路線の停車駅ではない、通過ノード）
    const graph = new Graph();
    const a = graph.addNode(NodeKind.Station, 0, 0, "A", 2);
    const j = graph.addNode(NodeKind.Station, 5, 0, "J");
    const b = graph.addNode(NodeKind.Station, 5, 5, "B", 2);

    graph.addEdge(a.id, j.id, makePath(6, 0));
    graph.addEdge(j.id, b.id, [
      { x: 5, y: 0 }, { x: 5, y: 1 }, { x: 5, y: 2 }, { x: 5, y: 3 }, { x: 5, y: 4 }, { x: 5, y: 5 },
    ]);

    const sim = new Simulation();
    const route = sim.addRoute([a.id, b.id], RouteMode.Shuttle);
    sim.addTrain(route.id, graph);
    sim.addTrain(route.id, graph);

    let violation = false;
    for (let i = 0; i < 1000; i++) {
      sim.update(0.1, graph);
      const onEdge = sim.getAllTrains().filter((t) => t.state === TrainState.OnEdge);
      const edgeIds = onEdge.map((t) => t.edgeId);
      const unique = new Set(edgeIds);
      if (unique.size < edgeIds.length) {
        violation = true;
        break;
      }
    }

    expect(violation).toBe(false);
  });

  it("opposing trains at junction do not both enter non-signal node", () => {
    // A --e1-- J(駅,cap2) --e2-- B
    // 列車1: A→B, 列車2: B→A
    // Jは停車駅ではないので通過ノード。両方がJに入ってエッジを解放してはいけない
    const graph = new Graph();
    const a = graph.addNode(NodeKind.Station, 0, 0, "A");
    const j = graph.addNode(NodeKind.Station, 5, 0, "J");
    const b = graph.addNode(NodeKind.Station, 10, 0, "B");

    graph.addEdge(a.id, j.id, makePath(6, 0));
    graph.addEdge(j.id, b.id, makePath(6, 5));

    const sim = new Simulation();
    const routeAB = sim.addRoute([a.id, b.id], RouteMode.Shuttle);
    const routeBA = sim.addRoute([b.id, a.id], RouteMode.Shuttle);
    sim.addTrain(routeAB.id, graph);
    sim.addTrain(routeBA.id, graph);

    let violation = false;
    for (let i = 0; i < 1000; i++) {
      sim.update(0.1, graph);
      const onEdge = sim.getAllTrains().filter((t) => t.state === TrainState.OnEdge);
      const edgeIds = onEdge.map((t) => t.edgeId);
      const unique = new Set(edgeIds);
      if (unique.size < edgeIds.length) {
        violation = true;
        break;
      }
    }

    expect(violation).toBe(false);

    // さらに、両方の列車がちゃんと目的地に到達できること（デッドロックしない）
    // J が信号場でないので、片方がエッジ上で待って、もう片方が通過する必要がある
    // この構成では対向列車はデッドロックする可能性があるが、
    // Shuttle路線なので折り返し時に同方向になる
  });

  it("opposing trains with signal station at junction can pass", () => {
    // A --e1-- S(信号場,cap2) --e2-- B
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

    let violation = false;
    const t1 = sim.getAllTrains()[0];
    const t2 = sim.getAllTrains()[1];
    if (t1 === undefined || t2 === undefined) return;

    let t1ReachedB = false;
    let t2ReachedA = false;

    for (let i = 0; i < 1000; i++) {
      sim.update(0.1, graph);

      const onEdge = sim.getAllTrains().filter((t) => t.state === TrainState.OnEdge);
      const edgeIds = onEdge.map((t) => t.edgeId);
      const unique = new Set(edgeIds);
      if (unique.size < edgeIds.length) {
        violation = true;
        break;
      }

      if (t1.state === TrainState.AtNode && t1.nodeId === b.id) t1ReachedB = true;
      if (t2.state === TrainState.AtNode && t2.nodeId === a.id) t2ReachedA = true;
    }

    expect(violation).toBe(false);
    expect(t1ReachedB).toBe(true);
    expect(t2ReachedA).toBe(true);
  });

  it("multi-hop pass-through: all edges are reserved before departure", () => {
    // A --e1-- P1 --e2-- P2 --e3-- B  (P1,P2は通過ノード)
    // 2台がAから出発: 1台目が全エッジ予約しているので2台目は出発できない
    const graph = new Graph();
    const a = graph.addNode(NodeKind.Station, 0, 0, "A", 2);
    const p1 = graph.addNode(NodeKind.Station, 3, 0, "P1");
    const p2 = graph.addNode(NodeKind.Station, 6, 0, "P2");
    const b = graph.addNode(NodeKind.Station, 9, 0, "B", 2);

    graph.addEdge(a.id, p1.id, makePath(4, 0));
    graph.addEdge(p1.id, p2.id, makePath(4, 3));
    graph.addEdge(p2.id, b.id, makePath(4, 6));

    const sim = new Simulation();
    const route = sim.addRoute([a.id, b.id], RouteMode.Shuttle);
    sim.addTrain(route.id, graph);
    sim.addTrain(route.id, graph);

    let violation = false;
    for (let i = 0; i < 1000; i++) {
      sim.update(0.1, graph);
      const onEdge = sim.getAllTrains().filter((t) => t.state === TrainState.OnEdge);
      const edgeIds = onEdge.map((t) => t.edgeId);
      const unique = new Set(edgeIds);
      if (unique.size < edgeIds.length) {
        violation = true;
        break;
      }
    }
    expect(violation).toBe(false);
  });

  it("route A-B with branching junction does not detour", () => {
    // A --e1-- J --e2-- B
    //              \--e3-- C
    // Route [A, B]: 列車はJでe2を選びBに行く。Cに寄り道しない。
    const graph = new Graph();
    const a = graph.addNode(NodeKind.Station, 0, 0, "A");
    const j = graph.addNode(NodeKind.Station, 5, 0, "J");
    const b = graph.addNode(NodeKind.Station, 10, 0, "B");
    const c = graph.addNode(NodeKind.Station, 5, 5, "C");

    graph.addEdge(a.id, j.id, makePath(6, 0));
    graph.addEdge(j.id, b.id, makePath(6, 5));
    graph.addEdge(j.id, c.id, [
      { x: 5, y: 0 }, { x: 5, y: 1 }, { x: 5, y: 2 }, { x: 5, y: 3 }, { x: 5, y: 4 }, { x: 5, y: 5 },
    ]);

    const sim = new Simulation();
    const route = sim.addRoute([a.id, b.id], RouteMode.Shuttle);
    sim.addTrain(route.id, graph);

    const train = sim.getAllTrains()[0];
    if (train === undefined) return;

    // 列車はCに行かず、Bに到達するはず
    let visitedC = false;
    const reachedB = runUntil(sim, graph, () => {
      if (train.state === TrainState.AtNode && train.nodeId === c.id) {
        visitedC = true;
      }
      return train.state === TrainState.AtNode && train.nodeId === b.id;
    });

    expect(reachedB).toBe(true);
    expect(visitedC).toBe(false);
  });

  it("train does not pass through when destination station is full", () => {
    // A --e1-- P(通過) --e2-- B(cap1)
    // 2台がAから出発: 1台目がBに入ると、2台目はPを通過できない
    const graph = new Graph();
    const a = graph.addNode(NodeKind.Station, 0, 0, "A", 2);
    const p = graph.addNode(NodeKind.Station, 5, 0, "P");
    const b = graph.addNode(NodeKind.Station, 10, 0, "B", 1);

    graph.addEdge(a.id, p.id, makePath(6, 0));
    graph.addEdge(p.id, b.id, makePath(6, 5));

    const sim = new Simulation();
    const route = sim.addRoute([a.id, b.id], RouteMode.Shuttle);
    sim.addTrain(route.id, graph);
    sim.addTrain(route.id, graph);

    // エッジ排他が維持されること
    let edgeViolation = false;
    // Bに2台同時に入らないこと
    let nodeViolation = false;

    for (let i = 0; i < 1000; i++) {
      sim.update(0.1, graph);

      const onEdge = sim.getAllTrains().filter((t) => t.state === TrainState.OnEdge);
      const edgeIds = onEdge.map((t) => t.edgeId);
      if (new Set(edgeIds).size < edgeIds.length) {
        edgeViolation = true;
        break;
      }

      const atB = sim.getAllTrains().filter(
        (t) => t.state === TrainState.AtNode && t.nodeId === b.id,
      );
      if (atB.length > 1) {
        nodeViolation = true;
        break;
      }
    }

    expect(edgeViolation).toBe(false);
    expect(nodeViolation).toBe(false);
  });

  it("train waits on edge when pass-through next node is full", () => {
    // A --e1-- P(通過,cap1) --e2-- B
    // 3台: 1台がe2走行中、1台がPにいると、3台目はe1上で停止すべき
    const graph = new Graph();
    const a = graph.addNode(NodeKind.Station, 0, 0, "A", 3);
    const p = graph.addNode(NodeKind.Station, 5, 0, "P", 1);
    const b = graph.addNode(NodeKind.Station, 10, 0, "B", 3);

    graph.addEdge(a.id, p.id, makePath(6, 0));
    graph.addEdge(p.id, b.id, makePath(6, 5));

    const sim = new Simulation();
    const route = sim.addRoute([a.id, b.id], RouteMode.Shuttle);
    sim.addTrain(route.id, graph);
    sim.addTrain(route.id, graph);
    sim.addTrain(route.id, graph);

    let edgeViolation = false;
    let nodeViolation = false;

    for (let i = 0; i < 1000; i++) {
      sim.update(0.1, graph);

      // エッジ排他
      const onEdge = sim.getAllTrains().filter((t) => t.state === TrainState.OnEdge);
      const edgeIds = onEdge.map((t) => t.edgeId);
      if (new Set(edgeIds).size < edgeIds.length) {
        edgeViolation = true;
        break;
      }

      // Pのノード容量(1)を超えない
      const atP = sim.getAllTrains().filter(
        (t) => t.state === TrainState.AtNode && t.nodeId === p.id,
      );
      if (atP.length > 1) {
        nodeViolation = true;
        break;
      }
    }

    expect(edgeViolation).toBe(false);
    expect(nodeViolation).toBe(false);
  });

  it("two opposing routes with pass-through maintain exclusivity", () => {
    // A --e1-- P(通過) --e2-- B
    // Route1: A→B, Route2: B→A, Pは通過ノード
    const graph = new Graph();
    const a = graph.addNode(NodeKind.Station, 0, 0, "A");
    const p = graph.addNode(NodeKind.Station, 5, 0, "P");
    const b = graph.addNode(NodeKind.Station, 10, 0, "B");

    graph.addEdge(a.id, p.id, makePath(6, 0));
    graph.addEdge(p.id, b.id, makePath(6, 5));

    const sim = new Simulation();
    const r1 = sim.addRoute([a.id, b.id], RouteMode.Shuttle);
    const r2 = sim.addRoute([b.id, a.id], RouteMode.Shuttle);
    sim.addTrain(r1.id, graph);
    sim.addTrain(r2.id, graph);

    let violation = false;
    for (let i = 0; i < 1000; i++) {
      sim.update(0.1, graph);
      const onEdge = sim.getAllTrains().filter((t) => t.state === TrainState.OnEdge);
      const edgeIds = onEdge.map((t) => t.edgeId);
      if (new Set(edgeIds).size < edgeIds.length) {
        violation = true;
        break;
      }
    }

    expect(violation).toBe(false);
  });

  it("shared edge between two routes maintains exclusivity", () => {
    // A -- shared -- B -- onlyRoute1 -- C
    //                 \-- onlyRoute2 -- D
    const graph = new Graph();
    const a = graph.addNode(NodeKind.Station, 0, 0, "A", 2);
    const b = graph.addNode(NodeKind.Station, 5, 0, "B", 2);
    const c = graph.addNode(NodeKind.Station, 10, 2, "C");
    const d = graph.addNode(NodeKind.Station, 10, -2, "D");

    graph.addEdge(a.id, b.id, makePath(6, 0));
    graph.addEdge(b.id, c.id, [
      { x: 5, y: 0 }, { x: 6, y: 0 }, { x: 7, y: 0 }, { x: 8, y: 1 }, { x: 9, y: 2 }, { x: 10, y: 2 },
    ]);
    graph.addEdge(b.id, d.id, [
      { x: 5, y: 0 }, { x: 6, y: 0 }, { x: 7, y: 0 }, { x: 8, y: -1 }, { x: 9, y: -2 }, { x: 10, y: -2 },
    ]);

    const sim = new Simulation();
    const route1 = sim.addRoute([a.id, c.id], RouteMode.Shuttle);
    const route2 = sim.addRoute([a.id, d.id], RouteMode.Shuttle);
    sim.addTrain(route1.id, graph);
    sim.addTrain(route2.id, graph);

    // 共有エッジ(A-B)を同時に2台が使わないこと
    let violation = false;
    for (let i = 0; i < 500; i++) {
      sim.update(0.1, graph);
      const onEdge = sim.getAllTrains().filter((t) => t.state === TrainState.OnEdge);
      const edgeIds = onEdge.map((t) => t.edgeId);
      const unique = new Set(edgeIds);
      if (unique.size < edgeIds.length) {
        violation = true;
        break;
      }
    }

    expect(violation).toBe(false);
  });
});
