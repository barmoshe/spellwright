# Spellwright — `art-slot-map`

**Owner:** 2D Artist · **Status:** Wave 2, v1 · **Machine-readable twin:** [`art-slot-map.json`](art-slot-map.json) — both are generated from one source, `scripts/build-art-slot-map.py`, which also **fails (exit 1) if any id in `data/*.json` has no slot** or any slot names a stale id. Re-run it whenever the Game Designer edits content.
**Consumers:** Technical Artist (Wave 3 slicing, LUT bake, atlas packing), Animator (clip bindings for `state-graph-spec` §3.1 classes), Game Developer (texture/frame keys, depth, blend), UX Designer (icons).
**Rules of the road:** style decisions live in [`style-guide.md`](style-guide.md); this file only says *which pixels fill which slot*. UI states: [`ui-artwork.md`](ui-artwork.md).

---

## §0 Conventions
- **Source keys** (`sources` in JSON): `0x72` (by `tile_list_v1.7` name, with TA fixes `zombie_anim_f10 → zombie_anim_f0`, `wall_edge_top_left x 31 → 32`), `0x72_walls`, `0x72_floor`, `trash`, `simplefx`, `devwizard`, `codemanu`, `expl16`, `puny`, `icons`, `ui_s` (Adventure small, Thick outline, 23 cols), `ui_l` (Adventure large, Thick outline, 13 cols), `fonts`, `authored`.
- `rect = [x, y, w, h]` px · `cells = [col, row]` on the source grid · `cells_index` = row-major index (CodeManu 100 px grids) · `trim` = union content bbox inside each cell (TA trims to it before packing).
- **LUTs** are exact hex→hex maps on *source* colours, baked by the TA at build time (table G8). Unlisted colours pass through.
- **Origins:** actors `(0.5, 1.0)` = feet (Animator R7); everything else centred.
- **Blend/depth:** player projectile bodies NORMAL depth 60, their glows ADD depth 61, **enemy bullets NORMAL depth 62** (style-guide §4.1), FX 70.
- **Icons:** `icon32` = native 34×34 (1 px margin) for editor/drafts/shop/codex; `icon16` = the **authored** 16 px pass in `assets/src/art/icons16.png` (+ `icons16.json` `by_id`, e.g. `relics.kindling`) for HUD, doors, world pickups — 82 unique cells covering all 43 cards, 26 relics, 10 wands and the reward kinds (method + review: `ui-artwork.md` §6). UI glyphs/frames/pips: `assets/src/art/spellwright_ui.png` (+ `.json`).
- **Enemy bullets:** radius *r* → `ebullet.<element>.<2r+1>` (7/9/13 authored); any other radius → nearest size down. Elements with no hostile art default to `arcane`.
- **Projectile visual scale:** ×1 / ×2 / ×3 for radius multiplier < 1.5 / < 2.5 / ≥ 2.5 (style-guide E3); hitboxes follow data.

## §1 Player
- Skins: `apprentice`, `stormcaller` → `wizzard_m`; `pyromancer`, `hexer` → `wizzard_f`. Frame 16×28, content x 2–16, y 9–28.
- Clips (keys = Animator §2.1): `player_idle` idle f0–3 @ 6 · `player_run` run f0–3 @ 12 · `player_dash` run f2 held + afterimages FILL `dash-ghost` · `player_hit` hit f0 held.
- **Missing cast frames — decision:** no body cast pose. Cast = held wand (`wand_held`, per-wand gem) + `fx.muzzle` at the tip + 1 px kick (Animator).
- **Missing death frames — decision:** hit f0 held → FILL `flash` 2 steps → stepped alpha 1 → .66 → .33 → 0 while `fx.soul_release` (CodeManu `18_midnight`, greyscale-baked, tint `#cfc0ff`, ADD) rises from `core` → the held wand drops and stays 1 s. Readable as "the wizard's spirit leaves" with zero new frames.
- `wand_held` = top 10 rows of 0x72 `weapon_{green,red}_magic_staff` (8×10, gem head), per-wand gem LUT (table G6) — the Animator §6 request, accepted.
- Shield (warding sigil): `8_protectioncircle` ×16 f @ 20 fps, tint `#72d6ce`, α 0.35 (Animator §2.4). Shadow: authored `shadow_10x3`.

## §2 Enemies, elites, bosses — decisions behind the table
- **Class bindings** follow Animator §3.1. Two placeholders in that table are replaced: slimelet is an **authored** 9×8 half-mass swampy (not a ×0.75 render — that would create mixels), wraith is 0x72 `angel` + `L_WRAITH` (Tiny Dungeon rejected), eye turret is **authored** (idle + glare pose; glare is shown for the whole windup, peaking with `telegraph-hot`).
- **Boss telegraphs** (no attack frames exist): four stacked channels — body ADD `telegraph-hot`, 1/8-step scale pulse, hostile ground decal (WHERE), core glyph FX (WHAT). Per attack type in JSON `boss_telegraph.per_attack_type`; it covers every attack `type` in `bosses.json` (melee_swipe, ring, shoot, spiral, charge, slam, summon, hazard, blink, sequence) + phase change. Timing is the Animator's; shapes/colours are fixed here.
- **Hitbox fit:** all fit their visible content except `mire_queen` (radius 14 vs 20 px-wide content → contact lands ~1 px before sprites touch). Flagged to the Game Designer as a note (radius 12 fits); not an objection.

## §3 Tiles, props, pickups (JSON `tiles`, `pickups`)
Floor weights, wall blob template, decor density, torches, pits (void + north `edge_down` lip), pillars (`column`), crates (`crate` — the only wood-orange object), pedestals (Puny block + `L_PUNY_STONE`), doors (`doors_frame_*` + `doors_leaf_{open,closed}`; **locked** = closed leaf + MULTIPLY `door-locked`), floor exit (Puny cyan portal), vault chest, coin (4 f @ 10), heart drop, shop heal flask, card/relic/wand world pickups.

## §4 Spells, modifiers, relics, wands
- **Spells:** body + fps + orientation + glow + impact + icon for all 18 (G3). Explosions (`fireball` r32, `rune_mine` r40, `comet` r48, `vortex` r36, modifier `explosive` r28, relic `kindling`/`blast_boots`, reaction `overload` r32) all use `fx.explosion` = glow flash + `expl16` at ×2/×3 + a 1 px ring at the exact radius (so the damage radius is always legible).
- **Modifiers — the consistent treatment:** no pack has modifier glyphs, so **the card frame silhouette carries the category** — the UX `wand-editor-ux` §2.2 contract, drawn as authored overlays in `assets/src/art/spellwright_ui.png` at 36 px (editor) and 18 px (HUD): spell = rounded gem frame (white, MULTIPLY-tinted by element) + element shape glyph bottom-right; stat/infuse modifier = bronze chamfered frame with an inner line + `+` badge; multicast = bronze double-line frame + `×n` numeral chip; trigger = bronze frame with a right-edge arrow notch + `↯` and H/E/T. Multicast shares one icon (`S_Wind04`); infusions share the glowing element-orb family `S_Axe01/02/03/07`; every other modifier has a distinct 7Soul1 icon. The grayscale test passes on silhouette alone (ui-artwork.md §2).
- **Relics:** one unique 7Soul1 item icon each (no `S_*` spell icons on relics, so a relic never masquerades as a card). 3 LUT'd variants.
- **Uniqueness:** the builder asserts no icon file (+LUT) is shared between two identities, except the multicast family by design.

## §5 Shared FX, statuses, reactions, zones
JSON `fx`, `status`, `reactions`, `zones`, `telegraph_tokens`. Status overlays are sprites (Animator R5): burn = simplefx flame 2 f at `head`; poison = drip 2 f + stack numeral; shocked = DevWizard Magic Sparks via `L_DW_SPARKS_SHOCK`; frozen = `frost-tint` + `ice_shell_16` (simplefx ice cloud cell, α 0.7). Chain arcs = simplefx lightning strip as a rotated TileSprite. Spawn portal = Puny purple ring via `L_PORTAL_HOSTILE`.

## §6 Fonts and key art
Kenney Pixel 16 (body) · Kenney High 16 (headings; ×3 wordmark) · Kenney Mini 8 (badges, numbers, status, reactions); all baked 1× with a 1 px `#222222` outlined variant. Title / key art composition + square and vertical re-compositions: JSON `key_art`.

---

## §Objections

```yaml
objection:
  skill_or_agent: 2d-artist (style-definition-and-guide)
  against_artifact: data/rules.json → rules.enemies.elite.scale (1.25) + state-graph-spec R4 "elite ×1.25 base scale"
  reason: |
    A sustained ×1.25 nearest-neighbour scale on a 16 px outlined 0x72 sprite duplicates 4 of every
    16 texel rows and columns (16 → 20 px). The 1 px #222222 outline becomes 1–2 px unevenly and the
    duplicated rows shimmer as the sprite moves sub-pixel (roundPixels) — on exactly the enemies the
    player is told to prioritise. It violates the style-guide's single-pixel-density rule (§3.3) and
    the style-definition DOG (no outlined sprite at a sustained non-integer scale). Animator R4's
    1/8 quantisation fixes frame size, not texel duplication.
  proposed_alternative: |
    Keep the gameplay effect, change the visual carrier:
      - rules.enemies.elite.scale → 1.0 for the SPRITE; if the designer wants the bigger body, add
        rules.enemies.elite.radiusMult 1.25 (collision only — invisible, player-favourable since the
        outline below adds +2 px of visible size).
      - Elite read = TA-baked 1 px `elite-gold` #facb3e outline around every eliteCandidates sheet
        (+2 px each axis, origin unchanged) + a gold ground ellipse under the shadow + 3× coins
        already in data. This is louder at 640×360 than +25 % size (a gold ring on a #483b3a floor is
        6.97:1) and costs one baked variant per candidate sheet (≤ 8 sheets, ~10 KB of atlas).
      - Animator R4 drops "elite ×1.25" from its sustained-scale exceptions.
```

## §Resolved objections (UX Designer → 2D Artist, this pass)

| Objection | Resolution | Where |
|---|---|---|
| Card frames: slate vs bronze are 1.10:1 in grayscale; material vanishes at 16 px | **Accepted and exceeded.** Card type now reads from **frame silhouette** (rounded / chamfered / double-line / arrow-notch, authored at 36 and 18 px per `wand-editor-ux` §2.2); spells add the 7×7 element-shape badge at 36 px and a 3×3 `pip3_<element>` at 18 px as proposed. Modifiers: `+` badge; multicast `×n`; trigger `↯`+H/E/T. Materials stay as a redundant cue. | `ui-artwork.md` §2, `spellwright_ui.png` |
| Chill 1–2 shown by tint only; vanishes on cool sprites | **Accepted.** 1–2 outlined frost-shard pips (`pip_chill_5`, 5×5 with `#222222` keyline) at the head anchor, same spot as the poison number (which shifts right when both apply). Tints remain supporting. | `style-guide.md` §4.4, JSON `status.chill` |
| (non-blocking) 16 px icons for 43 cards / 26 relics / 10 wands + HUD pips | **Delivered** as authored source, not a runtime resample; 1-bit and Tiny Dungeon were evaluated and rejected as sources (different art styles — style-guide §5). | `icons16.png`, `spellwright_ui.png` |
| (a11y §3.1) dual-keyline rule for enemy shots and danger edges | **Adopted.** Hostile rims raised (`#fdd0d6`, `#facb3e` …): min max(outline, rim) = 3.55:1 over all 10 floor/wall colours; `telegraph-rim` is now a dual keyline. Frost enemy shots get a segmented rim (grayscale cue) instead of a shard silhouette, so no enemy shot shares the player's shard grammar. | `style-guide.md` §4.1–4.2 |

No other objection: every enemy, boss, spell, modifier, relic, wand and loadout id is representable with admitted or authored art (coverage G9). Designer names that the packs don't literally depict are re-skinned inside the fiction without changing data: Watcher Eye (authored), Wraith (spectral `angel`), Ossuary Knight (bone `big_zombie`), Stone Golem (rune `big_demon`), Archlich (×2 `necromancer`).

<!-- GENERATED by scripts/build-art-slot-map.py — edit the script, not this block -->

### G1. Enemies (13/13 data ids)

| id | idle | move | class | frame | LUT | notes |
|---|---|---|---|---|---|---|
| `bat` | trash cells [[4, 0], [5, 0]] · LUT L_BAT | trash cells [[4, 0], [5, 0]] · LUT L_BAT | C | 16x16 | — | fps: 10; flying: True |
| `skeleton` | 0x72 skelet_idle_anim_f0..f3 (4 f) | 0x72 skelet_run_anim_f0..f3 (4 f) | A | 16x16 | — | swipe_fx: fx.enemy_slash |
| `cultist` | 0x72 doc_idle_anim_f0..f3 (4 f) | 0x72 doc_run_anim_f0..f3 (4 f) | A | 16x23 | L_CULTIST | bullet: ebullet.arcane.7 |
| `frost_mage` | 0x72 orc_shaman_idle_anim_f0..f3 (4 f) | 0x72 orc_shaman_run_anim_f0..f3 (4 f) | A | 16x23 | L_FROSTMAGE | bullet: ebullet.frost.9 |
| `brute` | 0x72 masked_orc_idle_anim_f0..f3 (4 f) | 0x72 masked_orc_run_anim_f0..f3 (4 f) | A | 16x23 | — |  |
| `slime` | 0x72 swampy_anim_f0..f3 (4 f) | 0x72 swampy_anim_f0..f3 (4 f) | B | 16x16 | — | on_death_fx: fx.poison_burst |
| `slimelet` | authored slimelet_f0, slimelet_f1 | authored slimelet_f0, slimelet_f1 | B | 9x8 | — | note: authored half-mass swampy (0x72 palette); replaces the Animator placeholder "swampy x0.75" |
| `fire_imp` | 0x72 imp_idle_anim_f0..f3 (4 f) | 0x72 imp_run_anim_f0..f3 (4 f) | A | 16x16 | — | blast_fx: fx.explosion (radius 36, hostile variant: ring colour telegraph-rim) |
| `eye_turret` | authored eye_turret_f0 | authored eye_turret_f0 | D | 16x16 | — | windup_frame: authored eye_turret_f1; note: authored; f1 (glare) is shown for the whole windup, replacing the Animator placeholder "static eye tile"; bullet: ebullet.arcane.7 |
| `wraith` | 0x72 angel_idle_anim_f0..f3 (4 f) | 0x72 angel_run_anim_f0..f3 (4 f) | A (flyer) | 16x16 | L_WRAITH | alpha: 0.85; flying: True; bullet: ebullet.arcane.7; blink_fx: fx.blink_puff (tint #72d6ce); note: replaces the Animator placeholder Tiny Dungeon ghost #121 (pack rejected) |
| `necromancer` | 0x72 necromancer_anim_f0..f3 (4 f) | 0x72 necromancer_anim_f0..f3 (4 f) | B | 16x23 | — | summon_sigil: fx.summon_sigil |
| `skull` | 0x72 skull | 0x72 skull | D (flyer) | 16x16 | — | flying: True; trail: authored glow_16 ADD tint #9f294e alpha 0.35 behind it (reads "possessed") |
| `stone_golem` | 0x72 big_demon_idle_anim_f0..f3 (4 f) | 0x72 big_demon_run_anim_f0..f3 (4 f) | A | 32x36 | L_GOLEM | bullet: ebullet.arcane.9; stomp_fx: fx.explosion (radius 44, hostile) |

### G2. Bosses (3/3)

| id | idle / move | LUT | scale | overlay | bullets / hazards | hitbox fit |
|---|---|---|---|---|---|---|
| `ossuary_knight` | 0x72 big_zombie_idle_anim_f0..f3 (4 f) / big_zombie_run_anim_f0..f3 | L_KNIGHT | x1 | boss_knight_blade = 0x72 weapon_knight_sword | ebullet.arcane.9  | radius 12 vs content 18x27: OK |
| `mire_queen` | 0x72 ogre_idle_anim_f0..f3 (4 f) / ogre_run_anim_f0..f3 | native | x1 | — | ebullet.poison.9 (aimed_glob radius 6 -> ebullet.poison.13) hazard.acid_pool | radius 14 vs content 20 wide: contact reads ~1 px early — note to Game Designer (radius 12 would fit); not blocking |
| `archlich` | 0x72 necromancer_anim_f0..f3 (4 f) / necromancer_anim_f0..f3 | L_LICH | x2 | boss_lich_staff = 0x72 weapon_green_magic_staff · LUT L_GEM_VIOLET | ebullet.arcane.9 / ebullet.frost.9 hazard.fire_zone | — |

### G3. Spells (18/18)

| id | projectile body | fps | rotate | glow (ADD) | impact / expire | icon |
|---|---|---|---|---|---|---|
| `spark_bolt` | devwizard `Arcane Bolt` cells [0, 0]..[5, 0] (6 f) · LUT L_DW_ARCANE | 15 | yes | glow_16 #8b7cf0 a0.5 | fx.hit_ring (arcane) | `S_Shadow08` |
| `magic_missile` | devwizard `Magic Orb` cells [0, 0]..[5, 0] (6 f) · LUT L_DW_ARCANE | 12 | no | glow_16 #8b7cf0 a0.5 | fx.hit_ring (arcane) | `S_Shadow10` |
| `bouncing_burst` | simplefx rect [118, 37, 6, 6] · LUT L_SFX_ARCANE+L_DELETE_OUTLINE | static | no | glow_16 #8b7cf0 a0.5 | fx.hit_ring (arcane); on wall bounce: 1-step FILL flash #fdf7ed | `S_Shadow04` |
| `fire_bolt` | devwizard `Fireball` cells [0, 0]..[5, 0] (6 f) | 15 | yes | glow_16 #ee8e2e a0.5 | fx.hit_ring (fire) + 2 ember motes | `S_Fire01` |
| `fireball` | devwizard `Firebomb` cells [0, 0]..[5, 0] (6 f) | 15 | yes | glow_32 #ee8e2e a0.45 | onExpire explode r32 -> fx.explosion (fire) | `S_Fire03` |
| `ice_shard` | simplefx rect [5, 35, 5, 9] · LUT L_SFX_BASE+L_DELETE_OUTLINE | static | yes | glow_16 #5fcde4 a0.5 | fx.hit_ring (frost) | `S_Ice03` |
| `frost_nova` | simplefx rect [5, 35, 5, 9] · LUT L_SFX_BASE+L_DELETE_OUTLINE | static | yes | glow_16 #5fcde4 a0.4 | fx.hit_ring (frost); cast burst: simplefx r2 c9-c10 snow burst 2 f @ 20 fps at caster | `S_Ice02` |
| `frost_lance` | devwizard `Ice Lance` cells [0, 0]..[3, 0] (4 f) | 15 | yes | glow_16 #5fcde4 a0.5 | fx.hit_ring (frost) | `S_Ice09` |
| `chain_lightning` | devwizard `Light Bolt` cells [0, 0]..[5, 0] (6 f) · LUT L_DW_LIGHT_SHOCK | 20 | yes | glow_16 #facb3e a0.6 | fx.hit_ring (shock); each jump = fx.chain_arc | `S_Thunder01` |
| `thunder_orb` | simplefx cells [[14, 4], [15, 4]] · LUT L_SFX_SHOCK+L_DELETE_OUTLINE | 12 | no | glow_32 #facb3e a0.55 | each tick zap: fx.zap_bolt on the target + fx.chain_arc from orb | `S_Thunder03` |
| `venom_dart` | simplefx rect [3, 54, 10, 3] · LUT L_SFX_POISON_DART+L_DELETE_OUTLINE | static | yes | glow_16 #97da3f a0.4 | fx.hit_ring (poison) | `S_Poison08` |
| `toxic_flask` | 0x72 flask_green | static | spin | glow_16 #97da3f a0.4 | shatter: fx.poison_burst; zone: zone.player_poison (radius 26) | `S_Poison05` |
| `boomerang_blade` | simplefx rect [40, 110, 22, 10] · LUT L_SFX_WHITE_ARCANE | static | spin | glow_16 #8b7cf0 a0.4 | fx.hit_ring (arcane) per pass | `S_Physic02` |
| `arcane_orbit` | simplefx rect [132, 35, 10, 10] · LUT L_SFX_ARCANE+L_DELETE_OUTLINE | static | no | glow_16 #8b7cf0 a0.6 | fx.hit_ring (arcane) | `S_Shadow12` |
| `rune_mine` | simplefx cells [[12, 0], [13, 0]] · LUT L_SFX_FIRE_STAR+L_DELETE_OUTLINE | static | no | glow_16 #ee8e2e a0.3 (settling) -> a0.7 (armed) | onExpire explode r40 -> fx.explosion (fire) | `S_Fire08` |
| `blink_bolt` | devwizard `Pure Bolt 2` cells [0, 0]..[5, 0] (6 f) · LUT L_DW_PURE_ARCANE | 15 | no | glow_16 #cfc0ff a0.6 | onExpire teleport: fx.blink_puff at origin and destination (tint #cfc0ff) | `S_Magic05` |
| `comet` | simplefx rect [208, 34, 16, 11] · LUT L_SFX_BASE+L_DELETE_OUTLINE | static | yes | glow_32 #ee8e2e a0.6 | onExpire explode r48 -> fx.explosion (fire, large) | `S_Fire05` |
| `vortex` | codemanu `13_vortex` frames every 5th of 0..60 (13 f) · LUT L_GREY_BAKE · tint #8b7cf0 | 20 | no | glow_16 #cfc0ff a0.8 at centre (the bright core) | onExpire explode r36 -> fx.explosion (arcane) | `S_Shadow02` |

### G4. Modifiers (25/25)

| id | icon | family | card frame | badge |
|---|---|---|---|---|
| `double_cast` | `S_Wind04` | multicast | ui_authored card_multicast_36 / card_multicast_18 (bronze) | x2 (Kenney Mini 8 px #fdf7ed on chip_7x7, top-right) |
| `triple_cast` | `S_Wind04` | multicast | ui_authored card_multicast_36 / card_multicast_18 (bronze) | x3 |
| `quad_cast` | `S_Wind04` | multicast | ui_authored card_multicast_36 / card_multicast_18 (bronze) | x4 |
| `trigger_hit` | `S_Light01` | trigger | ui_authored card_trigger_36 / card_trigger_18 (bronze) | g_trigger + H (on impact) |
| `trigger_expire` | `S_Wind05` | trigger | ui_authored card_trigger_36 / card_trigger_18 (bronze) | g_trigger + E (on expire) |
| `trigger_timer` | `S_Magic02` | trigger | ui_authored card_trigger_36 / card_trigger_18 (bronze) | g_trigger + T (timer 0.25 s) |
| `damage_up` | `S_Buff14` | stat | ui_authored card_modifier_36 / card_modifier_18 (bronze) | — |
| `speed_up` | `S_Bow11` | stat | ui_authored card_modifier_36 / card_modifier_18 (bronze) | — |
| `size_up` | `S_Buff01` | stat | ui_authored card_modifier_36 / card_modifier_18 (bronze) | — |
| `accuracy` | `S_Bow09` | stat | ui_authored card_modifier_36 / card_modifier_18 (bronze) | — |
| `range_up` | `I_Telescope` | stat | ui_authored card_modifier_36 / card_modifier_18 (bronze) | — |
| `heavy` | `I_IronBall` | stat | ui_authored card_modifier_36 / card_modifier_18 (bronze) | — |
| `rapid_cast` | `S_Wind06` | stat | ui_authored card_modifier_36 / card_modifier_18 (bronze) | — |
| `quickening` | `Ac_Medal02` | stat | ui_authored card_modifier_36 / card_modifier_18 (bronze) | — |
| `homing` | `I_Eye` | stat | ui_authored card_modifier_36 / card_modifier_18 (bronze) | — |
| `pierce` | `S_Bow04` | stat | ui_authored card_modifier_36 / card_modifier_18 (bronze) | — |
| `bounce` | `S_Bow05` | stat | ui_authored card_modifier_36 / card_modifier_18 (bronze) | — |
| `split` | `S_Bow10` | stat | ui_authored card_modifier_36 / card_modifier_18 (bronze) | — |
| `explosive` | `S_Fire06` | stat | ui_authored card_modifier_36 / card_modifier_18 (bronze) | — |
| `chain` | `S_Thunder04` | stat | ui_authored card_modifier_36 / card_modifier_18 (bronze) | — |
| `crit_up` | `S_Dagger04` | stat | ui_authored card_modifier_36 / card_modifier_18 (bronze) | — |
| `infuse_fire` | `S_Axe01` | infuse | ui_authored card_modifier_36 / card_modifier_18 (bronze) | — |
| `infuse_frost` | `S_Axe02` | infuse | ui_authored card_modifier_36 / card_modifier_18 (bronze) | — |
| `infuse_shock` | `S_Axe03` | infuse | ui_authored card_modifier_36 / card_modifier_18 (bronze) | — |
| `infuse_poison` | `S_Axe07` | infuse | ui_authored card_modifier_36 / card_modifier_18 (bronze) | — |

### G5. Relics (26/26)

| id | icon | LUT |
|---|---|---|
| `arcane_whetstone` | `I_SilverBar` | L_OUTLINE |
| `winged_boots` | `A_Shoes04` | L_OUTLINE |
| `magnet_charm` | `Ac_Necklace04` | L_OUTLINE |
| `mana_font` | `I_Crystal01` | L_OUTLINE |
| `deep_well` | `P_Blue05` | L_OUTLINE |
| `heart_vessel` | `P_Red07` | L_OUTLINE |
| `greed_ring` | `Ac_Ring01` | L_OUTLINE |
| `ember_heart` | `I_Ruby` | L_OUTLINE |
| `frost_crown` | `I_Diamond` | L_OUTLINE |
| `storm_battery` | `I_Cannon04` | L_OUTLINE |
| `plague_vial` | `P_Green05` | L_OUTLINE |
| `glass_lens` | `I_Mirror` | L_OUTLINE |
| `quickened_quill` | `I_Feather01` | L_OUTLINE |
| `sand_hourglass` | `I_Clock` | L_OUTLINE |
| `echo_chamber` | `I_SnailShell` | L_OUTLINE |
| `blast_boots` | `A_Shoes07` | L_OUTLINE |
| `merchant_seal` | `Ac_Medal01` | L_OUTLINE |
| `thorn_mantle` | `A_Clothing02` | L_OUTLINE |
| `shatter_heart` | `I_Crystal03` | L_OUTLINE |
| `kindling` | `I_Torch02` | L_OUTLINE |
| `shadow_cloak` | `A_Clothing01` | L_OUTLINE+L_ICON_SHADOW |
| `vampiric_fang` | `I_Fang` | L_OUTLINE |
| `alchemist_stone` | `I_Agate` | L_OUTLINE |
| `prism_shard` | `I_Opal` | L_OUTLINE |
| `warding_sigil` | `Ac_Medal04` | L_OUTLINE |
| `phoenix_feather` | `I_Feather02` | L_OUTLINE |

### G6. Wands (10/10)

| id | icon | held (crop top 10 rows) | gem |
|---|---|---|---|
| `apprentice_wand` | `W_Staff01` | 0x72 weapon_green_magic_staff · LUT L_GEM_VIOLET | `#8b7cf0` |
| `ember_rod` | `W_Staff03` | 0x72 weapon_red_magic_staff | `#da4e38` |
| `glass_needle` | `W_Staff08` | 0x72 weapon_green_magic_staff · LUT L_GEM_WHITE | `#cae6f5` |
| `twin_fork` | `W_Staff02` | 0x72 weapon_green_magic_staff | `#97da3f` |
| `stormcaller_staff` | `W_Staff06` | 0x72 weapon_green_magic_staff · LUT L_GEM_YELLOW | `#facb3e` |
| `oak_staff` | `W_Staff04` + L_ICON_OAK | 0x72 weapon_green_magic_staff | `#97da3f` |
| `grave_scepter` | `W_Staff07` | 0x72 weapon_green_magic_staff · LUT L_GEM_PLUM | `#9f294e` |
| `chaos_branch` | `W_Staff04` | 0x72 weapon_green_magic_staff · LUT L_GEM_VIOLET | `#8b7cf0` |
| `echo_wand` | `W_Staff05` | 0x72 weapon_green_magic_staff · LUT L_GEM_CYAN | `#72d6ce` |
| `archmage_scepter` | `W_Staff06` + L_ICON_ARCHMAGE | 0x72 weapon_red_magic_staff | `#da4e38` |

### G7. Loadouts (4/4)

| id | portrait | badge |
|---|---|---|
| `apprentice` | 0x72 wizzard_m_idle_anim_f0..f3 (4 f) | wands.apprentice_wand.icon |
| `pyromancer` | 0x72 wizzard_f_idle_anim_f0..f3 (4 f) | wands.ember_rod.icon |
| `stormcaller` | 0x72 wizzard_m_idle_anim_f0..f3 (4 f) | wands.stormcaller_staff.icon |
| `hexer` | 0x72 wizzard_f_idle_anim_f0..f3 (4 f) | wands.glass_needle.icon |

### G8. Palette-remap LUTs (TA bakes; exact hex -> hex)

| LUT | applies to | map |
|---|---|---|
| `L_OUTLINE` | every 7Soul1 icon and every simplefx/trash frame drawn with NORMAL blend | #000000→#222222, #010301→#222222, #020202→#222222 |
| `L_DELETE_OUTLINE` | simplefx frames used as PLAYER projectiles/FX (player-owned art never carries a dark outline — style-guide §5.1) | #000000→transparent |
| `L_SFX_BASE` | every simplefx frame, before any element LUT | #ffffff→#fdf7ed, #ed1c24→#df6026, #ed1f29→#df6026, #fe1515→#df6026, #c7101a→#df6026, #880015→#8f4029, #ff7f27→#ee8e2e, #ffc90e→#facb3e, #ffe040→#facb3e, #fff200→#fff6b8, #ffff80→#fff6b8, #1030ff→#417089, #1223fa→#417089, #3f48cc→#417089, #00a2e8→#5fcde4, #99d9ea→#cae6f5, #97ffea→#cae6f5, #00dfb3→#72d6ce, #007961→#3c9f9c, #22b14c→#4ba747, #82e679→#97da3f, #bef2b9→#c8ef7a, #9fe81a→#97da3f, #7ab112→#4ba747, #8000ff→#5956bd, #c3c3c3→#b6cbcf, #acb7c3→#b6cbcf, #7f7f7f→#775c55, #b97a57→#b58057, #69412c→#8a503e, #efe4b0→#d3bfa9, #fe8f8f→#f78697, #f3767c→#f78697, #ffc4c4→#fdd0d6, #ffaec9→#fdd0d6 |
| `L_SFX_ARCANE` | simplefx blue orbs re-used as arcane player shots (source colours, pre-BASE) | #1030ff→#5956bd, #00a2e8→#8b7cf0, #99d9ea→#cfc0ff, #ffffff→#fdf7ed |
| `L_SFX_SHOCK` | simplefx starbursts + lightning strip + vertical bolt re-used as shock (source colours, pre-BASE) | #1030ff→#ee8e2e, #00a2e8→#facb3e, #99d9ea→#fff6b8, #8000ff→#ee8e2e, #fff200→#fdf7ed, #ffe040→#fff6b8, #ffffff→#fdf7ed |
| `L_SFX_FIRE_STAR` | simplefx starburst re-used as the rune mine (source colours, pre-BASE) | #1030ff→#8f4029, #00a2e8→#ee8e2e, #99d9ea→#facb3e, #8000ff→#8f4029, #fff200→#fdf7ed, #ffffff→#fdf7ed |
| `L_SFX_POISON_DART` | simplefx arrow re-used as venom dart (source colours, pre-BASE) | #b97a57→#4ba747, #ffc90e→#97da3f, #c3c3c3→#c8ef7a, #ff7f27→#3d734f, #7f7f7f→#3d734f, #ffffff→#fdf7ed |
| `L_SFX_HOSTILE` | simplefx red orb burst + white slash arcs when they are ENEMY-owned (source colours) | #fe1515→#dc4a7b, #fe8f8f→#f78697, #ffc4c4→#fdd0d6, #ffffff→#f78697, #acb7c3→#dc4a7b, #000000→#222222 |
| `L_SFX_WHITE_ARCANE` | simplefx white slash crescent re-used as the boomerang blade (source colours) | #ffffff→#cfc0ff, #acb7c3→#8b7cf0 |
| `L_DW_ARCANE` | DevWizard Arcane Bolt / Magic Orb (moves arcane out of the reserved hostile pink band) | #76428a→#5956bd, #d77bba→#cfc0ff, #5b6ee1→#8b7cf0 |
| `L_DW_SPARKS_SHOCK` | DevWizard Magic Sparks as the shocked-status overlay | #76428a→#ee8e2e, #d77bba→#facb3e |
| `L_DW_LIGHT_SHOCK` | DevWizard Light Bolt as the chain-lightning body | #ffffff→#facb3e, #dbf9ff→#fff6b8, #fffdc9→#fdf7ed |
| `L_DW_PURE_ARCANE` | DevWizard Pure Bolt 2 as blink bolt / muzzle star | #ffffff→#cfc0ff, #b3f3ff→#fdf7ed |
| `L_EXPL16` | BitingChaos explosion (PICO-8 palette -> 0x72 master; removes hostile pink/crimson from a player-owned blast) | #ff004d→#df6026, #7e2553→#8f4029, #ffa300→#ee8e2e, #ffec27→#facb3e, #fff1e8→#fdf7ed, #5f574f→#483b3a |
| `L_GREY_BAKE` | CodeManu sheets: bake to greyscale luminance (keep alpha) so one runtime tint token colours them; drawn ADD | op: rgb := luma(rgb); pixels with luma < 0.06 -> alpha 0 |
| `L_BAT` | trashmobz bat cells | #000000→#222222, #002060→#314152, #004080→#417089, #0060c0→#5698cc, #ffffff→#fdf7ed, #ff0000→#da4e38, #800000→#62232f, #ffc0c0→#f78697, #ff8080→#dc4a7b |
| `L_CULTIST` | 0x72 doc_* -> crimson-hooded bone-masked cultist | #314152→#62232f, #417089→#9f294e, #111111→#222222 |
| `L_FROSTMAGE` | 0x72 orc_shaman_* -> pale frost shaman | #3d734f→#b6cbcf, #8f4029→#5698cc, #62232f→#314152, #d44e52→#72d6ce, #314152→#2a2a3a |
| `L_WRAITH` | 0x72 angel_* -> pale-teal spectre (rendered at alpha 0.85) | #fccba3→#b6cbcf, #e2b694→#72d6ce, #facb3e→#cae6f5, #ee8e2e→#72d6ce, #cae6f5→#fdf7ed, #5698cc→#3c9f9c, #72d6ce→#49a790 |
| `L_KNIGHT` | 0x72 big_zombie_* -> Ossuary Knight (bone body, iron darks, red crest) | #4ba747→#da4e38, #97da3f→#ee8e2e, #aa8d7a→#d3bfa9, #775c55→#aa8d7a, #483b3a→#775c55, #333333→#314152 |
| `L_GOLEM` | 0x72 big_demon_* -> Stone Golem (pale rune-stone, teal rune eyes/teeth) | #da4e38→#b6cbcf, #9f294e→#417089, #fdf7ed→#72d6ce |
| `L_LICH` | 0x72 necromancer_anim_* -> Archlich (crimson trim -> gold) | #9f294e→#facb3e |
| `L_PORTAL_HOSTILE` | Puny purple portal row 11 -> enemy spawn portal | #403074→#62232f, #523c88→#62232f, #6047ae→#9f294e, #7254c3→#9f294e, #a666eb→#dc4a7b, #e87cff→#f78697, #ffc0ff→#fdf7ed |
| `L_PUNY_STONE` | Puny grey block -> pedestal in the 0x72 stone ramp, + 1px #222222 outline bake | #79776d→#aa8d7a, #747167→#775c55, #6f6b61→#483b3a |
| `L_FLOOR_F2` | floor 2 "Drowned Halls": floor, walls, doors, columns, edge_down (tileset variant page) | #483b3a→#2f3b47, #775c55→#4a6272, #aa8d7a→#6f8fa0, #d3bfa9→#b6cbcf, #2b2929→#27313b, #3b3332→#27313b, #302c2b→#27313b, #21141b→#1a2230, #23151d→#1a2230 |
| `L_FLOOR_F3` | floor 3 "The Last Library": same slot set | #483b3a→#3e2a33, #775c55→#6b4450, #2b2929→#2e1f26, #3b3332→#2e1f26, #302c2b→#2e1f26 |
| `L_GEM_CYAN` | 0x72 weapon_green_magic_staff gem | #97da3f→#72d6ce |
| `L_GEM_YELLOW` | staff gem | #97da3f→#facb3e |
| `L_GEM_VIOLET` | staff gem | #97da3f→#8b7cf0 |
| `L_GEM_WHITE` | staff gem | #97da3f→#cae6f5 |
| `L_GEM_PLUM` | staff gem | #97da3f→#9f294e |
| `L_ICON_OAK` | icon W_Staff04 -> oak brown | #bbcde8→#d8a57d, #809cb3→#b58057, #687576→#8a503e, #3c6161→#62232f |
| `L_ICON_ARCHMAGE` | icon W_Staff06 -> gold + violet crystal | #e7f5ff→#fdf7ed, #e7f9ff→#fdf7ed, #d5e1e9→#facb3e, #b8bfc4→#ee8e2e, #6f818d→#8f4029, #00a2d5→#5956bd, #3acfff→#8b7cf0, #baeeff→#cfc0ff |
| `L_ICON_SHADOW` | icon A_Clothing01 -> shadow cloak | #fcfbfb→#cfc0ff, #e8e5e5→#8b7cf0, #cfc7c7→#5956bd, #b0a3a3→#5f2d56, #988787→#2a2a3a, #776161→#2a2a3a |

### G9. Coverage check

- `enemies`: 13/13 mapped · missing none · stale none
- `bosses`: 3/3 mapped · missing none · stale none
- `spells`: 18/18 mapped · missing none · stale none
- `modifiers`: 25/25 mapped · missing none · stale none
- `relics`: 26/26 mapped · missing none · stale none
- `wands`: 10/10 mapped · missing none · stale none
- `loadouts`: 4/4 mapped · missing none · stale none
- icon identity duplicates: none
