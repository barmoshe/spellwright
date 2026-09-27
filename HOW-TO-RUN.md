# Spellwright — how to run

## Serve (runtime origin: **http**, never `file://`)

```bash
cd gamestudio/output/games/spellwright
python3 -m http.server 8741
# open http://localhost:8741/          (add ?debug for dev keys + the perf overlay)
```

No build step, no dependencies: plain ES modules and Phaser 4.1.0 vendored at `lib/phaser.esm.min.js`. The Browser-preview launch config is named `spellwright`. Use Chrome, Edge, Firefox or Safari (Safari loads the `.m4a` audio variants).

## Controls

| Action | Keyboard + mouse | Xbox / generic pad | PlayStation (DualSense / DualShock 4) |
|---|---|---|---|
| Move | WASD / arrows | left stick | left stick |
| Aim | mouse | right stick (aim assist on the pad only; Settings → Aim assist) | right stick |
| Cast (hold) | LMB (Settings → Cast mode: Toggle available) | RT | R2 (pressed at 20 % travel, released below 10 %) |
| Dash (i-frames) | Space or RMB | A or LB | Cross or L1 |
| Interact (pedestal, shop, pickup) | E | X | Square |
| Switch wand | 1–3, Q, mouse wheel | RB / Y | R1 / Triangle |
| Wand editor | Tab / I | View | Create or touchpad click |
| Pause | Esc | Menu | Options |
| Menus | arrows / WASD, Enter, Esc · Q/E switch tabs | D-pad or left stick, A, B · LB/RB | D-pad or left stick, Cross, Circle (or touchpad click to go back) · L1/R1 |
| Wand editor extras | RMB quick move · 1-3 wand · R revert | X quick move · Y salvage · LT/RT wand | Square quick move · Triangle salvage · L2/R2 wand |
| Fullscreen | Title → Fullscreen, Settings, or F11 | — | — |

**Controller prompts** follow the device you last touched and swap live: keyboard keys while you type, Xbox or PlayStation glyphs while you use a pad (auto-detected from the pad id; Settings → Gameplay → **Button prompts**: Auto · Xbox · PlayStation). **Vibration** (Settings → Comfort, Off · Low · High, default Low) rumbles on hurt, death, boss phase, big blasts, room clear and dash, never in menus; it needs a browser that exposes `vibrationActuator` (Chrome/Edge today; Safari/Firefox silently skip it). Only one pad (the first connected) is read.

**Out of scope (would need WebHID, not the Gamepad API):** DualSense adaptive triggers, light bar colour, advanced/HD haptics, the mute button and the touchpad surface (only the touchpad *click* is used). The PS button is never bound.

### Phones and tablets (touch, landscape)

| Action | Touch |
|---|---|
| Move | drag anywhere on the **left half** (a floating stick appears under your thumb; it follows past its rim) |
| Aim + cast | **auto-fire** (default): the wand fires at the nearest visible enemy on its own (corner ticks mark the target). Drag the **right half** past 30 % to aim yourself; that is also how you break **crates** (auto-fire never targets crates). Settings → Touch → Touch firing: *Right stick* = classic twin-stick |
| Dash / Switch wand / Interact | **DASH** / **SWAP** / **USE** buttons, bottom-right (appear after your first touch; SWAP with ≥ 2 wands, USE near a pedestal/shop) — Settings → Touch → Stick side: *Swapped* mirrors them |
| Wand editor / Pause | **EDIT** / **II** top-right (fire on release over the same button) |
| Menus | tap = focus + activate (reward/shop/codex items: first tap inspects); every modal has a **‹ Back** button top-left; a 180 ms guard ignores the tap that opened a screen |
| Wand editor | tap a card to select, tap a destination to move it, or drag (> 6 px); dropping on a filled slot **inserts** while the wand has room, else swaps (all devices); pane C has To bag / Salvage / Revert |

The whole viewport (including the black side bars) is the stick area. Portrait shows a "turn your phone sideways" overlay and holds the run in Pause; returning shows a **Welcome back** header, never auto-resumes. Audio unlocks on the first tap anywhere. Haptics (`navigator.vibrate`, Android Chrome; iPhone has none) are in Settings → Comfort → Haptics (phone). Touch-only settings rows appear on touch-capable devices or after a touch. Phones halve particle counts and the player-projectile cap (enemy bullets/telegraphs are never capped). `?debug` + **F4** draws every touch/HUD layout rect (F4 also toggles god mode in a run).

Walk through an open door to choose the next room (the door shows room kind + reward).

## What a run is (v2)

**3 worlds × 9 steps (~18–20 min):** start → combat → combat/choice → choice → **mini-boss** → choice (+ at most one **risk door** per run) → **shop + forge** → **puzzle room** → boss. Your first run keeps the scripted teaching rooms (Sanctum → First Blood → The Gauntlet).

| World (floor) | Look / sound | Asks for | Signature twist | Natives | Mini-boss → Boss |
|---|---|---|---|---|---|
| **W1 The Sunken Crypt** | candlelit ossuary, `music.w1` / `amb.w1` | shields → **PIERCE** | **Candlelight**: darker rooms, candle light pools; enemies outlined, telegraphs always full-bright | skeleton, bat, bone archer, tomb sentinel | Grave Warden → Ossuary Knight |
| **W2 The Drowned Halls** | flooded cloisters | wards → **SHOCK** | **Flooded**: water slows walkers (you too) ×0.8; a shock hit on an enemy in water arcs to other in-water enemies (≤ 40 px, ×0.5); water stops new burns | drowned thrall, mire leech, lantern acolyte, wraith, frost mage | Lantern Matron → Mire Queen |
| **W3 The Last Library** | endless shelves | armour → **BLAST** | **Bookshelves**: cover with 12 HP; fire sets a shelf burning 2.5 s (burns nearby *enemies* only) then it collapses; blast destroys it; never hurts you | animated armour, bound tome, ink imp, stone golem | Iron Colossus → Archlich (victory) |

A world card (name, one line, its question) shows for ~2.2 s at each world's start; the music bed + ambience swap per world (one world's audio loaded at a time). Rooms can also roll **Ambush** (wave 1 spawns around you) or **Dark** (W3).

**Crafting pressure (Wave D):**
- **Defences** answered by **keywords** your wand actually produces: **shield** (front 150°; pierce shatters it, flanking gets past, wears after 7 blocks), **armour** (blast ×2.5, direct ×0.4, DoT ×0.25), **ward** (swallows whole hits; shock strips it). Blocked hits show BLOCKED / ARMOURED / WARDED; the first block of each type shows a tip.
- **Elites** carry an affix (armoured / warded / shielded / hasted / volatile): outline + glyph + title.
- **Doors** show room kind, reward and a **threat icon** ("Shielded foes: bring PIERCE"); the room guarantees that threat. The HUD's **counter pips** show which defences are in the room (filled = your wand counters it).
- **Mini-bosses** (step 4) and **bosses** read your build (one announced "adapt" rule; minis get a mercy rule); intro card, phase banner, smaller mini-boss bar.
- **Puzzle rooms** (step 7) test the world's keyword with fixed waves (two answers each).
- **Rewards:** **Reroll** (8 coins, +8, max 2) and **Skip** (pays 6 + 4×floor). Drafts use rarity pity, tag lean, a counter guarantee (a card with the keyword the next test asks for), duo relics (both parents owned, ×3 weight), and the risk door's 2 **corrupted** relics.
- **Shop:** a sale slot (×0.6), **Ban** (1 per shop), and the **Forge** tab: merge 2 copies → level-2 card, evolve a level-2 card + catalyst relic → evolved card (relic kept), **+1 slot** (45 coins, +25 each, max 3 per run).
- **Wand editor:** insert-or-swap, "Runs dry after N s · use/s · regen/s" bar, **Enables** chips (PIERCE / BLAST / SHOCK) and per-wand counter pips.

**Modes (Wave E; Title → Run Setup → Mode Select):**
- **Heat 1–5** (`data/rules.json` `heat.levels`, cumulative; winning at N unlocks N+1). Every field is read by code: `enemyHpMult` / `windupMult` / `playerMaxHpAdd` (via `run.curse`), `extraBudgetPerWave` + `healRewardAdd` (heal-door heart and mini/boss `rewards.heal`, never below 1 half-heart) in `RoomDirector`, `eliteAffixes` (distinct affixes per elite, at most one defence-granting) in `EnemySystem`, `enemyProjSpeedMult` (× the floor's value in `RunScene._setFloor`), `shopPriceMult` (`RunState` economy), `bossHeatAttack` (the boss's `heatAttack` joins its last phase's pattern; minis already carry theirs) and `bossAdaptAlways` (mini mercy rules off) in `bosses.js`.
- **Daily** (`data/modes.json`): the rule's `run_rule` keys are read by the sim (`elite_rooms_extra_elite` → +1 elite per elite room, `enemy_speed_mult` → every enemy's move speed, `wand_capacity_add`, `all_wands_shuffle`); `player_stat` / `shot_stat` / `economy` effects join the relic modifier loop. A Daily run plays `daily_start` **instead of** `run_start` (one start cue, fired on `RUN_START`).
- **HUD mode badge** (hud-layout §9.2): "Heat N" / "Gentle +N<half-heart> P%" / "Daily", right-aligned left of the floor track (desktop x 258, touch x 334), a C2 element in the `tc` cluster (fades to 40% with the track, hidden while a boss bar shows). Heat 0 standard shows nothing. The fonts have no ♥ glyph, so Gentle's heart is the HUD half-heart icon (the bonus is counted in half-hearts).
- Console (with `?debug`, after the Title is up): `const m = await import('/src/run/meta.js'); m.armRun({ mode: 'standard', heat: 5 })` (or `{ mode: 'daily', daily: { date, seed, loadoutId, ruleId } }` / `{ mode: 'gentle', gentle: { bonusHalfHearts, absorbChance } }`), then Start Run or a room harness. Modes other than standard need `__SW__.save.setFlag('tutorialDone')` (the tutorial run is always standard).

Meta progress persists in `localStorage` (`spellwright.save`). Forge, duo and corrupted relics are goal unlocks (the `?debug` build opens them).

## Debug (`?debug` in the URL)

| Key | Effect |
|---|---|
| F3 | perf overlay (fps, sim ms/step, live projectiles/enemies, input device, overlay stack) |
| F4 | god mode (toggle) |
| F6 | kill every enemy in the room (awards kills/coins) |
| F7 | jump to this floor's **boss room** |
| F8 | descend to the **next floor** (landing) |
| J | jump to the next step of the floor |
| F9 | +200 coins, a random relic, and six test cards (double_cast, trigger_hit, fireball, chain_lightning, ice_shard, damage_up) |
| K | die (run end: death) |
| F10 | victory (run end: victory) |

To reach the final boss: F8, F8, F7. `?nofocuspause` (automation only) disables the focus-loss auto-pause. Console hooks: `__SW__.log.last('cast', 5)`, `__SW__.tunables.unread()` (read-tracking with `?debug`), `__SW__.tunables.fallbacks()`, `__SW__.effects.list()`, `__SW__.art.missing()`, `__SW__.save`, `__SW__.db`.

Enemy arena (`?debug&enemyharness=1`, the real run in the floor's start room) adds Shift-hotkeys:
Shift+1..0,-,= spawn bat, skeleton, cultist, frost_mage, brute, slime, fire_imp, eye_turret, wraith, necromancer, stone_golem, skull · Shift+Q elite of the last id · Shift+C / X / Z chill / shock / freeze the nearest enemy · Shift+V 30 damage to the nearest · Shift+G god mode · Shift+K kill all · Shift+B boss room · Shift+N next floor · Shift+R ×0.9 curse windups · Shift+T toggle reduced motion.

**Room / world harness (Wave D + Worlds):** `?debug&harness=floor:N:step:M` jumps straight into floor N, step M (0 start … 4 mini-boss … 6 shop … 7 puzzle … 8 boss). Optional params: `&twist=ambush|dark|candlelight|flooded|bookshelves`, `&tpl=<roomId>` (e.g. `hall_pillars` for bookshelves). Console: `__SW__.room.jump(floor, step, {room, threat, twist, risk, tpl})`, `.doors({threat, risk})` (forces the next door roll), `.clear()`, `.state()` (room, waves, threat, twist, upcomingKeyword, world), `.world()`, `.wade()`, `.zap(dmg)`, `.ignite()`, `.chip(dmg)`, `.blast()`.

Dev harnesses: `?harness=<screen>` (modal screens with a synthetic run: `editor`, `editor-held`, `reward`, `reward-relic`, `wand-offer`, `shop`, `pause-map`, `codex`, `settings`, `runend`, `unlocks`, `setup`, `title`), `?hudharness=1` (HUD + world HUD), `?enemyharness=1` (enemy AI arena).

## Craft self-verification (I1: review aids, not a test suite)

- Wave E mode wiring check (2026-09-27, headless Chrome over http + the Browser pane, `?debug&nofocuspause`, god mode): Heat 4 F2 boss (Mire Queen's last phase ends with `bog_surge`, enemy shots ×1.06×1.1), Heat 5 / Heat 2 elite rooms (2 affixes per elite), Heat 3 heal reward 2 → 1, Daily Double Elites (2 elites), Daily Haste (enemy speed ×1.15) and Chaos, Gentle badge, F3 bookshelf burn (aura tick from `floors.json`). Each run fired exactly one start cue (`daily_start` on Daily); badges "Heat N" / "Daily" / "Gentle +2 10%"; `tunables.fallbacks()` = `{}`; touch `validateLayout` clean (both stick sides); zero console errors.
- `node scripts/check-spells.mjs` runs the pure spell engine against mechanic-spec §11 (every worked example, the twin_fork trap and shuffle determinism) and prints PASS/FAIL per line.

- Wave 4 integrated check (headless Chrome over http, `?debug&nofocuspause`). Path: title → Start Run → the FTUE rooms (tut_first_blood, then tut_gauntlet) → modifier slotted in the editor (the `slotModifier` flag set) → room clears → door choices → reward pedestals → shop purchase (23 → 3 coins) → the F1 floor boss. Then F7 jumps to each boss: Ossuary Knight, Mire Queen, then the Archlich through phases 1 and 2 → victory → run-end. A second run was ended by death. Result: `__SW__.tunables.unread()` = `[]` (all 105 read), `fallbacks()` = `{}`, `art.missing()` = `[]`, and zero console errors with the server up.

## Documented simplifications and deviations

(Recorded per studio §8 item 3.)

- **Audio D6/D7 low-pass**: the music low-pass part of the overlay and low-HP ducks is dropped. The gain moves are kept, per the cue-spec fallback clause (`mixer.ducks.fallback`).
- **Audio loading**: by `load_group` (boot + title at boot; run at run start; floor3 / boss_a / boss_final on entry). Groups left behind are unloaded. This accepts the Audio Director's objection against loading every cue at boot.
- **Time units**: the sim keeps designer `…Ms` durations in ms and advances them by 1000/60 per fixed step. That is equivalent to the `round(ms·60/1000)` step conversion to within one step.
- **Fixed-step sim at 60 Hz without render interpolation** (architecture §4). On 120/144 Hz panels sprites move on 60 Hz steps.
- **Touch input is deferred** (README).
- **Fonts**: the TA bitmap fonts don't have glyphs for ± ° ≈ or em/en dashes. UI copy uses ASCII instead: `+/-`, ` deg`, `~`, `-`.
- **Wand editor §5.5 Ex2**: the drop order follows wand-editor-ux §3.4, the authoritative placement rule. The changed-slot "badge pop" micro-motion isn't built; changed slots use the static highlight.
- **Status HUD**: chill pips and the vulnerable glyph are drawn from the ui-atlas frames only. There's no extra per-status motion.
- **Editor-scoped keys**: `src/ui/extraKeys.js` is the contract for screen-specific modal intents (quick-move, salvage, wand select, scroll, Reward/Shop → editor). `InputRouter.consumeUI()` carries only the 8 generic menu intents. Neither set is rebindable.
- **Start-room crate barrier**: the sanctum door sits on the boundary between two crate tiles, so the player has to break the crate on either side to walk straight through. That's intended; it's the "break things" beat. There's no corner-nudge on the player body.
- **Automation flag** `?nofocuspause` skips the focus-loss auto-pause. Debug/verification only.
- **Pad trigger thresholds**: the runtime reads feel-spec `padTriggerPress` 0.20 and `padTriggerRelease` 0.10 (hysteresis; controller-prompts §2.2 now cites the same ratified values).
- **Gamepad boundary**: Phaser's gamepad plugin is off (`main.js`); `src/platform/gamepad.js` is the only Gamepad-API reader. It passes `mapping: 'standard'` pads through verbatim (incl. index 17, the DualSense touchpad click on Chrome/Edge) and remaps a non-standard Sony pad (raw HID order, analog triggers on axes, hat-switch d-pad) to standard indices; other non-standard pads are read verbatim.
- **Rumble triggers**: "player hurt" = any `player:hp` decrease (a shield break costs no HP and doesn't rumble); "big explosion" = any on-screen explosion ring (every explosion requests a shake ≥ `explosionShakePx`). Room fades block rumble via RunScene's `transitioning` flag.
- **Pad glyph fallback**: if a `prompt.*` frame is missing from the `ui` atlas, glyphs are drawn procedurally (position diamond + letter / 5×5 PS symbol, pills for shoulders and system buttons).
- **Fullscreen from a pad**: browsers don't count gamepad presses as a user gesture, so Title → Fullscreen pressed with a pad does nothing (no error); use the mouse, Enter, or F11.
- **v2 Wave C (mobile/feel) simplifications**: (1) the touch rows live in a **Touch** settings group (not a sub-heading above the Controls table, which has no scroller yet); the Controls table has no read-only Touch column. (2) A HUD profile / safe-area / stick-side change **restarts the HUD scene** (state is re-read from the run; running toasts/banners are dropped) instead of re-positioning objects in place. (3) Touch glyphs and thumb-button icons are procedural until the TA's touch set lands (`prompt.touch.*` frames bind automatically). (4) No A2HS card / web manifest / app icons yet (need the 2D Artist's icons). (5) P2t's dashed ring on the target crate is not drawn. (6) The 4 v2 data keys without Wave-D code (`relic:rule`, `attack:ward_allies|guard|mirror`) are no-op stubs in `src/sim/v2Stubs.js`. (7) Screen shake is the v2 trauma² model (`Fx.addTrauma`); the eight retired `*ShakePx/Ms` rows in feel-spec are no longer read. (8) Death → run end ≈ 1.1 s (`deathToRunEndMs`, slow-mo `deathTimeScale` for `deathSlowMoMs`); "New run" focus first, input guard `runEndInputGuardMs`; when Run Setup is eligible "New run" still routes through Title → Setup.
- **v2 Wave D / Worlds deviations**: `ward_allies` skips allies that already have a defence; adapt rules are read when the intro starts; chain / zap / zone hits have no source point, so a shield judges them from the player's position; the armour overlay is drawn procedurally; the dark-twist enemy outline draws at depth 61.75 (above the darkness, below enemy bullets). World candlelight reuses the dark-room renderer at a milder alpha.
- Console hooks for pad work: `__SW__.input.promptFamily`, `__SW__.input.padReader`, `__SW__.rumble.log`.
