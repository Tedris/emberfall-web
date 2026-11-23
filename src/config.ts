// src/config.ts
// All balance numbers and content tables. Pure data; every system derives its
// math from these. Tuning rationale lives in docs/DESIGN.md.

export type EffectKind =
  | "hero_dps" // ×(1+v) for one hero
  | "global_dps" // ×(1+v) all damage
  | "gold" // ×(1+v) gold
  | "click_dmg" // ×(1+v) click damage
  | "click_dps_share" // +v of DPS added to click damage
  | "crit_chance" // +v (fraction)
  | "crit_mult" // +v (× added to crit multiplier)
  | "boss_timer" // +v seconds
  | "zone_kills" // −v kills per zone
  | "respawn" // −v seconds (floor RESPAWN_FLOOR)
  | "revenant_chance" // +v percentage points
  | "revenant_reward" // ×(1+v) revenant Embers
  | "overdrive_gain" // ×(1+v) gauge fill per click
  | "overdrive_max" // +v seconds gauge max
  | "patron_discount"; // −v of patron level costs

export interface Effect {
  kind: EffectKind;
  value: number;
}

export interface UpgradeDef {
  id: string; // `${hero}:${tier}`
  hero: string;
  tier: number; // 0..3
  unlock_level: number;
  cost_mult: number; // × hero hire cost
  name: string;
  effect: Effect;
}

export interface HeroDef {
  id: string;
  name: string;
  blurb: string;
  cost0: number;
  dps0: number; // per-level base is dps0; hero 1 is the click child (dps 0)
}

export type PatronCurve = "linear" | "pow15" | "exp2" | "flat";

export interface PatronDef {
  id: string;
  name: string;
  epithet: string;
  curve: PatronCurve;
  kind: EffectKind;
  per_level: number; // linear/pow15/flat: ×L; exp2: diminishing a in a(1−e^{bL})
  decay: number; // exp2 curve: b (negative); unused otherwise
  effect: Effect; // template; value substituted per curve below
  base_value: number; // a for diminishing, multiplier per L otherwise
  max_level: number;
}

export interface GodDef {
  id: string;
  name: string;
  kind: EffectKind;
  per_level: number; // ×(1+per_level·L) style
  max_level: number;
}

const Config = {
  // ── persistence ────────────────────────────────────────────────────────
  SAVE_KEY: "emberfall.save.v1",
  SAVE_BACKUP_KEY: "emberfall.save.v1.bak",
  SAVE_VERSION: 1,
  AUTOSAVE_SECONDS: 15,

  NUMBER_SUFFIXES: [
    "K", "M", "B", "T", "Qa", "Qi", "Sx", "Sp", "Oc", "No",
    "Dc", "Ud", "Dd", "Td", "Qad", "Qi", "Sxd", "Spd", "Ocd", "Nd",
  ],

  // ── curves ─────────────────────────────────────────────────────────────
  HP_BASE: 16,
  HP_EARLY_MAX: 140, // zones ≤ this use the steep curve + linear term
  HP_GROWTH_EARLY: 1.55,
  HP_LINEAR_PER_ZONE: 10,
  HP_GROWTH_LATE: 1.145,
  HP_DEEP_STEP: 0.001, // late growth +step per DEEP_PER zones past 500
  HP_DEEP_PER: 500,
  HP_OLD_GROWTH_EARLY: 1.6, // steeper curve feeding gold
  HP_OLD_GROWTH_LATE: 1.15,

  GOLD_HP_DIV: 6,
  GOLD_EARLY_SLOPE: 0.05, // pre-act gold boost: 1 + slope·(end − zone)
  GOLD_EARLY_END: 40,
  GOLD_FACTOR_RATE: 1.025,
  GOLD_FACTOR_FROM: 75,
  GOLD_FACTOR_CAP: 3,

  ZONE_KILLS: 10,
  ZONE_KILLS_FLOOR: 4,
  RESPAWN_DELAY: 0.5,
  RESPAWN_FLOOR: 0.2,
  BOSS_EVERY: 5,
  BOSS_HP_MULT: 10,
  BOSS_HP_DEEP: 0.04, // +4% boss mult per 500 zones
  BOSS_HP_FLOOR: 5, // mult floor after reductions
  BOSS_TIMER: 30,
  BOSS_TIMER_DEEP: 2, // −2 s per 500 zones
  BOSS_TIMER_FLOOR: 5,

  // ── heroes ─────────────────────────────────────────────────────────────
  LEVEL_COST_MULT: 1.07,
  MILESTONE_LEVEL0: 200,
  MILESTONE_EVERY: 25, // ×4 every 25 levels from 200…
  MILESTONE_MULT: 4,
  MILESTONE_K_LEVEL: 1000, // …and ×10 every 1000 levels, capped
  MILESTONE_K_MULT: 10,
  MILESTONE_K_CAP: 8,
  BUY_STEPS: [1, 10, 25], // plus MAX (≤ MAX_BUY levels)
  MAX_BUY: 10000,

  // upgrade tiers: unlock level / cost multiple of hire cost (hero DPS except
  // where the signature table says otherwise)
  UPGRADE_TIERS: [
    { unlock_level: 10, cost_mult: 10 },
    { unlock_level: 25, cost_mult: 100 },
    { unlock_level: 50, cost_mult: 1000 },
    { unlock_level: 100, cost_mult: 10000 },
  ],

  // ── clicking ───────────────────────────────────────────────────────────
  // A run opens with nobody on the road: taps are the only damage there is, so
  // CLICK_BASE alone has to fell the first monsters in a handful of taps.
  // On top of the flat hit, clicks add a slice of home-zone HP that decays by
  // zone, so taps stay relevant for the first act and fade to noise once the
  // Company is fighting. Boss HP is normalized so clicking can't one-tap a
  // wall.
  CLICK_BASE: 4,
  CLICK_PER_TINDER_LEVEL: 2,
  CLICK_DPS_SHARE: 0.005, // 0.5% of DPS rides on each click
  CLICK_HP_FRAC0: 0.05, // click adds 5% of (home-zone) HP at zone 0…
  CLICK_HP_FRAC_DECAY: 0.82, // …× 0.82 per zone → negligible past ~15
  CRIT_CHANCE: 0.05,
  CRIT_MULT: 7,

  // ── overdrive (active-play gauge) ─────────────────────────────────────
  OVERDRIVE_MAX: 10, // seconds of stored gauge
  OVERDRIVE_GAIN: 0.5, // gauge seconds per click
  OVERDRIVE_DECAY: 1, // gauge seconds lost per second while below max
  OVERDRIVE_THRESHOLD: 0.5, // ×MAX fraction to arm
  OVERDRIVE_BONUS: 1.25, // global DPS multiplier while armed

  // ── steward (auto-buy) ─────────────────────────────────────────────────
  STEWARD_COST: 50, // Embers, permanent across Rekindling, lost on Godsfall

  // ── embers / rekindling ───────────────────────────────────────────────
  EMBER_LEVEL_DIVISOR: 1000, // levels bought this run ÷ this = Embers
  EMBER_IDLE_BONUS: 0.1, // +10% DPS per unspent Ember
  REKINDLE_MIN_ZONE: 30,
  RESPEC_REFUND: 0.75,

  // ── revenant bosses ───────────────────────────────────────────────────
  REVENANT_MIN_ZONE: 100,
  REVENANT_CHANCE: 25, // percent
  REVENANT_CHANCE_FLOOR: 5,
  REVENANT_ALWAYS: [100, 110, 120], // plus every 100th zone
  PATRON_FIRST_ROLL: [
    "vessa", "brann", "olok", "myrr", "sable", "grith", "hod", "kaev",
    "nulu", "whur",
  ],

  // ── patrons ────────────────────────────────────────────────────────────
  PATRON_SUMMON_LADDER: [1, 2, 4, 8, 16, 35, 70, 125, 250, 500],
  PATRON_REROLL_FRAC: 1 / 3,
  PATRON_OFFERS: 4,

  // ── godsfall ───────────────────────────────────────────────────────────
  GODSFALL_MIN_ZONE: 250,
  MARKS_PER_DECADE: 5, // marks = floor(5·log10(lifetimeEmbers + 10))
  MARKS_EMBER_OFFSET: 10,
  FP_BASE: 0.02,
  FP_SPAN: 0.23,
  FP_DECAY: 0.0003, // Fallen Power = 0.02 + 0.23(1−e^{−0.0003·marks})

  // ── offline ────────────────────────────────────────────────────────────
  OFFLINE_CAP_HOURS: 24,
  OFFLINE_SKIP_SECONDS: 30,

  // ── layout ─────────────────────────────────────────────────────────────
  LAYOUT_MIN_WIDTH: 480,
  LAYOUT_MIN_HEIGHT: 540,

  // ── the road (travel + hold) ───────────────────────────────────────────
  ROAD_WINDOW: 12, // zones per page in the Road panel's zone list

  // ── content: heroes (hire ladder anchored ~8× gold at home zone, DPS
  //    anchored to 5% of home-zone monster HP; see DESIGN.md) ─────────────
  HEROES: [
    { id: "tinder", name: "Tinder the Errand-Child", blurb: "Carries kindling, hits things with it.", cost0: 5, dps0: 0 },
    { id: "cinderroot", name: "Cinderroot", blurb: "A stump that remembered being a forest fire.", cost0: 52.77, dps0: 4.4 },
    { id: "soot", name: "Soot the Chimney Rat", blurb: "Stabs from inside flues. Regrettable hygiene.", cost0: 254.7, dps0: 23 },
    { id: "copperjack", name: "Copperjack of the Road", blurb: "Highwayman. Leaves receipts.", cost0: 2317, dps0: 311.1 },
    { id: "mothwife", name: "The Mothwife", blurb: "Married the lantern. Widowed by the dark.", cost0: 3.787e4, dps0: 4152 },
    { id: "bryn", name: "Ash-Hound Bryn", blurb: "Tracks monsters by the smell of their fear.", cost0: 1.623e6, dps0: 1.377e5 },
    { id: "sixpence", name: "Sixpence the Smuggler", blurb: "Every blade a sixpence. Every hit a debt.", cost0: 1.784e8, dps0: 1.102e7 },
    { id: "molten", name: "The Molten Brother", blurb: "Monk of the Ninth Furnace. Vows of violence.", cost0: 5.022e10, dps0: 2.12e9 },
    { id: "wisp", name: "Wisp Assassin", blurb: "Sent by nobody. Paid by everybody.", cost0: 5.79e13, dps0: 1.518e12 },
    { id: "ysolde", name: "Grail-Widow Ysolde", blurb: "Her husband's cup is still warm.", cost0: 1.709e17, dps0: 2.611e15 },
    { id: "hollow", name: "The Hollow Champion", blurb: "Armor full of embers, no one inside.", cost0: 2.066e21, dps0: 1.673e19 },
    { id: "vey", name: "Vey, Last Ember-Guard", blurb: "Sworn to a throne that burned four ages ago.", cost0: 1.023e26, dps0: 3.991e23 },
  ] as HeroDef[],

  // signatures: the tier-3 (level 100) upgrades; tiers 0–2 are hero_dps /
  // global_dps / hero_dps generated in heroes.ts from UPGRADE_TIERS.
  SIGNATURES: {
    tinder: { kind: "click_dps_share", value: 0.005, name: "Ember-Smudged Knuckles" },
    cinderroot: { kind: "gold", value: 0.25, name: "Bountiful Rot" },
    soot: { kind: "crit_chance", value: 0.03, name: "Chimney Eye" },
    copperjack: { kind: "gold", value: 0.25, name: "Levy the Fallen" },
    mothwife: { kind: "overdrive_gain", value: 0.5, name: "Lanant's Wake" },
    bryn: { kind: "boss_timer", value: 3, name: "Long Hunt" },
    sixpence: { kind: "respawn", value: 0.1, name: "Quick Debts" },
    molten: { kind: "global_dps", value: 0.1, name: "Ninth Vow" },
    wisp: { kind: "crit_mult", value: 3, name: "Throat-Cut" },
    ysolde: { kind: "revenant_chance", value: 3, name: "The Widow's Tithe" },
    hollow: { kind: "global_dps", value: 0.1, name: "Rattle of Ages" },
    vey: { kind: "overdrive_max", value: 3, name: "Unbroken Oath" },
  } as Record<string, { kind: EffectKind; value: number; name: string }>,

  // ── content: patrons (10) ──────────────────────────────────────────────
  PATRONS: [
    { id: "vessa", name: "Vessa", epithet: "the Idle Coal", curve: "linear", kind: "global_dps", base_value: 0.25, decay: 0, effect: { kind: "global_dps", value: 0 }, max_level: 100000 },
    { id: "brann", name: "Brann", epithet: "the Emberfist", curve: "linear", kind: "click_dmg", base_value: 0.2, decay: 0, effect: { kind: "click_dmg", value: 0 }, max_level: 100000 },
    { id: "olok", name: "Olok", epithet: "the Coinfather", curve: "linear", kind: "gold", base_value: 0.05, decay: 0, effect: { kind: "gold", value: 0 }, max_level: 100000 },
    { id: "myrr", name: "Myrr", epithet: "Death-Kind", curve: "flat", kind: "global_dps", base_value: 0.11, decay: 0, effect: { kind: "global_dps", value: 0 }, max_level: 100000 },
    { id: "sable", name: "Sable", epithet: "of the Hunt-Seat", curve: "linear", kind: "crit_mult", base_value: 0.15, decay: 0, effect: { kind: "crit_mult", value: 0 }, max_level: 100000 },
    { id: "grith", name: "Grith", epithet: "of Momentum", curve: "pow15", kind: "global_dps", base_value: 0.005, decay: 0, effect: { kind: "global_dps", value: 0 }, max_level: 100000 },
    { id: "hod", name: "Hod", epithet: "the Penny-Wise", curve: "exp2", kind: "patron_discount", base_value: 0.99, decay: -0.01, effect: { kind: "patron_discount", value: 0 }, max_level: 100000 },
    { id: "kaev", name: "Kaev", epithet: "the Long-Breathed", curve: "exp2", kind: "boss_timer", base_value: 30, decay: -0.034, effect: { kind: "boss_timer", value: 0 }, max_level: 100000 },
    { id: "nulu", name: "Nulu", epithet: "of Many Deaths", curve: "exp2", kind: "zone_kills", base_value: 8, decay: -0.025, effect: { kind: "zone_kills", value: 0 }, max_level: 100000 },
    { id: "whur", name: "Whur", epithet: "the Sixth Sense", curve: "exp2", kind: "revenant_chance", base_value: 75, decay: -0.013, effect: { kind: "revenant_chance", value: 0 }, max_level: 100000 },
  ] as PatronDef[],
  GODS: [
    { id: "moloch", name: "Moloch, All-Maw", kind: "global_dps", per_level: 1, max_level: 100000 },
    { id: "syth", name: "Syth, Cheap Grace", kind: "patron_discount", per_level: 1, max_level: 150 }, // value = (1−0.95^L)
    { id: "vhor", name: "Vhor, Revenant-Feeder", kind: "revenant_reward", per_level: 1, max_level: 100000 },
  ] as GodDef[],
};

export default Config;
