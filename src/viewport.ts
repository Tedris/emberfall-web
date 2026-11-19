// src/viewport.ts
// Letterbox-free viewport fit (pure math, DOM-free): fit the logical width to
// CSS width (never under the floor), one uniform scale, and let the logical
// height absorb the remaining vertical space. Phones get the full desktop
// composition scaled down instead of a squashed sub-minimum layout.

import Config from "./config";

export interface ViewportFit {
  logical_w: number;
  logical_h: number;
  scale: number;
}

export function fit_viewport(css_w: number, css_h: number): ViewportFit {
  const logical_w = Math.max(css_w, Config.LAYOUT_MIN_WIDTH);
  const scale = css_w / logical_w;
  const logical_h = Math.max(Math.round(css_h / scale), Config.LAYOUT_MIN_HEIGHT);
  return { logical_w, logical_h, scale };
}

export default fit_viewport;
