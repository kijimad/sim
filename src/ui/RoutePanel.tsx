import { RouteMode } from "../simulation.js";

interface RoutePanelProps {
  readonly stops: readonly number[];
  readonly onConfirm: (mode: RouteMode) => void;
  readonly onCancel: () => void;
  readonly onAddTrain: () => void;
  readonly lastRouteId: number | null;
  readonly trainCount: number;
}

export function RoutePanel({
  stops,
  onConfirm,
  onCancel,
  onAddTrain,
  lastRouteId,
  trainCount,
}: RoutePanelProps): React.JSX.Element {
  return (
    <div className="route-panel">
      <div className="route-stops">
        <strong>Route stops:</strong>
        {stops.length === 0
          ? " Click stations to add stops"
          : ` ${stops.map((id) => `#${String(id)}`).join(" → ")}`}
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
        <button onClick={onCancel}>Cancel (Esc)</button>
      </div>
      <div className="train-actions">
        <button
          disabled={lastRouteId === null}
          onClick={onAddTrain}
        >
          Add Train (T)
        </button>
        <span>Trains: {trainCount}</span>
      </div>
    </div>
  );
}
