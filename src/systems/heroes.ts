// src/systems/heroes.ts
// Hiring, level purchases (1/10/25/MAX), cost summation, upgrade generation,
// and the Steward auto-buy heuristic.

import Config from "../config";
import type { GameState } from "../state";
import Effects, { type Derived } from "./effects";

export interface UpgradeDef {
  id: string;
  hero: string;
  tier: number;
  unlock_level: number;
  cost_mult: number;
  name: string;
  effect_text: string;
}

function effectText(hero: string, tier: number): string {
  if (tier === 1) return "+5% to all damage";
  if (tier < 3) return `doubles ${hero} damage`;
  const sig = Config.SIGNATURES[hero];
  return sig ? sig.name : "";
}

export const Heroes = {
  upgrades(): UpgradeDef[] {
    const out: UpgradeDef[] = [];
    for (const h of Config.HEROES) {
      Config.UPGRADE_TIERS.forEach((t, tier) => {
        out.push({
          id: `${h.id}:${tier}`,
          hero: h.id,
          tier,
          unlock_level: t.unlock_level,
          cost_mult: t.cost_mult,
          name: `${h.name} — ${tier === 3 ? Config.SIGNATURES[h.id]?.name ?? "signature" : `tier ${tier + 1}`}`,
          effect_text: effectText(h.id, tier),
        });
      });
    }
    return out;
  },

  upgradeCost(state: GameState, id: string): number {
    const [heroId, tierStr] = id.split(":");
    const tier = Number(tierStr);
    const def = Config.HEROES.find((h) => h.id === heroId)!;
    return def.cost0 * Config.UPGRADE_TIERS[tier].cost_mult;
  },

  canSee(state: GameState, id: string): boolean {
    const def = Config.HEROES.find((h) => h.id === id);
    const hs = state.heroes[id];
    return !!def && (hs.hired || state.gold_ever >= def.cost0);
  },

  hireCost(id: string): number {
    return Config.HEROES.find((h) => h.id === id)!.cost0;
  },

  hire(state: GameState, id: string): boolean {
    const hs = state.heroes[id];
    const cost = Heroes.hireCost(id);
    if (!hs || hs.hired || state.gold < cost) return false;
    state.gold -= cost;
    hs.hired = true;
    hs.level = 1;
    return true;
  },

  // Geometric sum with per-level discount-free price c0·1.07^n.
  levelCost(id: string, level: number, count: number): number {
    const c0 = Heroes.hireCost(id);
    return Math.ceil((c0 * Math.pow(Config.LEVEL_COST_MULT, level) * (Math.pow(Config.LEVEL_COST_MULT, count) - 1)) / (Config.LEVEL_COST_MULT - 1));
  },

  maxAffordable(id: string, level: number, gold: number): number {
    const c0 = Heroes.hireCost(id);
    const p = Math.pow(Config.LEVEL_COST_MULT, level);
    // n = log1.07(1 + gold·0.07/(c0·p)) capped at MAX_BUY
    const n = Math.floor(Math.log(1 + (gold * (Config.LEVEL_COST_MULT - 1)) / (c0 * p)) / Math.log(Config.LEVEL_COST_MULT));
    return Math.max(0, Math.min(n, Config.MAX_BUY));
  },

  buy(state: GameState, id: string, count: number): number {
    const hs = state.heroes[id];
    if (!hs || !hs.hired || count <= 0) return 0;
    const cost = Heroes.levelCost(id, hs.level, count);
    if (state.gold < cost) return 0;
    state.gold -= cost;
    hs.level += count;
    state.levels_bought_run += count;
    return cost;
  },

  // Steward: repeatedly buy 1 level for the hero whose next level is cheapest
  // (nearest-to-milestone mathematically tracks cheapest-frontier). Bounded per
  // tick by MAX_BUY to stay cheap.
  stewardTick(state: GameState): number {
    if (!state.steward) return 0;
    let spent = 0;
    // First: hire any revealed hero, keeping a 6× reserve so hiring never
    // eats the level budget.
    for (const h of Config.HEROES) {
      const hs = state.heroes[h.id];
      if (!hs.hired && Heroes.canSee(state, h.id) && state.gold >= 6 * h.cost0) {
        state.gold -= h.cost0;
        hs.hired = true;
        hs.level = 1;
        spent += h.cost0;
      }
    }
    // Next: buy every unlocked hero upgrade that is affordable — the
    // multipliers are worth more than the levels they could have bought.
    for (const u of Heroes.upgrades()) {
      if (state.upgrades_bought[u.id]) continue;
      const hs = state.heroes[u.hero];
      const cost = Heroes.upgradeCost(state, u.id);
      if (hs?.hired && hs.level >= u.unlock_level && state.gold >= cost) {
        state.gold -= cost;
        state.upgrades_bought[u.id] = true;
        spent += cost;
      }
    }
    for (let guard = 0; guard < 4000; guard++) {
      let best: string | null = null;
      let bestCost = Infinity;
      for (const h of Config.HEROES) {
        const hs = state.heroes[h.id];
        if (!hs.hired || h.id === "tinder") continue;
        const c = Heroes.levelCost(h.id, hs.level, 1);
        if (c < bestCost) {
          bestCost = c;
          best = h.id;
        }
      }
      if (!best || bestCost > state.gold) break;
      spent += Heroes.buy(state, best, 1);
    }
    return spent;
  },

  dpsShare(state: GameState, id: string, d: Derived): number {
    const total = Effects.totalDps(state, d);
    if (total <= 0) return 0;
    return Effects.heroDps(state, id, d) / total;
  },
};

export default Heroes;
