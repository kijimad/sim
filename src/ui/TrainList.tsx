import { Badge, Button, Descriptions, Space, Tag, Typography } from "antd";
import { DeleteOutlined, TrademarkOutlined } from "@ant-design/icons";
import type { Game, TrainInfo } from "../game.js";
import { getVehicleType } from "../vehicle.js";
import { FloatingWindow } from "./FloatingWindow.js";

const { Text } = Typography;

interface TrainListProps {
  readonly trains: readonly TrainInfo[];
  readonly openTrainIds: readonly number[];
  readonly game: Game;
}

function CarTag({ carId }: { carId: string }) {
  const vt = getVehicleType(carId);
  if (vt === undefined) return <Tag>?</Tag>;
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
      width={280}
    >
      <Descriptions column={1} size="small" colon={false}>
        <Descriptions.Item label="Route">{train.routeName}</Descriptions.Item>
        <Descriptions.Item label="State">
          <Badge status={train.state === "On Edge" ? "processing" : "default"} text={train.state} />
        </Descriptions.Item>
        <Descriptions.Item label="Next">→ {train.targetStop}</Descriptions.Item>
        <Descriptions.Item label="Speed">{train.speed.toFixed(1)} tiles/s</Descriptions.Item>
        {train.cars.length > 0 && (
          <Descriptions.Item label="Cars">
            <Space size={2} wrap>
              {train.cars.map((carId, i) => (
                <CarTag key={`${carId}-${String(i)}`} carId={carId} />
              ))}
            </Space>
          </Descriptions.Item>
        )}
        <Descriptions.Item label="Cargo">{capacityLabel}</Descriptions.Item>
        {train.cargoDetail.map((c) => (
          <Descriptions.Item key={c.resource} label={`  ${c.resource}`}>
            {Math.floor(c.amount)}
          </Descriptions.Item>
        ))}
      </Descriptions>
      <div style={{ marginTop: 8 }}>
        <Button danger size="small" icon={<DeleteOutlined />}
          onClick={() => { game.world.sim.removeTrain(train.id); game.closeTrainDetail(train.id); }}
        >
          Remove
        </Button>
      </div>
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
              {Number.isFinite(t.cargoCapacity) ? (
                <Text type="warning" style={{ fontSize: 10 }}>
                  {Math.floor(t.cargoTotal)}/{t.cargoCapacity}
                </Text>
              ) : t.cargoTotal > 0 ? (
                <Text type="warning" style={{ fontSize: 10 }}>{Math.floor(t.cargoTotal)}</Text>
              ) : (
                <Text type="secondary" italic style={{ fontSize: 10 }}>Empty</Text>
              )}
            </div>
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
