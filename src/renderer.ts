import type { Camera } from "./camera.js";
import type { Graph, GraphEdge, GraphNode } from "./graph.js";
import type { PathNode } from "./pathfinding.js";
import type { TrainPosition } from "./simulation.js";
import type { TileMap } from "./tilemap.js";
import { NodeKind } from "./graph.js";
import { Terrain } from "./types.js";

export const TILE_SIZE = 32;

const TERRAIN_COLORS: Record<Terrain, string> = {
  [Terrain.Flat]: "#7ec850",
  [Terrain.Mountain]: "#8b7355",
  [Terrain.Water]: "#4a80b4",
};

export class Renderer {
  private readonly ctx: CanvasRenderingContext2D;
  private readonly canvas: HTMLCanvasElement;

  constructor(ctx: CanvasRenderingContext2D, canvas: HTMLCanvasElement) {
    this.ctx = ctx;
    this.canvas = canvas;
  }

  render(map: TileMap, camera: Camera): void {
    const { ctx, canvas } = this;

    // Clear with identity transform
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // Compute visible tile range
    const topLeft = camera.screenToWorld(0, 0, canvas.width, canvas.height);
    const bottomRight = camera.screenToWorld(
      canvas.width,
      canvas.height,
      canvas.width,
      canvas.height,
    );

    const minTx = Math.max(0, Math.floor(topLeft.wx / TILE_SIZE));
    const minTy = Math.max(0, Math.floor(topLeft.wy / TILE_SIZE));
    const maxTx = Math.min(map.width - 1, Math.floor(bottomRight.wx / TILE_SIZE));
    const maxTy = Math.min(map.height - 1, Math.floor(bottomRight.wy / TILE_SIZE));

    // Apply camera transform
    camera.applyTransform(ctx, canvas);

    // Draw visible tiles
    for (let ty = minTy; ty <= maxTy; ty++) {
      for (let tx = minTx; tx <= maxTx; tx++) {
        const tile = map.get(tx, ty);
        ctx.fillStyle = TERRAIN_COLORS[tile.terrain];
        ctx.fillRect(tx * TILE_SIZE, ty * TILE_SIZE, TILE_SIZE, TILE_SIZE);
      }
    }

    // Grid lines at higher zoom
    if (camera.zoom > 1.0) {
      ctx.strokeStyle = "rgba(0, 0, 0, 0.15)";
      ctx.lineWidth = 0.5 / camera.zoom;
      for (let ty = minTy; ty <= maxTy; ty++) {
        for (let tx = minTx; tx <= maxTx; tx++) {
          ctx.strokeRect(tx * TILE_SIZE, ty * TILE_SIZE, TILE_SIZE, TILE_SIZE);
        }
      }
    }

    // Reset transform
    ctx.setTransform(1, 0, 0, 1, 0, 0);
  }

  renderGraph(
    graph: Graph,
    camera: Camera,
    selectedNodeId: number | null,
    nodeTrainCounts?: (nodeId: number) => number,
  ): void {
    const { ctx, canvas } = this;
    camera.applyTransform(ctx, canvas);

    // Draw edges first (below nodes)
    const edges = graph.getAllEdges();
    for (const edge of edges) {
      this.renderEdge(edge);
    }

    // Draw nodes on top
    const nodes = graph.getAllNodes();
    for (const node of nodes) {
      const trainCount = nodeTrainCounts !== undefined ? nodeTrainCounts(node.id) : 0;
      this.renderNode(node, node.id === selectedNodeId, trainCount);
    }

    ctx.setTransform(1, 0, 0, 1, 0, 0);
  }

  renderPathPreview(path: readonly PathNode[], camera: Camera): void {
    const { ctx, canvas } = this;
    camera.applyTransform(ctx, canvas);
    this.drawPath(path, "rgba(255, 255, 100, 0.6)", 4);
    ctx.setTransform(1, 0, 0, 1, 0, 0);
  }

  private renderEdge(edge: GraphEdge): void {
    this.drawPath(edge.path, "#333333", 6);
    this.drawPath(edge.path, "#888888", 3);
  }

  private drawPath(
    path: readonly PathNode[],
    color: string,
    lineWidth: number,
  ): void {
    const first = path[0];
    if (path.length < 2 || first === undefined) return;
    const { ctx } = this;
    const half = TILE_SIZE / 2;

    ctx.beginPath();
    ctx.moveTo(first.x * TILE_SIZE + half, first.y * TILE_SIZE + half);
    for (let i = 1; i < path.length; i++) {
      const p = path[i];
      if (p === undefined) continue;
      ctx.lineTo(p.x * TILE_SIZE + half, p.y * TILE_SIZE + half);
    }
    ctx.strokeStyle = color;
    ctx.lineWidth = lineWidth;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.stroke();
  }

  private renderNode(node: GraphNode, selected: boolean, trainCount: number): void {
    const { ctx } = this;
    const cx = node.tileX * TILE_SIZE + TILE_SIZE / 2;
    const cy = node.tileY * TILE_SIZE + TILE_SIZE / 2;
    const radius = TILE_SIZE * 0.35;

    // Selection highlight ring
    if (selected) {
      ctx.beginPath();
      ctx.arc(cx, cy, radius + 4, 0, Math.PI * 2);
      ctx.fillStyle = "#ffff00";
      ctx.fill();
    }

    ctx.beginPath();
    ctx.arc(cx, cy, radius, 0, Math.PI * 2);

    switch (node.kind) {
      case NodeKind.Station:
        ctx.fillStyle = selected ? "#ff6060" : "#e03030";
        break;
      case NodeKind.SignalStation:
        ctx.fillStyle = "#e0a030";
        break;
      case NodeKind.Signal:
        ctx.fillStyle = "#3080e0";
        break;
    }

    ctx.fill();
    ctx.strokeStyle = selected ? "#ffff00" : "#ffffff";
    ctx.lineWidth = 2;
    ctx.stroke();

    // Label
    ctx.fillStyle = "#ffffff";
    ctx.font = `bold ${String(TILE_SIZE * 0.3)}px sans-serif`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(node.name, cx, cy);

    // Train count badge
    if (trainCount > 0) {
      const badgeX = cx + radius;
      const badgeY = cy - radius;
      const badgeR = TILE_SIZE * 0.2;
      ctx.beginPath();
      ctx.arc(badgeX, badgeY, badgeR, 0, Math.PI * 2);
      ctx.fillStyle = "#2050d0";
      ctx.fill();
      ctx.fillStyle = "#ffffff";
      ctx.font = `bold ${String(TILE_SIZE * 0.22)}px sans-serif`;
      ctx.fillText(String(trainCount), badgeX, badgeY);
    }
  }

  renderTrains(positions: readonly TrainPosition[], camera: Camera): void {
    const { ctx, canvas } = this;
    camera.applyTransform(ctx, canvas);

    for (const pos of positions) {
      const cx = pos.worldX * TILE_SIZE + TILE_SIZE / 2;
      const cy = pos.worldY * TILE_SIZE + TILE_SIZE / 2;
      const size = TILE_SIZE * 0.4;

      ctx.fillStyle = "#2050d0";
      ctx.fillRect(cx - size / 2, cy - size / 2, size, size);
      ctx.strokeStyle = "#ffffff";
      ctx.lineWidth = 1.5;
      ctx.strokeRect(cx - size / 2, cy - size / 2, size, size);
    }

    ctx.setTransform(1, 0, 0, 1, 0, 0);
  }
}
