// src/systems/godsfall.ts
// The slow reset: sacrifice the Rekindling loop (embers, patrons) for Marks —
// logarithmic, never lost — and Fallen Power, which makes revenant Ember
// income exponential so it keeps pace with the health curve.

import Config from "../config";
import type { GameState } from "../state";
import { nextSeed } from "./rng";
import { resetRun } from "./souls";

export const Godsfall = {
  // Total Marks ever earned, from lifetime Embers (log scale).
  marksTotal(state: GameState): number {
    return (
      Config.MARKS_PER_DECADE *
      Math.floor(
        Math.log10(Math.max(state.embers_lifetime, 0) + Config.MARKS_EMBER_OFFSET),
      )
    );
  },

  pendingMarks(state: GameState): number {
    return Math.max(0, Godsfall.marksTotal(state) - state.marks);
  },

  available(state: GameState): boolean {
    return state.godsfall_count > 0 || state.zone >= Config.GODSFALL_MIN_ZONE;
  },

  // Fallen Power: automatic from lifetime Marks, 2% → 25%.
  fp(state: GameState): number {
    const C = Config;
    return C.FP_BASE + C.FP_SPAN * (1 - Math.exp(-C.FP_DECAY * state.marks));
  },

  levelCost(state: GameState, id: string, from: number, count: number): number {
    void id;
    // linear ladder: level L costs L → sum from a+1..b = (b(b+1)−a(a+1))/2
    return ((from + count) * (from + count + 1) - from * (from + 1)) / 2;
  },

  level(state: GameState, id: string, count: number): boolean {
    const def = Config.GODS.find((g) => g.id === id);
    if (!def || count <= 0) return false;
    const cur = state.gods[id] ?? 0;
    if (cur + count > def.max_level) count = def.max_level - cur;
    if (count <= 0) return false;
    const cost = Godsfall.levelCost(state, id, cur, count);
    if (state.marks < cost) return false;
    state.marks -= cost;
    state.gods[id] = cur + count;
    return true;
  },

  // maxAffordable by triangular-sum inversion with float guard.
  maxAffordable(state: GameState, id: string): number {
    const cur = state.gods[id] ?? 0;
    let n = Math.floor((-1 + Math.sqrt(1 + 8 * state.marks)) / 2); // from 0
    // subtract levels below cur: find max k with sum(cur+1..cur+k) ≤ marks
    while (n > 0 && Godsfall.levelCost(state, id, cur, n) > state.marks) n--;
    return n;
  },

  // The fall: pays pending Marks, burns patrons/embers/the run.
  perform(state: GameState): number {
    if (!Godsfall.available(state)) return 0;
    const paid = Godsfall.pendingMarks(state);
    state.marks += paid;
    state.godsfall_count++;
    state.embers = 0;
    state.patrons = {};
    state.summons_used = 0;
    state.offers_revealed = 0;
    state.reroll_count = 0;
    state.seed_patron = nextSeed(state.seed_patron);
    state.seed_revenant = nextSeed(state.seed_revenant);
    state.steward = false;
    resetRun(state);
    return paid;
  },
};

export default Godsfall;
