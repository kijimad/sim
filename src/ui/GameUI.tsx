import { useSyncExternalStore } from "react";
import type { Game, GameSnapshot } from "../game.js";
import { ToolMode } from "../game.js";
import { RoutePanel } from "./RoutePanel.js";
import { Toolbar } from "./Toolbar.js";

interface GameUIProps {
  readonly game: Game;
}

export function GameUI({ game }: GameUIProps): React.JSX.Element {
  const snap = useSyncExternalStore<GameSnapshot>(
    (cb) => game.onChange(cb),
    () => game.getSnapshot(),
  );

  return (
    <div className="game-ui">
      <Toolbar
        toolMode={snap.toolMode}
        onSetTool={(mode) => { game.setToolMode(mode); }}
      />
      {snap.toolMode === ToolMode.Route ? (
        <RoutePanel
          stops={snap.routeStops}
          onConfirm={(mode) => { game.confirmRoute(mode); }}
          onCancel={() => { game.cancelRoute(); }}
          onAddTrain={() => { game.addTrain(); }}
          lastRouteId={snap.lastRouteId}
          trainCount={snap.trainCount}
        />
      ) : (
        <div className="status-bar">
          <span>Routes: {snap.routeCount}</span>
          <span>Trains: {snap.trainCount}</span>
          <button
            disabled={snap.lastRouteId === null}
            onClick={() => { game.addTrain(); }}
          >
            Add Train (T)
          </button>
        </div>
      )}
    </div>
  );
}
