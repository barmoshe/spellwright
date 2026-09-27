# Spellwright — Combat telegraphs, hit reactions, deaths

**Owner:** Animator · **Status:** Wave 2, v1 · **Skill DOG:** `combat-telegraphs-and-reactions` (five-phase structure named; reaction-time budget defended; silhouette change in frames 1–3 of the windup)
**Consumers:** Game Developer (`TelegraphLayer`, AI visual hooks, hit/death FX), Technical Artist (flipbooks and fx listed per row), 2D Artist (palette tokens, overlay sprites: `state-graph-spec.md` §6), Audio Director (markers: `event-markers.md`).
**Binding rules inherited from `state-graph-spec.md` §0:** R3 (telegraphs are driven by the progress `p` from the AI's windup timer, never by fixed tweens; hit-stop freezes them), R4 (pixel integrity), R5 (tint priority + hit-flash re-arm), R8 (reduced motion keeps every telegraph).

---

## §0 Reaction-time budget (DOG defence)

`W` = windup in 60 Hz sim steps (`round(ms·60/1000)`). **Lock** = aim/position lock at `W − 9` steps (`rules.enemies.aimLockBeforeReleaseMs` 150). DOG floors are ≥ 340 ms for trained reads and ≥ 500 ms for a **first-introduction** attack. The worst cases are the curse-L2 value (`× 0.9`, floored at 350 / 600 / 450 per mechanic-spec §9 and §10) and the Archlich P3 value (`× 0.9`, floored). Chill only *lengthens* windups (2 stacks: ×1/(1−0.4) = ×1.67), and the progress-driven telegraph stretches with it automatically.

| Actor | Attack | Type | Dmg | windup ms | W | lock step | recover ms | worst case (curse / P3) | First seen | Verdict |
|---|---|---|---|---|---|---|---|---|---|---|
| skeleton | `swipe` | melee_swipe | 1 | 450 | 27 | 18 | 450 | 405 | **F1 s1 (FTUE)** | 450 < 500 first-intro floor → **compensated** (§0.1) |
| cultist | `bolt` | shoot | 1 | 550 | 33 | 24 | 300 | 495 | F1 s2 | ✔ ≥ 500 |
| frost_mage | `frost_orbs` | shoot | 1 | 650 | 39 | 30 | 350 | 585 | F1+ | ✔ |
| brute | `charge` | charge | 1 | 700 | 42 | 33 | 500 | 630 | F1 s2 (dash lesson) | ✔ (+ UX dash prompt) |
| fire_imp | `fuse` | self_destruct | 1 | 600 | 36 | 27 | 0 | 540 | F1+ | ✔ |
| eye_turret | `eye_ring` | ring | 1 | 650 | 39 | 30 | 300 | 585 | F1+ | ✔ |
| eye_turret | `eye_burst` | shoot | 1 | 500 | 30 | 21 | 300 | 450 | F1+ | ✔ (shoot is already taught by the cultist, 550) |
| wraith | `wraith_blink` | blink | 0 | 500 | 30 | 21 | 150 | 450 | F2 | ✔ (no damage) |
| wraith | `wraith_volley` | shoot | 1 | 450 | 27 | 18 | 300 | 405 | F2 | ✔ trained read (shoot seen since F1); ≥ 340 at worst |
| necromancer | `raise` | summon | 0 | 900 | 54 | 45 | 400 | 810 | F2 | ✔ |
| stone_golem | `stomp` | slam (self) | 2 | 850 | 51 | 42 | 700 | 765 | F3 | ✔ |
| ossuary_knight | `cleave` | melee_swipe | 2 | 800 | 48 | 39 | 600 | — | F1 boss | ✔ |
| ossuary_knight | `bone_ring` / `_double` | ring | 1 | 700 | 42 | 33 | 400 | — | F1 boss | ✔ (volley 2 preview, §2.3) |
| ossuary_knight | `charge` | charge | 2 | 900 | 54 | 45 | 300 | — | F1 boss | ✔ |
| ossuary_knight | `bone_fan` | shoot | 1 | 600 | 36 | 27 | 400 | — | F1 boss | ✔ |
| ossuary_knight | `raise_dead` | summon | 0 | 900 | 54 | 45 | 400 | — | F1 boss P2 | ✔ |
| mire_queen | `spiral_spray` / `_4` | spiral | 1 | 700 | 42 | 33 | 500 | — | F2 boss | ✔ |
| mire_queen | `leap_slam` (×2 in `double_leap`, gap 300) | slam (target) | 2 | 600 **+ 900 travel** | 36 (+54) | 27 | 700 | — | F2 boss | ✔ circle live for 1 500 ms |
| mire_queen | `acid_pools` | hazard | 1/tick | 900 | 54 | 45 | 300 | — | F2 boss | ✔ |
| mire_queen | `brood` | summon | 0 | 800 | 48 | 39 | 400 | — | F2 boss | ✔ |
| mire_queen | `aimed_glob` | shoot | 1 | 500 | 30 | 21 | 400 | — | F2 boss | ✔ |
| archlich | `arcane_volley` / `_7` | shoot | 1 | 550 | 33 | 24 | 350 | P3: 495 | F3 boss | ✔ trained |
| archlich | `lich_blink` | blink | 0 | 500 | 30 | 21 | 200 | P3: 450 | F3 boss | ✔ |
| archlich | `frost_ring` | ring | 1 | 700 | 42 | 33 | 400 | P3: 630 | F3 boss | ✔ |
| archlich | `spiral_hex` / `_5` | spiral | 1 | 800 | 48 | 39 | 500 | P3: 720 | F3 boss | ✔ |
| archlich | `fire_zones` | hazard | 1/tick | 1000 | 60 | 51 | 300 | P3: 900 | F3 boss | ✔ |
| archlich | `summon_wraiths` | summon | 0 | 900 | 54 | 45 | 400 | — | F3 boss P2 | ✔ |
| archlich | `soul_storm` | ring ×3 | 1 | 900 | 54 | 45 | 600 | P3: 810 | F3 boss P3 | ✔ (volley 2/3 preview) |

**No windup in the data is below the ~250 ms perceptual floor, and none is below the 340 ms trained floor even in its worst case (min 405 ms).** No objection is raised against any windup value.

### 0.1 Skeleton `swipe`: the one first-introduction case under 500 ms, compensated in motion

It is the first attack a new player sees (F1 s1 "First Blood"). Rather than asking the designer to slow it, the telegraph adds the two compensations the DOG names:
1. **A spatial indicator from step 0:** the swipe wedge decal (§2.1) appears at windup start and fills over the windup, so the player reads *where* before *when*.
2. **An audio lead:** `enemy_windup` (melee variant) at step 0, 450 ms of warning.

Geometry backs this up. The skeleton triggers at ≤ 26 px and its arc reaches 24 px. A player moving at 110 px/s clears the ≤ 8 px margin in about 73 ms, so after a ~250 ms reaction the 450 ms window leaves about 127 ms of slack. The designer's number stands.

---

## §1 Universal telegraph grammar (five-phase anatomy, per DS3 convention)

Every enemy and boss attack is authored as five phases. Frame indices are **sim steps from windup start** at nominal speed (stretched proportionally under chill, and frozen during hit-stop, per R3).

| Phase | Steps | Body layer | `TelegraphLayer` (ground) | Audio |
|---|---|---|---|---|
| **1 Opening pose** (silhouette change) | `0 … 5` (`telegraphOpeningMs` 100) | Type-specific anticipation (crouch, rear-back, raise). The silhouette differs from idle **by step 2** via offset/scale/overlay. Telegraph ADD tint begins. | Decal appears (dashed `telegraph-rim` 1 px at α 1, empty fill) | `enemy_windup` at step 0 |
| **2 Signal** | `6 … W−10` | Anticipation held. Tint ramps `telegraph-hot` 0 → base with p. `anims.timeScale` 1.5 (revving). | Fill grows linearly with p (area/length ∝ p), `telegraph-fill` at α `decalFillAlphaSignal`. Aimed shapes track the player. | — |
| **3 Lock / peak** | `W−9 … W−1` (the last 150 ms) | Anims frozen (committed pose). Tint jumps to peak. `telegraphJitterPx` x-tremble every 2 steps. Hit flash can't override the body tint (R5). | Aimed shapes freeze. The rim goes solid and gains a second 1 px inner line, and the fill jumps to α `decalFillAlphaLock`. **The peak is here** (mechanic §14). | — (proposed optional `enemy_lock` tick for damage-2 attacks only; Audio Director's call) |
| **4 Active** (`act`) | `W …` (instant, or the sustained duration) | Release stretch (`releaseStretchMs`), tint clears to none in 1 step, then the type's act motion. | 1-step **release flash**: the whole decal fills at alpha 0.7, then clears. Sustained acts keep their own shapes (charge line and spiral motes). | `enemy_release` (proposed, per type) / `explode` / `heavy_impact` |
| **5 End → Return** (`recover`) | `recoverMs` | Slump (−1 px y, 100 ms), `anims.timeScale` 0.5. No tint: the enemy is readable as *not threatening*. Return = transition to move/idle. | — | — |

### 1.1 `TelegraphLayer` (render contract)

- **One `Graphics` object** in RunScene at depth band **decals (10)**, cleared and redrawn **once per sim step** with every active telegraph shape. That is one draw call regardless of how many enemies are winding up (budget: `architecture.md` §11, ≤ 30 draw calls). It is not per-object Graphics and not per-object filters.
- Shapes: `circle(fill-disc radius r·p)`, `wedge(radius, arc, aim, fill radius r·p)`, `rect-path(width, length, fill length L·p)`, `spoke-set(n, angles, r0, r1)`, `rune-ring(r, dashes, rotation)`. Radii and lengths are rounded to integer px, and positions are snapped to integer px.
- **What you see is what hits (WYSIWYH):** every damaging decal's extent equals the hit test the dev implements. A swipe wedge has radius `range` (plus `playerHurtboxRadius` if the test is hurtbox-circle vs arc; draw whichever the code tests). A slam/hazard circle has radius `radius` (+ hurtbox likewise). A charge path has width `2·(enemy.radius + playerHurtboxRadius)` and length `min(speed·durationMs/1000, distance to the first wall/pillar/crate/pit edge by the same raycast the charge uses)`.
- **Rim pattern (non-colour lock read, accessibility-spec §3):** during opening and signal the `telegraph-rim` is a **1 px dashed keyline** (2 px on, 1 px off; the dash pattern crawls 1 px per 4 steps along the perimeter, which is the "motion" channel). In the lock window it turns **solid and doubled** (a second 1 px inner line). Dashed → solid is the lock read without relying on hue.
- Colours: `style-guide.md` §2.4 tokens (the dev maps names). `telegraph-fill` (`#dc4a7b`) and `telegraph-rim` (`#f78697`, 1 px) are the hostile band: anything on the floor that will hurt the player (style-guide §3). **Heavy (damage 2)** attacks use a **2 px** `telegraph-rim` (the double-damage read by shape weight, not hue alone). Summon sigils are `fx.summon_sigil` (a hostile *protection-circle glyph*, never a filled disc, so it can't be confused with a damage decal). Pre-active hazards use `telegraph-*`. Active pools are the slot map's `hazard.<element>` zones, which keep a 1 px `telegraph-rim` outer rim.
- Cap: at most 16 simultaneous telegraph shapes drawn. Beyond that, drop the oldest *non-damaging* (summon sigils) first. Damaging decals are never dropped.

### 1.2 Tint ramp (body)

`ADD` tint = `telegraph-hot`: `lerp(#000000, #4a1526, p_signal)` during signal and peak `#9f294e` in lock (R5 priority 4). ADD brightens toward the hostile hue on any palette, including dark sprites, without erasing the silhouette the way FILL would. It is not orange, because orange belongs to the player's fire (style-guide §2.4).

### 1.3 Facing during windup

The actor faces the player (R6). Chargers face the **locked aim** from lock onward. Bosses with weapon overlays mirror the overlay with facing.

### 1.4 Release flash

1 step: the decal draws fully filled at alpha 0.7, then is removed. For sustained acts (charge, spiral) the path/motes persist per §2.

### 1.5 Interrupted windup (shock stun, freeze, death)

The decal fades out over 100 ms with a grey `#8a8a8a` "fizzle" (3 smoke particles at the decal centre, or the body for shapeless tells). The body tint clears in 1 step. This lets the player learn that "shock cancels attacks" (mechanic §8.2). The exception is an imp killed mid-fuse with `explodeIfKilledDuringWindup`: it detonates instead (§2.11).

---

## §2 Per-type telegraphs, plus per-attack specifics

Notation: `p` = windup progress 0–1, `ps` = progress within the signal phase, `L` = lock window.

### 2.1 `melee_swipe`: skeleton `swipe`, knight `cleave`
- **Opening:** rear-back: body offset −2 px opposite the aim (integer, eases in over the opening). Skeleton: scaleX 1.125 for the opening only (a wind-up coil). Weapon raise:
  - Skeleton: no weapon overlay (the 0x72 `skelet` has none). The rear-back plus the wedge carry the read.
  - Knight: `boss_knight_blade` overlay at `hand`. Angle = aimAngle − side·(40° + 110°·Quad.easeOut(ps)) (raised up and behind). In lock it holds, with a 1-step white glint pixel at the tip on lock step 0.
- **Decal:** wedge, radius per WYSIWYH, arc `arcDeg`, centred on the aim (tracking until lock). Fill radius = R·p. Knight uses the heavy style.
- **Active:** instant. The body lunges +3 px along the aim for 50 ms, then returns. `fx.enemy_slash` (simplefx white slash arcs, `L_SFX_HOSTILE`) plays at 1 frame/step over the wedge, **rotation = aim**, at integer scale ×1 for range ≤ 32 px (skeleton 24) and ×2 above (knight 44), per the slot map. Knight: the blade overlay sweeps through the arc in 3 steps (smear).
- **Recover:** knight blade drops to point at the ground in front (a readable "open" pose) for `recoverMs` 600.

### 2.2 `shoot`: cultist `bolt`, frost_mage `frost_orbs`, eye `eye_burst`, wraith `wraith_volley`, knight `bone_fan`, queen `aimed_glob`, lich `arcane_volley`(`_7`)
- **Opening:** "hands glow": an additive glow dot (band 61) at `hand`, element hue, radius 1 px, growing to 4 px with p. Caster sprites also rise −1 px (standing tall).
- **Signal:** the glow pulses (radius ±1 px at 8 Hz) and the body ADD ramps.
- **Lock:** **aim ticks**: `count` short lines (4 px long, from r = body radius + 4) along each projectile direction (`spreadDeg` centred on the locked aim), `telegraph-rim`, alpha 1. The glow flashes white on lock step 0. The ticks show the exact volley shape at the commit moment, which is the "flash at lock" in mechanic §14.
- **No ground decal for regular enemies** (shooters are the most common attackers, and ground decals for them would clutter a 14-enemy room). **Bosses** (slot map `boss_telegraph.shoot`) add, from windup step 0: one 1 px `telegraph-rim` **aim line per bullet, 48 px long**, tracking until lock and then frozen, plus `fx.cast_glyph` (hostile) at `core`. A boss is alone on screen, so the extra channel costs no clarity.
- **Active:** projectiles spawn from the glow point. Muzzle flash (TA fx, element hue) for 3 steps. The body recoils 1 px opposite the aim for 2 steps.
- Per-attack body tells (on top of the above):

| Attack | Extra body tell |
|---|---|
| cultist `bolt` | — (base grammar) |
| frost_mage `frost_orbs` | 3 frost motes orbit the glow during signal |
| eye `eye_burst` | frame swaps to `eye_turret_f1` (glare) on step 0 for the whole windup (slot map); the glare *is* the silhouette change |
| wraith `wraith_volley` | alpha steadies 0.85 → 1.0 over the opening (it "solidifies" to shoot), back to 0.85 at recover |
| knight `bone_fan` | blade sweeps back to aim − side·120° over the opening; at release it sweeps forward through the fan |
| queen `aimed_glob` | head rears: y −2 px over the opening (integer offset, R4); at release it snaps +1 px forward |
| lich `arcane_volley` / `_7` | `boss_lich_staff` raised overhead (angle −90°); a glyph ring of 8 dots at r = 14 rotating 180°/s, contracting to r = 10 by lock |

### 2.3 `ring`: eye `eye_ring`, knight `bone_ring` / `bone_ring_double`, lich `frost_ring` / `soul_storm`
- **Opening:** body pulse: scaleX 1.125 for 2 steps, then back (x only on 32 px sprites). Eye: `eye_turret_f1` glare from step 0. **Bosses and the eye** also draw a 1 px `telegraph-rim` circle at r = 24 that pulses (α 1 ↔ 0.5 on each body pulse) plus `fx.cast_glyph` at `core` (slot map `boss_telegraph.ring`). The bullets appear on that circle at release.
- **Signal:** pulses repeat on an accelerating schedule at p = 0.33, 0.60, 0.80 (each 2 steps, scaleX up, R4-transient). The body ADD ramps. Boss variants:
  - knight: ribcage glow = the ADD pulse.
  - lich `frost_ring`: frost halo, a `frost` hue ring outline at r = body + 4 that grows 1 px per pulse.
  - `soul_storm`: the body rises −`bossRisePx` over the windup (linear), and 12 soul particles converge from r = 60 to the body over the windup.
- **Lock: gap preview.** A `spoke-set` of `count` spokes at the exact volley-1 angles (`offsetDeg` + i·360/count), from r0 = body radius + 3 to r1 = r0 + 5 px, `telegraph-rim`. The player's answer is "stand in a gap" (pacing §5), so the gaps are drawn.
- **Active:** the ring fires. A 1-step expanding ring outline from the body (r +8 px) plays.
- **Multi-volley** (`volleys` > 1: `bone_ring_double`, `soul_storm`): for each subsequent volley k ≥ 2, draw the spoke-set at the volley-k angles (`+ (k−1)·volleyOffsetDeg`) for the **150 ms before it fires** (`volleyIntervalMs` 250 / 300 ≥ 150, so this always fits). No new decal fill is drawn, only the spokes, so the player sees the gap shift.

### 2.4 `spiral`: queen `spiral_spray` / `_4`, lich `spiral_hex` / `_5`
- **Opening:** `fx.cast_glyph` (hostile) appears at `core` and rotates in the spiral's direction (slot map). Queen **inflate**: scaleX pulses 1.0 ↔ 1.125 at 4 Hz (x only, each pulse ≤ 125 ms, transient per R4), plus bubbling particles (poison hue, 1 per 100 ms). Lich: 1 page mote per arm appears at r = 12.
- **Signal: spin-up.** `arms` motes (element hue, 3 px) on a circle r = body radius + 8. Their angles are the **actual first-shot angles** (`baseAngle + i·360/arms`). The circle rotates with angular speed `ω(p) = ω_fire · Quad.easeIn(p)`, where `ω_fire = rotateDegPerShot / intervalMs` (queen 11°/120 ms = 91.7°/s; lich 9°/100 ms = 90°/s), **in the spiral's rotation direction**. At lock the motes are at the fire angles and moving at firing speed.
- **Active** (`shotsPerArm × intervalMs`: queen 1 200 ms, lich 1 400 ms): the motes stay on as the emitter heads and keep rotating in lockstep with the shots. The emitter can't move (mechanic §9.3). Body ADD holds at 50 % of peak for the whole act ("still firing"). The last 200 ms of the act: the motes shrink 3 → 1 px (the spiral is ending, so the player can pre-plan).
- The answer ("rotate *with* the spiral") is literally drawn by the motes' rotation direction.

### 2.5 `charge`: brute `charge`, knight `charge`
- **Opening:** lowered stance: brute y +2 px (integer) with scaleX 1.125 **[tell-scale]** (16 → 18 px wide, exact; held for the windup, a braced, widened stance) · knight y +2 px (integer, R4). The body pulls back −2 px opposite the aim. Dust scuffs at the feet (2 particles per 150 ms, pawing).
- **Decal:** `rect-path` (WYSIWYH width, raycast length: brute ≤ 162 px, knight ≤ 208 px) tracking the aim until lock (mechanic §9.2 governs: aimed attacks track until `windupMs − 150`. The slot map's "locked at windup start" is superseded by the mechanic rule, since the Animator owns decal timing and the 2D Artist owns its look). **Chevrons** (`>` 3 px, every 16 px) scroll along the path toward the end at 60 px/s during signal, which gives the direction read. At lock the chevrons stop and the outline goes solid. **Wall-end marker:** if the raycast ends on a blocker, draw a 5 px "impact tick" (`✕`) at the end. This teaches "bait it into a wall for a stun" (pacing §4.4) without text.
- **Active** (`durationMs` 650 / 800): the move clip at `timeScale` 1.25, 2 speed-line afterimages per 100 ms (reuse the player afterimage pool, tint FILL `telegraph-rim` alpha 0.4 → 0 over 120 ms). The path decal empties from the enemy's end as it travels (length remaining = distance to path end).
- **End:** wall hit → `stunned` (wall variant): squash on the hit axis 0.75 for 83 ms, `traumaHeavyImpact` (feel, trauma² shake), dust burst, `heavy_impact` cue, dizzy stars for `wallStunMs`. No wall → normal `recover`.

### 2.6 `slam` at `self`: golem `stomp`
- **Opening:** rear up: y −3 px (integer offset, R4; no sustained scale). Pebble particles lift off the ground.
- **Decal:** circle r = `radius` 44 (heavy style) centred on the body, fill disc radius = R·p. In lock the outline double-lines.
- **Lock:** held at the top, tremble.
- **Active:** slam: y +2 px for 2 steps, squash (x) 1.125 for 83 ms, `traumaHeavyImpact` (feel, trauma² shake), a dust ring expanding to R over 200 ms (TelegraphLayer ring, alpha 0.6 → 0), plus `fx.explosion` hostile variant (ring at exactly R, `telegraph-rim`, 120 ms), then the rock ring (8 projectiles) fires on the same step, with a `ring` spoke flash for 1 step.

### 2.7 `slam` at `target`: queen `leap_slam` (and each step of `double_leap`)
- **Windup (600 ms)** (Mire Queen body radius is now **12**, fitting the ogre's 20 px content; the leap circle stays `radius` 48 because it is the attack radius, not the body): crouch: y +3 px, with scaleX 1.0625 **[tell-scale]** (1/16, x only) as the squash. At **windup step 0** the target circle appears at the **locked** target (mechanic §9.3: the position locks at windup start). Heavy style, r = 48.
- **Target circle fill spans `windupMs + travelMs` (1 500 ms total):** fill disc radius = R·(elapsed / (windup + travel)), Linear. It locks visually (double line) for the last 150 ms before landing. The circle is the whole tell, and it reads for 1.5 s (pacing §4.4 "leap shadow visible 1.5 s").
- **Airborne (`travelMs` 900):** the body follows a parabola from the origin to the target: sprite y-offset = −4·H·t·(1−t) with H = 40 px, t = elapsed / travel, x/y ground position lerped Linear. The shadow ellipse (22×5) moves along the ground Linear and scales 1.0 → 0.625 → 1.0 (quantized 1/8) with height. The body is untargetable: alpha 0.85 and no hit flash. Hits pass through (sim).
- **Landing (act):** squash x 1.125 for 83 ms, `traumaHeavyImpact` (feel, trauma² shake), dust ring to R, the projectile ring of 10 from the impact point, `heavy_impact` cue.
- **`double_leap`:** after `recover` = `gapMs` 300, step 2 repeats the whole grammar with a **new** target circle drawn at step-2 windup start (the second target locks then; pacing §5.2). The first circle is already gone after its release flash, so two circles never coexist ambiguously.

### 2.8 `hazard`: queen `acid_pools` (4, `player+random`, r 24), lich `fire_zones` (5, `cross` ±64, r 28)
- **Body:** queen: head bobs down 2 px on three evenly spaced beats across the signal ("spitting"). Lich: the staff is planted (overlay rotates to point down at the feet); rune dashes appear under the lich too.
- **Marks** appear at windup step 0 at their locked positions (mechanic §9.3). Each mark: pre-active circle r (WYSIWYH), `telegraph-fill` fill-over-time over `windupMs`. Lich marks add a `rune-ring` (4 dashes rotating 90°/s). Element particles rise inside (acid bubbles / embers, 1 per 150 ms per mark).
- **Activation (act):** each mark swaps to its **active pool** in 1 step: element-hue disc alpha 0.45 plus a surface-shimmer particle loop. `hazard_on` (proposed cue) plays once for the set.
- **Tick visibility:** every `tickMs` (800) the pool's outline flashes alpha 1.0 → 0.4 over 200 ms, **synchronised with the damage tick**, so the player learns the rhythm.
- **Ending:** the final 500 ms of `durationMs` blink the outline at 4 Hz (the pool still damages). At `durationMs` the sim stops damaging, and the pool then fades out over 200 ms while harmless (WYSIWYH: a fading pool is a dead pool, so the fade starts only after damage ends).

### 2.9 `summon`: necromancer `raise`, knight `raise_dead`, queen `brood`, lich `summon_wraiths`
- **Opening:** arms raised: the body stands tall, y −2 px (integer; no sustained scale, R4). Knight: the blade is **planted** (the overlay rotates to point down at the feet over the opening). Queen: belly heave, i.e. two scaleX 1.0625 pulses (each ≤ 120 ms, transient) across the signal.
- **Sigils at the spawn points** (slot map `boss_telegraph.summon`): one `fx.summon_sigil` per summon, at the positions on the `summonRingRadiusPx` 24 ring where the summons will appear. **Dev:** roll those positions at windup step 0 (ai stream) and reuse them at act (deterministic, no extra RNG draw). If `maxAlive` allows fewer at act, the surplus sigils fizzle (§1.5). The sigil fades in over the windup (α ∝ p) and rotates 120°/s. Its glyph shape, not its hue, separates it from damage decals. Lich adds 2 skull motes orbiting the head.
- **Active:** spawn portals open on the ring (normal `spawning` state for each summon). The sigil flashes once and is removed. If already at `maxAlive` the attack is skipped by the sim, and the sigil fizzles (§1.5) so the player sees the cast fail.

### 2.10 `blink`: wraith `wraith_blink`, lich `lich_blink`
- **Opening + signal:** stepped fade (slot map): alpha 1.0, then 0.5 from p = 0.5 (pixel-look steps, no smooth ramp). A dither shimmer offsets x ±1 px on alternate 2-step beats. Motes (4 per 100 ms) drift up from the body.
- **Lock:** collapse: scaleX 1 → 0.25 in quantized steps (1, 0.75, 0.5, 0.25) across the 9 lock steps at alpha 0.5 (the vanish itself; scaleY unchanged).
- **Active (instant):** `fx.blink_puff` at the origin **and** at the destination (slot map). The body is at alpha 0 on the release step and appears at the destination at alpha 0.5, scaleX 0.25 on the next step.
- **Recover (`recoverMs` 150 / 200) = reappear:** scaleX 0.25 → 1.0, alpha 0.5 → base (wraith 0.85), Back.easeOut (quantized), with motes converging on the destination. `blink_in` (proposed) cue. There is no damage, so the purpose is re-acquisition: the reappear is deliberately showy for its full recover window.

### 2.11 `self_destruct`: fire_imp `fuse`
- **Opening:** the imp stops and hunches (y +1 px). Ember sparks speed up.
- **Swell** **[tell-scale]**: scale 1.0 → 1.125 → 1.25 → 1.375 at p = 0.25 / 0.5 / lock start (stepped; 16 px → 18/20/22 px).
- **Strobe:** FILL `flash` for 1 step every period P, with P shrinking linearly from 12 steps (200 ms) to 4 steps (67 ms) across the windup. The whole lock window is steady FILL. This is a small-area flash (22 px sprite at ×3 = 66 px), far below the WCAG 2.3.1 general-flash area threshold. **Reduced motion:** no strobe; a steady ADD ramp to peak instead.
- **Decal:** circle r = `radius` 36 (WYSIWYH), fill-over-time.
- **Active:** explosion flipbook sized to r 36 (TA: BitingChaos 5-f scaled ×4 in *pixel steps*, or CodeManu `16_sunburn` decimated to 12 f @ 30 fps). `traumaExplosion` (feel, trauma² shake) (feel; r 36 < `bigExplosionRadiusPx` 40). `explode` cue. No corpse. `fx.explosion` hostile variant: its 1 px Graphics ring is drawn at exactly `radius` in `telegraph-rim` for 120 ms (TelegraphLayer), matching the decal it replaces (WYSIWYH).
- **Killed mid-fuse** (`explodeIfKilledDuringWindup`): skip to Active on the kill step, with the imp's death flash on the same step. Coins pop (§4). **Killed before the windup:** the normal small death (§4.1) plus an ember puff, no explosion.

### 2.12 Boss phase transitions and intro
State-owned: `state-graph-spec.md` §4 (`intro`, `phase-shift`). The shockwave ring shares the TelegraphLayer. Its knockback reads as a push, not damage, so the ring colour is `invuln` grey-white, **not** `telegraph-*`. The burst itself is `fx.phase_burst` from `core`.

---

## §3 Hit reactions

### 3.1 Hit-stop coordination (feel-spec owns the numbers; this is the composition)

| Event | Hit-stop (feel) | Visual during the stop | After the stop |
|---|---|---|---|
| Normal hit on an enemy | none | FILL flash (`enemyHitFlashMs`) and hit squash start on step 0 and run on the sim clock | knockback slide (physics) |
| Kill (rate-limited) | `killHitstopMs` 33, ≤ 1 per `killHitstopMinIntervalMs` | kill FILL held; puff spawns but is paused | puff plays, corpse collapse (§4) |
| Kill inside the rate-limit window | none | FILL 2 steps | same |
| Elite kill | `eliteKillHitstopMs` 90 (ignores the interval) | FILL held; the elite outline shatters and the gold ground ring collapses on resume (state-graph R10) | bigger puff |
| Boss phase change | `bossPhaseHitstopMs` 160 | FILL held on the boss | shockwave (§2.12) |
| Boss death | `bossDeathHitstopMs` **300** (motion-tunables; the single boss-kill key, v2) + `traumaBossKill` on the same step | FILL held | unravel (§4.4) |
| Mini-boss death (v2) | `miniBossDeathHitstopMs` 160 (motion-tunables) + `traumaBigExplosion` | FILL held | short unravel (§4.6) |
| Crit (v2, feel `critHitstopMs` 35, ≤ 1 per 300 ms) | 35 | FILL flash as a normal hit; the crit number (×2, yellow) spawns on step 0 | — (a kill stop on the same step wins) |
| Defence break (v2) | **none** (no global stop; feel owns hit-stop policy) | — | the broken enemy's own anims freeze for `defenceBreakFreezeMs` (local hitlag, §3.7) |
| Player hurt | `hurtHitstopMs` 90 | hit frame, white→red FILL | `traumaHurt` (feel), then the pose hold (`hurtPoseMs`) |
| Shield break | `shieldBreakHitstopMs` 60 | shield shatters (flipbook frame 0 held) | shards fly |

Per R3 the stop freezes physics, RunScene tweens, sprite anims and particle emitters together, which gives a true freeze-frame. Cues fire on step 0 and are not delayed. **Stacking:** a new hit-stop during an active one extends to `max(remaining, new)` and never sums (a chain-lightning multi-kill is one stop).

### 3.2 Enemy hit (per damage instance, step 0)
1. **Flash:** FILL `flash` for `enemyHitFlashMs` (feel), subject to R5: re-arm after `hitFlashRearmMs` (max duty 60 %), and suppressed during the windup lock window (priority 4 wins; the decal carries the hit read instead via a 1-step outline brighten).
2. **Squash** (non-boss, non-frozen): along the shot heading, scale 1.125 on the heading axis / 0.875 on the other for `hitSquashMs`, then rest. It uses the same re-arm as the flash, so a stream of hits doesn't keep the sprite permanently squashed.
3. **Particles:** `hitParticles` × element hue at the impact point, life `hitParticleLifeMs` (feel), fx stream. Cap 8 per enemy per step.
4. **Knockback:** physics impulse (mechanic §8.1). The motion layer adds nothing (no double-displacement).
5. **Damage number:** motion-spec `world-damage-number`.
6. **Status applied:** status overlay spawns with a 1-step pop (pip scale 1 → 1.5 → 1, stepped). Burn: 2 flame pips flickering at `head`. Poison: drip pips, one per stack up to 3, plus a digit for higher stacks (UX). Shock/vulnerable: 3 yellow spark motes orbiting `core`. Chill: 1–2 frost motes plus the R5 chill tint.
7. **Reactions** (the "aha", mechanic §8.3): a one-shot burst at `core`, distinct per reaction, 250–350 ms. Melt: white steam puff rising. Overload: the sim explosion plus a yellow-orange ring. Blight: green→orange pop. Superconduct: a cyan-yellow ring pulsing out to `chillRadius`. Quench: a grey smoke curl. Each also fires the `reaction` cue. First-time reactions add a codex toast (UX).

### 3.3 Boss hit
Flash as in 3.2 (same re-arm, same lock suppression). **No squash.** Instead, a **1 px recoil** of the sprite (visual only) along the shot heading for 1 step, rate-limited by the same re-arm. Particles as 3.2. `phase-shift` / `intro` hits: grey "clink" spark (2 particles), no flash, no number (invulnerability read).

### 3.4 Invulnerable and inert targets
`spawning` enemies: clink, as for bosses. Frozen enemies: flash (priority 2) outranks frozen (priority 3) in R5, so frozen enemies **do** flash white on hit. The ice shell gets a 1-step crack glint.

### 3.5 Player hurt, shield, revive
Owned by `state-graph-spec.md` §2.2 (`hurt`, `dead`, revive variant) and §2.4 (flicker, shield).

### 3.6 Breakables (crates, `rules.enemies.crateHp` 6)
Hit: ±1 px x shake for 2 steps plus a FILL flash of 2 steps. Break: 6 splinter particles (wood hue), a 2-frame debris flipbook if mapped (else particles only), coin pop if one drops (§4 coin). Cue `crate_break` (proposed).

---

## §4 Deaths

All deaths run in the visual-only `dying` state (the sim entity is already dead and non-colliding). Death step 0 = the kill step.

### 4.1 Ground enemy (class A/B, and D ground)
1. Step 0: FILL white held through the kill hit-stop (or 2 steps if rate-limited). `kill` cue (or `elite_kill`).
2. Puff: `deathPuffParticles` (feel), half dust/bone neutral, half the killing element's hue.
3. Corpse collapse: scaleY 1 → 0.5 in quantized steps (0.875, 0.75, 0.625, 0.5) over `corpseCollapseMs`, anchored at the feet. Tint MULTIPLY `#606060`. It keeps sliding on its residual knockback velocity (knockbackDecay).
4. Fade: alpha 1 → 0 over `corpseFadeMs` (feel), Quad.easeIn, then `death-visual-complete` → pool.
5. Coins pop on step 0 after the hit-stop (motion-spec `world-coin-pop`).

### 4.2 Flyers
- **Bat, skull:** they fall. The sprite's hover offset goes 6 → 0 px over 150 ms, Quad.easeIn. On touchdown a 1 px bounce (1 step), then the corpse collapse and fade (4.1 steps 3–4). Wing clip stops on f0.
- **Skull chain death** (`summonsDieWithSummoner`): the sim kills all skulls on the necromancer's kill step. Visually they die **staggered 60 ms apart in order of distance to the necromancer** (≤ 4 skulls = 240 ms), each sending a violet soul mote to the necromancer's corpse over 200 ms. They are sim-dead immediately (no contact, no hits during the stagger).
- **Wraith:** dissolves upward, with no corpse: alpha Stepped(4) → 0 over 300 ms, the sprite rising 4 px, and 8 motes drifting up.

### 4.3 Specials
- **Slime → 2 slimelets:** the slime pops (squash x 1.25 / y 0.75 for 83 ms), then slimelets appear at parent ± 4 px perpendicular to the kill heading. Each gets a **visual hop** (sprite y-offset arc 6 px over 200 ms, Quad.easeOut up / Quad.easeIn down). *Proposal to the dev:* a knockback impulse 80 px/s outward (decays at `knockbackDecay`) so they don't stack. They are live at once (no portal; mechanic §9 `onDeath` doesn't make them inert). The parent leaves a goo splat decal that fades over `corpseFadeMs`. No corpse.
- **Imp:** §2.11 (detonate variants).
- **Elite** (×1.0 scale, gold outline + gold ground ring, state-graph R10): `eliteKillHitstopMs`. The baked gold outline shatters into 6 `elite-gold` fragments, the ground ring collapses to 0 width over `corpseCollapseMs`, and the puff is × 1.5.
- **Stone golem:** 12-particle rubble puff and a 2-step 1 px drop; the corpse collapses to 0.5 as 4.1. No extra shake (feel-spec reserves `heavyImpact*` for stomp, slam and wall hits).
- **Necromancer:** 4.1, plus the incoming skull souls (4.2).

### 4.4 Boss death (floors 1–3)
Total ≈ 300 + 1 400 + 300 = **2.0 s** from the killing blow to the rewards/room-clear beat.
1. Step 0: `bossDeathHitstopMs` (motion-tunables, **300 ms** in v2) with `traumaBossKill` on the same step (feel; the shake starts when the stop ends). FILL white held. `boss_death` cue. The sim kills every other enemy (mechanic §10): they run §4.1 staggered 40 ms by distance from the boss, and enemy projectiles pop and clear (1 step each).
2. **Unravel** (`bossDeathUnravelMs` 1 400): the anim is frozen on the current frame. x jitter ±1 px at `stunJitterHz`. Every `bossDeathBurstIntervalMs` a small explosion flipbook (BitingChaos 5 f) plays at a random point inside the body bbox (fx stream), with a 1-step FILL strobe of the sprite synced to each burst (5 Hz on a ~96×108 screen-px region, far below the WCAG general-flash area; reduced motion: no strobe). Knight: the blade overlay drops and clatters. Lich: the staff overlay shatters.
3. **Final burst:** big explosion (CodeManu `12_nebula` / `16_sunburn` decimated) at `core`. `traumaBigExplosion` (feel). The sprite dissolves (alpha Stepped(4) over 300 ms). A soul column particle rises (lich only; it is the final boss).
4. Then: reward pedestal rise (motion-spec `world-reward-rise`) and the room-clear stinger. On floor 3, instead of the reward: a 600 ms hold, then `screen-root-fade` to run-end {victory}.

### 4.5 Player death
`state-graph-spec.md` §2.2 `dead`: hurt stop 90 → fall 300 → dissolve 400 → hold 700 → fade to run-end. Total ≈ 1.5 s before the fade: long enough to register *what killed you*, short enough not to punish the retry loop (pacing §4.3: ≈ 20 s to re-enter).

---

## §5 Reduced motion (R8 applied to combat)
Kept: every decal, lock outline, aim tick, spoke set, spiral mote, hazard tick flash, damage numbers, hit particles and afterimages (accessibility §4.1). Hit flash is scaled by `flashIntensity` (R8). Removed: jitter, squash/stretch pulses, the imp and boss strobes (replaced by a steady tint), and all shakes (feel §0). Shortened: the boss unravel to 700 ms. No motion in this document produces a full-screen flash (accessibility §4.3). The largest flash is the boss death burst: sprite-local, ≈ 64 px radius.

## §6 Craft self-verification (Wave 5; I1-compatible, no automated tests)
1. **Silhouette test:** screenshot every attack at lock step 0 with a black-fill sprite shader off (tints cleared) and decals hidden. Each attack family must differ from idle by step 2 of the windup (offset, overlay or scale). Row by row against §2.
2. **Frame-step:** with `?debug` frame-stepping, confirm the decal reaches full fill on step W−1, the lock outline appears on step W−9, and release is on step W, including one chilled enemy (stretched) and one windup interrupted by a kill hit-stop.
3. **WYSIWYH:** stand the player's core 1 px inside and 1 px outside each decal edge at release. Hit and miss must match the drawing.
4. **Draw calls:** a room with 8 simultaneous windups adds exactly one draw call (TelegraphLayer).

---

## §7 v2 additions (Wave A2). Sub-sections are numbered into the sections they extend

Sources: `design-v2.md` §4/§6/§7, `mechanic-spec.md` §9.6–9.7/§10.1–10.2, `data/enemies.json` (`tomb_sentinel`, `lantern_acolyte`, defences), `data/bosses.json` (3 minis; `shield_wall`, `veil`, `mirror_volley`, heat attacks), `data/affixes.json`, `rules.defences`, `rules.heat`. Proposed colour tokens `defence-shield` / `defence-armour` / `defence-ward` are defined in `state-graph-spec.md` §8 (they mirror `affixes.json` `outline.bone / .steel / .cyan`; the 2D Artist's `style-guide.md` names win). Shakes use feel-spec **trauma** rows (`traumaExplosion`, `traumaBigExplosion`, `traumaHeavyImpact`, `traumaHurt`, `traumaBossPhase`, `traumaBossKill`); the retired px/ms shake rows are no longer referenced anywhere in `specs/motion/`.

### 0.2 Reaction-time budget, v2 attacks

Worst case = Heat 5 `windupMult` 0.9 (floors hold: 350 normal / 450 boss-tier incl. minis / 600 damage-2; the Archlich P3 compounds to ×0.81, still floored).

| Actor | Attack | Type | Dmg | windup ms | W | lock | recover ms | Heat 5 ms (W) | First seen | Verdict |
|---|---|---|---|---|---|---|---|---|---|---|
| tomb_sentinel | `spear_thrust` | melee_swipe (40°, r 32) | 1 | 600 | 36 | 27 | 500 | 540 (32) | F1 step 3 (shield threat) | ✔ ≥ 500 first-intro |
| lantern_acolyte | `kindle_ward` | ward_allies (3 allies, r 150) | 0 | 800 | 48 | 39 | 400 | 720 (43) | F2 | ✔ (no damage) |
| grave_warden | `shield_bash` | charge 220 × 500 ms | 1 | 800 | 48 | 39 | 400 | 720 (43) | F1 mini | ✔ |
| grave_warden | `bone_toss` | shoot 3 × 30° | 1 | 600 | 36 | 27 | 400 | 540 (32) | F1 mini | ✔ |
| grave_warden | `raise_sentinel` | summon 1 | 0 | 900 | 54 | 45 | 400 | 810 (49) | F1 mini P2 | ✔ |
| lantern_matron | `lantern_ring` | ring 12 | 1 | 650 | 39 | 30 | 400 | 585 (35) | F2 mini | ✔ |
| lantern_matron | `kindle_choir` | ward_allies (3, r 160) | 0 | 800 | 48 | 39 | 400 | 720 (43) | F2 mini | ✔ |
| lantern_matron | `call_acolytes` | summon 2 | 0 | 900 | 54 | 45 | 400 | 810 (49) | F2 mini | ✔ |
| lantern_matron | `ember_fan` | shoot 5 × 50° | 1 | 550 | 33 | 24 | 400 | 495 (30) | F2 mini | ✔ trained (shoot) |
| iron_colossus | `quake` | slam self r 52 | **2** | 900 | 54 | 45 | 700 | 810 (49) | F3 mini | ✔ |
| iron_colossus | `rock_volley` | shoot 3 × 20° | 1 | 600 | 36 | 27 | 400 | 540 (32) | F3 mini | ✔ |
| iron_colossus | `iron_charge` | charge 230 × 700 ms | **2** | 950 | 57 | 48 | 300 | 855 (51) | F3 mini | ✔ |
| ossuary_knight | `shield_wall` | **guard** 3 000 ms | 0 | 600 | 36 | 27 | 300 | 540 (32) | F1 boss (adapt P1 / always P2) | ✔ (no damage) |
| ossuary_knight | `bone_rain` | hazard 6 × r 20, 1 200 ms | 1 | 1000 | 60 | 51 | 300 | 900 (54) | Heat 4+ | ✔ |
| mire_queen | `veil` | ward_allies **self**, 5 hits | 0 | 700 | 42 | 33 | 300 | 630 (38) | F2 boss (adapt P1 / always P2) | ✔ |
| mire_queen | `bog_surge` | ring 18 × 2, 350 ms apart | 1 | 800 | 48 | 39 | 500 | 720 (43) | Heat 4+ | ✔ (volley-2 preview fits: 350 ≥ 150) |
| archlich | `mirror_volley` | **mirror** 3–9 shots, 8°/shot | 1 | 650 | 39 | 30 | 400 | 585; P3 527 (32) | F3 boss (always) | ✔ |
| archlich | `grand_spiral` | spiral 6 × 12, 110 ms | 1 | 900 | 54 | 45 | 500 | 810; P3 729 (44) | Heat 4+ | ✔ |
| elite affix `volatile` | death ring 8 @ 80 px/s | ring (post-death) | 1 | **450** (`delayMs`) | 27 | 18 | — | 450 (not scaled) | first volatile elite | 450 < 500 first-intro → **compensated in motion** (§2.16), as the skeleton swipe was (§0.1) |

**No v2 windup needs an objection.** The minimum is 495 ms (Matron `ember_fan` at Heat 5), a trained read. `hasted` doesn't touch windups (`windupMult` 1.0).

### 2.13 `guard` (Knight `shield_wall`)

Guard is **not a danger**, so it uses no `telegraph-fill` or `telegraph-rim`. It tells the player *where not to shoot*.
- **Windup (600 ms):** the blade overlay swings to horizontal across the front (angle = facing ± 90°) over the opening. The boss shield plate (`defence_shield_boss`) materializes in front: alpha steps 0 → 0.33 → 0.66 → 1 at p = 0.25/0.5/0.75 (Stepped; pixel look). `fx.cast_glyph` in `defence-shield`.
- **Lock:** the plate is solid, with a 1-step `flash` glint on it.
- **Act → guard (`durationMs` 3 000 = 180 steps):** `enemy-defence` → `guard` (`state-graph-spec.md` §8.1). A **front-arc rim**: a 1 px `defence-shield` arc at r = radius + 6, spanning `frontArcDeg` 150 centred on facing, **dashed** (the non-colour "guard, not danger" read: telegraph rims are dashed-then-solid, guard arcs stay dashed), and it rotates with facing.
- **End:** the final `guardEndBlinkMs` blinks the arc at 4 Hz, then the plate dissolves (Stepped alpha 3 over 150 ms).
- **Broken by pierce:** §3.7 shield break at boss scale.

### 2.14 `ward_allies` (acolyte `kindle_ward`, Matron `kindle_choir`, Queen `veil` self)

Also non-damaging, so it uses `defence-ward` colours, never `telegraph-*`.
- **Opening:** acolyte and Matron raise the lantern (y −2 px), and the lantern glow (ADD `defence-ward`) grows from 2 to 5 px with p. Queen `veil`: she hunches (y +2 px), and 5 motes appear at r = 40 around her.
- **Targets:** the dev picks recipients at **windup step 0** (ai stream; the same rule as summon sigils) and reuses them at act. **Tether preview:** a dashed 1 px `defence-ward` line from the caster to each recipient, α ∝ p, following both bodies.
- **Lock:** tethers go solid. The recipients' outlines get a 1-step `defence-ward` flash on the overlay layer (never the body tint).
- **Act:** one mote per tether travels caster → ally over 200 ms (Cubic.easeIn), and on arrival the ally's `enemy-defence` → `warded` (motes re-form one per `wardRegrowStepMs`). `veil`: the 5 motes spiral inward to r = 16 over 200 ms and become the Queen's ward ring. Cue `ward_raise` at act.
- **Reading it as a player:** "kill the lantern first" is legible because the tethers point at the source for the whole windup (puzzle room *Choir of Wards*' second answer).
- Interrupted (shock stun on the caster): tethers snap (fizzle §1.5) and no ward is granted.

### 2.15 `mirror` (Archlich `mirror_volley`)

The shot count `n` = the player's max shots per cast (3–9), read at windup start. **The tell shows the count, which is the point**: "it answers in kind".
- **Opening:** the staff is raised (as `arcane_volley`). The glyph ring shows **exactly `n` dots** at r = 14 (instead of 8), so the player sees their own number coming back.
- **Signal:** boss aim lines (§2.2 boss rule): `n` 1 px `telegraph-rim` lines, 48 px, spread = `n × spreadPerShotDeg`, tracking until lock.
- **Lock / act:** as shoot. At release a 1-step ghost of the **player's held-wand sprite** flashes at the lich's `hand` (the "mirror" read, 1 step, `flash` FILL). This is a sprite-local flash.
- Adapt announcement: the intro card's adapt line (`state-graph-spec.md` §8.4).

### 2.16 `volatile` affix death ring (450 ms, compensated)

On the volatile elite's death step, the corpse **does not collapse**. It holds for `delayMs` 450:
- Step 0: the 8 spoke directions are drawn at once (`spoke-set`, `telegraph-rim`, r0 = body + 3, r1 = +6). This is the spatial read from step 0, the compensation for 450 < 500 first-intro.
- The corpse strobes FILL `flash` on a period that shrinks from 8 steps to 3 (the imp grammar, §2.11). The `volatile` outline token (ember) goes solid, and `volatile_arm` (proposed) plays at step 0 (the audio lead).
- At 450 ms: the ring fires, `fx.explosion` hostile small, `traumaExplosion`. Then the normal corpse collapse and fade (§4.1).
- Reduced motion: no strobe; the spokes and a steady tint remain.

### 2.17 v2 per-attack tells (mini-bosses, new enemy attacks, heat attacks)

Base grammar per type as §2.1–2.16. Mini-bosses are boss-tier, so they use the boss channels (48 px aim lines for shoot, ring circle + cast glyph, per §2.2/§2.3).

| Actor | Attack | Tell specifics |
|---|---|---|
| tomb_sentinel | `spear_thrust` | A **narrow wedge** (40°, r 32 WYSIWYH). The shield plate pulls back 2 px to *open*, revealing the spear. That half-second of opening is the moment it can be flanked. Act: 2-step lunge +3 px; `fx.enemy_slash` ×1 rotated as a thrust (stretched along the aim, no arc sweep). |
| grave_warden | `shield_bash` | Charge grammar (§2.5) with the **plate leading**: the plate overlay offsets +2 px toward the aim during the lock. Rect-path width = 2 × (10 + hurtbox). Wall hit → dizzy (`wallStunMs` 900) and the plate drops 1 px (a flank window). |
| grave_warden | `bone_toss` | Shoot, boss channels; 3 aim lines. The free arm (the body side opposite the plate) rises 1 px. |
| grave_warden | `raise_sentinel` | Summon, with the sigil at the one spawn point. In P2 the regrown shield already shows (§8.3). |
| lantern_matron | `lantern_ring` | Ring 12: the lantern pulses with each body pulse, plus the r 24 circle + fire-hue spokes at lock. |
| lantern_matron | `kindle_choir` | §2.14 with up to 3 tethers (r 160). |
| lantern_matron | `call_acolytes` | Summon: 2 sigils; the lantern held high (−2 px). |
| lantern_matron | `ember_fan` | Shoot 5 × 50°, boss aim lines, ember glow at `hand`. |
| iron_colossus | `quake` | Slam self, **heavy** (2 px rim, r 52). Rear-up y −3 px (the armour plates rattle: ±1 px per plate, alternating, during the signal). Act: `traumaHeavyImpact`, dust ring, 10-ring. |
| iron_colossus | `rock_volley` | Shoot 3 × 20°, boss aim lines; pebbles orbit the fist at `hand`. |
| iron_colossus | `iron_charge` | Charge, **heavy** (2 px rim path, ≤ 230 × 0.7 = 161 px, raycast-clipped). Lowered stance y +2 px. Wall → `traumaHeavyImpact` + dizzy 1 300 ms. |
| ossuary_knight | `shield_wall` | §2.13. |
| ossuary_knight | `bone_rain` (Heat 4+) | Hazard ×6 r 20 (`player+random`), fill over 1 000 ms. **Activation read:** in the last 150 ms (lock) a bone sprite falls into each mark (y-offset −40 → 0, Quad.easeIn, landing on the activation step). Active 1 200 ms = one tick window (`tickMs` = `durationMs`), then it ends with the standard blink and fade. |
| mire_queen | `veil` | §2.14 self variant (5 motes). |
| mire_queen | `bog_surge` (Heat 4+) | Ring 18 × 2 volleys; volley-2 spokes preview 150 ms before (fits the 350 ms gap). The Queen's belly heaves on each volley. |
| archlich | `mirror_volley` | §2.15. |
| archlich | `grand_spiral` (Heat 4+) | Spiral grammar (§2.4), 6 motes. ω_fire = 8°/110 ms = 72.7°/s. The act lasts 1 320 ms (79 steps), and the motes shrink in the last 200 ms. |

### 3.7 Defence reads (block · wear · break · clang · chip · absorb · strip · regrow)

Principle: **a defended hit must look different from a damaging hit at a glance**, because that difference is the whole v2 lesson ("your wand is the answer"). Blocks and absorbs never use the white body flash (R5 2a). They play on the **defence overlay**, and they are throttled per enemy by `defenceReadCooldownMs` (break and strip are never throttled).

| Event (`EV.DEFENCE`) | Visual (step 0 unless noted) | Cue (Audio Director; throttled on their side too) |
|---|---|---|
| **Shield `block`** | The plate flashes `flash` for 1 step. The whole actor recoils `defenceRecoilPx` along the shot heading (pushed away from the shooter) for 2 steps, a visual-only offset (the body takes no knockback). 2 bone-coloured sparks glance off the plate edge *tangentially* (they deflect, they don't burst). The UX "BLOCKED" word replaces the number. No body flash, no squash. | `shield_block` |
| **Shield `wear` stage** (at ⌈wearBlocks/3⌉ and ⌈2·wearBlocks/3⌉ blocks) | The plate's frame advances a crack (`defence_shield_f1/f2`), a 1-step `flash`, and 1 chip falls. | `shield_wear` |
| **Shield `break`** (pierce, or wear reached) | The plate bursts into `defenceBreakShards` bone shards that fly *away from the shot* (Quad.easeOut, 250 ms, fade). The actor's anims freeze for `defenceBreakFreezeMs` (local hitlag only, no global stop). The damage number for the breaking hit shows "BROKEN" + icon (UX). The pierce hit lands normally on the same step (normal flash follows). | `shield_shatter` |
| **Armour `reduce`** (a hit into the bar) | R5 2a: FILL `defence-armour` for 1 step (a steel "clang" instead of white). `armourChipParticles` grey chips. No squash (armour doesn't flinch). The plate frame re-derives from the bar fraction (intact > 66 / dented > 33 / cracked > 0 %). A **blast** hit into armour adds a 2-step plate rattle (±1 px) and 2× chips: the right answer feels heavier. | `armour_clang_chip` / `armour_clang_blast` |
| **Armour `break`** (bar reaches 0) | The plates burst (`defenceBreakShards` steel shards), `defenceBreakFreezeMs` anim freeze. Overflow damage lands with the normal white flash on the same step. | `armour_break` |
| **Ward `absorb`** | The **nearest orbiting mote to the shot pops**: it scales 1 → 2 px ring and fades over `wardPopMs` (a small cyan ring expanding from the mote). The remaining motes re-space evenly over 100 ms. No body flash. "WARDED" word (UX). DoT ticks swallowed without consuming a charge show nothing (no spam). | `ward_pop` |
| **Ward `strip`** (shock) | **All motes burst at once** outward (6 cyan sparks each, max 18), a 1-step jagged `shock`-hue arc crackles from the hit point to `core`, and **the hit lands** (normal white flash on the same step, then the damage number). The anims freeze for `defenceBreakFreezeMs`. | `ward_break` |
| **Ward `regrow`** (warded elite after 7 s, boss/mini phase `regrowDefence`) | Motes re-form one per `wardRegrowStepMs`, each spiralling in from r + 10. | `ward_raise` |
| **Defence `grant`** (`ward_allies`) | §2.14 arrival. | `ward_raise` |
| **Shield / armour `regrow`** (Warden / Colossus P2) | The plate rebuilds bottom-up in 3 alpha steps over 300 ms, inside `phase-shift`'s invulnerable window. | (`boss_phase` covers it) |

**First-block moment** (UX P12 tip): the first block of each type per profile gets the normal read above. The tip is UX's and never pauses the game. The Animator adds nothing extra, so the read the tip describes is exactly the one the player just saw.

**Reduced motion:** keep every word, icon, plate frame and mote count (information). Drop the recoil, rattle and jitter. Cap burst particles at 3. The anim-freeze stays (it isn't motion).

### 3.8 Elite affix reads

`state-graph-spec.md` §8.2 owns the outline-overlay pulse. Combat-side: on the **first player hit** on an elite, the affix title (UX, 1.5 s) appears and the outline overlay holds at α 1 for 600 ms (the "this is what you're fighting" beat), then resumes pulsing. `armoured` / `warded` / `shielded` affixes *are* defences, so they also run §3.7.

### 4.6 Mini-boss death (v2)

`miniBossDeathHitstopMs` 160 + `traumaBigExplosion` → unravel `miniBossDeathUnravelMs` 700 (3 bursts at `bossDeathBurstIntervalMs`, jitter as §4.4) → a medium burst (expl16 ×3, not the nebula) and the sprite dissolves (Stepped 3, 200 ms). The defence overlay falls with the body (no break read). Summoned sentinels and acolytes die with the §4.1 stagger. Then the reward rise and `world-door-open` for step 5. Total ≈ **1.1 s**, deliberately shorter than a boss (2.0 s): minis are mid-floor beats.
