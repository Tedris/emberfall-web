// src/systems/offline.ts
// Offline progress: replay the zone ladder at frozen DPS (no hero purchases
// while away — matches the on-screen math, no phantom gold), capped 24 h.
// A boss you cannot beat in time stops progression; you farm that zone's gold
// for the rest of the night instead (never regress offline).

import Config from "../config";
import type { GameState } from "../state";
import Effects from "./effects";
import Souls from "./souls";
import Zones from "./zones";

export interface OfflineReport {
  seconds: number;
  gold: number;
  zones: number;
  kills: number;
  stuck_at: number | null; // zone of an unbeatable boss, if any
}

export const Offline = {
  apply(state: GameState, now: number): OfflineReport | null {
    if (!state.last_save_time || state.last_save_time <= 0) return null;
    const elapsed = now - state.last_save_time;
    if (elapsed < Config.OFFLINE_SKIP_SECONDS) return null;
    const budget = Math.min(elapsed, Config.OFFLINE_CAP_HOURS * 3600);

    const d = Effects.derive(state);
    const dps = Effects.totalDps(state, d, 0);
    const report: OfflineReport = { seconds: budget, gold: 0, zones: 0, kills: 0, stuck_at: null };
    if (dps <= 0) return report;
    // The road holds while you sleep: with auto-advance off nothing advances
    // offline — you farm the zone you are standing on, at the same rate you
    // would with the tab open. Standing on an uncleared boss zone means that
    // boss beat you, so the deepest ground you can still sweep is what pays.
    if (!state.auto_advance) {
      const farm_z =
        Zones.isBossZone(state.zone) && !state.zone_cleared
          ? Zones.farmZone(dps, state.zone)
          : state.zone;
      const cycle = Zones.monsterHp(farm_z, false) / dps + Zones.respawnDelay(d.respawn);
      const held_kills = Math.floor(budget / cycle);
      const held_gold = held_kills * Zones.goldFor(farm_z, false) * d.gold;
      state.gold += held_gold;
      state.gold_earned_run += held_gold;
      if (state.gold > state.gold_ever) state.gold_ever = state.gold;
      state.kills += held_kills;
      report.gold = held_gold;
      report.kills = held_kills;
      return report;
    }

    let t = budget;
    let z = state.zone;
    let kills_in_zone = state.kills_in_zone;
    let gold = 0;
    let kills = 0;
    let stuck: number | null = null;

    for (let step = 0; step < 100000 && t > 0; step++) {
      const isBoss = Zones.isBossZone(z);
      const hp = Zones.monsterHp(z, isBoss);
      const kill_time = hp / dps;
      const respawn = Zones.respawnDelay(d.respawn);

      if (isBoss) {
        const timer = Zones.bossTimer(z, d.boss_timer);
        if (kill_time > timer) {
          // Farm this zone's normal neighbours for the remaining time.
          const farm_zone = Zones.farmZone(dps, z);
          const farm_hp = Zones.monsterHp(farm_zone, false);
          const rate = 1 / (farm_hp / dps + respawn);
          const n = Math.floor(t * rate);
          gold += n * Zones.goldFor(farm_zone, false) * d.gold;
          kills += n;
          t = 0;
          stuck = z;
          break;
        }
        gold += Zones.goldFor(z, true) * d.gold;
        kills++;
        t -= kill_time + respawn;
        z++;
        kills_in_zone = 0;
        report.zones++;
      } else {
        const need = Zones.killsNeeded(z, d.zone_kills);
        const cycle = kill_time + respawn;
        const n = Math.min(need - kills_in_zone, Math.floor(t / cycle));
        gold += n * Zones.goldFor(z, false) * d.gold;
        kills += n;
        t -= n * cycle;
        kills_in_zone += n;
        if (kills_in_zone >= need) {
          z++;
          kills_in_zone = 0;
          report.zones++;
        } else {
          break; // time exhausted mid-zone
        }
      }
    }

    // Records
    state.gold += gold;
    state.gold_earned_run += gold;
    if (state.gold > state.gold_ever) state.gold_ever = state.gold;
    state.kills += kills;
    if (stuck === null && z !== state.zone) {
      state.zone = z;
      state.kills_in_zone = kills_in_zone;
    } else if (stuck !== null) {
      state.zone = Math.max(1, stuck - 1);
      state.kills_in_zone = 0;
      state.streak_letdown = true;
    }
    if (state.zone > state.best_zone) {
      state.best_zone = state.zone;
      if (state.godsfall_count > 0) state.best_zone_god = state.zone;
    }
    // Fresh monster for the new zone.
    state.monster_max_hp = Zones.monsterHp(state.zone, Zones.isBossZone(state.zone));
    state.monster_hp = state.monster_max_hp;
    state.monster_is_boss = Zones.isBossZone(state.zone);
    state.monster_primal = state.monster_is_boss && Souls.rollPrimal(state, state.zone);
    state.respawn_timer = 0;

    report.gold = gold;
    report.kills = kills;
    report.stuck_at = stuck;
    return report;
  },
};

export default Offline;
