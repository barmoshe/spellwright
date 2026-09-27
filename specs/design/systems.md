# Spellwright — systems, resource flow and emergent depth

**Owner:** Game Designer · **Status:** Wave 1, v1 · **Consumers:** Game Developer (loot, shop, economy code), UX Designer (§6 legibility surface → `hud-layout`, wand-editor UX), Audio Director (reaction and reward beats).
**Sources of truth:** rules in `data/rules.json`, prices in `data/economy.json`, content in `data/*.json`. This doc explains *why* those numbers produce the intended system. It adds no new numbers except derived ones (marked ≈).

---

## §1 Resource graph (Machinations vocabulary)

```text
                       ┌──────────── salvage (30% of price) ◄───────────┐
                       ▼                                                 │
 [enemy kills]──coins──►( COINS )──buy──►[SHOP]──► cards / relic / wand / potion
 [coin door]───coins──►    │                          │
 [boss]────────coins──►    └─reroll (10, +10 each)──► │
                                                      ▼
 [draft pedestal]──card──►( BAG ≤12 )──slot──►( WAND SLOTS )──program──►[CAST]
 [treasure]──wand/relic                                 ▲                  │
                                                        │            mana per card
 ( MANA per wand ) ◄──regen 25–70/s──[time]             └── edit = forced recharge
        │ drain: card.mana, as drawn
        ▼
     [SHOTS] ──damage──► ( ENEMY HP ) ──kill──► coins, `kill` relic events, room-clear progress
                                  ▲
 ( PLAYER HP ≤ maxHp ) ◄──heal door +2 / potion +2 / boss +4 / fang / phoenix
        │ drain: enemy hits 1 or 2
        ▼
     [DEATH → run end]           ( DASH CHARGES ) ◄── refill 600 ms each
```

| Resource | Sources (rate × magnitude) | Drains | Converters / traders |
|---|---|---|---|
| **Coins** | Kills: `enemy.coins` [min,max] × `floor.coinMult` (1.0/1.3/1.6) × elite ×3 × `greed_ring` ×1.5 ≈ **0.47–0.53 coins per threat point**. Coin door: `25 + 15·floor`. Boss: 60. Crates: 25% × 1. Salvage: 30% of a card's price. | Shop purchases (`economy.prices` × `floorPriceMult` 1.0/1.15/1.3 × `merchant_seal` 0.8), rerolls (10, then +10 per reroll per shop). | Salvage converts cards → coins at a 70% loss, so there is no arbitrage. |
| **Cards** (spells/modifiers) | Draft pedestal after a room with a `spell`/`modifier` reward (1 of 3; skippable). Treasure bonus card. Shop (3 card slots). Wand presets. | Discard, salvage. | Slotting turns cards into wand program. |
| **Wands** | Treasure `wand` door (≤ 1 per floor), shop wand slot (floor ≥ 2), loadout. | Swap-drop (its cards go to the bag; overflow drops as pickups). | — |
| **Relics** | Elite room (1 of 2), treasure `relic` (1 of 2), boss (1 of 3), shop (1 slot). | None (permanent for the run). | — |
| **Mana** (per wand) | `manaRegen`/s, always, all wands. `echo_chamber` +15 on recharge. | `card.mana` per paid card, as drawn (mechanic-spec §4). | Mana converts into damage at the rates in §4. |
| **Player HP** | Heal door +2 (≤ 1/floor), potion +2 (shop), boss kill +4 (F1, F2), `heart_vessel` +2, `vampiric_fang` +1 per 30 kills, `phoenix_feather` revive 3. | Enemy hits (1; heavy attacks 2). | — |
| **Dash charges** | 1 + `shadow_cloak`; each refills 600 ms after use. | A dash. | — |
| **Time** (implicit) | — | Rooms have no timer. Pressure comes from waves: the next wave arrives when ≤ 2 remain alive after 8 s. | — |

---

## §2 Feedback loops

| Loop | Type | Chain | Outcome | Counter-pressure |
|---|---|---|---|---|
| L1 **Build snowball** | positive | better wand → faster kills → less damage taken → more HP to spend on greedy doors (elite/relic instead of heal) → stronger build | "The run is working" feeling; the intended roguelite high | **Floor scaling** (enemy HP ×1.75 / ×2.8, extra waves); build power must keep pace. Bosses' HP is absolute and tuned against the *median* build (`progression-and-pacing.md` §4). |
| L2 **Death spiral** | positive (negative for the player) | low HP → forced heal doors → fewer relics and cards → weaker build → more damage | Runs that go wrong stay wrong, *slowly* | Heal is offered on **every** floor's late steps. Boss kill heals 4. Shop potion. Damage per hit is fixed at 1 (half-heart), so a weak build takes longer, not proportionally more hurt. `warding_sigil` pity unlock. |
| L3 **Mana throttle** | negative | bigger program → more mana per cycle → sputter → lower sustained DPS | Caps runaway wands in sustained fights | Designed; `mana_font`, `deep_well` and `echo_chamber` are the player's deliberate answer. |
| L4 **Coin economy** | positive, bounded | more kills → more coins → shop power → more kills | Mild; coins per threat stays ~0.5 | Shop prices scale by floor (×1.15, ×1.3). Stock is 6 items. Reroll cost escalates. |
| L5 **Reaction loop** | positive, bounded | applying statuses → reactions → faster kills | "Aha" combos | Reactions consume their status (no chains of reactions). Immunities (imp: burn; frost mage: chill/freeze; wraith: poison; golem: stun). |
| L6 **Summon pressure** | positive (enemy side) | necromancer alive → skulls → more pressure | Target-priority lesson | `maxAlive` 4; summons die with the summoner. |

Every positive loop has at least one named negative counter-pressure, or ends with a win condition: L1's natural end is the final boss.

---

## §3 Economy steady-state (spreadsheet pass, typical path)

> **v1 numbers. Superseded for v2 by §10**, which reflects the 9-step floors, mini-boss coins, skip pay and the forge.

Assumption: the player takes combat doors mostly, 1 elite per floor, no coin door, and spends at each shop. Threat totals are computed from `floors.json` budgets (budget = ⌊base + perStep·step⌋ × (1 + 0.25·waveIndex), floored per wave). The pool-weighted coin yield is computed from `enemies.json` (≈ 0.47 / 0.49 / 0.53 coins per threat).

| | F1 | F2 | F3 |
|---|---|---|---|
| Threat before the shop | 66 (s1–4, incl. elite 27) | 153 | 334 (shop at step 7) |
| Coins earned before the shop | ≈ 36 | ≈ 102 (+ carry ≈ 97) | ≈ 300 (+ carry ≈ 100) |
| Coins at the shop | **≈ 36** (+40 with a coin door) | **≈ 200** | **≈ 400** |
| Shop stock total (6 items, floor mult) | ≈ 20+20+35 (cards) + 35 (relic) + card + 35 (heal) ≈ 165 | ≈ 325 | ≈ 570 |
| Share of stock affordable | ≈ 20–45% (1–2 items) | ≈ 60% (3 items) | ≈ 70% (3–4 items + rerolls) |
| Coins after the shop → end of floor | + boss 60 → carry ≈ 97 | + boss 60 → carry ≈ 100 | spent at the final shop (pre-boss) |

**Equilibrium:** the median player is **solvent** (can always afford a heal potion or a common card at every shop) but **never saturated** (can't clear a shop until the F3 cash-out). The F3 shop sits at step 7 so late coins have a sink. **Rate cliffs that would break it:** coin yield above ~0.7/threat makes shops trivial by F2; card prices above ~1.5× current make F1 shops dead (0 purchases). `greed_ring` (×1.5) pushes toward the upper cliff deliberately; it is a build choice that trades a relic slot for shop power.

**HP steady-state (median):** expected damage taken ≈ 0.5 HP per F1 combat room, ≈ 1 HP per F2 room, ≈ 1–1.5 per F3 room, and 2–3 per boss (`progression-and-pacing.md` §4). Across 7 rooms that is ≈ 3.5 / 7 / 9 HP per floor. Sources per floor (heal door 2 + potion 2 + boss 4) ≈ 8. The median player reaches each boss at roughly 50–70% HP. A below-median player uses heal doors and potions, trading build growth for survival (L2), which is the right pressure for a roguelite.

---

## §4 Damage throughput reference (derived; for review and tuning)

DPS = Σ shot damage per cycle ÷ cycle time. Cycle = Σ cast delays + final max(delay, recharge) (mechanic-spec §4).

| Build (no relics) | Cycle | Shots/cycle | ≈ DPS (single target) | Mana/s vs regen |
|---|---|---|---|---|
| Starter [spark, spark] | 650 ms | 2 × 5 | **15** | 15 / 25 ✔ |
| Starter + double_cast | 400 ms | 2 × 5 | **25** | 25 / 25 ✔ |
| ember_rod [fire, fire, damage_up, fire] | 260 + 260 + max(310, 450) = 970 ms | 7 + 7 + 9.8 | ≈ 25 + burn 4 | ≈ 38 / 28 ✘ (~8 s from full) |
| twin_fork [damage_up, triple, fire, fire, ice] (2 groups/cast) | group 2 wraps → all drawn → fizzles; recharge max(450, 650) = 650 ms | 9.8 + 9.8 + 7 | ≈ 41 + burn | ≈ 63 / 32 ✘ (burst) |
| stormcaller preset [chain, double, spark, spark] | 280 + max(200, 600) = 880 ms | 6 (+3 jumps × 4.8) + 2 × 5 | ≈ 18 single / ≈ 35 multi-target | ≈ 30 / 45 ✔ |
| glass_needle [venom, speed_up, venom] | 60 + max(50, 300) = 360 ms | 2 × 2 + poison | ≈ 11 direct + poison 15 at 10 stacks (F1) | ≈ 42 / 34 ✘ |
| oak_staff trigger preset | 900 ms | spark 5 + fireball 10 + explode 10 | ≈ 28 (AoE) | 41 / 28 ✘ (~14 s) |
| archmage [triple, damage_up, fire, fire, fire, …] | ≈ 700 ms | 3 × 9.8 × up to 1.4… | 80–200+ | endgame |

Note the twin_fork row: putting damage_up *last* (e.g. [triple, fire, fire, ice, damage_up]) wastes it, because the second group wraps, finds every card drawn, and fizzles with the modifier pending. The editor preview (§7) must show "Empower: no spell follows" for this case.

~~Target band per floor (median build): F1 15 → 40 · F2 50 → 90 · F3 100 → 180~~ — **v1, retired 2026-09-27.** Those bands were never re-derived after v2 trimmed found-wand mana 15–25 %, cut the flat-stat relics (whetstone, mana_font, quill, hourglass) and made mana the binding constraint. In v2 **sustained DPS ≈ wand regen × damage-per-mana** (≈ 1.0 for spark, ≈ 1.75 for a forged spark II), so no build the reward economy can deliver by F3 reaches 100 — even a legendary archmage with two forged cards sustains ≈ 64.

**v2 band (sustained DPS = damage in the first 20 s from full mana ÷ 20; median counter-aware build; `scripts/balance-calc.mjs`):**

| | F1 | F2 | F3 |
|---|---|---|---|
| Band | **14 → 26** | **26 → 44** | **40 → 64** |
| Reference build (calc) | starter [double_cast, ice_shard, spark_bolt] = 16.3 (peak 26.3, dry 3 s) | stormcaller [double, fire, spark II, chain, ice, damage_up] = 32.6 | grave_scepter [spark II, chain, damage_up, triple, fireball, fire II] + tally_stone ×1.18 = 48.1 |
| Where the growth comes from | tutorial modifier + the pierce card | a tier-2 wand (regen 36) + one F1-shop merge | a rare F3 wand (regen 38) + a second merge + triple_cast + one scaling relic |
| Pool-weighted enemy HP (× floor hpMult 1.0 / 1.65 / 2.1) | 17.9 | 33.6 | 62.3 |
| Average enemy TTK at the reference build | 1.1 s | 1.0 s | 1.3 s |

The run's power curve is ≈ ×3 (16 → 48) and the per-enemy TTK holds ≈ 1.0–1.3 s on every floor: rooms grow by **count** (F2 and F3 run 3 waves), not by sponginess. That is the flow-channel claim (`progression-and-pacing.md` §4); F3 `hpMult` was cut 2.5 → 2.1 to keep it (at 2.5 the F3 enemy TTK was ≈ 1.6 s). The never-edits starter (16.2, flat all run) is *in* the F1 band on purpose — progression §14: the non-editor clears F1 sometimes.

---

## §5 Emergent strategies (predicted; none are pre-authored features)

| # | Name | Mechanic-combination signature | Why it emerges |
|---|---|---|---|
| S1 | **Trigger artillery** | `trigger_hit` + fast carrier (`spark_bolt` + `speed_up`) + heavy payload (`fireball`, `comet`, `toxic_flask`) | Payloads inherit nothing, so the player learns to put *speed* on the carrier and *power* in the payload: a slow nuke arriving at bolt speed. |
| S2 | **Vortex pit** | `vortex` (pull) + `toxic_flask` pool, or a `rune_mine` placed first | Pull is a knockback-channel impulse, so enemies are dragged into pre-placed zones or mines. Zone control out of two unrelated cards. |
| S3 | **Kamikaze blink** | `blink_bolt` + `explosive` (+ `blast_boots`) | Explosive appends `explode` to the blink bolt's `onExpire`, so you teleport *and* detonate at the arrival point. With blast_boots, dash out afterwards for a second blast. There's no self-damage, so it is safe but costs mana and recharge. |
| S4 | **Alchemist swap** | Wand A frost (`ice_shard`/`frost_nova`) + Wand B fire; or A poison stream + B fire finisher | Reactions only fire on an *existing* status, so the two-wand swap (120 ms) is the natural way to set up Melt ×2 or Blight bursts. This rewards carrying specialized wands. |
| S5 | **Boomerang shredder** | `boomerang_blade` + `split` + `chain` | Boomerang ends at your hand, and split fires on end, so a shard fan radiates *from the player* on every catch: a defensive nova for free. |
| S6 | **Overload engine** | `double_cast` [`fire_bolt`, `chain_lightning`] | Fire bolt burns the target, then the chain from the same cast arcs through burning enemies, each one Overloading (radius-32 AoE). A crowd-clear engine from two commons. |
| S7 | **Shatter cascade** | `frost_nova` + `frost_crown` + `shatter_heart` | Freezes at 2 stacks; frozen kills burst into 6 ice shards that chill neighbours toward freeze. A chain reaction without the reaction system. |
| S8 | **Ricochet cell** | `bouncing_burst` + `bounce` + `split` in small rooms | 7 bounces and a split on end fills 24×14 rooms. Room geometry (small crypt cells) changes the best wand. |
| S9 | **Orbit furnace** | `arcane_orbit` + `infuse_fire` + `kindling` | Burning orbs ignite everything that touches you; kindling turns every melee kill into an explosion. A melee-range "armor" build. |
| S10 | **Mine layer** | `triple_cast` + `rune_mine` + `range_up`, fired during retreat | Mines settle behind you as you kite. It turns chasers' pathing against them. |

---

## §6 Cross-mechanic dominance check

Pairs where one combination could be strictly better at every skill level:

| Pair | Strictly dominant? | Answer |
|---|---|---|
| `damage_up` vs `double_cast` on cheap spells | No | Double adds a shot (+100% vs +40%) but needs a second spell card and a slot. damage_up wins on single big spells (comet, fireball). The choice depends on deck composition. |
| `homing` vs `accuracy` | No | Homing −10% damage and can't see through walls. Accuracy is cheap and precise for skilled aim. Skill-expressive: low-skill → homing, high-skill → accuracy + damage. |
| `pierce` vs `chain` | No | Pierce needs enemies in a line (corridors, chargers). Chain needs clusters (swarms). Room geometry decides. |
| `explosive` vs `split` | No | Explosive is AoE at the end point; split is directional coverage. Explosive is better in open rooms vs clusters; split is better in bouncy small rooms. |
| Trigger payload vs plain multicast | No | The trigger delays the power by the travel time but delivers it at range, and it costs +10 mana plus a card. Multicast is immediate. |
| Fire vs other elements | Watched | Fire has the most content (4 cards, 2 relics) and two reactions (Melt, Blight). Counter: imps are burn-immune, Quench (frost removes burn) punishes careless mixing, and floor 3 adds many burn-irrelevant high-HP targets. **Declared:** fire is the "default strong" element, and frost, shock and poison offer control that fire lacks. |
| Glass needle (fast) vs archmage (big) | No | They are different shapes of play (stream vs burst, mechanic-spec §15). Archmage is legendary and floor 3 only. |
| Any relic strictly dominant | Watched: `sand_hourglass` and `quickened_quill` are universally good | Accepted as universally good *uncommons* (knobs, not new verbs). They are capped by `minCastDelayMs` 50 and `minRechargeMs` 60. |

---

## §7 Legibility surface (→ UX `hud-layout` and the wand editor)

**Must be visible (as game state or HUD):**
- HP (hearts, halves), shield pip, dash charges (refilling ring).
- **Active wand:** mana bar, a cast/recharge progress ring, **its slot strip with a "next card" cursor** (which card fires next is the central readable of the verb), and the two inactive wands as small icons with their ready state.
- Coins, bag fill (n/12), relic icons (hover or long-press for text).
- **Enemy status overlays:** burn, chill stacks (1–3 pips), frozen shell, shock sparks, poison stack count. Elite outline. Summoner tether (optional). Boss HP bar with phase-threshold ticks.
- Telegraphs for every attack (Animator), spawn portals, hazard marks, slam circles.
- Door reward icons (room kind + reward kind) when the room clears.
- **Wand editor preview (critical):** for the current slot order, show the per-cast shot list for one full cycle (cast 1: ×2 spark; cast 2: …), effective cast delay per cast, effective recharge, mana per cycle vs regen (a "sustainable ✔ / N s of fire ✘" readout), and ≈DPS. The data needed is exactly a dry-run of mechanic-spec §4 with the `spell` RNG sampled on a copy.
- First-time reaction toast (name + one line), recorded in the codex.

**Should stay hidden (system noise):**
- RNG streams and seed (the seed appears only on the run-end screen).
- Threat budgets, wave thresholds, flow fields, attack cooldown timers (the telegraphs carry that information).
- Crit rolls (the result shows as a bigger number; the chance is shown only in the editor's stat panel).
- The exact per-enemy statusChance roll outcomes.

---

## §8 Room economy and the shop

- **Room order:** clear → reward pedestal or pickup at room centre (draft 1 of N or a coin burst or heart) → doors open showing their options → walk through a door (the choice is committed on entry).
- **Rewards per room kind:** combat/elite → the door's reward; treasure → a wand (1 offered, swap-or-skip) or a relic (1 of 2), plus a bonus random card (`economy.rewards.treasureBonusCard`); shop → stock; boss → relic draft (3), coins 60, heal 4.
- **Draft rules:** N distinct ids of the reward kind, each rarity rolled from `economy.rarity.weightsByFloor[floor]` (loot stream), filtered to *unlocked* ids with `minFloor ≤ floor`. If a rarity bucket is empty, fall back to the next lower rarity. Duplicate cards in the bag are allowed; relics never repeat in a run.
- **Shop:** 6 pedestals per `economy.shopStock` (3 cards, 1 relic, 1 wand from floor 2 on (else a card), 1 heal potion). Price = base × `floorPriceMult[floor-1]` × relic mults, rounded to an integer. Reroll replaces all unsold card, relic and wand slots (heal stays). Cost 10, +10 per reroll in that shop; `merchant_seal` makes the first one free.
- **Salvage:** from the bag, any time: + ⌊0.3 × price at the current floor⌋.

---

# v2 additions (design-v2.md; Wave A1)

## §9 Counter matrix (archetype × question)

Each defence punishes a **different** archetype, so no single build shape is safe everywhere and re-slotting between floors pays. This is the systems core of v2. Ratings: ++ natural answer · + fine · − struggles · −− hard counter (still winnable: every defence erodes, `mechanic-spec.md` §9.6).

| Archetype (mechanic-spec §15) → | Shield (tomb_sentinel, Warden) | Armour (brute, golem, Colossus) | Ward (wraith, acolyte, Matron) | Swarm | Ranged anchor | Summoner | Boss adapt it triggers |
|---|---|---|---|---|---|---|---|
| **Stream** (spark / venom / rapid_cast, glass_needle) | − frontal volume is all blocked; + with one `pierce` modifier | −− direct × 0.4, poison DoT × 0.25 | **++ many small hits burn ward charges fast, with no shock needed** | ++ | + | + | Queen `veil` (cast rate > 5/s) |
| **Burst artillery** (fireball, comet, trigger payloads) | − blasts detonate on the shield face; ++ comet (pierce + blast) | **++ blast × 2.5** | −− each big hit wastes on one ward charge | + (AoE) | + | ++ (one-shot the source) | Knight `shield_wall` (≥ 3 shots/cast) |
| **Zone control** (mines, flask, vortex, orbit) | ++ orbit (pierce); − pools | ++ mines (blast); − pools (DoT × 0.25) | −− wards block DoT outright | ++ | − turrets outrange zones | + | — |
| **Elemental alchemist** (two-wand reactions) | − (no pierce by default) | + Overload counts as blast | ++ shock element strips wards | + | + | + | element resist (Knight fire, Queen poison, Lich dominant) |
| **Mobility** (boomerang, blink, dash relics) | ++ boomerang pierces; + flanking | − | + chain modifier = shock | + | ++ | + | — |

**Reading the matrix:**
- **Every archetype has at least one `−−`, and every column has at least one `++`.** The floor's door threats, mini-boss and puzzle each target one column, so the player sees the question and re-slots. The counter guarantee makes an answer reachable.
- **The hit-count ward** is a deliberate asymmetry: it is the one defence that *rewards* stream and punishes burst. Without it, burst would dominate every defended fight.
- **Flanking** is the skill answer to shields for any archetype (shields are frontal only). Kiting is the skill answer to armour. Target priority is the skill answer to acolyte wards.

## §10 v2 economy steady-state (computed from data, typical path)

> Re-computed 2026-09-27 after the balance pass (F1 combat budget 8 + 1.5/step; F2 combat back to 3 waves with coinMult 1.3 → 0.95 so F2 coin flow rises only ≈ 10 %; F3 hpMult 2.1, 0.7/step). Coin yield per threat point is unchanged on F1/F3, so the rate cliffs below still hold.

Threat per room = the `floors.json` budgets. Coin yield per threat point is pool-weighted from `enemies.json`: 0.47 / 0.50 / 0.53. Combat rooms at steps 1, 2, 3, 5 and 7 (the puzzle uses fixed waves), with 1 elite per floor.

| | F1 | F2 | F3 |
|---|---|---|---|
| Room HP totals (combat, pool) | 164 → 225 | 484 → 601 | 429 → 673 (+ armour 76 pts per animated armour) |
| Threat before the shop (combat s1–3 + elite) | 102 | 192 | 176 |
| + mini-boss coins | 25 | 35 | 45 |
| **Coins at the shop** (with carry) | **≈ 69** | **≈ 200** | **≈ 350** |
| What that buys | 1 common card + a merge (15), **or** 1 forge slot (45) | ≈ 3 items, or 2 + a merge | cash-out before the final boss (stock ≈ 570) |
| Skip pay per skipped draft | 10 | 14 | 18 |
| Draft reroll | 8 → 16 | 8 → 16 | 8 → 16 |

- **Equilibrium:** solvent (a heal or a slot is always affordable at the F1 shop) but never saturated before the F3 cash-out.
- **Rate cliffs:** skip pay above ≈ 25% of a common card price would make skipping the dominant choice. Reroll below 6 would make pity and the counter guarantee redundant.
- **Forge pressure:** 3 slot buys (45 + 70 + 95 = 210) compete with cards and relics. A slot is the *long* investment, a card the *short* one.

## §11 Duo and evolution graph

```text
DUOS (relic A + relic B → duo; offered only with both owned, weight x3, needs goal g_breaker)
  ember_heart   + frost_crown      ──► STEAM ENGINE   (Melt x3 + chill splash)
  storm_battery + kindling         ──► STORM FURNACE  (Overload arcs to 2)
  plague_vial   + alchemist_stone  ──► PLAGUE BLOOM   (Blight spreads half the stacks)
  thorn_mantle  + blast_boots      ──► THORN BLAZE    (hurt → explode r48)
  (kindling, storm_battery, frost_crown, plague_vial, thorn_mantle are also evolution catalysts ↓)

EVOLUTIONS (card x2 → level II at the forge; level II + catalyst relic → evolved card; relic kept)
  fireball ×2 → Fireball II ──+ kindling ──────► SUNBURST
  chain_lightning ×2 → II ────+ storm_battery ─► TEMPEST CHAIN
  ice_shard ×2 → II ──────────+ frost_crown ───► GLACIER SPIKE
  venom_dart ×2 → II ─────────+ plague_vial ───► BLIGHT NEEDLE
  spark_bolt ×2 → II ─────────+ prism_shard ───► PRISM SPARK
  boomerang_blade ×2 → II ────+ thorn_mantle ──► REAPER DISC
```

**Design properties:**
- **Every catalyst relic is also a duo parent or a status relic,** so a player walking toward an evolution is also walking toward a duo. Two payoffs compete for the same investment, which is a real choice.
- **The level-2 base must be a *slotted* card.** Evolutions and level-2 cards are `pool: false`: they come only from the forge, never from drafts (ADR 0014's principle).
- **Reachability in an 18-minute run:**
  - A merge needs 2 copies. Duplicates appear through drafts plus tag lean, so about one merge by F2 is typical.
  - An evolution additionally needs a specific relic. About one per 3 runs is expected, and the goal `g_forgewright` rewards the first.

## §12 v2 loops and dominance (additions to §2 and §6)

| Loop / pair | Type | Counter-pressure |
|---|---|---|
| **Tag lean** (owned tags → more of the same) | positive | Capped at × 2.25. The counter guarantee injects the *missing* keyword regardless of tags. Defences punish mono-archetypes (§9). |
| **Rarity pity** | negative (streak breaker) | resets on rare |
| **Counter guarantee** | negative (rescues a build lacking the answer) | one slot only; the player must still slot the card |
| **Mercy adapts** (mini-bosses) | negative | off at Heat ≥ 4 |
| `hollow_runes` + mega-multicast | risk of dominance | +40 ms per modifier; Knight `shield_wall` adapt; mana still pays for spells |
| `echoing_payload` + trigger artillery | **declared intended optimum** for trigger builds | rare relic; payloads still wasted on wards (§9); Archlich `mirror_volley` scales with shots |
| `hungry_rune` (corrupted) | positive-with-cost | × 1.5 recharge; only from the risk door |
| `unstable_core` | the only self-damage | opt-in; capped at half a heart per 2 s |
