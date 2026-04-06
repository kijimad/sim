#!/usr/bin/env node
/**
 * DEM5A (5m mesh) GML をパースして正規化 heightmap JSON を出力する。
 *
 * FG-GML-483001-DEM5A の各タイル (225×150 grid) を読み込み、
 * 1 枚の統合グリッドにマージして 512×512 にリサンプルする。
 *
 * 等高線ベースの IDW 補間は不要 — DEM5A はそのままラスターグリッドなので
 * 「単純に表示すればいいだけ」を実現する。
 */

import { readFileSync, writeFileSync, readdirSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");
// 引数でメッシュを指定（デフォルト: 全部ビルド）
const MESHES = [
  { dir: "FG-GML-523950-DEM5A-20250620", name: "523950" },
  { dir: "FG-GML-533844-DEM5A-20251113", name: "533844" },
  { dir: "FG-GML-533901-DEM5A-20250620", name: "533901" },
  { dir: "FG-GML-533914-DEM5A-20250620", name: "533914" },
  { dir: "FG-GML-533945-DEM5A-20250822", name: "533945" },
];
const targetName = process.argv[2]; // node build-dem.mjs 533945
const targets = targetName
  ? MESHES.filter(m => m.name === targetName)
  : MESHES;
if (targets.length === 0) {
  console.error(`Unknown mesh: ${targetName}. Available: ${MESHES.map(m => m.name).join(", ")}`);
  process.exit(1);
}
const OUT_DIR = join(ROOT, "src/terrain/data/dem");

const OUT_SIZE = 512;

// ---- DEM5A タイル 1 枚をパース ----

function parseDEM5ATile(xmlPath) {
  const xml = readFileSync(xmlPath, "utf8");

  // bbox
  const lowerMatch = /<gml:lowerCorner>([\d.]+)\s+([\d.]+)<\/gml:lowerCorner>/.exec(xml);
  const upperMatch = /<gml:upperCorner>([\d.]+)\s+([\d.]+)<\/gml:upperCorner>/.exec(xml);
  if (!lowerMatch || !upperMatch) return null;
  const minLat = parseFloat(lowerMatch[1]);
  const minLon = parseFloat(lowerMatch[2]);
  const maxLat = parseFloat(upperMatch[1]);
  const maxLon = parseFloat(upperMatch[2]);

  // grid dimensions
  const highMatch = /<gml:high>(\d+)\s+(\d+)<\/gml:high>/.exec(xml);
  if (!highMatch) return null;
  const cols = parseInt(highMatch[1]) + 1;
  const rows = parseInt(highMatch[2]) + 1;

  // sequence rule: +x-y means row-major, x increases, y decreases (north→south)
  const seqMatch = /<gml:sequenceRule[^>]*>([^<]+)<\/gml:sequenceRule>/.exec(xml);
  const startMatch = /<gml:startPoint>(\d+)\s+(\d+)<\/gml:startPoint>/.exec(xml);
  const startX = startMatch ? parseInt(startMatch[1]) : 0;
  const startY = startMatch ? parseInt(startMatch[2]) : 0;

  // tuple list
  const tupleMatch = /<gml:tupleList>([\s\S]*?)<\/gml:tupleList>/.exec(xml);
  if (!tupleMatch) return null;
  const lines = tupleMatch[1].trim().split("\n");
  const values = lines.map(line => {
    const parts = line.trim().split(",");
    const v = parseFloat(parts[1]);
    return isNaN(v) ? -9999 : v; // 海面・データ欠損は -9999
  });

  return { minLat, maxLat, minLon, maxLon, cols, rows, startX, startY, values };
}

// ---- メイン ----

function buildMesh(meshDir, outFile) {

console.log(`\n[build-dem5a] ${meshDir} をスキャン中...`);
const DEM_DIR = join(ROOT, meshDir);
const files = readdirSync(DEM_DIR).filter(f => f.endsWith(".xml"));
console.log(`  タイル数: ${files.length}`);

// 全タイルを読む
const tiles = [];
for (const f of files) {
  const t = parseDEM5ATile(join(DEM_DIR, f));
  if (t !== null) tiles.push(t);
}
console.log(`  パース成功: ${tiles.length}`);

// 全体 bbox
let gMinLat = Infinity, gMaxLat = -Infinity;
let gMinLon = Infinity, gMaxLon = -Infinity;
for (const t of tiles) {
  if (t.minLat < gMinLat) gMinLat = t.minLat;
  if (t.maxLat > gMaxLat) gMaxLat = t.maxLat;
  if (t.minLon < gMinLon) gMinLon = t.minLon;
  if (t.maxLon > gMaxLon) gMaxLon = t.maxLon;
}
console.log(`  全体 bbox: lat [${gMinLat.toFixed(6)}, ${gMaxLat.toFixed(6)}], lon [${gMinLon.toFixed(6)}, ${gMaxLon.toFixed(6)}]`);

// 高解像度の統合グリッドに全タイルを書き込む
// 5m mesh: 0.0125°/225cols ≈ 0.0000556° per cell
// 全体: lat 0.0833°, lon 0.0875° → 約 1500×1575 cells
const cellSizeLat = (gMaxLat - gMinLat) / 1500;
const cellSizeLon = (gMaxLon - gMinLon) / 1500;
const hiW = Math.round((gMaxLon - gMinLon) / cellSizeLon);
const hiH = Math.round((gMaxLat - gMinLat) / cellSizeLat);
console.log(`  高解像度グリッド: ${hiW}×${hiH}`);

const hiGrid = new Float32Array(hiW * hiH);
hiGrid.fill(-9999); // no-data

for (const t of tiles) {
  for (let row = 0; row < t.rows; row++) {
    for (let col = 0; col < t.cols; col++) {
      const idx = row * t.cols + col;
      const v = t.values[idx];
      if (v === undefined || v <= -9999) continue;

      // タイル内のセル → 緯度経度
      // +x-y: col は east (lon 増加), row は south (lat 減少)
      const lon = t.minLon + (col + 0.5) * (t.maxLon - t.minLon) / t.cols;
      const lat = t.maxLat - (row + 0.5) * (t.maxLat - t.minLat) / t.rows;

      // 全体グリッドのセル位置
      const gx = Math.floor((lon - gMinLon) / cellSizeLon);
      const gy = Math.floor((gMaxLat - lat) / cellSizeLat); // 北が y=0
      if (gx < 0 || gx >= hiW || gy < 0 || gy >= hiH) continue;
      hiGrid[gy * hiW + gx] = v;
    }
  }
}

// 統計
let filled = 0, noData = 0, minE = Infinity, maxE = -Infinity;
for (let i = 0; i < hiGrid.length; i++) {
  if (hiGrid[i] <= -9999) { noData++; continue; }
  filled++;
  if (hiGrid[i] < minE) minE = hiGrid[i];
  if (hiGrid[i] > maxE) maxE = hiGrid[i];
}
console.log(`  有効セル: ${filled}, nodata: ${noData} (${(noData / hiGrid.length * 100).toFixed(1)}%)`);
console.log(`  標高範囲: ${minE.toFixed(1)}m 〜 ${maxE.toFixed(1)}m`);

// nodata → 海洋マスクを作成し、標高は周囲と合わせて 0m に
const hiOcean = new Uint8Array(hiW * hiH);
for (let i = 0; i < hiGrid.length; i++) {
  if (hiGrid[i] <= -9999) {
    hiOcean[i] = 1;
    hiGrid[i] = 0;
  }
}

// OUT_SIZE × OUT_SIZE にダウンサンプル（バイリニア補間）
const NORM_MAX = Math.max(200, maxE);
const data = new Array(OUT_SIZE * OUT_SIZE);
for (let oy = 0; oy < OUT_SIZE; oy++) {
  for (let ox = 0; ox < OUT_SIZE; ox++) {
    const sx = (ox / (OUT_SIZE - 1)) * (hiW - 1);
    const sy = (oy / (OUT_SIZE - 1)) * (hiH - 1);
    const x0 = Math.floor(sx);
    const y0 = Math.floor(sy);
    const x1 = Math.min(x0 + 1, hiW - 1);
    const y1 = Math.min(y0 + 1, hiH - 1);
    const fx = sx - x0;
    const fy = sy - y0;

    // 海洋マスクの max-pool: 4 隅のいずれかが海なら出力も海
    const isWater = hiOcean[y0 * hiW + x0] === 1
                 || hiOcean[y0 * hiW + x1] === 1
                 || hiOcean[y1 * hiW + x0] === 1
                 || hiOcean[y1 * hiW + x1] === 1;

    if (isWater) {
      data[oy * OUT_SIZE + ox] = 0.05; // 確実に waterThreshold 以下
    } else {
      const v00 = hiGrid[y0 * hiW + x0];
      const v10 = hiGrid[y0 * hiW + x1];
      const v01 = hiGrid[y1 * hiW + x0];
      const v11 = hiGrid[y1 * hiW + x1];
      const top = v00 * (1 - fx) + v10 * fx;
      const bot = v01 * (1 - fx) + v11 * fx;
      const elev = top * (1 - fy) + bot * fy;
      const e = Math.max(0, elev);
      data[oy * OUT_SIZE + ox] = Math.min(1, 0.08 + (e / NORM_MAX) * 0.92);
    }
  }
}

// 分布
const hist = { water: 0, low: 0, hill: 0, mountain: 0 };
for (const v of data) {
  if (v < 0.2) hist.water++;
  else if (v < 0.3) hist.low++;
  else if (v < 0.5) hist.hill++;
  else hist.mountain++;
}
const total = OUT_SIZE * OUT_SIZE;
console.log(`\n[出力] ${OUT_SIZE}×${OUT_SIZE} (${(JSON.stringify({ data }).length / 1024).toFixed(0)} KB)`);
console.log(`  水 (<0.2):     ${hist.water.toString().padStart(6)} (${(hist.water / total * 100).toFixed(1)}%)`);
console.log(`  低地 (0.2-0.3): ${hist.low.toString().padStart(6)} (${(hist.low / total * 100).toFixed(1)}%)`);
console.log(`  丘陵 (0.3-0.5): ${hist.hill.toString().padStart(6)} (${(hist.hill / total * 100).toFixed(1)}%)`);
console.log(`  山岳 (>0.5):   ${hist.mountain.toString().padStart(6)} (${(hist.mountain / total * 100).toFixed(1)}%)`);

// 書き出し
mkdirSync(OUT_DIR, { recursive: true });
const output = {
  width: OUT_SIZE,
  height: OUT_SIZE,
  bbox: { minLat: gMinLat, maxLat: gMaxLat, minLon: gMinLon, maxLon: gMaxLon },
  rawElevRange: { min: minE, max: maxE },
  data,
};
writeFileSync(outFile, JSON.stringify(output));
console.log(`[build-dem5a] 書き込み完了: ${outFile}`);
} // end buildMesh

// 全ターゲットをビルド
mkdirSync(OUT_DIR, { recursive: true });
for (const mesh of targets) {
  const outFile = join(OUT_DIR, `dem-${mesh.name}.json`);
  buildMesh(mesh.dir, outFile);
}
