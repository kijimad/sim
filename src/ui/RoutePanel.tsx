import { RouteMode } from "../simulation.js";

interface RoutePanelProps {
  readonly stops: readonly number[];
  readonly onConfirm: (mode: RouteMode) => void;
  readonly onCancel: () => void;
}

export function RoutePanel({ stops, onConfirm, onCancel }: RoutePanelProps) {
  return (
    <div className="route-panel">
      <div className="panel-header">Create Route</div>
      <div className="route-stops">
        {stops.length === 0
          ? "Click stations to add stops"
          : stops.map((id, i) => (
              <span key={`${String(id)}-${String(i)}`} className="stop-badge">#{id}</span>
            ))}
      </div>
      <div className="route-actions">
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
        <button onClick={onCancel}>Cancel</button>
      </div>
    </div>
  );
}
