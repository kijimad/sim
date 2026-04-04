import type { Terrain, Tile } from "./types.js";

const CHUNK_SIZE = 64;
const CHUNK_AREA = CHUNK_SIZE * CHUNK_SIZE;

/** 64x64 タイルのチャンク */
class TileChunk {
  /** 地形タイプ（Terrain） */
  readonly terrain: Uint8Array;
  /** 標高 [0, 1] */
  readonly elevation: Float32Array;

  constructor() {
    this.terrain = new Uint8Array(CHUNK_AREA);
    this.elevation = new Float32Array(CHUNK_AREA);
    // デフォルト標高を平地レベルに設定する
    this.elevation.fill(0.3);
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
    const li = (y % CHUNK_SIZE) * CHUNK_SIZE + (x % CHUNK_SIZE);
    return {
      terrain: chunk.terrain[li] as Terrain,
      elevation: chunk.elevation[li] ?? 0,
    };
  }

  set(x: number, y: number, tile: Tile): void {
    if (!this.inBounds(x, y)) {
      throw new RangeError(`Tile (${String(x)}, ${String(y)}) out of bounds`);
    }
    const chunk = this.getChunk(x, y);
    const li = (y % CHUNK_SIZE) * CHUNK_SIZE + (x % CHUNK_SIZE);
    chunk.terrain[li] = tile.terrain;
    chunk.elevation[li] = tile.elevation;
  }

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
