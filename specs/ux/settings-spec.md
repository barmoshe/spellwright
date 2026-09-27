# Spellwright — `settings-spec`

**Owner:** UX Designer · **Status:** Wave 2, v1 · **Consumers:** Game Developer (`SettingsScene`, `save.js` defaults and validation, `display.js`, `InputRouter`, `audio.js`), 2D Artist (slider, toggle, enum and keycap widgets), Audio Director (bus names and preview cues).
**Built on:** `save-schema.md` (the settings document and its clamps; this spec is its UX co-spec), `architecture.md` §3 (scaling), §8 (bindings), §9 (shake, bloom), §12 (buses), `feel-spec.md` §0 (the shake setting multiplies every `*ShakePx`) and §verb-2 (pad aim assist), `accessibility-spec.md` (why each comfort option exists).

---

## §0 Rules

1. **Every change applies live and saves immediately** (the save's 500 ms debounce). There is no Apply/Cancel pair, because the preview *is* the applied state. `back` leaves; nothing is lost and nothing is half-applied.
2. **Any setting that affects gameplay or feel has a visible or audible preview in the same screen** (§3). There is no save-and-find-out.
3. **Defaults are right for the median player** and match the design numbers (feel-spec, cue-spec). A default that disables a designed forgiveness is a bug (see O-UX-2).
4. **Every row has a one-line description** in the description bar, so the label can stay short.
5. **Each group keeps ≤ 8 rows** except Controls (a table). **"Reset group to defaults"** is the last row of every group.
6. The same scene opens from Title and from Pause → Menu (scene-flow). From Pause, every option is available, including audio and scaling, because a mid-run fix is the most common reason to open settings.

---

## §1 Inventory (groups, rows, defaults, save keys)

| Group | Row (label, T1) | Control | Values | **Default** | Save key (`save.settings.*`) | Description bar text |
|---|---|---|---|---|---|---|
| **Audio** | Master volume | slider | 0–100, step 5 | **80** | `masterVolume` | "Overall volume." |
| | Music | slider | 0–100, step 5 | **70** | `musicVolume` | "Music volume." |
| | Sound effects | slider | 0–100, step 5 | **90** | `sfxVolume` (sfx + ambience buses) | "Spells, enemies, impacts, ambience." |
| | Interface | slider | 0–100, step 5 | **80** | `uiVolume` **(new key)** | "Menu and HUD sounds." |
| | Mute when unfocused | toggle | On / Off | **On** | `muteOnFocusLoss` | "Silence the game when you switch windows." |
| **Display** | Scaling | enum | **Auto** · Pixel-perfect · Fill window | **Auto** | `scaleMode` **(replaces `pixelPerfect`; see O-UX-1)** | Auto: "Sharp pixels when the window is big enough, otherwise fills it." · Pixel-perfect: "Always whole-number scaling. Can be small in small windows." · Fill: "Always fills the window. Pixels may be uneven." |
| | Fullscreen | toggle | On / Off | Off (not persisted; browsers need a click) | — (`display.js` toggle) | "Also: F11 in most browsers." |
| | Bloom | toggle | On / Off | **Off** | `bloom` | "Soft glow on bright spells. Costs performance." |
| | Show FPS | toggle | On / Off | **Off** | `showFps` | "Frame-rate counter in the corner." |
| **Comfort** | Reduced motion | enum | **Follow system** · On · Off | **Follow system** | `reducedMotion` (null / true / false) | "Removes shake, camera drift and moving UI. Follow system uses your OS setting." (`accessibility-spec.md` §4 lists everything it changes.) |
| | Screen shake | slider | 0–100%, step 10 | **100%** | `screenShake` | "Scales every shake. 0% turns it off. Always 0 with reduced motion." |
| | Flash intensity | slider | 0–100%, step 10 | **100%** | `flashIntensity` | "Scales hit flashes and screen flashes." (The photosensitivity limits in `accessibility-spec.md` §4.3 apply at every value.) |
| | Enemy projectile emphasis | enum | **Standard** · High | **Standard** | `enemyShotEmphasis` **(new key)** | "High adds a bright outer ring to enemy shots. Hitboxes don't change." |
| | Damage numbers | toggle | On / Off | **On** | `damageNumbers` | "Numbers over enemies when you hit them." |
| | Show hitbox | toggle | On / Off | **Off** | `showHitbox` **(new key)** | "Marks the small spot on your wizard that enemies must hit." (the 3×3 pip of `style-guide.md` §4.5; the hurtbox is 4 px, much smaller than the 16×28 sprite) |
| **Gameplay** | Cast mode | enum | **Hold** · Toggle | **Hold** | `castMode` **(new key)** | Hold: "Hold the cast button to keep casting." · Toggle: "Press once to start casting, again to stop. AUTO shows on the HUD." |
| | Aim assist (gamepad) | slider | 0–100%, step 10 | **100%** | `aimAssist` **(default changes from 0; see O-UX-2)** | "Nudges gamepad aim toward nearby enemies. Mouse aim is never assisted." |
| | Tutorial hints | toggle | On / Off | **On** | `tutorialHints` **(new key)** | "Short control hints the first time you need them." |
| | Reset tutorial | button | → confirm | — | clears `meta.ftue.*` incl. `tutorialDone` | "Hints show again and your next run starts with the tutorial rooms." |
| **Controls** | (table, §2) | rebind cells | — | `src/input/bindings.js` defaults | `bindings.kbm` (pad: view-only in v1) | per focused action: "Press Enter to change. Esc cancels." |
| **Language & Data** | Language | enum (disabled) | English | **English** | `language` | "More languages later." (stays focusable so the reason is readable; disabled style + text) |
| | Reset all progress | button | → D6 | — | `Save.reset()` | "Erases unlocks, codex and stats. Settings are kept." |

**Not offered (deliberately):**
- **Text size.** The UI is authored on a fixed 640×360 pixel canvas. Legible size comes from the scaling rules (`accessibility-spec.md` §2: minimum T1 = 14 CSS px cap height at ×2) and from the Scaling option, not from a text slider that would break every pixel layout.
- **Colour-blind filters.** Elements, statuses, projectiles and card types are shape-coded by default (`accessibility-spec.md` §3). A filter would recolour the palette the style guide depends on and would add nothing that shapes don't already carry.
- **Difficulty.** There is a single curve by design (`progression-and-pacing.md` §4.5). Opt-in difficulty lives in curses (Run Setup).
- **Pause on focus loss** is always on (scene-flow §3). It is not a toggle, because a paused game can never punish the player.

### 1.1 Semantics the Game Developer implements

| Setting | Effect |
|---|---|
| `scaleMode` | **Auto:** `k = floor(min(innerW/640, innerH/360))`; if `k ≥ 2` → integer zoom `k`; else → FIT (fractional, nearest filtering). **Pixel-perfect:** integer `max(1, k)` always. **Fill:** FIT always. This supersedes `architecture.md` §3's "k < 1 only" fallback (O-UX-1). |
| `castMode: toggle` | A cast *press* flips a latch; while the latch is on, `castHeld = true`. The latch persists across modals (on resume the HUD shows AUTO) and clears on run end. Dash and wand swap don't clear it. `castPressed` taps still work in toggle mode for the first press. |
| `aimAssist` | effective strength = `aimAssistStrength` (feel-spec, 0.5) × `aimAssist` / 100. At the default of 100% the designer's value applies exactly. The cone and range tunables are unchanged. Mouse is never assisted (feel-spec). |
| `screenShake` | multiplies every `*ShakePx` before the `shakeMaxPx` clamp (feel-spec §0). It is forced to 0 when reduced motion is effective. |
| `flashIntensity` | multiplies the alpha of every white fill-flash (`enemyHitFlashMs`, `hurtFlashMs`, the sputter flash, HUD flashes). 0% keeps the timing but draws nothing. |
| `enemyShotEmphasis: high` | enemy projectiles get a 1 px outer ring (§4.2 of `accessibility-spec.md`) drawn from the same atlas frame set. Visual only; hitboxes are unchanged. |
| `reducedMotion` | effective = the value if non-null, else `matchMedia('(prefers-reduced-motion: reduce)')`, re-read on change. |
| `uiVolume` | gain on the `ui` bus (architecture §12 lists buses `music/sfx/ui/ambience`). `sfxVolume` drives `sfx` and `ambience`. |

**Save-schema delta** (Game Developer; all default-merged, so no migration is needed per `save-schema.md` "adding a field with a default needs no migration"): add `uiVolume: 80`, `scaleMode: 'auto'`, `enemyShotEmphasis: 'standard'`, `showHitbox: false`, `castMode: 'hold'`, `tutorialHints: true`; change the `aimAssist` default 0 → 100; remove `pixelPerfect` (schema v1 has never shipped, so rename in place; if a v1 document exists, `pixelPerfect:true → 'auto'`, `false → 'fill'`).

---

## §2 Controls group (bindings)

Table rows (T1, 14 px pitch), columns: **Action** · **Keyboard / mouse** (2 cells: primary and secondary) · **Gamepad** (view-only in v1).

| Action | KB+M default (bindings.js) | Pad default |
|---|---|---|
| Move up / down / left / right | W / S / A / D · ↑ ↓ ← → | Left stick |
| Aim | Mouse (not rebindable) | Right stick |
| Cast | LMB · — | RT |
| Dash | Space · RMB | A · LB |
| Interact | E · — | X |
| Next wand | Q · Wheel down | RB |
| Previous wand | Wheel up · — | Y |
| Wand 1 / 2 / 3 | 1 / 2 / 3 | — |
| Wand editor | Tab · I | View / Back |
| Pause | Esc (**locked**) | Start (**locked**) |

- **Rebind flow (KB+M):** focus a cell → confirm → S6k capture dialog ("Press a key or mouse button for Dash. Esc cancels.") → the next key-down or mouse button is assigned. **Conflicts swap:** if the key was bound to another *gameplay* action, that action receives the old key, and a line under the row says "Dash ⇄ Interact swapped". It is never a silent unbind.
- **Locked:** Esc (pause and back) and mouse aim. Esc is the guaranteed way out of every screen (`screen-graph.md` §0). A cell showing "—" can be bound.
- **UI navigation keys** (arrows, Enter, Esc, Q/E) are not rebindable; they are the menu channel (architecture §8), which keeps every screen reachable whatever the gameplay bindings are.
- **Gamepad remapping is deferred** (the table shows the bindings with a note: "Gamepad remapping: use your system or Steam Input for now"). The HUD and prompts always render the current bindings (`ftue-flow.md` §2 rule 11).
- **Reset controls to defaults** is the last row (it resets `bindings.kbm` only).
- **Delta (Wave 3):** the rows `vibration` (Comfort) and `promptStyle` (Controls) and the PlayStation pad column are specified in `controller-prompts.md` §7.

---

## §3 Layout and previews (640×360)

| Region | Box (x, y, w, h) | Content |
|---|---|---|
| Title | 16, 8, 608, 14 | "Settings" (T2) · parent breadcrumb, T1: "Title ›" or "Paused ›" |
| Group rail | 16, 30, 120, 6 × 20 | 6 groups, 20 px rows, T1. The selected group has a 2 px bar on its left edge plus bright text. |
| Content | 152, 30, 472, 280 | rows at 18 px pitch: label T1 at x 160; control right-aligned to x 616 (slider track 100×4 at x 470 with a 6×10 thumb, value "80%" T1 right-aligned at 616; toggle = two chips "On | Off" with the active one **filled and underlined**; enum = "◂ Follow system ▸"). Focused row: the focus ring around the whole row. |
| **Preview box** (Comfort and Gameplay groups only) | 480, 200, 136, 90 | a live sample: a floor tile, a crate and an enemy dummy. On any change to Screen shake / Flash / Damage numbers / Enemy projectile emphasis / Show hitbox / Reduced motion, the dummy takes a scripted hit: the box shakes at `explosionShakePx × value`, the dummy flashes at the flash intensity, a sample damage number rises (or holds, under reduced motion), and a sample enemy shot crosses in Standard or High emphasis. |
| Description bar | 152, 316, 472, 26 | the focused row's description (T1, ≤ 2 lines). Disabled rows state their reason here. |
| Footer | 16, 344, 608, 14 | hints: `Esc Back · ←/→ Change · Enter Select` / `B Back · ◂▸ Change · A Select` |

**Audio previews:** moving an audio slider plays a representative cue on that bus once per 250 ms of adjustment: Music → the current track keeps playing (title or run); Sound effects → `hit_enemy`; Interface → `ui_move`; Master → `ui_confirm`.
**Scaling preview:** it applies immediately. The whole screen *is* the preview.
**Cast mode / Aim assist:** they can't be previewed in a menu. The description states exactly what changes, and the HUD shows "AUTO" once toggle-cast latches. Both are reversible in two presses.

---

## §4 Localization budgets

| Slot | Width | English max | Budget (+35%) | Overflow |
|---|---|---|---|---|
| Group name (rail) | 112 px | "Language & Data" 15 | 20 chars | wraps to 2 lines (the row grows to 26 px) |
| Row label | ~300 px | "Enemy projectile emphasis" 25 | 34 | never truncated. The control column is right-aligned and fixed, so labels have the full remaining width |
| Enum value | 140 px | "Follow system" 13 | 18 | the ◂ ▸ arrows stay at fixed positions; the value text is centred and can shrink its padding |
| Description | 472 px × 2 lines | ~90 | 120 | a 3rd line pushes the bar up into the content area's last 12 px |

---

## §5 DOG self-check (`menu-and-settings-design`)

- **The options players actually want, and no more:** 20 rows across 6 groups, each justified by a comfort or accessibility need or a platform expectation (mute, fullscreen, volume). The rejected options are listed with reasons (§1). ✔
- **Defaults correct for the median player:** they match the design numbers (100% shake as authored, 100% aim assist = the feel-spec value, Hold cast, hints on). ✔
- **Related options grouped:** Audio / Display / Comfort / Gameplay / Controls / Language & Data. ✔
- **Every gameplay-affecting setting previews immediately:** the §3 preview box, audio previews, and live scaling. The two that can't be previewed (cast mode, aim assist) get an exact description plus an in-run indicator. ✔

---

## §6 v2 delta: touch rows (additive keys; no schema bump)

**Status:** v2 Wave A1. The rows below are **added**. Missing keys take their defaults on load (`save-schema.md`: "adding a field with a default needs no migration"). The **Touch** rows are shown only when the device can touch (`matchMedia('(any-pointer: coarse)')`) **or** a touch has been seen this session. A desktop without touch never sees them, so the row budget for desktop players is unchanged.

| Group | Row (label, T1) | Control | Values | **Default** | Save key | Description bar |
|---|---|---|---|---|---|---|
| **Controls** (a "Touch" sub-heading above the bindings table) | Touch controls | enum | **Auto** · On · Off | **Auto** | `touchControls` (`'auto'\|'on'\|'off'`) | Auto: "Sticks and buttons appear once you touch the screen." · On: "Always show them." · Off: "Never show them (for touchscreen laptops played with a mouse)." |
| | Touch firing | enum | **Auto-fire** · Right stick | **Auto-fire** | `touchFire` (`'auto'\|'stick'`) | Auto: "Your wand fires at the nearest enemy you can see. Drag the right side to aim it yourself." · Stick: "Drag the right side to aim and fire; let go to stop." |
| | Stick side | enum | **Standard** · Swapped | **Standard** | `touchStickSide` (`'standard'\|'swapped'`) | Standard: "Move with your left thumb, aim and dash with your right." · Swapped: "Move right, aim and dash left (the buttons move too)." |
| **Comfort** (after Vibration) | Haptics (phone) | enum | Off · **Low** · High | **Low** | `haptics` (`'off'\|'low'\|'high'`) | "Phone buzz when you're hit, a boss changes phase, or you press a button. High adds dashes, blasts and broken defences." When `navigator.vibrate` is missing, the row is disabled with: "Not supported by this browser (e.g. iPhone Safari)." |

- **Preview:** *Touch controls* and *Stick side* apply live. The HUD layout rebuilds behind the translucent settings panel (`hud-layout.md` §9.1), and when opened from Pause, the DASH/SWAP positions are visible through the backdrop. *Touch firing*: the description is exact, and it is reversible in 2 taps. *Haptics*: changing the value plays the **Player hurt** pattern once at the new level (the same rule as Vibration, `controller-prompts.md` §6 rule 5).
- **Semantics** are in `mobile-touch-spec.md`: §3.3 (touchFire), §5.1 (touchControls), §3.1 / §4.1 (stickSide), §8.2 (haptics).
- **Touch profile layout:** in the touch profile, the content row pitch becomes **24 px** (from 18) so every row is a ≥ 24 px target. Groups keep ≤ 8 rows except Controls, which scrolls (a vertical drag, `mobile-touch-spec.md` §5.2). The group rail rows become 24 px.
- **Controls table on touch:** a third column, **Touch**, shows the touch mapping read-only: Move = left side · Aim = right side · Cast = auto / right stick · Dash = DASH · Next wand = SWAP · Interact = USE · Wand editor = EDIT · Pause = PAUSE. Touch remapping is not offered; stick side and firing mode are the adjustable parts.
- **Rows:** 22 become 26 on touch devices (still 22 on desktop). Each new row is justified: the first three are motor and preference needs with no other channel, and haptics is its own sensory channel.
- **Localization:** "Auto-fire" / "Right stick" / "Swapped" fit the 18-character enum budget. The descriptions are ≤ 2 lines in the 472 px bar.
