# Spellwright — `accessibility-spec`

**Owner:** UX Designer · **Status:** Wave 2, v1 · **Consumers:** 2D Artist (`style-guide`, `ui-artwork`, element/status/projectile art), Animator (reduced-motion variants), Technical Artist (`font-atlas`, projectile sprite minimums), Game Developer (limiter, settings wiring, focus ring, input), Audio Director (visual twins of audio-only cues).
**Standards applied:** WCAG 2.2 AA where it maps to a game UI: 1.4.3 contrast (4.5:1 text), 1.4.11 non-text contrast (3:1), 2.1.1 keyboard, 2.2.2 pause, 2.3.1 three flashes, 2.4.7 focus visible, 2.5.8 target size (24 CSS px). Game Accessibility Guidelines (gameaccessibilityguidelines.com), basic and intermediate tiers: remappable controls, no essential info by colour alone, no flashing, subtitles/visual cues for audio, pause anywhere, adjustable feedback.
**Briefed at wireframe time:** every rule below is already applied in `screen-graph.md`, `wand-editor-ux.md`, `hud-layout.md`, `ftue-flow.md` and `settings-spec.md`. This doc is the contract those specs cite. It is not a retrofit list.

---

## §1 Viewing baseline

- Internal canvas **640×360**. The **minimum effective scale for legibility is ×2** (1280×720 CSS px). `scaleMode: auto` (the default, `settings-spec.md` §1.1) guarantees ≥ ×2 whenever the window allows it, and fills fractionally below that instead of dropping to ×1 (objection **O-UX-1** against `architecture.md` §3). Every px minimum below is stated in **internal px**, with its CSS size at ×2.
- Legibility floor rationale: a 1366×768 laptop running a browser has an inner viewport of ≈ 1366×650. The current integer-only rule gives `k = floor(min(2.13, 1.81)) = 1` there: a 640×360 canvas with T1 text at a **7 CSS px** cap height. That fails any reasonable reading-size floor. Auto → FIT gives ≈ ×1.8 (cap ≈ 12.6 CSS px), and fullscreen gives ×2 (14 CSS px).
- **Phones (v2).** The canvas FIT-scales at **1.04–1.19×** in landscape (`mobile-touch-spec.md` §1). T1's 7 px cap renders at **7.3–8.4 CSS px** (≈ 10.5–12 px font-size equivalent), at the edge of Apple's 11 pt text floor. That is why **T1 is now the minimum text role** (§2.1): the removed T-small role rendered at **5.2 CSS px** on a phone and was illegible. A home-screen launch recovers the height the Safari toolbar takes (≈ 0.92× in Safari → 1.04× standalone), so Add-to-Home is treated as a legibility feature (`mobile-touch-spec.md` §7.2). **Recorded limitation:** below 1.04× (Safari with its toolbar), T1 is ≈ 6.4 CSS px. The fixed 640×360 canvas can't be made larger without a phone-specific internal resolution, which is out of v2 scope. Mitigations: nothing below T1; every critical state is also a shape or icon (§3); the A2HS card.

---

## §2 Text: roles, minimum sizes, contrast

### 2.1 Text roles (Technical Artist `font-atlas`: Kenney CC0 TTFs baked to BitmapFont at native size, drawn only at integer scales; `asset-inventory.md` §2.9)

| Role | Font (baked) | Cap height (internal) | Line pitch | At ×2 (CSS) | Allowed for |
|---|---|---|---|---|---|
| **T1 — body** | Kenney Pixel @ 16 px em | **7 px** | 12 px | 14 px cap (≈ 20 px font-size equivalent) | **Everything gameplay-critical or decision-bearing**: prompts, tooltips and detail numbers, costs, prices, warnings, HUD coins, damage numbers, door labels, settings labels, confirm dialogs |
| **T2 — heading** | Kenney High @ 16 px em | 9 px | 14 px | 18 px cap | screen titles, boss name card, section heads |
| **Display** | T1 at integer ×2 | 14 px | 24 px | 28 px cap | floor title card, run-end outcome, title logo fallback |
| ~~T-small — label~~ | ~~Kenney Mini @ 8 px em~~ | ~~5 px~~ | — | — | **Removed in v2.** At phone scale it rendered at 5.2 CSS px. Every former call site is ruled in §2.3. `kit.js` keeps a one-wave alias `Tsmall → T1` so nothing crashes mid-migration. After Wave C, `grep -rn Tsmall src` must return **0**, and the TA stops baking `font.small`. |

**Hard rules:** **no text below T1 (7 px cap)** anywhere, in any profile. No fractional scaling of any bitmap text (including tweens: a scale pop must be ×1 → ×2 steps, never 1.5; see objection **O-UX-3**). Every text object is BitmapText (architecture §9). Keycaps, pills and chips are **12 px tall** so T1 fits them (cap 7 + a 2–3 px margin).

### 2.2 Contrast

| Case | Requirement | How it's met |
|---|---|---|
| Text on a UI panel | **≥ 4.5:1** | panel colours from the style guide. Reference pairings below until the 2D Artist's `style-guide` lands. |
| Text over the game world (HUD numbers, damage numbers, prompts without a panel, banners) | **≥ 4.5:1 between the glyph and its own outline** (`#fdf7ed` on `#222222` = 14.9:1) | a **1 px dark outline on all 8 neighbours** is part of the baked font (the TA bakes an outlined variant). With the outline, legibility no longer depends on the floor tile behind the text. |
| Non-text UI (bars, slot frames, focus ring, pips, toggles, icons that carry meaning) | **≥ 3:1** against the adjacent colour | mana fill vs its track, boss fill vs its chip, and the focus ring are all specified as a light element with a dark keyline |
| Disabled controls | exempt (WCAG), but the **reason text** is T1 at ≥ 4.5:1 | settings §3 description bar; shop "Need n more coins" |

**UI palette** (from `style-guide.md` §8: text on panels sits on the `#2a2a3a` panel fill, never on mid slate; every glyph is baked with a 1 px `#222222` stroke). Ratios are WCAG relative-luminance, computed:

| Token | Hex | vs panel `#2a2a3a` | vs stroke `#222222` | Use / rule |
|---|---|---|---|---|
| text | `#fdf7ed` | 13.2:1 | 14.9:1 | T1/T2 primary |
| text-dim | `#b6cbcf` | 8.3:1 | 9.4:1 | descriptions, secondary T1 |
| warn (⚠) | `#facb3e` | 9.2:1 | 10.4:1 | amber warnings |
| error (⛔) | `#FF6B5E` | 5.0:1 | — | red warnings, "can't" states. The master-ramp `#da4e38` fails 4.5:1 on the panel. The hue (≈ 5°) stays outside the reserved hostile band (330°–355°, `style-guide.md` §4.1). |
| ok (✔) | `#97da3f` | 8.3:1 | 9.4:1 | sustainable, affordable |
| mana | `#5698cc` | 4.5:1 | 5.1:1 | the mana **bar** (non-text, ≥ 3:1). The mana *number* uses `text`, not this colour. |
| gold | `#facb3e` + coin icon | 9.2:1 | 10.4:1 | coins, crits (the shape carries the difference from warn) |
| disabled | `#6E6886` | 2.7:1 | — | disabled label text only (WCAG-exempt); the **reason** is always given in `text-dim` |

### 2.3 T-small call-site audit (v2; one ruling per site; the Game Developer applies them in Wave C)

**promote** = same place, T1 role (the container grows as noted) · **abbreviate** = T1, shorter string · **drop** = remove the text; the stated channel carries the information.

| # | Site | What it shows | Ruling | Detail |
|---|---|---|---|---|
| 1 | `kit.js:24` | ROLE comment | infra | rewrite: "T1 7 px, T2 9 px, display = T1 ×2; no smaller role" |
| 2 | `kit.js:28` | `ROLE.Tsmall` | infra | alias to T1 metrics for one wave, then delete |
| 3 | `kit.js:31` | `PITCH.Tsmall` | infra | delete (any caller uses `PITCH.T1` = 12) |
| 4 | `kit.js:50` | `FONT.small` | infra | delete; the TA drops the `font.small*` bake |
| 5 | `kit.js:128` | missing-icon fallback letters (< 32 px icons) | **promote** | T1; **1 letter** below 32 px, 2 letters at 32 px |
| 6 | `kit.js:190` `chip()` | mana-cost chip on 32 px card cells | **promote** | chip height 7 → **12**, width = text + 4; stays inside the cell's bottom-left. It is not drawn on 16 px mini-cards (unchanged). |
| 7 | `kit.js:243` `keycap()` | key legend | **promote** | 12 px keycap unchanged; width = `max(12, textW + 6)` |
| 8 | `draw.js:99` `richLine` | line height branch for Tsmall | infra | delete the branch (`h = 10` always) |
| 9 | `HudKit.js:249` | pad glyph legend letter beside the diamond | **promote** | T1; `c._w = 14 + textW + 1` |
| 10 | `HudKit.js:267` | pill legend (L1, R1, Create, Options, Touch) | **promote** | T1; `w = max(12, textW + 6)`. Atlas glyphs (≤ 16×12) stay preferred; this is only the fallback path. |
| 11 | `WandEditor.js:155` | "Wand stats" header (A2) | **promote** | T1 at y 182; rows start at 196 (A2 fits: 12 + 9 × 12 = 120 ≤ 146) |
| 12 | `WandEditor.js:204` | "2/4 slots" under the wand name | **abbreviate** | "2/4" in T1 at `(x + 40, y + 27)`; the word "slots" is dropped (the header B1 says "Slots 2/4") |
| 13 | `WandEditor.js:206` | changed badge "↻ 0.40s" on the wand card | **promote** | T1, right-aligned at `x + 118, y + 27` |
| 14 | `WandEditor.js:270` | slot indices over each cell | **drop** | order is left to right. Warnings name the **card** and badge the **cell**, and pane C prints "Slot 5" for the focused cell. |
| 15 | `WandEditor.js:291` | "Shuffled: order changes…" in the bracket lane | **promote** | T1 at y 84 (lane 1 is 12 px tall, §2.1 B5 as revised in `wand-editor-ux.md` §10) |
| 16 | `WandEditor.js:313` | cast number on bracket lane 1 | **promote** | T1 at y 84; lane 1 = y 80–95 |
| 17 | `WandEditor.js:323` | cast number on the wrap lane | **drop** | lane 2 (y 97–101) draws only the dashed line + ↩. The number shows once, where the cast starts, in lane 1. |
| 18 | `WandEditor.js:356` | salvage-bin second line | **promote** | T1, wrap 124 (the bin is 136×74: 3 lines fit) |
| 19 | `WandEditor.js:392` | "▼ n more" in the preview | **promote** | T1, right-aligned `(519, 286)` |
| 20 | `WandEditor.js:411` | "+n" overflow of cast-line icons | **promote** | T1; `x += 14` |
| 21 | `CodexView.js:63` | "n/total" under each tab label | **abbreviate** | moves **into** the tab label: "Cards 12/43" (T1). Tabs keep their height. |
| 22 | `RewardScene.js:72` | "★ NEW" badge | **promote** | T1, right-aligned `(W − 8, 6)` |
| 23 | `SettingsScene.js:87` | breadcrumb "Title ›" / "Paused ›" | **promote** | T1 at `(86, 10)` |
| 24 | `SettingsScene.js:322` | gamepad-remapping note under the Controls table | **promote** | T1 with wrap 456. If the table would overflow, the note moves to the description bar whenever the pad column is focused. |
| 25 | `SettingsScene.js:390` | "Preview" label on the preview box | **drop** | the box is self-evident, and the description bar names the setting being previewed |
| 26 | `PauseScene.js:179` | Map tab: 3-letter reward kind under each pip | **drop** | replaced by the **16 px reward-kind icon** already used on doors (`hud-layout.md` §6) |
| 27 | `HudScene.js:240` | relic overflow "+n" | **promote** | T1 (`hud-layout.md` §9.5) |
| 28 | `HudScene.js:468` | mana value next to the bar | **promote** | T1 at `(199, 344)` desktop / `(sl + 199, st + 42)` touch |
| 29 | `HudScene.js:472` | "AUTO" chip | **promote** | T1 at `(76, 312)` |
| 30 | `HudScene.js:475` | "no spells" | **promote** | T1 |
| 31 | `HudScene.js:514` | wand-badge key digit | **drop** | left-to-right order = 1, 2, 3; Controls table. The SWAP button (touch) prints the next wand's digit in T1. |
| 32 | `HudScene.js:522/532` | pad shoulder glyph text "◂Y" / "RB▸" (+ its comment) | **promote** | T1 at `y = 318` over the first and last badges |

**Overflow check (falsifiable):** after the promotions, `?debug` + F4 (`hud-layout.md` §9.4) plus a Codex, Settings, Editor and Reward screenshot at 812×375 show no clipped or overlapping T1 string.

---

## §3 Colour is never the sole channel

Every colour-coded meaning in the game, with the channel that carries it without colour. **The falsifiable check:** a grayscale screenshot, plus Chrome DevTools "Emulate vision deficiencies" (protanopia, deuteranopia, tritanopia), of (a) a combat room with all 5 elements' projectiles and statuses, (b) the wand editor, and (c) the shop. A reviewer must identify every meaning in this table from each image.

| Meaning | Colour (redundant) | Required non-colour channel | Owner |
|---|---|---|---|
| **Element** of a spell/shot | violet / orange / cyan / yellow / green | **shape**: arcane round orb · fire teardrop · frost shard (angular) · shock zigzag · poison droplet (mechanic-spec §14). Card corner glyph uses the same shapes. | 2D Artist |
| Why shapes are mandatory here | — | Confusion pairs in this palette: fire-orange vs poison-green (deutan), shock-yellow vs fire-orange (protan), frost-cyan vs arcane-violet (tritan). Hue alone fails for ~8% of male players. | — |
| **Player vs enemy projectile** (the most safety-critical read) | enemy rim in the reserved hostile band | **`style-guide.md` §4.1's four channels, adopted verbatim:** value structure (enemy dark core, bright rim), outline (enemy closed 1 px `#222222`, player none), shape (enemy is **always a disc and never rotates**; player uses the element shapes), and light (player glows ADD, enemy never glows). Plus the optional **High emphasis** setting: an extra 1 px `#fdf7ed` outer ring on enemy shots. | 2D Artist, TA |
| **Enemy projectile element** (frost slows the player) | cyan | the frost enemy shot uses the shard silhouette | 2D Artist |
| Status: burn | orange | flame glyph flicker over the sprite | 2D Artist / Animator |
| Status: chill (1–2 stacks; 3 = frozen) | `chill-tint-1/2` MULTIPLY | **1–2 frost-shard pips** over the head (count = stacks). *Currently missing:* `style-guide.md` §4.4 gives chill only the tint tokens → objection **O-UX-5**. | 2D Artist |
| Status: frozen | blue | a **crystal shell silhouette** around the sprite, and no animation (frozen pose) | 2D Artist / Animator |
| Status: shocked / vulnerable | yellow | jagged spark glyph; vulnerable = a small ▼ pip | 2D Artist |
| Status: poison (stacks) | green | droplet glyph + **stack number** (a T1 numeral on a dark 12 px chip; a baked 5×7 numeral sprite set is acceptable as art, because it is an icon, not a text role) | 2D Artist |
| Elite | gold | baked 1 px `elite-gold` **outline + a ground ring** (a shape under the actor). Scale stays 1.0 per `style-guide.md` §4.4 / O-ART-1, so the ring is the non-colour cue. | 2D Artist |
| Card type | slate (spells) vs bronze (modifiers) frame material | spells: an **element-shape corner badge**; multicast: the **×n badge**; trigger: **rivet corners + T badge** (`wand-editor-ux.md` §2.2 and its grayscale test). Slate vs bronze alone is luminance 0.174 vs 0.197 (**1.10:1**), invisible in grayscale → objection **O-UX-4**. | 2D Artist |
| Rarity | underline colour | the rarity **word** in the detail pane and reward panels | UX / Dev |
| Warning severity | amber / red | **triangle ⚠ vs octagon ⛔** glyphs | UX / 2D Artist |
| Sustainable vs not | green / amber | **✔ vs ✘** glyphs + text ("8 s of fire") | UX |
| DPS delta up / down | green / red | **▲ / ▼** glyphs + sign | UX |
| HP full / half / empty | red | heart sprite **shape** (full, half-filled, outline) | 0x72 sprites |
| Shield | blue | a **hexagon** silhouette, not a heart | 2D Artist |
| Low mana | bar colour | **hatched** fill | UX / 2D Artist |
| Boss invulnerable | grey | **hatched** fill | UX / 2D Artist |
| Equipped wand | bright frame | badge **raised 4 px** + thicker frame | UX |
| Door room kind / reward kind | icon tint | distinct icon **shapes** (`hud-layout.md` §6) | 2D Artist |
| Toggle on / off | fill colour | **filled + underlined** chip vs outline chip | UX / 2D Artist |
| Affordable / not (shop) | price colour | "Need n more coins" text + disabled style | UX |
| Telegraphs (danger zones) | red | **shape + motion**: the ground circle/line outline itself, peaking in the final 150 ms (mechanic-spec §14); plus the zone's edge drawn as a 1 px dashed keyline that clears 3:1 against both light and dark floor | Animator / 2D Artist |

### 3.1 Projectile and danger-shape legibility minimums (safety, not taste)

Adopted from `style-guide.md` §4.1–§4.2 (it already meets the bar; this section makes the checks falsifiable from the UX side):

- **Enemy bullet rim ≥ 3:1 against the dominant floor tone of every floor theme** (WCAG 1.4.11). The style guide computes arcane `#f78697` 4.5:1 on F1 `#483b3a`, and it is 4.8:1 on F2 `#2f3b47` and 5.6:1 on F3 `#3e2a33`. The dark core is ≈ 1.1:1 by design (the hollow-ring read). Crack pixels (`#775c55` and its variants) are exempt as sub-tile detail.
- **Enemy bullet visual diameter = 2r + 1** (7 / 9 / 13 px), with the hitbox inside the rim. A player is never hit by something that looks like it missed.
- **Enemy bullets draw at depth 62**, above the player ADD band (61), so 200 overlapping player glows can't wash one out (`style-guide.md` §4.1; the Game Developer adds the band).
- **Hurtful ground marks** carry the 1 px `telegraph-rim` `#f78697` and `telegraph-fill`. Player zones never use the pink band.
- **Player projectiles:** long axis ≥ 6 px (the venom dart's 10×3 body is fine). Their read is shape + glow. It is secondary, because the wand preview and HUD already say what the player is casting.
- **High emphasis** (settings) adds a 1 px `#fdf7ed` ring outside the `#222222` outline of every enemy bullet. That keeps ≥ 2.9:1 on even the lightest wall-top `#aa8d7a` (where bullets can overlap wall faces before despawning), for players who need more than the standard read.

---

## §4 Motion, flashing, camera

### 4.1 Reduced motion (effective when the setting is On, or Follow system with the OS preference set)

| Thing | Normal | Reduced motion |
|---|---|---|
| Screen shake (all sources) | × Screen shake % | **0** |
| Camera look-ahead (scrolling rooms) | `lookAheadFrac` / `lookAheadMaxPx` | **0** (the camera centres on the player; `cameraLerp` smoothing stays) |
| Boss intro camera pan | pan over `bossIntroPanMs` | **cut**: a 150 ms fade to the boss framing, hold, a 150 ms fade back |
| Damage numbers | rise 10 px | appear, hold, fade (no motion) |
| HUD fades, toasts, banners | tween / slide | instant alpha steps; no slides |
| Low-HP heart pulse | alpha pulse 1 Hz | static + vignette |
| Prompt, focus and "new" pulses | 2-frame pulses | static outline / thicker frame |
| Room transition | fade `roomFadeMs` | unchanged (a fade is not vestibular motion) |
| Dash afterimages, hit particles, kick | as feel-spec | **unchanged**: they are gameplay feedback local to the actor, not screen motion. Players who need less can lower Flash intensity. |
| Modal panel rise (8 px) | rise + fade | fade only |

### 4.2 Screen-shake ceiling

The feel-spec clamps concurrent shake to `shakeMaxPx` 6 px. The setting only scales down. No UI element shakes (menus and HUD are camera-independent; the HUD scene has its own camera).

### 4.3 Photosensitivity (always on; not a setting)

- **Three-flash rule (WCAG 2.3.1):** no **large-area flash** (a luminance change of ≥ 10% over ≥ 25% of the canvas, i.e. ≥ 57 600 px²) may occur more than **3 times in any 1 s window**. A global flash limiter (Game Developer) drops any 4th large flash in the window.
- **No full-screen white flashes** anywhere. The only full-canvas effect is the low-HP vignette, which fades in (≥ 300 ms) and never strobes.
- Explosion flash sprites are local: the largest radius is `bigExplosionRadiusPx`-class ~56 px (≈ 9 850 px², 4% of the canvas). They can't reach the large-area threshold alone. Fifteen simultaneous would, so the limiter counts **summed** flash area per step.
- Hit-flash on enemies (60 ms fill) and the hurt flash on the player are sprite-local, and `flashIntensity` scales them down to 0.
- Red-flash caution: no saturated-red full-screen tint on hurt (the hurt feedback is the sprite flash + shake + hit-stop + heart loss).

---

## §5 Input and motor

| Need | Provision | Where |
|---|---|---|
| Sustained hold (cast) | **Cast mode: Toggle** | `settings-spec.md` §1.1 |
| Tracking a small hurtbox among many bullets | **Show hitbox** option (the 3×3 pip, `style-guide.md` §4.5) | `settings-spec.md` §1 |
| Precise stick aim | pad aim assist at 100% default (= feel-spec 0.5), adjustable 0–100% | settings (O-UX-2) |
| Rapid pressing | **none required anywhere**. Tap-casting is optional; hold or toggle covers it. There is no mash prompt. | design-wide |
| Simultaneous presses | **none required anywhere** (gameplay or UI). The deferred insert-drag accelerator must stay optional. | `wand-editor-ux.md` §3.4 |
| Holds in UI | **none required**. The only hold (D6 Erase) has a press-twice alternative. | `screen-graph.md` §4 |
| Drag and drop | **click-to-pick / click-to-place** alternative, plus full pad and keyboard focus paths | `wand-editor-ux.md` §3 |
| Remapping | all KB+M gameplay actions rebindable (Esc and mouse aim locked). Pad view-only in v1, with an OS/Steam Input note. | `settings-spec.md` §2 |
| Reaction-time floors | enemy windups ≥ 350 ms (≥ 600 ms for 2-damage, ≥ 450 ms on bosses), aim locks 150 ms before release, cast buffer 120 ms, dash buffer 100 ms (designer data). The UX never adds a timed element on top. | mechanic-spec §12.2 E13 |
| Pause anywhere (WCAG 2.2.2) | Esc / Start at any time in a run; auto-pause on focus loss; every modal pauses the sim; no timed decisions in any menu | scene-flow §3, `screen-graph.md` §0 |
| Pointer target size | every interactive widget ≥ **16×16 internal** (= 32 CSS px at ×2, above WCAG 2.5.8's 24 px); editor cells 36×36; settings rows 18 px tall × full width | all UX specs |
| **Touch targets (v2)** | gameplay buttons DASH/SWAP/USE hit **Ø46** game px (visual 38); PAUSE/EDIT/Back 40×40; every touch-profile row or button ≥ **24** px tall (≥ 25 CSS px at 1.04×, WCAG 2.5.8); primary actions ≥ **37** px. No tap needs precision below the editor's 36 px cells. | `mobile-touch-spec.md` §4–§5 |
| **Touch (v2)** | floating twin sticks (no fixed stick positions to find); **auto-fire** by default, so a player who can only use one thumb can move and still fight (aim override optional); dash direction falls back to the target; left-handed side swap; every drag has a tap-tap alternative (WCAG 2.5.7); release-over-same cancels mistaken taps; the open-guard stops a tap carrying over from one screen into the next | `mobile-touch-spec.md` §3–§6 |
| **Haptics (v2)** | its own setting (Off / Low / High), independent of Reduced motion; never continuous; never in menus except the HUD-button tick | `mobile-touch-spec.md` §8.2 |

---

## §6 Focus visibility and navigation

- **Focus ring:** 1 px light (`text` token) + 1 px dark (`#222222`) outer keyline, offset 1 px outside the control. Each ring colour clears ≥ 3:1 against the other, so the ring is visible on any background. It is never shown by colour change of the control alone.
- Every screen's focus order and pad navigation are defined in `screen-graph.md` §3. Focus never lands on an invisible or off-screen control. Scroll regions scroll the focused item into view with 12 px padding.
- The last-active-device glyph swap (`hud-layout.md` §3.5) applies to every hint.

---

## §7 Audio → visual twins (no information is audio-only)

| Audio cue | Visual twin |
|---|---|
| `enemy_windup` (per attack type) | the telegraph itself (Animator), always visible for the full `windupMs` |
| `low_hp` | heart pulse / static + vignette (`hud-layout.md` §3.4) |
| `sputter` | wand-tip puff + slot-strip slash + mana-frame flash |
| `wand_recharge` | HUD strip brighten + reticle ring completes |
| `wave_spawn` | spawn portals (700 ms) |
| `boss_phase` | boss bar frame flash + "— Phase 2" + projectile clear |
| `shield_break` | hexagon shatter |
| `reaction` ×5 | reaction word on the damage number + first-time toast |
| off-screen threats in scrolling rooms | last-enemy chevrons (`hud-layout.md` §3.3). Stereo panning is never the only locator. |

There is no voice or dialogue, so no subtitles are needed (I11 applies only if VO is added; then subtitles become a requirement here).

---

## §8 Cognitive load

- **The wand program is shown, not simulated in the player's head:** the cast preview, cast brackets and warnings (`wand-editor-ux.md` §5).
- **No timed decisions** in any menu. Drafts, the shop and the editor all pause the run.
- **Consistent `back`** semantics everywhere (`screen-graph.md` §0 rule 3).
- **Plain-language numbers** ("+40% damage", "13 tiles", "0.25 s"), generated from data so they are always true.
- **The Codex** is available from Title and mid-run (Pause) for every discovered card, relic, enemy, reaction and milestone.
- **Short prompts** (≤ 7 words + glyph), one at a time (`ftue-flow.md` §2).

---

## §9 Reviewer checklist (falsifiable; run at Wave 5 on the built game)

1. At a 1366×650 browser viewport, the canvas renders at ≥ ×1.8 effective scale (Auto), and T1 cap height is ≥ 12 CSS px. In fullscreen on 1366×768 it is ×2 (14 CSS px).
2. A pixel-sampled pair of every text-on-panel colour in the built UI is ≥ 4.5:1. Every world-overlaid text has an intact 8-neighbour outline.
3. The §3 grayscale and CVD-simulation screenshots pass for every row.
4. Every enemy bullet frame is a closed-outline, dark-core disc of diameter 2r + 1, with a rim ≥ 3:1 against the dominant floor tone of F1, F2 and F3. No player-owned pixel falls in the hostile band after LUTs (`style-guide.md` §10).
5. A 10-second capture of the densest explosion build (explosive + triple cast on `archmage_scepter`) shows no window with > 3 large-area flashes.
6. With reduced motion On, every row in §4.1's right column holds, and the camera never moves without player movement.
7. Every screen in `screen-graph.md` is completable with (a) keyboard only, (b) gamepad only, (c) mouse only (plus WASD for movement in-run), with no hold and no simultaneous press.
8. Every interactive widget is ≥ 16×16 internal px; every touch-profile target is ≥ 24 px (primary ≥ 37, gameplay buttons Ø46).
9. `grep -rn Tsmall src` returns 0, and no rendered string anywhere has a cap below 7 internal px.
10. At 812×375 emulation, every screen is completable by touch alone (`mobile-touch-spec.md` §13).
