import { describe, expect, it } from "vitest";
import { TileMap } from "./tilemap.js";
import { generateTerrain } from "./terrain.js";
import { Terrain } from "./types.js";

describe("generateTerrain", () => {
  it("fills all tiles with valid terrain", () => {
    const map = new TileMap(32, 32);
    generateTerrain(map, { seed: 123 });

    const validTerrains = new Set([Terrain.Flat, Terrain.Mountain, Terrain.Water]);
    for (let y = 0; y < 32; y++) {
      for (let x = 0; x < 32; x++) {
        expect(validTerrains.has(map.get(x, y).terrain)).toBe(true);
      }
    }
  });

  it("produces deterministic output for same seed", () => {
    const map1 = new TileMap(32, 32);
    const map2 = new TileMap(32, 32);
    generateTerrain(map1, { seed: 42 });
    generateTerrain(map2, { seed: 42 });

    for (let y = 0; y < 32; y++) {
      for (let x = 0; x < 32; x++) {
        expect(map1.get(x, y).terrain).toBe(map2.get(x, y).terrain);
      }
    }
  });

  it("produces different output for different seeds", () => {
    const map1 = new TileMap(64, 64);
    const map2 = new TileMap(64, 64);
    generateTerrain(map1, { seed: 1 });
    generateTerrain(map2, { seed: 2 });

    let differences = 0;
    for (let y = 0; y < 64; y++) {
      for (let x = 0; x < 64; x++) {
        if (map1.get(x, y).terrain !== map2.get(x, y).terrain) {
          differences++;
        }
      }
    }
    expect(differences).toBeGreaterThan(0);
  });

  it("produces all terrain types with default config", () => {
    const map = new TileMap(128, 128);
    generateTerrain(map, { seed: 42 });

    const found = new Set<Terrain>();
    for (let y = 0; y < 128; y++) {
      for (let x = 0; x < 128; x++) {
        found.add(map.get(x, y).terrain);
      }
    }
    expect(found.has(Terrain.Flat)).toBe(true);
    expect(found.has(Terrain.Mountain)).toBe(true);
    expect(found.has(Terrain.Water)).toBe(true);
  });
});
