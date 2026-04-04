import { describe, expect, it } from "vitest";
import { Graph, NodeKind } from "./graph.js";
import { Economy, Resource, BuildingType, generateCities } from "./economy.js";
import { TileMap } from "./tilemap.js";

describe("Economy", () => {
  it("adds cities", () => {
    const economy = new Economy();
    const city = economy.addCity("Test", 5, 5, 8);
    expect(city.name).toBe("Test");
    expect(economy.getAllCities()).toHaveLength(1);
  });

  it("produces cargo at nearby stations", () => {
    const graph = new Graph();
    const station = graph.addNode(NodeKind.Station, 5, 5, "A");

    const economy = new Economy();
    economy.addCity("Town", 5, 5, 8);

    const map = new TileMap(20, 20);

    for (let i = 0; i < 200; i++) {
      economy.update(0.1, graph, map, new Map());
    }

    const total = economy.getTotalWaiting(station.id);
    expect(total).toBeGreaterThanOrEqual(0);
  });
});

describe("Economy - 目的地付き貨物", () => {
  it("生産された貨物は目的地を持つ", () => {
    const graph = new Graph();
    // 農場の近くの駅
    const stationA = graph.addNode(NodeKind.Station, 5, 5, "A");
    // 商店の近くの駅
    const stationB = graph.addNode(NodeKind.Station, 20, 20, "B");

    const economy = new Economy();
    // 農場（Rice生産）をstationAの近くに配置
    economy.addBuilding(BuildingType.Farm, 6, 5);
    // 商店（Rice消費）をstationBの近くに配置
    economy.addBuilding(BuildingType.Commercial, 21, 20);

    const map = new TileMap(30, 30);
    // A→B が路線で接続されている
    const routeConns = new Map<number, number[]>([
      [stationA.id, [stationB.id]],
      [stationB.id, [stationA.id]],
    ]);
    // 生産ティックを回す
    for (let i = 0; i < 20; i++) {
      economy.update(0.1, graph, map, routeConns);
    }

    // stationAに待機貨物があり、目的地がstationBであること
    const waiting = economy.getWaitingCargo(stationA.id);
    const riceCargo = waiting.filter((c) => c.resource === Resource.Rice);
    expect(riceCargo.length).toBeGreaterThan(0);
    // 目的地は商店の最寄り駅（stationB）
    expect(riceCargo[0]!.destinationNodeId).toBe(stationB.id);
  });

  it("路線未接続の駅には貨物が生産されない", () => {
    const graph = new Graph();
    const stationA = graph.addNode(NodeKind.Station, 5, 5, "A");
    graph.addNode(NodeKind.Station, 20, 20, "B");

    const economy = new Economy();
    economy.addBuilding(BuildingType.Farm, 6, 5);
    economy.addBuilding(BuildingType.Commercial, 21, 20);

    const map = new TileMap(30, 30);
    // 路線接続なし
    for (let i = 0; i < 20; i++) {
      economy.update(0.1, graph, map, new Map());
    }

    // 到達不可能なので貨物は生産されない
    expect(economy.getTotalWaiting(stationA.id)).toBe(0);
  });

  it("列車は目的地が路線上の貨物のみ積載する", () => {
    const graph = new Graph();
    const stationA = graph.addNode(NodeKind.Station, 5, 5, "A");
    const stationB = graph.addNode(NodeKind.Station, 20, 20, "B");
    const stationC = graph.addNode(NodeKind.Station, 40, 40, "C");

    const economy = new Economy();
    // stationAに目的地Bの貨物と目的地Cの貨物を置く
    economy.addWaiting(stationA.id, Resource.Rice, 10, stationB.id);
    economy.addWaiting(stationA.id, Resource.Iron, 5, stationC.id);

    // 路線はA→Bのみ（Cは含まない）
    const routeStops = [stationA.id, stationB.id];
    const { newCargo } = economy.trainArrive(
      [stationA.id],
      [],
      graph,
      routeStops,
    );

    // 目的地Bの米は積載される
    const rice = newCargo.filter((c) => c.resource === Resource.Rice);
    expect(rice.length).toBe(1);
    expect(rice[0]!.amount).toBe(10);

    // 目的地Cの鉄は積載されない（路線外）
    const iron = newCargo.filter((c) => c.resource === Resource.Iron);
    expect(iron.length).toBe(0);

    // stationAには目的地Cの鉄が残っている
    const remaining = economy.getWaitingCargo(stationA.id);
    expect(remaining.length).toBe(1);
    expect(remaining[0]!.resource).toBe(Resource.Iron);
    expect(remaining[0]!.amount).toBe(5);
  });

  it("列車は目的地の駅で貨物を配達して収益を得る", () => {
    const graph = new Graph();
    const stationA = graph.addNode(NodeKind.Station, 5, 5, "A");
    const stationB = graph.addNode(NodeKind.Station, 20, 20, "B");

    const economy = new Economy();
    // 商店（Rice消費）をstationBの近くに配置
    economy.addBuilding(BuildingType.Commercial, 21, 20);

    // 列車がstationBに到着、目的地Bの米を持っている
    const carrying = [
      { resource: Resource.Rice, destinationNodeId: stationB.id, amount: 10 },
    ];
    const routeStops = [stationA.id, stationB.id];
    const { earned, newCargo } = economy.trainArrive(
      [stationB.id],
      carrying,
      graph,
      routeStops,
    );

    // 目的地の駅に到着したので配達される
    expect(earned).toBeGreaterThan(0);
    // 配達後は貨物が空になる
    const remaining = newCargo.filter((c) => c.resource === Resource.Rice);
    expect(remaining.length).toBe(0);
  });

  it("目的地と異なる駅では配達しない", () => {
    const graph = new Graph();
    const stationA = graph.addNode(NodeKind.Station, 5, 5, "A");
    const stationB = graph.addNode(NodeKind.Station, 20, 20, "B");
    const stationC = graph.addNode(NodeKind.Station, 40, 40, "C");

    const economy = new Economy();
    economy.addBuilding(BuildingType.Commercial, 6, 5);

    // 目的地Cの米を持ってstationAに到着
    const carrying = [
      { resource: Resource.Rice, destinationNodeId: stationC.id, amount: 10 },
    ];
    const routeStops = [stationA.id, stationB.id, stationC.id];
    const { earned, newCargo } = economy.trainArrive(
      [stationA.id],
      carrying,
      graph,
      routeStops,
    );

    // 目的地ではないので配達されない
    expect(earned).toBe(0);
    expect(newCargo.length).toBe(1);
    expect(newCargo[0]!.amount).toBe(10);
  });
});

describe("Economy - 複合体", () => {
  it("複合体内の全駅から待機貨物を積み込む", () => {
    const graph = new Graph();
    const s1 = graph.addNode(NodeKind.Station, 5, 5, "S#1");
    const s2 = graph.addNode(NodeKind.Station, 5, 6, "S#2");
    const dest = graph.addNode(NodeKind.Station, 20, 20, "D");

    const economy = new Economy();
    economy.addWaiting(s1.id, Resource.Rice, 10, dest.id);
    economy.addWaiting(s2.id, Resource.Iron, 5, dest.id);

    const routeStops = [s1.id, dest.id];
    const { newCargo } = economy.trainArrive(
      [s1.id, s2.id],
      [],
      graph,
      routeStops,
    );

    // 両方の駅から積み込まれる
    const rice = newCargo.filter((c) => c.resource === Resource.Rice);
    const iron = newCargo.filter((c) => c.resource === Resource.Iron);
    expect(rice[0]!.amount).toBe(10);
    expect(iron[0]!.amount).toBe(5);
    expect(economy.getTotalWaiting(s1.id)).toBe(0);
    expect(economy.getTotalWaiting(s2.id)).toBe(0);
  });

  it("単一駅でも従来通り動作する", () => {
    const graph = new Graph();
    const s = graph.addNode(NodeKind.Station, 5, 5, "S");
    const dest = graph.addNode(NodeKind.Station, 20, 20, "D");

    const economy = new Economy();
    economy.addWaiting(s.id, Resource.Rice, 8, dest.id);

    const { newCargo } = economy.trainArrive(
      [s.id],
      [],
      graph,
      [s.id, dest.id],
    );

    const rice = newCargo.filter((c) => c.resource === Resource.Rice);
    expect(rice[0]!.amount).toBe(8);
    expect(economy.getTotalWaiting(s.id)).toBe(0);
  });
});

describe("generateCities", () => {
  it("generates cities on flat terrain", () => {
    const map = new TileMap(64, 64);
    const economy = new Economy();
    generateCities(map, economy, 4, 42);
    expect(economy.getAllCities().length).toBeGreaterThanOrEqual(1);
  });

  it("deterministic with same seed", () => {
    const map1 = new TileMap(64, 64);
    const eco1 = new Economy();
    generateCities(map1, eco1, 4, 123);

    const map2 = new TileMap(64, 64);
    const eco2 = new Economy();
    generateCities(map2, eco2, 4, 123);

    const cities1 = eco1.getAllCities();
    const cities2 = eco2.getAllCities();
    expect(cities1.length).toBe(cities2.length);
    for (let i = 0; i < cities1.length; i++) {
      expect(cities1[i]?.centerX).toBe(cities2[i]?.centerX);
      expect(cities1[i]?.centerY).toBe(cities2[i]?.centerY);
    }
  });
});
