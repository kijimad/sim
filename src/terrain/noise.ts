/** 2Dグリッドのランダム値をバイリニア補間でサンプリングするノイズレイヤー */
export function createNoiseLayer(
  rng: () => number,
  gridW: number,
  gridH: number,
): (x: number, y: number) => number {
  const grid: number[] = Array.from({ length: gridW * gridH }, () => rng());

  return (x: number, y: number): number => {
    const gx = x * (gridW - 1);
    const gy = y * (gridH - 1);
    const x0 = Math.floor(gx);
    const y0 = Math.floor(gy);
    const x1 = Math.min(x0 + 1, gridW - 1);
    const y1 = Math.min(y0 + 1, gridH - 1);
    const fx = gx - x0;
    const fy = gy - y0;

    const sx = fx * fx * (3 - 2 * fx);
    const sy = fy * fy * (3 - 2 * fy);

    const v00 = grid[y0 * gridW + x0] ?? 0;
    const v10 = grid[y0 * gridW + x1] ?? 0;
    const v01 = grid[y1 * gridW + x0] ?? 0;
    const v11 = grid[y1 * gridW + x1] ?? 0;

    const top = v00 + (v10 - v00) * sx;
    const bottom = v01 + (v11 - v01) * sx;
    return top + (bottom - top) * sy;
  };
}

/**
 * タイル座標ベースのノイズレイヤーを作成する。
 * noiseSize: ノイズスケールの基準サイズ（実マップサイズ）
 * actualWidth/Height: 実際に描画するマップサイズ（プレビュー時は小さい）
 * featureSize: 基準サイズで何タイルが1つのノイズセルか
 */
export function createTileNoise(
  rng: () => number,
  noiseSize: number,
  actualWidth: number,
  actualHeight: number,
  featureSize: number,
): (tileX: number, tileY: number) => number {
  // ノイズグリッドは基準サイズから計算
  const gridW = Math.max(2, Math.ceil(noiseSize / featureSize) + 1);
  const gridH = gridW;
  const layer = createNoiseLayer(rng, gridW, gridH);

  // actual座標を基準サイズの[0,1]空間にマッピング
  return (tileX: number, tileY: number): number => {
    const nx = tileX / actualWidth;
    const ny = tileY / actualHeight;
    return layer(Math.min(1, Math.max(0, nx)), Math.min(1, Math.max(0, ny)));
  };
}
