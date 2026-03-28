import { Terrain, type Tile } from "./types.js";

export class TileMap {
  readonly width: number;
  readonly height: number;
  private readonly tiles: Tile[];

  constructor(width: number, height: number) {
    this.width = width;
    this.height = height;
    this.tiles = Array.from({ length: width * height }, () => ({
      terrain: Terrain.Flat,
    }));
  }

  inBounds(x: number, y: number): boolean {
    return x >= 0 && x < this.width && y >= 0 && y < this.height;
  }

  get(x: number, y: number): Tile {
    if (!this.inBounds(x, y)) {
      throw new RangeError(`Tile (${String(x)}, ${String(y)}) out of bounds`);
    }
    const tile = this.tiles[y * this.width + x];
    if (tile === undefined) {
      throw new RangeError(`Tile (${String(x)}, ${String(y)}) not found`);
    }
    return tile;
  }

  set(x: number, y: number, tile: Tile): void {
    if (!this.inBounds(x, y)) {
      throw new RangeError(`Tile (${String(x)}, ${String(y)}) out of bounds`);
    }
    this.tiles[y * this.width + x] = tile;
  }
}
