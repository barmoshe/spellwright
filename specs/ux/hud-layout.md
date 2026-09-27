# Spellwright — `hud-layout`

**Owner:** UX Designer · **Status:** Wave 2, v1 · **Consumers:** Game Developer (`HudScene`, spatial UI in `RunScene`), 2D Artist (`ui-artwork`: HUD sprites at the sizes below), Animator (state-change `motion-spec` for the listed transitions), Audio Director (paired cues).
**Built on:** `systems.md` §7 (the legibility surface: must-show / must-hide), `mechanic-spec.md` §2–§4 (HP, shield, dash, wand runtime state), `feel-spec.md` (damage-number, shake and camera tunables), `architecture.md` §3 (640×360, integer zoom), §9 (BitmapText only, HUD updates on bus events only), `scene-flow.md` §3 (HUD is non-modal and never takes input).
**Coordinates:** internal canvas px, 640×360, origin top-left, boxes are `(x, y, w, h)`. Text roles T1 / T2 are defined in `accessibility-spec.md` §2 (v2: T-small removed; T1 is the minimum).

---

## §1 Principles

1. **Four corners plus one top-centre strip; the centre is sacred.** No persistent HUD element enters the **play-field core** `(100, 44, 440, 268)`. Only spatial, event-driven elements appear there (damage numbers, prompts, the reticle).
2. **Persistent HUD area ≤ 10% of the canvas.** Measured in §2.2: **8.1%**.
3. **Criticality decides salience.** C1 elements are always at 100% alpha. C2 elements fade when unchanged. C3 elements exist only on events (§4).
4. **Eyes-on-the-reticle information is spatial.** Recharge and dash readiness are needed *during* dodging, when the player looks at the character and the reticle, not the corners. They get spatial twins (§3.3). The corner HUD holds the precise version.
5. **Nothing is colour-only** (`accessibility-spec.md` §3): every state change below also changes shape, fill, alpha, or text.
6. **The HUD never takes input** (scene-flow §3). No hover tooltips: the mouse is the aim, so hover popups would fire constantly while aiming. Everything readable-on-demand lives in Pause (relics → S3r, wands → S3). *This replaces the "relic icons (hover or long-press for text)" line in `systems.md` §7. Relic text is shown on pickup (toast, §5) and in Pause → Relics.*

---

## §2 Layout

```text
0,0 ┌────────────────────────────────────────────────────────────────────────────────────────┐ 640
    │ ♥♥♥⬡                          F1 ▪▪▪◘▫▫▫▫▫☠                              ◉ 127        │ y 6
    │ [r][r][r][r]                                                            ▣ 5/12       │ y 20–38
    │                                                                                       │
    │            ┌─────────────── play-field core (100,44)–(540,312): no persistent HUD ──┐ │
    │            │                                                                         │ │
    │            │                      damage numbers · prompts · reticle ⊕               │ │
    │            │                                                                         │ │
    │            └─────────────────────────────────────────────────────────────────────────┘ │
    │           AUTO                                                   ┌─toast────────────┐ │ y 300
    │  ┌┐       [s][s][s][s][s][s]                                     │ ✦ Melt! Fire on   │ │
    │ [1][2][3] ▲ (next-card chevron / recharge bar)                   │ frozen: ×2 damage │ │
    │           ▬▬▬▬▬▬▬▬▬▬▬ 42                                         └───────────────────┘ │ y 354
360 └────────────────────────────────────────────────────────────────────────────────────────┘
```

### 2.1 Element table (normative)

| # | Element | Box / anchor | Asset & size | States (non-colour cue listed first) | Crit. | Update source (bus, scene-flow §5) |
|---|---|---|---|---|---|---|
| H1 | **Hearts** | x = 6 + 14·i, y 6; i < ⌈maxHp/2⌉ (max 6 → x 6–89) | `ui_heart_{full,half,empty}` 13×12 (0x72) | full / half / empty sprite shape. Hurt: the lost heart does a 2-frame white fill-flash (scaled by the flash setting). **Low HP** (HP ≤ 2): the remaining heart alpha-pulses 100↔55% at 1 Hz (reduced motion: static, plus the low-HP vignette, §3.4) | C1 | `player:hp` |
| H2 | **Shield pip** | after the last heart, +2 px gap, y 6 | ward icon 13×12, **hexagon** silhouette (not a heart) | present / absent. Break: a 3-frame shatter (reduced motion: disappears) | C1 | `player:hp` (shield field) |
| H3 | **Relic row** | x = 6 + 18·i, y 22, i < 8 (to x 149); overflow "+n" T1 at (150, 24) (v2: T-small removed, §9.5) | relic mini-icon 16×16 | 100% alpha for 3 s after gain or proc, then **50%**. A proc (`on_event` relic fired): that icon flashes to 100% for 600 ms with a 1 px frame (reduced motion: frame only) | C2 | `relic:gained`, relic proc event |
| H4 | **Floor track** | centred on x 320: "F1" T1 right-aligned at x 276, y 6; 10 pips at x = 280 + 9·step, y 8, 7×7 | pip glyphs 7×7 | **pip shape = room kind** of visited steps: start ○, combat ■, elite ◆, treasure ▲, shop ●, boss ☠ (9×9); future steps hollow □; **current** = 9×9 outline around its pip. 100% for 3 s on `room:enter` / `room:cleared`, then 40% | C2 | `room:enter`, `room:cleared` |
| H5 | **Boss bar** (replaces H4 while a boss is active) | name T1 centred at y 4; bar (170, 17, 300, 6): 1 px frame, 298×4 fill | 9-slice bar from `ui-artwork` | phase-threshold **ticks** (1×8 px, white with a dark outline) at each `untilHpFrac`. Damage shows as a lighter "chip" segment that drains to the fill 400 ms after the last hit (reduced motion: instant). Phase change: the bar's frame flashes 2 frames and the name line gains "— Phase 2" for 2 s. Invulnerable windows: the fill gets a hatch pattern (not just grey) | C1 | `boss:phase`, boss hp |
| H6 | **Coins** | number T1 right-aligned to x 634, y 6; coin icon 8×8, 2 px left of the number | coin 8×8 | +n: the number steps up (no roll-up count, which would be per-frame `setText`); the icon bobs 1 px for 120 ms (reduced motion: none). 100% for 2 s after a change, then 70% | C2 | `player:gold` |
| H7 | **Bag fill** | "n/12" T1 right-aligned to x 634, y 20; bag icon 8×8 left of it | bag 8×8 | < 11: plain · 11: ⚠ icon added · 12: text becomes "FULL" plus ⛔ | C2 | card gained / removed |
| H8 | **Wand badges** | 20×20 at x = 6 + 22·i, y 334 (i < wandSlots, max 4); the **equipped** badge is raised to y 330 with a 2 px bright frame | wand mini-icon 16×16 in a 20×20 frame | **Equipped**: raised plus a thick frame (position and shape, not colour). Each badge: a recharge overlay (dark 50% fill rising bottom-up in proportion to that wand's remaining recharge) and a mana line (1 px at inner y 351, width ∝ mana fraction). Key glyph (v2: KB digits **dropped**, order = 1, 2, 3; pad: "◂Y" / "RB▸" in T1 at y 318 over the first and last badges, §9.5) | C1 (equipped) / C2 (others) | `wand:changed`, `wand:recharge`, coalesced `player:mana` |
| H9 | **Toggle-cast indicator** | "AUTO" T1 chip at (76, 312) (v2, §9.5) | text chip | shown only while toggle-cast is latched on (`settings-spec.md`) | C1 when present | input state |
| H10 | **Slot strip** (active wand's program) | cells 18×18 at x = 76 + 19·i, y 324, i < capacity (cap 10 → x 76–265). With 4 wand badges, the strip starts at x 98 | card mini-icon 16×16 + 1 px frame; frame material + type badge per card type (`wand-editor-ux.md` §2.2) | **Drawn this cycle** → 40% alpha. **Next to draw** → 1 px bright frame + chevron (H11). **Skipped for mana** → slash overlay for 250 ms (the `sputter` twin). **Always-cast** → lock-badged cell before slot 1. **Empty wand** → the strip shows one dashed cell and "no spells" T1 | C1 | `wand:cast` (drawn indices), `wand:recharge`, `wand:changed` |
| H11 | **Next-card chevron** | 5×3 px under the next cell, y 343 | glyph | moves on each cast. Hidden during recharge (H12 uses the same row) | C1 | `wand:cast` |
| H12 | **Recharge bar** | (76, 343, 19·cap − 1, 2) | 2 px bar | fills left → right over the effective recharge; the strip cells stay at 40%. On completion: the chevron returns to cell 1 and the strip does a 1-frame brighten (reduced motion: no brighten). **Mutually exclusive with H11** (same row, the state decides) | C1 | `wand:recharge` start/end |
| H13 | **Mana bar** | frame (76, 348, 120, 6), fill 118×4; the value "42" in T1 at (199, 344) (v2, §9.5) | 3-slice bar | fill ∝ mana/max. **Sputter** (skip): the frame flashes 90 ms (`sputterFlashMs`, flash-scaled) and the skipped cell gets its slash (H10). Low (< the cost of the next card): the fill is **hatched**, not just recoloured | C1 | coalesced `player:mana` (≤ 1 per step) |
| H14 | **Toasts** | right-aligned column (434, 300, 200, 54), stacking upward from y 354; max 2 visible, newer at the bottom, FIFO queue | panel 9-slice, 16 px icon + T1 (≤ 2 lines) | 3 s + 1 s per extra line; frozen while any modal is open. Reduced motion: fade only, no slide | C3 | §5 |
| H15 | **Centre banners** | centred, y 70–96, no backing panel, 1 px dark text outline | T2 (floor title: T1 at ×2 integer scale) | "Room cleared" 1.2 s · floor title card "Floor 2 — The Drowned Halls" 1.8 s · boss name card during the `bossActivateDelayMs` 1200 ms. Never shown during active combat (queued until the room clears) | C3 | `room:cleared`, floor enter, boss intro |

### 2.2 Area budget (principle 2)

| Cluster | Box | px² |
|---|---|---|
| Top-left (H1–H3) | (6, 6, 144, 34) | 4 896 |
| Top-centre (H4, or H5 during a boss: (170, 4, 300, 20) = 6 000) | (262, 6, 110, 12) | 1 320 |
| Top-right (H6–H7) | (560, 6, 74, 24) | 1 776 |
| Bottom-left (H8–H13) | (6, 314, 264, 40) | 10 560 |
| **Total persistent** | | **18 552 = 8.1%** of 230 400 (boss fights: 10.2%, tolerated for the duration of the fight only) |

### 2.3 Play-field obstruction audit (every room size in `rooms.json`, centred camera)

| Room size (tiles) | Room rect | Floor interior rect | HUD ∩ interior |
|---|---|---|---|
| ≤ 32×18 (all small/medium combat, elite 30×18, tutorial rooms, vault, shop, landing, sanctum) | ≤ (64, 36, 512, 288) | ≤ (80, 52, 480, 256) | **0 px²** |
| 34×20 (`arena_ossuary`) | (48, 20, 544, 320) | (64, 36, 512, 288) | TL 86×4 + BL 206×10 = **2 404 px² (1.3%)** |
| 36×22 / 40×22 (`arena_mire`, `arena_lich`, `great_hall`, `ring_pit`, `ruins`) | (32, 4, 576, 352) / (0, 4, 640, 352) | (48, 20, 544, 320) / (16, 20, 608, 320) | TL 102×20 + BL 222×26 = **7 812 px² (≤ 4.5%)**, entirely along the outermost floor row of two corners |
| Scrolling (`long_gallery` 48×20, `catacombs` 44×26) | camera-follow | — | variable; the occlusion fade (§3.2) applies |

### 2.4 Safe margins

- **6 px** from every canvas edge for all HUD content. The canvas is always fully visible (integer zoom or FIT, `architecture.md` §3), so no overscan margin is needed. 6 px is the visual breathing room from the letterbox edge.
- **Clamping:** spatial UI (prompts, damage numbers, door labels) clamps its box to `(6, 44, 628, 262)`, so it never collides with the corner clusters.

---

## §3 Behaviour rules

### 3.1 Peripheral fade (C2)

| Element | Rest alpha | Wakes to 100% on | Hold |
|---|---|---|---|
| H3 relics | 50% | gain, proc | 3 s |
| H4 floor track | 40% | room enter / clear, Pause close | 3 s |
| H6/H7 coins, bag | 70% | value change | 2 s |
| H8 inactive badges | 70% | own recharge end, wand switch | 1 s |

Alpha transitions: 150 ms linear (reduced motion: instant).

### 3.2 Occlusion fade (all clusters)

When the **player's body**, any **hostile projectile**, or any **telegraph shape** intersects a cluster's box expanded by 4 px, that cluster fades to **30%** within 100 ms and returns 300 ms after the overlap clears (reduced motion: instant steps). The check runs on the sim step with the spatial hash already built (architecture §4) against 4 static rects; it costs nothing extra per projectile. This is what makes the large-room obstruction in §2.3 acceptable.

### 3.3 Spatial twins (principle 4)

| Twin | Of | Spec |
|---|---|---|
| **Reticle** (KB+M) | aim | 9×9 crosshair, 1 px light stroke with a 1 px dark outline, centre hotspot. It replaces the OS cursor on the canvas while the run is unpaused (`cursor: none`); the OS cursor returns in every modal. |
| **Aim pip** (pad) | aim | a 5×5 diamond at player + aim × 40 px, same stroke rules. It is always drawn on pad because there is no cursor. |
| **Recharge ring** | H12 | a 13×13 px 1 px ring around the reticle (pad: around the aim pip), filling clockwise over the active wand's recharge. Hidden when not recharging. |
| **Dash readiness** | dash charges | a 12×2 px bar centred 4 px below the player's feet, split into one segment per charge. Visible **only while a charge is refilling**, so there is zero noise at rest. (This replaces the "dash charges (refilling ring)" HUD element in `systems.md` §7. With 1 base charge a corner pip is noise; the eyes are on the character when a dash matters.) |
| **Elite HP** | elite enemies | a 16×2 px bar 3 px above the sprite, shown after the first damage taken. Normal enemies have none (the flash and knockback carry the hit). |
| **Last-enemy chevrons** | room clear | when ≤ 2 enemies are alive and one is off-screen (scrolling rooms), an 8×8 chevron sits at the screen edge (inside the §2.4 clamp) pointing at it. This prevents the "hunt the last bat" frustration. |

### 3.4 Low HP (HP ≤ 2)

H1 pulse (§2.1) plus the **single allowed camera-level filter** (architecture §9): `Vignette` at 30% strength, dark red. Reduced motion: no pulse, and the vignette stays static. The Audio Director's `low_hp` cue fires on entry (it is not a loop, so it doesn't mask gameplay SFX).

### 3.5 Device glyph swap

Every glyph in the HUD (H8 keys, prompts, toasts that name inputs) swaps on the `input:device` event (architecture §8). Keycaps are 12 px tall with a T1 legend (v2: T-small removed). Pad glyphs are the Standard-mapping face positions (A / B / X / Y drawn as **position diamonds with a letter**, so a player on a non-Xbox pad reads the position, not a colour). **Prompt families (kbm / Xbox / PlayStation), the glyph table and the 12 px size contract are in `controller-prompts.md`**, which supersedes the pad-legend details here.

---

## §4 Damage numbers policy

| Rule | Value |
|---|---|
| Default | **On** (Settings → Gameplay → Damage numbers) |
| Font | T1 (cap 7 px), white with a 1 px dark outline (contrast is carried by the outline, `accessibility-spec.md` §2) |
| Shown for | direct hits, explosions, chains, zaps, reaction damage. **Not** for status ticks (burn, poison): the enemy's status overlay carries that information, and per-tick numbers at 10 stacks would double the number count for no decision value. **Not** for damage the player takes (hearts show it). |
| **Aggregation** | per enemy: hits within **200 ms** of the last shown number on that enemy add into it (the number updates and restarts its rise). This bounds a 20 hit/s wand to ≤ 5 numbers/s per enemy. |
| Cap | **24** live numbers; a new one replaces the oldest. |
| Crit | **integer ×2 scale** (see objection O-UX-3; the current `critNumberScale` 1.5 isn't integer), a trailing "!" glyph, and yellow. Shape and suffix carry it before the colour does. |
| Reaction | the first time per profile, the number is preceded by the reaction word ("MELT 14"), then the codex toast (§5). Afterwards only the number, in the reaction's tint. |
| Motion | rises `damageNumberRisePx` 10 over `damageNumberRiseMs` 450 (feel-spec), then fades over its last 150 ms. **Reduced motion:** no rise; appear, hold 450 ms, fade. |
| Value | `ceil(dmg)` (mechanic-spec §8.1). |
| Position | the enemy's head (sprite top − 2 px), jittered ±3 px x from the `fx` stream (cosmetic stream, architecture §5.3), clamped per §2.4. |

---

## §5 Toasts (H14) — what earns one

| Event | Toast text (i18n key) | Icon | Once? |
|---|---|---|---|
| Relic gained | "{name} — {effect line}" | relic 16 px | every time |
| Card to the bag outside a draft (shop purchase, treasure bonus card) | "{name} added to bag · [Tab] Edit wands" | card 16 px | every time |
| First application of each status (`ftue-flow.md` P5) | "Burning — fire damage over time" etc. | status glyph | once per profile, per status |
| First trigger of each reaction (content-inventory §1.2) | "Melt! Fire on frozen: ×2 damage" | reaction glyph | once per profile, per reaction (+ codex) |
| Milestone reached mid-run | "Unlocked on run end: {milestone}" | star | per milestone |
| Bag full on an attempted pickup | "Bag full — salvage a card in the wand editor [Tab]" | ⛔ | rate-limited to 1 per 10 s |

Toasts never announce things the player just did deliberately (e.g. "Wand switched"). The badge (H8) already shows that.

---

## §6 In-world UI (spatial, event-driven)

| Element | Trigger | Placement | Content |
|---|---|---|---|
| **Door choice icons** | doors open (`room:cleared`) | 20 px above each door's frame top, persistent until the room is left | two 16 px icons: room kind (same shape family as H4) + reward kind (spell ● / modifier ◈ / relic ◇ / wand ⟋ / coins ◉ / heal ✚) |
| **Door label** | player within 48 px of a door | panel above the icons | T1: "Elite · Relic (1 of 2)", "Treasure · Wand", "Combat · Heal +2". The first approach per profile adds a line (`ftue-flow.md` P6). |
| **Interact prompt** | nearest interactable within `interactRadius` (20 px) | 6 px above the object, clamped | keycap/pad glyph + verb, T1: "Take", "Look", "Shop", "Enter". Only the nearest interactable shows a prompt. |
| **Pedestal preview** | reward pedestal within 48 px | above the pedestal | "Modifier draft · 3 choices". An untaken pedestal emits a 1 px glint every **2.5 s**, with a random phase per pedestal from the `fx` stream (Animator objection accepted: object-and-environmental-animation caps pickup glints at one per 2–4 s so pickups never outrank hazards). Reduced motion: a static glint pixel |
| **FTUE verb prompts** | `ftue-flow.md` | 28 px above the player's head, clamped | glyph + T1 verb, panel-backed |

---

## §7 Seams

- **2D Artist (`ui-artwork`) must deliver these HUD-scale assets** (not in any downloaded pack at these sizes, `asset-inventory.md` §3 row 5 and §4.4): **16×16 mini-icons for all 43 cards** (slate/bronze/riveted frames + the §2.2 type badges of `wand-editor-ux.md`), **all 26 relics**, and **all 10 wands**; 7×7 floor-track pips (6 shapes); 8×8 coin and bag icons; a 13×12 hexagon shield; 12×12 keycap and pad-position glyphs; ⚠ ⛔ ✔ ✘ ↻ ↩ → ▲ ▼ ✋ ↯ as 7–9 px icons (the fonts are Latin-1 only). The 34 px 7Soul1 icons can't be halved to 16 px by nearest-neighbour without losing their read. This is an art pass, not a resample.
- **Game Developer:** HUD updates only on the listed bus events (architecture §9). The per-cast drawn-index list must ride on `wand:cast` (payload `{wandIndex, drawnSlotIndices, skippedSlotIndices}`) so H10 needs no per-frame polling. The occlusion test (§3.2) runs in the sim step.
- **Animator:** motion for H1 lost-heart flash, H2 shatter, H5 chip drain, H12 completion brighten, H14 toast in/out, H15 banners. Every item has a documented reduced-motion fallback above.
- **Audio Director:** paired moments: `low_hp` (entry), `wand_recharge` (H12 completion), `sputter` (H13 flash), `room_clear` (H15), relic proc (H3; optional, quiet).

---

## §8 DOG self-check (`hud-design`)

- **Glanceable, and nothing more:** C1 is limited to hearts, shield, the equipped wand's strip/chevron/recharge/mana, the boss bar and toggle-cast; everything else fades (§3.1). ✔
- **Diegetic vs non-diegetic justified per element:** §2.1 and §3.3. Precise counts (HP, mana, program) are non-diegetic; readiness needed mid-dodge is spatial; telegraphs and statuses are diegetic (Animator/Artist). ✔
- **Survives the smallest viewport:** 640×360 *is* the smallest internal canvas. At the minimum effective scale ×2 (objection O-UX-1), T1 text is 14 CSS px cap height. ✔
- **Doesn't obscure the play field:** 0 px² in ≤ 32×18 rooms, ≤ 4.5% of the outer floor row in 36–40-wide rooms, plus the occlusion fade (§2.3, §3.2). ✔

---

## §9 v2: the layout as one reflowable object, and the touch profile

**Status:** v2 Wave A1. It **supersedes** the hard-coded constants in §2.1 for implementation: every position in §2.1 becomes the `desktop` profile of the function below. The touch controls themselves are specified in `mobile-touch-spec.md`.

### 9.1 One object: `layoutFor(profile, S)`

`src/ui/hudLayout.js` exports a **pure** function `layoutFor(profile ∈ {desktop, touch}, S = {l, t, r, b} safe rect in game px, opts = {stickSide, wandCount, capacity})`. It returns **every** HUD rect by name: `hearts`, `shield`, `relics`, `track`, `bossBar`, `bossName`, `coins`, `bag`, `badges[]`, `strip`, `chevronRow`, `mana`, `manaText`, `counters`, `auto`, `toast`, `banner`, `clusters{…}` (for the occlusion fade), `buttons{dash, swap, use, pause, edit}` (hit and visual), and `zones{move, aim}`.
- `HudScene` and `TouchSticks` read **only** this object. No other file holds a HUD coordinate.
- **Rebuild** on `EV.DISPLAY_CHANGED` (a resize, rotation or safe-inset change), on a profile switch (`mobile-touch-spec.md` §5.1), on wand count or capacity changes, and on a `touchStickSide` change. A rebuild re-positions existing display objects; it never re-creates them. Pooled state (fades, timers) is kept.
- **Desktop profile:** `S` is always the full canvas (no insets on desktop), and it returns exactly the §2.1 numbers (with the §9.5 text promotions).

### 9.2 Touch profile positions (game px; `sl, st` = S.left/top, `sr = 640 − sR`, `sb = 360 − sB`)

Profile A = `S (0,0,640,360)`. Profile B = `S (0,0,640,340)` (notched iPhones, `mobile-touch-spec.md` §1). **All persistent HUD moves into a top band `y ∈ [st, st + 54)`**, because the bottom corners belong to the thumbs.

| Element | Touch position (formula) | Profile A | Profile B | Change from desktop |
|---|---|---|---|---|
| H1 hearts | `(sl + 6 + 14i, st + 6)` | (6 + 14i, 6) | same | unchanged |
| H2 shield | after the last heart, +2 px | — | — | unchanged |
| H8 wand badges (display only; SWAP is the input) | `(sl + 6 + 22i, st + 26)` 20×20; the equipped badge is raised to `st + 22` | (6, 26)… | same | moved from bottom-left to the top band |
| H10 slot strip | `x = sl + 76 + 19i` (or `+ 98` with 4 wands), `y = st + 24`, cells 18×18 | 76–265, y 24–41 | same | moved |
| H11/H12 chevron / recharge row | `y = st + 43`, 2–3 px | y 43 | same | moved |
| H13 mana bar | `(sl + 76, st + 46, 120, 6)`; value T1 at `(sl + 199, st + 42)` | (76, 46) | same | moved; value promoted to T1 |
| **Counter pips** (new, §9.3) | `x = sl + 224 + 9k` (k < 3), `y = st + 46`, 7×7 | 224, 233, 242 | same | new |
| H4 floor track | label T1 right-aligned at `x = 352`; pips `x = 356 + 9·step`, `y = st + 8` | 356–447 | same | moved right (clears the strip) |
| H5 boss bar | name T1 centred at `x = 398`, `y = st + 4`; bar `(300, st + 19, 196, 6)`. **Mini-boss:** × `rules.boss.miniBossBarScale` 0.6 → `(339, st + 19, 118, 6)` | x 300–496 | same | narrower (clears the bag and relics) |
| **Mode badge** (new) | T1, right-aligned at `x = 334`, `y = st + 6`: "Heat 3" · "Gentle +2♥ 10%" · "Daily". Hidden while a boss bar shows. C2 (fades to 40% like the track). | 257–334 | same | new |
| H6 coins | T1 right-aligned to `x = sr − 100`, `y = st + 6` | right edge 540 | same | moved left of the buttons |
| H7 bag | right-aligned to `sr − 100`, `y = st + 20` | 540 | same | moved |
| H3 relics | right-aligned row ending at `sr − 100`, `y = st + 34`, 16×16, pitch 18, **max 5**, then "+n" T1 to their left | 452–540 | same | fewer visible (Pause → Relics lists all) |
| PAUSE / EDIT buttons | `mobile-touch-spec.md` §4.1 | 600–640 / 556–596 × 0–40 | same | new |
| DASH / SWAP / USE | `mobile-touch-spec.md` §4.1 | (610,330) / (610,280) / (560,330) | (610,310) / (610,260) / (560,310) | new |
| H9 AUTO chip | not shown (toggle-cast doesn't apply on touch) | — | — | hidden |
| H14 toasts | centred on x 320, top `st + 56`, max width 280 (180–460), **1 visible** | y 56–84 | same | moved from bottom-right (DASH lives there) |
| H15 banners | centred, `y = st + 100 … st + 126` | 100–126 | same | moved down (clears toasts) |
| Move / aim zones | `x < 320` / `x ≥ 320`, `y ≥ st + 54`, extended into the letterbox; aim minus the button hit rects + 4 px | — | — | new |

**Band audit:** the top band holds TL (x 6–288), TC (x 300–496) and TR (x 452–640, rows staggered). The relics' y 34–50 and the boss bar's y 19–25 don't intersect. The bag's x 506–540 at y 20–32 and the bar's x ≤ 496 don't intersect. Band area ≈ 640 × 54 = 34 560 px² (15%). It sits over the top wall rows in every room ≤ 32×18, and the occlusion fade (§3.2) covers larger rooms.

**Desktop additions:** mode badge T1 right-aligned at `(258, 6)`, hidden during boss fights. **Mini-boss bar** desktop: `(230, 17, 180, 6)` (300 × 0.6, centred on 320). Both join the `tc` occlusion cluster.

### 9.3 Counter pips (new, for the v2 defence/keyword system; both profiles)

- **What:** one 7×7 pip per **defence type present in the room**: `shield` (broken by **pierce**; directional, it blocks from its front 150°), `armour` (**blast**), `ward` (**shock**) (`rules.defences` / `rules.keywords.defenceBreaking`). Each pip uses the art's defence-icon shape. **Filled** with a `#fdf7ed` rim = the equipped wand's program produces the counter keyword (from the same dry-run as the editor's Enables chips, `wand-editor-ux.md` §11). **Hollow** at α 0.5 = it doesn't.
- **When:** only while ≥ 1 living enemy with that defence is in the room (C1 while shown). This way the pip row is quiet 90% of the time and pops when it matters.
- **Desktop position:** `x = 222 + 9k`, `y = 347` (right of the promoted mana value). The SWAP button (touch) shows the *next* wand's pips under its icon, so switching to the counter wand is one glance and one press.
- **Non-colour:** shape = defence type; fill vs hollow = countered. No hue is load-bearing.

### 9.4 Validator and debug overlay (DOG 3 of `mobile-touch-spec.md`)

`layoutFor` runs `validateLayout(L)` on every rebuild in `?debug`, and once at boot in all builds, logging only. It asserts:
(a) every rect lies inside `S` (buttons and HUD) or inside the viewport (zones);
(b) no two **interactive** rects intersect;
(c) no **persistent** HUD rect intersects `zones.move` or `zones.aim`;
(d) C3 transients (toast, banner) lie only in the zones' top strip `y < st + 130`, where thumbs don't rest;
(e) every touch hit rect is ≥ 37 px on its smaller side (DASH/SWAP/USE 46, PAUSE/EDIT 40).
A failed assertion prints the pair of rect names. `?debug` + **F4** draws every rect as a 1 px outline, with interactive rects dashed.

### 9.5 Text promotions in the HUD (the `Tsmall` role is removed; `accessibility-spec.md` §2.3)

H3 "+n" → T1 · H8 key digits → **dropped** (left-to-right order is 1, 2, 3; the Controls table lists the keys) · H8 pad shoulder glyphs → T1 at `y = 318` (desktop) · H9 "AUTO" → T1 at `(76, 312)` · H10 "no spells" → T1 · H13 mana value → T1 at `(199, 344)` desktop / `(sl + 199, st + 42)` touch. Area budget (§2.2) is recomputed: bottom-left cluster `(6, 312, 264, 42)` = 11 088 px²; total persistent **8.3%** on desktop.

### 9.6 v2 in-world additions (§6 rows)

| Element | Trigger | Placement | Content |
|---|---|---|---|
| **Door threat icon** | doors open | a **third** 16 px icon after room kind and reward kind | the defence or threat shape of the room behind the door (`design-v2.md` door `threat`). The door label (on approach) adds a line: "Threat: Shielded — needs PIERCE". "Unknown" is shown as `?` when the design hides it. |
| **Mini-boss intro card** | a mini-boss activates (`tier: "mini"`) | centred, `y 60–110`; letterbox bars 16 px top and bottom slide in over 200 ms (reduced motion: they appear) during the activation delay | T2 name + T1 epithet + the adapt banner (T1) if a rule applied at activation (see the Adapt banner row). The HUD is dimmed to 40% for the card's duration. |
| **Phase banner** | `boss:phase` (boss or mini-boss) | directly under the boss bar (desktop `y 26–38`; touch `st + 28 … st + 40`) | T1 "Phase 2", with the phase's new-attack name in T1 dim, for 1.5 s. The bar's frame flashes (flash-scaled). |
| **Risk door** (`rules.risk`, max 1 per run) | doors open | a 16 px **risk** icon (the `door.risk` art) replaces the threat icon | the label adds "Risk: +1 elite · reward: choose 1 of 2 relics" (from `rules.risk`) |
| **Twist banner** (`rules.twists`: ambush, dark) | on room entry, before wave 0 | the H15 banner slot | T1 "Ambush!" / "Darkness" + a one-line consequence ("Enemies spawn around you" / "Your light shows 4 tiles"). Once per room. Doors don't reveal twists unless the Designer's data says so. |
| **Elite affix nameplate** (`data/affixes.json`) | an elite spawns | 3 px above the sprite | the **affix glyph** (7×7; `shield-plate`, `ward-rune`, `tower-shield`, `wing`, `burst`) stays **persistently** (with 2 affixes, two glyphs side by side). The **title** (T1, e.g. "Armoured") shows for 1.5 s on spawn and again for 1.5 s the first time the player hits it. It pairs with the Artist's outline key, so the glyph + title make it never colour-only (affixes.json `$comment`). |
| **Adapt banner** (`bosses.json` `adapt[].bannerKey`) | a boss or mini-boss applies an adapt rule (≤ 1, `rules.boss.adaptMaxRulesApplied`) | the intro card's third line, or (for a mid-fight adapt) the phase-banner slot | T1, e.g. "The Warden's shield weakens" (a mercy rule) or "Resists fire" (a build-reading rule). This is the "reads your build" moment, so it is **always shown**, never hint-gated. |
| **"BLOCKED" / "ARMOURED" / "WARDED" numbers** | a player hit is fully blocked, reduced, or absorbed by a defence | replaces the damage number | T1 word + the 7×7 defence icon, grey `#b6cbcf`, aggregated per enemy per **500 ms**, so shield spam never floods the screen. With a counter, the break shows "BROKEN" + icon, once. |
