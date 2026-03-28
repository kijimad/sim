import type { Camera } from "./camera.js";

export class InputHandler {
  private dragging = false;
  private lastX = 0;
  private lastY = 0;

  constructor(
    canvas: HTMLCanvasElement,
    camera: Camera,
    requestRender: () => void,
  ) {
    canvas.addEventListener("mousedown", (e: MouseEvent) => {
      this.dragging = true;
      this.lastX = e.clientX;
      this.lastY = e.clientY;
    });

    canvas.addEventListener("mousemove", (e: MouseEvent) => {
      if (!this.dragging) return;
      const dx = e.clientX - this.lastX;
      const dy = e.clientY - this.lastY;
      this.lastX = e.clientX;
      this.lastY = e.clientY;
      camera.pan(dx, dy);
      requestRender();
    });

    canvas.addEventListener("mouseup", () => {
      this.dragging = false;
    });

    canvas.addEventListener("mouseleave", () => {
      this.dragging = false;
    });

    canvas.addEventListener(
      "wheel",
      (e: WheelEvent) => {
        e.preventDefault();
        const factor = e.deltaY > 0 ? 0.9 : 1.1;
        camera.zoomAt(e.clientX, e.clientY, factor, canvas.width, canvas.height);
        requestRender();
      },
      { passive: false },
    );
  }
}
