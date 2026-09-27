# Spellwright — `save-schema` (v1)

**Owner:** Game Developer · **Co-spec:** Game Designer (which unlocks/stats persist — `progression-curve`), UX Designer (`settings-spec` defaults).
**Scope:** settings + meta progression only. Runs are **not** save-resumable (README assumption); quitting mid-run abandons it.

## Storage
- `localStorage['spellwright.save']` — one JSON document, target < 16 KB.
- `localStorage['spellwright.save.bak']` — previous good document (written before each overwrite). If the primary fails to parse, the backup is tried, then defaults; a corrupt primary is copied to `spellwright.save.corrupt` for diagnosis. Load never throws.
- Writes are debounced (500 ms) and flushed on `visibilitychange:hidden` and `run:end`. `localStorage` unavailable (private mode / quota) ⇒ in-memory only, one console warning, game fully playable.

## Document (v1)
```jsonc
{
  "schema": 1,
  "createdAt": 1790000000000,        // ms epoch
  "settings": {
    "masterVolume": 80,  "musicVolume": 70,  "sfxVolume": 90,  "uiVolume": 80,   // 0..100
    "muteOnFocusLoss": true,
    "screenShake": 100,                // 0..100 (%), forced 0 when reducedMotion
    "reducedMotion": null,             // null = follow OS prefers-reduced-motion
    "flashIntensity": 100,             // 0..100 (%), hit-flash / screen-flash scaling
    "scaleMode": "auto",               // auto | integer | fill (architecture §3; O-UX-1)
    "bloom": false,
    "damageNumbers": true,
    "enemyShotEmphasis": "standard",   // standard | high (accessibility-spec §4.2)
    "showHitbox": false,
    "castMode": "hold",                // hold | toggle
    "tutorialHints": true,
    "showFps": false,
    "aimAssist": 100,                  // 0..100 (%), gamepad only; × feel aimAssistStrength (O-UX-2)
    "bindings": { "kbm": {}, "pad": {} },  // action -> code overrides; empty = defaults (src/input/bindings.js)
    "language": "en"
  },
  "meta": {
    "unlocked": { "spells": [], "wands": [], "relics": [], "characters": [] },   // ids from data/*.json
    "currency": {},                    // meta currency if the progression-curve defines one, e.g. {"essence": 0}
    "stats": { "runs": 0, "wins": 0, "deaths": 0, "kills": 0, "bestFloor": 0, "bestTimeS": null, "playtimeS": 0 },
    "discovered": { "spells": [], "relics": [], "enemies": [] },               // codex
    "ftue": {}                         // { flagName: true } — FTUE lesson flags (UX ftue-flow)
  }
}
```

## Validation on load (boundary)
- Every numeric setting clamped to its range; unknown enum values → default; unknown keys dropped.
- Unlock/discovered ids that no longer exist in `db` are **kept** (content may return) but ignored at runtime.
- Arrays are de-duplicated. Missing sub-objects are filled from defaults (`defaults ⊕ loaded`, deep).

## Pre-release rename (v1, never shipped — no schema bump)
Adopted from `specs/ux/settings-spec.md` §1.1 (2026-09-27): `pixelPerfect` → `scaleMode`. When a stored v1 document still carries `pixelPerfect` (so it was written before this delta): `true → 'auto'`, `false → 'fill'`. Its `aimAssist: 0` was the old default, never a player choice, since no aim-assist row existed then, so it becomes 100. Implemented in `normalize()`; verified with a hand-written legacy document.

## Versioning & migration
- `schema` is an integer. `MIGRATIONS = { 1: v1→v2, 2: v2→v3, … }` applied in order from the stored version to `SCHEMA_VERSION`; each migration is a pure function `(doc) → doc`.
- A document with `schema > SCHEMA_VERSION` (written by a newer build) is loaded read-only for settings and **not overwritten** (the backup key keeps it safe).
- Adding a field with a default needs **no** migration (default-merge covers it); renames/re-shapes do.

## API (`src/core/save.js`)
`Save.settings` (read), `Save.setSetting(k, v)`, `Save.meta` (read), `Save.unlock(kind, id)`, `Save.discover(kind, id)`, `Save.recordRun(summary)`, `Save.setFlag(name)`, `Save.flush()`, `Save.reset()` (Settings → Data → Reset progress, UX confirms). No other module touches `localStorage`.
