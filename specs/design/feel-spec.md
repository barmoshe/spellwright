# Spellwright — `feel-spec`

**Owner:** Game Designer · **Status:** Wave 1, v1 · **Consumers:** Game Developer (`src/core/tunables.js` parses every `feel-tunables` block below **verbatim**; `architecture.md` §7.2), Animator (motion timing co-spec, polish rows), Audio Director (cue impact-frames), UX Designer (per-modality affordances, the screen-shake setting multiplies every `*ShakePx`).
**Mechanic-spec source:** `mechanic-spec.md` (§1 verbs, §2 player, §4 casting).

---

## §0 Project framing

- **Slot:** top-down pixel-art roguelite action with twin-stick casting. Desktop, landscape 16:9, 640×360 logical view (tile 16 px), integer-scaled. Sessions: runs of 25–35 min (win) or 8–20 min (typical death).
- **Target framerate:** 60 Hz fixed simulation step (`SIM_HZ` 60). Time values here are in **ms**, and the engine converts them with `round(ms·60/1000)` steps. "Frames" in prose = 60 Hz steps (16.7 ms).
- **Input-modality matrix:** keyboard + mouse (primary) · gamepad twin-stick (secondary) · touch **deferred**.
- **Reference titles (anchors):** Nuclear Throne (movement snap, hit flash, screenshake; Vlambeer, "The Art of Screenshake", Jan Willem Nijman, 2013) · Enter the Gungeon (dodge-roll i-frames, small player hitbox, RMB dodge, cursor camera lead) · Hades (dash distance and cadence, hurt freeze) · The Binding of Isaac (damage i-frames and flicker) · Noita / Magicraft (wand cast and swap cadence) · Celeste (input buffering) · Halo (aim-assist magnetism) · Josh Sutphin, "Doing Thumbstick Dead Zones Right" (radial deadzone) · Mick West, "Scroll back: the theory and practice of cameras in side-scrollers" (camera lerp) · Steve Swink, *Game Feel* (input → response → context → polish).
- **Honesty note on anchors:** values tagged `(obs.)` in prose are approximations from public talks or observation of the reference title, not frame-data dumps. The anchor tells a reviewer *which* feel we are matching, and the number is our committed value.
- **Deviation from the template (documented):** input-to-effect **latency budgets** (§audit-latency) are verification targets measured at Wave 5 by frame-stepping. No code reads them, so they are **not** in any `feel-tunables` block (the orchestrator rule is that every block value must be read by code). Every other number in this spec appears in exactly one block row.
- **Screen-shake scaling:** every `*ShakePx` value is multiplied at runtime by Settings → Screen shake (0–100%, UX) and zeroed by reduced-motion. The sum of concurrent shakes is clamped to `shakeMaxPx`.

---

## §verb-1 — `move`

1. **Identity.** mechanic-spec §2. *Metaphor:* "a nimble apprentice who plants their feet a little to cast": instant start, crisp stop, a hint of weight while casting.
2. **Input.** WASD/arrows (digital, diagonals normalized) · left stick (radial deadzone `moveStickDeadzone`, rescaled to 0..1 beyond it, analog magnitude honoured).
3. **Simulation.** `targetVel = dir × moveSpeed × relic.moveSpeedMult × (castHeld ? castMoveMult : 1) × (playerSlow ? 1−slowFrac : 1)`. Each step, velocity moves toward `targetVel` by at most `moveAccel·dt` when speeding up (|target| ≥ |v|) or `moveDecel·dt` when slowing or stopping. `moveSpeed` 110 px/s ≈ 6.9 tiles/s, which crosses a 40-tile single-screen room in ~5.8 s. That is slightly under Nuclear Throne's walk (maxspeed 4 px/step at 30 Hz ≈ 120 px/s, obs.), because our rooms carry more bullets and need more reading time. Accel reaches top speed in ≈ 67 ms (4 frames); decel stops in ≈ 46 ms (3 frames). `castMoveMult` 0.9 deviates from Enter the Gungeon's no-slowdown fire-walk: a 10% plant gives casting weight without making kiting sluggish.
4. **Polish.** Footstep dust every 2nd step animation frame (Animator owns). No shake.
5. **Forgiveness.** Corner slide: Arcade body circle (radius `playerBodyRadius`) slides along walls natively. No extra snap.
6. **Modality variants.** Identical simulation. The pad's analog magnitude allows slow walking; the keyboard is always full speed.

```yaml
feel-tunables:
  verb: move
  params:
    - { param: moveSpeed, value: 110, unit: px/s, source_ref: NuclearThrone-walk, range: [90, 130], frozen: false }
    - { param: moveAccel, value: 1650, unit: px/s2, source_ref: NuclearThrone-walk, range: [1000, 2400], frozen: false }
    - { param: moveDecel, value: 2400, unit: px/s2, source_ref: NuclearThrone-walk, range: [1500, 3600], frozen: false }
    - { param: castMoveMult, value: 0.9, unit: mult, source_ref: EtG-fire-while-walking, range: [0.75, 1.0], frozen: false }
    - { param: moveStickDeadzone, value: 0.2, unit: ratio, source_ref: Sutphin-radial-deadzone, range: [0.1, 0.3], frozen: false }
```

---

## §verb-2 — `aim`

1. **Identity.** Aim direction for every cast. *Metaphor:* "the wand points where you look."
2. **Input.** Mouse: vector from the player centre to the cursor's world point. It is always valid, and no assist is ever applied to mouse aim. Right stick: radial deadzone `aimStickDeadzone`. Inside the deadzone, keep the last aim (no snapping back to facing).
3. **Simulation, pad-only aim assist (Halo-style magnetism, scaled down for bullets).** If a living, non-spawning enemy lies within `aimAssistConeDeg` of the stick direction and within `aimAssistRangePx`, rotate the aim toward the closest such enemy by `aimAssistStrength` × the angular difference, each step. Assist never overrides the stick by more than the cone half-angle.
4. **Polish.** Reticle (UX/2D Artist). The wand sprite rotates to the aim every step, with no smoothing.
5. **Forgiveness.** Aim assist (pad) is the forgiveness. Mouse needs none.
6. **Modality variants.** KB+M: raw aim. Pad: deadzone plus assist (the rows below).

```yaml
feel-tunables:
  verb: aim
  params:
    - { param: aimStickDeadzone, value: 0.3, unit: ratio, source_ref: Sutphin-radial-deadzone, range: [0.2, 0.45], frozen: false }
    - { param: aimAssistConeDeg, value: 8, unit: deg, source_ref: Halo-aim-magnetism, range: [0, 15], frozen: false }
    - { param: aimAssistRangePx, value: 180, unit: px, source_ref: Halo-aim-magnetism, range: [120, 260], frozen: false }
    - { param: aimAssistStrength, value: 0.5, unit: ratio, source_ref: Halo-aim-magnetism, range: [0, 1], frozen: false }
```

---

## §verb-3 — `cast` (hold) and `wand-swap`

1. **Identity.** mechanic-spec §4. *Metaphor:* "holding the trigger lets the wand run its program as fast as it can."
2. **Input.** Hold LMB / RT: `tryCast` is attempted every step while held. A **tap** that lands while the wand is still in its cast delay (not recharge) is buffered for `castBufferMs`, so tap-casters aren't eaten by the cooldown. Gamepad buffers get `+padBufferBonusMs`. Wand swap: 1–3 / Q / wheel / RB / Y. A swap takes effect immediately, but the new wand can't cast for `wandSwapMs`.
3. **Simulation.** Shots spawn on the cast step at `wandTipOffsetPx` from the player centre along the aim. All shot numbers (damage, speed, lifetime) are **content data** in `data/spells.json`, not feel.
4. **Polish (cast step = frame 0):**

| Component | Number | Frame | Anchor |
|---|---|---|---|
| Muzzle flash sprite at wand tip (element hue) | `muzzleFlashMs` 50 | 0 | Vlambeer muzzle flash (obs.) |
| Wand/player kick opposite to aim | `castKickPx` 1 px over `castKickMs` 60, ease-out return | 0 → 4 | Vlambeer gun kick |
| Cast SFX (`cast` cue, element family) | 1 | 0 | cue-spec |
| Screen shake | **none** for casts (explosions shake, casts don't: 10+ casts/s would blur the screen) | — | Nuclear Throne (light weapons don't shake) |
| Sputter (mana skip or empty group) | grey puff at tip `sputterFlashMs` 90, `sputter` cue, at most once per `sputterMinIntervalMs` 250 | 0 | Noita "no mana" puff (obs.) |
| Wand swap | wand sprite swap plus 1-frame flash, `wand_swap` cue | 0 | — |

5. **Forgiveness.** Cast buffer (taps). Swap lock is deliberately *un*-forgiving (it is the cost that bounds D6).
6. **Modality variants.** Pad buffers +33 ms (2 frames): pad triggers have more travel before actuation.
   **Analog triggers (every pad, including PS5 DualSense; standard-mapping button indices 6/7):** a trigger counts as *pressed* when its value is ≥ `padTriggerPress` 0.20 and as *released* only when it drops below `padTriggerRelease` 0.10. The hysteresis stops a trigger held near the threshold from chattering cast on and off. The press value is set below the UX proposal of 0.30: the DualSense has long trigger travel, and 30% travel adds actuation delay against the 2-frame pad cast budget (§audit-latency). The anchor is XInput's standard trigger threshold (30/255 ≈ 0.12); we sit a little above it to survive worn or noisy triggers. The runtime must keep `padTriggerRelease` < `padTriggerPress` (the ranges are allowed to overlap, but a tuning-panel value that inverts them is clamped to release = press − 0.05).

```yaml
feel-tunables:
  verb: cast
  params:
    - { param: castBufferMs, value: 120, unit: ms, source_ref: Swink-input-buffer, range: [60, 200], frozen: false }
    - { param: padBufferBonusMs, value: 33, unit: ms, source_ref: Swink-input-buffer, range: [0, 67], frozen: false }
    - { param: wandTipOffsetPx, value: 10, unit: px, source_ref: EtG-gun-muzzle, range: [6, 14], frozen: false }
    - { param: muzzleFlashMs, value: 50, unit: ms, source_ref: Vlambeer-muzzle-flash, range: [33, 83], frozen: false }
    - { param: castKickPx, value: 1, unit: px, source_ref: Vlambeer-gun-kick, range: [0, 2], frozen: false }
    - { param: castKickMs, value: 60, unit: ms, source_ref: Vlambeer-gun-kick, range: [33, 100], frozen: false }
    - { param: sputterFlashMs, value: 90, unit: ms, source_ref: Noita-no-mana-puff, range: [50, 150], frozen: false }
    - { param: sputterMinIntervalMs, value: 250, unit: ms, source_ref: Noita-no-mana-puff, range: [150, 500], frozen: false }
    - { param: wandSwapMs, value: 120, unit: ms, source_ref: Noita-wand-swap, range: [80, 200], frozen: false }
    - { param: padTriggerPress, value: 0.2, unit: ratio, source_ref: XInput-trigger-threshold, range: [0.1, 0.4], frozen: false }
    - { param: padTriggerRelease, value: 0.1, unit: ratio, source_ref: XInput-trigger-threshold, range: [0.05, 0.3], frozen: false }
```

---

## §verb-4 — `dash`

1. **Identity.** mechanic-spec §2. *Metaphor:* "a short, sure blink-step: you're untouchable for the whole move and a hair after."
2. **Input.** Space or RMB / A or LB. **Direction** = current move input if non-zero, else the aim direction (always defined). A press during cooldown with charges at 0, or during another dash, is buffered for `dashBufferMs` (+`padBufferBonusMs` on pad).
3. **Simulation.** Velocity is set to `dir × dashSpeed` for `dashDurationMs` (distance ≈ 54 px ≈ 3.4 tiles, Hades-like short dash, obs.). Steering, casting and enemy body collision are ignored during the dash. Walls and pits still block (Arcade collision): a dash into a wall stops at the wall, and the i-frames still run. I-frames last `dashIframesMs` from frame 0, extending 40 ms past the dash end so exits aren't punished (the Enter the Gungeon roll keeps i-frames through most of its motion, obs.). At dash end, velocity = `dir × moveSpeed × dashExitVelocityFrac`, which then blends into normal movement via accel/decel (no dead stop). Charges: `dashChargesBase` + relics. Each spent charge refills `dashCooldownMs` after the dash ends, refilling one at a time.
4. **Polish.**

| Component | Number | Frame | Anchor |
|---|---|---|---|
| Afterimages (ghost copies of the player sprite) | `dashAfterimages` 3, each fading over `dashAfterimageFadeMs` 180 | spawned evenly across the dash (k·dashDurationMs/N, k = 0..N−1) | Hades dash trail (obs.) |
| Dash SFX (`dash` cue) | 1 | 0 | cue-spec |
| Dust puff at origin | Animator/TA | 0 | — |
| Screen shake | none | — | — |

5. **Forgiveness.** Dash buffer 100 ms (≈ 6 frames; Celeste-style buffered action). I-frame tail of 40 ms.
6. **Modality variants.** Pad buffer +33 ms. Direction logic identical.

```yaml
feel-tunables:
  verb: dash
  params:
    - { param: dashSpeed, value: 360, unit: px/s, source_ref: Hades-dash, range: [300, 420], frozen: false }
    - { param: dashDurationMs, value: 150, unit: ms, source_ref: Hades-dash, range: [120, 180], frozen: false }
    - { param: dashIframesMs, value: 190, unit: ms, source_ref: EtG-dodge-roll-iframes, range: [150, 250], frozen: false }
    - { param: dashCooldownMs, value: 600, unit: ms, source_ref: EtG-dodge-roll-cadence, range: [400, 900], frozen: false }
    - { param: dashBufferMs, value: 100, unit: ms, source_ref: Celeste-input-buffer, range: [66, 150], frozen: false }
    - { param: dashChargesBase, value: 1, unit: count, source_ref: EtG-dodge-roll-cadence, range: [1, 1], frozen: true }
    - { param: dashExitVelocityFrac, value: 0.35, unit: ratio, source_ref: Hades-dash, range: [0, 0.6], frozen: false }
    - { param: dashAfterimages, value: 3, unit: count, source_ref: Hades-dash-trail, range: [0, 5], frozen: false }
    - { param: dashAfterimageFadeMs, value: 180, unit: ms, source_ref: Hades-dash-trail, range: [100, 300], frozen: false }
```

---

## §verb-5 — `impact` (player damage lands on enemies)

1. **Identity.** Feedback when spells connect. *Metaphor:* "every hit pops; every kill punctuates, without stuttering a 20-hits-per-second wand."
2. **Input.** None; driven by hit events.
3. **Simulation.** Knockback impulses (mechanic-spec §8.1) decay at `knockbackDecay`. Hit-stop pauses the whole sim (`architecture.md` §4 time control). **Hit-stop policy:** normal hits never hit-stop. A kill hit-stops `killHitstopMs` (2 frames), but no more than once per `killHitstopMinIntervalMs`, so a chain-lightning clear doesn't stutter. Elite kills and boss phase changes use their own larger values and ignore the interval.
4. **Polish (composition order; frame 0 = damage applied):**

| Component | Number | Frame | Anchor |
|---|---|---|---|
| Enemy white fill-flash (`TintModes.FILL`) | `enemyHitFlashMs` 60 | 0 | Nuclear Throne hit flash |
| Hit particles (element hue) | `hitParticles` 4, life `hitParticleLifeMs` 220 | 0 | Vlambeer impact |
| `hit_enemy` cue | 1 (voice-capped by cue-spec) | 0 | — |
| Damage number | rises `damageNumberRisePx` 10 over `damageNumberRiseMs` 450; crits × `critNumberScale` **2** (integer only: outlined bitmap digits can't scale fractionally, per style-guide §3.3), plus a gold colour and a "!" suffix (colour and glyph owned by UX/2D Artist) | 0 | Diablo-style numbers (setting-toggleable, UX) |
| Kill hit-stop | `killHitstopMs` 33 (rate-limited) | on the kill step | Vlambeer kill pause |
| Death puff | `deathPuffParticles` 8, then the corpse fades over `corpseFadeMs` 300 | after hit-stop | — |
| Elite-kill hit-stop | `eliteKillHitstopMs` 90 | kill step | Super Smash Bros. medium hitlag (obs.) |
| Boss phase hit-stop | `bossPhaseHitstopMs` 160 | phase change | — |
| Explosion shake | `explosionShakePx` 2 for `explosionShakeMs` 120; radius ≥ `bigExplosionRadiusPx` 40 → `bigExplosionShakePx` 3 / `bigExplosionShakeMs` 180 | detonation | Vlambeer screenshake |
| Heavy-impact shake (golem stomp, boss slam or charge-into-wall) | `heavyImpactShakePx` 5 / `heavyImpactShakeMs` 300 | impact | Vlambeer screenshake |

Shake uses decaying random offsets (fx stream), with amplitude easing out linearly over its duration.

5. **Forgiveness.** Not applicable (feedback verb).
6. **Modality variants.** Identical. Pad rumble is deferred (not in the Phaser 4 gamepad path we verified).

```yaml
feel-tunables:
  verb: impact
  params:
    - { param: enemyHitFlashMs, value: 60, unit: ms, source_ref: NuclearThrone-hit-flash, range: [33, 100], frozen: false }
    - { param: knockbackDecay, value: 1400, unit: px/s2, source_ref: NuclearThrone-knockback, range: [800, 2400], frozen: false }
    - { param: hitParticles, value: 4, unit: count, source_ref: Vlambeer-impact, range: [0, 8], frozen: false }
    - { param: hitParticleLifeMs, value: 220, unit: ms, source_ref: Vlambeer-impact, range: [120, 400], frozen: false }
    - { param: damageNumberRiseMs, value: 450, unit: ms, source_ref: Diablo-damage-numbers, range: [300, 700], frozen: false }
    - { param: damageNumberRisePx, value: 10, unit: px, source_ref: Diablo-damage-numbers, range: [6, 16], frozen: false }
    - { param: critNumberScale, value: 2, unit: mult, source_ref: Diablo-damage-numbers, range: [2, 2], frozen: true }
    - { param: killHitstopMs, value: 33, unit: ms, source_ref: Vlambeer-kill-pause, range: [0, 50], frozen: false }
    - { param: killHitstopMinIntervalMs, value: 250, unit: ms, source_ref: Vlambeer-kill-pause, range: [150, 500], frozen: false }
    - { param: eliteKillHitstopMs, value: 90, unit: ms, source_ref: SmashBros-hitlag-medium, range: [60, 120], frozen: false }
    - { param: bossPhaseHitstopMs, value: 160, unit: ms, source_ref: SmashBros-hitlag-heavy, range: [100, 250], frozen: false }
    - { param: deathPuffParticles, value: 8, unit: count, source_ref: Vlambeer-impact, range: [4, 12], frozen: false }
    - { param: corpseFadeMs, value: 300, unit: ms, source_ref: NuclearThrone-corpse, range: [150, 600], frozen: false }
    - { param: explosionShakePx, value: 2, unit: px, source_ref: Vlambeer-screenshake, range: [0, 3], frozen: false }
    - { param: explosionShakeMs, value: 120, unit: ms, source_ref: Vlambeer-screenshake, range: [80, 200], frozen: false }
    - { param: bigExplosionRadiusPx, value: 40, unit: px, source_ref: Vlambeer-screenshake, range: [32, 56], frozen: false }
    - { param: bigExplosionShakePx, value: 3, unit: px, source_ref: Vlambeer-screenshake, range: [2, 4], frozen: false }
    - { param: bigExplosionShakeMs, value: 180, unit: ms, source_ref: Vlambeer-screenshake, range: [120, 260], frozen: false }
    - { param: heavyImpactShakePx, value: 5, unit: px, source_ref: Vlambeer-screenshake, range: [3, 6], frozen: false }
    - { param: heavyImpactShakeMs, value: 300, unit: ms, source_ref: Vlambeer-screenshake, range: [200, 400], frozen: false }
```

---

## §verb-6 — `hurt` (player takes damage)

1. **Identity.** mechanic-spec §2 hurt resolution. *Metaphor:* "a sharp, unmistakable sting, then a generous second to recover."
2. **Input.** None (event).
3. **Simulation.** On a damage instance that lands: hit-stop `hurtHitstopMs`, knockback impulse `hurtKnockback` away from the source, i-frames `hurtIframesMs` (Binding of Isaac's ≈ 1 s post-hit invulnerability, obs.). Hurtbox radius `playerHurtboxRadius` 4 px vs body `playerBodyRadius` 6 px: bullets must reach the core of the sprite (the Enter the Gungeon small-hitbox convention). A shield break uses `shieldBreakHitstopMs` and grants the same i-frames.
4. **Polish.**

| Component | Number | Frame | Anchor |
|---|---|---|---|
| Hit-stop | `hurtHitstopMs` 90 | 0 | Hades hurt freeze (obs.) |
| Red screen-edge flash | `hurtFlashMs` 120 | 0 | — |
| Screen shake | `hurtShakePx` 4 / `hurtShakeMs` 220 | after hit-stop | Vlambeer screenshake |
| Sprite flicker during i-frames | toggle visibility every `hurtFlickerPeriodMs` 66 | i-frame span | Isaac flicker |
| `player_hurt` cue (or `shield_break`) | 1 | 0 | — |

5. **Forgiveness.** 1 s i-frames. Small hurtbox. Enemy aim locks 150 ms before release (mechanic-spec §9.2).
6. **Modality variants.** Identical.

```yaml
feel-tunables:
  verb: hurt
  params:
    - { param: hurtIframesMs, value: 1000, unit: ms, source_ref: Isaac-damage-iframes, range: [800, 1500], frozen: false }
    - { param: hurtFlickerPeriodMs, value: 66, unit: ms, source_ref: Isaac-damage-iframes, range: [50, 100], frozen: false }
    - { param: hurtHitstopMs, value: 90, unit: ms, source_ref: Hades-hurt-freeze, range: [60, 120], frozen: false }
    - { param: hurtShakePx, value: 4, unit: px, source_ref: Vlambeer-screenshake, range: [2, 6], frozen: false }
    - { param: hurtShakeMs, value: 220, unit: ms, source_ref: Vlambeer-screenshake, range: [150, 300], frozen: false }
    - { param: hurtKnockback, value: 170, unit: px/s, source_ref: NuclearThrone-knockback, range: [100, 240], frozen: false }
    - { param: hurtFlashMs, value: 120, unit: ms, source_ref: Hades-hurt-freeze, range: [80, 200], frozen: false }
    - { param: playerHurtboxRadius, value: 4, unit: px, source_ref: EtG-small-hitbox, range: [3, 6], frozen: false }
    - { param: playerBodyRadius, value: 6, unit: px, source_ref: EtG-small-hitbox, range: [5, 7], frozen: true }
    - { param: shieldBreakHitstopMs, value: 60, unit: ms, source_ref: Hades-hurt-freeze, range: [30, 90], frozen: false }
```

---

## §verb-7 — `camera`

1. **Identity.** *Metaphor:* "the room is the frame; in big rooms the camera leans toward where you're aiming."
2. **Input.** Player position plus aim.
3. **Simulation.** Rooms ≤ 640×360 (≤ 40×22 tiles; all rooms except `long_gallery` and `catacombs`) → camera locked centred (`architecture.md` §9), and look-ahead is off. Larger rooms → the camera target = player + aimVector × min(|cursorOffset| × `lookAheadFrac`, `lookAheadMaxPx`) (pad: aim unit vector × `lookAheadMaxPx` × stick magnitude). Position eases toward the target with `lerp = 1 − (1 − cameraLerp)^(dt·60)` (frame-rate-independent Mick West-style smoothing), bounded to the room rect. Room change = fade out/in `roomFadeMs` each way. Boss rooms: pan from the player to the boss spawn and back over `bossIntroPanMs` during boss activation (mechanic-spec §10).
4. **Polish.** Shake composition per §0 (sum clamped to `shakeMaxPx`).
5. **Forgiveness.** Look-ahead reveals threats in the aim direction.
6. **Modality variants.** Pad look-ahead uses stick magnitude (above).

```yaml
feel-tunables:
  verb: camera
  params:
    - { param: cameraLerp, value: 0.14, unit: ratio, source_ref: MickWest-camera-lerp, range: [0.08, 0.25], frozen: false }
    - { param: lookAheadFrac, value: 0.22, unit: ratio, source_ref: EtG-cursor-camera-lead, range: [0, 0.35], frozen: false }
    - { param: lookAheadMaxPx, value: 36, unit: px, source_ref: EtG-cursor-camera-lead, range: [0, 64], frozen: false }
    - { param: shakeMaxPx, value: 6, unit: px, source_ref: Vlambeer-screenshake, range: [3, 8], frozen: false }
    - { param: roomFadeMs, value: 220, unit: ms, source_ref: Isaac-room-transition, range: [120, 400], frozen: false }
    - { param: bossIntroPanMs, value: 900, unit: ms, source_ref: EtG-boss-intro, range: [600, 1400], frozen: false }
```

---

## §verb-8 — `pickup` and `interact`

1. **Identity.** Coins fly to you; cards, relics, wands and doors wait for a deliberate press.
2. **Input.** Coins are automatic. Pedestals, doors and shop items: E / X within `interactRadius`.
3. **Simulation.** Dropped coins pop outward at `coinPopSpeed` (random direction, fx stream) decaying at `coinPopDecay`. After `coinMagnetDelayMs` any coin within `magnetRadius` × relic `pickupRadiusMult` flies to the player at `magnetSpeed`, and is collected within `pickupRadius` × `pickupRadiusMult`. **On room clear, all coins in the room are magnetized** regardless of distance (no post-fight chores).
4. **Polish.** `pickup_coin` cue per coin (voice-capped). Card pickup: `pickup_card` cue plus UX panel.
5. **Forgiveness.** Room-clear vacuum. The interact radius is larger than the body.
6. **Modality variants.** Identical.

```yaml
feel-tunables:
  verb: pickup
  params:
    - { param: pickupRadius, value: 18, unit: px, source_ref: Isaac-pickup-radius, range: [12, 28], frozen: false }
    - { param: magnetRadius, value: 56, unit: px, source_ref: NuclearThrone-ammo-magnet, range: [32, 96], frozen: false }
    - { param: magnetSpeed, value: 260, unit: px/s, source_ref: NuclearThrone-ammo-magnet, range: [180, 400], frozen: false }
    - { param: interactRadius, value: 20, unit: px, source_ref: Isaac-pickup-radius, range: [14, 32], frozen: false }
    - { param: coinPopSpeed, value: 90, unit: px/s, source_ref: NuclearThrone-ammo-magnet, range: [40, 140], frozen: false }
    - { param: coinPopDecay, value: 600, unit: px/s2, source_ref: NuclearThrone-ammo-magnet, range: [300, 1000], frozen: false }
    - { param: coinMagnetDelayMs, value: 300, unit: ms, source_ref: NuclearThrone-ammo-magnet, range: [150, 500], frozen: false }
```

---

## §audit-latency — input-to-effect budgets (verification only; not tunables)

| Verb | Modality | Target | Ceiling | Audit anchor |
|---|---|---|---|---|
| move | KB / pad | 2 frames (33 ms) to first visible displacement | 4 frames | Nuclear Throne walk start |
| aim | mouse | 1 frame (wand sprite rotation) | 2 frames | Enter the Gungeon cursor |
| aim | pad | 2 frames | 4 frames | Enter the Gungeon stick aim |
| cast | KB+M / pad | 2 frames from press to muzzle flash plus shot (when ready) | 4 frames | Nuclear Throne revolver |
| dash | KB+M / pad | 2 frames to first displacement plus afterimage | 3 frames | Hades dash |
| hurt | — | same step as collision → hit-stop | 1 frame | — |

Measured at Wave 5 by frame-stepping (`game-feel-specification/tools/frame-step-procedure.md`). The engine's edge latching (`architecture.md` §8) guarantees no tap is lost between steps.

---

## §handoffs

- **Game Developer:** blocks are parsed verbatim. Every row above is consumed by exactly the code path its prose names. The `?debug` unread-tunables check (`architecture.md` §7.2) should come back empty after one room plus one boss room is played. `frozen: true` rows (`dashChargesBase`, `playerBodyRadius`) are constants, not panel sliders.
- **Animator:** co-own the timing of cast kick (60 ms), dash afterimages (3 over 150 ms), hurt flicker (66 ms), enemy flash (60 ms) and death puff. Telegraph durations come from `data/*.json` `windupMs` (mechanic-spec §14).
- **Audio Director:** cue impact frames are frame 0 of each polish table. Hit-stop pauses the sim but **not** audio (cues still play on the hit frame).
- **UX Designer:** screen-shake slider and reduced-motion (multiply or zero every `*ShakePx`), damage-number toggle, per-modality glyphs, dash direction rule (move, else aim).

## §audit — six-check (game-feel-specification DOG)

1. Latency budget per verb, target and ceiling in frames, with anchors: §audit-latency. ✔
2. Forgiveness windows: cast buffer 120 ms, dash buffer 100 ms, i-frame tail 40 ms, small hurtbox, pad aim assist, coin vacuum; each anchored. ✔
3. Every numeric parameter has a named reference anchor (`source_ref`, with approximations marked `(obs.)` in prose). ✔
4. Per-modality variants per verb (pad buffer bonus, stick deadzones, pad-only aim assist, pad look-ahead). ✔
5. Juice decomposed per impact verb, with frame of fire and order (cast, dash, impact, hurt tables). ✔
6. Every number lives in exactly one `feel-tunables` row (latency budgets excluded by the documented deviation, §0). ✔
