// src/ui/scene.ts
// Immediate-mode canvas UI. Every frame: clear hit registry, draw, register
// actionable rects with closures. Pointer routing: hits first (topmost wins),
// then the monster rect (battlefield click), else a gauge-only click.
// DOM-free: main.ts supplies the context, dpr transform, and frame dt.

import Config from "../config";
import Format from "../format";
import type { Game } from "../game";
import Effects from "../systems/effects";
import Heroes from "../systems/heroes";
import Souls from "../systems/souls";
import Patrons from "../systems/patrons";
import Godsfall from "../systems/godsfall";
import Zones from "../systems/zones";
import { compute_layout, in_rect, split_row, TABS, type Layout, type Rect } from "./layout";

interface Floater {
  x: number;
  y: number;
  vy: number;
  text: string;
  t: number;
  crit: boolean;
}

const FONT = '"Segoe UI", system-ui, sans-serif';

export class Scene {
  hits: { r: Rect; action: () => void }[] = [];
  floats: Floater[] = [];
  tab = 0;
  touch = false; // set by main from (pointer: coarse)
  info_hero: string | null = null; // expanded hero row
  road_page = 0; // zone-list page in the Road panel (0 = deepest)
  help_open = false;
  private reset_armed_t = 0; // performance.now() of first reset tap
  modal_dismissed = false;
  private monster: Rect = { x: 0, y: 0, w: 0, h: 0 };
  private last_gold = 0;

  draw(ctx: CanvasRenderingContext2D, game: Game, w: number, h: number, dt: number) {
    this.hits = [];
    const L = compute_layout(w, h, this.touch);
    const s = game.state;
    ctx.clearRect(0, 0, w, h);
    this.header(ctx, game, L);
    this.battlefield(ctx, game, L, dt);
    this.panel(ctx, game, L);
    if (this.help_open) this.help(ctx, w, h);
    this.toasts(ctx, game, w);
    this.modal(ctx, game, w, h);
  }

  // ── pieces ─────────────────────────────────────────────────────────────
  private header(ctx: CanvasRenderingContext2D, game: Game, L: Layout) {
    const s = game.state;
    ctx.fillStyle = "#1b1815";
    ctx.fillRect(0, 0, L.header.w, L.header.h);
    this.text(ctx, `Gold  ${Format.number(s.gold)}`, 12, 20, 16, "#e8c46a", "left");
    const d = game.derived();
    const dps = Effects.totalDps(s, d, s.overdrive_gauge);
    this.text(ctx, `DPS ${Format.number(dps)}`, 12, 40, 12, "#9a917f", "left");
    this.text(ctx, `Zone ${s.zone}`, L.header.w - 12, 20, 16, "#cfd6e4", "right");
    this.text(
      ctx,
      `Embers ${Format.number(Math.floor(s.embers))}   Marks ${Format.number(s.marks)}`,
      L.header.w - 12,
      40,
      12,
      "#c98f5a",
      "right",
    );
    // Rekindle button, center
    const bw = 190;
    const bh = L.touch ? 44 : 36;
    const r = { x: L.header.w / 2 - bw / 2, y: (L.header.h - bh) / 2, w: bw, h: bh };
    const can = Souls.canRekindle(s);
    const gain = Souls.embersFromRun(s);
    this.button(
      ctx,
      r,
      can
        ? `REKINDLE  +${Format.number(gain)}✦`
        : gain > 0
          ? `Rekindle at zone ${Config.REKINDLE_MIN_ZONE}`
          : "Push deeper to Rekindle",
      can,
      () => game.rekindle(),
    );
    if (game.session.save_warning)
      this.text(ctx, "save failed!", L.header.w / 2 + bw / 2 + 8, 30, 12, "#e06c5a", "left");
  }

  private battlefield(ctx: CanvasRenderingContext2D, game: Game, L: Layout, dt: number) {
    const s = game.state;
    const b = L.battlefield;
    const biome = Zones.biome(s.zone);
    ctx.fillStyle = biome.sky;
    ctx.fillRect(b.x, b.y, b.w, b.h);
    ctx.fillStyle = biome.ground;
    ctx.fillRect(b.x, b.y + b.h * 0.72, b.w, b.h * 0.28);

    // zone track
    this.text(ctx, `— Zone ${s.zone} · ${biome.name} —`, b.x + b.w / 2, b.y + 26, 15, "#c8ccd8");
    const cx = b.x + b.w / 2;
    const my = b.y + b.h * 0.52;

    // monster
    const mw = Math.min(b.w * 0.34, 190) * (s.monster_is_boss ? 1.35 : 1);
    const mh = mw * 0.9;
    this.monster = { x: cx - mw / 2, y: my - mh / 2, w: mw, h: mh };
    if (s.respawn_timer <= 0 && s.monster_hp > 0) {
      ctx.save();
      ctx.fillStyle = s.monster_primal ? "#d9822b" : "#0d0c10";
      ctx.strokeStyle = s.monster_primal ? "#ffb060" : biome.ground;
      ctx.lineWidth = 2;
      const { x, y, w, h } = this.monster;
      ctx.beginPath(); // lumpy blob, seed-stable silhouette
      const pts = 14;
      for (let i = 0; i <= pts; i++) {
        const a = (i / pts) * Math.PI * 2;
        const wob =
          1 + 0.13 * Math.sin(a * 3 + s.zone) + 0.08 * Math.sin(a * 5 - s.zone * 2);
        const px = x + w / 2 + Math.cos(a) * (w / 2) * wob;
        const py = y + h / 2 + Math.sin(a) * (h / 2) * wob;
        i === 0 ? ctx.moveTo(px, py) : ctx.lineTo(px, py);
      }
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      // eyes
      ctx.fillStyle = s.monster_primal ? "#ffd9a0" : "#c9c4b8";
      ctx.beginPath();
      ctx.arc(x + w * 0.38, y + h * 0.4, mw * 0.045, 0, 7);
      ctx.arc(x + w * 0.62, y + h * 0.4, mw * 0.045, 0, 7);
      ctx.fill();
      ctx.restore();

      // HP bar
      const bar = { x: cx - b.w * 0.3, y: my + mh / 2 + 14, w: b.w * 0.6, h: 16 };
      ctx.fillStyle = "#000a";
      this.rr(ctx, bar, 8);
      ctx.fill();
      const frac = Math.max(0, Math.min(1, s.monster_hp / s.monster_max_hp));
      ctx.fillStyle = s.monster_is_boss ? "#c0504a" : "#7ba05a";
      if (frac > 0) {
        this.rr(ctx, { ...bar, w: bar.w * frac }, 8);
        ctx.fill();
      }
      this.text(
        ctx,
        Format.number(Math.max(0, s.monster_hp)) + " / " + Format.number(s.monster_max_hp) + (s.monster_primal ? "  ✦ revenant" : ""),
        cx,
        bar.y + 12,
        12,
        "#fff",
      );
      if (s.monster_is_boss) {
        const t = Math.max(0, s.boss_timer);
        this.text(ctx, `${t.toFixed(1)}s`, cx, bar.y - 8, 15, t < 6 ? "#e06c5a" : "#e8e2d2");
      }
    } else {
      this.text(ctx, "…", cx, my, 26, "#6a6455");
    }

    // zone status, in one strip under the zone label
    const d = game.derived();
    const need = Zones.killsNeeded(s.zone, d.zone_kills);
    if (!s.monster_is_boss) {
      let dots = "";
      for (let i = 0; i < need; i++) dots += i < s.kills_in_zone ? "●" : "○";
      this.text(ctx, dots, b.x + b.w / 2, b.y + 46, 13, "#e8c46a");
    }
    if (s.streak_letdown)
      this.text(ctx, "held at the wall — farm, grow, return", b.x + b.w / 2, b.y + 64, 13, "#b0876a");

    // two things the player may need telling: fight, or choose
    if (Effects.totalDps(s, d, s.overdrive_gauge) <= 0) {
      this.text(
        ctx,
        "TAP THE MONSTER — nobody holds the road but you",
        b.x + b.w / 2,
        b.y + b.h - 92,
        14,
        "#e8c46a",
      );
    }
    if (s.zone_cleared) {
      const pw = Math.min(280, b.w - 32);
      this.button(
        ctx,
        { x: b.x + (b.w - pw) / 2, y: b.y + b.h - 84, w: pw, h: L.touch ? 44 : 34 },
        "ZONE CLEARED → GO DEEPER",
        true,
        () => game.goDeeper(),
      );
    }

    // overdrive gauge
    const gmax = Config.OVERDRIVE_MAX + d.overdrive_max;
    const g = { x: b.x + 16, y: b.y + b.h - 34, w: Math.min(b.w - 32, 340), h: 14 };
    ctx.fillStyle = "#000a";
    this.rr(ctx, g, 7);
    ctx.fill();
    const armed = s.overdrive_gauge >= gmax * Config.OVERDRIVE_THRESHOLD;
    ctx.fillStyle = armed ? "#e8973a" : "#7a5a3a";
    if (s.overdrive_gauge > 0) {
      this.rr(ctx, { ...g, w: g.w * Math.min(1, s.overdrive_gauge / gmax) }, 7);
      ctx.fill();
    }
    ctx.strokeStyle = "#e8c46a55";
    ctx.beginPath();
    ctx.moveTo(g.x + g.w * Config.OVERDRIVE_THRESHOLD, g.y);
    ctx.lineTo(g.x + g.w * Config.OVERDRIVE_THRESHOLD, g.y + g.h);
    ctx.stroke();
    this.text(
      ctx,
      armed ? "OVERDRIVE ×1.25" : "Overdrive",
      g.x + 4,
      g.y - 5,
      11,
      armed ? "#ffb060" : "#8a8272",
      "left",
    );

    // floaters
    this.floats = this.floats.filter((f) => (f.t -= dt) > 0);
    for (const f of this.floats) {
      f.y += f.vy * dt;
      this.text(ctx, f.text, f.x, f.y, f.crit ? 20 : 14, f.crit ? "#ffd76a" : "#fff8ec");
    }
  }

  // ── panels ─────────────────────────────────────────────────────────────
  private panel(ctx: CanvasRenderingContext2D, game: Game, L: Layout) {
    const p = L.panel;
    ctx.fillStyle = "#1b1815";
    ctx.fillRect(p.x, p.y, p.w, p.h);
    const cells = split_row({ ...L.tabs, w: L.tabs.w - 44 }, TABS.length, 4);
    TABS.forEach((label, i) => {
      const sel = i === this.tab;
      ctx.fillStyle = sel ? "#2e2820" : "#221e19";
      this.rr(ctx, cells[i], 6);
      ctx.fill();
      this.text(
        ctx,
        label,
        cells[i].x + cells[i].w / 2,
        cells[i].y + L.tab_h / 2 + 5,
        13,
        sel ? "#e8c46a" : "#9a917f",
      );
      this.hits.push({ r: cells[i], action: () => (this.tab = i) });
    });
    this.button(
      ctx,
      { x: L.tabs.x + L.tabs.w - 36, y: L.tabs.y, w: 36, h: L.tab_h },
      "?",
      true,
      () => (this.help_open = true),
    );
    const body = { x: p.x + 8, y: L.tabs.y + L.tabs.h + 6, w: p.w - 16, h: p.h - L.tabs.h - 14 };
    if (this.tab === 0) this.company(ctx, game, body, L);
    else if (this.tab === 1) this.road(ctx, game, body, L);
    else if (this.tab === 2) this.patrons(ctx, game, body, L);
    else if (this.tab === 3) this.gods(ctx, game, body);
    else this.stats(ctx, game, body, L);
  }

  private company(ctx: CanvasRenderingContext2D, game: Game, r: Rect, L: Layout) {
    const s = game.state;
    const d = game.derived();
    const d_total = Effects.totalDps(s, d, s.overdrive_gauge);
    const visible = Config.HEROES.filter(
      (h) => s.heroes[h.id].hired || s.gold_ever >= h.cost0,
    );
    // Touch/stacked layouts push buttons to a full-width strip under the
    // name so tap targets keep a sane size at phone scale.
    const tall = L.mode === "tall";
    const row_h = Math.min(L.row_h, Math.max(56, r.h / Math.max(visible.length, 1)));
    const btn_h = Math.min(L.btn_h, Math.max(30, row_h - 26));
    let yy = r.y;
    visible.forEach((h) => {
      const hs = s.heroes[h.id];
      const expanded = this.info_hero === h.id;
      const extra = expanded ? (tall ? 36 : 20) : 0;
      const row: Rect = { x: r.x, y: yy, w: r.w, h: row_h + extra - 4 };
      // upgrade pips row first (small), then name + buttons
      this.text(ctx, h.name, row.x + 2, row.y + 15, 13, hs.hired ? "#e8e2d2" : "#8a8272", "left");
      const share = d_total > 0 ? (Effects.heroDps(s, h.id, d) / d_total) * 100 : 0;
      // Tinder has no DPS of his own — he sells taps, so say that instead of
      // showing a flat "0%".
      const own =
        h.id === "tinder"
          ? `+${Format.number(Config.CLICK_PER_TINDER_LEVEL * hs.level)} on taps`
          : `${share.toFixed(0)}%`;
      const meta = hs.hired ? `Lv ${Format.number(hs.level)} · ${own}` : `hire ${Format.number(h.cost0)}`;
      // Stacked rows keep one text line: name left, status left of the pips.
      if (tall)
        this.text(ctx, meta, row.x + row.w - 98, row.y + 15, 11, "#9a917f", "right");
      else this.text(ctx, meta, row.x + 2, row.y + 31, 11, "#9a917f", "left");
      this.hits.push({
        r: { x: row.x, y: row.y, w: tall ? row.w - 100 : row.w - 210, h: 20 },
        action: () => (this.info_hero = expanded ? null : h.id),
      });
      if (expanded) {
        const dy = row.y + (tall ? 32 : 44);
        this.text(ctx, h.blurb, row.x + 2, dy, 10, "#8a8272", "left");
        const up = Heroes.upgrades().find(
          (u) => u.hero === h.id && !s.upgrades_bought[u.id],
        );
        const power =
          h.id === "tinder"
            ? `Adds ${Format.number(Config.CLICK_PER_TINDER_LEVEL * hs.level)} to every tap`
            : `Deals ${Format.number(Effects.heroDps(s, h.id, d))} DPS`;
        const info = !hs.hired
          ? `Hire for ${Format.number(h.cost0)} — your taps carry the road until then.`
          : `${power} · next: ${
              up ? `${up.effect_text || up.name} @ Lv ${up.unlock_level}` : "fully upgraded"
            }`;
        this.text(ctx, info, row.x + 2, dy + (tall ? 13 : 12), 10, "#9a917f", "left");
      }
      const br: Rect = tall
        ? { x: row.x + 2, y: row.y + row_h + extra - btn_h - 2, w: row.w - 4, h: btn_h }
        : {
            x: row.x + row.w - 208,
            y: row.y + Math.max(6, (row_h - btn_h) / 2),
            w: 208,
            h: btn_h,
          };
      if (!hs.hired) {
        this.button(ctx, { ...br, x: br.x + br.w - 104 }, `HIRE`, s.gold >= h.cost0, () =>
          game.hire(h.id),
        );
      } else {
        const cells = split_row(br, 4, 4);
        const steps: (number | "max")[] = [1, 10, 25, "max"];
        steps.forEach((step, k) => {
          const n = step === "max" ? Heroes.maxAffordable(h.id, hs.level, s.gold) : step;
          const cost = Heroes.levelCost(h.id, hs.level, Math.max(1, n));
          const label = step === "max" ? (n > 0 ? `MAX×${Format.number(n)}` : "MAX") : `+${step}`;
          this.button(ctx, cells[k], label, s.gold >= cost, () =>
            game.buyLevels(h.id, Math.max(1, n)),
          );
          if (!tall)
            this.text(
              ctx,
              Format.number(cost),
              cells[k].x + cells[k].w / 2,
              cells[k].y + cells[k].h + 11,
              9,
              s.gold >= cost ? "#a89f8a" : "#5f584c",
            );
        });
      }
      // upgrade pips
      const pip = tall
        ? { x: row.x + row.w - 94, y: row.y + 6, w: 18, h: 12 }
        : { x: row.x + 2, y: row.y + row.h - 12, w: 18, h: 12 };
      Config.UPGRADE_TIERS.forEach((t, tier) => {
        const id = `${h.id}:${tier}`;
        const bought = !!s.upgrades_bought[id];
        const unlocked = hs.hired && hs.level >= t.unlock_level;
        const afford = s.gold >= Heroes.upgradeCost(s, id);
        const pr = { ...pip, x: pip.x + tier * 22 };
        ctx.fillStyle = bought ? "#5a7a4a" : unlocked ? (afford ? "#c9a24a" : "#4a4238") : "#2a2622";
        this.rr(ctx, pr, 3);
        ctx.fill();
        if (bought) this.text(ctx, "✓", pr.x + 9, pr.y + 10, 10, "#dff0d0");
        if (unlocked && !bought)
          this.hits.push({
            r: pr,
            action: () => {
              game.buyUpgrade(id);
            },
          });
      });
      yy = row.y + row_h + extra;
    });
    if (visible.length === 0) {
      this.text(ctx, "Nobody holds the road but you.", r.x + r.w / 2, r.y + 40, 14, "#e8c46a");
      this.text(
        ctx,
        "Tap the monster — gold from the first kills hires the Company.",
        r.x + r.w / 2,
        r.y + 62,
        12,
        "#9a917f",
      );
    }
    // Steward toggle at the panel foot
    const foot: Rect = {
      x: r.x,
      y: r.y + r.h - (L.touch ? 40 : 30),
      w: L.touch ? 280 : 220,
      h: L.btn_h,
    };
    const owned = s.steward;
    this.button(
      ctx,
      foot,
      owned ? "Steward: ON" : `Steward — keep buying (${Config.STEWARD_COST}✦)`,
      owned || s.embers >= Config.STEWARD_COST,
      () => game.setSteward(!owned),
    );
  }

  // The Road: where you stand, what standing here pays, and whether the road
  // walks on without you. Clicker Heroes locks its farm/progress choice behind
  // zone 100 and never lets you pick a zone; this one is open from zone 1, and
  // holding is safe by construction — a held zone spawns no timed boss.
  private road(ctx: CanvasRenderingContext2D, game: Game, r: Rect, L: Layout) {
    const s = game.state;
    const d = game.derived();
    const row_h = L.touch ? 44 : 26;
    const need = Zones.killsNeeded(s.zone, d.zone_kills);
    this.text(ctx, `Zone ${s.zone} · ${Zones.biome(s.zone).name}`, r.x + 2, r.y + 14, 13, "#e8e2d2", "left");
    this.text(ctx, `deepest ${Format.number(s.frontier_zone)}`, r.x + r.w - 2, r.y + 14, 12, "#9a917f", "right");

    // the two decisions, the biggest thing on the panel
    const decide = split_row({ x: r.x, y: r.y + 22, w: r.w, h: row_h }, 2, 6);
    this.button(ctx, decide[0], "GO DEEPER →", s.zone_cleared, () => game.goDeeper());
    this.button(
      ctx,
      decide[1],
      s.auto_advance ? "Auto-advance: ON" : "Auto-advance: OFF",
      true,
      () => game.setAutoAdvance(!s.auto_advance),
    );

    let y = r.y + 22 + row_h + 14;
    this.text(
      ctx,
      s.zone_cleared
        ? "Zone cleared. The road holds here — farm on, or go deeper."
        : `Kill ${need} here to clear the zone (${Math.min(s.kills_in_zone, need)}/${need}).`,
      r.x + 2,
      y,
      11,
      s.zone_cleared ? "#e8c46a" : "#9a917f",
      "left",
    );
    y += 16;
    // What standing here pays: farming should be arithmetic, not folklore.
    const cycle =
      Zones.monsterHp(s.zone, false) /
        Math.max(Effects.totalDps(s, d, s.overdrive_gauge), 1e-300) +
      Zones.respawnDelay(d.respawn);
    this.text(
      ctx,
      `≈ ${Format.number((Zones.goldFor(s.zone, false) * d.gold * 3600) / cycle)} gold/h here`,
      r.x + 2,
      y,
      11,
      "#9a917f",
      "left",
    );
    y += 10;

    const step = split_row({ x: r.x, y, w: r.w, h: row_h }, 3, 6);
    this.button(ctx, step[0], `◀ ${Math.max(1, s.zone - 1)}`, s.zone > 1, () =>
      game.travel(s.zone - 1),
    );
    this.button(ctx, step[1], "deepest", s.zone < s.frontier_zone, () =>
      game.travel(s.frontier_zone),
    );
    this.button(ctx, step[2], `${Math.min(s.frontier_zone, s.zone + 1)} ▶`, s.zone < s.frontier_zone, () =>
      game.travel(s.zone + 1),
    );
    y += row_h + 8;

    // …or jump straight to any zone you have reached. ★ marks a boss zone:
    // 10× gold, and past zone 100 it may be holding a Revenant.
    const cols = L.touch ? 4 : 6;
    const cell_h = L.touch ? 40 : 26;
    const reserve = L.touch ? 46 : 32;
    const rows = Math.max(0, Math.min(3, Math.floor((r.y + r.h - y - reserve) / (cell_h + 4))));
    if (rows === 0) return;
    const span = cols * rows;
    const page = Math.min(this.road_page, Math.max(0, Math.floor((s.frontier_zone - 1) / span)));
    const hi = s.frontier_zone - page * span;
    const lo = Math.max(1, hi - span + 1);
    const cell_w = r.w / cols;
    for (let i = 0; i < span; i++) {
      const z = lo + i;
      if (z > hi) break;
      const cell: Rect = {
        x: r.x + (i % cols) * cell_w,
        y: y + Math.floor(i / cols) * (cell_h + 4),
        w: cell_w - 4,
        h: cell_h,
      };
      const here = z === s.zone;
      this.button(
        ctx,
        cell,
        `${z}${Zones.isBossZone(z) ? " ★" : ""}${here ? " •" : ""}`,
        !here,
        () => game.travel(z),
      );
    }
    const nav = split_row(
      { x: r.x, y: y + rows * (cell_h + 4) + 2, w: r.w, h: L.touch ? 36 : 24 },
      2,
      6,
    );
    this.button(ctx, nav[0], "‹ deeper zones", page > 0, () => (this.road_page = page - 1));
    this.button(ctx, nav[1], "earlier zones ›", lo > 1, () => (this.road_page = page + 1));
  }

  private help(ctx: CanvasRenderingContext2D, w: number, h: number) {
    ctx.fillStyle = "rgba(8, 7, 6, 0.88)";
    ctx.fillRect(0, 0, w, h);
    this.text(ctx, "How Emberfall works", w / 2, h / 2 - 100, 17, "#e8c46a");
    const lines = [
      "Your taps kill the first monsters — nobody is hired yet.",
      "Gold hires the Company: heroes add DPS of their own, and every",
      "tap keeps landing a slice of health that fades deeper in.",
      "Levels buy damage, the pips buy multipliers. Tap a name for more.",
      "Bosses guard every 5th zone: 30s, or the road sets you back one.",
      "The Road tab: revisit any zone you reached, hold to farm, or auto.",
      "Rekindle (top) burns the run for Embers — the real currency.",
    ];
    lines.forEach((t, i) =>
      this.text(ctx, t, w / 2, h / 2 - 64 + i * 22, 12, "#cfc8b8"),
    );
    this.text(ctx, "tap anywhere to close", w / 2, h / 2 + 100, 12, "#8a8272");
    this.hits.push({
      r: { x: 0, y: 0, w, h },
      action: () => (this.help_open = false),
    });
  }

  private patrons(ctx: CanvasRenderingContext2D, game: Game, r: Rect, L: Layout) {
    const s = game.state;
    const offers = Patrons.offers(s);
    const sum_cost = Patrons.summonCost(s);
    this.text(ctx, `Summon (${Format.number(sum_cost)}✦) — reroll ${Format.number(Patrons.rerollCost(s))}✦`, r.x + 2, r.y + 14, 12, "#9a917f", "left");
    const card_h = L.touch ? 92 : 74;
    const ctl_h = L.touch ? 36 : 26;
    const cards = split_row({ ...r, y: r.y + 24, h: card_h }, 4, 6);
    offers.forEach((id, i) => {
      const def = Config.PATRONS.find((p) => p.id === id)!;
      const c = cards[i];
      ctx.fillStyle = "#221e19";
      this.rr(ctx, c, 8);
      ctx.fill();
      this.text(ctx, def.name, c.x + c.w / 2, c.y + 26, 14, "#e8c46a");
      this.text(ctx, def.epithet, c.x + c.w / 2, c.y + 44, 10, "#9a917f");
      const buy: Rect = {
        x: c.x + 8,
        y: c.y + c.h - (L.touch ? 44 : 26),
        w: c.w - 16,
        h: L.touch ? 36 : 20,
      };
      this.button(ctx, buy, "SUMMON", s.embers >= sum_cost, () => game.summonPatron(id));
    });
    const ctl = split_row({ x: r.x, y: r.y + 34 + card_h, w: r.w, h: ctl_h }, 2, 6);
    this.button(ctx, ctl[0], "Reroll offers", s.embers >= Patrons.rerollCost(s), () => game.rerollOffers());
    this.button(ctx, ctl[1], "Respec (refund 75%)", true, () => game.respecPatrons());

    const owned = Object.entries(s.patrons).filter(([, l]) => l > 0);
    let y = r.y + 34 + card_h + ctl_h + 12;
    for (const [id, level] of owned) {
      const def = Config.PATRONS.find((p) => p.id === id)!;
      const row: Rect = { x: r.x, y, w: r.w, h: L.touch ? 58 : 46 };
      this.text(ctx, `${def.name} Lv ${Format.number(level)}`, row.x + 2, row.y + 15, 13, "#e8e2d2", "left");
      const ev = Patrons.effectValue(s, id);
      this.text(ctx, patronText(id, ev?.value ?? 0), row.x + 2, row.y + 31, 10, "#9a917f", "left");
      const br = {
        x: row.x + row.w - 158,
        y: row.y + (L.touch ? 14 : 10),
        w: 158,
        h: L.touch ? 36 : 24,
      };
      const cells = split_row(br, 3, 4);
      ([1, 10, "max"] as (number | "max")[]).forEach((step, k) => {
        const n = step === "max" ? Patrons.maxAffordable(s, id, s.embers) : step;
        const cost = Patrons.levelCost(s, id, level, Math.max(1, n));
        this.button(
          ctx,
          cells[k],
          step === "max" ? (n > 0 ? `MAX×${Format.number(n)}` : "MAX") : `+${step}`,
          s.embers >= cost,
          () => game.levelPatron(id, Math.max(1, n)),
        );
        this.text(ctx, Format.number(cost), cells[k].x + cells[k].w / 2, cells[k].y + cells[k].h + 10, 8, "#a89f8a");
      });
      y += L.touch ? 62 : 50;
    }
  }

  private gods(ctx: CanvasRenderingContext2D, game: Game, r: Rect) {
    const s = game.state;
    if (!Godsfall.available(s)) {
      this.text(ctx, `The Fallen wait beyond zone ${Config.GODSFALL_MIN_ZONE}.`, r.x + r.w / 2, r.y + r.h / 2, 14, "#8a8272");
      return;
    }
    const pending = Godsfall.pendingMarks(s);
    this.text(
      ctx,
      `Marks ${Format.number(s.marks)}  (Fall now: +${Format.number(pending)})   Fallen Power ${(Godsfall.fp(s) * 100).toFixed(1)}%`,
      r.x + 2,
      r.y + 14,
      12,
      "#c98f5a",
      "left",
    );
    const fb: Rect = { x: r.x + r.w - 150, y: r.y + 30, w: 150, h: 30 };
    this.button(ctx, fb, "THE GODSFALL", pending > 0 || true, () => game.performGodsfall());
    this.text(ctx, "burns patrons & embers; never marks", fb.x + fb.w / 2, fb.y - 6, 9, "#7a7264");
    let y = r.y + 76;
    for (const g of Config.GODS) {
      const lvl = s.gods[g.id] ?? 0;
      const row: Rect = { x: r.x, y, w: r.w, h: 46 };
      this.text(ctx, g.name, row.x + 2, row.y + 15, 13, "#e8e2d2", "left");
      this.text(ctx, godText(g.id, lvl), row.x + 2, row.y + 31, 10, "#9a917f", "left");
      const br = { x: row.x + row.w - 110, y: row.y + 10, w: 110, h: 24 };
      const cells = split_row(br, 2, 4);
      ([1, "max"] as (number | "max")[]).forEach((step, k) => {
        const n = step === "max" ? Godsfall.maxAffordable(s, g.id) : step;
        const cost = Godsfall.levelCost(s, g.id, lvl, Math.max(1, n));
        this.button(
          ctx,
          cells[k],
          step === "max" ? (n > 0 ? `MAX×${n}` : "MAX") : "+1",
          s.marks >= cost,
          () => game.levelGod(g.id, Math.max(1, n)),
        );
        this.text(ctx, Format.number(cost), cells[k].x + cells[k].w / 2, cells[k].y + cells[k].h + 10, 8, "#a89f8a");
      });
      y += 50;
    }
  }

  private stats(ctx: CanvasRenderingContext2D, game: Game, r: Rect, L: Layout) {
    const s = game.state;
    const rows = [
      ["Best zone", Format.number(s.best_zone)],
      ["Best zone (after a Godsfall)", Format.number(s.best_zone_god)],
      ["Rekindlings", Format.number(s.rekindles)],
      ["Godsfalls", Format.number(s.godsfall_count)],
      ["Lifetime Embers", Format.number(s.embers_lifetime)],
      ["Kills", Format.number(s.kills)],
      ["Clicks", Format.number(s.clicks)],
      ["Play time", Format.clock(s.play_time)],
    ];
    rows.forEach(([k, v], i) => {
      const y = r.y + 18 + i * 26;
      this.text(ctx, k as string, r.x + 2, y, 13, "#9a917f", "left");
      this.text(ctx, v as string, r.x + r.w - 2, y, 13, "#e8e2d2", "right");
    });
    // Utility foot: manual save + two-tap hard reset (dev/QA friendly).
    const armed = performance.now() - this.reset_armed_t < 5000;
    const foot: Rect = {
      x: r.x,
      y: r.y + r.h - (L.touch ? 44 : 34),
      w: r.w,
      h: L.btn_h,
    };
    const cells = split_row(foot, 2, 8);
    this.button(ctx, cells[0], "Save now", true, () => {
      game.saveNow();
      game.toast("Saved");
    });
    this.button(ctx, cells[1], armed ? "Really wipe EVERYTHING?" : "Reset", true, () => {
      if (armed) {
        game.hardReset();
        this.reset_armed_t = 0;
        this.tab = 0;
        this.info_hero = null;
        game.toast("A fresh ember");
      } else {
        this.reset_armed_t = performance.now();
      }
    });
  }

  // ── overlays ───────────────────────────────────────────────────────────
  private toasts(ctx: CanvasRenderingContext2D, game: Game, w: number) {
    game.session.toasts.forEach((t, i) => {
      const y = 70 + i * 26;
      ctx.fillStyle = "#000c";
      this.rr(ctx, { x: w - 344, y: y - 16, w: 336, h: 22 }, 6);
      ctx.fill();
      this.text(ctx, t.msg, w - 176, y, 12, "#ffd9a0");
    });
  }

  private modal(ctx: CanvasRenderingContext2D, game: Game, w: number, h: number) {
    const rep = game.session.offline_report;
    if (!rep || this.modal_dismissed || rep.seconds < Config.OFFLINE_SKIP_SECONDS) return;
    ctx.fillStyle = "#000c";
    ctx.fillRect(0, 0, w, h);
    const box: Rect = { x: w / 2 - 220, y: h / 2 - 110, w: 440, h: 220 };
    ctx.fillStyle = "#221e19";
    this.rr(ctx, box, 12);
    ctx.fill();
    this.text(ctx, "While the ember slept", box.x + box.w / 2, box.y + 36, 18, "#e8c46a");
    this.text(ctx, `away ${Format.clock(rep.seconds)}  ·  cap ${Config.OFFLINE_CAP_HOURS}h`, box.x + box.w / 2, box.y + 62, 12, "#9a917f");
    this.text(ctx, `Gold  ${Format.number(rep.gold)}`, box.x + box.w / 2, box.y + 90, 14, "#e8c46a");
    this.text(
      ctx,
      rep.stuck_at ? `held at zone ${rep.stuck_at} wall` : `advanced ${Format.number(rep.zones)} zones`,
      box.x + box.w / 2,
      box.y + 112,
      12,
      rep.stuck_at ? "#b0876a" : "#9a917f",
    );
    this.button(ctx, { x: box.x + box.w / 2 - 80, y: box.y + 150, w: 160, h: 36 }, "Back to the road", true, () => {
      this.modal_dismissed = true;
      game.session.offline_report = null;
    });
  }

  // ── widgets ────────────────────────────────────────────────────────────
  button(ctx: CanvasRenderingContext2D, r: Rect, label: string, enabled: boolean, action: () => void) {
    ctx.fillStyle = enabled ? "#3a3226" : "#242018";
    this.rr(ctx, r, 6);
    ctx.fill();
    ctx.strokeStyle = enabled ? "#c9a24a88" : "#3a342a";
    ctx.lineWidth = 1;
    this.rr(ctx, r, 6);
    ctx.stroke();
    this.text(ctx, label, r.x + r.w / 2, r.y + r.h / 2 + 4, Math.min(12, r.h * 0.45), enabled ? "#e8dcc0" : "#5f584c");
    if (enabled) this.hits.push({ r, action });
  }

  text(
    ctx: CanvasRenderingContext2D,
    str: string,
    x: number,
    y: number,
    size: number,
    color: string,
    align: CanvasTextAlign = "center",
  ) {
    ctx.font = `${size}px ${FONT}`;
    ctx.fillStyle = color;
    ctx.textAlign = align;
    ctx.textBaseline = "alphabetic";
    ctx.fillText(str, x, y);
  }

  rr(ctx: CanvasRenderingContext2D, r: Rect, rad: number) {
    ctx.beginPath();
    ctx.roundRect(r.x, r.y, r.w, r.h, rad);
  }

  // ── input ──────────────────────────────────────────────────────────────
  // Returns true when a UI hit or monster click consumed the press.
  pointer(x: number, y: number, game: Game): "ui" | "monster" {
    for (let i = this.hits.length - 1; i >= 0; i--) {
      if (in_rect(x, y, this.hits[i].r)) {
        this.hits[i].action();
        return "ui";
      }
    }
    if (in_rect(x, y, this.monster)) {
      const res = game.click(true);
      if (res.landed)
        this.floats.push({
          x: x + (Math.random() * 40 - 20),
          y: y - 10,
          vy: -40,
          text: (res.crit ? "✸ " : "") + Format.number(res.damage),
          t: 0.8,
          crit: res.crit,
        });
      return "monster";
    }
    // anywhere else is a whiff: no damage, no momentum
    return "ui";
  }
}

function patronText(id: string, v: number): string {
  switch (id) {
    case "vessa": return `+${(v * 100).toFixed(0)}% damage`;
    case "brann": return `+${(v * 100).toFixed(0)}% click damage`;
    case "olok": return `+${(v * 100).toFixed(0)}% gold`;
    case "myrr": return `+${(v * 100).toFixed(0)}% damage per banked Ember`;
    case "sable": return `+${v.toFixed(0)}× … crit ×${(v).toFixed(2)}`;
    case "grith": return `+${(v * 100).toFixed(1)}% damage per Overdrive second`;
    case "hod": return `patron levels ${((v) * 100).toFixed(1)}% cheaper`;
    case "kaev": return `+${v.toFixed(1)}s boss timer`;
    case "nulu": return `−${Math.floor(v)} monsters per zone`;
    case "whur": return `+${v.toFixed(0)} revenant chance`;
    default: return "";
  }
}

function godText(id: string, lvl: number): string {
  switch (id) {
    case "moloch": return `+${(lvl * 100).toFixed(0)}% damage`;
    case "syth": return lvl > 0 ? `patron levels ${((1 - Math.pow(0.95, lvl)) * 100).toFixed(0)}% cheaper` : "makes patron levels cheaper";
    case "vhor": return `+${(lvl * 100).toFixed(0)}% revenant Embers`;
    default: return "";
  }
}

export default Scene;
