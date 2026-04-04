import { BuildingType, Economy, Resource, generateCities } from "./economy.js";

import type { GraphNode } from "./graph.js";
import { Graph, NodeKind, hasNonPerpendicularOverlap } from "./graph.js";
import { findPath } from "./pathfinding.js";
import { ROUTE_MODE_NAMES, RouteMode, Simulation, TrainState } from "./simulation.js";
import { generateTerrain } from "./terrain.js";
import { TileMap } from "./tilemap.js";
import { TERRAIN_NAMES, Terrain } from "./types.js";
import { BUILDING_TYPE_NAMES, RESOURCE_NAMES } from "./economy.js";
import { NODE_KIND_NAMES } from "./graph.js";
import { calcConsistStats } from "./vehicle.js";
import type { ConsistStats } from "./vehicle.js";

// --- 定数 ---

const MAP_SIZE = 256;

// --- 型 ---

export interface GameConfig {
  readonly seed: number;
  readonly debug: boolean;
}

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
  readonly routeName: string;
  readonly state: string;
  readonly targetStop: string;
  readonly speed: number;
  readonly cars: readonly string[];
  readonly cargoCapacity: number;
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

export interface FloatingText {
  x: number;
  y: number;
  text: string;
  time: number;
}

// --- 編成プリセット ---

export interface ConsistPreset {
  readonly id: number;
  name: string;
  readonly cars: readonly string[];
}

export interface ConsistPresetInfo {
  readonly id: number;
  readonly name: string;
  readonly cars: readonly string[];
  readonly stats: ConsistStats | null;
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
  readonly openTrainIds: readonly number[];
  readonly inspect: InspectInfo;
  readonly toasts: readonly Toast[];
  readonly consistPresets: readonly ConsistPresetInfo[];
  readonly debug: boolean;
  readonly seed: number;
}

// --- ゲームワールド（純粋なゲームロジック、ブラウザ依存なし） ---

export class GameWorld {
  readonly config: GameConfig;
  readonly graph: Graph;
  readonly sim: Simulation;
  readonly economy: Economy;
  readonly map: TileMap;

  toolMode: ToolMode = ToolMode.Inspect;
  railSubMode: RailSubMode = RailSubMode.Station;
  railWaypoints: { x: number; y: number }[] = [];
  selectedNodeId: number | null = null;
  routeStops: number[] = [];
  lastRouteId: number | null = null;
  editingRouteId: number | null = null;
  inspectTileX: number | null = null;
  inspectTileY: number | null = null;
  openTrainIds: number[] = [];

  toasts: Toast[] = [];
  floatingTexts: FloatingText[] = [];

  private consistPresets = new Map<number, ConsistPreset>();
  private nextPresetId = 1;

  private stationCount = 0;
  private nextToastId = 1;
  private static readonly TOAST_DURATION = 3.0;

  constructor(config: GameConfig) {
    this.config = config;
    this.graph = new Graph();
    this.sim = new Simulation();
    this.economy = new Economy();

    if (config.debug) {
      this.map = new TileMap(64, 64);
      this.setupDebugWorld();
    } else {
      this.map = new TileMap(MAP_SIZE, MAP_SIZE);
      generateTerrain(this.map, { seed: config.seed });
      generateCities(this.map, this.economy, 8, config.seed);
    }

    // 列車到着を経済システムに接続する（複合体単位で貨物を扱う）
    this.sim.onTrainArrive = (train, nodeId): void => {
      const route = this.sim.getRoute(train.routeId);
      const routeStops = route?.stops ?? [];
      const complexIds = this.graph.getStationComplex(nodeId).map((n) => n.id);

      // 路線接続で到達可能な全目的地を算出する（乗り換え含む）
      const routeConns = this.buildRouteConnections();
      const reachableFromRoute = new Set<number>();
      for (const stopId of routeStops) {
        reachableFromRoute.add(stopId);
        const conns = routeConns.get(stopId);
        if (conns !== undefined) {
          for (const c of conns) {
            reachableFromRoute.add(c);
          }
        }
      }

      // 配達 + 積載（到達可能な目的地の貨物を積む）
      const { earned, newCargo } = this.economy.trainArrive(
        complexIds, train.cargo, this.graph, [...reachableFromRoute], train.cargoCapacity,
      );

      // 乗り換え降車: 到着前に持っていた貨物のうち、
      // この路線の停車駅にない目的地で、他路線の接続がある駅で降ろす
      const routeStopSet = new Set(routeStops);
      for (const stopId of routeStops) {
        for (const cn of this.graph.getStationComplex(stopId)) {
          routeStopSet.add(cn.id);
        }
      }
      // 到着前に持っていた貨物の目的地セット（新規積載分は除外）
      const priorDestinations = new Set(train.cargo.map((c) => `${String(c.resource)}-${String(c.destinationNodeId)}`));
      const kept: typeof newCargo = [];
      for (const item of newCargo) {
        const itemKey = `${String(item.resource)}-${String(item.destinationNodeId)}`;
        // この路線で運べる貨物はそのまま運ぶ
        if (routeStopSet.has(item.destinationNodeId)) {
          kept.push(item);
          continue;
        }
        // この駅で新しく積んだ貨物は降ろさない（次の駅で判定する）
        if (!priorDestinations.has(itemKey)) {
          kept.push(item);
          continue;
        }
        // 目的地がこの駅の複合体から到達可能なら降ろす
        let canTransferHere = false;
        for (const cid of complexIds) {
          const conns = routeConns.get(cid);
          if (conns?.includes(item.destinationNodeId) === true) {
            canTransferHere = true;
            break;
          }
        }
        if (canTransferHere) {
          const dropNodeId = complexIds[0];
          if (dropNodeId !== undefined) {
            this.economy.addWaiting(dropNodeId, item.resource, item.amount, item.destinationNodeId);
          }
        } else {
          kept.push(item);
        }
      }
      train.cargo = kept;

      // 収益が発生したらフローティングテキストを追加する
      if (earned > 0) {
        const node = this.graph.getNode(nodeId);
        if (node !== undefined) {
          this.floatingTexts.push({
            x: node.tileX,
            y: node.tileY,
            text: `+$${String(Math.floor(earned))}`,
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
      this.showToast(`${route?.name ?? "?"}: 経路が見つかりません`);
      setTimeout(() => { notifiedRoutes.delete(train.routeId); }, 5000);
    };
  }

  // --- シミュレーション更新 ---

  update(dt: number): void {
    this.updateToasts(dt);
    this.updateFloatingTexts(dt);
    this.sim.update(dt, this.graph);
    this.economy.update(dt, this.graph, this.map, this.buildRouteConnections());

    // 全列車の運行コストを差し引く
    for (const train of this.sim.getAllTrains()) {
      const stats = calcConsistStats(train.cars);
      if (stats !== null) {
        this.economy.deductRunningCost(stats.runningCost * dt);
      }
    }
  }

  // --- トースト ---

  showToast(message: string): void {
    this.toasts.push({ id: this.nextToastId++, message, time: GameWorld.TOAST_DURATION });
  }

  private updateToasts(dt: number): void {
    for (let i = this.toasts.length - 1; i >= 0; i--) {
      const t = this.toasts[i];
      if (t === undefined) continue;
      const remaining = t.time - dt;
      if (remaining <= 0) {
        this.toasts.splice(i, 1);
      } else {
        this.toasts[i] = { ...t, time: remaining };
      }
    }
  }

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

  // --- スナップショット ---

  getSnapshot(): GameSnapshot {
    return {
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
          routeName: route?.name ?? "?",
          state: t.state === TrainState.AtNode ? "At Node" : "On Edge",
          targetStop: targetNode?.name ?? `#${String(targetNodeId ?? "?")}`,
          speed: t.speed,
          cars: t.cars,
          cargoCapacity: t.cargoCapacity,
          cargoTotal: total,
          cargoDetail: detail,
        };
      }),
      openTrainIds: [...this.openTrainIds],
      inspect: this.buildInspectInfo(),
      toasts: [...this.toasts],
      consistPresets: [...this.consistPresets.values()].map((p) => ({
        id: p.id,
        name: p.name,
        cars: p.cars,
        stats: calcConsistStats(p.cars),
      })),
      debug: this.config.debug,
      seed: this.config.seed,
    };
  }

  buildInspectInfo(): InspectInfo {
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
      const waitingDetail: { resource: string; destination: string; amount: number }[] = [];
      for (const cn of complex) {
        for (const item of this.economy.getWaitingCargo(cn.id)) {
          if (item.amount <= 0) continue;
          const destNode = this.graph.getNode(item.destinationNodeId);
          const destName = destNode?.name ?? `#${String(item.destinationNodeId)}`;
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
    for (const edge of this.graph.getAllEdges()) {
      for (const p of edge.path) {
        if (p.x === tx && p.y === ty) {
          const fromNode = this.graph.getNode(edge.fromId);
          const toNode = this.graph.getNode(edge.toId);
          return {
            ...base,
            type: "edge" as const,
            edgeId: edge.id,
            edgeFrom: fromNode?.name ?? `#${String(edge.fromId)}`,
            edgeTo: toNode?.name ?? `#${String(edge.toId)}`,
            edgeLength: edge.path.length,
          };
        }
      }
    }

    return base;
  }

  // --- アクション ---

  setToolMode(mode: ToolMode): void {
    this.toolMode = mode;
    this.routeStops = [];
    this.selectedNodeId = null;
    this.railWaypoints = [];
  }

  setRailSubMode(mode: RailSubMode): void {
    this.railSubMode = mode;
  }

  openTrainDetail(trainId: number): void {
    if (!this.openTrainIds.includes(trainId)) {
      this.openTrainIds.push(trainId);
    }
  }

  closeTrainDetail(trainId: number): void {
    this.openTrainIds = this.openTrainIds.filter((id) => id !== trainId);
  }

  toggleTrainDetail(trainId: number): void {
    if (this.openTrainIds.includes(trainId)) {
      this.closeTrainDetail(trainId);
    } else {
      this.openTrainDetail(trainId);
    }
  }

  /**
   * 路線に列車を増発する。路線に紐付いた編成プリセットを使用する。
   * プリセット未設定なら従来通りデフォルト性能で生成する。
   * 購入費が不足している場合は失敗メッセージを返す。
   */
  addTrain(routeId?: number): string | null {
    const id = routeId ?? this.lastRouteId;
    if (id === null) return "路線が選択されていません";

    const route = this.sim.getRoute(id);
    if (route === undefined) return "路線が見つかりません";

    // 編成プリセットが設定されている場合
    if (route.consistPresetId !== null) {
      const preset = this.consistPresets.get(route.consistPresetId);
      if (preset === undefined) return "編成プリセットが見つかりません";

      const stats = calcConsistStats(preset.cars);
      if (stats === null) return "編成が不正です";
      if (!stats.hasPower) return "動力車がありません";

      if (this.economy.money < stats.purchaseCost) {
        return `資金不足です（必要: $${String(stats.purchaseCost)}）`;
      }

      this.economy.deductRunningCost(stats.purchaseCost);
      this.sim.addTrain(id, this.graph, preset.cars, stats.effectiveSpeed, stats.totalCapacity);
      return null;
    }

    // プリセット未設定: 従来通り
    this.sim.addTrain(id, this.graph);
    return null;
  }

  selectRoute(routeId: number): void {
    this.lastRouteId = routeId;
  }

  confirmRoute(mode: RouteMode): void {
    if (this.routeStops.length < 2) return;

    if (this.editingRouteId !== null) {
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
  }

  editRoute(routeId: number): void {
    const route = this.sim.getRoute(routeId);
    if (route === undefined) return;
    this.toolMode = ToolMode.Route;
    this.editingRouteId = routeId;
    this.routeStops = [...route.stops];
    this.selectedNodeId = null;
  }

  removeRoute(routeId: number): void {
    for (const train of this.sim.getAllTrains()) {
      if (train.routeId === routeId) {
        this.sim.removeTrain(train.id);
      }
    }
    this.sim.removeRoute(routeId);
    if (this.lastRouteId === routeId) {
      this.lastRouteId = null;
    }
  }

  removeTrainFromRoute(routeId: number): void {
    const trains = this.sim.getAllTrains().filter((t) => t.routeId === routeId);
    const last = trains[trains.length - 1];
    if (last !== undefined) {
      this.sim.removeTrain(last.id);
    }
  }

  removeEdge(edgeId: number): string | null {
    if (this.sim.hasTrainsOnEdge(edgeId)) {
      return "列車が走行中のため削除できません";
    }
    const edge = this.graph.getEdge(edgeId);
    if (edge === undefined) return "エッジが見つかりません";
    const routeNames = this.findRoutesUsingNodes(edge.fromId, edge.toId);
    if (routeNames !== null) {
      return `${routeNames} で使用中のため削除できません`;
    }
    this.graph.removeEdge(edgeId);
    return null;
  }

  setNodeCapacity(nodeId: number, capacity: number): void {
    const node = this.graph.getNode(nodeId);
    if (node === undefined) return;
    node.capacity = Math.max(1, capacity);
  }

  removeNode(nodeId: number): string | null {
    if (this.sim.getNodeTrainCount(nodeId) > 0) {
      return "列車が停車中のため削除できません";
    }
    for (const edge of this.graph.getEdgesFor(nodeId)) {
      if (this.sim.hasTrainsOnEdge(edge.id)) {
        return "接続線路に列車が走行中のため削除できません";
      }
    }
    const routeNames = this.findRoutesUsingNode(nodeId);
    if (routeNames !== null) {
      return `${routeNames} の停車駅のため削除できません`;
    }
    const result = this.graph.removeNode(nodeId);
    if (result.mergedEdge !== undefined && result.oldEdgeIds !== undefined && result.splitPathIndex !== undefined) {
      this.sim.handleEdgeMerge(result.oldEdgeIds, result.mergedEdge.id, result.splitPathIndex, this.graph);
    }
    this.inspectTileX = null;
    this.inspectTileY = null;
    return null;
  }

  renameNode(nodeId: number, name: string): void {
    const node = this.graph.getNode(nodeId);
    if (node !== undefined) {
      node.name = name;
    }
  }

  renameRoute(routeId: number, name: string): void {
    this.sim.renameRoute(routeId, name);
  }

  removeRouteStop(index: number): void {
    if (index < 0 || index >= this.routeStops.length) return;
    this.routeStops.splice(index, 1);
  }

  cancelRoute(): void {
    this.routeStops = [];
    this.editingRouteId = null;
    this.selectedNodeId = null;
  }

  // --- 編成プリセット管理 ---

  addConsistPreset(name: string, cars: readonly string[]): ConsistPreset | null {
    const stats = calcConsistStats(cars);
    if (stats === null) return null;
    const id = this.nextPresetId++;
    const preset: ConsistPreset = { id, name, cars };
    this.consistPresets.set(id, preset);
    return preset;
  }

  updateConsistPreset(presetId: number, name: string, cars: readonly string[]): boolean {
    const existing = this.consistPresets.get(presetId);
    if (existing === undefined) return false;
    const stats = calcConsistStats(cars);
    if (stats === null) return false;
    this.consistPresets.set(presetId, { id: presetId, name, cars });
    return true;
  }

  removeConsistPreset(presetId: number): void {
    this.consistPresets.delete(presetId);
    // このプリセットを使用中の路線をリセットする
    for (const route of this.sim.getAllRoutes()) {
      if (route.consistPresetId === presetId) {
        route.consistPresetId = null;
      }
    }
  }

  getConsistPreset(presetId: number): ConsistPreset | undefined {
    return this.consistPresets.get(presetId);
  }

  getAllConsistPresets(): readonly ConsistPreset[] {
    return [...this.consistPresets.values()];
  }

  setRouteConsist(routeId: number, presetId: number | null): void {
    const route = this.sim.getRoute(routeId);
    if (route === undefined) return;
    route.consistPresetId = presetId;
  }

  // --- 入力処理 ---

  onTileClick(tileX: number, tileY: number): void {
    if (!this.map.inBounds(tileX, tileY)) return;

    this.inspectTileX = tileX;
    this.inspectTileY = tileY;

    if (this.toolMode === ToolMode.Inspect) return;

    if (this.toolMode === ToolMode.Route) {
      this.handleRouteClick(tileX, tileY);
      return;
    }

    this.handleBuildClick(tileX, tileY);
  }

  onKeyPress(key: string): void {
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
        break;
    }
  }

  private handleRouteClick(tileX: number, tileY: number): void {
    const node = this.graph.getNodeAt(tileX, tileY);
    if (node === undefined) return;
    this.routeStops.push(node.id);
    this.selectedNodeId = node.id;
  }

  private handleBuildClick(tileX: number, tileY: number): void {
    const existing = this.graph.getNodeAt(tileX, tileY);

    if (existing !== undefined) {
      if (this.selectedNodeId === null) {
        this.selectedNodeId = existing.id;
        this.railWaypoints = [];
      } else if (this.selectedNodeId === existing.id && this.railWaypoints.length === 0) {
        this.selectedNodeId = null;
        this.railWaypoints = [];
      } else {
        const error = this.connectNodesViaWaypoints(this.selectedNodeId, existing.id);
        if (error !== null) {
          this.showToast(error);
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
        const origin = this.graph.getNode(this.selectedNodeId);
        if (origin === undefined) return;

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

        const seen = new Set<string>();
        for (const p of testPath) {
          const key = `${String(p.x)},${String(p.y)}`;
          if (seen.has(key)) {
            this.showToast("経路が自己交差しています");
            return;
          }
          seen.add(key);
        }

        if (hasNonPerpendicularOverlap(testPath, this.graph.getAllEdges())) {
          this.showToast("既存線路と平行に重ねて敷設できません");
          return;
        }

        this.railWaypoints.push({ x: tileX, y: tileY });
      } else {
        if (this.isOnEdgePath(tileX, tileY)) {
          this.showToast("線路上には駅を建設できません");
          return;
        }

        const perpError = this.checkPerpendicularPlacement(tileX, tileY);
        if (perpError !== null) {
          this.showToast(perpError);
          return;
        }

        const { kind, name } = this.makeNodeInfo(tileX, tileY);
        this.graph.addNode(kind, tileX, tileY, name);
      }
    }
  }

  // --- 路線接続性 ---

  buildRouteConnections(): Map<number, number[]> {
    const directNeighbors = new Map<number, Set<number>>();
    const ensure = (id: number): Set<number> => {
      let set = directNeighbors.get(id);
      if (set === undefined) {
        set = new Set();
        directNeighbors.set(id, set);
      }
      return set;
    };

    for (const route of this.sim.getAllRoutes()) {
      for (const stopId of route.stops) {
        const set = ensure(stopId);
        for (const otherId of route.stops) {
          if (otherId !== stopId) set.add(otherId);
        }
      }
    }

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

    const connections = new Map<number, number[]>();
    for (const startId of directNeighbors.keys()) {
      const visited = new Set<number>([startId]);
      const queue = [startId];
      while (queue.length > 0) {
        const current = queue.shift();
        if (current === undefined) break;
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

  // --- ヘルパー ---

  findRoutesUsingNodes(nodeA: number, nodeB: number): string | null {
    const names: string[] = [];
    for (const route of this.sim.getAllRoutes()) {
      if (route.stops.includes(nodeA) && route.stops.includes(nodeB)) {
        names.push(route.name);
      }
    }
    return names.length > 0 ? names.join(", ") : null;
  }

  findRoutesUsingNode(nodeId: number): string | null {
    const names: string[] = [];
    for (const route of this.sim.getAllRoutes()) {
      if (route.stops.includes(nodeId)) {
        names.push(route.name);
      }
    }
    return names.length > 0 ? names.join(", ") : null;
  }

  makeNodeInfo(tileX: number, tileY: number): { kind: NodeKind; name: string } {
    const adjacentName = this.findAdjacentComplexName(tileX, tileY);
    if (adjacentName !== null) {
      return { kind: NodeKind.Station, name: adjacentName };
    }
    this.stationCount++;
    const cityName = this.findNearestCityName(tileX, tileY);
    const name = cityName ?? `Station ${String(this.stationCount)}`;
    return { kind: NodeKind.Station, name };
  }

  findAdjacentComplexName(tileX: number, tileY: number): string | null {
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

    const complex = this.graph.getStationComplex(adjacentNode.id);
    const baseName = this.getComplexBaseName(complex);
    const nextNum = complex.length + 1;

    if (complex.length === 1 && complex[0] !== undefined && !complex[0].name.includes("#")) {
      complex[0].name = `${baseName} #1`;
    }

    return `${baseName} #${String(nextNum)}`;
  }

  getComplexBaseName(complex: readonly GraphNode[]): string {
    const first = complex[0];
    if (first === undefined) return "Station";
    const hashIdx = first.name.indexOf(" #");
    return hashIdx >= 0 ? first.name.slice(0, hashIdx) : first.name;
  }

  generateRouteName(stops: readonly number[]): string {
    const first = stops[0];
    const last = stops[stops.length - 1];
    if (first === undefined || last === undefined) return "Route";
    const firstName = this.graph.getNode(first)?.name ?? String(first);
    const lastName = this.graph.getNode(last)?.name ?? String(last);
    return `${firstName} - ${lastName}`;
  }

  findNearestCityName(tileX: number, tileY: number): string | null {
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
    if (bestDist > 900) return null;
    return bestName;
  }

  buildPreviewPath(points: readonly { x: number; y: number }[]): { x: number; y: number }[] {
    const fullPath: { x: number; y: number }[] = [];
    for (let i = 0; i < points.length - 1; i++) {
      const from = points[i];
      const to = points[i + 1];
      if (from === undefined || to === undefined) continue;
      const segment = findPath(this.map, from.x, from.y, to.x, to.y);
      if (segment === null) return fullPath;
      if (fullPath.length > 0) {
        fullPath.push(...segment.slice(1));
      } else {
        fullPath.push(...segment);
      }
    }
    return fullPath;
  }

  checkPerpendicularPlacement(tileX: number, tileY: number): string | null {
    const adjacentNodes: { id: number; dx: number; dy: number }[] = [];
    for (const node of this.graph.getAllNodes()) {
      const dx = node.tileX - tileX;
      const dy = node.tileY - tileY;
      if (Math.abs(dx) + Math.abs(dy) !== 1) continue;
      adjacentNodes.push({ id: node.id, dx, dy });
    }

    if (adjacentNodes.length === 0) return null;

    if (adjacentNodes.length === 1) {
      const adj = adjacentNodes[0];
      if (adj !== undefined && !this.graph.isPerpendicularToEdges(adj.id, tileX, tileY)) {
        return "線路の進行方向には隣接駅を建設できません";
      }
      return null;
    }

    if (adjacentNodes.length === 2) {
      const a = adjacentNodes[0];
      const b = adjacentNodes[1];
      if (a !== undefined && b !== undefined && a.dx + b.dx === 0 && a.dy + b.dy === 0) {
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

  isOnEdgePath(tileX: number, tileY: number): boolean {
    for (const edge of this.graph.getAllEdges()) {
      for (const p of edge.path) {
        if (p.x === tileX && p.y === tileY) return true;
      }
    }
    return false;
  }

  connectNodesViaWaypoints(fromId: number, toId: number): string | null {
    const fromNode = this.graph.getNode(fromId);
    const toNode = this.graph.getNode(toId);
    if (fromNode === undefined || toNode === undefined) return "駅が見つかりません";
    if (this.graph.getEdgesBetween(fromId, toId) !== undefined) {
      return "この2駅は既に接続されています";
    }

    const fromEdges = this.graph.getEdgesFor(fromId).length;
    const toEdges = this.graph.getEdgesFor(toId).length;
    if (fromId === toId) {
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
      const seen = new Set<string>();
      for (const p of fullPath) {
        const key = `${String(p.x)},${String(p.y)}`;
        if (seen.has(key)) return "経路が自己交差しています";
        seen.add(key);
      }

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

  connectNodes(fromId: number, toId: number, waypoints?: { x: number; y: number }[]): void {
    this.railWaypoints = waypoints ?? [];
    const error = this.connectNodesViaWaypoints(fromId, toId);
    this.railWaypoints = [];
    if (error !== null) {
      throw new Error(`connectNodes(${String(fromId)}, ${String(toId)}): ${error}`);
    }
  }

  // --- デバッグワールド ---

  private setupDebugWorld(): void {
    // メインライン: 田園 - 中央複合体 - 港町
    const a = this.graph.addNode(NodeKind.Station, 10, 20, "田園");
    const b1 = this.graph.addNode(NodeKind.Station, 30, 20, "中央 #1");
    const b2 = this.graph.addNode(NodeKind.Station, 30, 21, "中央 #2");
    const e = this.graph.addNode(NodeKind.Station, 50, 21, "港町");

    this.connectNodes(a.id, b1.id);
    this.connectNodes(b2.id, e.id);

    // 支線: 鉱山口 - 山手複合体 - 工業団地 - 南港
    const c = this.graph.addNode(NodeKind.Station, 10, 40, "鉱山口");
    const d1 = this.graph.addNode(NodeKind.Station, 30, 40, "山手 #1");
    const d2 = this.graph.addNode(NodeKind.Station, 30, 41, "山手 #2");
    const f = this.graph.addNode(NodeKind.Station, 50, 41, "工業団地");
    const g = this.graph.addNode(NodeKind.Station, 50, 50, "南港");

    this.connectNodes(c.id, d1.id);
    this.connectNodes(d2.id, f.id);
    this.connectNodes(f.id, g.id);

    // 縦断線: 中央#2 - 中央連絡 - 山手#1（左側にS字で結ぶ）
    const mid = this.graph.addNode(NodeKind.Station, 28, 30, "中央連絡");
    this.connectNodes(b2.id, mid.id, [{ x: 29, y: 21 }, { x: 28, y: 21 }, { x: 28, y: 29 }]);
    this.connectNodes(mid.id, d1.id, [{ x: 28, y: 31 }, { x: 28, y: 39 }, { x: 31, y: 39 }, { x: 31, y: 40 }]);

    // 編成プリセットを作成する
    const passengerConsist = this.addConsistPreset("普通旅客", ["loco_steam", "car_passenger", "car_passenger"]);
    const freightConsist = this.addConsistPreset("貨物列車", ["loco_diesel", "car_freight", "car_freight", "car_freight"]);
    const expressConsist = this.addConsistPreset("特急", ["car_express", "car_express", "car_express"]);
    const localConsist = this.addConsistPreset("縦断ローカル", ["loco_steam", "car_passenger"]);

    // 初期資金を設定する
    this.economy.deductRunningCost(-5000);

    // 田園〜港町線: 旅客編成
    const route1 = this.sim.addRoute([a.id, b1.id, e.id], RouteMode.Shuttle, "田園〜港町線");
    if (passengerConsist !== null) {
      this.setRouteConsist(route1.id, passengerConsist.id);
    }
    this.addTrain(route1.id);
    this.addTrain(route1.id);

    // 鉱山口〜南港線: 貨物編成
    const route2 = this.sim.addRoute([c.id, d1.id, g.id], RouteMode.Shuttle, "鉱山口〜南港線");
    if (freightConsist !== null) {
      this.setRouteConsist(route2.id, freightConsist.id);
    }
    this.addTrain(route2.id);

    // 縦断線: ローカル編成
    const route3 = this.sim.addRoute([b2.id, mid.id, d1.id], RouteMode.Shuttle, "縦断線");
    if (localConsist !== null) {
      this.setRouteConsist(route3.id, localConsist.id);
    }
    this.addTrain(route3.id);

    // 特急プリセットは未使用だが選択可能な状態にしておく
    void expressConsist;

    this.lastRouteId = route1.id;

    // 都市と建物を配置
    this.economy.addCity("田園町", 10, 20, 5);
    this.economy.addCity("港町", 50, 21, 5);
    this.economy.addCity("鉱山町", 10, 40, 5);

    this.economy.addBuilding(BuildingType.Farm, 8, 20);
    this.economy.addBuilding(BuildingType.Commercial, 48, 21);
    this.economy.addBuilding(BuildingType.Mine, 8, 40);
    this.economy.addBuilding(BuildingType.Factory, 48, 50);

    this.economy.addWaiting(b1.id, Resource.Passengers, 5, e.id);
    this.economy.addWaiting(b2.id, Resource.Rice, 3, e.id);
    this.economy.addWaiting(d1.id, Resource.Iron, 4, g.id);
  }
}
