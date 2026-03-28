import type { RouteMode } from "./simulation.js";
import { Camera } from "./camera.js";
import { Economy, generateCities } from "./economy.js";
import { Graph, NodeKind } from "./graph.js";
import { InputHandler } from "./input.js";
import { findPath } from "./pathfinding.js";
import { Renderer, TILE_SIZE } from "./renderer.js";
import { Simulation } from "./simulation.js";
import { generateTerrain } from "./terrain.js";
import { TileMap } from "./tilemap.js";
import { Terrain } from "./types.js";

export const ToolMode = {
  Station: "station",
  SignalStation: "signal-station",
  Route: "route",
} as const;

export type ToolMode = (typeof ToolMode)[keyof typeof ToolMode];

const MAP_SIZE = 256;

export interface GameSnapshot {
  readonly toolMode: ToolMode;
  readonly selectedNodeId: number | null;
  readonly routeStops: readonly number[];
  readonly lastRouteId: number | null;
  readonly trainCount: number;
  readonly routeCount: number;
  readonly money: number;
  readonly cityCount: number;
}

export type GameEventListener = () => void;

export class Game {
  private readonly renderer: Renderer;
  private readonly canvas: HTMLCanvasElement;
  private readonly graph: Graph;
  private readonly sim: Simulation;
  private readonly economy: Economy;
  private readonly map: TileMap;
  private readonly camera: Camera;

  private toolMode: ToolMode = ToolMode.Station;
  private selectedNodeId: number | null = null;
  private routeStops: number[] = [];
  private lastRouteId: number | null = null;
  private stationCount = 0;

  private listeners: GameEventListener[] = [];
  private lastTime = performance.now();
  private animFrameId = 0;
  private cachedSnapshot: GameSnapshot | null = null;

  constructor(canvas: HTMLCanvasElement, ctx: CanvasRenderingContext2D) {
    this.canvas = canvas;
    this.renderer = new Renderer(ctx, canvas);

    this.map = new TileMap(MAP_SIZE, MAP_SIZE);
    generateTerrain(this.map, { seed: Date.now() });

    this.graph = new Graph();
    this.sim = new Simulation();
    this.economy = new Economy();

    const seed = Date.now();
    generateCities(this.map, this.economy, 8, seed);

    // Wire up train arrival to economy
    this.sim.onTrainArrive = (train, nodeId): void => {
      const { newCargo } = this.economy.trainArrive(nodeId, train.cargo, this.graph);
      train.cargo = newCargo;
    };

    const centerWorld = (MAP_SIZE * TILE_SIZE) / 2;
    this.camera = new Camera(centerWorld, centerWorld);

    new InputHandler(canvas, this.camera, {
      requestRender: (): void => { /* continuous */ },
      onTileClick: (tx: number, ty: number): void => { this.onTileClick(tx, ty); },
      onKeyPress: (key: string): void => { this.onKeyPress(key); },
    });
  }

  // --- Subscription ---

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
      selectedNodeId: this.selectedNodeId,
      routeStops: [...this.routeStops],
      lastRouteId: this.lastRouteId,
      trainCount: this.sim.trainCount,
      routeCount: this.sim.getAllRoutes().length,
      money: this.economy.money,
      cityCount: this.economy.getAllCities().length,
    };
    return this.cachedSnapshot;
  }

  // --- Lifecycle ---

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
        (nodeId) => this.sim.getNodeTrainCount(nodeId),
      );
      this.renderer.renderTrains(
        this.sim.getTrainPositions(this.graph),
        this.camera,
      );

      this.animFrameId = requestAnimationFrame(loop);
    };
    this.animFrameId = requestAnimationFrame(loop);
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

  // --- Actions (called from UI) ---

  setToolMode(mode: ToolMode): void {
    this.toolMode = mode;
    this.routeStops = [];
    this.selectedNodeId = null;
    this.notify();
  }

  addTrain(): void {
    if (this.lastRouteId === null) return;
    this.sim.addTrain(this.lastRouteId, this.graph);
    this.notify();
  }

  confirmRoute(mode: RouteMode): void {
    if (this.routeStops.length < 2) return;
    const route = this.sim.addRoute(this.routeStops, mode);
    this.lastRouteId = route.id;
    this.routeStops = [];
    this.selectedNodeId = null;
    this.notify();
  }

  cancelRoute(): void {
    this.routeStops = [];
    this.selectedNodeId = null;
    this.notify();
  }

  // --- Input handling ---

  private onTileClick(tileX: number, tileY: number): void {
    if (!this.map.inBounds(tileX, tileY)) return;

    if (this.toolMode === ToolMode.Route) {
      this.handleRouteClick(tileX, tileY);
      return;
    }

    this.handleBuildClick(tileX, tileY);
  }

  private onKeyPress(key: string): void {
    switch (key) {
      case "1":
        this.setToolMode(ToolMode.Station);
        break;
      case "2":
        this.setToolMode(ToolMode.SignalStation);
        break;
      case "3":
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
    if (node.kind !== NodeKind.Station) return; // Only stations as stops

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

      // If no node selected and clicking near an existing edge, split it
      if (this.selectedNodeId === null) {
        if (this.trySplitEdge(tileX, tileY)) return;
      }

      const { kind, name } = this.makeNodeInfo();
      const node = this.graph.addNode(kind, tileX, tileY, name);

      if (this.selectedNodeId !== null) {
        this.connectNodes(this.selectedNodeId, node.id);
        this.selectedNodeId = null;
      }
    }
    this.notify();
  }

  private makeNodeInfo(): { kind: NodeKind; name: string } {
    if (this.toolMode === ToolMode.SignalStation) {
      return { kind: NodeKind.SignalStation, name: "S" };
    }
    this.stationCount++;
    return { kind: NodeKind.Station, name: String(this.stationCount) };
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

    const { kind, name } = this.makeNodeInfo();
    const node = this.graph.addNode(kind, pathPoint.x, pathPoint.y, name);
    this.graph.splitEdge(closest.edge.id, node, closest.pathIndex);
    this.notify();
    return true;
  }
}
