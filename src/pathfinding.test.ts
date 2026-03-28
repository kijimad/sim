import { describe, expect, it } from "vitest";
import { findPath } from "./pathfinding.js";
import { TileMap } from "./tilemap.js";
import { Terrain } from "./types.js";

function makeMap(
  width: number,
  height: number,
  overrides: [number, number, Terrain][] = [],
): TileMap {
  const map = new TileMap(width, height);
  for (const [x, y, terrain] of overrides) {
    map.set(x, y, { terrain });
  }
  return map;
}

describe("findPath", () => {
  it("finds a straight path on flat terrain", () => {
    const map = makeMap(10, 10);
    const path = findPath(map, 0, 0, 5, 0);
    expect(path).not.toBeNull();
    expect(path).toHaveLength(6);
    expect(path?.[0]).toEqual({ x: 0, y: 0 });
    expect(path?.[path.length - 1]).toEqual({ x: 5, y: 0 });
  });

  it("returns null when blocked by water", () => {
    const overrides: [number, number, Terrain][] = [];
    for (let y = 0; y < 5; y++) {
      overrides.push([3, y, Terrain.Water]);
    }
    const map = makeMap(6, 5, overrides);
    const path = findPath(map, 0, 2, 5, 2);
    expect(path).toBeNull();
  });

  it("avoids water by going around", () => {
    const overrides: [number, number, Terrain][] = [
      [3, 0, Terrain.Water],
      [3, 1, Terrain.Water],
      [3, 2, Terrain.Water],
    ];
    const map = makeMap(7, 5, overrides);
    const path = findPath(map, 0, 1, 6, 1);
    expect(path).not.toBeNull();
    if (path !== null) {
      for (const node of path) {
        expect(map.get(node.x, node.y).terrain).not.toBe(Terrain.Water);
      }
    }
  });

  it("prefers flat terrain over mountains", () => {
    const overrides: [number, number, Terrain][] = [];
    for (let x = 1; x < 9; x++) {
      overrides.push([x, 0, Terrain.Mountain]);
    }
    const map = makeMap(10, 3, overrides);
    const flatPath = findPath(map, 0, 0, 9, 0);
    expect(flatPath).not.toBeNull();

    if (flatPath !== null) {
      const mountainTiles = flatPath.filter(
        (n) => map.get(n.x, n.y).terrain === Terrain.Mountain,
      );
      const flatTiles = flatPath.filter(
        (n) => map.get(n.x, n.y).terrain === Terrain.Flat,
      );
      expect(flatTiles.length).toBeGreaterThan(mountainTiles.length);
    }
  });

  it("returns single-node path for same start and end", () => {
    const map = makeMap(5, 5);
    const path = findPath(map, 2, 2, 2, 2);
    expect(path).not.toBeNull();
    expect(path).toHaveLength(1);
    expect(path?.[0]).toEqual({ x: 2, y: 2 });
  });

  it("returns null for out of bounds", () => {
    const map = makeMap(5, 5);
    expect(findPath(map, -1, 0, 3, 3)).toBeNull();
    expect(findPath(map, 0, 0, 10, 10)).toBeNull();
  });
});
