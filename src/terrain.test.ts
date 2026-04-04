import { describe, expect, it } from "vitest";
import { TileMap } from "./tilemap.js";
import { generateTerrain, generateTerrainPreview } from "./terrain.js";
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

  it("waterThreshold を上げると水が増える", () => {
    const mapLow = new TileMap(64, 64);
    generateTerrain(mapLow, { seed: 42, waterThreshold: 0.2 });
    const mapHigh = new TileMap(64, 64);
    generateTerrain(mapHigh, { seed: 42, waterThreshold: 0.5 });

    let waterLow = 0;
    let waterHigh = 0;
    for (let y = 0; y < 64; y++) {
      for (let x = 0; x < 64; x++) {
        if (mapLow.get(x, y).terrain === Terrain.Water) waterLow++;
        if (mapHigh.get(x, y).terrain === Terrain.Water) waterHigh++;
      }
    }
    expect(waterHigh).toBeGreaterThan(waterLow);
  });

  it("mountainThreshold を下げると山が増える", () => {
    const mapLow = new TileMap(64, 64);
    generateTerrain(mapLow, { seed: 42, mountainThreshold: 0.5 });
    const mapHigh = new TileMap(64, 64);
    generateTerrain(mapHigh, { seed: 42, mountainThreshold: 0.9 });

    let mtLow = 0;
    let mtHigh = 0;
    for (let y = 0; y < 64; y++) {
      for (let x = 0; x < 64; x++) {
        if (mapLow.get(x, y).terrain === Terrain.Mountain) mtLow++;
        if (mapHigh.get(x, y).terrain === Terrain.Mountain) mtHigh++;
      }
    }
    expect(mtLow).toBeGreaterThan(mtHigh);
  });
});

describe("generateTerrainPreview", () => {
  it("正しいサイズの配列を返す", () => {
    const data = generateTerrainPreview(100, {
      seed: 42,
      waterThreshold: 0.35,
      mountainThreshold: 0.65,
    });
    expect(data.length).toBe(10000);
  });

  it("同じseedで同じ結果", () => {
    const cfg = { seed: 42, waterThreshold: 0.35, mountainThreshold: 0.65 };
    const a = generateTerrainPreview(50, cfg);
    const b = generateTerrainPreview(50, cfg);
    for (let i = 0; i < a.length; i++) {
      expect(a[i]).toBe(b[i]);
    }
  });

  it("全地形タイプを含む", () => {
    const data = generateTerrainPreview(128, {
      seed: 42,
      waterThreshold: 0.35,
      mountainThreshold: 0.65,
    });
    const found = new Set<number>();
    for (const v of data) {
      found.add(v);
    }
    expect(found.has(0)).toBe(true); // Flat
    expect(found.has(1)).toBe(true); // Mountain
    expect(found.has(2)).toBe(true); // Water
  });

  it("generateTerrain と一致する", () => {
    const map = new TileMap(64, 64);
    generateTerrain(map, { seed: 99, waterThreshold: 0.3, mountainThreshold: 0.7 });
    const preview = generateTerrainPreview(64, { seed: 99, waterThreshold: 0.3, mountainThreshold: 0.7 });

    // プレビューとマップの地形が一致する
    for (let y = 0; y < 64; y++) {
      for (let x = 0; x < 64; x++) {
        expect(preview[y * 64 + x]).toBe(map.get(x, y).terrain);
      }
    }
  });
});
