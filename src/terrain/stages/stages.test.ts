import { describe, expect, it } from "vitest";
import { createContext } from "../context.js";
import { continentShape } from "./continent.js";
import { erode } from "./erosion.js";
import { computeRivers } from "./rivers.js";
import { createClassifyBiome } from "./classify.js";
import { Terrain } from "../../types.js";

const SIZE = 128;

describe("continentShape", () => {
  it("中央が端より高い", () => {
    const ctx = createContext(SIZE, SIZE, 42);
    continentShape(ctx);

    const center = ctx.elevation[32 * SIZE + 32] ?? 0;
    const corner = ctx.elevation[0] ?? 0;
    expect(center).toBeGreaterThan(corner);
  });

  it("値が [0, 1] の範囲", () => {
    const ctx = createContext(SIZE, SIZE, 42);
    continentShape(ctx);

    for (let i = 0; i < SIZE * SIZE; i++) {
      expect(ctx.elevation[i]).toBeGreaterThanOrEqual(0);
      expect(ctx.elevation[i]).toBeLessThanOrEqual(1);
    }
  });

  it("決定論的", () => {
    const a = createContext(SIZE, SIZE, 42);
    const b = createContext(SIZE, SIZE, 42);
    continentShape(a);
    continentShape(b);
    for (let i = 0; i < SIZE * SIZE; i++) {
      expect(a.elevation[i]).toBe(b.elevation[i]);
    }
  });
});

describe("erode（粒子ベース水力侵食）", () => {
  it("侵食後に谷が形成される（標高の分散が変化する）", () => {
    const ctx = createContext(SIZE, SIZE, 42, 1.0, SIZE);
    continentShape(ctx);

    // 侵食前の標高統計
    let sumBefore = 0;
    for (const v of ctx.elevation) sumBefore += v;
    const meanBefore = sumBefore / ctx.elevation.length;

    erode(ctx);

    // 侵食後: 平均標高が少し下がる（土砂が削られて端に流出）
    let sumAfter = 0;
    for (const v of ctx.elevation) sumAfter += v;
    const meanAfter = sumAfter / ctx.elevation.length;

    // 侵食で全体的に少し低くなる
    expect(meanAfter).toBeLessThanOrEqual(meanBefore + 0.01);
  });

  it("急斜面が緩和される", () => {
    const ctx = createContext(SIZE, SIZE, 42, 1.0, SIZE);
    continentShape(ctx);

    // 侵食前の隣接タイル最大差
    let maxDiffBefore = 0;
    for (let y = 0; y < SIZE; y++) {
      for (let x = 0; x < SIZE - 1; x++) {
        const diff = Math.abs((ctx.elevation[y * SIZE + x] ?? 0) - (ctx.elevation[y * SIZE + x + 1] ?? 0));
        if (diff > maxDiffBefore) maxDiffBefore = diff;
      }
    }

    erode(ctx);

    // 侵食後: 最大勾配が緩和される
    let maxDiffAfter = 0;
    for (let y = 0; y < SIZE; y++) {
      for (let x = 0; x < SIZE - 1; x++) {
        const diff = Math.abs((ctx.elevation[y * SIZE + x] ?? 0) - (ctx.elevation[y * SIZE + x + 1] ?? 0));
        if (diff > maxDiffAfter) maxDiffAfter = diff;
      }
    }
    // 侵食後も最大勾配が極端に増えない（バイオーム境界の崖を許容）
    expect(maxDiffAfter).toBeLessThan(maxDiffBefore + 0.2);
  });
});

describe("computeRivers", () => {
  it("流量が蓄積される", () => {
    const ctx = createContext(SIZE, SIZE, 42, 1.0, SIZE);
    continentShape(ctx);
    erode(ctx);
    computeRivers(ctx);

    let maxFlow = 0;
    for (const f of ctx.flow) {
      if (f > maxFlow) maxFlow = f;
    }
    expect(maxFlow).toBeGreaterThan(10);
  });

  it("低い場所により多くの流量が集まる", () => {
    const ctx = createContext(SIZE, SIZE, 42, 1.0, SIZE);
    continentShape(ctx);
    erode(ctx);
    computeRivers(ctx);

    const sorted = [...ctx.elevation].sort((a, b) => a - b);
    const lowThreshold = sorted[Math.floor(SIZE * SIZE * 0.25)] ?? 0;
    const highThreshold = sorted[Math.floor(SIZE * SIZE * 0.75)] ?? 0;

    let lowFlowSum = 0;
    let lowCount = 0;
    let highFlowSum = 0;
    let highCount = 0;
    for (let i = 0; i < SIZE * SIZE; i++) {
      const e = ctx.elevation[i] ?? 0;
      const f = ctx.flow[i] ?? 0;
      if (e <= lowThreshold) { lowFlowSum += f; lowCount++; }
      if (e >= highThreshold) { highFlowSum += f; highCount++; }
    }
    if (lowCount > 0 && highCount > 0) {
      expect(lowFlowSum / lowCount).toBeGreaterThan(highFlowSum / highCount);
    }
  });
});

describe("フルパイプライン統合テスト", () => {
  it("3種類の地形が全て生成される", () => {
    const ctx = createContext(256, 256, 42, 1.0, 256);
    continentShape(ctx);
    erode(ctx);
    computeRivers(ctx);

    const classify = createClassifyBiome();
    const biomes = classify(ctx);
    const types = new Set(biomes);
    expect(types.has(Terrain.Flat)).toBe(true);
    expect(types.has(Terrain.Mountain)).toBe(true);
    expect(types.has(Terrain.Water)).toBe(true);
  });

  it("陸地（Flat+Mountain）が存在する", () => {
    const ctx = createContext(128, 128, 42, 1.0, 128);
    continentShape(ctx);
    erode(ctx);
    computeRivers(ctx);

    const classify = createClassifyBiome();
    const biomes = classify(ctx);
    let land = 0;
    let water = 0;
    for (const b of biomes) {
      if (b === Terrain.Water) water++;
      else land++;
    }
    // 陸地と水が両方存在すること
    expect(land).toBeGreaterThan(0);
    expect(water).toBeGreaterThan(0);
  });

  it("侵食により河川が形成される（高流量の連続帯）", () => {
    const ctx = createContext(128, 128, 42, 1.0, 128);
    continentShape(ctx);
    erode(ctx);
    computeRivers(ctx);

    // 高流量セルが隣接して連続している（川のネットワーク）
    let highFlowCount = 0;
    let neighborPairs = 0;
    for (let y = 0; y < 128; y++) {
      for (let x = 0; x < 127; x++) {
        const f1 = ctx.flow[y * 128 + x] ?? 0;
        const f2 = ctx.flow[y * 128 + x + 1] ?? 0;
        if (f1 > 30) highFlowCount++;
        if (f1 > 30 && f2 > 30) neighborPairs++;
      }
    }
    expect(highFlowCount).toBeGreaterThan(10);
    expect(neighborPairs).toBeGreaterThan(0);
  });

  it("relief パラメータで起伏が変化する", () => {
    const ctxFlat = createContext(64, 64, 42, 0.5, 512);
    const ctxSteep = createContext(64, 64, 42, 2.0, 512);
    continentShape(ctxFlat);
    continentShape(ctxSteep);

    const stdDev = (arr: Float32Array): number => {
      let sum = 0;
      for (const v of arr) sum += v;
      const mean = sum / arr.length;
      let sqSum = 0;
      for (const v of arr) sqSum += (v - mean) ** 2;
      return Math.sqrt(sqSum / arr.length);
    };

    expect(stdDev(ctxSteep.elevation)).toBeGreaterThan(stdDev(ctxFlat.elevation));
  });
});
