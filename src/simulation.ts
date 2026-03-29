import type { Graph, GraphEdge } from "./graph.js";
import { getSectionAt, getSectionCount } from "./graph.js";
import type { PathNode } from "./pathfinding.js";
import { BlockSystem } from "./block-system.js";

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
  name: string;
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
  /** 現在のエッジ内セクションインデックス */
  sectionIndex: number;

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
  readonly dirX: number;
  readonly dirY: number;
  /** スロット内（停車中）か待機列か */
  readonly inSlot: boolean;
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
  readonly blocks = new BlockSystem();

  // --- 路線API ---

  addRoute(stops: readonly number[], mode: RouteMode, name?: string): Route {
    const id = this.nextId++;
    const route: Route = { id, name: name ?? `Route ${String(id)}`, stops, mode };
    this.routes.set(id, route);
    return route;
  }

  renameRoute(id: number, name: string): void {
    const route = this.routes.get(id);
    if (route !== undefined) {
      route.name = name;
    }
  }

  updateRouteStops(id: number, stops: readonly number[]): boolean {
    const route = this.routes.get(id);
    if (route === undefined) return false;
    this.routes.set(id, { ...route, stops });
    return true;
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

  /** 路線の全停車駅が順にグラフ上で到達可能か検証する */
  isRouteValid(stops: readonly number[], graph: Graph): boolean {
    for (let i = 0; i < stops.length - 1; i++) {
      const from = stops[i];
      const to = stops[i + 1];
      if (from === undefined || to === undefined) return false;
      if (this.bfsFirstEdge(from, to, graph) === undefined) return false;
    }
    return true;
  }

  // --- 列車API ---

  addTrain(routeId: number, graph: Graph): void {
    const route = this.routes.get(routeId);
    if (route === undefined || route.stops.length < 2) return;
    if (!this.isRouteValid(route.stops, graph)) return;

    const startNodeId = route.stops[0];
    if (startNodeId === undefined) return;

    const node = graph.getNode(startNodeId);
    if (node === undefined) return;

    // スポーン先のノード容量を確認する
    if (this.blocks.getNodeTrainCount(startNodeId) >= node.capacity) return;

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
      sectionIndex: 0,
    };
    this.trains.set(id, train);
    this.blocks.placeAtNode(startNodeId, id);
  }

  removeTrain(id: number): boolean {
    const train = this.trains.get(id);
    if (train === undefined) return false;

    this.blocks.removeTrain(id, train.state === TrainState.AtNode, train.nodeId, train.edgeId, train.sectionIndex, train.forward);
    return this.trains.delete(id);
  }

  get trainCount(): number {
    return this.trains.size;
  }

  /** エッジ分割後: 古いエッジ上の列車を新エッジに移動する */
  handleEdgeSplit(
    oldEdgeId: number,
    newEdge1: { id: number; path: readonly { x: number; y: number }[] },
    newEdge2: { id: number; path: readonly { x: number; y: number }[] },
    splitPathIndex: number,
    graph: Graph,
  ): void {
    for (const train of this.trains.values()) {
      if (train.state !== TrainState.OnEdge || train.edgeId !== oldEdgeId) continue;
      this.blocks.dequeueSection(oldEdgeId, train.sectionIndex, train.forward, train.id);

      if (train.pathIndex < splitPathIndex) {
        train.edgeId = newEdge1.id;
      } else {
        train.edgeId = newEdge2.id;
        train.pathIndex -= splitPathIndex;
      }

      const edge = graph.getEdge(train.edgeId);
      if (edge !== undefined) {
        train.sectionIndex = getSectionAt(edge, train.pathIndex);
        this.blocks.enqueueSection(train.edgeId, train.sectionIndex, train.forward, train.id);
      }
    }
  }

  /** エッジ結合後: 古いエッジ上の列車を新エッジに移動する */
  handleEdgeMerge(
    oldEdgeIds: [number, number],
    newEdgeId: number,
    splitPathIndex: number,
    graph: Graph,
  ): void {
    for (const train of this.trains.values()) {
      if (train.state !== TrainState.OnEdge) continue;
      const oldIdx = oldEdgeIds.indexOf(train.edgeId);
      if (oldIdx === -1) continue;

      this.blocks.dequeueSection(train.edgeId, train.sectionIndex, train.forward, train.id);

      if (oldIdx === 1) {
        train.pathIndex += splitPathIndex;
      }
      train.edgeId = newEdgeId;

      const edge = graph.getEdge(newEdgeId);
      if (edge !== undefined) {
        train.sectionIndex = getSectionAt(edge, train.pathIndex);
        this.blocks.enqueueSection(train.edgeId, train.sectionIndex, train.forward, train.id);
      }
    }
  }


  getNodeTrainCount(nodeId: number): number {
    return this.blocks.getNodeTrainCount(nodeId);
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
    // フェーズ1: ノード待機中の列車の出発判定（エッジ上の列車より先に処理）
    for (const train of this.trains.values()) {
      if (train.state === TrainState.AtNode) {
        this.updateAtNode(train, dt, graph);
      }
    }
    // フェーズ2: エッジ上の列車の移動（到着処理含む）
    for (const train of this.trains.values()) {
      if (train.state === TrainState.OnEdge) {
        this.updateOnEdge(train, dt, graph);
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

  /**
   * ノード滞在中の列車: 次の閉塞区間（エッジ）が空いていれば出発する。
   */
  private updateAtNode(train: Train, dt: number, graph: Graph): void {
    train.waitTime -= dt;
    if (train.waitTime > 0) return;

    // 次のエッジ（閉塞区間）を探す
    const targetEdge = this.findEdgeToNextStop(train, graph);
    if (targetEdge === undefined) {
      train.waitTime = RETRY_WAIT;
      return;
    }

    // 出発を試みる
    const goForward = targetEdge.fromId === train.nodeId;
    const startSection = goForward ? 0 : getSectionCount(targetEdge) - 1;
    if (!this.blocks.tryDepart(train.id, train.nodeId, targetEdge.id, startSection, goForward, graph)) {
      train.waitTime = RETRY_WAIT;
      return;
    }
    train.state = TrainState.OnEdge;
    train.edgeId = targetEdge.id;
    train.sectionIndex = startSection;

    if (goForward) {
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
    // エッジ端またはセクション境界で待機中
    if (train.waitTime > 0) {
      train.waitTime -= dt;
      return;
    }

    const edge = graph.getEdge(train.edgeId);
    if (edge === undefined) return;

    const path = edge.path;
    if (path.length < 2) return;

    train.progress += train.speed * dt;

    while (train.progress >= 1) {
      if (train.forward) {
        const nextSection = getSectionAt(edge, train.pathIndex + 1);
        if (nextSection !== train.sectionIndex) {
          if (!this.blocks.tryAdvanceSection(train.id, edge.id, train.sectionIndex, nextSection, train.forward)) {
            // 信号手前で停止: progressを境界手前に固定
            // セクション境界の直前で停止（progressが1.0未満に戻す）
            train.progress = 0.99;
            train.waitTime = RETRY_WAIT;
            return;
          }
          train.sectionIndex = nextSection;
        }
        train.progress -= 1;
        train.pathIndex++;
        if (train.pathIndex >= path.length - 1) {
          train.pathIndex = path.length - 1;
          train.progress = 0;
          this.arrive(train, edge, edge.toId, graph);
          return;
        }
      } else {
        const nextSection = getSectionAt(edge, train.pathIndex - 1);
        if (nextSection !== train.sectionIndex) {
          if (!this.blocks.tryAdvanceSection(train.id, edge.id, train.sectionIndex, nextSection, train.forward)) {
            // セクション境界の直前で停止（progressが1.0未満に戻す）
            train.progress = 0.99;
            train.waitTime = RETRY_WAIT;
            return;
          }
          train.sectionIndex = nextSection;
        }
        train.progress -= 1;
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

  /**
   * 閉塞区間の端に到着。キューベースなので常にノードに入る。
   * 非停車ノードでは即座に次エッジへの乗り換えを試みる。
   */
  private arrive(train: Train, edge: GraphEdge, nodeId: number, graph: Graph): void {
    this.blocks.arrive(train.id, edge.id, train.sectionIndex, train.forward, nodeId);

    train.state = TrainState.AtNode;
    train.nodeId = nodeId;

    const isRouteStop = this.routes.get(train.routeId)?.stops.includes(nodeId) === true;

    if (isRouteStop) {
      train.waitTime = STATION_WAIT;
      // スロット内の場合のみ貨物積み下ろし
      if (this.blocks.isInSlot(nodeId, train.id, graph)) {
        this.onTrainArrive?.(train, nodeId);
      }
      this.advanceRouteIfAtStop(train);
      return;
    }

    // 非停車ノード: 即座に次エッジへ乗り換えを試みる
    const nextEdge = this.findEdgeToNextStop(train, graph);
    if (nextEdge === undefined) {
      train.waitTime = RETRY_WAIT;
      return;
    }

    const goForward = nextEdge.fromId === train.nodeId;
    const startSection = goForward ? 0 : getSectionCount(nextEdge) - 1;
    if (this.blocks.tryDepart(train.id, train.nodeId, nextEdge.id, startSection, goForward, graph)) {
      // 即乗り換え成功: OnEdgeのまま継続
      train.state = TrainState.OnEdge;
      train.edgeId = nextEdge.id;
      train.sectionIndex = startSection;
      train.forward = goForward;
      train.pathIndex = goForward ? 0 : nextEdge.path.length - 1;
      train.progress = 0;
    } else {
      // 乗り換え失敗: ノードで待機
      train.waitTime = RETRY_WAIT;
    }
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
    if (currentNode === targetNodeId) return undefined;

    // BFSでtargetNodeIdへの最短経路の最初のエッジを見つける
    return this.bfsFirstEdge(currentNode, targetNodeId, graph);
  }

  /**
   * BFSでstartからgoalへの経路を探索し、startから出発する最初のエッジを返す。
   * 到達不可能ならundefinedを返す。
   */
  private bfsFirstEdge(
    start: number,
    goal: number,
    graph: Graph,
  ): GraphEdge | undefined {
    // cameFrom: nodeId -> { fromNodeId, viaEdge }
    const cameFrom = new Map<number, { from: number; edge: GraphEdge }>();
    const queue: number[] = [start];
    const visited = new Set<number>([start]);

    while (queue.length > 0) {
      const current = queue.shift();
      if (current === undefined) break;

      for (const edge of graph.getEdgesFor(current)) {
        const neighbor = edge.fromId === current ? edge.toId : edge.fromId;
        if (visited.has(neighbor)) continue;
        visited.add(neighbor);
        cameFrom.set(neighbor, { from: current, edge });

        if (neighbor === goal) {
          // 経路を逆にたどってstartの次のエッジを返す
          let node = goal;
          for (let step = 0; step < cameFrom.size; step++) {
            const prev = cameFrom.get(node);
            if (prev === undefined) return undefined;
            if (prev.from === start) return prev.edge;
            node = prev.from;
          }
          return undefined;
        }

        queue.push(neighbor);
      }
    }

    return undefined;
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
      const inSlot = this.blocks.isInSlot(train.nodeId, train.id, graph);
      const queuePosition = this.blocks.getQueuePosition(train.nodeId, train.id);
      const totalAtNode = this.blocks.getNodeTrainCount(train.nodeId);
      const cap = node.capacity;

      // 待機列(左) → スロット(右) の順で配置
      let displayIdx: number;
      if (inSlot) {
        // スロット内: 右側
        const waitCount = Math.max(0, totalAtNode - cap);
        displayIdx = waitCount + Math.min(queuePosition, cap - 1);
      } else {
        // 待機列: 左側
        displayIdx = queuePosition - cap;
      }
      const offsetX = totalAtNode > 1
        ? (displayIdx - (totalAtNode - 1) / 2) * 0.4
        : 0;

      return {
        trainId: train.id,
        worldX: node.tileX + offsetX,
        worldY: node.tileY,
        cargoTotal,
        dirX: 0,
        dirY: 0,
        inSlot,
      };
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

    const dx = next.x - current.x;
    const dy = next.y - current.y;
    const len = Math.sqrt(dx * dx + dy * dy);
    const dirX = len > 0 ? dx / len : 0;
    const dirY = len > 0 ? dy / len : 0;

    return {
      trainId: train.id,
      worldX: current.x + dx * train.progress,
      worldY: current.y + dy * train.progress,
      cargoTotal,
      dirX,
      dirY,
      inSlot: true,
    };
  }
}
