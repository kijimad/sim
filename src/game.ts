import { Camera } from "./camera.js";
import { BUILDING_TYPE_NAMES, BuildingType, Economy, RESOURCE_NAMES, Resource, generateCities } from "./economy.js";
import type { GraphNode } from "./graph.js";
import { Graph, NODE_KIND_NAMES, NodeKind, hasNonPerpendicularOverlap } from "./graph.js";
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
  readonly stopNames: readonly string[];
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
  readonly waitingDetail?: readonly { resource: string; destination: string; amount: number }[];
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

export interface Toast {
  readonly id: number;
  readonly message: string;
  readonly time: number;
}

export interface GameSnapshot {
  readonly toolMode: ToolMode;
  readonly railSubMode: RailSubMode;
  readonly selectedNodeId: number | null;
  readonly railWaypointCount: number;
  readonly routeStops: readonly number[];
  readonly routeStopNames: readonly string[];
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
  readonly toasts: readonly Toast[];
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
  /** レール建設中のウェイポイント（一時的な経由点） */
  private railWaypoints: { x: number; y: number }[] = [];
  private selectedNodeId: number | null = null;
  private routeStops: number[] = [];
  private lastRouteId: number | null = null;
  private editingRouteId: number | null = null;
  private stationCount = 0;
  private inspectTileX: number | null = null;
  private inspectTileY: number | null = null;

  private toasts: Toast[] = [];
  private nextToastId = 1;
  private static readonly TOAST_DURATION = 3.0;
  private hoverTileX: number | null = null;
  private hoverTileY: number | null = null;

  /** フローティング収益テキスト */
  private floatingTexts: { x: number; y: number; text: string; time: number }[] = [];

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

    // 列車到着を経済システムに接続する（複合体単位で貨物を扱う）
    this.sim.onTrainArrive = (train, nodeId): void => {
      const route = this.sim.getRoute(train.routeId);
      const routeStops = route?.stops ?? [];
      const complexIds = this.graph.getStationComplex(nodeId).map((n) => n.id);
      const { earned, newCargo } = this.economy.trainArrive(complexIds, train.cargo, this.graph, routeStops);
      train.cargo = newCargo;

      // 収益が発生したらフローティングテキストを表示する
      if (earned > 0) {
        const node = this.graph.getNode(nodeId);
        if (node !== undefined) {
          this.floatingTexts.push({
            x: node.tileX,
            y: node.tileY,
            text: `+$${String(earned)}`,
            time: 2.0,
          });
        }
      }
    };

    // 経路到達不能の通知（同じ路線の連続通知を抑制する）
    const notifiedRoutes = new Set<number>();
    this.sim.onRouteBlocked = (train): void => {
      if (notifiedRoutes.has(train.routeId)) return;
      notifiedRoutes.add(train.routeId);
      const route = this.sim.getRoute(train.routeId);
      const name = route?.name ?? `Route ${String(train.routeId)}`;
      this.showToast(`${name}: 経路が到達不能です`);
      // 一定時間後に再通知可能にする
      setTimeout(() => { notifiedRoutes.delete(train.routeId); }, 10000);
    };

    new InputHandler(canvas, this.camera, {
      requestRender: (): void => { /* continuous */ },
      onTileClick: (tx: number, ty: number): void => { this.onTileClick(tx, ty); },
      onTileHover: (tx: number, ty: number): void => { this.hoverTileX = tx; this.hoverTileY = ty; },
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

  private showToast(message: string): void {
    this.toasts.push({ id: this.nextToastId++, message, time: Game.TOAST_DURATION });
    this.notify();
  }

  /** トーストの残り時間を減らし、期限切れを除去する */
  private updateToasts(dt: number): void {
    let changed = false;
    for (let i = this.toasts.length - 1; i >= 0; i--) {
      const t = this.toasts[i];
      if (t === undefined) continue;
      // time は readonly なので新しいオブジェクトに差し替える
      const remaining = t.time - dt;
      if (remaining <= 0) {
        this.toasts.splice(i, 1);
        changed = true;
      } else {
        this.toasts[i] = { ...t, time: remaining };
      }
    }
    if (changed) {
      this.cachedSnapshot = null;
    }
  }

  /** フローティングテキストの残り時間を減らし、期限切れを除去する */
  private updateFloatingTexts(dt: number): void {
    for (let i = this.floatingTexts.length - 1; i >= 0; i--) {
      const ft = this.floatingTexts[i];
      if (ft === undefined) continue;
      ft.time -= dt;
      if (ft.time <= 0) {
        this.floatingTexts.splice(i, 1);
      }
    }
  }

  getSnapshot(): GameSnapshot {
    this.cachedSnapshot ??= {
      toolMode: this.toolMode,
      railSubMode: this.railSubMode,
      selectedNodeId: this.selectedNodeId,
      railWaypointCount: this.railWaypoints.length,
      routeStops: [...this.routeStops],
      routeStopNames: this.routeStops.map((sid) => this.graph.getNode(sid)?.name ?? `#${String(sid)}`),
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
        stopNames: r.stops.map((sid) => this.graph.getNode(sid)?.name ?? `#${String(sid)}`),
        mode: ROUTE_MODE_NAMES[r.mode],
        trainCount: this.sim.getRouteTrainCount(r.id),
      })),
      trains: this.sim.getAllTrains().map((t) => {
        const detail: { resource: string; amount: number }[] = [];
        let total = 0;
        for (const item of t.cargo) {
          const destNode = this.graph.getNode(item.destinationNodeId);
          const destName = destNode?.name ?? `#${String(item.destinationNodeId)}`;
          detail.push({ resource: `${RESOURCE_NAMES[item.resource]}→${destName}`, amount: item.amount });
          total += item.amount;
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
      toasts: [...this.toasts],
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
      // 複合体全体の情報を集計する
      const complex = this.graph.getStationComplex(node.id);
      // 複合体内の全待機貨物を目的地別に集計する
      const waitingDetail: { resource: string; destination: string; amount: number }[] = [];
      for (const cn of complex) {
        for (const item of this.economy.getWaitingCargo(cn.id)) {
          if (item.amount <= 0) continue;
          const destNode = this.graph.getNode(item.destinationNodeId);
          const destName = destNode?.name ?? `#${String(item.destinationNodeId)}`;
          // 同じ資源・同じ目的地のエントリを合算する
          const existing = waitingDetail.find(
            (w) => w.resource === RESOURCE_NAMES[item.resource] && w.destination === destName,
          );
          if (existing !== undefined) {
            existing.amount += item.amount;
          } else {
            waitingDetail.push({ resource: RESOURCE_NAMES[item.resource], destination: destName, amount: item.amount });
          }
        }
      }
      let complexTrains = 0;
      let complexTrainsWaiting = 0;
      let complexWaiting = 0;
      for (const cn of complex) {
        complexTrains += this.sim.blocks.getNodeSlotCount(cn.id, this.graph);
        complexTrainsWaiting += this.sim.blocks.getNodeWaitCount(cn.id, this.graph);
        complexWaiting += this.economy.getTotalWaiting(cn.id);
      }
      return {
        ...base,
        type: "node" as const,
        nodeId: node.id,
        nodeName: node.name,
        nodeKind: NODE_KIND_NAMES[node.kind],
        nodeCapacity: node.capacity,
        nodeTrains: complexTrains,
        nodeTrainsWaiting: complexTrainsWaiting,
        nodeWaiting: complexWaiting,
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

      this.updateToasts(dt);
      this.sim.update(dt, this.graph);
      this.economy.update(dt, this.graph, this.map, this.buildRouteConnections());

      // シミュレーション更新後にReactへ通知する
      this.notify();


      this.renderer.render(this.map, this.camera);
      this.renderCities();
      this.renderer.renderGraph(
        this.graph,
        this.camera,
        this.selectedNodeId,
        (nodeId) => {
          const complex = this.graph.getStationComplex(nodeId);
          let trainCount = 0;
          let waitingCargo = 0;
          for (const cn of complex) {
            trainCount += this.sim.getNodeTrainCount(cn.id);
            waitingCargo += this.economy.getTotalWaiting(cn.id);
          }
          return { trainCount, waitingCargo };
        },
      );
      this.renderer.renderTrains(
        this.sim.getTrainPositions(this.graph),
        this.camera,
      );

      // フローティング収益テキスト
      this.updateFloatingTexts(dt);
      this.renderer.renderFloatingTexts(this.floatingTexts, this.camera, 2.0);

      // ウェイポイント仮表示（A*パスのプレビュー + マウス位置まで延長）
      if (this.selectedNodeId !== null) {
        const origin = this.graph.getNode(this.selectedNodeId);
        if (origin !== undefined) {
          const points = [
            { x: origin.tileX, y: origin.tileY },
            ...this.railWaypoints,
          ];
          // マウス位置までの仮パスを追加
          const hoverPoints = this.hoverTileX !== null && this.hoverTileY !== null
            ? [...points, { x: this.hoverTileX, y: this.hoverTileY }]
            : points;
          const previewPath = this.buildPreviewPath(hoverPoints);
          this.renderer.renderWaypoints(points, previewPath, this.camera);
        }
      }

      this.animFrameId = requestAnimationFrame(loop);
    };
    this.animFrameId = requestAnimationFrame(loop);
  }

  /**
   * デバッグ用ワールド
   *
   * 田園(10,20) -------- 中央#1(30,20)
   *                      中央#2(30,21) --- 港町(50,21)
   *                     /（中央#1-#2 転線）
   *          中央連絡(28,30)
   *                     \
   * 鉱山口(10,40) ---- 山手#1(30,40)
   *                    山手#2(30,41) --- 工業団地(50,41) --- 南港(50,50)
   *                    （山手#1-#2 転線）
   */
  private setupDebugWorld(): void {
    // メインライン: 田園 - 中央複合体 - 港町
    const a = this.graph.addNode(NodeKind.Station, 10, 20, "田園");
    const b1 = this.graph.addNode(NodeKind.Station, 30, 20, "中央 #1");
    const b2 = this.graph.addNode(NodeKind.Station, 30, 21, "中央 #2"); // #1の下（垂直）
    const e = this.graph.addNode(NodeKind.Station, 50, 21, "港町");

    this.connectNodes(a.id, b1.id);
    this.connectNodes(b2.id, e.id);

    // 支線: 鉱山口 - 山手複合体 - 工業団地 - 南港
    const c = this.graph.addNode(NodeKind.Station, 10, 40, "鉱山口");
    const d1 = this.graph.addNode(NodeKind.Station, 30, 40, "山手 #1");
    const d2 = this.graph.addNode(NodeKind.Station, 30, 41, "山手 #2"); // #1の下（垂直）
    const f = this.graph.addNode(NodeKind.Station, 50, 41, "工業団地");
    const g = this.graph.addNode(NodeKind.Station, 50, 50, "南港");

    this.connectNodes(c.id, d1.id);
    this.connectNodes(d2.id, f.id);
    this.connectNodes(f.id, g.id);

    // 縦断線: 中央#2 - 中央連絡 - 山手#1（左側にS字で結ぶ）
    const mid = this.graph.addNode(NodeKind.Station, 28, 30, "中央連絡");
    // b2(30,21)→左に出て→下へ→mid(28,30)
    this.connectNodes(b2.id, mid.id, [{ x: 29, y: 21 }, { x: 28, y: 21 }, { x: 28, y: 29 }]);
    // mid(28,30)→下→右→下→d1(30,40)に右から入る
    //   中(28,30)
    //   |
    //   (28,39)--(31,39)
    //                |
    //   山(30,40)-(31,40)
    this.connectNodes(mid.id, d1.id, [{ x: 28, y: 31 }, { x: 28, y: 39 }, { x: 31, y: 39 }, { x: 31, y: 40 }]);

    // 田園〜港町線: 中央#1に停車（乗り換え可能）
    const route1 = this.sim.addRoute([a.id, b1.id, e.id], RouteMode.Shuttle, "田園〜港町線");
    this.sim.addTrain(route1.id, this.graph);
    this.sim.addTrain(route1.id, this.graph);

    // 鉱山口〜南港線: 山手#2に停車（乗り換え可能）
    const route2 = this.sim.addRoute([c.id, d1.id, g.id], RouteMode.Shuttle, "鉱山口〜南港線");
    this.sim.addTrain(route2.id, this.graph);

    // 縦断線: 中央#2 - 中央連絡 - 山手#1
    const route3 = this.sim.addRoute([b2.id, mid.id, d1.id], RouteMode.Shuttle, "縦断線");
    this.sim.addTrain(route3.id, this.graph);

    this.lastRouteId = route1.id;

    // 都市と建物を配置（経済サイクルの確認用）
    this.economy.addCity("田園町", 10, 20, 5);
    this.economy.addCity("港町", 50, 21, 5);
    this.economy.addCity("鉱山町", 10, 40, 5);

    // 田園の近くに農場（米を生産）、港町の近くに商業施設（米を消費）
    this.economy.addBuilding(BuildingType.Farm, 8, 20);
    this.economy.addBuilding(BuildingType.Commercial, 48, 21);
    // 鉱山口の近くに鉱山（鉄を生産）、南港の近くに工場（鉄を消費）
    this.economy.addBuilding(BuildingType.Mine, 8, 40);
    this.economy.addBuilding(BuildingType.Factory, 48, 50);

    // B複合体の両駅に待機貨物を設定する（目的地付き）
    this.economy.addWaiting(b1.id, Resource.Passengers, 5, e.id);
    this.economy.addWaiting(b2.id, Resource.Rice, 3, e.id);
    // D複合体にも
    this.economy.addWaiting(d1.id, Resource.Iron, 4, g.id);

    // カメラをB複合体に合わせる
    this.camera.x = b1.tileX * TILE_SIZE;
    this.camera.y = b1.tileY * TILE_SIZE;
  }


  /** 各駅から路線経由（乗り換え・複合体経由含む）で到達可能な駅の一覧を構築する */
  private buildRouteConnections(): Map<number, number[]> {
    // 同一路線 + 同一複合体の直接接続を構築する
    const directNeighbors = new Map<number, Set<number>>();
    const ensure = (id: number): Set<number> => {
      let set = directNeighbors.get(id);
      if (set === undefined) {
        set = new Set();
        directNeighbors.set(id, set);
      }
      return set;
    };

    // 同一路線上の停車駅は互いに接続
    for (const route of this.sim.getAllRoutes()) {
      for (const stopId of route.stops) {
        const set = ensure(stopId);
        for (const otherId of route.stops) {
          if (otherId !== stopId) set.add(otherId);
        }
      }
    }

    // 同一複合体内の駅も互いに接続（乗り換え可能）
    for (const id of directNeighbors.keys()) {
      const complex = this.graph.getStationComplex(id);
      if (complex.length <= 1) continue;
      const set = ensure(id);
      for (const cn of complex) {
        if (cn.id !== id) {
          set.add(cn.id);
          ensure(cn.id).add(id);
        }
      }
    }

    // BFSで推移的に到達可能な駅を展開する
    const connections = new Map<number, number[]>();
    for (const startId of directNeighbors.keys()) {
      const visited = new Set<number>([startId]);
      const queue = [startId];
      while (queue.length > 0) {
        const current = queue.shift()!;
        const neighbors = directNeighbors.get(current);
        if (neighbors === undefined) continue;
        for (const nid of neighbors) {
          if (visited.has(nid)) continue;
          visited.add(nid);
          queue.push(nid);
        }
      }
      visited.delete(startId);
      connections.set(startId, [...visited]);
    }
    return connections;
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
    this.railWaypoints = [];
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
    if (this.sim.hasTrainsOnEdge(edgeId)) {
      this.showToast("列車が走行中のため削除できません");
      return;
    }

    // エッジの両端が路線の停車駅に含まれていれば削除不可
    const edge = this.graph.getEdge(edgeId);
    if (edge === undefined) return;
    const routeNames = this.findRoutesUsingNodes(edge.fromId, edge.toId);
    if (routeNames !== null) {
      this.showToast(`${routeNames} で使用中のため削除できません`);
      return;
    }

    this.graph.removeEdge(edgeId);
    this.notify();
  }

  setNodeCapacity(nodeId: number, capacity: number): void {
    const node = this.graph.getNode(nodeId);
    if (node === undefined) return;
    node.capacity = Math.max(1, capacity);
    this.notify();
  }

  /** 両方のノードを停車駅に含む全路線名を返す。なければ null */
  private findRoutesUsingNodes(nodeA: number, nodeB: number): string | null {
    const names: string[] = [];
    for (const route of this.sim.getAllRoutes()) {
      if (route.stops.includes(nodeA) && route.stops.includes(nodeB)) {
        names.push(route.name);
      }
    }
    return names.length > 0 ? names.join(", ") : null;
  }

  /** 指定ノードを停車駅に含む全路線名を返す。なければ null */
  private findRoutesUsingNode(nodeId: number): string | null {
    const names: string[] = [];
    for (const route of this.sim.getAllRoutes()) {
      if (route.stops.includes(nodeId)) {
        names.push(route.name);
      }
    }
    return names.length > 0 ? names.join(", ") : null;
  }

  removeNode(nodeId: number): void {
    // ノードに列車がいれば削除不可
    if (this.sim.getNodeTrainCount(nodeId) > 0) {
      this.showToast("列車が停車中のため削除できません");
      return;
    }
    // 接続エッジ上に列車がいれば削除不可
    for (const edge of this.graph.getEdgesFor(nodeId)) {
      if (this.sim.hasTrainsOnEdge(edge.id)) {
        this.showToast("接続線路に列車が走行中のため削除できません");
        return;
      }
    }
    // 路線の停車駅なら削除不可
    const routeNames = this.findRoutesUsingNode(nodeId);
    if (routeNames !== null) {
      this.showToast(`${routeNames} の停車駅のため削除できません`);
      return;
    }

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
          this.railWaypoints = [];
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
        // 既存駅を選択
        this.selectedNodeId = existing.id;
        this.railWaypoints = [];
      } else if (this.selectedNodeId === existing.id && this.railWaypoints.length === 0) {
        // ウェイポイントなしで同じ駅をクリック → 選択解除
        this.selectedNodeId = null;
        this.railWaypoints = [];
      } else {
        // 別の駅、またはウェイポイントありで同じ駅 → 接続を試みる
        // 別の既存駅をクリック → ウェイポイント経由で接続
        const error = this.connectNodesViaWaypoints(this.selectedNodeId, existing.id);
        if (error !== null) {
          this.showToast(error);
          // 失敗時はステートを維持して再試行可能にする
          return;
        }
        this.selectedNodeId = null;
        this.railWaypoints = [];
      }
    } else {
      if (this.map.get(tileX, tileY).terrain === Terrain.Water) {
        this.showToast("水上には建設できません");
        return;
      }

      if (this.selectedNodeId !== null) {
        // 駅が選択中 + 空き地クリック → ウェイポイント追加
        const origin = this.graph.getNode(this.selectedNodeId);
        if (origin === undefined) return;

        // 起点からの全ポイントで仮パスを構築してチェック
        const allPoints = [
          { x: origin.tileX, y: origin.tileY },
          ...this.railWaypoints,
          { x: tileX, y: tileY },
        ];
        const testPath = this.buildPreviewPath(allPoints);
        if (testPath.length === 0) {
          this.showToast("経路が見つかりません");
          return;
        }

        // 自己交差チェック
        const seen = new Set<string>();
        for (const p of testPath) {
          const key = `${String(p.x)},${String(p.y)}`;
          if (seen.has(key)) {
            this.showToast("経路が自己交差しています");
            return;
          }
          seen.add(key);
        }

        // 既存線路との非直交重なりチェック
        if (hasNonPerpendicularOverlap(testPath, this.graph.getAllEdges())) {
          this.showToast("既存線路と平行に重ねて敷設できません");
          return;
        }

        this.railWaypoints.push({ x: tileX, y: tileY });
      } else {
        // エッジのパス上には駅を建設できない
        if (this.isOnEdgePath(tileX, tileY)) {
          this.showToast("線路上には駅を建設できません");
          return;
        }

        // 隣接駅のエッジ方向に対して垂直でなければ建設できない
        const perpError = this.checkPerpendicularPlacement(tileX, tileY);
        if (perpError !== null) {
          this.showToast(perpError);
          return;
        }

        // 新しい駅を配置
        const { kind, name } = this.makeNodeInfo(tileX, tileY);
        this.graph.addNode(kind, tileX, tileY, name);
      }
    }
    this.notify();
  }

  private makeNodeInfo(tileX: number, tileY: number): { kind: NodeKind; name: string } {
    // 隣接する既存駅があれば複合体名 + ホーム番号を付ける
    const adjacentName = this.findAdjacentComplexName(tileX, tileY);
    if (adjacentName !== null) {
      return { kind: NodeKind.Station, name: adjacentName };
    }

    this.stationCount++;
    const cityName = this.findNearestCityName(tileX, tileY);
    const name = cityName ?? `Station ${String(this.stationCount)}`;
    return { kind: NodeKind.Station, name };
  }

  /**
   * 隣接する駅の複合体名を基にホーム番号付きの名前を生成する。
   * 隣接駅がなければ null を返す。
   */
  private findAdjacentComplexName(tileX: number, tileY: number): string | null {
    // 隣接駅を探す（マンハッタン距離1、上下左右のみ）
    let adjacentNode: GraphNode | undefined;
    for (const node of this.graph.getAllNodes()) {
      const dx = Math.abs(node.tileX - tileX);
      const dy = Math.abs(node.tileY - tileY);
      if (dx + dy === 1) {
        adjacentNode = node;
        break;
      }
    }
    if (adjacentNode === undefined) return null;

    // 複合体の全駅を取得してベース名と次の番号を決定する
    const complex = this.graph.getStationComplex(adjacentNode.id);
    const baseName = this.getComplexBaseName(complex);
    const nextNum = complex.length + 1;

    // 既存駅が1つでまだ#付きでなければ、最初の駅を #1 にリネーム
    if (complex.length === 1 && complex[0] !== undefined && !complex[0].name.includes("#")) {
      complex[0].name = `${baseName} #1`;
    }

    return `${baseName} #${String(nextNum)}`;
  }

  /** 複合体のベース名を取得する（#以前の部分） */
  private getComplexBaseName(complex: readonly GraphNode[]): string {
    const first = complex[0];
    if (first === undefined) return "Station";
    const hashIdx = first.name.indexOf(" #");
    return hashIdx >= 0 ? first.name.slice(0, hashIdx) : first.name;
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

  /** ウェイポイント間のA*パスを結合してプレビュー用パスを生成する */
  private buildPreviewPath(points: readonly { x: number; y: number }[]): { x: number; y: number }[] {
    const fullPath: { x: number; y: number }[] = [];
    for (let i = 0; i < points.length - 1; i++) {
      const from = points[i];
      const to = points[i + 1];
      if (from === undefined || to === undefined) continue;
      const segment = findPath(this.map, from.x, from.y, to.x, to.y);
      if (segment === null) return fullPath; // 途中で経路が見つからなければそこまで
      if (fullPath.length > 0) {
        fullPath.push(...segment.slice(1));
      } else {
        fullPath.push(...segment);
      }
    }
    return fullPath;
  }


  /** 隣接配置の制約をチェックする。違反時はエラーメッセージを返す */
  private checkPerpendicularPlacement(tileX: number, tileY: number): string | null {
    // 隣接する既存駅を収集する
    const adjacentNodes: { id: number; dx: number; dy: number }[] = [];
    for (const node of this.graph.getAllNodes()) {
      const dx = node.tileX - tileX;
      const dy = node.tileY - tileY;
      if (Math.abs(dx) + Math.abs(dy) !== 1) continue;
      adjacentNodes.push({ id: node.id, dx, dy });
    }

    if (adjacentNodes.length === 0) return null;

    if (adjacentNodes.length === 1) {
      // 1駅隣接: エッジ方向と垂直かチェック
      const adj = adjacentNodes[0];
      if (adj !== undefined && !this.graph.isPerpendicularToEdges(adj.id, tileX, tileY)) {
        return "線路の進行方向には隣接駅を建設できません";
      }
      return null;
    }

    if (adjacentNodes.length === 2) {
      // 2駅隣接: 反対側にある場合のみ許可（チェーン挿入）
      const a = adjacentNodes[0];
      const b = adjacentNodes[1];
      if (a !== undefined && b !== undefined && a.dx + b.dx === 0 && a.dy + b.dy === 0) {
        // 両方のエッジ方向と垂直かチェック
        if (!this.graph.isPerpendicularToEdges(a.id, tileX, tileY)) {
          return "線路の進行方向には隣接駅を建設できません";
        }
        if (!this.graph.isPerpendicularToEdges(b.id, tileX, tileY)) {
          return "線路の進行方向には隣接駅を建設できません";
        }
        return null;
      }
      return "L字型に隣接する位置には建設できません";
    }

    return "複数の駅に同時に隣接する位置には建設できません";
  }

  /** 指定タイルが既存エッジのパス上にあるか */
  private isOnEdgePath(tileX: number, tileY: number): boolean {
    for (const edge of this.graph.getAllEdges()) {
      for (const p of edge.path) {
        if (p.x === tileX && p.y === tileY) return true;
      }
    }
    return false;
  }

  /** ウェイポイント経由でノード間を接続する。失敗時はエラー理由を返す */
  private connectNodesViaWaypoints(fromId: number, toId: number): string | null {
    const fromNode = this.graph.getNode(fromId);
    const toNode = this.graph.getNode(toId);
    if (fromNode === undefined || toNode === undefined) return "駅が見つかりません";
    if (this.graph.getEdgesBetween(fromId, toId) !== undefined) {
      return "この2駅は既に接続されています";
    }

    // 駅は最大2方向まで接続可能
    // 自己ループは1つのノードに2方向（出発+到着）を使う
    const fromEdges = this.graph.getEdgesFor(fromId).length;
    const toEdges = this.graph.getEdgesFor(toId).length;
    if (fromId === toId) {
      // 自己ループ: 2方向必要 → 既存が1本以上あれば超過
      if (fromEdges >= 1) {
        return `${fromNode.name} は自己ループに必要な2方向の空きがありません`;
      }
    } else {
      if (fromEdges >= 2) {
        return `${fromNode.name} は既に2方向接続済みです`;
      }
      if (toEdges >= 2) {
        return `${toNode.name} は既に2方向接続済みです`;
      }
    }

    // ウェイポイントを経由してパスを結合
    const points: { x: number; y: number }[] = [
      { x: fromNode.tileX, y: fromNode.tileY },
      ...this.railWaypoints,
      { x: toNode.tileX, y: toNode.tileY },
    ];

    const fullPath: { x: number; y: number }[] = [];
    for (let i = 0; i < points.length - 1; i++) {
      const from = points[i];
      const to = points[i + 1];
      if (from === undefined || to === undefined) continue;
      const segment = findPath(this.map, from.x, from.y, to.x, to.y);
      if (segment === null) return "経路が見つかりません";
      if (fullPath.length > 0) {
        fullPath.push(...segment.slice(1));
      } else {
        fullPath.push(...segment);
      }
    }

    if (fullPath.length >= 2) {
      // 自己重複チェック（同じタイルを2回通るパスは不正）
      const seen = new Set<string>();
      for (const p of fullPath) {
        const key = `${String(p.x)},${String(p.y)}`;
        if (seen.has(key)) return "経路が自己交差しています";
        seen.add(key);
      }

      // 中間タイルが既存駅を通過していないかチェック（端点は除く）
      for (let i = 1; i < fullPath.length - 1; i++) {
        const p = fullPath[i];
        if (p === undefined) continue;
        const nodeAtTile = this.graph.getNodeAt(p.x, p.y);
        if (nodeAtTile !== undefined) {
          return `経路が ${nodeAtTile.name} を通過しています`;
        }
      }

      if (hasNonPerpendicularOverlap(fullPath, this.graph.getAllEdges())) {
        return "既存線路と平行に重ねて敷設できません";
      }

      // エッジ方向が隣接駅と平行でないか確認する
      const p0 = fullPath[0];
      const p1 = fullPath[1];
      const pLast = fullPath[fullPath.length - 1];
      const pPrev = fullPath[fullPath.length - 2];
      if (p0 !== undefined && p1 !== undefined) {
        if (!this.graph.isEdgeDirectionValid(fromId, p1.x - p0.x, p1.y - p0.y)) {
          return `${fromNode.name} の隣接駅と平行な方向には接続できません`;
        }
      }
      if (pLast !== undefined && pPrev !== undefined) {
        if (!this.graph.isEdgeDirectionValid(toId, pPrev.x - pLast.x, pPrev.y - pLast.y)) {
          return `${toNode.name} の隣接駅と平行な方向には接続できません`;
        }
      }

      this.graph.addEdge(fromId, toId, fullPath);
      return null;
    }
    return "経路を構築できません";
  }

  private connectNodes(fromId: number, toId: number, waypoints?: { x: number; y: number }[]): void {
    this.railWaypoints = waypoints ?? [];
    const error = this.connectNodesViaWaypoints(fromId, toId);
    this.railWaypoints = [];
    if (error !== null) {
      console.warn(`connectNodes(${String(fromId)}, ${String(toId)}): ${error}`);
    }
  }

}
