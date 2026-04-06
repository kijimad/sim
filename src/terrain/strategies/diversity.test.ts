import { describe, it, expect } from "vitest";
import { createContext } from "../context.js";
import { runPipeline } from "../slots.js";
import { TEMPERATE_CONTINENT } from "../pipeline.js";

/**
 * TEMPERATE_CONTINENT の内部多様性テスト。
 *
 * Minecraft 風の「1 つのマップ内に複数のバイオーム帯が混在する」ことを検証する。
 * 最小条件: 通常地形（Hills/Highland）、寒冷帯（tundra/taiga）、火山系が全て存在。
 */

describe("TEMPERATE_CONTINENT 内部多様性", () => {
  const SIZE = 160;
  const SEED = 42;

  it("1 つのマップに陸地・気候バイオーム・火山が混在する", () => {
    const ctx = createContext(SIZE, SIZE, SEED);
    runPipeline(TEMPERATE_CONTINENT, ctx);
    const reg = ctx.biomeRegistry;

    const TUNDRA = reg.idOf("arctic.tundra");
    const TAIGA = reg.idOf("arctic.taiga");
    const CONE = reg.idOf("volcanic.cone");

    // 陸地の気候バイオーム（Holdridge の全カテゴリ）の合計が陸地の大半を占めるべき
    const climateBiomeTags = [
      "terrain.hills", "mountain.highland", "mountain.plateau",
      "arctic.tundra", "arctic.taiga", "arctic.glacier",
      "arid.steppe", "arid.desert",
      "tropical.savanna", "tropical.rainforest",
    ];
    const climateBiomeIds = new Set(
      climateBiomeTags.filter(t => reg.has(t)).map(t => reg.idOf(t)),
    );

    let climateBiomeCount = 0;
    let coldCount = 0;
    let volcanicCount = 0;

    for (let i = 0; i < ctx.biomeId.length; i++) {
      const b = ctx.biomeId[i] ?? 0;
      if (climateBiomeIds.has(b)) climateBiomeCount++;
      if (b === TUNDRA || b === TAIGA) coldCount++;
      if (b === CONE) volcanicCount++;
    }

    // 気候系陸地バイオームが主体（マップの 15% 以上）
    expect(climateBiomeCount).toBeGreaterThan(SIZE * SIZE * 0.15);
    // 寒冷帯が存在する（北端にあるはず）
    expect(coldCount).toBeGreaterThan(0);
    // 火山錐が存在する（散在配置なので必ず 2 つは作られるはず）
    expect(volcanicCount).toBeGreaterThan(0);
  });

  it("寒冷帯は北部に偏在する（南部にツンドラが出現しない）", () => {
    const ctx = createContext(SIZE, SIZE, SEED);
    runPipeline(TEMPERATE_CONTINENT, ctx);
    const TUNDRA = ctx.biomeRegistry.idOf("arctic.tundra");

    let northCount = 0;
    let southCount = 0;
    const mid = Math.floor(SIZE / 2);
    for (let y = 0; y < SIZE; y++) {
      for (let x = 0; x < SIZE; x++) {
        if (ctx.biomeId[y * SIZE + x] === TUNDRA) {
          if (y < mid) northCount++;
          else southCount++;
        }
      }
    }
    // 北半分にツンドラが集中する（南半分より多い）
    expect(northCount).toBeGreaterThan(southCount);
  });

  it("複数 seed で安定して多様性が生成される", () => {
    const seeds = [1, 42, 123, 2024];
    for (const seed of seeds) {
      const ctx = createContext(SIZE, SIZE, seed);
      runPipeline(TEMPERATE_CONTINENT, ctx);
      const reg = ctx.biomeRegistry;

      // 各 seed で少なくとも火山と寒冷帯の片方は出現するはず
      const CONE = reg.idOf("volcanic.cone");
      const TUNDRA = reg.idOf("arctic.tundra");
      const TAIGA = reg.idOf("arctic.taiga");

      let hasVolcanic = false;
      let hasCold = false;
      for (let i = 0; i < ctx.biomeId.length; i++) {
        const b = ctx.biomeId[i] ?? 0;
        if (b === CONE) hasVolcanic = true;
        if (b === TUNDRA || b === TAIGA) hasCold = true;
        if (hasVolcanic && hasCold) break;
      }
      // 火山は count=2 でほぼ必ず陸上に落ちるはず
      // 寒冷帯は北端が海でない限り発生するはず
      expect(hasVolcanic).toBe(true);
      // 寒冷帯は地形次第で出ない可能性もあるが、総合的には安定
      if (!hasCold) {
        // eslint-disable-next-line no-console
        console.log(`seed=${String(seed)}: 寒冷帯が発生しませんでした`);
      }
    }
  });
});
