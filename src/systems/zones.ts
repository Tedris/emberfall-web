// src/systems/zones.ts
// Monster HP / gold / rhythm curves. See DESIGN.md §Numbers. Doubles-only:
// HP reaches ~1e290 near zone 3,500; beyond that the game caps (documented).

import Config from "../config";

export const BIOMES = [
  { name: "Ashen Wood", sky: "#1d2a1f", ground: "#31402f" },
  { name: "Cinder Flats", sky: "#2a2018", ground: "#43331f" },
  { name: "Rotfen", sky: "#1c2622", ground: "#2e3d33" },
  { name: "Salt Waste", sky: "#262a31", ground: "#3c4250" },
  { name: "Ember Downs", sky: "#2e1d18", ground: "#4a2d1e" },
  { name: "Hollow Peaks", sky: "#20242c", ground: "#343b49" },
  { name: "Barrow Deep", sky: "#191c24", ground: "#272b38" },
  { name: "Pale Sea", sky: "#1f2833", ground: "#324053" },
  { name: "Ossuary Reach", sky: "#26212b", ground: "#3b3244" },
  { name: "God's Anvil", sky: "#2b1a20", ground: "#472430" },
];

export const Zones = {
  isBossZone(z: number): boolean {
    return z % Config.BOSS_EVERY === 0;
  },

  biome(z: number) {
    let idx: number;
    if (z <= 5) idx = 0;
    else if (z <= 10) idx = 1;
    else idx = 2 + Math.floor((z - 11) / 10);
    return BIOMES[idx % BIOMES.length];
  },

  hpBase(z: number): number {
    const C = Config;
    const m = Math.min(z, C.HP_EARLY_MAX);
    let h =
      C.HP_BASE * Math.pow(C.HP_GROWTH_EARLY, m - 1) +
      C.HP_LINEAR_PER_ZONE * (m - 1);
    if (z > C.HP_EARLY_MAX) {
      // deep growth: late rate + HP_DEEP_STEP per DEEP_PER zones past 500
      const extra = z > 500 ? C.HP_DEEP_STEP * Math.floor(z / C.HP_DEEP_PER) : 0;
      h *= Math.pow(C.HP_GROWTH_LATE + extra, z - C.HP_EARLY_MAX);
    }
    return h;
  },

  hpOld(z: number): number {
    const C = Config;
    const m = Math.min(z, C.HP_EARLY_MAX);
    return (
      (C.HP_BASE * Math.pow(C.HP_OLD_GROWTH_EARLY, m - 1) +
        C.HP_LINEAR_PER_ZONE * (m - 1)) *
      Math.pow(C.HP_OLD_GROWTH_LATE, Math.max(z - C.HP_EARLY_MAX, 0))
    );
  },

  bossMult(z: number, reductions: number): number {
    const C = Config;
    return Math.max(
      C.BOSS_HP_MULT * (1 + C.BOSS_HP_DEEP * Math.floor(z / C.HP_DEEP_PER)) -
        reductions,
      C.BOSS_HP_FLOOR,
    );
  },

  monsterHp(z: number, isBoss: boolean, reductions = 0): number {
    const hp = Zones.hpBase(z);
    return isBoss ? hp * Zones.bossMult(z, reductions) : hp;
  },

  goldFor(z: number, isBoss: boolean): number {
    const C = Config;
    const factor =
      z >= C.GOLD_FACTOR_FROM
        ? Math.min(
            Math.pow(C.GOLD_FACTOR_RATE, z - C.GOLD_FACTOR_FROM + 1),
            C.GOLD_FACTOR_CAP,
          )
        : 1;
    const base = (Zones.hpOld(z) / C.GOLD_HP_DIV) * factor;
    // Early-game taper: slower first-act kills pay proportionally more so
    // idle tempo holds while taps carry the fighting.
    const early = 1 + Math.max(0, C.GOLD_EARLY_SLOPE * (C.GOLD_EARLY_END - z));
    return isBoss ? base * early * 10 : base * early;
  },

  killsNeeded(z: number, minus: number): number {
    return Math.max(Config.ZONE_KILLS - Math.floor(minus), Config.ZONE_KILLS_FLOOR);
  },

  bossTimer(z: number, bonus: number): number {
    const C = Config;
    return Math.max(
      C.BOSS_TIMER - C.BOSS_TIMER_DEEP * Math.floor(z / C.HP_DEEP_PER) + bonus,
      C.BOSS_TIMER_FLOOR,
    );
  },

  respawnDelay(minus: number): number {
    return Math.max(Config.RESPAWN_DELAY - minus, Config.RESPAWN_FLOOR);
  },
};

export default Zones;
