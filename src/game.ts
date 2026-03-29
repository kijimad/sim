import { Camera } from "./camera.js";
import { BUILDING_TYPE_NAMES, Economy, RESOURCE_NAMES, Resource, generateCities } from "./economy.js";
import { Graph, NODE_KIND_NAMES, NodeKind } from "./graph.js";
import { InputHandler } from "./input.js";
import { findPath } from "./pathfinding.js";
import { Renderer, TILE_SIZE } from "./renderer.js";
import { ROUTE_MODE_NAMES, RouteMode, Simulation, TrainState } from "./simulation.js";
import { generateTerrain } from "./terrain.js";
import { TileMap } from "./tilemap.js";
import { TERRAIN_NAMES, Terrain } from "./types.js";

export const ToolMode = {
  Inspect: "inspect",
  Rail: "rail",
  Route: "route",
} as const;

export type ToolMode = (typeof ToolMode)[keyof typeof ToolMode];

export const RailSubMode = {
  Station: "station",
} as const;

export type RailSubMode = (typeof RailSubMode)[keyof typeof RailSubMode];

const MAP_SIZE = 256;

export interface GameConfig {
  readonly seed: number;
  readonly debug: boolean;
}

export function parseConfigFromURL(): GameConfig {
  const params = new URLSearchParams(window.location.search);
  const seedParam = params.get("seed");
  const seed = seedParam !== null ? Number(seedParam) : Date.now();
  const debug = params.get("debug") === "1" || params.get("debug") === "true";
  return { seed: Number.isFinite(seed) ? seed : Date.now(), debug };
}

export interface RouteInfo {
  readonly id: number;
  readonly name: string;
  readonly stops: readonly number[];
  readonly mode: string;
  readonly trainCount: number;
}

export interface TrainInfo {
  readonly id: number;
  readonly routeId: number;
  readonly state: string;
  readonly targetStop: string;
  readonly cargoTotal: number;
  readonly cargoDetail: readonly { resource: string; amount: number }[];
}

export interface CityInfo {
  readonly name: string;
  readonly population: number;
}

export interface InspectInfo {
  readonly type: "none" | "node" | "city" | "terrain" | "edge";
  readonly edgeId?: number;
  readonly edgeFrom?: string;
  readonly edgeTo?: string;
  readonly edgeLength?: number;
  readonly nodeId?: number;
  readonly nodeName?: string;
  readonly nodeKind?: string;
  readonly nodeCapacity?: number;
  readonly nodeTrains?: number;
  readonly nodeTrainsWaiting?: number;
  readonly nodeWaiting?: number;
  readonly waitingDetail?: readonly { resource: string; amount: number }[];
  readonly cityName?: string;
  readonly cityPopulation?: number;
  readonly cityProduces?: readonly string[];
  readonly cityConsumes?: readonly string[];
  readonly terrain?: string;
  readonly tileX?: number;
  readonly tileY?: number;
  readonly buildingType?: string;
  readonly buildingPop?: number;
  readonly buildingProduces?: string;
  readonly buildingConsumes?: string;
}

export interface GameSnapshot {
  readonly toolMode: ToolMode;
  readonly railSubMode: RailSubMode;
  readonly selectedNodeId: number | null;
  readonly routeStops: readonly number[];
  readonly editingRouteId: number | null;
  readonly lastRouteId: number | null;
  readonly trainCount: number;
  readonly routeCount: number;
  readonly money: number;
  readonly cities: readonly CityInfo[];
  readonly routes: readonly RouteInfo[];
  readonly totalPopulation: number;
  readonly trains: readonly TrainInfo[];
  readonly inspect: InspectInfo;
  readonly debug: boolean;
  readonly seed: number;
}

export type GameEventListener = () => void;

export class Game {
  private readonly config: GameConfig;
  private readonly renderer: Renderer;
  private readonly canvas: HTMLCanvasElement;
  private readonly graph: Graph;
  private readonly sim: Simulation;
  private readonly economy: Economy;
  private readonly map: TileMap;
  private readonly camera: Camera;

  private toolMode: ToolMode = ToolMode.Inspect;
  private railSubMode: RailSubMode = RailSubMode.Station;
  private selectedNodeId: number | null = null;
  private routeStops: number[] = [];
  private lastRouteId: number | null = null;
  private editingRouteId: number | null = null;
  private stationCount = 0;
  private inspectTileX: number | null = null;
  private inspectTileY: number | null = null;

  private listeners: GameEventListener[] = [];
  private lastTime = performance.now();
  private animFrameId = 0;
  private cachedSnapshot: GameSnapshot | null = null;

  constructor(canvas: HTMLCanvasElement, ctx: CanvasRenderingContext2D, config: GameConfig) {
    this.config = config;
    this.canvas = canvas;
    this.renderer = new Renderer(ctx, canvas);

    this.graph = new Graph();
    this.sim = new Simulation();
    this.economy = new Economy();

    if (config.debug) {
      this.map = new TileMap(64, 64);
      this.camera = new Camera((64 * TILE_SIZE) / 2, (64 * TILE_SIZE) / 2);
      this.setupDebugWorld();
    } else {
      this.map = new TileMap(MAP_SIZE, MAP_SIZE);
      this.camera = new Camera((MAP_SIZE * TILE_SIZE) / 2, (MAP_SIZE * TILE_SIZE) / 2);
      generateTerrain(this.map, { seed: config.seed });
      generateCities(this.map, this.economy, 8, config.seed);
    }

    // 列車到着を経済システムに接続する
    this.sim.onTrainArrive = (train, nodeId): void => {
      const route = this.sim.getRoute(train.routeId);
      const otherStops = route?.stops.filter((s) => s !== nodeId) ?? [];
      const demanded = this.economy.getDemandedResources(otherStops, this.graph);
      const { newCargo } = this.economy.trainArrive(nodeId, train.cargo, this.graph, demanded);
      train.cargo = newCargo;
    };

    new InputHandler(canvas, this.camera, {
      requestRender: (): void => { /* continuous */ },
      onTileClick: (tx: number, ty: number): void => { this.onTileClick(tx, ty); },
      onKeyPress: (key: string): void => { this.onKeyPress(key); },
    });
  }

  // --- 購読 ---

  onChange(listener: GameEventListener): () => void {
    this.listeners.push(listener);
    return () => {
      this.listeners = this.listeners.filter((l) => l !== listener);
    };
  }

  private notify(): void {
    this.cachedSnapshot = null;
    for (const l of this.listeners) {
      l();
    }
  }

  getSnapshot(): GameSnapshot {
    this.cachedSnapshot ??= {
      toolMode: this.toolMode,
      railSubMode: this.railSubMode,
      selectedNodeId: this.selectedNodeId,
      routeStops: [...this.routeStops],
      editingRouteId: this.editingRouteId,
      lastRouteId: this.lastRouteId,
      trainCount: this.sim.trainCount,
      routeCount: this.sim.getAllRoutes().length,
      money: this.economy.money,
      totalPopulation: this.economy.getTotalPopulation(),
      cities: this.economy.getAllCities().map((c) => ({
        name: c.name,
        population: this.economy.getCityPopulation(c.id),
      })),
      routes: this.sim.getAllRoutes().map((r) => ({
        id: r.id,
        name: r.name,
        stops: r.stops,
        mode: ROUTE_MODE_NAMES[r.mode],
        trainCount: this.sim.getRouteTrainCount(r.id),
      })),
      trains: this.sim.getAllTrains().map((t) => {
        const detail: { resource: string; amount: number }[] = [];
        let total = 0;
        for (const [res, amt] of t.cargo) {
          const r = res as Resource;
          detail.push({ resource: RESOURCE_NAMES[r], amount: amt });
          total += amt;
        }
        const route = this.sim.getRoute(t.routeId);
        const targetNodeId = route?.stops[t.routeStopIndex];
        const targetNode = targetNodeId !== undefined ? this.graph.getNode(targetNodeId) : undefined;
        return {
          id: t.id,
          routeId: t.routeId,
          state: t.state === TrainState.AtNode ? "At Node" : "On Edge",
          targetStop: targetNode?.name ?? `#${String(targetNodeId ?? "?")}`,
          cargoTotal: total,
          cargoDetail: detail,
        };
      }),
      inspect: this.buildInspectInfo(),
      debug: this.config.debug,
      seed: this.config.seed,
    };
    return this.cachedSnapshot;
  }

  private buildInspectInfo(): InspectInfo {
    const tx = this.inspectTileX;
    const ty = this.inspectTileY;
    if (tx === null || ty === null || !this.map.inBounds(tx, ty)) {
      return { type: "none" };
    }

    const tile = this.map.get(tx, ty);
    const base: InspectInfo = {
      type: "terrain",
      tileX: tx,
      tileY: ty,
      terrain: TERRAIN_NAMES[tile.terrain],
    };

    // ノードを確認する（建物より優先）
    const node = this.graph.getNodeAt(tx, ty);
    if (node !== undefined) {
      const waitingDetail: { resource: string; amount: number }[] = [];
      const allResources = [Resource.Passengers, Resource.Rice, Resource.Iron, Resource.Goods] as const;
      for (const r of allResources) {
        const amount = this.economy.getWaiting(node.id, r);
        if (amount > 0) {
          waitingDetail.push({ resource: RESOURCE_NAMES[r], amount });
        }
      }
      return {
        ...base,
        type: "node" as const,
        nodeId: node.id,
        nodeName: node.name,
        nodeKind: NODE_KIND_NAMES[node.kind],
        nodeCapacity: node.capacity,
        nodeTrains: this.sim.blocks.getNodeSlotCount(node.id, this.graph),
        nodeTrainsWaiting: this.sim.blocks.getNodeWaitCount(node.id, this.graph),
        nodeWaiting: this.economy.getTotalWaiting(node.id),
        waitingDetail,
      };
    }

    // 建物を確認する
    const building = this.economy.getBuildingAt(tx, ty);
    if (building !== undefined) {
      return {
        ...base,
        buildingType: BUILDING_TYPE_NAMES[building.type],
        buildingPop: building.population,
        ...(building.produces !== null ? { buildingProduces: RESOURCE_NAMES[building.produces] } : {}),
        ...(building.consumes !== null ? { buildingConsumes: RESOURCE_NAMES[building.consumes] } : {}),
      };
    }

    // 都市を確認する
    const city = this.economy.getCityAt(tx, ty);
    if (city !== undefined) {
      const resources = this.economy.getCityResources(city.id);
      return {
        ...base,
        type: "city" as const,
        cityName: city.name,
        cityPopulation: this.economy.getCityPopulation(city.id),
        cityProduces: [...resources.produces].map((r) => RESOURCE_NAMES[r]),
        cityConsumes: [...resources.consumes].map((r) => RESOURCE_NAMES[r]),
      };
    }

    // エッジを確認する
    const closest = this.graph.findClosestEdgePoint(tx, ty);
    if (closest !== null && closest.distance <= 1) {
      const fromNode = this.graph.getNode(closest.edge.fromId);
      const toNode = this.graph.getNode(closest.edge.toId);
      return {
        ...base,
        type: "edge" as const,
        edgeId: closest.edge.id,
        edgeFrom: fromNode?.name ?? String(closest.edge.fromId),
        edgeTo: toNode?.name ?? String(closest.edge.toId),
        edgeLength: closest.edge.path.length,
      };
    }

    return base;
  }

  // --- ライフサイクル ---

  start(): void {
    this.resize();
    this.lastTime = performance.now();
    const loop = (now: number): void => {
      const dt = Math.min((now - this.lastTime) / 1000, 0.1);
      this.lastTime = now;

      this.sim.update(dt, this.graph);
      this.economy.update(dt, this.graph, this.map);


      this.renderer.render(this.map, this.camera);
      this.renderCities();
      this.renderer.renderGraph(
        this.graph,
        this.camera,
        this.selectedNodeId,
        (nodeId) => ({
          trainCount: this.sim.getNodeTrainCount(nodeId),
          waitingCargo: this.economy.getTotalWaiting(nodeId),
        }),
      );
      this.renderer.renderTrains(
        this.sim.getTrainPositions(this.graph),
        this.camera,
      );

      this.animFrameId = requestAnimationFrame(loop);
    };
    this.animFrameId = requestAnimationFrame(loop);
  }

  /**
   * デバッグ用ワールド: 固定配置のシンプルなマップ
   *
   *        C(30,10)
   *       /
   * A(10,20) --- B(30,20) --- D(50,20)
   *       \
   *        E(30,30)
   */
  private setupDebugWorld(): void {
    const a = this.graph.addNode(NodeKind.Station, 10, 20, "A");
    const b = this.graph.addNode(NodeKind.Station, 30, 20, "B");
    const c = this.graph.addNode(NodeKind.Station, 30, 10, "C");
    const d = this.graph.addNode(NodeKind.Station, 50, 20, "D");
    const e = this.graph.addNode(NodeKind.Station, 30, 30, "E");

    this.connectNodes(a.id, b.id);
    this.connectNodes(b.id, c.id);
    this.connectNodes(b.id, d.id);
    this.connectNodes(b.id, e.id);

    // A-D間のShuttle路線 + 列車2台
    const route1 = this.sim.addRoute([a.id, d.id], RouteMode.Shuttle, "A-D Line");
    this.sim.addTrain(route1.id, this.graph);
    this.sim.addTrain(route1.id, this.graph);

    // C-A間のShuttle路線 + 列車1台（Cからスポーン）
    const route2 = this.sim.addRoute([c.id, a.id], RouteMode.Shuttle, "C-A Line");
    this.sim.addTrain(route2.id, this.graph);

    this.lastRouteId = route1.id;

    // カメラをBに合わせる
    this.camera.x = b.tileX * TILE_SIZE;
    this.camera.y = b.tileY * TILE_SIZE;
  }


  private renderCities(): void {
    this.renderer.renderBuildings(this.economy.getAllBuildings(), this.camera);
    const cities = this.economy.getAllCities().map((c) => ({
      tileX: c.centerX,
      tileY: c.centerY,
      name: c.name,
      radius: c.radius,
    }));
    this.renderer.renderCities(cities, this.camera);
  }

  stop(): void {
    cancelAnimationFrame(this.animFrameId);
  }

  resize(): void {
    const dpr = window.devicePixelRatio;
    this.canvas.width = window.innerWidth * dpr;
    this.canvas.height = window.innerHeight * dpr;
    this.canvas.style.width = `${String(window.innerWidth)}px`;
    this.canvas.style.height = `${String(window.innerHeight)}px`;
  }

  // --- アクション（UIから呼び出される） ---

  setToolMode(mode: ToolMode): void {
    this.toolMode = mode;
    this.routeStops = [];
    this.selectedNodeId = null;
    this.notify();
  }

  setRailSubMode(mode: RailSubMode): void {
    this.railSubMode = mode;
    this.notify();
  }

  addTrain(routeId?: number): void {
    const id = routeId ?? this.lastRouteId;
    if (id === null) return;
    this.sim.addTrain(id, this.graph);
    this.notify();
  }

  selectRoute(routeId: number): void {
    this.lastRouteId = routeId;
    this.notify();
  }

  confirmRoute(mode: RouteMode): void {
    if (this.routeStops.length < 2) return;

    if (this.editingRouteId !== null) {
      // 既存路線を更新する
      this.sim.updateRouteStops(this.editingRouteId, this.routeStops);
      this.lastRouteId = this.editingRouteId;
      this.editingRouteId = null;
    } else {
      const routeName = this.generateRouteName(this.routeStops);
      const route = this.sim.addRoute(this.routeStops, mode, routeName);
      this.lastRouteId = route.id;
    }

    this.routeStops = [];
    this.selectedNodeId = null;
    this.notify();
  }

  editRoute(routeId: number): void {
    const route = this.sim.getRoute(routeId);
    if (route === undefined) return;
    this.toolMode = ToolMode.Route;
    this.editingRouteId = routeId;
    this.routeStops = [...route.stops];
    this.selectedNodeId = null;
    this.notify();
  }

  removeRoute(routeId: number): void {
    // まずこの路線の全列車を削除する
    for (const train of this.sim.getAllTrains()) {
      if (train.routeId === routeId) {
        this.sim.removeTrain(train.id);
      }
    }
    this.sim.removeRoute(routeId);
    if (this.lastRouteId === routeId) {
      this.lastRouteId = null;
    }
    this.notify();
  }

  removeTrainFromRoute(routeId: number): void {
    // この路線の最後の列車を削除する
    const trains = this.sim.getAllTrains().filter((t) => t.routeId === routeId);
    const last = trains[trains.length - 1];
    if (last !== undefined) {
      this.sim.removeTrain(last.id);
    }
    this.notify();
  }

  removeEdge(edgeId: number): void {
    this.graph.removeEdge(edgeId);
    this.notify();
  }

  setNodeCapacity(nodeId: number, capacity: number): void {
    const node = this.graph.getNode(nodeId);
    if (node === undefined) return;
    node.capacity = Math.max(1, capacity);
    this.notify();
  }

  removeNode(nodeId: number): void {
    const result = this.graph.removeNode(nodeId);
    if (result.mergedEdge !== undefined && result.oldEdgeIds !== undefined && result.splitPathIndex !== undefined) {
      this.sim.handleEdgeMerge(result.oldEdgeIds, result.mergedEdge.id, result.splitPathIndex, this.graph);
    }
    this.inspectTileX = null;
    this.inspectTileY = null;
    this.notify();
  }

  renameNode(nodeId: number, name: string): void {
    const node = this.graph.getNode(nodeId);
    if (node !== undefined) {
      node.name = name;
    }
    this.notify();
  }

  renameRoute(routeId: number, name: string): void {
    this.sim.renameRoute(routeId, name);
    this.notify();
  }

  removeRouteStop(index: number): void {
    if (index < 0 || index >= this.routeStops.length) return;
    this.routeStops.splice(index, 1);
    this.notify();
  }

  cancelRoute(): void {
    this.routeStops = [];
    this.editingRouteId = null;
    this.selectedNodeId = null;
    this.notify();
  }

  // --- 入力処理 ---

  private onTileClick(tileX: number, tileY: number): void {
    if (!this.map.inBounds(tileX, tileY)) return;

    // 常にインスペクト対象を更新する
    this.inspectTileX = tileX;
    this.inspectTileY = tileY;

    if (this.toolMode === ToolMode.Inspect) {
      this.notify();
      return;
    }

    if (this.toolMode === ToolMode.Route) {
      this.handleRouteClick(tileX, tileY);
      return;
    }

    this.handleBuildClick(tileX, tileY);
  }

  private onKeyPress(key: string): void {
    switch (key) {
      case "`":
        this.setToolMode(ToolMode.Inspect);
        break;
      case "1":
        this.setToolMode(ToolMode.Rail);
        this.railSubMode = RailSubMode.Station;
        break;
      case "2":
        this.setToolMode(ToolMode.Route);
        break;
      case "t":
      case "T":
        this.addTrain();
        break;
      case "Escape":
        if (this.toolMode === ToolMode.Route) {
          this.cancelRoute();
        } else {
          this.selectedNodeId = null;
        }
        this.notify();
        break;
    }
  }

  private handleRouteClick(tileX: number, tileY: number): void {
    const node = this.graph.getNodeAt(tileX, tileY);
    if (node === undefined) return;

    this.routeStops.push(node.id);
    this.selectedNodeId = node.id;
    this.notify();
  }

  private handleBuildClick(tileX: number, tileY: number): void {
    const existing = this.graph.getNodeAt(tileX, tileY);

    if (existing !== undefined) {
      if (this.selectedNodeId === null) {
        this.selectedNodeId = existing.id;
      } else if (this.selectedNodeId === existing.id) {
        this.selectedNodeId = null;
      } else {
        this.connectNodes(this.selectedNodeId, existing.id);
        this.selectedNodeId = null;
      }
    } else {
      if (this.map.get(tileX, tileY).terrain === Terrain.Water) return;

      // ノード未選択で既存エッジの近くをクリックした場合、エッジを分割する
      if (this.selectedNodeId === null) {
        if (this.trySplitEdge(tileX, tileY)) return;
      }

      const { kind, name } = this.makeNodeInfo(tileX, tileY);
      const node = this.graph.addNode(kind, tileX, tileY, name);

      if (this.selectedNodeId !== null) {
        this.connectNodes(this.selectedNodeId, node.id);
        this.selectedNodeId = null;
      }
    }
    this.notify();
  }

  private makeNodeInfo(tileX: number, tileY: number): { kind: NodeKind; name: string } {
    this.stationCount++;
    const cityName = this.findNearestCityName(tileX, tileY);
    const name = cityName ?? `Station ${String(this.stationCount)}`;
    return { kind: NodeKind.Station, name };
  }

  /** 停車駅名から路線名を自動生成する */
  private generateRouteName(stops: readonly number[]): string {
    const first = stops[0];
    const last = stops[stops.length - 1];
    if (first === undefined || last === undefined) return "Route";
    const firstName = this.graph.getNode(first)?.name ?? String(first);
    const lastName = this.graph.getNode(last)?.name ?? String(last);
    return `${firstName} - ${lastName}`;
  }

  /** 指定座標に最も近い都市の名前を返す */
  private findNearestCityName(tileX: number, tileY: number): string | null {
    let bestName: string | null = null;
    let bestDist = Infinity;
    for (const city of this.economy.getAllCities()) {
      const dx = city.centerX - tileX;
      const dy = city.centerY - tileY;
      const dist = dx * dx + dy * dy;
      if (dist < bestDist) {
        bestDist = dist;
        bestName = city.name;
      }
    }
    // 30タイル以内なら地名を使う
    if (bestDist > 900) return null;
    return bestName;
  }

  private connectNodes(fromId: number, toId: number): void {
    const fromNode = this.graph.getNode(fromId);
    const toNode = this.graph.getNode(toId);
    if (fromNode === undefined || toNode === undefined) return;
    if (this.graph.getEdgesBetween(fromId, toId) !== undefined) return;

    const path = findPath(this.map, fromNode.tileX, fromNode.tileY, toNode.tileX, toNode.tileY);
    if (path !== null) {
      this.graph.addEdge(fromId, toId, path);
    }
  }

  private trySplitEdge(tileX: number, tileY: number): boolean {
    const closest = this.graph.findClosestEdgePoint(tileX, tileY);
    if (closest === null || closest.distance > 1) return false;

    const pathPoint = closest.edge.path[closest.pathIndex];
    if (pathPoint === undefined) return false;

    const { kind, name } = this.makeNodeInfo(pathPoint.x, pathPoint.y);
    const node = this.graph.addNode(kind, pathPoint.x, pathPoint.y, name);
    const oldEdgeId = closest.edge.id;
    const result = this.graph.splitEdge(oldEdgeId, node, closest.pathIndex);
    if (result !== null) {
      this.sim.handleEdgeSplit(oldEdgeId, result.edge1, result.edge2, closest.pathIndex, this.graph);
    }
    this.notify();
    return true;
  }
}
