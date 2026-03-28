export class Camera {
  /** World-space center X (in pixels) */
  x: number;
  /** World-space center Y (in pixels) */
  y: number;
  zoom: number;

  private static readonly MIN_ZOOM = 0.25;
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

  /** Pan by screen-space delta */
  pan(screenDx: number, screenDy: number): void {
    this.x -= screenDx / this.zoom;
    this.y -= screenDy / this.zoom;
  }

  /** Zoom toward a screen-space point */
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
