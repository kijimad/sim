import { describe, expect, it } from "vitest";
import { findPath, calcPathCost } from "./pathfinding.js";
import type { PathNode } from "./pathfinding.js";
import { TileMap } from "./tilemap.js";
import { Terrain } from "./types.js";

function makeMap(
  width: number,
  height: number,
  overrides: [number, number, Terrain][] = [],
): TileMap {
  const map = new TileMap(width, height);
  for (const [x, y, terrain] of overrides) {
    map.set(x, y, { terrain, elevation: 0 });
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

  it("produces zigzag path for diagonal movement", () => {
    const map = makeMap(20, 20);
    const path = findPath(map, 0, 0, 10, 10);
    expect(path).not.toBeNull();
    if (path === null) return;

    // 8方向移動で斜めに直進できるのでパスは11（10斜め + 1始点）
    expect(path).toHaveLength(11);

    // 8方向移動では斜め直進が可能
    expect(path[0]).toEqual({ x: 0, y: 0 });
    expect(path[path.length - 1]).toEqual({ x: 10, y: 10 });
  });

  it("avoids blocked tiles", () => {
    const map = makeMap(10, 10);
    const blocked = new Set(["2,0", "2,1", "2,2", "2,3", "2,4"]);
    const path = findPath(map, 0, 2, 5, 2, blocked);
    expect(path).not.toBeNull();
    if (path === null) return;

    // ブロックされたタイルを通らないこと
    for (const node of path) {
      expect(blocked.has(`${String(node.x)},${String(node.y)}`)).toBe(false);
    }
  });

  it("blocked tiles do not block start and end", () => {
    const map = makeMap(10, 10);
    // 始点と終点をブロック対象にしても到達可能
    const blocked = new Set(["0,0", "5,0"]);
    const path = findPath(map, 0, 0, 5, 0, blocked);
    expect(path).not.toBeNull();
    expect(path?.[0]).toEqual({ x: 0, y: 0 });
    expect(path?.[path.length - 1]).toEqual({ x: 5, y: 0 });
  });

  it("performs well on large maps (500x500)", () => {
    const map = makeMap(500, 500);
    const start = performance.now();
    const path = findPath(map, 0, 0, 499, 499);
    const elapsed = performance.now() - start;

    expect(path).not.toBeNull();
    // 500ms以内に完了すること
    expect(elapsed).toBeLessThan(500);
    // パスの長さが妥当（マンハッタン距離 = 998、ジグザグで999）
    expect(path!.length).toBe(500);
  });

  it("performs well on 2000x2000 maps", () => {
    const map = makeMap(2000, 2000);
    const start = performance.now();
    const path = findPath(map, 0, 0, 1999, 1999);
    const elapsed = performance.now() - start;

    expect(path).not.toBeNull();
    // 2秒以内に完了すること
    expect(elapsed).toBeLessThan(2000);
    expect(path!.length).toBe(2000);
  });

  it("prefers flat path over steep elevation change", () => {
    // 全タイルを同じ標高で初期化
    const map = new TileMap(20, 5);
    for (let y = 0; y < 5; y++) {
      for (let x = 0; x < 20; x++) {
        map.set(x, y, { terrain: Terrain.Flat, elevation: 0 });
      }
    }
    // 中段 y=2 の x=10 に急な崖を配置
    map.set(10, 2, { terrain: Terrain.Flat, elevation: 1.0 });

    const path = findPath(map, 0, 2, 19, 2);
    expect(path).not.toBeNull();
    if (path === null) return;

    // 崖のある (10, 2) を迂回する
    const goesThrough = path.some((p) => p.x === 10 && p.y === 2);
    expect(goesThrough).toBe(false);
    // 崖を迂回するため直線(20)以上の長さ
    expect(path.length).toBeGreaterThanOrEqual(20);
  });

  it("calcPathCost includes elevation cost", () => {
    const map = new TileMap(5, 1);
    map.set(0, 0, { terrain: Terrain.Flat, elevation: 0 });
    map.set(1, 0, { terrain: Terrain.Flat, elevation: 0 });
    map.set(2, 0, { terrain: Terrain.Flat, elevation: 0.5 });
    map.set(3, 0, { terrain: Terrain.Flat, elevation: 0.5 });
    map.set(4, 0, { terrain: Terrain.Flat, elevation: 0 });

    const flatPath: PathNode[] = [{ x: 0, y: 0 }, { x: 1, y: 0 }];
    const slopePath: PathNode[] = [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 2, y: 0 }];

    const flatCost = calcPathCost(map, flatPath);
    const slopeCost = calcPathCost(map, slopePath);

    // 急斜面を含むパスのほうがコストが高い
    expect(slopeCost).toBeGreaterThan(flatCost);
  });
});
