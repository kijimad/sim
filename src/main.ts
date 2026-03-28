import { Camera } from "./camera.js";
import { InputHandler } from "./input.js";
import { Renderer, TILE_SIZE } from "./renderer.js";
import { generateTerrain } from "./terrain.js";
import { TileMap } from "./tilemap.js";

const MAP_SIZE = 256;

function getCanvas(): { canvas: HTMLCanvasElement; ctx: CanvasRenderingContext2D } {
  const canvas = document.getElementById("game");
  if (!(canvas instanceof HTMLCanvasElement)) {
    throw new Error("Canvas element #game not found");
  }
  const ctx = canvas.getContext("2d");
  if (ctx === null) {
    throw new Error("Failed to get 2D context");
  }
  return { canvas, ctx };
}

function resizeCanvas(canvas: HTMLCanvasElement): void {
  const dpr = window.devicePixelRatio;
  canvas.width = window.innerWidth * dpr;
  canvas.height = window.innerHeight * dpr;
  canvas.style.width = `${String(window.innerWidth)}px`;
  canvas.style.height = `${String(window.innerHeight)}px`;
}

function main(): void {
  const { canvas, ctx } = getCanvas();
  resizeCanvas(canvas);

  const map = new TileMap(MAP_SIZE, MAP_SIZE);
  generateTerrain(map, { seed: Date.now() });

  const centerWorld = (MAP_SIZE * TILE_SIZE) / 2;
  const camera = new Camera(centerWorld, centerWorld);
  const renderer = new Renderer(ctx, canvas);

  let dirty = true;
  const requestRender = (): void => {
    dirty = true;
  };

  new InputHandler(canvas, camera, requestRender);

  window.addEventListener("resize", () => {
    resizeCanvas(canvas);
    requestRender();
  });

  const loop = (): void => {
    if (dirty) {
      renderer.render(map, camera);
      dirty = false;
    }
    requestAnimationFrame(loop);
  };
  requestAnimationFrame(loop);
}

main();
