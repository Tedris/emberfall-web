// src/systems/clicker.ts
// Click resolution: overdrive gauge, crit roll, damage application. DOM-free;
// the UI calls click() with pointer coordinates it has already validated as
// "on the monster".

import Config from "../config";
import type { GameState } from "../state";
import Effects, { type Derived } from "./effects";

export interface ClickResult {
  damage: number;
  crit: boolean;
  // whether the click landed on a monster (gauge/crit still spend nothing)
  landed: boolean;
}

export const Clicker = {
  click(
    state: GameState,
    d: Derived,
    rng: () => number,
    onMonster: boolean,
  ): ClickResult {
    const gmax = Config.OVERDRIVE_MAX + d.overdrive_max;
    state.overdrive_gauge = Math.min(
      gmax,
      state.overdrive_gauge + Config.OVERDRIVE_GAIN * d.overdrive_gain,
    );
    if (!onMonster) return { damage: 0, crit: false, landed: false };

    const dps = Effects.totalDps(state, d, state.overdrive_gauge);
    let damage = Effects.clickDamage(state, d, dps);
    const crit = rng() < d.crit_chance;
    if (crit) damage *= d.crit_mult;
    state.clicks++;
    if (state.monster_hp > 0 && state.respawn_timer <= 0) {
      state.monster_hp -= damage;
      return { damage, crit, landed: true };
    }
    return { damage, crit, landed: false };
  },
};

export default Clicker;
