# Spellwright — `save-schema` (v2)

**Owner:** Game Developer · **Co-spec:** Game Designer (which unlocks/stats persist — `progression-curve`), UX Designer (`settings-spec` defaults).
**Scope:** settings + meta progression only. Runs are **not** save-resumable (README assumption); quitting mid-run abandons it.

## Storage
- `localStorage['spellwright.save']` — one JSON document, target < 16 KB.
- `localStorage['spellwright.save.bak']` — previous good document (written before each overwrite).
- `localStorage['spellwright.save.v1']` — the raw **v1** document, written **once** just before the v1→v2 migration is first persisted (the `.bak` rotation would lose it on the second write). Never read by the game; it is the v1 player's untouched original. If the primary fails to parse, the backup is tried, then defaults; a corrupt primary is copied to `spellwright.save.corrupt` for diagnosis. Load never throws.
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


## v2 (Wave E, 2026-09-27) — modes, Heat, Daily, Gentle, Goals

`SCHEMA_VERSION = 2`. `MIGRATIONS[1]` = `migrateV1` (pure). New `meta` fields (all default-merged by `normalize()`, so a v2 doc missing any of them loads):

```jsonc
"meta": {
  "milestones": ["g_first_run", "g_reach_f2"],   // v2 meaning: PAID goal ids (unlocks.json); the v1 name is kept so the codex reads it unchanged
  "lastMode": "standard",                         // standard | gentle | daily (Mode Select pre-selection)
  "heat": { "max": 0, "last": 0 },                // highest unlocked Heat tier 0..5 (a Standard win at n → n+1) · last selected
  "gentle": { "losses": 0 },                      // lost (death) Gentle runs; never decreases. Bonus = modes.gentle.rule × losses, capped (+4 half-hearts / 20 %)
  "daily": { "date": "2026-09-27", "attempts": 1, // today's UTC daily only (a new date resets it)
             "first": { "date", "outcome", "floor", "step", "timeS", "kills", "loadoutId", "ruleId" },   // the result that counts + the share line source
             "best": { … } },                     // best attempt today ("Best today")
  "goals": { "earned": [], "seen": 0 },           // satisfied-but-unpaid early goals (queue, rules.goals) · goals complete when Goals was last opened (Title "!" badge)
  "bossesReached": [], "bossesKilled": [],        // lifetime mini-boss/boss ids (reach_miniboss / kill_boss)
  "statBonus": { "startCapacity": 0 },            // stat unlocks paid by goals (+1 starting slot; Standard + Gentle only, never Daily)
  "stats": { …v1…, "defencesBroken": 0, "evolves": 0, "duos": 0, "dailyComplete": 0, "bestHeatWin": null },
  "migratedFrom": 1                               // present only on migrated docs
}
```
`meta.curseLevel` is **removed** (read by nothing; RunScene's legacy `Save.meta.curseLevel ?? 0` resolves to 0).

### v1 → v2 migration (`content-inventory.md` §0.1)
| v1 | v2 |
|---|---|
| `milestones` `reach_floor_2 · kill_ossuary_knight · reach_floor_3 · kill_mire_queen · win_run · first_payload · three_deaths` | paid goals `g_reach_f2 · g_kill_boss1 · g_reach_f3 · g_kill_boss2 · g_win · g_first_payload · g_persistence` |
| `all_reactions`, `slayer_300` | dropped; their already-unlocked ids **stay unlocked** (unlock lists persist by id) |
| pre-release v1 docs that already hold `g_*` ids | passed through |
| `curseLevel` c, won (`win_run` / `g_win` / `stats.wins > 0`) | `heat = { max: max(1, c), last: c }`; `stats.bestHeatWin = 0` (the v1 win's curse was not recorded) |
| not won | `heat = { max: 0, last: 0 }` |
| `unlocked.features` has `curses` or won | `heat` added (`curses` kept, harmless) |
| kill milestones | `bossesKilled`/`bossesReached` seeded (`ossuary_knight`, `mire_queen`, `archlich`) |

Unmapped new goals a returning player already satisfies (e.g. `g_first_run`) are **earned at the next run end** and pay through the normal early-goal queue — nothing is lost, and the payout rule stays uniform.

**Safety:** migration runs inside `_parse`; if it throws, the primary is copied to `.corrupt` and the backup is tried (existing path), so a failed migration never overwrites the v1 primary with a half-migrated doc. On success the raw v1 is kept in `.v1`, the migrated doc is flushed at once (`.bak` = the v1 raw on that first write). A doc with `schema > 2` stays read-only as before. Verified in the browser on a planted v1 doc (`schema 1`, curse 2, 6 v1 milestones): → `schema 2`, goals `g_reach_f2, g_kill_boss1, g_win, g_persistence`, `heat {max 2, last 2}`, features `+heat`, cards/wands/relics unchanged, settings kept, `.v1` and `.bak` both hold the schema-1 original.

### Recording (`Save.recordRun(summary)` → `_recordV2`; goals paid by `run/meta.js evaluateMilestones`)
- `summary` (RunState) now carries `mode, heatLevel, daily{date,loadoutId,ruleId}, gentle, defencesBroken, evolves, duosFormed, miniBossesKilled, bossesReached`.
- Standard **victory** at Heat n → `heat.max = min(5, max(heat.max, n+1))`, `bestHeatWin = max(…, n)`.
- Gentle **death** → `gentle.losses++` (abandon does not count).
- Daily: first attempt of the date → `daily.first`; every attempt updates `attempts`/`best`; `dailyComplete++` on a win or after reaching Floor 2.
- Goals: early goals (order ≤ `rules.goals.earlyMaxOrder`) queue in `goals.earned` and pay `earlyPayoutPerRun` (1) per run end, earliest first; later goals pay immediately. Paying applies `unlocks{cards,wands,relics,loadouts,features}` via `Save.unlock` and `unlocks.stats[]` into `statBonus`.
