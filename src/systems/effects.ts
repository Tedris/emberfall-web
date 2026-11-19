// src/systems/effects.ts
// Central effect resolver: folds hero upgrades, patron levels, and god levels
// into one Derived bundle. Every other system asks here instead of walking
// tables; the derived value is recomputed per tick from state (cheap, stateless).

import Config, { type Effect, type EffectKind } from "../config";
import type { GameState } from "../state";

export interface Derived {
  global_dps: number; // multiplier
  click_dmg: number; // multiplier
  click_dps_share: number; // fraction of DPS added per click
  gold: number; // multiplier
  crit_chance: number; // fraction
  crit_mult: number; // multiplier
  boss_timer: number; // seconds added
  zone_kills: number; // kills removed
  respawn: number; // seconds removed
  revenant_chance: number; // percentage points added
  revenant_reward: number; // multiplier
  overdrive_gain: number; // multiplier on gauge fill
  overdrive_max: number; // seconds added to gauge max
  patron_discount: number; // fraction off patron level costs
  per_hero_dps: Record<string, number>; // hero → multiplier
  myrr_level: number;
  grith_level: number;
}

function addEff(d: Derived, e: Effect, value: number) {
  switch (e.kind) {
    case "hero_dps":
      break; // handled per-hero at upgrade build time
    case "global_dps":
      d.global_dps *= 1 + value;
      break;
    case "gold":
      d.gold *= 1 + value;
      break;
    case "click_dmg":
      d.click_dmg *= 1 + value;
      break;
    case "click_dps_share":
      d.click_dps_share += value;
      break;
    case "crit_chance":
      d.crit_chance += value;
      break;
    case "crit_mult":
      d.crit_mult += value;
      break;
    case "boss_timer":
      d.boss_timer += value;
      break;
    case "zone_kills":
      d.zone_kills += value;
      break;
    case "respawn":
      d.respawn += value;
      break;
    case "revenant_chance":
      d.revenant_chance += value;
      break;
    case "revenant_reward":
      d.revenant_reward *= 1 + value;
      break;
    case "overdrive_gain":
      d.overdrive_gain *= 1 + value;
      break;
    case "overdrive_max":
      d.overdrive_max += value;
      break;
    case "patron_discount":
      d.patron_discount = Math.max(d.patron_discount, value);
      break;
  }
}

// Effect value of a patron at a given owned level, honoring curve shape.
export function patronEffect(id: string, level: number): Effect | null {
  const def = Config.PATRONS.find((p) => p.id === id);
  if (!def || level <= 0) return null;
  let value: number;
  switch (def.curve) {
    case "linear":
    case "flat":
    case "pow15":
      value = def.base_value * level;
      break;
    case "exp2":
      value = def.base_value * (1 - Math.exp(def.decay * level));
      break;
  }
  return { kind: def.kind, value };
}

// Effect of god levels (few, special-cased).
function godEffects(d: Derived, state: GameState) {
  const L_moloch = state.gods["moloch"] ?? 0;
  if (L_moloch > 0) d.global_dps *= 1 + 1 * L_moloch; // ×(1+L) i.e. +100%×L
  const L_syth = state.gods["syth"] ?? 0;
  if (L_syth > 0)
    d.patron_discount = Math.max(
      d.patron_discount,
      1 - Math.pow(0.95, L_syth),
    );
  const L_vhor = state.gods["vhor"] ?? 0;
  if (L_vhor > 0) d.revenant_reward *= 1 + 1 * L_vhor;
}

export const Effects = {
  derive(state: GameState): Derived {
    const d: Derived = {
      global_dps: 1,
      click_dmg: 1,
      click_dps_share: Config.CLICK_DPS_SHARE,
      gold: 1,
      crit_chance: Config.CRIT_CHANCE,
      crit_mult: Config.CRIT_MULT,
      boss_timer: 0,
      zone_kills: 0,
      respawn: 0,
      revenant_chance: 0,
      revenant_reward: 1,
      overdrive_gain: 1,
      overdrive_max: 0,
      patron_discount: 0,
      per_hero_dps: {},
      myrr_level: 0,
      grith_level: 0,
    };

    for (const h of Config.HEROES) d.per_hero_dps[h.id] = 1;

    // Hero upgrades: tiers 0/2 are own-hero ×2, tier 1 global +5%, tier 3 =
    // signature table.
    for (const key of Object.keys(state.upgrades_bought)) {
      const [heroId, tierStr] = key.split(":");
      const tier = Number(tierStr);
      if (tier === 0 || tier === 2) {
        d.per_hero_dps[heroId] = (d.per_hero_dps[heroId] ?? 1) * 2;
      } else if (tier === 1) {
        d.global_dps *= 1.05;
      } else {
        const sig = Config.SIGNATURES[heroId];
        if (sig) addEff(d, sig as Effect, sig.value);
      }
    }

    // Patrons
    for (const [id, level] of Object.entries(state.patrons)) {
      if (id === "myrr") {
        d.myrr_level = level;
        continue;
      }
      if (id === "grith") {
        d.grith_level = level;
        continue; // gauge-dependent, applied in totalDps
      }
      if (id === "hod") {
        const e = patronEffect(id, level);
        if (e) d.patron_discount = Math.max(d.patron_discount, e.value);
        continue;
      }
      const e = patronEffect(id, level);
      if (e) addEff(d, e, e.value);
    }

    godEffects(d, state);

    // Unspent Embers: +10% DPS each. Myrr: +11%×L DPS per unspent Ember — the
    // bank is never worse than holding.
    const unspent = Math.max(0, Math.floor(state.embers));
    if (unspent > 0) d.global_dps *= 1 + Config.EMBER_IDLE_BONUS * unspent;
    if (d.myrr_level > 0) d.global_dps *= 1 + 0.11 * d.myrr_level * unspent;

    return d;
  },

  // Hero milestone multiplier from its level (×4 / 25 from 200, ×10 / 1000).
  milestone(level: number): number {
    if (level < Config.MILESTONE_LEVEL0) return 1;
    const steps = Math.floor(level / Config.MILESTONE_EVERY);
    const k = Math.min(
      Math.floor(level / Config.MILESTONE_K_LEVEL),
      Config.MILESTONE_K_CAP,
    );
    return (
      Math.pow(Config.MILESTONE_MULT, steps - 7 - k) *
      Math.pow(Config.MILESTONE_K_MULT, k)
    );
  },

  // Flat model (per the genre template): each level adds one share of the
  // hero's base — damage = dps0 × level — then milestones do the geometric
  // work. This is what makes "push to the next ×4" the core decision.
  heroDps(state: GameState, id: string, d: Derived): number {
    const def = Config.HEROES.find((h) => h.id === id);
    const hs = state.heroes[id];
    if (!def || !hs || !hs.hired || hs.level <= 0) return 0;
    return (
      def.dps0 * hs.level * Effects.milestone(hs.level) * (d.per_hero_dps[id] ?? 1)
    );
  },

  totalDps(state: GameState, d: Derived, gauge = 0): number {
    let dps = 0;
    for (const h of Config.HEROES) dps += Effects.heroDps(state, h.id, d);
    dps *= d.global_dps;
    if (d.grith_level > 0) dps *= 1 + 0.005 * d.grith_level * gauge;
    const threshold =
      (Config.OVERDRIVE_MAX + d.overdrive_max) * Config.OVERDRIVE_THRESHOLD;
    if (gauge >= threshold) dps *= Config.OVERDRIVE_BONUS;
    return dps;
  },

  clickDamage(state: GameState, d: Derived, dps: number): number {
    const tinder = state.heroes["tinder"];
    let flat = Config.CLICK_BASE;
    if (tinder?.hired) flat += Config.CLICK_PER_TINDER_LEVEL * tinder.level;
    return (flat + d.click_dps_share * dps) * d.click_dmg;
  },

  // Convenience for UI: sum of one effect kind across upgrades/patrons.
  effectTotal(d: Derived, kind: EffectKind): number {
    return (d as unknown as Record<string, number>)[kind] ?? 0;
  },
};

export default Effects;
