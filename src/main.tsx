import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { Game, parseConfigFromURL } from "./game.js";
import { GameUI } from "./ui/GameUI.js";
import "./ui/style.css";

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

function main(): void {
  const { canvas, ctx } = getCanvas();
  const config = parseConfigFromURL();
  const game = new Game(canvas, ctx, config);

  window.addEventListener("resize", () => { game.resize(); });

  game.start();

  const uiRoot = document.getElementById("ui");
  if (uiRoot === null) throw new Error("#ui not found");

  createRoot(uiRoot).render(
    <StrictMode>
      <GameUI game={game} />
    </StrictMode>,
  );
}

main();
