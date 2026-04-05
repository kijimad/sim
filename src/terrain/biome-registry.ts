import { Terrain } from "../types.js";

/**
 * バイオームレジストリ: バイオームを動的に登録・参照するための仕組み。
 *
 * 従来の固定 enum を置き換え、パイプラインごとに異なるバイオーム集合を
 * 扱えるようにする。Minecraft レベルの多様性（50+ 種）を見据えた設計。
 *
 * - `biomeId[i]` は 1 バイト整数で、レジストリが払い出す ID
 * - タグ（"terrain.hills" 等の名前空間付き文字列）はパイプライン外の参照に使う
 * - 同一 ctx 内では ID が安定、別 ctx では同じタグでも異なる ID になりうる
 */

export type BiomeId = number;

/** バイオームの定義 */
export interface BiomeDef {
  /** 名前空間付きタグ（"terrain.hills", "volcanic.lava_field" 等） */
  readonly tag: string;
  /** UI・デバッグ用表示名 */
  readonly displayName: string;
  /** 気候プロファイル（Holdridge 的な判定に使う、任意） */
  readonly climate?: {
    readonly minTemp?: number;
    readonly maxTemp?: number;
    readonly minPrecip?: number;
    readonly maxPrecip?: number;
  };
  /** パスファインディング・移動コスト情報 */
  readonly traversal: {
    readonly baseCost: number;
    readonly passable: boolean;
  };
  /** 表示色 [r, g, b] (0-255) */
  readonly color: readonly [number, number, number];
  /** `Terrain` enum への写像（classify ステージが使う） */
  readonly terrainType: Terrain;
  /** 任意のメタデータ */
  readonly metadata?: Readonly<Record<string, unknown>>;
}

/**
 * バイオームレジストリ。
 *
 * `register` で新しいバイオームを登録し、`idOf` / `getById` / `getByTag` で
 * 参照する。`idOf` はタグが未登録のとき例外を投げる（ホットループで誤りを早期発見する）。
 */
export class BiomeRegistry {
  private readonly byId: Map<BiomeId, BiomeDef> = new Map();
  private readonly byTag: Map<string, BiomeId> = new Map();
  private nextId: BiomeId = 0;

  register(def: BiomeDef): BiomeId {
    if (this.byTag.has(def.tag)) {
      throw new Error(`Biome tag "${def.tag}" is already registered`);
    }
    const id = this.nextId++;
    if (id > 255) {
      throw new Error("BiomeRegistry exhausted (max 256 entries)");
    }
    this.byId.set(id, def);
    this.byTag.set(def.tag, id);
    return id;
  }

  /**
   * Idempotent に登録する: 既に同じタグのバイオームが登録されていれば、その ID を返す。
   * 未登録なら新規登録する。
   *
   * Strategy が自前のバイオームを安全に登録するために使う。
   */
  ensureBiome(def: BiomeDef): BiomeId {
    const existing = this.byTag.get(def.tag);
    if (existing !== undefined) return existing;
    return this.register(def);
  }

  getById(id: BiomeId): BiomeDef | undefined {
    return this.byId.get(id);
  }

  getByTag(tag: string): BiomeDef | undefined {
    const id = this.byTag.get(tag);
    return id !== undefined ? this.byId.get(id) : undefined;
  }

  /** タグから ID を取得。未登録ならエラー */
  idOf(tag: string): BiomeId {
    const id = this.byTag.get(tag);
    if (id === undefined) {
      throw new Error(`Unknown biome tag: "${tag}"`);
    }
    return id;
  }

  /** タグの存在確認 */
  has(tag: string): boolean {
    return this.byTag.has(tag);
  }

  /** 登録済みバイオームを登録順に返す */
  all(): readonly BiomeDef[] {
    return Array.from(this.byId.values());
  }

  /** 登録済みバイオーム数 */
  size(): number {
    return this.byId.size;
  }
}

/**
 * 標準バイオームタグの定数。
 * タイポ防止のため、strategy 実装ではこれらを参照する。
 */
export const BIOME_TAGS = {
  Hills: "terrain.hills",
  Highland: "terrain.highland",
  Bay: "water.bay",
  Beach: "coastal.beach",
  Ocean: "water.ocean",
  Island: "terrain.island",
  Lake: "water.lake",
  Canyon: "terrain.canyon",
  Wetland: "terrain.wetland",
  Cliff: "terrain.cliff",
  Plateau: "terrain.plateau",
  Alluvial: "terrain.alluvial",
} as const;

/**
 * 標準バイオーム 12 種をレジストリに登録する。
 *
 * 登録順は旧 `Biome` enum と一致する:
 *   Hills=0, Highland=1, Bay=2, Beach=3, Ocean=4, Island=5,
 *   Lake=6, Canyon=7, Wetland=8, Cliff=9, Plateau=10, Alluvial=11
 *
 * ID 値の安定性を保つため、既存テストとの互換性がある。
 *
 * 色は旧 `BIOME_COLORS` と一致させる。
 */
export function registerStandardBiomes(registry: BiomeRegistry): void {
  registry.register({
    tag: BIOME_TAGS.Hills,
    displayName: "Hills",
    traversal: { baseCost: 1, passable: true },
    color: [80, 150, 60],
    terrainType: Terrain.Flat,
  });
  registry.register({
    tag: BIOME_TAGS.Highland,
    displayName: "Highland",
    traversal: { baseCost: 5, passable: true },
    color: [160, 130, 100],
    terrainType: Terrain.Mountain,
  });
  registry.register({
    tag: BIOME_TAGS.Bay,
    displayName: "Bay",
    traversal: { baseCost: Infinity, passable: false },
    color: [60, 100, 180],
    terrainType: Terrain.Water,
  });
  registry.register({
    tag: BIOME_TAGS.Beach,
    displayName: "Beach",
    traversal: { baseCost: 1.5, passable: true },
    color: [220, 200, 140],
    terrainType: Terrain.Sand,
  });
  registry.register({
    tag: BIOME_TAGS.Ocean,
    displayName: "Ocean",
    traversal: { baseCost: Infinity, passable: false },
    color: [20, 40, 120],
    terrainType: Terrain.Water,
  });
  registry.register({
    tag: BIOME_TAGS.Island,
    displayName: "Island",
    traversal: { baseCost: 1, passable: true },
    color: [80, 160, 80],
    terrainType: Terrain.Flat,
  });
  registry.register({
    tag: BIOME_TAGS.Lake,
    displayName: "Lake",
    traversal: { baseCost: Infinity, passable: false },
    color: [70, 130, 200],
    terrainType: Terrain.Water,
  });
  registry.register({
    tag: BIOME_TAGS.Canyon,
    displayName: "Canyon",
    traversal: { baseCost: 5, passable: true },
    color: [140, 80, 60],
    terrainType: Terrain.Mountain,
  });
  registry.register({
    tag: BIOME_TAGS.Wetland,
    displayName: "Wetland",
    traversal: { baseCost: 2, passable: true },
    color: [60, 120, 100],
    terrainType: Terrain.Flat,
  });
  registry.register({
    tag: BIOME_TAGS.Cliff,
    displayName: "Cliff",
    traversal: { baseCost: 5, passable: true },
    color: [150, 140, 130],
    terrainType: Terrain.Mountain,
  });
  registry.register({
    tag: BIOME_TAGS.Plateau,
    displayName: "Plateau",
    traversal: { baseCost: 5, passable: true },
    color: [140, 160, 100],
    terrainType: Terrain.Mountain,
  });
  registry.register({
    tag: BIOME_TAGS.Alluvial,
    displayName: "Alluvial",
    traversal: { baseCost: 1, passable: true },
    color: [130, 180, 90],
    terrainType: Terrain.Flat,
  });
}
