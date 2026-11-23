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
  touch: boolean; // coarse pointer: bigger controls and tab targets
  header: Rect;
  battlefield: Rect;
  panel: Rect;
  tabs: Rect;
  tab_h: number;
  row_h: number; // hero-row pitch
  btn_h: number; // buy-button height
}

export const TABS = ["Company", "Road", "Patrons", "Gods", "Stats"] as const;

export function compute_layout(w: number, h: number, touch = false): Layout {
  const header: Rect = { x: 0, y: 0, w, h: touch ? 56 : 52 };
  const wide = w >= 860;
  const tab_h = touch ? 40 : 30;
  let battlefield: Rect;
  let panel: Rect;
  if (wide) {
    const pw = Math.min(560, w * 0.44);
    battlefield = { x: pw, y: header.h, w: w - pw, h: h - header.h };
    panel = { x: 0, y: header.h, w: pw, h: h - header.h };
  } else {
    // Stacked: a short window must not starve the battlefield — floor it at
    // 360 logical px (capped at 62% of height so the panel stays usable).
    const bh = Math.max(
      Math.round(h * 0.46),
      Math.min(360, Math.round(h * 0.62)),
    );
    battlefield = { x: 0, y: header.h, w, h: bh - header.h };
    panel = { x: 0, y: bh, w, h: h - bh };
  }
  const tabs: Rect = { x: panel.x + 8, y: panel.y + 6, w: panel.w - 16, h: tab_h };
  return {
    mode: wide ? "wide" : "tall",
    touch,
    header,
    battlefield,
    panel,
    tabs,
    tab_h,
    row_h: touch ? 80 : 64,
    btn_h: touch ? 44 : 24,
  };
}

export function split_row(r: Rect, cols: number, gap = 6): Rect[] {
  const w = (r.w - gap * (cols - 1)) / cols;
  return Array.from({ length: cols }, (_, i) => ({ x: r.x + i * (w + gap), y: r.y, w, h: r.h }));
}

export function in_rect(x: number, y: number, r: Rect): boolean {
  return x >= r.x && x < r.x + r.w && y >= r.y && y < r.y + r.h;
}
