# Spellwright — sim contract (Wave 4 build)

**Owner:** Game Developer (lead). This is the interface between the core sim (lead) and the **enemy/boss/telegraph module** (enemy developer). Both sides implement exactly these names. All gameplay runs inside RunScene's fixed 60 Hz `worldstep` handler (architecture §4). Time inside the sim is **ms** as the designer's data states it (mechanic-spec §0). Each step advances `ctx.time.ms` by `DT_MS = 1000/60`.

## 0. Ownership

| Lead | Enemy developer |
|---|---|
| `src/scenes/RunScene.js`, `src/sim/{World,Player,Caster,Shots,Combat,Effects,Zones,Pickups,Fx,Camera,Relics,SpatialHash}.js`, `src/run/*`, `src/spells/*` | `src/sim/enemies/*` (new folder): `EnemySystem.js` (spawn, step, pools, separation, contact damage), `movement.js` (chaser/kiter/swarm/stationary/drifter), `attacks.js` (every §9.3 attack type), `bosses.js` (phases, patterns, intro, death), `FlowField.js`, `TelegraphLayer.js`, `EnemyView.js` (sprites + state-graph projection + status overlays + deaths) |

## 1. `ctx`, built once per run by RunScene and passed to every system

```js
ctx = {
  scene, run /*RunState*/, cat /*catalogue*/, rules: cat.rules, T /*T(key) feel+motion tunables*/,
  bus, mixer /*mixer.fire(cueId)*/, rng: run.rng /* .ai .fx .run .loot .spell */,
  time: { ms, step, dt: DT_MS },          // sim clock (frozen by hit-stop: the whole run scene pauses)
  floor: { index, hpMult, enemyProjSpeedMult, coinMult, def },   // current floors.json record
  curse: run.curse || null,               // { enemyHpMult, windupMult, eliteExtraBudget, ... }
  world,        // sim/World.js for the current room (replaced per room)
  player,       // sim/Player.js
  enemies,      // sim/enemies/EnemySystem.js
  shots,        // sim/Shots.js
  combat,       // sim/Combat.js
  fx,           // sim/Fx.js
  cam,          // sim/Camera.js
  flags: { reducedMotion, lethalOccurred, victory },
}
```

## 2. What the lead provides (call these)

### `ctx.world` (sim/World.js)
`cols rows w h`, `blocksShots(x,y)`, `blocksGround(x,y)`, `raycast(x0,y0,x1,y1, 'all'|'ground') → distance`, `hasLos(x0,y0,x1,y1)` (walls/pillars/crates block; pits don't), `nearestWalkable(x,y,rTiles)`, `randomWalkable(rng, {flyer, from, minDist, maxDist, wallClear})`, `markers {player, spawns[], pedestals[], boss, doors[]}`, `solidAll`/`solidGround` (Uint8Array, row-major, 1 = blocked), `layerAll` / `layerGround` (Arcade collision layers: ground units collide with `layerGround`, flyers with `layerAll`), `cellAt(x,y)`.

### `ctx.player` (sim/Player.js)
`x y` (body centre) · `feetX feetY` · `coreX coreY` (hurtbox centre, R7) · `r` (body radius) · `hurtR` (feel `playerHurtboxRadius`) · `alive` · `vx vy` · `isDashing` · `isAirborne` (always false) · `canBeHit()` (false during dash i-frames and hurt i-frames) · `hurt(damage, source)`, where source is `{kind:'contact'|'melee'|'shot'|'slam'|'hazard'|'explosion'|'charge', enemyId}` → returns `true` if it landed (the lead runs the whole mechanic-spec §2 hurt resolution: i-frames, shield, HP, lethal/revive, knockback, hit-stop, shake) · `knock(ix, iy)` (radial knockback impulse, px/s, no damage; boss phase shockwave) · `applySlow(ms)` (playerSlow, frost shots).

### `ctx.shots` (sim/Shots.js)
- `enemyBullet({x, y, angleDeg, speed, radius, element, lifetimeMs, damage, ownerUid})`. Floor `enemyProjSpeedMult` is applied **by the caller** (you). Walls, pillars and crates stop it; pits don't. It hits the player hurtbox (circle vs circle). A `frost` element applies playerSlow. It draws at depth 62 with the hostile style.
- `clearEnemyBullets({pop:true})` (boss phase change and death).
- `enemyBulletCount`.

### `ctx.combat` (sim/Combat.js)
- `damageEnemy(e, amount, opts)`: the lead's §8.1 pipeline. You call it **only** for enemy-sourced damage to other enemies (`self_destruct.enemyDamage × floor.hpMult`); player damage reaches enemies through Shots and Effects automatically. `opts = {element:null, source:'enemy', canCrit:false, canReact:false, canStatus:false, knock:null}`.
- `onEnemyKilled` is called by **you** (see §3 `kill()`).
- Status query and edit (the lead owns status state; you read it for AI): `e.status` fields: `burnMs, chillStacks, chillMs, frozenMs, freezeImmuneMs, stunMs, stunImmuneMs, vulnerableMs, poisonStacks, poisonMs`, plus helpers `combat.isFrozen(e)`, `combat.isStunned(e)`, `combat.slowFactor(e)` → speed multiplier in (0,1] (chill −20% per stack; boss cap `rules.status.boss.slowCap`), `combat.windupRate(e)` → progress rate multiplier (= slowFactor; windups and cooldowns stretch ×1/(1−slow), mechanic-spec §8.2).
- Interrupts: when shock stuns or freeze starts, Combat calls **your** `e.ai.onInterrupt(reason:'stun'|'freeze')`. You cancel the windup (cooldown restarts at `cooldownMs × rules.status.shock.interruptCooldownFrac`) and fizzle the telegraph (telegraphs.md §1.5).

### `ctx.fx` (sim/Fx.js)
`shake(px, ms)` (the lead applies the settings scale, reduced motion and the `shakeMaxPx` clamp) · `hitstop(ms)` · `particles(kind, x, y, n, {color, speed, lifeMs, gravity})` (kinds: `dust, spark, ember, mote, smoke, shard, bubble, soul`) · `ring(x, y, r, {color, ms, width, hostile})` (expanding or static outline) · `explosion(x, y, r, {hostile, element})` (fx.explosion: flash + flipbook + a 1 px ring at the exact radius) · `flipbook(fxId, x, y, {depth, rotation, scale, onDone})` (art-slot-map `fx.*` ids; falls back to a ring) · `afterimage(sprite, {tint, alpha, fadeMs})` · `largeFlash(areaPx)` → boolean (global 3-per-second limiter, accessibility-spec §4.3; ask before any flash > 1000 px²).

### `ctx.cam` (sim/Camera.js)
`inView(x, y, insetPx)` → boolean (the `attackRequiresOnScreen` gate uses `rules.enemies.onScreenInsetPx`) · `view` `{x, y, w, h}` · `panTo(x, y, ms)` and `release()` (boss intro pan, feel `bossIntroPanMs`; under reduced motion the lead does the fade-cut).

### Tunables and randomness
`ctx.T('telegraphOpeningMs')` etc. Motion tunables are parsed from `state-graph-spec.md` §1 by the same reader. **Every motion tunable in the enemy/boss domain must be read by your code**: `enemyIdleFps enemyRunFps flyerFlapFps flyerBobPx flyerBobPeriodMs spawnEmergeMs telegraphOpeningMs telegraphJitterPx decalFillAlphaSignal decalFillAlphaLock releaseStretchMs hitSquashMs hitFlashRearmMs corpseCollapseMs stunJitterHz dizzyOrbitPeriodMs bossDeathHitstopMs bossDeathUnravelMs bossDeathBurstIntervalMs bossPhaseShockwaveMs bossPhaseShockwaveRadiusPx bossRisePx facingDeadband`, plus feel `enemyHitFlashMs deathPuffParticles corpseFadeMs heavyImpactShakePx heavyImpactShakeMs explosionShakePx explosionShakeMs bossPhaseHitstopMs eliteKillHitstopMs bossIntroPanMs knockbackDecay`. The AI uses **only** `ctx.rng.ai` (gameplay) and `ctx.rng.fx` (cosmetics). No `Math.random`.

## 3. What the enemy developer provides (`ctx.enemies`, sim/enemies/EnemySystem.js)

```js
class EnemySystem {
  constructor(ctx)
  spawn(defId, x, y, opts)   // opts: { elite:false, boss:false, summoner:null, portal:true (spawnPortalMs inert+invuln), noCoins:false }
                             // HP = def.hp × floor.hpMult × (curse?.enemyHpMult||1) × (elite? rules.enemies.elite.hpMult : 1); bosses: absolute hp × curse only
  spawnBoss(bossId, x, y)    // intro (bossActivateDelayMs), emits EV.BOSS_START / BOSS_HP / BOSS_PHASE / BOSS_DEAD
  step(dtMs)                 // AI, movement velocities, attacks, contact damage (via player.hurt), separation, status-driven stun/freeze behaviour
  render(dtMs)               // views: sprites follow bodies, state-graph projection, telegraphs (TelegraphLayer redraw once per step), overlays
  get live()                 // array of alive Enemy objects (read-only; stable object identities)
  aliveCount()               // counts summons too (wave triggers and clears count them)
  forEachAlive(fn)
  queryCircle(x, y, r, fn)   // every alive, hittable enemy whose circle overlaps (used by explode/zone/zap/pull)
  nearest(x, y, range, exclude /*Set of uid*/)  // homing, chain, relic spawn_spell aim
  kill(e, cause)             // death: removes from live, calls ctx.combat.onEnemyKilled(e, cause) once, spawns onDeath (slime → slimelets), summons die with their summoner
  killAll(cause)             // boss death / room clear cleanup (no coins for 'cleanup')
  clear()                    // room unload
  destroy()
}
```

**Identity rule (enemy developer objection, accepted):** Enemy objects are fresh per spawn, so a held reference (homing target, boss watch) never changes identity. `live` may still hold a corpse until the enemy system's next step, so every consumer checks `e.alive` before use.

**Enemy object (fields the lead reads and writes):** `uid, id (data id), def, x, y (body centre), r, feetY, flying, alive, hittable (false while spawning, airborne, or during boss intro/phase-shift invulnerability), hp, maxHp, elite, isBoss, kbResist (elite +0.3, cap 1), immune: Set, status {…} (owned by Combat; initialise with combat.newStatus()), kbVx, kbVy (knockback channel; you integrate it and decay it at feel knockbackDecay; immovable when mid-charge, kbResist 1 or a turret), coins [min,max], threat, ai {state, onInterrupt(reason)}, view {sprite, flash()}`. Combat calls `e.view.flash()` for the hit flash; your view honours `hitFlashRearmMs` and never overrides the lock-window tint (R5). Hit squash uses `hitSquashMs`.

**Boss damage clamp:** Combat calls `e.ai.clampDamage(amount)` if present, **before** subtracting HP. Bosses return the amount clamped at the next phase threshold (mechanic-spec §10).

**Events you emit:** `EV.ENEMY_WINDUP {id, attack, type, x, y, heavy}` at every windup start. `EV.FTUE 'danger-spawn'` when a charge attacker or an attacker with damage ≥ 2 enters its portal. `EV.FTUE 'danger-windup'` at such a windup start. `EV.BOSS_*`. Audio cue ids go through `ctx.mixer.fire(id)`: `enemy_windup_<type>`, `explode`, `heavy_impact`, `boss_phase`, `boss_death`, `wave_spawn` (portal), `enemy_death`.

## 4. Rules you implement (the specs are normative)
- `mechanic-spec.md` §9 (movement keys, the attack state machine incl. selection rules (a)–(d) with the **onScreen gate** `rules.enemies.attackRequiresOnScreen`/`onScreenInsetPx`, windup/aim-lock/interrupts/recover, every attack type in §9.3, elites §9.4, spawning §9.5), §10 (bosses: activation, phases with threshold clamp and onEnter, looping patterns with `idleMs`, final-phase `windupMult` with floors, death). `progression-and-pacing.md` §5 (per-boss tables).
- Windup floors: every windup ≥ `rules.enemies.telegraphMinMs` 350 (≥ `heavyTelegraphMinMs` 600 when damage ≥ 2, ≥ `bossTelegraphMinMs` 450 on bosses) after curse `windupMult`.
- **Telegraphs are driven by windup progress** `p = windupElapsedMs / windupTotalMs` (state-graph R3), and the windup timer advances by `dt × combat.windupRate(e)` so chill stretches it. `TelegraphLayer` is **one Graphics** at depth band decals (10), redrawn once per sim step (telegraphs.md §1.1). WYSIWYH: the decal extent equals your hit test. Heavy (damage 2) = 2 px rim. Shapes and per-type visuals follow telegraphs.md §2. Interrupted = 100 ms fizzle.
- Views: state-graph-spec §3 (enemy graph projection, clip classes A–D, speed-scaled run fps, flyer bob, facing deadband, R5 tint priority, R10 elite gold ring + outline, spawn portal emerge) and §4 (boss intro/phase-shift/death). Status overlays per art-slot-map `status.*` (burn flame at head, chill 1–2 pips, frozen shell + frost-tint, shock sparks, poison drip + stack number, vulnerable glyph). Deaths per telegraphs.md §4. Art frames via `Art.get('enemies.<id>.idle', i)` / `.move` / bosses likewise, falling back to generated placeholder textures (`ph-enemy`, or draw your own).
- Enemy bullets: radius from data; the visual is `ebullet.<element>.<2r+1>`, and the lead's `shots.enemyBullet` draws it.
- Perf: ≤ 14 live enemies per room plus summons and a boss. No per-step allocation in hot loops.
