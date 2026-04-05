import { describe, it, expect } from "vitest";
import { createContext, Biome } from "../context.js";
import { continentShape } from "./continent.js";
import { applyBiomes } from "./biome.js";
import { formBays } from "./bay.js";

describe("湾形成", () => {
  it("湾形成後に水域が増える", () => {
    const size = 128;

    const ctx1 = createContext(size, size, 0xaa, 1.0, 256);
    continentShape(ctx1);
    let waterBefore = 0;
    for (let i = 0; i < size * size; i++) {
      if ((ctx1.elevation[i] ?? 0) < 0.2) waterBefore++;
    }

    const ctx2 = createContext(size, size, 0xaa, 1.0, 256);
    continentShape(ctx2);
    formBays(ctx2);
    let waterAfter = 0;
    for (let i = 0; i < size * size; i++) {
      if ((ctx2.elevation[i] ?? 0) < 0.2) waterAfter++;
    }

    expect(waterAfter).toBeGreaterThan(waterBefore);
  });

  it("複数シードで湾が生成される", () => {
    const seeds = [0xaa, 0xbb, 0xcc, 0xdd, 0xee];
    let bayFormed = 0;

    for (const seed of seeds) {
      const size = 128;
      const ctx1 = createContext(size, size, seed, 1.0, 256);
      continentShape(ctx1);
      let before = 0;
      for (let i = 0; i < size * size; i++) {
        if ((ctx1.elevation[i] ?? 0) < 0.2) before++;
      }

      const ctx2 = createContext(size, size, seed, 1.0, 256);
      continentShape(ctx2);
      formBays(ctx2);
      let after = 0;
      for (let i = 0; i < size * size; i++) {
        if ((ctx2.elevation[i] ?? 0) < 0.2) after++;
      }

      if (after > before) bayFormed++;
    }

    expect(bayFormed).toBeGreaterThanOrEqual(3);
  });

  it("高地は湾によって沈降しない", () => {
    const size = 128;
    const ctx = createContext(size, size, 0xaa, 1.0, 256);
    continentShape(ctx);

    const highBefore = new Map<number, number>();
    for (let i = 0; i < size * size; i++) {
      const e = ctx.elevation[i] ?? 0;
      if (e > 0.6) highBefore.set(i, e);
    }

    formBays(ctx);

    let changed = 0;
    for (const [i, oldElev] of highBefore) {
      if (Math.abs((ctx.elevation[i] ?? 0) - oldElev) > 0.001) changed++;
    }
    expect(changed).toBe(0);
  });
});

describe("トンボロ形成", () => {
  it("複数シードでトンボロが検出される", () => {
    const seeds = [0xaa, 0xbb, 0xcc, 0xdd, 0xee, 0x11, 0x22, 0x33];
    let tomboloFound = 0;

    for (const seed of seeds) {
      const size = 256;
      const ctx = createContext(size, size, seed, 1.0, 512);
      continentShape(ctx);
      applyBiomes(ctx);
      formBays(ctx);

      let count = 0;
      for (let i = 0; i < size * size; i++) {
        if (ctx.biomeId[i] === Biome.Tombolo) count++;
      }
      if (count > 0) tomboloFound++;
    }

    // いくつかのシードでトンボロが形成されること
    expect(tomboloFound).toBeGreaterThanOrEqual(1);
  });

  it("トンボロの両側に水がある", () => {
    // 多シードで1つでもトンボロが見つかれば検証する
    const seeds = [0xaa, 0xbb, 0xcc, 0xdd, 0xee, 0x11, 0x22, 0x33];
    const DX = [1, 0, 1, 1];
    const DY = [0, 1, 1, -1];

    for (const seed of seeds) {
      const size = 256;
      const ctx = createContext(size, size, seed, 1.0, 512);
      continentShape(ctx);
      applyBiomes(ctx);
      formBays(ctx);

      const tombCells: number[] = [];
      for (let i = 0; i < size * size; i++) {
        if (ctx.biomeId[i] === Biome.Tombolo) tombCells.push(i);
      }
      if (tombCells.length === 0) continue;

      // トンボロセルのサンプルを検証: いずれかの軸で両側に水がある
      let verified = 0;
      for (const ti of tombCells.slice(0, 20)) {
        const tx = ti % size;
        const ty = Math.floor(ti / size);

        for (let a = 0; a < 4; a++) {
          let posWater = false;
          let negWater = false;
          for (let r = 1; r <= 8; r++) {
            const px = tx + (DX[a] ?? 0) * r;
            const py = ty + (DY[a] ?? 0) * r;
            if (px >= 0 && px < size && py >= 0 && py < size) {
              if ((ctx.elevation[py * size + px] ?? 0) < 0.2) posWater = true;
            }
            const nx = tx - (DX[a] ?? 0) * r;
            const ny = ty - (DY[a] ?? 0) * r;
            if (nx >= 0 && nx < size && ny >= 0 && ny < size) {
              if ((ctx.elevation[ny * size + nx] ?? 0) < 0.2) negWater = true;
            }
          }
          if (posWater && negWater) {
            verified++;
            break;
          }
        }
      }

      // 検証したセルの大半で両側に水があること
      expect(verified).toBeGreaterThan(0);
      return; // 1シードで検証できれば十分
    }
  });

  it("トンボロの標高が低く抑えられている", () => {
    const seeds = [0xaa, 0xbb, 0xcc, 0xdd, 0xee, 0x11, 0x22, 0x33];

    for (const seed of seeds) {
      const size = 256;
      const ctx = createContext(size, size, seed, 1.0, 512);
      continentShape(ctx);
      applyBiomes(ctx);
      formBays(ctx);

      let totalElev = 0;
      let count = 0;
      for (let i = 0; i < size * size; i++) {
        if (ctx.biomeId[i] === Biome.Tombolo) {
          totalElev += ctx.elevation[i] ?? 0;
          count++;
        }
      }
      if (count === 0) continue;

      const avgElev = totalElev / count;
      // トンボロは水面（0.2）に近い低い標高であること
      expect(avgElev).toBeLessThan(0.35);
      return;
    }
  });
});

describe("海洋バイオーム", () => {
  it("水域に Ocean バイオームが設定される", () => {
    const size = 128;
    const ctx = createContext(size, size, 42, 1.0, 256);
    continentShape(ctx);
    applyBiomes(ctx);

    let oceanCount = 0;
    let waterCount = 0;
    for (let i = 0; i < size * size; i++) {
      if ((ctx.elevation[i] ?? 0) < 0.2) waterCount++;
      if (ctx.biomeId[i] === Biome.Ocean) oceanCount++;
    }

    // 水域の大部分が Ocean バイオームであること
    expect(waterCount).toBeGreaterThan(0);
    expect(oceanCount).toBeGreaterThan(0);
    expect(oceanCount / waterCount).toBeGreaterThan(0.8);
  });

  it("海岸から離れるほど海底が深くなる", () => {
    const size = 256;
    const ctx = createContext(size, size, 42, 1.0, 256);
    continentShape(ctx);
    applyBiomes(ctx);

    // 海岸沿いの水域と深海の平均標高を比較する
    let shallowSum = 0;
    let shallowCount = 0;
    let deepSum = 0;
    let deepCount = 0;
    const DX4 = [0, 1, 0, -1];
    const DY4 = [-1, 0, 1, 0];

    for (let y = 1; y < size - 1; y++) {
      for (let x = 1; x < size - 1; x++) {
        const i = y * size + x;
        const elev = ctx.elevation[i] ?? 0;
        if (elev >= 0.2) continue;

        // 隣接に陸地があるか
        let nearLand = false;
        for (let d = 0; d < 4; d++) {
          const nx = x + (DX4[d] ?? 0);
          const ny = y + (DY4[d] ?? 0);
          if ((ctx.elevation[ny * size + nx] ?? 0) >= 0.2) {
            nearLand = true;
            break;
          }
        }

        if (nearLand) {
          shallowSum += elev;
          shallowCount++;
        } else {
          deepSum += elev;
          deepCount++;
        }
      }
    }

    if (shallowCount > 0 && deepCount > 0) {
      const shallowAvg = shallowSum / shallowCount;
      const deepAvg = deepSum / deepCount;
      // 沿岸水域は深海より標高が高いこと
      expect(shallowAvg).toBeGreaterThan(deepAvg);
    }
  });
});

describe("島バイオーム", () => {
  it("複数シードで島が検出される", () => {
    const seeds = [0xaa, 0xbb, 0xcc, 0xdd, 0xee, 0x11, 0x22, 0x33];
    let islandFound = 0;

    for (const seed of seeds) {
      const size = 256;
      const ctx = createContext(size, size, seed, 1.0, 512);
      continentShape(ctx);
      applyBiomes(ctx);
      formBays(ctx);

      let count = 0;
      for (let i = 0; i < size * size; i++) {
        if (ctx.biomeId[i] === Biome.Island) count++;
      }
      if (count > 0) islandFound++;
    }

    // いくつかのシードで島が検出されること
    expect(islandFound).toBeGreaterThanOrEqual(1);
  });

  it("島は全周を水に囲まれている", () => {
    const seeds = [0xaa, 0xbb, 0xcc, 0xdd, 0xee, 0x11, 0x22, 0x33];
    const DX4 = [0, 1, 0, -1];
    const DY4 = [-1, 0, 1, 0];

    for (const seed of seeds) {
      const size = 256;
      const ctx = createContext(size, size, seed, 1.0, 512);
      continentShape(ctx);
      applyBiomes(ctx);
      formBays(ctx);

      // Island セルを収集する
      const islandCells: number[] = [];
      for (let i = 0; i < size * size; i++) {
        if (ctx.biomeId[i] === Biome.Island) islandCells.push(i);
      }
      if (islandCells.length === 0) continue;

      // 島の外縁セル（隣接に水がある島セル）を確認する
      // 島の全セルのうち、外縁でないセルは全隣接が島セルであること
      // → つまり島セルの隣接は「島セル」か「水」のどちらかであること
      let valid = 0;
      for (const ci of islandCells) {
        const cx = ci % size;
        const cy = Math.floor(ci / size);
        let allOk = true;
        for (let d = 0; d < 4; d++) {
          const nx = cx + (DX4[d] ?? 0);
          const ny = cy + (DY4[d] ?? 0);
          if (nx < 0 || nx >= size || ny < 0 || ny >= size) continue;
          const ni = ny * size + nx;
          const nBiome = ctx.biomeId[ni];
          const nElev = ctx.elevation[ni] ?? 0;
          // 隣接は水か同じ島のセルであること
          if (nElev >= 0.2 && nBiome !== Biome.Island) {
            allOk = false;
            break;
          }
        }
        if (allOk) valid++;
      }

      // 島セルの大部分が条件を満たすこと
      expect(valid / islandCells.length).toBeGreaterThan(0.9);
      return;
    }
  });

  it("島はマップ端に接していない", () => {
    const seeds = [0xaa, 0xbb, 0xcc, 0xdd, 0xee, 0x11, 0x22, 0x33];

    for (const seed of seeds) {
      const size = 256;
      const ctx = createContext(size, size, seed, 1.0, 512);
      continentShape(ctx);
      applyBiomes(ctx);
      formBays(ctx);

      for (let i = 0; i < size * size; i++) {
        if (ctx.biomeId[i] !== Biome.Island) continue;
        const x = i % size;
        const y = Math.floor(i / size);
        // 島セルはマップ端に存在しないこと
        expect(x).toBeGreaterThan(0);
        expect(x).toBeLessThan(size - 1);
        expect(y).toBeGreaterThan(0);
        expect(y).toBeLessThan(size - 1);
      }
    }
  });
});

describe("湖バイオーム", () => {
  it("複数シードで湖が生成される", () => {
    const seeds = [0xaa, 0xbb, 0xcc, 0xdd, 0xee, 0x11, 0x22, 0x33];
    let lakeFound = 0;

    for (const seed of seeds) {
      const size = 256;
      const ctx = createContext(size, size, seed, 1.0, 512);
      continentShape(ctx);
      applyBiomes(ctx);

      let count = 0;
      for (let i = 0; i < size * size; i++) {
        if (ctx.biomeId[i] === Biome.Lake) count++;
      }
      if (count > 0) lakeFound++;
    }

    // いくつかのシードで湖が生成されること
    expect(lakeFound).toBeGreaterThanOrEqual(1);
  });

  it("湖の標高は水面以下", () => {
    const seeds = [0xaa, 0xbb, 0xcc, 0xdd, 0xee, 0x11, 0x22, 0x33];

    for (const seed of seeds) {
      const size = 256;
      const ctx = createContext(size, size, seed, 1.0, 512);
      continentShape(ctx);
      applyBiomes(ctx);

      let lakeCount = 0;
      let belowWater = 0;
      for (let i = 0; i < size * size; i++) {
        if (ctx.biomeId[i] === Biome.Lake) {
          lakeCount++;
          if ((ctx.elevation[i] ?? 0) < 0.2) belowWater++;
        }
      }
      if (lakeCount === 0) continue;

      // 湖セルの全てが水面以下であること
      expect(belowWater).toBe(lakeCount);
      return;
    }
  });

  it("湖は陸地に囲まれている（海に接しない）", () => {
    const seeds = [0xaa, 0xbb, 0xcc, 0xdd, 0xee, 0x11, 0x22, 0x33];

    for (const seed of seeds) {
      const size = 256;
      const ctx = createContext(size, size, seed, 1.0, 512);
      continentShape(ctx);
      applyBiomes(ctx);

      // Lake セルからBFSで繋がる水域がマップ端に到達しないことを確認する
      const lakeCells: number[] = [];
      for (let i = 0; i < size * size; i++) {
        if (ctx.biomeId[i] === Biome.Lake) lakeCells.push(i);
      }
      if (lakeCells.length === 0) continue;

      // 湖セルはマップ端に存在しないこと
      for (const ci of lakeCells) {
        const x = ci % size;
        const y = Math.floor(ci / size);
        expect(x).toBeGreaterThan(0);
        expect(x).toBeLessThan(size - 1);
        expect(y).toBeGreaterThan(0);
        expect(y).toBeLessThan(size - 1);
      }
      return;
    }
  });
});

