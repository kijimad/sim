import type { Camera } from "./camera.js";
import type { TileMap } from "./tilemap.js";
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
}
