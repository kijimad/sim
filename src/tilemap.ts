import type { Terrain, Tile } from "./types.js";

const CHUNK_SIZE = 64;

/** 64x64 タイルのチャンク */
class TileChunk {
  readonly data: Uint8Array;

  constructor() {
    this.data = new Uint8Array(CHUNK_SIZE * CHUNK_SIZE);
    // デフォルトは Flat (0)
  }
}

export class TileMap {
  readonly width: number;
  readonly height: number;
  private readonly chunksX: number;
  private readonly chunksY: number;
  private readonly chunks: (TileChunk | undefined)[];

  constructor(width: number, height: number) {
    this.width = width;
    this.height = height;
    this.chunksX = Math.ceil(width / CHUNK_SIZE);
    this.chunksY = Math.ceil(height / CHUNK_SIZE);
    this.chunks = new Array<TileChunk | undefined>(this.chunksX * this.chunksY);
  }

  inBounds(x: number, y: number): boolean {
    return x >= 0 && x < this.width && y >= 0 && y < this.height;
  }

  get(x: number, y: number): Tile {
    if (!this.inBounds(x, y)) {
      throw new RangeError(`Tile (${String(x)}, ${String(y)}) out of bounds`);
    }
    const chunk = this.getChunk(x, y);
    const lx = x % CHUNK_SIZE;
    const ly = y % CHUNK_SIZE;
    const terrain = chunk.data[ly * CHUNK_SIZE + lx] as Terrain;
    return { terrain };
  }

  set(x: number, y: number, tile: Tile): void {
    if (!this.inBounds(x, y)) {
      throw new RangeError(`Tile (${String(x)}, ${String(y)}) out of bounds`);
    }
    const chunk = this.getChunk(x, y);
    const lx = x % CHUNK_SIZE;
    const ly = y % CHUNK_SIZE;
    chunk.data[ly * CHUNK_SIZE + lx] = tile.terrain;
  }

  /** 指定座標のチャンクを取得する（遅延生成） */
  private getChunk(x: number, y: number): TileChunk {
    const cx = Math.floor(x / CHUNK_SIZE);
    const cy = Math.floor(y / CHUNK_SIZE);
    const idx = cy * this.chunksX + cx;
    let chunk = this.chunks[idx];
    if (chunk === undefined) {
      chunk = new TileChunk();
      this.chunks[idx] = chunk;
    }
    return chunk;
  }
}
