import type { Graph, GraphEdge } from "./graph.js";
import type { PathNode } from "./pathfinding.js";

// --- Route ---

export const RouteMode = {
  Shuttle: 0,
  Loop: 1,
} as const;

export type RouteMode = (typeof RouteMode)[keyof typeof RouteMode];

export interface Route {
  readonly id: number;
  /** Ordered list of node ids to visit */
  readonly stops: readonly number[];
  readonly mode: RouteMode;
}

// --- Train ---

export const TrainState = {
  AtNode: 0,
  OnEdge: 1,
} as const;

export type TrainState = (typeof TrainState)[keyof typeof TrainState];

export interface Train {
  readonly id: number;
  state: TrainState;

  // AtNode state
  nodeId: number;

  // OnEdge state
  edgeId: number;
  forward: boolean;
  pathIndex: number;
  progress: number;

  // Shared
  speed: number;
  waitTime: number;

  // Route
  routeId: number;
  routeStopIndex: number;
  routeDirection: 1 | -1;

  // Cargo
  cargo: Map<number, number>;
}

export interface TrainPosition {
  readonly trainId: number;
  readonly worldX: number;
  readonly worldY: number;
  readonly cargoTotal: number;
}

// --- Constants ---

const DEFAULT_SPEED = 3.0;
const STATION_WAIT = 2.0;
const RETRY_WAIT = 0.5;

// --- Simulation ---

export class Simulation {
  private trains = new Map<number, Train>();
  private routes = new Map<number, Route>();
  private nextId = 1;

  private edgeReservation = new Map<number, number>();
  private nodeOccupants = new Map<number, Set<number>>();

  // --- Route API ---

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

  // --- Train API ---

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
    this.addToNode(startNodeId, id);
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

  getAllTrains(): readonly Train[] {
    return [...this.trains.values()];
  }

  // --- Update ---

  /** Callback invoked when a train arrives at a node */
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

  // --- AtNode ---

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

    // Depart
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

  // --- OnEdge ---

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

    // Check node capacity
    if (this.getNodeOccupancy(nodeId) >= node.capacity) {
      train.progress = 0;
      return;
    }

    // Look ahead: is the next edge free?
    // If node capacity > 1 (signal station), allow entry even if next edge is busy.
    // The extra capacity allows opposing trains to swap edges safely.
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

    // Enter node
    this.edgeReservation.delete(edge.id);
    this.addToNode(nodeId, train.id);
    train.state = TrainState.AtNode;
    train.nodeId = nodeId;
    train.waitTime = STATION_WAIT;

    // Only load/unload at route stops
    const route = this.routes.get(train.routeId);
    if (route?.stops.includes(nodeId) === true) {
      this.onTrainArrive?.(train, nodeId);
    }

    // Advance route if this is the target stop
    this.advanceRouteIfAtStop(train);
  }

  // --- Route logic ---

  /**
   * If the train has arrived at its target stop, advance to the next one.
   */
  private advanceRouteIfAtStop(train: Train): void {
    const route = this.routes.get(train.routeId);
    if (route === undefined) return;

    const targetNodeId = route.stops[train.routeStopIndex];
    if (targetNodeId !== train.nodeId) return;

    // Advance
    if (route.mode === RouteMode.Loop) {
      train.routeStopIndex = (train.routeStopIndex + 1) % route.stops.length;
    } else {
      // Shuttle
      const next = train.routeStopIndex + train.routeDirection;
      if (next < 0 || next >= route.stops.length) {
        // Reverse direction
        train.routeDirection = train.routeDirection === 1 ? -1 : 1;
        train.routeStopIndex += train.routeDirection;
      } else {
        train.routeStopIndex = next;
      }
    }
  }

  /**
   * Find the edge connecting the train's current position to the next stop.
   * Walks the graph toward the target stop node.
   * If fromNodeId is provided, use that instead of train.nodeId (for lookahead).
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

    // Find an edge from currentNode that leads toward targetNodeId
    const edges = graph.getEdgesFor(currentNode);

    // Direct connection
    for (const edge of edges) {
      const otherNode = edge.fromId === currentNode ? edge.toId : edge.fromId;
      if (otherNode === targetNodeId) return edge;
    }

    // Not directly connected - pick the edge leading to a neighbor closer to target
    // For now, just pick any connected edge that isn't back where we came from
    // (simple heuristic: BFS would be better but this works for linear graphs)
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

  // --- Reservation ---

  private tryReserveEdge(edgeId: number, trainId: number): boolean {
    const holder = this.edgeReservation.get(edgeId);
    if (holder !== undefined && holder !== trainId) return false;
    this.edgeReservation.set(edgeId, trainId);
    return true;
  }

  // --- Node occupancy ---

  private addToNode(nodeId: number, trainId: number): void {
    let set = this.nodeOccupants.get(nodeId);
    if (set === undefined) {
      set = new Set();
      this.nodeOccupants.set(nodeId, set);
    }
    set.add(trainId);
  }

  private removeFromNode(nodeId: number, trainId: number): void {
    this.nodeOccupants.get(nodeId)?.delete(trainId);
  }

  private getNodeOccupancy(nodeId: number): number {
    return this.nodeOccupants.get(nodeId)?.size ?? 0;
  }

  // --- Position ---

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
