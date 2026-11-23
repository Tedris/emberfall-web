// src/systems/combat.ts
// The tick: damage accrual, kill/advance/fail transitions, boss timers,
// revenant rolls, gold payout. Mutates only run fields on state; UI reads
// events returned from tick().

import Config from "../config";
import type { GameState } from "../state";
import Effects, { type Derived } from "./effects";
import Souls from "./souls";
import Zones from "./zones";

export interface TickEvent {
  gold?: number;
  kills?: number;
  zone_up?: number;
  zone_cleared?: number; // quota paid, road held — the player decides next
  boss_failed?: boolean;
  revenant_souls?: number;
}

export const Combat = {
  spawn(state: GameState, d: Derived) {
    // Holding at a cleared zone farms its leftovers: that zone's boss is
    // already dead, so a held spawn is never a boss — and carries no timer
    // that could set the player back while they farm by choice.
    const isBoss = Zones.isBossZone(state.zone) && !state.zone_cleared;
    state.monster_is_boss = isBoss;
    state.monster_max_hp = Zones.monsterHp(state.zone, isBoss);
    state.monster_hp = state.monster_max_hp;
    state.monster_primal = isBoss && Souls.rollPrimal(state, state.zone);
    state.boss_timer = isBoss ? Zones.bossTimer(state.zone, d.boss_timer) : 0;
  },

  tick(state: GameState, dt: number, d?: Derived): TickEvent {
    const ev: TickEvent = {};
    const der = d ?? Effects.derive(state);

    // overdrive gauge decay
    const gmax = Config.OVERDRIVE_MAX + der.overdrive_max;
    state.overdrive_gauge = Math.max(0, state.overdrive_gauge - Config.OVERDRIVE_DECAY * dt);
    if (state.overdrive_gauge > gmax) state.overdrive_gauge = gmax;

    if (state.respawn_timer > 0) {
      state.respawn_timer -= dt;
      if (state.respawn_timer <= 0) {
        state.respawn_timer = 0;
        Combat.spawn(state, der);
      }
      return ev;
    }
    if (state.monster_max_hp <= 0) {
      Combat.spawn(state, der);
      return ev;
    }

    const dps = Effects.totalDps(state, der, state.overdrive_gauge);
    let guard = 0;
    while (dt > 0 && guard++ < 1000) {
      if (state.monster_hp <= 0) {
        Combat.onKill(state, der, ev); // a click landed the killing blow
        break; // respawn delay governs pace from here
      }
      const needed = state.monster_hp / Math.max(dps, 1e-300);
      // A held zone runs timerless (see spawn); the second test only covers a
      // save written mid-hold.
      if (!state.monster_is_boss || state.zone_cleared) {
        if (needed <= dt) {
          state.monster_hp = 0; // dies exactly at kill time; no FP residue
          dt -= needed;
          Combat.onKill(state, der, ev);
          break;
        }
        state.monster_hp -= dps * dt;
        dt = 0;
      } else {
        if (needed <= Math.min(dt, state.boss_timer)) {
          state.monster_hp = 0;
          dt -= needed;
          state.boss_timer -= needed;
          Combat.onKill(state, der, ev);
          break;
        }
        const step = Math.min(dt, state.boss_timer);
        state.monster_hp -= dps * step;
        state.boss_timer -= step;
        dt -= step;
        if (state.boss_timer <= 0) {
          Combat.onBossFail(state, der);
          ev.boss_failed = true;
          break;
        }
      }
    }

    // records
    if (state.gold > state.best_gold) state.best_gold = state.gold;
    if (state.monster_hp < state.monster_max_hp && dps > state.best_dps) state.best_dps = dps;
    return ev;
  },

  onKill(state: GameState, d: Derived, ev: TickEvent) {
    state.kills++;
    let gold = Zones.goldFor(state.zone, state.monster_is_boss) * d.gold;
    let souls = 0;
    if (state.monster_primal && state.monster_is_boss) {
      souls = Souls.revenantReward(state, state.zone);
      state.revenant_souls_run += souls;
    }
    state.gold += gold;
    state.gold_earned_run += gold;
    if (state.gold > state.gold_ever) state.gold_ever = state.gold;
    state.monster_hp = 0;
    state.monster_primal = false;
    if (souls > 0) ev.revenant_souls = souls;

    if (state.monster_is_boss) {
      state.revenant_beaten[String(state.zone)] = true;
      state.streak_letdown = false;
      finishZone(state, d, ev);
    } else if (state.zone_cleared && !state.auto_advance) {
      // Farming a held zone: the quota is already paid, so these kills pay
      // gold and nothing else. Turning progress mode on clears the hold
      // instead (see Game.setAutoAdvance), so the road can never stall here.
      state.respawn_timer = Zones.respawnDelay(d.respawn);
    } else {
      state.kills_in_zone++;
      const need = Zones.killsNeeded(state.zone, d.zone_kills);
      if (state.kills_in_zone >= need) finishZone(state, d, ev);
      else state.respawn_timer = Zones.respawnDelay(d.respawn);
    }
    if (state.zone > state.best_zone) {
      state.best_zone = state.zone;
      if (state.godsfall_count > 0) state.best_zone_god = state.zone;
    }
  },

  onBossFail(state: GameState, d: Derived) {
    // Fall back to ground the Company can still sweep. The wall keeps the zone
    // until DPS grows, but the road walks forward from here, so a boss you
    // cannot kill yet never freezes the gold that will eventually kill it.
    state.zone = Zones.farmZone(Effects.totalDps(state, d, state.overdrive_gauge), state.zone);
    state.kills_in_zone = 0;
    state.zone_cleared = false;
    state.streak_letdown = true;
    state.respawn_timer = 0;
    state.monster_max_hp = 0; // force spawn next tick
  },

  // Walk the road: revisit any zone reached this run. Traveling never changes
  // whether the road advances on its own, so hopping back to farm can't
  // silently rewrite the rules you are playing by.
  travel(state: GameState, zone: number): boolean {
    const target = Math.floor(zone);
    if (!Number.isFinite(target) || target < 1 || target > state.frontier_zone) return false;
    state.zone = target;
    state.kills_in_zone = 0;
    state.zone_cleared = false;
    state.streak_letdown = false;
    state.respawn_timer = 0;
    state.monster_hp = 0;
    state.monster_max_hp = 0; // the next tick spawns the local monster
    return true;
  },

  // "Go deeper": leave a zone whose quota is paid and take the next one.
  goDeeper(state: GameState): boolean {
    if (!state.zone_cleared) return false;
    advance(state);
    return true;
  },
};

function advance(state: GameState, ev: TickEvent = {}) {
  state.zone++;
  state.frontier_zone = Math.max(state.frontier_zone, state.zone);
  state.kills_in_zone = 0;
  state.zone_cleared = false;
  ev.zone_up = state.zone;
  state.respawn_timer = Zones.respawnDelay(0);
  state.monster_max_hp = 0;
}

// The zone quota is paid. Progress mode walks on; hold mode stops the road and
// puts the decision on screen — where farming keeps paying gold and no boss
// timer can ever set the player back.
function finishZone(state: GameState, d: Derived, ev: TickEvent) {
  if (state.auto_advance) {
    advance(state, ev);
    return;
  }
  state.zone_cleared = true;
  state.kills_in_zone = Zones.killsNeeded(state.zone, d.zone_kills);
  state.respawn_timer = Zones.respawnDelay(d.respawn);
  ev.zone_cleared = state.zone;
}

export default Combat;
