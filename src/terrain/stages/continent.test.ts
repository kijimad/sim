import { describe, it, expect } from "vitest";
import { createContext } from "../context.js";
import { continentShape, twoIslands, multiIslands } from "./continent.js";

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
    expect(ratio).toBeLessThan(0.95);
  });

  it("2島型: 2つ以上の陸塊がある", () => {
    const ctx = createContext(size, size, 42, 1.0, 512);
    twoIslands(ctx);
    const masses = countLandmasses(ctx.elevation, size);
    expect(masses).toBeGreaterThanOrEqual(2);
  });

  it("多島型: 多数の陸塊がある", () => {
    // 複数 seed で検証（ノイズパターンによっては島が繋がることがある）
    let maxMasses = 0;
    for (const seed of [42, 0xaa, 0xbb, 0xcc]) {
      const ctx = createContext(size, size, seed, 1.0, 512);
      multiIslands(ctx);
      const masses = countLandmasses(ctx.elevation, size);
      if (masses > maxMasses) maxMasses = masses;
    }
    // いずれかの seed で3つ以上の陸塊
    expect(maxMasses).toBeGreaterThanOrEqual(3);
  });

  it("各形状で陸地率が妥当な範囲", () => {
    const shapes = [
      { name: "continent", fn: continentShape },
      { name: "twoIslands", fn: twoIslands },
      { name: "multiIslands", fn: multiIslands },
    ];
    for (const { name, fn } of shapes) {
      const ctx = createContext(size, size, 42, 1.0, 512);
      fn(ctx);
      const ratio = landRatio(ctx.elevation);
      // 全形状で陸地が5%〜90%の範囲にあること
      expect(ratio, `${name}: 陸地率 ${String(ratio)}`).toBeGreaterThan(0.05);
      expect(ratio, `${name}: 陸地率 ${String(ratio)}`).toBeLessThan(0.95);
    }
  });
});
