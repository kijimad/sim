import { StrictMode, useState } from "react";
import { createRoot } from "react-dom/client";
import type { GameConfig } from "./game.js";
import { Game } from "./game.js";
import { configFromURL } from "./game-url.js";
import { GameUI } from "./ui/GameUI.js";
import { WorldSetup } from "./ui/WorldSetup.js";
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

function App() {
  const [game, setGame] = useState<Game | null>(null);

  // URLにdebugパラメータがある場合は直接起動する
  const urlConfig = configFromURL();
  if (game === null && urlConfig.debug) {
    const { canvas, ctx } = getCanvas();
    const g = new Game(canvas, ctx, urlConfig);
    g.start();
    window.addEventListener("resize", () => { g.resize(); });
    setGame(g);
  }

  const startGame = (config: GameConfig): void => {
    const { canvas, ctx } = getCanvas();
    const g = new Game(canvas, ctx, config);
    g.start();
    window.addEventListener("resize", () => { g.resize(); });
    setGame(g);
  };

  if (game === null) {
    return <WorldSetup onStart={startGame} />;
  }

  return <GameUI game={game} />;
}

function main(): void {
  const uiRoot = document.getElementById("ui");
  if (uiRoot === null) throw new Error("#ui not found");

  createRoot(uiRoot).render(
    <StrictMode>
      <App />
    </StrictMode>,
  );
}

main();
