import { Camera } from "./camera.js";
import { GameWorld } from "./game-world.js";
import { InputHandler } from "./input.js";
import { Renderer, TILE_SIZE } from "./renderer.js";

// game-world.ts から型を再エクスポートする
export type {
  GameConfig,
  GameSnapshot,
  RouteInfo,
  TrainInfo,
  CityInfo,
  InspectInfo,
  Toast,
  FloatingText,
} from "./game-world.js";

export {
  ToolMode,
  RailSubMode,
  GameWorld,
} from "./game-world.js";

export { parseConfigFromURL } from "./game-url.js";

export type GameEventListener = () => void;

const MAP_SIZE = 256;

/**
 * Game: GameWorld（純粋ロジック）+ レンダリング・入力・カメラのブラウザ層
 */
export class Game {
  readonly world: GameWorld;
  private readonly renderer: Renderer;
  private readonly canvas: HTMLCanvasElement;
  private readonly camera: Camera;

  private hoverTileX: number | null = null;
  private hoverTileY: number | null = null;

  private listeners: GameEventListener[] = [];
  private lastTime = performance.now();
  private animFrameId = 0;
  private cachedSnapshot: import("./game-world.js").GameSnapshot | null = null;

  constructor(canvas: HTMLCanvasElement, ctx: CanvasRenderingContext2D, config: import("./game-world.js").GameConfig) {
    this.canvas = canvas;
    this.renderer = new Renderer(ctx, canvas);
    this.world = new GameWorld(config);

    if (config.debug) {
      this.camera = new Camera((64 * TILE_SIZE) / 2, (64 * TILE_SIZE) / 2);
    } else {
      this.camera = new Camera((MAP_SIZE * TILE_SIZE) / 2, (MAP_SIZE * TILE_SIZE) / 2);
    }

    new InputHandler(canvas, this.camera, {
      requestRender: (): void => { /* continuous */ },
      onTileClick: (tx: number, ty: number): void => {
        this.world.onTileClick(tx, ty);
        this.notify();
      },
      onTileHover: (tx: number, ty: number): void => {
        this.hoverTileX = tx;
        this.hoverTileY = ty;
      },
      onKeyPress: (key: string): void => {
        this.world.onKeyPress(key);
        this.notify();
      },
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

  getSnapshot(): import("./game-world.js").GameSnapshot {
    this.cachedSnapshot ??= this.world.getSnapshot();
    return this.cachedSnapshot;
  }

  // --- ゲームループ ---

  start(): void {
    this.resize();
    this.lastTime = performance.now();
    const loop = (now: number): void => {
      const dt = Math.min((now - this.lastTime) / 1000, 0.1);
      this.lastTime = now;

      this.world.update(dt);
      this.notify();

      // レンダリング
      this.renderer.render(this.world.map, this.camera);
      this.renderCities();
      this.renderer.renderGraph(
        this.world.graph,
        this.camera,
        this.world.selectedNodeId,
        (nodeId) => {
          const complex = this.world.graph.getStationComplex(nodeId);
          let trainCount = 0;
          let waitingCargo = 0;
          for (const cn of complex) {
            trainCount += this.world.sim.getNodeTrainCount(cn.id);
            waitingCargo += this.world.economy.getTotalWaiting(cn.id);
          }
          return { trainCount, waitingCargo };
        },
      );
      this.renderer.renderTrains(
        this.world.sim.getTrainPositions(this.world.graph),
        this.camera,
      );
      this.renderer.renderFloatingTexts(this.world.floatingTexts, this.camera, 2.0);

      // ウェイポイント仮表示
      if (this.world.selectedNodeId !== null) {
        const origin = this.world.graph.getNode(this.world.selectedNodeId);
        if (origin !== undefined) {
          const points = [
            { x: origin.tileX, y: origin.tileY },
            ...this.world.railWaypoints,
          ];
          const hoverPoints = this.hoverTileX !== null && this.hoverTileY !== null
            ? [...points, { x: this.hoverTileX, y: this.hoverTileY }]
            : points;
          const previewPath = this.world.buildPreviewPath(hoverPoints);
          this.renderer.renderWaypoints(points, previewPath, this.camera);
        }
      }

      this.animFrameId = requestAnimationFrame(loop);
    };
    this.animFrameId = requestAnimationFrame(loop);
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

  private renderCities(): void {
    this.renderer.renderBuildings(this.world.economy.getAllBuildings(), this.camera);
    const cities = this.world.economy.getAllCities().map((c) => ({
      tileX: c.centerX,
      tileY: c.centerY,
      name: c.name,
      radius: c.radius,
    }));
    this.renderer.renderCities(cities, this.camera);
  }

  // --- UI アクション（GameWorld に委譲してnotify） ---

  setToolMode(mode: import("./game-world.js").ToolMode): void {
    this.world.setToolMode(mode);
    this.notify();
  }

  setRailSubMode(mode: import("./game-world.js").RailSubMode): void {
    this.world.setRailSubMode(mode);
    this.notify();
  }

  addTrain(routeId?: number): void {
    this.world.addTrain(routeId);
    this.notify();
  }

  selectRoute(routeId: number): void {
    this.world.selectRoute(routeId);
    this.notify();
  }

  confirmRoute(mode: import("./simulation.js").RouteMode): void {
    this.world.confirmRoute(mode);
    this.notify();
  }

  editRoute(routeId: number): void {
    this.world.editRoute(routeId);
    this.notify();
  }

  removeRoute(routeId: number): void {
    this.world.removeRoute(routeId);
    this.notify();
  }

  removeTrainFromRoute(routeId: number): void {
    this.world.removeTrainFromRoute(routeId);
    this.notify();
  }

  removeEdge(edgeId: number): void {
    const error = this.world.removeEdge(edgeId);
    if (error !== null) {
      this.world.showToast(error);
    }
    this.notify();
  }

  setNodeCapacity(nodeId: number, capacity: number): void {
    this.world.setNodeCapacity(nodeId, capacity);
    this.notify();
  }

  removeNode(nodeId: number): void {
    const error = this.world.removeNode(nodeId);
    if (error !== null) {
      this.world.showToast(error);
    }
    this.notify();
  }

  renameNode(nodeId: number, name: string): void {
    this.world.renameNode(nodeId, name);
    this.notify();
  }

  renameRoute(routeId: number, name: string): void {
    this.world.renameRoute(routeId, name);
    this.notify();
  }

  removeRouteStop(index: number): void {
    this.world.removeRouteStop(index);
    this.notify();
  }

  cancelRoute(): void {
    this.world.cancelRoute();
    this.notify();
  }
}
