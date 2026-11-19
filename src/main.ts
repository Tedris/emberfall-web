// src/main.ts
// Browser shell: canvas, viewport fit, fixed-ish rAF loop, pointer/keyboard
// routing into Game/Scene, and save-on-hide.

import Game from "./game";
import Scene from "./ui/scene";
import fit_viewport from "./viewport";

declare global { interface Window { game: Game; scene: Scene } }

const canvas = document.getElementById("game") as HTMLCanvasElement;
const ctx = canvas.getContext("2d")!;
const game = new Game(localStorage, () => Date.now() / 1000);
window.game = game;
const scene = new Scene();
window.scene = scene;

let vw = 0;
let vh = 0;
let scale = 1;

function resize() {
  const w = window.innerWidth;
  const h = window.innerHeight;
  const fit = fit_viewport(w, h);
  vw = fit.logical_w;
  vh = fit.logical_h;
  scale = fit.scale;
  const dpr = window.devicePixelRatio || 1;
  canvas.width = Math.round(w * dpr);
  canvas.height = Math.round(h * dpr);
  ctx.setTransform(dpr * scale, 0, 0, dpr * scale, 0, 0);
}
window.addEventListener("resize", resize);
resize();

let last = performance.now();
function frame(t: number) {
  const dt = Math.min(Math.max((t - last) / 1000, 0), 0.25);
  last = t;
  game.tick(dt);
  scene.draw(ctx, game, vw, vh, dt);
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);

canvas.addEventListener("pointerdown", (e) => {
  e.preventDefault();
  scene.pointer(e.clientX / scale, e.clientY / scale, game);
});
canvas.addEventListener("contextmenu", (e) => e.preventDefault());

document.addEventListener("keydown", (e) => {
  if (e.code === "Space" || e.code === "Enter") {
    e.preventDefault();
    game.click(true);
  }
});

window.addEventListener("visibilitychange", () => {
  if (document.hidden) game.saveNow();
});
window.addEventListener("beforeunload", () => game.saveNow());
