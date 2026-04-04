import { Button, Descriptions, Divider, Input, Typography } from "antd";
import { DeleteOutlined } from "@ant-design/icons";
import { useState } from "react";
import type { Game } from "../game.js";
import type { InspectInfo } from "../game-world.js";
import { FloatingWindow } from "./FloatingWindow.js";

const { Text } = Typography;

interface InspectDetailProps {
  readonly openInspectTiles: readonly { x: number; y: number }[];
  readonly game: Game;
}

function windowTitle(info: InspectInfo): string {
  if (info.type === "node") return info.nodeName ?? "Station";
  if (info.type === "city") return info.cityName ?? "City";
  if (info.type === "edge") return `Edge #${String(info.edgeId ?? "?")}`;
  if (info.buildingType !== undefined) return info.buildingType;
  return `Tile (${String(info.tileX)}, ${String(info.tileY)})`;
}

function NodeSection({ info, game }: { info: InspectInfo; game: Game }) {
  const [editingName, setEditingName] = useState(false);
  const [draft, setDraft] = useState("");
  const nodeId = info.nodeId ?? 0;

  return (
    <>
      <Descriptions column={1} size="small" colon={false}>
        <Descriptions.Item label="Kind">{info.nodeKind} (#{info.nodeId})</Descriptions.Item>
        <Descriptions.Item label="Name">
          {editingName ? (
            <Input
              size="small"
              value={draft}
              autoFocus
              onChange={(e) => { setDraft(e.target.value); }}
              onBlur={() => { game.renameNode(nodeId, draft); setEditingName(false); }}
              onKeyDown={(e) => {
                if (e.key === "Enter") { game.renameNode(nodeId, draft); setEditingName(false); }
                if (e.key === "Escape") { setEditingName(false); }
              }}
              style={{ width: 120 }}
            />
          ) : (
            <Button size="small" type="text"
              onClick={() => { setDraft(info.nodeName ?? ""); setEditingName(true); }}
            >
              {info.nodeName} ✎
            </Button>
          )}
        </Descriptions.Item>
        <Descriptions.Item label="Capacity">
          <Button size="small" disabled={(info.nodeCapacity ?? 1) <= 1}
            onClick={() => { game.setNodeCapacity(nodeId, (info.nodeCapacity ?? 1) - 1); }}
          >-</Button>
          <Text style={{ margin: "0 6px" }}>{info.nodeTrains} / {info.nodeCapacity}</Text>
          <Button size="small"
            onClick={() => { game.setNodeCapacity(nodeId, (info.nodeCapacity ?? 1) + 1); }}
          >+</Button>
        </Descriptions.Item>
        {(info.nodeTrainsWaiting ?? 0) > 0 && (
          <Descriptions.Item label="Queue">{info.nodeTrainsWaiting} waiting</Descriptions.Item>
        )}
      </Descriptions>

      {info.waitingDetail !== undefined && info.waitingDetail.length > 0 && (
        <>
          <Divider style={{ margin: "8px 0" }} />
          <Text type="secondary" style={{ fontSize: 11 }}>待機貨物 ({Math.floor(info.nodeWaiting ?? 0)})</Text>
          <Descriptions column={1} size="small" colon={false}>
            {info.waitingDetail.map((w) => (
              <Descriptions.Item key={`${w.resource}-${w.destination}`} label={`${w.resource}→${w.destination}`}>
                {Math.floor(w.amount)}
              </Descriptions.Item>
            ))}
          </Descriptions>
        </>
      )}

      <Divider style={{ margin: "8px 0" }} />
      <Button danger size="small" icon={<DeleteOutlined />}
        onClick={() => {
          const err = game.world.removeNode(nodeId);
          if (err !== null) {
            game.world.showToast(err);
          } else {
            game.closeInspectDetail(info.tileX ?? 0, info.tileY ?? 0);
          }
        }}
      >
        Remove Station
      </Button>
    </>
  );
}

function EdgeSection({ info, game }: { info: InspectInfo; game: Game }) {
  return (
    <Descriptions column={1} size="small" colon={false}>
      <Descriptions.Item label="Edge">#{info.edgeId}</Descriptions.Item>
      <Descriptions.Item label="From">{info.edgeFrom}</Descriptions.Item>
      <Descriptions.Item label="To">{info.edgeTo}</Descriptions.Item>
      <Descriptions.Item label="Length">{info.edgeLength} tiles</Descriptions.Item>
      <Descriptions.Item label="">
        <Button danger size="small" icon={<DeleteOutlined />}
          onClick={() => { game.removeEdge(info.edgeId ?? 0); }}
        >
          Remove Edge
        </Button>
      </Descriptions.Item>
    </Descriptions>
  );
}

function CitySection({ info }: { info: InspectInfo }) {
  return (
    <Descriptions column={1} size="small" colon={false}>
      <Descriptions.Item label="City">{info.cityName}</Descriptions.Item>
      <Descriptions.Item label="Population">{info.cityPopulation}</Descriptions.Item>
      {info.cityProduces !== undefined && info.cityProduces.length > 0 && (
        <Descriptions.Item label="Supply">{info.cityProduces.join(", ")}</Descriptions.Item>
      )}
      {info.cityConsumes !== undefined && info.cityConsumes.length > 0 && (
        <Descriptions.Item label="Demand">{info.cityConsumes.join(", ")}</Descriptions.Item>
      )}
    </Descriptions>
  );
}

function BuildingSection({ info }: { info: InspectInfo }) {
  return (
    <Descriptions column={1} size="small" colon={false}>
      <Descriptions.Item label="Building">{info.buildingType}</Descriptions.Item>
      <Descriptions.Item label="Pop/Workers">{info.buildingPop}</Descriptions.Item>
      {info.buildingProduces !== undefined && (
        <Descriptions.Item label="Produces">{info.buildingProduces}</Descriptions.Item>
      )}
      {info.buildingConsumes !== undefined && (
        <Descriptions.Item label="Consumes">{info.buildingConsumes}</Descriptions.Item>
      )}
    </Descriptions>
  );
}

function TerrainSection({ info }: { info: InspectInfo }) {
  return (
    <Descriptions column={1} size="small" colon={false}>
      <Descriptions.Item label="Tile">({info.tileX}, {info.tileY})</Descriptions.Item>
      <Descriptions.Item label="Terrain">{info.terrain}</Descriptions.Item>
    </Descriptions>
  );
}

function InspectWindow({ tx, ty, game, index }: { tx: number; ty: number; game: Game; index: number }) {
  const info = game.world.buildInspectInfoAt(tx, ty);
  if (info.type === "none") return null;

  return (
    <FloatingWindow
      title={windowTitle(info)}
      onClose={() => { game.closeInspectDetail(tx, ty); }}
      defaultX={400 + index * 30}
      defaultY={80 + index * 30}
      width={280}
    >
      {info.type === "node" && <NodeSection info={info} game={game} />}
      {info.type === "edge" && <EdgeSection info={info} game={game} />}
      {info.type === "city" && <CitySection info={info} />}
      {info.buildingType !== undefined && info.type === "terrain" && <BuildingSection info={info} />}
      {info.type === "terrain" && info.buildingType === undefined && <TerrainSection info={info} />}
    </FloatingWindow>
  );
}

export function InspectDetailWindows({ openInspectTiles, game }: InspectDetailProps) {
  if (openInspectTiles.length === 0) return null;

  return (
    <>
      {openInspectTiles.map((tile, i) => (
        <InspectWindow key={`${String(tile.x)},${String(tile.y)}`} tx={tile.x} ty={tile.y} game={game} index={i} />
      ))}
    </>
  );
}
