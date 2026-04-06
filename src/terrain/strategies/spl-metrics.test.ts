import { describe, it, expect } from "vitest";
import { createContext } from "../context.js";
import { runPipeline } from "../slots.js";
import { TEMPERATE_CONTINENT } from "../pipeline.js";

/**
 * SPL 統合テスト: TEMPERATE_CONTINENT パイプライン全体で SPL が dendritic な
 * 水系を作っているかを測定する。
 *
 * このテストは SPL パラメータチューニングの **回帰テスト** として機能し、
 * パラメータを強めに調整したときに dendritic 度が改善するか後退するかを
 * 数値で確認できる。
 */

/** 陸上セルの flow 集中度: 上位 P% のセルが全流量の何%を占めるか */
function flowConcentration(
  flow: Float32Array,
  elevation: Float32Array,
  topPercent: number,
): number {
  const landFlows: number[] = [];
  for (let i = 0; i < flow.length; i++) {
    // 陸地のみ対象（海上の flow は下流の集積なので除外）
    if ((elevation[i] ?? 0) >= 0.2) {
      landFlows.push(flow[i] ?? 0);
    }
  }
  if (landFlows.length === 0) return 0;
  landFlows.sort((a, b) => b - a);
  const total = landFlows.reduce((s, v) => s + v, 0);
  if (total === 0) return 0;
  const topCount = Math.max(1, Math.ceil(landFlows.length * topPercent / 100));
  let topSum = 0;
  for (let i = 0; i < topCount; i++) topSum += landFlows[i] ?? 0;
  return topSum / total;
}

/** 隣接セル差の 90%ile（地形のメリハリ指標） */
function adjacentDiff90ile(
  elevation: Float32Array,
  w: number,
  h: number,
): number {
  const diffs: number[] = [];
  for (let y = 0; y < h - 1; y++) {
    for (let x = 0; x < w - 1; x++) {
      const i = y * w + x;
      const eh = elevation[i] ?? 0;
      if (eh < 0.2) continue; // 陸地のみ
      diffs.push(Math.abs(eh - (elevation[i + 1] ?? 0)));
      diffs.push(Math.abs(eh - (elevation[i + w] ?? 0)));
    }
  }
  if (diffs.length === 0) return 0;
  diffs.sort((a, b) => a - b);
  return diffs[Math.floor(diffs.length * 0.9)] ?? 0;
}

describe("TEMPERATE_CONTINENT SPL メトリクス", () => {
  const SIZE = 128;
  const SEEDS = [42, 123, 2024];

  it("複数 seed で flow が特定パスに集中する（dendritic 性）", () => {
    for (const seed of SEEDS) {
      const ctx = createContext(SIZE, SIZE, seed);
      runPipeline(TEMPERATE_CONTINENT, ctx);
      const concentration = flowConcentration(ctx.flow, ctx.elevation, 1);
      // 上位 1% の陸地セルが全流量の 30% 以上を占めれば dendritic と言える
      // （均等分散なら 1%、純粋な放射状なら ~10%、dendritic なら 30%+）
      expect(concentration).toBeGreaterThan(0.30);
    }
  });

  it("上位 5% の集中度が十分（河川ネットワークらしさ）", () => {
    const ctx = createContext(SIZE, SIZE, 42);
    runPipeline(TEMPERATE_CONTINENT, ctx);
    const concentration = flowConcentration(ctx.flow, ctx.elevation, 5);
    // 上位 5% が全流量の 50%+ を占めれば河川系らしい
    expect(concentration).toBeGreaterThan(0.50);
  });

  it("隣接差 90%ile が DEM 想定範囲内（0.005〜0.05）", () => {
    const ctx = createContext(SIZE, SIZE, 42);
    runPipeline(TEMPERATE_CONTINENT, ctx);
    const d90 = adjacentDiff90ile(ctx.elevation, SIZE, SIZE);
    // 0.005 未満なら平坦すぎ、0.05 超なら急峻すぎ
    expect(d90).toBeGreaterThan(0.005);
    expect(d90).toBeLessThan(0.05);
  });

  it("生成結果が決定論的（同 seed で同じ flow 集中度）", () => {
    const ctx1 = createContext(SIZE, SIZE, 42);
    runPipeline(TEMPERATE_CONTINENT, ctx1);
    const ctx2 = createContext(SIZE, SIZE, 42);
    runPipeline(TEMPERATE_CONTINENT, ctx2);
    const c1 = flowConcentration(ctx1.flow, ctx1.elevation, 1);
    const c2 = flowConcentration(ctx2.flow, ctx2.elevation, 1);
    expect(c1).toBeCloseTo(c2, 10);
  });
});
