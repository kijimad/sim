import { describe, it, expect } from "vitest";
import { createContext } from "../context.js";
import { runPipeline } from "../slots.js";
import { ARCTIC_CONTINENT, TEMPERATE_CONTINENT } from "../pipeline.js";
import { climateBiomes } from "./arctic.js";
import { latitudeWind } from "./climate.js";

describe("climateBiomes ストラテジ", () => {
  it("Strategy メタデータが正しい", () => {
    const s = climateBiomes();
    expect(s.slot).toBe("biomeFeatures");
    expect(s.name).toBe("climateBiomes");
    expect(s.requires).toContain("temperature");
  });

  it("低気温セルを tundra に上書きする", () => {
    const ctx = createContext(32, 32, 1);
    ctx.elevation.fill(0.3);       // 全て陸地
    ctx.temperature.fill(0.1);     // 全て低温
    // 既存 biomeId を Hills (0) にする（既に 0 で初期化済み）
    climateBiomes({ tundraThreshold: 0.15 }).run(ctx);
    const TUNDRA = ctx.biomeRegistry.idOf("arctic.tundra");
    let count = 0;
    for (let i = 0; i < ctx.biomeId.length; i++) {
      if (ctx.biomeId[i] === TUNDRA) count++;
    }
    expect(count).toBe(32 * 32);
  });

  it("中間気温セルを taiga に上書きする", () => {
    const ctx = createContext(32, 32, 1);
    ctx.elevation.fill(0.3);
    ctx.temperature.fill(0.25); // tundra(<0.15) と taiga(<0.35) の間
    climateBiomes().run(ctx);
    const TAIGA = ctx.biomeRegistry.idOf("arctic.taiga");
    const TUNDRA = ctx.biomeRegistry.idOf("arctic.tundra");
    let taigaCount = 0;
    let tundraCount = 0;
    for (let i = 0; i < ctx.biomeId.length; i++) {
      if (ctx.biomeId[i] === TAIGA) taigaCount++;
      if (ctx.biomeId[i] === TUNDRA) tundraCount++;
    }
    expect(taigaCount).toBe(32 * 32);
    expect(tundraCount).toBe(0);
  });

  it("高標高＋低温で glacier に上書きする", () => {
    const ctx = createContext(32, 32, 1);
    ctx.elevation.fill(0.6);       // 高標高
    ctx.temperature.fill(0.05);    // 氷河閾値以下
    climateBiomes().run(ctx);
    const GLACIER = ctx.biomeRegistry.idOf("arctic.glacier");
    let count = 0;
    for (let i = 0; i < ctx.biomeId.length; i++) {
      if (ctx.biomeId[i] === GLACIER) count++;
    }
    expect(count).toBe(32 * 32);
  });

  it("温暖セルは既存バイオームを維持する", () => {
    const ctx = createContext(32, 32, 1);
    ctx.elevation.fill(0.3);
    ctx.temperature.fill(0.8); // 十分温暖
    // Hills を手動で書き込む（初期値でもあるが明示）
    const HILLS = ctx.biomeRegistry.idOf("terrain.hills");
    ctx.biomeId.fill(HILLS);
    climateBiomes().run(ctx);
    for (let i = 0; i < ctx.biomeId.length; i++) {
      expect(ctx.biomeId[i]).toBe(HILLS);
    }
  });

  it("海・湖バイオームは対象外", () => {
    const ctx = createContext(4, 4, 1);
    ctx.elevation.fill(0.1); // 水面
    ctx.temperature.fill(0.05); // 凍りそう
    const OCEAN = ctx.biomeRegistry.idOf("water.ocean");
    ctx.biomeId.fill(OCEAN);
    climateBiomes().run(ctx);
    for (let i = 0; i < ctx.biomeId.length; i++) {
      expect(ctx.biomeId[i]).toBe(OCEAN);
    }
  });
});

describe("latitudeWind tempScale/tempBias", () => {
  it("tempScale=0.4 で気温が 40% にスケールされる", () => {
    const ctx = createContext(20, 20, 1);
    ctx.elevation.fill(0); // lapse の影響を除外

    const ctxNormal = createContext(20, 20, 1);
    ctxNormal.elevation.fill(0);
    latitudeWind().run(ctxNormal);

    latitudeWind({ tempScale: 0.4 }).run(ctx);

    // 南端（y=19）の最高温度を比較
    const normalMax = ctxNormal.temperature[19 * 20 + 10] ?? 0;
    const scaledMax = ctx.temperature[19 * 20 + 10] ?? 0;
    expect(scaledMax).toBeCloseTo(normalMax * 0.4, 3);
  });

  it("tempBias で全体オフセットが効く", () => {
    const ctx = createContext(20, 20, 1);
    ctx.elevation.fill(0);
    latitudeWind({ tempBias: -0.2 }).run(ctx);

    // 北端は 0 クランプされる、南端は (1 - 0.2) = 0.8 付近
    const north = ctx.temperature[0] ?? 999;
    const south = ctx.temperature[19 * 20 + 10] ?? 0;
    expect(north).toBe(0); // clamp
    expect(south).toBeCloseTo(0.8, 2);
  });
});

describe("ARCTIC_CONTINENT パイプライン", () => {
  it("runPipeline がクラッシュせず完走する", () => {
    const ctx = createContext(96, 96, 3);
    expect(() => runPipeline(ARCTIC_CONTINENT, ctx)).not.toThrow();
  });

  it("tundra または taiga バイオームが広く存在する", () => {
    const ctx = createContext(128, 128, 5);
    runPipeline(ARCTIC_CONTINENT, ctx);

    const TUNDRA = ctx.biomeRegistry.idOf("arctic.tundra");
    const TAIGA = ctx.biomeRegistry.idOf("arctic.taiga");
    let coldCount = 0;
    for (let i = 0; i < ctx.biomeId.length; i++) {
      if (ctx.biomeId[i] === TUNDRA || ctx.biomeId[i] === TAIGA) coldCount++;
    }
    // マップの 20% 以上が寒冷バイオームで覆われる想定
    expect(coldCount).toBeGreaterThan(ctx.biomeId.length * 0.2);
  });

  it("TEMPERATE_CONTINENT も内部多様性として arctic バイオームを登録する", () => {
    // 設計変更: TEMPERATE_CONTINENT は Minecraft 風の内部多様性モデルになり、
    // 北端の寒冷帯に tundra/taiga が自然発生する。
    const ctx = createContext(64, 64, 42);
    runPipeline(TEMPERATE_CONTINENT, ctx);
    expect(ctx.biomeRegistry.has("arctic.tundra")).toBe(true);
    expect(ctx.biomeRegistry.has("arctic.taiga")).toBe(true);
    expect(ctx.biomeRegistry.has("arctic.glacier")).toBe(true);
  });
});
