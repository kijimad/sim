import type { TrainInfo } from "../game.js";

interface TrainListProps {
  readonly trains: readonly TrainInfo[];
}

export function TrainList({ trains }: TrainListProps) {
  if (trains.length === 0) return null;

  return (
    <div className="train-list">
      <div className="panel-header">Trains ({trains.length})</div>
      {trains.map((t) => (
        <div key={t.id} className="train-item">
          <div className="train-item-header">
            <span>Train #{t.id}</span>
            <span className="train-state">{t.state}</span>
          </div>
          <div className="train-item-detail">
            <span>→ {t.targetStop}</span>
            {t.cargoTotal > 0 ? (
              <span className="train-cargo">
                {t.cargoDetail.map((c) => (
                  <span key={c.resource} className="cargo-tag">
                    {c.resource}: {Math.floor(c.amount)}
                  </span>
                ))}
              </span>
            ) : (
              <span className="train-empty">Empty</span>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}
