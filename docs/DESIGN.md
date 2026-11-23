# Emberfall — design doc

An idle clicker in the Clicker Heroes lineage. **Legally distinct**: original names,
art, text, and tuning; only genre mechanics are shared. Mechanics are not
copyrightable, but we deliberately rename every entity, invent all content, and
re-tune every constant. Never reference "Clicker Heroes" in-game.

Reference: teemo.dev/game-design/clicker-heroes (data-derived CH1 systems). Used
as a survey of what works; numbers below are ours, derived, not copied values.

## Fantasy

You are the Keeper of a dying ember. Twelve sellswords of the Kindled Company
guard the road as it descends into the dark. Each age ends in a Rekindling: the
Company burns, and their Embers summon Patrons — spirits of earlier ages — to
speed the next one. Deeper than the Patrons wait the Fallen Gods; harvesting
them is the Godsfall, the last reset.

## Core loop (seconds → days)

- A single monster stands on the road at zone `z`. Heroes deal DPS; the player
  clicks to add click damage. Kills drop gold, auto-collected (no mouse-chase —
  improvement over coin-swiping).
- The first-ever run opens alone: nobody hired, 0 DPS. The first monster falls
  to taps or nothing stays dead, and gold from those kills buys the first hire.
  A Rekindled run restarts warm instead — the Company comes back assembled.
- The road is somewhere you choose to be. Clearing a zone either walks on
  (progress mode) or holds: the same monsters keep paying gold until the player
  says go deeper. Any zone reached this run is travelable (Road panel).
- Normal zone: 10 kills. Boss zone every 5th zone: 1 monster, 10× HP, 30 s
  timer. Timeout pushes you back one zone. Fail once: progress resets to farm.
  A held zone spawns no timed boss — its boss is already dead — so choosing to
  farm can never be the thing that sets you back (CH1's farm-mode footgun).
- 0.5 s respawn delay after each kill → floor on clear speed (this pacing
  matters; keep it).
- Gold buys hero levels. Level cost `c0 · 1.07^n`. Level damage is flat, but
  every 25 levels from 200 gives ×4 (every 1000, ×10): the "next milestone vs
  next hero" decision is the game.

## Numbers (ours)

Monster HP (`cur`, zones ≤ 140 then kinks; `old` curve also feeds gold):

```
cur(L) = 10·1.55^(L−1) + 10(L−1)        L ≤ 140
cur(L) = cur(140)·1.145^(L−140)         L > 140, growth +0.001 per 500 zones past 500
old(L) = (10·1.6^(min(L,140)−1) + 10(min(L,140)−1)) · 1.15^max(L−140,0)
bossHP = HP · max(10·(1+0.04⌊L/500⌋) − Bubos-like, 5)
gold(kill) = old(L)/12 · zoneFactor, zoneFactor = min(1.025^(L−74), 3) for L ≥ 75, else 1
```

Doubles only (no big-decimal for v1): caps near zone ~3,500 pre-Godsfall —
fine; the wall is embers/Godsfall well before 1e308 matters. Documented limit.

Heroes: 12, geometric hire-cost ladder anchored ~8× gold-earned at their home
zone; base DPS ≈ 5% of their home zone's monster HP. Level-up buttons ×1/×10/×25/MAX.
Hero upgrades: 4 tiers each at levels 10/25/50/100, cost `c0·{10, 100, 1e3, 1e4}`:
+100% hero DPS, +5% global DPS, +100% hero DPS, hero signature (one-off effect).

Damage channels: `DPS = Σ hero` base · milestones · upgrades · globals`. Click =
`4 + 2·TinderLevel` + 0.5% of DPS + `5%·0.82^zone` of home-zone HP (bosses
normalized), ×click multipliers; crit 5% for ×7. CLICK_BASE 4 is the whole
damage budget of a fresh run — about 4 taps per zone-1 monster, which is the
opening: your thumb, then the Company. Tinder has `dps0 = 0`: he is the click
child, so the first hire changes your taps before any hero adds real DPS. The
HP slice keeps taps relevant through the first act, then decays to noise and
automation takes over. Gold carries the slower start via an early taper
(`×(1 + 0.05·(40−zone))`, gone by zone 40).

### Overdrive (improvement #1: gentle active bonus)

Clicks fill a 10 s gauge; above half full, global DPS ×1.25. Decays while idle.
Attentive play ≈ +25%, idle untouched. No combo micro-management, no timer stress.

## Prestige layer 1 — Rekindling (run, minutes–days)

- Spend: gold, hero levels/upgrades, zone → gain Embers.
- `embers = max(1, ⌊heroLevelsBought/1000⌋ + revenantSouls)` — a Rekindling
  always pays at least one Ember, so the first meta beat lands before any
  Revenant falls.
- Revenant bosses: boss zone ≥ 100, first clear of the run, chance
  `max(25 − 2⌊ascensions/500⌋, 5)%` (100/110/120 + every 100th always).
  `reward(L) = ⌊((n+4)/5)^1.3⌋ · (1 + patron/god bonuses)`, n = (L−100)/5.
  Seeded per run → reroll-resistant saves.
- Unspent Embers: +10% DPS each. Rekindle available at zone ≥ 30, button on main
  screen (improvement: CH1 hides it in a hero upgrade at 1.9e19 gold; ours is a
  panel with predicted Ember gain — discovering prestige shouldn't need a wiki).
- Keeps: Embers, Patrons, best records, the auto-advance preference. Wipes:
  gold/heroes/zone/frontier — but the Company restarts assembled (Tinder +
  Cinderroot, Lv 1), so an idle-only player can never soft-lock *after* a
  Rekindling. Only the first-ever run is the cold start with taps alone.

## Patrons (ancients analogue, meta decisions)

4 offers from a seeded roll; n-th summon price ladder (1,2,4,8,16,35,70,125,250,500,
1000,2000); reroll costs ⌈⅓⌉ of next; respec refunds 75%. Level curves: linear `L`,
diminishing `a(1−e^{bL})`, flat `1`. Roster of 10:

| Patron            | Curve       | Effect                                                     |
|-------------------|-------------|------------------------------------------------------------|
| Vessa, Idle Coal  | linear      | +25%×L idle DPS                                            |
| Brann, Emberfist  | linear      | +20%×L click damage                                        |
| Olok, Coinfather  | linear      | +5%×L gold                                                 |
| Myrr, Death-Kind  | flat (1)    | +11%×L DPS per Ember banked (soul bank)                    |
| Sable, Hunt-Seat  | linear      | +15%×L crit damage                                         |
| Grith, Momentum   | pow1.5      | +0.01%×L DPS per Overdrive tick (active scaling)           |
| Hod, Penny-Wise   | 2^L         | hero level cost −(1−e^{−0.01L})·99%                        |
| Kaev, Long Breath | 2^L         | boss timer +30(1−e^{−0.034L}) s                            |
| Nulu, Many deaths | 2^L         | −8(1−e^{−0.025L}) monsters per zone                        |
| Whur, Sixth Sense | 2^L         | +75(1−e^{−0.013L}) revenant chance pts                     |

Idle/active split is real: first 8 summons ≈ 255 Embers total — you can't afford
both lanes early. That's the build decision.

## Prestige layer 2 — Godsfall (slow, hours+)

Unlocks at zone 250. Spend Patrons + Embers → **Marks**:
`marks = ⌊5·log10(lifetimeEmbers + 10)⌋` (delta paid on each Godsfall). Marks buy 3
gods (cost `L(L+1)/2` except first):

| God              | Effect |
|------------------|--------|
| Moloch, All-Maw  | +100%×L DPS (heroes and clicks) |
| Syth, Cheap Grace| ancient-style patron discount (1−0.95^L)·100%, cap L150 |
| Vhor, Revenant-Feeder | +100%×L revenant Embers |

Automatic **Fallen Power** `FP = 0.02 + 0.23(1−e^{−0.0003·marks})` adds an
exponential term `(1+FP)^n` to revenant rewards — the fix that keeps layer-1
income exponential so it never stops mattering. Godsfall keeps: Marks, gods.

## Improvements over the template (kept minimal, all justified)

1. Overdrive gauge (§ core) — active play rewarded without build-tuning.
2. Transparent boss wall: "needs +X% DPS at 30 s" readout; time-to-afford and
   DPS-delta % on every buy button. CH1 makes players guess both.
3. Rekindling panel predicts Ember gain; never hidden behind a purchase.
4. Steward (Ember purchase, 50): auto-hires revealed heroes (keeping a 6×
   reserve so hiring never eats the level budget), auto-buys the best next
   hero level each tick (cheapest next milestone first), and buys unlocked
   hero upgrades. Kills the genre's most tedious busywork.
5. Offline: full zone-ladder simulation (not flat income), capped 24 h, with a
   report; mirrors CH1's per-zone offline sim. A road you chose to hold is held
   offline too: gold from the zone you are standing on, zero zones advanced.
6. Numbers honest: no paywall, no ads, no energy. Save = localStorage.
7. Zone select and a real hold/continue choice, from zone 1. CH1 locks its
   farm-vs-progress toggle behind zone 100, gives no way back except failing a
   boss, and switches progress mode off on you when a timer expires. Ours:
   travel to any zone you reached, the zone's `≈gold/h` printed so farming is
   arithmetic instead of folklore, holding can never set you back, and nothing
   flips the mode but the player — except the Steward, which is the explicit
   hands-off purchase.

## Not building (scope walls — the old project's mistake, revisited)

No gilds, relics, mercenaries, clans, currencies/shops, rubies, active skills,
achievements, events, big-decimal (documented cap), multiple save slots, sound.
If a feature doesn't feed the zone counter or the reset loops, it doesn't ship.

## Architecture (from clicker-adventure-web, kept: what earned it)

- Vite + TS + Canvas + Vitest; `src/systems/` pure logic (no DOM, injected
  storage/time/RNG), `src/ui/` canvas draw + hit-test, `src/config.ts` all
  numbers, `src/state.ts` single state object, versioned save with backup
  rotation + migrations, viewport-fit math (DOM-free).
- Dropped from old project: gacha/waifu/daily/mastery/areas systems — the
  sprawl that sank it. One genre, one spine: zone → gold → heroes → Embers →
  Patrons → Marks → gods.
