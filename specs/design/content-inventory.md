# Spellwright — `content-inventory` + teaching sequence (`level-data` companion)

**Owner:** Game Designer · **Status:** v2 (Wave A1) · **Consumers:** every downstream role works from **§0 DELTA**. Game Developer (data loading and validation), 2D Artist, Animator, Audio Director, UX Designer.
**Rule:** §0 and §3 are **generated from `data/*.json`** (a diff of the v1 snapshot against v2, and the live catalogue). The data wins; regenerate the tables rather than editing them. Generator and validator: `python3 scripts/design/build.py`.

**v2 counts:** 42 spells (18 base + 18 level-2 + 6 evolved) · 25 modifiers · 10 wands · 37 relics (16 kept + 13 new + 4 duo + 4 corrupted; 10 cut) · 21 enemies (+2 counter enemies, +6 world natives; worlds.md) · 6 bosses (3 mini + 3) · 24 room templates (+ mini arena + 3 puzzles) · 3 floors (rewritten; each a distinct world with a `world` block) · 15 goals (replacing 9 milestones) · 25 forge recipes · 3 modes · 5 affixes · 4 loadouts. Card ids (spells + modifiers) are one namespace.

---

## §0 DELTA v1 → v2 (every new / changed / cut id)

| Table | id | Status | Changed fields / note | Downstream |
|---|---|---|---|---|
| spells | `spark_bolt_2` | **NEW** | level 2 of `spark_bolt` (forge-only) | 2D (icon/frame) · Audio (cast/hit family) · Dev |
| spells | `magic_missile_2` | **NEW** | level 2 of `magic_missile` (forge-only) | 2D (icon/frame) · Audio (cast/hit family) · Dev |
| spells | `bouncing_burst_2` | **NEW** | level 2 of `bouncing_burst` (forge-only) | 2D (icon/frame) · Audio (cast/hit family) · Dev |
| spells | `fire_bolt_2` | **NEW** | level 2 of `fire_bolt` (forge-only) | 2D (icon/frame) · Audio (cast/hit family) · Dev |
| spells | `fireball_2` | **NEW** | level 2 of `fireball` (forge-only) | 2D (icon/frame) · Audio (cast/hit family) · Dev |
| spells | `ice_shard_2` | **NEW** | level 2 of `ice_shard` (forge-only) | 2D (icon/frame) · Audio (cast/hit family) · Dev |
| spells | `frost_nova_2` | **NEW** | level 2 of `frost_nova` (forge-only) | 2D (icon/frame) · Audio (cast/hit family) · Dev |
| spells | `frost_lance_2` | **NEW** | level 2 of `frost_lance` (forge-only) | 2D (icon/frame) · Audio (cast/hit family) · Dev |
| spells | `chain_lightning_2` | **NEW** | level 2 of `chain_lightning` (forge-only) | 2D (icon/frame) · Audio (cast/hit family) · Dev |
| spells | `thunder_orb_2` | **NEW** | level 2 of `thunder_orb` (forge-only) | 2D (icon/frame) · Audio (cast/hit family) · Dev |
| spells | `venom_dart_2` | **NEW** | level 2 of `venom_dart` (forge-only) | 2D (icon/frame) · Audio (cast/hit family) · Dev |
| spells | `toxic_flask_2` | **NEW** | level 2 of `toxic_flask` (forge-only) | 2D (icon/frame) · Audio (cast/hit family) · Dev |
| spells | `boomerang_blade_2` | **NEW** | level 2 of `boomerang_blade` (forge-only) | 2D (icon/frame) · Audio (cast/hit family) · Dev |
| spells | `arcane_orbit_2` | **NEW** | level 2 of `arcane_orbit` (forge-only) | 2D (icon/frame) · Audio (cast/hit family) · Dev |
| spells | `rune_mine_2` | **NEW** | level 2 of `rune_mine` (forge-only) | 2D (icon/frame) · Audio (cast/hit family) · Dev |
| spells | `blink_bolt_2` | **NEW** | level 2 of `blink_bolt` (forge-only) | 2D (icon/frame) · Audio (cast/hit family) · Dev |
| spells | `comet_2` | **NEW** | level 2 of `comet` (forge-only) | 2D (icon/frame) · Audio (cast/hit family) · Dev |
| spells | `vortex_2` | **NEW** | level 2 of `vortex` (forge-only) | 2D (icon/frame) · Audio (cast/hit family) · Dev |
| spells | `sunburst` | **NEW** | evolution of `fireball_2` (forge-only) | 2D (icon/frame) · Audio (cast/hit family) · Dev |
| spells | `tempest_chain` | **NEW** | evolution of `chain_lightning_2` (forge-only) | 2D (icon/frame) · Audio (cast/hit family) · Dev |
| spells | `glacier_spike` | **NEW** | evolution of `ice_shard_2` (forge-only) | 2D (icon/frame) · Audio (cast/hit family) · Dev |
| spells | `blight_needle` | **NEW** | evolution of `venom_dart_2` (forge-only) | 2D (icon/frame) · Audio (cast/hit family) · Dev |
| spells | `prism_spark` | **NEW** | evolution of `spark_bolt_2` (forge-only) | 2D (icon/frame) · Audio (cast/hit family) · Dev |
| spells | `reaper_disc` | **NEW** | evolution of `boomerang_blade_2` (forge-only) | 2D (icon/frame) · Audio (cast/hit family) · Dev |
| wands | `apprentice_wand` | **CHANGED** | 3 slots, 50 mana, 18/s (was 4 / 60 / 25): the first modifier overspends | 2D · Dev |
| wands | `ember_rod` | **CHANGED** | capacity, manaMax, manaRegen, presetCards | 2D · Dev |
| wands | `glass_needle` | **CHANGED** | capacity, manaMax, manaRegen, presetCards | 2D · Dev |
| wands | `twin_fork` | **CHANGED** | manaMax, manaRegen | 2D · Dev |
| wands | `stormcaller_staff` | **CHANGED** | manaMax, manaRegen, presetCards | 2D · Dev |
| wands | `oak_staff` | **CHANGED** | manaMax, manaRegen, presetCards | 2D · Dev |
| wands | `grave_scepter` | **CHANGED** | manaMax, manaRegen, presetCards | 2D · Dev |
| wands | `chaos_branch` | **CHANGED** | manaMax, manaRegen, presetCards | 2D · Dev |
| wands | `echo_wand` | **CHANGED** | capacity, manaMax, manaRegen, presetCards | 2D · Dev |
| wands | `archmage_scepter` | **CHANGED** | manaMax, manaRegen, presetCards | 2D · Dev |
| relics | `last_stand` | **NEW** |  | 2D (icon) · UX (text) · Dev |
| relics | `first_light` | **NEW** |  | 2D (icon) · UX (text) · Dev |
| relics | `still_hand` | **NEW** |  | 2D (icon) · UX (text) · Dev |
| relics | `crowd_reader` | **NEW** |  | 2D (icon) · UX (text) · Dev |
| relics | `full_focus` | **NEW** |  | 2D (icon) · UX (text) · Dev |
| relics | `tally_stone` | **NEW** |  | 2D (icon) · UX (text) · Dev |
| relics | `unbroken_seal` | **NEW** |  | 2D (icon) · UX (text) · Dev |
| relics | `misers_ring` | **NEW** |  | 2D (icon) · UX (text) · Dev |
| relics | `deepening_well` | **NEW** |  | 2D (icon) · UX (text) · Dev |
| relics | `hollow_runes` | **NEW** |  | 2D (icon) · UX (text) · Dev |
| relics | `echoing_payload` | **NEW** |  | 2D (icon) · UX (text) · Dev |
| relics | `endless_page` | **NEW** |  | 2D (icon) · UX (text) · Dev |
| relics | `overflow_cell` | **NEW** |  | 2D (icon) · UX (text) · Dev |
| relics | `steam_engine` | **NEW** |  | 2D (icon) · UX (text) · Dev |
| relics | `storm_furnace` | **NEW** |  | 2D (icon) · UX (text) · Dev |
| relics | `plague_bloom` | **NEW** |  | 2D (icon) · UX (text) · Dev |
| relics | `thorn_blaze` | **NEW** |  | 2D (icon) · UX (text) · Dev |
| relics | `cracked_crown` | **NEW** |  | 2D (icon) · UX (text) · Dev |
| relics | `hungry_rune` | **NEW** |  | 2D (icon) · UX (text) · Dev |
| relics | `blood_ink` | **NEW** |  | 2D (icon) · UX (text) · Dev |
| relics | `unstable_core` | **NEW** |  | 2D (icon) · UX (text) · Dev |
| relics | `arcane_whetstone` | **CUT** |  | 2D (icon) · UX (text) · Dev |
| relics | `winged_boots` | **CUT** |  | 2D (icon) · UX (text) · Dev |
| relics | `magnet_charm` | **CUT** |  | 2D (icon) · UX (text) · Dev |
| relics | `mana_font` | **CUT** |  | 2D (icon) · UX (text) · Dev |
| relics | `deep_well` | **CUT** |  | 2D (icon) · UX (text) · Dev |
| relics | `heart_vessel` | **CUT** |  | 2D (icon) · UX (text) · Dev |
| relics | `greed_ring` | **CUT** |  | 2D (icon) · UX (text) · Dev |
| relics | `glass_lens` | **CUT** |  | 2D (icon) · UX (text) · Dev |
| relics | `quickened_quill` | **CUT** |  | 2D (icon) · UX (text) · Dev |
| relics | `sand_hourglass` | **CUT** |  | 2D (icon) · UX (text) · Dev |
| enemies | `tomb_sentinel` | **NEW** |  | 2D (sprite + defence overlay) · Anim (telegraph) · Audio · Dev |
| enemies | `lantern_acolyte` | **NEW** |  | 2D (sprite + defence overlay) · Anim (telegraph) · Audio · Dev |
| enemies | `bone_archer` | **NEW** | W1 native (worlds.md §2) | 2D (sprite + defence overlay) · Anim (telegraph) · Audio · Dev |
| enemies | `drowned_thrall` | **NEW** | W2 native, ward 2 | 2D (sprite + defence overlay) · Anim (telegraph) · Audio · Dev |
| enemies | `mire_leech` | **NEW** | W2 native swarm | 2D (sprite + defence overlay) · Anim (telegraph) · Audio · Dev |
| enemies | `animated_armor` | **NEW** | W3 native, armour 36 | 2D (sprite + defence overlay) · Anim (telegraph) · Audio · Dev |
| enemies | `bound_tome` | **NEW** | W3 native turret, armour 20 | 2D (sprite + defence overlay) · Anim (telegraph) · Audio · Dev |
| enemies | `ink_imp` | **NEW** | W3 native bomber | 2D (sprite + defence overlay) · Anim (telegraph) · Audio · Dev |
| bosses | `grave_warden` | **NEW** |  | 2D · Anim · Audio · UX (intro/banner) · Dev |
| bosses | `lantern_matron` | **NEW** |  | 2D · Anim · Audio · UX (intro/banner) · Dev |
| bosses | `iron_colossus` | **NEW** |  | 2D · Anim · Audio · UX (intro/banner) · Dev |
| bosses | `ossuary_knight` | **CHANGED** | HP 700→520; +shield_wall, +bone_rain (heat); adapt; intro/banners | 2D · Anim · Audio · UX (intro/banner) · Dev |
| bosses | `mire_queen` | **CHANGED** | HP 1500→1100; +veil, +bog_surge (heat); adapt; intro/banners | 2D · Anim · Audio · UX (intro/banner) · Dev |
| bosses | `archlich` | **CHANGED** | HP 2600→2000; +mirror_volley, +grand_spiral (heat); adapt; intro/banners | 2D · Anim · Audio · UX (intro/banner) · Dev |
| rooms | `crypt_arena` | **NEW** |  | TA (tilemap) · Dev |
| rooms | `sentinel_gate` | **NEW** |  | TA (tilemap) · Dev |
| rooms | `choir_of_wards` | **NEW** |  | TA (tilemap) · Dev |
| rooms | `iron_hall` | **NEW** |  | TA (tilemap) · Dev |
| floors | `f1` | **CHANGED** | eliteCandidates, enemyPool, limits, miniBoss, miniBossRoom, puzzleRooms, steps, testKeyword, threats, twists, waves, world | Dev · UX (door icons, world card) · 2D (tileset) · Audio (music/amb) |
| floors | `f2` | **CHANGED** | eliteCandidates, enemyPool, enemyProjSpeedMult, hpMult, limits, miniBoss, miniBossRoom, puzzleRooms, steps, testKeyword, threats, twists, waves, world | Dev · UX (door icons, world card) · 2D (tileset) · Audio (music/amb) |
| floors | `f3` | **CHANGED** | eliteCandidates, enemyPool, enemyProjSpeedMult, hpMult, limits, miniBoss, miniBossRoom, puzzleRooms, steps, testKeyword, threats, twists, waves, world | Dev · UX (door icons, world card) · 2D (tileset) · Audio (music/amb) |
| rules | `enemies` | **CHANGED** | enemyShotCap, minSpawnDistPx, miniBossActivateDelayMs, spawnAimConeDeg, spawnAimConeRangePx, spawnPortalMs | Dev |
| rules | `waves` | **CHANGED** | grammar, nextWaveKilledFrac, nextWaveMinElapsedMs, nextWaveWhenAliveAtMost | Dev |
| rules | `curses` | **CHANGED** | $deprecated | Dev |
| rules | `defences` | **NEW** |  | Dev |
| rules | `keywords` | **NEW** |  | Dev |
| rules | `heat` | **NEW** |  | Dev |
| rules | `goals` | **NEW** |  | Dev |
| rules | `twists` | **NEW** |  | Dev |
| rules | `risk` | **NEW** |  | Dev |
| rules | `boss` | **NEW** |  | Dev |
| economy | `drafts` | **CHANGED** | duoOfferWeightMult | Dev · UX |
| economy | `shopStock` | **CHANGED** | saleSlot | Dev · UX |
| economy | `skip` | **NEW** |  | Dev · UX |
| economy | `draftReroll` | **NEW** |  | Dev · UX |
| economy | `sale` | **NEW** |  | Dev · UX |
| economy | `pity` | **NEW** |  | Dev · UX |
| economy | `tagLean` | **NEW** |  | Dev · UX |
| economy | `counterGuarantee` | **NEW** |  | Dev · UX |
| economy | `ban` | **NEW** |  | Dev · UX |
| unlocks | `g_first_run` | **NEW** |  | UX (Goals) · Dev |
| unlocks | `g_reach_mini` | **NEW** |  | UX (Goals) · Dev |
| unlocks | `g_persistence` | **NEW** |  | UX (Goals) · Dev |
| unlocks | `g_kill_mini1` | **NEW** |  | UX (Goals) · Dev |
| unlocks | `g_reach_f2` | **NEW** |  | UX (Goals) · Dev |
| unlocks | `g_kill_boss1` | **NEW** |  | UX (Goals) · Dev |
| unlocks | `g_breaker` | **NEW** |  | UX (Goals) · Dev |
| unlocks | `g_first_payload` | **NEW** |  | UX (Goals) · Dev |
| unlocks | `g_reach_f3` | **NEW** |  | UX (Goals) · Dev |
| unlocks | `g_kill_boss2` | **NEW** |  | UX (Goals) · Dev |
| unlocks | `g_forgewright` | **NEW** |  | UX (Goals) · Dev |
| unlocks | `g_kindred` | **NEW** |  | UX (Goals) · Dev |
| unlocks | `g_win` | **NEW** |  | UX (Goals) · Dev |
| unlocks | `g_daily` | **NEW** |  | UX (Goals) · Dev |
| unlocks | `g_heat3` | **NEW** |  | UX (Goals) · Dev |
| unlocks | `reach_floor_2` | **CUT** |  | UX (Goals) · Dev |
| unlocks | `kill_ossuary_knight` | **CUT** |  | UX (Goals) · Dev |
| unlocks | `reach_floor_3` | **CUT** |  | UX (Goals) · Dev |
| unlocks | `kill_mire_queen` | **CUT** |  | UX (Goals) · Dev |
| unlocks | `win_run` | **CUT** |  | UX (Goals) · Dev |
| unlocks | `all_reactions` | **CUT** |  | UX (Goals) · Dev |
| unlocks | `slayer_300` | **CUT** |  | UX (Goals) · Dev |
| unlocks | `first_payload` | **CUT** |  | UX (Goals) · Dev |
| unlocks | `three_deaths` | **CUT** |  | UX (Goals) · Dev |
| forge | `merge_spark_bolt` | **NEW** |  | UX (Forge tab) · 2D · Audio · Dev |
| forge | `merge_magic_missile` | **NEW** |  | UX (Forge tab) · 2D · Audio · Dev |
| forge | `merge_bouncing_burst` | **NEW** |  | UX (Forge tab) · 2D · Audio · Dev |
| forge | `merge_fire_bolt` | **NEW** |  | UX (Forge tab) · 2D · Audio · Dev |
| forge | `merge_fireball` | **NEW** |  | UX (Forge tab) · 2D · Audio · Dev |
| forge | `merge_ice_shard` | **NEW** |  | UX (Forge tab) · 2D · Audio · Dev |
| forge | `merge_frost_nova` | **NEW** |  | UX (Forge tab) · 2D · Audio · Dev |
| forge | `merge_frost_lance` | **NEW** |  | UX (Forge tab) · 2D · Audio · Dev |
| forge | `merge_chain_lightning` | **NEW** |  | UX (Forge tab) · 2D · Audio · Dev |
| forge | `merge_thunder_orb` | **NEW** |  | UX (Forge tab) · 2D · Audio · Dev |
| forge | `merge_venom_dart` | **NEW** |  | UX (Forge tab) · 2D · Audio · Dev |
| forge | `merge_toxic_flask` | **NEW** |  | UX (Forge tab) · 2D · Audio · Dev |
| forge | `merge_boomerang_blade` | **NEW** |  | UX (Forge tab) · 2D · Audio · Dev |
| forge | `merge_arcane_orbit` | **NEW** |  | UX (Forge tab) · 2D · Audio · Dev |
| forge | `merge_rune_mine` | **NEW** |  | UX (Forge tab) · 2D · Audio · Dev |
| forge | `merge_blink_bolt` | **NEW** |  | UX (Forge tab) · 2D · Audio · Dev |
| forge | `merge_comet` | **NEW** |  | UX (Forge tab) · 2D · Audio · Dev |
| forge | `merge_vortex` | **NEW** |  | UX (Forge tab) · 2D · Audio · Dev |
| forge | `evolve_sunburst` | **NEW** |  | UX (Forge tab) · 2D · Audio · Dev |
| forge | `evolve_tempest_chain` | **NEW** |  | UX (Forge tab) · 2D · Audio · Dev |
| forge | `evolve_glacier_spike` | **NEW** |  | UX (Forge tab) · 2D · Audio · Dev |
| forge | `evolve_blight_needle` | **NEW** |  | UX (Forge tab) · 2D · Audio · Dev |
| forge | `evolve_prism_spark` | **NEW** |  | UX (Forge tab) · 2D · Audio · Dev |
| forge | `evolve_reaper_disc` | **NEW** |  | UX (Forge tab) · 2D · Audio · Dev |
| forge | `slot` | **NEW** |  | UX (Forge tab) · 2D · Audio · Dev |
| modes | `standard` | **NEW** |  | UX (Mode Select) · Dev |
| modes | `gentle` | **NEW** |  | UX (Mode Select) · Dev |
| modes | `daily` | **NEW** |  | UX (Mode Select) · Dev |
| affixes | `armoured` | **NEW** |  | 2D (outline + glyph) · Anim · Dev |
| affixes | `warded` | **NEW** |  | 2D (outline + glyph) · Anim · Dev |
| affixes | `shielded` | **NEW** |  | 2D (outline + glyph) · Anim · Dev |
| affixes | `hasted` | **NEW** |  | 2D (outline + glyph) · Anim · Dev |
| affixes | `volatile` | **NEW** |  | 2D (outline + glyph) · Anim · Dev |

Counts: affixes NEW 5 · bosses CHANGED 3 · bosses NEW 3 · economy CHANGED 2 · economy NEW 7 · enemies NEW 8 · floors CHANGED 3 · forge NEW 25 · modes NEW 3 · relics CUT 10 · relics NEW 21 · rooms NEW 4 · rules CHANGED 3 · rules NEW 7 · spells NEW 24 · unlocks CUT 9 · unlocks NEW 15 · wands CHANGED 10

Added to every record of its table (not listed per row): cards `keywords[]`, `tags[]`, `level`, `pool`; relics `category`, `tags`; enemies `role`, `defence`; bosses `tier`, `intro`, `adapt`, `heatAttack`, `defence`, `testKeyword`, phase `bannerKey`; rooms `puzzle`; wands `tier`; floors `world` (worlds.md).


### 0.1 Save migration map (Wave E; `meta.milestones` holds v1 ids)

| v1 milestone id | → v2 goal id | Note |
|---|---|---|
| `reach_floor_2` | `g_reach_f2` | same unlocks |
| `kill_ossuary_knight` | `g_kill_boss1` | comet moved to `g_kill_mini1`; keep it unlocked if already earned |
| `reach_floor_3` | `g_reach_f3` | same |
| `kill_mire_queen` | `g_kill_boss2` | same |
| `win_run` | `g_win` | `features: curses` → `features: heat` (and `meta.curseLevel` → `meta.heat`) |
| `first_payload` | `g_first_payload` | same |
| `three_deaths` | `g_persistence` | same |
| `all_reactions` | — (dropped) | alchemist_stone now from `g_heat3`; **already-unlocked ids stay unlocked** (unlock lists persist by id) |
| `slayer_300` | — (dropped) | crit_up → `g_heat3`, echo_wand → `g_forgewright`; already-unlocked stay |

Returning players must never *lose* an unlock. Migration marks the mapped goals as paid, and keeps every id already in the save's unlock lists.

### 0.2 Retired feel tunables
Deleted: `explosionShakePx/Ms`, `bigExplosionShakePx/Ms`, `heavyImpactShakePx/Ms`, `hurtShakePx/Ms` (trauma replaced them). Also deleted: `lookAheadFrac` (camera lead is velocity-based). `playerHurtboxRadius` 4 → 3 is now the capsule radius. The requested `bossKillHitstopMs` was not added; the Animator's `bossDeathHitstopMs` is the single key (target 300 ms).

---

## §1 First-run teaching sequence (introduce → isolate → recombine)

The first three rooms teach **move → cast → slot a modifier → dash**, entirely through layout and one scripted reward. Text is limited to the UX's control-hint prompts (UX owns `ftue-flow`; the triggers listed here are player-state conditions, not timers).

| # | Room (template) | The one idea | How the layout teaches it (no text) | Scripted content | UX prompt trigger (brief to `ftue-flow`) |
|---|---|---|---|---|---|
| 0 | **Sanctum** (`sanctum`, 20×13) | **Move + Cast** | The player spawns in the south half. The only way to the north door is a wall of **4 crates** (6 HP each; spark bolt = 5 → 2 hits each). Walking to the door shows the barrier; the wand is already in hand. Pillars give the aim something to miss. No enemies, so failure is free. | Starter wand `apprentice_wand` [spark_bolt, spark_bolt, —] (v2: 3 slots) | "Move" hint if no move input within 3 s; "Aim + hold to cast" hint when the player stands ≤ 3 tiles from the crates without casting for 2 s. **Touch (v2):** auto-fire never targets crates (user decision), so the crate wall teaches the **right aim-stick override**: prompt "Drag on the right side to aim and cast" when the player stands ≤ 3 tiles from the crates without an aim-stick touch for 2 s (UX `ftue-flow`). |
| 1 | **First Blood** (`tut_first_blood`, 26×15) | **Isolate cast** under light pressure | Four pillars in an open room. Wave 1: 3 slow skeletons (44 px/s vs the player's 110) that are easy to kite and shoot. Wave 2: 4 bats + 1 skeleton, which forces aiming at erratic targets. Skeleton swipes (450 ms windup) teach "a flash before a hit" without dash pressure (walking away beats a swipe). | `fixedWaves` in the data | "Hold to keep casting" if the player taps 5+ times in 5 s |
| 1→ | Reward: **slot a modifier** | Draft of 3 modifiers, fixed: `double_cast`, `damage_up`, `homing`. **Every one works in the one empty slot** (wrap guarantee, mechanic-spec Ex 2), so the lesson can't fail. **v2:** each one overspends the 18/s starter (dry after 7 s / 4 s / 4 s), so the mana bar teaches itself in the next room (mechanic-spec §11 Ex 1). | `tutorialReward` | On pickup, open the wand editor with the new card and the first empty slot highlighted; close is allowed (it can be slotted later) |
| 2 | **The Gauntlet** (`tut_gauntlet`, 30×15) | **Introduce dash** | A pit-lined central lane (8 tiles wide) leads from the doors to the spawn. The brute charges down the lane (700 ms windup, 250 px/s): walking out of the lane is possible but tight; dashing through it is easy. A cultist on the far side adds a projectile to dash through. Wave 2 recombines: skeletons + cultist. | `fixedWaves` | "Dash (Space/RMB)" prompt on the brute's **first windup start** if the player has never dashed; suppressed forever after the first dash |
| 2→ | Reward: **elements** | Draft of 3 elemental spells: `fire_bolt`, `ice_shard`, `venom_dart`. The first status icon appears on an enemy in the next room. | `tutorialReward` | Codex toast on the first status applied |
| 3 | First **door choice** | **Choose your growth** | Two doors with (room, reward) icons: the player learns the run is theirs to route | `floors.f1.steps[3]` | Door-icon tooltip on first approach |

### 1.1 Introduce / isolate / recombine for every later idea

| Idea | Introduced (safe) | Isolated (dangerous) | Recombined |
|---|---|---|---|
| Multicast | F1 s1 reward (`double_cast`) | Swarm waves (bats) reward spread | Wands with presets (`stormcaller_staff` [chain, double, spark, spark]) |
| Elements and statuses | F1 s2 reward | Enemy immunities (imp: burn, F1 s6+) | Reactions (§1.2) |
| Door choice / risk | F1 s3 | Elite door F1 s4 | Heal-vs-relic door F1 s8 |
| Elite enemies | F1 s4 (elite skeleton/brute/cultist/slime) | F2 elite wraith/turret | F3 elite golem + density |
| Wand swapping | Treasure wand door (F1 s3/s7) | Two-wand alchemy (Melt/Blight) | F2+ builds |
| Shop / economy | F1 s5 (breather) | F2 shop (rerolls, first wands) | F3 cash-out at s7 |
| Triggers | F2 (`minFloor` 2) via the `oak_staff` preset or a draft | Long-range payload vs turrets behind pillars | Trigger artillery (`systems.md` S1) |
| Ranged denial (turret, frost mage) | F2 s1–2 | Turret rings in `pit_cross` | + necromancer summons (F2 s5) |
| Teleporters (wraith) | F2 s3 | Wraith elites | Archlich P2 summons wraiths |
| Tank (golem) | F3 s3 | Golem elite (630 HP) | F3 late waves |

### 1.2 Reaction discovery
Reactions are discovered, not tutorialized: the first time one fires, a toast names it ("Melt! Fire on frozen: ×2") and records it in the codex. Seeing all four unlocks `alchemist_stone`. The F1 s2 draft (fire / frost / poison) plus any fire source makes Melt or Blight likely on floor 1.


### 1.3 v2 counter curriculum (design-v2 §2, §4)

| Idea | Introduced (safe) | Isolated (the exam) | Recombined |
|---|---|---|---|
| **Pierce vs shield** | F1 step 3 door "Shielded foes: bring PIERCE" (1 sentinel among fodder) + the first-block tip | F1 mini: The Grave Warden (step 4) | Sentinel Gate puzzle (step 7) + the Knight's shield_wall (step 8) |
| **Shock vs ward** | F2 step 2+ ward door (wraith / acolyte) | F2 mini: The Lantern Matron | Choir of Wards + the Queen's veil |
| **Blast vs armour** | F1 step 5+ armour door (brute); F3 armour doors | F3 mini: The Iron Colossus | Iron Hall + armoured elites |
| **Mana budget** | F1 room 1 reward: the first modifier runs the starter dry | every room (sustain readout) | forge slot vs mana relic vs a bigger wand |
| **Forge (merge → evolve)** | goal 2 unlocks it (reaching the Warden) | F1 shop tab: merge 2 copies | evolution = level-2 + catalyst relic (goal 11) |
| **Build reading** | boss adapt banners (announced) | Archlich mirror_volley | Heat 4+ always-on adapts |

---

## §2 Level-data format (level-and-content-design DOG 6)

- **Format:** custom JSON (`data/rooms.json`): ASCII `grid` rows with a documented `legend`, plus `fixedWaves` / `tutorialReward` for scripted rooms. Floors, pools and budgets live in `data/floors.json`.
- **Iteration without engineering:** add a room = append a template (grid + kind + floors) and list its id in a floor's `combatRooms`. Rebalance an encounter = edit `waves.*.budgetBase/PerStep`, `enemyPool` weights or `minStep` → reload. The engine's `db.js` boundary validation must reject (with ids listed): non-rectangular grids, border breaches (except `d`/`D` on row 0), a missing or duplicate `P`, `x`/`c`/`B` unreachable from `P` over walkable tiles, doors unreachable (crates count as passable), combat rooms with < 5 `x`, puzzle rooms without `fixedWaves`, a floor whose puzzle/mini `testKeyword` disagree, floors outside 6–7 rooms, a run budget outside 18–20 min, unknown enemy ids in pools, waves or summons, and unknown card ids in `tutorialReward`. These are the checks the designer's generator ran on every file in this delivery.
- **Grid legend:** `#` wall · `.` floor · `o` pillar (blocks all) · `~` pit (blocks walkers; projectiles and flyers pass) · `b` crate (6 HP, blocks until broken; 25% chance of 1 coin) · `P` player spawn · `x` enemy spawn marker · `d` single door (2 tiles) · `D` choice doors (left pair, right pair) · `c` pedestal · `B` boss spawn.

---

## §3 Inventory (generated)

### Spells (42 = 18 base + 18 level-2 + 6 evolved) — `data/spells.json`

| id | name | element | behaviour / pattern | rarity | minFloor | mana | dmg | keywords | tags | meta |
|---|---|---|---|---|---|---|---|---|---|---|
| `spark_bolt` | Spark Bolt | arcane | bolt | common | 1 | 5 | 5 | — | arcane, stream | — |
| `magic_missile` | Magic Missile | arcane | bolt | uncommon | 1 | 12 | 8 | homing | arcane | — |
| `bouncing_burst` | Bouncing Burst | arcane | bolt | common | 1 | 7 | 4 | bounce | arcane, stream | — |
| `fire_bolt` | Fire Bolt | fire | bolt | common | 1 | 9 | 7 | burn | fire | — |
| `fireball` | Fireball | fire | bolt | uncommon | 1 | 22 | 10 | blast, burn | fire, burst | — |
| `ice_shard` | Ice Shard | frost | bolt | common | 1 | 8 | 5 | pierce, chill | frost, stream | — |
| `frost_nova` | Frost Nova | frost | bolt / ring 8 | uncommon | 1 | 20 | 5 | chill | frost | — |
| `frost_lance` | Frost Lance | frost | bolt | rare | 2 | 20 | 14 | pierce, chill | frost, burst | locked |
| `chain_lightning` | Chain Lightning | shock | bolt | uncommon | 1 | 16 | 6 | shock, chain | shock | — |
| `thunder_orb` | Thunder Orb | shock | bolt | rare | 2 | 30 | 4 | pierce, shock | shock, burst | locked |
| `venom_dart` | Venom Dart | poison | bolt | common | 1 | 6 | 2 | poison | poison, stream | — |
| `toxic_flask` | Toxic Flask | poison | bolt | uncommon | 1 | 18 | 3 | poison, zone | poison, burst, zone | — |
| `boomerang_blade` | Boomerang Blade | arcane | boomerang | uncommon | 1 | 14 | 7 | pierce | arcane | — |
| `arcane_orbit` | Arcane Orbit | arcane | orbit / ring 3 | rare | 1 | 24 | 6 | pierce, orbit | arcane, burst, zone | — |
| `rune_mine` | Rune Mine | fire | mine | uncommon | 1 | 20 | 14 | blast, burn, mine | fire, burst, zone | — |
| `blink_bolt` | Blink Bolt | arcane | bolt | rare | 1 | 25 | 2 | mobility | arcane, mobility | — |
| `comet` | Comet | fire | bolt | rare | 2 | 40 | 30 | pierce, blast, burn | fire, burst | locked |
| `vortex` | Vortex | arcane | bolt | rare | 2 | 30 | 2 | pierce, blast, zone | arcane, burst, zone | locked |

**Level-2 (forge merge, `pool:false`):** `spark_bolt_2`, `magic_missile_2`, `bouncing_burst_2`, `fire_bolt_2`, `fireball_2`, `ice_shard_2`, `frost_nova_2`, `frost_lance_2`, `chain_lightning_2`, `thunder_orb_2`, `venom_dart_2`, `toxic_flask_2`, `boomerang_blade_2`, `arcane_orbit_2`, `rune_mine_2`, `blink_bolt_2`, `comet_2`, `vortex_2`.

**Evolved (forge evolve, `pool:false`):** `sunburst` (Sunburst), `tempest_chain` (Tempest Chain), `glacier_spike` (Glacier Spike), `blight_needle` (Blight Needle), `prism_spark` (Prism Spark), `reaper_disc` (Reaper Disc).

### Modifiers (25) — `data/modifiers.json`

| id | name | type | rarity | minFloor | mana | keywords | tags | meta |
|---|---|---|---|---|---|---|---|---|
| `double_cast` | Double Cast | multicast | common | 1 | 0 | multicast | multicast | — |
| `triple_cast` | Triple Cast | multicast | uncommon | 1 | 5 | multicast | multicast | — |
| `quad_cast` | Quad Cast | multicast | rare | 2 | 12 | multicast | multicast | locked |
| `trigger_hit` | Trigger: Impact | trigger | uncommon | 2 | 10 | trigger | trigger | — |
| `trigger_expire` | Trigger: Expire | trigger | uncommon | 2 | 10 | trigger | trigger | — |
| `trigger_timer` | Trigger: Timer | trigger | uncommon | 2 | 10 | trigger | trigger | locked |
| `damage_up` | Empower | modifier | common | 1 | 10 | — | burst | — |
| `speed_up` | Swiftness | modifier | common | 1 | 3 | — | stream | — |
| `size_up` | Enlarge | modifier | common | 1 | 8 | — | burst | — |
| `accuracy` | Focus | modifier | common | 1 | 2 | — | crit | — |
| `range_up` | Long Reach | modifier | common | 1 | 3 | — | zone | — |
| `heavy` | Heavy Hand | modifier | common | 1 | 5 | — | burst | — |
| `rapid_cast` | Rapid Cast | modifier | common | 1 | 4 | — | stream | — |
| `quickening` | Quickening | modifier | uncommon | 1 | 8 | — | stream | locked |
| `homing` | Seeking | modifier | uncommon | 1 | 10 | homing | stream | — |
| `pierce` | Piercing | modifier | common | 1 | 8 | pierce | arcane | — |
| `bounce` | Ricochet | modifier | common | 1 | 5 | bounce | zone | — |
| `split` | Splinter | modifier | uncommon | 1 | 12 | split | zone | — |
| `explosive` | Volatile | modifier | uncommon | 1 | 16 | blast | burst | — |
| `chain` | Arc Link | modifier | uncommon | 1 | 12 | shock, chain | shock | — |
| `crit_up` | Keen Edge | modifier | uncommon | 1 | 6 | crit | crit | locked |
| `infuse_fire` | Infuse: Fire | modifier | common | 1 | 6 | burn | fire | — |
| `infuse_frost` | Infuse: Frost | modifier | common | 1 | 6 | chill | frost | — |
| `infuse_shock` | Infuse: Shock | modifier | common | 1 | 6 | shock | shock | — |
| `infuse_poison` | Infuse: Poison | modifier | common | 1 | 6 | poison | poison | — |

### Wands (10) — `data/wands.json`

| id | name | tier | rarity | cap | mana/regen | castDelay/recharge ms | spells/cast | preset | special | meta |
|---|---|---|---|---|---|---|---|---|---|---|
| `apprentice_wand` | Apprentice Wand | 0 | starter | 3 | 50/18 | 250/400 | 1 | spark_bolt, spark_bolt | — | — |
| `ember_rod` | Ember Rod | 1 | common | 5 | 70/22 | 220/450 | 1 | fire_bolt | — | — |
| `glass_needle` | Glass Needle | 1 | common | 4 | 45/26 | 90/300 | 1 | venom_dart | — | — |
| `twin_fork` | Twin Fork | 1 | uncommon | 5 | 90/28 | 300/650 | 2 | fire_bolt, ice_shard | — | — |
| `stormcaller_staff` | Stormcaller Staff | 2 | uncommon | 6 | 120/36 | 200/600 | 1 | chain_lightning | — | — |
| `oak_staff` | Old Oak Staff | 2 | uncommon | 7 | 150/24 | 380/900 | 1 | trigger_hit, spark_bolt | — | — |
| `grave_scepter` | Grave Scepter | 2 | rare | 6 | 180/30 | 450/350 | 1 | fireball | — | — |
| `chaos_branch` | Chaos Branch | 2 | rare | 8 | 140/44 | 110/280 | 1 | spark_bolt, fire_bolt, ice_shard | shuffle | locked |
| `echo_wand` | Echo Wand | 2 | rare | 5 | 90/32 | 300/600 | 1 | spark_bolt | always: double_cast | locked |
| `archmage_scepter` | Archmage's Scepter | 3 | legendary | 10 | 260/55 | 180/700 | 1 | triple_cast, spark_bolt | — | locked |

### Relics (37) — `data/relics.json`

| id | name | category | rarity | effect types | tags | meta |
|---|---|---|---|---|---|---|
| `ember_heart` | Ember Heart | status | uncommon | shot_stat, status_rule | fire | — |
| `frost_crown` | Frost Crown | status | uncommon | status_rule | frost | — |
| `storm_battery` | Storm Battery | status | uncommon | effect_param | shock | — |
| `plague_vial` | Plague Vial | status | uncommon | status_rule | poison | — |
| `echo_chamber` | Echo Chamber | conditional | uncommon | on_event | stream | — |
| `blast_boots` | Blast Boots | conditional | uncommon | on_event | mobility, burst | — |
| `merchant_seal` | Merchant's Seal | rule | uncommon | economy | — | — |
| `thorn_mantle` | Thorn Mantle | conditional | uncommon | on_event | arcane | — |
| `shatter_heart` | Shatter Heart | status | uncommon | on_event | frost | — |
| `kindling` | Kindling | status | rare | on_event | fire, burst | locked |
| `shadow_cloak` | Shadow Cloak | rule | rare | player_stat | mobility | — |
| `vampiric_fang` | Vampiric Fang | scaling | rare | on_event | — | — |
| `alchemist_stone` | Alchemist's Stone | status | rare | status_rule | fire, frost, shock, poison | locked |
| `prism_shard` | Prism Shard | status | rare | effect_param | zone | locked |
| `warding_sigil` | Warding Sigil | conditional | rare | on_event | — | locked |
| `phoenix_feather` | Phoenix Feather | rule | legendary | on_event | — | locked |
| `last_stand` | Last Stand | conditional | uncommon | shot_stat | burst | — |
| `first_light` | First Light | conditional | uncommon | shot_stat | burst | — |
| `still_hand` | Still Hand | conditional | uncommon | player_stat | stream | — |
| `crowd_reader` | Crowd Reader | conditional | uncommon | effect_param | burst, zone | — |
| `full_focus` | Full Focus | conditional | common | shot_stat | crit | — |
| `tally_stone` | Tally Stone | scaling | common | shot_stat | burst | — |
| `unbroken_seal` | Unbroken Seal | scaling | uncommon | shot_stat | crit | — |
| `misers_ring` | Miser's Ring | scaling | uncommon | shot_stat | — | — |
| `deepening_well` | Deepening Well | scaling | common | player_stat | stream | — |
| `hollow_runes` | Hollow Runes | rule | rare | rule | multicast, trigger | — |
| `echoing_payload` | Echoing Payload | rule | rare | rule | trigger | — |
| `endless_page` | Endless Page | rule | rare | rule | multicast | — |
| `overflow_cell` | Overflow Cell | rule | uncommon | rule | burst | — |
| `steam_engine` | Steam Engine (duo: ember_heart + frost_crown) | duo | duo | rule | fire, frost | — |
| `storm_furnace` | Storm Furnace (duo: storm_battery + kindling) | duo | duo | rule | fire, shock | — |
| `plague_bloom` | Plague Bloom (duo: plague_vial + alchemist_stone) | duo | duo | rule | poison, fire | — |
| `thorn_blaze` | Thorn Blaze (duo: thorn_mantle + blast_boots) | duo | duo | on_event | burst, mobility | — |
| `cracked_crown` | Cracked Crown | corrupted | corrupted | player_stat, shot_stat | burst | — |
| `hungry_rune` | Hungry Rune | corrupted | corrupted | player_stat, rule | multicast | — |
| `blood_ink` | Blood Ink | corrupted | corrupted | player_stat, rule | stream | — |
| `unstable_core` | Unstable Core | corrupted | corrupted | effect_param, rule | burst | — |

### Enemies (21) — `data/enemies.json`

| id | name | world native | archetype | role | defence | movement | hp (F1) | threat | attacks (windup ms) | immune |
|---|---|---|---|---|---|---|---|---|---|---|
| `bat` | Crypt Bat | w1_sunken_crypt | swarm | pressure | — | swarm | 6 | 1 | contact | — |
| `skeleton` | Skeleton | w1_sunken_crypt | chaser | pressure | — | chaser | 18 | 2 | swipe (450) | — |
| `cultist` | Cultist | — | ranged_shooter | pressure | — | kiter | 16 | 3 | bolt (550) | — |
| `frost_mage` | Frost Mage | w2_drowned_halls | ranged_shooter | anchor | — | kiter | 18 | 3 | frost_orbs (650) | chill, freeze |
| `brute` | Grave Brute | — | charger | anchor | armour 24 | chaser | 40 | 4 | charge (700) | — |
| `slime` | Bog Slime | — | splitter | pressure | — | chaser | 24 | 3 | contact | — |
| `slimelet` | Slimelet | — | splitter | summon | — | chaser | 8 | 0 | contact | — |
| `fire_imp` | Fire Imp | — | bomber | pressure | — | chaser | 12 | 3 | fuse (600) | burn |
| `eye_turret` | Watcher Eye | — | turret | anchor | — | stationary | 30 | 4 | eye_ring (650), eye_burst (500) | — |
| `wraith` | Wraith | w2_drowned_halls | teleporter | anchor | ward 3 | drifter | 22 | 5 | wraith_blink (500), wraith_volley (450) | poison |
| `necromancer` | Necromancer | — | summoner | anchor | — | kiter | 34 | 6 | raise (900) | — |
| `skull` | Flying Skull | — | swarm | summon | — | chaser | 5 | 0 | contact | — |
| `stone_golem` | Stone Golem | w3_last_library | tank | anchor | armour 70 | chaser | 90 | 8 | stomp (850) | stun |
| `tomb_sentinel` | Tomb Sentinel | w1_sunken_crypt | shield | anchor | shield | chaser | 26 | 4 | spear_thrust (600) | — |
| `lantern_acolyte` | Lantern Acolyte | w2_drowned_halls | support | support | ward 2 | kiter | 20 | 4 | kindle_ward (800) | — |
| `bone_archer` | Bone Archer | w1_sunken_crypt | ranged_shooter | pressure | — | kiter | 14 | 3 | bone_arrow (600) | — |
| `drowned_thrall` | Drowned Thrall | w2_drowned_halls | chaser | pressure | ward 2 | chaser | 22 | 3 | grasp (500) | chill |
| `mire_leech` | Mire Leech | w2_drowned_halls | swarm | pressure | — | swarm | 7 | 1 | contact | poison |
| `animated_armor` | Animated Armour | w3_last_library | tank | anchor | armour 36 | chaser | 20 | 4 | halberd (550) | poison |
| `bound_tome` | Bound Tome | w3_last_library | turret | anchor | armour 20 | stationary | 24 | 4 | page_storm (650), ink_bolt (550) | — |
| `ink_imp` | Ink Imp | w3_last_library | bomber | pressure | — | chaser | 12 | 3 | ink_fuse (600) | poison |

### Bosses and mini-bosses (6) — `data/bosses.json`

| id | name | tier | floor | hp | defence | phases | attacks | test keyword | heat attack |
|---|---|---|---|---|---|---|---|---|---|
| `grave_warden` | The Grave Warden | mini | 1 | 260 | shield | 2 | 3 | pierce | bone_toss |
| `lantern_matron` | The Lantern Matron | mini | 2 | 600 | ward | 2 | 4 | shock | ember_fan |
| `iron_colossus` | The Iron Colossus | mini | 3 | 900 | armour | 2 | 3 | blast | rock_volley |
| `ossuary_knight` | The Ossuary Knight | boss | 1 | 520 | — | 2 | 8 | — | bone_rain |
| `mire_queen` | The Mire Queen | boss | 2 | 1100 | — | 2 | 9 | — | bog_surge |
| `archlich` | Vorn, the Archlich | boss | 3 | 2000 | — | 3 | 11 | — | grand_spiral |

### Worlds (3) — `floors[].world` (worlds.md)

| floor | world id | name | counter | twist | natives | tileset / music / ambience |
|---|---|---|---|---|---|---|
| f1 | `w1_sunken_crypt` | The Sunken Crypt | pierce | candlelight | skeleton, bat, bone_archer, tomb_sentinel | `tiles_f1` / `music.w1` / `amb.w1` |
| f2 | `w2_drowned_halls` | The Drowned Halls | shock | flooded (NEW behaviour) | drowned_thrall, mire_leech, lantern_acolyte, wraith, frost_mage | `tiles_f2` / `music.w2` / `amb.w2` |
| f3 | `w3_last_library` | The Last Library | blast | bookshelves (NEW behaviour) | animated_armor, bound_tome, ink_imp, stone_golem | `tiles_f3` / `music.w3` / `amb.w3` |

### Room templates (24) — `data/rooms.json`

| id | kind | floors | size | puzzle | design idea |
|---|---|---|---|---|---|
| `sanctum` | start | 1 | 20×13 | — | Teach MOVE + CAST: the only way to the door is through a wall of 4 crates. |
| `tut_first_blood` | combat | 1 | 26×15 | — | Isolate CAST under light pressure: slow skeletons, then a bat flock. Reward teaches SLOT A MODIFIER. |
| `tut_gauntlet` | combat | 1 | 30×15 | — | Introduce DASH: a brute charges down a pit-lined lane while a cultist fires; dash i-frames beat both. |
| `landing` | start | 2,3 | 18×11 | — | Breather on floor arrival; doors only. |
| `crypt_small_a` | combat | 1,2,3 | 24×14 | — | Tight room, four pillars to break line of sight. |
| `crypt_small_b` | combat | 1,2,3 | 24×14 | — | A central pit splits the room; projectiles cross it, walkers go around. |
| `hall_pillars` | combat | 1,2,3 | 32×18 | — | A pillar grid: cover for you and for shooters. |
| `pit_cross` | combat | 1,2,3 | 32×18 | — | A plus-shaped pit makes four quadrants; walkers route around, spells fly over. |
| `twin_pools` | combat | 1,2,3 | 32×18 | — | Two pools funnel melee enemies into the centre lane. |
| `great_hall` | combat | 2,3 | 40×22 | — | A wide colonnade; room for swarms and kiting. |
| `ring_pit` | combat | 2,3 | 40×22 | — | A pit ring around an island with two bridges: fight on the island or around the rim. |
| `ruins` | combat | 2,3 | 40×22 | — | Broken walls create ambush corners; cover matters. |
| `long_gallery` | combat | 2,3 | 48×20 | — | Wider than the screen: the camera scrolls, threats arrive from the edges. |
| `catacombs` | combat | 3 | 44×26 | — | A scrolling maze-lite: corridors break swarms into lines. Floor 3 only. |
| `elite_arena` | elite | 1,2,3 | 30×18 | — | Diamond of pillars around an open centre: room to read one empowered enemy's tells. |
| `vault` | treasure | 1,2,3 | 16×11 | — | Breather: one pedestal, no enemies. |
| `shop` | shop | 1,2,3 | 22×13 | — | Breather: 6 pedestals (3 cards, 1 relic, 1 wand, 1 heal on the second row). |
| `arena_ossuary` | boss | 1 | 34×20 | — | Four corner pillars: bait the Knight's charge into one to earn a 1.2s punish window. |
| `arena_mire` | boss | 2 | 36×22 | — | Pits in the corners shrink safe space; acid pools shrink it further. |
| `arena_lich` | boss | 3 | 36×22 | — | A ring of 8 pillars: cover from volleys, but spirals sweep around it. |
| `crypt_arena` | miniboss | 1,2,3 | 30×18 | — | Mini-boss arena: four pillars to bait a charge or break line of sight; room to read one boss. |
| `sentinel_gate` | combat | 1 | 30×17 | pierce | PUZZLE (pierce): a line of shield-bearers advances. Answer 1: pierce through the shields. Answer 2: flank them past the pillars. |
| `choir_of_wards` | combat | 2 | 32×18 | shock | PUZZLE (shock): acolytes keep re-warding wraiths across a pit. Answer 1: shock strips the wards. Answer 2: burst the acolytes first. |
| `iron_hall` | combat | 3 | 34×20 | blast | PUZZLE (blast): armoured golems in an open hall. Answer 1: blast tears the armour off. Answer 2: kite and grind while clearing the fodder. |

### Affixes (5), modes (3), forge recipes (25), goals (15), loadouts (4)

Affixes: `armoured`, `warded`, `shielded`, `hasted`, `volatile`.  
Modes: `standard`, `gentle`, `daily`.  
Forge: 18 merges, 6 evolutions, 1 slot upgrade.  
Goals: 1. `g_first_run`, 2. `g_reach_mini`, 3. `g_persistence`, 4. `g_kill_mini1`, 5. `g_reach_f2`, 6. `g_kill_boss1`, 7. `g_breaker`, 8. `g_first_payload`, 9. `g_reach_f3`, 10. `g_kill_boss2`, 11. `g_forgewright`, 12. `g_kindred`, 13. `g_win`, 14. `g_daily`, 15. `g_heat3`.
