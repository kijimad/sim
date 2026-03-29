import type { Camera } from "./camera.js";
import type { Graph, GraphEdge, GraphNode } from "./graph.js";
import type { PathNode } from "./pathfinding.js";
import type { TrainPosition } from "./simulation.js";
import { getSignalPositions } from "./graph.js";
import type { TileMap } from "./tilemap.js";
import { Terrain } from "./types.js";

export const TILE_SIZE = 32;
const HALF_TILE = TILE_SIZE / 2;

const TERRAIN_COLORS: Record<Terrain, string> = {
  [Terrain.Flat]: "#7ec850",
  [Terrain.Mountain]: "#8b7355",
  [Terrain.Water]: "#4a80b4",
};

const BUILDING_COLORS: Record<number, string> = {
  0: "#c08040", // 住宅 - 茶
  1: "#4080c0", // 商業 - 青
  2: "#60a030", // 農場 - 緑
  3: "#808080", // 鉱山 - 灰
  4: "#a04040", // 工場 - 赤
};

export class Renderer {
  private readonly ctx: CanvasRenderingContext2D;
  private readonly canvas: HTMLCanvasElement;

  constructor(ctx: CanvasRenderingContext2D, canvas: HTMLCanvasElement) {
    this.ctx = ctx;
    this.canvas = canvas;
  }

  render(map: TileMap, camera: Camera): void {
    const { ctx, canvas } = this;

    // 単位行列変換でクリアする
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // 表示可能なタイル範囲を計算する
    const topLeft = camera.screenToWorld(0, 0, canvas.width, canvas.height);
    const bottomRight = camera.screenToWorld(
      canvas.width,
      canvas.height,
      canvas.width,
      canvas.height,
    );

    const minTx = Math.max(0, Math.floor(topLeft.wx / TILE_SIZE));
    const minTy = Math.max(0, Math.floor(topLeft.wy / TILE_SIZE));
    const maxTx = Math.min(map.width - 1, Math.floor(bottomRight.wx / TILE_SIZE));
    const maxTy = Math.min(map.height - 1, Math.floor(bottomRight.wy / TILE_SIZE));

    // カメラ変換を適用する
    camera.applyTransform(ctx, canvas);

    // 表示可能なタイルを描画する
    for (let ty = minTy; ty <= maxTy; ty++) {
      for (let tx = minTx; tx <= maxTx; tx++) {
        const tile = map.get(tx, ty);
        ctx.fillStyle = TERRAIN_COLORS[tile.terrain];
        ctx.fillRect(tx * TILE_SIZE, ty * TILE_SIZE, TILE_SIZE, TILE_SIZE);
      }
    }

    // 高ズーム時のグリッド線
    if (camera.zoom > 1.0) {
      ctx.strokeStyle = "rgba(0, 0, 0, 0.15)";
      ctx.lineWidth = 0.5 / camera.zoom;
      for (let ty = minTy; ty <= maxTy; ty++) {
        for (let tx = minTx; tx <= maxTx; tx++) {
          ctx.strokeRect(tx * TILE_SIZE, ty * TILE_SIZE, TILE_SIZE, TILE_SIZE);
        }
      }
    }

    // 変換をリセットする
    ctx.setTransform(1, 0, 0, 1, 0, 0);
  }

  renderGraph(
    graph: Graph,
    camera: Camera,
    selectedNodeId: number | null,
    nodeInfo?: (nodeId: number) => { trainCount: number; waitingCargo: number },
  ): void {
    const { ctx, canvas } = this;
    camera.applyTransform(ctx, canvas);

    // エッジを先に描画する（ノードの下に）
    const edges = graph.getAllEdges();
    for (const edge of edges) {
      this.renderEdge(edge);
    }

    // 駅複合体の転線リンクを描画する（点線）
    this.renderComplexLinks(graph);

    // ノードを上に描画する
    const nodes = graph.getAllNodes();
    for (const node of nodes) {
      const info = nodeInfo !== undefined ? nodeInfo(node.id) : { trainCount: 0, waitingCargo: 0 };
      this.renderNode(node, node.id === selectedNodeId, info.trainCount, info.waitingCargo);
    }

    ctx.setTransform(1, 0, 0, 1, 0, 0);
  }

  renderPathPreview(path: readonly PathNode[], camera: Camera): void {
    const { ctx, canvas } = this;
    camera.applyTransform(ctx, canvas);
    this.drawPath(path, "rgba(255, 255, 100, 0.6)", 4);
    ctx.setTransform(1, 0, 0, 1, 0, 0);
  }

  /** ウェイポイントとA*パスのプレビューを描画する */
  renderWaypoints(
    points: readonly { x: number; y: number }[],
    previewPath: readonly { x: number; y: number }[],
    camera: Camera,
  ): void {
    if (points.length === 0) return;
    const { ctx, canvas } = this;
    camera.applyTransform(ctx, canvas);

    // A*パスのプレビュー（点線）
    if (previewPath.length >= 2) {
      const first = previewPath[0];
      if (first !== undefined) {
        ctx.beginPath();
        ctx.moveTo(first.x * TILE_SIZE + HALF_TILE, first.y * TILE_SIZE + HALF_TILE);
        for (let i = 1; i < previewPath.length; i++) {
          const p = previewPath[i];
          if (p === undefined) continue;
          ctx.lineTo(p.x * TILE_SIZE + HALF_TILE, p.y * TILE_SIZE + HALF_TILE);
        }
        ctx.strokeStyle = "rgba(255, 255, 100, 0.5)";
        ctx.lineWidth = 3;
        ctx.setLineDash([6, 4]);
        ctx.lineCap = "round";
        ctx.lineJoin = "round";
        ctx.stroke();
        ctx.setLineDash([]);
      }
    }

    // ウェイポイントマーカー（起点の駅は除く: index > 0）
    for (let i = 1; i < points.length; i++) {
      const p = points[i];
      if (p === undefined) continue;
      const px = p.x * TILE_SIZE + HALF_TILE;
      const py = p.y * TILE_SIZE + HALF_TILE;

      // ダイヤモンド型マーカー
      const s = TILE_SIZE * 0.25;
      ctx.beginPath();
      ctx.moveTo(px, py - s);
      ctx.lineTo(px + s, py);
      ctx.lineTo(px, py + s);
      ctx.lineTo(px - s, py);
      ctx.closePath();
      ctx.fillStyle = "rgba(255, 255, 100, 0.8)";
      ctx.fill();
      ctx.strokeStyle = "#ffffff";
      ctx.lineWidth = 1.5;
      ctx.stroke();
    }

    ctx.setTransform(1, 0, 0, 1, 0, 0);
  }

  private renderEdge(edge: GraphEdge): void {
    // 常に複線として描画する
    const offset = 3;
    this.drawOffsetPath(edge.path, "#333333", 4, offset);
    this.drawOffsetPath(edge.path, "#333333", 4, -offset);
    this.drawOffsetPath(edge.path, "#aaaaaa", 2, offset);
    this.drawOffsetPath(edge.path, "#aaaaaa", 2, -offset);

    // エッジ内信号マーカーを描画
    const { ctx } = this;
    for (const sigIdx of getSignalPositions(edge)) {
      const p = edge.path[sigIdx];
      if (p === undefined) continue;
      const sx = p.x * TILE_SIZE + HALF_TILE;
      const sy = p.y * TILE_SIZE + HALF_TILE;
      ctx.beginPath();
      ctx.arc(sx, sy, 3, 0, Math.PI * 2);
      ctx.fillStyle = "#40d040";
      ctx.fill();
      ctx.strokeStyle = "#ffffff";
      ctx.lineWidth = 1;
      ctx.stroke();
    }
  }

  /** 駅複合体の転線リンクを点線で描画する */
  private renderComplexLinks(graph: Graph): void {
    const { ctx } = this;
    const drawn = new Set<string>();

    for (const node of graph.getAllNodes()) {
      for (const adj of graph.getAdjacentStations(node.id)) {
        // 重複描画を防ぐ
        const key = `${String(Math.min(node.id, adj.id))}:${String(Math.max(node.id, adj.id))}`;
        if (drawn.has(key)) continue;
        drawn.add(key);

        const x1 = node.tileX * TILE_SIZE + HALF_TILE;
        const y1 = node.tileY * TILE_SIZE + HALF_TILE;
        const x2 = adj.tileX * TILE_SIZE + HALF_TILE;
        const y2 = adj.tileY * TILE_SIZE + HALF_TILE;

        ctx.beginPath();
        ctx.moveTo(x1, y1);
        ctx.lineTo(x2, y2);
        ctx.strokeStyle = "rgba(100, 200, 255, 0.5)";
        ctx.lineWidth = 2;
        ctx.setLineDash([4, 3]);
        ctx.stroke();
        ctx.setLineDash([]);
      }
    }
  }

  /** パスを垂直方向にオフセットして描画する（曲がり角は前後の法線を平均） */
  private drawOffsetPath(
    path: readonly PathNode[],
    color: string,
    lineWidth: number,
    offset: number,
  ): void {
    if (path.length < 2) return;
    const { ctx } = this;

    ctx.beginPath();
    for (let i = 0; i < path.length; i++) {
      const curr = path[i];
      if (curr === undefined) continue;

      // 前後のセグメントから法線を計算し平均する
      let nx = 0;
      let ny = 0;
      let count = 0;

      if (i > 0) {
        const prev = path[i - 1];
        if (prev !== undefined) {
          const dx = curr.x - prev.x;
          const dy = curr.y - prev.y;
          const len = Math.sqrt(dx * dx + dy * dy);
          if (len > 0) {
            nx += -dy / len;
            ny += dx / len;
            count++;
          }
        }
      }
      if (i < path.length - 1) {
        const next = path[i + 1];
        if (next !== undefined) {
          const dx = next.x - curr.x;
          const dy = next.y - curr.y;
          const len = Math.sqrt(dx * dx + dy * dy);
          if (len > 0) {
            nx += -dy / len;
            ny += dx / len;
            count++;
          }
        }
      }

      if (count > 1) {
        // 平均法線を正規化する
        const nLen = Math.sqrt(nx * nx + ny * ny);
        if (nLen > 0) {
          nx /= nLen;
          ny /= nLen;
        }
      }

      const px = curr.x * TILE_SIZE + HALF_TILE + nx * offset;
      const py = curr.y * TILE_SIZE + HALF_TILE + ny * offset;
      if (i === 0) {
        ctx.moveTo(px, py);
      } else {
        ctx.lineTo(px, py);
      }
    }
    ctx.strokeStyle = color;
    ctx.lineWidth = lineWidth;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.stroke();
  }

  private drawPath(
    path: readonly PathNode[],
    color: string,
    lineWidth: number,
  ): void {
    const first = path[0];
    if (path.length < 2 || first === undefined) return;
    const { ctx } = this;
    const half = HALF_TILE;

    ctx.beginPath();
    ctx.moveTo(first.x * TILE_SIZE + half, first.y * TILE_SIZE + half);
    for (let i = 1; i < path.length; i++) {
      const p = path[i];
      if (p === undefined) continue;
      ctx.lineTo(p.x * TILE_SIZE + half, p.y * TILE_SIZE + half);
    }
    ctx.strokeStyle = color;
    ctx.lineWidth = lineWidth;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.stroke();
  }

  private renderNode(node: GraphNode, selected: boolean, trainCount: number, waitingCargo: number): void {
    const { ctx } = this;
    const cx = node.tileX * TILE_SIZE + HALF_TILE;
    const cy = node.tileY * TILE_SIZE + HALF_TILE;
    const radius = TILE_SIZE * 0.35;

    // 選択ハイライトリング
    if (selected) {
      ctx.beginPath();
      ctx.arc(cx, cy, radius + 4, 0, Math.PI * 2);
      ctx.fillStyle = "#ffff00";
      ctx.fill();
    }

    ctx.beginPath();
    ctx.arc(cx, cy, radius, 0, Math.PI * 2);

    ctx.fillStyle = selected ? "#ff6060" : "#e03030";

    ctx.fill();
    ctx.strokeStyle = selected ? "#ffff00" : "#ffffff";
    ctx.lineWidth = 2;
    ctx.stroke();

    // ラベル
    ctx.fillStyle = "#ffffff";
    ctx.font = `bold ${String(TILE_SIZE * 0.3)}px sans-serif`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(node.name, cx, cy);

    // 列車数バッジ
    if (trainCount > 0) {
      const badgeX = cx + radius;
      const badgeY = cy - radius;
      const badgeR = TILE_SIZE * 0.2;
      ctx.beginPath();
      ctx.arc(badgeX, badgeY, badgeR, 0, Math.PI * 2);
      ctx.fillStyle = "#2050d0";
      ctx.fill();
      ctx.fillStyle = "#ffffff";
      ctx.font = `bold ${String(TILE_SIZE * 0.22)}px sans-serif`;
      ctx.fillText(String(trainCount), badgeX, badgeY);
    }

    // 待機貨物バー（ノードの下に表示）
    if (waitingCargo > 0) {
      const barWidth = TILE_SIZE * 0.8;
      const barHeight = 3;
      const barX = cx - barWidth / 2;
      const barY = cy + radius + 4;
      const fillRatio = Math.min(waitingCargo / 20, 1);

      ctx.fillStyle = "rgba(0, 0, 0, 0.4)";
      ctx.fillRect(barX, barY, barWidth, barHeight);
      ctx.fillStyle = "#e0c030";
      ctx.fillRect(barX, barY, barWidth * fillRatio, barHeight);

      ctx.fillStyle = "#ffffff";
      ctx.font = `${String(TILE_SIZE * 0.2)}px sans-serif`;
      ctx.textAlign = "center";
      ctx.textBaseline = "top";
      ctx.fillText(String(Math.floor(waitingCargo)), cx, barY + barHeight + 1);
    }
  }

  renderTrains(positions: readonly TrainPosition[], camera: Camera): void {
    const { ctx, canvas } = this;
    camera.applyTransform(ctx, canvas);

    for (const pos of positions) {
      let cx = pos.worldX * TILE_SIZE + HALF_TILE;
      let cy = pos.worldY * TILE_SIZE + HALF_TILE;

      // 複線: 進行方向に対して右側にオフセット
      if (pos.dirX !== 0 || pos.dirY !== 0) {
        const offsetDist = 3;
        cx += pos.dirY * offsetDist;
        cy += -pos.dirX * offsetDist;
      }

      const size = TILE_SIZE * 0.4;

      // 列車の色: 待機列は灰色、貨物積載中はオレンジ、空は青
      if (!pos.inSlot) {
        ctx.fillStyle = "#606060";
      } else if (pos.cargoTotal > 0) {
        ctx.fillStyle = "#d08020";
      } else {
        ctx.fillStyle = "#2050d0";
      }
      ctx.fillRect(cx - size / 2, cy - size / 2, size, size);
      ctx.strokeStyle = pos.inSlot ? "#ffffff" : "#999999";
      ctx.lineWidth = 1.5;
      ctx.strokeRect(cx - size / 2, cy - size / 2, size, size);

      // 貨物量ラベル
      if (pos.cargoTotal > 0) {
        ctx.fillStyle = "#ffffff";
        ctx.font = `bold ${String(TILE_SIZE * 0.22)}px sans-serif`;
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText(String(Math.floor(pos.cargoTotal)), cx, cy);
      }
    }

    ctx.setTransform(1, 0, 0, 1, 0, 0);
  }

  renderCities(
    cities: readonly { tileX: number; tileY: number; name: string; radius?: number }[],
    camera: Camera,
  ): void {
    const { ctx, canvas } = this;
    camera.applyTransform(ctx, canvas);

    for (const city of cities) {
      const cx = city.tileX * TILE_SIZE + HALF_TILE;
      const cy = city.tileY * TILE_SIZE + HALF_TILE;

      // 都市エリア
      if (city.radius !== undefined) {
        const r = city.radius * TILE_SIZE;
        ctx.fillStyle = "rgba(200, 160, 60, 0.08)";
        ctx.fillRect(cx - r, cy - r, r * 2, r * 2);
        ctx.strokeStyle = "rgba(200, 160, 60, 0.4)";
        ctx.lineWidth = 1;
        ctx.setLineDash([4, 4]);
        ctx.strokeRect(cx - r, cy - r, r * 2, r * 2);
        ctx.setLineDash([]);
      }

      // 名前ラベル
      ctx.fillStyle = "#ffffff";
      ctx.font = `bold ${String(TILE_SIZE * 0.3)}px sans-serif`;
      ctx.textAlign = "center";
      ctx.textBaseline = "top";
      ctx.fillText(city.name, cx, cy + TILE_SIZE * 0.5 + 2);
    }

    ctx.setTransform(1, 0, 0, 1, 0, 0);
  }

  renderBuildings(
    buildings: readonly { tileX: number; tileY: number; type: number }[],
    camera: Camera,
  ): void {
    const { ctx, canvas } = this;
    camera.applyTransform(ctx, canvas);

    for (const b of buildings) {
      const x = b.tileX * TILE_SIZE;
      const y = b.tileY * TILE_SIZE;
      ctx.fillStyle = BUILDING_COLORS[b.type] ?? "#888888";
      ctx.fillRect(x + 2, y + 2, TILE_SIZE - 4, TILE_SIZE - 4);
    }

    ctx.setTransform(1, 0, 0, 1, 0, 0);
  }
}
