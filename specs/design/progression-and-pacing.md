# Spellwright — progression, pacing, bosses and meta (`progression-curve` + `pacing-spec`)

**Owner:** Game Designer · **Status:** Wave 1, v1 · **Consumers:** Game Developer (`RoomDirector`, wave generation, boss runner, run-end, meta save), UX Designer (door icons, run-end, codex, loadout select), Audio Director (tension/release beats §2, boss phases §5), Animator (boss telegraphs §5).
**Data:** `floors.json` (run graph, pools, budgets), `rooms.json` (templates), `enemies.json`, `bosses.json`, `economy.json`, `unlocks.json`, `loadouts.json`, `rules.json` (`waves`, `enemies`, `curses`).

---

> **v2 (design-v2.md) supersedes §1 (run structure), the §3 budgets, the §4.3 numbers, the §5 boss HP and §7 (meta).** The v2 versions are §10–§14 below. §2, §4.1, §4.4 principles, §6 schedule typing and §8 still hold.

## §1 Run structure

A run = **3 floors × 10 steps** (step 0 start … step 9 boss). Each step is one room. Rooms never repeat within a floor (template choice avoids the previous template when possible).

| Floor | Name | Enemy HP ×, proj speed ×, coins × | Combat waves | Boss | New threats |
|---|---|---|---|---|---|
| 1 | The Sunken Crypt | 1.0 · 1.0 · 1.0 | 2 | The Ossuary Knight (700 HP, 2 phases) | bat, skeleton → slime, cultist → brute (s4) → fire imp (s6) |
| 2 | The Drowned Halls | 1.75 · 1.08 · 1.3 | 3 | The Mire Queen (1500 HP, 2 phases) | frost mage, eye turret (s2), wraith (s3), necromancer (s5) |
| 3 | The Last Library | 2.8 · 1.15 · 1.6 | 3 | Vorn, the Archlich (2600 HP, 3 phases) | stone golem (s3); all threats mixed |

### 1.1 The door-choice graph (Hades-style)

After a room clears, its doors open and each shows **(room kind, reward kind)** icons. Walking through a door commits to it.

```text
step: 0        1        2        3             4              5      6             7              8             9
F1: [Start]→[C:mod]→[C:spell]→{C:spell|C:mod|  {C:spell|C:mod| [Shop]→{C:mod|C:heal|  {C:spell|T:relic| {E:relic|C:heal| [Boss]
                             C:coins|T:wand}   E:relic}              E:relic|C:coins} C:mod|T:wand}    C:spell}
F2: [Landing]→{C:spell|C:mod|T:wand}→{C:mod|C:coins|E:relic}→{C:spell|C:mod|T:relic}→{E:relic|C:heal|C:spell}→[Shop]→…→[Boss]
F3: [Landing]→ … 6 choice steps … →[Shop @ step 7]→{C:heal|E:relic|C:mod}→[Boss → VICTORY]
      C = combat, E = elite, T = treasure (no enemies); {…} = choose 2 of the pool (weighted, distinct), shown as 2 doors
```

- `fixed` steps show one centre door (`d`). `choose: 2` steps show the left and right doors (`D`), drawn without replacement from `from[]` by `weight` (run stream).
- `limits`: at most 1 `heal` and 1 `wand` reward per floor. Once used, those options are removed from later pools on that floor. If a pool then has fewer than 2 options, show 1 door.
- **First run only** (`save.meta.tutorialDone == false`): F1 steps 1–2 use `tutorialTemplate` (`tut_first_blood`, `tut_gauntlet`) with `fixedWaves` and the fixed `tutorialReward` drafts. `tutorialDone` is set when step 3's doors open. Afterwards, steps 1–2 roll normal combat templates and waves.
- Floor transition: the boss room's centre door becomes a stair after the boss dies → fade → next floor's `landing`.

### 1.2 Session shape (≈ numbers from §4)

| Segment | Median time |
|---|---|
| F1 (7 rooms + shop + boss + menus) | ≈ 9 min |
| F2 | ≈ 10.5 min |
| F3 | ≈ 11.5 min |
| **Winning run** | **≈ 31 min** (p10 25, p90 40) |
| Typical early death (runs 1–3) | 6–15 min (F1 boss or early F2) |

---

## §2 Tension and release (macro rhythm; pacing DOG 2)

Beat sequence per floor (Valve L4D/HL2-style labels: Explore / Combat / Peak / Rest):

```text
F1: Explore(Sanctum) · Combat · Combat · [Combat|Rest(treasure)] · [Combat|PEAK(elite)] · REST(shop) · Combat · [Combat|Rest] · [PEAK(elite)|Combat(heal)] · BOSS
F2: Rest(landing) · Combat · [Combat|PEAK] · Combat · [PEAK|Combat] · REST(shop) · Combat · [PEAK|Combat] · Combat · BOSS
F3: Rest(landing) · Combat · [PEAK|Combat] · Combat · [PEAK|Combat] · Combat · [Combat|PEAK] · REST(shop, cash-out) · Combat · FINAL BOSS
```

- **Structural** peak : valley ≈ 8 : 3 per floor, which by itself is above the comfortable 2:1. Two things bring it back into band. (a) **Every combat room ends in a crafting valley**: the reward draft, then the wand editor, at 20–40 s of zero threat. At room grain the rhythm is therefore 1:1: fight ~45–70 s, craft ~20–40 s. (b) The rests (shop, treasure, landing) arrive every ~4 rooms. The player also *chooses* rests at forks (treasure doors), so they self-pace.
- Intra-room rhythm: wave → lull (next wave triggers at ≤ 2 alive after ≥ 8 s, `rules.waves`) → wave. That gives 2–3 micro-peaks per room with the density rising toward the last wave (`waveGrowth` 0.25).
- Audio cue hooks: `room_clear` (release), `wave_spawn` (tension step), `door_open`, `shop` (rest music), boss intro, `boss_phase`.

---

## §3 Waves (generation algorithm; `floors.json.waves`, `rules.waves`)

```text
budget(step, waveIndex) = floor( floor(base + perStep·step) × (1 + waveGrowth·waveIndex) )
fillWave(budget):                       # ai stream
  if elite room and waveIndex == 0: place `elites` elite(s) from eliteCandidates (minStep ok), each costing threat×eliteThreatMult(2)
  loop:
    candidates = floor.enemyPool where minStep ≤ step and threat ≤ remaining and threat > 0
    if none or count == maxPerWave(8): break
    pick weighted by `weight`; remaining -= threat
spawn: all of the wave at once (portal 700 ms), at x markers ≥ 64 px from the player; flyers may use any floor tile
       (in scrolling rooms, enemies spawned off-view must walk into view before they can start an attack: rules.enemies.attackRequiresOnScreen)
next wave: when alive ≤ nextWaveWhenAliveAtMost (2) AND ≥ nextWaveMinElapsedMs (8000) since the wave spawned, or when alive == 0
room clear: last wave spawned and alive == 0 → reward + doors
```

Summoned units (slimelets, skulls, boss adds) have threat 0 and never count toward budgets, but they **do** count as alive for wave triggers and clears.

**Budgets actually produced by the data (total threat per room, waves in brackets):**

| Step | F1 combat | F1 elite | F2 combat | F2 elite | F3 combat | F3 elite |
|---|---|---|---|---|---|---|
| 1 | [5, 6] = 11 | [10, 12] | [9, 11, 13] = 33 | [16, 20] | [12, 15, 18] = 45 | [23, 28] |
| 2 | [6, 7] = 13 | [11, 13] | [10, 12, 15] = 37 | [17, 21] | [13, 16, 19] = 48 | [24, 30] |
| 3 | [7, 8] = 15 | [11, 13] | [11, 13, 16] = 40 | [18, 22] | [14, 17, 21] = 52 | [25, 31] |
| 4 | [8, 10] = 18 | [12, 15] = 27 | [12, 15, 18] = 45 | [19, 23] | [15, 18, 22] = 55 | [26, 32] |
| 6 | [9, 11] = 20 | [13, 16] | [14, 17, 21] = 52 | [20, 25] | [18, 22, 27] = 67 | [28, 35] |
| 7 | [10, 12] = 22 | [14, 17] | [15, 18, 22] = 55 | [21, 26] | [19, 23, 28] = 70 | [29, 36] |
| 8 | [11, 13] = 24 | [14, 17] = 31 | [16, 20, 24] = 60 | [22, 27] | [20, 25, 30] = 75 | [30, 37] |

Pool-weighted averages: threat per enemy 2.5 / 3.2 / 3.9; enemy HP 18.5 / 35.8 / 77.3 (after floor ×). So a typical F1 wave has ~3 enemies, F2 ~4–6, and an F3 final wave ~7–8 (the `maxPerWave` cap).

---

## §4 Difficulty curve (pacing DOG 1, 3–6)

### 4.1 Skill-curve assumption (DOG 5)
**Logarithmic on reading, step-function on building.** Telegraph reading and dodging improve fast in the first 3–5 rooms, then plateau (the Hades and Binding of Isaac first-hour pattern: players stop dying to basic enemies after one or two runs and die to bosses and elites instead). Build understanding jumps in steps at identifiable moments: first modifier (F1 s1), first element (s2), first multicast or reaction (F1), first trigger (F2, `minFloor` 2). Enemy windups never shrink with floor (only curses shrink them), so reading skill is never invalidated. Difficulty rises through **density, HP and composition** instead.

### 4.2 Flow channel (challenge vs expected skill)

```text
challenge ▲                                              ★F3 boss
          │                                     ▲F3 elite   ╱
          │                          ★F2 boss     ╱‾‾‾‾‾‾‾‾╱   ← F3 rooms: density ×3.75 waves, HP ×2.8
          │                 ▲F2 elite    ╱‾‾‾‾‾‾╱
          │       ★F1 boss  ╱‾‾‾‾‾‾‾‾‾╱  ← F2 step 1: deliberate step up (3 waves, HP ×1.75)
          │ ▲F1 elite╱‾‾‾╱
          │  ╱‾‾‾‾‾╱            flow corridor: challenge ≈ skill ± one band
          │╱ tutorial (below the channel on purpose: boredom-side safe start)
          └──────────────────────────────────────────────────────────► expected skill + build power
```

Every point sits in the corridor except the **named excursions**: tutorial rooms (intentionally below, safe learning), elite rooms (above; spikes, §4.4) and bosses (above; spikes). Shops, treasure and landings are valleys below the corridor.

### 4.3 Per-encounter tuning targets (DOG 4)

`dps_in` = HP/s the room's attacks would deal to a player who never dodges (attack cadence × damage), a severity index. `dmg_taken` = the expected median HP lost. `dps_out` = the median-build single-target DPS (`systems.md` §4).

| Encounter | Enemies (total) | dps_in | dps_out | TTK first enemy | HP lost (median) | Time median (p10/p90) | Failure recovery path |
|---|---|---|---|---|---|---|---|
| F1 s1 First Blood (tutorial) | 8 (3 skel · 4 bats + skel) | 0.4 | 15 | 1.2 s | 0.5 | 35 s (25/50) | Death → run end → new run from Sanctum ≈ 20 s to re-enter |
| F1 s2 Gauntlet (tutorial) | 5 (brute, cultist · 2 skel, cultist) | 0.6 | 20 | 1.0 s | 1 | 40 s (30/60) | same |
| F1 combat s1–3 | 5–7 | 0.5 | 20–25 | 0.8 s | 0.5 | 40 s (30/60) | same |
| F1 elite s4 | 1 elite + 6–8 | 0.8 | 30 | elite 3.5 s | 1 | 55 s (40/80) | same; relic reward makes the risk legible |
| F1 combat s6–8 | 8–10 | 0.8 | 35 | 0.6 s | 0.75 | 50 s (35/75) | heal door offered at s6/s8 |
| **F1 boss — Ossuary Knight** | 1 (+3 skel at 50%, +2 per summon) | 1.0 | 35–40 | — | 2–3 | 50 s (35/75) | Deterministic pattern: attempt 2 knows the loop |
| F2 combat s1–4 (**step-up**) | 11–15 | 1.0 | 55 | 0.65 s | 1 | 60 s (45/90) | boss heal 4 just before; landing rest |
| F2 elite | 1 elite + 8–11 | 1.2 | 65 | elite ≈ 1.5 s (wraith 96 HP) | 1.25 | 65 s (50/95) | — |
| F2 combat s6–8 | 16–19 | 1.2 | 80 | 0.45 s | 1 | 70 s (50/100) | heal door s7/s8 |
| **F2 boss — Mire Queen** | 1 (+ slimes) | 1.2 | 80 | — | 2–3 | 55 s (40/80) | same |
| F3 combat s1–6 | 12–18 | 1.4 | 110–140 | 0.6 s | 1.25 | 65 s (50/95) | — |
| F3 elite | 1 elite + 12–15 | 1.6 | 130 | golem elite ≈ 4.8 s (630 HP) | 1.5 | 75 s (55/110) | — |
| F3 combat s8 | 18–20 | 1.6 | 150 | 0.5 s | 1.5 | 70 s (50/105) | shop (cash-out) just before |
| **F3 boss — Vorn, the Archlich** | 1 (+2 wraiths in P2) | 1.5 | 150–180 | — | 3 | 60 s (45/95) | run end → meta unlock screen |

### 4.4 Earned frustration spikes (DOG 3)

| Spike | Teaching reason | First-failure cost | Recovery affordance |
|---|---|---|---|
| F1 s2 Gauntlet (brute charge in a pit lane) | The **dash** atom: i-frames beat a committed attack | Low: ~1 HP; the tutorial rarely kills | The telegraph (700 ms) plus the UX dash prompt on the first windup |
| Elite rooms | **Target priority** and reading one empowered telegraph amid chaff | ~1–2 HP; the run continues | The relic reward is shown on the door, so the risk was chosen |
| F1 boss | **Every F1 atom recombined** (dash the charge, kite the cleave, read the rings) | The run (~9 min) | Deterministic looping pattern; phase 2 announced by a 1.2 s invulnerable beat; pillars bait the charge into a 1.2 s stun |
| F2 step 1 | **Build check**: the F1 build must have grown (×1.75 HP, 3 waves) | Some HP; rarely death | Boss heal +4 right before; the landing is a rest; step 1 offers a wand door |
| F2 boss | **Space denial** (pools + leaps) plus spiral reading | The run (~20 min) | Leap shadow visible 1.5 s; pools marked 0.9 s before active |
| Final boss phase 3 | **Mastery** under density (soul storm, 5-arm spiral) | The run (~30 min) | Phase checkpoints can't be skipped by burst (clamped), so the player sees every phase and learns each one |

### 4.5 Difficulty posture (DOG 6)
**Single curve, no DDA.** Hidden rubber-banding would undercut the build-expression promise. A run's power should be *earned*, and adaptive difficulty would muddy what a build is worth. Accessibility of difficulty comes from **opt-in** mechanisms: loadouts (meta), the pity relic (`three_deaths` → `warding_sigil`), and door choices (heal vs relic). **Curses** (unlocked by winning, `rules.curses`) raise difficulty opt-in: L1 HP ×1.2; L2 + windups ×0.9 (floored at 350/600/450 ms) + elite extra budget 4; L3 HP ×1.35 and player max HP −2.

---

## §5 Bosses (attacks, windups, answers)

Patterns loop **in order**; `idleMs` between attacks. All windups ≥ 450 ms, ≥ 600 ms for 2-damage attacks (validated at generation).

### 5.1 The Ossuary Knight — F1 (700 HP, chaser, stopRange 40)

| Attack | Type | Windup | Dmg | Tell (Animator) | Player answer | Punish window |
|---|---|---|---|---|---|---|
| `cleave` | melee_swipe r44, 140° (approaches ≤ 1.2 s first) | **800 ms** | 2 | Sword raised high, rear-back | Dash back or through (i-frames), or stay > 44 px | recover 600 ms |
| `bone_ring` | ring 14 @ 85 px/s | 700 ms | 1 | Ribcage glows, pulses | Stand between two bones (≈ 25.7° gaps) | 400 ms |
| `charge` | charge 260 px/s × 800 ms | **900 ms** | 2 | Lowers stance; ground line along the locked path | Sidestep ⟂ at lock (150 ms before release) | **Wall/pillar hit → 1200 ms stun** |
| `bone_fan` | 5-shot, 40° fan @ 110 | 600 ms | 1 | Arm sweeps back | Move tangentially | 400 ms |
| `bone_ring_double` (P2) | 2 rings, 250 ms apart, 12.9° offset | 700 ms | 1 | Double pulse | Weave: gaps shift by half a gap | 400 ms |
| `raise_dead` (P2) | summon 2 skeletons (max 3) | 900 ms | 0 | Sword planted, floor sigil | Kill adds or ignore and burst the boss | 400 ms |

Phases: **P1** (100→50%) `cleave · bone_ring · charge · cleave · bone_fan`, idle 700. **P2** (<50%): 1.2 s invulnerable + 3 skeletons + projectile clear + knockback 200 → `cleave · charge · bone_ring_double · raise_dead · bone_fan`, idle 550. Rewards: relic draft 3, 60 coins, heal 4.

### 5.2 The Mire Queen — F2 (1500 HP, chaser, stopRange 70)

| Attack | Type | Windup | Dmg | Tell | Answer | Punish |
|---|---|---|---|---|---|---|
| `spiral_spray` | spiral 3 arms × 10, 120 ms interval, 11°/shot @ 90 | 700 ms | 1 | Inflates, bubbling | Circle-strafe *with* the spiral's rotation | 500 ms |
| `leap_slam` | slam at target r48, travel 900 ms + ring 10 @ 80 | 600 ms (+900 travel: shadow visible **1500 ms**) | **2** | Crouch, then a shadow at the target that grows | Leave the shadow, then weave the ring | 700 ms (landed, vulnerable) |
| `acid_pools` | 4 hazards r24 (1 at player + 3 random), 5 s, tick 800 ms | 900 ms | 1/tick | Bubbling marks on the floor | Step off the marks; space shrinks for 5 s | 300 ms |
| `brood` | summon 2 slimes (max 4) | 800 ms | 0 | Belly heave | Kill slimes near pools, or ignore | 400 ms |
| `aimed_glob` | 3 large globs, 30° fan @ 120 | 500 ms | 1 | Head rears | Sidestep | 400 ms |
| `spiral_spray_4` (P2) | 4 arms | 700 ms | 1 | as above | as above | 500 ms |
| `double_leap` (P2) | sequence of 2 leap_slams, gap 300 ms | 600 + 600 | 2 | as above ×2 | Second target locks at the second windup start | 700 ms |

Phases: **P1** `spiral_spray · leap_slam · acid_pools · brood · aimed_glob`, idle 650. **P2** (<50%, 1.2 s invulnerable, clear) `spiral_spray_4 · double_leap · acid_pools · aimed_glob · brood`, idle 500. Arena: corner pits (`arena_mire`) shrink safe space.

### 5.3 Vorn, the Archlich — F3 final (2600 HP, kiter 110–170)

| Attack | Type | Windup | Dmg | Tell | Answer |
|---|---|---|---|---|---|
| `arcane_volley` / `_7` (P3) | 5-shot 40° / 7-shot 60° @ 130 | 550 ms | 1 | Staff raised, glyph ring | Sidestep at lock |
| `lich_blink` | blink to 120–160 px from the player | 500 ms | 0 | Dissolves into motes | Re-acquire; the next attack is from a new angle |
| `frost_ring` | ring 16 @ 80, frost (slows the player) | 700 ms | 1 | Frost halo | Stand in a gap; avoid the slow before the next volley |
| `spiral_hex` / `_5` (P3) | spiral 4/5 arms × 14, 100 ms, 9°/shot @ 95 | 800 ms | 1 | Book opens, pages orbit | Rotate with the spiral |
| `fire_zones` | 5 hazards in a cross around the player (±64 px), r28, 4 s | **1000 ms** | 1/tick | Runes burn into the floor | Leave the cross diagonally |
| `summon_wraiths` (P2) | 2 wraiths (max 2) | 900 ms | 0 | Tome raised, skulls orbit | Kill (22 × 2.8 = 62 HP each) or dodge their volleys |
| `soul_storm` (P3) | 3 rings of 20 @ 90, 300 ms apart, offset 9° | 900 ms (P3 ×0.9 → 810) | 1 | Rises, souls spiral in | Weave through alternating gaps |

Phases: **P1** (100→66%) `arcane_volley · lich_blink · frost_ring · arcane_volley · lich_blink`, idle 650. **P2** (66→33%, 1.5 s invulnerable, clear, knockback 220) `spiral_hex · fire_zones · summon_wraiths · arcane_volley · lich_blink`, idle 550. **P3** (<33%, same transition, `windupMult` 0.9 floored at 450) `soul_storm · lich_blink · spiral_hex_5 · arcane_volley_7 · fire_zones · frost_ring`, idle 450. Death → **VICTORY**.

---

## §6 Reward cadence (progression DOG 1, 2, 5)

| Stream | Schedule type | Justification | Compulsion audit |
|---|---|---|---|
| Room reward (door-chosen kind) | **Fixed-ratio 1** (every cleared room), kind chosen by the player | Competence and autonomy (SDT): the player picks the kind of growth | White-hat: fully visible before committing |
| Draft contents (which 3 cards) | **Variable-ratio** on quality (rarity roll) | Variety is the roguelite's replay engine; each run's build differs | VR is justified: no money, no purchase, always 3 options + skip, pool visible in the codex. There is no near-miss animation and no "rolling" spectacle. |
| Coins | Fixed-ratio per kill (small ranges) | Steady, predictable economy | White-hat |
| Shop | **Fixed-interval**, once per floor (step 5, F3 step 7) | A planned spending beat; a rest | Reroll cost escalates, so no slot-machine pull |
| Elite / treasure relic | Fixed-ratio 1 (choose 1 of 2) | Risk-reward legible on the door | White-hat |
| Boss reward | Fixed per boss (relic of 3 + coins + heal) | Climax payoff | White-hat |
| Meta unlocks | Fixed milestones, all listed with conditions | Long-term mastery goals (commitment, not compulsion) | No currency, no grind, no timers, no dailies; a pity unlock for strugglers (white-hat, Octalysis 2/3, no 6/7/8 levers) |

**Beats per session cohort (DOG 2):**
- *Short session* (a 10-min F1 death): Sanctum + 5–7 room rewards + 1 shop ≈ **7–9 meaningful beats in 10 min** (≈ one every 70 s) + run-end meta progress. ✔
- *Full run* (31 min): 21 room rewards + 3 shops + 2 boss rewards + victory + meta ≈ **27 beats in 31 min** (≈ one every 69 s). ✔

---

## §7 Meta-progression (small unlock pool; `unlocks.json`, `loadouts.json`)

Persistence: localStorage (`save-schema.md`) holds unlocked ids, loadouts, lifetime counters (kills, deaths, reactions seen, payloads released), best floor, wins, curses unlocked, `tutorialDone`, and the codex (seen cards, relics, enemies).

**Locked at first launch:** every id named in any `unlocks[].unlocks` (8 cards, 3 wands, 5 relics, 3 loadouts, curses). Everything else (14 spells, 21 modifiers, 6 found wands, 21 relics) is in the pool from run 1.

| Milestone | Condition | Unlocks | Class (DOG 3) |
|---|---|---|---|
| Into the Deep | reach F2 | frost_lance, trigger_timer | new combination ×2 |
| Knightfall | kill the Ossuary Knight | comet, kindling, **Pyromancer** loadout | new combination ×3 |
| The Last Stair | reach F3 | thunder_orb, chaos_branch | new combination ×2 (aura; shuffle) |
| Dethroned | kill the Mire Queen | vortex, quad_cast, **Stormcaller** loadout | new verb (pull) · knob · new combination |
| Spellwright | kill the Archlich | archmage_scepter, phoenix_feather, **Hexer** loadout, **curses** | knob · knob · new combination · content gate |
| Alchemist | see all 4 reactions | alchemist_stone | knob |
| Slayer | 300 lifetime kills | crit_up, echo_wand | knob · new combination (always-cast) |
| Chain of Command | release 1 trigger payload | quickening, prism_shard | knob ×2 |
| Persistence | 3 lifetime deaths | warding_sigil | knob (pity) |

New-verb/new-combination : content-gate = **11 : 1** (≥ 2:1 ✔). Loadouts start the run with a different build *shape* (fire burst, chain lightning, poison stream), not with more power.

**Meta legibility (DOG 4):**
- **After run 1:** the run-end screen lists "Progress: Into the Deep ✔ / Knightfall — defeat the Ossuary Knight → unlocks Comet, Kindling, Pyromancer", with the closest two milestones shown as goals. The codex opens from the Title screen and shows every milestone and condition.
- **After run 3:** most players have 2–4 milestones (reach F2, maybe the Knight, Persistence), so loadout select appears on the Title → Run start once a second loadout exists. New pool items get a "NEW" tag the first time they appear in a draft.
- **Run N:** after the first win, curses appear as a selector (0–3) beside loadouts. The codex shows completion counts per category.

---

## §8 Win and lose flow

- **Death:** HP 0 with no revive → 700 ms slow fade (feel is UX/Animator) → `run-end {death}`: floor and step reached, killer (enemy id), time, kills, the final wand layouts, relics, seed, new milestone unlocks, next goals → Title / New run.
- **Victory:** the Archlich dies → all enemies die, projectiles clear → 2 s victory beat → `run-end {victory}`: the same summary plus a "Spellwright" milestone banner and curse unlock (first win).
- **Abandon:** Pause → Abandon (confirm) → `run-end {abandon}` (lifetime counters update; `three_deaths` does **not** count abandons).
- Between floors: stair → fade → landing (a rest; step 0 doors).

---

## §9 Audits

**progression-curve (progression-and-reward-design DOG):** (1) every stream typed with a justification (§6) ✔ · (2) beats per cohort with math (§6) ✔ · (3) unlock classes and an 11:1 ratio (§7) ✔ · (4) meta legibility at runs 1/3/N (§7) ✔ · (5) per-stream compulsion audit (§6) ✔ · (6) economy steady-state with equilibrium and rate cliffs (`systems.md` §3) ✔.

**pacing-spec (difficulty-and-pacing DOG):** (1) flow-channel plot with named excursions (§4.2) ✔ · (2) beat sequence per floor with the peak:valley ratio justified (§2) ✔ · (3) spikes with teaching reason, cost and recovery (§4.4) ✔ · (4) per-encounter numbers (§4.3) ✔ · (5) skill curve with comparable-title evidence (§4.1) ✔ · (6) single curve, no DDA, opt-in curses (§4.5) ✔.

---

# v2 (design-v2.md; Wave A1)

## §10 Run structure v2 (18–20 min; `floors.json`)

Every floor = **start + 6 rooms + mini-boss (step 4) + boss (step 8)**. The six rooms are steps 1, 2, 3, 5, 6 (shop) and 7 (puzzle).

| Step | Kind | F1 | F2 | F3 | Budget F1 / F2 / F3 (s) |
|---|---|---|---|---|---|
| 0 | rest | Sanctum | Landing | Landing | 10 / 10 / 10 |
| 1 | combat | fixed → modifier (**tut_first_blood** run 1) | fixed → spell, threat rolled | same | 40 / 40 / 45 |
| 2 | combat / choice | fixed → spell (**tut_gauntlet** run 1) | choose 2 | choose 2 | 40 / 40 / 45 |
| 3 | choice | choose 2 (combat / treasure) | choose 2 | choose 2 | 40 / 40 / 45 |
| 4 | **mini-boss** | Grave Warden | Lantern Matron | Iron Colossus | 50 / 50 / 50 |
| 5 | choice + **risk** | choose 2 (incl. heal, elite, risk door) | same | same | 40 / 40 / 45 |
| 6 | rest | Shop (+ forge) | Shop | Shop (cash-out) | 25 / 25 / 25 |
| 7 | **puzzle** | Sentinel Gate (pierce) | Choir of Wards (shock) | Iron Hall (blast) | 40 / 40 / 40 |
| 8 | boss | Ossuary Knight | Mire Queen | Archlich → VICTORY | 60 / 65 / 80 |
| | | | | **Σ** | **345 / 350 / 385 = 1,080 s = 18.0 min** |

- Each budget includes the reward pick and the wand edit (about 10–15 s of every combat room's 40–45).
- **Spread:** first run +≈ 1 min (tutorial); p10 ≈ 15 min, p90 ≈ 23 min.
- **Limits per floor:** heal 1, wand 1, corrupted 1. **Risk door:** at most 1 per run (`rules.risk`).
- **Tutorial path unchanged:** F1 steps 1–2 fixed with `tutorialTemplate`, and `tutorialDone` flips when step 3's doors open.
- **Beat sequence (pacing DOG 2), per floor:**

```text
Rest · Combat · Combat · [Combat|Treasure] · PEAK(mini) · [Combat|PEAK(elite/risk)] · REST(shop) · PEAK(puzzle) · BOSS
```

  That is 5–6 peaks to 2–3 rests, and every combat room ends in a crafting valley. The shop sits directly before the puzzle and boss, so the floor's lesson can be *bought* (Slay the Spire's rest-before-boss rule).

## §11 Waves v2: grammar, door threats, spawn safety

```text
door option threat:"roll"  → pick from floor.threats (weight, minStep ≤ step)   # run stream; shown on the door
room waves (combat/elite): budget per wave as §3, then per wave w:
  anchors = 0 if (this is the run's very first wave) else 1
          + 1 if step ≥ grammar.doubleAnchorFromStep(5) and floor ∈ {2,3} and budget allows
  if threat has anchors and no anchored wave has used it yet → the first anchor = a random threat anchor (floor-local)
  other anchors: weighted from enemyPool where role = anchor, minStep ok, threat ≤ remaining
  support: with chance 0.35 on floors ≥ 2, add 1 support (lantern_acolyte) if a support fits the budget
  fill with pressure (role = pressure; threat "swarm" → only threat.pressureOnly ids, budget × 1.2) up to maxPerWave 8
  elite rooms: wave 0 places `elites` elite(s) first (a threat anchor if it is an elite candidate), each costing threat × 2
puzzle rooms: fixedWaves always (no budget); twists never apply
next wave: ≥ 65% of this wave dead (or ≤ 1 alive) AND ≥ 3 s elapsed
spawn: portal 850 ms; ≥ 104 px from the player; never inside ±35° of the aim direction within 220 px; enemy shots ≤ 36 in air
```

**Door threat pools** (weight @ minStep):
- F1: none 4 · swarm 2 @ 3 · **shield 3 @ 3** · armour 1 @ 5
- F2: none 2 · swarm 2 · shield 2 · **ward 3 @ 2** · ranged 2 · armour 2 · summoner 1 @ 5
- F3: none 1 · swarm 2 · shield 2 · ward 2 · **armour 3** · ranged 2 · summoner 2 @ 2

**What each door teaches** (level-and-content DOG 1–2):
- **F1** introduces the shield at step 3 (door), isolates it at the Warden (step 4), and recombines it in Sentinel Gate + the Knight's `shield_wall`.
- **F2** does the same for ward (door step 2+ → Matron → Choir of Wards → Queen `veil`).
- **F3** does the same for armour (Colossus → Iron Hall), and the Archlich reads the whole build.

## §12 Mini-bosses and new boss attacks (windups; mechanic-spec §9.3, §10)

| Mini (HP; defence) | Attack | Type | Windup | Dmg | Answer |
|---|---|---|---|---|---|
| **Grave Warden** (260; shield, wears after 7 / mercy 4) | shield_bash | charge 220 px/s × 500 ms | 800 | 1 | sidestep at lock; wall stun 900 ms = punish from behind (no shield) |
| | bone_toss | 3-fan, 30° @ 105 | 600 | 1 | move tangentially |
| | raise_sentinel (P2) | summon tomb_sentinel (max 1) | 900 | 0 | kill or flank |
| **Lantern Matron** (600; ward 6 / mercy 3, regrows at P2) | call_acolytes | summon 2 acolytes | 900 | 0 | priority: acolytes |
| | lantern_ring | ring 12 @ 85 (fire) | 650 | 1 | stand in a gap |
| | ember_fan | 5-fan, 50° @ 115 | 550 | 1 | sidestep |
| | kindle_choir | ward_allies 3 × 3 hits, r160 | 800 | 0 | shock, or burst acolytes first |
| **Iron Colossus** (900; armour 260 / mercy × 0.6, half regrows at P2) | quake | slam self r52 + ring 10 | 900 | **2** | leave the circle, weave the ring |
| | rock_volley | 3-fan, 20° @ 130 | 600 | 1 | sidestep |
| | iron_charge | charge 230 px/s × 700 | 950 | **2** | sidestep; bait into a pillar (1300 ms stun) |

| Boss (v2 HP) | New attack | Type | Windup | Notes |
|---|---|---|---|---|
| Ossuary Knight (**520**) | shield_wall | guard: frontal shield for 3 s | 600 | in P2; in P1 too if adapt (≥ 3 shots/cast) |
| | bone_rain (heat 4+) | hazard × 6, r20 | 1000 | |
| Mire Queen (**1,100**) | veil | self-ward 5 hits | 700 | in P2; in P1 too if adapt (cast rate > 5/s) |
| | bog_surge (heat 4+) | 2 rings × 18 @ 80 | 800 | |
| Archlich (**2,000**) | mirror_volley | a fan sized by the player's shots per cast (3–9) | 650 | every phase; the final boss reads your wand |
| | grand_spiral (heat 4+) | spiral 6 × 12 | 900 | |

All windups still clear the floors (≥ 450 on bosses, ≥ 600 for 2-damage attacks), validated by `build.py`. The final boss is still the longest fight (§14).

## §13 Heat, Gentle, Daily, Goals (details: design-v2.md §11)

- **Heat 1–5** (`rules.heat`): cumulative. HP × 1.15 → 1.3; 2 affixes on elites from H2; +2/+3 pressure budget; H3 faster shots, shop × 1.2 and −1 heal; H4 boss heat attacks with mercy rules off; H5 windups × 0.9 and −1 heart. Winning at N unlocks N+1 (the first win unlocks H1). Excludes Gentle. The deprecated `rules.curses` record stays only until the Wave E migration.
- **Gentle:** +1 half-heart per lost Gentle run (cap 4) and +5% hit-shrug per loss (cap 20%). Never decreases, never shames. Available from run 1.
- **Daily:** the UTC-date seed picks a loadout (4) and a rule (6). First result counts. Share line.
- **Goals:** 15, ordered. Early (order ≤ 6) pay one per run end from a queue; later goals pay immediately. The only stat unlock is +1 starting slot.

**Reward cadence v2 (progression DOG 2):**
- **Full 18-min run:** 15 room rewards + 3 mini relic drafts + 2 boss drafts + 3 shops + the goal at run end ≈ **24 beats in 18 min** (one per 45 s). ✔
- **Short 8-min death** (F1 boss or early F2): about 9 beats plus a guaranteed early goal (queue). ✔

**Schedule typing additions (DOG 1, 5):**
- Skip pay: **fixed-ratio**.
- Draft reroll: player-initiated. Its escalating cost bounds the "one more pull" loop, and a reroll never reveals near-misses.
- Pity: a **negative-feedback** modifier on the variable-ratio rarity roll. It *reduces* variance, which is white-hat.
- Goals: fixed milestones, visible, with no currency.
- Daily: a fixed interval (1/day), with no streak penalty and no missed-day punishment. It is **deliberately not a login streak** (Octalysis 8 avoided).

## §14 Per-encounter tuning targets v2 (pacing DOG 4; median build)

> Re-derived 2026-09-27 from `scripts/balance-calc.mjs` (fight s = dead time + TTK ÷ 0.75 uptime; sustained DPS = the systems.md §4 v2 band). "Counter" = the calc's counter-aware reference build; p10/p90 are the band edges.

| Encounter | Enemies / HP | Sustained dps_out (counter ref · band) | Fight time counter (band-mid) | HP lost (median) |
|---|---|---|---|---|
| F1 combat s1–3 (pool; run 1 uses the fixed tutorial rooms) | 8–10 / 164–181 HP | 16 · 14–26 | 14–16 s (13–14) | 0.5 |
| F1 mini: Warden | 380 (+1 sentinel) | 16 · 14–26 | 33 s (27) | 1 |
| F1 puzzle: Sentinel Gate | 9 / 158 HP | 16 · 14–26 | 14 s (13) | 0.5 |
| F1 boss: Knight | 650 | 16 · 14–26 | 59 s (46) | 2 |
| F2 combat (3 waves) | 14–18 / 484–601 HP | 33 · 26–44 | 22–27 s (21–26) | 1 |
| F2 mini: Matron | 850 + acolytes | 33 · 26–44 | 38 s (34) | 1.5 |
| F2 boss: Queen | 1,400 | 33 · 26–44 | 65 s (56) | 2.5 |
| F3 combat (3 waves) | 7–11 / 429–673 HP + armour | 48 · 40–64 | 21–30 s (20–28) | 1.25 |
| F3 mini: Colossus | 1,200 + armour 260 | 48 · 40–64 | 38 s (35) | 1.5 |
| F3 boss: Archlich | 2,600 (3 phases, 2 × 1.5 s invulnerable) | 48 · 40–64 | **76 s (71)**, the longest fight ✔ | 3 |

**Flow-channel note:**
- Defences create **intentional local spikes** for a player without the keyword. The teaching reason is the floor's keyword. The first-failure cost is time, not death, because every defence erodes. The recovery affordance is the counter guarantee in the next draft plus the shop right before the puzzle and boss.
- The **never-edit** player (the starter plus whatever auto-slots) should be able to clear F1 sometimes and rarely win. The target gap, after Wandcraft's two-bot bench principle (`research/balance-w1.md`), is measured by `scripts/balance-calc.mjs`: the never-edits starter (sustained 16.2 all run) ties the counter build on F1 open fights, is 1.8× slower in F1 shield rooms, ≈ 2.3× slower on F2, and walls on every F3 armour room (120–210 s); run ≈ 33 min vs ≈ 16 min.
