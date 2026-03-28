import { Camera } from "./camera.js";
import { Graph, NodeKind } from "./graph.js";
import { InputHandler } from "./input.js";
import { findPath } from "./pathfinding.js";
import { Renderer, TILE_SIZE } from "./renderer.js";
import { Simulation } from "./simulation.js";
import { generateTerrain } from "./terrain.js";
import { TileMap } from "./tilemap.js";
import { Terrain } from "./types.js";

const MAP_SIZE = 256;

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

function main(): void {
  const { canvas, ctx } = getCanvas();
  resizeCanvas(canvas);

  const map = new TileMap(MAP_SIZE, MAP_SIZE);
  generateTerrain(map, { seed: Date.now() });

  const graph = new Graph();
  const sim = new Simulation();
  let stationCount = 0;
  let selectedNodeId: number | null = null;

  const centerWorld = (MAP_SIZE * TILE_SIZE) / 2;
  const camera = new Camera(centerWorld, centerWorld);
  const renderer = new Renderer(ctx, canvas);

  const requestRender = (): void => {
    // Rendering is now continuous due to simulation
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
        const fromNode = graph.getNode(selectedNodeId);
        if (fromNode !== undefined) {
          const existingEdge = graph.getEdgesBetween(selectedNodeId, existing.id);
          if (existingEdge === undefined) {
            const path = findPath(map, fromNode.tileX, fromNode.tileY, existing.tileX, existing.tileY);
            if (path !== null) {
              const edge = graph.addEdge(selectedNodeId, existing.id, path);
              sim.addTrain(edge.id);
            }
          }
        }
        selectedNodeId = null;
      }
    } else {
      if (map.get(tileX, tileY).terrain === Terrain.Water) return;
      stationCount++;
      const node = graph.addNode(NodeKind.Station, tileX, tileY, String(stationCount));

      if (selectedNodeId !== null) {
        const fromNode = graph.getNode(selectedNodeId);
        if (fromNode !== undefined) {
          const path = findPath(map, fromNode.tileX, fromNode.tileY, tileX, tileY);
          if (path !== null) {
            const edge = graph.addEdge(selectedNodeId, node.id, path);
            sim.addTrain(edge.id);
          }
        }
        selectedNodeId = null;
      }
    }
  };

  new InputHandler(canvas, camera, { requestRender, onTileClick });

  window.addEventListener("resize", () => {
    resizeCanvas(canvas);
  });

  let lastTime = performance.now();

  const loop = (now: number): void => {
    const dt = Math.min((now - lastTime) / 1000, 0.1);
    lastTime = now;

    sim.update(dt, graph);

    renderer.render(map, camera);
    renderer.renderGraph(graph, camera, selectedNodeId);
    renderer.renderTrains(sim.getTrainPositions(graph), camera);

    requestAnimationFrame(loop);
  };
  requestAnimationFrame(loop);
}

main();
