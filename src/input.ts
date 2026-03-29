import type { Camera } from "./camera.js";
import { TILE_SIZE } from "./renderer.js";

export interface InputCallbacks {
  readonly requestRender: () => void;
  readonly onTileClick: (tileX: number, tileY: number) => void;
  readonly onTileHover: (tileX: number, tileY: number) => void;
  readonly onKeyPress: (key: string) => void;
}

export class InputHandler {
  private dragging = false;
  private dragMoved = false;
  private lastX = 0;
  private lastY = 0;

  constructor(
    canvas: HTMLCanvasElement,
    camera: Camera,
    callbacks: InputCallbacks,
  ) {
    canvas.addEventListener("mousedown", (e: MouseEvent) => {
      this.dragging = true;
      this.dragMoved = false;
      this.lastX = e.clientX;
      this.lastY = e.clientY;
    });

    canvas.addEventListener("mousemove", (e: MouseEvent) => {
      if (this.dragging) {
        const dx = e.clientX - this.lastX;
        const dy = e.clientY - this.lastY;
        if (Math.abs(dx) > 2 || Math.abs(dy) > 2) {
          this.dragMoved = true;
        }
        this.lastX = e.clientX;
        this.lastY = e.clientY;
        camera.pan(dx, dy);
        callbacks.requestRender();
      } else {
        // ホバー: マウス位置のタイル座標を通知
        const dpr = window.devicePixelRatio;
        const screenX = e.clientX * dpr;
        const screenY = e.clientY * dpr;
        const { wx, wy } = camera.screenToWorld(screenX, screenY, canvas.width, canvas.height);
        callbacks.onTileHover(Math.floor(wx / TILE_SIZE), Math.floor(wy / TILE_SIZE));
      }
    });

    canvas.addEventListener("mouseup", (e: MouseEvent) => {
      if (!this.dragMoved) {
        const dpr = window.devicePixelRatio;
        const screenX = e.clientX * dpr;
        const screenY = e.clientY * dpr;
        const { wx, wy } = camera.screenToWorld(
          screenX,
          screenY,
          canvas.width,
          canvas.height,
        );
        const tileX = Math.floor(wx / TILE_SIZE);
        const tileY = Math.floor(wy / TILE_SIZE);
        callbacks.onTileClick(tileX, tileY);
      }
      this.dragging = false;
      this.dragMoved = false;
    });

    canvas.addEventListener("mouseleave", () => {
      this.dragging = false;
      this.dragMoved = false;
    });

    canvas.addEventListener(
      "wheel",
      (e: WheelEvent) => {
        e.preventDefault();
        const factor = e.deltaY > 0 ? 0.9 : 1.1;
        camera.zoomAt(e.clientX, e.clientY, factor, canvas.width, canvas.height);
        callbacks.requestRender();
      },
      { passive: false },
    );

    window.addEventListener("keydown", (e: KeyboardEvent) => {
      callbacks.onKeyPress(e.key);
    });
  }
}
