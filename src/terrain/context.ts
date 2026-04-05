import { BiomeRegistry, registerStandardBiomes } from "./biome-registry.js";

export type { BiomeId, BiomeDef } from "./biome-registry.js";
export { BiomeRegistry, BIOME_TAGS, registerStandardBiomes } from "./biome-registry.js";

/** 地形生成パイプラインのコンテキスト */
export interface StageContext {
  readonly width: number;
  readonly height: number;
  /** 高度マップ [0, 1] */
  readonly elevation: Float32Array;
  /** 陸海マスク [0=海, 1=陸]（landmass スロット以降で有効） */
  readonly landMask: Float32Array;
  /** 流量マップ（hydrology スロット以降で有効） */
  readonly flow: Float32Array;
  /** D8 流路方向 [0-7, -1=シンク]（hydrology スロット以降で有効） */
  readonly flowDir: Int8Array;
  /** 累積流量（precipitation で重み付け可能。hydrology スロット以降で有効） */
  readonly drainageArea: Float32Array;
  /** 気温マップ [0, 1] 正規化（climate スロット以降で有効） */
  readonly temperature: Float32Array;
  /** 降水量マップ [0, 1] 正規化（climate スロット以降で有効） */
  readonly precipitation: Float32Array;
  /** バイオームIDマップ（各セルのバイオーム種別。レジストリが払い出した ID） */
  readonly biomeId: Uint8Array;
  /** 動的バイオームレジストリ（タグベースの登録・参照） */
  readonly biomeRegistry: BiomeRegistry;
  /** ストラテジ間のアドホック情報共有 */
  readonly metadata: Map<string, unknown>;
  /** 決定論的乱数生成器 */
  readonly rng: () => number;
  /** 起伏の強さ [0.5=なだらか, 1.0=標準, 2.0=急峻] */
  readonly relief: number;
  /** ノイズのスケール基準サイズ（実マップサイズ。プレビュー時はこの値がwidth/heightより大きい） */
  readonly noiseSize: number;
}

/** パイプラインのステージ関数 */
export type TerrainStage = (ctx: StageContext) => void;

/** Xorshift32 疑似乱数生成器 */
export function createRng(seed: number): () => number {
  let state = seed | 0 || 1;
  return (): number => {
    state ^= state << 13;
    state ^= state >> 17;
    state ^= state << 5;
    return ((state >>> 0) / 0x100000000);
  };
}

/** テスト・実行用のコンテキストを生成する */
export function createContext(width: number, height: number, seed: number, relief: number = 1.0, noiseSize?: number): StageContext {
  const size = width * height;
  const flowDir = new Int8Array(size);
  flowDir.fill(-1); // -1 = 未計算/シンク
  return {
    width,
    height,
    elevation: new Float32Array(size),
    landMask: new Float32Array(size),
    flow: new Float32Array(size),
    flowDir,
    drainageArea: new Float32Array(size),
    temperature: new Float32Array(size),
    precipitation: new Float32Array(size),
    biomeId: new Uint8Array(size),
    biomeRegistry: (() => {
      const r = new BiomeRegistry();
      registerStandardBiomes(r);
      return r;
    })(),
    metadata: new Map<string, unknown>(),
    rng: createRng(seed),
    relief,
    noiseSize: noiseSize ?? width,
  };
}
