# Spellwright — `content-inventory` + first-run teaching sequence (`level-data` companion)

**Owner:** Game Designer · **Status:** Wave 1, v1 · **Consumers:** Game Developer (data loading and validation), 2D Artist (one visual per id; `visual.element` + `visual.shape` hints only, since assets map later), Audio Director (cue coverage), UX Designer (codex, FTUE prompts).
**Rule:** the tables below are **generated from `data/*.json`** (not hand-copied). If they disagree with the data, the data wins, and the table is regenerated.

**Counts:** 18 spells · 25 modifiers (incl. 3 multicast, 3 trigger) · 10 wands (1 starter + 9 found) · 26 relics · 13 enemies (11 spawnable + 2 summon-only) · 3 bosses (6 / 7 / 9 attack definitions; 2 / 2 / 3 phases) · 20 room templates · 3 floors · 9 unlock milestones · 4 loadouts. Card ids (spells + modifiers) are one namespace.

---

## §1 First-run teaching sequence (introduce → isolate → recombine)

The first three rooms teach **move → cast → slot a modifier → dash**, entirely through layout and one scripted reward. Text is limited to the UX's control-hint prompts (UX owns `ftue-flow`; the triggers listed here are player-state conditions, not timers).

| # | Room (template) | The one idea | How the layout teaches it (no text) | Scripted content | UX prompt trigger (brief to `ftue-flow`) |
|---|---|---|---|---|---|
| 0 | **Sanctum** (`sanctum`, 20×13) | **Move + Cast** | The player spawns in the south half. The only way to the north door is a wall of **4 crates** (6 HP each; spark bolt = 5 → 2 hits each). Walking to the door shows the barrier; the wand is already in hand. Pillars give the aim something to miss. No enemies, so failure is free. | Starter wand `apprentice_wand` [spark_bolt, spark_bolt, —, —] | "Move" hint if no move input within 3 s; "Aim + hold to cast" hint when the player stands ≤ 3 tiles from the crates without casting for 2 s |
| 1 | **First Blood** (`tut_first_blood`, 26×15) | **Isolate cast** under light pressure | Four pillars in an open room. Wave 1: 3 slow skeletons (44 px/s vs the player's 110) that are easy to kite and shoot. Wave 2: 4 bats + 1 skeleton, which forces aiming at erratic targets. Skeleton swipes (450 ms windup) teach "a flash before a hit" without dash pressure (walking away beats a swipe). | `fixedWaves` in the data | "Hold to keep casting" if the player taps 5+ times in 5 s |
| 1→ | Reward: **slot a modifier** | Draft of 3 modifiers, fixed: `double_cast`, `damage_up`, `homing`. **Every one works in any empty slot** (wrap guarantee, mechanic-spec Ex 2), so the lesson can't fail. | `tutorialReward` | On pickup, open the wand editor with the new card and the first empty slot highlighted; close is allowed (it can be slotted later) |
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

---

## §2 Level-data format (level-and-content-design DOG 6)

- **Format:** custom JSON (`data/rooms.json`): ASCII `grid` rows with a documented `legend`, plus `fixedWaves` / `tutorialReward` for scripted rooms. Floors, pools and budgets live in `data/floors.json`.
- **Iteration without engineering:** add a room = append a template (grid + kind + floors) and list its id in a floor's `combatRooms`. Rebalance an encounter = edit `waves.*.budgetBase/PerStep`, `enemyPool` weights or `minStep` → reload. The engine's `db.js` boundary validation must reject (with ids listed): non-rectangular grids, border breaches (except `d`/`D` on row 0), a missing or duplicate `P`, `x`/`c`/`B` unreachable from `P` over walkable tiles, doors unreachable (crates count as passable), combat rooms with < 5 `x`, unknown enemy ids in pools, waves or summons, and unknown card ids in `tutorialReward`. These are the checks the designer's generator ran on every file in this delivery.
- **Grid legend:** `#` wall · `.` floor · `o` pillar (blocks all) · `~` pit (blocks walkers; projectiles and flyers pass) · `b` crate (6 HP, blocks until broken; 25% chance of 1 coin) · `P` player spawn · `x` enemy spawn marker · `d` single door (2 tiles) · `D` choice doors (left pair, right pair) · `c` pedestal · `B` boss spawn.

---

## §3 Inventory (generated)

### Spells (18) — `data/spells.json`

| id | name | element | behaviour / pattern | rarity | minFloor | mana | dmg | meta |
|---|---|---|---|---|---|---|---|---|
| `spark_bolt` | Spark Bolt | arcane | bolt | common | 1 | 5 | 5 | — |
| `magic_missile` | Magic Missile | arcane | bolt | uncommon | 1 | 12 | 8 | — |
| `bouncing_burst` | Bouncing Burst | arcane | bolt | common | 1 | 7 | 4 | — |
| `fire_bolt` | Fire Bolt | fire | bolt | common | 1 | 9 | 7 | — |
| `fireball` | Fireball | fire | bolt | uncommon | 1 | 22 | 10 | — |
| `ice_shard` | Ice Shard | frost | bolt | common | 1 | 8 | 5 | — |
| `frost_nova` | Frost Nova | frost | bolt / ring 8 | uncommon | 1 | 20 | 5 | — |
| `frost_lance` | Frost Lance | frost | bolt | rare | 2 | 20 | 14 | locked |
| `chain_lightning` | Chain Lightning | shock | bolt | uncommon | 1 | 16 | 6 | — |
| `thunder_orb` | Thunder Orb | shock | bolt | rare | 2 | 30 | 4 | locked |
| `venom_dart` | Venom Dart | poison | bolt | common | 1 | 6 | 2 | — |
| `toxic_flask` | Toxic Flask | poison | bolt | uncommon | 1 | 18 | 3 | — |
| `boomerang_blade` | Boomerang Blade | arcane | boomerang | uncommon | 1 | 14 | 7 | — |
| `arcane_orbit` | Arcane Orbit | arcane | orbit / ring 3 | rare | 1 | 24 | 6 | — |
| `rune_mine` | Rune Mine | fire | mine | uncommon | 1 | 20 | 14 | — |
| `blink_bolt` | Blink Bolt | arcane | bolt | rare | 1 | 25 | 2 | — |
| `comet` | Comet | fire | bolt | rare | 2 | 40 | 30 | locked |
| `vortex` | Vortex | arcane | bolt | rare | 2 | 30 | 2 | locked |

### Modifiers (25) — `data/modifiers.json`

| id | name | type | rarity | minFloor | mana | meta |
|---|---|---|---|---|---|---|
| `double_cast` | Double Cast | multicast | common | 1 | 0 | — |
| `triple_cast` | Triple Cast | multicast | uncommon | 1 | 5 | — |
| `quad_cast` | Quad Cast | multicast | rare | 2 | 12 | locked |
| `trigger_hit` | Trigger: Impact | trigger | uncommon | 2 | 10 | — |
| `trigger_expire` | Trigger: Expire | trigger | uncommon | 2 | 10 | — |
| `trigger_timer` | Trigger: Timer | trigger | uncommon | 2 | 10 | locked |
| `damage_up` | Empower | modifier | common | 1 | 10 | — |
| `speed_up` | Swiftness | modifier | common | 1 | 3 | — |
| `size_up` | Enlarge | modifier | common | 1 | 8 | — |
| `accuracy` | Focus | modifier | common | 1 | 2 | — |
| `range_up` | Long Reach | modifier | common | 1 | 3 | — |
| `heavy` | Heavy Hand | modifier | common | 1 | 5 | — |
| `rapid_cast` | Rapid Cast | modifier | common | 1 | 4 | — |
| `quickening` | Quickening | modifier | uncommon | 1 | 8 | locked |
| `homing` | Seeking | modifier | uncommon | 1 | 10 | — |
| `pierce` | Piercing | modifier | common | 1 | 8 | — |
| `bounce` | Ricochet | modifier | common | 1 | 5 | — |
| `split` | Splinter | modifier | uncommon | 1 | 12 | — |
| `explosive` | Volatile | modifier | uncommon | 1 | 16 | — |
| `chain` | Arc Link | modifier | uncommon | 1 | 12 | — |
| `crit_up` | Keen Edge | modifier | uncommon | 1 | 6 | locked |
| `infuse_fire` | Infuse: Fire | modifier | common | 1 | 6 | — |
| `infuse_frost` | Infuse: Frost | modifier | common | 1 | 6 | — |
| `infuse_shock` | Infuse: Shock | modifier | common | 1 | 6 | — |
| `infuse_poison` | Infuse: Poison | modifier | common | 1 | 6 | — |

### Wands (10: 1 starter + 9 found) — `data/wands.json`

| id | name | rarity | cap | mana/regen | castDelay/recharge ms | spread | spells/cast | special | meta |
|---|---|---|---|---|---|---|---|---|---|
| `apprentice_wand` | Apprentice Wand | starter | 4 | 60/25 | 250/400 | 3 | 1 | — | — |
| `ember_rod` | Ember Rod | common | 4 | 80/28 | 220/450 | 4 | 1 | — | — |
| `glass_needle` | Glass Needle | common | 3 | 50/34 | 90/300 | 1 | 1 | — | — |
| `twin_fork` | Twin Fork | uncommon | 5 | 100/32 | 300/650 | 7 | 2 | — | — |
| `stormcaller_staff` | Stormcaller Staff | uncommon | 6 | 140/45 | 200/600 | 4 | 1 | — | — |
| `oak_staff` | Old Oak Staff | uncommon | 7 | 180/28 | 380/900 | 2 | 1 | — | — |
| `grave_scepter` | Grave Scepter | rare | 6 | 220/36 | 450/350 | 0 | 1 | — | — |
| `chaos_branch` | Chaos Branch | rare | 8 | 160/55 | 110/280 | 10 | 1 | shuffle | locked |
| `echo_wand` | Echo Wand | rare | 4 | 110/40 | 300/600 | 6 | 1 | always: double_cast | locked |
| `archmage_scepter` | Archmage's Scepter | legendary | 10 | 320/70 | 180/700 | 3 | 1 | — | locked |

### Relics (26) — `data/relics.json`

| id | name | rarity | effect types | meta |
|---|---|---|---|---|
| `arcane_whetstone` | Arcane Whetstone | common | shot_stat | — |
| `winged_boots` | Winged Boots | common | player_stat | — |
| `magnet_charm` | Magnet Charm | common | player_stat | — |
| `mana_font` | Mana Font | common | player_stat | — |
| `deep_well` | Deep Well | common | player_stat | — |
| `heart_vessel` | Heart Vessel | common | player_stat | — |
| `greed_ring` | Greed Ring | common | economy | — |
| `ember_heart` | Ember Heart | uncommon | shot_stat, status_rule | — |
| `frost_crown` | Frost Crown | uncommon | status_rule | — |
| `storm_battery` | Storm Battery | uncommon | effect_param | — |
| `plague_vial` | Plague Vial | uncommon | status_rule | — |
| `glass_lens` | Glass Lens | uncommon | shot_stat | — |
| `quickened_quill` | Quickened Quill | uncommon | player_stat | — |
| `sand_hourglass` | Sand Hourglass | uncommon | player_stat | — |
| `echo_chamber` | Echo Chamber | uncommon | on_event | — |
| `blast_boots` | Blast Boots | uncommon | on_event | — |
| `merchant_seal` | Merchant's Seal | uncommon | economy | — |
| `thorn_mantle` | Thorn Mantle | uncommon | on_event | — |
| `shatter_heart` | Shatter Heart | uncommon | on_event | — |
| `kindling` | Kindling | rare | on_event | locked |
| `shadow_cloak` | Shadow Cloak | rare | player_stat | — |
| `vampiric_fang` | Vampiric Fang | rare | on_event | — |
| `alchemist_stone` | Alchemist's Stone | rare | status_rule | locked |
| `prism_shard` | Prism Shard | rare | effect_param | locked |
| `warding_sigil` | Warding Sigil | rare | on_event | locked |
| `phoenix_feather` | Phoenix Feather | legendary | on_event | locked |

### Enemies (13: 11 spawnable + 2 summon-only) — `data/enemies.json`

| id | name | archetype | movement | hp (F1) | threat | attacks (windup ms) | immune |
|---|---|---|---|---|---|---|---|
| `bat` | Crypt Bat | swarm | swarm | 6 | 1 | contact | — |
| `skeleton` | Skeleton | chaser | chaser | 18 | 2 | swipe (450) | — |
| `cultist` | Cultist | ranged_shooter | kiter | 16 | 3 | bolt (550) | — |
| `frost_mage` | Frost Mage | ranged_shooter | kiter | 18 | 3 | frost_orbs (650) | chill, freeze |
| `brute` | Grave Brute | charger | chaser | 40 | 4 | charge (700) | — |
| `slime` | Bog Slime | splitter | chaser | 24 | 3 | contact | — |
| `slimelet` | Slimelet | splitter | chaser | 8 | 0 | contact | — |
| `fire_imp` | Fire Imp | bomber | chaser | 12 | 3 | fuse (600) | burn |
| `eye_turret` | Watcher Eye | turret | stationary | 30 | 4 | eye_ring (650), eye_burst (500) | — |
| `wraith` | Wraith | teleporter | drifter | 22 | 5 | wraith_blink (500), wraith_volley (450) | poison |
| `necromancer` | Necromancer | summoner | kiter | 34 | 6 | raise (900) | — |
| `skull` | Flying Skull | swarm | chaser | 5 | 0 | contact | — |
| `stone_golem` | Stone Golem | tank | chaser | 90 | 8 | stomp (850) | stun |

### Bosses (3) — `data/bosses.json`

| id | name | floor | hp | phases | attacks |
|---|---|---|---|---|---|
| `ossuary_knight` | The Ossuary Knight | 1 | 700 | 2 | 6 |
| `mire_queen` | The Mire Queen | 2 | 1500 | 2 | 7 |
| `archlich` | Vorn, the Archlich | 3 | 2600 | 3 | 9 |

### Room templates (20) — `data/rooms.json`

| id | kind | floors | size (tiles) | design idea |
|---|---|---|---|---|
| `sanctum` | start | 1 | 20×13 | Teach MOVE + CAST: the only way to the door is through a wall of 4 crates. |
| `tut_first_blood` | combat | 1 | 26×15 | Isolate CAST under light pressure: slow skeletons, then a bat flock. Reward teaches SLOT A MODIFIER. |
| `tut_gauntlet` | combat | 1 | 30×15 | Introduce DASH: a brute charges down a pit-lined lane while a cultist fires; dash i-frames beat both. |
| `landing` | start | 2,3 | 18×11 | Breather on floor arrival; doors only. |
| `crypt_small_a` | combat | 1,2,3 | 24×14 | Tight room, four pillars to break line of sight. |
| `crypt_small_b` | combat | 1,2,3 | 24×14 | A central pit splits the room; projectiles cross it, walkers go around. |
| `hall_pillars` | combat | 1,2,3 | 32×18 | A pillar grid: cover for you and for shooters. |
| `pit_cross` | combat | 1,2,3 | 32×18 | A plus-shaped pit makes four quadrants; walkers route around, spells fly over. |
| `twin_pools` | combat | 1,2,3 | 32×18 | Two pools funnel melee enemies into the centre lane. |
| `great_hall` | combat | 2,3 | 40×22 | A wide colonnade; room for swarms and kiting. |
| `ring_pit` | combat | 2,3 | 40×22 | A pit ring around an island with two bridges: fight on the island or around the rim. |
| `ruins` | combat | 2,3 | 40×22 | Broken walls create ambush corners; cover matters. |
| `long_gallery` | combat | 2,3 | 48×20 | Wider than the screen: the camera scrolls, threats arrive from the edges. |
| `catacombs` | combat | 3 | 44×26 | A scrolling maze-lite: corridors break swarms into lines. Floor 3 only. |
| `elite_arena` | elite | 1,2,3 | 30×18 | Diamond of pillars around an open centre: room to read one empowered enemy's tells. |
| `vault` | treasure | 1,2,3 | 16×11 | Breather: one pedestal, no enemies. |
| `shop` | shop | 1,2,3 | 22×13 | Breather: 6 pedestals (3 cards, 1 relic, 1 wand, 1 heal on the second row). |
| `arena_ossuary` | boss | 1 | 34×20 | Four corner pillars: bait the Knight's charge into one to earn a 1.2s punish window. |
| `arena_mire` | boss | 2 | 36×22 | Pits in the corners shrink safe space; acid pools shrink it further. |
| `arena_lich` | boss | 3 | 36×22 | A ring of 8 pillars: cover from volleys, but spirals sweep around it. |

### Floors (3) · Unlock milestones (9) · Loadouts (4)

Floors: `f1` The Sunken Crypt, `f2` The Drowned Halls, `f3` The Last Library.  
Unlocks: `reach_floor_2`, `kill_ossuary_knight`, `reach_floor_3`, `kill_mire_queen`, `win_run`, `all_reactions`, `slayer_300`, `first_payload`, `three_deaths`.  
Loadouts: `apprentice`, `pyromancer`, `stormcaller`, `hexer` (apprentice unlocked by default).
