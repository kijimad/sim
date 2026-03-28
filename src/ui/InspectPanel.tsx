import { useState } from "react";
import type { Game, InspectInfo } from "../game.js";

interface InspectPanelProps {
  readonly info: InspectInfo;
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
          onClick={() => { setEditing(true); setDraft(value); }}
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
      onChange={(e) => { setDraft(e.target.value); }}
      onBlur={() => { onSave(draft); setEditing(false); }}
      onKeyDown={(e) => {
        if (e.key === "Enter") { onSave(draft); setEditing(false); }
        if (e.key === "Escape") { setEditing(false); }
      }}
    />
  );
}

function EdgeInfo({ info, game }: { info: InspectInfo; game: Game }) {
  const edgeId = info.edgeId;
  if (edgeId === undefined) return null;
  return (
    <>
      <div className="inspect-divider" />
      <div className="inspect-row">
        <span className="inspect-label">Edge</span>
        <span>#{edgeId}</span>
      </div>
      <div className="inspect-row">
        <span className="inspect-label">From</span>
        <span>{info.edgeFrom}</span>
      </div>
      <div className="inspect-row">
        <span className="inspect-label">To</span>
        <span>{info.edgeTo}</span>
      </div>
      <div className="inspect-row">
        <span className="inspect-label">Length</span>
        <span>{info.edgeLength} tiles</span>
      </div>
      <div className="inspect-row">
        <span className="inspect-label">Tracks</span>
        <span className="capacity-control">
          <button
            className="cap-btn"
            disabled={(info.edgeCapacity ?? 1) <= 1}
            onClick={() => { game.setEdgeCapacity(edgeId, (info.edgeCapacity ?? 1) - 1); }}
          >
            -
          </button>
          <span>{info.edgeCapacity ?? 1}</span>
          <button
            className="cap-btn"
            onClick={() => { game.setEdgeCapacity(edgeId, (info.edgeCapacity ?? 1) + 1); }}
          >
            +
          </button>
        </span>
      </div>
      <button
        className="danger-btn"
        onClick={() => { game.removeEdge(edgeId); }}
      >
        Remove Edge
      </button>
    </>
  );
}

export function InspectPanel({ info, game }: InspectPanelProps) {
  if (info.type === "none") {
    return (
      <div className="inspect-panel">
        <div className="panel-header">Inspect</div>
        <div className="inspect-hint">Click on the map to inspect</div>
      </div>
    );
  }

  return (
    <div className="inspect-panel">
      <div className="panel-header">Inspect</div>
      <div className="inspect-content">
        {info.tileX !== undefined && info.tileY !== undefined && (
          <div className="inspect-row">
            <span className="inspect-label">Tile</span>
            <span>({info.tileX}, {info.tileY})</span>
          </div>
        )}
        {info.terrain !== undefined && (
          <div className="inspect-row">
            <span className="inspect-label">Terrain</span>
            <span>{info.terrain}</span>
          </div>
        )}

        {info.buildingType !== undefined && (
          <>
            <div className="inspect-divider" />
            <div className="inspect-row">
              <span className="inspect-label">Building</span>
              <span>{info.buildingType}</span>
            </div>
            <div className="inspect-row">
              <span className="inspect-label">Pop/Workers</span>
              <span>{info.buildingPop}</span>
            </div>
            {info.buildingProduces !== undefined && (
              <div className="inspect-row">
                <span className="inspect-label">Produces</span>
                <span className="tag supply">{info.buildingProduces}</span>
              </div>
            )}
            {info.buildingConsumes !== undefined && (
              <div className="inspect-row">
                <span className="inspect-label">Consumes</span>
                <span className="tag demand">{info.buildingConsumes}</span>
              </div>
            )}
          </>
        )}

        {info.type === "node" && (
          <>
            <div className="inspect-divider" />
            <div className="inspect-row">
              <span className="inspect-label">Node</span>
              <span>{info.nodeKind} (#{info.nodeId})</span>
            </div>
            <div className="inspect-row">
              <span className="inspect-label">Name</span>
              <EditableName value={info.nodeName ?? ""} onSave={(v) => { game.renameNode(info.nodeId ?? 0, v); }} />
            </div>
            <div className="inspect-row">
              <span className="inspect-label">Capacity</span>
              <span className="capacity-control">
                <button
                  className="cap-btn"
                  disabled={(info.nodeCapacity ?? 1) <= 1}
                  onClick={() => { game.setNodeCapacity(info.nodeId ?? 0, (info.nodeCapacity ?? 1) - 1); }}
                >
                  -
                </button>
                <span>{info.nodeTrains} / {info.nodeCapacity}</span>
                <button
                  className="cap-btn"
                  onClick={() => { game.setNodeCapacity(info.nodeId ?? 0, (info.nodeCapacity ?? 1) + 1); }}
                >
                  +
                </button>
              </span>
            </div>
            {info.nodeLayout !== undefined && (
              <div className="inspect-row">
                <span className="inspect-label">Layout</span>
                <span>{info.nodeLayout}</span>
              </div>
            )}
            {info.waitingDetail !== undefined && info.waitingDetail.length > 0 && (
              <>
                <div className="inspect-row">
                  <span className="inspect-label">Waiting</span>
                  <span>{Math.floor(info.nodeWaiting ?? 0)}</span>
                </div>
                {info.waitingDetail.map((w) => (
                  <div className="inspect-row indent" key={w.resource}>
                    <span className="inspect-label">{w.resource}</span>
                    <span>{Math.floor(w.amount)}</span>
                  </div>
                ))}
              </>
            )}
            {info.nodeId !== undefined && (
              <button
                className="danger-btn"
                onClick={() => { game.removeNode(info.nodeId ?? 0); }}
              >
                Remove {info.nodeKind}
              </button>
            )}
          </>
        )}

        {info.type === "city" && (
          <>
            <div className="inspect-divider" />
            <div className="inspect-row">
              <span className="inspect-label">City</span>
              <span>{info.cityName}</span>
            </div>
            <div className="inspect-row">
              <span className="inspect-label">Population</span>
              <span>{info.cityPopulation}</span>
            </div>
            {info.cityProduces !== undefined && info.cityProduces.length > 0 && (
              <div className="inspect-row">
                <span className="inspect-label">Supply</span>
                <span className="tag-list">
                  {info.cityProduces.map((r) => (
                    <span key={r} className="tag supply">{r}</span>
                  ))}
                </span>
              </div>
            )}
            {info.cityConsumes !== undefined && info.cityConsumes.length > 0 && (
              <div className="inspect-row">
                <span className="inspect-label">Demand</span>
                <span className="tag-list">
                  {info.cityConsumes.map((r) => (
                    <span key={r} className="tag demand">{r}</span>
                  ))}
                </span>
              </div>
            )}
          </>
        )}

        {info.type === "edge" && info.edgeId !== undefined && (
          <EdgeInfo info={info} game={game} />
        )}
      </div>
    </div>
  );
}
