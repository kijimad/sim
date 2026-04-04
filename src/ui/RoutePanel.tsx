import { Button, Space, Tag, Typography } from "antd";
import { CloseOutlined, SaveOutlined } from "@ant-design/icons";
import { RouteMode } from "../simulation.js";

const { Text } = Typography;

interface RoutePanelProps {
  readonly stops: readonly number[];
  readonly stopNames: readonly string[];
  readonly editingRouteId: number | null;
  readonly onConfirm: (mode: RouteMode) => void;
  readonly onCancel: () => void;
  readonly onRemoveStop: (index: number) => void;
}

export function RoutePanel({ stops, stopNames, editingRouteId, onConfirm, onCancel, onRemoveStop }: RoutePanelProps) {
  const isEditing = editingRouteId !== null;

  return (
    <div>
      <Text type="secondary" style={{ fontSize: 11 }}>
        {isEditing ? `Editing Route #${String(editingRouteId)}` : "Click stations to add stops"}
      </Text>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 4, margin: "8px 0", minHeight: 28 }}>
        {stops.length === 0
          ? <Text type="secondary" italic>No stops</Text>
          : stops.map((_id, i) => (
              <Tag
                key={`${String(_id)}-${String(i)}`}
                closable
                onClose={() => { onRemoveStop(i); }}
              >
                {stopNames[i] ?? `#${String(_id)}`}
              </Tag>
            ))}
      </div>
      <Space>
        {isEditing ? (
          <Button size="small" type="primary" icon={<SaveOutlined />}
            disabled={stops.length < 2}
            onClick={() => { onConfirm(RouteMode.Shuttle); }}
          >
            Save
          </Button>
        ) : (
          <>
            <Button size="small" type="primary"
              disabled={stops.length < 2}
              onClick={() => { onConfirm(RouteMode.Shuttle); }}
            >
              Shuttle
            </Button>
            <Button size="small"
              disabled={stops.length < 2}
              onClick={() => { onConfirm(RouteMode.Loop); }}
            >
              Loop
            </Button>
          </>
        )}
        <Button size="small" icon={<CloseOutlined />} onClick={onCancel}>Cancel</Button>
      </Space>
    </div>
  );
}
