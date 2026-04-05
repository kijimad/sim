import { describe, it, expect } from "vitest";
import {
  BiomeRegistry,
  BIOME_TAGS,
  registerStandardBiomes,
} from "./biome-registry.js";
import { Terrain } from "../types.js";

describe("BiomeRegistry", () => {
  it("新しいバイオームを登録して ID を返す", () => {
    const reg = new BiomeRegistry();
    const id = reg.register({
      tag: "test.custom",
      displayName: "Custom",
      traversal: { baseCost: 1, passable: true },
      color: [100, 100, 100],
      terrainType: Terrain.Flat,
    });
    expect(id).toBe(0);
    expect(reg.size()).toBe(1);
  });

  it("タグから ID を引ける", () => {
    const reg = new BiomeRegistry();
    const id = reg.register({
      tag: "test.custom",
      displayName: "Custom",
      traversal: { baseCost: 1, passable: true },
      color: [0, 0, 0],
      terrainType: Terrain.Flat,
    });
    expect(reg.idOf("test.custom")).toBe(id);
    expect(reg.has("test.custom")).toBe(true);
  });

  it("ID から BiomeDef を引ける", () => {
    const reg = new BiomeRegistry();
    const id = reg.register({
      tag: "test.custom",
      displayName: "Custom",
      traversal: { baseCost: 3, passable: true },
      color: [1, 2, 3],
      terrainType: Terrain.Mountain,
    });
    const def = reg.getById(id);
    expect(def?.tag).toBe("test.custom");
    expect(def?.traversal.baseCost).toBe(3);
    expect(def?.terrainType).toBe(Terrain.Mountain);
  });

  it("同じタグを二重登録すると例外", () => {
    const reg = new BiomeRegistry();
    reg.register({
      tag: "test.dup",
      displayName: "Dup",
      traversal: { baseCost: 1, passable: true },
      color: [0, 0, 0],
      terrainType: Terrain.Flat,
    });
    expect(() =>
      reg.register({
        tag: "test.dup",
        displayName: "Dup2",
        traversal: { baseCost: 1, passable: true },
        color: [0, 0, 0],
        terrainType: Terrain.Flat,
      }),
    ).toThrow(/already registered/);
  });

  it("未登録タグに idOf すると例外", () => {
    const reg = new BiomeRegistry();
    expect(() => reg.idOf("nonexistent")).toThrow(/Unknown biome tag/);
  });

  it("getByTag は未登録で undefined を返す", () => {
    const reg = new BiomeRegistry();
    expect(reg.getByTag("nonexistent")).toBeUndefined();
  });

  it("登録順に ID が連番で払い出される", () => {
    const reg = new BiomeRegistry();
    const a = reg.register({
      tag: "test.a",
      displayName: "A",
      traversal: { baseCost: 1, passable: true },
      color: [0, 0, 0],
      terrainType: Terrain.Flat,
    });
    const b = reg.register({
      tag: "test.b",
      displayName: "B",
      traversal: { baseCost: 1, passable: true },
      color: [0, 0, 0],
      terrainType: Terrain.Flat,
    });
    expect(a).toBe(0);
    expect(b).toBe(1);
  });
});

describe("registerStandardBiomes", () => {
  it("12 種類のバイオームを旧 enum 順で登録する", () => {
    const reg = new BiomeRegistry();
    registerStandardBiomes(reg);
    expect(reg.size()).toBe(12);

    // ID 順序が旧 Biome enum と一致すること（テスト互換性の根拠）
    expect(reg.idOf(BIOME_TAGS.Hills)).toBe(0);
    expect(reg.idOf(BIOME_TAGS.Highland)).toBe(1);
    expect(reg.idOf(BIOME_TAGS.Bay)).toBe(2);
    expect(reg.idOf(BIOME_TAGS.Beach)).toBe(3);
    expect(reg.idOf(BIOME_TAGS.Ocean)).toBe(4);
    expect(reg.idOf(BIOME_TAGS.Island)).toBe(5);
    expect(reg.idOf(BIOME_TAGS.Lake)).toBe(6);
    expect(reg.idOf(BIOME_TAGS.Canyon)).toBe(7);
    expect(reg.idOf(BIOME_TAGS.Wetland)).toBe(8);
    expect(reg.idOf(BIOME_TAGS.Cliff)).toBe(9);
    expect(reg.idOf(BIOME_TAGS.Plateau)).toBe(10);
    expect(reg.idOf(BIOME_TAGS.Alluvial)).toBe(11);
  });

  it("各バイオームに正しい terrainType が設定される", () => {
    const reg = new BiomeRegistry();
    registerStandardBiomes(reg);
    expect(reg.getByTag(BIOME_TAGS.Hills)?.terrainType).toBe(Terrain.Flat);
    expect(reg.getByTag(BIOME_TAGS.Highland)?.terrainType).toBe(Terrain.Mountain);
    expect(reg.getByTag(BIOME_TAGS.Ocean)?.terrainType).toBe(Terrain.Water);
    expect(reg.getByTag(BIOME_TAGS.Beach)?.terrainType).toBe(Terrain.Sand);
  });

  it("通行不可バイオームが正しく設定される", () => {
    const reg = new BiomeRegistry();
    registerStandardBiomes(reg);
    expect(reg.getByTag(BIOME_TAGS.Ocean)?.traversal.passable).toBe(false);
    expect(reg.getByTag(BIOME_TAGS.Lake)?.traversal.passable).toBe(false);
    expect(reg.getByTag(BIOME_TAGS.Hills)?.traversal.passable).toBe(true);
  });
});

describe("BiomeRegistry.ensureBiome", () => {
  it("未登録なら register する", () => {
    const reg = new BiomeRegistry();
    const id = reg.ensureBiome({
      tag: "test.new",
      displayName: "New",
      traversal: { baseCost: 1, passable: true },
      color: [0, 0, 0],
      terrainType: Terrain.Flat,
    });
    expect(reg.size()).toBe(1);
    expect(id).toBe(0);
  });

  it("既存タグなら同じ ID を返し新規登録しない", () => {
    const reg = new BiomeRegistry();
    const def = {
      tag: "test.existing",
      displayName: "Existing",
      traversal: { baseCost: 1, passable: true },
      color: [0, 0, 0] as [number, number, number],
      terrainType: Terrain.Flat,
    };
    const id1 = reg.ensureBiome(def);
    const id2 = reg.ensureBiome(def);
    expect(id1).toBe(id2);
    expect(reg.size()).toBe(1);
  });

  it("複数回呼んでもエラーにならない", () => {
    const reg = new BiomeRegistry();
    registerStandardBiomes(reg);
    expect(() => {
      reg.ensureBiome({
        tag: BIOME_TAGS.Hills,
        displayName: "Hills",
        traversal: { baseCost: 1, passable: true },
        color: [0, 0, 0],
        terrainType: Terrain.Flat,
      });
    }).not.toThrow();
  });
});
