import { describe, it, expect } from "vitest";
import { createContext } from "../context.js";
import { runPipeline } from "../slots.js";
import { YUGAWARA_DEM } from "../pipeline.js";
import { demHeightmap } from "./dem.js";

describe("demHeightmap", () => {
  it("Strategy メタデータが正しい", () => {
    const s = demHeightmap({ mesh: "523950" });
    expect(s.slot).toBe("landmass");
    expect(s.name).toContain("demHeightmap");
    expect(s.provides).toContain("elevation");
  });

  it("ctx.elevation に DEM データを書き込む", () => {
    const ctx = createContext(64, 64, 1);
    demHeightmap({ mesh: "523950" }).run(ctx);

    // elevation が埋まっている（全 0 ではない）
    let nonZero = 0;
    for (let i = 0; i < ctx.elevation.length; i++) {
      if ((ctx.elevation[i] ?? 0) > 0) nonZero++;
    }
    expect(nonZero).toBeGreaterThan(0);
  });

  it("elevation は [0, 1] の範囲に収まる", () => {
    const ctx = createContext(48, 48, 1);
    demHeightmap({ mesh: "523950" }).run(ctx);
    for (let i = 0; i < ctx.elevation.length; i++) {
      const e = ctx.elevation[i] ?? -1;
      expect(e).toBeGreaterThanOrEqual(0);
      expect(e).toBeLessThanOrEqual(1);
    }
  });

  it("解像度違いでリサンプルされる", () => {
    const ctxSmall = createContext(32, 32, 1);
    const ctxLarge = createContext(128, 128, 1);
    demHeightmap({ mesh: "523950" }).run(ctxSmall);
    demHeightmap({ mesh: "523950" }).run(ctxLarge);

    // 同じ相対位置（中央）の標高が近いはず（バイリニア補間が動いている）
    const midSmall = ctxSmall.elevation[16 * 32 + 16] ?? 0;
    const midLarge = ctxLarge.elevation[64 * 128 + 64] ?? 0;
    expect(Math.abs(midSmall - midLarge)).toBeLessThan(0.15);
  });

  it("標高にある程度の variation がある", () => {
    const ctx = createContext(64, 64, 1);
    demHeightmap({ mesh: "523950" }).run(ctx);
    let minE = Infinity, maxE = -Infinity;
    for (let i = 0; i < ctx.elevation.length; i++) {
      const e = ctx.elevation[i] ?? 0;
      if (e < minE) minE = e;
      if (e > maxE) maxE = e;
    }
    // 最低値と最高値に幅がある（完全に平坦でない）
    expect(maxE - minE).toBeGreaterThan(0.05);
  });
});

describe("YUGAWARA_DEM パイプライン", () => {
  it("runPipeline がクラッシュせず完走する", () => {
    const ctx = createContext(128, 128, 1);
    expect(() => runPipeline(YUGAWARA_DEM, ctx)).not.toThrow();
  });

  it("生成結果に海と陸の両方が含まれる", () => {
    const ctx = createContext(128, 128, 1);
    runPipeline(YUGAWARA_DEM, ctx);

    let waterCells = 0;
    let landCells = 0;
    for (let i = 0; i < ctx.elevation.length; i++) {
      if ((ctx.elevation[i] ?? 0) < 0.2) waterCells++;
      else landCells++;
    }
    expect(waterCells).toBeGreaterThan(0);
    expect(landCells).toBeGreaterThan(0);
  });

  it("hydrology をスキップしている (DEM を補正しない)", () => {
    // DEM パイプラインは地形補正を全部外しているので flow は計算されない
    const ctx = createContext(96, 96, 1);
    runPipeline(YUGAWARA_DEM, ctx);
    let maxFlow = 0;
    for (let i = 0; i < ctx.flow.length; i++) {
      if ((ctx.flow[i] ?? 0) > maxFlow) maxFlow = ctx.flow[i] ?? 0;
    }
    // hydrology noop なので flow は初期値 0 のまま
    expect(maxFlow).toBe(0);
  });

  it("biomeId が割り当てられている", () => {
    const ctx = createContext(96, 96, 1);
    runPipeline(YUGAWARA_DEM, ctx);
    const biomes = new Set<number>();
    for (let i = 0; i < ctx.biomeId.length; i++) {
      biomes.add(ctx.biomeId[i] ?? 0);
    }
    // 複数のバイオームが存在する（少なくとも海と陸）
    expect(biomes.size).toBeGreaterThanOrEqual(2);
  });
});
