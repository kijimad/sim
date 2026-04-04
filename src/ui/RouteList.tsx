import { Button, Descriptions, Divider, Select, Space, Tag, Typography } from "antd";
import { DeleteOutlined, EditOutlined, PlusOutlined, MinusOutlined } from "@ant-design/icons";
import type { Game, RouteInfo } from "../game.js";
import type { ConsistPresetInfo } from "../game-world.js";
import { VEHICLE_CATALOG, getVehicleType } from "../vehicle.js";
import { FloatingWindow } from "./FloatingWindow.js";

const { Text } = Typography;

interface RouteListProps {
  readonly routes: readonly RouteInfo[];
  readonly openRouteIds: readonly number[];
  readonly consistPresets: readonly ConsistPresetInfo[];
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

function RouteDetailWindow({ route, consistPresets, game, index }: {
  route: RouteInfo;
  consistPresets: readonly ConsistPresetInfo[];
  game: Game;
  index: number;
}) {
  const stats = route.consistStats;

  return (
    <FloatingWindow
      title={route.name}
      onClose={() => { game.closeRouteDetail(route.id); }}
      defaultX={350 + index * 30}
      defaultY={100 + index * 30}
      width={320}
    >
      <Descriptions column={1} size="small" colon={false}>
        <Descriptions.Item label="Mode">{route.mode}</Descriptions.Item>
        <Descriptions.Item label="Stops">
          {route.stopNames.join(" → ")}
        </Descriptions.Item>
        <Descriptions.Item label="Trains">{route.trainCount}</Descriptions.Item>
      </Descriptions>

      <Divider style={{ margin: "8px 0" }} />
      <Text type="secondary" style={{ fontSize: 11 }}>車両構成</Text>

      <div style={{ display: "flex", flexWrap: "wrap", gap: 2, margin: "4px 0" }}>
        {route.cars.length === 0
          ? <Text type="secondary" italic style={{ fontSize: 11 }}>車両なし（デフォルト）</Text>
          : route.cars.map((carId, i) => (
              <CarTag key={`${carId}-${String(i)}`} carId={carId}
                onRemove={() => { game.world.removeCarFromRoute(route.id, i); }}
              />
            ))}
      </div>

      <div style={{ display: "flex", flexWrap: "wrap", gap: 4, margin: "4px 0" }}>
        {VEHICLE_CATALOG.map((vt) => (
          <Button key={vt.id} size="small" icon={<PlusOutlined />}
            onClick={() => { game.world.addCarToRoute(route.id, vt.id); }}
          >
            {vt.name}
          </Button>
        ))}
      </div>

      {consistPresets.length > 0 && (
        <div style={{ margin: "4px 0" }}>
          <Select
            size="small"
            style={{ width: "100%" }}
            placeholder="プリセットから適用"
            onChange={(value: number) => {
              game.world.applyPresetToRoute(route.id, value);
            }}
            options={consistPresets.map((p) => ({
              value: p.id,
              label: p.name,
            }))}
          />
        </div>
      )}

      {stats !== null && (
        <Descriptions column={2} size="small" colon={false} style={{ marginTop: 4 }}>
          <Descriptions.Item label="速度">{stats.effectiveSpeed.toFixed(1)}</Descriptions.Item>
          <Descriptions.Item label="容量">{stats.totalCapacity}</Descriptions.Item>
          <Descriptions.Item label="購入費">${stats.purchaseCost}</Descriptions.Item>
          <Descriptions.Item label="運行費">${stats.runningCost}/s</Descriptions.Item>
          {!stats.hasPower && (
            <Descriptions.Item label=""><Text type="danger">動力車なし</Text></Descriptions.Item>
          )}
        </Descriptions>
      )}

      <Divider style={{ margin: "8px 0" }} />
      <Space wrap>
        <Button size="small" icon={<PlusOutlined />}
          onClick={() => { game.addTrain(route.id); }}
        >
          増発{stats !== null ? ` ($${String(stats.purchaseCost)})` : ""}
        </Button>
        <Button size="small" icon={<MinusOutlined />}
          disabled={route.trainCount === 0}
          onClick={() => { game.removeTrainFromRoute(route.id); }}
        >
          減車
        </Button>
        <Button size="small" icon={<EditOutlined />}
          onClick={() => { game.editRoute(route.id); }}
        >
          経路編集
        </Button>
        <Button size="small" danger icon={<DeleteOutlined />}
          onClick={() => { game.removeRoute(route.id); game.closeRouteDetail(route.id); }}
        >
          削除
        </Button>
      </Space>
    </FloatingWindow>
  );
}

export function RouteList({ routes, openRouteIds, game }: Omit<RouteListProps, "consistPresets">) {
  if (routes.length === 0) {
    return <div style={{ color: "#888", fontSize: 12 }}>No routes. Use Route tool (2) to create one.</div>;
  }

  return (
    <div className="route-list">
      {routes.map((r) => {
        const isOpen = openRouteIds.includes(r.id);
        return (
          <div
            key={r.id}
            className={`route-item${isOpen ? " selected" : ""}`}
            onClick={() => { game.toggleRouteDetail(r.id); }}
          >
            <div className="route-item-header">
              <Text strong style={{ fontSize: 12 }}>{r.name}</Text>
              <Text type="secondary" style={{ fontSize: 10 }}>{r.trainCount} trains</Text>
            </div>
          </div>
        );
      })}
    </div>
  );
}

export function RouteDetailWindows({ routes, openRouteIds, consistPresets, game }: RouteListProps) {
  const openRoutes = openRouteIds
    .map((id) => routes.find((r) => r.id === id))
    .filter((r): r is RouteInfo => r !== undefined);

  if (openRoutes.length === 0) return null;

  return (
    <>
      {openRoutes.map((r, i) => (
        <RouteDetailWindow key={r.id} route={r} consistPresets={consistPresets} game={game} index={i} />
      ))}
    </>
  );
}
