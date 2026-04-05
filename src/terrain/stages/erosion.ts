import type { StageContext } from "../context.js";
import { createGradientNoise } from "./noise.js";

/**
 * 粒子ベース水力侵食:
 * ランダムな位置に水滴を落とし、勾配に従って流す。
 * 急斜面で土砂を拾い、緩斜面で堆積する。
 * これにより川の谷・尾根・扇状地が自然に形成される。
 */
export function erode(ctx: StageContext): void {
  const { width: w, height: h, elevation, rng } = ctx;

  // 粒子数を十分に確保して谷を形成する
  const numParticles = Math.min(w * h * 2, 200000);
  const maxSteps = 64;

  const inertia = 0.4;
  const sedimentCapacity = 8;
  const depositRate = 0.15;
  const erodeRate = 0.5;
  const evaporateRate = 0.015;
  const gravity = 12;
  const minSlope = 0.005;

  for (let p = 0; p < numParticles; p++) {
    let px = rng() * (w - 2) + 1;
    let py = rng() * (h - 2) + 1;
    let dx = 0;
    let dy = 0;
    let speed = 0;
    let water = 1;
    let sediment = 0;

    for (let step = 0; step < maxSteps; step++) {
      const xi = Math.floor(px);
      const yi = Math.floor(py);
      if (xi < 1 || xi >= w - 1 || yi < 1 || yi >= h - 1) break;

      // バイリニア補間で勾配を計算する
      const fx = px - xi;
      const fy = py - yi;
      const i00 = yi * w + xi;
      const h00 = elevation[i00] ?? 0;
      const h10 = elevation[i00 + 1] ?? 0;
      const h01 = elevation[i00 + w] ?? 0;
      const h11 = elevation[i00 + w + 1] ?? 0;

      // 勾配
      const gx = (h10 - h00) * (1 - fy) + (h11 - h01) * fy;
      const gy = (h01 - h00) * (1 - fx) + (h11 - h10) * fx;

      // 現在の高さ（補間）
      const hHere = h00 * (1 - fx) * (1 - fy) + h10 * fx * (1 - fy)
                  + h01 * (1 - fx) * fy + h11 * fx * fy;

      // 慣性で方向を更新する
      dx = dx * inertia - gx * (1 - inertia);
      dy = dy * inertia - gy * (1 - inertia);
      const len = Math.sqrt(dx * dx + dy * dy);
      if (len < 0.0001) break;
      dx /= len;
      dy /= len;

      // 移動する
      const newX = px + dx;
      const newY = py + dy;
      if (newX < 1 || newX >= w - 1 || newY < 1 || newY >= h - 1) break;

      // 新しい位置の高さ
      const nxi = Math.floor(newX);
      const nyi = Math.floor(newY);
      const nfx = newX - nxi;
      const nfy = newY - nyi;
      const ni00 = nyi * w + nxi;
      const nh00 = elevation[ni00] ?? 0;
      const nh10 = elevation[ni00 + 1] ?? 0;
      const nh01 = elevation[ni00 + w] ?? 0;
      const nh11 = elevation[ni00 + w + 1] ?? 0;
      const hNew = nh00 * (1 - nfx) * (1 - nfy) + nh10 * nfx * (1 - nfy)
                 + nh01 * (1 - nfx) * nfy + nh11 * nfx * nfy;

      const heightDiff = hNew - hHere;

      // 運搬能力
      const capacity = Math.max(-heightDiff, minSlope) * speed * water * sedimentCapacity;

      if (sediment > capacity || heightDiff > 0) {
        // 堆積する
        const depositAmount = heightDiff > 0
          ? Math.min(sediment, heightDiff)
          : (sediment - capacity) * depositRate;
        sediment -= depositAmount;
        // 周囲4セルにバイリニアで堆積する
        deposit(elevation, w, xi, yi, fx, fy, depositAmount);
      } else {
        // 侵食する
        const erodeAmount = Math.min((capacity - sediment) * erodeRate, -heightDiff);
        sediment += erodeAmount;
        // 周囲4セルからバイリニアで侵食する
        deposit(elevation, w, xi, yi, fx, fy, -erodeAmount);
      }

      // 速度と水量を更新する
      speed = Math.sqrt(Math.max(0, speed * speed + heightDiff * gravity));
      water *= (1 - evaporateRate);

      px = newX;
      py = newY;

      if (water < 0.01) break;
    }
  }
}

/** バイリニア補間で標高を加減する */
function deposit(
  elevation: Float32Array,
  w: number,
  xi: number,
  yi: number,
  fx: number,
  fy: number,
  amount: number,
): void {
  const i00 = yi * w + xi;
  const w00 = amount * (1 - fx) * (1 - fy);
  const w10 = amount * fx * (1 - fy);
  const w01 = amount * (1 - fx) * fy;
  const w11 = amount * fx * fy;
  if (i00 >= 0 && i00 < elevation.length) elevation[i00] = (elevation[i00] ?? 0) + w00;
  if (i00 + 1 < elevation.length) elevation[i00 + 1] = (elevation[i00 + 1] ?? 0) + w10;
  if (i00 + w < elevation.length) elevation[i00 + w] = (elevation[i00 + w] ?? 0) + w01;
  if (i00 + w + 1 < elevation.length) elevation[i00 + w + 1] = (elevation[i00 + w + 1] ?? 0) + w11;
}


/**
 * 河川沿いの谷形成:
 * - 山岳部: V字谷を掘る（川から離れるほど標高が急上昇する）
 * - 平地部: なだらかな氾濫原（川に向かって緩やかに標高が下がる）
 */
export function flattenValleys(ctx: StageContext): void {
  const { width: w, height: h, elevation, flow } = ctx;
  const size = w * h;
  const MOUNTAIN_TH = 0.35;
  const FLOW_MIN = 50;

  // 各セルから最寄りの大河川までの距離・標高・流量を計算する（BFS）
  const riverDist = new Float32Array(size).fill(Infinity);
  const riverElev = new Float32Array(size);
  const riverFlow = new Float32Array(size);
  const queue: number[] = [];

  for (let i = 0; i < size; i++) {
    if ((flow[i] ?? 0) > FLOW_MIN) {
      riverDist[i] = 0;
      riverElev[i] = elevation[i] ?? 0;
      riverFlow[i] = flow[i] ?? 0;
      queue.push(i);
    }
  }

  // BFS で最寄り川の距離と標高を伝播する
  const DX = [0, 1, 0, -1, 1, 1, -1, -1];
  const DY = [-1, 0, 1, 0, -1, 1, 1, -1];
  const DIST = [1, 1, 1, 1, 1.414, 1.414, 1.414, 1.414];
  // 山岳部の影響半径（V字谷の幅）、平地の影響半径（氾濫原の幅）
  const MOUNTAIN_RADIUS = 12;
  const FLAT_RADIUS = 8;
  const maxRadius = Math.max(MOUNTAIN_RADIUS, FLAT_RADIUS);

  let head = 0;
  while (head < queue.length) {
    const ci = queue[head++] ?? 0;
    const cx = ci % w;
    const cy = (ci - cx) / w;
    const cd = riverDist[ci] ?? 0;
    if (cd >= maxRadius) continue;

    for (let d = 0; d < 8; d++) {
      const nx = cx + (DX[d] ?? 0);
      const ny = cy + (DY[d] ?? 0);
      if (nx < 0 || nx >= w || ny < 0 || ny >= h) continue;
      const ni = ny * w + nx;
      const nd = cd + (DIST[d] ?? 1);
      if (nd < (riverDist[ni] ?? Infinity)) {
        riverDist[ni] = nd;
        riverElev[ni] = riverElev[ci] ?? 0;
        riverFlow[ni] = riverFlow[ci] ?? 0;
        queue.push(ni);
      }
    }
  }

  // 河岸段丘を部分的に適用するためのノイズ（流量が大きい山岳河川で使用）
  const { rng } = ctx;
  const terraceNoise = createGradientNoise(rng);
  const tnAngle = rng() * Math.PI * 2;
  const tnCos = Math.cos(tnAngle);
  const tnSin = Math.sin(tnAngle);
  const tnOx = rng() * 500;
  const tnOy = rng() * 500;
  // 段丘が現れる流量の閾値（大きい川でのみ段丘が形成される）
  const TERRACE_FLOW_MIN = 500;
  // 段丘の段数
  const TERRACE_STEPS = 3;

  // 距離に基づいて標高を補正する
  for (let i = 0; i < size; i++) {
    const dist = riverDist[i] ?? Infinity;
    if (dist === Infinity || dist === 0) continue;

    const here = elevation[i] ?? 0;
    const rElev = riverElev[i] ?? 0;
    const isMountain = here > MOUNTAIN_TH;

    if (isMountain && dist < MOUNTAIN_RADIUS) {
      const t = dist / MOUNTAIN_RADIUS;
      // V字の急な壁 — t² で谷底近くが急斜面になる
      let vProfile = t * t;

      // 河岸段丘: 流量が十分大きく、ノイズで部分的に適用する
      const rFlow = riverFlow[i] ?? 0;
      if (rFlow > TERRACE_FLOW_MIN) {
        const x = i % w;
        const y = (i - x) / w;
        // 低周波ノイズで段丘の有無を空間的に変化させる
        const nfx = x * 0.02;
        const nfy = y * 0.02;
        const nrx = nfx * tnCos - nfy * tnSin + tnOx;
        const nry = nfx * tnSin + nfy * tnCos + tnOy;
        const terraceStrength = terraceNoise(nrx, nry);

        // ノイズ値が0.55以上の領域でのみ段丘を形成する（約40%の区間）
        if (terraceStrength > 0.55) {
          // 連続プロファイルを階段状に量子化する
          // 段丘の幅は流量が大きいほど広い
          const quantized = Math.floor(vProfile * TERRACE_STEPS) / TERRACE_STEPS;
          // 段丘の平坦部と崖の間を滑らかに補間する
          const frac = vProfile * TERRACE_STEPS - Math.floor(vProfile * TERRACE_STEPS);
          // 急な遷移関数（崖部分は狭く、平坦部分を広くする）
          const smoothFrac = frac < 0.2 ? frac * 5 * 0.2 : 0.2 + (frac - 0.2) * (0.8 / 0.8);
          const terraced = quantized + smoothFrac / TERRACE_STEPS;
          // ノイズ強度に応じてV字谷と段丘をブレンドする
          const blend = Math.min(1, (terraceStrength - 0.55) * 4);
          vProfile = vProfile * (1 - blend) + terraced * blend;
        }
      }

      const targetElev = rElev + (here - rElev) * vProfile;
      if (targetElev < here) {
        elevation[i] = targetElev;
      }
    } else if (!isMountain && dist < FLAT_RADIUS) {
      // 氾濫原: 川に向かってなだらかに下がるプロファイル
      const t = dist / FLAT_RADIUS;
      const flatProfile = Math.sqrt(t);
      const targetElev = rElev + (here - rElev) * flatProfile;
      if (targetElev < here) {
        elevation[i] = targetElev;
      }
    }
  }
}
