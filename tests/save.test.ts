import { describe, expect, it } from "vitest";
import Config from "../src/config";
import { createState } from "../src/state";
import Save from "../src/systems/save";
import Offline from "../src/systems/offline";
import Heroes from "../src/systems/heroes";
import Game from "../src/game";

class FakeStorage {
  map = new Map<string, string>();
  getItem(k: string) {
    return this.map.has(k) ? (this.map.get(k) as string) : null;
  }
  setItem(k: string, v: string) {
    this.map.set(k, v);
  }
  removeItem(k: string) {
    this.map.delete(k);
  }
}

describe("save", () => {
  it("round-trips state through fake storage", () => {
    const st = new FakeStorage();
    let now = 1000;
    const save = new Save(st, () => now);
    const s = createState();
    s.gold = 1234;
    s.zone = 42;
    s.patrons["vessa"] = 7;
    expect(save.save(s)).toBe(true);
    const loaded = save.load();
    expect(loaded.fresh).toBe(false);
    expect(loaded.state.gold).toBe(1234);
    expect(loaded.state.zone).toBe(42);
    expect(loaded.state.patrons["vessa"]).toBe(7);
    expect(loaded.state.last_save_time).toBe(1000);
  });

  it("corrupt primary falls back to backup", () => {
    const st = new FakeStorage();
    const save = new Save(st, () => 500);
    const s = createState();
    s.zone = 10;
    save.save(s); // writes primary
    s.zone = 20;
    save.save(s); // rotates zone-10 primary into backup
    st.map.set(Config.SAVE_KEY, "{ broken json");
    const loaded = save.load();
    expect(loaded.from_backup).toBe(true);
    expect(loaded.state.zone).toBe(10);
  });

  it("garbage everywhere yields a fresh state", () => {
    const st = new FakeStorage();
    st.map.set(Config.SAVE_KEY, "[]");
    st.map.set(Config.SAVE_BACKUP_KEY, "nonsense");
    const save = new Save(st, () => 1);
    expect(save.load().fresh).toBe(true);
  });
});

describe("offline", () => {
  function simmed() {
    const s = createState();
    s.gold_ever = 1e12;
    s.gold = 1e6;
    Heroes.hire(s, "cinderroot");
    s.heroes["cinderroot"].level = 40;
    s.gold = 12345;
    s.last_save_time = 1000;
    s.auto_advance = true; // the zone ladder is progress mode
    return s;
  }

  it("below the skip threshold returns null", () => {
    const s = simmed();
    expect(Offline.apply(s, 1000 + Config.OFFLINE_SKIP_SECONDS - 1)).toBeNull();
  });

  it("an hour of idle earns gold and advances zones", () => {
    const s = simmed();
    const rep = Offline.apply(s, 1000 + 3600);
    expect(rep).not.toBeNull();
    expect(rep!.gold).toBeGreaterThan(0);
    expect(s.gold).toBeGreaterThan(12345);
    expect(s.zone).toBeGreaterThan(1);
  });

  it("a held road farms gold without moving the zone", () => {
    const s = simmed();
    s.auto_advance = false; // the player chose to hold here
    const rep = Offline.apply(s, 1000 + 3600);
    expect(rep!.gold).toBeGreaterThan(0);
    expect(rep!.zones).toBe(0);
    expect(s.zone).toBe(1);
  });

  it("caps at OFFLINE_CAP_HOURS", () => {
    const s = simmed();
    const rep = Offline.apply(s, 1000 + 100 * 3600);
    expect(rep!.seconds).toBe(Config.OFFLINE_CAP_HOURS * 3600);
  });

  it("an unbeatable boss walls the sim without zone regression", () => {
    const s = simmed();
    s.zone = 10; // boss zone; level 20 dps (~195) needs 35 s > 30 s timer
    s.heroes["cinderroot"].level = 20;
    const rep = Offline.apply(s, 1000 + 3600);
    expect(rep!.stuck_at).not.toBeNull();
    expect(s.zone).toBe(9); // farmed below the wall, never lower
    expect(rep!.gold).toBeGreaterThan(0);
  });
});

describe("hard reset", () => {
  it("wipes meta and run, and survives a reload", () => {
    const st = new FakeStorage();
    let now = 1000;
    const game = new Game(st, () => now);
    game.state.zone = 77;
    game.state.embers = 900;
    game.state.patrons["vessa"] = 4;
    game.state.gold_ever = 5e6;
    game.hardReset();
    const reloaded = new Game(st, () => now).state;
    expect(reloaded.zone).toBe(1);
    expect(reloaded.embers).toBe(0);
    expect(reloaded.patrons["vessa"]).toBeUndefined();
    expect(reloaded.gold_ever).toBe(createState().gold_ever); // starter seed
    expect(reloaded.heroes["tinder"].hired).toBe(false); // a fresh ember: alone
    expect(reloaded.heroes["cinderroot"].hired).toBe(false);
    expect(reloaded.frontier_zone).toBe(1);
    expect(reloaded.auto_advance).toBe(false); // asked at every cleared zone
  });
});
