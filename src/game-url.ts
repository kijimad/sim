import type { GameConfig } from "./game-world.js";
import { createDefaultConfig } from "./game-world.js";

/** URLクエリパラメータからゲーム設定を読み取る（ブラウザ専用） */
export function parseConfigFromURL(): Partial<GameConfig> {
  const params = new URLSearchParams(window.location.search);
  const seedParam = params.get("seed");
  const seed = seedParam !== null && Number.isFinite(Number(seedParam)) ? Number(seedParam) : undefined;
  const debug = params.get("debug") === "1" || params.get("debug") === "true" ? true : undefined;

  return {
    ...(seed !== undefined ? { seed } : {}),
    ...(debug !== undefined ? { debug } : {}),
  };
}

/** URLからconfigを生成する（後方互換） */
export function configFromURL(): GameConfig {
  return createDefaultConfig(parseConfigFromURL());
}
