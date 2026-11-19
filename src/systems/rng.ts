// src/systems/rng.ts
// Deterministic PRNG. Revenant rolls and patron offers advance a seed stored
// in the save so reloading cannot re-roll an outcome the player already saw.

export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Hash two integers into a well-mixed 32-bit seed: used for per-zone primal
// rolls so the result is a pure function of (run seed, zone) — no ordering
// dependence, survives reload, reroll-proof.
export function hash2(a: number, b: number): number {
  let h = (a >>> 0) ^ Math.imul(b >>> 0, 0x9e3779b1);
  h = Math.imul(h ^ (h >>> 16), 0x85ebca6b);
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35);
  return (h ^ (h >>> 16)) >>> 0;
}

export function nextSeed(seed: number): number {
  return (Math.imul(seed, 1664525) + 1013904223) >>> 0;
}
