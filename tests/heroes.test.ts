import { describe, expect, it } from "vitest";
import Config from "../src/config";
import { createState } from "../src/state";
import Heroes from "../src/systems/heroes";
import Effects from "../src/systems/effects";

describe("heroes", () => {
  it("a first run starts alone; heroes reveal as gold is earned", () => {
    const s = createState();
    expect(s.heroes["tinder"].hired).toBe(false);
    expect(s.heroes["cinderroot"].hired).toBe(false);
    // Nobody has hired damage, so taps are the only damage there is.
    expect(Effects.totalDps(s, Effects.derive(s))).toBe(0);
    expect(Heroes.canSee(s, "tinder")).toBe(false);
    s.gold = 5; // the first kill's payout
    s.gold_ever = 5;
    expect(Heroes.canSee(s, "tinder")).toBe(true);
    expect(Heroes.hire(s, "tinder")).toBe(true);
    // Tinder is the click child: hiring him adds no autonomous damage, only
    // weight behind the player's own taps.
    expect(Effects.totalDps(s, Effects.derive(s))).toBe(0);
    expect(Effects.clickDamage(s, Effects.derive(s), 0)).toBeGreaterThan(Config.CLICK_BASE);
    s.gold = 1000;
    s.gold_ever = 1000;
    expect(Heroes.canSee(s, "soot")).toBe(true);
    expect(Heroes.canSee(s, "vey")).toBe(false);
  });

  it("level cost is the geometric sum and MAX matches it", () => {
    const s = createState();
    s.gold = 1e9;
    const cost10 = Heroes.levelCost("cinderroot", 1, 10);
    expect(Heroes.maxAffordable("cinderroot", 1, cost10)).toBe(10);
    expect(Heroes.maxAffordable("cinderroot", 1, cost10 - 1)).toBe(9);
  });

  it("levels bought count toward rekindle embers", () => {
    const s = createState();
    s.gold = 1e9;
    Heroes.hire(s, "cinderroot");
    expect(Heroes.buy(s, "cinderroot", 100)).toBeGreaterThan(0);
    expect(s.levels_bought_run).toBe(100);
  });

  it("milestones: ×4 at 200, extra ×10 at 1000", () => {
    expect(Effects.milestone(199)).toBe(1);
    expect(Effects.milestone(200)).toBe(4);
    expect(Effects.milestone(224)).toBe(4);
    expect(Effects.milestone(225)).toBe(16);
    expect(Effects.milestone(1000) / Effects.milestone(999)).toBeCloseTo(10, 5);
  });

  it("buy fails when gold short and never goes negative", () => {
    const s = createState();
    s.gold = 1e9;
    Heroes.hire(s, "cinderroot");
    s.gold = 0;
    expect(Heroes.buy(s, "cinderroot", 10)).toBe(0);
    expect(s.heroes["cinderroot"].level).toBe(1);
  });

  it("steward buys cheapest frontier levels, never tinder", () => {
    const s = createState();
    s.gold = 1e6;
    s.gold_ever = 1e6;
    Heroes.hire(s, "soot");
    s.steward = true;
    const spent = Heroes.stewardTick(s);
    expect(spent).toBeGreaterThan(0);
    expect(s.heroes["tinder"].level).toBe(1);
  });
});

describe("effects", () => {
  it("unspent embers multiply DPS", () => {
    const s = createState();
    s.gold = 1e9;
    Heroes.hire(s, "cinderroot");
    const dps1 = Effects.totalDps(s, Effects.derive(s));
    expect(dps1).toBeGreaterThan(0);
    s.embers = 10;
    expect(Effects.totalDps(s, Effects.derive(s)) / dps1).toBeCloseTo(2, 6);
  });

  it("overdrive arms past the threshold", () => {
    const s = createState();
    s.gold = 1e9;
    Heroes.hire(s, "cinderroot");
    const d = Effects.derive(s);
    const calm = Effects.totalDps(s, d, 0);
    const hot = Effects.totalDps(s, d, Config.OVERDRIVE_MAX);
    expect(hot / calm).toBeCloseTo(Config.OVERDRIVE_BONUS, 6);
  });

  it("click damage includes share of DPS", () => {
    const s = createState();
    s.gold = 1e9;
    Heroes.hire(s, "cinderroot");
    s.heroes["cinderroot"].level = 100;
    const d = Effects.derive(s);
    const dps = Effects.totalDps(s, d);
    expect(Effects.clickDamage(s, d, dps)).toBeGreaterThan(dps * Config.CLICK_DPS_SHARE);
  });

  it("upgrade tiers multiply hero and global damage", () => {
    const s = createState();
    s.gold = 1e9;
    Heroes.hire(s, "tinder");
    Heroes.hire(s, "cinderroot");
    const d0 = Effects.derive(s);
    const base = Effects.totalDps(s, d0);
    s.upgrades_bought["cinderroot:0"] = true;
    s.upgrades_bought["cinderroot:1"] = true;
    const d1 = Effects.derive(s);
    const t = Config.HEROES.find((h) => h.id === "tinder")!.dps0;
    const c = Config.HEROES.find((h) => h.id === "cinderroot")!.dps0;
    // Tier 0 doubles Cinderroot; Tier 1 is a global +5% on everything.
    expect(Effects.totalDps(s, d1) / base).toBeCloseTo(((t + 2 * c) * 1.05) / (t + c), 6);
  });
});
