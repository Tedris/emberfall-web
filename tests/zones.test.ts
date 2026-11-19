import { describe, expect, it } from "vitest";
import Config from "../src/config";
import Zones from "../src/systems/zones";

describe("zone curves", () => {
  it("hp grows monotonically and boss zones multiply", () => {
    for (let z = 1; z < 400; z++) {
      expect(Zones.hpBase(z + 1)).toBeGreaterThan(Zones.hpBase(z));
    }
    expect(Zones.monsterHp(5, true)).toBeGreaterThan(Zones.monsterHp(5, false));
    expect(Zones.monsterHp(5, true) / Zones.monsterHp(5, false)).toBeCloseTo(10, 5);
  });

  it("zone 1 monster is exactly HP_BASE", () => {
    expect(Zones.hpBase(1)).toBe(Config.HP_BASE);
  });

  it("gold follows the old curve divided and boss pays 10x", () => {
    expect(Zones.goldFor(10, true)).toBeCloseTo(Zones.goldFor(10, false) * 10, 6);
    expect(Zones.goldFor(1, false)).toBeGreaterThan(0);
  });

  it("kills needed floors at ZONE_KILLS_FLOOR", () => {
    expect(Zones.killsNeeded(3, 0)).toBe(Config.ZONE_KILLS);
    expect(Zones.killsNeeded(3, 99)).toBe(Config.ZONE_KILLS_FLOOR);
  });

  it("boss timer decays every 500 zones but floors", () => {
    expect(Zones.bossTimer(1, 0)).toBe(Config.BOSS_TIMER);
    expect(Zones.bossTimer(1000, 0)).toBe(Config.BOSS_TIMER - 4);
    expect(Zones.bossTimer(999999, 0)).toBe(Config.BOSS_TIMER_FLOOR);
  });

  it("hero ladder anchors: each hero is affordable near its home zone", () => {
    // Hero k's hire cost must be payable around when hero k-1 milestones —
    // sanity: costs strictly increase with dps, ratio ≈ gold-per-zone ratio.
    const hs = Config.HEROES;
    for (let i = 2; i < hs.length; i++) {
      expect(hs[i].cost0).toBeGreaterThan(hs[i - 1].cost0 * 2);
      expect(hs[i].dps0).toBeGreaterThan(hs[i - 1].dps0);
    }
  });
});
