import { describe, it, expect } from "vitest";
import { createContext } from "../context.js";
import { continentShape, twoIslands, multiIslands, elongatedIsland } from "./continent.js";

/** 陸地率を計算する */
function landRatio(elevation: Float32Array, waterTh: number = 0.2): number {
  let land = 0;
  for (const e of elevation) {
    if (e >= waterTh) land++;
  }
  return land / elevation.length;
}

/** 陸地の連結成分数を数える（4連結） */
function countLandmasses(elevation: Float32Array, size: number, waterTh: number = 0.2): number {
  const visited = new Uint8Array(size * size);
  const DX = [0, 1, 0, -1];
  const DY = [-1, 0, 1, 0];
  let count = 0;

  for (let i = 0; i < size * size; i++) {
    if (visited[i] === 1 || (elevation[i] ?? 0) < waterTh) continue;
    count++;
    // BFS
    const queue = [i];
    visited[i] = 1;
    let qi = 0;
    while (qi < queue.length) {
      const ci = queue[qi++] ?? 0;
      const cx = ci % size;
      const cy = Math.floor(ci / size);
      for (let d = 0; d < 4; d++) {
        const nx = cx + (DX[d] ?? 0);
        const ny = cy + (DY[d] ?? 0);
        if (nx < 0 || nx >= size || ny < 0 || ny >= size) continue;
        const ni = ny * size + nx;
        if (visited[ni] === 1 || (elevation[ni] ?? 0) < waterTh) continue;
        visited[ni] = 1;
        queue.push(ni);
      }
    }
  }
  return count;
}

describe("地形形状タイプ", () => {
  const size = 256;

  it("大陸型: 陸地が存在する", () => {
    const ctx = createContext(size, size, 42, 1.0, 512);
    continentShape(ctx);
    const ratio = landRatio(ctx.elevation);
    expect(ratio).toBeGreaterThan(0.1);
    expect(ratio).toBeLessThan(0.9);
  });

  it("2島型: 2つ以上の陸塊がある", () => {
    const ctx = createContext(size, size, 42, 1.0, 512);
    twoIslands(ctx);
    const masses = countLandmasses(ctx.elevation, size);
    expect(masses).toBeGreaterThanOrEqual(2);
  });

  it("多島型: 多数の陸塊がある", () => {
    const ctx = createContext(size, size, 42, 1.0, 512);
    multiIslands(ctx);
    const masses = countLandmasses(ctx.elevation, size);
    // 群島なので3つ以上の陸塊
    expect(masses).toBeGreaterThanOrEqual(3);
  });

  it("細長い島型: 横に長い形状", () => {
    const ctx = createContext(size, size, 42, 1.0, 512);
    elongatedIsland(ctx);

    // 横方向の陸地範囲が縦方向より広いことを確認する
    let minX = size;
    let maxX = 0;
    let minY = size;
    let maxY = 0;
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        if ((ctx.elevation[y * size + x] ?? 0) >= 0.2) {
          if (x < minX) minX = x;
          if (x > maxX) maxX = x;
          if (y < minY) minY = y;
          if (y > maxY) maxY = y;
        }
      }
    }
    const xSpan = maxX - minX;
    const ySpan = maxY - minY;
    // 横幅が縦幅より大きいこと
    expect(xSpan).toBeGreaterThan(ySpan);
  });

  it("各形状で陸地率が妥当な範囲", () => {
    const shapes = [
      { name: "continent", fn: continentShape },
      { name: "twoIslands", fn: twoIslands },
      { name: "multiIslands", fn: multiIslands },
      { name: "elongated", fn: elongatedIsland },
    ];
    for (const { name, fn } of shapes) {
      const ctx = createContext(size, size, 42, 1.0, 512);
      fn(ctx);
      const ratio = landRatio(ctx.elevation);
      // 全形状で陸地が5%〜90%の範囲にあること
      expect(ratio, `${name}: 陸地率 ${String(ratio)}`).toBeGreaterThan(0.05);
      expect(ratio, `${name}: 陸地率 ${String(ratio)}`).toBeLessThan(0.9);
    }
  });
});
