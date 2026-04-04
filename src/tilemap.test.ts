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

  it("handles chunk boundaries correctly", () => {
    const map = new TileMap(128, 128);
    // チャンク境界をまたぐ座標でset/getが正しく動作する
    map.set(63, 63, { terrain: Terrain.Water });
    map.set(64, 64, { terrain: Terrain.Mountain });
    map.set(127, 127, { terrain: Terrain.Water });

    expect(map.get(63, 63).terrain).toBe(Terrain.Water);
    expect(map.get(64, 64).terrain).toBe(Terrain.Mountain);
    expect(map.get(127, 127).terrain).toBe(Terrain.Water);
    expect(map.get(0, 0).terrain).toBe(Terrain.Flat);
    expect(map.get(64, 63).terrain).toBe(Terrain.Flat);
  });

  it("2000x2000 map creates instantly", () => {
    const start = performance.now();
    const map = new TileMap(2000, 2000);
    const createTime = performance.now() - start;
    // 生成は10ms以内（チャンクは遅延生成）
    expect(createTime).toBeLessThan(10);

    // アクセスすると遅延でチャンクが生成される
    map.set(1999, 1999, { terrain: Terrain.Mountain });
    expect(map.get(1999, 1999).terrain).toBe(Terrain.Mountain);
    expect(map.get(0, 0).terrain).toBe(Terrain.Flat);
  });

  it("2000x2000 map sparse access is fast", () => {
    const map = new TileMap(2000, 2000);
    const start = performance.now();
    // 1000箇所にランダムアクセス
    for (let i = 0; i < 1000; i++) {
      const x = (i * 7) % 2000;
      const y = (i * 13) % 2000;
      map.set(x, y, { terrain: Terrain.Water });
    }
    for (let i = 0; i < 1000; i++) {
      const x = (i * 7) % 2000;
      const y = (i * 13) % 2000;
      expect(map.get(x, y).terrain).toBe(Terrain.Water);
    }
    const elapsed = performance.now() - start;
    expect(elapsed).toBeLessThan(50);
  });
});
