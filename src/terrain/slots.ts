import type { StageContext } from "./context.js";

/**
 * 地形生成パイプラインの正準フェーズ名。
 * 順序はこのリストと `SLOT_ORDER` で定義される。
 *
 * 詳細設計は docs/pipeline-design.md を参照。
 */
export type SlotName =
  | "landmass"
  | "tectonics"
  | "macroshape"
  | "climate"
  | "hydrology"
  | "erosion"
  | "features"
  | "biome"
  | "biomeFeatures"
  | "finalize";

/** スロットの実行順序（`runPipeline` が参照する唯一の順序定義） */
export const SLOT_ORDER: readonly SlotName[] = [
  "landmass",
  "tectonics",
  "macroshape",
  "climate",
  "hydrology",
  "erosion",
  "features",
  "biome",
  "biomeFeatures",
  "finalize",
] as const;

/** 配列として複数のストラテジを受け取るスロット */
export const MULTI_SLOTS: ReadonlySet<SlotName> = new Set<SlotName>([
  "features",
  "biomeFeatures",
]);

/**
 * ストラテジ: スロットに差し込む実装単位。
 *
 * パラメータはファクトリー関数のクロージャに閉じ込め、`run` は `ctx` のみを受け取る。
 * `requires` と `provides` は検証・デバッグ用（将来的には型チェックにも使う）。
 */
export interface Strategy {
  /** 人間可読な識別子（"SPL", "continentMask" 等） */
  readonly name: string;
  /** このストラテジがどのスロットに属するか */
  readonly slot: SlotName;
  /** `ctx` を変更する実処理 */
  readonly run: (ctx: StageContext) => void;
  /** 読み取りを期待する ctx フィールド名（デバッグ用、任意） */
  readonly requires?: readonly string[];
  /** 書き込むと約束する ctx フィールド名（デバッグ用、任意） */
  readonly provides?: readonly string[];
}

/**
 * パイプライン: 各スロットにストラテジを詰めた完全な地形生成レシピ。
 *
 * `features` と `biomeFeatures` は配列で任意個数のストラテジを許す。
 * 他のスロットは必ず 1 つのストラテジを要求する（未使用時は `noopStrategy` を使う）。
 */
export interface Pipeline {
  readonly name: string;
  readonly slots: {
    readonly landmass: Strategy;
    readonly tectonics: Strategy;
    readonly macroshape: Strategy;
    readonly climate: Strategy;
    readonly hydrology: Strategy;
    readonly erosion: Strategy;
    readonly features: readonly Strategy[];
    readonly biome: Strategy;
    readonly biomeFeatures: readonly Strategy[];
    readonly finalize: Strategy;
  };
}

/**
 * 何もしないストラテジ。未使用スロットのプレースホルダーとして使う。
 *
 * 例: `tectonics: noopStrategy("tectonics", "none")` のように、
 * スロット構造を維持しつつそのフェーズをスキップできる。
 */
export function noopStrategy(slot: SlotName, name: string = "none"): Strategy {
  return {
    name,
    slot,
    run: () => {
      // 意図的に何もしない
    },
  };
}

/** ストラテジが宣言通りのスロットに配置されているかを検証する */
function assertSlotMatch(expected: SlotName, strategy: Strategy): void {
  if (strategy.slot !== expected) {
    throw new Error(
      `Strategy "${strategy.name}" is declared as slot "${strategy.slot}" ` +
        `but was placed in slot "${expected}".`,
    );
  }
}

/**
 * パイプラインを実行する。スロット順序は `SLOT_ORDER` に従う。
 *
 * 配列スロット（`features`, `biomeFeatures`）は配列の順序どおりに各ストラテジを実行する。
 * 各ストラテジの `slot` フィールドが配置されたスロット名と一致することを検証する
 * （誤配置を早期に検出するため）。
 */
export function runPipeline(pipeline: Pipeline, ctx: StageContext): void {
  const { slots } = pipeline;

  for (const slotName of SLOT_ORDER) {
    if (MULTI_SLOTS.has(slotName)) {
      // 配列スロット
      const strategies = slots[slotName] as readonly Strategy[];
      for (const strategy of strategies) {
        assertSlotMatch(slotName, strategy);
        strategy.run(ctx);
      }
    } else {
      // 単一スロット
      const strategy = slots[slotName] as Strategy;
      assertSlotMatch(slotName, strategy);
      strategy.run(ctx);
    }
  }
}
