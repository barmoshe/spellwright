# Spellwright — Engine Architecture

**Owner:** Game Developer · **Status:** Wave 1 (architecture + skeleton). Mechanics/content land in Wave 4 against `specs/design/*` + `data/*.json`.
**Consumers:** Game Designer (data + tunables contract §6–§7), Technical Artist (manifest/atlas/render budget §9–§11), Animator (state wiring §10), Audio Director (mixer §12), UX Designer (resolution/input/overlays §3, §8, `scene-flow.md`).
**Engine:** Phaser **4.1.0** vendored at `lib/phaser.esm.min.js` (byte-identical to `../gem-vault`). Every Phaser API named here was verified against the vendored build (grep), not v3 memory — see §14.

---

## §0 Runtime origin (keystone contract)

- Served over **http** (`python3 -m http.server 8741` from the project root; `.claude/launch.json` config `spellwright`). **Not `file://`.**
- Plain **ES modules** (`<script type="module" src="src/main.js">`), **no bundler**, no npm dependencies. Edit → reload is the whole dev loop (F3).
- Because the origin is http: JSON data, the asset manifest and the feel-spec markdown are loaded through the **Phaser Loader** (`load.json` / `load.text`) at boot; Web Audio `decodeAudioData` is available (Phaser WebAudioSoundManager).
- Phaser `preload()` is synchronous — never `await` inside it (gem-vault lesson). Multi-pass loads chain via `filecomplete-*` events and a second `load.start()` in `create()`.

---

## §1 Module layout (`src/`)

```
index.html                 canvas host, perf overlay <div>, module entry
src/main.js                Phaser.Game config + scene list (only file that constructs the Game)
src/config.js              engine constants: VIEW_W/H, TILE, SIM_HZ, entity caps, depth bands
src/platform/              THE platform boundary (F4) — nothing else touches window/document events
  display.js               integer-zoom scaler (resize → scale.setZoom(k)), fullscreen toggle
  focus.js                 blur / visibilitychange → input clear + auto-pause + audio suspend
src/core/                  Phaser-light services, one instance each (owned by SystemScene)
  rng.js                   mulberry32 + named streams (run/loot/spell/ai/fx)
  pool.js                  generic free-list pool (never destroy in steady state)
  events.js                run bus + event-name constants (the only cross-scene channel)
  db.js                    data catalogue: loads data/*.json verbatim, validates, deep-freezes
  manifest.js              asset-manifest.json consumer (TA contract), tolerant of absence
  tunables.js              parses feel-tunables blocks out of specs/design/feel-spec.md verbatim
  save.js                  versioned localStorage (see save-schema.md)
  audio.js                 mixer over Phaser SoundManager (cue-spec driven; Wave 4 fills cues)
  sceneflow.js             overlay stack + run pause-reason set (see scene-flow.md)
  timecontrol.js           hit-stop: freezes the whole run scene (§4 Time control)
  i18n.js                  t(key) string table (externalized strings from day one)
  log.js                   telemetry ring buffer: "did X fire?" answerable from the console
src/input/
  bindings.js              default KB+mouse and gamepad bindings (rebindable via settings)
  InputRouter.js           one Intent per sim step from any device (§8)
src/spells/                PURE — no Phaser import, no Math.random, no Date (§5)
  types.js                 JSDoc typedefs: Card, WandDef, WandState, CastPlan, CastInstruction
  deck.js                  deck/discard/hand ops over a wand's slot list
  modops.js                modifier-op registry (pure numeric transforms of a ModStack)
  evaluate.js              castWand(wandDef, wandState, cards, rng, rules) → CastPlan
  index.js                 barrel export
src/effects/
  registry.js              effect-key registry (§6): projectile / relic / enemy / boss namespaces
src/sim/                   Phaser-side fixed-step simulation (runs on Arcade 'worldstep')
  SpatialHash.js           uniform grid over enemies, preallocated Int32Arrays
  ProjectileSystem.js      pooled projectiles: kinematics, wall grid, hit queries, effect hooks
src/run/
  RunState.js              the run's data (plain JS, no Phaser refs) — created/destroyed per run
src/ui/Menu.js             the one menu implementation (UI-intent queue + mouse, same items)
src/core/inputs.js         the upstream deliverables Boot loads (null = not delivered yet)
src/core/placeholders.js   generated placeholder textures (Wave-1 only; replaced by TA atlases)
src/effects/debug.js       debug-arena behaviors (stress mode), not content
src/scenes/overlay.js      shared modal chrome (input-swallowing backdrop + services)
src/scenes/                SystemScene, BootScene, TitleScene, RunScene, HudScene, PauseScene,
                           RewardScene, ShopScene, RunEndScene, SettingsScene, CreditsScene
```

Wave 4 adds (content-bearing, not in the skeleton): `src/sim/EnemySystem.js`, `src/sim/PickupSystem.js`, `src/effects/impl/*.js` (one file per effect family), `src/run/RoomDirector.js` (room load, waves, doors), `src/ui/*` widgets.

**Dependency direction (enforced by review):** `spells/` imports nothing outside `spells/`. `core/` never imports `scenes/`. `sim/` imports `core/`, `spells/`, `effects/`. Scenes import everything. A cycle is a bug.

---

## §2 Engine constants (`src/config.js`)

| Constant | Value | Why |
|---|---|---|
| `VIEW_W × VIEW_H` | **640 × 360** | §3 |
| `TILE` | 16 px | The 16-px dungeon packs in the TA's shortlist class (0x72 DungeonTileset II, Kenney Tiny Dungeon) all sit on a 16-px grid. |
| `SIM_HZ` | 60 | All designer `frames` units are consumed as **sim steps** 1:1 — no ms conversion anywhere. |
| `MAX_PROJECTILES` | 512 pooled (budget 400 live, §11) | 28% headroom over the 400 target. |
| `MAX_ENEMIES` | 64 pooled (budget 40 live) | |
| `CAST_INSTRUCTION_CAP` | 64 per cast | Guards the §11 budget against degenerate multicast (see §5.4). |
| `TRIGGER_DEPTH_CAP` | 6 | Trigger-in-trigger recursion bound (Noita's is effectively unbounded; ours isn't). |

---

## §3 Resolution & scaling — 640×360, integer zoom, `pixelArt: true`

**Decision: 640×360 internal, integer-scaled.** Defended against 480×270:

| Display (CSS px) | 640×360 zoom → fill | 480×270 zoom → fill |
|---|---|---|
| 1920×1080 | ×3 = 1920×1080 (**100%**) | ×4 = 1920×1080 (100%) |
| 1366×768 (the most common budget laptop) | ×2 = 1280×720 (**94%**) | ×2 = 960×540 (70%) |
| 1536×864 (1080p @125% Windows) | ×2 = 1280×720 (83%) | ×3 = 1440×810 (94%) |
| 1440×900 (MacBook Air) | ×2 = 1280×720 (89%) | ×3 = 1440×810 (100% w) |
| 2560×1440 | ×4 = 2560×1440 (**100%**) | ×5 = 2400×1350 (94%) |

640×360 is exact at the two dominant 16:9 panels (1080p, 1440p) and ≥83% everywhere else. More decisive is **gameplay space**: a bullet-heavy arena with 400 projectiles needs view. 640×360 at 16-px tiles is **40×22.5 tiles** of visible room (480×270 is only 30×17) — enough for a full single-screen combat room, so enemies never attack from off-screen in normal rooms. UI text at 640×360: an 8-px pixel font renders at ≥16 CSS px at zoom ≥2 (legible; UX to confirm minimum sizes).

**Implementation (`platform/display.js`) — revised for objection O-UX-1 (accepted 2026-09-27):** `Settings → Scaling` (`scaleMode`, default **`auto`**). On every resize, `fit = min(innerW/640, innerH/360)`, `k = floor(fit)`:
- `auto`: **integer zoom `k` when `k ≥ 2`, otherwise fractional `fit`**. The earlier "integer whenever k ≥ 1" rule put a 1366×768 laptop (viewport ≈ 1366×650, so k = 1) at a 640×360 canvas: 47% of the width and 7-CSS-px text, below the accessibility-spec minimums. Auto now gives ×1.81 (1156×650) there.
- `integer`: always `max(1, k)` (sharp pixels, may be small). `fill`: always fractional `fit`.
- **One code path:** `Scale.NONE` + `scale.setZoom(zoom)` with an integer or fractional zoom; the canvas is centred by flexbox. Switching the ScaleManager to `FIT` after boot was rejected: in 4.1.0 it does not update `displaySize`'s aspect mode and stretched the canvas to 1366×650 (found and fixed while resolving O-UX-1). Verified: aspect 1.778, pointer → game coordinates exact at ×1.806.
- **Fullscreen:** Title menu item + Settings row + F11, via `display.toggleFullscreen()` (a user gesture is required, so it is not persisted).

| Viewport (CSS px) | auto |
|---|---|
| 1920×~970 (1080p browser) | ×2 integer (1280×720) |
| 1366×~650 | ×1.81 fill |
| 1400×820 | ×2 integer |
| 2560×~1300 | ×3 integer |

**Render config:** `pixelArt: true` (verified in build: sets `antialias=false`, `antialiasGL=false`, `roundPixels=true`), `resolution` left at 1 (the internal canvas *is* the pixel grid; DPR is absorbed by zoom).

---

## §4 Physics — Arcade for actors, custom fixed-step sim for projectiles

**Target:** ~400 live projectiles + ~40 enemies + player at 60 fps on a mid laptop (reference: 2019 i5 / Intel UHD 620, Chrome).

**Decision: hybrid.**
- **Actors (player, enemies, boss bodies, knock-backable pickups) → Arcade Physics.** ~45 bodies. Arcade gives us for free exactly what actors need: velocity/drag integration, `collider(actor, wallLayer)` against a tilemap layer with `setCollision`, enemy-crowd separation (`collider(enemyGroup, enemyGroup)`), knockback via velocity impulses. Fighting it would mean reinventing tile collision resolution.
- **Projectiles (player and enemy) → `src/sim/ProjectileSystem.js`, not Arcade bodies.** Grounds for the split (measured against the vendored source, §14):
  1. Arcade's `World.step` rebuilds its dynamic R-tree **every step** via `this.tree.clear(), this.tree.load(Array.from(bodies))` — at 440 bodies that is a 440-element array allocation + an R-tree bulk load per step (≈26k allocations/s of GC churn), paid even for bodies that only ever need an *overlap* test.
  2. Projectiles never need *separation* (Arcade's core product). They need overlap-only queries against ~40 enemies — a uniform spatial hash over 40 enemies answers that in O(projectiles × ~2 cells).
  3. Spell behaviours (bounce-with-count, pierce, homing, orbit, boomerang, speed ramps, trigger-on-hit/timer/expire payloads) are per-projectile state machines that would fight Arcade's collision callbacks; in a custom step they are a few lines each inside the effect registry (§6).
- **One clock.** The projectile sim, casting, AI and effects run **inside Arcade's fixed step** by subscribing to `physics.world.on('worldstep')` (verified: emitted once per fixed step, including catch-up steps). Arcade config: `{ fps: 60, fixedStep: true }`. Result: exactly one gameplay step per physics step, deterministic for a given seed + input stream, frame-rate independent (120/144 Hz monitors step 60 Hz and interpolate nothing — pixel art at 60 Hz sim is the genre norm).
- **Walls for projectiles:** a `Uint8Array` solid-grid mirror of the room's collision layer (built once per room). Projectile–wall test = grid lookup at the new position (sub-stepped when `speed·dt > TILE/2` so fast projectiles can't tunnel); bounce reflects the velocity component on the crossed axis.
- **Hit tests:** `SpatialHash` (cell 32 px) rebuilt each step from live enemies (Int32Array head/next lists, zero allocation). Each projectile queries the cells its circle overlaps; circle-vs-circle hit. Enemy projectiles test the single player circle directly.
- **Step order (per fixed step):** Arcade integrates actor bodies + colliders → `worldstep` → (1) `InputRouter.sample()` → (2) player intents (move velocity for next step, casting via the spell engine) → (3) enemy AI (sets velocities) → (4) `ProjectileSystem.step()` (move, walls, hits, effect hooks, expiries, trigger payload releases) → (5) deaths/drops → (6) bus events to HUD (coalesced).
- **Time control — revised for the animation-state-graph-design objection (accepted 2026-09-27):** hit-stop **pauses the whole `run` scene**, not just `physics.world`. `core/timecontrol.js` (owned by SystemScene, which never pauses; registry `'time'`) calls `flow.holdRun('hitstop')` and releases it after the requested real ms. A paused Phaser scene still renders but does not update, so the Arcade world, the worldstep sim, the scene's tweens, every sprite animation, the particle emitters, the scene clock and camera effects all freeze on the same frame and resume together. That is the freeze frame the feel-spec specifies. Audio keeps playing (feel-spec: cues land on the hit frame). Input edges stay latched and are consumed on the first step after the freeze. Overlapping requests extend to the later end; they don't add. `run` pauses by **reason set** (`overlay`, `hitstop`, see `scene-flow.md` §3), so a hit-stop ending under an open menu can't resume the run, and closing a menu mid-freeze can't cut the freeze short. Both orderings were verified in the browser, and a frozen run showed identical sim steps, projectile positions, tween values and scene clock across the freeze. Slow-mo, if the design ever asks for it, would need scene-wide `timeScale` (world + tweens + anims + time), never world-only.

- **Movement latency (known, bounded):** because the sim runs on `worldstep` (after Arcade integrates), a movement intent sampled at step N integrates at step N+1. With feel-spec `moveAccel` 1650 px/s² the first ≥1 px displacement renders 2 frames after the input frame — inside the feel-spec move target (2 frames, ceiling 4). If Wave-5 frame-stepping measures 3, the player switches to manual integration in `simStep` (`pos += v·dt`, then `physics.world.collide(player, walls)`), removing the step of lag without touching enemies.
- **High-refresh displays:** the sim is 60 Hz with no render interpolation; on 120/144 Hz panels sprites move on 60 Hz steps (pixel-art norm). Interpolation is deferred until a 144 Hz judder complaint is concrete.

Matter was rejected: rigid-body stacking/rotation isn't a verb in this game, and Matter's per-body cost is several times Arcade's.

---

## §5 Spell-evaluation engine (`src/spells/`, pure)

> **Ratified 2026-09-27 (Wave 1 reconciliation):** `specs/design/mechanic-spec.md` §4 is the **normative** cast algorithm and §5.1 the normative stat pipeline. Its four declared deviations from this section are **accepted** by the Game Developer: (1) a trigger is a standalone card whose *next group* is the carrier and the group after that the payload; (2) `modifierScope = next_group`, `wrapMode = wrap_once_skip_drawn` (both read from `data/rules.json#casting`, not hard-coded); (3) data field names as in `data/*.json` (`mana`, `castDelayMs`, `rechargeMs`, `castDelayAddMs`, `rechargeAddMs`, `effects[{key,op,value}]` with ops `add|mult|set|append`); (4) three wand slots. The Wave-1 `evaluate.js` implements the generic engine contract below (and is proven deterministic in node); **Wave 4 rewrites `evaluate.js` / `modops.js` to mechanic-spec §4/§5.1 verbatim** — same pure signature, same determinism guarantees, `CAST_INSTRUCTION_CAP`/`TRIGGER_DEPTH_CAP` kept as backstops behind the designer's stricter `maxShotsPerCast` 32 / `maxTriggerDepth` 3. The subsections below describe the Wave-1 engine contract; where they differ from the mechanic-spec, the mechanic-spec wins.

The wand system is the game's core verb, so its logic is a **Phaser-free, deterministic module**: same wand + same deck state + same RNG seed ⇒ same `CastPlan`, every time. It can be run from a node REPL to reason about a combo (I1-compatible review aid, not a test suite).

### 5.1 Contract

```js
castWand(wandDef, wandState, cardsById, rng, rules) → CastPlan
```
- `wandDef` (data, frozen): `{ id, capacity, spellsPerCast, castDelay(frames), rechargeTime(frames), manaMax, manaRegen(/s), spread(deg), shuffle(bool), speedMult, alwaysCast:[cardId] }` — final field names follow `data/wands.json` once the designer lands it.
- `wandState` (RunState-owned, mutable only by the engine): `{ slots:[cardId|null], deck:int[], discard:int[], mana, cooldown(frames), recharging(bool) }`.
- `cardsById`: the frozen card catalogue from `db.js`.
- `rng`: the run's `spell` RNG stream (§5.3).
- `rules`: `{ wrapMode, modifierScope, … }` from tunables/data — the knobs where Noita and Magicraft differ, so the designer picks, not the code.
- **Output** `CastPlan`: `{ instructions: CastInstruction[], manaSpent, castDelay, rechargeTime, wrapped, truncated, skipped:[cardId] }`, where `CastInstruction = { cardId, effect, mods: ModStack, angleOffset, payload: CastInstruction[] | null, trigger: 'hit'|'timer'|'expire'|null, triggerParam }`.

### 5.2 Card model (engine-side, maps onto designer data)

Every card has `type ∈ { projectile, modifier, multicast, trigger, passive }`, `manaCost`, optional `castDelay`/`rechargeTime` deltas.
- **projectile** → one `CastInstruction` with its `effect` key (e.g. `"spark_bolt"`) and the current `ModStack`.
- **modifier** → pushes `mods: [{op, value}]` onto the `ModStack` for the rest of the cast group (`rules.modifierScope = 'group'`) or only the next projectile (`'next'`); draws one more card.
- **multicast** `drawCount: N` → draws N more cards into this group; optional `pattern` (`spread`/`circle`/`line`) sets `angleOffset`s.
- **trigger** `payloadDraw: N, trigger: hit|timer|expire` → a projectile whose `payload` is the next N draws evaluated as a **sub-group** (recursive, depth ≤ `TRIGGER_DEPTH_CAP`).
- **passive** → contributes to `alwaysCast`/wand stats, never drawn.
- Out of mana: the card is skipped (recorded in `skipped`) and the next is drawn.

Modifier ops are named keys in `modops.js` (`add`, `mul`, `set`, `flag` over fields such as `damage`, `speed`, `lifetime`, `spread`, `bounces`, `pierce`, `homing`, `size`, `critChance`) — so a designer modifier is data (`{"op":"mul","field":"speed","value":1.5}`), not code.

### 5.3 Determinism

`rng.js` provides named streams split from the run seed: `run`, `loot`, `spell`, `ai`, `fx`. Cosmetic randomness (particles, shake jitter) draws **only** from `fx`, so turning FX off never changes gameplay outcomes. The spell engine only ever sees the `spell` stream. `Math.random` is banned in `src/spells`, `src/sim`, `src/run` (grep-able).

### 5.3b Wand-editor preview (systems.md §6/§7)
`previewCycle(wandDef, wandState, cards, rng, rules)` (`src/spells/preview.js`) dry-runs one full cycle on a **cloned** wand state and a **cloned** RNG (`RNG.clone()`), returning every cast's plan plus cycle time and mana per cycle — the data the UX preview needs (shot list per cast, sustainability, ≈DPS). Previewing never perturbs what the real wand fires next.

### 5.4 Budget guard (why the caps exist)

A wand of 20 slots with nested multicasts and trigger payloads can combinatorially emit hundreds of projectiles per cast. `castWand` truncates at `CAST_INSTRUCTION_CAP = 64` (sets `truncated: true`, no silent failure — logged via `log.js`), and `ProjectileSystem` refuses spawns past `MAX_PROJECTILES` (counted, logged). The designer should treat 64 projectiles/cast as a design ceiling, not an engine accident.

---

## §6 Effect-key registry (`src/effects/registry.js`)

Each designer effect key is implemented **exactly once** and referenced by data.

Namespaces mirror the designer's vocabulary (mechanic-spec §5.4, §6.1, §7, §9):

| Namespace | Data source | Keys (from `data/*.json`, Wave 1) |
|---|---|---|
| `behavior` | `spells[].behavior.type` | bolt, boomerang, orbit, mine |
| `effect` | `onHit[]`, `onExpire[]`, `onTick.effects[]` `.type`; modifier `append` values | explode, chain, split, zone, pull, zap, teleport_caster |
| `relic` | `relics[].effects[].type` | shot_stat, player_stat, status_rule, effect_param, on_event, economy |
| `action` | `relics[].effects[].action.type` | heal, mana, explode, spawn_spell, shield, revive (+ coins) |
| `movement` | `enemies/bosses[].movement.type` | chaser, kiter, swarm, stationary, drifter |
| `attack` | `enemies/bosses[].attacks[].type` | melee_swipe, shoot, ring, spiral, charge, slam, summon, blink, self_destruct, hazard, sequence |

```js
defineEffect('behavior', 'bolt',   { onSpawn, onStep, onHitEnemy, onHitWall, onExpire })
defineEffect('effect',   'explode',{ apply(entry, shot, at, ctx) })
defineEffect('attack',   'spiral', { windup(e, ctx), act(e, ctx), recover(e, ctx) })
```
Running `validateEffects(DB)` against the designer's delivered data lists **39 keys** — exactly the Wave-4 implementation worklist (one registry entry each).
- Hooks are plain functions receiving pooled objects + a `ctx` (sim services); they must not allocate per step.
- **Boot validation:** after `db.js` loads, `registry.validate(db)` walks every data record that names an effect key and lists **all** unimplemented keys in one `console.error` + the on-screen dev banner. No silent no-op fallback for a missing key in a shipped build (a missing projectile effect renders as a magenta debug bolt so it is visible, not invisible).
- Relic hooks subscribe through the run bus (`events.js`) so relics never reach into scene internals.

---

## §7 Data & tunables contracts

### 7.1 Designer data — `data/*.json`, loaded verbatim
- **Index:** `data/index.json` = `{ "version": 1, "files": { "<table>": "data/<file>.json", … } }`. Boot loads the index, then every listed file through the Phaser loader. Adding a table is a data edit, not a code edit.
- Each table file is `{ "version": n, "<table>": [ { "id": "…", … }, … ] }` (array of records with unique string `id`). The engine never rewrites a file; `db.js` deep-freezes the parsed objects and indexes them `db.<table>.byId`.
- **Validation at the boundary** (`db.js`): unique ids, required fields per table, every cross-reference (`wand.alwaysCast`, room → enemy ids, loot tables → card ids) resolves; failures list every offending record in one error.
- Expected tables (names final when `specs/design` lands): `spells` (cards incl. modifiers/multicast/triggers), `wands`, `relics`, `enemies`, `bosses`, `rooms`, `waves`/`encounters`, `loot`, `shop`, `progression`/`unlocks`.

### 7.2 Feel tunables — read **verbatim from `specs/design/feel-spec.md`**
- `tunables.js` fetches the feel-spec markdown (`load.text`) and parses every `feel-tunables:` fenced YAML block (the studio template shape: `verb:` + `params:` rows of `{ param, value, unit, source_ref, range, frozen }`). **There is no hand-mirrored copy to drift** — the spec *is* the tunables file. A row that fails to parse is a loud boot error naming the line.
- Flattened into one frozen object `TUNING[param]`. A `param` repeated across verbs is namespaced `verb.param` per the feel-tunables-block escape valve and reported.
- Unit handling: `ms` → sim steps via the single helper `toSteps(ms) = round(ms·60/1000)` (the designer's declared convention, mechanic-spec §0 / feel-spec §0; also used for data `…Ms` fields); `frames` = sim steps 1:1; `frac-W`/`frac-H` resolve via `scaledW/scaledH(v)` against 640/360; `deg`, `px/s`, `px/s2`, `hz`, `ratio`, `mult`, `count` verbatim.
- **Verified against the delivered feel-spec (Wave 1):** 8 blocks (move, aim, cast, dash, impact, hurt, camera, pickup), **70 tunables, 0 parse errors, 0 key collisions**, loaded live over http by Boot; `moveSpeed`, `moveStickDeadzone`, `aimStickDeadzone` already consumed by the skeleton.
- **Presence ≠ consumption:** with `?debug` in the URL, `TUNING` is wrapped in a read-tracking Proxy; `__SW__.tunables.unread()` lists every declared tunable no code has read this session (the §8 convergence item 2 check, answerable in seconds). Hot loops cache tunables into locals at system init, so the Proxy never sits on a per-projectile path.
- Non-feel numeric data (damage, mana costs, HP, prices) lives in `data/*.json`, not in the feel-spec.

---

## §8 Input abstraction (`src/input/`)

**One codepath, many devices.** Gameplay never reads a key or a button; it reads an `Intent` sampled once per sim step:

```
Intent { moveX, moveY (unit-disc, deadzoned), aimX, aimY (unit vector), aimWorldX/Y (mouse only),
         castHeld, castPressed, altCastHeld, dashPressed, interactPressed,
         wandNext, wandPrev, wandSlot (1..4 | 0), openInventory, pause, device: 'kbm'|'pad' }
```
- **KB+mouse** (per mechanic-spec §13, which resolved an E-key conflict in the first draft of this section): WASD/arrows move (diagonal normalised), mouse aims (pointer → vector from the player's screen position), LMB cast, **Space or RMB dash**, **E interact (only)**, **Q / wheel cycle wands**, 1–3 select, Tab/I wand editor, Esc pause. `altCast` exists in the Intent but is unbound (unused by the design). Browser context menu disabled on the canvas.
- **Gamepad twin-stick** (`input: { gamepad: true }`; Standard mapping): left stick move, right stick aim (radial deadzones = feel-spec `moveStickDeadzone` / `aimStickDeadzone`, applied by `InputRouter.applyTunables()` after Boot; releasing the stick keeps last aim), RT cast, A/LB dash, X interact, RB next / Y previous wand, Back wand editor, Start pause. D-pad / left-stick flicks + A/B drive menus; Back/Start also close the top overlay.
- **Aim assist (pad only):** effective strength = feel `aimAssistStrength` × `Save.settings.aimAssist` / 100 (default 100 ⇒ the designer's 0.5 exactly; objection O-UX-2 accepted). Cone and range tunables are unscaled. Mouse is never assisted.
- **Cast mode:** `settings.castMode = 'toggle'` turns a cast press into a latch (`castHeld = latch`). The latch survives modals and is cleared on run end (`InputRouter.resetCastLatch()`).
- **Cast on tap:** a press shorter than one step still casts once (`castPressed`). The feel-spec's `castBufferMs` (hold a press through cooldown) is a Wave-4 buffer on top of the latch.
- **UI channel is an ordered queue**, not a set: rapid presses (e.g. Right then Confirm inside one frame) replay in press order; OS key auto-repeat produces only menu *directions*, never gameplay edges or confirm/back (holding Tab can't flicker the editor). The queue is capped at 16 so gameplay can't grow it.
- **Active device** = whichever device produced the last meaningful input; the HUD swaps glyphs (UX). Mouse aim and stick aim never fight: whichever device is active owns `aimX/Y`.
- **Edge latching:** a press that lands between two sim steps is latched and consumed by the next step, so taps are never lost at any render rate.
- **UI intents** (`up/down/left/right/confirm/back/tabNext/tabPrev`) are a separate channel routed to the top overlay only (`sceneflow` stack), so a menu confirm can never fire a cast.
- **Rebinding:** default tables in `bindings.js`; overrides persisted in `save.settings.bindings` (see `save-schema.md`).
- **Focus loss** (`platform/focus.js`): `blur`/`visibilitychange:hidden` → clear all held inputs, open Pause if a run is active, suspend audio context. Touch is **deferred** (README); the Intent shape already fits a future virtual twin-stick.

The router lives in the always-running `SystemScene` (first in the scene list ⇒ samples raw state before any other scene updates).

---

## §9 Rendering

- **Batching:** Phaser 4's WebGL batcher packs multiple textures per batch; batches break on **blend-mode change, filter, mask, or render-target switch**. Therefore: gameplay sprites (actors, projectiles, pickups, impact flipbooks) come from **one gameplay atlas** (TA), tiles from one tileset texture, UI from one UI atlas + one bitmap font.
- **Depth bands** (`config.js`): floor 0 · decals 10 · shadows 20 · pickups 30 · actors 40 (+`y/10000` y-sort) · projectiles 60 · **additive projectiles/glows 61** (all `ADD` blend sprites share one band so the blend switch happens once per frame, not per sprite) · fx 70 · wall-tops 80 · HUD scene above.
- **Hit flash:** `setTint(0xffffff).setTintMode(Phaser.TintModes.FILL)` — `setTintFill` is removed in v4 (the build logs an error if called).
- **Glow/light:** additive radial sprites, not the Light2D/normal-map path. **Filters** (`Glow`, `Vignette`, `Bloom` exist in the build): at most **one camera-level external filter** (e.g. low-HP vignette); **zero per-object filters on pooled entities** (each filtered object is an extra render target + draw). Bloom is a Settings toggle, default OFF until profiled on min-spec.
- **Camera:** room-bounded (`setBounds` to room rect). Rooms ≤ 640×360 → camera locked centred. Larger rooms → `startFollow(player, true, lerp)` with an **aim lead** offset toward `Intent.aim` (values from the feel-spec when specced). Screen shake via `camera.shake` scaled by Settings → Screen shake (0–100%) and zeroed by reduced-motion.
- Text: **all in-game text is `BitmapText` from a pixel `bitmap-font`** (TA `font-atlas`). Measured in the skeleton: canvas `Text` at 8 px on the 640×360 canvas renders mushy at zoom 1–2 (glyphs like "1"/"l" merge) — Phaser `Text` rasterises a vector font at internal resolution. The TA must deliver at least one pixel bitmap font with a ≥ 5×7 px glyph cell covering ASCII 32–126 (plus `…`, `×`, `←→↑↓`); the skeleton's `Text` usage is placeholder. Never per-frame `setText` — HUD updates on bus events only.

---

## §10 Animation wiring
**Telegraph rule (state-graph R3, accepted 2026-09-27):** enemy and boss telegraphs are driven by the AI's **windup progress** (`windupElapsedSteps / windupSteps`, owned by the attack state machine in the sim). Each step the view samples that progress (frame index, scale, alpha, circle radius). A telegraph is **never** a fire-and-forget tween or a free-running animation whose duration merely equals `windupMs`. That way a telegraph can't finish ahead of the real release under hit-stop, chill slow (`windup × 1/(1−slow)`), curse `windupMult` or step catch-up, and a cancelled windup (stun or freeze) stops the telegraph on the same step. Tweens are allowed only for cosmetic motion with no gameplay timing (UI, pickups bobbing).

Sprite animations are created once in Boot from the TA's `animation-export` (frame keys per `atlas-key-contract`) and the Animator's `state-graph-spec`. Actors hold a tiny state machine (`idle/run/hurt/cast/die` or per graph) that calls `play(key, true)` only on state change. Hit/cast frames from `hit-frame-data` fire through `animationupdate` listeners registered once per pooled sprite, not per play.

## §11 Performance budgets (mid laptop, 60 fps = 16.67 ms)

| System | Budget (p95 frame, heavy combat: 400 proj + 40 enemies) |
|---|---|
| Arcade actor step (45 bodies + tile + crowd colliders) | ≤ 1.5 ms |
| ProjectileSystem step (move + walls + hash hits + hooks) | ≤ 2.0 ms |
| Enemy AI + spawning | ≤ 1.0 ms |
| Spell evaluation | ≤ 0.3 ms per cast (≤ 64 instructions) |
| Particles | ≤ 1 200 live particles, ≤ 12 emitters |
| Render (CPU submit) | ≤ 5 ms; **≤ 30 draw calls** in combat, ≤ 15 in menus |
| GC | **zero steady-state allocation** in the step loop (pools, preallocated typed arrays, no per-step closures/spreads/`Array.from`) |
| Memory | textures ≤ 64 MB GPU; JS heap growth < 1 MB/min in combat |
| Load | boot ≤ 3 s on a 20 Mbps link (manifest-driven, atlases + audio) |

The skeleton ships a **stress mode** (`?debug`, key **F2** in the debug arena): 400 projectiles + 40 moving Arcade-bodied enemies with enemy-vs-enemy and enemy-vs-wall colliders, every projectile bouncing, piercing and hash-querying every step; perf overlay on **F3**.

**Measured 2026-09-27 (dev machine, Chrome, WebGL, 1× zoom):** 400 projectiles + 40 enemies at a steady **60 fps**; our `worldstep` handler (input + casting + enemy mirror + hash rebuild + 400-projectile step) **0.24–0.31 ms/step** as a live moving average during play; a full warmed Arcade step including that handler **0.12–0.13 ms/step** in a 3 000-step tight loop. Heap delta per step for `ProjectileSystem.step()` and `simStep()` is below `performance.memory` quantisation (≈0 KB/step). That is ~15× headroom under the 4.5 ms sim budget on a fast machine; **min-spec (UHD 620) confirmation, a DevTools allocation profile and a draw-call count are Wave-5 verification items** (the dev machine is not min-spec, and `performance.memory` is too coarse to prove zero allocation).

## §12 Audio plumbing
`core/audio.js` = mixer over Phaser's WebAudioSoundManager (bus volumes: `music` ← musicVolume, `sfx`+`ambience` ← sfxVolume, `ui` ← uiVolume, all × masterVolume), driven entirely by the Audio Director's `cue-spec` JSON (gem-vault pattern): gameplay calls `mixer.fire(cueId)` only; buses (`music/sfx/ui/ambience`), polyphony caps and voice stealing (critical at 400 projectiles: per-cue `max_simultaneous`), ducking rules. Audio unlock happens on the Title screen's first input (autoplay policy), not in Boot.

## §13 Telemetry & localization
`log.js`: ring buffer of the last 500 typed events (`room_enter`, `cast`, `kill`, `reward_pick`, `run_end`, …) exposed as `__SW__.log`; no network (I6). `i18n.js`: every user-facing string via `t(key)` from `src/i18n/en.js`; no literals in scenes.

## §14 Phaser 4 API verification log (grep of `lib/phaser.esm.min.js`, v4.1.0)
- `VERSION:"4.1.0"`; Arcade present (`ArcadePhysics`, `collideSpriteVsGroup`, `useTree`).
- Arcade `World.step`: `this.useTree&&(this.tree.clear(),this.tree.load(Array.from(e)))` then colliders, then `emit(WORLD_STEP)` — `"worldstep"` event; `fixedStep`/`fps` config keys present.
- Scale modes `NONE:0 … FIT:3 … EXPAND:6`; `setZoom(t){this.zoom=t,…,this.refresh()}`.
- `pixelArt` config sets `antialias=false, antialiasGL=false, roundPixels=true`.
- Gamepad: `input.gamepad` config key; `pad1`; `leftStick`/`rightStick` Vector2.
- `setTintFill` → removed (console.error shim); `TintModes: { MULTIPLY:0, FILL:1, ADD:2, SCREEN:4, OVERLAY:5, HARD_LIGHT:6 }`.
- Filters present: `Glow`, `Vignette`, `Bloom`; `renderNodes.addNodeConstructor` present (custom filters, TA seam). The v3 Pipeline API is absent.
- `Graphics.generateTexture` present (skeleton placeholder textures only).

## §15 Running the skeleton (Wave 1)

- Serve: `python3 -m http.server 8741` from the project root (or the studio launch entry `spellwright`), open `http://localhost:8741/` — add `?debug` for stress mode, run-flow hotkeys and tunables read-tracking.
- Title → **Start Run** (Enter / click) → **debug arena**: WASD move · mouse aim · LMB cast (test wand: `dmg, bolt, triple, bounce, bolt, trigger`) · Q / wheel / 1–3 wands · Tab wand editor (Enter pick, arrows move, Enter swap) · Esc pause (Resume / Settings / Abandon).
- `?debug` hotkeys: **F2** stress (400 projectiles + 40 enemies) · **F3** perf overlay (always available) · **K** die · **V** win · **R** reward overlay · **P** shop overlay · **H** hit-stop probe (160 ms freeze; the player pulses on a probe tween so the freeze is visible). Console: `__SW__.log`, `__SW__.tunables.unread()`, `__SW__.tunables.fallbacks()`, `__SW__.effects.list()`, `__SW__.db`, `__SW__.save`.
- Verified 2026-09-27 over http in Chrome: boot → title → run → cast → wand edit (deck reset + HUD update) → pause → settings (stacked) → back → abandon/death → run-end → title → new run → reward → shop, zero uncaught errors; integer zoom ×1 at 1024×768 and ×2 at 1400×820.
