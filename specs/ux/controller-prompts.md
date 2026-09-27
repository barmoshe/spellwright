# Spellwright — `controller-prompts` (prompt families, PlayStation layout, vibration)

**Owner:** UX Designer · **Status:** Wave 3 (optional DualSense support), v1 · **Artifact kind:** ad-hoc `prompt-glyph-spec`. It extends `hud-layout` §3.5, `settings-spec` §1/§2, `accessibility-spec` §5 and `ftue-flow` §2 rules 10–11. Flagged for adoption in `contracts/artifacts.md` if a second game reuses it.
**Consumers:** Game Developer (`InputRouter`, `HudKit.glyph/glyphLabels`, `kit.actionGlyph`, `SettingsScene`, `save.js`, `bindings.js`), Technical Artist (glyph atlas, §4), 2D Artist (glyph style parity), Game Designer (trigger threshold tunables, §2.2), Audio Director (nothing new; rumble never replaces a cue).

**DOG this spec answers to:** (1) Every on-screen string that names an input resolves through **one** table keyed by `(family, W3C standard button index)`. After this lands, `grep` of `src/i18n/en.js` finds **zero** literal pad legends (A, B, X, Y, LB, RB, LT, RT, View, Menu, Start, Back). (2) Every visible glyph re-renders on the **same frame** that the prompt family changes. (3) PlayStation Cross is **never** shown as the letter "X", because the Xbox "X" sits in a different position (left, where PlayStation has Square). (4) All glyphs fit the existing **12 px** glyph slot, so no layout moves.

---

## §1 Prompt families and which one shows

| Family | Shown when | Rendering |
|---|---|---|
| `kbm` | the last input came from the keyboard or mouse | procedural keycaps from the **current** bindings (unchanged; keys are rebindable, so they can't come from an atlas) |
| `xbox` | the last input came from a pad and the pad is not classified as PlayStation, **or** the setting forces `xbox` | the atlas glyph if packed, else the existing procedural **position diamond with a letter** |
| `ps` | the last input came from a pad classified as PlayStation, **or** the setting forces `playstation` | the atlas glyph if packed, else the **position diamond with a 5×5 symbol** (§5) |

**Resolution (one function, `router.promptFamily`):**
1. If `router.device === 'kbm'`, the family is `kbm`. The `promptStyle` setting never overrides the keyboard: a player who types sees keys.
2. Otherwise, if `settings.promptStyle` is `xbox` or `playstation`, use that family.
3. Otherwise (`auto`), classify `pad.id` (Phaser: `pad.id`; the pad is the one that produced the last input, which is `pad1` in v1):
   - If `/xbox|xinput|045e/i` matches, the family is `xbox`. Check this **first**, because Xbox pads report "Xbox Wireless Controller".
   - Otherwise, if `/054c|dualsense|dualshock|playstation|sony|wireless controller/i` matches, the family is `ps`. Vendor `054c` is Sony. Chrome reports `"DualSense Wireless Controller (STANDARD GAMEPAD Vendor: 054c Product: 0ce6)"`, Firefox reports `"054c-0ce6-…"`, Safari reports the bare name, and the DualShock 4 reports as "Wireless Controller".
   - Anything else (Switch Pro, 8BitDo, generic pads) uses `xbox`. The position diamonds already make these readable by position.
4. **Emit on change.** Whenever the family changes, emit `EV.INPUT_DEVICE` with payload `(device, family)`. The family changes on a device switch, a pad reconnect with a different id, or a `promptStyle` change. Existing listeners (`WorldHud`, `Ftue`, `HudScene`, `Toasts`) then rebuild with no new wiring.
5. **Scenes that poll** (`PauseScene`, `ShopScene`, `SettingsScene`, `WandEditor` footer) must compare `router.promptFamily`, not `device === 'pad'`. The boolean misses a pad-to-pad family change and a settings change.

---

## §2 PlayStation default layout (DualSense)

### 2.1 Gameplay bindings (the same indices serve both pad families)

| Action | Std index | Xbox glyph | **PS glyph** | Verdict for DualSense |
|---|---|---|---|---|
| Move / Aim | sticks | L / R stick | L / R stick | unchanged |
| Cast (hold) | 7 | RT | **R2** | keep, with the analog threshold from §2.2 |
| Dash | 0, 4 | A / LB | **✕ / L1** | keep both. L1 is the ergonomic dash because it doesn't lift the aim thumb. ✕ is the one every new player knows. Prompt order stays ✕ / L1 so FTUE P4 reads the same in both families. |
| Interact | 2 | X | **□** | keep |
| Next wand | 5 | RB | **R1** | keep |
| Previous wand | 3 | Y | **△** | keep |
| Wand editor | 8, **17** | View | **Create** (prompt) · Touchpad (alias) | **add index 17 (touchpad click)**. The prompt shows **Create**, because index 8 is in the W3C Standard mapping on every browser. Touchpad click is index 17 in Chrome/Edge only. |
| Pause | 9 | Menu | **Options** | keep (locked) |
| (unbound) | 6, 10, 11, 16 | LT, LS, RS, Guide | L2, L3, R3, PS | leave L2/L3/R3 free in gameplay. **Never bind 16 (PS button)**, because the OS or browser may capture it. |

**Menus (PAD_UI):** confirm = **✕** (0), back = **○** (1, plus 8 / 9 as today). Add **17** to `back`, so the touchpad click that opens the wand editor also closes it (the same toggle symmetry Create already has). Tab prev/next = L1 / R1. Editor wand switch = L2 / R2. Quick move = □. Salvage = △.

**Out of scope, on purpose:** (a) the Japanese-convention swap (○ confirm, ✕ back). Western PlayStation convention is the default for a web release, and a swap toggle would double every menu hint string. (b) the Nintendo-style A/B swap. (c) pad remapping, which stays deferred per `settings-spec` §2. (d) adaptive triggers and the lightbar, which have no web API. (e) multiple pads, which stay `pad1` only. (f) pads with `mapping !== 'standard'`: the family still resolves by id, but indices may differ. This is a pre-existing input limit and is not changed here.

### 2.2 Analog trigger threshold (applies to every pad; flagged to the Game Designer as feel tunables)

`_padBtn` treats every button as pressed at `value > 0.5`. The R2 on a DualSense has long travel, and Hold is the default cast mode. Holding past half travel for a whole room causes finger fatigue, which is a motor-accessibility cost (`accessibility-spec` §5).

| Tunable (`feel-tunables`, `specs/design/feel-spec.md` cast block) | Value | Rule |
|---|---|---|
| `padTriggerPress` | **0.20** | indices 6 and 7 count as pressed at ≥ 0.20 |
| `padTriggerRelease` | **0.10** | they count as released only below 0.10 (hysteresis, so a resting finger doesn't flicker the cast on and off) |

Digital buttons keep `> 0.5`. Toggle cast mode (the existing setting) remains the no-hold alternative. The Game Designer owns the numbers and ratified **0.20 / 0.10** in the feel-spec (below this spec's original 0.30 / 0.15 proposal: DualSense trigger travel adds actuation delay against the 2-frame pad cast budget; anchor XInput's 30/255 ≈ 0.12). The Developer **reads** them from tunables (`InputRouter.applyTunables`), never hard-codes them; an inverted pair is clamped to release = press − 0.05.

---

## §3 Glyph table (the one source of truth)

This replaces `HudKit.PAD_BTN` ('View' / 'Menu'), `kit.actionGlyph.PAD` ('Back' / 'Start') and `SettingsScene.PAD_NAMES`. Those three disagree today; delete all three.

| Std idx | Xbox atlas id | Xbox text | **PS atlas id** | **PS text (fallback, §5)** | Pack |
|---|---|---|---|---|---|
| 0 | `xbox_a` | A | `ps_cross` | Cross | required |
| 1 | `xbox_b` | B | `ps_circle` | Circle | required |
| 2 | `xbox_x` | X | `ps_square` | Square | required |
| 3 | `xbox_y` | Y | `ps_triangle` | Triangle | required |
| 4 | `xbox_lb` | LB | `ps_l1` | L1 | required |
| 5 | `xbox_rb` | RB | `ps_r1` | R1 | required |
| 6 | `xbox_lt` | LT | `ps_l2` | L2 | required |
| 7 | `xbox_rt` | RT | `ps_r2` | R2 | required |
| 8 | `xbox_view` | View | `ps_create` | Create | required |
| 9 | `xbox_menu` | Menu | `ps_options` | Options | required |
| 10 / 11 | `xbox_ls` / `xbox_rs` | LS / RS | `ps_l3` / `ps_r3` | L3 / R3 | reserved (unbound; don't pack in v1) |
| 12–15 | `pad_dpad` · `pad_dpad_ud` · `pad_dpad_lr` (shared) | D-pad | same | D-pad | required |
| 17 | — | — | `ps_touchpad` | Touchpad | required |
| sticks | `pad_stick_l` · `pad_stick_r` (shared) | L / R | same | L / R | required |

**Prompt tokens map to indices, never to letters.** The token resolver looks up `bindings.pad[action]`, gets the indices, and turns each one into a glyph for the current family. UI-channel tokens join the existing gameplay tokens: `[confirm] [back] [tabPrev] [tabNext] [dpad] [quickMove] [salvage] [editorWandPrev] [editorWandNext]`. They map to 0, 1, 4, 5, 12–15, 2, 3, 6, 7.

**i18n rewrite (the Developer does this).** These literal strings become tokenized strings:

| Key | New string |
|---|---|
| `title.hintPad` | `[dpad] move · [confirm] select · [back] back` |
| `settings.hintPad` | `[back] back · [dpad] change · [confirm] select` |
| `credits.hintPad` | `[dpad] scroll · [tabPrev]/[tabNext] page · [back] back` |
| `editor.hintPad` | `[confirm] pick/place · [quickMove] quick move · [salvage] salvage · [editorWandPrev]/[editorWandNext] wand · [back] close` |
| `editor.hintPadHeld` | `[confirm] place · [salvage] salvage · [editorWandPrev]/[editorWandNext] wand · [back] cancel` |
| `editor.hintToBagPad` | `[back]: put it in your bag` |
| `shop.editHintPad` | `[inventory]: edit wands` |

The KB variants stay as they are. Once the pad variants are tokenized, the `*Pad`/`*Kb` pairs *can* collapse later. That isn't required now.

---

## §4 Where glyphs appear (all swap live, with no restart)

**Size contract:** the glyph box is **12 px tall** at 1× on the 640×360 canvas. Widths: face buttons, the D-pad and sticks are **12×12**. Shoulders and triggers are **≤ 16×12**. Create, Options and Touchpad are **≤ 16×12**. `promptRow` keeps its 13 px line and 3 px gap, and nothing re-lays out. **Atlas art is used only if it is drawn natively at ≤ 12 px tall.** A 16 px Kenney tile must be **hand-reduced or redrawn at 12 px by the TA, never scaled**: 16→12 is a 0.75× scale and smears pixel art. Any id that isn't delivered at that size falls back to §5 procedurally, so the build never blocks on art. Glyphs are **monochrome**: a light symbol `#fdf7ed` on a `#4b5468` body with a `#222222` 1 px outline. That is ≈ 7.1:1 symbol-to-body contrast, which clears AA. **Don't use PlayStation's green / red / pink / blue symbol colours.** The shape carries the meaning (`accessibility-spec` §3).

| # | Site (code) | What swaps | Today |
|---|---|---|---|
| G1 | In-world interact / shop / hint prompts (`WorldHud` 299–338) | `[interact]` and others | tokenized ✔ (becomes family-aware) |
| G2 | FTUE verb prompts P1–P10 (`WorldHud` 421, `Ftue.verbText`) | `[cast] [dash] [wandNext] [inventory] [aim] [move]` | tokenized ✔ |
| G3 | Toasts (`Toasts.refreshGlyphs`) | `[inventory]` and others | tokenized ✔ |
| G4 | HUD H8 wand-badge keys (`HudScene` ~500) | "◂Y" / "RB▸" become "◂△" / "R1▸" at the existing **8 px** micro size: shoulders as T-small text, face symbols as the 5×5 procedural symbol (§5). No atlas art. | literal ✘ |
| G5 | Pause tab-bar keycaps (`PauseScene` 58, 270) | LB/RB become L1/R1 (`[tabPrev]`/`[tabNext]`) | literal ✘ |
| G6 | Wand editor footer (`WandEditor` ~579) | §3 strings | literal ✘ |
| G7 | Shop footer (`ShopScene` 144, 253) | `shop.editHintPad` | literal ✘ |
| G8 | Settings footer and the Controls table's pad column (`SettingsScene` 311, 442, 474) | footer tokens; pad column = the §3 **text** column for the current pad family (when the family is `kbm`, it shows the last pad family seen, or `xbox` if none) | literal ✘ |
| G9 | Title footer (`TitleScene` 72) | `title.hintPad` | built once ✘ (must rebuild on `INPUT_DEVICE`) |
| G10 | Credits footer (`CreditsScene` 58) | `credits.hintPad` | built once ✘ |
| G11 | Reward, RunEnd, Codex, Dialog/Confirm, RunSetup footers (`richLine` / `draw.js`) | any confirm/back hint | Developer audits them; any pad legend goes through the resolver |

---

## §5 Fallback when atlas art is missing (exact)

**Glyph contexts (a Graphics object is available).** Draw the existing 12×12 **position diamond** (four 4×4 dots, pressed position filled). For `ps`, the legend to its right is a **5×5 pixel symbol**, not a letter (`#` = `#fdf7ed`, `.` = transparent):

```
Cross      Circle     Square     Triangle
#...#      .###.      #####      ..#..
.#.#.      #...#      #...#      .#.#.
..#..      #...#      #...#      .#.#.
.#.#.      #...#      #...#      #...#
#...#      .###.      #####      #####
```

Shoulders, triggers and system buttons use the existing **pill** with a T-small legend: `L1 R1 L2 R2 Create Options Touch`. "Touch" keeps the pill ≤ 30 px wide. The Xbox fallback is today's glyph, unchanged.

**Text-only contexts** (the Settings table, the description bar, any `txt()` without glyphs) use the **PS text** column of §3: "Cross", "Circle", "Square", "Triangle", "L1" … "Touchpad". **Never write "X" or "O"** for Cross or Circle: "X" means the *left* button to an Xbox player, and "O" reads as zero or the letter O.

---

## §6 Vibration (optional; any pad that exposes a haptic actuator)

**API:** `gamepad.vibrationActuator.playEffect('dual-rumble', { startDelay: 0, duration, strongMagnitude, weakMagnitude })`, called through Phaser's `pad.vibration` when it is present. If the actuator is missing (Safari and Firefox today), the call is a silent no-op. This works for any pad, not only a DualSense.

| Event (source) | Priority | **High** strong / weak / ms | **Low** | Rate limit |
|---|---|---|---|---|
| Player death | 6 | 0.80 / 0.50 / 400 | ×0.5 magnitudes, same ms | — |
| Boss phase change (`boss:phase`) | 5 | 0.70 / 0.70 / 300 | ×0.5 | — |
| Player hurt (`player:hp` decrease) | 4 | 0.60 / 0.40 / 140 | ×0.5 | inherits i-frames |
| Big explosion (any explosion whose shake request ≥ `explosionShakePx`, player-caused or hostile, on-screen) | 3 | 0.35 / 0.25 / 90 | ×0.5 | 1 per 150 ms |
| Room clear (`room:cleared`) | 2 | 0.00 / 0.30 / 120 | ×0.5 | — |
| Dash | 1 | 0.00 / 0.25 / 60 | ×0.5 | dash cooldown |

**Rules**
1. **One effect at a time.** A new effect of **≥** priority replaces the running one. A lower-priority effect arriving mid-effect is dropped, not queued (a late rumble reads as a phantom hit).
2. **Never in menus.** Call `vibrationActuator.reset()` and suppress all effects while any modal is open (pause, editor, shop, reward, settings, confirm), during room fades, and on blur or visibility loss. The **one exception** is the Settings preview in rule 5, which the player asked for.
3. **Only the pad in hand.** No effect fires while `router.device === 'kbm'`.
4. **Reduced motion does not disable vibration.** They are different sensory channels, and the Reduced motion setting and WCAG 2.3.3 cover visual motion. Vibration has its own Off, and it sits in **Comfort**, next to the other sensory controls. The Screen shake setting doesn't scale it either: one control per channel, so nothing surprising happens.
5. **Preview:** changing the row plays the **Player hurt** effect once at the new level on the active pad. That is the same-screen preview required by `settings-spec` §0 rule 2.
6. **Cap:** magnitudes are clamped to ≤ 1.0. No effect is longer than 400 ms. Nothing is continuous: no idle hum and no low-HP loop.

---

## §7 Settings-spec delta (these rows are added to `settings-spec` §1)

| Group | Row (label) | Control | Values | **Default** | Save key | Description bar |
|---|---|---|---|---|---|---|
| **Comfort** (after Flash intensity) | Vibration | enum | Off · **Low** · High | **Low** | `vibration` | "Gamepad rumble when you're hit, dash, clear a room or face a big blast. Never in menus." If a pad is connected with no actuator, it adds: "Your browser doesn't support vibration." |
| **Controls** (first row, above the table) | Button prompts | enum | **Auto** · Xbox · PlayStation | **Auto** | `promptStyle` | "Auto matches the controller you're using. Keyboard keys show whenever you use the keyboard." |

- **Default Low:** players who use a pad expect rumble (console norm). Low is felt without startling, and Off is two presses away. This is the median-player default.
- **Button prompts preview:** the footer hint and the Controls table's pad column re-render the same frame (§1 rule 4). The screen is the preview.
- **Fallback placement:** if a row above the Controls table breaks that group's layout, place "Button prompts" in Gameplay after "Aim assist (gamepad)". The Developer chooses; either is acceptable.
- **Controls table pad column:** Wand editor = "Create · Touchpad" (PS) / "View" (Xbox). Pause = "Options" / "Menu".
- **Localization:** "PlayStation" (11 characters) fits the 140 px enum value budget (18 characters). The descriptions are ≤ 2 lines in the 472 px bar.
- **Rows:** 20 become 22. Both are justified: `vibration` is a comfort and sensory need, and `promptStyle` corrects an auto-detect miss on unknown ids and serves players who prefer the other family's legends.

## §8 Save-schema and bindings delta (for the Developer)

```js
// save.js SETTINGS_SPEC. Additive: missing keys take defaults on load, so no SCHEMA_VERSION bump or migration.
promptStyle: { def: 'auto', oneOf: ['auto', 'xbox', 'playstation'] },
vibration:   { def: 'low',  oneOf: ['off', 'low', 'high'] },

// bindings.js
PAD_DEFAULTS.inventory = [8, 17];      // Create/View + DualSense touchpad click (Chrome/Edge index 17)
PAD_UI.back            = [1, 8, 9, 17];
// InputRouter.pollFrame and extraKeys: button loop bound 17 → 18, so index 17 is read.
// Triggers 6/7: press ≥ padTriggerPress (0.20), release < padTriggerRelease (0.10) (§2.2, feel-spec).
```

`bindings.pad` overrides are keyed by index, so they stay valid for both families.
