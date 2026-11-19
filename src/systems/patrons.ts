// src/systems/patrons.ts
// Patrons: the Ember-spent permanent roster. Offers come from a seeded shuffle
// of the 10; summoning walks a fixed price ladder so early runs must pick a
// lane (idle vs active). Respec refunds 75% of Ember spent on levels and
// re-rolls the offers.

import Config from "../config";
import type { GameState } from "../state";
import { hash2, mulberry32 } from "./rng";

function orderFor(state: GameState): string[] {
  const ids = Config.PATRON_FIRST_ROLL.slice();
  const rng = mulberry32(hash2(state.seed_patron, state.reroll_count));
  for (let i = ids.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [ids[i], ids[j]] = [ids[j], ids[i]];
  }
  return ids;
}

export const Patrons = {
  offers(state: GameState): string[] {
    const order = orderFor(state);
    const out: string[] = [];
    let i = state.offers_revealed;
    while (out.length < Config.PATRON_OFFERS && i < order.length) {
      const id = order[i++];
      if ((state.patrons[id] ?? 0) === 0) out.push(id);
    }
    state.patron_offers = out;
    return out;
  },

  // Summoning the k-th patron ever (per respec cycle) costs ladder[k].
  summonCost(state: GameState): number {
    const L = Config.PATRON_SUMMON_LADDER;
    const k = Math.min(state.summons_used, L.length - 1);
    return L[k] * Math.pow(1.25, Math.max(0, state.summons_used - L.length + 1));
  },

  rerollCost(state: GameState): number {
    return Math.ceil(Patrons.summonCost(state) * Config.PATRON_REROLL_FRAC);
  },

  reroll(state: GameState): boolean {
    const remaining = Config.PATRON_FIRST_ROLL.filter(
      (id) => (state.patrons[id] ?? 0) === 0,
    ).length;
    if (remaining <= Config.PATRON_OFFERS) return false;
    const cost = Patrons.rerollCost(state);
    if (state.embers < cost) return false;
    state.embers -= cost;
    state.reroll_count++;
    return true;
  },

  summon(state: GameState, id: string): boolean {
    if ((state.patrons[id] ?? 0) > 0) return false;
    if (!Patrons.offers(state).includes(id)) return false;
    const cost = Patrons.summonCost(state);
    if (state.embers < cost) return false;
    state.embers -= cost;
    state.patrons[id] = 1;
    state.summons_used++;
    // advance the cursor past the summoned id so the slot refills
    const order = orderFor(state);
    while (state.offers_revealed < order.length && order[state.offers_revealed] === id)
      state.offers_revealed++;
    // (cursor may already be past id if earlier summons walked it)
    state.offers_revealed = Math.max(state.offers_revealed, order.indexOf(id) + 1);
    return true;
  },

  levelCost(state: GameState, id: string, from: number, count: number): number {
    const def = Config.PATRONS.find((p) => p.id === id)!;
    let raw: number;
    switch (def.curve) {
      case "flat":
        raw = count;
        break;
      case "linear":
        raw = ((from + count) * (from + count + 1) - from * (from + 1)) / 2;
        break;
      case "pow15": {
        let s = 0;
        for (let L = from + 1; L <= from + count; L++) s += Math.ceil(Math.pow(L, 1.5));
        raw = s;
        break;
      }
      case "exp2":
        raw = Math.pow(2, from + count + 1) - Math.pow(2, from + 1);
        break;
    }
    const d = 1 - Math.min(0.95, PatronDiscount(state));
    return Math.max(1, Math.ceil(raw * d));
  },

  // Highest affordable level count (binary search; safe past doubles via cap).
  maxAffordable(state: GameState, id: string, embers: number): number {
    const cur = state.patrons[id] ?? 0;
    if (cur + 1 > 100000) return 0;
    if (Patrons.levelCost(state, id, cur, 1) > embers) return 0;
    let lo = 1,
      hi = 2;
    while (hi < 100000 && Patrons.levelCost(state, id, cur, hi) <= embers) hi *= 2;
    let cap = Math.min(hi, 100000 - cur);
    while (lo < cap) {
      const mid = Math.ceil((lo + cap) / 2);
      if (Patrons.levelCost(state, id, cur, mid) <= embers) lo = mid;
      else cap = mid - 1;
    }
    return lo;
  },

  level(state: GameState, id: string, count: number): boolean {
    if (count <= 0) return false;
    const cur = state.patrons[id] ?? 0;
    if (cur === 0) return false; // must be summoned first
    const cost = Patrons.levelCost(state, id, cur, count);
    if (state.embers < cost) return false;
    state.embers -= cost;
    state.patrons[id] = cur + count;
    return true;
  },

  // 75% refund of Ember spent on patron LEVELS (summon costs are not
  // refunded), wipe levels, re-roll the offer order.
  respec(state: GameState): number {
    let spent = 0;
    for (const [id, level] of Object.entries(state.patrons)) {
      if (level > 0) spent += Patrons.levelCost(state, id, 0, level);
    }
    const refund = Math.floor(spent * Config.RESPEC_REFUND);
    state.embers += refund;
    state.patrons = {};
    state.summons_used = 0;
    state.offers_revealed = 0;
    state.seed_patron = (Math.imul(state.seed_patron, 1664525) + 1013904223) >>> 0;
    state.reroll_count = 0;
    return refund;
  },
  effectValue(state: GameState, id: string): { kind: string; value: number } | null {
    const def = Config.PATRONS.find((p) => p.id === id);
    const L = state.patrons[id] ?? 0;
    if (!def || L <= 0) return null;
    const value =
      def.curve === "exp2"
        ? def.base_value * (1 - Math.exp(def.decay * L))
        : def.base_value * L;
    return { kind: def.kind, value };
  },
};

function PatronDiscount(state: GameState): number {
  // Hod (diminishing, own curve) and Syth (gods) both discount patron levels;
  // best wins, not stacked.
  const hod = state.patrons["hod"] ?? 0;
  const syth = state.gods["syth"] ?? 0;
  return Math.max(
    hod > 0 ? 0.99 * (1 - Math.exp(-0.01 * hod)) : 0,
    syth > 0 ? 1 - Math.pow(0.95, syth) : 0,
  );
}

export default Patrons;
