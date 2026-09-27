# Spellwright — Wand Editor UX (Pause → **Wands** tab)

**Owner:** UX Designer · **Status:** Wave 2, v1 · **Artifact:** ad-hoc `wand-editor-ux` (a `screen-graph` S3 detail; candidate for adoption into `contracts/artifacts.md` if the Animator's or 2D Artist's specs also cite it).
**Consumers:** Game Developer (`PauseScene` wands tab, `src/spells/preview.js`, `RunState.moveCard`), 2D Artist (`ui-artwork`: card frames, slot cells, icons at 32 and 16 px), Animator (pick/place/swap motion), Audio Director (card UI cues).
**Built on:** `mechanic-spec.md` §3 (wand model, edits reset the deck), §4 (the cast algorithm the preview dry-runs), §11 (worked examples, reproduced below as preview renders), `systems.md` §7 (the legibility surface: "which card fires next is the central readable of the verb"), `architecture.md` §5.3b (`previewCycle`).

The editor is where the player *writes the program*. Its one job: **the player can predict what the wand will fire before closing the editor.** Everything below serves that sentence.

---

## §1 Does editing pause combat? — **Yes. Full pause, available at any time, including mid-combat.**

The editor is the Pause scene's Wands tab (scene-flow §1), so opening it pauses the simulation coherently (`scene.pause('run')`). The **cost** of a mid-fight edit already exists in the rules: closing the editor after a change forces a full recharge of every changed wand (`rules.casting.editForcesRecharge`, mechanic-spec §3.3). That cost is 280–900 ms plus the static card adds, and it is spent while enemies are live. It is a real tempo tax, so the pause can't be abused to skip a recharge.

| Option | Why not chosen |
|---|---|
| Edit only when the room is cleared | It forces the player to finish a fight with a wand they already know is broken (a mana-starved program, or an imp-immune fire wand). Recovery after a bad draft is the Death Spiral's (L2) main valve. It also contradicts pause-anytime, which is an accessibility floor (`accessibility-spec.md` §5): a player who must stop mid-fight loses the editor entirely. |
| Edit with time-slow (Hades-style menu slow) | Slotting is spatial-sequential reasoning (predict the cast order). Doing it under live threat is dual-tasking and gives a large advantage to mouse drag over pad or keyboard focus navigation (a motor-accessibility inequity). Esc-pause exists anyway, so a slowed editor would just be a worse pause. |
| **Full pause (chosen)** | Genre match: Noita halts the simulation while the wand inventory is open, and Magicraft's wand editing likewise happens in a paused inventory (obs.). Cost is enforced by the forced recharge, not by time pressure. The crafting valley between rooms (20–40 s, `progression-and-pacing.md` §2) is unaffected. |

**Mid-combat feedback.** When the editor opens while enemies are alive, the footer shows (on the right) "PAUSED — changed wands recharge when you close" with the ↻ icon. When a wand is changed, its card in column A shows ↻ plus the recharge duration it will pay ("↻ 0.40 s"). After closing, the HUD slot strip shows that recharge filling (`hud-layout.md` §3). The player sees the cost before, during and after.

**What counts as a change (UX-recorded assumption, flagged to the Game Designer).** A wand is "changed" when its `slots` array at close differs from its `slots` array at open. Moving a card out and back again, or pressing **Revert**, is not a change and forces no recharge. The rule's intent is untouched: the exploit it closes (edit to reset the deck) needs a real change to the deck, which still pays. Punishing exploration that ends where it began would teach players not to experiment, the opposite of what this screen is for. Bag-only changes (salvage) never force a recharge.

---

## §2 Layout at 640×360 (internal px; every coordinate is top-left, inclusive)

```text
x: 0     8                  128 136                                              520 528          632 640
y:0 ┌──────────────────────────────────────────────────────────────────────────────────────────────┐
  2 │ [Q/LB]        ‹ WANDS ›   Relics    Map    Codex    Menu                          [E/RB]     │ tab bar 2–18
 22 │ ┌A: WANDS──────┐ ┌B: apprentice wand ─────────────────────────── Slots 2/4 ┐ ┌C: DETAIL──────┐ │
    │ │[icon] Appren-│ │  1    2    3    4                                       │ │    [icon 32]   │ │
 42 │ │ tice Wand  ✋│ │ ┌──┐ ┌──┐ ┌──┐ ┌──┐                                     │ │  Spark Bolt    │ │
    │ │ 2/4 slots    │ │ │SB│ │SB│ │--│ │--│      (up to 10 cells, 38 px pitch)  │ │ ◆ SPELL·Arcane │ │
 64 │ ├──────────────┤ │ └──┘ └──┘ └──┘ └──┘                                     │ │ Common         │ │
    │ │[icon] Ember  │ │ └─1──┘└─2──┘   ▲next                                     │ │ Mana        5  │ │
    │ │ Rod   ↻0.45s │ │ Bag 3/12                                               │ │ Delay  +0.00 s │ │
106 │ ├──────────────┤ │ ┌──┐┌──┐┌──┐┌──┐┌──┐┌──┐   ┌────────────────────┐        │ │ Damage      5  │ │
    │ │ (empty wand  │ │ │  ││  ││  ││  ││  ││  │   │  SALVAGE           │        │ │ Speed     300  │ │
    │ │  slot)       │ │ └──┘└──┘└──┘└──┘└──┘└──┘   │  drop a card for   │        │ │ Range  13 tiles│ │
148 │ └──────────────┘ │ ┌──┐┌──┐┌──┐┌──┐┌──┐┌──┐   │  coins             │        │ │ Spread   ±2°   │ │
    │ WAND STATS       │ └──┘└──┘└──┘└──┘└──┘└──┘   └────────────────────┘        │ │ ─────────────  │ │
194 │ Slots      2/4   │ CAST PREVIEW · one cycle from full mana · includes relics│ │ A quick, cheap │ │
    │ Mana   60 +25/s  │ 1 [SB]        → Spark Bolt · 5 dmg            wait 0.25s│ │ arcane bolt.   │ │
    │ Cast delay 0.25s │ 2 [SB]        → Spark Bolt · 5 dmg        recharge 0.40s│ │                │ │
    │ Recharge   0.40s │                                                         │ │                │ │
    │ Spread      ±3°  │ Cycle 0.65 s · ≈15 DPS                                  │ │                │ │
    │ Speed     ×1.00  │ Mana 10/cycle · regen 25/s  ✔ Sustainable               │ │                │ │
    │ Spells/cast   1  │                                                         │ │                │ │
340 │ Shuffle      No  └─────────────────────────────────────────────────────────┘ └────────────────┘ │
344 │ LMB pick/place · RMB quick move · 1–3 wand · R revert · Tab close        ↻ Changed: recharges │ footer 344–358
360 └──────────────────────────────────────────────────────────────────────────────────────────────┘
```

### 2.1 Region table (normative pixel boxes)

| Region | Box (x, y, w, h) | Content | Focusable |
|---|---|---|---|
| Backdrop | 0, 0, 640, 360 | The frozen game at 30% brightness (70% black overlay). The HUD is dimmed underneath (scene-flow §3). | — |
| Tab bar | 8, 2, 624, 16 | 5 tabs, T1 labels, the active tab underlined 2 px; previous/next glyphs at both ends. | tabs (mouse), LB/RB, Q/E |
| **A1** Wand list | 8, 22, 120, 4 × 42 | One card per carried wand (up to `rules.player.wandSlots`; layout supports 4). Card 120×40: 32 px icon at +4,+4; name T1 at +40,+3 (≤ 2 lines, 12 px pitch); fill "2/4" in T1 at +40,+27 (v2: abbreviated from the T-small "2/4 slots"). **✋ equipped** marker (8×8 icon, top-right) = the wand active in combat. **Selected-for-editing** = 2 px bright frame plus a 2 px connector to region B. ↻ badge + duration when changed. An empty wand slot shows a dashed card "Empty wand slot". | yes |
| **A2** Wand stats | 8, 194, 120, 146 | 9 rows at 12 px pitch, label left and value right-aligned at x 127: Slots · Mana (max, +regen/s) · Cast delay · Recharge (**effective**, incl. every slotted card's `rechargeAddMs` and relic `rechargeMult`) · Spread · Speed · Spells/cast · Shuffle · Always cast (icon, or "—"). A value changed by relics shows a trailing `*`; focusing the wand card explains it in C. | no (read via the wand card) |
| **B1** Header | 136, 22, 384, 10 | Selected wand name (T1, left) · "Slots n/cap" (T1, right). | no |
| ~~**B2** Slot indices~~ | — | **Dropped in v2** (`accessibility-spec.md` §2.3 #14). Order is left to right; pane C names the slot. | no |
| **B3** Slot row | 137, 42, 38·cap − 2, 36 | `capacity` cells of **36×36** (32 px icon + 2 px frame), pitch **38**, left-aligned (so slot *n* is at the same x on every wand). Cap 10 → 378 px. An **always-cast** card (e.g. `echo_wand`) renders as an extra locked cell before slot 1 (lock badge, frame style "virtual", not draggable), and the row shifts right one pitch. Only wands with capacity ≤ 9 carry always-cast (data: `echo_wand` cap 4), so it always fits. | yes (each cell) |
| **B4** Next-card marker | under the next slot, y 79–81 | A 5×3 px chevron under the slot the next cast draws first (the same cursor as the HUD). Hidden and replaced by "↻" at slot 1 once the wand is changed. | no |
| **B5** Cast brackets | 136, 82, 384, 18 | Two lanes (y 82–90, y 92–100). One bracket per cast in the previewed cycle, spanning the slots drawn by that cast, labelled with the cast number (T1, lane 1 only; v2 lanes: lane 1 y 80–95, lane 2 y 97–101 line + ↩ only) centred in a gap. A cast that **wraps** draws its bracket to the row's end with a ↩ icon, then continues in lane 2 from slot 1 (dashed). Skipped (no-mana) cells inside a bracket get a slash overlay on the cell itself. **Shuffle wands:** brackets are hidden and the lane shows "Shuffled: order changes every recharge" (T-small). | no |
| **B6** Bag header | 136, 104, 384, 10 | "Bag n/12" T1. At 11/12 the text gains a ⚠ icon; at 12/12 it reads "Bag full" with ⛔ (shape, not colour alone). | no |
| **B7** Bag grid | 137, 116, 226, 74 | 12 cells of 36×36 in **6 × 2**, pitch 38 (rows at y 116 and 154). Filled cells hold the card icon; empty cells are dashed. | yes |
| **B8** Salvage bin | 380, 116, 136, 74 | Icon + "SALVAGE" T1 + "drop a card for coins" T1, wrapped (v2). While a card is held, the second line becomes "+{n} coins" (⌊0.3 × price at the current floor⌋, `systems.md` §8). | yes |
| **B9** Cast preview | 136, 194, 384, 146 | §5. Header line (T1) at y 196. **5 visible cast lines** at 17 px pitch from y 210 (16 px mini-icons need the 17 px pitch). A **summary block** is pinned at y 300–340 (3 lines at 13 px). The list scrolls when there are > 5 lines (casts + warnings); "▼ n more" shows at the list's bottom-right. Full rules in §5. | yes (each cast line, each warning line) |
| **C** Detail pane | 528, 22, 104, 318 | §4. Shows the focused item (card, wand, cast line or warning), or the held card, or the primer when nothing is focused. | no (read-only; scroll with the right stick or wheel if it overflows) |
| Footer | 8, 344, 624, 14 | Left: device-specific hints (§3.3). Right: change status (§1). | Revert and Close are clickable text buttons at the footer's left end. |

**Text roles** (`accessibility-spec.md` §2): T1 = body, the minimum for **all** text (cap height 7 px). v2 removed T-small; its former sites are ruled in `accessibility-spec.md` §2.3.

### 2.2 Card visual contract (aligned to `style-guide.md` §8 and `art-slot-map.md` §G3–G4; type must read **without colour**)

The 2D Artist's decision stands: **the card frame material carries the category**. Spells use the slate `ui_l 8` frame, stat and infuse modifiers the bronze `ui_l 32`, triggers the bronze-with-rivet-corners `ui_l 19`, and multicasts the bronze frame plus a `×n` badge. UX adds one requirement: **spell vs modifier must survive grayscale**. Slate and bronze are hue-only (mid-tone luminance 0.174 vs 0.197, **1.10:1**; see objection O-UX-4), so spells gain a non-colour badge:

| Card type | Frame (art) | Non-colour type cue (32 px editor / reward / shop) | 16 px HUD mini-card |
|---|---|---|---|
| **Spell** (`projectile`) | slate `ui_l 8` | **element-shape badge**, bottom-right, 7×7 on a `#2a2a3a` chip: arcane orb · fire teardrop · frost shard · shock zigzag · poison droplet (`style-guide.md` §2.3 shape families) (**O-UX-4**) | 3×3 element pip, bottom-right |
| **Modifier** (stat, infuse) | bronze `ui_l 32` | no badge (the absence *is* the cue against spells' badge) | plain |
| **Multicast** | bronze `ui_l 32` | `×2` / `×3` / `×4` badge, bottom-right (Kenney Mini, `#fdf7ed`, 1 px `#222222`) (art) | `×n` badge kept (2 glyphs, 5 px cap) |
| **Trigger** | bronze + rivet corners `ui_l 19` | `T` badge + condition glyph top-left: `!` on impact · `•` on end · `0.25` after time (art) | `T` badge kept |

- **Mana cost:** 32 px cells only, a T1 `#fdf7ed` number on a dark 12 px chip, bottom-left (v2: promoted from T-small). Omitted at 16 px.
- **Rarity:** the `rar-*` token pip (`style-guide.md` §2.4) plus the word in the detail pane. It is never on the frame, so it doesn't compete with type.
- **"NEW"** (first time a card is ever seen, `progression-and-pacing.md` §7): a 5 px star badge, top-right, until the card is focused once.
- **Grayscale test (falsifiable):** render all 43 cards at 32 px and at 16 px in grayscale. A reviewer must name each card's type (spell / modifier / multicast / trigger) correctly for all of them.

---

## §3 Interaction

### 3.1 Mouse

| Gesture | Result |
|---|---|
| Press on a filled cell, move ≥ 4 px, release on a target | **Drag-drop** (§3.4 rules). |
| Press and release on a filled cell without moving | **Pick up (sticky)**: the card is held and follows the cursor. The next click places it. This is a no-hold alternative to dragging (motor accessibility). |
| Click on a target while holding | Place (§3.4). |
| **Right-click** (or **Shift+click**, for trackpads) on a filled cell | **Quick move:** slot → first empty bag cell; bag → first empty slot of the *selected* wand. If the target is full, nothing moves and the reason shows in C ("Wand is full"). |
| Right-click while holding | Cancel: the card returns to its origin. |
| Click a wand card in A1 | Select that wand for editing (the equipped wand is unchanged). While holding a card, clicking a wand card instead **moves the held card into that wand's first empty slot**. |
| Wheel over B9 or C | Scroll that region. (The wheel is not wand-cycling inside the editor.) |
| Hover | Moves focus (only on real pointer motion; `screen-graph.md` §3.1). C updates. |

Held-card rendering: the 32 px icon at +4,+4 from the cursor at 90% alpha, with a 1 px dark drop shadow. The origin cell shows a dashed "ghost" outline. Valid targets get a 1 px bright inner frame; invalid targets (a full wand card) show the ⛔ badge.

### 3.2 Gamepad (Standard mapping) and keyboard-only

The focus cursor moves over one spatial grid: **A1 wand cards → B3 slots → B7 bag (6×2) → B8 salvage → B9 preview lines → footer (Revert, Close)**. Neighbours: left of slot 1 → the selected wand's card; down from the slot row → bag row 1 (same column index, clamped); right of the bag's last column → salvage; down from bag row 2 → the first preview line; up from the slot row → nothing (the tab bar is LB/RB).

| Action | Pad | Keyboard |
|---|---|---|
| Move focus | D-pad / left-stick flick | Arrows / WASD |
| Pick up / place (swap) | **A** | **Enter / Space** |
| Cancel held card, else close editor | **B** | **Esc / Backspace / Tab** |
| Quick move (slot ↔ bag) | **X** | **X** |
| Salvage focused or held card (→ D2) | **Y** | **Delete** |
| Previous / next wand (edited) | **LT / RT** | **1–4** select directly |
| Previous / next pause tab | LB / RB | Q / E |
| Scroll preview / detail | right stick | PgUp / PgDn |
| Revert all changes | focus footer **Revert** + A | **R** |
| Close | B (twice if holding), **Back/View**, Start | Tab (toggle), Esc |

While a card is held, the focus cursor carries it: the card draws lifted 4 px above the focused cell. Switching wands (LT/RT, 1–4) keeps it held, so **cross-wand moves are the same gesture as in-wand moves**.

### 3.3 Footer hints (device-swapped; T1)

- KB+M: `LMB pick/place · RMB quick move · 1–3 wand · R revert · Tab close`
- Pad: `A pick/place · X quick move · Y salvage · LT/RT wand · B close`
- While holding (either device): the first item becomes `… place` and `B/Esc` reads `cancel`.

### 3.4 Placement rules (v1: swap only. **Superseded in v2 by §10.3, insert-or-swap on every device**)

| Held card dropped on… | Result |
|---|---|
| an empty slot or bag cell | move there |
| a filled slot or bag cell | **swap**: the displaced card goes to the held card's origin cell. If the held card has **no origin** (a card just taken from a reward, `screen-graph.md` S4), the displaced card becomes the new held card ("hand-over"). |
| a wand card (A1) | move into that wand's first empty slot; if the wand is full → rejected, still held, reason shown in C |
| the salvage bin | D2 confirm (`screen-graph.md` §4) |
| empty space, right-click, B, Esc | return to the origin. No origin → first empty bag cell. Bag full → D3 (the default "Keep holding" means nothing is ever lost by reflex). |

Swap is the only placement semantic in v1 (as in Noita and Magicraft). Insert-and-shift (push cards right) is **deferred**. If added later it must be an optional accelerator (Ctrl+drop), never a required simultaneous press.

**Revert** restores every wand and the bag to their state at editor open, returns any held card, and clears all ↻ badges. It is disabled (with the reason "Nothing changed") when nothing differs.

### 3.5 Entry states

| Entered from | Initial state |
|---|---|
| Tab / I / pad Back in the run | Selected wand = the equipped wand. Focus = the slot under the next-card marker. |
| Esc, then the Wands tab | same |
| Reward **Take** (card) | The card is **held** with no origin. The selected wand = equipped. Focus = its first empty slot (or slot 1 if full), which gets a 2-frame pulse (static outline under reduced motion). The footer adds "Esc: put it in your bag". |
| Reward / Shop **Tab** (`returnTo`) | Like Tab from the run. Closing returns to the same offer (`screen-graph.md` §3.2). |
| FTUE first modifier (`ftue-flow.md` P3) | Reward Take state plus a coach line in C. |

---

## §4 Detail pane (region C) — tooltips with numbers

A persistent pane, not a floating tooltip. At 640×360 a floating tooltip would cover neighbouring cells (the ones the player is choosing between). A fixed pane works the same for mouse and pad, and the eye learns one location. Every number comes from data through i18n templates, never from hand-typed strings.

**Card (spell)**, top to bottom: 32 px icon · name (T1, ≤ 2 lines) · type chip (frame-shape icon + "SPELL" + element icon + element word) · rarity word · divider · rows (label left, value right, 12 px pitch): Mana · Delay (`+0.06 s`) · Recharge (`+0.30 s`, shown only if ≠ 0) · Damage · Speed · Range (`speed × lifetime` in **tiles**, rounded; e.g. 300 × 0.7 s = 210 px → "13 tiles") · Spread (`±2°`) · then only the non-zero ones: Pierce · Bounce · Homing · {Status} chance (`Burn 100%`) · Crit (`+10%`) · Pattern (`Ring ×8`) · Behaviour (`Boomerang`, `Orbit`, `Mine`) · Effects (`Explodes r32`, `Chains 3`, `Splits 3`) · divider · description (T1, wrapped at 100 px).

**Card (modifier / multicast / trigger):** the same header; rows = Mana · Delay · Recharge · then one row per effect, in player language: `damage ×1.4` → "+40% damage"; `pierce add 1` → "+1 pierce"; `element set fire` → "Becomes fire"; `onExpire append explode` → "Explodes on end (r24)". Multicast: "Casts the next {n} spells together · fan {deg}°". Trigger: "Carries the next spell; releases the one after on {hit|expire|timer n s}". A last row, **Rule** (T1, dim), gives the one-line rule of thumb from mechanic-spec §11 Ex 6: "Affects every spell that splits off after it."

**Card in context** (focused inside a slot): the rows above plus "Fires in cast {k}" and, if it is wasted or skipped in the preview, the reason line with ⚠ or ⛔.

**Wand card:** name, rarity, then every stat as *base → effective* where they differ ("Recharge 0.40 s → 0.70 s (+Comet 0.30)"), shuffle and always-cast explained in one line each, and the ↻ status.

**Cast line (B9):** the full breakdown of that cast: each shot with final damage (with the crit chance), speed, range, element, status chance, and effects; payload trees indented ("↳ on hit: Fireball 10 dmg · explodes r32 · burn 100%").

**Primer** (nothing focused, e.g. the mouse is over the backdrop), 4 lines, T1: "Cards fire left to right. / A modifier changes the spells after it. / Multicasts fire several spells at once. / After the last card, the wand recharges."

---

## §5 Cast preview (region B9) — the readable "cast order"

### 5.1 Source (seam request to the Game Developer; `architecture.md` §5.3b)

`previewCycle(wandDef, stateOverride, cards, rng.clone(), rules, playerMods)` with `stateOverride = { slots: <current edit>, cursor: 0, mana: manaMax, timers: 0 }`. The preview shows the program's **steady cycle from a reset deck at full mana**. Mid-cycle cursor state and current mana are the HUD's job, not the editor's. `playerMods` = relic `shot_stat` + `player_stat` (`castDelayMult`, `rechargeMult`, `manaMaxMult`, `manaRegenMult`), so the numbers match what will fire. The output per cast needs, beyond the `CastPlan` fields in `architecture.md` §5.1:

- `drawn[]`: `{cardId, slotIndex|'always', skippedNoMana:bool, wrapped:bool}` in draw order.
- `wasted[]`: modifier card ids still pending when a group fizzled (mechanic-spec §4 "fizzle: pending mods are lost").
- `inertTriggers[]`: triggers with no carrier, or capped at `maxTriggerDepth`.
- `truncatedShots:int`: shots dropped by `maxShotsPerCast`.
- `delayAfterMs` (the cast delay, or the recharge for the last cast).
- Cycle: `cycleMs`, `manaPerCycle`, `dpsSingleTarget` (§5.3), `maxManaSingleCast`.

It is recomputed **on every edit and on every focus change while a card is held** (the hover preview in §5.3). That is never per frame; the cost is ≤ 11 draws per cast (mechanic-spec §4), which is negligible.

### 5.2 Line grammar (T1; left to right)

```text
<k>  <mini-icons of the cards drawn, in draw order>  →  <shot groups>                <timing>
```

- `<k>`: cast number, x 138.
- Mini-icons: 16 px at pitch 17 from x 150, max 5, then a "+n" chip. Skipped cards carry a slash overlay. A virtual always-cast card carries a lock badge. The first card drawn after a wrap is preceded by a ↩ icon.
- `→` icon, then **shot groups** (x ≈ 250–480): identical shots merge as `2× Spark Bolt · 5 dmg`; different spells join with ` + `; modifier effects follow as short tags (`homing`, `pierce 1`, `bounce 3`, `explodes`, `splits 3`, `chains 3`, `fire`); a multicast fan appends `(fan 12°)`; a trigger renders as `Spark Bolt 5 ⟶ on hit: Fireball 10 + blast 10`.
- **Timing** (right-aligned at x 519, T1): `wait 0.25s`, or `recharge 0.40s` on the last cast of the cycle.
- Text that doesn't fit ends in `…`, and the full text is in C when the line is focused. This is the **only** truncation on the screen, and it always has a complete readout one focus away.

### 5.3 Summary block (pinned, y 300–340)

1. `Cycle 0.65 s · ≈15 DPS`. ≈DPS = (Σ direct damage of every shot in the cycle + one application of each `explode`/`zap`/`zone` first tick) × expected crit multiplier (1 + critChance·(crit.mult − 1)) ÷ cycle time. It excludes status ticks, chains beyond the first target, reactions and orbits' re-hits. This matches `systems.md` §4's single-target column. Label: "≈DPS (one target)".
2. `Mana 10/cycle · regen 25/s  ✔ Sustainable`, or `✘ 8 s of fire, then it sputters`, where seconds = manaMax ÷ (manaPerCycle/cycle − regen), rounded down.
3. `⚠ 2 warnings` (focus jumps to the first warning line), or blank.

**While a card is held over a target**, lines 1–2 show before → after deltas: `≈DPS 15 → 25 (+10)`, `Cycle 0.65 → 0.40 s`. Deltas use an ▲/▼ icon plus sign, not colour alone. This is the "immediately visible preview" — the player sees the result of a drop before dropping.

### 5.4 Warnings (list lines after the cast lines; the offending cell gets the same badge)

| Id | Condition (from the dry-run) | Badge | Text |
|---|---|---|---|
| W1 | `wand.order` empty and no always-cast | ⛔ | "This wand can't cast: it has no spells." |
| W2 | a card's `mana` > the wand's `manaMax` (after relics) | ⛔ | "{card} costs {m} mana; this wand holds {max}. It will always be skipped." |
| W3 | one cast's total paid mana > `manaMax` | ⛔ | "Cast {k} needs {m} mana; this wand holds {max}. {card} will be skipped." |
| W4 | `wasted[]` non-empty | ⚠ | "{modifier}: no spell after it in cast {k}. Wasted." |
| W5 | `inertTriggers[]` non-empty | ⚠ | "{trigger} has no {carrier|payload} in cast {k}." / "Trigger depth limit (3): payload ignored." |
| W6 | `truncatedShots > 0` | ⚠ | "Cast {k} makes {n} shots; only 32 fire." |
| W7 | not sustainable | ⚠ | (summary line 2 carries it; no list line) |

⛔ = an octagon glyph plus red. ⚠ = a triangle glyph plus amber. The shape carries the severity; the colour is redundant (`accessibility-spec.md` §3).

### 5.5 Worked renders (these must match mechanic-spec §11 exactly; a reviewer can check them by hand)

**Ex 1 — starter** `apprentice_wand [spark, spark, —, —]`
```text
1 [SB]        → Spark Bolt · 5 dmg                               wait 0.25s
2 [SB]        → Spark Bolt · 5 dmg                           recharge 0.40s
Cycle 0.65 s · ≈15 DPS (one target)
Mana 10/cycle · regen 25/s  ✔ Sustainable
```
Brackets: `1` under slot 1, `2` under slot 2. Next-card chevron under slot 1.

**Ex 2 — FTUE modifier** `[double_cast, spark, spark, —]` (held `double_cast` hovered over slot 1)
```text
1 [×2][SB][SB] → 2× Spark Bolt · 5 dmg (fan 12°)             recharge 0.40s
Cycle 0.65 → 0.40 s ▼ · ≈DPS 15 → 25 ▲(+10)
Mana 10/cycle · regen 25/s  ✔ Sustainable
```
The same card over slot 3 (`[spark, spark, double_cast]`) renders 3 lines, with the third reading `3 [×2]↩[SB][SB] → 2× Spark Bolt · 5 dmg (fan 12°)` and a wrap bracket. Every order works, and the preview proves it (the teaching guarantee).

**Ex 4 — wrap and fizzle** `twin_fork [fire_bolt, ice_shard, double_cast]`
```text
1 [FB][IS]     → Fire Bolt · 7 dmg · fire + Ice Shard · 5 dmg · frost        wait 0.36s
2 [×2]↩[FB][IS] → Fire Bolt 7 + Ice Shard 5 (fan 12°) · 2nd group fizzles  recharge 0.65s
```

**`systems.md` §4 twin_fork trap** `[triple, fire, fire, ice, damage_up]` → a W4 line: "Empower: no spell after it in cast 1. Wasted." Slot 5 carries a ⚠ badge.

**Ex 5 — mana skip** `[comet, spark]` on `apprentice_wand`, from full mana: no skip at full mana (60 ≥ 45). Line 2 of the summary reads `✘ 7 s of fire, then it sputters` (cycle = 0.65 s wait (250 + Comet +400) + 0.70 s recharge = 1.35 s; 45 mana per cycle = 33.3/s vs 25/s regen; 60 ÷ 8.3 ≈ 7 s), and C for the comet cell reads "Costs 40 of 60 mana: skipped when mana is low".

---

## §6 Capacity, bag and edge cases

- **Wand full** while holding: wand cards that are full show ⛔; dropping there is rejected with the reason in C.
- **Bag full** and the held card has no place to go: D3 with the default **Keep holding**. The editor can't be closed by `back` while a card is held and has nowhere to go. The first `back` shows D3, and choosing Keep holding returns to the editor. This isn't a trap: D3's other options, and every free slot, are one action away.
- **Taking a wand** (S4w) or **buying a card** (S5) never happens inside the editor. The editor only rearranges what the player owns.
- **Salvage** is available only here (and D3). Salvage value is shown before the confirm.
- **Moving the last spell out of the equipped wand** is allowed (W1 shows). On resume the wand sputters. Preventing it would block legitimate cross-wand rebuilds mid-edit.
- **Shuffle wand** (`chaos_branch`): brackets are hidden (§2.1 B5). The preview evaluates slot order with the note "Order varies each recharge; numbers shown for slot order", and ≈DPS is prefixed with "~".

---

## §7 Localization budgets (English baseline; +35% headroom for German-length strings)

| String slot | Region width | English max (data) | Budget (chars at ~5.5 px/char, T1) | Overflow rule |
|---|---|---|---|---|
| Card name in C | 100 px | 15 ("Trigger: Impact") | 2 lines × 18 | wraps; a 3rd line pushes the rows down (C scrolls) |
| Wand name in A1 | 76 px | 18 ("Archmage's Scepter") | 2 lines × 13 | wraps; never truncated |
| Stat labels in A2 / C | ~60 px | 11 ("Spells/cast") | 11 | labels may abbreviate via an i18n `.short` key; values are never abbreviated |
| Cast line shots | ~230 px | ~42 | 42 | `…` + full text in C (§5.2) |
| Warning line | 380 px | ~64 | 69 | wraps to 2 lines (the list scrolls) |
| Footer hints | ~440 px | ~72 | 80 | drops trailing hints right to left (Close is always kept) |

Glyph needs beyond ASCII (for the TA's `font-atlas`): `× ± °` (all in Latin-1, present in Kenney fonts). `→ ↩ ↻ ⟶ ▲ ▼ ✔ ✘ ⚠ ⛔ ✋ ↯` are **UI-atlas icons** drawn inline, not font glyphs (the Kenney fonts are Latin-1 only, `asset-inventory.md` §2.9).

---

## §8 DOG self-check (the editor's slice of `menu-and-settings-design` + `hud-design`: *predict before you close*)

1. **Falsifiable prediction test:** for every worked example in mechanic-spec §11, the preview lines (§5.5) state the exact shots, damage, fan and timing the example derives. A reviewer can check them by hand against the spec. ✔
2. **Immediate preview:** every drop's consequence (cycle, DPS, sustainability, warnings) is visible *before* the drop, via the held-over-target deltas (§5.3). ✔
3. **Spell vs modifier without colour:** element badge on spells, `×n` on multicasts, rivets + `T` on triggers pass the grayscale test (§2.2; depends on O-UX-4). ✔
4. **Every action on every device:** mouse (drag and sticky click), pad, and keyboard columns (§3). There is no required hold and no simultaneous press. ✔
5. **Cost of editing is visible:** ↻ before close, the footer status, and the HUD recharge after close (§1). ✔

---

## §9 Seams (requests to other roles, non-blocking)

- **Game Developer, UI intent channel** (`src/input/bindings.js` `KBM_UI` / `PAD_UI`; architecture §8): add editor-scoped UI intents `quickMove` (KB `X`, pad X=2), `salvage` (KB `Delete`, pad Y=3), `wandPrevUI` / `wandNextUI` (pad LT=6 / RT=7), `wandSelect1..4` (KB `Digit1..4`), `revert` (KB `R`), `scrollUp/Down` (KB `PageUp/PageDown`, pad right stick), and add `KeyI` to `KBM_UI.back` so I toggles the editor closed as Tab does. They are routed to the top overlay only, like every UI intent. They only act in the Wands tab; other screens ignore them.
- **Game Developer, `RunState`:** `snapshotLoadout()` at editor open and `revertTo(snapshot)`. Change detection = per-wand `slots` comparison at close (§1). The `moveCard(from, to)` API needs an origin-less "held" source (a card from a reward) and the D3 salvage/discard exits.
- **Game Developer, `previewCycle`:** the output fields in §5.1 and `stateOverride` (cursor 0, full mana).
- **2D Artist, `ui-artwork`:** the spell element badge (O-UX-4), cell states (empty-dashed, ghost, valid-target, invalid ⛔, changed ↻, skipped-slash, lock badge), the salvage bin, the bracket glyphs, and the 16 px mini-card set (`hud-layout.md` §7).
- **Animator (`motion-spec`, UI):** pick-up lift (4 px, 60 ms), place settle (2 frames), swap cross-slide (≤ 90 ms), invalid-drop shake (2 × 1 px, 80 ms; reduced motion: ⛔ badge only), editor open/close per `screen-graph.md` §7.
- **Audio Director:** `ui_card_pick`, `ui_card_place`, `ui_card_swap`, `ui_denied`, `ui_salvage`, plus a soft "preview changed" tick when the held-over-target DPS delta is positive (optional; never on every focus move).

---

## §10 v2: phone mode and insert-or-swap

**Status:** v2 Wave A1. Phone mode is the touch profile (`mobile-touch-spec.md` §5.1) inside the Wands tab. The layout stays 640×360 (§2). Only interaction, feedback and hit sizes change. §10.3 applies to **all** devices.

### 10.1 Touch gestures

| Gesture | Result |
|---|---|
| **Tap** a card (slot, bag or forge) | **select** it: a 2 px bright frame, and pane C shows its detail. It is *not* lifted, so inspecting is never moving. Tapping it again deselects. |
| **Tap a destination** while a card is selected | move it there per §10.3 (the same result as a drag). This is the single-pointer alternative to dragging (WCAG 2.5.7). |
| **Drag** a card | lift and move once the finger travels **> 6 game px** (`touchDragThresholdPx`; mouse stays at 4). Below the threshold it counts as a tap. |
| Drag off the editor, or onto empty space; `pointercancel` | the card returns to its origin (never lost) |
| Tap a wand card (A1) | select that wand for editing. With a card selected, it moves the card into that wand per §10.3 (its first valid position). |
| Vertical drag on the preview list (B9) or pane C | scroll. Items under the drag don't activate. |
| **Pane C action buttons** (touch only, replacing RMB/X/Delete/R) | at the bottom of pane C, stacked, each **100×24** (primary 100×37): **[To bag]** / **[To wand]** (quick move, whichever applies) · **[Salvage +{n}]** (→ D2) · **[Revert]** (enabled only if something changed). Plus the modal **Back** button (`mobile-touch-spec.md` §5.2). |

### 10.2 Drag feedback (touch)

- **Hot spot:** the drop target is the cell under `finger − (0, 16)` game px, not under the finger's contact centroid. The pad of the thumb sits below the point the player means, and the offset keeps the target visible just above the nail.
- **Ghost: 2× (64×64, integer scale)**, centred at `finger − (0, 56)` and clamped inside the canvas (it flips to *below* the finger when `finger.y < 72`, so it never leaves the top edge). α 0.9, with a 1 px `#222222` keyline. The mouse keeps the 1× ghost at +4,+4 (§3.1).
- **Delta chip:** beside the ghost (to the right, or to the left when near the right edge), in T1 on a `#2a2a3a` chip: `DPS 15→25 ▲` on line 1 and `mana 8 s→∞` on line 2 (the time until the wand runs dry, before → after, §11.1). It appears only while hovering a valid target, and it uses the same dry-run as §5.3. The finger may cover the summary block; the chip keeps the answer next to the eye.
- **Origin ghost:** a dashed outline, as §3.1.

### 10.3 Insert-or-swap (all devices; replaces v1's swap-only rule)

| Dropped on | Wand has an empty slot (the **origin counts as empty** during a same-wand move) | Wand is full |
|---|---|---|
| an **empty slot** | **place** there. Marker: **swap-ring**, a 2 px ring around the target cell. | — |
| a **filled slot** | **insert before it.** Marker: **insert-bar**, a 2 px × 40 px vertical bar at the target cell's left edge, with small ▸ arrows on the cards that will shift. The cards from the target up to the nearest empty slot on the right shift right by one. If there is no empty slot to the right, the cards between the nearest empty slot on the left and the target shift left, and the held card lands immediately before the target card. | **swap.** Marker: swap-ring + a translucent copy of the displaced card drawn in the origin cell. |
| a bag cell | **swap / place** (the bag is unordered; no insert) | — |

- **Why:** reordering a program is the core edit ("put Empower first"). With swap-only, it took up to *n* − 1 swaps. With insert, it takes one gesture, and a same-wand move always has an empty slot (its own origin), so reordering never degrades into a swap.
- **Pad and keyboard:** the same rule. A on a filled slot = insert while the wand has a free slot (or origin), else swap. The marker shows before the press, so the result is never a surprise.
- **Seam (Developer):** `RunState.placeCard(from, to, mode)`, where `mode ∈ {place, insert, swap}` is computed by one pure function, `placementFor(wand, fromRef, toIndex)`. The editor draws the marker from it, and the drop applies it. There is one source of truth. It needs no `check-spells` change, because placement is not casting.

### 10.4 Phone hit sizes

Editor cells stay 36×36 (they already exceed the 24 px floor). Wand cards (A1) are 120×40. Pane C buttons are ≥ 24 tall (primary 37). Tabs in the tab bar grow to 24 px tall in the touch profile (the tab bar spans y 0–24; the regions below shift down by 6 px, and the footer hint row is removed on touch because pane C's buttons replace it).

---

## §11 v2: mana pressure, Enables chips and counter pips

### 11.1 Mana bar: "mana per cycle vs regen" (summary line 2, replacing the text-only line)

```text
Mana  [██████████████|▒▒▒▒▒]  33/s · 25/s  Runs dry after 7 s
       └ regen part ┘ └ overspend (hatched) ┘
```

- **Bar** `(136, 314, 150, 6)`: the full length = `max(use/s, regen/s)`. The **solid** mana-coloured part = regen/s. A **1 px `#fdf7ed` tick** marks use/s. If use > regen, the part between regen and use is **hatched** (a shape, not a colour; the same hatch as the HUD's low mana).
- **Text** (T1, right of the bar; the free width is 227 px at 640×360, so the words are dropped. Developer objection accepted): `{use}/s · {regen}/s`, always in **use · regen** order. The bar supplies the meaning: the tick is use and the solid part is regen. Focusing the line shows the full labels in pane C ("29/s used · 18/s regenerated"). Then **"Never runs dry"** (✔) or **"Runs dry after {N} s"** (⚠), where N = ⌊manaMax ÷ (use − regen)⌋ (the §5.3 formula). use/s = `manaPerCycle ÷ cycleSeconds` from `previewCycle`.
- **Held-card preview:** the bar animates to the after-state while a card hovers a target, and a ghost tick shows the before-state (reduced motion: it jumps, with the ghost tick kept).
- **Why it leads the summary in v2:** the starter now overspends by design (`specs/v2-overhaul-plan.md`: scarcer starter mana). "Runs dry after 7 s" is the sentence that makes building a wand matter, so it gets a bar rather than a clause.

### 11.2 Enables chips (summary line 3)

- **What:** the **defence-breaking keywords** the wand's program actually produces this cycle: at most three, **PIERCE · BLAST · SHOCK** (`rules.keywords.defenceBreaking`). They are derived from the dry-run's **fired** shots using the data's own definitions:
  - PIERCE = a direct hit from a shot with composed pierce ≥ 1, or any boomerang or orbit shot;
  - BLAST = any explode, Overload or self-destruct damage;
  - SHOCK = shock-element damage, or a chain or zap effect.

  A keyword on a skipped or wasted card doesn't count; that card gets its W-warning instead. Because there are at most 3, the chips always fit.
- **Render:** `Enables:` in T1, then chips of `[ICON KEYWORD]`: a 12 px tall pill, T1 uppercase, with a 7×7 keyword icon (art). They are ordered pierce, blast, shock. With none: `Enables: —`. The ⚠ warning count stays right-aligned on the same line.
- **Descriptive keywords** (`rules.keywords.descriptive`: burn, chill, poison, homing, bounce, split, chain, multicast, trigger, crit, zone, orbit, mine, mobility) and card `tags` are **not** chips. They appear in pane C as a T1 "Tags: …" row, because they describe a card and don't open a defence.
- **Card detail (pane C):** a new row, **"Enables: [PIERCE]"**, for any card whose shots can carry a breaking keyword. Modifiers that grant one say "Adds PIERCE to the spells after it" (the modifier-scope rule, mechanic-spec §11).
- **Hover delta:** a chip gained by the held card flashes in with a `+` prefix, and a chip lost shows struck through (a line, not a colour).

### 11.3 Counter pips (per wand, region A)

- On each **wand card** in A1: a row of **counter pips** at `(x + 40, y + 27)` right of the "2/4" fill: one 7×7 pip per **defence type** (shield ← PIERCE, armour ← BLAST, ward ← SHOCK; `rules.defences`), filled = this wand counters it, hollow = it doesn't. This is the same derivation as the HUD's pips (`hud-layout.md` §9.3), but it shows **all** defence types (the editor is for planning, not reacting).
- **A2 wand stats** gains a row, **"Counters"** (label T1 + the same pips at 7×7 with pitch 9), after "Always cast". A2 grows to 11 rows, 132 of 146 px.
- **Door-threat link:** when the editor opens with the room's doors already shown, the next door's threat pip (`hud-layout.md` §9.6) pulses once on the matching pip of every wand that counters it. "Prep for the next room" is one glance.

### 11.4 Worked render (v2 data: `apprentice_wand` capacity 3, mana 50, regen 18/s, cast delay 250, recharge 400; a reviewer can check it by hand)

The starter `[spark, spark, —]`, with **Empower** (`damage_up`: 10 mana, +50 ms, damage ×1.4) held over slot 1 (an **insert-bar**: both sparks shift right into the empty slot 3):

```text
1 [EM][SB]    → Spark Bolt · 7 dmg (+Empower)                    wait 0.30s
2 [SB]        → Spark Bolt · 5 dmg                           recharge 0.40s
Cycle 0.65 → 0.70 s · ≈DPS 15 → 17 ▲
Mana  [██████████████|▒▒▒▒▒▒]  29/s · 18/s  Runs dry after 4 s ▼
Enables: —                                                        ⚠ 0
```

The derivation: before = 10 mana per 0.65 s = 15.4/s < 18, so it never runs dry. After = 20 per 0.70 s = 28.6/s; 50 ÷ (28.6 − 18) = 4.7 → **4 s**. The delta chip by the ghost reads `DPS 15→17 ▲ / mana ∞→4 s ▼`. This is the v2 lesson in one glance: power costs mana, and the bar says how much.
