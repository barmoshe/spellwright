# Spellwright — `scene-flow`

**Owner:** Game Developer · **Co-spec:** UX Designer (screen-graph / navigation-contract — screen *content* and back-stack semantics are theirs; this doc is the runtime realisation), Game Designer (run structure).
**Rule:** one obvious place for every piece of state; overlays never own run data; scenes tear down without leaks.

---

## 1. Scene inventory

| Key | Class | Kind | Runs while… | Owns (scene-local) |
|---|---|---|---|---|
| `system` | `SystemScene` | **persistent service scene**, first in list, never stopped, renders nothing | always | `InputRouter`, `AudioMixer`, display scaler, focus handler, overlay stack (`sceneflow`) |
| `boot` | `BootScene` | one-shot | startup | loader passes, validation report |
| `title` | `TitleScene` | root screen | no run active | menu cursor; **audio unlock** on first input |
| `run` | `RunScene` | root screen | a run is active (also while paused under overlays) | tilemap, Arcade world, pools, `ProjectileSystem`, enemies, camera, `RoomDirector` |
| `hud` | `HudScene` | parallel overlay (non-modal, no input focus) | while `run` is running or paused | HUD display objects only |
| `pause` | `PauseScene` | **modal** overlay, tabs: *Wands* (wand editor), *Relics*, *Map/Run info*, *Menu* (Resume / Settings / Abandon run) | opened from `run` | cursor, drag state of the wand editor |
| `reward` | `RewardScene` | modal overlay | room/boss cleared with a reward | the offered choices (rolled by `RunState` from the `loot` stream — the scene only displays/selects) |
| `shop` | `ShopScene` | modal overlay | interacting with a shopkeeper | cursor |
| `run-end` | `RunEndScene` | root screen | run finished; `data.outcome ∈ {death, victory, abandon}` | summary view |
| `settings` | `SettingsScene` | modal overlay (from Title or Pause) | — | edit buffer |
| `credits` | `CreditsScene` | root screen (from Title) | — | scroll position |

Rooms are **not** scenes. A room change inside `run` = `RoomDirector.unload()` (return every pooled object, destroy tilemap layer, clear colliders) + `RoomDirector.load(roomId)`. This avoids a scene restart per room (loader re-entry, bus re-subscription, GC spike) and keeps pools warm.

## 2. Transition graph

```
boot ──► title ──► run (+hud) ──► run-end ──► title
          │  ▲        │   ▲
          │  │        │   └─ close ─┐
          ▼  │        ▼             │
     settings│    pause / reward / shop  (modal, one at a time)
          credits      │
                       └─► settings (stacked above pause; back returns to pause)
run ──(player dies | boss defeated)──► run-end
pause ──(Abandon run, confirmed)──► run-end {abandon}
```

Transitions between root screens use a short fade (UX motion-spec owns timing); `scene.start` is called only after the fade-out completes.

## 3. Overlay protocol (`src/core/sceneflow.js`)

- **`run` is paused by reasons, never by a bare pause/resume pair:** `flow.holdRun(reason)` / `flow.releaseRun(reason)` over a set (`overlay`, `hitstop`). `run` resumes only when the set is empty. Pausing stops update, so Arcade, the worldstep sim, tweens, animations, particles and timers all freeze together; the scene still renders.
- `open(key, data)` — `holdRun('overlay')`, then launch `key`, bring it to top, push it on the stack.
- `close(key)` — `scene.stop(key)`, pop; if the stack is now empty (and nothing is queued): `releaseRun('overlay')`. Returning to `run` also calls `InputRouter.clearHeld()` so a held button in the menu doesn't cast on resume.
- **Only one modal at a time** except the explicit `pause → settings` stack. `reward` and `shop` cannot open while `pause` is open (requests are queued until close).
- **UI intents** (confirm/back/nav) go only to the top of the stack, as an **ordered queue** replayed in press order (architecture §8). `back` on the top overlay = `close` (UX may declare an overlay non-dismissable, e.g. `reward` requires a pick or explicit skip).
- `hud` is never on the stack and never takes input; while a modal is open HUD stays visible but is visually dimmed by the modal's backdrop.
- Focus loss (`platform/focus.js`) while a run exists (running **or held by a hit-stop**) and nothing is open → `open('pause', {tab:'menu'})`.

## 4. State ownership

| Tier | Where | Lifetime | Writers | Readers |
|---|---|---|---|---|
| **Meta** (settings, unlocks, lifetime stats, FTUE flags) | `core/save.js` → localStorage (`save-schema.md`) | forever | `Save` API only | anyone via `Save.get…` |
| **Run** (seed, RNG streams, floor/room index, room graph, player stats: hp/maxHp/gold/keys, wands + slot contents + deck state, spell bag, relics, run stats) | `run/RunState.js`, instance at `registry.get('run')` | `run` start → `run-end` shown | `RunScene` systems and overlays **through `RunState` methods only** (each emits a bus event) | HUD / overlays via bus + getters |
| **Scene-local** (display objects, pools, tilemap, physics bodies, cursors) | the scene instance | scene start → shutdown | that scene | that scene |
| **Catalogue** (designer data, tunables, manifest) | `db.js`, `tunables.js`, `manifest.js` | boot → forever, deep-frozen | nobody after boot | anyone |

- `RunState` holds **no Phaser references** (plain data + methods), so it is serialisable (future save-resume is out of scope — README) and the pure spell engine can operate on its `wandState` objects directly.
- The wand editor edits `RunState.wands[i].slots` via `RunState.moveCard(from, to)`; every edit resets that wand's deck state (Noita semantics — designer may override in the mechanic-spec).

## 5. Events (the only cross-scene channel)
`core/events.js` exports one run bus (a `Phaser.Events.EventEmitter` at `registry 'bus'`) and name constants: `run:start`, `run:end`, `room:enter`, `room:cleared`, `player:hp`, `player:mana`, `player:gold`, `wand:changed`, `wand:cast`, `wand:recharge`, `relic:gained`, `enemy:killed`, `boss:phase`, `reward:offer`, `reward:picked`. HUD subscribes on `create` and unsubscribes on `shutdown`. High-frequency values (mana bar) are coalesced to at most one event per step.

## 6. Teardown checklist (per scene `shutdown`)
- Remove every bus listener the scene added (`bus.off(evt, fn, this)` — listeners are registered with `this` context for exactly this).
- `run`: release all pooled objects, destroy tilemap, `physics.world.off('worldstep')`, clear `SpatialHash`, drop `registry 'run'` **only on transition to `run-end` → `title`** (run-end still reads the summary).
- Never `destroy()` pooled sprites mid-run; pools are destroyed with the scene.
