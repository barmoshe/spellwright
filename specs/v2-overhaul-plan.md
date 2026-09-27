# Spellwright v2 — research-driven overhaul + mobile

## Context
Spellwright (`gamestudio/output/games/spellwright/`, live at barmoshe.github.io/spellwright) is a complete Phaser 4 Magicraft-style roguelite, but a research pass against the sibling project `/Users/barmoshe/wandcraft` (read-only reference; its ADR 0002 forbids copying names/text/numbers — we adapt principles only) found the same failure wandcraft fixed: **wand crafting is optional by construction** — enemies are HP-only, starter mana never binds (starter uses 15/25 mana/s), found wands arrive pre-slotted and any order fires, relics are flat stats with no synergy, no reward skip/draft reroll. Runs take ~31 min (long for phones), and there is **no touch support** (Phaser `touch:false`, no `touch-action`, Tsmall text ≈5 CSS px on a phone).

Goal: make building a wand *matter*, tighten runs for mobile sessions, add modes/meta for replayability, and make the game fully playable on phones — then redeploy.

**Locked decisions (user):** runs ~18–20 min (3 floors × start + 6–7 rooms, mini-boss mid-floor, boss at end) · touch = auto-fire at nearest visible enemy + right aim-stick override (setting to disable) · landscape only with rotate overlay · full scope incl. Heat / Gentle / Daily / Goals.

Executed through the gamestudio dispatch loop (lock → role waves → objections → §8 convergence checklist → unlock), all writes inside the project root (I13), verification by craft self-checks (I1).

## Key findings that shape the work (verified in code)
- **Curses 0–3 already exist** (`data/rules.json` "curses", `src/ui/RunSetup.js`, `RunState.js:35`, `EnemySystem.js:191`) → Heat = extend to 5 tiers + rename, migrate `meta.curseLevel`.
- **Goal meta partly exists** (`data/unlocks.json` 9 milestones, `src/run/meta.js` `conditionMet`/`nextGoals`, shown at run end) → extend to ~15 ordered goals.
- **HP is half-hearts** (maxHp 6) → Gentle mode can't be "−2% damage"; designer defines absorb-chance / bonus half-heart per lost run (hook `Player.hurt()` `src/sim/Player.js:165`).
- **Hit-stop + camera lead mostly exist** (`Combat.js:308`, `bosses.js:104`, `lookAheadFrac`) → feel work = crit stop, boss-kill 300 ms, trauma² shake in `src/sim/Fx.js`, faster retry.
- **feel-spec.md / state-graph-spec.md are read at runtime** (`src/core/inputs.js:7-8`) → every new number goes into a tunables block; deploy must keep syncing `specs/`.
- **check-spells Ex1 asserts the starter is sustainable** → mana-scarcity change updates mechanic-spec §11 Ex1 + the check together.
- Reusable: `World.hasLos()` (auto-fire LOS), `applyAimAssist` (`Caster.js:120`, gated `device==='pad'` → widen to touch), `previewCycle` (`src/spells/preview.js`, already returns `manaPerCycle`/`sustainable`), shop reroll 10/20/30 already, WandEditor tap-pick/tap-place already (`WandEditor.js:892-940`), focus-follows-tap tooltips (`src/ui/nav.js`), settings pattern (`save.js` SETTINGS_SPEC + `SettingsScene.js` GROUPS + `en.js`), `src/platform/focus.js` visibility pause, `Rumble.js` (PS5 work) for haptics.
- `InputRouter.js:61-63` maps every pointer to `Mouse${button}` → touch needs a `pointer.wasTouch` branch and device `'touch'`.

## Wave A — Specs (studio roles)
**A1 (parallel): Game Designer + UX Designer**
- *Game Designer* → new `specs/design/design-v2.md` (+ updates to mechanic-spec §9 Defences/keyword glossary/§11 Ex1, systems, progression-and-pacing, content-inventory delta, feel-spec blocks `touch-aim`, `impact` additions, `flow`). Data (sole owner):
  - `spells.json`/`modifiers.json`: `keywords[]` (pierce/blast/shock/…) + `tags[]`.
  - `wands.json`: scarcer starter mana (starter + first boost overspends in room 1); capacity growth 3→5→7.
  - `enemies.json`: `defence` on chosen archetypes — shield (blocked unless pierce, wears after N blocks), armour (blast ×3, direct ×0.35, DoT ×0.2), ward (absorbs N hits, broken by shock); 1–2 new enemies.
  - `bosses.json`: 3 mini-bosses (`tier:"mini"`), build-reading `adapt` rules, intro/phase banner keys; bosses scale by new attacks, not HP.
  - `rooms.json` / `floors.json`: new step graph (start + 6–7 rooms + mini-boss + boss per floor, ~18–20 min budget), door `threat` pools, anchor+pressure wave grammar, puzzle room before boss, optional ambush/dark twists.
  - `relics.json`: cut flat-stat relics; categories conditional/scaling/rule-breaking; **duos** (both parents owned, weight ×3); corrupted (upside+downside via risk door).
  - `economy.json`: skip pays gold, draft reroll, shop sale slot, rarity pity, tag lean (×1.6/tag, cap ×2.5), counter guarantee.
  - `rules.json`: `defences`, wave rules (next wave at 70% killed, spawn portal ~0.9 s, no spawn within 96 px/in aim cone, ≤40 enemy shots), `curses`→`heat.levels[1..5]`.
  - `unlocks.json`: ~15 ordered goals + new conditions (win_heat, daily_complete, duo_formed, evolve_card, break_defence_n).
  - New `data/forge.json` (merge-2 → level-2 card ids, evolutions base+catalyst, +1 slot cost), `data/modes.json` (gentle rule, daily rule/loadout pools, share-line template), `data/affixes.json` (elite affixes: outline key + title + params); register in `data/index.json`.
- *UX Designer* → new `specs/ux/mobile-touch-spec.md` (floating twin sticks: left-half move/right-half aim, only pressed stick drawn, move base follows overshoot; DASH + SWAP ≥37 game px bottom-right in safe area, shown after first touch; auto-fire default + override; haptics per cause; release-over-same-button, 0.18 s open-guard; rotate overlay; Add-to-Home-Screen; "welcome back" pause) + updates: hud-layout touch profile, accessibility (remove Tsmall 5 px → min T1, audit its 32 call sites), wand-editor phone mode (6 px drag threshold, 2× ghost above finger, insert-bar vs swap-ring, before→after DPS, mana-per-cycle "runs dry after N s" bar, Enables chips/counter pips), screen-graph (Forge tab, Mode Select replacing curse row, Goals, Daily result, Reward Skip/Reroll), settings (`touchFire auto|stick`, `touchControls auto|on|off`, `haptics`, `touchStickSide`), ftue (engine-derived ghost-hand coach, first-block tips), controller-prompts `touch` family.

**A2 (parallel, after A1 inventory delta): Animator, Audio Director, 2D Artist**
- Animator: telegraphs (defence block/wear/break, affix outline pulse, mini-boss windups), state graphs (shield/ward states, mini-boss, intro card + phase banner), motion-spec (touch stick, ghost-hand, forge merge/evolve, duo unlock) — all with reduced-motion fallbacks.
- Audio: new cues (shield_block/break, armour_clang, ward_pop, forge_merge/evolve, duo_unlock, miniboss_intro, door_threat, daily_start, reward_skip, touch_ui_tap) with throttling so block spam never masks hurt.
- 2D Artist: defence overlays, affix outlines (never colour-only; paired with title glyph), door threat icons, touch stick/buttons, forge panel, mini-boss sprites and new relic icons from existing CC0 packs via `author-*.py` recipes.
- Objection round resolved before Wave B (expected: no per-sprite shader outlines → pre-baked frames; nothing inside stick zones; throttled block cues).

## Wave B — Technical Artist production
Extend `scripts/author-art.py`, `author-ui-art.py`, `author-prompt-glyphs.py` (touch family) → `build-art-slot-map.py`, `build-assets.py` (atlases + `asset-manifest.json`; add `touch` atlas only if `ui` overflows), `build-audio.py` (new cues, ogg + m4a). Keys stable; LICENSES/credits updated.

## Wave C — Build 1: platform, mobile, feel (developer; starts after A1-UX, parallel to A2/B)
- `index.html`: `user-scalable=no, viewport-fit=cover`, `touch-action:none`, apple-mobile-web-app meta, `#rotate` overlay, `#safe-probe` (env safe-area insets).
- `src/platform/display.js`: size polling/orientationchange/visualViewport, portrait overlay + run hold, `safeInset`, `isPhone`, `EV.DISPLAY_CHANGED`.
- Audio unlock moved to SystemScene global listeners (touchend/click/keydown/visibilitychange → `AudioMixer.unlock()` `src/core/audio.js:422`), `navigator.audioSession.type='ambient'` (guarded).
- Touch: `src/main.js` `touch:true`, `activePointers:3`; new `src/input/TouchSticks.js` (per-pointer-id tracking, iOS-safe ids); `InputRouter` `wasTouch` branch, device `'touch'`, `promptFamily 'touch'`, Intent `aimSource`.
- Auto-fire: new `src/sim/AutoAim.js` (nearest on-screen hittable enemy in range with `World.hasLos`, velocity lead); stick >0.3 overrides with widened `applyAimAssist` for touch.
  - *User decision (overrides the UX objection):* **no crate fallback** — auto-fire targets enemies only; crates are broken with the right aim stick (the second aiming option). FTUE teaches the aim stick on the Sanctum crates for touch players. Retarget stickiness `touchRetargetRatio` stays.
- HUD: `src/scenes/HudScene.js:24-35` constants → `src/ui/hudLayout.js` `layoutFor(profile, safeInset)`, rebuilt on device/display change; draws touch controls.
- Text minimum in `src/ui/kit.js` ROLE (Tsmall → T1 metrics) + call-site fixes per UX audit.
- Menus/editor on touch: `src/ui/nav.js`/`Menu.js` release-over-same + open-guard; `WandEditor.js` phone behaviours using `previewCycle`.
- Haptics: `navigator.vibrate` backend in `src/input/Rumble.js`; phone FX/projectile caps halved at runtime.
- Feel: trauma² shake (`Fx.js`), crit + boss-kill hit-stop (`Combat.js`), retry ≤3 s (RunEndScene).
- Settings rows (additive keys, no schema bump) + i18n.

## Wave D — Build 2: crafting pressure (needs A1 data + B art)
- `src/data/catalog.js` views (forge, modes, affixes, keywordsOf, duosFor); `src/core/db.js` required-field checks.
- Defences in `Combat.hitEnemy` (`Combat.js:57`) with pierce passed from `Shots._applyHit` (`Shots.js:302`); `EV.DEFENCE` → FX/audio/first-block tip; overlays in EnemyView.
- `RoomDirector._planWaves/_spawnWave` (~l.86-140): wave grammar, spawn safety; `Shots.enemyBullet` 40-cap. Door threats via `_nextOptions` (~l.296)/`_openDoors` + `WorldHud` icon; threat guaranteed in room.
- Floors rewrite + mini-boss (`tier` flag on the boss path, smaller bar, no floor end) + puzzle rooms; `bosses.js` mini-boss AI, intro card, phase banner, build-reading attacks. Preserve tutorial path (`tutorialDone` at F1 step 3, `RoomDirector.js:320`).
- Economy: `RewardScene.js` Skip + draft reroll; `economy.js` `rollDraft`/`rollShop` (tag lean, pity, counter guarantee, sale, ban hook).
- Relics: `src/sim/Relics.js` conditional/scaling/rule/corrupted kinds; duo offers; `RunState._recomputeMods` stays single application point.
- Forge tab in `ShopScene.js` (merge-2, evolve, +1 slot); per-run slot overrides in `RunState.setCell/takeWand`; evolution cards excluded from reward pools.
- Twists (ambush/dark/reactive terrain) — cuttable.

## Wave E — Build 3: modes, meta, onboarding, balance
- Save v1→v2 migration in `src/core/save.js` (curseLevel→heat, gentle, daily, goals) + `specs/engine/save-schema.md`; `.bak` recovery kept.
- Heat tiers (RunSetup → Mode Select; each win unlocks next), Gentle rule in `Player.hurt`, Daily run (UTC-date seed → loadout + rule; RunEnd share line + Copy via `navigator.clipboard` with fallback dialog), ~15 ordered goals (`run/meta.js`, new `GoalsView` from Title, RunEnd names next goal).
- Onboarding: `src/ui/Ftue.js` ghost-hand coach derived from `previewCycle` diffs; first-block tips; counter lesson rooms.
- Optional mid-run resume (`spellwright.run` snapshot) — cuttable.
- `scripts/balance-calc.mjs` review aid (never a gate): loads data like check-spells, compares "never-edits" vs "counter-aware edits" builds per floor step (TTK, mana-dry time) against design targets.

## Cut order if a wave overruns
Reactive terrain/dark/ambush/area variants → corrupted relics + ban → mid-run resume → ghost-hand coach (keep tips) → Goals screen UI (keep RunEnd next goal) → evolutions (keep merge-2 + slot) → boss build-reading → haptics. Not cuttable: sticks, auto-fire, HUD reflow, text minimum, rotate overlay, audio unlock, defences + counters, mana scarcity, skip/reroll, run restructure, Heat/Gentle/Daily.

## Risks
Large coupled data migration (mitigate: db.js schema checks + `?harness=floor:N:step:M` jump) · tutorial regression · check-spells drift (engine changes only with a §11 example) · phone perf at ~1.08× fractional zoom (isPhone caps; no real-device test available — recorded gap) · touch-zone collisions (single hudLayout object + `?debug` hit-rect overlay) · text overflow when Tsmall is raised · iOS quirks (touchend audio unlock, huge touch ids, no vibrate, rotation w/o resize) · save v2 must never corrupt v1 players.

## Verification (Wave F)
- `node scripts/check-spells.mjs` all PASS (Ex1 updated); `node scripts/balance-calc.mjs` reviewed by the Designer (tune data if bands miss); `__SW__.tunables.unread()` empty after a session; zero console errors; `__SW__.art.missing()` empty.
- Desktop (preview `spellwright`, port 8741): full KBM run at Heat 0 timed against 18–20 min; each defence type via harness rooms; forge merge/evolve; duo offer; reward skip/reroll; one pad smoke test (PS5 prompts still swap).
- Mobile: `resize_window` mobile preset portrait (rotate overlay + hold) and 812×375 landscape; touch emulated via pointer events `pointerType:'touch'` — sticks, auto-fire + override, DASH/SWAP, editor drag/insert, smallest text zoom-check, safe-area layout.
- Modes: daily share line + copy, Gentle after forced losses, Heat unlock after a debug win, save v1→v2 migration on a planted v1 doc.
- §8 convergence checklist, `HOW-TO-RUN.md` + `README.md` updated (controls incl. touch, modes, simplifications).
- Deploy: rsync runtime set (index.html, src, lib, data, specs, assets runtime dirs, asset-manifest.json, LICENSES.md, HOW-TO-RUN.md) to `/Users/barmoshe/base67/spellwright`, commit (conventional), push, wait for Pages build, smoke-test the live URL on desktop + mobile emulation.

## Addendum — wandcraft WIP lessons (uncommitted, 2026-09-27; read-only reference)
Playtest-driven fixes found in wandcraft's working tree, adopted as principles (own numbers):
1. Camera lead follows **movement velocity** (eased), not aim — auto-aim target flips made the view swing (designer: tunables; dev: RunScene camera).
2. Auto-aim lead uses the **wand's mean bolt speed**, prediction capped (~40 px), never leads teleports/blinks (dev: `src/sim/AutoAim.js`).
3. Shot/aim **origin = wand grip, fallback to body centre when the grip is inside a wall** (dev: Caster/Player origin).
4. Player **hurt zone = short capsule** (waist→head) instead of a circle (designer spec + dev hit test).
5. Tiny mouse aim-assist cone (~0.12 rad) (designer tunable; dev widens applyAimAssist).
6. Bake expensive per-boss visuals lazily, never all at boss entrance (dev perf rule).
Also accepted: developer objection on wand-editor-ux §11.1 (mana line shortened to "Runs dry after N s · 29/s · 18/s").

## Addendum — Worlds (user: "at least 2 worlds", 2026-09-27)
Orchestrator default (recorded assumption): each of the 3 floors becomes a **distinct world** (≥2 required; 3 delivered), keeping the run structure and 18–20 min budget:
- **W1 The Sunken Crypt**, **W2 The Drowned Halls**, **W3 The Last Library** — each with its own tileset + props (not just a recolour), a native enemy roster (≥3 world-native enemies, built on existing AI archetypes so no new behaviour code is required unless the designer specs it), its own world twist, music bed + ambience, mini-boss + boss (already per floor), and a world-entry title card.
- Data changes are **additive** (`floors.json` world block: `world{id,name,tileset,music,ambience,twist,natives[]}`) so Wave D's director work stays valid.
- Owners: Game Designer (world identity, rosters, twists), 2D Artist (world visual identity, tilesets/props/native enemy art from admitted or newly sourced CC0 packs), Audio Director (per-world beds/ambience from existing packs), Technical Artist (sourcing if needed + build), Developer (world card, per-world tileset/music/ambience wiring) after Wave D integration.
If CC0 art can't support a third fully distinct biome, W1/W2 must be fully distinct at minimum and W3 documented.
