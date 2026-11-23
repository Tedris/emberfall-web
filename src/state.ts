// src/state.ts
// The single mutable game state. Flat snake_case fields (old-project
// convention); systems declare which subset they own. `createState` returns a
// fresh save-shape state; session-only fields are added at boot and stripped
// by save().

export interface HeroState {
  level: number;
  hired: boolean; // revealed and paid once
}

export interface GameState {
  // meta
  save_version: number;
  last_save_time: number | null; // unix seconds, injected
  play_time: number;

  // run
  gold: number;
  gold_earned_run: number; // this run (hero costs keyed off having-seen)
  zone: number;
  kills_in_zone: number;
  monster_hp: number;
  monster_max_hp: number;
  monster_is_boss: boolean;
  monster_primal: boolean; // revenant roll already made for this spawn
  respawn_timer: number; // >0: no monster standing
  boss_timer: number; // countdown while boss alive
  streak_letdown: boolean; // failed a boss once → farming mode

  // the road: where you stand, and whether it moves on its own
  frontier_zone: number; // highest zone reached this run; travel opens to here
  zone_cleared: boolean; // quota done; going deeper is the player's call
  auto_advance: boolean; // progress mode: a cleared zone advances unasked

  // heroes & upgrades
  heroes: Record<string, HeroState>;
  upgrades_bought: Record<string, true>;
  gold_ever: number; // reveals heroes by hire cost

  // embers / rekindling (layer 1, keeps across rekindle)
  embers: number;
  embers_lifetime: number; // all-time, feeds marks
  embers_spent_run: number; // bookkeeping for respec
  levels_bought_run: number;
  revenant_souls_run: number;
  revenant_beaten: Record<string, true>; // zones beaten this run
  rekindles: number;

  // patrons (kept across rekindle, lost on godsfall)
  patrons: Record<string, number>; // id → level (purchased levels only)
  patron_offers: string[]; // 4 ids currently summonable
  offers_revealed: number; // how many of the 10 the roll has surfaced
  summons_used: number;
  reroll_count: number;

  // godsfall (layer 2, keeps across everything)
  godsfall_count: number;
  marks: number;
  gods: Record<string, number>;

  // records
  best_zone: number;
  best_zone_god: number; // post-godsfall best
  paid_zone: number; // deepest zone the Ember ladder has already paid for
  best_gold: number;
  best_dps: number;
  clicks: number;
  kills: number;

  // session-ish but persisted: overdrive gauge persists so an alt-tab keeps
  // the armed state briefly
  overdrive_gauge: number;
  steward: boolean;

  // seeds (primal rolls & patron offers must survive reload)
  seed_revenant: number;
  seed_patron: number;
}

export interface SessionState {
  offline_report: unknown | null;
  toasts: { msg: string; t: number }[];
  save_warning: boolean;
}

export function createState(now = 0): GameState {
  const heroes: Record<string, HeroState> = {};
  for (const h of HERO_IDS) heroes[h] = { level: 0, hired: false };
  // The first-ever run stands alone: no hired damage, so the first monster
  // falls to taps or not at all. A Rekindling is the warm restart — see
  // resetRun in systems/souls.ts, where the Company comes back assembled so an
  // idle-only player can never soft-lock.
  return {
    save_version: 1,
    last_save_time: null,
    play_time: 0,
    gold: 0,
    gold_earned_run: 0,
    zone: 1,
    kills_in_zone: 0,
    monster_hp: 0, // 0 = "no monster standing": the first tick spawns one at
    monster_max_hp: 0, // the real zone-1 HP instead of a hardcoded guess
    monster_is_boss: false,
    monster_primal: false,
    respawn_timer: 0,
    boss_timer: 0,
    streak_letdown: false,
    frontier_zone: 1,
    zone_cleared: false,
    auto_advance: false, // a new run is asked at every cleared zone
    heroes,
    upgrades_bought: {},
    gold_ever: 0, // the hire ladder reveals itself as gold is actually earned
    embers: 0,
    embers_lifetime: 0,
    embers_spent_run: 0,
    levels_bought_run: 0,
    revenant_souls_run: 0,
    revenant_beaten: {},
    rekindles: 0,
    patrons: {},
    patron_offers: [],
    offers_revealed: 0,
    summons_used: 0,
    reroll_count: 0,
    godsfall_count: 0,
    marks: 0,
    gods: {},
    best_zone: 0,
    best_zone_god: 0,
    paid_zone: 0,
    best_gold: 0,
    best_dps: 0,
    clicks: 0,
    kills: 0,
    overdrive_gauge: 0,
    steward: false,
    seed_revenant: 1,
    seed_patron: 1,
  };
}

// Filled from Config at module load without a circular import cycle problem:
// HERO_IDS must match Config.HEROES ids; tests assert it.
import Config from "./config";
export const HERO_IDS = Config.HEROES.map((h) => h.id);
