# Spellwright — `mechanic-spec`

**Owner:** Game Designer · **Status:** Wave 1, v1 · **Consumers:** Game Developer (implementation: `src/spells/`, `src/effects/`, `src/sim/`), Animator (telegraph windups §9, §10), 2D Artist (silhouettes and element read §14), Audio Director (event cues §14), UX Designer (wand editor and legibility surface; see `systems.md` §6).
**Companion specs:** `feel-spec.md` (every feel number), `systems.md` (economy, synergies, dominance), `progression-and-pacing.md` (run structure, waves, bosses, meta), `content-inventory.md` (every id plus the teaching order).
**Runtime data (designer-owned, loaded verbatim):** `data/index.json` → `spells, modifiers, wands, relics, enemies, bosses, rooms, floors, rules, economy, unlocks, loadouts`.

---

## §0 Conventions (binding on every number in this spec and in `data/`)

| Convention | Rule |
|---|---|
| Space | Logical pixels at the engine's **640×360** view (`architecture.md` §3). Tile = **16 px**. "Tiles" in prose = ×16 px. |
| Time | Data stores **milliseconds** (`…Ms` fields). The engine converts once at load: `steps = round(ms × 60 / 1000)` (SIM_HZ 60). No other conversion anywhere. |
| Speeds | px/s. Turn rates in deg/s. Angles in degrees, 0° = +x (right), clockwise positive (screen y down). |
| Randomness | Seeded run RNG, named streams (`architecture.md` §5.3): card draws and shuffles use `spell`; loot, drafts and prices use `loot`; room and door rolls use `run`; enemy choices use `ai`; cosmetics use `fx`. **Spread jitter and crit rolls use `spell`.** |
| Card ids | Spells (`spells.json`) and modifiers (`modifiers.json`) share **one card-id namespace** (unique across both files). The engine may merge them into one `cards` catalogue. |
| "Absolute" damage | Any damage value **not** derived from a player shot (status ticks, blight, relic `explode`, relic `spawn_spell` shots, imp `enemyDamage`) is multiplied by the current floor's `hpMult`, so it keeps pace with enemy HP. Wand-shot damage never scales with floor; the build is the player's scaling. |
| Numbers home | Feel numbers → `feel-spec.md` `feel-tunables` blocks (parsed verbatim). Rule, content and economy numbers → `data/*.json`. **No number lives in both.** This spec cites data keys as `rules.casting.maxShotsPerCast` etc. |

---

## §1 The verb

**Core verb: *craft-then-cast*.** You arrange spell and modifier cards in a wand's slots, and the wand's slot order *is the program* that each pull of the trigger executes. Moment to moment you **move, aim and hold cast**. Between fights you **re-slot** to make the program stronger. The skill atom is "predict what my wand will fire, then position so it lands".

Sub-verbs, ranked by expected frequency per minute of combat:

| Rank | Sub-verb | Input | Freq/min (combat) |
|---|---|---|---|
| 1 | Aim | mouse / right stick | continuous |
| 2 | Move | WASD / left stick | continuous |
| 3 | Cast (hold) | LMB / RT | ~120–400 casts/min while held (wand-dependent) |
| 4 | Dash (i-frames) | Space or RMB / A or LB | 6–15 |
| 5 | Switch wand | 1–3, Q, wheel / RB, Y | 0–10 |
| 6 | Re-slot cards (wand editor, pauses) | Tab / Back | 0.5–2 between rooms |
| 7 | Pick a reward / door | E / X | ~1 per room |

**Learnability (DOG 2).** The first meaningful execution (a spark bolt breaking a crate) takes **2 inputs**: mouse aim plus LMB. The player spawns 7 tiles from the crate wall in the Sanctum (`rooms.json#sanctum`), so walking there is optional. Aim and click lands in under 5 s. No prompt is required beyond the UX's control hint.

---

## §2 Player

| Property | Value / key | Notes |
|---|---|---|
| Max HP | `rules.player.maxHp` = 6 | Shown as 3 hearts × 2 halves. Every normal enemy hit = 1 (half a heart); heavy attacks = 2. Cap `maxHpCap` 12. |
| Hurtbox | `feel: playerHurtboxRadius` 4 px | Deliberately smaller than the sprite (bullet-hell convention). |
| Body (walls/enemies) | `feel: playerBodyRadius` 6 px | Arcade circle body. |
| Invulnerability after hurt | `feel: hurtIframesMs` 1000 | Blocks all damage. The player can still act. |
| Shield | `rules.player.shieldMaxCharges` 1 | From `warding_sigil`. Absorbs one damage instance fully, then starts `hurtIframesMs`. |
| Movement | feel-spec §move | 8-directional analog, accel/decel curves. Pits and walls block. |
| Dash | feel-spec §dash | Fixed-distance burst with i-frames. Passes through enemies and projectiles, **not** pits or walls. No casting during a dash (cast timers keep ticking). Charges: `feel: dashChargesBase` + relic `dashCharges`. Charges refill one at a time, each after `dashCooldownMs`. |
| Wands carried | `rules.player.wandSlots` 3 | One is active. Inactive wands keep regenerating mana and ticking timers. |
| Bag | `rules.player.bagCapacity` 12 | Unslotted cards. A full bag means you must discard or salvage before you can take a card. |
| Death | HP ≤ 0 and no `revive` relic | → `run-end {death}`. |

**Hurt resolution (per damage instance to the player):** if dashing and inside `dashIframesMs`, or inside `hurtIframesMs` → ignore. Else if shield > 0 → shield−1, start i-frames (no HP loss, `shieldBreakHitstopMs`). Else HP −= damage; if HP ≤ 0 → emit `lethal` (relics may revive; revive sets HP = `hp` and grants i-frames), else death. Emit `hurt` → i-frames, knockback, hit-stop and shake per feel-spec §hurt.

**Player statuses:** only `playerSlow` (from frost enemy projectiles): move speed × (1 − `rules.status.playerSlow.slowFrac` 0.4) for `durationMs` 1500, refreshed on reapply. Enemy fire and poison projectiles are cosmetic for the player. No player DoT exists, which keeps the half-heart HP model legible.

---

## §3 Wand model

### 3.1 Wand stats (`data/wands.json`)

| Field | Meaning | Range in content |
|---|---|---|
| `capacity` | slot count | 3–10 |
| `manaMax` / `manaRegen` | mana pool / regen per second (always regenerating, all wands, even inactive) | 50–320 / 25–70 |
| `castDelayMs` | base wait between casts | 90–450 |
| `rechargeMs` | base wait after the deck is exhausted | 280–900 |
| `spreadDeg` | random ± deviation added to every shot | 0–10 |
| `speedMult` | multiplies every shot's speed | 0.8–1.25 |
| `spellsPerCast` | groups evaluated per trigger pull (see §4) | 1–2 |
| `shuffle` | deck order randomized (spell stream) on every recharge, on pickup and after edit | bool |
| `alwaysCast` | non-projectile card ids injected free at the start of every cast | 0–1 cards |
| `presetCards` | cards the wand is found with, slotted from slot 0 | ≤ capacity |

Starter wand `apprentice_wand` (rarity `starter`) never appears in loot.

### 3.2 Card model

Every card has `id, name, desc, type, rarity, minFloor, mana, castDelayAddMs, rechargeAddMs, visual`.

| `type` | File | Behaviour in evaluation |
|---|---|---|
| `projectile` | spells.json | Produces shot(s) with the accumulated modifiers. **Ends the group.** |
| `modifier` | modifiers.json | Pushes its `effects` onto the pending modifier list, then draws again (a modifier never ends a group). |
| `multicast` | modifiers.json | Evaluates `count` sub-groups, each inheriting the pending modifiers, with a fan of `fanDeg`. Ends the group. |
| `trigger` | modifiers.json | The next group is the **carrier**. The group after that is the **payload**, released from each carrier shot on `event` (`hit` / `expire` / `timer` + `timerMs`). Ends the group. |

`rechargeAddMs` is **static**. The wand's effective recharge = `rechargeMs + Σ rechargeAddMs over every card slotted`, so the wand editor can display it before you fire. `castDelayAddMs` is **dynamic**: it sums over the cards actually paid for in that cast.

### 3.3 Wand runtime state (RunState-owned)

`slots[capacity]` (card id or null) · `order[]` (deck: the indices of non-empty slots, in slot order, or shuffled) · `cursor` · `mana` · `castTimerMs` · `rechargeTimerMs`.

- **Edits reset the deck** (`rules.casting.editForcesRecharge`). The wand editor fully pauses the sim and may be opened mid-combat. A wand counts as edited only if its slot contents on close differ from when the editor opened (reordering and then restoring is not an edit, and gains nothing). Closing the editor after a real change to a wand sets `cursor = 0`, rebuilds `order` (reshuffles if `shuffle`), and sets `rechargeTimerMs = effectiveRecharge`. This closes the "edit to skip recharge" exploit.
- **Switching wands** (`wandSwapCarriesTimers`): each wand keeps its own timers, which tick whether or not it is active. After a swap the new wand cannot cast for `feel: wandSwapMs` 120 ms. Alternating two ready wands is an **intended** technique (Noita's wand-swapping), bounded by the 120 ms swap cost.

---

## §4 Cast evaluation (deterministic) — the core algorithm

**Modifier scope:** `rules.casting.modifierScope = "next_group"`. Pending modifiers apply to the next projectile-producing group only. Inside a multicast they apply to every sub-group.
**Wrap mode:** `rules.casting.wrapMode = "wrap_once_skip_drawn"`. When a cast runs past the end of the deck it wraps to slot 0 **once**, skipping cards already drawn in *this* cast. Wrapping forces a recharge after the cast.

```text
tryCast(wand):                                   # called each step while castHeld and wand is active
  if wand.rechargeTimerMs > 0 or wand.castTimerMs > 0 or swapLock > 0: return
  if wand.order is empty and wand.alwaysCast is empty: return   # empty wand: editor warns
  ctx = { drawn: set(), wrapped: false, castDelayAdd: 0, virtual: copy(wand.alwaysCast), shotCount: 0 }
  plan = []
  repeat wand.spellsPerCast times:
      plan += evalGroup(ctx, pending = [], depth = 0)
  emit wand:cast (even if plan is empty → sputter feedback, feel §cast)
  spawn every shot in plan (§5)                  # truncated at rules.casting.maxShotsPerCast (log it)
  delay = max(rules.casting.minCastDelayMs, (wand.castDelayMs + ctx.castDelayAdd) * player.castDelayMult)
  exhausted = ctx.wrapped or wand.cursor >= len(wand.order)
  if exhausted:
      rech = max(rules.casting.minRechargeMs, (wand.rechargeMs + Σ rechargeAddMs(all slotted cards)) * player.rechargeMult)
      wand.rechargeTimerMs = max(delay, rech)     # on reaching 0: cursor = 0; reshuffle if shuffle; emit wand_recharge
  else:
      wand.castTimerMs = delay

draw(ctx):                                       # → card or null
  if ctx.virtual not empty: return (ctx.virtual.shift(), virtual = true)
  if wand.order is empty: return null
  if wand.cursor >= len(wand.order):
      if ctx.wrapped: return null                # wrap at most once per cast
      ctx.wrapped = true; wand.cursor = 0
  while wand.cursor < len(order) and wand.cursor in ctx.drawn: wand.cursor += 1
  if wand.cursor >= len(order): return null
  i = wand.cursor; wand.cursor += 1; ctx.drawn.add(i)
  return (card(slots[order[i]]), virtual = false)

evalGroup(ctx, pending, depth):                  # → list of ShotSpec
  mods = copy(pending)
  loop:
    (c, virtual) = draw(ctx);  if c is null: return []          # fizzle: pending mods are lost
    if not virtual:
        if wand.mana < c.mana: log skipped(c); sputter; continue  # SKIP: cursor already advanced, no cost, keep drawing
        wand.mana -= c.mana; ctx.castDelayAdd += c.castDelayAddMs
    # virtual (alwaysCast) cards cost no mana and add no cast delay
    switch c.type:
      modifier:  mods.append(c); continue
      projectile: return makeShots(c, mods, angleOffset = 0)      # pattern may yield >1 (§5.3)
      multicast:
        out = []
        for k in 0 .. c.count-1:
            off = (c.count == 1) ? 0 : -c.fanDeg/2 + k * c.fanDeg/(c.count-1)
            for s in evalGroup(ctx, mods, depth): s.angleOffset += off; out.append(s)
        return out
      trigger:
        carrier = evalGroup(ctx, mods, depth)
        if carrier is empty: return []                      # payload is NOT drawn
        if depth + 1 > rules.casting.maxTriggerDepth: return carrier   # inert at cap; payload not drawn
        payload = evalGroup(ctx, [], depth + 1)             # payload gets NO inherited mods
        for s in carrier: s.payload = payload; s.trigger = c.event; s.triggerTimerMs = c.timerMs
        return carrier
```

**Why it terminates:** every real draw marks a deck index in `ctx.drawn`, and nothing is drawn twice per cast. So one cast performs at most `len(order) + len(alwaysCast)` draws (≤ 11), whatever the nesting. Recursion depth is bounded by the number of cards. Triggers are additionally capped at depth 3. This is stricter than the engine guards (`CAST_INSTRUCTION_CAP` 64, `TRIGGER_DEPTH_CAP` 6), which remain as backstops.

**Mana failure (normative):** mana is paid **per card, as drawn**. A card you can't afford is *skipped*: it is consumed for this cycle (the cursor moved past it), it costs nothing, it adds no cast delay, and evaluation continues with the next draw. So a cheap spell behind an expensive one still fires. The wand never stalls: even a cast where every card is skipped consumes cursor positions and proceeds to delay or recharge. Feedback: the `sputter` cue plus wand-tip flash (feel §cast), rate-limited by `sputterMinIntervalMs`.

**Payload accounting:** payload shots are drawn, paid and counted toward `maxShotsPerCast` **at cast time** (each carrier shot contributes `len(payload)`). A paid payload **always fires exactly once** per carrier shot:
- `hit` — on the carrier's first collision with an enemy **or** a wall (or crate). If the carrier ends without colliding, it fires at the end position.
- `expire` — when the carrier ends, for any reason.
- `timer` — `timerMs` after spawn. If the carrier ends first, it fires at the end position.

Release point = carrier position − `rules.casting.payloadSpawnBackoffPx` (2 px) along its heading. Release heading = carrier heading, or the carrier heading reflected off the wall normal when released by a wall collision. Payload shots then apply their own spread and angle offsets relative to that heading. Payload shots belong to the same cast. They never re-trigger their carrier. Payloads may themselves carry payloads (depth ≤ 3).

---

## §5 Shots

### 5.1 Stat composition (per shot, at spawn)

Start from the projectile card's `stats` block (`damage, speed, lifetimeMs, radius, spreadDeg, pierce, bounce, homing, knockback, statusChance, critChance`), `element`, `onHit[]`, `onExpire[]`, `onTick`. Then:

1. **Wand:** `speed ×= wand.speedMult`; `spreadDeg += wand.spreadDeg`.
2. **Modifiers** (the group's `mods`, in draw order), then **relic `shot_stat` effects** (filtered by `element` if the relic names one, evaluated against the element *after* infusion):
   - all `add` ops summed onto the base, then
   - all `mult` ops multiplied together. The product of `damage` mults is capped at `rules.casting.modifierDamageMultCap` 5.0.
   - `set` (only `element`): the last one drawn wins.
   - `append` (only `onHit` / `onExpire`): appended in draw order.
3. **Relic `effect_param`** (e.g. `storm_battery` chain jumps +1) applied to every matching effect entry on the shot.
4. **Crit:** `critChance_total = rules.crit.baseChance + shot.critChance`, rolled **once per shot** (spell stream). A crit multiplies every damage instance from that shot, including explosions, chains and zones, by `rules.crit.mult` 2.0. Payload and child shots roll their own crit.
5. **Clamp** every stat to `rules.shotClamps`. A behaviour ignores the stats it does not use (orbit ignores `speed`, `homing` and `bounce`).

Ops are order-independent within a class. So a reviewer can compute any shot on paper: `final = (base + Σadd) × Πmult`, then clamp.

### 5.2 Spawn geometry

- Origin = player centre + aim direction × `feel: wandTipOffsetPx`.
- Heading = aim angle + `angleOffset` (multicast fan, summed through nesting) + uniform(−`spreadDeg`, +`spreadDeg`) (spell stream).
- `spellsPerCast` groups get **no** fan, only spread.

### 5.3 Patterns (`pattern.type`)

| Pattern | Rule |
|---|---|
| `single` | one shot |
| `ring` (`count` N) | N shots at `heading + k·360/N`, k = 0..N−1. For `orbit` behaviour the ring sets the orbit **phase**, not the heading. A ring counts as N shots toward the cap. |

### 5.4 Behaviours (`behavior.type`) — one implementation each

| Key | Params | Motion and ending rules |
|---|---|---|
| `bolt` | — | Straight line at `speed`. **Homing:** if `homing` > 0, turn toward the nearest enemy within `rules.casting.homingAcquireRangePx` 160 by ≤ `homing`·dt degrees per step. **Wall/crate:** if `bounce` > 0 → reflect on the crossed axis, `bounce−1`; else **end** (crates take the shot's damage). **Enemy:** apply a hit (§8); if `pierce` > 0 → `pierce−1` and continue (never re-hit the same enemy); else **end**. **Lifetime** out → **end**. |
| `boomerang` | `outMs`, `returnSpeedMult` | Out along the heading for `outMs` (a wall hit turns it early). Then it flies toward the player's *current* position at `speed×returnSpeedMult`, **ignoring walls**. It ends when within `rules.casting.boomerangCatchRadiusPx` 8 of the player, when pierce runs out, or at lifetime. Its hit list is **cleared at the turn**, so each enemy can be hit once out and once back. Ignores homing and bounce. |
| `orbit` | `orbitRadius`, `angularSpeed` | Position = player + orbitRadius·(cos φ, sin φ), φ += angularSpeed·dt. Initial φ = heading (so ring and fan offsets spread orbs). Ignores walls. Infinite pierce. Each enemy can be re-hit after `rules.casting.rehitCooldownMs` 400. Ends at lifetime. At most `rules.casting.maxOrbitShots` 12 alive; spawning the 13th removes the oldest (the removed orb does **not** fire `onExpire`). |
| `mine` | `settleMs`, `armMs`, `triggerRadius` | Moves along the heading, decelerating linearly to 0 over `settleMs`. Walls stop it. After `armMs` from spawn it is armed. When an enemy centre comes within `triggerRadius` of an armed mine → **end**. Lifetime out → **end**. A mine deals **no** contact damage; its damage comes from its `onExpire` effects. |

**End** = fire every `onExpire` effect once at the end position, release a pending `expire`/`hit`/`timer` payload (§4), and despawn. **Despawn by cap** (`rules.casting.maxPlayerProjectiles` 220, oldest first; or the orbit cap) fires **nothing**, which prevents cascade explosions at the cap.

`onTick` `{everyMs, effects[]}`: fires the effects at the shot's position every `everyMs` from spawn while it is alive.

---

## §6 Effect vocabulary (implement each key once — `src/effects/registry.js`)

### 6.1 Projectile effects (used in `onHit`, `onExpire`, `onTick.effects`, and appended by modifiers)

The shot's `damage`, `element`, `statusChance`, crit and knockback are inherited unless stated otherwise.

| Key | Params | Semantics |
|---|---|---|
| `explode` | `radius`, `damageMult` | Every enemy (and crate) whose circle overlaps the radius takes `damage×damageMult` (crit applies), rolls status, and gets radial knockback. **No self-damage**, ever. Shake per feel §impact (`bigExplosionRadiusPx` threshold). |
| `chain` | `jumps`, `range`, `damageMult` | From the enemy just hit, jump to the nearest enemy not yet in this chain within `range` px (ignores walls). Deal `damage×damageMult`, roll status, repeat `jumps` times. Chain hits do **not** fire `onHit` (no recursion) and apply no knockback. |
| `split` | `count`, `arcDeg`, `damageMult` | Spawn `count` child shots at the position, headings spread evenly over `arcDeg` centred on the current heading (count 1 → same heading). Children copy the final stats with `damage×damageMult` and `lifetimeMs × rules.casting.childLifetimeMult` (0.6). They inherit the parent's hit list. They **strip** every `split` effect and any payload, so children never split. |
| `zone` | `radius`, `durationMs`, `tickMs`, `damageMult` | A stationary area. Every `tickMs` (first tick immediately), each enemy inside takes `damage×damageMult` and rolls status. No knockback. Max `rules.casting.maxZones` 24 (oldest removed). |
| `pull` | `radius`, `strength` | Enemies inside receive a velocity impulse toward the centre of `strength × (1 − kbResist)` px/s (knockback channel). |
| `zap` | `radius`, `damageMult`, `maxTargets` | The nearest `maxTargets` enemies inside the radius take `damage×damageMult` and roll status. |
| `teleport_caster` | — | Move the player to the point. If the point is not player-walkable (wall, pillar, pit, crate), use the nearest walkable tile centre within `rules.casting.teleportSearchTiles` 2. If none is found → no-op. Grants **no** i-frames. |

### 6.2 Modifier ops (`modifiers.json → effects[]` entries `{key, op, value}`)

| `key` | Allowed `op` | Value |
|---|---|---|
| `damage`, `speed`, `lifetimeMs`, `radius`, `spreadDeg`, `pierce`, `bounce`, `homing`, `knockback`, `statusChance`, `critChance` | `add`, `mult` | number |
| `element` | `set` | `arcane` \| `fire` \| `frost` \| `shock` \| `poison` |
| `onHit`, `onExpire` | `append` | a §6.1 effect object |

Wand-level card fields `castDelayAddMs` / `rechargeAddMs` (e.g. `rapid_cast`, `quickening`) are read by §4, not by the stat pipeline.

---

## §7 Relic effect vocabulary (`relics.json → effects[]`)

Relics are passive, unique per run (an owned relic leaves the pool), and apply from pickup onward.

| `type` | Params | Semantics |
|---|---|---|
| `shot_stat` | `stat`, `op` (add\|mult), `value`, optional `element` | Applied in §5.1 step 2 to every shot (or only shots whose final element matches). |
| `player_stat` | `stat` ∈ `maxHp` (add; also heals the same amount), `moveSpeedMult`, `dashCharges`, `pickupRadiusMult`, `manaRegenMult`, `manaMaxMult`, `castDelayMult`, `rechargeMult`; `op`; `value` | Mults multiply; adds sum. `moveSpeedMult` multiplies `feel: moveSpeed`. `pickupRadiusMult` multiplies `feel: pickupRadius` and `magnetRadius`. `manaMaxMult` scales every wand's max (current mana keeps its fraction). |
| `status_rule` | `status` ∈ `burn`, `chill`, `freeze`, `shock`, `poison`, `reactions`; `field` (any field of that `rules.status.*` or `rules.reactions` record); `op` (add\|mult\|set); `value` | Overrides the rule constant for this run. |
| `effect_param` | `effect` (a §6.1 key), `field`, `op`, `value` | Modifies that param on every matching effect entry of every shot (§5.1 step 3). |
| `on_event` | `event`, optional `every` (count), `chance`, `once`, `filter`, `action` | See below. |
| `economy` | `field` ∈ `coinMult`, `shopPriceMult`, `freeRerollsPerShop`; `op`; `value` | Read by the loot and shop code. |

**Events** (bus): `kill` (payload: enemy, position, statuses at death, elite flag), `hurt`, `lethal`, `room_enter`, `room_clear`, `dash_start`, `wand_recharge`, `crit`. `filter` supports `{status: burn|frozen|poison|shocked|chilled}` and `{elite: true}`. `every: N` keeps a per-relic counter and fires on every Nth qualifying event. It is deterministic, not a random chance.
**Actions:** `heal {amount}` · `mana {amount}` (to the wand that raised the event, else the active wand) · `explode {radius, damage, element}` (absolute damage × floor `hpMult`; rolls status at statusChance 1.0 for its element; no knockback) · `spawn_spell {spellId, pattern}` (spawns that spell's **base** shot(s) at the event position with relic `shot_stat`s only, no wand and no modifiers; damage × floor `hpMult`; a `ring` pattern spreads evenly, otherwise the shot aims at the nearest enemy) · `shield {charges}` (sets shield to max(current, charges), capped at `rules.player.shieldMaxCharges`) · `revive {hp}` · `coins {amount}`.

---

## §8 Damage, knockback, statuses, reactions

### 8.1 Damage instance pipeline

```text
dmg = shot.damage × effect.damageMult (1 for a direct hit)
    × (shot.isCrit ? crit.mult : 1)
    × (enemy shocked ? shock.vulnerableMult : 1)
    × reactionMult                     # §8.3; if a reaction fires, it REPLACES the frozen multiplier
    × (enemy frozen and no reaction fired ? freeze.damageTakenMult : 1)
enemy.hp -= dmg                        # floats internally; damage numbers display ceil(dmg)
then: apply status (if alive and not immune), knockback (direct hits and explode only)
```

Knockback: velocity impulse = `shot.knockback × (1 − kbResist)` px/s along the shot heading (radial for explosions), decaying at `feel: knockbackDecay`. Enemies mid-`charge`, bosses (`kbResist` 1) and turrets are immovable.

### 8.2 Statuses (`rules.status`; enemies only)

A damage instance of element E rolls `statusChance` (spell stream). On success it applies E's status, unless the enemy lists it in `immune`. Arcane applies nothing. Status tick damage has **no element**, can't crit, can't react, and is × floor `hpMult` (`tickDamageScalesWithFloorHp`).

| Element → status | Rule (defaults) |
|---|---|
| fire → **burn** | `tickDamage` 2 every `tickMs` 500 for `durationMs` 3000. Reapply refreshes the duration and does not stack. |
| frost → **chill** | +1 stack (max 3). Each stack: −20% move and attack speed (windups and cooldowns stretch ×1/(1−slow)). Stacks expire together `durationMs` 2500 after the last application. At `freezeStacks` 3 → **frozen**. |
| (chill) → **frozen** | Immobile, no attacks, **no contact damage**, for `freezeMs` 1500. Takes ×1.5 damage. On thaw: chill cleared, then `immunityMs` 2000 of chill/freeze immunity (prevents perma-freeze). A windup in progress is cancelled. |
| shock → **shocked** | Stun `stunMs` 250 (no move, no attack, no contact damage). Cancels an in-progress windup; that attack's cooldown restarts at `cooldownMs × interruptCooldownFrac` 0.5. Then **vulnerable** ×1.25 for `vulnerableMs` 2000. `stunImmunityMs` 1000 after each stun (vulnerability still refreshes). |
| poison → **poison** | +1 stack (max `maxStacks` 10). Deals `damagePerStack` 1.5 × stacks every `tickMs` 1000. `durationMs` 4000 refreshed on each application; all stacks drop together on expiry. |

**Bosses** (`immune: [stun, freeze]`): chill slow is capped at `rules.status.boss.slowCap` 0.2 and they never freeze. Shock still applies *vulnerable*. Burn and poison apply normally.

### 8.3 Reactions (`rules.reactions`) — "an element **consumes** the status it reacts with"

A reaction fires when a damage instance of element E hits an enemy **already carrying** status S. There is no roll. It is evaluated before E's own status is applied. Reaction damage is elementless and **never causes another reaction** (no cascades).

| Name | E hits S | Effect | Then |
|---|---|---|---|
| **Melt** | fire → chill or frozen | this instance × `melt.damageMult` 2.0 | chill/frozen removed (freeze immunity starts); this instance applies **no** burn |
| **Overload** | shock → burn | explosion `overload.radius` 32 px at the enemy for `instanceDamage × overload.damageMult` 1.5 (elementless, all enemies in radius incl. this one) | burn removed; shock applies normally |
| **Blight** | fire → poison | instant `stacks × blight.damagePerStack` 4 (× floor `hpMult`) to this enemy | poison removed; burn applies normally |
| **Superconduct** | shock → frozen | this instance × `superconduct.damageMult` 1.5 (replaces frozen ×1.5); +1 chill stack to every other enemy within `chillRadius` 40 | frozen removed (immunity starts); shock applies |
| **Quench** | frost → burn | no bonus | burn removed; chill applies |

All reaction damage × `rules.reactions.damageMult` (1.0; `alchemist_stone` ×1.5). The first time each reaction fires in a run, emit `reaction_first` for the codex (UX) and the `all_reactions` unlock.

---

## §9 Enemies — vocabulary (`data/enemies.json`)

Base stats are floor-1 values. Runtime: `hp × floor.hpMult × curse.enemyHpMult`, enemy projectile speed × `floor.enemyProjSpeedMult`, windups × `curse.windupMult` (floored at `rules.enemies.telegraphMinMs` 350, `heavyTelegraphMinMs` 600 for attacks with damage ≥ 2).

**Fields:** `archetype` (label: `swarm, chaser, ranged_shooter, charger, splitter, bomber, turret, teleporter, summoner, tank`) · `movement` · `hp, speed, radius, kbResist (0..1), flying, contactDamage, threat, coins [min,max], immune[], attacks[], onDeath, summonOnly`.

### 9.1 Movement keys

| Key | Params | Rule |
|---|---|---|
| `chaser` | optional `stopRange` | Follows a tile **BFS flow field** toward the player, recomputed at `rules.enemies.flowFieldHz` 4 Hz. Ground units treat walls, pillars, crates and pits as blocked. Flyers treat only walls, pillars and crates as blocked. Stops at `stopRange`. |
| `kiter` | `minRange`, `maxRange` | Inside `minRange` → move away (flow-field inverse, max 1 s). Outside `maxRange` → approach. Between → strafe perpendicular to the player, flipping direction every `rules.enemies.kiterStrafeFlipMs` 1500. |
| `swarm` | `wobbleAmpPx`, `wobblePeriodMs`, `retreatMs`, `retreatSpeedMult` | Seek plus a sinusoidal perpendicular wobble. After dealing contact damage, flee directly away for `retreatMs` at `speed×retreatSpeedMult`. |
| `stationary` | — | Never moves (turrets spawn on floor tiles only). |
| `drifter` | — | Slow straight drift, picking a new random direction every `rules.enemies.drifterTurnMs` 1200 (ai stream). Flying. |

Contact damage applies on body overlap unless the enemy is spawning, frozen or stunned.

### 9.2 Attack state machine (every enemy and boss attack)

`move → windup (telegraph) → act → recover → move`.
- **Selection:** `attacks[]` cycle **in order**. An attack starts when (a) `cooldownMs` has elapsed since the end of the previous attack's recover, (b) the player is within `triggerRange`, (c) if `needsLos`, a tile raycast finds no wall, pillar or crate (pits don't block), and (d) if `rules.enemies.attackRequiresOnScreen` (true), the enemy's centre is inside the camera view inset by `onScreenInsetPx` 8 (checked once per attack check). Rule (d) matters only in rooms larger than the 640×360 view (`long_gallery`, `catacombs`). It guarantees every windup starts where the player can see it. Enemies may still spawn and approach from off-screen, and a projectile or charge released on-screen may travel off it. Bosses and positional attacks (slam, hazard) obey the same gate. If the current attack's conditions fail, the enemy keeps moving and re-checks each step. It does not skip ahead.
- **Windup:** movement stops (a charger turns to face the player). The telegraph plays for the full `windupMs`. Aimed attacks track the player until `windupMs − rules.enemies.aimLockBeforeReleaseMs` (150), then **lock**. Positional telegraphs (slam circle, hazard marks) appear at windup start at their locked positions.
- **Interrupts:** stun (shock) or freeze during windup cancels the attack (cooldown × 0.5, §8.2). Taking damage alone never interrupts.
- **Recover:** no movement, no new attack. This is the punish window.

### 9.3 Attack types (implement each once; shared by enemies and bosses)

| `type` | Params | Act |
|---|---|---|
| `melee_swipe` | `range`, `arcDeg`, `damage`, opt `approachMs`/`approachRange` (bosses: close distance before windup, max `approachMs`) | Instant arc hit centred on the locked aim. |
| `shoot` | `count`, `spreadDeg`, `speed`, `projectile{radius,element,lifetimeMs}`, `damage` | `count` projectiles evenly across `spreadDeg` centred on the locked aim. |
| `ring` | `count`, `speed`, `offsetDeg`, `volleys`, `volleyIntervalMs`, `volleyOffsetDeg`, `projectile`, `damage` | `volleys` rings, each rotated by a further `volleyOffsetDeg`, `volleyIntervalMs` apart (only the first volley has the windup). |
| `spiral` | `arms`, `shotsPerArm`, `intervalMs`, `rotateDegPerShot`, `speed`, `projectile`, `damage` | Every `intervalMs` fire one shot per arm (arms evenly spaced), the base angle advancing `rotateDegPerShot`. Lasts `shotsPerArm × intervalMs`. The emitter can't move meanwhile. |
| `charge` | `speed`, `durationMs`, `damage`, `wallStunMs` | Dash along the locked aim. Damages the player once per charge. A wall, pillar, crate or pit edge stops it and **stuns self** `wallStunMs` (normal damage taken). |
| `slam` | `radius`, `at` (`self`\|`target`), `travelMs`, `damage`, opt `ring{count,speed,projectile}` | Circle AoE. `target`: the position locks at windup start, the body is airborne and **untargetable, no contact** for `travelMs` after the windup, then lands. The circle telegraph is visible for `windupMs + travelMs`. The optional ring fires from the impact point. Shake per feel `heavyImpactShakePx`. |
| `summon` | `enemyId`, `count`, `maxAlive` | Spawn up to `count` (never exceeding `maxAlive` alive for this summoner) on a ring of `rules.enemies.summonRingRadiusPx` 24 with the normal spawn portal. If already at `maxAlive` → the attack is skipped (cooldown still applies). Summons die with their summoner (`summonsDieWithSummoner`). Summons give no coins unless their data says so. |
| `blink` | `minDist`, `maxDist` | At windup end, vanish and reappear at a random walkable point `minDist..maxDist` from the player and ≥ `blinkWallClearTiles` 2 tiles from walls (ai stream). |
| `self_destruct` | `radius`, `damage`, `enemyDamage`, `explodeIfKilledDuringWindup` | At windup end: explode (player `damage`; other enemies take `enemyDamage` × floor `hpMult`), then die with **no coins** (`selfDestructDropsCoins` false). Killed mid-windup with the flag → explodes immediately **and** drops coins. Killed before the windup → no explosion. |
| `hazard` | `count`, `radius`, `durationMs`, `tickMs`, `damage`, `element`, `placement` | Marks appear at windup start and activate at windup end for `durationMs`. While active, a player inside takes `damage` on entry and every `tickMs`. `player+random`: 1 at the player's position plus (count−1) random walkable points ≥ `hazardMinSpacingPx` 48 apart. `cross`: the player's position ± `hazardCrossOffsetPx` 64 on both axes (5). |
| `sequence` | `steps[]`, `gapMs` | Runs the named attacks back to back, each with its own windup. |

Enemy projectiles: circles vs the player hurtbox. Walls, pillars and crates stop them; pits don't. `frost` element → `playerSlow`. Player projectiles never cancel enemy projectiles (and vice versa). Boss phase changes clear enemy projectiles.

### 9.4 Elites (`rules.enemies.elite`)
HP × 2.5, coins × 3, `kbResist` + 0.3 (cap 1). **Sprite scale and collision radius stay ×1.0.** Fractional nearest-neighbour scaling breaks the 1-pixel outline (style-guide §3.3), and a body bigger than the sprite would deal contact damage from undrawn pixels. Elites are marked instead by a baked 1 px gold outline (`#facb3e`) and a gold ground ring (2D Artist / TA). Same attacks and windups (elites are tankier, not less readable). They cost `threat × eliteThreatMult` (2) of the wave budget. Elite kill → `eliteKillHitstopMs`.

### 9.5 Spawning
A wave's enemies appear at `x` markers (flyers may use any floor tile) at least `minSpawnDistPx` 64 from the player, else the farthest marker. Each shows a portal for `spawnPortalMs` 700 during which it is inert and invulnerable. `maxAlive` 14 per room; overflow queues. Wave generation: `progression-and-pacing.md` §3.

---

## §10 Bosses (`data/bosses.json`)

- Absolute `hp` (no floor mult; × curse `enemyHpMult`). `immune: [stun, freeze]`. `kbResist` 1.
- Activation: `rules.enemies.bossActivateDelayMs` 1200 after room entry (name card, camera pan `feel: bossIntroPanMs`). The boss is invulnerable and inert until then.
- **Phases:** phase *i* is active while `hpFrac > phases[i].untilHpFrac`. Damage that would cross a threshold is **clamped at the threshold** (no phase skipping with a big hit). Entering a phase: abort the current attack, clear enemy projectiles (`clearProjectiles`), apply a radial knockback impulse `shockwaveKnockback` px/s to the player (no damage), be invulnerable for `invulnMs`, run `summon` if present, hit-stop `feel: bossPhaseHitstopMs`, then start `pattern[0]`.
- **Pattern:** attacks run **in listed order, looping**, separated by `idleMs` (the boss moves per its `movement`). A deterministic loop is learnable: the first failure teaches the next attempt.
- `windupMult` (final phase only): windups × 0.9, floored at `rules.enemies.bossTelegraphMinMs` 450 and at 600 for damage-2 attacks.
- Death: kill all other enemies, clear projectiles, award `rewards` (relic draft, coins, heal). Floor 3 → `run-end {victory}`.

Full per-attack tables, including windup ms: `progression-and-pacing.md` §5.

---

## §11 Worked examples (exactly what fires)

All examples use the wand's own stats, no relics, from a full mana bar. Deck = non-empty slots in slot order.

### Ex 1 — Starter: `apprentice_wand` [spark_bolt, spark_bolt, —, —] (cd 250, rc 400, mana 60, regen 25)
| t (ms) | Draws | Shots | Timer set |
|---|---|---|---|
| 0 | spark (−5) | 1 spark: 5 dmg, 300 px/s, 700 ms (210 px), ±5° (2 card + 3 wand) | cursor 1 < 2 → castTimer = 250 |
| 250 | spark (−5) | 1 spark | cursor 2 = end → exhausted → recharge = max(250, 400+0) = **400** |
| 650 | cycle repeats | | |

2 shots / 650 ms = **3.08 shots/s → 15.4 DPS**. Mana: 10 per 650 ms = 15.4/s < 25 regen → sustainable indefinitely.

### Ex 2 — The FTUE modifier: [double_cast, spark, spark, —]
Cast 1: draw double_cast (0 mana) → sub-group A draws spark (−5) → shot at −6°; sub-group B draws spark (−5) → shot at +6° (fan 12°). Cursor 3 = end → recharge max(250, 400) = 400.
→ 2 sparks every 400 ms = **25 DPS** (+62%). Mana 10/400 ms = 25/s = regen → exactly sustainable.
**Placement doesn't matter:** [spark, spark, double_cast] gives cast 1 = spark, cast 2 = spark, cast 3 = double → A: cursor at end → **wrap** → slot 0 spark (not drawn this cast) → B: slot 1 spark → 2 shots, wrapped → recharge. Every order yields a working wand, so the first modifier can't be a dead card. This is the teaching guarantee behind `wrap_once_skip_drawn`.

### Ex 3 — Trigger delivery: `oak_staff` [trigger_hit, spark_bolt, fireball] (cd 380, rc 900, speed ×0.9, mana 180, regen 28)
Cast 1: trigger_hit (−10) → carrier group draws spark (−5) → carrier S (270 px/s, 189 px range). The payload group (depth 1, no inherited mods) draws fireball (−22) → P stored on S. Cursor 3 = end → recharge = max(380 + 150, 900) = **900**.
S flies. On its first collision at point X, P spawns at X − 2 px along S's heading and flies on (for an enemy hit it immediately overlaps the enemy): fireball direct 10 + `explode` r32 ×1.0 = 10 to all in radius, burn at 100%. If S hits nothing, P releases at S's end point (≈189 px out).
Result: a fireball that arrives at spark speed. 37 mana / 900 ms ≈ 41/s vs 28 regen → about 14 s of continuous fire from full.

### Ex 4 — Wrap and skip inside a multi-group cast: `twin_fork` [fire_bolt, ice_shard, double_cast] (spellsPerCast 2, cd 300, rc 650)
- Cast 1: group 1 draws fire_bolt (−9) → shot; group 2 draws ice_shard (−8) → shot. No fan between groups (spread only, ±7° wand + card). Cursor 2 < 3 → castTimer = 300 + 40 + 20 = **360**.
- Cast 2: group 1 draws double_cast (0) → A: cursor 3 = end → **wrap** → slot 0 fire_bolt (not drawn *this* cast) → shot at −6°; B: slot 1 ice_shard → shot at +6°. Group 2: cursor 2 is double_cast, drawn this cast → skip → end, already wrapped → **null → group 2 fizzles** (no mana spent, nothing drawn). Wrapped → recharge = max(300 + 60, 650) = **650**.
- Totals per cycle: 4 shots in 1010 ms.

### Ex 5 — Mana failure (skip, never stall): `apprentice_wand` [comet, spark_bolt] with 30 mana left
Cast: draw comet (needs 40, has 30) → **skipped** (sputter cue and flash; the cursor moved on; no cost; no cast delay). Keep drawing → spark (−5) → 1 spark fires. Cursor at end → recharge max(250 + 0, 400 + 300 (comet's static `rechargeAddMs`)) = 700. The next cycle starts again at comet with 25 + 0.7 × 25 = 42.5 mana → comet fires.

### Ex 6 — Always-cast plus modifier scope: `echo_wand` (alwaysCast [double_cast]) [damage_up, spark_bolt, magic_missile]
Cast 1: virtual double_cast (free, drawn first) → A: draw damage_up (−10) → pending [damage_up] → draw spark (−5) → spark ×1.4 = 7 dmg. B: draw magic_missile (−12) → 8 dmg. damage_up does **not** reach B, because it was drawn *inside* sub-group A, after the multicast had already split. Cursor end → recharge.
Contrast on a normal wand, [damage_up, double_cast, spark_bolt, magic_missile]: damage_up is pending *before* the multicast, so both sub-groups inherit it (7 + 11.2 dmg). **Rule of thumb for players: a modifier affects everything that splits off after it.** Because order matters this much, the wand editor must preview each cast's shot list (UX seam, `systems.md` §6).

---

## §12 Stress tests

### 12.1 Top dominant-strategy candidates (from Noita, Magicraft and Binding of Isaac teardowns)

| # | Candidate | Verdict | Mechanism that bounds it |
|---|---|---|---|
| D1 | **"One mega-cast"**: stack multicasts and damage-ups ahead of a big spell (Noita's glass-cannon wand) | **Intended optimum for burst, with named counters.** | Mana is paid per card from a finite pool. Damage mults cap at ×5. The static recharge sum grows with every card. Swarm waves (bats, slimelets, skulls) and kiters punish long recharges. Payload and ring shots count toward the 32-shot cap. |
| D2 | **Homing + pierce spark spam** ("autopilot") | **Neutralized by shape.** | Homing costs ×0.9 damage and +30 ms. Homing bolts still die on walls, so turrets behind pillars and wraiths that blink behind cover defeat pure homing. Pierce spends itself. Bosses don't care about homing, and raw DPS still wins there. |
| D3 | **Status lock** (perma-freeze or stun-lock with a fast wand) | **Neutralized.** | Freeze immunity 2000 ms after every thaw. Stun immunity 1000 ms after every stun. Bosses are immune to both. |
| D4 | **Poison stacking vs bosses** | **Intended niche with counters.** | Cap of 10 stacks (16 with `plague_vial`) × 1.5 × floor hpMult → 42 DPS at 10 stacks on F3, below a good F3 direct-damage build (≈120+). Wraiths are immune. Blight trades the stacks for a burst. |
| D5 | **Orbit fortress** (stack arcane_orbit) | **Bounded.** | Max 12 orbs. Orbs don't block enemy projectiles. 400 ms re-hit cooldown. |
| D6 | **Wand-swap cycling** to skip cast delays | **Intended technique.** | Per-wand timers keep ticking; the 120 ms swap lock applies. It rewards carrying two tuned wands. |
| D7 | **Blink-bolt mobility** replacing dash | **Bounded.** | 25 mana, +300 ms recharge, no i-frames, can't pass walls (the shot stops at walls, and teleport searches only 2 tiles). |

### 12.2 Degenerate edge cases and the rule that closes each

| # | Edge case | Closing rule |
|---|---|---|
| E1 | Infinite draw loop (all modifiers, or multicasts pointing at each other) | Each deck index is drawn ≤ 1× per cast; wrap ≤ 1× per cast → ≤ 11 draws/cast (§4). |
| E2 | Trigger recursion (payload carries payload carries…) | `maxTriggerDepth` 3. Beyond that the trigger is inert and its payload is never drawn. |
| E3 | Split cascades (split → split → …) | Children strip `split` and payloads. |
| E4 | Projectile flood at the cap causing cascading onExpire explosions | Cap despawn fires nothing. Player cap 220 (engine pool 512). |
| E5 | Negative cast delay stacking (rapid_cast ×N) | Floors: cast delay ≥ 50 ms, recharge ≥ 60 ms. |
| E6 | Edit-to-reset or wand swap to skip recharge | Edit forces a full recharge. Timers persist per wand. |
| E7 | Zero-mana stall | Unaffordable cards are skipped, not waited on (§4). |
| E8 | Unwinnable summoner loop (necromancer skulls forever) | `maxAlive` 4; summons die with the summoner, so killing the source ends the loop. |
| E9 | Phase skip via one huge hit | Damage clamps at each phase threshold. |
| E10 | Farming (infinite coins or re-entering rooms) | Rooms never respawn. Salvage = 30% of price < any buy price, so there is no arbitrage. Reroll cost escalates. |
| E11 | Teleport out of bounds or into pits | Walkable-tile search within 2 tiles, else no-op. Shots can't leave room bounds (walls). |
| E12 | Self-kill with own explosions | No self-damage exists. |
| E13 | Enemy cheap shots | Every attack windup ≥ 350 ms (≥ 600 ms for 2-damage, ≥ 450 ms on bosses). Aim locks 150 ms before release. Spawns ≥ 64 px away behind a 700 ms portal. **A windup may only begin while the attacker is on-screen** (`attackRequiresOnScreen`, §9.2), so no telegraph plays off-camera in scrolling rooms. |

---

## §13 Per-platform translation (DOG 6)

| Modality | Move | Aim | Cast | Dash | Switch wand | Editor | Timing assumption | Discoverability cost |
|---|---|---|---|---|---|---|---|---|
| **Keyboard + mouse** (primary) | WASD / arrows | mouse cursor (pixel-precise) | hold LMB | **Space or RMB** (RMB mirrors Enter the Gungeon's dodge; the engine's `altCast` intent is **unused** by this design) | 1–3, Q (cycle), wheel | Tab / I | 2-frame input→effect target (feel §0) | Low: genre-standard twin-stick on KB+M. |
| **Gamepad** (twin-stick) | left stick (deadzone feel `moveStickDeadzone`) | right stick + pad-only aim assist (feel §aim) | hold RT | A or LB | RB (next) / Y (prev) | Back/View | +2 frames of buffer (`padBufferBonusMs`) | Medium: aim assist compensates for stick precision; HUD glyph swap (UX). |
| Touch | **deferred** (README) | | | | | | | |

Binding conflict flagged to the developer: `architecture.md` §8 lists **E** as both interact and wand-cycle. This design uses **E = interact** and **Q / wheel = cycle wands**.

---

## §14 Seam briefs

**Animator — telegraph requirements.** Every enemy and boss attack has a windup equal to `windupMs` in the data. The telegraph must be readable in silhouette for the whole windup and must *peak* in the final 150 ms, when aim locks. Required distinct reads: melee swipe (weapon raise), shoot (hands glow, flash at lock), ring (body pulse), spiral (spin-up), charge (lowered stance and a ground line along the locked path), slam (a ground circle for windup + travel), summon (raised arms and a floor sigil), blink (fade out), self-destruct (flashing, swelling). Boss phase transition: 1200–1500 ms invulnerable "power-up" beat. Player: dash with afterimages (feel §dash), hurt flicker, cast kick of 1 px.

**2D Artist — silhouette and readability.** Elements must be identifiable by **hue and shape** at 16 px: arcane (violet, round), fire (orange, teardrop), frost (cyan, shard), shock (yellow, jagged), poison (green, droplet). Enemy projectiles must differ from player projectiles by **outline or value**, never by hue alone: enemy = dark core, bright rim; player = bright core. Status overlays on enemies: burn flicker, chill blue tint with a frozen crystal shell, shock sparks, poison drips with a stack pip count. Elites: same size, baked 1 px gold `#facb3e` outline plus a gold ground ring (no scaling). Pits must read as impassable; crates as breakable.

**Audio Director — event cues (the *when*; the sound is yours).** `cast` (per element family, fired on the cast step), `sputter` (mana skip or empty group), `wand_recharge` (deck reset), `wand_swap`, `hit_enemy` (per element), `crit`, `kill`, `elite_kill`, `explode` (size tiers at `bigExplosionRadiusPx`), `chain_zap`, `payload_release`, `status_apply` × 4, `reaction` × 5 (distinct, they are the "aha"), `freeze_shatter`, `player_hurt`, `shield_break`, `dash`, `pickup_coin`, `pickup_card`, `door_open`, `room_clear`, `wave_spawn` (portal), `enemy_windup` (per attack type, on windup start), `boss_phase`, `boss_death`, `low_hp` (HP ≤ 2).

**Game Developer.** Implement §4 exactly (it is pure and belongs in `src/spells/evaluate.js`), plus one registry entry per §5.4 behaviour, §6.1 effect, §7 relic type/action and §9 movement/attack key. Deviations from `architecture.md` §5: (1) triggers are standalone cards whose *next group* is the carrier (not a projectile with a built-in payload); (2) `modifierScope = next_group`; (3) data field names are as in `data/*.json` (`spellsPerCast`, `castDelayMs`, `rechargeMs`, `mana`, `castDelayAddMs`, `rechargeAddMs`); (4) three wand slots, not four.

---

## §15 Six-check audit (core-mechanic-design DOG)

1. **Verb:** one core verb, craft-then-cast, with sub-verbs ranked (§1). ✔
2. **Learnability:** first meaningful execution = 2 inputs, under 5 s (§1). ✔
3. **Expressive depth (distinct shapes of play):** (a) *burst artillery*: one heavy cast plus a long recharge, dance until it's ready (D1, comet/fireball, trigger delivery); (b) *stream*: fast cheap wands, positioning-heavy kiting (glass_needle, venom, rapid_cast); (c) *zone control*: mines, pools, vortex and orbit — hold ground and funnel enemies (rune_mine, toxic_flask, vortex); (d) *elemental alchemist*: two wands of different elements, swapping to trigger reactions (Melt, Overload, Blight); (e) *mobility*: blink, dash relics, boomerang returns. ✔ (5 ≥ 3)
4. **Dominant strategies:** top three (D1–D3) plus four more, each neutralized or declared intended with counters (§12.1). ✔
5. **Degenerate edge cases:** 13 closed by named rules (§12.2). ✔
6. **Per-platform translation:** KB+M and gamepad rows with mapping, timing and discoverability; touch explicitly deferred (§13). ✔
