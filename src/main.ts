import { Camera } from "./camera.js";
import { Graph, NodeKind } from "./graph.js";
import { InputHandler } from "./input.js";
import { findPath } from "./pathfinding.js";
import { Renderer, TILE_SIZE } from "./renderer.js";
import { RouteMode, Simulation } from "./simulation.js";
import { generateTerrain } from "./terrain.js";
import { TileMap } from "./tilemap.js";
import { Terrain } from "./types.js";

const MAP_SIZE = 256;

const ToolMode = {
  Station: "station",
  SignalStation: "signal-station",
} as const;

type ToolMode = (typeof ToolMode)[keyof typeof ToolMode];

function getCanvas(): { canvas: HTMLCanvasElement; ctx: CanvasRenderingContext2D } {
  const canvas = document.getElementById("game");
  if (!(canvas instanceof HTMLCanvasElement)) {
    throw new Error("Canvas element #game not found");
  }
  const ctx = canvas.getContext("2d");
  if (ctx === null) {
    throw new Error("Failed to get 2D context");
  }
  return { canvas, ctx };
}

function resizeCanvas(canvas: HTMLCanvasElement): void {
  const dpr = window.devicePixelRatio;
  canvas.width = window.innerWidth * dpr;
  canvas.height = window.innerHeight * dpr;
  canvas.style.width = `${String(window.innerWidth)}px`;
  canvas.style.height = `${String(window.innerHeight)}px`;
}

function updateHud(
  toolMode: ToolMode,
  sim: Simulation,
  selectedNodeId: number | null,
  routeStartNodeId: number | null,
): void {
  const hud = document.getElementById("hud");
  if (hud === null) return;
  const modeName = toolMode === ToolMode.Station ? "Station (1)" : "Signal Station (2)";
  const routes = sim.getAllRoutes().length;

  let status = "";
  if (routeStartNodeId !== null) {
    status = " | Route: select end station, then [R]";
  } else if (selectedNodeId !== null) {
    status = " | Selected. [R] to start route";
  }

  hud.textContent = `Tool: ${modeName} | Routes: ${String(routes)} | Trains: ${String(sim.trainCount)}${status}`;
}

function main(): void {
  const { canvas, ctx } = getCanvas();
  resizeCanvas(canvas);

  const map = new TileMap(MAP_SIZE, MAP_SIZE);
  generateTerrain(map, { seed: Date.now() });

  const graph = new Graph();
  const sim = new Simulation();
  let stationCount = 0;
  let selectedNodeId: number | null = null;
  let toolMode: ToolMode = ToolMode.Station;
  let lastRouteId: number | null = null;

  // For route creation: collect two station clicks
  let routeStartNodeId: number | null = null;

  const centerWorld = (MAP_SIZE * TILE_SIZE) / 2;
  const camera = new Camera(centerWorld, centerWorld);
  const renderer = new Renderer(ctx, canvas);

  const requestRender = (): void => {
    // Rendering is continuous
  };

  const placeNode = (): { nodeKind: NodeKind; name: string } => {
    if (toolMode === ToolMode.SignalStation) {
      return { nodeKind: NodeKind.SignalStation, name: "S" };
    }
    stationCount++;
    return { nodeKind: NodeKind.Station, name: String(stationCount) };
  };

  const connectNodes = (fromId: number, toId: number): void => {
    const fromNode = graph.getNode(fromId);
    const toNode = graph.getNode(toId);
    if (fromNode === undefined || toNode === undefined) return;
    const existingEdge = graph.getEdgesBetween(fromId, toId);
    if (existingEdge !== undefined) return;

    const path = findPath(map, fromNode.tileX, fromNode.tileY, toNode.tileX, toNode.tileY);
    if (path !== null) {
      graph.addEdge(fromId, toId, path);
    }
  };

  const onTileClick = (tileX: number, tileY: number): void => {
    if (!map.inBounds(tileX, tileY)) return;

    const existing = graph.getNodeAt(tileX, tileY);

    if (existing !== undefined) {
      if (selectedNodeId === null) {
        selectedNodeId = existing.id;
      } else if (selectedNodeId === existing.id) {
        selectedNodeId = null;
      } else {
        connectNodes(selectedNodeId, existing.id);
        selectedNodeId = null;
      }
    } else {
      if (map.get(tileX, tileY).terrain === Terrain.Water) return;

      if (toolMode === ToolMode.SignalStation && selectedNodeId === null) {
        const closest = graph.findClosestEdgePoint(tileX, tileY);
        if (closest !== null && closest.distance <= 1) {
          const pathPoint = closest.edge.path[closest.pathIndex];
          if (pathPoint !== undefined) {
            const node = graph.addNode(
              NodeKind.SignalStation,
              pathPoint.x,
              pathPoint.y,
              "S",
            );
            graph.splitEdge(closest.edge.id, node, closest.pathIndex);
            return;
          }
        }
      }

      const { nodeKind, name } = placeNode();
      const node = graph.addNode(nodeKind, tileX, tileY, name);

      if (selectedNodeId !== null) {
        connectNodes(selectedNodeId, node.id);
        selectedNodeId = null;
      }
    }
  };

  const onKeyPress = (key: string): void => {
    switch (key) {
      case "1":
        toolMode = ToolMode.Station;
        break;
      case "2":
        toolMode = ToolMode.SignalStation;
        break;
      case "r":
      case "R":
        // Start/complete route creation
        if (selectedNodeId === null) break;
        if (routeStartNodeId === null) {
          routeStartNodeId = selectedNodeId;
          selectedNodeId = null;
        } else {
          const route = sim.addRoute(
            [routeStartNodeId, selectedNodeId],
            RouteMode.Shuttle,
          );
          lastRouteId = route.id;
          routeStartNodeId = null;
          selectedNodeId = null;
        }
        break;
      case "t":
      case "T":
        if (lastRouteId !== null) {
          sim.addTrain(lastRouteId, graph);
        }
        break;
      case "Escape":
        selectedNodeId = null;
        routeStartNodeId = null;
        break;
    }
  };

  new InputHandler(canvas, camera, { requestRender, onTileClick, onKeyPress });

  window.addEventListener("resize", () => {
    resizeCanvas(canvas);
  });

  let lastTime = performance.now();

  const loop = (now: number): void => {
    const dt = Math.min((now - lastTime) / 1000, 0.1);
    lastTime = now;

    sim.update(dt, graph);

    renderer.render(map, camera);
    renderer.renderGraph(graph, camera, selectedNodeId, (nodeId) =>
      sim.getNodeTrainCount(nodeId),
    );
    renderer.renderTrains(sim.getTrainPositions(graph), camera);

    updateHud(toolMode, sim, selectedNodeId, routeStartNodeId);

    requestAnimationFrame(loop);
  };
  requestAnimationFrame(loop);
}

main();
