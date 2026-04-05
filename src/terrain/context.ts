/** バイオームID */
export const Biome = {
  Plains: 0,
  Highland: 1,
  Bay: 2,
  Desert: 3,
  Tombolo: 4,
  Ocean: 5,
  Island: 6,
  Lake: 7,
} as const;
export type Biome = (typeof Biome)[keyof typeof Biome];

/** 地形生成パイプラインのコンテキスト */
export interface StageContext {
  readonly width: number;
  readonly height: number;
  /** 高度マップ [0, 1] */
  readonly elevation: Float32Array;
  /** 流量マップ（河川ステージ以降） */
  readonly flow: Float32Array;
  /** 湿度マップ（バイオームで利用） */
  readonly moisture: Float32Array;
  /** バイオームIDマップ（各セルのバイオーム種別） */
  readonly biomeId: Uint8Array;
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
  return {
    width,
    height,
    elevation: new Float32Array(size),
    flow: new Float32Array(size),
    moisture: new Float32Array(size),
    biomeId: new Uint8Array(size),
    rng: createRng(seed),
    relief,
    noiseSize: noiseSize ?? width,
  };
}
