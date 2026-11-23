import { describe, expect, it } from "vitest";
import Config from "../src/config";
import { createState } from "../src/state";
import Souls from "../src/systems/souls";
import Patrons from "../src/systems/patrons";
import Godsfall from "../src/systems/godsfall";

describe("souls / rekindling", () => {
  it("embers = levels/1000 + revenant + new ground", () => {
    const s = createState();
    s.levels_bought_run = 9000;
    s.revenant_souls_run = 3;
    expect(Souls.embersFromRun(s)).toBe(12);
  });

  it("rekindle blocked below the zone gate, wipes the run, keeps embers/patrons", () => {
    const s = createState();
    s.zone = 59;
    s.levels_bought_run = 5000;
    expect(Souls.rekindle(s)).toBe(0);
    s.zone = 100;
    s.patrons["vessa"] = 5;
    const gained = Souls.rekindle(s);
    expect(gained).toBe(5);
    expect(s.embers).toBe(5);
    expect(s.embers_lifetime).toBe(5);
    expect(s.zone).toBe(1);
    expect(s.gold).toBe(0);
    expect(
      Object.entries(s.heroes).every(([id, h]) =>
        id === "tinder" || id === "cinderroot"
          ? h.hired && h.level === 1
          : !h.hired,
      ),
    ).toBe(true);
    expect(s.patrons["vessa"]).toBe(5);
  });

  it("only NEW ground pays Embers: a road already burned pays nothing again", () => {
    const s = createState();
    s.zone = 84;
    s.frontier_zone = 84;
    s.levels_bought_run = 1000;
    expect(Souls.embersFromRun(s)).toBe(1 + 7); // levels + floor(84 / 12)
    expect(Souls.rekindle(s)).toBe(8);
    expect(s.paid_zone).toBe(84);
    // re-walking the same road buys nothing
    s.zone = 84;
    s.frontier_zone = 84;
    expect(Souls.embersFromRun(s)).toBe(0);
    expect(Souls.canRekindle(s)).toBe(false);
    expect(Souls.rekindle(s)).toBe(0);
    // deeper ground pays again
    s.frontier_zone = 96;
    expect(Souls.embersFromRun(s)).toBe(1);
    expect(Souls.canRekindle(s)).toBe(true);
  });

  it("revenant roll: always at 100/110/120 and hundreds, never below 100", () => {
    const s = createState();
    expect(Souls.rollPrimal(s, 95)).toBe(false);
    expect(Souls.rollPrimal(s, 100)).toBe(true);
    expect(Souls.rollPrimal(s, 110)).toBe(true);
    expect(Souls.rollPrimal(s, 300)).toBe(true);
    // deterministic per (seed, zone)
    expect(Souls.rollPrimal(s, 135)).toBe(Souls.rollPrimal(s, 135));
  });

  it("revenant reward grows polynomially pre-godsfall, exponentially after", () => {
    const s = createState();
    const r505 = Souls.revenantReward(s, 505); // n=81 → floor(17^1.3)=43
    expect(r505).toBeGreaterThanOrEqual(Math.floor(Math.pow((81 + 4) / 5, 1.3)));
    expect(r505).toBeLessThan(Math.pow(17, 1.31));
    s.godsfall_count = 1;
    s.marks = 500;
    expect(Souls.revenantReward(s, 505)).toBeGreaterThan(r505 * 10);
  });
});

describe("patrons", () => {
  it("offers are 4 unowned ids from the seeded roll; summon advances cursor", () => {
    const s = createState();
    const off = Patrons.offers(s);
    expect(off.length).toBe(4);
    expect(new Set(off).size).toBe(4);
    s.embers = 1000;
    expect(Patrons.summon(s, off[0])).toBe(true);
    expect(s.patrons[off[0]]).toBe(1);
    const off2 = Patrons.offers(s);
    expect(off2).not.toContain(off[0]);
    expect(off2.length).toBe(4);
    expect(s.embers).toBe(999); // first summon priced at 1
  });

  it("cannot summon non-offered patrons or level unsummoned", () => {
    const s = createState();
    s.embers = 1e6;
    const off = Patrons.offers(s);
    const hidden = Config.PATRON_FIRST_ROLL.find((id) => !off.includes(id))!;
    expect(Patrons.summon(s, hidden)).toBe(false);
    expect(Patrons.level(s, hidden, 1)).toBe(false);
  });

  it("level costs: linear triangle, exp2 doubling, flat one-soul", () => {
    const s = createState();
    s.patrons["vessa"] = 1;
    expect(Patrons.levelCost(s, "vessa", 1, 1)).toBe(2);
    expect(Patrons.levelCost(s, "vessa", 0, 5)).toBe(15);
    s.patrons["myrr"] = 1;
    expect(Patrons.levelCost(s, "myrr", 10, 10)).toBe(10);
    s.patrons["hod"] = 1;
    expect(Patrons.levelCost(s, "hod", 0, 3)).toBe(14); // 2+4+8
  });

  it("respec refunds 75% of level spend and re-rolls offers", () => {
    const s = createState();
    s.patrons["vessa"] = 11; // spend = 1..11 = 66
    const refund = Patrons.respec(s);
    expect(refund).toBe(Math.floor(66 * 0.75));
    expect(s.embers).toBe(refund);
    expect(s.patrons).toEqual({});
  });

  it("reroll refuses when ≤4 patrons remain unowned", () => {
    const s = createState();
    s.embers = 1e6;
    for (const id of Config.PATRON_FIRST_ROLL.slice(0, 6)) s.patrons[id] = 1;
    expect(Patrons.reroll(s)).toBe(false);
  });
});

describe("godsfall", () => {
  it("marks are logarithmic in lifetime embers and pay as a delta", () => {
    const s = createState();
    s.embers_lifetime = 990; // log10(1000) = 3 → 15 marks
    expect(Godsfall.pendingMarks(s)).toBe(15);
    s.marks = 10;
    expect(Godsfall.pendingMarks(s)).toBe(5);
  });

  it("perform burns patrons and embers, pays marks, keeps gods", () => {
    const s = createState();
    s.zone = Config.GODSFALL_MIN_ZONE; // gates availability
    s.embers_lifetime = 1e5;
    s.embers = 500;
    s.patrons["vessa"] = 3;
    s.gods["moloch"] = 2;
    s.gold = 999;
    const paid = Godsfall.perform(s);
    expect(paid).toBe(Godsfall.marksTotal(s));
    expect(s.marks).toBe(paid);
    expect(s.embers).toBe(0);
    expect(s.patrons).toEqual({});
    expect(s.gods["moloch"]).toBe(2);
    expect(s.gold).toBe(0);
    expect(s.godsfall_count).toBe(1);
  });

  it("fallen power spans 2%..25%", () => {
    const s = createState();
    expect(Godsfall.fp(s)).toBeCloseTo(0.02, 3);
    s.marks = 1e6;
    expect(Godsfall.fp(s)).toBeLessThan(0.251);
    expect(Godsfall.fp(s)).toBeGreaterThan(0.24);
  });

  it("god levels cost the triangular ladder", () => {
    const s = createState();
    s.marks = 10000;
    expect(Godsfall.level(s, "moloch", 3)).toBe(true);
    expect(s.gods["moloch"]).toBe(3);
    expect(s.marks).toBe(9994); // 1+2+3
    const cur = s.gods["moloch"];
    const k = Godsfall.maxAffordable(s, "moloch");
    expect(k).toBeGreaterThan(100);
    expect(Godsfall.levelCost(s, "moloch", cur, k)).toBeLessThanOrEqual(s.marks);
    expect(Godsfall.levelCost(s, "moloch", cur, k + 1)).toBeGreaterThan(s.marks);
  });
});
