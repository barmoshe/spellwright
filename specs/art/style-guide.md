# Spellwright — `style-guide`

**Owner:** 2D Artist · **Status:** Wave 2, v1 ("source-before-style": the identity is locked *around* what was actually downloaded and inspected) · **Consumers:** Technical Artist (admission list, remap LUTs, bake rules → Wave 3 atlases), Animator (tint tokens, pixel integrity), UX Designer (UI treatment, contrast), Game Developer (blend/depth, token names), Audio Director (key-art pairing).
**Companion artifacts:** [`art-slot-map.md`](art-slot-map.md) + machine-readable [`art-slot-map.json`](art-slot-map.json) (every art slot → exact file/frames/LUT), [`ui-artwork.md`](ui-artwork.md) (UI states), `assets/src/art/spellwright_authored.png` (the few pixels no pack supplies; reproducible via `scripts/author-art.py`).
**Method:** every admitted sheet was opened and viewed upscaled (contact sheets, per-cell component bboxes, palette extraction); every contrast figure below is computed (WCAG relative luminance), not eyeballed.

---

## §1 The look in one paragraph

A dark, warm stone crypt drawn in **0x72 DungeonTileset II's** language: 16 px grid, chunky 1 px **`#222222` outlines** on every *world object*, flat 2–4 tone ramps, no dithering, no anti-aliasing. The room is uniformly lit (no darkness mask — readability first); mood comes from the low-value floor, wall-torch light pools and the magic itself. **Magic is light:** player spells are flat, outline-less, bright-cored shapes riding an additive glow. **Danger is ink:** everything that can hurt the player is an outlined, dark-cored disc or a pink-rimmed ground mark. The player should be able to squint at a frozen frame with 300 bullets and still sort *mine / theirs / floor* in under a second.

---

## §2 Palette

### 2.1 Master palette = the 0x72 palette (66 colours, measured)
Every remap target, authored pixel and UI tint must come from this list or from the FX extension ramp (§2.2). Load-bearing members:

| Role | Hex | Notes |
|---|---|---|
| Outline (world) | `#222222` | 25 873 px in 0x72 — the dominant colour. All admitted secondary packs remap `#000000 → #222222` (`L_OUTLINE`). |
| Void (pits) | `#0d0a10` | Darker than any outline: the only near-black *area* in the game = impassable. |
| Floor f1 (dominant / crack) | `#483b3a` / `#775c55` | L = 0.048 / 0.122 |
| Wall stone ramp | `#483b3a` `#775c55` `#aa8d7a` `#d3bfa9` | |
| Bone / highlight white | `#d3bfa9` / `#fdf7ed` | UI "white" is `#fdf7ed`, never `#ffffff` (except the FILL hit-flash token). |
| Warm | `#8f4029` `#c56025` `#df6026` `#ee8e2e` `#facb3e` | fire + gold |
| Cool | `#314152` `#417089` `#5698cc` `#72d6ce` `#cae6f5` `#b6cbcf` | frost + slate |
| Green | `#3d734f` `#4ba747` `#49a790` `#97da3f` | poison / slime |
| Violet | `#2a2a3a` `#5956bd` `#5f2d56` | arcane (+ ext below) |
| Crimson / pink (**reserved**) | `#62232f` `#9f294e` `#dc4a7b` `#f78697` | hostile signature (§4) |

### 2.2 FX extension ramp (the only non-0x72 colours; used by magic and hostile flicker)
`#8b7cf0` arcane mid · `#cfc0ff` arcane light · `#fff6b8` shock light · `#c8ef7a` poison light · `#fdd0d6` hostile flicker. Floor-theme variants (§6.2) add `#2f3b47 #4a6272 #6f8fa0 #27313b #1a2230` (f2) and `#3e2a33 #6b4450 #2e1f26` (f3).

### 2.3 Element colour language (player-owned) — hue **and** shape, never hue alone
Designer brief (`mechanic-spec` §14) honoured and made concrete:

| Element | Ramp dark → light → core | Shape family (16 px read) | Canonical sources |
|---|---|---|---|
| **Arcane** | `#5956bd` → `#8b7cf0` → `#cfc0ff` → `#fdf7ed` | **round** orbs / swirl darts | DevWizard Arcane Bolt / Magic Orb (`L_DW_ARCANE`), simplefx blue orbs (`L_SFX_ARCANE`) |
| **Fire** | `#8f4029` → `#df6026` → `#ee8e2e` → `#facb3e` | **teardrop** comet with trailing tongues | DevWizard Fireball / Firebomb (native), simplefx comet |
| **Frost** | `#417089` → `#5fcde4` → `#cae6f5` → `#fdf7ed` | **shard / lance** (long thin, hard-edged) | simplefx ice crystal, DevWizard Ice Lance |
| **Shock** | `#ee8e2e` → `#facb3e` → `#fff6b8` → `#fdf7ed` | **jagged** bolt / spiky star | DevWizard Light Bolt (`L_DW_LIGHT_SHOCK`), simplefx starbursts + lightning strips (`L_SFX_SHOCK`) |
| **Poison** | `#3d734f` → `#4ba747` → `#97da3f` → `#c8ef7a` | **droplet / dart / flask** | simplefx arrow (`L_SFX_POISON_DART`), 0x72 `flask_green`, simplefx drip bubbles |

Colour-blind check (deuteranopia/protanopia): fire vs poison and shock vs fire collapse in hue → resolved by shape (teardrop vs dart vs jagged) and by value (shock is the brightest ramp). Frost vs arcane collapse under tritanopia → shard vs orb.

### 2.4 Tint tokens (names are the contract; the dev maps names, never hexes)
Resolves the Animator's R5 placeholders (`state-graph-spec` §0):

| Token | Mode · value | Replaces placeholder |
|---|---|---|
| `flash` | FILL `#ffffff` | same |
| `frost-tint` | MULTIPLY `#8fd8ff` | same (accepted) |
| `chill-tint-1` / `chill-tint-2` | MULTIPLY `#cae6f5` / `#9fd0e8` | `#c8e8ff` / `#a8d8ff` |
| `telegraph-hot` | ADD ramp `#000000` → `#4a1526` → peak `#9f294e` in the lock window | `#7a2a14`→`#a8401c` (**changed**: orange is a player-fire colour; windups must glow in the hostile hue) |
| `invuln` | MULTIPLY `#b8b8c8` | same |
| `telegraph-fill` / `telegraph-rim` | `#dc4a7b` α 0.18 → 0.35 (last 150 ms) / **dual keyline**: 1 px `#fdd0d6` outside a 1 px `#222222` (min 4.40:1 on all 10 floor/wall colours) | new (decals) |
| `dash-ghost` | FILL `#5698cc` | new (afterimages) |
| `elite-gold` | `#facb3e` | new (elite outline + ground ring) |
| `door-locked` | MULTIPLY `#7a6a70` | new |
| `torch-light` | ADD `#ee8e2e` α 0.35 | new |
| rarity: `rar-common` `rar-uncommon` `rar-rare` `rar-legendary` | `#b6cbcf` · `#5698cc` · `#8b7cf0` · `#facb3e` | new (glows, card pips) |

---

## §3 Line, value, rendering, lighting

### 3.1 Outline & rendering rules
1. **World objects** (actors, props, pickups, enemy bullets): closed 1 px `#222222` outline, flat fills, ≤ 4 tones per material, light from top-left (0x72 convention).
2. **Player-owned magic** (projectiles, player FX): **no outline** (simplefx player frames get `L_DELETE_OUTLINE`), bright core, drawn NORMAL at depth 60 with an **ADD glow halo** at depth 61 (authored `glow_16/32/64`, tinted by element).
3. **Pure-light FX** (CodeManu sheets) are greyscale-baked (`L_GREY_BAKE`) and tinted at runtime, **ADD blend only**.
4. **UI** (§8) is its own material (Kenney slate/bronze); icons keep a `#222222` outline.

### 3.2 Value structure (squint test)
Floor tone band **L 0.029–0.048** (f3/f1), crack pixels ≤ 0.122. Every actor must satisfy **either** body mid-tone ≥ 1.8:1 vs its floor **or** a closed `#222222` outline plus ≥ 4 px at L ≥ 0.4 (eyes, bone, teeth). Walls sit at `#aa8d7a`/`#d3bfa9` on their top faces so the room boundary is always the brightest *static* shape — the only things brighter are magic and pickups.

### 3.3 Pixel density — one grid, three named exceptions
All art renders at **1 texel = 1 internal pixel** (640×360, `pixelArt: true`). No fractional scaling of any sprite with outlines. Sanctioned exceptions:
- **E1 — Boss-tier ×2.** `archlich` = 0x72 `necromancer_anim` at integer ×2 (v1 precedent). **v2** extends the same rule to the three mini-bosses, each the ×2 *captain* of its floor's test anchor: `grave_warden` = `orc_warrior` (the tomb_sentinel's sheet), `lantern_matron` = `pumpkin_dude` (the lantern_acolyte's), `iron_colossus` = `masked_orc` (the brute's). Conditions: integer ×2 only, boss tier only, every overlay on it also ×2 (or authored at the ×2 size, e.g. `shield_arc_r22`), and a palette LUT that separates it from its ×1 troops. No regular enemy is ever upscaled.
- **E2 — Transient light ×2/×3.** Explosion flipbooks (`expl16`) may render at integer ×2 (radius ≤ 32) or ×3; ≤ 400 ms, ADD, no outline.
- **E3 — Player projectile size steps.** `size_up` etc. snap the *visual* to ×1/×2/×3 (radius mult < 1.5 / < 2.5 / ≥ 2.5); hitboxes follow data exactly. Enemy bullets never scale (they have exact authored sizes).
- Animator R4's 1/8-quantized transient pulses (≤ 120 ms squash/stretch) are accepted. The **sustained** elite ×1.25 is not — see the objection in `art-slot-map.md`.

### 3.4 Lighting model
- Room fully lit at native values; **no RenderTexture darkness/light mask** (cost + it would darken enemy bullets). **v2 exception, the Dark twist only** (`rules.twists.dark`): a `#0d0a10` α 0.85 layer with authored *stepped* light cookies erased out (`light_r72` player, `light_r28` per spell), and every enemy drawn with its pre-baked `ring1` outline tinted `#fdf7ed` so threats stay readable in the dark. Enemy bullets draw **above** the dark layer (depth 62 stays on top): the twist hides the room, never a shot.
- Light *accents* only, all ADD sprites in the single ADD band (depth 61): wall torches (Puny torch 8 f + `glow_32` `torch-light`), player spell glows, pickup glows (rarity token), boss telegraph glow.
- One camera-level filter max (architecture §9): the low-HP vignette (UX/Animator). Bloom stays off by default.

---

## §4 Readability rules at 640×360 (the load-bearing section)

### 4.1 Friend vs foe projectiles — four independent channels
| Channel | Player projectile | Enemy projectile |
|---|---|---|
| **Value structure** | bright core, darker edge | **dark core, bright rim** |
| **Outline** | none | closed 1 px `#222222` |
| **Shape** | element shape family (dart, teardrop, shard, jagged, droplet); oriented to velocity | **always a perfect disc**, never rotates |
| **Blend / light** | NORMAL body + ADD element glow | NORMAL, **never glows** |
| **Hue** (supporting only) | element ramps; pink band excluded | arcane-hostile = pale-pink `#fdd0d6` rim around a crimson `#62232f` core (flicker `#fdf7ed`); frost/poison/fire use their element rim so the *effect* reads |

**Frost enemy shots** (the only enemy element with a player effect, `playerSlow`) keep the disc but their rim is **broken at the four diagonals** (segmented crystal ring) — the grayscale/CVD cue UX asked for (`accessibility-spec` §3), without giving an enemy shot the player's shard silhouette.

**Hostile hue exclusivity:** the crimson/pink band (`#62232f #9f294e #dc4a7b #f78697 #fdd0d6`, hue ≈ 330°–355°) appears on **nothing player-owned** — which is why DevWizard's arcane pink `#d77bba` is remapped to lavender and BitingChaos' explosion `#ff004d/#7e2553` to fire orange.
**Draw order:** enemy bullets draw at depth **62**, above the player ADD band (61), so 200 overlapping player glows can never wash an enemy bullet out. (Coordination ask to the Game Developer: add band 62 `enemyProjectiles` to `config.js`; cost = one extra blend switch per frame.)
**Contrast (computed, dual-keyline rule of `accessibility-spec` §3.1):** for every enemy-bullet frame and each of the 10 floor/wall colours of f1–f3, max(cr(`#222222`, f), cr(rim, f)) ≥ **3.55:1** (arcane `#fdd0d6`/`#fdf7ed` 4.40, frost `#72d6ce`/`#cae6f5` 3.55, poison `#97da3f`/`#c8ef7a` 3.60, fire `#facb3e`/`#fff6b8` 3.97). Rim alone vs the dominant floors: ≥ 6.2:1. Dark core vs floor ≈ 1.1:1 *by design* — the hollow-ring read. (v0 used `#f78697`/`#ee8e2e` rims; they failed on the `#775c55` crack tone and were raised.)
**Size honesty:** enemy bullet visual diameter = 2r+1 (7 / 9 / 13 px for radius 3 / 4 / 6); the hitbox sits inside the rim. Player visuals may exceed their hitboxes; enemy visuals never undersell theirs.

### 4.2 Ground marks
Anything on the floor that hurts the player carries the **`telegraph-rim` dual keyline** (1 px `#fdd0d6` outside 1 px `#222222`) + `telegraph-fill`. Player zones (toxic flask pool) use only their element rim — no pink. Slam/hazard/charge decals follow `boss_telegraph` in the slot map.

### 4.3 Interactive vs decorative
- Breakable = **the only warm wood-orange object** (0x72 `crate`). Indestructible props are stone (column, fountain, banners on walls).
- Pickups: a glow halo + a 1 px bob; nothing decorative glows except torches (which are on walls, never on the floor).
- Pits: `#0d0a10` void + `edge_down` lip on the north edge only. No texture inside a pit.
- Doors: lit (open) vs dim (`door-locked`) leaf; reward-kind badge above.

### 4.4 Enemies & elites
- Every enemy/boss has a unique silhouette (the palette-twin trap is avoided: `necromancer` ×1 purple vs `archlich` ×2 gold-trimmed; `stone_golem` = remapped `big_demon`, never shares a floor with a boss using the same sheet — none do).
- Elites: `elite-gold` 1 px outline baked around the sprite + gold ground ring; scale stays 1.0 (objection O-ART-1).
- Status overlays are sprites, not tints (Animator R5): burn flame at `head`, poison drip + stack numeral, **chill = 1–2 outlined frost-shard pips (`pip_chill_5`) at `head`** (tint is only the supporting cue — resolves the UX chill objection), shock sparks at `core`, frozen = `frost-tint` + ice shell.

### 4.5 Player
- The player is the **only blue-robed, white-bearded 16×28 figure**; no enemy uses a 0x72 hero sheet (knight/elf/lizard/dwarf are banned as enemies).
- Optional hitbox pip (Accessibility): 3×3 `#fdf7ed` + `#222222` ring at the hurtbox centre.

---

## §5 Pack admission (decided after viewing every sheet)

| Pack | Verdict | Why (concrete) | Used for |
|---|---|---|---|
| **0x72 DungeonTileset II** | **ADMITTED — anchor** | Defines outline, palette, grid, proportions | player, 11 of 13 enemies, all bosses, tiles, walls, doors, props, pickups, hearts |
| **simplefx (Emcee Flesher)** | **ADMITTED with remap** | Crisp 16 px, outlined, strong silhouettes; but MS-Paint primaries (`#1030ff`, `#ed1c24`) clash → `L_SFX_BASE` onto the master palette; outlines deleted where player-owned | ice shard, comet, thunder orb, rune mine, venom dart, boomerang, orbit/bounce orbs, status overlays, lightning arcs, slash arcs, pops |
| **trashmobz (Emcee Flesher)** | **ADMITTED — bat only** | Only animated bat anywhere; saturated `#0060c0` + pure black clash → `L_BAT` into the 0x72 slate ramp. Other mobs (mushroom, wasp, worm) rejected: 16 px full-cell bodies read 30 % bigger than 0x72 mobs and the design has no slot for them | `bat` |
| **DevWizard Pixelart Spells** | **ADMITTED** | Flat, outline-less DB32 shapes = exactly the player-magic grammar; arcane pink remapped (`L_DW_ARCANE`) | spark bolt, missile, fire bolt, fireball, frost lance, chain lightning, blink, shock sparks |
| **CodeManu Free Pixel Effects** | **ADMITTED — 5 sheets, greyscale-baked, ADD only** | Native-res pixel FX but sparkly/busy and 60-fps bloated; used only where a large soft read is the point | `10_weaponhit` (hit ring), `12_nebula` (blink/phase burst), `13_vortex`, `18_midnight` (player soul), `8_protectioncircle` (shield, summon sigil, cast glyph). Other 15 sheets rejected (noise, off-register loops) |
| **BitingChaos 16×16 explosion** | **ADMITTED with remap** | Clean 5-frame blast; PICO-8 crimson removed (`L_EXPL16`) | explosions (×2/×3, E2), crate break, sputter puff |
| **Puny Dungeon (Shade)** | **ADMITTED — props only** | Torch (8 f) and portal rings (10 f) are crisp and on-register; its grey-green tiles are flatter/lower-contrast than 0x72 → tiles rejected | wall torch, enemy spawn portal (`L_PORTAL_HOSTILE`), exit portal, pedestal (`L_PUNY_STONE`) |
| **7Soul1 496 RPG icons** | **ADMITTED — UI layer only** | Pastel-shaded with black outline: wrong for the world, right for 32 px cards; black → `#222222` | every spell/modifier/relic/wand icon (80 files) |
| **Kenney UI Pack Pixel Adventure — Thick outline** | **ADMITTED — the UI kit** | Slate + bronze reads as "arcane workshop", 16/32 px tiles, colour-corner state variants exist | panels, card frames, slot states, buttons, badges |
| **Kenney Fonts** | **ADMITTED — Pixel 16, High 16, Mini 8** | Crisp at native size, Latin-1 | all text; Future/Rocket/Blocks rejected (sci-fi register) |
| Kenney Tiny Dungeon | **REJECTED** | Warm brown/sand palette + 2 px chunky dark silhouette border + big-head proportions: a second art style next to 0x72 (viewed side by side). Its ghost/eye/cyclops singles are replaced by a remapped 0x72 `angel` (wraith) and an authored eye turret | — |
| Kenney Pixel UI Pack (9-slices) | **REJECTED** | Flat saturated fills (`#1ea7e1`, `#ffcc00`) with no outline — a mobile-casual register; the Adventure pack covers every state | — |
| Kenney 1-bit pack | **REJECTED** | 1-bit flat style | — |
| StarsteelGaming spell effects | **REJECTED** | Anti-aliased soft halos baked into 64×32 frames — visibly blurry next to 1 px outlines at ×3 | — |
| Kenney Particle Pack | **REJECTED** | 512 px photographic soft textures; the authored stepped `glow_*` halos replace them | — |
| Pixel Animated Spells (beddedOtaku) | **REJECTED** | Side-view (platformer) ground impacts — wrong perspective for top-down | — |
| oga pixel projectiles | **REJECTED** | Sci-fi register (bullets, BFG) | — |

**Authored (project-original):** enemy bullets (24 frames), glow halos 16/32/64, slimelet (2 poses), Watcher Eye (2 poses), shadow ellipses, pit void — `assets/src/art/spellwright_authored.png` via `scripts/author-art.py`; UI card frames, element glyphs, HUD glyphs, pips, shield hex, bag, keycap, reticle, bar 9-slice, hatch, slash — `assets/src/art/spellwright_ui.png`; 16 px icon pass — `assets/src/art/icons16.png` (both via `scripts/author-ui-art.py`). Provenance for the TA's `LICENSES.md`: "Spellwright original art"; every downloaded source's author/licence is in `art-slot-map.json → sources`.

---

## §6 Environments

### 6.1 Room recipe
Floor = `floor_1` 60 % + 7 crack variants (never two cracked tiles orthogonally adjacent) · walls = `atlas_walls_high` 3×3-minimal blob, 16 px overhang on the wall-top band · north-wall decor ≤ 1 per 6 tiles (banners / holes / fountains), torches every 6–8 tiles in mirrored pairs flanking doors · pillars = 0x72 `column` (16×48, y-sorted) · pits = void + `edge_down` lip · crates = 0x72 `crate`.

### 6.2 Floor themes (tileset LUT variants — tiles only, never actors)
| Floor | Name | LUT | Floor mid L | Accent decor |
|---|---|---|---|---|
| f1 | The Sunken Crypt | native | 0.048 | red banners, wall holes |
| f2 | The Drowned Halls | `L_FLOOR_F2` (cold slate) | 0.042 | blue banners, blue fountains, goo |
| f3 | The Last Library | `L_FLOOR_F3` (wine-brown) | 0.029 | yellow + red banners |
Every hostile rim stays ≥ 3:1 on all three (checked; f3 is the easiest, f1 the hardest).

---

## §7 Characters (summary; exact frames in the slot map)
- **Player:** `wizzard_m` / `wizzard_f` by loadout; no cast/death frames exist → cast = held wand + muzzle flash + kick; death = hit frame, white flash, stepped fade, `18_midnight` soul release, dropped wand.
- **Enemies:** skeleton `skelet` · cultist `doc`+`L_CULTIST` (crimson hood, bone beak) · frost mage `orc_shaman`+`L_FROSTMAGE` (pale frost shaman) · brute `masked_orc` (skull mask = "Grave") · slime `swampy` · slimelet **authored** · fire imp `imp` · watcher eye **authored** · wraith `angel`+`L_WRAITH` @ α 0.85 · necromancer `necromancer_anim` · skull `skull` + possessed glow · stone golem `big_demon`+`L_GOLEM` · bat trashmobz+`L_BAT`.
- **Bosses:** Ossuary Knight `big_zombie`+`L_KNIGHT` (bone warden, red crest, knight sword overlay) · Mire Queen `ogre` native (swamp-green hulk) · Archlich `necromancer_anim` ×2 + `L_LICH` (gold trim, staff overlay).

---

## §8 UI treatment (full states in `ui-artwork.md`)
Two Kenney materials for panels and buttons: **slate** (`#515f6b #637585 #647685 #778d9f #94afc6`) = neutral chrome; **bronze** (`#6d4b27 #a3703a #c58747`) = modifiers & primary actions. **Card cells** are authored (`assets/src/art/spellwright_ui.png`): four frame *silhouettes* (rounded gem / chamfered / double-line / arrow-notch) at 36 and 18 px so card type reads in grayscale (UX `wand-editor-ux` §2.2); **16 px mini-icons** for all 43 cards, 26 relics, 10 wands and 5 reward kinds are an authored reduction pass (`assets/src/art/icons16.png`), not a runtime resample. Text never sits on mid slate (`#fdf7ed` on `#647685` = 4.41:1, fails AA) — panels are frame-only tiles over a `#2a2a3a` fill (13.2:1; `#b6cbcf` dim text 8.3:1 ≥ the 7:1 T-small floor), and every glyph is baked with a 1 px `#222222` stroke. The error red is `#ff6b5e` (UX token; off-ramp, outside the hostile band, 5.0:1 on `#2a2a3a`).

## §9 Do / Don't (real files)

| Do | Don't |
|---|---|
| Enemy bolt = `ebullet_arcane_7_f0` (authored): outlined, dark core, pink rim | Use simplefx red orb r3 c7 (`#fe1515`, bright core) as an enemy bullet — it has the *player* value structure |
| Spark bolt = DevWizard `Arcane Bolt.png` through `L_DW_ARCANE` (lavender) | Ship `Arcane Bolt.png` native — its `#d77bba` sits in the reserved hostile pink band |
| Explosion = `expl16` through `L_EXPL16` at ×2 | Ship `explosion.png` native — `#ff004d` reads as an enemy blast |
| Wraith = 0x72 `angel_*` through `L_WRAITH` | Drop Tiny Dungeon tile 121 (ghost) next to 0x72 mobs — 2 px silhouette border, different proportions |
| Glow = authored `glow_32` stepped rings, ADD | Kenney Particle Pack `*.png` downsampled — soft gradients become mushy mixels |
| Player projectile from simplefx → `L_DELETE_OUTLINE` | Keep simplefx's black outline on a player shard — outline is the *enemy* grammar |
| Pit = `#0d0a10` + `edge_down` | A textured dark floor tile as a pit — reads as walkable shadow |
| Icon on card = 7Soul1 `S_Fire01.png` + `L_OUTLINE` on `#2a2a3a` inside `card_spell_36` | Icon on raw `#647685` slate — pastel icon loses its edge |
| HUD mini icon = `icons16.png` frame `icon16_S_Fire01` | `setScale(0.5)` on the 34 px icon at runtime — drops the outline and half the silhouette |
| Elite = baked `elite-gold` outline, scale 1.0 | `setScale(1.25)` on a 16 px outlined sprite — 4 duplicated texel rows/cols wobble |
| Boss telegraph = decal + ADD `telegraph-hot` + 1/8 pulse | Invent attack frames by rotating the boss body (Animator R4 forbids non-90° character rotation) |

---


## §11 v2 visual language (Wave A2)

### 11.1 Defences — each has a distinct *shape* in the world and one 7×7 icon in the UI
| Defence | World read (pre-baked frames, no per-sprite shader) | Wear / state cue | Break | UI icon |
|---|---|---|---|---|
| **Shield** (frontal 150°, pierce) | a held steel shield on the facing side (simplefx shields through `L_SFX_STEEL`) + a **150° bubble arc** (`shield_arc_r10…r22`, dual keyline `#222222`/`#72d6ce`+`#cae6f5`) at α 0.5 | shield overlay steps **fresh → worn → cracked** at ⅓ / ⅔ of `wearBlocks`; each block flashes the `_hit` arc for 2 steps + grey `block_spark` | steel debris + "BROKEN" | `def_shield` (tower shield) |
| **Armour** (blast) | a **plate bar** above the head: `#222222` keyline, `#b6cbcf` fill, a `#417089` notch every 25 % | drains with points; direct hits throw 1 `armour_chip`, blasts throw 3 and flash the bar | steel debris + "BROKEN" | `def_armour` (breastplate) |
| **Ward** (shock) | **rune pips** 3 px above the head, one per hit (max 6, two rows for the Matron) | 3 pip states: **full** (lit cyan, white core) · **spent** (hollow keyline) · **regrow** (dim cross) | chain-arc flash across the pips | `def_ward` (rune ring) |
Enemy wards are *only* pips — never the protection-circle ring, which stays the player's warding-sigil shield.

### 11.2 Elite affixes — never colour-only
Every elite gets (1) a pre-baked **outline ring** (`ring1`; `ring2` for a second affix at Heat 2+) tinted by the affix token, (2) its **7×7 glyph** persistently 3 px above the sprite, and (3) the **title** for 1.5 s (UX). Tokens, all ≥ 3.28:1 on every floor tone (min over the 6 floor/crack colours): steel `#b6cbcf` (armoured, plate glyph) · cyan `#72d6ce` (warded, rune glyph) · bone `#e2b694` (shielded, tower-shield glyph) · gold `#facb3e` (hasted, wing glyph) · ember `#ffad3b` (volatile, death-ring glyph). Steel vs cyan and gold vs ember are near in hue on purpose — the glyph is the identity, the colour is redundant. The gold ground ring (Animator R10) still marks "elite".

### 11.3 Card levels
- **Level 2** (`*_2`): the same icon and projectile as the base (one identity), plus **2 pips** (2×2) on the frame's top edge, "II" in the name, and +0.15 α on the projectile glow.
- **Evolved** (6): a new projectile *and* a new icon, a **★ badge** (7×7, top-left), **gold corner brackets** on the card frame, and a **double glow** in the world (element glow + a `#fdf7ed` inner glow_16) — the only player projectiles with two glows, so an evolution reads at a glance mid-fight.

### 11.4 Relic classes
Duo = UX DUO chip + both parent icons; pedestal shows two element glows. **Corrupted** = `g_corrupt_7` (a cracked plum seal) on the icon cell, pedestal *dimmed* (MULTIPLY `#5f2d56`) rather than lit. Corrupted is the player's own risk, so it never uses the hostile pink band.

### 11.5 New actors
`tomb_sentinel` = `orc_warrior` + `L_SENTINEL` + a steel shield larger than its head + a spear (the shield *is* the silhouette). `lantern_acolyte` = `pumpkin_dude` native + a `torch-light` glow (its lantern head also lights the Dark twist; it never shoots, so orange can't be misread as fire magic). Mini-bosses per E1. Enemy bullets add an **11 px** size (radius 5), and the size rule is now *nearest size up* (visual ⊇ hitbox + 1 px).

### 11.6 UI & touch
Door threat icons (16 px) share the shapes of the 7×7 defence icons; risk = amber diamond with `!` (the warn colour), unknown = `?`. Touch buttons are `#2a2a3a` discs/squares with a `#222222` keyline and a `#778d9f` inner ring (pressed: `#515f6b` body + `#fdf7ed` ring); touch icons are monochrome `#fdf7ed` silhouettes with an auto-drawn `#222222` keyline. App icon = the hero wizard at ×2 over an arcane glow on `#2a2a3a` (full-bleed, so the maskable safe zone holds the figure).

## §12 Worlds (addendum: "at least 2 worlds" — 3 delivered, all fully distinct)

**Rule:** a world changes **material, silhouette of the props, and light** — not just a hue. Every world keeps the same hand (0x72 construction, `#222222` outlines, 16 px grid, the floor value band L ≤ 0.05) so the enemy-bullet and hostile-band rules of §4 hold in all three. Frame lists: `art-slot-map.json → worlds`, `world_cards`.

| | **W1 The Sunken Crypt** | **W2 The Drowned Halls** | **W3 The Last Library** |
|---|---|---|---|
| Palette shift | native 0x72 warm brown stone (floor `#483b3a`) | cold slate `L_FLOOR_F2` (floor `#2f3b47`, walls `#6f8fa0`/`#b6cbcf`) | wine-brown `L_FLOOR_F3` walls; **dark parquet** floor (`#3e2a33` / gaps `#2e1f26` / worn `#4d3238`) |
| Floor material | cracked flagstones | wet slate + dim moss patches (12 %) + **shallow water** tiles (animated, lighter, shimmering) | **wood parquet** (authored `floor_w3_a/b/c`) |
| Walls | brick + red banners | slate + **sewer drains** (Puny drain, `L_PUNY_DRAIN`) + **wall drips** + goo, blue banners, blue fountains | stone + **bookshelves on every north face** (`wall_shelf`), yellow banners |
| Pits | void `#0d0a10` | **deep water** (darker, slow ripples; still the darkest thing = impassable) | void |
| Signature props | candles, bone piles, cobwebs, crates, columns | drains, drips, moss, fountains | **bookshelves** (breakable tile; burning + collapsed states), candelabras, scroll piles, book piles, lecterns, **rune circles** |
| Light mood | warm candle pools (candlelight twist: ambient 0.55, light cookies per candle) | cold cyan: `#72d6ce` glows at drains/fountains; only lanterns are warm | candle-gold `#facb3e` + static arcane-violet rune glows |
| Native art | bone_archer (dusty skeleton + bow) | drowned_thrall (slate zombie + algae), mire_leech (brown slug-leech) | animated_armor (steel knight, halberd), bound_tome (authored grimoire), ink_imp (violet imp) |

### 12.1 Readability guards (checked)
- Shallow water (`#314152` base) is **lighter** than deep water/pits (`#1a2230`) and animated; pits stay the darkest area in every world.
- Moss and rune decals use only dim tones (`#27313b`/`#3d734f`, violet at α ≈ 0.6) — never the bright player-element or hostile tones, so no floor decal is mistaken for a projectile or a danger mark.
- Book spines exclude the hostile pink band and the bright element tones.
- Bookshelf fire uses fire colours: it is fire *the player* lit (it never hurts the player — `rules` note).

### 12.2 Sourcing decision
The admitted packs plus authored pixels cover all three biomes, so **no new download is required**. I checked three candidates before deciding:
- OGA "16x16 Dungeon Tiles" (ETTiNGRiNDER): CC0, but rejected on style (rounded grey blocks, different hand).
- Kenney "Roguelike Indoors": CC0, but rejected on style (bright, domestic, no outlines).
- OGA "Sewer tileset" (MrBeast): rejected on licence (CC-BY 3.0 / GPL 2.0).

### 12.3 World variants of an archetype
Same behaviour, same silhouette: `ink_imp` is `fire_imp`'s sheet re-inked, so the bomber telegraph is learned once. A new behaviour gets a new silhouette.

### 12.4 One hero sheet as an enemy
`animated_armor` uses 0x72 `knight_m` (16×28, the player's size). It is the one exception to the no-hero-sheets rule, and only through `L_ARMOR`: grey steel, no hat, a dark empty visor, a crimson plume and a halberd. So it shares no colour and no head shape with the blue-robed, pointy-hatted, white-bearded wizard.

## §10 DOG self-check (style-definition-and-guide)
- **Another artist can produce on-style work from this:** palette, outline rule, value band, shape families, LUT recipe, and exemplar files are all explicit. ✔
- **Falsifiable claims** (reviewers can disprove): every v2 elite shows glyph + outline (never colour alone); every defence has a distinct world shape; every data id including v2's 42 spells / 37 relics / 6 bosses / 5 affixes / 3 modes / 25 forge recipes / door threats maps (builder exit 0); every enemy bullet is a closed-outline dark-core disc with rim ≥ 3:1 on all floors; no player-owned pixel falls in the reserved pink band after LUTs; no outlined sprite renders at a non-integer sustained scale except E1–E3; every data id has a slot (`art-slot-map.md` §G9). ✔
