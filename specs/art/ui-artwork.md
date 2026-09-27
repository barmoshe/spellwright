# Spellwright — `ui-artwork`

**Owner:** 2D Artist · **Status:** Wave 2, v1 · **Consumers:** UX Designer (layout already fixed in `hud-layout.md`, `wand-editor-ux.md`, `accessibility-spec.md` — this file supplies the *pixels* for those boxes), Technical Artist (UI atlas + font atlas), Game Developer (`src/ui/*`), Animator (UI motion keys).
**Sources:** authored `assets/src/art/spellwright_ui.png` (+ `.json` frame rects; `scripts/author-ui-art.py`), `assets/src/art/icons16.png` (+ `.json`, `by_id` lookup such as `spells.fire_bolt`), Kenney UI Pack Pixel Adventure **Thick outline** (`ui_s` 16 px, 23 cols; `ui_l` 32 px, 13 cols — tile ids are row-major indices), 0x72 hearts/coin, Kenney fonts. Slot keys match `art-slot-map.json → ui`.
**Contrast** values are computed (WCAG relative luminance). Panel fill everywhere = `#2a2a3a`.

---

## §1 Materials & text
| Material | Pixels | Use |
|---|---|---|
| Dark panel | `ui_l` 8 (slate frame, transparent centre), 9-slice **6/6/6/6**, over a `#2a2a3a` fill | toasts, tooltips, detail pane, door label, Run Setup cards |
| Ornate modal | `ui_l` 9 (slate frame + rivet corners), 9-slice **10/10/10/10**, over `#2a2a3a` | Pause, Reward, Shop, Run End, Settings, dialogs |
| Ribbon | `ui_l` 43/44/45 3-slice | boss name card, "Victory"/"Defeat" |
| Text | Kenney Pixel 16 (T1), Kenney High 16 (T2), Kenney Mini 8 (T-small), all baked **with a 1 px `#222222` 8-neighbour stroke** | `#fdf7ed` 13.2:1 · dim `#b6cbcf` 8.3:1 · warn `#facb3e` 9.2:1 · ok `#97da3f` 8.3:1 · error `#ff6b5e` 5.0:1 · mana `#5698cc` 4.5:1 (on `#2a2a3a`) |

## §2 Card cells (wand editor 36 px, HUD 18 px) — type reads from **silhouette**
Draw order per cell: fill (`#2a2a3a`, 32×32 at +2,+2 / 16×16 at +1,+1) → icon (`icon32` at +1,+1 / `icon16` at +1,+1) → frame overlay → badges.

| Type | 36 px frame | 18 px frame | Silhouette cue | Badge (36 px only unless noted) |
|---|---|---|---|---|
| Spell | `card_spell_36` | `card_spell_18` | **rounded** corners, 2 px border (`#222222` + white), MULTIPLY-tinted by element light (arcane `#cfc0ff`, fire `#ee8e2e`, frost `#cae6f5`, shock `#facb3e`, poison `#97da3f`; all ≥ 4.6:1 vs `#2a2a3a`) | 36: `elem_<element>` 7×7 bottom-right (shape = element: orb / twin-tip flame / diamond shard / zigzag / droplet) · 18: `pip3_<element>` 3×3 at +14,+14 |
| Modifier (stat, infuse) | `card_modifier_36` | `card_modifier_18` | **chamfered** corners + inner dark line, bronze `#c58747` (4.65:1) | `g_plus_5x5` top-right |
| Multicast | `card_multicast_36` | `card_multicast_18` | **double line** (18 px: inner corner brackets) | `×2/×3/×4` Kenney Mini on `chip_7x7`, top-right |
| Trigger | `card_trigger_36` | `card_trigger_18` | **arrow notch** on the right edge | `g_trigger` + H / E / T (Kenney Mini) top-right |
| Always-cast (virtual) | `card_always_36` | — | rounded, dim slate | `g_lock_7x7` |
| Shared badges | mana cost: Kenney Mini on `chip_7x7` bottom-left · NEW: `g_new_5x5` top-left · rarity: 1 px underline in the rarity token below the cell (never on the frame) |

**Grayscale test (falsifiable, UX §2.2):** at 18 px in grayscale the four frames differ by corner shape (round / chamfer / square-double / square-notched) — no colour needed — and spells additionally carry the element badge (36 px) or `pip3_*` (18 px). This supersedes the v0 slate-vs-bronze *material* distinction the UX objection measured at 1.10:1: the materials remain as a redundant cue only.

## §3 Wand-editor slot states (every state has a non-colour cue)
| State | Pixels |
|---|---|
| Empty slot | `cell_empty_36` (dashed `#b6cbcf`) over `#2a2a3a` |
| Filled — spell / modifier / multicast / trigger | §2 cell |
| Focus (keyboard / pad) | `focus_40` (black-gold-black ring outside the cell) — also the "selected" state |
| Hover (mouse) | `focus_40` at 60 % alpha |
| Drag-hover **valid** target | `cell_valid_36` (1 px white inner frame) |
| Drag-hover **invalid** target | `slash_36` overlay + `g_stop` badge top-right |
| Held card (drag) | icon32 at +4,+4 from the cursor, 90 % alpha, 1 px `#222222` drop shadow; origin cell shows `cell_empty_36` (ghost) |
| **Next-to-cast** cursor | `cell_next_36` (1 px gold inner frame) + `g_chevron_5x3` under the cell (B4); after an edit, `g_recharge` at slot 1 |
| Drawn this cycle (preview) | whole cell 40 % alpha |
| Skipped for mana (preview) | `slash_36` + `g_warn` on the cast line |
| Wrap marker | `g_wrap` before the first card after a wrap |
| Salvage bin | `ui_l` 20 (red-corner slate) + 7Soul1 `I_GoldCoin` icon32 |

## §4 HUD (boxes from `hud-layout.md` §2.1)
| HUD id | Pixels |
|---|---|
| H1 hearts | 0x72 `ui_heart_full/half/empty` 13×12 (shape carries full/half/empty) |
| H2 shield | `shield_hex_13x12` (hexagon ≠ heart); break = `fx.freeze_shatter` |
| H3 relic row | `icon16` per relic (`icons16.json by_id relics.*`) |
| H4 floor track | `pip_start ○ · pip_combat ■ · pip_elite ◆ · pip_treasure ▲ · pip_shop ● · pip_boss_9 ☠ · pip_future □`; current = `pip_current_9` |
| H5 boss bar | `bar_frame_6` 9-slice [2,2,2,2] around 298×4 fill `#da4e38`; damage chip `#facb3e`; phase ticks 1×8 `#fdf7ed` with `#222222` keyline; invulnerable = `hatch_4` TileSprite over the fill |
| H6 coins / H7 bag | 0x72 `coin_anim_f0` centred in 8×8 · `bag_8`; warnings `g_warn` / `g_stop` |
| H8 wand badges | `badge_20` (equipped: `badge_20_equipped`, raised 4 px) + wand `icon16`; recharge = 50 % `#222222` fill rising; mana line 1 px `#5698cc` |
| H10 slot strip | §2 18 px cells; next = `cell_next_18` + `g_chevron_5x3` (H11); drawn = 40 % alpha; skipped = `slash_18` 250 ms; empty wand = `cell_empty_18` |
| H12 recharge bar | 2 px: track `#2a2a3a`, fill `#b6cbcf` |
| Mana bar | `bar_frame_6` 9-slice; fill `#5698cc` with a 1 px `#72d6ce` top line; below next-card cost → `hatch_4` over the fill (non-colour cue) |
| Reticle / aim pip / recharge ring | `reticle_9x9` · `aim_pip_5x5` · Graphics 13×13 1 px `#fdf7ed` arc on a `#222222` ring |
| Dash readiness, elite HP | Graphics 12×2 / 16×2 bars: `#222222` keyline, fill `#fdf7ed` / `#facb3e` |
| Toasts, banners, damage numbers | dark panel (§1) / T2 or T1 ×2 with stroke / T1 with stroke; crit numbers `#facb3e` |
| Keycaps | `keycap_12` + Kenney Mini letter |
| Status helpers | vulnerable `g_vuln_5x3`; poison stack = Kenney Mini on `chip_7x7`; chill = 1–2 × `pip_chill_5` (outlined frost shard) at the head anchor, where poison's number sits (the number shifts right when both apply); stack 3 = frozen shell |
| Glyph set (UX §7 ask) | `g_warn ⚠ · g_stop ⛔ · g_ok ✔ · g_no ✘ · g_recharge ↻ · g_wrap ↩ · g_arrow → · g_up ▲ · g_down ▼ · g_hand ✋ · g_trigger ↯` (9×9, keylined) |

## §5 In-world UI
Door badges: two `icon16` on 18×18 dark cells (`#2a2a3a` + `badge_20` keyline scaled to 18 via 9-slice 1 px) — room-kind pip shape + reward kind (`reward_kind.*` in `icons16.json`: spell `W_Book06`, modifier `W_Book04`, relic `I_Chest01`, wand `W_Staff01`, shop `I_GoldCoin`, treasure `I_Chest02`; heal = heart, coins = coin, boss = 0x72 skull). Interact prompt = `keycap_12` + T1 verb on the dark panel. Pedestal sparkle = 1 px `#fdf7ed`.

## §6 16 px mini-icons — decision and evidence
UX asked for an art pass rather than a nearest-neighbour halve (correct: plain halving drops the outline). `icons16.png` is that pass, made reproducible: each 2×2 block of the 32 px content keeps the majority alpha, picks the dominant **non-outline** colour (outline only where ≥ 3 of 4 source pixels were outline), then gains an external 1 px `#222222` keyline. I reviewed all 82 unique results at ×3 on `#2a2a3a`; every one keeps its silhouette read (staffs, gems, boots, flames, shards). Any icon a reviewer flags is fixed by editing that 16×16 cell by hand — the sheet is source art, not a cache.

## §7 Buttons & tabs (all states distinct without colour)
| State | Pixels | Non-colour cue |
|---|---|---|
| Default | `ui_l` 16 (dark slate + rivets), 9-slice 5/5/5/5; label T1 with stroke | — |
| Hover | `ui_l` 15 (light slate + rivets) | lighter value (+0.08 L) |
| Pressed | `ui_l` 16, label/icon +1 px y, MULTIPLY `#b0b0b0` | 1 px sink |
| Focus (kb/pad) | hover + `focus_40`-style 1 px `#facb3e` ring with `#222222` keyline outside (9-slice) | ring |
| Disabled | `ui_l` 16 + MULTIPLY `#6a6a6a`, label `#6e6886` + reason line T1 elsewhere | dim + reason text |
| Primary (Start Run, Take, Buy) | `ui_l` 1 (bronze) / hover `ui_l` 0 (cream in bronze) | bronze material |
| Danger (Abandon, Erase) | `ui_l` 20 (red corner gems) | corner gems |
| Tabs | inactive `ui_l` 16, active `ui_l` 2 + 2 px underline | underline |
| Toggle | on = filled chip + underline; off = outline chip (`ui_s` 70/69) | fill + underline |

## §8 Push-back / scale notes
- **Nothing in the UX layout needs art that won't render at 640×360** — all sizes were authored at 1×. The only runtime scaling is text Display ×2 (integer) and the wordmark ×3.
- Kenney `ui_l` frames have 5–6 px borders, which is why card cells are **authored** 2 px-border overlays: the UX 36 px cell (32 icon + 2 frame) can't be 9-sliced from a 6 px-border tile.
- Localization: every frame is 9-slice or fixed-size icon, so no text is baked into art.

---

## §9 v2 (Wave A2) — new screens, HUD pieces and touch controls
All frames below are in `assets/src/art/spellwright_ui.png` (+ `.json`) unless marked `icon` (7Soul1, via `icons16`/`icon32`). v1 frames are unchanged; v2 frames are appended.

### 9.1 Card levels & relic classes
| Cue | Pixels | Where |
|---|---|---|
| Level 2 | `lvl_pips_36` / `lvl_pips_18` (two 2×2 `#fdf7ed` pips on the top edge) + "II" in the name | every card cell |
| Evolved | `g_star_7` top-left + `card_evolved_corners_36` / `_18` (gold corner brackets over the keyline) | every card cell |
| Corrupted relic | `g_corrupt_7` top-right on the icon cell | drafts, Relics tab, risk-door draft |
| Duo relic | UX DUO chip + both parent `icon16` + `g_ok` per owned parent | drafts |

### 9.2 Forge tab (S5f)
Panel = `panel_ornate` over `#2a2a3a`; three 196 px columns split by 1 px `#515f6b` rules. Tab icon: `icon I_GoldBar`. Recipe rows: **Merge** = two card cells offset 4 px → `g_arrow` → result cell with `lvl_pips`; **Evolve** = base cell + catalyst `icon16` → `g_arrow` → result cell with `g_star_7` (missing parts: dimmed 50 % + "Needs…"; undiscovered result: icon silhouette = fill `#2a2a3a`, keyline `#778d9f`); **+1 Slot** = `cell_empty_36` + `g_plus_7`. DPS delta uses `g_up` / `g_down`. Result FX: `fx.forge_merge` (nebula, gold) / `fx.forge_evolve` (+ star pop).

### 9.3 Mode Select (S1m), Goals (S1g), Daily (S7d)
- **Modes** (32 px icons): Standard `C_Hat01` · Gentle `I_Feather01` · Daily `I_Scroll02`. Heat selector numerals: `heat_0 … heat_5` (9×9 flame + knocked-out digit). A locked mode = its icon silhouette + 🔒 (`g_lock_7x7`).
- **Goals** status (9×9, shape-coded): ✔ `g_ok` · ▶ `g_goal_next` · ○ `g_goal_later` · ◐ `g_goal_queued`. Reward icons = the unlocked item's icon; features: Daily `I_Scroll02`, Forge `I_GoldBar`, Duos `Ac_Necklace04`, Corrupted `E_Bones02`, Heat `heat_1`, +1 slot = `W_Staff01` + `g_plus_7`. Later-goal rewards show as silhouettes.
- **Daily result**: dark panel share box; Copy = primary button; the iOS/DOM share glyph `share_12` (24 CSS px = ×2).

### 9.4 Reward (S4) Skip / Reroll
Reroll = `g_recharge` + cost (T1) on a `button` (30 px); Skip = coin icon + "+{gold}" (T1) on a `button`; both disabled per §7. "Counters: {defence}" chip carries the `def_*` icon; the SWAP button's pips use `kw_pierce` / `kw_blast` / `kw_shock`.

### 9.5 HUD & in-world additions (`hud-layout.md` §9)
| Element | Pixels |
|---|---|
| Counter pips (7×7) | `def_shield` / `def_armour` / `def_ward`; filled = full alpha with a `#fdf7ed` rim (the frame already has it), hollow = α 0.5 |
| Mode badge | T1 only (no art) |
| Door threat icon (third 16 px icon) | `door_shield` · `door_armour` · `door_ward` · `door_swarm` · `door_ranged` · `door_summoner` · `door_none`; risk door `door_risk`; hidden `door_unknown` |
| Affix nameplate | the affix glyph (7×7): `def_armour` · `def_ward` · `def_shield` · `affix_wing` · `affix_burst` (two side by side at Heat 2+) |
| Ward runes on actors | `ward_rune_full` / `_spent` / `_regrow` (5×5) |
| BLOCKED / ARMOURED / WARDED / BROKEN numbers | T1 `#b6cbcf` + the 7×7 defence icon |
| Mini-boss intro | letterbox bars `#0d0a10` 16 px; T2 name + T1 epithet, outlined glyphs; mini bar = `bar_frame_6` at 0.6 width |

### 9.6 Touch controls (`mobile-touch-spec.md` §12)
| Asset | Frames | Notes |
|---|---|---|
| DASH / SWAP / USE body 38×38 | `btn_round_38`, `_pressed`, `_disabled` | `#2a2a3a` body, `#222222` keyline, `#778d9f` inner ring; pressed = `#515f6b` body + `#fdf7ed` ring; runtime α 0.55 allowed |
| Button icons 16×16 | `t_dash` (›››) · `t_swap` · `t_use_hand` · `t_use_coin` · `t_use_stair` · `t_use_eye` | monochrome `#fdf7ed` + auto `#222222` keyline (frames are 16×16 incl. keyline) |
| PAUSE / EDIT 28×28 | `btn_sq_28`, `btn_sq_28_pressed` + `t_pause` / `t_edit` + `g_plus_7` badge | |
| Modal Back 28×28 | `btn_sq_28` + `g_back_12` | |
| Stick | `stick_ring_58`, `stick_knob_22` (optional; procedural R 28 / 10 is equivalent) | |
| Target marker | `target_tick_3` (3×3 L, rotate ×4 for corners) | |
| Coach hand | `ghost_hand_16`, `ghost_hand_tap_16` | |
| Rotate overlay | `rotate_32` (DOM: export ×2 = 64 CSS, ×3) | |
| iOS share glyph | `share_12` (+ ×2 for 24 CSS) | |
| App icons | `assets/src/art/appicon/appicon_64.png` → 192 (×3), 512 (×8), maskable 512 (same art, full-bleed); `appicon_60.png` → 180 (×3) | integer scales only |
| Touch prompt glyphs 12×12 (`controller-prompts.md` §9) | TA Wave B in `scripts/author-prompt-glyphs.py` | redraw at 12 px from the 16 px icons above so each prompt pictures its button (style: `#fdf7ed` on `#4b5468`, `#222222` keyline) |

### 9.7 World-entry title card (Worlds addendum)
A 640×96 band centred at y 96: that world's backdrop strip drawn at 1× (W1 crypt wall + 2 candles · W2 slate wall + drain + shallow-water row · W3 bookshelf wall + candelabra pair), its emblem prop at 1× (W1 `bone_pile`, W2 `drip_f2`, W3 `candelabra_f0`), the name in T2 and the fantasy line in T1 (outlined glyphs), and a 1 px accent rule in the world light colour (`#ee8e2e` / `#72d6ce` / `#facb3e`). Reduced motion: the card appears instead of sliding. Frames: `art-slot-map.json → world_cards`.
