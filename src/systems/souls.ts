// src/systems/souls.ts
// Embers: the Rekindling (run reset). Revenant boss rolls are a pure function
// of (run seed, zone) — deterministic across reloads, un-rerollable.

import Config from "../config";
import type { GameState } from "../state";
import { hash2, mulberry32, nextSeed } from "./rng";

export const Souls = {
  // Embers this run would pay right now.
  embersFromRun(state: GameState): number {
    return (
      Math.floor(state.levels_bought_run / Config.EMBER_LEVEL_DIVISOR) +
      state.revenant_souls_run
    );
  },

  isRevenant(state: GameState, z: number): boolean {
    if (z < Config.REVENANT_MIN_ZONE) return false;
    if (state.revenant_beaten[String(z)]) return false;
    if (z % 100 === 0 || Config.REVENANT_ALWAYS.includes(z)) return true;
    const chance =
      Math.max(
        Config.REVENANT_CHANCE - 2 * Math.floor(state.rekindles / 500),
        Config.REVENANT_CHANCE_FLOOR,
      ) + Souls.chanceBonus(state);
    return mulberry32(hash2(state.seed_revenant, z))() < chance / 100;
  },

  chanceBonus(state: GameState): number {
    // Whur patron + Ysolde signature — both percentage points.
    let pts = 0;
    const whur = state.patrons["whur"] ?? 0;
    if (whur > 0) pts += 75 * (1 - Math.exp(-0.013 * whur));
    if (state.upgrades_bought["ysolde:3"]) pts += Config.SIGNATURES["ysolde"].value;
    return pts;
  },

  rollPrimal(state: GameState, z: number): boolean {
    return Souls.isRevenant(state, z);
  },

  // reward(L) = floor(((n+4)/5)^1.3) × FallenPower^n × bonuses
  revenantReward(state: GameState, z: number): number {
    const n = Math.floor((z - 100) / 5);
    const poly = Math.pow((n + 4) / 5, 1.3);
    // Fallen Power's exponential term applies only to transcended-era
    // saves (post-godsfall), as in the source design.
    const fp =
      state.godsfall_count > 0
        ? 1 +
          Config.FP_BASE +
          Config.FP_SPAN * (1 - Math.exp(-Config.FP_DECAY * state.marks))
        : 1;
    const vhor = 1 + 1 * (state.gods["vhor"] ?? 0);
    return Math.max(1, Math.floor(poly * Math.pow(fp, n) * vhor));
  },

  canRekindle(state: GameState): boolean {
    return state.zone >= Config.REKINDLE_MIN_ZONE;
  },

  // Rekindle: burn the run for Embers. Keeps: embers, patrons, gods, marks,
  // records, steward. Wipes: gold, heroes, upgrades, zone, run bookkeeping.
  rekindle(state: GameState): number {
    if (!Souls.canRekindle(state)) return 0;
    // A Rekindling always pays at least one Ember: the first meta-loop beat
    // must land even before any Revenant falls.
    const gained = Math.max(1, Souls.embersFromRun(state));
    state.embers += gained;
    state.embers_lifetime += gained;
    state.rekindles++;
    resetRun(state);
    state.seed_revenant = nextSeed(state.seed_revenant);
    return gained;
  },
};

export function resetRun(state: GameState) {
  state.gold = 0;
  state.gold_earned_run = 0;
  state.zone = 1;
  state.kills_in_zone = 0;
  state.monster_hp = 10;
  state.monster_max_hp = 10;
  state.monster_is_boss = false;
  state.monster_primal = false;
  state.respawn_timer = 0;
  state.boss_timer = 0;
  state.streak_letdown = false;
  state.levels_bought_run = 0;
  state.revenant_souls_run = 0;
  state.revenant_beaten = {};
  state.overdrive_gauge = 0;
  for (const hs of Object.values(state.heroes)) {
    hs.level = 0;
    hs.hired = false;
  }
  // The Company restarts assembled (Tinder + Cinderroot, Lv 1) — an
  // idle-only player can never soft-lock after a Rekindling.
  state.heroes["tinder"] = { level: 1, hired: true };
  state.heroes["cinderroot"] = { level: 1, hired: true };
  state.upgrades_bought = {};
  // gold_ever survives: the reveal ladder is lifetime knowledge.
}

export default Souls;
