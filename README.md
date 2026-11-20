# Emberfall

An original idle clicker RPG — a legally distinct take on the Clicker Heroes
formula, built to run as static files in desktop and mobile browsers.
Lead with one genre spine (zone → gold → heroes → Embers → Patrons →
Godsfall), no systems sprawl. Design rationale: [docs/DESIGN.md](docs/DESIGN.md).

## Play

Open `index.html` via any static server (`npm run dev`, or `npm run build`
and serve `dist/`). Progress lives in `localStorage`; offline gains are
simulated on return (capped, with a report).

## Save & reset

- Autosaves every few seconds, on tab-hide, and on close. Offline progress is
  simulated on return (capped, with a report).
- Stats tab: **Save now** (force a write) and **Reset** (two-tap confirm wipes
  run *and* meta and persists the blank slate) — handy during testing.
- Console equivalents: `game.saveNow()`, `game.hardReset()` (`window.game` is
  exposed in the page, dev and prod alike).

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
