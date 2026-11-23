// src/systems/souls.ts
// Embers: the Rekindling (run reset). Revenant boss rolls are a pure function
// of (run seed, zone) — deterministic across reloads, un-rerollable.

import Config from "../config";
import type { GameState } from "../state";
import { hash2, mulberry32, nextSeed } from "./rng";

export const Souls = {
  // Embers this run would pay right now: levels bought, Revenant Embers, and
  // one per EMBER_ZONE_DIVISOR zones of ground that is new since the last
  // Rekindle. Re-walking a road you already burned pays nothing, so Rekindling
  // stays a bet on going deeper rather than a lever you can pull in place.
  embersFromRun(state: GameState): number {
    const newGround = Math.max(
      0,
      Math.floor(state.frontier_zone / Config.EMBER_ZONE_DIVISOR) -
        Math.floor(state.paid_zone / Config.EMBER_ZONE_DIVISOR),
    );
    return (
      Math.floor(state.levels_bought_run / Config.EMBER_LEVEL_DIVISOR) +
      state.revenant_souls_run +
      newGround
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
    return state.zone >= Config.REKINDLE_MIN_ZONE && Souls.embersFromRun(state) > 0;
  },

  // Rekindle: burn the run for Embers. Keeps: embers, patrons, gods, marks,
  // records, steward. Wipes: gold, heroes, upgrades, zone, run bookkeeping.
  rekindle(state: GameState): number {
    if (!Souls.canRekindle(state)) return 0;
    const gained = Souls.embersFromRun(state);
    if (gained <= 0) return 0;
    state.embers += gained;
    state.embers_lifetime += gained;
    state.rekindles++;
    // ground down to here is paid for; only deeper counts next run
    state.paid_zone = Math.max(state.paid_zone, state.frontier_zone);
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
  state.monster_hp = 0; // no monster standing; the next tick spawns zone 1's
  state.monster_max_hp = 0;
  state.monster_is_boss = false;
  state.monster_primal = false;
  state.respawn_timer = 0;
  state.boss_timer = 0;
  state.streak_letdown = false;
  state.frontier_zone = 1; // the road is new again; auto_advance is a
  state.zone_cleared = false; // preference and deliberately survives
  state.levels_bought_run = 0;
  state.revenant_souls_run = 0;
  state.revenant_beaten = {};
  state.overdrive_gauge = 0;
  for (const hs of Object.values(state.heroes)) {
    hs.level = 0;
    hs.hired = false;
  }
  // A Rekindling is the warm restart, unlike the very first run: the Company
  // comes back assembled (Tinder + Cinderroot, Lv 1) so an idle-only player
  // can never soft-lock here. Tinder hits for nothing on his own — his levels
  // buy tap damage — so the opening beats still land in the player's hands.
  state.heroes["tinder"] = { level: 1, hired: true };
  state.heroes["cinderroot"] = { level: 1, hired: true };
  state.upgrades_bought = {};
  // gold_ever survives: the reveal ladder is lifetime knowledge.
}

export default Souls;
