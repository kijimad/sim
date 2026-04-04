export class Camera {
  /** ワールド空間の中心X座標（ピクセル単位） */
  x: number;
  /** ワールド空間の中心Y座標（ピクセル単位） */
  y: number;
  zoom: number;

  private static readonly MIN_ZOOM = 0.05;
  private static readonly MAX_ZOOM = 4.0;

  constructor(x: number, y: number, zoom = 1.0) {
    this.x = x;
    this.y = y;
    this.zoom = zoom;
  }

  screenToWorld(
    screenX: number,
    screenY: number,
    canvasWidth: number,
    canvasHeight: number,
  ): { wx: number; wy: number } {
    return {
      wx: this.x + (screenX - canvasWidth / 2) / this.zoom,
      wy: this.y + (screenY - canvasHeight / 2) / this.zoom,
    };
  }

  applyTransform(ctx: CanvasRenderingContext2D, canvas: HTMLCanvasElement): void {
    const hw = canvas.width / 2;
    const hh = canvas.height / 2;
    ctx.setTransform(
      this.zoom,
      0,
      0,
      this.zoom,
      -this.x * this.zoom + hw,
      -this.y * this.zoom + hh,
    );
  }

  /** スクリーン空間のデルタ値でパンする */
  pan(screenDx: number, screenDy: number): void {
    this.x -= screenDx / this.zoom;
    this.y -= screenDy / this.zoom;
  }

  /** スクリーン空間の座標に向かってズームする */
  zoomAt(
    screenX: number,
    screenY: number,
    factor: number,
    canvasWidth: number,
    canvasHeight: number,
  ): void {
    const before = this.screenToWorld(screenX, screenY, canvasWidth, canvasHeight);
    this.zoom = Math.max(
      Camera.MIN_ZOOM,
      Math.min(Camera.MAX_ZOOM, this.zoom * factor),
    );
    const after = this.screenToWorld(screenX, screenY, canvasWidth, canvasHeight);
    this.x += before.wx - after.wx;
    this.y += before.wy - after.wy;
  }
}
