import type { Graph, GraphEdge } from "./graph.js";
import { NodeKind, SignalLayout } from "./graph.js";
import type { PathNode } from "./pathfinding.js";

// --- 路線 ---

export const RouteMode = {
  Shuttle: 0,
  Loop: 1,
} as const;

export type RouteMode = (typeof RouteMode)[keyof typeof RouteMode];

export const ROUTE_MODE_NAMES: Record<RouteMode, string> = {
  [RouteMode.Shuttle]: "Shuttle",
  [RouteMode.Loop]: "Loop",
};

export interface Route {
  readonly id: number;
  /** 訪問するノードIDの順序付きリスト */
  readonly stops: readonly number[];
  readonly mode: RouteMode;
}

// --- 列車 ---

export const TrainState = {
  AtNode: 0,
  OnEdge: 1,
} as const;

export type TrainState = (typeof TrainState)[keyof typeof TrainState];

export interface Train {
  readonly id: number;
  state: TrainState;

  // ノード滞在状態
  nodeId: number;

  // エッジ走行状態
  edgeId: number;
  forward: boolean;
  pathIndex: number;
  progress: number;

  // 共通
  speed: number;
  waitTime: number;

  // 路線
  routeId: number;
  routeStopIndex: number;
  routeDirection: 1 | -1;

  // 貨物
  cargo: Map<number, number>;
}

export interface TrainPosition {
  readonly trainId: number;
  readonly worldX: number;
  readonly worldY: number;
  readonly cargoTotal: number;
}

// --- 定数 ---

const DEFAULT_SPEED = 3.0;
const STATION_WAIT = 2.0;
const RETRY_WAIT = 0.5;

// --- シミュレーション ---

export class Simulation {
  private trains = new Map<number, Train>();
  private routes = new Map<number, Route>();
  private nextId = 1;

  private edgeReservation = new Map<number, number>();
  /** nodeId -> Map<trainId, 到着元のedgeId> */
  private nodeOccupants = new Map<number, Map<number, number>>();

  // --- 路線API ---

  addRoute(stops: readonly number[], mode: RouteMode): Route {
    const id = this.nextId++;
    const route: Route = { id, stops, mode };
    this.routes.set(id, route);
    return route;
  }

  removeRoute(id: number): boolean {
    return this.routes.delete(id);
  }

  getRoute(id: number): Route | undefined {
    return this.routes.get(id);
  }

  getAllRoutes(): readonly Route[] {
    return [...this.routes.values()];
  }

  // --- 列車API ---

  addTrain(routeId: number, graph: Graph): void {
    const route = this.routes.get(routeId);
    if (route === undefined || route.stops.length < 2) return;

    const startNodeId = route.stops[0];
    if (startNodeId === undefined) return;

    const node = graph.getNode(startNodeId);
    if (node === undefined) return;

    const id = this.nextId++;
    const train: Train = {
      id,
      state: TrainState.AtNode,
      nodeId: startNodeId,
      edgeId: -1,
      forward: true,
      pathIndex: 0,
      progress: 0,
      speed: DEFAULT_SPEED,
      waitTime: STATION_WAIT,
      routeId,
      routeStopIndex: 1,
      routeDirection: 1,
      cargo: new Map(),
    };
    this.trains.set(id, train);
    this.addToNode(startNodeId, id, -1);
  }

  removeTrain(id: number): boolean {
    const train = this.trains.get(id);
    if (train === undefined) return false;

    if (train.state === TrainState.AtNode) {
      this.removeFromNode(train.nodeId, id);
    } else {
      this.edgeReservation.delete(train.edgeId);
    }
    return this.trains.delete(id);
  }

  get trainCount(): number {
    return this.trains.size;
  }

  getNodeTrainCount(nodeId: number): number {
    return this.nodeOccupants.get(nodeId)?.size ?? 0;
  }

  getRouteTrainCount(routeId: number): number {
    let count = 0;
    for (const train of this.trains.values()) {
      if (train.routeId === routeId) count++;
    }
    return count;
  }

  getAllTrains(): readonly Train[] {
    return [...this.trains.values()];
  }

  // --- 更新 ---

  /** 列車がノードに到着した時に呼び出されるコールバック */
  onTrainArrive: ((train: Train, nodeId: number) => void) | null = null;

  update(dt: number, graph: Graph): void {
    for (const train of this.trains.values()) {
      switch (train.state) {
        case TrainState.AtNode:
          this.updateAtNode(train, dt, graph);
          break;
        case TrainState.OnEdge:
          this.updateOnEdge(train, dt, graph);
          break;
      }
    }
  }

  getTrainPositions(graph: Graph): TrainPosition[] {
    const result: TrainPosition[] = [];
    for (const train of this.trains.values()) {
      const pos = this.getPosition(train, graph);
      if (pos !== null) {
        result.push(pos);
      }
    }
    return result;
  }

  // --- ノード滞在中 ---

  private updateAtNode(train: Train, dt: number, graph: Graph): void {
    train.waitTime -= dt;
    if (train.waitTime > 0) return;

    const targetEdge = this.findEdgeToNextStop(train, graph);
    if (targetEdge === undefined) {
      train.waitTime = RETRY_WAIT;
      return;
    }

    if (!this.tryReserveEdge(targetEdge.id, train.id)) {
      train.waitTime = RETRY_WAIT;
      return;
    }

    // 目的地ノードが受け入れ可能か確認する
    const destNodeId = targetEdge.fromId === train.nodeId ? targetEdge.toId : targetEdge.fromId;
    if (!this.canEnterNode(destNodeId, targetEdge.id, graph)) {
      // 目的地が満杯 - 予約を解放して待機する
      this.edgeReservation.delete(targetEdge.id);
      train.waitTime = RETRY_WAIT;
      return;
    }

    // 出発
    this.removeFromNode(train.nodeId, train.id);
    train.state = TrainState.OnEdge;
    train.edgeId = targetEdge.id;

    if (targetEdge.fromId === train.nodeId) {
      train.forward = true;
      train.pathIndex = 0;
    } else {
      train.forward = false;
      train.pathIndex = targetEdge.path.length - 1;
    }
    train.progress = 0;
  }

  // --- エッジ走行中 ---

  private updateOnEdge(train: Train, dt: number, graph: Graph): void {
    const edge = graph.getEdge(train.edgeId);
    if (edge === undefined) return;

    const path = edge.path;
    if (path.length < 2) return;

    train.progress += train.speed * dt;

    while (train.progress >= 1) {
      train.progress -= 1;

      if (train.forward) {
        train.pathIndex++;
        if (train.pathIndex >= path.length - 1) {
          train.pathIndex = path.length - 1;
          train.progress = 0;
          this.arrive(train, edge, edge.toId, graph);
          return;
        }
      } else {
        train.pathIndex--;
        if (train.pathIndex <= 0) {
          train.pathIndex = 0;
          train.progress = 0;
          this.arrive(train, edge, edge.fromId, graph);
          return;
        }
      }
    }
  }

  private arrive(train: Train, edge: GraphEdge, nodeId: number, graph: Graph): void {
    const node = graph.getNode(nodeId);
    if (node === undefined) return;

    const isRouteStop = this.routes.get(train.routeId)?.stops.includes(nodeId) === true;

    // 通過：路線の停車駅でなければ、即座に走行を継続しようとする
    if (!isRouteStop) {
      const nextEdge = this.findEdgeToNextStop(train, graph, nodeId);
      if (nextEdge !== undefined && this.tryReserveEdge(nextEdge.id, train.id)) {
        this.edgeReservation.delete(edge.id);
        train.edgeId = nextEdge.id;
        if (nextEdge.fromId === nodeId) {
          train.forward = true;
          train.pathIndex = 0;
        } else {
          train.forward = false;
          train.pathIndex = nextEdge.path.length - 1;
        }
        train.progress = 0;
        return;
      }
    }

    // ノードがこの列車を受け入れ可能か確認する（容量＋方向配置）
    if (!this.canEnterNode(nodeId, edge.id, graph)) {
      train.progress = 0;
      return;
    }

    // 容量1のノードの場合、次のエッジの空き状況も確認する
    if (node.capacity <= 1) {
      const nextEdge = this.findEdgeToNextStop(train, graph, nodeId);
      if (nextEdge !== undefined) {
        const holder = this.edgeReservation.get(nextEdge.id);
        if (holder !== undefined && holder !== train.id) {
          train.progress = 0;
          return;
        }
      }
    }

    // ノードに入って停止する
    this.edgeReservation.delete(edge.id);
    this.addToNode(nodeId, train.id, edge.id);
    train.state = TrainState.AtNode;
    train.nodeId = nodeId;
    train.waitTime = isRouteStop ? STATION_WAIT : RETRY_WAIT;

    if (isRouteStop) {
      this.onTrainArrive?.(train, nodeId);
    }

    // 目的の停車駅であれば路線を進める
    this.advanceRouteIfAtStop(train);
  }

  // --- 路線ロジック ---

  /**
   * 列車が目的の停車駅に到着した場合、次の停車駅へ進める。
   */
  private advanceRouteIfAtStop(train: Train): void {
    const route = this.routes.get(train.routeId);
    if (route === undefined) return;

    const targetNodeId = route.stops[train.routeStopIndex];
    if (targetNodeId !== train.nodeId) return;

    // 進行
    if (route.mode === RouteMode.Loop) {
      train.routeStopIndex = (train.routeStopIndex + 1) % route.stops.length;
    } else {
      // シャトル
      const next = train.routeStopIndex + train.routeDirection;
      if (next < 0 || next >= route.stops.length) {
        // 方向を反転する
        train.routeDirection = train.routeDirection === 1 ? -1 : 1;
        train.routeStopIndex += train.routeDirection;
      } else {
        train.routeStopIndex = next;
      }
    }
  }

  /**
   * 列車の現在位置から次の停車駅へ接続するエッジを見つける。
   * 目的の停車駅ノードに向かってグラフを探索する。
   * fromNodeIdが指定された場合、先読みのためにtrain.nodeIdの代わりに使用する。
   */
  private findEdgeToNextStop(
    train: Train,
    graph: Graph,
    fromNodeId?: number,
  ): GraphEdge | undefined {
    const route = this.routes.get(train.routeId);
    if (route === undefined) return undefined;

    const currentNode = fromNodeId ?? train.nodeId;
    const targetNodeId = route.stops[train.routeStopIndex];
    if (targetNodeId === undefined) return undefined;

    // currentNodeからtargetNodeIdに向かうエッジを見つける
    const edges = graph.getEdgesFor(currentNode);

    // 直接接続
    for (const edge of edges) {
      const otherNode = edge.fromId === currentNode ? edge.toId : edge.fromId;
      if (otherNode === targetNodeId) return edge;
    }

    // 直接接続なし - 目的地に近い隣接ノードへ向かうエッジを選択する
    // 現時点では、来た方向以外の接続エッジを選択する
    // （単純なヒューリスティック：BFSの方が良いが、線形グラフには十分）
    const targetNode = graph.getNode(targetNodeId);
    if (targetNode === undefined) return undefined;

    let bestEdge: GraphEdge | undefined;
    let bestDist = Infinity;

    for (const edge of edges) {
      const otherNodeId = edge.fromId === currentNode ? edge.toId : edge.fromId;
      const otherNode = graph.getNode(otherNodeId);
      if (otherNode === undefined) continue;

      const dx = otherNode.tileX - targetNode.tileX;
      const dy = otherNode.tileY - targetNode.tileY;
      const dist = dx * dx + dy * dy;
      if (dist < bestDist) {
        bestDist = dist;
        bestEdge = edge;
      }
    }

    return bestEdge;
  }

  // --- 予約 ---

  private tryReserveEdge(edgeId: number, trainId: number): boolean {
    const holder = this.edgeReservation.get(edgeId);
    if (holder !== undefined && holder !== trainId) return false;
    this.edgeReservation.set(edgeId, trainId);
    return true;
  }

  // --- ノード占有 ---

  private addToNode(nodeId: number, trainId: number, fromEdgeId: number): void {
    let map = this.nodeOccupants.get(nodeId);
    if (map === undefined) {
      map = new Map();
      this.nodeOccupants.set(nodeId, map);
    }
    map.set(trainId, fromEdgeId);
  }

  private removeFromNode(nodeId: number, trainId: number): void {
    this.nodeOccupants.get(nodeId)?.delete(trainId);
  }


  /**
   * 信号配置を考慮して、指定されたエッジから到着する列車を
   * ノードが受け入れ可能か確認する。
   */
  private canEnterNode(
    nodeId: number,
    fromEdgeId: number,
    graph: Graph,
  ): boolean {
    const node = graph.getNode(nodeId);
    if (node === undefined) return false;

    const occupants = this.nodeOccupants.get(nodeId);
    if (occupants === undefined || occupants.size === 0) return true;
    if (occupants.size >= node.capacity) return false;

    // 信号場以外のノードは総容量のみ確認する
    if (node.kind !== NodeKind.SignalStation) return true;

    if (node.signalLayout === SignalLayout.Passing) {
      // 方向ごとに1線路：任意のエッジからの列車は最大1台
      for (const arrivedFrom of occupants.values()) {
        if (arrivedFrom === fromEdgeId) return false;
      }
      return true;
    }

    // 追い越し：全占有列車が同じ方向からでなければならない
    for (const arrivedFrom of occupants.values()) {
      if (arrivedFrom !== fromEdgeId) return false;
    }
    return true;
  }

  // --- 位置 ---

  private static sumCargo(cargo: Map<number, number>): number {
    let total = 0;
    for (const v of cargo.values()) {
      total += v;
    }
    return total;
  }

  private getPosition(train: Train, graph: Graph): TrainPosition | null {
    const cargoTotal = Simulation.sumCargo(train.cargo);

    if (train.state === TrainState.AtNode) {
      const node = graph.getNode(train.nodeId);
      if (node === undefined) return null;
      return { trainId: train.id, worldX: node.tileX, worldY: node.tileY, cargoTotal };
    }

    const edge = graph.getEdge(train.edgeId);
    if (edge === undefined) return null;

    const path = edge.path;
    const current = path[train.pathIndex];
    if (current === undefined) return null;

    let nextIdx: number;
    if (train.forward) {
      nextIdx = Math.min(train.pathIndex + 1, path.length - 1);
    } else {
      nextIdx = Math.max(train.pathIndex - 1, 0);
    }
    const next: PathNode | undefined = path[nextIdx];
    if (next === undefined) return null;

    return {
      trainId: train.id,
      worldX: current.x + (next.x - current.x) * train.progress,
      worldY: current.y + (next.y - current.y) * train.progress,
      cargoTotal,
    };
  }
}
