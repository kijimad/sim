import { describe, it, expect } from "vitest";
import { createContext } from "../context.js";
import { runPipeline } from "../slots.js";
import { VOLCANIC_ARCHIPELAGO, TEMPERATE_CONTINENT } from "../pipeline.js";
import { HOTSPOTS_KEY, hotspotChain, volcano, lavaFlow, type Hotspot } from "./volcanic.js";

describe("hotspotChain", () => {
  it("Strategy メタデータが正しい", () => {
    const s = hotspotChain();
    expect(s.slot).toBe("tectonics");
    expect(s.name).toBe("hotspotChain");
  });

  it("指定個数のホットスポットを metadata に保存する", () => {
    const ctx = createContext(64, 64, 1);
    hotspotChain({ count: 7 }).run(ctx);
    const hs = ctx.metadata.get(HOTSPOTS_KEY) as Hotspot[] | undefined;
    expect(hs).toBeDefined();
    expect(hs?.length).toBe(7);
  });

  it("各ホットスポットがマップ内の有効座標を持つ", () => {
    const ctx = createContext(64, 64, 42);
    hotspotChain({ count: 5 }).run(ctx);
    const hs = ctx.metadata.get(HOTSPOTS_KEY) as Hotspot[];
    for (const h of hs) {
      expect(h.x).toBeGreaterThanOrEqual(0);
      expect(h.x).toBeLessThan(64);
      expect(h.y).toBeGreaterThanOrEqual(0);
      expect(h.y).toBeLessThan(64);
      expect(h.peak).toBeGreaterThan(0);
      expect(h.radius).toBeGreaterThan(0);
    }
  });

  it("ホットスポット周辺の標高が上昇する", () => {
    const ctx = createContext(64, 64, 1);
    // 海面状態（elevation=0）から始める
    ctx.elevation.fill(0);
    hotspotChain({ count: 3, peak: 0.5, radius: 10 }).run(ctx);
    // 少なくとも 1 セルは上昇しているはず
    let maxElev = 0;
    for (let i = 0; i < ctx.elevation.length; i++) {
      if ((ctx.elevation[i] ?? 0) > maxElev) maxElev = ctx.elevation[i] ?? 0;
    }
    expect(maxElev).toBeGreaterThan(0.05);
  });
});

describe("volcano", () => {
  it("Strategy メタデータが正しい", () => {
    const s = volcano();
    expect(s.slot).toBe("biomeFeatures");
    expect(s.name).toBe("volcano");
  });

  it("ホットスポットがないときは何もしない", () => {
    const ctx = createContext(32, 32, 1);
    ctx.elevation.fill(0.5);
    const before = new Float32Array(ctx.elevation);
    volcano().run(ctx);
    for (let i = 0; i < ctx.elevation.length; i++) {
      expect(ctx.elevation[i]).toBe(before[i]);
    }
  });

  it("ホットスポット位置に円錐状の隆起が発生する", () => {
    const ctx = createContext(64, 64, 1);
    ctx.elevation.fill(0.2); // 海面少し上の基底
    // 中央に手動でホットスポットを置く
    ctx.metadata.set(HOTSPOTS_KEY, [
      { x: 32, y: 32, peak: 0.5, radius: 10, craterRadius: 2 },
    ] as Hotspot[]);
    volcano().run(ctx);
    // 中心付近は元より高いはず（ただしカルデラで掘られる可能性あり）
    const aroundPeak = ctx.elevation[32 * 64 + 35] ?? 0; // 中心から少し外れた位置
    expect(aroundPeak).toBeGreaterThan(0.3);
  });

  it("volcanic.cone / volcanic.crater バイオームが登録・割当される", () => {
    const ctx = createContext(64, 64, 1);
    ctx.elevation.fill(0.2);
    ctx.metadata.set(HOTSPOTS_KEY, [
      { x: 32, y: 32, peak: 0.5, radius: 10, craterRadius: 2 },
    ] as Hotspot[]);
    volcano().run(ctx);
    expect(ctx.biomeRegistry.has("volcanic.cone")).toBe(true);
    expect(ctx.biomeRegistry.has("volcanic.crater")).toBe(true);
    // 中心セルは crater、周囲に cone がいるはず
    const coneId = ctx.biomeRegistry.idOf("volcanic.cone");
    const craterId = ctx.biomeRegistry.idOf("volcanic.crater");
    let coneCount = 0;
    let craterCount = 0;
    for (let i = 0; i < ctx.biomeId.length; i++) {
      if (ctx.biomeId[i] === coneId) coneCount++;
      if (ctx.biomeId[i] === craterId) craterCount++;
    }
    expect(coneCount).toBeGreaterThan(0);
    expect(craterCount).toBeGreaterThan(0);
  });
});

describe("lavaFlow", () => {
  it("Strategy メタデータが正しい", () => {
    const s = lavaFlow();
    expect(s.slot).toBe("biomeFeatures");
    expect(s.name).toBe("lavaFlow");
  });

  it("ホットスポット周辺の陸地に溶岩原が配置される", () => {
    const ctx = createContext(64, 64, 1);
    ctx.elevation.fill(0.3); // 全て陸地
    ctx.metadata.set(HOTSPOTS_KEY, [
      { x: 32, y: 32, peak: 0.5, radius: 10, craterRadius: 2 },
    ] as Hotspot[]);
    lavaFlow({ flowRadius: 8, density: 1.0 }).run(ctx);
    expect(ctx.biomeRegistry.has("volcanic.lava_field")).toBe(true);
    const lavaId = ctx.biomeRegistry.idOf("volcanic.lava_field");
    let lavaCount = 0;
    for (let i = 0; i < ctx.biomeId.length; i++) {
      if (ctx.biomeId[i] === lavaId) lavaCount++;
    }
    expect(lavaCount).toBeGreaterThan(0);
  });

  it("海上には溶岩原を置かない", () => {
    const ctx = createContext(64, 64, 1);
    ctx.elevation.fill(0.05); // 全て海
    ctx.metadata.set(HOTSPOTS_KEY, [
      { x: 32, y: 32, peak: 0.5, radius: 10, craterRadius: 2 },
    ] as Hotspot[]);
    lavaFlow().run(ctx);
    // 溶岩バイオームは登録されても、割り当てられたセルはない
    const lavaId = ctx.biomeRegistry.idOf("volcanic.lava_field");
    let lavaCount = 0;
    for (let i = 0; i < ctx.biomeId.length; i++) {
      if (ctx.biomeId[i] === lavaId) lavaCount++;
    }
    expect(lavaCount).toBe(0);
  });
});

describe("VOLCANIC_ARCHIPELAGO パイプライン統合", () => {
  it("runPipeline でクラッシュせず完走する", () => {
    const ctx = createContext(64, 64, 7);
    expect(() => runPipeline(VOLCANIC_ARCHIPELAGO, ctx)).not.toThrow();
  });

  it("生成結果にホットスポット情報が残る", () => {
    const ctx = createContext(64, 64, 7);
    runPipeline(VOLCANIC_ARCHIPELAGO, ctx);
    const hs = ctx.metadata.get(HOTSPOTS_KEY) as Hotspot[] | undefined;
    expect(hs).toBeDefined();
    expect(hs?.length ?? 0).toBeGreaterThan(0);
  });

  it("生成結果に火山系バイオームが存在する", () => {
    const ctx = createContext(128, 128, 7);
    runPipeline(VOLCANIC_ARCHIPELAGO, ctx);
    const coneId = ctx.biomeRegistry.idOf("volcanic.cone");
    let coneCount = 0;
    for (let i = 0; i < ctx.biomeId.length; i++) {
      if (ctx.biomeId[i] === coneId) coneCount++;
    }
    expect(coneCount).toBeGreaterThan(0);
  });

  it("TEMPERATE_CONTINENT も内部多様性として火山バイオームを登録する", () => {
    // 設計変更: TEMPERATE_CONTINENT は Minecraft 風の内部多様性モデルになり、
    // 散在火山を含むため、volcanic バイオームが登録されるようになった。
    const ctxTemperate = createContext(64, 64, 42);
    runPipeline(TEMPERATE_CONTINENT, ctxTemperate);
    expect(ctxTemperate.biomeRegistry.has("volcanic.cone")).toBe(true);
    expect(ctxTemperate.biomeRegistry.has("volcanic.lava_field")).toBe(true);
  });

  it("別 ctx の BiomeRegistry は独立している（ctx 隔離性）", () => {
    // ctx ごとに新しい registry が作られるので、別 ctx で実行されたパイプラインは
    // 互いに影響しない。
    const ctxA = createContext(16, 16, 1);
    const ctxB = createContext(16, 16, 1);
    runPipeline(VOLCANIC_ARCHIPELAGO, ctxA);
    // ctxB には何も走らせていない: volcanic バイオームは登録されていないはず
    expect(ctxB.biomeRegistry.has("volcanic.cone")).toBe(false);
    // ctxA と ctxB の registry は別インスタンス
    expect(ctxA.biomeRegistry).not.toBe(ctxB.biomeRegistry);
  });
});
