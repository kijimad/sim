import { RouteMode } from "../simulation.js";

interface RoutePanelProps {
  readonly stops: readonly number[];
  readonly editingRouteId: number | null;
  readonly onConfirm: (mode: RouteMode) => void;
  readonly onCancel: () => void;
  readonly onRemoveStop: (index: number) => void;
}

export function RoutePanel({ stops, editingRouteId, onConfirm, onCancel, onRemoveStop }: RoutePanelProps) {
  const isEditing = editingRouteId !== null;

  return (
    <div className="route-panel">
      <div className="panel-header">
        {isEditing ? `Edit Route #${String(editingRouteId)}` : "Create Route"}
      </div>
      <div className="route-stops">
        {stops.length === 0
          ? "Click stations to add stops"
          : stops.map((id, i) => (
              <span key={`${String(id)}-${String(i)}`} className="stop-editable">
                {i > 0 && <span className="stop-arrow"> → </span>}
                <span className="stop-badge">
                  #{id}
                  <button
                    className="stop-remove"
                    onClick={() => { onRemoveStop(i); }}
                  >
                    ×
                  </button>
                </span>
              </span>
            ))}
      </div>
      <div className="route-actions">
        {isEditing ? (
          <button
            disabled={stops.length < 2}
            onClick={() => { onConfirm(RouteMode.Shuttle); }}
          >
            Save
          </button>
        ) : (
          <>
            <button
              disabled={stops.length < 2}
              onClick={() => { onConfirm(RouteMode.Shuttle); }}
            >
              Shuttle
            </button>
            <button
              disabled={stops.length < 2}
              onClick={() => { onConfirm(RouteMode.Loop); }}
            >
              Loop
            </button>
          </>
        )}
        <button onClick={onCancel}>Cancel</button>
      </div>
    </div>
  );
}
