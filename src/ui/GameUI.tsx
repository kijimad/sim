import { useSyncExternalStore } from "react";
import type { Game, GameSnapshot } from "../game.js";
import { ToolMode } from "../game.js";
import { InspectPanel } from "./InspectPanel.js";
import { RouteList } from "./RouteList.js";
import { RoutePanel } from "./RoutePanel.js";
import { StatusPanel } from "./StatusPanel.js";
import { Toolbar } from "./Toolbar.js";
import { TrainList } from "./TrainList.js";

interface GameUIProps {
  readonly game: Game;
}

function RailPanel({ snap }: { snap: GameSnapshot }) {
  return (
    <div className="rail-panel">
      <div className="panel-header">Rail</div>
      <div className="rail-hint">
        {snap.selectedNodeId !== null
          ? "Click another node to connect, or empty tile to place"
          : "Click to place, or click an edge to split"}
      </div>
    </div>
  );
}

export function GameUI({ game }: GameUIProps) {
  const snap = useSyncExternalStore<GameSnapshot>(
    (cb) => game.onChange(cb),
    () => game.getSnapshot(),
  );

  return (
    <div className="game-ui">
      <div className="top-bar">
        <Toolbar
          toolMode={snap.toolMode}
          onSetTool={(mode) => { game.setToolMode(mode); }}
        />
        <StatusPanel snap={snap} />
      </div>

      <div className="side-panel">
        {snap.toolMode === ToolMode.Inspect && (
          <InspectPanel info={snap.inspect} game={game} />
        )}
        {snap.toolMode === ToolMode.Rail && (
          <RailPanel snap={snap} />
        )}
        {snap.toolMode === ToolMode.Route && (
          <RoutePanel
            stops={snap.routeStops}
            editingRouteId={snap.editingRouteId}
            onConfirm={(mode) => { game.confirmRoute(mode); }}
            onCancel={() => { game.cancelRoute(); }}
            onRemoveStop={(i) => { game.removeRouteStop(i); }}
          />
        )}
        <RouteList
          routes={snap.routes}
          lastRouteId={snap.lastRouteId}
          game={game}
        />
        <TrainList trains={snap.trains} />
      </div>
    </div>
  );
}
