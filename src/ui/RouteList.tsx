import type { Game, RouteInfo } from "../game.js";

interface RouteListProps {
  readonly routes: readonly RouteInfo[];
  readonly lastRouteId: number | null;
  readonly game: Game;
}

export function RouteList({ routes, lastRouteId, game }: RouteListProps) {
  if (routes.length === 0) {
    return <div className="route-list-empty">No routes. Use Route tool (3) to create one.</div>;
  }

  return (
    <div className="route-list">
      <div className="panel-header">Routes</div>
      {routes.map((r) => (
        <div
          key={r.id}
          className={`route-item ${r.id === lastRouteId ? "selected" : ""}`}
          onClick={() => { game.selectRoute(r.id); }}
        >
          <div className="route-item-header">
            <span className="route-name">Route #{r.id}</span>
            <span className="route-mode">{r.mode}</span>
          </div>
          <div className="route-item-detail">
            <span>Stops: {r.stops.length}</span>
            <span>Trains: {r.trainCount}</span>
            <button
              className="small-btn"
              onClick={(e) => { e.stopPropagation(); game.addTrain(r.id); }}
            >
              +
            </button>
            <button
              className="small-btn"
              disabled={r.trainCount === 0}
              onClick={(e) => { e.stopPropagation(); game.removeTrainFromRoute(r.id); }}
            >
              -
            </button>
            <button
              className="small-btn danger-btn"
              onClick={(e) => { e.stopPropagation(); game.removeRoute(r.id); }}
            >
              Del
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}
