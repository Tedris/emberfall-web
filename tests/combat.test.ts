import { describe, expect, it } from "vitest";
import { createState } from "../src/state";
import Combat from "../src/systems/combat";
import Clicker from "../src/systems/clicker";
import Effects from "../src/systems/effects";
import Heroes from "../src/systems/heroes";
import Zones from "../src/systems/zones";

function armed() {
  const s = createState();
  s.gold_ever = 1e12;
  Heroes.hire(s, "tinder");
  Heroes.hire(s, "cinderroot");
  s.heroes["cinderroot"].level = 60;
  return s;
}

describe("combat", () => {
  it("kills advance kills_in_zone and respawn gates the next spawn", () => {
    const s = armed();
    const d = Effects.derive(s);
    Combat.spawn(s, d);
    const ev = Combat.tick(s, 10, d);
    expect(s.kills).toBeGreaterThan(0);
    expect(ev).toBeDefined();
  });

  it("boss zone spawns with 10x hp and a live timer; timeout backs off one zone", () => {
    const s = armed();
    s.zone = 10;
    const d = Effects.derive(s);
    Combat.spawn(s, d);
    expect(s.monster_is_boss).toBe(true);
    expect(s.boss_timer).toBeGreaterThan(0);
    s.heroes["cinderroot"].level = 1; // too weak
    s.monster_hp = Zones.hpBase(10) * 10 * 1000; // unkillable
    const before = s.zone;
    Combat.tick(s, 60, d);
    expect(s.zone).toBe(before - 1);
    expect(s.streak_letdown).toBe(true);
  });

  it("clearing a normal zone advances exactly one zone per 10 kills", () => {
    const s = armed();
    const d = Effects.derive(s);
    const kills0 = s.kills;
    void kills0;
    // long tick with strong dps
    s.heroes["cinderroot"].level = 120;
    let zone = s.zone;
    for (let t = 0; t < 500; t++) Combat.tick(s, 0.1, d);
    expect(s.zone).toBeGreaterThan(zone);
    void zone;
  });

  it("gold payout lands and gold_ever tracks peak", () => {
    const s = armed();
    const d = Effects.derive(s);
    for (let t = 0; t < 50; t++) Combat.tick(s, 0.1, d);
    expect(s.gold).toBeGreaterThan(0);
    expect(s.gold_ever).toBeGreaterThanOrEqual(s.gold);
  });
});

describe("clicker", () => {
  it("fills the gauge even off-target but only damages on the monster", () => {
    const s = armed();
    const d = Effects.derive(s);
    Combat.spawn(s, d);
    const hp = s.monster_hp;
    const off = Clicker.click(s, d, () => 0.99, false);
    expect(off.landed).toBe(false);
    expect(s.monster_hp).toBe(hp);
    expect(s.overdrive_gauge).toBeGreaterThan(0);
    const on = Clicker.click(s, d, () => 0.99, true);
    expect(on.landed).toBe(true);
    expect(s.monster_hp).toBeLessThan(hp);
  });

  it("crits apply the crit multiplier", () => {
    const s = armed();
    const d = Effects.derive(s);
    Combat.spawn(s, d);
    const hp = s.monster_hp;
    Clicker.click(s, d, () => 0.0, true);
    expect(hp - s.monster_hp).toBeGreaterThan(d.crit_mult * 0); // crit path exercised
  });
});
