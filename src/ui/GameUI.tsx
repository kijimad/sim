import { useSyncExternalStore } from "react";
import type { Game, GameSnapshot, Toast } from "../game.js";
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

function ToastContainer({ toasts }: { toasts: readonly Toast[] }) {
  if (toasts.length === 0) return null;
  return (
    <div className="toast-container">
      {toasts.map((t) => (
        <div key={t.id} className="toast-item">{t.message}</div>
      ))}
    </div>
  );
}

function RailPanel({ snap }: { snap: GameSnapshot }) {
  return (
    <div className="rail-panel">
      <div className="panel-header">Rail</div>
      <div className="rail-hint">
        {snap.selectedNodeId !== null
          ? snap.railWaypointCount > 0
            ? `${String(snap.railWaypointCount)} waypoint(s). Click station to connect, or empty tile for more`
            : "Click empty tile for waypoint, or station to connect"
          : "Click station to select, or empty tile to place"}
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
            stopNames={snap.routeStopNames}
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

      <ToastContainer toasts={snap.toasts} />
    </div>
  );
}
