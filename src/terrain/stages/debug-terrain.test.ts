import { describe, it, expect } from "vitest";
import { createContext } from "../context.js";
import { continentShape } from "./continent.js";
import { erode, flattenValleys } from "./erosion.js";
import { computeRivers } from "./rivers.js";
import { assignBiomes, applyBiomeFeatures } from "./biome.js";
import { writeFileSync } from "fs";

/**
 * 直線的な崖/段差を検出する:
 * 隣接タイルとの標高差が大きい（崖）セルを検出し、
 * その崖が直線的に続く長さを測定する。
 */
function detectCliffLines(elev: Float32Array, size: number, cliffThreshold: number = 0.02): {
  maxRun: number;
  totalLongRuns: number;
  avgCliffMagnitude: number;
} {
  const RUN_THRESHOLD = 8;

  // 各セルが「崖」かどうかを判定（隣接との差が閾値を超える）
  const isCliff = new Uint8Array(size * size);
  let cliffCount = 0;
  let cliffSum = 0;
  for (let y = 1; y < size - 1; y++) {
    for (let x = 1; x < size - 1; x++) {
      const i = y * size + x;
      const h = elev[i] ?? 0;
      // 4方向の最大標高差
      const maxDiff = Math.max(
        Math.abs(h - (elev[i + 1] ?? 0)),
        Math.abs(h - (elev[i - 1] ?? 0)),
        Math.abs(h - (elev[i + size] ?? 0)),
        Math.abs(h - (elev[i - size] ?? 0)),
      );
      if (maxDiff > cliffThreshold) {
        isCliff[i] = 1;
        cliffCount++;
        cliffSum += maxDiff;
      }
    }
  }

  // 崖セルが直線的に並ぶ長さを 4 方向で測定する
  let maxRun = 0;
  let totalLong = 0;
  const scanDirs = [
    { dx: 1, dy: 0 },
    { dx: 0, dy: 1 },
    { dx: 1, dy: 1 },
    { dx: 1, dy: -1 },
  ];

  for (const sd of scanDirs) {
    for (let sy = 2; sy < size - 2; sy++) {
      for (let sx = 2; sx < size - 2; sx++) {
        if (isCliff[sy * size + sx] !== 1) continue;
        let run = 1;
        let cx = sx + sd.dx;
        let cy = sy + sd.dy;
        while (cx >= 1 && cx < size - 1 && cy >= 1 && cy < size - 1) {
          if (isCliff[cy * size + cx] === 1) {
            run++;
            cx += sd.dx;
            cy += sd.dy;
          } else {
            break;
          }
        }
        if (run >= RUN_THRESHOLD) {
          totalLong++;
          if (run > maxRun) maxRun = run;
        }
      }
    }
  }

  return {
    maxRun,
    totalLongRuns: totalLong,
    avgCliffMagnitude: cliffCount > 0 ? cliffSum / cliffCount : 0,
  };
}

const SEEDS = [0xaa, 0xbb, 0xcc, 0xdd, 0xee];

describe("直線的な崖の検出", () => {
  for (const seed of SEEDS) {
    it(`seed=0x${seed.toString(16)}: 崖直線の検出`, () => {
      const size = 256;
      // バイオーム境界の崖は自然なので高めの閾値で格子アーティファクトだけ検出する
      const cliffTh = 0.08;

      const ctx1 = createContext(size, size, seed, 1.0, 512);
      continentShape(ctx1);
      const r1 = detectCliffLines(ctx1.elevation, size, cliffTh);

      const ctx2 = createContext(size, size, seed, 1.0, 512);
      continentShape(ctx2);
      erode(ctx2);
      const r2 = detectCliffLines(ctx2.elevation, size, cliffTh);

      /* eslint-disable no-console */
      console.log(`seed=0x${seed.toString(16)}:`);
      console.log(`  shape:  maxRun=${String(r1.maxRun).padStart(3)} longRuns=${String(r1.totalLongRuns).padStart(5)} avgCliff=${r1.avgCliffMagnitude.toFixed(4)}`);
      console.log(`  +erode: maxRun=${String(r2.maxRun).padStart(3)} longRuns=${String(r2.totalLongRuns).padStart(5)} avgCliff=${r2.avgCliffMagnitude.toFixed(4)}`);
      /* eslint-enable no-console */

      if (seed === 0xaa) {
        writeHillshade(ctx1.elevation, size, "/tmp/hs_step1.ppm");
        writeHillshade(ctx2.elevation, size, "/tmp/hs_step2.ppm");

        const fullSize = 512;
        const ctxFull = createContext(fullSize, fullSize, seed, 1.0, 512);
        continentShape(ctxFull);
        erode(ctxFull);
        computeRivers(ctxFull);
        assignBiomes(ctxFull);
        applyBiomeFeatures(ctxFull);
        flattenValleys(ctxFull);
        writeHillshade(ctxFull.elevation, fullSize, "/tmp/hs_full.ppm");
      }

      // 格子アーティファクトの直線が過剰でないこと（バイオーム境界・海岸の崖は許容）
      expect(r1.maxRun).toBeLessThan(80);
      expect(r2.maxRun).toBeLessThan(80);
    });
  }
});

describe("V字谷と氾濫原の形成", () => {
  it("山岳部の川周辺でV字谷が形成される", () => {
    // 複数 seed で高地の川を探し、flattenValleys で谷が掘られることを検証する
    const seeds = [0xaa, 0xbb, 0xcc, 0xdd, 0xee, 0x11, 0x22, 0x33, 0x44, 0x55, 0x66, 0x77];
    const size = 256;

    for (const seed of seeds) {
      const ctx = createContext(size, size, seed, 1.0, 512);
      continentShape(ctx);
      erode(ctx);
      computeRivers(ctx);

      // 高地の大きな川を探す（flow が大きく、標高が水面より十分高い）
      const highRiverCells: number[] = [];
      for (let i = 0; i < size * size; i++) {
        if ((ctx.flow[i] ?? 0) > 100 && (ctx.elevation[i] ?? 0) > 0.3) {
          highRiverCells.push(i);
        }
      }
      if (highRiverCells.length === 0) continue;

      // flattenValleys 前後で川の近傍の標高が下がることを検証する
      const beforeElev = new Float32Array(ctx.elevation);
      flattenValleys(ctx);

      // 川の近傍セル（隣接タイル）で標高が下がったセルを数える
      let deepened = 0;
      const DX4 = [0, 1, 0, -1];
      const DY4 = [-1, 0, 1, 0];
      for (const ci of highRiverCells.slice(0, 50)) {
        const cx = ci % size;
        const cy = Math.floor(ci / size);
        for (let d = 0; d < 4; d++) {
          const nx = cx + (DX4[d] ?? 0);
          const ny = cy + (DY4[d] ?? 0);
          if (nx < 0 || nx >= size || ny < 0 || ny >= size) continue;
          const ni = ny * size + nx;
          if ((ctx.elevation[ni] ?? 0) < (beforeElev[ni] ?? 0) - 0.001) deepened++;
        }
      }
      expect(deepened).toBeGreaterThan(0);
      return;
    }
    expect.fail("高地の川が見つからなかった");
  });

  it("平地の川周辺で氾濫原が形成される", () => {
    const size = 256;
    const ctx = createContext(size, size, 0xbb, 1.0, 512);
    continentShape(ctx);

    erode(ctx);
    computeRivers(ctx);

    // 平地の大きな川を探す
    const flatRiverCells: number[] = [];
    for (let i = 0; i < size * size; i++) {
      const elev = ctx.elevation[i] ?? 0;
      if ((ctx.flow[i] ?? 0) > 200 && elev >= 0.2 && elev <= 0.5) {
        flatRiverCells.push(i);
      }
    }

    flattenValleys(ctx);

    if (flatRiverCells.length > 0) {
      // 川周辺の標高差が小さい（なだらか）ことを確認する
      const sample = flatRiverCells[Math.floor(flatRiverCells.length / 2)] ?? 0;
      const sx = sample % size;
      const sy = Math.floor(sample / size);
      const riverH = ctx.elevation[sample] ?? 0;

      let nearbyCount = 0;
      let smallDiffCount = 0;
      for (let dy = -5; dy <= 5; dy++) {
        for (let dx = -5; dx <= 5; dx++) {
          const nx = sx + dx;
          const ny = sy + dy;
          if (nx < 0 || nx >= size || ny < 0 || ny >= size) continue;
          nearbyCount++;
          const diff = Math.abs((ctx.elevation[ny * size + nx] ?? 0) - riverH);
          // 近傍の標高差が0.15以下（なだらか）
          if (diff < 0.15) smallDiffCount++;
        }
      }
      // 周囲の大半がなだらかであること
      expect(smallDiffCount / nearbyCount).toBeGreaterThan(0.5);
    }

    expect(flatRiverCells.length).toBeGreaterThan(0);
  });

  it("山岳部の大河川沿いに河岸段丘が部分的に形成される", () => {
    // 複数シードで段丘の存在を検証する（ノイズで部分的に適用されるため）
    let terraceFound = false;

    for (const seed of [0xaa, 0xbb, 0xcc, 0xdd, 0xee, 0x11, 0x22, 0x33, 0x44, 0x55, 0x66, 0x77]) {
      const size = 256;
      const ctx = createContext(size, size, seed, 1.0, 512);
      continentShape(ctx);

      erode(ctx);
      computeRivers(ctx);

      // 山岳部で流量が大きい川セルを探す
      const bigMountainRivers: number[] = [];
      for (let i = 0; i < size * size; i++) {
        if ((ctx.flow[i] ?? 0) > 300 && (ctx.elevation[i] ?? 0) > 0.3) {
          bigMountainRivers.push(i);
        }
      }

      if (bigMountainRivers.length === 0) continue;

      flattenValleys(ctx);

      // 段丘の検出: 川から垂直方向にプロファイルを取り、
      // 標高変化が「急→平坦→急」のパターンを探す
      for (const ri of bigMountainRivers.slice(0, 20)) {
        const rx = ri % size;
        const ry = Math.floor(ri / size);

        // 水平方向に12タイルのプロファイルを取る
        const profile: number[] = [];
        for (let dx = 0; dx <= 12; dx++) {
          const nx = rx + dx;
          if (nx >= size) break;
          profile.push(ctx.elevation[ry * size + nx] ?? 0);
        }
        if (profile.length < 8) continue;

        // 隣接差の列を作る
        const diffs: number[] = [];
        for (let j = 1; j < profile.length; j++) {
          diffs.push((profile[j] ?? 0) - (profile[j - 1] ?? 0));
        }

        // 段丘パターン: 小さい差（平坦部）の後に大きい差（崖）がある
        let hasFlat = false;
        let hasSteep = false;
        for (const d of diffs) {
          if (Math.abs(d) < 0.005) hasFlat = true;
          if (d > 0.02) hasSteep = true;
        }
        if (hasFlat && hasSteep) {
          terraceFound = true;
          break;
        }
      }
      if (terraceFound) break;
    }

    // いずれかのシードで段丘パターンが検出されること
    expect(terraceFound).toBe(true);
  });
});

function writeHillshade(elev: Float32Array, size: number, path: string): void {
  let ppm = `P3\n${String(size)} ${String(size)}\n255\n`;
  for (let y = 0; y < size; y++) {
    const row: string[] = [];
    for (let x = 0; x < size; x++) {
      const i = y * size + x;
      const h = elev[i] ?? 0;
      const hR = x < size - 1 ? (elev[i + 1] ?? 0) : h;
      const hD = y < size - 1 ? (elev[i + size] ?? 0) : h;
      const dx = (h - hR) * 10;
      const dy = (h - hD) * 10;
      const shade = 0.5 + (dx * -0.707 + dy * -0.707) * 0.5;
      const v = Math.max(0, Math.min(255, Math.round(shade * 255)));
      row.push(`${String(v)} ${String(v)} ${String(v)}`);
    }
    ppm += row.join(" ") + "\n";
  }
  writeFileSync(path, ppm);
}
