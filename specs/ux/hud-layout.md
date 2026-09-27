# Spellwright — `hud-layout`

**Owner:** UX Designer · **Status:** Wave 2, v1 · **Consumers:** Game Developer (`HudScene`, spatial UI in `RunScene`), 2D Artist (`ui-artwork`: HUD sprites at the sizes below), Animator (state-change `motion-spec` for the listed transitions), Audio Director (paired cues).
**Built on:** `systems.md` §7 (the legibility surface: must-show / must-hide), `mechanic-spec.md` §2–§4 (HP, shield, dash, wand runtime state), `feel-spec.md` (damage-number, shake and camera tunables), `architecture.md` §3 (640×360, integer zoom), §9 (BitmapText only, HUD updates on bus events only), `scene-flow.md` §3 (HUD is non-modal and never takes input).
**Coordinates:** internal canvas px, 640×360, origin top-left, boxes are `(x, y, w, h)`. Text roles T1 / T2 / T-small are defined in `accessibility-spec.md` §2.

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
| H3 | **Relic row** | x = 6 + 18·i, y 22, i < 8 (to x 149); overflow chip "+n" T-small at (150, 27) | relic mini-icon 16×16 | 100% alpha for 3 s after gain or proc, then **50%**. A proc (`on_event` relic fired): that icon flashes to 100% for 600 ms with a 1 px frame (reduced motion: frame only) | C2 | `relic:gained`, relic proc event |
| H4 | **Floor track** | centred on x 320: "F1" T1 right-aligned at x 276, y 6; 10 pips at x = 280 + 9·step, y 8, 7×7 | pip glyphs 7×7 | **pip shape = room kind** of visited steps: start ○, combat ■, elite ◆, treasure ▲, shop ●, boss ☠ (9×9); future steps hollow □; **current** = 9×9 outline around its pip. 100% for 3 s on `room:enter` / `room:cleared`, then 40% | C2 | `room:enter`, `room:cleared` |
| H5 | **Boss bar** (replaces H4 while a boss is active) | name T1 centred at y 4; bar (170, 17, 300, 6): 1 px frame, 298×4 fill | 9-slice bar from `ui-artwork` | phase-threshold **ticks** (1×8 px, white with a dark outline) at each `untilHpFrac`. Damage shows as a lighter "chip" segment that drains to the fill 400 ms after the last hit (reduced motion: instant). Phase change: the bar's frame flashes 2 frames and the name line gains "— Phase 2" for 2 s. Invulnerable windows: the fill gets a hatch pattern (not just grey) | C1 | `boss:phase`, boss hp |
| H6 | **Coins** | number T1 right-aligned to x 634, y 6; coin icon 8×8, 2 px left of the number | coin 8×8 | +n: the number steps up (no roll-up count, which would be per-frame `setText`); the icon bobs 1 px for 120 ms (reduced motion: none). 100% for 2 s after a change, then 70% | C2 | `player:gold` |
| H7 | **Bag fill** | "n/12" T1 right-aligned to x 634, y 20; bag icon 8×8 left of it | bag 8×8 | < 11: plain · 11: ⚠ icon added · 12: text becomes "FULL" plus ⛔ | C2 | card gained / removed |
| H8 | **Wand badges** | 20×20 at x = 6 + 22·i, y 334 (i < wandSlots, max 4); the **equipped** badge is raised to y 330 with a 2 px bright frame | wand mini-icon 16×16 in a 20×20 frame | **Equipped**: raised plus a thick frame (position and shape, not colour). Each badge: a recharge overlay (dark 50% fill rising bottom-up in proportion to that wand's remaining recharge) and a mana line (1 px at inner y 351, width ∝ mana fraction). Key glyph (KB: "1"/"2"/"3" T-small in the badge's top-left; pad: "◂Y" / "RB▸" 8 px glyphs at y 322 over the first and last badges) | C1 (equipped) / C2 (others) | `wand:changed`, `wand:recharge`, coalesced `player:mana` |
| H9 | **Toggle-cast indicator** | "AUTO" T-small chip at (76, 316) | text chip | shown only while toggle-cast is latched on (`settings-spec.md`) | C1 when present | input state |
| H10 | **Slot strip** (active wand's program) | cells 18×18 at x = 76 + 19·i, y 324, i < capacity (cap 10 → x 76–265). With 4 wand badges, the strip starts at x 98 | card mini-icon 16×16 + 1 px frame; frame material + type badge per card type (`wand-editor-ux.md` §2.2) | **Drawn this cycle** → 40% alpha. **Next to draw** → 1 px bright frame + chevron (H11). **Skipped for mana** → slash overlay for 250 ms (the `sputter` twin). **Always-cast** → lock-badged cell before slot 1. **Empty wand** → the strip shows one dashed cell and "no spells" T-small | C1 | `wand:cast` (drawn indices), `wand:recharge`, `wand:changed` |
| H11 | **Next-card chevron** | 5×3 px under the next cell, y 343 | glyph | moves on each cast. Hidden during recharge (H12 uses the same row) | C1 | `wand:cast` |
| H12 | **Recharge bar** | (76, 343, 19·cap − 1, 2) | 2 px bar | fills left → right over the effective recharge; the strip cells stay at 40%. On completion: the chevron returns to cell 1 and the strip does a 1-frame brighten (reduced motion: no brighten). **Mutually exclusive with H11** (same row, the state decides) | C1 | `wand:recharge` start/end |
| H13 | **Mana bar** | frame (76, 348, 120, 6), fill 118×4; the value "42" in T-small at (199, 348) | 3-slice bar | fill ∝ mana/max. **Sputter** (skip): the frame flashes 90 ms (`sputterFlashMs`, flash-scaled) and the skipped cell gets its slash (H10). Low (< the cost of the next card): the fill is **hatched**, not just recoloured | C1 | coalesced `player:mana` (≤ 1 per step) |
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

Every glyph in the HUD (H8 keys, prompts, toasts that name inputs) swaps on the `input:device` event (architecture §8). Keycaps are 12×12 with a T-small or T1 legend. Pad glyphs are the Standard-mapping face positions (A / B / X / Y drawn as **position diamonds with a letter**, so a player on a non-Xbox pad reads the position, not a colour). **Prompt families (kbm / Xbox / PlayStation), the glyph table and the 12 px size contract are in `controller-prompts.md`**, which supersedes the pad-legend details here.

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
