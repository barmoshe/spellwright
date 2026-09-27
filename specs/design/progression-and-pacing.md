# Spellwright — progression, pacing, bosses and meta (`progression-curve` + `pacing-spec`)

**Owner:** Game Designer · **Status:** Wave 1, v1 · **Consumers:** Game Developer (`RoomDirector`, wave generation, boss runner, run-end, meta save), UX Designer (door icons, run-end, codex, loadout select), Audio Director (tension/release beats §2, boss phases §5), Animator (boss telegraphs §5).
**Data:** `floors.json` (run graph, pools, budgets), `rooms.json` (templates), `enemies.json`, `bosses.json`, `economy.json`, `unlocks.json`, `loadouts.json`, `rules.json` (`waves`, `enemies`, `curses`).

---

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
