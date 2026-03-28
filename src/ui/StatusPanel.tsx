import type { GameSnapshot } from "../game.js";

interface StatusPanelProps {
  readonly snap: GameSnapshot;
}

export function StatusPanel({ snap }: StatusPanelProps) {
  return (
    <div className="status-panel">
      <div className="status-row">
        <span>${Math.floor(snap.money).toLocaleString()}</span>
        <span>Pop: {snap.totalPopulation}</span>
        <span>Cities: {snap.cities.length}</span>
      </div>
    </div>
  );
}
