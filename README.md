# Emberfall

An original idle clicker RPG — a legally distinct take on the Clicker Heroes
formula, built to run as static files in desktop and mobile browsers.
Lead with one genre spine (zone → gold → heroes → Embers → Patrons →
Godsfall), no systems sprawl. Design rationale: [docs/DESIGN.md](docs/DESIGN.md).

## Play

Open `index.html` via any static server (`npm run dev`, or `npm run build`
and serve `dist/`). Progress lives in `localStorage`; offline gains are
simulated on return (capped, with a report).

- The first run starts with **nobody hired**: the first monsters fall to taps,
  and that gold hires the Company. (After a Rekindling the Company restarts
  assembled, so idle play never dead-ends.) Tempo follows Clicker Heroes —
  hands-off play reaches about zone 34 in an hour, and a watched hour with a
  thumb on the glass about zone 40.
- **Road** tab: travel to any zone you have reached, see what standing there
  pays, and choose between *hold* (keep farming the cleared zone) and *go
  deeper*. `Auto-advance` is yours to set — the game never changes it under
  you, and holding a zone can never set you back a zone.
- A boss you cannot kill yet is a wall, not a loss: the road falls back to
  ground you can still sweep, keeps earning, and walks into the wall again once
  you have grown. **Rekindle** (from zone 60) pays Embers only for ground that
  has not been sold already, so a reset is a bet on going deeper.

## Save & reset

- Autosaves every few seconds, on tab-hide, and on close. Offline progress is
  simulated on return (capped, with a report).
- Stats tab: **Save now** (force a write) and **Reset** (two-tap confirm wipes
  run *and* meta and persists the blank slate) — handy during testing.
- Console equivalents: `game.saveNow()`, `game.hardReset()`,
  `game.travel(12)`, `game.goDeeper()`, `game.setAutoAdvance(true)`
  (`window.game` is exposed in the page, dev and prod alike).

## Commands

- `npm test` - run the Vitest suite (systems logic + pacing guards)
- `npm run dev` / `npm run build` - dev server / production build (`dist/`)

## Layout

- `src/config.ts` - all constants and balancing numbers
- `src/state.ts` - single source of truth for game state
- `src/game.ts` - container wiring + boot (save load, offline report)
- `src/systems/` - pure logic modules (no DOM calls)
- `src/ui/` - Canvas rendering + pointer input; geometry from `src/ui/layout.ts`
- `tests/` - one Vitest file per module; `pacing.test.ts` guards the
  tuned difficulty curve against re-balance regressions
