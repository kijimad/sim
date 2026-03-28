import { describe, expect, it } from "vitest";
import { Camera } from "./camera.js";

describe("Camera", () => {
  it("screenToWorld returns center as camera position", () => {
    const camera = new Camera(100, 200, 1.0);
    const { wx, wy } = camera.screenToWorld(400, 300, 800, 600);
    expect(wx).toBeCloseTo(100);
    expect(wy).toBeCloseTo(200);
  });

  it("screenToWorld accounts for zoom", () => {
    const camera = new Camera(0, 0, 2.0);
    // Top-left of 800x600 canvas at zoom 2
    const { wx, wy } = camera.screenToWorld(0, 0, 800, 600);
    expect(wx).toBeCloseTo(-200); // -400/2
    expect(wy).toBeCloseTo(-150); // -300/2
  });

  it("pan moves camera inversely to screen delta", () => {
    const camera = new Camera(100, 100, 1.0);
    camera.pan(50, 30);
    expect(camera.x).toBeCloseTo(50);
    expect(camera.y).toBeCloseTo(70);
  });

  it("pan accounts for zoom level", () => {
    const camera = new Camera(0, 0, 2.0);
    camera.pan(100, 0);
    expect(camera.x).toBeCloseTo(-50); // -100/2
  });

  it("zoomAt keeps the target point stable", () => {
    const camera = new Camera(100, 100, 1.0);
    const screenX = 200;
    const screenY = 150;
    const canvasW = 800;
    const canvasH = 600;

    const before = camera.screenToWorld(screenX, screenY, canvasW, canvasH);
    camera.zoomAt(screenX, screenY, 1.5, canvasW, canvasH);
    const after = camera.screenToWorld(screenX, screenY, canvasW, canvasH);

    expect(after.wx).toBeCloseTo(before.wx, 5);
    expect(after.wy).toBeCloseTo(before.wy, 5);
  });

  it("zoom is clamped to min/max", () => {
    const camera = new Camera(0, 0, 1.0);
    camera.zoomAt(0, 0, 0.01, 800, 600);
    expect(camera.zoom).toBeGreaterThanOrEqual(0.25);

    camera.zoomAt(0, 0, 100, 800, 600);
    expect(camera.zoom).toBeLessThanOrEqual(4.0);
  });
});
