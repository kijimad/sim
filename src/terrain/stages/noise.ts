/**
 * 勾配ノイズ（Perlin式、独立ハッシュ、連続角度勾配）
 * 4096エントリのパーミュテーションテーブルでパターン繰り返しを防ぐ。
 */
export function createGradientNoise(rng: () => number): (x: number, y: number) => number {
  const TABLE_SIZE = 4096;
  const MASK = TABLE_SIZE - 1;
  const perm = new Uint16Array(TABLE_SIZE * 2);
  const angles = new Float32Array(TABLE_SIZE);

  const p = new Uint16Array(TABLE_SIZE);
  for (let i = 0; i < TABLE_SIZE; i++) p[i] = i;
  for (let i = TABLE_SIZE - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    const tmp = p[i] ?? 0;
    p[i] = p[j] ?? 0;
    p[j] = tmp;
  }
  for (let i = 0; i < TABLE_SIZE * 2; i++) perm[i] = p[i & MASK] ?? 0;

  const gradX = new Float32Array(TABLE_SIZE);
  const gradY = new Float32Array(TABLE_SIZE);
  for (let i = 0; i < TABLE_SIZE; i++) {
    angles[i] = rng() * Math.PI * 2;
    gradX[i] = Math.cos(angles[i] ?? 0);
    gradY[i] = Math.sin(angles[i] ?? 0);
  }

  const gradDot = (idx: number, dx: number, dy: number): number => {
    const gi = idx & MASK;
    return (gradX[gi] ?? 0) * dx + (gradY[gi] ?? 0) * dy;
  };

  return (x: number, y: number): number => {
    const xi = Math.floor(x);
    const yi = Math.floor(y);
    const fx = x - xi;
    const fy = y - yi;

    // 5次 smoothstep
    const sx = fx * fx * fx * (fx * (fx * 6 - 15) + 10);
    const sy = fy * fy * fy * (fy * (fy * 6 - 15) + 10);

    const xi0 = xi & MASK;
    const yi0 = yi & MASK;
    const xi1 = (xi + 1) & MASK;
    const yi1 = (yi + 1) & MASK;

    const h00 = perm[(perm[xi0] ?? 0) + yi0] ?? 0;
    const h10 = perm[(perm[xi1] ?? 0) + yi0] ?? 0;
    const h01 = perm[(perm[xi0] ?? 0) + yi1] ?? 0;
    const h11 = perm[(perm[xi1] ?? 0) + yi1] ?? 0;

    const g00 = gradDot(h00, fx, fy);
    const g10 = gradDot(h10, fx - 1, fy);
    const g01 = gradDot(h01, fx, fy - 1);
    const g11 = gradDot(h11, fx - 1, fy - 1);

    const top = g00 + (g10 - g00) * sx;
    const bottom = g01 + (g11 - g01) * sx;
    return (top + (bottom - top) * sy) * 0.7 + 0.5;
  };
}
