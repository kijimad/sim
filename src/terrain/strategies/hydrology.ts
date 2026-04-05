import type { Strategy } from "../slots.js";
import { computeRivers } from "../stages/rivers.js";

/**
 * Priority-Flood ベースの窪地埋め + 流量蓄積。
 * 既存 `computeRivers` をそのままラップする。
 */
export const priorityFlood = (): Strategy => ({
  name: "priorityFlood",
  slot: "hydrology",
  run: computeRivers,
  requires: ["elevation"],
  provides: ["flow", "elevation"],
});
