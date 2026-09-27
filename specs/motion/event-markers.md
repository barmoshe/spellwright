# Spellwright — `hit-frame-data` / `event-marker`

**Owner:** Animator · **Status:** Wave 2, v1 · **Schema:** `gamestudio/.claude/skills/combat-telegraphs-and-reactions/tools/hit-frame-marker-schema.md` (extended with `timebase`, below)
**Consumers:** Audio Director (`cue-spec` trigger alignment: *which frame*; the sound is theirs), Game Developer (event wiring: `animationupdate` listeners for authored clips per `architecture.md` §10, and AI/sim step hooks for procedural states), Technical Artist (fx ids to flipbooks/emitters).
**Rule:** the marker's **frame is the Animator's and is non-negotiable** (schema §ownership). Shake and hit-stop magnitudes are the feel-spec's (referenced by name). Cue ids are the Audio Director's (existing ids from mechanic-spec §14 / UX screen-graph §7; *proposed* ids are marked).

---

## §0 Timebases

The art has almost no attack frames, so most markers are **sim-step** markers, not authored-frame markers:

| `timebase` | Frame 0 is | 1 frame = | Wiring |
|---|---|---|---|
| `clip` | first frame of an authored clip | 1 clip frame at the clip's fps | `sprite.on('animationupdate')`, registered once per pooled sprite (`architecture.md` §10) |
| `sim` | the sim step the state is entered | 1 fixed step (16.7 ms at `SIM_HZ` 60) | the AI/sim emits it from the `worldstep` handler. **Hit-stop does not advance sim frames** (state-graph R3) |

Symbolic anchors for attacks (frame numbers below are nominal at 1× windup; the sim fires the anchor itself, so chill, curse and boss P3 scaling are automatic):
`ws` = windup start (0) · `lock` = `W − 9` (aimLockBeforeReleaseMs 150) · `rel` = `W` (act start) · `act_end` · `rec_end` = back to move.

Audio sync rule: **cues fire on the marker step even during hit-stop** (hit-stop pauses the sim, not audio; feel-spec §handoffs). A marker that lands *inside* a stop (e.g. a death on a kill step) fires on that step.

---

## §1 Player

```yaml
- actor: player
  attack_id: locomotion-run
  animation_key: player_run
  timebase: clip
  total_frames: 4
  authored_framerate: 12            # × speed scale (state-graph §2.1)
  events:
    - { frame: 0, kind: footstep, cue_id: footstep, bus: sfx-player, proposed: true, notes: "contact pose (lowest bbox)" }
    - { frame: 0, kind: fx, fx_id: footstep-dust, notes: "2 px dust, every second step (feel §move polish)" }
    - { frame: 2, kind: footstep, cue_id: footstep, bus: sfx-player, proposed: true, notes: "second step of the cycle; alternate L/R variants" }

- actor: player
  attack_id: dash
  animation_key: player_dash
  timebase: sim
  total_frames: 9                   # dashDurationMs 150 → 9 steps
  events:
    - { frame: 0, kind: action-start, cue_id: dash, bus: sfx-player, fx_id: dash-dust-origin }
    - { frame: 0, kind: fx, fx_id: afterimage, index: 0 }
    - { frame: 3, kind: fx, fx_id: afterimage, index: 1 }       # k·dashDurationMs/dashAfterimages
    - { frame: 6, kind: fx, fx_id: afterimage, index: 2 }
    - { frame: 9, kind: action-end, notes: "dash-end → run/idle; the i-frames keep running to step 11 (dashIframesMs 190)" }

- actor: player
  attack_id: cast
  timebase: sim
  events:
    - { frame: 0, kind: spawn-projectile, cue_id: cast, bus: sfx-player, notes: "per element family; 10–20/s possible, so the cue-spec needs a voice cap (≤ 3) and ≤ 250 ms one-shots (asset-inventory §3 row 7)" }
    - { frame: 0, kind: fx, fx_id: muzzle-flash, duration: muzzleFlashMs }
    - { frame: 0, kind: kick, px: castKickPx, duration: castKickMs }
    - { frame: 0, kind: sputter, cue_id: sputter, fx_id: sputter-puff, condition: "mana skip or empty group; ≤ 1 per sputterMinIntervalMs" }
    - { frame: 0, kind: swap, cue_id: wand_swap, condition: "wand-swap" }
    - { frame: 0, kind: recharge, cue_id: wand_recharge, condition: "recharge END (deck reset complete)", notes: "motion-spec hud-wand-recharge `complete`; the Audio Director may add a quieter start cue" }

- actor: player
  attack_id: hurt
  timebase: sim
  events:
    - kind: hit-impact
      frame: 0
      audio_cue: player_hurt          # shield absorbed → shield_break
      audio_bus: sfx-player
      hit_stop: { victim_ms: hurtHitstopMs, attacker_ms: 0 }          # shield: shieldBreakHitstopMs
      trauma: { add: traumaHurt, starts: "after the hit-stop" }
      screen_flash: { duration_ms: hurtFlashMs, color: red-edge }
      knockback: { direction: away-from-source, magnitude: hurtKnockback }
    - { frame: 6, kind: pose-end, notes: "hurtPoseMs 100 after the stop → run/idle (sim frames exclude the stop)" }
    - { frame: 0, kind: low-hp, cue_id: low_hp, condition: "HP crossed to ≤ 2" }

- actor: player
  attack_id: death
  timebase: sim-and-real               # the sim is over; the beat runs on RunScene tweens after the stop
  events:
    - { frame: 0, kind: hit-impact, audio_cue: player_death, audio_bus: sfx-player, proposed: true, hit_stop: { victim_ms: hurtHitstopMs }, notes: "fallback: player_hurt with a longer tail" }
    - { at_ms_after_stop: 300,  kind: fx, fx_id: death-dust, cue_id: body_fall, proposed: true, notes: "fall complete (playerDeathFallMs)" }
    - { at_ms_after_stop: 700,  kind: fx, fx_id: soul-wisp, notes: "dissolve complete (+ playerDeathDissolveMs)" }
    - { at_ms_after_stop: 1400, kind: scene, notes: "hold ends (+ playerDeathHoldMs) → screen-root-fade to run-end; the Audio Director's defeat stinger lands here" }

- actor: player
  attack_id: revive
  timebase: sim
  events:
    - { frame: 0, kind: hit-impact, audio_cue: revive, proposed: true, fx_id: feather-burst, hit_stop: { victim_ms: hurtHitstopMs } }
```

---

## §2 Enemy and boss attacks, per type (generic markers; resolved frames in §2.9)

Each attack follows the five-phase anatomy (`telegraphs.md` §1): `opening [0,5] · signal [6, W−10] · lock [W−9, W−1] · active [W, …] · end = recover`.

```yaml
# 2.1 Generic core, shared by every attack type
- attack_id: <any>
  timebase: sim
  phases: { opening: [0, 5], signal: [6, "W-10"], lock: ["W-9", "W-1"], active: ["W", "act_end"], end: ["act_end+1", "rec_end"] }
  events:
    - { frame: 0,     kind: telegraph-audio, cue_id: enemy_windup, variant: "<type>", bus: sfx-enemy-tells, notes: "mechanic §14: per attack type on windup start" }
    - { frame: 0,     kind: telegraph-visual, notes: "decal/tint/overlay begin (telegraphs.md §2.x)" }
    - { frame: "W-9", kind: lock, cue_id: enemy_lock, proposed: true, condition: "damage ≥ 2 only", bus: sfx-enemy-tells }
    - { frame: "W",   kind: release, cue_id: enemy_release, variant: "<type>", proposed: true, bus: sfx-enemy }
  interrupt: { on: [stun, freeze, death], event: { kind: fizzle, fx_id: telegraph-fizzle, cue_id: enemy_interrupt, proposed: true } }
  interrupt_priority: medium            # damage never interrupts (mechanic §9.2)
```

| § | Type | Type-specific markers (added to the generic core) |
|---|---|---|
| 2.2 | `melee_swipe` | `W`: **hit-impact** (arc test on the locked aim). Slash flipbook plays from `W` at 1 frame/step. On connect: `player_hurt` path (§1). Whiff: `enemy_release` whoosh only. |
| 2.3 | `shoot` | `W`: `spawn-projectile` × `count` (one release cue per volley, not per projectile), `muzzle-flash`. |
| 2.4 | `ring` | `W`: `spawn-projectile` ring. Multi-volley: `spawn-projectile` at `W + k·round(volleyIntervalMs·0.06)` (k = 1…volleys−1). **Spoke preview** at each of those minus 9 steps. The release cue fires per volley. |
| 2.5 | `spiral` | `W`: spiral start (`enemy_release` spiral variant, **once**). Each shot tick is sim-driven: the per-shot cue is optional, voice cap 1, ≥ 100 ms apart. `act_end` = `W + round(shotsPerArm·intervalMs·0.06)`: `spiral_end` (proposed, soft). Mote shrink starts 12 steps before `act_end`. |
| 2.6 | `charge` | `W`: charge start (`enemy_release` charge variant: roar/stomp). Speed-line afterimages every 6 steps. **Wall impact** (sim-detected, any step in `[W, W + round(durationMs·0.06)]`): hit-impact `heavy_impact` (proposed) + `traumaHeavyImpact` (feel, trauma² shake) + dust; then stunned (dizzy loop cue optional). Player contact: `player_hurt` path. |
| 2.7a | `slam` (self) | `W`: **hit-impact**: `heavy_impact` + `traumaHeavyImpact` (feel, trauma² shake) + dust ring + rock-ring `spawn-projectile` on the same step. |
| 2.7b | `slam` (target) | `W`: take-off (`leap`, proposed) · airborne `[W, W + round(travelMs·0.06) − 1]` · **land** at `W + round(travelMs·0.06)` = hit-impact `heavy_impact` + `heavyImpactShake*` + ring `spawn-projectile`. Target-circle lock outline at land − 9. |
| 2.8 | `hazard` | `0`: marks appear (`hazard_mark`, proposed). `W`: activation (`hazard_on`, proposed). Tick: every `round(tickMs·0.06)` steps from `W` (outline flash + damage check, `hazard_tick` optional). End: `W + round(durationMs·0.06)`: damage off and fade starts (`hazard_off`, proposed). The 4 Hz blink starts 30 steps before the end. |
| 2.9s | `summon` | `W`: portal(s) open (normal spawn, §3). No `wave_spawn` cue (that one is for waves); use `summon` (proposed). `maxAlive` skip: `fizzle` at `W`. |
| 2.10 | `blink` | `W`: vanish (`blink_out`, proposed) + mote burst at the origin, then reappear at the destination on the same step. `W … rec_end`: reappear tween; `blink_in` (proposed) at `W + 1`. |
| 2.11 | `self_destruct` | Strobe beats (visual only) at a shrinking period. `W`: **hit-impact** `explode` + `traumaExplosion` (feel, trauma² shake) + explosion flipbook, then the entity dies (no `kill` cue, no coins). Killed mid-fuse: the same event on the kill step, plus coins. |
| — | `sequence` | Each step is its own attack with its own markers. The gap is `recover` = `gapMs`. |

### 2.9 Resolved frames per attack (nominal; `W` = windup steps)

| Actor | Attack | Type | W | lock | rel | act_end | Extra resolved markers |
|---|---|---|---|---|---|---|---|
| skeleton | `swipe` | melee_swipe | 27 | 18 | 27 | 27 | recover to 54 |
| cultist | `bolt` | shoot | 33 | 24 | 33 | 33 | — |
| frost_mage | `frost_orbs` | shoot | 39 | 30 | 39 | 39 | — |
| brute | `charge` | charge | 42 | 33 | 42 | ≤ 81 | wall impact ∈ [42, 81]; wall-stun 60 steps |
| fire_imp | `fuse` | self_destruct | 36 | 27 | 36 | 36 | explode at 36 |
| eye_turret | `eye_ring` | ring | 39 | 30 | 39 | 39 | 1 volley |
| eye_turret | `eye_burst` | shoot | 30 | 21 | 30 | 30 | — |
| wraith | `wraith_blink` | blink | 30 | 21 | 30 | 30 | `blink_in` 31; recover to 39 |
| wraith | `wraith_volley` | shoot | 27 | 18 | 27 | 27 | — |
| necromancer | `raise` | summon | 54 | 45 | 54 | 54 | portals 54 → active at 105 (v2 spawnPortalMs 850 = 51 steps) |
| stone_golem | `stomp` | slam self | 51 | 42 | 51 | 51 | heavy impact + ring at 51 |
| ossuary_knight | `cleave` | melee_swipe | 48 | 39 | 48 | 48 | lock glint 39 |
| ossuary_knight | `bone_ring` | ring | 42 | 33 | 42 | 42 | — |
| ossuary_knight | `bone_ring_double` | ring | 42 | 33 | 42 | 57 | volley 2 at 57 (preview at 48) |
| ossuary_knight | `charge` | charge | 54 | 45 | 54 | ≤ 102 | wall impact ∈ [54, 102]; stun 72 steps |
| ossuary_knight | `bone_fan` | shoot | 36 | 27 | 36 | 36 | — |
| ossuary_knight | `raise_dead` | summon | 54 | 45 | 54 | 54 | — |
| mire_queen | `spiral_spray` / `_4` | spiral | 42 | 33 | 42 | 114 | shots every 7.2 steps (sim-timed); mote shrink 102 |
| mire_queen | `leap_slam` | slam target | 36 | 27 | 36 | 90 | take-off 36, **land 90**, circle lock 81 |
| mire_queen | `double_leap` | sequence | — | — | — | — | leap 1 land 90 → gap 18 → leap 2 `ws` 108 → lock 135 → take-off 144 → land 198 (assumes `gapMs` replaces step 1's `recoverMs` 700, since mechanic §9.3 is silent. If the sim also runs step 1's recover, leap 2 shifts +42 steps. The anchors are sim-emitted, so only this reference row changes.) |
| mire_queen | `acid_pools` | hazard | 54 | 45 | 54 | 354 | ticks 54, 102, 150, … ; blink from 324; off 354 |
| mire_queen | `brood` | summon | 48 | 39 | 48 | 48 | — |
| mire_queen | `aimed_glob` | shoot | 30 | 21 | 30 | 30 | — |
| archlich | `arcane_volley` / `_7` | shoot | 33 (P3: 30) | 24 (21) | 33 (30) | same | — |
| archlich | `lich_blink` | blink | 30 (P3: 27) | 21 (18) | 30 (27) | same | `blink_in` +1; recover 12 steps |
| archlich | `frost_ring` | ring | 42 (P3: 38) | 33 (29) | 42 (38) | same | — |
| archlich | `spiral_hex` / `_5` | spiral | 48 (P3: 43) | 39 (34) | 48 (43) | +84 | shots every 6 steps |
| archlich | `fire_zones` | hazard | 60 (P3: 54) | 51 (45) | 60 (54) | +240 | ticks every 48 steps |
| archlich | `summon_wraiths` | summon | 54 | 45 | 54 | 54 | — |
| archlich | `soul_storm` | ring ×3 | 54 (P3: 49) | 45 (40) | 54 (49) | +36 | volleys at rel, rel+18, rel+36; previews 9 steps before each |

P3 values = `round(windupMs × 0.9 × 0.06)`, floored at 450 ms (27 steps), and 600 ms (36) for damage-2 attacks. Curse L2 scales every row the same way (floors 350 / 600 / 450). **The dev never hard-codes these frames.** They are the reviewer's reference; the sim emits the anchors.

---

## §3 Enemy / boss lifecycle

```yaml
- { actor: enemy, event: spawn, timebase: sim, frame: 0, kind: portal-open, cue_id: wave_spawn, bus: sfx, condition: "first portal of the wave only" }
- { actor: enemy, event: spawn, timebase: sim, frame: 39, kind: emerge, notes: "spawnPortalMs − spawnEmergeMs = 650 ms (v2 spawnPortalMs 850; ambush twist portalMs 1100 → 54)" }
- { actor: enemy, event: spawn, timebase: sim, frame: 51, kind: active, notes: "spawnPortalMs 850 (v2): AI starts. Always read from rules; these frames are reference" }
- { actor: enemy, event: hit, timebase: sim, frame: 0, kind: hit-impact, audio_cue: hit_enemy, variant: element, audio_bus: sfx-impact, hit_stop: none, fx_id: hit-particles, notes: "crit adds `crit`; status application adds `status_apply` (×4 variants); a reaction adds `reaction` (×5)" }
- { actor: enemy, event: death, timebase: sim, frame: 0, kind: hit-impact, audio_cue: kill, audio_bus: sfx-impact, hit_stop: { victim_ms: killHitstopMs, rate_limit: killHitstopMinIntervalMs }, fx_id: death-puff }
- { actor: enemy, event: death-elite, timebase: sim, frame: 0, kind: hit-impact, audio_cue: elite_kill, hit_stop: { victim_ms: eliteKillHitstopMs }, fx_id: elite-outline-shatter }
- { actor: enemy, event: frozen-thaw, timebase: sim, frame: 0, kind: fx, cue_id: freeze_shatter, fx_id: ice-shell-shatter }
- { actor: enemy, event: stun-wall, timebase: sim, frame: 0, kind: hit-impact, audio_cue: heavy_impact, proposed: true, trauma: { add: traumaHeavyImpact } }
- { actor: golem, event: locomotion, animation_key: <golem>_move, timebase: clip, frames: [0, 2], kind: footstep, cue_id: heavy_step, proposed: true, notes: "heavy units only; small enemies get no footsteps (mix clutter)" }
- { actor: boss,  event: locomotion, animation_key: <boss>_move, timebase: clip, frames: [0, 2], kind: footstep, cue_id: boss_step, proposed: true, notes: "0x72 32×36 run: f0/f2 are the grounded poses (f1 lifts to bbox bottom 32)" }
- { actor: boss, event: intro, timebase: real, at_ms: "bossIntroPanMs/2", kind: rise, cue_id: boss_intro, proposed: true }
- { actor: boss, event: phase, timebase: sim, frame: 0, kind: hit-impact, audio_cue: boss_phase, hit_stop: { victim_ms: bossPhaseHitstopMs }, notes: "shockwave ring + knockback on the first step after the stop" }
- { actor: boss, event: death, timebase: sim-and-real, frame: 0, kind: hit-impact, audio_cue: boss_death, hit_stop: { victim_ms: bossDeathHitstopMs }, notes: "unravel bursts every bossDeathBurstIntervalMs (7×, optional small `explode` variant at −9 dB); final burst at stop + bossDeathUnravelMs with bigExplosionShake*" }
```

## §4 World and objects

| Moment | Marker | Cue | Source entry |
|---|---|---|---|
| Coin collected | the collect step | `pickup_coin` (voice-capped; a vacuum burst of 20 coins needs pitch-stepped variants) | motion-spec `world-coin-magnet` |
| Card / relic taken | Take confirm, frame 0 | `pickup_card` / `relic_gain` (proposed) | `reward-take` |
| Reward pedestal appears | room clear + 300 ms | `reward_appear` (proposed) | `world-reward-rise` |
| Doors open | room clear + 450 ms, then +120 per door | `door_open` (first full, later −6 dB) | `world-door-open` |
| Doors slam | room fade-in + 250 ms | `door_close` (proposed) | `world-door-close` |
| Room cleared banner | punch start | `room_clear` | `banner-room-cleared` |
| Chest opens | anticipation start | `chest_open` (proposed) | `world-chest-open` |
| Crate breaks | break step | `crate_break` (proposed) | telegraphs.md §3.6 |
| Floor descent | sink start | `portal_enter` (proposed) | `screen-floor-descend` |

---

## §5 v2 (Wave A2) markers

Cue ids are **aligned with the Audio Director's `specs/audio/cue-spec.json`** (delivered in parallel): enemy shield break = `shield_shatter` (`shield_break` stays the player's warding shield), armour = `armour_clang_chip` / `armour_clang_blast` / `armour_break`, ward = `ward_pop` / `ward_break` / `ward_raise`, `guard_raise`, `stg_boss_intro` / `stg_miniboss_intro` (+ `*_roar_<id>`), `stg_boss_adapt`, `miniboss_death`, `ui_reroll`, `stg_goal`, `forge_slot`. Ids still marked *proposed* (`affix_reveal`, `volatile_arm`) have no cue yet; the Audio Director may route them or list them as silent events. **Throttling contract** (the plan: "block spam never masks hurt"): the motion layer already coalesces defence reads per enemy within `defenceReadCooldownMs` 120 (break/strip never coalesced). The Audio Director's cue-spec should additionally voice-cap block/clang/pop globally and duck them under `player_hurt`. The marker frames below are when the *first* read of a coalesced group fires.

### 5.1 Defence events (`EV.DEFENCE`; timebase `sim`, frame 0 = the hit step)

```yaml
- { event: shield.block,   frame: 0, kind: defence-read, cue_id: shield_block,  bus: sfx-impact, throttle: "per enemy defenceReadCooldownMs", fx_id: shield-glance-sparks }
- { event: shield.wear,    frame: 0, kind: defence-read, cue_id: shield_wear, notes: "at ⌈wearBlocks/3⌉ and ⌈2·wearBlocks/3⌉ blocks" }
- { event: shield.break,   frame: 0, kind: defence-break, cue_id: shield_shatter, bus: sfx-impact, fx_id: shield-shards, local_freeze_ms: defenceBreakFreezeMs, haptic: "UX §8.2 priority 3 (20 ms)", notes: "the breaking pierce hit's hit_enemy cue also plays on this step" }
- { event: armour.reduce,  frame: 0, kind: defence-read, cue_id: "armour_clang_chip | armour_clang_blast",  bus: sfx-impact, variant: "blast (heavier) | direct | dot", throttle: "per enemy defenceReadCooldownMs; dot ticks never cue" }
- { event: armour.break,   frame: 0, kind: defence-break, cue_id: armour_break, fx_id: armour-shards, local_freeze_ms: defenceBreakFreezeMs }
- { event: ward.absorb,    frame: 0, kind: defence-read, cue_id: ward_pop,      bus: sfx-impact, throttle: "per enemy defenceReadCooldownMs", notes: "swallowed DoT ticks: no cue, no fx" }
- { event: ward.strip,     frame: 0, kind: defence-break, cue_id: ward_break,   bus: sfx-impact, fx_id: ward-burst+shock-arc, local_freeze_ms: defenceBreakFreezeMs }
- { event: ward.regrow,    frame: 0, kind: fx, cue_id: ward_raise, notes: "first mote; motes every wardRegrowStepMs" }
- { event: ward.grant,     frame: "rel (W)", kind: fx, cue_id: ward_raise, notes: "ward_allies act; arrival 12 steps later (200 ms)" }
- { event: guard.start,    frame: "rel (W)", kind: fx, cue_id: guard_raise, notes: "Knight shield_wall; guard ends at W + 180 steps, blink from W + 150" }
```

### 5.2 v2 attacks, resolved frames (nominal; `W` = windup steps; the sim emits anchors, per §2.9)

| Actor | Attack | Type | W | lock | rel | act_end | Extra markers |
|---|---|---|---|---|---|---|---|
| tomb_sentinel | `spear_thrust` | melee_swipe | 36 | 27 | 36 | 36 | recover to 66 |
| lantern_acolyte | `kindle_ward` | ward_allies | 48 | 39 | 48 | 48 | `ward_raise` 48; arrival 60 |
| grave_warden | `shield_bash` | charge | 48 | 39 | 48 | ≤ 78 | wall impact ∈ [48, 78]; stun 54 steps |
| grave_warden | `bone_toss` | shoot | 36 | 27 | 36 | 36 | — |
| grave_warden | `raise_sentinel` | summon | 54 | 45 | 54 | 54 | portal active at +51 (spawnPortalMs 850) |
| lantern_matron | `lantern_ring` | ring | 39 | 30 | 39 | 39 | — |
| lantern_matron | `kindle_choir` | ward_allies | 48 | 39 | 48 | 48 | `ward_raise` 48 |
| lantern_matron | `call_acolytes` | summon | 54 | 45 | 54 | 54 | — |
| lantern_matron | `ember_fan` | shoot | 33 | 24 | 33 | 33 | — |
| iron_colossus | `quake` | slam self | 54 | 45 | 54 | 54 | heavy impact + ring at 54 (`traumaHeavyImpact`) |
| iron_colossus | `rock_volley` | shoot | 36 | 27 | 36 | 36 | — |
| iron_colossus | `iron_charge` | charge | 57 | 48 | 57 | ≤ 99 | wall impact ∈ [57, 99]; stun 78 steps |
| ossuary_knight | `shield_wall` | guard | 36 | 27 | 36 | 216 | `guard_raise` 36; blink from 186; guard end 216 |
| ossuary_knight | `bone_rain` | hazard | 60 | 51 | 60 | 132 | bones land at 60; single tick window 60–132 |
| mire_queen | `veil` | ward_allies (self) | 42 | 33 | 42 | 42 | motes spiral in 42–54 |
| mire_queen | `bog_surge` | ring ×2 | 48 | 39 | 48 | 69 | volley 2 at 69 (preview 60) |
| archlich | `mirror_volley` | mirror | 39 (P3 35) | 30 (26) | 39 (35) | same | `n` read at `ws`; mirror-ghost flash at rel |
| archlich | `grand_spiral` | spiral | 54 (P3 49) | 45 (40) | 54 (49) | +79 | shots every 6.6 steps (sim-timed); mote shrink 12 steps before act_end |
| elite `volatile` | death ring | post-death | 27 (`delayMs` 450) | 18 | 27 | 27 | `volatile_arm` (proposed) at 0; ring fires at 27 with `explode` (small) |

### 5.3 Boss / mini-boss lifecycle (v2)

```yaml
- { actor: boss|mini, event: intro, timebase: real, at_ms: "name phase (150 boss / 100 mini)", cue_id: "stg_boss_intro + boss_roar_<id> | stg_miniboss_intro + miniboss_roar_<id>", bus: music-stinger }
- { actor: boss|mini, event: adapt, timebase: real, at_ms: "adapt phase (450 boss / 300 mini)", cue_id: stg_boss_adapt, bus: sfx, condition: "an adapt rule applied" }
- { actor: boss|mini, event: phase, timebase: sim, frame: 0, audio_cue: boss_phase, hit_stop: { victim_ms: bossPhaseHitstopMs }, trauma: traumaBossPhase, notes: "the phase banner starts when the stop ends; mini regrow read plays inside invulnMs" }
- { actor: boss, event: death, timebase: sim, frame: 0, audio_cue: boss_death, hit_stop: { victim_ms: bossDeathHitstopMs }, trauma: traumaBossKill, notes: "bossDeathHitstopMs = 300 (v2), the single boss-kill key" }
- { actor: mini, event: death, timebase: sim, frame: 0, audio_cue: miniboss_death, hit_stop: { victim_ms: miniBossDeathHitstopMs }, trauma: traumaBigExplosion, notes: "fallback cue: elite_kill; final burst at stop + miniBossDeathUnravelMs" }
- { actor: elite, event: affix-reveal, timebase: sim, frame: "spawn emerge end", cue_id: affix_reveal, proposed: true }
```

### 5.4 UI / meta markers (v2)

| Moment | Marker | Cue | Source entry |
|---|---|---|---|
| DASH / SWAP / USE / PAUSE / EDIT press | press start (release for PAUSE/EDIT) | `touch_ui_tap` (+ 6 ms haptic) | `touch-button-press` |
| Door threat icon | first threat icon's pop, once per room | `door_threat` | `door-threat-icon` |
| Reward skip | cards-out start | `reward_skip` | `reward-skip` |
| Reward reroll | out start | `ui_reroll` | `reward-reroll` |
| Duo offered / taken | link phase / parents-pulse | `duo_unlock` | `duo-offer`, `duo-take` |
| Forge merge | fuse phase | `forge_merge` | `forge-merge` |
| Forge evolve | gather phase | `forge_evolve` | `forge-evolve` |
| Forge slot | buy | `forge_slot` | `forge-slot-buy` |
| Daily begin | Mode Select close on Daily | `daily_start` | `mode-select` |
| Goal complete | stamp phase | `stg_goal` / `ui_unlock` | `goal-complete` |
| Daily copy success | chip in | `ui_confirm` | `daily-result` |
| First-block tip | enter | none (the block cue just played; UX P12) | `coach-first-block-tip` |
