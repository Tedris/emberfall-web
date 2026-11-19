// src/ui/layout.ts
// Pure layout: every rect the scene draws, from the logical viewport. One
// rule decides wide (side-by-side) vs tall (stacked) composition so the same
// code serves desktop and phone.

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface Layout {
  mode: "wide" | "tall";
  header: Rect;
  battlefield: Rect;
  panel: Rect;
  tabs: Rect;
  tab_h: number;
}

export const TABS = ["Company", "Patrons", "Gods", "Stats"] as const;

export function compute_layout(w: number, h: number): Layout {
  const header: Rect = { x: 0, y: 0, w, h: 52 };
  const wide = w >= 860;
  const tab_h = 30;
  let battlefield: Rect;
  let panel: Rect;
  if (wide) {
    const pw = Math.min(560, w * 0.44);
    battlefield = { x: pw, y: header.h, w: w - pw, h: h - header.h };
    panel = { x: 0, y: header.h, w: pw, h: h - header.h };
  } else {
    const bh = Math.round(h * 0.46);
    battlefield = { x: 0, y: header.h, w, h: bh - header.h };
    panel = { x: 0, y: bh, w, h: h - bh };
  }
  const tabs: Rect = { x: panel.x + 8, y: panel.y + 6, w: panel.w - 16, h: tab_h };
  return { mode: wide ? "wide" : "tall", header, battlefield, panel, tabs, tab_h };
}

export function split_row(r: Rect, cols: number, gap = 6): Rect[] {
  const w = (r.w - gap * (cols - 1)) / cols;
  return Array.from({ length: cols }, (_, i) => ({ x: r.x + i * (w + gap), y: r.y, w, h: r.h }));
}

export function in_rect(x: number, y: number, r: Rect): boolean {
  return x >= r.x && x < r.x + r.w && y >= r.y && y < r.y + r.h;
}
