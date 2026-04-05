import { describe, it, expect } from "vitest";
import { createContext } from "../context.js";
import { latitudeWind } from "./climate.js";

/** 平坦な ocean を設定（elevation=0.1 で海として扱う） */
function fillFlatOcean(
  ctx: ReturnType<typeof createContext>,
  elev: number = 0.1,
): void {
  ctx.elevation.fill(elev);
}

/** 中央に山脈（東西方向に伸びる帯）を置く */
function placeMountainBand(
  ctx: ReturnType<typeof createContext>,
  centerX: number,
  width: number,
  peak: number,
): void {
  const { width: w, height: h, elevation } = ctx;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const dist = Math.abs(x - centerX);
      if (dist < width / 2) {
        const t = 1 - (dist / (width / 2));
        elevation[y * w + x] = Math.max(elevation[y * w + x] ?? 0, peak * t);
      }
    }
  }
}

describe("latitudeWind - 気温", () => {
  it("緯度が上がる（南に行く）ほど気温が高くなる", () => {
    const ctx = createContext(20, 20, 1);
    fillFlatOcean(ctx, 0);
    latitudeWind({ lapseRate: 0 }).run(ctx);

    // y=0 (北) vs y=h-1 (南) の温度を比較
    const north = ctx.temperature[0 * 20 + 10] ?? 0;
    const south = ctx.temperature[19 * 20 + 10] ?? 0;
    expect(south).toBeGreaterThan(north);
  });

  it("標高が高いほど気温が低くなる（adiabatic lapse）", () => {
    const ctx = createContext(20, 20, 1);
    // 同じ緯度で左半分は海、右半分は標高 0.8 の山
    for (let y = 0; y < 20; y++) {
      for (let x = 0; x < 20; x++) {
        ctx.elevation[y * 20 + x] = x < 10 ? 0 : 0.8;
      }
    }
    latitudeWind({ lapseRate: 0.6 }).run(ctx);

    // 同じ y=10 行で海と山の気温を比べる
    const ocean = ctx.temperature[10 * 20 + 2] ?? 0;
    const mountain = ctx.temperature[10 * 20 + 18] ?? 0;
    expect(mountain).toBeLessThan(ocean);
  });

  it("lapseRate=0 なら標高は気温に影響しない", () => {
    const ctx = createContext(20, 20, 1);
    for (let y = 0; y < 20; y++) {
      for (let x = 0; x < 20; x++) {
        ctx.elevation[y * 20 + x] = x < 10 ? 0 : 0.9;
      }
    }
    latitudeWind({ lapseRate: 0 }).run(ctx);
    const ocean = ctx.temperature[10 * 20 + 2] ?? 0;
    const mountain = ctx.temperature[10 * 20 + 18] ?? 0;
    expect(mountain).toBeCloseTo(ocean, 5);
  });

  it("温度は [0, 1] の範囲に収まる", () => {
    const ctx = createContext(32, 32, 1);
    // 強い標高でクランプを試験
    for (let i = 0; i < 32 * 32; i++) ctx.elevation[i] = 1.0;
    latitudeWind({ lapseRate: 2.0 }).run(ctx);
    for (let i = 0; i < ctx.temperature.length; i++) {
      const t = ctx.temperature[i] ?? -999;
      expect(t).toBeGreaterThanOrEqual(0);
      expect(t).toBeLessThanOrEqual(1);
    }
  });
});

describe("latitudeWind - 降水量（rain shadow）", () => {
  it("卓越風 east: 山の西側（風上）で降水が多く、東側（風下）で少ない", () => {
    const ctx = createContext(40, 10, 1);
    fillFlatOcean(ctx, 0.1); // 浅い海
    placeMountainBand(ctx, 20, 4, 0.8); // x=20 に山脈
    latitudeWind({ windDirection: "east", orographicFactor: 5 }).run(ctx);

    // y=5 行で西側（風上 x=18）と東側（風下 x=25）の降水を比較
    const windward = ctx.precipitation[5 * 40 + 18] ?? 0;
    const leeward = ctx.precipitation[5 * 40 + 25] ?? 0;
    expect(windward).toBeGreaterThan(leeward);
  });

  it("卓越風 west: 風向反転で風上・風下が入れ替わる", () => {
    const ctx = createContext(40, 10, 1);
    fillFlatOcean(ctx, 0.1);
    placeMountainBand(ctx, 20, 4, 0.8);
    latitudeWind({ windDirection: "west", orographicFactor: 5 }).run(ctx);

    // 風向が west なので東側が風上、西側が風下
    const eastSide = ctx.precipitation[5 * 40 + 25] ?? 0; // 風上
    const westSide = ctx.precipitation[5 * 40 + 18] ?? 0; // 風下
    expect(eastSide).toBeGreaterThan(westSide);
  });

  it("平坦な海のみ: 降水量が大きく変動しない", () => {
    const ctx = createContext(40, 10, 1);
    fillFlatOcean(ctx, 0.1);
    latitudeWind().run(ctx);

    const samples: number[] = [];
    for (let x = 0; x < 40; x++) samples.push(ctx.precipitation[5 * 40 + x] ?? 0);
    const min = Math.min(...samples);
    const max = Math.max(...samples);
    // 地形変動がないのでほぼ一定（±0.1 以内）
    expect(max - min).toBeLessThan(0.1);
  });

  it("降水量は [0, 1] の範囲に収まる", () => {
    const ctx = createContext(32, 32, 1);
    // 激しい起伏でクランプをテスト
    for (let y = 0; y < 32; y++) {
      for (let x = 0; x < 32; x++) {
        ctx.elevation[y * 32 + x] = Math.sin(x * 0.5) * 0.5 + 0.5;
      }
    }
    latitudeWind({ orographicFactor: 20 }).run(ctx);
    for (let i = 0; i < ctx.precipitation.length; i++) {
      const p = ctx.precipitation[i] ?? -999;
      expect(p).toBeGreaterThanOrEqual(0);
      expect(p).toBeLessThanOrEqual(1);
    }
  });
});

describe("latitudeWind - Strategy メタデータ", () => {
  it("正しい slot と requires/provides を宣言している", () => {
    const s = latitudeWind();
    expect(s.slot).toBe("climate");
    expect(s.name).toBe("latitudeWind");
    expect(s.requires).toContain("elevation");
    expect(s.provides).toContain("temperature");
    expect(s.provides).toContain("precipitation");
  });
});
