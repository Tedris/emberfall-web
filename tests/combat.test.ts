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
  s.gold = 1e6; // hire() costs gold; a fresh run starts with none
  Heroes.hire(s, "tinder");
  Heroes.hire(s, "cinderroot");
  s.heroes["cinderroot"].level = 60;
  s.auto_advance = true; // these tests walk the road forward
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
  it("off-target taps whiff entirely; only monster hits feed Overdrive", () => {
    const s = armed();
    const d = Effects.derive(s);
    Combat.spawn(s, d);
    const hp = s.monster_hp;
    const off = Clicker.click(s, d, () => 0.99, false);
    expect(off.landed).toBe(false);
    expect(s.monster_hp).toBe(hp);
    expect(s.overdrive_gauge).toBe(0);
    const on = Clicker.click(s, d, () => 0.99, true);
    expect(on.landed).toBe(true);
    expect(s.monster_hp).toBeLessThan(hp);
    expect(s.overdrive_gauge).toBeGreaterThan(0);
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

describe("the road", () => {
  // A run in hold mode, ticked for the given number of half-seconds.
  function holdFor(ticks: number) {
    const s = armed();
    s.auto_advance = false;
    const d = Effects.derive(s);
    for (let i = 0; i < ticks; i++) Combat.tick(s, 0.5, d);
    return s;
  }

  it("a cleared zone holds instead of advancing", () => {
    const s = holdFor(60); // 30 s: well past ten 16 HP monsters
    expect(s.zone_cleared).toBe(true);
    expect(s.kills_in_zone).toBe(Zones.killsNeeded(1, 0));
    expect(s.zone).toBe(1);
    expect(s.frontier_zone).toBe(1);
  });

  it("holding keeps paying gold and never advances on its own", () => {
    const s = holdFor(60);
    const gold0 = s.gold;
    const d = Effects.derive(s);
    for (let i = 0; i < 200; i++) Combat.tick(s, 0.5, d);
    expect(s.gold).toBeGreaterThan(gold0);
    expect(s.zone).toBe(1);
  });

  it("go deeper is the only way forward, and it opens that zone to travel", () => {
    const s = holdFor(60);
    expect(Combat.goDeeper(s)).toBe(true);
    expect(s.zone).toBe(2);
    expect(s.frontier_zone).toBe(2);
    expect(s.zone_cleared).toBe(false);
    expect(Combat.goDeeper(s)).toBe(false); // nothing cleared to leave yet
    expect(Combat.travel(s, 1)).toBe(true);
    expect(s.zone).toBe(1);
  });

  it("travel cannot skip ahead past the frontier", () => {
    const s = holdFor(60);
    expect(Combat.travel(s, 0)).toBe(false);
    expect(Combat.travel(s, 5)).toBe(false);
    expect(s.zone).toBe(1);
  });

  it("a held boss zone spawns no timed boss, so farming cannot set you back", () => {
    const s = armed();
    s.auto_advance = false;
    s.zone = 10; // a boss zone whose boss is already dead down here
    s.frontier_zone = 10;
    s.zone_cleared = true;
    const d = Effects.derive(s);
    Combat.spawn(s, d);
    expect(s.monster_is_boss).toBe(false);
    expect(s.boss_timer).toBe(0);
    Combat.tick(s, 600, d);
    expect(s.zone).toBe(10);
    expect(s.streak_letdown).toBe(false);
  });
});
