# Spellwright — Worlds (three places, three questions)

**Owner:** Game Designer · **Status:** v2 Worlds addendum (user: "at least 2 worlds"; `v2-overhaul-plan.md` Addendum — Worlds) · **Data:** the additive `world` block on each floor in `data/floors.json`, 6 new enemies in `data/enemies.json` · **Validated by** `python3 scripts/design/build.py`: natives are disjoint across worlds, ≥ 3 per world, present in the world's pool; puzzle waves and mini-boss summons stay on-world; every anchored threat has a world anchor.
**Unchanged (Wave D builds against these):** the step graph, time budgets (18.0 min), tutorial path, room templates, mini-boss and boss ids.

---

## §1 The rule: each world asks one question

The three floors become three **worlds**. Each has its own place fantasy, tileset, music and ambience, a native roster, one signature twist, and a **counter emphasis**: the defence the world keeps asking about and the keyword that answers it. The world, its mini-boss, its puzzle room and its boss all tell the same story.

| | **W1: The Sunken Crypt** | **W2: The Drowned Halls** | **W3: The Last Library** |
|---|---|---|---|
| Fantasy (world card line) | "A candlelit ossuary where the dead still stand guard behind their shields." | "Flooded cloisters where lantern-bearers keep the drowned wrapped in wards." | "Endless shelves of forbidden books, guarded by armour that walks and tomes that bite." |
| Question → answer | **Shields → PIERCE** | **Wards → SHOCK** | **Armour → BLAST** |
| Natives (disjoint) | skeleton, bat, **bone_archer**, tomb_sentinel | **drowned_thrall**, **mire_leech**, lantern_acolyte, wraith, frost_mage | **animated_armor**, **bound_tome**, **ink_imp**, stone_golem |
| Guests (low weight, so other questions still appear) | slime, brute (step 5+), fire_imp (5+) | slime, eye_turret, tomb_sentinel, necromancer (5+) | brute, necromancer, wraith, tomb_sentinel |
| Door threats | none · swarm · **shield** · armour (5+) | none · swarm · shield · **ward** · ranged · summoner (no armour) | none · swarm · shield · ward · **armour** · ranged (tome) · summoner |
| Signature twist | **Candlelight** (mood + readability) | **Flooded** (water slows; shock arcs through water) | **Bookshelves** (cover that fire burns and blast destroys) |
| Mini-boss (step 4) | The Grave Warden: shield; raises a Tomb Sentinel | The Lantern Matron: ward; calls acolytes and re-wards her choir | The Iron Colossus: armour; quake and charge |
| Puzzle (step 7) | Sentinel Gate: sentinels + skeletons + bats | Choir of Wards: acolytes + wraiths, then thralls + leeches | Iron Hall: golems + ink imps, then animated armour + a tome |
| Boss | The Ossuary Knight: raises skeletons; `shield_wall` | The Mire Queen: broods slimes; `veil` (self-ward) | Vorn, the Archlich: summons wraith shades; `mirror_volley` reads your wand |
| Tileset / music / ambience keys | `tiles_f1` / `music.w1` / `amb.w1` | `tiles_f2` / `music.w2` / `amb.w2` | `tiles_f3` / `music.w3` / `amb.w3` |
| World card key | `world.w1.card` | `world.w2.card` | `world.w3.card` |

**Overlap before and after:**
- **Before:** floors 2 and 3 shared 10 of their 11–13 enemy types.
- **After:** native sets are **disjoint**. Guests total ≤ 25% of each pool's weight (F1 3/16, F2 5/20, F3 4/18; validated), so a world's first impression is its own.
- **Why guests stay:** the counter guarantee and the door threats need occasional *off-theme* questions (a shield door in the Library), so one keyword never answers a whole world.

---

## §2 New world-native enemies (6, no new AI)

Every native reuses an **existing** movement type and attack type (`mechanic-spec.md` §9.1, §9.3). They are data variants: stats, defence, element, immunities. **No new behaviour code** is needed for enemies.

| id | World | Archetype / role | Built from | Stats (F1-base; × world hpMult) | Defence | Attack (windup) | Counter it teaches |
|---|---|---|---|---|---|---|---|
| `bone_archer` | W1 | ranged_shooter / pressure | kiter + `shoot` (the cultist pattern) | hp 14, spd 42, threat 3 | — | bone_arrow, 1 shot @ 125 px/s (600 ms) | line of sight: pillars block it; its shots don't pierce cover |
| `drowned_thrall` | W2 | chaser / pressure | chaser + `melee_swipe` | hp 22, spd 34, threat 3, immune chill | **ward 2** | grasp, r22, 90° (500 ms) | **shock** strips its ward; stream burns the 2 charges |
| `mire_leech` | W2 | swarm / pressure (flying: skims water) | swarm movement (the bat pattern) | hp 7, spd 70, threat 1, immune poison | — | contact | AoE / chain; poison is useless on it |
| `animated_armor` | W3 | tank / **anchor** | chaser + `melee_swipe` | hp 20, spd 36, kb 0.7, threat 4, immune poison | **armour 36** | halberd, r30, 120° (550 ms) | **blast** (× 2.5 into armour) |
| `bound_tome` | W3 | turret / **anchor** | stationary + `ring` + `shoot` (the eye-turret pattern) | hp 24, threat 4 | **armour 20** | page_storm ring 10 (650) · ink_bolt 3-fan (550) | blast or burst; rooted, so zones and mines work |
| `ink_imp` | W3 | bomber / pressure | chaser + `self_destruct` (the fire-imp pattern) | hp 12, spd 64, threat 3, immune poison | — | ink_fuse, r34 (600 ms) | kill early, or kill mid-fuse next to armour |

**Art brief (2D Artist):** silhouettes must separate from their base pattern at 16 px:
- bone_archer: bow held out, left side.
- drowned_thrall: hunched, dripping, with a ward ring overlay.
- mire_leech: long and low, water shimmer.
- animated_armor: an empty helm with a visible gap.
- bound_tome: a book on a lectern, with chains.
- ink_imp: a black blot, purple fuse.

**Telegraphs (Animator):** reuse the base patterns' telegraph families. Only the sprites are new.

---

## §3 World twists (one signature per world; never hurts the player)

The twist block lives at `floors[].world.twist`; all numbers are in data. **Two twists need new engine behaviour** (flagged).

### 3.1 W1 Candlelight (`newBehaviour: false`)
- **Rule:** combat, elite and puzzle rooms play at ambient light 0.55.
- **Light:** 3–6 candle props per room each cast a 56 px light pool, and the player's spells light 28 px.
- **Readability guarantees:** enemies are always outlined, and **telegraphs are always full-bright**. Darkness can hide the room but never a threat.
- **Implementation:** reuses the existing `dark` twist renderer at a milder level. Candles are decorative light props (2D Artist + TA).
- **Why:** crypt mood, and it rewards moving toward the light, the Crypt's slow-and-careful pace.

### 3.2 W2 Flooded (`newBehaviour: true`, FLAGGED)
- **Placement:** a new tile `water` is placed at room build: every floor tile within 1 tile of a pit, plus 1–3 puddles of radius 2 tiles (run stream). It is never on `P`, doors, pedestals, `B` or spawn markers.
- **Movement:** walkers in water move × 0.8, the player and ground enemies alike. Flyers (leeches, wraiths) ignore it.
- **Shock conducts:** a shock hit on an enemy standing in water arcs to every other enemy in water within 40 px, at × 0.5 damage (elementless arc; no reaction; no player damage). The world's counter emphasis, shock, gets a place-based payoff.
- **Water quenches:** enemies standing in water can't be set burning (burn applications fail; existing burns continue).
- **Why:** the Drowned Halls should *feel* wet. Water slows everyone, so it is positional, not punitive, and it makes shock the world's star without shutting other builds out.

### 3.3 W3 Bookshelves (`newBehaviour: true`, FLAGGED)
- **Placement:** a new tile `bookshelf` replaces 50% of pillars (`o`) in combat, elite and puzzle rooms (run stream).
- **Rules:**
  - It blocks movement and shots like a pillar, with 12 HP (any damage chips it; ordinary shots take a long time).
  - A **fire** hit sets it burning for 2.5 s, applying burn to **enemies** within 24 px every 250 ms (`twist.burnAuraTickMs`). Then it collapses to floor.
  - A **blast** destroys it at once.
  - A burning shelf **never hurts the player**.
- **Why:** the Library's cover is flammable knowledge. Fire and blast builds reshape the room, opening firing lines against turrets (`bound_tome`), which pairs with the world's blast emphasis.

**Per-room twists** (`floors[].twists`, unchanged mechanics):
- Ambush stays in all worlds.
- `dark` now appears only in W3, because W1 is already candlelit and W2 is about water.
- This is a data-only change to twist lists.

---

## §4 World entry (card, music, first tip)
- **World card:** on entering step 0 of each floor, show the world name + the fantasy line + the question ("Shields ahead: bring PIERCE"), for about 2.2 s. It doesn't block input. UX owns layout and motion; the key is `world.wN.card`.
- **Audio:** the Audio Director fills `music.wN` and `amb.wN` from existing packs. W1: low choir and drips. W2: water, bells, distance. W3: page rustle, ticking, low brass.
- **First-contact tip** per world twist, once per save: "Water slows everyone. Shock spreads through it." / "Fire burns the shelves; blast breaks them."

---

## §5 Handoffs
- **Developer (after Wave D):**
  - Read `floors[].world` for the tileset, music, ambience and card.
  - **Implement the `water` and `bookshelf` tiles** (§3.2–§3.3; the only new behaviour).
  - Candlelight = the `dark` renderer with `ambientLight` 0.55 plus candle light props.
  - No enemy code changes.
- **2D Artist:** 3 distinct tilesets (keys exist: `tiles_f1..f3`, so they are not recolours), water + bookshelf tiles (intact / burning / collapsed), candle prop, 6 native sprites (§2).
- **Audio Director:** `music.w1..w3`, `amb.w1..w3`, and cues for water splash (throttled), shelf ignite and collapse, and the shock-arc zap.
- **UX:** world card, twist tips, codex world pages.
- **If CC0 art can't carry W3:** W1 and W2 must be fully distinct (plan rule). W3 then ships with W1's tiles recoloured, but keeps its roster and bookshelf twist, so it still *plays* as its own world.
