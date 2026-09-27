# Spellwright — Asset Inventory (Wave 1, source-before-style)

**Owner:** Technical Artist · **Artifact:** `asset-inventory` (ad-hoc; feeds `style-guide` slot mapping → Wave 3 `atlas` / `asset-manifest` / `LICENSES.md`)
**Produced by:** `scripts/fetch-assets.sh` (idempotent, sha256-pinned; clean run 2026-09-27, 184 MB under `assets/_downloads/`, gitignored via `.gitignore`)
**Method:** every sheet below was opened and inspected (upscaled contact sheets + per-cell alpha occupancy maps + alpha-bbox measurement). Frame grids are measured, not assumed. Where a sheet's row semantics could not be determined by eye, it is flagged **[verify in Wave 3]**.

Paths are relative to `assets/_downloads/`.

---

## 0. Recommendations up front

- **Pixel scale:** 16×16 world grid. **Internal canvas 640×360** (40×22.5 tiles), integer-scaled ×2 (720p) / ×3 (1080p) / ×4 (1440p) / ×6 (4K). 480×270 reads bigger but has no integer factor for 1440p; 640×360 covers every common 16:9 display integer-only. All selected art is native 1:1 pixel density — **no fractional scaling of any source** (icons at 34 px, UI at 16/32 px and FX at their native px all sit on the same pixel grid).
- **Style anchor:** 0x72 DungeonTileset II (hero, enemies, bosses, tiles, props). Everything else is chosen to sit near its dark-outline, muted-stone palette. Style-risk items are flagged for the 2D Artist.
- **Do not use:** Kenney Particle Pack as-is (512×512 soft photographic textures — not pixel art; only usable if downsampled to ≤32 px additive glow halos, 2D Artist's call). StarsteelGaming FX are soft/anti-aliased — style risk.

---

## 1. Packs acquired

| # | Pack dir | License | Author | Source page | Direct URL(s) |
|---|---|---|---|---|---|
| 1 | `0x72_dungeontileset-ii` | CC0 1.0 | 0x72 | https://0x72.itch.io/dungeontileset-ii | commit-pinned mirror `raw.githubusercontent.com/late-parrot/patch-notes/256dc22…/assets/dungeon-tileset/*` (see note) |
| 2 | `kenney_tiny-dungeon` | CC0 1.0 | Kenney | https://kenney.nl/assets/tiny-dungeon | `kenney.nl/media/pages/assets/tiny-dungeon/f8422efb44-1674742415/kenney_tiny-dungeon.zip` |
| 3 | `kenney_1-bit-pack` | CC0 1.0 | Kenney | https://kenney.nl/assets/1-bit-pack | `…/1-bit-pack/aa867a1f37-1677578516/kenney_1-bit-pack.zip` |
| 4 | `kenney_pixel-ui-pack` | CC0 1.0 | Kenney | https://kenney.nl/assets/pixel-ui-pack | `…/pixel-ui-pack/821e760f21-1677661508/kenney_pixel-ui-pack.zip` |
| 5 | `kenney_ui-pack-pixel-adventure` | CC0 1.0 | Kenney | https://kenney.nl/assets/ui-pack-pixel-adventure | `…/ui-pack-pixel-adventure/405ba5278a-1729196257/kenney_ui-pack-pixel-adventure.zip` |
| 6 | `kenney_fonts` | CC0 1.0 | Kenney | https://kenney.nl/assets/kenney-fonts | `…/kenney-fonts/8d5435c213-1677661710/kenney_kenney-fonts.zip` |
| 7 | `kenney_particle-pack` | CC0 1.0 | Kenney | https://kenney.nl/assets/particle-pack | `…/particle-pack/f8fe0f8cb8-1677578741/kenney_particle-pack.zip` |
| 8 | `kenney_rpg-audio` | CC0 1.0 | Kenney | https://kenney.nl/assets/rpg-audio | `…/rpg-audio/8e99002d76-1677590336/kenney_rpg-audio.zip` |
| 9 | `kenney_impact-sounds` | CC0 1.0 | Kenney | https://kenney.nl/assets/impact-sounds | `…/impact-sounds/87b4ddecda-1677589768/kenney_impact-sounds.zip` |
| 10 | `kenney_interface-sounds` | CC0 1.0 | Kenney | https://kenney.nl/assets/interface-sounds | `…/interface-sounds/fa43c1dd4d-1677589452/kenney_interface-sounds.zip` |
| 11 | `kenney_ui-audio` | CC0 1.0 | Kenney | https://kenney.nl/assets/ui-audio | `…/ui-audio/490d233f68-1677590494/kenney_ui-audio.zip` |
| 12 | `kenney_sci-fi-sounds` | CC0 1.0 | Kenney | https://kenney.nl/assets/sci-fi-sounds | `…/sci-fi-sounds/6b296f9ecf-1677589334/kenney_sci-fi-sounds.zip` |
| 13 | `kenney_music-jingles` | CC0 1.0 | Kenney | https://kenney.nl/assets/music-jingles | `…/music-jingles/f37e530b9e-1677590399/kenney_music-jingles.zip` |
| 14 | `oga_pixel-art-spells` | CC0 1.0 | DevWizard | https://opengameart.org/content/pixel-art-spells | `opengameart.org/sites/default/files/pixelart_spells_1.zip` |
| 15 | `oga_spell-effects-starsteel` | CC0 1.0 | StarsteelGaming | https://opengameart.org/content/spell-effects-by-starsteelgaming | `…/files/Spell%20Effects.zip` |
| 16 | `oga_pixel-projectiles` | CC0 1.0 | davidaf3 | https://opengameart.org/content/set-of-pixel-art-projectiles | `…/files/projectiles_1.zip` |
| 17 | `oga_free-pixel-effects-pack` | CC0 1.0 | CodeManu | https://opengameart.org/content/free-pixel-effects-pack | `…/files/Free%20Pixel%20Effects%20Pack.zip` |
| 18 | `oga_pixel-animated-spells` | CC0 1.0 | beddedOtaku | https://opengameart.org/content/basic-pixel-animated-spells | `…/files/Pixel%20Animated%20Spells.zip` |
| 19 | `oga_16x16-explosion` | CC0 1.0 | BitingChaos | https://opengameart.org/content/16x16-explosion | `…/files/explosion_4.zip` |
| 20 | `oga_simple-fantasy-rpg-fx` | CC0 1.0 | Emcee Flesher | https://opengameart.org/content/16x16-simple-fantasy-rpg-fx | `…/files/simplefx-alpha.png` |
| 21 | `oga_trash-mobs-16` | CC0 1.0 (dual CC0/OGA-BY; CC0 taken) | Emcee Flesher | https://opengameart.org/content/16x16-fantasy-rpg-trash-mobs-animated | `…/files/trashmobz-alpha.png` |
| 22 | `oga_torch-16` | CC0 1.0 | Natural_Privateer | https://opengameart.org/content/simple-torch-animation-16x16 | `…/files/torch_anim.png` |
| 23 | `oga_puny-dungeon` | CC0 1.0 | Shade | https://opengameart.org/content/16x16-puny-dungeon-tileset | `…/files/punyworld-dungeon-tileset.png` |
| 24 | `oga_496-rpg-icons` | CC0 1.0 | Henrique Lazarini (7Soul1) | https://opengameart.org/content/496-pixel-art-icons-for-medievalfantasy-rpg | `…/files/496_RPG_icons.zip` |
| 25 | `oga_80-cc0-rpg-sfx` | CC0 1.0 | rubberduck | https://opengameart.org/content/80-cc0-rpg-sfx | `…/files/80-CC0-RPG-SFX_0.zip` |
| 26 | `oga_80-cc0-creature-sfx` | CC0 1.0 | rubberduck | https://opengameart.org/content/80-cc0-creature-sfx | `…/files/80-CC0-creature-SFX_0.zip` |
| 27 | `oga_magic-sfx-virix` | **CC-BY 3.0** | ViRiX Dreamcore (David McKee) | https://opengameart.org/content/magic-sfx-sample | `…/files/Magic%20SFX%20Preview%20Pack.zip` |
| 28 | `oga_fantasy-sound-library` | **CC-BY 3.0** | Little Robot Sound Factory | https://opengameart.org/content/fantasy-sound-effects-library | `…/files/Fantasy%20Sound%20Library.zip` |
| 29 | `oga_music-cc0` | CC0 1.0 | HydroGene; pmiller | …/8-bit-perilous-dungeon ; …/chiptune-battle-music | `…/files/8-bit_perilous_dungeon_0.mp3`, `…/files/battle_music_01-loop.ogg` |
| 30 | `incompetech_music` | **CC-BY 4.0** | Kevin MacLeod | https://incompetech.com/music/royalty-free/ | `incompetech.com/music/royalty-free/mp3-royaltyfree/<Title>.mp3` ×6 |

**Attribution required (CC-BY) — carry verbatim into `LICENSES.md` + in-game Credits in Wave 3:**
- ViRiX: *"Some of the sounds in this project were created by ViRiX Dreamcore (David Mckee) www.soundcloud.com/virix"* (author-requested form), CC-BY 3.0.
- Little Robot Sound Factory — www.littlerobotsoundfactory.com (author-requested), CC-BY 3.0.
- Kevin MacLeod: *"<Title>" Kevin MacLeod (incompetech.com), Licensed under Creative Commons: By Attribution 4.0 License* — per track actually shipped.
CC0 packs: credit as courtesy (0x72, Kenney, 7Soul1, Emcee Flesher, CodeManu, DevWizard, Shade, rubberduck …).

**Provenance notes**
- **0x72 mirror:** itch.io's free-download flow mints session-signed, expiring CDN URLs (probed: `POST /download_url` → per-session key; the `/file/<id>` endpoint rejects replay), so there is no stable direct URL. The four v1.7 files are pulled from a commit-pinned GitHub mirror. Integrity evidence: four independent repos (`late-parrot/patch-notes`, `anthrich/uncanny-dodge`, `CodyAirey/GodotDungeonGeneration`, `ossi1801/wizard_game_gd`) serve a **byte-identical** atlas (sha256 `b222e563f9006e60…`, 512×512). CC0 permits redistribution. Canonical credit remains the itch page.
- **Evaluated and dropped:** OGA "pixel-fx-pack" (CodeManu) — sheets 1–10 are sha256-identical to Free Pixel Effects Pack 1–10. Rejected on license: Spell Sounds Starter Pack (CC-BY-SA/GPL), Elemental Charge Effects (CC-BY-SA/GPL), Animated Projectiles (CC-BY-SA), Eman Quest monsters (CC-BY-SA), Painterly Spell Icons (CC-BY-SA/GPL). Rejected on access: DungeonTileset II Extended (Niji, CC0) — itch-only, no stable URL. Kenney Tiny Dungeon's duplicate `simplefx-alpha_0.png` dropped (same bytes).

---

## 2. Per-file detail

### 2.1 `0x72_dungeontileset-ii/` — CORE (hero, enemies, bosses, tiles, props)

| File | Dims | Notes |
|---|---|---|
| `0x72_DungeonTilesetII_v1.7.png` | 512×512 | Packed sheet; **not a uniform grid** — sprite rects come from `tile_list_v1.7` (370 lines: `name x y w h`). Background transparent. |
| `tile_list_v1.7` | 370 rects | Canonical frame list. Animation frames suffixed `_anim_fN` or `_fN`. |
| `atlas_floor-16x16.png` / `atlas_walls_low-16x16.png` / `atlas_walls_high-16x32.png` | small | v1.7 3×3-minimal autotile sets (walls-high: 16×32 tiles drawn with Y-offset 8, per README). |

**Upstream data bugs found (Wave 3 slicer must patch):**
1. `zombie_anim_f10 368 136` — typo, should be `zombie_anim_f0`.
2. `wall_edge_top_left 31 120 16 16` — off-by-one; x must be **32** (verified: column 31 is fully transparent, column 47 holds the tile's right edge, so x=31 clips it).

Sprites (all measured from `tile_list`; frame counts = number of `_fN` entries; atlas visually confirmed):

| Slot | Sprite key(s) | Frame size | Animations |
|---|---|---|---|
| **Player** | `wizzard_m_*`, `wizzard_f_*` | 16×28 | idle 4, run 4, hit 1 |
| Player alt/NPC | `knight_*`, `elf_*`, `lizard_*`, `dwarf_*` (m/f) | 16×28 | idle 4, run 4, hit 1 |
| Enemy | `goblin_idle/run` | 16×16 | 4 / 4 |
| Enemy | `imp_idle/run` | 16×16 | 4 / 4 |
| Enemy | `skelet_idle/run` | 16×16 | 4 / 4 |
| Enemy | `tiny_zombie_idle/run` | 16×16 | 4 / 4 |
| Enemy | `zombie_anim`, `ice_zombie_anim` | 16×16 | 4 (single loop) |
| Enemy (slime-type) | `muddy_anim` (brown), `swampy_anim` (green) | 16×16 | 4 |
| Enemy | `tiny_slug_anim` 16×16; `slug_anim` 16×23 | | 4 |
| Enemy | `masked_orc_*`, `orc_warrior_*` | 16×23 | 4 / 4 |
| Enemy (caster) | `orc_shaman_*` | 16×23 | 4 / 4 |
| Enemy (caster) | `necromancer_anim` | 16×23 | 4 |
| Enemy (demon) | `chort_*`, `wogol_*` | 16×23 | 4 / 4 |
| Enemy / elite | `pumpkin_dude_*`, `doc_*` 16×23; `angel_*` 16×16 | | 4 / 4 |
| **Boss** | `big_demon_idle/run` | 32×36 | 4 / 4 |
| **Boss** | `ogre_idle/run` | 32×36 | 4 / 4 |
| **Boss** | `big_zombie_idle/run` | 32×36 | 4 / 4 |
| Floor | `floor_1..8`, `floor_ladder`, `floor_stairs`, `hole`, `edge_down` | 16×16 | 1 |
| Hazard | `floor_spikes_anim` | 16×16 | 4 |
| Walls | `wall_*` (top/mid/left/right, outer_*, edge_*, tshape_*), `wall_hole_1/2`, `wall_goo(+_base)`, `wall_banner_{red,blue,green,yellow}` | 16×16 | 1 |
| Wall fountain | `wall_fountain_top_1..3`; `wall_fountain_mid_{red,blue}_anim`, `wall_fountain_basin_{red,blue}_anim` | 16×16 | 3 |
| Door | `doors_leaf_closed`, `doors_leaf_open` 32×32; `doors_frame_left/right` 16×32; `doors_frame_top` 32×16 | | 1 each (open/close is a 2-state swap) |
| Props | `column`, `column_wall` 16×48; `crate` 16×24; `skull` 16×16; `bomb_f0..2` 16×16; `lever_left/right`; `button_{red,blue}_{up,down}` | | |
| Chests | `chest_empty_open_anim`, `chest_full_open_anim`, `chest_mimic_open_anim` | 16×16 | 3 each |
| Pickups | `coin_anim` 6×7 (4 f); `ui_heart_{full,half,empty}` 13×12; `flask_{red,blue,green,yellow}` + `flask_big_*` 16×16 | | |
| Held wand | `weapon_red_magic_staff`, `weapon_green_magic_staff` | 8×30 | 1 (rotate in-hand) |
| Other weapons | 27 × `weapon_*` (5×22 … 16×24) | | 1 |

### 2.2 `oga_trash-mobs-16/trashmobz-alpha.png` — supplementary enemies
256×128, uniform **16×16 grid, 16 cols × 8 rows**, black-outlined, saturated palette (same author as simplefx). Occupancy verified per cell; visual read:
- rows 0–3, cols 0–1: green **slime**, 2 frames × 4 rows; cols 2–3: worm, 2×4; cols 4–5: blue **bat**, 2×4; cols 6–7: red mushroom, 2×4; cols 8–11: wasp, 4×4; cols 12–15: row 0 red rat, rows 1–3 red salamander/lizard, 4 frames.
- rows 4–7: cols 0–1 snake/moth 2×4; cols 3–4 (rows 6–7) wasp larva; cols 6–8 mushroom 3×4; cols 10–11 bat 2×4; cols 12–13 wasp 2×4; cols 14–15 moth 2×4.
- Row-to-facing mapping (down/left/right/up?) **[verify in Wave 3]**. Style: brighter than 0x72 — 2D Artist to accept or palette-shift.

### 2.3 `kenney_tiny-dungeon/` — supplementary single-frame sprites
`Tilemap/tilemap_packed.png` 192×176 = 12×11 grid of 16×16 (`tilemap.png` 203×186 has 1 px spacing); also `Tiles/tile_NNNN.png` singles (index = row×12+col). Single frames only (animate with tween bob/squash). Style: thick dark silhouette border — **different outline treatment from 0x72** (risk).
Useful indices (viewed): 84 wizard; 108 green slime-ghost; 109 cyclops; 110 red crab-demon; 111 hooded shaman; **120 bat; 121 ghost; 122 spider; 123/124 rats**; 89–92 chests incl. mimic; 113–116 & 125–128 potions; **129/130 gem-tipped wands**; 0–83 stone/dirt tiles, doors (dungeon arch door sets), gargoyle wall fountain (tiles ~7–8/19–20 region).

### 2.4 `oga_puny-dungeon/punyworld-dungeon-tileset.png` — props / portal
416×320 = 26×20 grid of 16×16. Right block (cols 16–25), viewed:
- row 0: **wall torch, 8 frames** (cols 16–23).
- rows 2–3: vertical fire-beam hazard 16×32, 10 frames (last 5 are fade-out); rows 4, 5: horizontal fire beam 16×16, 10 frames.
- row 6: saw blade 9 frames; row 7: floor spikes 6 frames; row 8: arrow 4 f + golden key 6 f.
- **rows 9 / 10 / 11: portal ring cyan / green / purple, 10 frames each** (f0–3 full ring spin, f4–7 collapse, f8–9 sparkle burst) → room-exit portal & spawn telegraph.
- row 12 spike roller; row 13 boulder 8 f; rows 17–19 chests, levers, barrels, **urn/pot** (col 23 row 19).
- Left block: grey-stone floors/walls, stairs (rows 17–18 area) — secondary tileset.

### 2.5 `oga_torch-16/torch_anim.png`
48×32 = 3×2 grid of 16×16, **5 frames** (cell r1c2 empty). Alternate torch.

### 2.6 Spell projectiles & FX

**`oga_simple-fantasy-rpg-fx/simplefx-alpha.png`** — 256×208 = 16×13 grid of 16×16, black-outlined, crisp. **Best fit for projectiles/hits.** Viewed:
- r0: green heal/poison burst c0–4 (5 f); shield outline c5; poison bubbles c6–7 (2 f); horizontal lightning c8–11 (2 frames × 32 px wide); blue-yellow star burst c12–13 (2 f).
- r1: ice shard grow c0–4 (5 f); small fireball c5–6 (2 f); flame grow c7–13; large fireball c14; fire burst c15.
- r2–4: ice crystal c0; grey shields c2–4; fire embers c5–8; blue orb→snow burst c8–11; red orb→ring burst c7–12 (r3); blue slash streaks (r4 c7–12); vertical lightning c14–15 (r2–3).
- r5: fire explosion c0; ice cloud burst c1–4 (4 f); hearts c6–10 (full→empty, 5 states); money bag c13; potions c14–15; r6 c14 heart potion.
- r7–12: white slash arcs (3 sequences, ~6–7 f each) cols 0–11; weapon icons cols 14–15.
Exact cell boundaries per sequence **[verify when slicing]** (occupancy map recorded in this audit).

**`oga_pixel-art-spells/Pixelart Spells/PNG Files/*.png`** — strips of 16×16 frames (DevWizard, colored):
| File | Dims | Frames | Element |
|---|---|---|---|
| Fireball, Firebomb | 96×16 | 6 | fire |
| Ice Lance | 64×16 | 4 (thin lance) | ice |
| Water Bolt, Water Blast, Water Orb | 96×16 | 6 | water/ice |
| Light Bolt, Bolt Of Purity, Pure Bolt 2 | 96×16 | 6 | lightning/holy |
| Arcane Bolt, Magic Orb, Magic Sparks | 96×16 | 6 | arcane |
| Darkness Bolt, Darkness Orb | 96×16 | 6 | dark |
| Plant Missle | 96×16 | 6 | poison/nature |
| Wind Bolt | 96×16 | 6 | wind |
| Black And White Sparks / Ray | 96×16 / 128×16 | 6 / 8 | tintable |
| Magic Ray | 128×16 | 8 × 16×16 tileable beam segments (content y 3–13) | arcane beam |
| Pixelart Shield | 288×48 | 6 × 48×48 (opaque blue disc — needs alpha/blend in engine) | ward |
| Splash | 192×32 | 6 × 32×32 | water impact |
| Rock Sling | 16×16 | 1 | earth |

**`oga_free-pixel-effects-pack/*_spritesheet.png`** (CodeManu) — uniform **100×100 cells**, content trimmed much smaller (union bbox measured). 60 fps-authored → decimate to 12–20 f.
| Sheet | Grid | Frames | Content bbox | Use |
|---|---|---|---|---|
| 16_sunburn | 8×8 | 61 | 62×56 | **fire explosion** |
| 19_freezing | 10×10 | 86 | 80×78 | **ice burst** |
| 17_felspell | 10×10 | 91 | 71×70 | **poison nova** |
| 13_vortex | 8×8 | 61 | 77×76 | arcane/ice nova |
| 14_phantom | 8×8 | 61 | 69×71 | dark burst |
| 12_nebula | 8×8 | 61 | 75×77 | arcane burst |
| 10_weaponhit | 6×6 | 30 | 37×37 | **generic hit ring** |
| 5_magickahit | 7×7 | 40 | 15×61 | arcane hit |
| 1_magicspell | 9×9 | 74 | 48×48 | cast flash |
| 4_casting | 9×9 | 72 | 30×54 | cast / spawn telegraph |
| 8_protectioncircle | 8×8 | 61 | 34×34 | shield/ward |
| 3_bluefire, 7_firespin, 6_flamelash, 9_brightfire, 11_fire | 7–8² | 45–61 | 16×32 … 52×42 | burning / DoT |
| 2_magic8, 18_midnight, 20_magicbubbles, 15_loading | | 61–121 | | misc |

**`oga_16x16-explosion/explosion.png`** 80×16 = **5 × 16×16** (+ per-frame `explosion-01..05.png`). Small hit / enemy pop.
**`oga_pixel-projectiles/projectiles/`** — `bfg_ball` 12×12 (1), `bfg_explosion` 1200×200 (6 × 200×200, too large), `pellet` 4×4, `pistol_bullet`/`ricochet_bullet` 12×3. Low priority (sci-fi register).
**`oga_spell-effects-starsteel/`** — per-frame 64×32 PNGs: Fireball 1–9 (9 f), Icespear 1–6 (6 f), Thundersphere 1–8 (8 f). **Soft/anti-aliased glow — style risk** vs crisp pixel art.
**`oga_pixel-animated-spells/`** — `PNG/SpreadSheet.png` 184×155 is **irregularly packed** (not a grid); slice from `GIF/*.gif` instead (140×90; FireSpell1/2 9 f, Water-Ice1 9 f, Earth1 8 f). Ground-impact FX; low priority.
**`kenney_particle-pack/`** — 193 PNGs at 512×512 (Preview 918×515). Not pixel art (see §0).

### 2.7 Icons — `oga_496-rpg-icons/` (496 PNGs, all **34×34**, transparent, 1-px margin → 32 px content)
Counts by prefix (viewed contact sheet): **spell icons `S_*`**: Fire 8, Ice 9, Thunder 7, Poison 9, Magic 11, Shadow 16, Holy 10, Wind 7, Water 7, Earth 7, Light 4, Buff 14, Physic 2, + weapon-skill Sword 17 / Bow 14 / Axe 7 / Dagger 5 → ~150. **Wand icons**: `W_Staff01–08`, `W_Book01–07`. **Relic candidates**: `Ac_Medal` 4, `Ac_Necklace` 8, `Ac_Ring` 2, `I_Crystal` 3, gems (`I_Ruby/Sapphire/Diamond/Opal/Jade/Agate/Amethist`), `I_Eye`, `I_Clock`, `I_Mirror`, `I_Feather` 2, `I_Fang`, `I_Key` 7, `I_Scroll` 2, `I_Book`, `I_Map`, `I_Telescope`, `I_Clover`, `I_RabbitPaw`, animal parts, `E_*` materials → 60+. **Potions** `P_*` 57. **Coins** `I_GoldCoin/SilverCoin/BronzeCoin`, `E_Gold`.
Style: soft-shaded pastel with dark outline; brighter than 0x72 world art — acceptable as UI layer.

### 2.8 UI
- **`kenney_ui-pack-pixel-adventure/Tilesheets/Small tiles/{Thick,Thin} outline/tilemap_packed.png`** 368×112 = **23×7 grid of 16×16**; `Large tiles/…` 416×224 = **13×7 grid of 32×32** (unpacked variants have 1 px spacing). Dark slate + bronze palette — **best dark-fantasy fit**. Viewed: round & square **inventory/slot frames** (empty, filled, selected, with colored corner states), 3-slice horizontal bars and vertical gauges (health/mana), ribbon banners, ring frames, arrow/!/+ glyph buttons, 9-slice panel corners. Also `Tiles/` singles.
- **`kenney_pixel-ui-pack/9-Slice/{Ancient,Colored,Outline}/*.png`** 48×48 9-slices (16 px corners): Ancient brown/grey/tan/white × {normal, inlay, pressed}; Colored & Outline × 4–5 colors × {normal, pressed}; `list.png`, `space*.png`. `Spritesheet/UIpackSheet_transparent.png` 538×592, 16×16 tiles with 2 px margin (cursors, arrows, checkboxes, bars).
- **`kenney_1-bit-pack/Tilesheet/colored-transparent_packed.png`** 784×352 = 49×22 grid of 16×16 (1,078 tiles, per `Tilesheet.txt`). Monochrome-derived style; backup only, not slot-mapped.

### 2.9 Font — `kenney_fonts/Fonts/*.ttf` (12 TTFs, CC0)
Measured glyph grid (fontTools, unitsPerEm 1024): **Kenney Pixel** and **Kenney High** crisp at **16 px** (cap-height 7 / 9 px); **Kenney Mini / Mini Square / Pixel Square / Future / Rocket / Blocks** crisp at **8 px** (cap 5–7 px). 209 glyphs each = Basic Latin + Latin-1 (Ä etc.); **no Cyrillic/CJK**. Wave 3 bakes BitmapFonts at native size ×1 (render at integer multiples only).

### 2.10 Audio (formats: Kenney/rubberduck `.ogg`, ViRiX `.wav`, LRSF `.mp3`+`.wav`, incompetech 320 kbps `.mp3`; Wave 3 re-encodes + loudness-normalizes)
| Gameplay slot | Candidates (file stems) | Dur. |
|---|---|---|
| Cast — fire | `oga_80-cc0-rpg-sfx/spell_fire_01..07` | 0.65–1.93 s |
| Cast/impact — fire | `oga_magic-sfx-virix/Fire impact 1.wav` (CC-BY) | 6.4 s (trim) |
| Cast — ice | `oga_magic-sfx-virix/Ice attack 2.wav` (CC-BY); shatter: `kenney_impact-sounds/impactGlass_light_000..004` | 1.85 s |
| Cast — lightning | `kenney_sci-fi-sounds/laserSmall_000..004`, `forceField_000..004` (zap) | short |
| Cast — arcane | `oga_80-cc0-rpg-sfx/spell_01, spell_02`; `kenney_sci-fi-sounds/laserRetro_000..004`; LRSF `Spell_00..04` (CC-BY) | 0.55–5.9 s |
| Cast — poison | `kenney_sci-fi-sounds/slime_000/001`; `oga_80-cc0-rpg-sfx/creature_slime_01..04`; `oga_80-cc0-creature-sfx/spit_01..03` | |
| Wind (modifier) | `oga_magic-sfx-virix/Wind effects 5.wav` | 1.74 s |
| Hit | `kenney_impact-sounds/impactPunch_{medium,heavy}_*`, `impactSoft_*` (5 variants each) | |
| Enemy death | `oga_80-cc0-rpg-sfx/creature_die_01`, `creature-sfx/hurt_*`, `monster_01..07`; LRSF `Goblin_00..04` | |
| Explosion | `kenney_sci-fi-sounds/explosionCrunch_000..004`, `lowFrequency_explosion_000/001` | |
| Player hurt | `oga_80-cc0-creature-sfx/grunt_01..05`, `hurt_01..05` | |
| Pickup / coin | `item_gem_01..04`, `item_coins_01..04`, `kenney_rpg-audio/handleCoins*`; LRSF `Pickup_Gold_00..04` | |
| Heal | `oga_magic-sfx-virix/Healing Full.wav` | 3.9 s |
| Door open/close | `kenney_rpg-audio/doorOpen_1/2`, `doorClose_1..4`, `creak1..3` | |
| Room clear / stingers | `kenney_music-jingles/*` (NES/HIT/STEEL/PIZZI/SAX × 17 each, 0.3–1.8 s); LRSF `Jingle_Achievement_00` 3.6 s, `Jingle_Win_00` 10 s, `Jingle_Lose_00` 6 s | |
| UI click / hover | `kenney_interface-sounds/click_001..005`, `select_001..008`; `kenney_ui-audio/rollover1..6`, `click1..5` | |
| Slot equip | `kenney_interface-sounds/drop_001..004`, `switch_*`; `kenney_rpg-audio/metalClick`, `metalLatch`, `bookPlace1..3` | |
| Boss roar | LRSF `Dragon_Growl_00/01` 3.3–4.3 s; `creature_roar_01..03`, `creature-sfx/roar_*`, `troll_*` | |
| Ambience | LRSF `Ambience_Cave_00` 55.5 s | |
| Traps | LRSF `Trap_00..02` | |

**Music** (`incompetech_music/` CC-BY 4.0, `oga_music-cc0/` CC0):
| Slot | Candidates | Dur. |
|---|---|---|
| Exploration / dungeon | `Dark Fog.mp3`, `Ossuary 6 - Air.mp3`; CC0 chiptune alt `8-bit_perilous_dungeon.mp3` | 239 s / 250 s / 113 s |
| Combat | `Unholy Knight.mp3`, `Volatile Reaction.mp3`; CC0 alt `battle_music_01-loop.ogg` (author-made loop) | 154 s / 165 s / 152 s |
| Boss | `Five Armies.mp3`, `Aggressor.mp3` | 156 s / 239 s |
Incompetech tracks are linear compositions, not seamless loops — Audio Director must set loop points/crossfades. Orchestral (incompetech) vs chiptune (OGA) register is an Audio Director choice; both are on disk.

---

## 3. Coverage table

| # | Requirement | Status | Primary source | Gaps |
|---|---|---|---|---|
| 1 | Player wizard idle/run (+hurt/death) | **Covered (partial on death/cast)** | 0x72 `wizzard_m/f` 16×28: idle 4, run 4, hit 1 | **No death anim, no cast anim.** Death → hit frame + dissolve/fade (shader or tween); cast → idle/run + held `weapon_*_magic_staff` overlay + CodeManu `1_magicspell` muzzle flash. |
| 2 | ≥8 animated enemy types | **Covered — 18+ animated** | 0x72 goblin, imp, skelet, tiny_zombie, zombie, ice_zombie, muddy, swampy, slug, masked_orc, orc_warrior, orc_shaman, necromancer, chort, wogol, pumpkin_dude, doc, angel; trashmobz slime, bat, wasp, mushroom, rat, worm | **Ghost:** only Tiny Dungeon #121 (single frame, different outline style). Animated bat only from trashmobz (brighter palette). |
| 2b | ≥2–3 boss-scale sprites | **Covered — 3** | 0x72 big_demon, ogre, big_zombie (32×36, idle 4 / run 4) | No boss attack/telegraph/death frames — telegraphs must be FX/tint/scale-driven (Animator). Further bosses = 2× scale of 16×23 enemies (necromancer, orc_shaman) — 2D Artist call. |
| 3 | Dungeon tileset: floor, walls, doors, props, stairs/portal | **Covered** | 0x72 floors/walls/autotiles, doors, chests (3 f), crate, column, skull, banners, fountains, spikes, levers; Puny torches (8 f), **portal rings (10 f ×3 colours)**, urn/barrels, traps | No free-standing statue (use 0x72 `column` / Tiny Dungeon gargoyle wall tile); no breakable-pot break animation (use FX puff). |
| 4 | Spell visuals, 5 elements | **Covered** | simplefx (crisp 16 px: fire, ice, lightning, poison, hit, slash); DevWizard spells (6-f 16 px bolts: fire, ice, lightning/light, arcane, poison/plant, dark, wind, beam); CodeManu explosions (fire sunburn, ice freezing, poison felspell, arcane vortex, hit ring); BitingChaos 5-f explosion | Chain-lightning arc between targets has no sprite — draw procedurally (line/segment strip using `Magic Ray` tileable segment). StarsteelGaming = soft style risk. |
| 5 | ≥24 spell/modifier icons, ≥15 relic icons, wand icons, coin/potion/heart | **Covered** | 7Soul1 496 icons: ~150 spell/skill icons, 60+ relic-able items, 15 staff/tome icons, 57 potions, coins; 0x72 hearts/flasks/coin anim; simplefx hearts (5 states)/potions/money bag | **Modifier icons** (e.g. "multicast", "speed up", "homing", "split") have no bespoke glyph icons — use `S_Buff`/`S_Magic`/`S_Wind` + a small overlay glyph, or 2D Artist edits. |
| 6 | UI panels/frames/buttons (9-slice) + pixel font | **Covered** | Kenney UI Pack Pixel Adventure (16 & 32 px slots, bars, frames); Kenney Pixel UI Pack 48×48 9-slices (Ancient set); Kenney Pixel / Mini TTF (CC0) | Fonts are Latin-1 only (fine — no localization in scope). |
| 7 | SFX (listed events) + ≥3 music loops | **Covered, with trim work** | Kenney RPG/Impact/Interface/UI/Sci-fi/Jingles, rubberduck RPG + creature, ViRiX magic, LRSF fantasy; incompetech ×6 + CC0 chiptune ×2 | **No dedicated thunder-crack / electric cast** (sci-fi zaps substitute). Most cast sounds are 0.6–6 s — must be **trimmed to ≤250 ms attack-led one-shots** for high fire-rate wands. Music needs loop points. |

## 4. Explicit gaps (to resolve in Wave 2/3, not by more downloads)

1. Player **death** and **cast** animations — absent in every CC0 16×28 wizard found; resolve with FX + tween (Animator/2D Artist).
2. **Ghost** enemy — only a static Tiny Dungeon sprite; either accept with tween bob + alpha flicker, or drop ghost from roster.
3. **Boss attack/telegraph frames** — none; bosses are idle/run only.
4. **Modifier-specific icons** — composite from spell icons + overlay glyphs.
5. **Lightning cast SFX** and short cast one-shots — trimming/layering in Wave 3 (Audio Director specs, TA encodes).
6. **Style harmony risk** across 0x72 (anchor), trashmobz/simplefx (brighter, black outline), Tiny Dungeon (thick silhouette border), 7Soul1 icons (pastel shaded), StarsteelGaming (soft AA). 2D Artist's style-guide should pick which supplementary packs are admitted and whether a palette-remap pass (TA-scriptable, build-time LUT) is applied.
7. **Upstream data fixes** the Wave 3 slicer must apply: `zombie_anim_f10`→`f0`; `wall_edge_top_left` x 31→32.

## 5. Budget notes for Wave 3 (preliminary)
- Everything in-world fits one 1024×1024 page if packed from 0x72 (512²) + selected trashmobz/Puny/simplefx cells + trimmed/decimated FX; icons (≈90 × 34² ≈ 104 k px) fit a 512×512 UI page with UI tiles. Target: **≤2 texture pages, ≤4 MB VRAM (RGBA8), single-batch world layer**.
- CodeManu sheets must be trimmed to content bbox and decimated (61 f → 12–16 f) or they alone would cost 8 × 800² pages.
- Raw audio is 150 MB+ (WAV duplicates, 320 kbps music); shipped audio target after re-encode ≈ 8–12 MB.
