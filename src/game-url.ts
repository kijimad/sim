import type { GameConfig } from "./game-world.js";

/** URLクエリパラメータからゲーム設定を読み取る（ブラウザ専用） */
export function parseConfigFromURL(): GameConfig {
  const params = new URLSearchParams(window.location.search);
  const seedParam = params.get("seed");
  const seed = seedParam !== null ? Number(seedParam) : Date.now();
  const debug = params.get("debug") === "1" || params.get("debug") === "true";
  return { seed: Number.isFinite(seed) ? seed : Date.now(), debug };
}
