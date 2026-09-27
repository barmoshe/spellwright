# Spellwright — `ftue-flow` + `prompt-trigger-spec`

**Owner:** UX Designer · **Status:** Wave 2, v1 · **Consumers:** Game Developer (prompt runner, `Save.setFlag`, triggers on the run bus), 2D Artist (prompt panel, keycap and pad glyphs), Animator (prompt in/out, the completion tick), Audio Director (prompt cue moments).
**Built on:** `content-inventory.md` §1 (the designer's first-run teaching sequence and prompt-trigger briefs; this doc realises them), `progression-and-pacing.md` §1.1 (tutorial rooms on the first run only; `tutorialDone`), `mechanic-spec.md` §1 (first meaningful execution = 2 inputs, < 5 s), `save-schema.md` (`meta.ftue` flags), `hud-layout.md` §5–§6 (toasts and in-world prompt placement), `wand-editor-ux.md` §3.5 (the editor's entry with a held card).

---

## §0 Shape of the first session

**The level teaches; text only names the input.** Every prompt below is ≤ 7 words plus a device glyph. None is modal. None pauses the game, with one exception: the editor opening on the first modifier (P3), which is the *verb* being taught, not a tutorial overlay. The player can skip it with one press.

```text
Title ─Start Run─► SANCTUM (move+cast) ─door─► FIRST BLOOD (cast under pressure) ─clear─► draft: 3 modifiers
   │                P1 move? P2 cast?             P2b hold?                                 │ Take
   │                                                                                        ▼
   │                                                          EDITOR opens, card in hand (P3) ─place/Esc─►
   │                                                                                        │
   └─ first input unlocks audio          THE GAUNTLET (dash) ◄─door─────────────────────────┘
                                          P4 dash (brute spawn → until the first dash)
                                                   │ clear → draft: fire/ice/venom → P5 on the first status
                                                   ▼
                                          FIRST DOOR CHOICE (P6) ── tutorialDone = true (designer rule)
```

**Time-to-agency targets (falsifiable at Wave 5 by stopwatch on a fresh profile):**

| Moment | Target (median, new player) | Ceiling |
|---|---|---|
| Title → controllable character | ≤ 3 s (1 confirm + 220 ms room fade) | 5 s |
| First cast | ≤ 8 s | 15 s |
| First crate broken (first meaningful execution) | ≤ 12 s | 25 s |
| First modifier slotted | ≤ 90 s from Start Run | 150 s |
| First dash | ≤ 150 s | 240 s |

---

## §1 Prompt catalogue

**Legend:** *Trigger* = a player-state condition (never a wall-clock timer from scene start; "idle for N s" is measured player inactivity, which is player state). *Complete* = the condition that writes the flag permanently. *Show cap* = the maximum number of displays without completion before the prompt retires for good.

| ID | Teaches | Where | Trigger (player state) | Presentation (KB+M / Pad) | Complete → flag | Show cap | Suppressed when |
|---|---|---|---|---|---|---|---|
| **P1** | Move | any room while `ftue.move` is unset (in practice: the Sanctum) | move intent magnitude < 0.2 for **3 s** of controllable time (the timer starts after the room fade ends; modals don't count) | above the player: `[WASD] Move` / `(L) Move` | **1.0 s** of cumulative movement → `ftue.move` | 3 | never (it can't be harmful) |
| **P2** | Aim + cast | while `ftue.cast` is unset | (**a**) within **3 tiles** (48 px) of any crate or enemy and no cast for **2 s**, or (**b**) **6 s** of cumulative movement with no cast (the fallback for a player who never approaches the crates; the designer brief only covers (a)) | above the player: `[Mouse] Aim · Hold [LMB] Cast` / `(R) Aim · Hold [RT] Cast` | the first cast → `ftue.cast` | 3 | the hints setting is off |
| **P2b** | Hold, don't tap | any combat room | **≥ 5 cast presses each < 200 ms within 5 s** and `ftue.holdCast` unset (content-inventory §1 row 1) | above the player: `Hold [LMB] to keep casting` / `Hold [RT] …`. **If Cast mode = Toggle** (`settings-spec.md`): `[LMB] toggles casting` | one continuous cast-hold ≥ 1 s (or, in toggle mode, one toggle-on lasting ≥ 1 s) → `ftue.holdCast` | 2 | hints off |
| **P3** | Slot a modifier | the first draft pick of a card when `ftue.slotModifier` is unset (the scripted `tutorialReward` on the first run) | Reward **Take** on a modifier/multicast/trigger card | the wand editor opens with the card **held** (`wand-editor-ux.md` §3.5). The first empty slot of the equipped wand gets a 2-frame pulse (static outline under reduced motion). Detail pane C shows the coach line: **"Put it in any slot. Every slot works — watch the preview."** The held-over-slot preview shows the DPS delta (the teaching payoff: "≈DPS 15 → 25 ▲"). | the card is placed into **any wand slot** → `ftue.slotModifier`. The completion tick shows on the slot. | 1 (P3b covers a refusal) | never (the editor opening is the verb itself; one Esc skips it) |
| **P3b** | The editor exists | after P3 was skipped (Esc → the card went to the bag), or any time later | at `room:enter` / `room:cleared`: `ftue.slotModifier` unset **and** the bag has ≥ 1 card **and** the equipped wand has ≥ 1 empty slot **and** the editor was never opened by the player (`ftue.editorOpened` unset) | toast: `[Tab] Edit wands — slot your new card` / `[View] Edit wands …` | the player opens the editor by Tab/I/Back → `ftue.editorOpened` (and `ftue.slotModifier` once they place a card) | 2 | hints off |
| **P4** | Dash | while `ftue.dash` is unset | a **charge** attack, or any attack with damage ≥ 2, **enters its spawn portal** in the player's room (in the first run: the Gauntlet's brute) | above the player: `[Space]/[RMB] Dash — dodge through attacks` / `[A]/[LB] Dash …`. The prompt stays until completed or the room clears. At each **windup start** of such an attack whose threat shape includes the player, the prompt brightens for the windup's duration (reduced motion: its frame thickens instead of pulsing) | the first dash → `ftue.dash` | 2 rooms | hints off |
| **P5** | Statuses | the first application of each status by the player's damage | `status_apply` event with status S when `ftue.status.S` is unset | toast (H14): "Burning — fire damage over time" · "Chilled — slowed; 3 stacks freeze" · "Frozen — can't act, takes ×1.5" · "Shocked — stunned, then takes ×1.25" · "Poisoned — stacks up to 10" | on show → `ftue.status.S` (informational) | 1 each | hints off |
| **P6** | Door choice | the first time a **choice** door pair (`D`) is open | the player comes within 48 px of either door and `ftue.doors` is unset | the door label (`hud-layout.md` §6) gains a second line: "Each door shows its room and reward. Walk in to choose." | the player enters any door → `ftue.doors` | 2 | hints off |
| **P7** | Reactions (discovery, not teaching) | the first time each reaction fires | `reaction_first` (mechanic-spec §8.3) | the damage number is prefixed with the reaction word, then a toast: "Melt! Fire on frozen: ×2 damage" · "Overload! Shock on burning: blast" · "Blight! Fire on poison: burst" · "Superconduct! Shock on frozen: ×1.5, chills nearby" · "Quench — frost put out the burn" · plus the codex entry | on show → the codex records it (designer-owned counter `all_reactions`) | 1 each | **never** (a content reward, not a hint; recorded in the codex) |
| **P8** | Wand switching | the first time the player carries ≥ 2 wands | on acquiring the 2nd wand: shown at the next moment with no living enemies within 160 px (immediately in a cleared or treasure room) | above the player: `[Q]/[Wheel] Switch wand · [1]–[3]` / `[RB]/[Y] Switch wand` | the first wand switch → `ftue.wandSwap` | 2 | hints off |
| **P9** | Mana skips | the first **mana** sputter (not an empty-group fizzle) | `sputter` with reason `mana` and `ftue.sputter` unset | toast: "Out of mana — {card} was skipped. Mana refills over time." | on show → `ftue.sputter` | 1 | hints off |
| **P10** | Shop | the first shop visit | within 48 px of a shop pedestal or the shopkeeper, `ftue.shop` unset | the interact prompt adds: "Spend coins. [Tab] edits wands here too." | the first shop modal opened → `ftue.shop` | 1 | hints off |
| **P11** | Wand offers | the first wand-offer modal (S4w) | S4w opens with `ftue.wandOffer` unset | a coach line on the offer panel: "Wands differ in slots and speed. Your cards are never lost." | on show → `ftue.wandOffer` | 1 | hints off |

**Designer-brief deviations (flagged, with reasons):**
- **P4 fires at the brute's spawn portal, not at its first windup.** Reading a 7-word prompt and then acting takes more than the 700 ms charge windup for a new player: a ~250 ms reaction floor plus reading time (≈ 200–250 ms per word). A prompt that appears *at* the windup start teaches by failure. Showing it from the 700 ms portal onward and brightening it at each windup keeps the designer's "on the windup" moment as the emphasis while giving the reading time. The trigger is still player state (an enemy of the teaching type has arrived), not a timer.
- **P2 has a fallback trigger (b)** for a player who wanders without approaching the crates. Without it, a player who never goes near the crates never learns to cast. That is a dead end in onboarding.

---

## §2 Runner rules (normative)

1. **One verb prompt at a time** (P1, P2, P2b, P4, P8 share the above-player slot). Priority when several trigger together: P4 > P2 > P1 > P2b > P8. A lower-priority prompt waits in a queue and re-checks its trigger when the slot frees (so it doesn't show stale).
2. **Toast prompts** (P3b, P5, P9) use the H14 queue (`hud-layout.md` §2.1); max 2 visible.
3. **Never shown** during: an open modal, a room fade, the boss intro (`bossActivateDelayMs`), the death fade, or the victory beat. Pending prompts queue and re-validate their trigger when shown.
4. **Completion beats display.** A flag is written when its *complete* condition is met, even if the prompt never showed. Example: a player who dashes in the first room never sees P4.
5. **Never repeats after completion:** completion flags live in `save.meta.ftue` (`save-schema.md`), are written through `Save.setFlag`, and persist across runs. A prompt with its flag set is dead forever, unless the player uses "Reset tutorial" in Settings.
6. **Show caps:** every display increments `ftue.<id>.shown`. At the cap without completion, `ftue.<id>.retired = true` and it never shows again. This stops nagging a player who knowingly ignores a hint (e.g. a tap-caster by choice).
7. **Completion feedback:** the prompt fades out over 150 ms, with a ✔ glyph for 300 ms in its place (reduced motion: the ✔ appears and disappears; no fade). The `ui_confirm` cue plays at −6 dB. There is no score or praise text.
8. **Skippable:** Settings → Gameplay → **Tutorial hints** (default On) suppresses every prompt marked "hints off" above. The scripted tutorial rooms still run on the first run (they teach through layout, with no text) (`progression-and-pacing.md` §1.1). No prompt ever blocks input, so skipping one is just not following it.
9. **`tutorialDone`** (designer rule: set when F1 step 3's doors open) is stored as `save.meta.ftue.tutorialDone`, next to the prompt flags. "Reset tutorial" clears all `ftue.*` flags, **including** `tutorialDone`, so the next run replays the tutorial rooms. The settings row states this.
10. **Glyphs** follow the last active device (`hud-layout.md` §3.5). A prompt already on screen swaps its glyph live when the device changes.
11. **Rebinding:** prompts render the *current* binding (`save.settings.bindings`), never a hard-coded key.

---

## §3 Flags (the complete `save.meta.ftue` namespace)

`move · cast · holdCast · slotModifier · editorOpened · dash · status.burn · status.chill · status.freeze · status.shock · status.poison · doors · wandSwap · sputter · shop · wandOffer · tutorialDone` + per-prompt `<id>.shown` (int) and `<id>.retired` (bool). Reaction discovery lives in the designer's codex and counters (`progression-and-pacing.md` §7), not here.

---

## §4 Why this holds up without a tutorial overlay (onboarding DOG)

- **Meaningful agency fast:** the first crate breaks within the §0 targets because the only exit is through the crates, the wand is already in hand, and the first execution is 2 inputs (mechanic-spec §1).
- **Taught through play:** move, cast, slot and dash each have a room whose layout forces the verb (content-inventory §1). Prompts only name the input.
- **State-driven, not timed:** every trigger in §1 is a player-state predicate (inactivity, proximity, press pattern, spawn of a teaching enemy, inventory state).
- **Introduce → isolate → recombine** is the designer's room order. The prompts attach to the *introduce* beat only and never reappear in the recombine rooms.
- **Holds with hints off:** with every "hints off" prompt suppressed, the layout still gates the Sanctum door behind casting and the Gauntlet lane still rewards dashing. The editor still opens on the first modifier pick (P3 is not a hint; it is the verb's entry point).
