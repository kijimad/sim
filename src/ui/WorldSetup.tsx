import { Button, Card, ConfigProvider, InputNumber, Select, Slider, Space, Typography, theme } from "antd";
import { PlayCircleOutlined, ReloadOutlined } from "@ant-design/icons";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { GameConfig } from "../game-world.js";
import { createDefaultConfig } from "../game-world.js";
import { generateTerrainPreview, ALL_PIPELINES } from "../terrain/index.js";
import type { Pipeline } from "../terrain/index.js";

const { Title, Text } = Typography;

const PREVIEW_SIZE = 200;


/** 地形タイプ + 標高から色を返す（連続グラデーション） */
function tileColor(terrainType: number, h: number): [number, number, number] {
  if (terrainType === 2) {
    const t = Math.max(0, Math.min(1, h / 0.3));
    return [30 + t * 30, 55 + t * 50, 130 + t * 50];
  }
  if (terrainType === 3) {
    const t = Math.max(0, Math.min(1, h));
    return [210 + t * 30, 190 + t * 20, 130 + t * 30];
  }
  if (terrainType === 1) {
    const t = Math.max(0, Math.min(1, (h - 0.4) / 0.5));
    return [120 + t * 100, 100 + t * 110, 60 + t * 170];
  }
  const t = Math.max(0, Math.min(1, h));
  return [40 + t * 130, 100 + t * 60 - t * t * 40, 30 + t * 30];
}

function TerrainPreview2D({ terrain: terrainData, elevation: elevationData }: {
  terrain: Uint8Array;
  elevation: Float32Array;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (canvas === null) return;
    const ctx = canvas.getContext("2d");
    if (ctx === null) return;

    const imgData = ctx.createImageData(PREVIEW_SIZE, PREVIEW_SIZE);
    for (let i = 0; i < elevationData.length; i++) {
      const t = terrainData[i] ?? 0;
      const elev = elevationData[i] ?? 0;
      const [r, g, b] = tileColor(t, elev);
      const idx = i * 4;
      imgData.data[idx] = r;
      imgData.data[idx + 1] = g;
      imgData.data[idx + 2] = b;
      imgData.data[idx + 3] = 255;
    }
    ctx.putImageData(imgData, 0, 0);
  }, [terrainData, elevationData]);

  return (
    <canvas
      ref={canvasRef}
      width={PREVIEW_SIZE}
      height={PREVIEW_SIZE}
      style={{ width: PREVIEW_SIZE, height: PREVIEW_SIZE, borderRadius: 4, border: "1px solid rgba(255,255,255,0.15)" }}
    />
  );
}

/** 陰影起伏図（ヒルシェード）プレビュー */
function HillshadePreview({ elevation: elev, size }: { elevation: Float32Array; size: number }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (canvas === null) return;
    const ctx = canvas.getContext("2d");
    if (ctx === null) return;

    const imgData = ctx.createImageData(size, size);
    // 光源方向（左上から）
    const lightX = -1;
    const lightY = -1;
    const lightLen = Math.sqrt(lightX * lightX + lightY * lightY);
    const lx = lightX / lightLen;
    const ly = lightY / lightLen;

    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const i = y * size + x;
        const h = elev[i] ?? 0;
        // 勾配を計算する
        const hR = x < size - 1 ? (elev[i + 1] ?? 0) : h;
        const hD = y < size - 1 ? (elev[i + size] ?? 0) : h;
        const dx = (h - hR) * 8; // スケーリングで陰影を強調
        const dy = (h - hD) * 8;

        // 光源方向との内積で明るさを決定する
        const shade = 0.5 + (dx * lx + dy * ly) * 0.5;
        const v = Math.max(0, Math.min(255, Math.round(shade * 255)));

        const idx = i * 4;
        imgData.data[idx] = v;
        imgData.data[idx + 1] = v;
        imgData.data[idx + 2] = v;
        imgData.data[idx + 3] = 255;
      }
    }
    ctx.putImageData(imgData, 0, 0);
  }, [elev, size]);

  return (
    <canvas
      ref={canvasRef}
      width={size}
      height={size}
      style={{ width: PREVIEW_SIZE, height: PREVIEW_SIZE, borderRadius: 4, border: "1px solid rgba(255,255,255,0.15)" }}
    />
  );
}

const PREVIEW_3D_W = 300;
const PREVIEW_3D_H = 200;

function Terrain3DPreview({ terrain: terrainData, elevation, size }: { terrain: Uint8Array; elevation: Float32Array; size: number }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    if (canvas === null) return;
    const ctx = canvas.getContext("2d");
    if (ctx === null) return;

    ctx.fillStyle = "#1a1a2e";
    ctx.fillRect(0, 0, PREVIEW_3D_W, PREVIEW_3D_H);

    // 斜め投影パラメータ
    const step = Math.max(1, Math.floor(size / 80)); // サンプリング間隔
    const cols = Math.floor(size / step);
    const rows = Math.floor(size / step);
    const cellW = PREVIEW_3D_W / cols * 0.9;
    const cellH = cellW * 0.5;
    const heightScale = 80;
    const offsetX = PREVIEW_3D_W * 0.5;
    const offsetY = 30;

    // 奥から手前に描画（ペインターズアルゴリズム）
    for (let gy = 0; gy < rows; gy++) {
      for (let gx = 0; gx < cols; gx++) {
        const tx = gx * step;
        const ty = gy * step;
        if (tx >= size || ty >= size) continue;

        const elev = elevation[ty * size + tx] ?? 0;
        const elevR = tx + step < size ? (elevation[ty * size + tx + step] ?? 0) : elev;
        const elevB = ty + step < size ? (elevation[(ty + step) * size + tx] ?? 0) : elev;
        const elevBR = (tx + step < size && ty + step < size) ? (elevation[(ty + step) * size + tx + step] ?? 0) : elev;

        // 斜め投影: x は右に、y は右下に
        const isoX = (gx - gy) * cellW * 0.5 + offsetX;
        const isoY = (gx + gy) * cellH * 0.5 + offsetY;

        const h0 = elev * heightScale;
        const h1 = elevR * heightScale;
        const h2 = elevBR * heightScale;
        const h3 = elevB * heightScale;

        // 上面の4頂点
        const x0 = isoX;
        const y0 = isoY - h0;
        const x1 = isoX + cellW * 0.5;
        const y1 = isoY + cellH * 0.5 - h1;
        const x2 = isoX;
        const y2 = isoY + cellH - h2;
        const x3 = isoX - cellW * 0.5;
        const y3 = isoY + cellH * 0.5 - h3;

        const avgH = (elev + elevR + elevB + elevBR) / 4;
        // 中心タイルの terrain タイプを使う
        const t = terrainData[ty * size + tx] ?? 0;
        const [r, g, b] = tileColor(t, avgH);

        // 法線による陰影
        const shade = 0.7 + (h0 - h2) * 0.3;
        const factor = Math.max(0.3, Math.min(1.3, shade));

        ctx.beginPath();
        ctx.moveTo(x0, y0);
        ctx.lineTo(x1, y1);
        ctx.lineTo(x2, y2);
        ctx.lineTo(x3, y3);
        ctx.closePath();
        ctx.fillStyle = `rgb(${String(Math.round(r * factor))},${String(Math.round(g * factor))},${String(Math.round(b * factor))})`;
        ctx.fill();
      }
    }
  }, [terrainData, elevation, size]);

  useEffect(() => {
    draw();
  }, [draw]);

  return (
    <canvas
      ref={canvasRef}
      width={PREVIEW_3D_W}
      height={PREVIEW_3D_H}
      style={{ width: PREVIEW_3D_W, height: PREVIEW_3D_H, borderRadius: 4, border: "1px solid rgba(255,255,255,0.15)" }}
    />
  );
}

interface WorldSetupProps {
  readonly onStart: (config: GameConfig) => void;
}

export function WorldSetup({ onStart }: WorldSetupProps) {
  const [seed, setSeed] = useState(Date.now());
  const [mapSize, setMapSize] = useState(512);
  const [cityCount, setCityCount] = useState(8);
  const [waterLevel, setWaterLevel] = useState(0.2);
  const [mountainLevel, setMountainLevel] = useState(0.5);
  const [relief, setRelief] = useState(1.0);
  const [pipeline, setPipeline] = useState<Pipeline>(ALL_PIPELINES[0]!);

  // プレビューデータを生成（2D/3D で共有）
  const previewData = useMemo(() => generateTerrainPreview(PREVIEW_SIZE, {
    seed,
    waterThreshold: waterLevel,
    mountainThreshold: mountainLevel,
    relief,
    targetSize: mapSize,
    pipeline,
  }), [seed, waterLevel, mountainLevel, relief, mapSize, pipeline]);

  const randomSeed = (): void => {
    setSeed(Math.floor(Math.random() * 1000000));
  };

  const handleStart = (): void => {
    onStart(createDefaultConfig({
      seed,
      mapSize,
      cityCount,
      waterLevel,
      mountainLevel,
      relief,
      pipeline,
    }));
  };

  return (
    <ConfigProvider theme={{ algorithm: theme.darkAlgorithm }}>
      <div style={{
        position: "fixed",
        inset: 0,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "linear-gradient(135deg, #1a1a2e 0%, #16213e 50%, #0f3460 100%)",
        zIndex: 100,
      }}>
        <Card style={{ width: 680 }} styles={{ body: { padding: "24px 32px" } }}>
          <Title level={3} style={{ marginTop: 0 }}>Transport Sim</Title>
          <Text type="secondary">Configure your world and start playing</Text>

          <div style={{ display: "flex", gap: 24, marginTop: 24 }}>
            {/* 左: 設定 */}
            <div style={{ flex: 1 }}>
              <div style={{ marginBottom: 16 }}>
                <Text strong>Seed</Text>
                <div style={{ display: "flex", gap: 8, marginTop: 4 }}>
                  <InputNumber
                    style={{ flex: 1 }}
                    value={seed}
                    onChange={(v) => { if (v !== null) setSeed(v); }}
                  />
                  <Button icon={<ReloadOutlined />} onClick={randomSeed}>Random</Button>
                </div>
              </div>

              <div style={{ marginBottom: 16 }}>
                <Text strong>Map Type</Text>
                <Select
                  style={{ width: "100%", marginTop: 4 }}
                  value={pipeline.name}
                  onChange={(name) => {
                    const p = ALL_PIPELINES.find(pp => pp.name === name);
                    if (p !== undefined) setPipeline(p);
                  }}
                  options={ALL_PIPELINES.map(p => ({ value: p.name, label: p.name }))}
                />
              </div>

              <div style={{ marginBottom: 16 }}>
                <Text strong>Map Size: {mapSize}×{mapSize}</Text>
                <Slider
                  min={64}
                  max={2048}
                  step={64}
                  value={mapSize}
                  onChange={setMapSize}
                  marks={{ 64: "64", 512: "512", 1024: "1K", 2048: "2K" }}
                />
              </div>

              <div style={{ marginBottom: 16 }}>
                <Text strong>Cities: {cityCount}</Text>
                <Slider min={0} max={30} value={cityCount} onChange={setCityCount} />
              </div>

              <div style={{ marginBottom: 16 }}>
                <Text strong>Water Level</Text>
                <Slider min={0} max={0.6} step={0.05} value={waterLevel} onChange={setWaterLevel} />
              </div>

              <div style={{ marginBottom: 16 }}>
                <Text strong>Mountain Level</Text>
                <Slider min={0.4} max={1.0} step={0.05} value={mountainLevel} onChange={setMountainLevel} />
              </div>

              <div style={{ marginBottom: 24 }}>
                <Text strong>Relief: {relief.toFixed(1)}</Text>
                <Slider
                  min={0.5}
                  max={2.0}
                  step={0.1}
                  value={relief}
                  onChange={setRelief}
                  marks={{ 0.5: "Flat", 1.0: "Normal", 2.0: "Extreme" }}
                />
              </div>

              <Space>
                <Button type="primary" size="large" icon={<PlayCircleOutlined />} onClick={handleStart}>
                  Start Game
                </Button>
                <Button size="large" onClick={() => {
                  onStart(createDefaultConfig({ seed, debug: true }));
                }}>
                  Debug World
                </Button>
              </Space>
            </div>

            {/* 右: プレビュー */}
            <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 8 }}>
              <Text type="secondary" style={{ fontSize: 12 }}>Color</Text>
              <TerrainPreview2D terrain={previewData.terrain} elevation={previewData.elevation} />
              <Text type="secondary" style={{ fontSize: 12 }}>Hillshade</Text>
              <HillshadePreview elevation={previewData.elevation} size={PREVIEW_SIZE} />
              <Text type="secondary" style={{ fontSize: 12 }}>3D</Text>
              <Terrain3DPreview terrain={previewData.terrain} elevation={previewData.elevation} size={PREVIEW_SIZE} />
            </div>
          </div>
        </Card>
      </div>
    </ConfigProvider>
  );
}
