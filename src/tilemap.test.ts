import { describe, expect, it } from "vitest";
import { TileMap } from "./tilemap.js";
import { Terrain } from "./types.js";

describe("TileMap", () => {
  it("initializes all tiles as Flat", () => {
    const map = new TileMap(4, 4);
    for (let y = 0; y < 4; y++) {
      for (let x = 0; x < 4; x++) {
        expect(map.get(x, y).terrain).toBe(Terrain.Flat);
      }
    }
  });

  it("set and get a tile", () => {
    const map = new TileMap(8, 8);
    map.set(3, 5, { terrain: Terrain.Water });
    expect(map.get(3, 5).terrain).toBe(Terrain.Water);
    expect(map.get(0, 0).terrain).toBe(Terrain.Flat);
  });

  it("inBounds returns correct results", () => {
    const map = new TileMap(10, 10);
    expect(map.inBounds(0, 0)).toBe(true);
    expect(map.inBounds(9, 9)).toBe(true);
    expect(map.inBounds(-1, 0)).toBe(false);
    expect(map.inBounds(0, -1)).toBe(false);
    expect(map.inBounds(10, 0)).toBe(false);
    expect(map.inBounds(0, 10)).toBe(false);
  });

  it("get throws on out of bounds", () => {
    const map = new TileMap(4, 4);
    expect(() => map.get(-1, 0)).toThrow(RangeError);
    expect(() => map.get(4, 0)).toThrow(RangeError);
    expect(() => map.get(0, 4)).toThrow(RangeError);
  });

  it("set throws on out of bounds", () => {
    const map = new TileMap(4, 4);
    expect(() => { map.set(-1, 0, { terrain: Terrain.Flat }); }).toThrow(RangeError);
    expect(() => { map.set(4, 0, { terrain: Terrain.Flat }); }).toThrow(RangeError);
  });
});
