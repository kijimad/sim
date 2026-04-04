import { describe, expect, it } from "vitest";
import { GameWorld } from "./game-world.js";
import { BuildingType, Resource } from "./economy.js";
import { NodeKind } from "./graph.js";
import { RouteMode } from "./simulation.js";
import { calcConsistStats } from "./vehicle.js";

/** デバッグワールドを生成する */
function createDebugWorld(): GameWorld {
  return new GameWorld({ seed: 42, debug: true });
}

/** 空のワールドを生成する（手動構築用） */
function createEmptyWorld(): GameWorld {
  return new GameWorld({ seed: 42, debug: false });
}

describe("GameWorld - デバッグワールド初期化", () => {
  it("デバッグワールドが正しく構築される", () => {
    const world = createDebugWorld();

    // 駅が正しく配置されている
    const nodes = [...world.graph.getAllNodes()];
    expect(nodes.length).toBeGreaterThanOrEqual(9);

    // 路線が3つある
    const routes = world.sim.getAllRoutes();
    expect(routes).toHaveLength(3);

    // 列車が4台ある
    const trains = world.sim.getAllTrains();
    expect(trains).toHaveLength(4);

    // 都市が3つある
    expect(world.economy.getAllCities()).toHaveLength(3);
  });

  it("初期待機貨物が設定されている", () => {
    const world = createDebugWorld();
    const nodes = [...world.graph.getAllNodes()];
    // 中央#1 に旅客が待機している
    const chuou1 = nodes.find((n) => n.name === "中央駅 #1");
    expect(chuou1).toBeDefined();
    expect(world.economy.getWaiting(chuou1!.id, Resource.Passengers)).toBe(5);
  });
});

describe("GameWorld - シミュレーション更新", () => {
  it("updateで時間が進む", () => {
    const world = createDebugWorld();

    // 十分な時間を進めて列車を運行させる
    for (let i = 0; i < 1000; i++) {
      world.update(0.1);
    }

    // 列車が走行して何かしら状態が変化している
    const snapshot = world.getSnapshot();
    expect(snapshot.trainCount).toBe(4);
    // 経済が動いている（生産が行われ、貨物が駅に溜まっている）
    const totalWaiting = [...world.graph.getAllNodes()].reduce(
      (sum, n) => sum + world.economy.getTotalWaiting(n.id),
      0,
    );
    expect(totalWaiting).toBeGreaterThan(0);
  });
});

describe("GameWorld - 路線操作", () => {
  it("路線を作成して列車を追加できる", () => {
    const world = createEmptyWorld();

    const s1 = world.graph.addNode(NodeKind.Station, 5, 5, "A");
    const s2 = world.graph.addNode(NodeKind.Station, 15, 5, "B");
    world.graph.addEdge(s1.id, s2.id, [
      { x: 5, y: 5 }, { x: 6, y: 5 }, { x: 7, y: 5 }, { x: 8, y: 5 },
      { x: 9, y: 5 }, { x: 10, y: 5 }, { x: 11, y: 5 }, { x: 12, y: 5 },
      { x: 13, y: 5 }, { x: 14, y: 5 }, { x: 15, y: 5 },
    ]);

    world.routeStops = [s1.id, s2.id];
    world.confirmRoute(RouteMode.Shuttle);

    expect(world.sim.getAllRoutes()).toHaveLength(1);

    world.addTrain();
    expect(world.sim.getAllTrains()).toHaveLength(1);
  });

  it("路線を削除すると列車も削除される", () => {
    const world = createEmptyWorld();

    const s1 = world.graph.addNode(NodeKind.Station, 5, 5, "A");
    const s2 = world.graph.addNode(NodeKind.Station, 15, 5, "B");
    world.graph.addEdge(s1.id, s2.id, [
      { x: 5, y: 5 }, { x: 6, y: 5 }, { x: 7, y: 5 }, { x: 8, y: 5 },
      { x: 9, y: 5 }, { x: 10, y: 5 }, { x: 11, y: 5 }, { x: 12, y: 5 },
      { x: 13, y: 5 }, { x: 14, y: 5 }, { x: 15, y: 5 },
    ]);

    world.routeStops = [s1.id, s2.id];
    world.confirmRoute(RouteMode.Shuttle);
    const routeId = world.sim.getAllRoutes()[0]!.id;
    world.addTrain(routeId);
    world.addTrain(routeId);
    expect(world.sim.getAllTrains()).toHaveLength(2);

    world.removeRoute(routeId);
    expect(world.sim.getAllRoutes()).toHaveLength(0);
    expect(world.sim.getAllTrains()).toHaveLength(0);
  });
});

describe("GameWorld - 路線接続性", () => {
  it("同一路線の駅が接続される", () => {
    const world = createEmptyWorld();

    const s1 = world.graph.addNode(NodeKind.Station, 5, 5, "A");
    const s2 = world.graph.addNode(NodeKind.Station, 15, 5, "B");
    world.graph.addEdge(s1.id, s2.id, [
      { x: 5, y: 5 }, { x: 10, y: 5 }, { x: 15, y: 5 },
    ]);

    world.sim.addRoute([s1.id, s2.id], RouteMode.Shuttle);

    const conns = world.buildRouteConnections();
    expect(conns.get(s1.id)).toContain(s2.id);
    expect(conns.get(s2.id)).toContain(s1.id);
  });

  it("複合体経由で乗り換え接続される", () => {
    const world = createEmptyWorld();

    // A --- B#1
    //       B#2 --- C
    const a = world.graph.addNode(NodeKind.Station, 5, 5, "A");
    const b1 = world.graph.addNode(NodeKind.Station, 15, 5, "B#1");
    const b2 = world.graph.addNode(NodeKind.Station, 15, 6, "B#2");
    const c = world.graph.addNode(NodeKind.Station, 25, 6, "C");

    world.graph.addEdge(a.id, b1.id, [
      { x: 5, y: 5 }, { x: 10, y: 5 }, { x: 15, y: 5 },
    ]);
    world.graph.addEdge(b2.id, c.id, [
      { x: 15, y: 6 }, { x: 20, y: 6 }, { x: 25, y: 6 },
    ]);

    // 路線1: A → B#1、路線2: B#2 → C
    world.sim.addRoute([a.id, b1.id], RouteMode.Shuttle);
    world.sim.addRoute([b2.id, c.id], RouteMode.Shuttle);

    const conns = world.buildRouteConnections();
    // A → B#1（同路線）→ B#2（複合体）→ C（同路線）
    expect(conns.get(a.id)).toContain(c.id);
    expect(conns.get(c.id)).toContain(a.id);
  });

  it("路線未接続の駅は接続されない", () => {
    const world = createEmptyWorld();

    const s1 = world.graph.addNode(NodeKind.Station, 5, 5, "A");
    const s2 = world.graph.addNode(NodeKind.Station, 15, 5, "B");
    const s3 = world.graph.addNode(NodeKind.Station, 25, 5, "C");

    world.sim.addRoute([s1.id, s2.id], RouteMode.Shuttle);
    // s3 は路線に含まれない

    const conns = world.buildRouteConnections();
    expect(conns.get(s1.id) ?? []).not.toContain(s3.id);
  });
});

describe("GameWorld - スナップショット", () => {
  it("スナップショットが正しい構造を返す", () => {
    const world = createDebugWorld();
    const snap = world.getSnapshot();

    expect(snap.debug).toBe(true);
    expect(snap.seed).toBe(42);
    expect(snap.trainCount).toBe(4);
    expect(snap.routes.length).toBe(3);
    expect(snap.cities.length).toBe(3);
    expect(snap.toolMode).toBe("inspect");
  });

  it("インスペクト情報を取得できる", () => {
    const world = createDebugWorld();

    // 田園駅(10,20) をインスペクト
    world.inspectTileX = 10;
    world.inspectTileY = 20;
    const info = world.buildInspectInfo();
    expect(info.type).toBe("node");
    expect(info.nodeName).toBe("田園駅");
  });
});

describe("GameWorld - 駅操作", () => {
  it("駅の容量を変更できる", () => {
    const world = createDebugWorld();
    const nodes = [...world.graph.getAllNodes()];
    const station = nodes[0]!;

    world.setNodeCapacity(station.id, 3);
    expect(station.capacity).toBe(3);

    // 最小値は1
    world.setNodeCapacity(station.id, 0);
    expect(station.capacity).toBe(1);
  });

  it("路線使用中の駅は削除できない", () => {
    const world = createDebugWorld();
    const nodes = [...world.graph.getAllNodes()];
    const station = nodes.find((n) => n.name === "田園駅");
    expect(station).toBeDefined();

    const error = world.removeNode(station!.id);
    expect(error).not.toBeNull();
  });

  it("駅名を変更できる", () => {
    const world = createDebugWorld();
    const nodes = [...world.graph.getAllNodes()];
    const station = nodes.find((n) => n.name === "田園駅")!;

    world.renameNode(station.id, "Shin-Denen");
    expect(world.graph.getNode(station.id)?.name).toBe("Shin-Denen");
  });
});

describe("GameWorld - 貨物の生産と配達", () => {
  it("路線接続済みの建物から貨物が生産される", () => {
    const world = createEmptyWorld();

    const s1 = world.graph.addNode(NodeKind.Station, 5, 5, "農村");
    const s2 = world.graph.addNode(NodeKind.Station, 20, 5, "商店街");
    world.graph.addEdge(s1.id, s2.id, [
      { x: 5, y: 5 }, { x: 10, y: 5 }, { x: 15, y: 5 }, { x: 20, y: 5 },
    ]);

    // 農場を農村駅の近くに、商店を商店街駅の近くに配置
    world.economy.addBuilding(BuildingType.Farm, 6, 5);
    world.economy.addBuilding(BuildingType.Commercial, 21, 5);

    // 路線を作成
    world.sim.addRoute([s1.id, s2.id], RouteMode.Shuttle);

    // 時間を進めて生産を発生させる
    for (let i = 0; i < 20; i++) {
      world.update(0.1);
    }

    // 農村駅に米が待機している
    const waiting = world.economy.getWaitingCargo(s1.id);
    const rice = waiting.filter((c) => c.resource === Resource.Rice);
    expect(rice.length).toBeGreaterThan(0);
    // 目的地は商店街駅
    expect(rice[0]!.destinationNodeId).toBe(s2.id);
  });

  it("列車が貨物を配達すると収益が発生する", () => {
    const world = createEmptyWorld();

    const s1 = world.graph.addNode(NodeKind.Station, 5, 5, "農村");
    const s2 = world.graph.addNode(NodeKind.Station, 20, 5, "商店街");
    world.graph.addEdge(s1.id, s2.id, [
      { x: 5, y: 5 }, { x: 10, y: 5 }, { x: 15, y: 5 }, { x: 20, y: 5 },
    ]);

    world.economy.addBuilding(BuildingType.Farm, 6, 5);
    world.economy.addBuilding(BuildingType.Commercial, 21, 5);

    world.sim.addRoute([s1.id, s2.id], RouteMode.Shuttle);
    world.sim.addTrain(world.sim.getAllRoutes()[0]!.id, world.graph);

    // 初期貨物を設定
    world.economy.addWaiting(s1.id, Resource.Rice, 20, s2.id);

    // 列車が往復するのに十分な時間を回す
    for (let i = 0; i < 500; i++) {
      world.update(0.1);
    }

    // 配達による収益が発生している
    expect(world.economy.money).toBeGreaterThan(0);
  });

  it("路線未接続だと貨物が生産されない", () => {
    const world = createEmptyWorld();

    const s1 = world.graph.addNode(NodeKind.Station, 5, 5, "農村");
    world.graph.addNode(NodeKind.Station, 20, 5, "商店街");

    world.economy.addBuilding(BuildingType.Farm, 6, 5);
    world.economy.addBuilding(BuildingType.Commercial, 21, 5);

    // 路線を作らない
    for (let i = 0; i < 20; i++) {
      world.update(0.1);
    }

    expect(world.economy.getTotalWaiting(s1.id)).toBe(0);
  });
});

describe("GameWorld - 乗り換え経由の貨物", () => {
  it("複合体乗り換えで到達可能な駅に旅客が生産される", () => {
    const world = createEmptyWorld();

    // A --- B#1
    //       B#2 --- C
    const a = world.graph.addNode(NodeKind.Station, 5, 5, "A");
    const b1 = world.graph.addNode(NodeKind.Station, 15, 5, "B#1");
    const b2 = world.graph.addNode(NodeKind.Station, 15, 6, "B#2");
    const c = world.graph.addNode(NodeKind.Station, 25, 6, "C");

    world.graph.addEdge(a.id, b1.id, [
      { x: 5, y: 5 }, { x: 10, y: 5 }, { x: 15, y: 5 },
    ]);
    world.graph.addEdge(b2.id, c.id, [
      { x: 15, y: 6 }, { x: 20, y: 6 }, { x: 25, y: 6 },
    ]);

    // 住宅をAの近くに配置
    world.economy.addBuilding(BuildingType.Residence, 6, 5);

    world.sim.addRoute([a.id, b1.id], RouteMode.Shuttle);
    world.sim.addRoute([b2.id, c.id], RouteMode.Shuttle);

    // 生産を回す
    for (let i = 0; i < 20; i++) {
      world.update(0.1);
    }

    // Aに旅客が待機しており、目的地がB#1, B#2, C のいずれか
    const waiting = world.economy.getWaitingCargo(a.id);
    const passengers = waiting.filter((w) => w.resource === Resource.Passengers);
    if (passengers.length > 0) {
      const destinations = new Set(passengers.map((p) => p.destinationNodeId));
      // 乗り換え経由で到達できる全駅が目的地候補
      const reachable = new Set([b1.id, b2.id, c.id]);
      for (const dest of destinations) {
        expect(reachable.has(dest)).toBe(true);
      }
    }
  });
});

describe("GameWorld - 乗り換え経由の配達", () => {
  it("乗り換え駅で貨物が降ろされて待機する", () => {
    const world = createEmptyWorld();

    // A --- B#1
    //       B#2 --- C
    const a = world.graph.addNode(NodeKind.Station, 5, 5, "A");
    const b1 = world.graph.addNode(NodeKind.Station, 15, 5, "B#1");
    const b2 = world.graph.addNode(NodeKind.Station, 15, 6, "B#2");
    const c = world.graph.addNode(NodeKind.Station, 25, 6, "C");

    world.graph.addEdge(a.id, b1.id, [
      { x: 5, y: 5 }, { x: 10, y: 5 }, { x: 15, y: 5 },
    ]);
    world.graph.addEdge(b2.id, c.id, [
      { x: 15, y: 6 }, { x: 20, y: 6 }, { x: 25, y: 6 },
    ]);

    world.sim.addRoute([a.id, b1.id], RouteMode.Shuttle);
    world.sim.addRoute([b2.id, c.id], RouteMode.Shuttle);

    // 路線接続確認: AからCに到達可能であること
    const conns = world.buildRouteConnections();
    expect(conns.get(a.id) ?? []).toContain(c.id);

    // Aに目的地Cの旅客を置く
    world.economy.addWaiting(a.id, Resource.Passengers, 10, c.id);

    // 路線1の列車を配置
    const route1 = world.sim.getAllRoutes()[0]!;
    world.sim.addTrain(route1.id, world.graph);

    // 十分に走らせる（列車がA→B#1→A→B#1 を数往復するのに十分な時間）
    for (let i = 0; i < 2000; i++) {
      world.update(0.1);
    }

    // B#1 or B#2 に乗り換え旅客が待機しているはず
    const waitingB1 = world.economy.getTotalWaiting(b1.id);
    const waitingB2 = world.economy.getTotalWaiting(b2.id);
    expect(waitingB1 + waitingB2).toBeGreaterThan(0);

    // Aの旅客は減っている
    const waitingA = world.economy.getTotalWaiting(a.id);
    expect(waitingA).toBeLessThan(10);
  });
});

describe("GameWorld - トースト", () => {
  it("トーストが時間経過で消える", () => {
    const world = createDebugWorld();

    world.showToast("テストメッセージ");
    expect(world.toasts).toHaveLength(1);
    expect(world.toasts[0]!.message).toBe("テストメッセージ");

    // 4秒経過で消える（TOAST_DURATION=3.0）
    world.update(4.0);
    expect(world.toasts).toHaveLength(0);
  });
});

describe("GameWorld - フローティングテキスト", () => {
  it("フローティングテキストが時間経過で消える", () => {
    const world = createDebugWorld();

    world.floatingTexts.push({ x: 10, y: 20, text: "+$100", time: 2.0 });
    expect(world.floatingTexts).toHaveLength(1);

    world.update(1.0);
    expect(world.floatingTexts).toHaveLength(1);

    world.update(1.5);
    expect(world.floatingTexts).toHaveLength(0);
  });
});

describe("GameWorld - エッジ操作", () => {
  it("列車走行中のエッジは削除できない", () => {
    const world = createDebugWorld();

    // 列車を走��せる
    for (let i = 0; i < 50; i++) {
      world.update(0.1);
    }

    // エッジ上に列車がいれば削除不可を確認
    const edges = [...world.graph.getAllEdges()];
    for (const edge of edges) {
      if (world.sim.hasTrainsOnEdge(edge.id)) {
        const error = world.removeEdge(edge.id);
        expect(error).toBe("列車が走行中のため削除できません");
        break;
      }
    }
  });

  it("路線で使用中のエッジは削除できない", () => {
    const world = createEmptyWorld();

    const s1 = world.graph.addNode(NodeKind.Station, 5, 5, "A");
    const s2 = world.graph.addNode(NodeKind.Station, 15, 5, "B");
    const edge = world.graph.addEdge(s1.id, s2.id, [
      { x: 5, y: 5 }, { x: 10, y: 5 }, { x: 15, y: 5 },
    ]);

    world.sim.addRoute([s1.id, s2.id], RouteMode.Shuttle);

    const error = world.removeEdge(edge.id);
    expect(error).toContain("使用中のため削除できません");
  });

  it("未使用のエッジは削除できる", () => {
    const world = createEmptyWorld();

    const s1 = world.graph.addNode(NodeKind.Station, 5, 5, "A");
    const s2 = world.graph.addNode(NodeKind.Station, 15, 5, "B");
    const edge = world.graph.addEdge(s1.id, s2.id, [
      { x: 5, y: 5 }, { x: 10, y: 5 }, { x: 15, y: 5 },
    ]);

    const error = world.removeEdge(edge.id);
    expect(error).toBeNull();
    expect(world.graph.getEdge(edge.id)).toBeUndefined();
  });
});

describe("GameWorld - インスペクト詳細", () => {
  it("建物のインスペクトが正しい", () => {
    const world = createDebugWorld();

    // 農場(8,20) をインスペクト
    world.inspectTileX = 8;
    world.inspectTileY = 20;
    const info = world.buildInspectInfo();
    expect(info.buildingType).toBe("Farm");
    expect(info.buildingProduces).toBe("Rice");
  });

  it("待機貨物の目的地が表示される", () => {
    const world = createDebugWorld();
    const nodes = [...world.graph.getAllNodes()];
    const chuou1 = nodes.find((n) => n.name === "中央駅 #1")!;

    // 中央#1 をインスペクト
    world.inspectTileX = chuou1.tileX;
    world.inspectTileY = chuou1.tileY;
    const info = world.buildInspectInfo();

    expect(info.type).toBe("node");
    expect(info.waitingDetail).toBeDefined();
    expect(info.waitingDetail!.length).toBeGreaterThan(0);
    // 目的地名が含まれている
    expect(info.waitingDetail![0]!.destination).toBeDefined();
    expect(info.waitingDetail![0]!.destination.length).toBeGreaterThan(0);
  });

  it("エッジのインスペクトが正しい", () => {
    const world = createDebugWorld();
    const edges = [...world.graph.getAllEdges()];
    // エッジのパス中間点をインスペクト
    const edge = edges[0]!;
    const midPoint = edge.path[Math.floor(edge.path.length / 2)]!;

    world.inspectTileX = midPoint.x;
    world.inspectTileY = midPoint.y;
    const info = world.buildInspectInfo();
    // ノードでもなく建物でもないパス上ならedge
    if (info.type === "edge") {
      expect(info.edgeId).toBe(edge.id);
      expect(info.edgeFrom).toBeDefined();
      expect(info.edgeTo).toBeDefined();
    }
  });
});

describe("GameWorld - 路線編集", () => {
  it("既存路線を編集できる", () => {
    const world = createEmptyWorld();

    const s1 = world.graph.addNode(NodeKind.Station, 5, 5, "A");
    const s2 = world.graph.addNode(NodeKind.Station, 15, 5, "B");
    const s3 = world.graph.addNode(NodeKind.Station, 25, 5, "C");
    world.graph.addEdge(s1.id, s2.id, [
      { x: 5, y: 5 }, { x: 10, y: 5 }, { x: 15, y: 5 },
    ]);
    world.graph.addEdge(s2.id, s3.id, [
      { x: 15, y: 5 }, { x: 20, y: 5 }, { x: 25, y: 5 },
    ]);

    world.routeStops = [s1.id, s2.id];
    world.confirmRoute(RouteMode.Shuttle);
    const routeId = world.sim.getAllRoutes()[0]!.id;

    // 路線を編集モードにする
    world.editRoute(routeId);
    expect(world.editingRouteId).toBe(routeId);
    expect(world.routeStops).toEqual([s1.id, s2.id]);

    // 停車駅を変更してA→B→Cにする
    world.routeStops = [s1.id, s2.id, s3.id];
    world.confirmRoute(RouteMode.Shuttle);

    const route = world.sim.getRoute(routeId);
    expect(route!.stops).toEqual([s1.id, s2.id, s3.id]);
    expect(world.editingRouteId).toBeNull();
  });

  it("停車駅を個別に削除できる", () => {
    const world = createEmptyWorld();
    world.routeStops = [1, 2, 3];
    world.removeRouteStop(1);
    expect(world.routeStops).toEqual([1, 3]);
  });

  it("路線作成をキャンセルできる", () => {
    const world = createEmptyWorld();
    world.routeStops = [1, 2];
    world.cancelRoute();
    expect(world.routeStops).toEqual([]);
    expect(world.editingRouteId).toBeNull();
    expect(world.selectedNodeId).toBeNull();
  });
});

describe("GameWorld - キー入力", () => {
  it("バッククォートでInspectモードに切り替わる", () => {
    const world = createDebugWorld();
    world.toolMode = "rail";
    world.onKeyPress("`");
    expect(world.toolMode).toBe("inspect");
  });

  it("1キーでRailモードに切り替わる", () => {
    const world = createDebugWorld();
    world.onKeyPress("1");
    expect(world.toolMode).toBe("rail");
  });

  it("2キーでRouteモードに切り替わる", () => {
    const world = createDebugWorld();
    world.onKeyPress("2");
    expect(world.toolMode).toBe("route");
  });

  it("Escapeで路線作成がキャンセルされる", () => {
    const world = createDebugWorld();
    world.toolMode = "route";
    world.routeStops = [1, 2];
    world.onKeyPress("Escape");
    expect(world.routeStops).toEqual([]);
  });
});

// --- 編成プリセット ---

/** 路線付きの空ワールドを作るヘルパー */
function createWorldWithRoute(): { world: GameWorld; routeId: number; s1Id: number; s2Id: number } {
  const world = createEmptyWorld();
  const s1 = world.graph.addNode(NodeKind.Station, 5, 5, "A");
  const s2 = world.graph.addNode(NodeKind.Station, 15, 5, "B");
  world.graph.addEdge(s1.id, s2.id, [
    { x: 5, y: 5 }, { x: 6, y: 5 }, { x: 7, y: 5 }, { x: 8, y: 5 },
    { x: 9, y: 5 }, { x: 10, y: 5 }, { x: 11, y: 5 }, { x: 12, y: 5 },
    { x: 13, y: 5 }, { x: 14, y: 5 }, { x: 15, y: 5 },
  ]);
  const route = world.sim.addRoute([s1.id, s2.id], RouteMode.Shuttle, "Test Line");
  return { world, routeId: route.id, s1Id: s1.id, s2Id: s2.id };
}

describe("GameWorld - 編成プリセット管理", () => {
  it("プリセットを作成できる", () => {
    const world = createEmptyWorld();
    const preset = world.addConsistPreset("普通列車", ["loco_steam", "car_passenger", "car_passenger"]);
    expect(preset).not.toBeNull();
    expect(preset!.name).toBe("普通列車");
    expect(preset!.cars).toEqual(["loco_steam", "car_passenger", "car_passenger"]);
  });

  it("不正な車両IDを含むプリセットは作成できない", () => {
    const world = createEmptyWorld();
    const preset = world.addConsistPreset("bad", ["loco_steam", "nonexistent"]);
    expect(preset).toBeNull();
  });

  it("プリセットを更新できる", () => {
    const world = createEmptyWorld();
    const preset = world.addConsistPreset("test", ["loco_steam", "car_passenger"]);
    expect(preset).not.toBeNull();

    const ok = world.updateConsistPreset(preset!.id, "updated", ["loco_diesel", "car_freight"]);
    expect(ok).toBe(true);

    const updated = world.getConsistPreset(preset!.id);
    expect(updated!.name).toBe("updated");
    expect(updated!.cars).toEqual(["loco_diesel", "car_freight"]);
  });

  it("プリセットを路線に適用すると車両構成がコピーされる", () => {
    const { world, routeId } = createWorldWithRoute();
    const preset = world.addConsistPreset("test", ["loco_steam", "car_passenger"]);
    expect(preset).not.toBeNull();

    world.applyPresetToRoute(routeId, preset!.id);
    expect(world.sim.getRoute(routeId)!.cars).toEqual(["loco_steam", "car_passenger"]);

    // プリセット削除後も路線の車両構成は残る
    world.removeConsistPreset(preset!.id);
    expect(world.sim.getRoute(routeId)!.cars).toEqual(["loco_steam", "car_passenger"]);
  });

  it("スナップショットにプリセット情報が含まれる", () => {
    const world = createEmptyWorld();
    world.addConsistPreset("普通", ["loco_steam", "car_passenger"]);
    world.addConsistPreset("貨物", ["loco_diesel", "car_freight", "car_freight"]);

    const snap = world.getSnapshot();
    expect(snap.consistPresets).toHaveLength(2);
    expect(snap.consistPresets[0]!.stats).not.toBeNull();
    expect(snap.consistPresets[0]!.stats!.hasPower).toBe(true);
  });
});

describe("GameWorld - 編成による増発", () => {
  it("プリセット付き路線で列車を増発できる", () => {
    const { world, routeId } = createWorldWithRoute();
    const preset = world.addConsistPreset("普通", ["loco_steam", "car_passenger"]);
    expect(preset).not.toBeNull();

    // 十分な資金を設定
    world.economy.deductRunningCost(-10000);

    world.applyPresetToRoute(routeId, preset!.id);
    const error = world.addTrain(routeId);
    expect(error).toBeNull();
    expect(world.sim.getAllTrains()).toHaveLength(1);

    // 列車に車両構成が設定されている
    const train = world.sim.getAllTrains()[0]!;
    expect(train.cars).toEqual(["loco_steam", "car_passenger"]);

    // 速度は編成の実効速度
    const stats = calcConsistStats(["loco_steam", "car_passenger"]);
    expect(train.speed).toBe(stats!.effectiveSpeed);
  });

  it("資金不足で増発が拒否される", () => {
    const { world, routeId } = createWorldWithRoute();
    const preset = world.addConsistPreset("高額", ["loco_diesel", "car_express", "car_express", "car_express"]);
    expect(preset).not.toBeNull();

    // 資金を0にする
    world.economy.deductRunningCost(world.economy.money);

    world.applyPresetToRoute(routeId, preset!.id);
    const error = world.addTrain(routeId);
    expect(error).not.toBeNull();
    expect(error).toContain("資金不足");
    expect(world.sim.getAllTrains()).toHaveLength(0);
  });

  it("動力車なしの編成は増発できない", () => {
    const { world, routeId } = createWorldWithRoute();
    const preset = world.addConsistPreset("客車のみ", ["car_passenger", "car_passenger"]);
    expect(preset).not.toBeNull();

    world.economy.deductRunningCost(-10000);
    world.applyPresetToRoute(routeId, preset!.id);

    const error = world.addTrain(routeId);
    expect(error).toBe("動力車がありません");
    expect(world.sim.getAllTrains()).toHaveLength(0);
  });

  it("プリセット未設定ならデフォルトで増発できる", () => {
    const { world, routeId } = createWorldWithRoute();
    const error = world.addTrain(routeId);
    expect(error).toBeNull();
    expect(world.sim.getAllTrains()).toHaveLength(1);

    // デフォルト列車は cars が空
    const train = world.sim.getAllTrains()[0]!;
    expect(train.cars).toEqual([]);
    expect(train.cargoCapacity).toBe(Infinity);
  });
});

describe("GameWorld - 容量制限", () => {
  it("列車の積載量が容量を超えない", () => {
    const { world, routeId, s1Id, s2Id } = createWorldWithRoute();
    const preset = world.addConsistPreset("小型", ["loco_steam", "car_passenger"]);
    expect(preset).not.toBeNull();

    world.economy.deductRunningCost(-10000);
    world.applyPresetToRoute(routeId, preset!.id);
    world.addTrain(routeId);

    // 容量(40)を超える貨物を駅に置く
    world.economy.addWaiting(s1Id, Resource.Passengers, 100, s2Id);

    // 列車を走らせて積載させる
    for (let i = 0; i < 100; i++) {
      world.update(0.1);
    }

    // 列車の積載量が容量以下であること
    const train = world.sim.getAllTrains()[0]!;
    let totalCargo = 0;
    for (const item of train.cargo) {
      totalCargo += item.amount;
    }
    expect(totalCargo).toBeLessThanOrEqual(40);

    // 積み残しが駅にある
    const stationWaiting = world.economy.getTotalWaiting(s1Id);
    expect(stationWaiting).toBeGreaterThan(0);
  });
});

describe("GameWorld - 運行コスト", () => {
  it("列車の運行コストが毎フレーム差し引かれる", () => {
    const { world, routeId } = createWorldWithRoute();
    const preset = world.addConsistPreset("test", ["loco_steam", "car_passenger"]);
    expect(preset).not.toBeNull();

    // 十分な資金を設定
    world.economy.deductRunningCost(-10000);
    const moneyBefore = world.economy.money;

    world.applyPresetToRoute(routeId, preset!.id);
    world.addTrain(routeId);

    const stats = calcConsistStats(["loco_steam", "car_passenger"]);
    const purchaseCost = stats!.purchaseCost;

    // 購入費が引かれた後の残高
    const afterPurchase = moneyBefore - purchaseCost;
    expect(world.economy.money).toBeCloseTo(afterPurchase, 1);

    // 時間を進めて運行コストが引かれることを確認
    for (let i = 0; i < 100; i++) {
      world.update(0.1);
    }

    // 運行コスト(4/s) × 10秒 = 40 が引かれている（+生産による収益は無視できる範囲）
    expect(world.economy.money).toBeLessThan(afterPurchase);
  });
});
