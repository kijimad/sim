import { useSyncExternalStore, useState, useCallback } from "react";
import { ConfigProvider, theme } from "antd";
import type { Game, GameSnapshot, Toast } from "../game.js";
import { ToolMode } from "../game.js";
import { InspectPanel } from "./InspectPanel.js";
import { RouteList } from "./RouteList.js";
import { RoutePanel } from "./RoutePanel.js";
import { StatusPanel } from "./StatusPanel.js";
import { FloatingWindow } from "./FloatingWindow.js";
import { TrainDetailWindows, TrainList } from "./TrainList.js";

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

function ToolbarButton({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button className={active ? "active" : ""} onClick={onClick}>
      {label}
    </button>
  );
}

export function GameUI({ game }: GameUIProps) {
  const snap = useSyncExternalStore<GameSnapshot>(
    (cb) => game.onChange(cb),
    () => game.getSnapshot(),
  );

  // 各ウィンドウの開閉状態
  const [showInspect, setShowInspect] = useState(false);
  const [showRoutes, setShowRoutes] = useState(false);
  const [showTrains, setShowTrains] = useState(false);
  const [showRouteEditor, setShowRouteEditor] = useState(false);

  const setTool = useCallback((mode: ToolMode) => {
    game.setToolMode(mode);
    // Route ツール選択時は路線エディタを自動的に開く
    if (mode === ToolMode.Route) {
      setShowRouteEditor(true);
    }
  }, [game]);

  return (
    <ConfigProvider theme={{ algorithm: theme.darkAlgorithm }}>
      <div className="game-ui">
        <div className="top-bar">
          <div className="toolbar">
            <ToolbarButton label="Inspect (`)" active={snap.toolMode === ToolMode.Inspect}
              onClick={() => { setTool(ToolMode.Inspect); }} />
            <ToolbarButton label="Rail (1)" active={snap.toolMode === ToolMode.Rail}
              onClick={() => { setTool(ToolMode.Rail); }} />
            <ToolbarButton label="Route (2)" active={snap.toolMode === ToolMode.Route}
              onClick={() => { setTool(ToolMode.Route); }} />
          </div>
          <div className="toolbar">
            <ToolbarButton label="Inspect" active={showInspect}
              onClick={() => { setShowInspect((v) => !v); }} />
            <ToolbarButton label="Routes" active={showRoutes}
              onClick={() => { setShowRoutes((v) => !v); }} />
            <ToolbarButton label="Trains" active={showTrains}
              onClick={() => { setShowTrains((v) => !v); }} />
          </div>
          <StatusPanel snap={snap} />
        </div>

        {/* フローティングウィンドウ群 */}
        <div className="floating-layer">
          {showInspect && (
            <FloatingWindow title="Inspect" onClose={() => { setShowInspect(false); }} defaultX={10} defaultY={60} width={260}>
              <InspectPanel info={snap.inspect} game={game} />
            </FloatingWindow>
          )}

          {showRoutes && (
            <FloatingWindow title="Routes" onClose={() => { setShowRoutes(false); }} defaultX={10} defaultY={200} width={300}>
              <RouteList routes={snap.routes} lastRouteId={snap.lastRouteId} game={game} />
            </FloatingWindow>
          )}

          {showTrains && (
            <FloatingWindow title={`Trains (${snap.trainCount})`} onClose={() => { setShowTrains(false); }} defaultX={10} defaultY={350} width={280}>
              <TrainList trains={snap.trains} openTrainIds={snap.openTrainIds} game={game} />
            </FloatingWindow>
          )}

          {(showRouteEditor || snap.toolMode === ToolMode.Route) && snap.toolMode === ToolMode.Route && (
            <FloatingWindow title="Route Editor" onClose={() => { setShowRouteEditor(false); game.cancelRoute(); }} defaultX={320} defaultY={60} width={300}>
              <RoutePanel
                stops={snap.routeStops}
                stopNames={snap.routeStopNames}
                editingRouteId={snap.editingRouteId}
                onConfirm={(mode) => { game.confirmRoute(mode); }}
                onCancel={() => { game.cancelRoute(); }}
                onRemoveStop={(i) => { game.removeRouteStop(i); }}
              />
            </FloatingWindow>
          )}

          {snap.toolMode === ToolMode.Rail && (
            <FloatingWindow title="Rail" onClose={() => { game.setToolMode(ToolMode.Inspect); }} defaultX={320} defaultY={60} width={260}>
              <div style={{ color: "#aaa", fontSize: 12 }}>
                {snap.selectedNodeId !== null
                  ? snap.railWaypointCount > 0
                    ? `${String(snap.railWaypointCount)} waypoint(s). Click station to connect, or empty tile for more`
                    : "Click empty tile for waypoint, or station to connect"
                  : "Click station to select, or empty tile to place"}
              </div>
            </FloatingWindow>
          )}

          <TrainDetailWindows trains={snap.trains} openTrainIds={snap.openTrainIds} game={game} />
        </div>

        <ToastContainer toasts={snap.toasts} />
      </div>
    </ConfigProvider>
  );
}
