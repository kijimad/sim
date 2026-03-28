import type { Graph, GraphEdge } from "./graph.js";
import type { PathNode } from "./pathfinding.js";

export interface Train {
  readonly id: number;
  /** Current edge the train is on */
  edgeId: number;
  /** Index into the edge's path array */
  pathIndex: number;
  /** Progress between current path node and next (0..1) */
  progress: number;
  /** true = traveling from→to, false = to→from */
  forward: boolean;
  /** Speed in tiles per second */
  speed: number;
  /** Time spent waiting at station (seconds remaining) */
  waitTime: number;
}

export interface TrainPosition {
  readonly trainId: number;
  readonly worldX: number;
  readonly worldY: number;
}

const STATION_WAIT_TIME = 2.0;
const DEFAULT_SPEED = 3.0;

export class Simulation {
  private trains = new Map<number, Train>();
  private nextTrainId = 1;
  /** Tracks which edge is locked and by which train */
  private edgeLocks = new Map<number, number>();

  addTrain(edgeId: number): Train {
    const id = this.nextTrainId++;
    const train: Train = {
      id,
      edgeId,
      pathIndex: 0,
      progress: 0,
      forward: true,
      speed: DEFAULT_SPEED,
      waitTime: STATION_WAIT_TIME,
    };
    this.trains.set(id, train);
    this.edgeLocks.set(edgeId, id);
    return train;
  }

  removeTrain(id: number): boolean {
    const train = this.trains.get(id);
    if (train === undefined) return false;
    const lockHolder = this.edgeLocks.get(train.edgeId);
    if (lockHolder === id) {
      this.edgeLocks.delete(train.edgeId);
    }
    return this.trains.delete(id);
  }

  getAllTrains(): readonly Train[] {
    return [...this.trains.values()];
  }

  get trainCount(): number {
    return this.trains.size;
  }

  update(dt: number, graph: Graph): void {
    for (const train of this.trains.values()) {
      this.updateTrain(train, dt, graph);
    }
  }

  private updateTrain(train: Train, dt: number, graph: Graph): void {
    // Waiting at station
    if (train.waitTime > 0) {
      train.waitTime -= dt;
      return;
    }

    const edge = graph.getEdge(train.edgeId);
    if (edge === undefined) return;

    const path = edge.path;
    if (path.length < 2) return;

    // Move along path
    const movement = train.speed * dt;
    train.progress += movement;

    while (train.progress >= 1) {
      train.progress -= 1;

      if (train.forward) {
        train.pathIndex++;
        if (train.pathIndex >= path.length - 1) {
          // Reached end of edge
          train.pathIndex = path.length - 1;
          train.progress = 0;
          this.arriveAtEndpoint(train, edge, graph);
          return;
        }
      } else {
        train.pathIndex--;
        if (train.pathIndex <= 0) {
          // Reached start of edge
          train.pathIndex = 0;
          train.progress = 0;
          this.arriveAtEndpoint(train, edge, graph);
          return;
        }
      }
    }
  }

  private arriveAtEndpoint(
    train: Train,
    currentEdge: GraphEdge,
    graph: Graph,
  ): void {
    const nodeId = train.forward ? currentEdge.toId : currentEdge.fromId;

    // Try to find next edge to continue on
    const connectedEdges = graph.getEdgesFor(nodeId);
    const nextEdge = connectedEdges.find(
      (e) => e.id !== currentEdge.id && !this.isEdgeLocked(e.id, train.id),
    );

    if (nextEdge !== undefined) {
      // Move to next edge
      this.edgeLocks.delete(currentEdge.id);
      this.edgeLocks.set(nextEdge.id, train.id);
      train.edgeId = nextEdge.id;

      // Determine direction on new edge
      if (nextEdge.fromId === nodeId) {
        train.forward = true;
        train.pathIndex = 0;
      } else {
        train.forward = false;
        train.pathIndex = nextEdge.path.length - 1;
      }
      train.progress = 0;
      train.waitTime = STATION_WAIT_TIME;
    } else {
      // No next edge or all locked - reverse on current edge
      train.forward = !train.forward;
      train.progress = 0;
      train.waitTime = STATION_WAIT_TIME;
    }
  }

  private isEdgeLocked(edgeId: number, requestingTrainId: number): boolean {
    const holder = this.edgeLocks.get(edgeId);
    return holder !== undefined && holder !== requestingTrainId;
  }

  getTrainPositions(graph: Graph): TrainPosition[] {
    const positions: TrainPosition[] = [];
    for (const train of this.trains.values()) {
      const pos = this.computeTrainPosition(train, graph);
      if (pos !== null) {
        positions.push(pos);
      }
    }
    return positions;
  }

  private computeTrainPosition(
    train: Train,
    graph: Graph,
  ): TrainPosition | null {
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

    const t = train.waitTime > 0 ? 0 : train.progress;
    return {
      trainId: train.id,
      worldX: current.x + (next.x - current.x) * t,
      worldY: current.y + (next.y - current.y) * t,
    };
  }
}
