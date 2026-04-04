import { Button, Card, ConfigProvider, InputNumber, Slider, Space, Typography, theme } from "antd";
import { PlayCircleOutlined, ReloadOutlined } from "@ant-design/icons";
import { useCallback, useEffect, useRef, useState } from "react";
import type { GameConfig } from "../game-world.js";
import { createDefaultConfig } from "../game-world.js";
import { generateTerrainPreview } from "../terrain.js";

const { Title, Text } = Typography;

const PREVIEW_SIZE = 200;

const TERRAIN_COLORS: readonly [number, number, number][] = [
  [126, 200, 80],  // Flat - 緑
  [139, 115, 85],  // Mountain - 茶
  [74, 128, 180],  // Water - 青
];

function TerrainPreview({ seed, waterLevel, mountainLevel }: {
  seed: number;
  waterLevel: number;
  mountainLevel: number;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    if (canvas === null) return;
    const ctx = canvas.getContext("2d");
    if (ctx === null) return;

    const data = generateTerrainPreview(PREVIEW_SIZE, {
      seed,
      waterThreshold: waterLevel,
      mountainThreshold: mountainLevel,
    });

    const imgData = ctx.createImageData(PREVIEW_SIZE, PREVIEW_SIZE);
    for (let i = 0; i < data.length; i++) {
      const t = data[i] ?? 0;
      const color = TERRAIN_COLORS[t] ?? [0, 0, 0];
      const idx = i * 4;
      imgData.data[idx] = color[0];
      imgData.data[idx + 1] = color[1];
      imgData.data[idx + 2] = color[2];
      imgData.data[idx + 3] = 255;
    }
    ctx.putImageData(imgData, 0, 0);
  }, [seed, waterLevel, mountainLevel]);

  useEffect(() => {
    draw();
  }, [draw]);

  return (
    <canvas
      ref={canvasRef}
      width={PREVIEW_SIZE}
      height={PREVIEW_SIZE}
      style={{ width: PREVIEW_SIZE, height: PREVIEW_SIZE, borderRadius: 4, border: "1px solid rgba(255,255,255,0.15)" }}
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
  const [waterLevel, setWaterLevel] = useState(0.35);
  const [mountainLevel, setMountainLevel] = useState(0.65);

  const randomSeed = (): void => {
    setSeed(Math.floor(Math.random() * 1000000));
  };

  const handleStart = (): void => {
    onStart(createDefaultConfig({
      seed,
      debug: false,
      mapSize,
      cityCount,
      waterLevel,
      mountainLevel,
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

              <div style={{ marginBottom: 24 }}>
                <Text strong>Mountain Level</Text>
                <Slider min={0.4} max={1.0} step={0.05} value={mountainLevel} onChange={setMountainLevel} />
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
              <Text type="secondary" style={{ fontSize: 12 }}>Preview</Text>
              <TerrainPreview seed={seed} waterLevel={waterLevel} mountainLevel={mountainLevel} />
            </div>
          </div>
        </Card>
      </div>
    </ConfigProvider>
  );
}
