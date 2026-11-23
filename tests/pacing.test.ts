// Integration pacing guard: the tuning must keep the run moving. These
// thresholds are the contract from docs/DESIGN.md — if a rebalance breaks the
// first-act curve, this test fails loudly. Sim time, not wall time.

import { describe, expect, it } from "vitest";
import { createState } from "../src/state";
import Effects from "../src/systems/effects";
import Combat from "../src/systems/combat";
import Heroes from "../src/systems/heroes";
import Souls from "../src/systems/souls";
import Clicker from "../src/systems/clicker";

function simulate(
  minutes: number,
  active: boolean,
  rekindleAt = 0,
  log = false,
): { maxZone: number; rekindles: number; s: ReturnType<typeof createState> } {
  const s = createState();
  s.steward = true;
  // The hands-off contract assumes progress mode: a player who walks away
  // leaves the road walking (buying the Steward sets this for real players).
  s.auto_advance = true;
  const step = 0.25;
  const total = minutes * 60;
  let maxZone = 1;
  let rekindles = 0;
  let rng = 0;
  const rand = () => (rng = (Math.imul(rng, 1664525) + 1013904223) >>> 0) / 4294967296;
  const marks: Record<string, number> = {};
  // Nobody is hired at zone 1, so the opening belongs to a player with hands
  // on the glass: tap until the Company has its first two blades, and only
  // then start the clock this guard measures.
  if (!active) {
    for (let t = 0; t < 600 && !s.heroes["cinderroot"].hired; t += step) {
      for (const id of ["tinder", "cinderroot"]) {
        if (!s.heroes[id].hired && Heroes.canSee(s, id)) Heroes.hire(s, id);
      }
      const d0 = Effects.derive(s);
      for (let c = 0; c < 2; c++) Clicker.click(s, d0, rand, true);
      Combat.tick(s, step);
    }
  }
  for (let t = 0; t < total; t += step) {
    for (const id of Object.keys(s.heroes)) {
      if (!s.heroes[id].hired && Heroes.canSee(s, id)) Heroes.hire(s, id);
    }
    Heroes.stewardTick(s);
    if (active) {
      // 10 clicks/s through the real click path (gauge + crit), and a present
      // player also levels Tinder by hand — the steward skips him on purpose.
      const d = Effects.derive(s);
      Heroes.buy(
        s,
        "tinder",
        Heroes.maxAffordable("tinder", s.heroes["tinder"].level, s.gold),
      );
      for (let c = 0; c < 2; c++) Clicker.click(s, d, rand, true);
    }
    Combat.tick(s, step);
    maxZone = Math.max(maxZone, s.zone);
    if (rekindleAt > 0 && s.zone >= rekindleAt) {
      if (Souls.rekindle(s) > 0) {
        rekindles++;
        maxZone = 1;
      }
    }
    for (const [label, at] of [
      ["5m", 300],
      ["10m", 600],
      ["20m", 1200],
      ["30m", 1800],
      ["60m", 3600],
    ] as const) {
      if (Math.abs(t - at) < step / 2) marks[label] = maxZone;
    }
  }
  if (log) console.log(active ? "active" : "idle", marks);
  return { maxZone, rekindles, s };
}

describe("pacing", () => {
  it("a hands-off run walks to ~zone 10 in ten minutes and ~34 in an hour (idle+steward)", () => {
    const { maxZone } = simulate(10, false, 0, true);
    expect(maxZone).toBeGreaterThanOrEqual(10);
    const { maxZone: mz2 } = simulate(60, false);
    expect(mz2).toBeGreaterThanOrEqual(30);
  });

  it("a present player (10 cps + Tinder levels) is meaningfully faster early", () => {
    const idle = simulate(6, false).maxZone;
    const active = simulate(6, true).maxZone;
    expect(active).toBeGreaterThan(idle + 2);
  });

  it("a hands-off six hours reaches the Rekindle gate and gets paid new ground", () => {
    const { s, rekindles } = simulate(360, false, 60);
    expect(rekindles).toBeGreaterThan(0);
    // floor(60 / EMBER_ZONE_DIVISOR) of new ground, plus the level term
    expect(s.embers_lifetime).toBeGreaterThanOrEqual(5);
    expect(Number.isFinite(s.gold)).toBe(true);
    expect(Number.isFinite(s.monster_max_hp)).toBe(true);
  });
});
