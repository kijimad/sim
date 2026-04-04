import { useSyncExternalStore, useState, useCallback, useEffect, useRef } from "react";
import { Button, ConfigProvider, message, Segmented, Space, Statistic, Tag, theme, Typography } from "antd";
import {
  SearchOutlined, ToolOutlined,
  UnorderedListOutlined, CarOutlined, AppstoreOutlined,
  DollarOutlined, TeamOutlined, BankOutlined,
} from "@ant-design/icons";
import type { Game, GameSnapshot } from "../game.js";
import { ToolMode } from "../game.js";
import { RouteDetailWindows, RouteList } from "./RouteList.js";
import { RoutePanel } from "./RoutePanel.js";
import { FloatingWindow } from "./FloatingWindow.js";
import { TrainDetailWindows, TrainList } from "./TrainList.js";
import { ConsistEditor } from "./ConsistEditor.js";
import { InspectDetailWindows } from "./StationDetail.js";

const { Text } = Typography;

interface GameUIProps {
  readonly game: Game;
}

const toolOptions = [
  { value: ToolMode.Inspect, label: "Inspect", icon: <SearchOutlined /> },
  { value: ToolMode.Station, label: "Station", icon: <ToolOutlined /> },
  { value: ToolMode.Rail, label: "Rail", icon: <ToolOutlined /> },
];

export function GameUI({ game }: GameUIProps) {
  const snap = useSyncExternalStore<GameSnapshot>(
    (cb) => game.onChange(cb),
    () => game.getSnapshot(),
  );

  const [showRoutes, setShowRoutes] = useState(false);
  const [showTrains, setShowTrains] = useState(false);
  const [showRouteEditor, setShowRouteEditor] = useState(false);
  const [showConsists, setShowConsists] = useState(false);
  const [messageApi, contextHolder] = message.useMessage();

  // トースト表示（useEffect でレンダリング後に実行する）
  const prevToastCount = useRef(0);
  useEffect(() => {
    if (snap.toasts.length > prevToastCount.current) {
      const latest = snap.toasts[snap.toasts.length - 1];
      if (latest !== undefined) {
        void messageApi.info({ content: latest.message, duration: 2, key: `toast-${String(latest.id)}` });
      }
    }
    prevToastCount.current = snap.toasts.length;
  }, [snap.toasts, messageApi]);

  const setTool = useCallback((mode: ToolMode) => {
    game.setToolMode(mode);
    if (mode === ToolMode.Route) {
      setShowRouteEditor(true);
    }
  }, [game]);

  return (
    <ConfigProvider theme={{ algorithm: theme.darkAlgorithm }}>
      {contextHolder}
      <div className="game-ui">
        <div className="top-bar">
          <Space size="middle">
            <div className="toolbar-group">
              <Text type="secondary" style={{ fontSize: 10 }}><ToolOutlined /> Tools</Text>
              <Segmented
                size="small"
                value={snap.toolMode}
                options={toolOptions}
                onChange={(v) => { setTool(v); }}
              />
            </div>
            <div className="toolbar-group">
              <Text type="secondary" style={{ fontSize: 10 }}><AppstoreOutlined /> Windows</Text>
              <Space size={4}>
                <Button size="small" type={showRoutes ? "primary" : "default"} icon={<UnorderedListOutlined />}
                  onClick={() => { setShowRoutes((v) => !v); }}>Routes</Button>
                <Button size="small" type={showTrains ? "primary" : "default"} icon={<CarOutlined />}
                  onClick={() => { setShowTrains((v) => !v); }}>Trains</Button>
                <Button size="small" type={showConsists ? "primary" : "default"} icon={<AppstoreOutlined />}
                  onClick={() => { setShowConsists((v) => !v); }}>Consists</Button>
              </Space>
            </div>
            <Space size="large">
              <Statistic
                title={<Text type="secondary" style={{ fontSize: 10 }}><DollarOutlined /> Money</Text>}
                value={Math.floor(snap.money)}
                prefix="$"
                styles={{ content: { fontSize: 16, color: "#fff" } }}
              />
              <Statistic
                title={<Text type="secondary" style={{ fontSize: 10 }}><TeamOutlined /> Pop</Text>}
                value={snap.totalPopulation}
                styles={{ content: { fontSize: 16, color: "#fff" } }}
              />
              <Statistic
                title={<Text type="secondary" style={{ fontSize: 10 }}><BankOutlined /> Cities</Text>}
                value={snap.cities.length}
                styles={{ content: { fontSize: 16, color: "#fff" } }}
              />
              {snap.debug && <Tag color="orange">seed:{snap.seed}</Tag>}
            </Space>
          </Space>
        </div>

        {/* フローティングウィンドウ群 */}
        <div className="floating-layer">
          {showRoutes && (
            <FloatingWindow title={`Routes (${snap.routes.length})`} onClose={() => { setShowRoutes(false); }} defaultX={10} defaultY={200} width={220}>
              <RouteList routes={snap.routes} openRouteIds={snap.openRouteIds} game={game}
                onNewRoute={() => { setTool(ToolMode.Route); }} />
            </FloatingWindow>
          )}

          {showTrains && (
            <FloatingWindow title={`Trains (${snap.trainCount})`} onClose={() => { setShowTrains(false); }} defaultX={10} defaultY={350} width={280}>
              <TrainList trains={snap.trains} openTrainIds={snap.openTrainIds} game={game} />
            </FloatingWindow>
          )}

          {showConsists && (
            <FloatingWindow title="Consists" onClose={() => { setShowConsists(false); }} defaultX={300} defaultY={200} width={340}>
              <ConsistEditor presets={snap.consistPresets} game={game} />
            </FloatingWindow>
          )}

          {(showRouteEditor || snap.toolMode === ToolMode.Route) && snap.toolMode === ToolMode.Route && (
            <FloatingWindow title="Route Editor" onClose={() => { game.cancelRoute(); game.setToolMode(ToolMode.Inspect); setShowRouteEditor(false); }} defaultX={320} defaultY={60} width={300}>
              <RoutePanel
                stops={snap.routeStops}
                stopNames={snap.routeStopNames}
                editingRouteId={snap.editingRouteId}
                onConfirm={(mode) => { game.confirmRoute(mode); setShowRouteEditor(false); }}
                onCancel={() => { game.cancelRoute(); game.setToolMode(ToolMode.Inspect); setShowRouteEditor(false); }}
                onRemoveStop={(i) => { game.removeRouteStop(i); }}
              />
            </FloatingWindow>
          )}

          {snap.toolMode === ToolMode.Station && (
            <FloatingWindow title="Station" onClose={() => { game.setToolMode(ToolMode.Inspect); }} defaultX={320} defaultY={60} width={240}>
              <Text type="secondary" style={{ fontSize: 12 }}>
                Click empty tile to place a station
              </Text>
            </FloatingWindow>
          )}

          {snap.toolMode === ToolMode.Rail && (
            <FloatingWindow title="Rail" onClose={() => { game.setToolMode(ToolMode.Inspect); }} defaultX={320} defaultY={60} width={260}>
              <Text type="secondary" style={{ fontSize: 12 }}>
                {snap.selectedNodeId !== null
                  ? snap.railWaypointCount > 0
                    ? `${String(snap.railWaypointCount)} waypoint(s). Click station to connect, or empty tile for more`
                    : "Click station to connect, or empty tile for waypoint"
                  : "Click a station to start"}
              </Text>
              {snap.previewPathLength > 0 && (
                <div style={{ marginTop: 8, display: "flex", gap: 16 }}>
                  <Statistic title={<Text type="secondary" style={{ fontSize: 10 }}>Length</Text>}
                    value={snap.previewPathLength} suffix="tiles"
                    styles={{ content: { fontSize: 14, color: "#fff" } }} />
                  <Statistic title={<Text type="secondary" style={{ fontSize: 10 }}>Cost</Text>}
                    value={snap.previewPathCost} prefix="$"
                    styles={{ content: { fontSize: 14, color: "#fff" } }} />
                </div>
              )}
            </FloatingWindow>
          )}

          <TrainDetailWindows trains={snap.trains} openTrainIds={snap.openTrainIds} game={game} />
          <RouteDetailWindows routes={snap.routes} openRouteIds={snap.openRouteIds} consistPresets={snap.consistPresets} game={game} />
          <InspectDetailWindows openInspectTiles={snap.openInspectTiles} game={game} />
        </div>
      </div>
    </ConfigProvider>
  );
}
