# Spellwright — `mobile-touch-spec` (phones and tablets, landscape)

**Owner:** UX Designer · **Status:** v2 Wave A1, v1 · **Artifact kind:** ad-hoc `touch-control-spec` (flagged for adoption in `contracts/artifacts.md`: the next touch game will cite it)
**Consumers:** Game Developer (`src/input/TouchSticks.js`, `InputRouter` `wasTouch` branch, `src/sim/AutoAim.js`, `src/ui/hudLayout.js`, `display.js`, `index.html`, `Rumble.js` haptics backend, `nav.js` / `Menu.js` touch semantics), Game Designer (the `touch-aim` feel-tunables block, §3.4), 2D Artist (art list, §12), Animator (touch motion, §11), Audio Director (`touch_ui_tap`, audio unlock, §8).
**Built on:** `specs/v2-overhaul-plan.md` (locked decisions: landscape only + rotate overlay; touch = auto-fire at the nearest visible enemy by default, with a right aim-stick override behind a setting); `hud-layout.md` §9 (the touch profile this spec's controls live in); `accessibility-spec.md` §1, §5 (phone viewing baseline, touch targets); `controller-prompts.md` §9 (the `touch` prompt family); `settings-spec.md` §6 (touch rows).
**Research basis (principles adapted, no text copied):** the sibling project's mobile research and its touch/HUD/editor/web-shell implementation, plus its web-audio and onboarding decisions. The points taken from it: floating sticks, a stick base that follows the thumb when it overshoots, iOS touch ids that can be huge or negative, safe-area insets probed via CSS `env()`, audio unlocked on touch **end**, an ambient audio session, a DASH button shown once any touch is seen, and editor inspection kept separate from placement.

**DOG this spec answers to (falsifiable):**
1. On an 812×375 CSS landscape phone, a new player moves, gets shots off, dashes and switches wands **without reading any text**, using thumbs only.
2. Every touch control's hit area is **≥ 37 game px** (≥ 38.5 CSS px at the smallest phone scale, 1.04×), and each one sits entirely inside the safe rect.
3. No touch control, and no HUD element, intersects a stick zone. `?debug` draws every rect, and the layout validator (`hud-layout.md` §9.4) finds zero overlaps.
4. A tap that opens a screen can never also activate a control on that screen (the §6 open-guard).
5. Audio plays after the first tap on iOS Safari. The run is never resumed by a rotation, a notification or a tab switch without a deliberate tap.

---

## §1 Viewing baseline on phones (what the numbers below assume)

The internal canvas stays **640×360**. `scaleMode: auto` uses FIT (fractional), because phones never reach k ≥ 2 (`accessibility-spec.md` §1). The canvas fills the viewport height, and the page background letterboxes the sides.

| Device (landscape, CSS px) | Scale | Canvas (CSS) | Side letterbox | Bottom safe inset (CSS → game px) |
|---|---|---|---|---|
| iPhone SE 667×375 | 1.042 | 667×375 | 0 | 0 → **0** |
| iPhone 12/13/14 844×390 (standalone) | 1.083 | 693×390 | 75 each | 21 → **19.4** |
| iPhone X/11 Pro 812×375 (standalone) | 1.042 | 667×375 | 72 each | 21 → **20.2** |
| iPhone Pro Max 932×430 (standalone) | 1.194 | 764×430 | 84 each | 21 → **17.6** |
| Android 915×412 (Chrome fullscreen) | 1.144 | 732×412 | 91 each | 0–16 → **0–14** |
| iPad 1024×768 | 1.6 | 1024×576 | 0 (96 top/bottom) | 20 → **0** (inside the letterbox) |

**The safe rect `S` in game px.** For each edge: `inset_game = max(0, env(safe-area-inset-edge) − letterbox_css_on_that_edge) / scale`. Then `S = (sL, sT, 640 − sR, 360 − sB)`. In landscape iPhones the notch sits in the side letterbox (44–59 CSS px of inset against 72–91 CSS px of letterbox), so **in practice only the home-indicator bottom inset reaches the canvas.** Two profiles cover the matrix, and the positions in §3 and `hud-layout.md` §9 are given for both:

- **Profile A:** `S = (0, 0, 640, 360)` (desktop, iPhone SE, iPad, most Androids).
- **Profile B:** `S = (0, 0, 640, 340)` (notched iPhones: the bottom inset rounded **up** to 20 game px).

The Developer computes `S` live from a `#safe-probe` element (a fixed-position div with `padding: env(safe-area-inset-*)`) on `resize`, `orientationchange` and `visualViewport` resize, and emits `EV.DISPLAY_CHANGED`. The layout never hard-codes profile A or B; it always uses the formula.

**The touch input region is the whole viewport** (`#game-root`, which is `position: fixed; inset: 0`), not the canvas. A thumb resting in the side letterbox (72–91 CSS px wide, exactly where thumbs sit) still drives a stick. Pointer coordinates are converted to game px and may be negative or > 640. Drawing is clamped to the canvas (§3.2).

---

## §2 Page and platform (`index.html`, `display.js`)

| Item | Requirement |
|---|---|
| Viewport meta | `width=device-width, initial-scale=1, user-scalable=no, viewport-fit=cover` |
| Page CSS | `touch-action: none` on `html, body, #game-root`; `overscroll-behavior: none`; `-webkit-touch-callout: none`; `user-select: none`. There is no double-tap zoom, no pull-to-refresh and no long-press callout. |
| Phaser | `input: { touch: true, activePointers: 3 }` (two thumbs plus one spare for a stray palm) |
| Home-screen app | `<link rel="manifest">` with `display: "fullscreen"`, `orientation: "landscape"`, `background_color: "#0b0a10"`, `theme_color: "#2a2a3a"`, icons 192/512; plus `apple-mobile-web-app-capable=yes`, `mobile-web-app-capable=yes`, `apple-mobile-web-app-status-bar-style=black-translucent`, and an `apple-touch-icon` at 180 (§7). |
| `isPhone` | `matchMedia('(pointer: coarse)').matches && Math.min(screen.width, screen.height) < 600`. It gates the rotate overlay, the phone FX caps and the Add-to-Home card. It is **not** used to choose the touch profile (that follows the device, §5.1). |

---

## §3 Twin sticks (floating)

### 3.1 Zones (in game px; the input region extends past the canvas edges into the letterbox)

| Zone | Standard (`touchStickSide: standard`) | Swapped (`swapped`, left-handed) |
|---|---|---|
| **Move zone** | x < 320, y ≥ `sT + 54` | x ≥ 320, y ≥ `sT + 54` |
| **Aim zone** | x ≥ 320, y ≥ `sT + 54`, minus the button hit rects (§4) inflated by 4 px | x < 320, same, minus the mirrored buttons |
| **Top band** (`y < sT + 54`) | HUD only (`hud-layout.md` §9). A touch there that misses a HUD button does **nothing**: reaching for PAUSE never fires or moves. | same |

A touch goes, in order, to: a HUD button hit rect → the zone it landed in (if that zone's stick is free) → nothing. **One finger per stick:** a second finger landing in a zone whose stick is already held is ignored.

### 3.2 Stick behaviour

| Property | Move stick | Aim stick |
|---|---|---|
| Base appears | where the finger lands | where the finger lands |
| Base radius R (drawn ring) | **28 game px** | **28 game px** |
| Knob | radius 10, at `base + clamp(finger − base, R)` | same |
| Overshoot | **the base follows the thumb** when `|finger − base| > R` (base = finger − dir·R), so there is no dead edge | the base stays fixed (direction only) |
| Dead zone | `touchMoveDeadzone` (proposed **0.15**) | override threshold `touchAimOverride` (proposed **0.30**, the plan's value) |
| Output | `Intent.moveX/Y` (unit disc) | `Intent.aimX/Y` + `castHeld`, `aimSource = 'stick'` while deflected past the threshold |
| Drawing | **only while pressed**: ring `#b6cbcf` α 0.35 on a `#222222` α 0.25 disc; knob `#fdf7ed` α 0.6 with a 1 px `#222222` ring | same geometry; ring `#facb3e` α 0.35 |
| Near an edge | drawn base clamped to ≥ R + 2 px inside the canvas; the **vector math uses the true touch point** (the thumb never has to move to "catch" the stick) | same |

Nothing is drawn before the first touch, and nothing is drawn for a stick that isn't pressed. This keeps the play field clean and matches the plan's "only pressed stick drawn". The first time a touch is seen, the DASH/SWAP buttons fade in over 200 ms (reduced motion: they appear).

**Pointer ids:** each stick stores the id of the pointer that owns it, plus a separate `held` boolean. iOS Safari reports large and even negative touch identifiers, so an id value must never be read as "no stick". `pointercancel`, `blur`, `visibilitychange` and any modal opening release both sticks (`InputRouter.clearHeld()`).

### 3.3 Firing on touch (`touchFire`, a setting, `settings-spec.md` §6)

**`auto` (default).** While **no** aim-stick override is active, the equipped wand holds cast whenever `AutoAim` has a target, and aims at it with velocity lead. The target rule (UX requirements; the Developer implements them in `src/sim/AutoAim.js`):
1. The candidates are living, non-spawning enemies that are **on screen**, inside wand range, and in line of sight (`World.hasLos`). **Enemies only (user decision):** crates, props and doors are never auto-targeted. They are broken with the **aim stick** (the override below). The Sanctum's crate wall teaches that stick (`ftue-flow.md` §5.3, P2t).
2. *(v1 of this spec proposed a crate fallback here. The user overrode it; there is no fallback.)*
3. Choose the nearest. **Stickiness:** keep the current target until it dies, leaves the candidate set, or another candidate is closer than `touchRetargetRatio` (proposed **0.7**) × the current distance. Without this, the aim flickers between two equidistant enemies.
4. With no candidates, there is no cast, so no mana is spent on empty rooms.
5. **Target marker:** four 3 px corner ticks around the target's sprite bbox (1 px `#fdf7ed` + 1 px `#222222` keyline). It is shown only in auto mode while firing. It is a shape, not a colour.

**Override.** An aim-stick deflection above `touchAimOverride` takes over immediately: aim = the stick direction, with touch-widened aim assist (`applyAimAssist` gated on `device ∈ {pad, touch}`), and cast held for as long as the deflection lasts. This works even with no enemies, and it is **the only way to shoot crates on touch** (as well as pre-firing a doorway or placing trigger payloads). Release returns to auto next step. While the override is active, the pad-style aim pip (`hud-layout.md` §3.3) replaces the target marker.

**`stick`.** Auto-fire is off. The aim stick past the threshold = aim + cast; release = stop (classic twin-stick). Toggle-cast (`castMode`) does not apply on touch; the stick *is* the hold.

**Dash direction:** move-stick direction if it is deflected, else the aim or target direction, else facing (feel-spec rule, unchanged).

### 3.4 Feel tunables (Game Designer owns the values; proposed here, block `touch-aim` in `feel-spec.md`)

`touchStickRadiusPx 28` · `touchMoveDeadzone 0.15` · `touchAimOverride 0.30` · `touchRetargetRatio 0.70` · `touchAimAssistStrength 0.5` (the pad value, until tuned) · `touchDragThresholdPx 6` (editor, `wand-editor-ux.md` §10). Code reads these from tunables; it never hard-codes them.

---

## §4 Action buttons (DASH, SWAP, USE) and HUD buttons (PAUSE, EDIT)

### 4.1 Geometry (game px; circles, centre `(x, y)`; `sr = 640 − sR`, `sb = 360 − sB`)

| Button | Shown when | Centre (standard side) | Profile A | Profile B | Visual Ø | **Hit Ø** | Fires on |
|---|---|---|---|---|---|---|---|
| **DASH** | after the first touch (and always with `touchControls: on`) | `(sr − 30, sb − 30)` | (610, 330) | (610, 310) | 38 | **46** | **press** (pointerdown). Gameplay latency matters; it is buffered by `dashBufferMs`. |
| **SWAP** | the player carries ≥ 2 wands | `(sr − 30, sb − 80)` | (610, 280) | (610, 260) | 38 | **46** | press. Cycles to the next wand. |
| **USE** | an interactable (pedestal, shop, chest, stair) is within `interactRadius` | `(sr − 80, sb − 30)` | (560, 330) | (560, 310) | 38 | **46** | press |
| **PAUSE** | touch profile, in a run | `(sr − 20, sT + 20)` | (620, 20) | (620, 20) | 28 (square) | **40** (square) | **release over the same button** (§6) |
| **EDIT** (wand editor) | touch profile, in a run | `(sr − 64, sT + 20)` | (576, 20) | (576, 20) | 28 | **40** | release-over-same |

- Adjacent hit circles are ≥ 4 px apart (DASH–SWAP and DASH–USE centres are 50 apart; the hit radii are 23 + 23). PAUSE and EDIT hit squares touch but don't overlap (556–596, 600–640).
- **Swapped side** mirrors x for DASH, SWAP and USE only: `(sL + 30, …)`, `(sL + 80, …)`. PAUSE and EDIT stay top-right (both hands reach the top, and moving them would collide with the wand cluster).
- **Why 38/46:** 37 game px is the plan's floor (≈ 44 pt at 1.19×, ≈ 38.5 CSS px at 1.04×). The hit circle (46 → 48–55 CSS px) meets Apple's 44 pt and Material's 48 dp at every phone scale. The visual may be smaller than the hit area (the research finding: the hit area can exceed the icon).

### 4.2 Content and states (non-colour cues first)

| Button | Icon (art) | Ready | Cooldown / unavailable | Pressed |
|---|---|---|---|---|
| DASH | three chevrons ››› | full-alpha ring | while any charge refills: a clockwise **arc** fills the ring over `dashCooldownMs`, and the icon drops to α 0.5. With more than 1 charge, charge pips (3×3) sit under the icon. | body offset 1 px down, darker fill for 80 ms |
| SWAP | the **next** wand's 16 px icon plus its slot-number digit (T1, bottom-right). Under it sit the next wand's **counter pips** (`hud-layout.md` §9.3) when a defended enemy is alive. | as ready | during `wandSwapMs`: α 0.5 | as DASH |
| USE | a verb icon per target: hand (take), coin (shop), stair (descend), eye (look) | — | — | as DASH |
| PAUSE | `II` | — | — | — |
| EDIT | the 16 px wand icon + a `+` badge when the bag holds unslotted cards and a wand has an empty slot (the P3b nudge, `ftue-flow.md` §5) | — | — | — |

Every button has a 1 px `#222222` outer keyline and a `#2a2a3a` α 0.55 body, so it reads over light wall tops and dark floors alike (`accessibility-spec.md` §2.2). **Haptic tick on press:** `touch_ui_tap` (§8).

---

## §5 Device, profile and prompt switching

### 5.1 The touch profile is on when

`touchControls` is `on`; **or** it is `auto` (the default) and the **last meaningful input was a touch pointer** (`pointerType === 'touch'` → `router.device = 'touch'`). `off` never shows touch controls; that value exists for touchscreen laptops played with a mouse.

- Switching between the touch and desktop profiles rebuilds the HUD layout (`hud-layout.md` §9). Switches are **debounced 250 ms** so a touchscreen laptop user who alternates doesn't get thrash, and never happen mid-press (the switch waits for all touches to lift).
- Mouse events synthesized from touches (compatibility mouse events) must **not** flip the device back to `kbm`. `InputRouter` ignores a `pointermove` without buttons that arrives within 500 ms of a touch.
- The prompt family becomes `touch` (`controller-prompts.md` §9) in the same frame as the device change.

### 5.2 Menus on touch (every screen in `screen-graph.md`)

- **Every modal draws a Back button** (`‹`, 28 px visual, 40×40 hit) at `(sL + 20, sT + 20)`, because there is no Esc on a phone. Its action = the screen's `back`.
- **Tap = focus + activate for buttons.** Focusable non-button items (a reward card, a shop item, an editor cell, a Codex entry) take **two taps**: the first focuses it (info pane updates), the second activates it. Alternatively, the screen's primary button (Take / Buy / Place) activates the focused item. **Inspect is never accidentally Take** (the research criticism of accidental plays).
- **Minimum hit heights on touch:** any interactive row or button **≥ 24 game px** tall (≥ 25 CSS px at 1.04×, which clears WCAG 2.5.8's 24 CSS px). **Primary actions** (Resume, Take, Buy, Begin, New Run, Copy, Merge) **≥ 37 game px**. Screens reflow to a 24 px row pitch in the touch profile (`screen-graph.md` §9.6, `settings-spec.md` §6).
- **Scrolling:** a vertical drag of > 6 px on a list scrolls it (1:1 with the finger), and no item under the drag activates. Momentum is not required.

---

## §6 Release-over-same-button and the 0.18 s open-guard (all touch UI except DASH/SWAP/USE)

1. **Release-over-same:** a menu or HUD button (PAUSE, EDIT, every modal button) activates on **pointerup** only if the pointer is still inside the hit rect of the **same** button it went down on. Sliding off cancels. The button shows its pressed state while the finger is over it.
2. **Open-guard:** for **180 ms** after any screen or modal opens (or the pause opens on focus return), pointer-downs are ignored, and so is any pointer-up whose down happened before the open. This covers two cases. First, the finger that tapped PAUSE lifting over the Pause menu's "Abandon" row. Second, a thumb still on a stick when a reward screen auto-opens (a stick release is never a tap). The value `uiOpenGuardMs 180` lives in the tunables (Game Designer's `touch-aim` block or a UI block).
3. Gameplay buttons (DASH, SWAP, USE) fire on **press**, not release. They are exempt from both rules, because latency matters. They sit in the run, not in a menu, so the guard never applies to them.
4. Keyboard and pad input are **not** guarded; the guard is pointer-only. Mouse clicks get rule 1 too (it is the standard desktop button behaviour).

---

## §7 Orientation, install and return

### 7.1 Rotate overlay (landscape only)

- **When:** `isPhone` (or any `pointer: coarse` device) **and** `innerHeight > innerWidth`.
- **What:** a DOM element `#rotate` (not canvas, so it is crisp at any scale): full viewport, background `#0b0a10`, a 64×64 CSS px phone pictogram with a ↻ arrow, and the text "Turn your phone sideways to play" (system font, 20 CSS px, `#fdf7ed`, 14.9:1). The pictogram rotates 90° once per 2 s; under reduced motion it is static, with the arrow.
- **Run hold:** if a run is active and unpaused, open Pause:Menu **immediately** (the same path as focus loss, scene-flow §3). The overlay never resumes anything. Returning to landscape reveals the **welcome-back pause** (§7.3).
- **Not on desktop:** a tall desktop window (`pointer: fine`) never sees the overlay; it FIT-scales as today.
- The Title screen shows the overlay too (the menu layout is landscape-only), but no hold is needed there.

### 7.2 Add to Home Screen

The Safari toolbar costs landscape height (a 375 CSS px tall viewport becomes ≈ 330), which drops the scale to **≈ 0.92×** and the T1 cap to ≈ 6.4 CSS px. A home-screen launch recovers the full height (§1). So install is a legibility feature, not marketing.

| Platform | Trigger | UI |
|---|---|---|
| **iOS Safari** (`navigator.standalone !== true` and not `display-mode: standalone`) | on the Title screen, after the **first run ends** (never before the first run: don't block agency), **or** on first launch if the effective scale < 1.0 | a card at the Title's bottom-right, 220×64: share-glyph icon + "Play full-screen: tap Share, then Add to Home Screen." + [Not now]. Shown at most **3 times** (`meta.a2hs.shown`), never again once dismissed twice. |
| **Android Chrome** (the `beforeinstallprompt` event was captured) | same timing | a Title menu item **Install** (below Fullscreen) that calls `prompt()`. It is removed after `appinstalled` or a dismissal. The existing **Fullscreen** item also works on Android (the Fullscreen API is supported there; iPhone Safari doesn't support element fullscreen, so the item is hidden on iOS). |
| Installed (standalone) | — | nothing is shown |

### 7.3 Welcome-back pause

- **Triggers:** `visibilitychange` → visible; `pageshow` with `persisted`; window `focus` after `blur`; the rotate overlay clearing; an iOS audio-session interruption ending.
- **If a run is active:** the run is already paused (focus loss opened Pause, scene-flow §3). Pause:Menu shows a header block at the top of the Menu tab: T2 "Welcome back" + a T1 reorientation line "Floor 2 · Room 4 · ♥ 4/6 · Wand 2 equipped". Default focus is **Resume** (a primary button, ≥ 37 px). The 180 ms open-guard is re-armed at reveal time, so the tap that wakes the screen can't hit Resume or Abandon.
- **Never auto-resume**, not after a countdown and not after a delay. A phone returning mid-fight must not throw the player into bullets.
- The header disappears the next time Pause opens normally.

---

## §8 Audio and haptics

### 8.1 Audio unlock (iOS rule: only a touch **end** unlocks)

- Global listeners in `SystemScene` (capture, passive): `touchend`, `click`, `keydown`, `visibilitychange → visible`, each calling `AudioMixer.unlock()` (resume every AudioContext). This replaces the Title-only unlock, so the first tap anywhere, including the rotate overlay, unlocks audio.
- `navigator.audioSession.type = 'ambient'` (guarded with `try`) at boot: the game mixes with the player's music, shows no lock-screen player, and respects the silent switch.
- The first-tap-unlock must not need a dedicated "tap to start" screen. The Title's first tap both unlocks audio and focuses or activates its item (a release on the same item = activation, §6).

### 8.2 Haptics (`navigator.vibrate`; setting `haptics`, `settings-spec.md` §6)

`navigator.vibrate` exists on Android Chrome and not on iOS Safari. Where it is absent, every call is a no-op, and the Settings row is disabled with the reason "Not supported by this browser." Calls need a prior user activation (always true after the first touch).

| Cause (bus event) | Priority | **Low** (default) | **High** | Rate limit |
|---|---|---|---|---|
| Player death | 7 | `[80, 60, 160]` | same | — |
| Boss or mini-boss phase change | 6 | `[40, 40, 40]` | same | — |
| Player hurt | 5 | `50` | `60` | i-frames |
| Player shield break | 4 | `30` | `40` | — |
| **Enemy defence broken by your counter** (`EV.DEFENCE` result `break`) | 3 | — | `20` | 1 / 300 ms |
| Big explosion (player-caused, ≥ `bigExplosionRadiusPx`) | 2 | — | `12` | 1 / 200 ms |
| Room clear | 2 | — | `[20, 30, 20]` | — |
| DASH / SWAP / USE / PAUSE / EDIT press (`touch_ui_tap`) | 1 | `6` | `8` | 1 / 80 ms |
| Dash performed | 1 | — | `8` | dash cooldown |

**Rules** (mirroring `controller-prompts.md` §6): one pattern at a time; a **≥**-priority event cancels the running pattern (`vibrate(0)`, then the new one); a lower-priority event arriving mid-pattern is dropped. Nothing fires in menus except the HUD-button tap, while the page is hidden, or during fades. No pattern exceeds 300 ms total. Nothing is continuous. Reduced motion does **not** disable haptics; the setting does. A pad in hand uses the gamepad rumble table instead; haptics fire only while `router.device === 'touch'`.

---

## §9 Performance on phones (UX requirements; the Developer owns the mechanism)

When `isPhone`: particle and FX counts are halved at runtime and damage-number aggregation is widened to 300 ms. The **enemy-bullet read is never degraded**: bullets, telegraphs and hazard rims are exempt from every phone cap, because they carry safety information (`accessibility-spec.md` §3.1).

---

## §10 Touch in the wand editor, reward, shop and settings

This is specified per screen: `wand-editor-ux.md` §10 (phone mode), `screen-graph.md` §9 (touch rows per screen), `settings-spec.md` §6. The common rules are §5.2 and §6.

---

## §11 Motion and audio briefs

- **Animator:** stick appear (0 ms, no pop) and release (base fades 120 ms); button press (1 px, 80 ms); DASH cooldown arc; SWAP icon cross-fade to the new next-wand (90 ms); USE pop-in (120 ms scale 1 → 1 via a 2-frame 1 px lift, never a fractional scale); the rotate pictogram. Every item has a reduced-motion fallback: appear/disappear, no rotation.
- **Audio Director:** `touch_ui_tap` (soft, ≤ 60 ms, UI bus, throttled 1 / 80 ms). The existing `ui_confirm` / `ui_back` cues are reused by menus on touch.

---

## §12 Art needed (2D Artist; exact sizes; pixel art at 1×, never scaled)

| Asset | Size (game px) | States / notes |
|---|---|---|
| Action-button body (DASH/SWAP/USE) | 38×38 circle | normal, pressed, disabled. 1 px `#222222` keyline, `#2a2a3a` body (a runtime α of 0.55 is allowed) |
| Cooldown arc | procedural (Graphics) | none |
| Icons: dash chevrons, swap arrows, use-hand, use-coin, use-stair, use-eye | 16×16 each | monochrome `#fdf7ed` + `#222222` outline |
| HUD square buttons (PAUSE, EDIT) | 28×28 | normal, pressed; icons `II` and a 16 px wand + `+` badge 7×7 |
| Stick ring + knob | procedural circles (R 28 / 10). Optional authored ring 58×58 + knob 22×22 | — |
| Target marker corner tick | 3×3 L-shape | procedural is fine |
| Modal Back button `‹` | 28×28 + a 12 px glyph | normal, pressed |
| Touch prompt glyphs (`controller-prompts.md` §9) | **12×12** × 11 | monochrome, same style as the pad glyphs |
| Rotate-overlay pictogram | 64×64 CSS (SVG or PNG at ×2/×3) | DOM |
| iOS share glyph (our own drawing: a square with an up arrow) | 12×12 game px + 24×24 CSS for the DOM card | — |
| App icons | 180×180 (apple-touch-icon), 192×192, 512×512 PNG + a 512 maskable variant | from the key art, per `style-guide.md` |
| Home-screen splash | none (iOS standalone shows `background_color`) | — |

**Other v2 UX art (not touch-specific; listed here so the 2D Artist has one list):**

| Asset | Size | Used by |
|---|---|---|
| Defence icons: shield (tower shield), armour (plate), ward (rune ring) | 7×7 each, + 16×16 door-threat versions | counter pips (`hud-layout.md` §9.3), BLOCKED numbers, door threat icon, first-block tip toasts |
| Keyword icons: pierce, blast, shock | 7×7 each | Enables chips (`wand-editor-ux.md` §11.2), SWAP-button pips |
| Door icons: risk, unknown `?` | 16×16 | door labels (`hud-layout.md` §9.6) |
| Affix glyphs: shield-plate, ward-rune, tower-shield, wing, burst (`affixes.json` `glyph`) | 7×7 each | elite nameplates |
| Ghost hand (pointing) | 16×16 (+ an optional 2-frame tap pose) | coach (`ftue-flow.md` §5.1) |
| Card level pips (2×2) and evolution ★ badge | 2×2 / 7×7 | forge results (`screen-graph.md` §9.5) |
| Mode icons: Standard, Daily, Gentle; Heat flame numerals 0–5 | 32×32 (modes) / 9×9 (heat) | Mode Select (`screen-graph.md` §9.2) |
| Goal status glyphs ✔ ▶ ○ ◐ | 9×9 each | Goals screen |
| Insert-bar / swap-ring | procedural (2 px) | editor (`wand-editor-ux.md` §10.3) |
| SALE chip, DUO chip, "Counters" chip | procedural T1 chips on the 12 px pill | reward and shop |

---

## §13 Verification (Wave F, craft self-check; not a test suite)

1. Chrome DevTools device emulation at 812×375 and 844×390 landscape: every rect in the `?debug` overlay sits inside `S`, no stick zone intersects a HUD rect, and DASH/SWAP hit circles measure ≥ 46 game px.
2. Portrait shows `#rotate`, and an active run is paused. Landscape shows the welcome-back header with Resume focused. A tap within 180 ms of the reveal does nothing.
3. Emulated touch (`pointerType: 'touch'`): the move stick appears under the finger and follows past R; the aim stick overrides auto-fire above 0.30. In the Sanctum, auto-fire stays silent at the crate wall, P2t appears, and the aim stick breaks the crates.
4. The first `touchend` resumes the AudioContext (`__SW__` audio state reads running).
5. Every screen in `screen-graph.md` is completable by taps and drags alone (Back button, two-tap inspect/activate, 24 px rows).
6. **Recorded gap:** there is no real-device test in this environment. iOS rotation-without-resize, real touch ids and `navigator.vibrate` absence are covered by the rules above and by emulation only.
