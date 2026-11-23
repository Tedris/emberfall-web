// src/systems/save.ts
// localStorage persistence with backup rotation and versioned migrations.
// Storage backend injected (localStorage-compatible) so tests use a fake.

import Config from "../config";
import { createState, type GameState } from "../state";

export interface StorageLike {
  getItem(k: string): string | null;
  setItem(k: string, v: string): void;
  removeItem?(k: string): void;
}

export interface LoadResult {
  state: GameState;
  saved_at: number | null;
  from_backup: boolean;
  fresh: boolean;
}

// Migration chain keyed by FROM version; v1 is current.
const MIGRATIONS: Record<number, (raw: Record<string, unknown>) => Record<string, unknown>> = {};

export class Save {
  storage: StorageLike;
  now_fn: () => number;
  dirty = false;
  private since_last = 0;
  private timer = 0;
  write_failures = 0;

  constructor(storage: StorageLike, now_fn: () => number) {
    this.storage = storage;
    this.now_fn = now_fn;
  }

  static serialize(state: GameState, now: number): string {
    return JSON.stringify({
      v: Config.SAVE_VERSION,
      t: now,
      s: { ...state, last_save_time: now },
    });
  }

  load(): LoadResult {
    const fresh = createState(0);
    let from_backup = false;
    let raw: string | null = this.storage.getItem(Config.SAVE_KEY);
    if (raw === null) {
      raw = this.storage.getItem(Config.SAVE_BACKUP_KEY);
      from_backup = true;
    }
    if (raw === null) return { state: fresh, saved_at: null, from_backup: false, fresh: true };

    let parsed: { v?: number; t?: number; s?: Record<string, unknown> } | null = null;
    try {
      parsed = JSON.parse(raw);
    } catch {
      parsed = null;
    }
    if (!parsed || typeof parsed !== "object" || !parsed.s) {
      // Corrupt primary → try backup once.
      if (!from_backup) {
        raw = this.storage.getItem(Config.SAVE_BACKUP_KEY);
        if (raw !== null) return this.loadFrom(raw, true, fresh);
      }
      return { state: fresh, saved_at: null, from_backup: false, fresh: true };
    }
    return this.loadFrom(raw, from_backup, fresh);
  }

  private loadFrom(raw: string, from_backup: boolean, fresh: GameState): LoadResult {
    let parsed: { v?: number; t?: number; s?: Record<string, unknown> };
    try {
      parsed = JSON.parse(raw);
    } catch {
      return { state: fresh, saved_at: null, from_backup: false, fresh: true };
    }
    let v = parsed.v ?? 1;
    let s = parsed.s ?? {};
    while (MIGRATIONS[v]) {
      s = MIGRATIONS[v](s);
      v++;
    }
    // Merge over a fresh state so new fields get defaults and junk drops.
    const state: GameState = { ...fresh, ...(s as unknown as GameState) };
    // Shape repair: heroes/patrons maps must exist and be objects.
    state.heroes = { ...fresh.heroes, ...(typeof s.heroes === "object" && s.heroes ? s.heroes : {}) };
    for (const id of Object.keys(fresh.heroes)) {
      const h = state.heroes[id];
      if (!h || typeof h.level !== "number") state.heroes[id] = { level: 0, hired: false };
    }
    state.patrons = typeof s.patrons === "object" && s.patrons ? { ...(s.patrons as object) } as GameState["patrons"] : {};
    state.gods = typeof s.gods === "object" && s.gods ? { ...(s.gods as object) } as GameState["gods"] : {};
    // Road fields predate this save: an older game always auto-advanced, and
    // had by definition walked every zone up to the one it stands on.
    state.frontier_zone = Math.max(state.frontier_zone, state.zone);
    if (typeof s.auto_advance !== "boolean") state.auto_advance = true;
    if (typeof s.zone_cleared !== "boolean") state.zone_cleared = false;
    return { state, saved_at: parsed.t ?? null, from_backup, fresh: false };
  }

  save(state: GameState): boolean {
    const now = this.now_fn();
    const json = Save.serialize(state, now);
    try {
      const prev = this.storage.getItem(Config.SAVE_KEY);
      if (prev !== null) this.storage.setItem(Config.SAVE_BACKUP_KEY, prev);
      this.storage.setItem(Config.SAVE_KEY, json);
      state.last_save_time = now;
      this.write_failures = 0;
      this.dirty = false;
      return true;
    } catch {
      this.write_failures++;
      return false;
    }
  }

  // Throttled autosave; call every frame with frame dt.
  update(dt: number, state: GameState): boolean {
    this.timer += dt;
    if (this.timer < Config.AUTOSAVE_SECONDS && !this.dirty) return false;
    this.timer = 0;
    return this.save(state);
  }

  markDirty() {
    this.dirty = true;
  }

  wipe() {
    this.storage.removeItem?.(Config.SAVE_KEY);
    this.storage.removeItem?.(Config.SAVE_BACKUP_KEY);
  }
}

export default Save;
