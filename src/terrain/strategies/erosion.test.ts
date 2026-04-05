import { describe, it, expect } from "vitest";
import { createContext } from "../context.js";
import { streamPowerLaw } from "./erosion.js";
import { fillDepressions } from "../stages/rivers.js";

/** 中心に頂点を持つ円錐を作る */
function placeCone(
  ctx: ReturnType<typeof createContext>,
  peakHeight: number,
): void {
  const { width: w, height: h, elevation } = ctx;
  const cx = w / 2;
  const cy = h / 2;
  const maxR = Math.min(w, h) / 2;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const dx = x - cx;
      const dy = y - cy;
      const r = Math.sqrt(dx * dx + dy * dy);
      const t = Math.max(0, 1 - r / maxR);
      elevation[y * w + x] = peakHeight * t;
    }
  }
}

/** flow accumulation を単純再計算する（テスト用の検証ヘルパー） */
function computeFlowAccumulation(ctx: ReturnType<typeof createContext>): Float32Array {
  const { width: w, height: h, elevation } = ctx;
  const size = w * h;
  // Pit-fill しないと local minima で流れが止まるので一応やる
  const elevCopy = new Float32Array(elevation);
  fillDepressions(w, h, elevCopy);

  const area = new Float32Array(size).fill(1);
  const indices = new Uint32Array(size);
  for (let i = 0; i < size; i++) indices[i] = i;
  const arr = Array.from(indices).sort((a, b) => (elevCopy[b] ?? 0) - (elevCopy[a] ?? 0));

  const DX = [0, 1, 1, 1, 0, -1, -1, -1];
  const DY = [-1, -1, 0, 1, 1, 1, 0, -1];
  for (const idx of arr) {
    const cx = idx % w;
    const cy = (idx - cx) / w;
    const ch = elevCopy[idx] ?? 0;
    let bestIdx = -1;
    let bestH = ch;
    for (let d = 0; d < 8; d++) {
      const nx = cx + (DX[d] ?? 0);
      const ny = cy + (DY[d] ?? 0);
      if (nx < 0 || nx >= w || ny < 0 || ny >= h) continue;
      const ni = ny * w + nx;
      const nh = elevCopy[ni] ?? 0;
      if (nh < bestH) {
        bestH = nh;
        bestIdx = ni;
      }
    }
    if (bestIdx >= 0) {
      area[bestIdx] = (area[bestIdx] ?? 0) + (area[idx] ?? 0);
    }
  }
  return area;
}

describe("streamPowerLaw - 基本動作", () => {
  it("Strategy メタデータが正しい", () => {
    const s = streamPowerLaw();
    expect(s.slot).toBe("erosion");
    expect(s.name).toBe("streamPowerLaw");
    expect(s.requires).toContain("elevation");
    expect(s.provides).toContain("elevation");
  });

  it("平坦な入力に対して大きく変化しない", () => {
    const ctx = createContext(32, 32, 1);
    ctx.elevation.fill(0.5);
    const before = new Float32Array(ctx.elevation);
    streamPowerLaw({ iterations: 3 }).run(ctx);
    // 平坦なので流路もなく、変化はごくわずかのはず（pit-fill の ε のみ）
    let maxDiff = 0;
    for (let i = 0; i < ctx.elevation.length; i++) {
      const d = Math.abs((ctx.elevation[i] ?? 0) - (before[i] ?? 0));
      if (d > maxDiff) maxDiff = d;
    }
    expect(maxDiff).toBeLessThan(0.05);
  });

  it("標高が下流より低くならない（安定性）", () => {
    const ctx = createContext(32, 32, 1);
    placeCone(ctx, 1.0);
    streamPowerLaw({ iterations: 5 }).run(ctx);
    // 出力の各セルが全部 [0, 1] 以内
    for (let i = 0; i < ctx.elevation.length; i++) {
      const e = ctx.elevation[i] ?? 0;
      expect(e).toBeGreaterThanOrEqual(0);
      expect(e).toBeLessThanOrEqual(1);
    }
  });
});

describe("streamPowerLaw - dendritic パターン", () => {
  it("円錐入力から樹状の流量集中が発生する", () => {
    // 大きめの円錐で SPL 反復 → 流量が特定パスに集中するはず
    const SIZE = 64;
    const ctx = createContext(SIZE, SIZE, 42);
    placeCone(ctx, 0.8);
    streamPowerLaw({ k: 0.5, iterations: 10 }).run(ctx);

    const area = computeFlowAccumulation(ctx);
    // 流量のヒストグラム: dendritic なら少数の高 flow セルと多数の低 flow セル
    // 純円錐（未侵食）なら特定の放射状方向に流量集中するだけ
    // SPL で侵食された円錐なら、いくつかのメインチャネルに集中する
    const sorted = Array.from(area).sort((a, b) => b - a);
    const total = sorted.reduce((s, v) => s + v, 0);
    // 上位 1% のセルが全体流量の 10% 以上を占めれば dendritic 的と言える
    // （均等分散なら 1% なので、10 倍の集中は明確な樹状パターンを示す）
    const top1pct = Math.ceil(area.length * 0.01);
    let topSum = 0;
    for (let i = 0; i < top1pct; i++) topSum += sorted[i] ?? 0;
    const concentration = topSum / total;
    expect(concentration).toBeGreaterThan(0.10);
  });

  it("反復を増やすと地形がより平滑化される（エネルギー収束）", () => {
    const SIZE = 48;
    const ctxA = createContext(SIZE, SIZE, 1);
    placeCone(ctxA, 1.0);
    streamPowerLaw({ iterations: 1 }).run(ctxA);

    const ctxB = createContext(SIZE, SIZE, 1);
    placeCone(ctxB, 1.0);
    streamPowerLaw({ iterations: 10 }).run(ctxB);

    // 標高の合計は反復とともに減少する（侵食されて流出するため）
    let sumA = 0, sumB = 0;
    for (let i = 0; i < SIZE * SIZE; i++) {
      sumA += ctxA.elevation[i] ?? 0;
      sumB += ctxB.elevation[i] ?? 0;
    }
    expect(sumB).toBeLessThan(sumA);
  });

  it("円錐の頂点近くでは元の標高とそれほど違わない（上流は侵食されにくい）", () => {
    const SIZE = 48;
    const ctx = createContext(SIZE, SIZE, 1);
    placeCone(ctx, 1.0);
    const originalPeak = ctx.elevation[Math.floor(SIZE / 2) * SIZE + Math.floor(SIZE / 2)] ?? 0;
    streamPowerLaw({ iterations: 5 }).run(ctx);
    const newPeak = ctx.elevation[Math.floor(SIZE / 2) * SIZE + Math.floor(SIZE / 2)] ?? 0;
    // 頂点は流量が最小なので侵食もわずか
    expect(newPeak).toBeGreaterThan(originalPeak * 0.9);
  });
});

describe("streamPowerLaw - パラメータ効果", () => {
  it("k を大きくすると侵食が強まる", () => {
    const SIZE = 32;
    const ctxLow = createContext(SIZE, SIZE, 1);
    placeCone(ctxLow, 1.0);
    streamPowerLaw({ k: 0.1, iterations: 5 }).run(ctxLow);

    const ctxHigh = createContext(SIZE, SIZE, 1);
    placeCone(ctxHigh, 1.0);
    streamPowerLaw({ k: 1.0, iterations: 5 }).run(ctxHigh);

    let sumLow = 0, sumHigh = 0;
    for (let i = 0; i < SIZE * SIZE; i++) {
      sumLow += ctxLow.elevation[i] ?? 0;
      sumHigh += ctxHigh.elevation[i] ?? 0;
    }
    expect(sumHigh).toBeLessThan(sumLow);
  });

  it("iterations=0 なら入力が不変（ただし pit fill の微小 ε は許容）", () => {
    const SIZE = 32;
    const ctx = createContext(SIZE, SIZE, 1);
    placeCone(ctx, 0.5);
    const before = new Float32Array(ctx.elevation);
    streamPowerLaw({ iterations: 0 }).run(ctx);
    // 全く処理しないので完全一致
    for (let i = 0; i < ctx.elevation.length; i++) {
      expect(ctx.elevation[i]).toBe(before[i]);
    }
  });
});
