import { Button, Input, Space, Tag, Typography, Divider, Descriptions } from "antd";
import { PlusOutlined, DeleteOutlined, SaveOutlined } from "@ant-design/icons";
import { useState } from "react";
import type { Game } from "../game.js";
import type { ConsistPresetInfo } from "../game-world.js";
import { VEHICLE_CATALOG, getVehicleType, calcConsistStats } from "../vehicle.js";

const { Text } = Typography;

interface ConsistEditorProps {
  readonly presets: readonly ConsistPresetInfo[];
  readonly game: Game;
}

function CarTag({ carId, onRemove }: { carId: string; onRemove?: () => void }) {
  const vt = getVehicleType(carId);
  if (vt === undefined) return <Tag>?</Tag>;
  if (onRemove !== undefined) {
    return (
      <Tag color={vt.power > 0 ? "red" : "blue"} closable onClose={onRemove}>
        {vt.name}
      </Tag>
    );
  }
  return (
    <Tag color={vt.power > 0 ? "red" : "blue"}>
      {vt.name}
    </Tag>
  );
}

function PresetEditor({ preset, game, onClose }: {
  preset: { id: number; name: string; cars: readonly string[] } | null;
  game: Game;
  onClose: () => void;
}) {
  const [name, setName] = useState(preset?.name ?? "");
  const [cars, setCars] = useState([...(preset?.cars ?? [])]);

  const stats = calcConsistStats(cars);

  const addCar = (carId: string): void => {
    setCars([...cars, carId]);
  };

  const removeCar = (index: number): void => {
    setCars(cars.filter((_, i) => i !== index));
  };

  const save = (): void => {
    if (name.trim() === "" || cars.length === 0) return;
    if (preset !== null) {
      game.world.updateConsistPreset(preset.id, name, cars);
    } else {
      game.world.addConsistPreset(name, cars);
    }
    onClose();
  };

  return (
    <div>
      <Input
        size="small"
        placeholder="編成名"
        value={name}
        onChange={(e) => { setName(e.target.value); }}
        style={{ marginBottom: 8 }}
      />

      <Text type="secondary" style={{ fontSize: 11 }}>車両カタログ</Text>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 4, margin: "4px 0 8px" }}>
        {VEHICLE_CATALOG.map((vt) => (
          <Button key={vt.id} size="small" icon={<PlusOutlined />}
            onClick={() => { addCar(vt.id); }}
          >
            {vt.name}
          </Button>
        ))}
      </div>

      <Text type="secondary" style={{ fontSize: 11 }}>編成</Text>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 2, margin: "4px 0 8px", minHeight: 28 }}>
        {cars.length === 0
          ? <Text type="secondary" italic>車両を追加してください</Text>
          : cars.map((carId, i) => (
              <CarTag key={`${carId}-${String(i)}`} carId={carId} onRemove={() => { removeCar(i); }} />
            ))}
      </div>

      {stats !== null && (
        <Descriptions column={2} size="small" colon={false} style={{ marginBottom: 8 }}>
          <Descriptions.Item label="速度">{stats.effectiveSpeed.toFixed(1)}</Descriptions.Item>
          <Descriptions.Item label="出力">{stats.totalPower} kW</Descriptions.Item>
          <Descriptions.Item label="容量">{stats.totalCapacity}</Descriptions.Item>
          <Descriptions.Item label="重量">{stats.totalWeight} t</Descriptions.Item>
          <Descriptions.Item label="購入費">${stats.purchaseCost}</Descriptions.Item>
          <Descriptions.Item label="運行費">${stats.runningCost}/s</Descriptions.Item>
          {!stats.hasPower && (
            <Descriptions.Item label=""><Text type="danger">動力車がありません</Text></Descriptions.Item>
          )}
        </Descriptions>
      )}

      <Space>
        <Button type="primary" size="small" icon={<SaveOutlined />}
          disabled={name.trim() === "" || cars.length === 0 || stats?.hasPower !== true}
          onClick={save}
        >
          {preset !== null ? "更新" : "作成"}
        </Button>
        <Button size="small" onClick={onClose}>キャンセル</Button>
      </Space>
    </div>
  );
}

export function ConsistEditor({ presets, game }: ConsistEditorProps) {
  const [editingId, setEditingId] = useState<number | "new" | null>(null);

  return (
    <div>
      {presets.map((p) => (
        <div key={p.id} style={{ marginBottom: 8 }}>
          {editingId === p.id ? (
            <PresetEditor
              preset={p}
              game={game}
              onClose={() => { setEditingId(null); }}
            />
          ) : (
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <div>
                <Text strong>{p.name}</Text>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 2, marginTop: 2 }}>
                  {p.cars.map((carId, i) => (
                    <CarTag key={`${carId}-${String(i)}`} carId={carId} />
                  ))}
                </div>
                {p.stats !== null && (
                  <Text type="secondary" style={{ fontSize: 10 }}>
                    速度{p.stats.effectiveSpeed.toFixed(1)} 容量{p.stats.totalCapacity} ${p.stats.purchaseCost}
                  </Text>
                )}
              </div>
              <Space size={4}>
                <Button size="small" onClick={() => { setEditingId(p.id); }}>編集</Button>
                <Button size="small" danger icon={<DeleteOutlined />}
                  onClick={() => { game.world.removeConsistPreset(p.id); }}
                />
              </Space>
            </div>
          )}
          <Divider style={{ margin: "8px 0" }} />
        </div>
      ))}

      {editingId === "new" ? (
        <PresetEditor
          preset={null}
          game={game}
          onClose={() => { setEditingId(null); }}
        />
      ) : (
        <Button size="small" icon={<PlusOutlined />}
          onClick={() => { setEditingId("new"); }}
        >
          新規プリセット
        </Button>
      )}
    </div>
  );
}
