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

  it("produces zigzag path for diagonal movement", () => {
    const map = makeMap(20, 20);
    const path = findPath(map, 0, 0, 10, 10);
    expect(path).not.toBeNull();
    if (path === null) return;

    // パスの長さは21（10水平 + 10垂直 + 1始点）
    expect(path).toHaveLength(21);

    // 同じ方向に3回以上連続しないことを確認（ジグザグ）
    let maxConsecutive = 1;
    let consecutive = 1;
    for (let i = 2; i < path.length; i++) {
      const prev = path[i - 1]!;
      const curr = path[i]!;
      const prevPrev = path[i - 2]!;
      const prevDx = prev.x - prevPrev.x;
      const currDx = curr.x - prev.x;
      if ((prevDx === 0) === (currDx === 0)) {
        consecutive++;
        maxConsecutive = Math.max(maxConsecutive, consecutive);
      } else {
        consecutive = 1;
      }
    }
    // 完全なジグザグなら maxConsecutive = 1 だが、端の都合で2まで許容
    expect(maxConsecutive).toBeLessThanOrEqual(2);
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
    expect(path!.length).toBe(999);
  });

  it("performs well on 2000x2000 maps", () => {
    const map = makeMap(2000, 2000);
    const start = performance.now();
    const path = findPath(map, 0, 0, 1999, 1999);
    const elapsed = performance.now() - start;

    expect(path).not.toBeNull();
    // 2秒以内に完了すること
    expect(elapsed).toBeLessThan(2000);
    expect(path!.length).toBe(3999);
  });
});
