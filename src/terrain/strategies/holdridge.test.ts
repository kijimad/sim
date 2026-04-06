import { describe, it, expect } from "vitest";
import { createContext } from "../context.js";
import { runPipeline } from "../slots.js";
import { TEMPERATE_CONTINENT } from "../pipeline.js";
import { holdridgeBiomes } from "./holdridge.js";
import { BIOME_TAGS } from "../biome-registry.js";

/**
 * Holdridge 風気候駆動バイオーム分類のテスト。
 *
 * 単体テスト: T×P マトリクスから正しく各バイオームを選択することを検証。
 * 統合テスト: TEMPERATE_CONTINENT が複数の気候バイオームを同時に含むことを検証。
 */

/** テスト用に 1 セルの ctx を作り、T, P, E, biomeId を設定して holdridgeBiomes を走らせる */
function singleCell(
  temperature: number,
  precipitation: number,
  elevation: number,
  biomeTag: string = BIOME_TAGS.Hills,
): ReturnType<typeof createContext> {
  const ctx = createContext(1, 1, 1);
  ctx.elevation[0] = elevation;
  ctx.temperature[0] = temperature;
  ctx.precipitation[0] = precipitation;
  ctx.biomeId[0] = ctx.biomeRegistry.idOf(biomeTag);
  holdridgeBiomes().run(ctx);
  return ctx;
}

describe("holdridgeBiomes マトリクス", () => {
  it("Strategy メタデータが正しい", () => {
    const s = holdridgeBiomes();
    expect(s.slot).toBe("biomeFeatures");
    expect(s.name).toBe("holdridgeBiomes");
  });

  // --- polar zone ---
  it("polar + 低地 → tundra", () => {
    const ctx = singleCell(0.05, 0.5, 0.3);
    expect(ctx.biomeRegistry.getById(ctx.biomeId[0] ?? 0)?.tag).toBe("arctic.tundra");
  });

  it("polar + 高標高 → glacier", () => {
    const ctx = singleCell(0.05, 0.5, 0.6);
    expect(ctx.biomeRegistry.getById(ctx.biomeId[0] ?? 0)?.tag).toBe("arctic.glacier");
  });

  // --- boreal zone ---
  it("boreal + 湿潤 → taiga", () => {
    const ctx = singleCell(0.2, 0.5, 0.3);
    expect(ctx.biomeRegistry.getById(ctx.biomeId[0] ?? 0)?.tag).toBe("arctic.taiga");
  });

  it("boreal + 乾燥 → tundra", () => {
    const ctx = singleCell(0.2, 0.1, 0.3);
    expect(ctx.biomeRegistry.getById(ctx.biomeId[0] ?? 0)?.tag).toBe("arctic.tundra");
  });

  // --- cool temperate zone ---
  it("cool temperate + 乾燥 → steppe", () => {
    const ctx = singleCell(0.4, 0.1, 0.3);
    expect(ctx.biomeRegistry.getById(ctx.biomeId[0] ?? 0)?.tag).toBe("arid.steppe");
  });

  it("cool temperate + 湿潤 → 既存 Hills を維持", () => {
    const ctx = singleCell(0.4, 0.5, 0.3);
    expect(ctx.biomeRegistry.getById(ctx.biomeId[0] ?? 0)?.tag).toBe(BIOME_TAGS.Hills);
  });

  // --- warm temperate zone ---
  it("warm temperate + 乾燥 → desert", () => {
    const ctx = singleCell(0.6, 0.1, 0.3);
    expect(ctx.biomeRegistry.getById(ctx.biomeId[0] ?? 0)?.tag).toBe("arid.desert");
  });

  // --- tropical zone ---
  it("tropical + 乾燥 → desert", () => {
    const ctx = singleCell(0.8, 0.1, 0.3);
    expect(ctx.biomeRegistry.getById(ctx.biomeId[0] ?? 0)?.tag).toBe("arid.desert");
  });

  it("tropical + 半乾燥 → savanna", () => {
    const ctx = singleCell(0.8, 0.3, 0.3);
    expect(ctx.biomeRegistry.getById(ctx.biomeId[0] ?? 0)?.tag).toBe("tropical.savanna");
  });

  it("tropical + 湿潤 → rainforest", () => {
    const ctx = singleCell(0.8, 0.6, 0.3);
    expect(ctx.biomeRegistry.getById(ctx.biomeId[0] ?? 0)?.tag).toBe("tropical.rainforest");
  });

  // --- 上書き除外 ---
  it("海洋バイオームは上書きしない", () => {
    const ctx = singleCell(0.8, 0.1, 0.1, BIOME_TAGS.Ocean);
    expect(ctx.biomeRegistry.getById(ctx.biomeId[0] ?? 0)?.tag).toBe(BIOME_TAGS.Ocean);
  });

  it("Wetland は上書きしない（地形特徴は維持）", () => {
    const ctx = singleCell(0.8, 0.1, 0.25, BIOME_TAGS.Wetland);
    expect(ctx.biomeRegistry.getById(ctx.biomeId[0] ?? 0)?.tag).toBe(BIOME_TAGS.Wetland);
  });

  it("Canyon は上書きしない", () => {
    const ctx = singleCell(0.8, 0.1, 0.6, BIOME_TAGS.Canyon);
    expect(ctx.biomeRegistry.getById(ctx.biomeId[0] ?? 0)?.tag).toBe(BIOME_TAGS.Canyon);
  });

  it("Cliff は上書きしない", () => {
    const ctx = singleCell(0.8, 0.1, 0.3, BIOME_TAGS.Cliff);
    expect(ctx.biomeRegistry.getById(ctx.biomeId[0] ?? 0)?.tag).toBe(BIOME_TAGS.Cliff);
  });

  it("Highland も上書き対象（generic terrain biome）", () => {
    const ctx = singleCell(0.05, 0.5, 0.3, BIOME_TAGS.Highland);
    expect(ctx.biomeRegistry.getById(ctx.biomeId[0] ?? 0)?.tag).toBe("arctic.tundra");
  });

  it("Plateau も上書き対象", () => {
    const ctx = singleCell(0.8, 0.1, 0.6, BIOME_TAGS.Plateau);
    expect(ctx.biomeRegistry.getById(ctx.biomeId[0] ?? 0)?.tag).toBe("arid.desert");
  });
});

describe("TEMPERATE_CONTINENT で Holdridge バイオームが複数現れる", () => {
  it("単一マップに tundra/taiga/desert/rainforest 等の多様なバイオームが現れる", () => {
    const ctx = createContext(192, 192, 42);
    runPipeline(TEMPERATE_CONTINENT, ctx);
    const reg = ctx.biomeRegistry;

    const climateTags = [
      "arctic.tundra",
      "arctic.taiga",
      "arctic.glacier",
      "arid.steppe",
      "arid.desert",
      "tropical.savanna",
      "tropical.rainforest",
    ];

    const counts: Record<string, number> = {};
    for (const tag of climateTags) counts[tag] = 0;

    for (let i = 0; i < ctx.biomeId.length; i++) {
      const def = reg.getById(ctx.biomeId[i] ?? 0);
      if (def !== undefined && def.tag in counts) {
        counts[def.tag] = (counts[def.tag] ?? 0) + 1;
      }
    }

    // 少なくとも 3 種類以上の気候バイオームが出現する
    const biomesPresent = Object.values(counts).filter(c => c > 0).length;
    expect(biomesPresent).toBeGreaterThanOrEqual(3);
  });
});
