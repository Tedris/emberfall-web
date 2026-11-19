// src/game.ts
// Container: owns state + session, wires systems, exposes every player action
// as a method. UI never mutates state directly; it calls these. The action
// surface is the contract shared with the canvas layer and the tests.

import Config from "./config";
import { createState, type GameState } from "./state";
import Effects, { type Derived } from "./systems/effects";
import Combat from "./systems/combat";
import Clicker from "./systems/clicker";
import Heroes from "./systems/heroes";
import Souls from "./systems/souls";
import Patrons from "./systems/patrons";
import Godsfall from "./systems/godsfall";
import Offline, { type OfflineReport } from "./systems/offline";
import Save, { type StorageLike } from "./systems/save";
import { mulberry32 } from "./systems/rng";

export interface Session {
  offline_report: OfflineReport | null;
  toasts: { msg: string; t: number }[];
  save_warning: boolean;
}

export class Game {
  state: GameState;
  session: Session;
  save: Save;
  now_fn: () => number;
  private click_rng: () => number;

  constructor(storage: StorageLike, now_fn: () => number) {
    this.now_fn = now_fn;
    this.save = new Save(storage, now_fn);
    const loaded = this.save.load();
    this.state = loaded.state;
    this.session = { offline_report: null, toasts: [], save_warning: false };
    this.click_rng = mulberry32(
      (Math.floor(now_fn() * 1000) ^ this.state.seed_revenant) >>> 0,
    );
    if (!loaded.fresh) {
      this.session.offline_report = Offline.apply(this.state, now_fn());
    }
  }

  // ── frame ──────────────────────────────────────────────────────────────
  tick(dt: number) {
    const s = this.state;
    s.play_time += dt;
    const d = Effects.derive(s);
    Heroes.stewardTick(s);
    const ev = Combat.tick(s, dt, d);
    if (ev.revenant_souls) this.toast(`Revenant falls: +${ev.revenant_souls} Embers`);
    if (ev.boss_failed) this.toast("The boss holds the road. Farm and grow.");
    if (this.save.update(dt, s) === false && this.save.dirty) {
      this.session.save_warning = true;
    } else {
      this.session.save_warning = false;
    }
    this.session.toasts = this.session.toasts.filter((t) => (t.t -= dt) > 0);
  }

  derived(): Derived {
    return Effects.derive(this.state);
  }

  // ── actions ────────────────────────────────────────────────────────────
  click(onMonster: boolean) {
    const s = this.state;
    const d = Effects.derive(s);
    const res = Clicker.click(s, d, this.click_rng, onMonster);
    this.save.markDirty();
    return res;
  }

  hire(id: string) {
    const ok = Heroes.hire(this.state, id);
    if (ok) this.save.markDirty();
    return ok;
  }

  buyLevels(id: string, count: number) {
    const spent = Heroes.buy(this.state, id, count);
    if (spent > 0) this.save.markDirty();
    return spent;
  }

  buyUpgrade(id: string): boolean {
    const s = this.state;
    if (s.upgrades_bought[id]) return false;
    const [heroId] = id.split(":");
    const hs = s.heroes[heroId];
    const def = Heroes.upgrades().find((u) => u.id === id);
    if (!def || !hs?.hired || hs.level < def.unlock_level) return false;
    const cost = Heroes.upgradeCost(s, id);
    if (s.gold < cost) return false;
    s.gold -= cost;
    s.upgrades_bought[id] = true;
    this.save.markDirty();
    return true;
  }

  setSteward(on: boolean): boolean {
    const s = this.state;
    if (!on) {
      s.steward = false;
      return true;
    }
    if (s.steward || s.embers < Config.STEWARD_COST) return false;
    s.embers -= Config.STEWARD_COST;
    s.steward = true;
    this.save.markDirty();
    return true;
  }

  rekindle(): number {
    const gained = Souls.rekindle(this.state);
    if (gained > 0 || this.state.zone >= Config.REKINDLE_MIN_ZONE) this.save.markDirty();
    if (gained > 0) this.toast(`Rekindled: +${gained} Embers`);
    return gained;
  }

  summonPatron(id: string) {
    const ok = Patrons.summon(this.state, id);
    if (ok) this.save.markDirty();
    return ok;
  }

  levelPatron(id: string, count: number) {
    const ok = Patrons.level(this.state, id, count);
    if (ok) this.save.markDirty();
    return ok;
  }

  rerollOffers() {
    const ok = Patrons.reroll(this.state);
    if (ok) this.save.markDirty();
    return ok;
  }

  respecPatrons() {
    const refund = Patrons.respec(this.state);
    this.save.markDirty();
    this.toast(`The Patrons release their claims: +${refund} Embers`);
    return refund;
  }

  levelGod(id: string, count: number) {
    const ok = Godsfall.level(this.state, id, count);
    if (ok) this.save.markDirty();
    return ok;
  }

  performGodsfall(): number {
    const paid = Godsfall.perform(this.state);
    this.save.markDirty();
    if (paid > 0) this.toast(`The gods fall: +${paid} Marks`);
    return paid;
  }

  saveNow() {
    return this.save.save(this.state);
  }

  toast(msg: string) {
    this.session.toasts.push({ msg, t: 5 });
    if (this.session.toasts.length > 4) this.session.toasts.shift();
  }
}

export default Game;
