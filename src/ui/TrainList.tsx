import { Badge, Button, Descriptions, Divider, Progress, Tag, Typography } from "antd";
import { DeleteOutlined, PlusOutlined, TrademarkOutlined } from "@ant-design/icons";
import type { Game, TrainInfo } from "../game.js";
import { VEHICLE_CATALOG, getVehicleType } from "../vehicle.js";
import { FloatingWindow } from "./FloatingWindow.js";

const { Text } = Typography;

interface TrainListProps {
  readonly trains: readonly TrainInfo[];
  readonly openTrainIds: readonly number[];
  readonly game: Game;
}

function CarTag({ carId, onRemove }: { carId: string; onRemove?: () => void }) {
  const vt = getVehicleType(carId);
  if (vt === undefined) return <Tag>?</Tag>;
  if (onRemove !== undefined) {
    return <Tag color={vt.power > 0 ? "red" : "blue"} closable onClose={onRemove}>{vt.name}</Tag>;
  }
  return <Tag color={vt.power > 0 ? "red" : "blue"}>{vt.name}</Tag>;
}

function TrainDetailWindow({ train, game, index }: { train: TrainInfo; game: Game; index: number }) {
  const capacityLabel = Number.isFinite(train.cargoCapacity)
    ? `${Math.floor(train.cargoTotal)} / ${String(train.cargoCapacity)}`
    : String(Math.floor(train.cargoTotal));

  return (
    <FloatingWindow
      title={<><TrademarkOutlined /> Train #{train.id}</>}
      onClose={() => { game.closeTrainDetail(train.id); }}
      defaultX={200 + index * 30}
      defaultY={100 + index * 30}
      width={320}
    >
      <Descriptions column={1} size="small" colon={false}>
        <Descriptions.Item label="Route">{train.routeName}</Descriptions.Item>
        <Descriptions.Item label="State">
          <Badge status={train.state === "On Edge" ? "processing" : "default"} text={train.state} />
        </Descriptions.Item>
        <Descriptions.Item label="Next">→ {train.targetStop}</Descriptions.Item>
        <Descriptions.Item label="Speed">{train.speed.toFixed(1)} tiles/s</Descriptions.Item>
        <Descriptions.Item label="Cargo">{capacityLabel}</Descriptions.Item>
        {train.cargoDetail.map((c) => (
          <Descriptions.Item key={c.resource} label={`  ${c.resource}`}>
            {Math.floor(c.amount)}
          </Descriptions.Item>
        ))}
      </Descriptions>

      <Divider style={{ margin: "8px 0" }} />
      <Text type="secondary" style={{ fontSize: 11 }}>車両構成</Text>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 2, margin: "4px 0" }}>
        {train.cars.length === 0
          ? <Text type="secondary" italic style={{ fontSize: 11 }}>車両なし（デフォルト）</Text>
          : train.cars.map((carId, i) => (
              <CarTag key={`${carId}-${String(i)}`} carId={carId}
                onRemove={() => {
                  const err = game.world.removeCarFromTrain(train.id, i);
                  if (err !== null) { game.world.showToast(err); }
                }}
              />
            ))}
      </div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 4, margin: "4px 0" }}>
        {VEHICLE_CATALOG.map((vt) => (
          <Button key={vt.id} size="small" icon={<PlusOutlined />}
            onClick={() => {
              const err = game.world.addCarToTrain(train.id, vt.id);
              if (err !== null) { game.world.showToast(err); }
            }}
          >
            {vt.name}
          </Button>
        ))}
      </div>

      <Divider style={{ margin: "8px 0" }} />
      <Button danger size="small" icon={<DeleteOutlined />}
        onClick={() => { game.world.sim.removeTrain(train.id); game.closeTrainDetail(train.id); }}
      >
        Remove Train
      </Button>
    </FloatingWindow>
  );
}

/** サイドパネル内の列車一覧 */
export function TrainList({ trains, openTrainIds, game }: TrainListProps) {
  if (trains.length === 0) return null;

  return (
    <div className="train-list">
      {trains.map((t) => {
        const isOpen = openTrainIds.includes(t.id);
        return (
          <div
            key={t.id}
            className={`train-item${isOpen ? " train-selected" : ""}`}
            onClick={() => { game.toggleTrainDetail(t.id); }}
          >
            <div className="train-item-header">
              <span>#{t.id}</span>
              <Text type="secondary" style={{ fontSize: 11 }}>{t.state}</Text>
            </div>
            <div className="train-item-detail">
              <span>→ {t.targetStop}</span>
            </div>
            {Number.isFinite(t.cargoCapacity) && t.cargoCapacity > 0 ? (
              <Progress
                percent={Math.round(t.cargoTotal / t.cargoCapacity * 100)}
                size="small"
                format={() => `${Math.floor(t.cargoTotal)}/${String(t.cargoCapacity)}`}
                strokeColor={t.cargoTotal / t.cargoCapacity > 0.8 ? "#d4380d" : "#d08020"}
              />
            ) : t.cargoTotal > 0 ? (
              <Text type="warning" style={{ fontSize: 10 }}>{Math.floor(t.cargoTotal)}</Text>
            ) : null}
          </div>
        );
      })}
    </div>
  );
}

/** フローティング詳細ウィンドウ群 */
export function TrainDetailWindows({ trains, openTrainIds, game }: TrainListProps) {
  const openTrains = openTrainIds
    .map((id) => trains.find((t) => t.id === id))
    .filter((t): t is TrainInfo => t !== undefined);

  if (openTrains.length === 0) return null;

  return (
    <>
      {openTrains.map((t, i) => (
        <TrainDetailWindow key={t.id} train={t} game={game} index={i} />
      ))}
    </>
  );
}
