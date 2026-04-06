import { useSyncExternalStore, useState, useCallback, useEffect, useRef } from "react";
import { Button, ConfigProvider, message, Segmented, Space, Statistic, Tag, theme, Typography } from "antd";
import {
  SearchOutlined, ToolOutlined, EyeOutlined,
  UnorderedListOutlined, CarOutlined, AppstoreOutlined,
  DollarOutlined, TeamOutlined, BankOutlined,
} from "@ant-design/icons";
import type { Game, GameSnapshot } from "../game.js";
import { ToolMode, ViewMode } from "../game.js";
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

const viewOptions = [
  { value: ViewMode.Normal, label: "Normal" },
  { value: ViewMode.Biome, label: "Biome" },
  { value: ViewMode.Hillshade, label: "Hillshade" },
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
  const [show3D, setShow3D] = useState(false);
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
              <Text type="secondary" style={{ fontSize: 10 }}><EyeOutlined /> View</Text>
              <Segmented
                size="small"
                value={snap.viewMode}
                options={viewOptions}
                onChange={(v) => { game.setViewMode(v as typeof ViewMode[keyof typeof ViewMode]); }}
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
                <Button size="small" type={show3D ? "primary" : "default"} icon={<EyeOutlined />}
                  onClick={() => { setShow3D((v) => !v); }}>3D</Button>
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
                <div style={{ marginTop: 8 }}>
                  <div style={{ display: "flex", gap: 16 }}>
                    <Statistic title={<Text type="secondary" style={{ fontSize: 10 }}>Length</Text>}
                      value={snap.previewPathLength} suffix="tiles"
                      styles={{ content: { fontSize: 14, color: "#fff" } }} />
                    <Statistic title={<Text type="secondary" style={{ fontSize: 10 }}>Cost</Text>}
                      value={snap.previewPathCost === Infinity ? "N/A" : snap.previewPathCost} prefix={snap.previewPathCost === Infinity ? "" : "$"}
                      styles={{ content: { fontSize: 14, color: snap.previewPathCost === Infinity ? "#ff4d4f" : "#fff" } }} />
                  </div>
                  {snap.previewPathBreakdown !== null && (
                    <div style={{ marginTop: 4, fontSize: 11, color: "rgba(255,255,255,0.6)" }}>
                      {snap.previewPathBreakdown.impossible && (
                        <div style={{ color: "#ff4d4f" }}>Slope too steep (max {String(snap.previewPathBreakdown.maxElevDiff)})</div>
                      )}
                      <span>Terrain: ${String(snap.previewPathBreakdown.terrain)}</span>
                      {" / "}
                      <span>Slope: ${String(snap.previewPathBreakdown.slope)}</span>
                      {" / "}
                      <span>Gain: {String(snap.previewPathBreakdown.totalElevGain)}</span>
                    </div>
                  )}
                </div>
              )}
            </FloatingWindow>
          )}

          <TrainDetailWindows trains={snap.trains} openTrainIds={snap.openTrainIds} game={game} />
          <RouteDetailWindows routes={snap.routes} openRouteIds={snap.openRouteIds} consistPresets={snap.consistPresets} game={game} />
          <InspectDetailWindows openInspectTiles={snap.openInspectTiles} game={game} />

          {show3D && (
            <FloatingWindow title="3D View" onClose={() => { setShow3D(false); }} defaultX={window.innerWidth - 520} defaultY={60} width={480}>
              <Terrain3DWindow game={game} />
            </FloatingWindow>
          )}
        </div>
      </div>
    </ConfigProvider>
  );
}

const VIEW_3D_W = 480;
const VIEW_3D_H = 320;

/** 地形タイプから色を返す */
function terrainColorRGB(terrain: number, h: number): [number, number, number] {
  if (terrain === 2) {
    const t = Math.max(0, Math.min(1, h / 0.3));
    return [30 + t * 30, 55 + t * 50, 130 + t * 50];
  }
  if (terrain === 3) {
    const t = Math.max(0, Math.min(1, h));
    return [210 + t * 30, 190 + t * 20, 130 + t * 30];
  }
  if (terrain === 1) {
    const t = Math.max(0, Math.min(1, (h - 0.4) / 0.5));
    return [120 + t * 100, 100 + t * 110, 60 + t * 170];
  }
  const t = Math.max(0, Math.min(1, h));
  return [40 + t * 130, 100 + t * 60 - t * t * 40, 30 + t * 30];
}

/** Three.js を使った3Dビューウィンドウ */
function Terrain3DWindow({ game }: { game: Game }) {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const container = containerRef.current;
    if (container === null) return;

    // Three.js を動的にインポートする
    let disposed = false;

    void (async () => {
      const THREE = await import("three");
      const { OrbitControls } = await import("three/addons/controls/OrbitControls.js");

      if (disposed) return;

      // シーン・カメラ・レンダラーを作成する
      const scene = new THREE.Scene();
      scene.background = new THREE.Color(0x1a1a2e);

      // 2Dマップと同じ向き: Y軸が上、カメラは真上からやや手前に傾ける
      // Three.js: X=右, Y=上, Z=手前。マップの北=Z負方向
      const cam3d = new THREE.PerspectiveCamera(50, VIEW_3D_W / VIEW_3D_H, 0.1, 1000);
      cam3d.position.set(0, 80, 50);
      cam3d.lookAt(0, 0, 0);

      const renderer = new THREE.WebGLRenderer({ antialias: true });
      renderer.setSize(VIEW_3D_W, VIEW_3D_H);
      container.appendChild(renderer.domElement);

      // OrbitControls でマウスドラッグ回転・ズームを有効にする
      const controls = new OrbitControls(cam3d, renderer.domElement);
      controls.enableDamping = true;
      controls.dampingFactor = 0.1;

      // ライト: ambient を低め、key light（太陽相当）を強め、反対側の fill light で影を埋める
      // これで起伏のレリーフ感が強く出る
      const ambientLight = new THREE.AmbientLight(0xffffff, 0.25);
      scene.add(ambientLight);
      // Key: 北西高め（2D のヒルシェードと同じ方向感）、やや黄色寄り
      const keyLight = new THREE.DirectionalLight(0xfff0d8, 1.1);
      keyLight.position.set(-1, 2, -1);
      scene.add(keyLight);
      // Fill: 反対側（南東低め）、青寄り（空の散乱光イメージ）
      const fillLight = new THREE.DirectionalLight(0xa8c0ff, 0.35);
      fillLight.position.set(1, 0.6, 1);
      scene.add(fillLight);

      let terrainMesh: InstanceType<typeof THREE.Mesh> | null = null;
      let lastCenterTx = -1;
      let lastCenterTy = -1;
      let lastGameCamX = game.camera.x;
      let lastGameCamY = game.camera.y;

      /** 地形メッシュを構築する */
      const buildTerrain = (): void => {
        const map = game.world.map;
        const registry = game.world.biomeRegistry;
        const gameCam = game.camera;
        const centerTx = Math.floor(gameCam.x / 32);
        const centerTy = Math.floor(gameCam.y / 32);

        // ゲームカメラが移動したら3Dカメラも同期移動する
        const dxCam = (gameCam.x - lastGameCamX) / 32 * 0.5;
        const dzCam = (gameCam.y - lastGameCamY) / 32 * 0.5;
        if (Math.abs(dxCam) > 0.01 || Math.abs(dzCam) > 0.01) {
          cam3d.position.x += dxCam;
          cam3d.position.z += dzCam;
          controls.target.x += dxCam;
          controls.target.z += dzCam;
        }
        lastGameCamX = gameCam.x;
        lastGameCamY = gameCam.y;

        // 前回と同じ位置なら再構築しない
        if (centerTx === lastCenterTx && centerTy === lastCenterTy && terrainMesh !== null) return;
        lastCenterTx = centerTx;
        lastCenterTy = centerTy;

        // 古いメッシュを削除する
        if (terrainMesh !== null) {
          scene.remove(terrainMesh);
          terrainMesh.geometry.dispose();
          if (terrainMesh.material instanceof THREE.Material) terrainMesh.material.dispose();
        }

        const viewRadius = Math.max(30, Math.floor(50 / Math.max(0.1, gameCam.zoom)));
        const minX = Math.max(0, centerTx - viewRadius);
        const minY = Math.max(0, centerTy - viewRadius);
        const maxX = Math.min(map.width - 1, centerTx + viewRadius);
        const maxY = Math.min(map.height - 1, centerTy + viewRadius);
        // メッシュ解像度を上げる（最大200セグメント）
        const step = Math.max(1, Math.floor((maxX - minX) / 200));
        const cols = Math.floor((maxX - minX) / step);
        const rows = Math.floor((maxY - minY) / step);
        if (cols <= 1 || rows <= 1) return;

        const geo = new THREE.PlaneGeometry(
          cols * 0.5, rows * 0.5,
          cols - 1, rows - 1,
        );

        const positions = geo.getAttribute("position");
        const colors = new Float32Array(positions.count * 3);
        // 水平 1 セル = 0.5 unit。heightScale=20 で標高 1.0 (= 210m) → 20 unit。
        // 垂直誇張は約 40 倍でマクロな山岳構造を明瞭に見せる。
        // 高周波ノイズ起因の「クレーター地帯」見た目は下の mesh blur で取り除く。
        const heightScale = 20;

        // 素の標高を一旦 raw に入れて、後段でメッシュレベル blur する
        const raw = new Float32Array(cols * rows);

        for (let iy = 0; iy < rows; iy++) {
          for (let ix = 0; ix < cols; ix++) {
            const idx = iy * cols + ix;
            const tx = Math.min(map.width - 1, minX + ix * step);
            const ty = Math.min(map.height - 1, minY + iy * step);
            const tile = map.get(tx, ty);
            const elev = tile.elevation;
            raw[idx] = elev * heightScale;

            // 2D renderer と同じ色ロジック: tile.terrain を基準にする
            // terrain === 2 (Water), 1 (Mountain), 0 (Flat), 3 (Sand)
            let r: number, g: number, b: number;
            if (tile.terrain === 2) {
              // 水域: 深さで青の濃淡
              const depthT = Math.max(0, Math.min(1, (0.2 - elev) / 0.2));
              r = 30 + (1 - depthT) * 40;
              g = 60 + (1 - depthT) * 60;
              b = 150 - depthT * 40;
            } else if (tile.terrain === 1) {
              // 山系: 標高ベースの茶→白グラデーション（2D と統一）
              const mt = Math.max(0, Math.min(1, (elev - 0.4) / 0.5));
              r = 120 + mt * 100;
              g = 100 + mt * 110;
              b = 60 + mt * 170;
            } else {
              // 平地: バイオーム色
              const biomeDef = registry.getById(tile.biomeId);
              if (biomeDef !== undefined) {
                [r, g, b] = biomeDef.color;
              } else {
                [r, g, b] = terrainColorRGB(tile.terrain, elev);
              }
            }
            // 雪冠: 高標高ほど白く（水域以外）
            if (tile.terrain !== 2 && elev > 0.7) {
              const snowT = Math.min(1, (elev - 0.7) / 0.25);
              r = r * (1 - snowT) + 245 * snowT;
              g = g * (1 - snowT) + 248 * snowT;
              b = b * (1 - snowT) + 255 * snowT;
            }

            colors[idx * 3] = r / 255;
            colors[idx * 3 + 1] = g / 255;
            colors[idx * 3 + 2] = b / 255;
          }
        }

        // メッシュレベル分離型ガウシアン blur（5-tap）で高周波ノイズを除去する。
        // ビューワ側の表現調整のみで、ゲーム状態の elevation には影響しない。
        const K = [1, 4, 6, 4, 1];
        const KSUM = 16;
        const tmp = new Float32Array(cols * rows);
        for (let iy = 0; iy < rows; iy++) {
          for (let ix = 0; ix < cols; ix++) {
            let sum = 0;
            for (let k = -2; k <= 2; k++) {
              const sx = Math.max(0, Math.min(cols - 1, ix + k));
              sum += (raw[iy * cols + sx] ?? 0) * (K[k + 2] ?? 0);
            }
            tmp[iy * cols + ix] = sum / KSUM;
          }
        }
        for (let iy = 0; iy < rows; iy++) {
          for (let ix = 0; ix < cols; ix++) {
            let sum = 0;
            for (let k = -2; k <= 2; k++) {
              const sy = Math.max(0, Math.min(rows - 1, iy + k));
              sum += (tmp[sy * cols + ix] ?? 0) * (K[k + 2] ?? 0);
            }
            positions.setZ(iy * cols + ix, sum / KSUM);
          }
        }

        geo.setAttribute("color", new THREE.BufferAttribute(colors, 3));
        geo.computeVertexNormals();
        geo.rotateX(-Math.PI / 2);

        const mat = new THREE.MeshPhongMaterial({ vertexColors: true, flatShading: false });
        terrainMesh = new THREE.Mesh(geo, mat);
        scene.add(terrainMesh);

        // カメラとターゲットをメッシュ中心にリセットする
        controls.target.set(0, 0, 0);
        cam3d.position.set(0, 80, 50);
        cam3d.lookAt(0, 0, 0);
      };

      // アニメーションループ
      let animId = 0;
      const animate = (): void => {
        if (disposed) return;
        animId = requestAnimationFrame(animate);
        buildTerrain();
        controls.update();
        renderer.render(scene, cam3d);
      };
      animId = requestAnimationFrame(animate);

      // クリーンアップ
      return () => {
        disposed = true;
        cancelAnimationFrame(animId);
        controls.dispose();
        renderer.dispose();
        if (container.contains(renderer.domElement)) {
          container.removeChild(renderer.domElement);
        }
      };
    })();

    return () => { disposed = true; };
  }, [game]);

  return (
    <div
      ref={containerRef}
      style={{ width: VIEW_3D_W, height: VIEW_3D_H, borderRadius: 4, overflow: "hidden" }}
    />
  );
}
