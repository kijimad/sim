import { useState } from "react";
import type { Game, RouteInfo } from "../game.js";

interface RouteListProps {
  readonly routes: readonly RouteInfo[];
  readonly lastRouteId: number | null;
  readonly game: Game;
}

function EditableName({ value, onSave }: { value: string; onSave: (v: string) => void }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);

  if (!editing) {
    return (
      <span className="editable-name-wrap">
        <span className="editable-name-text">{value}</span>
        <button
          className="edit-btn"
          onClick={(e) => { e.stopPropagation(); setEditing(true); setDraft(value); }}
          title="Rename"
        >
          ✎
        </button>
      </span>
    );
  }

  return (
    <input
      className="name-edit-input"
      value={draft}
      autoFocus
      onClick={(e) => { e.stopPropagation(); }}
      onChange={(e) => { setDraft(e.target.value); }}
      onBlur={() => { onSave(draft); setEditing(false); }}
      onKeyDown={(e) => {
        if (e.key === "Enter") { onSave(draft); setEditing(false); }
        if (e.key === "Escape") { setEditing(false); }
      }}
    />
  );
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
            <EditableName
              value={r.name}
              onSave={(v) => { game.renameRoute(r.id, v); }}
            />
            <span className="route-mode">{r.mode}</span>
          </div>
          <div className="route-stops-display">
            {r.stopNames.map((name, i) => (
              <span key={`${name}-${String(i)}`}>
                {i > 0 && <span className="stop-arrow"> → </span>}
                <span className="stop-badge">{name}</span>
              </span>
            ))}
          </div>
          <div className="route-item-detail">
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
              className="small-btn"
              onClick={(e) => { e.stopPropagation(); game.editRoute(r.id); }}
            >
              Edit
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
