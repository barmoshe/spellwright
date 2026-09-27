# Spellwright — `screen-graph` + `navigation-contract`

**Owner:** UX Designer · **Status:** Wave 2, v1 · **Consumers:** Game Developer (`sceneflow.js`, every scene's input focus, `ui/Menu.js`), 2D Artist (screen-set scope for `ui-artwork`), Animator (screen-transition `motion-spec`), Audio Director (UI cue moments).
**Built on:** `specs/engine/scene-flow.md` (scene inventory, overlay protocol; this doc supplies screen *content*, back-stack and focus semantics, which scene-flow delegates to UX), `specs/engine/architecture.md` §8 (Intent + UI-intent channel), `specs/design/progression-and-pacing.md` §1, §7, §8 (run structure, meta, win/lose), `systems.md` §8 (room economy).
**Companion UX specs:** `wand-editor-ux.md`, `hud-layout.md`, `ftue-flow.md`, `settings-spec.md`, `accessibility-spec.md`.

---

## §0 Principles (the falsifiable rules this graph is checked against)

1. **No dead ends.** Every screen has at least one exit reachable by `back` alone (Esc / B), except the three documented *commit* screens (§4), whose exits are reachable by `confirm` alone on the default-focused item.
2. **No modal traps.** No modal can be opened from a state in which its own `back` would leave the player somewhere they cannot `back` out of. Irreversible actions (salvage, abandon, reset progress, leave an untaken reward, replace a wand) always go through an in-scene **confirm dialog** whose default focus is the *safe* option.
3. **`back` undoes the innermost state first.** Held card → dropped back to origin; open dialog → closed; sub-panel → parent panel; modal → closed. One press never does two of these.
4. **Every screen is fully operable by keyboard alone, by gamepad alone, and by mouse alone** (mouse alone: every action has a clickable control; keyboard alone and pad alone: every control is reachable by directional focus). No screen needs a simultaneous press, a hold, or a timed press.
5. **Depth ≤ 3 from the run** (run → pause → settings → rebind capture is the deepest path). Depth is justified by content count (§5).
6. **The run is always paused while any modal is open** (scene-flow §3). There are no timed decisions anywhere in the UI.

---

## §1 Screen inventory

`Scene` = the scene key from `scene-flow.md` §1. *Sub-panels* and *dialogs* are states **inside** their owning scene. They are not separate scenes and do not touch the overlay stack, so the scene-flow rule "one modal at a time, except pause → settings" stays true.

| # | Screen | Scene | Kind | Purpose (the one obvious next action) |
|---|---|---|---|---|
| S0 | Loading | `boot` | root | Progress bar only; no input. Auto-advances to Title. |
| S1 | Title | `title` | root | **Start Run** (default focus). |
| S1a | Run Setup (loadout and curse) | `title` sub-panel | sub-panel | Pick a loadout, then **Begin**. Shown only when ≥ 2 loadouts are unlocked or curses are unlocked; otherwise Start Run skips it. |
| S1b | Codex | `title` sub-panel (shared `ui/CodexView.js`) | sub-panel | Browse cards, relics, enemies, reactions and milestones. |
| S2 | Run (gameplay) + HUD | `run` + `hud` | root + parallel | Play. HUD never takes input (`hud-layout.md`). |
| S3 | Pause, tab **Wands** = the wand editor | `pause` | modal | Arrange cards (`wand-editor-ux.md`). |
| S3r | Pause, tab **Relics** | `pause` | modal tab | Read owned relics (name, effect with numbers, trigger count this run). |
| S3m | Pause, tab **Map** | `pause` | modal tab | Floor track for all 3 floors: visited rooms with kind and reward icons, the current step, the boss; run time and kills. |
| S3c | Pause, tab **Codex** | `pause` (shared `CodexView`) | modal tab | Same content as S1b, read-only mid-run. |
| S3n | Pause, tab **Menu** | `pause` | modal tab | **Resume** (default focus) · Settings · Controls (opens Settings on the Controls group) · Abandon Run. |
| S4 | Reward draft (cards or relics) | `reward` | modal | Take one offered item. |
| S4w | Wand offer (treasure or shop wand) | `reward` variant `mode:'wand'` | modal | Take the wand into a free wand slot, or swap it for a carried wand. |
| S5 | Shop | `shop` | modal | Buy an item, reroll, or leave. |
| S6 | Settings | `settings` | modal (from Title or Pause) | Change an option; changes apply live (`settings-spec.md`). |
| S6k | Rebind capture | `settings` dialog | dialog | Press the new key for one action. |
| S7 | Run End (death / victory / abandon) | `run-end` | root | **New Run** (default focus) · Title. |
| S7u | Unlocks | `run-end` sub-panel | sub-panel | Shown after S7 only if ≥ 1 milestone fired this run. **Continue**. |
| S8 | Credits (including CC-BY attributions) | `credits` | root | Read; **Back**. |
| D* | Confirm dialogs | owning scene | dialog | See §4. |

In-world UI (not screens, not stack entries; defined in `hud-layout.md` §6): door-choice labels, interact prompts, pedestal previews, boss name card, room-clear banner, floor title card, FTUE prompts, toasts.

**Relic pickup** has no screen of its own. Elite, treasure and boss relics are drafts (S4, `mode:'relic'`). A relic bought in the shop or from a single-offer pickup applies immediately and shows a toast (`hud-layout.md` §5) with its name and effect line. Pause → Relics (S3r) holds the full text.

**Floor map** has no standalone screen. It is Pause → Map (S3m). The floor title card (in-world, 1.8 s) shows it briefly on each floor arrival.

**Meta-unlock screen** = S7u.

---

## §2 Screen graph

```text
                    ┌──────────────── Credits (S8) ◄──┐
                    │ back                            │ confirm "Credits"
 Loading(S0) ──auto──► Title(S1) ──confirm "Start Run"──┬──(0–1 loadout, no curses)──────────► Run(S2)+HUD
                    │  ▲   │ "Codex" ─► Codex(S1b) ─back─┘│                                      │
                    │  │   │ "Settings" ─► Settings(S6) ─back─► Title                          │
                    │  │   └──(≥2 loadouts | curses)──► Run Setup(S1a) ──"Begin"──────────────►│
                    │  │                               back ─► Title                          │
                    │  │                                                                     │
                    │  │        ┌──────────── Tab / I / pad Back ──► Pause:Wands(S3) ◄─┐       │
                    │  │        │             Esc / pad Start ─────► Pause:Menu(S3n)   │ LB/RB, Q/E
                    │  │        │             focus loss ──────────► Pause:Menu        │ cycle tabs
                    │  │  Run(S2) ◄──back (any tab)── Pause ──────────────────────────┘       │
                    │  │    │   ▲                        │ Menu:"Settings" ─► Settings(S6) ─back─► Pause:Menu
                    │  │    │   │                        │ Menu:"Abandon" ─► D1 ─confirm─► Run End(S7){abandon}
                    │  │    │   └──back── Reward(S4/S4w) ◄── interact with reward pedestal / wand pedestal
                    │  │    │   └──back── Shop(S5) ◄──────── interact with shopkeeper / any shop pedestal
                    │  │    │        Reward/Shop ──Tab──► Pause:Wands {returnTo} ──back──► Reward/Shop (same offer)
                    │  │    │        Reward "Take" (card) ─► Pause:Wands {heldCard} ──back──► Run
                    │  │    ├──(HP 0, no revive)───────────────────────────────► Run End(S7){death}
                    │  │    ├──(Archlich dies, 2 s beat)───────────────────────► Run End(S7){victory}
                    │  │    └──(walk into door with untaken reward) ─► D4 ─"Leave it"─► next room
                    │  │                                                    └─"Go back"─► Run (door not entered)
                    │  └──── Run End(S7) ── "Title" ──────────────────────────────────────┐
                    │        Run End ── "New Run" ──► (Run Setup if eligible) ──► Run      │
                    │        Run End ──(new milestones)──► Unlocks(S7u) ──"Continue"──► back to S7 focus
                    └─────────────────────────────────────────────────────────────────────┘
```

**Unlocks placement (S7u).** The run-end summary shows first ("what happened"), with a banner "2 new unlocks" and the focus on **See unlocks**. Continue from S7u returns to S7 with focus on **New Run**. Rationale: the outcome is the player's first question. The unlock is the reason to press New Run, so it sits between the two.

---

## §3 Navigation contract (per screen)

Legend: **KB** = keyboard (UI channel `KBM_UI`: arrows/WASD navigate, Enter/Space confirm, Esc/Backspace back, Q/E previous/next tab) · **Pad** = gamepad (`PAD_UI`: D-pad/left stick navigate, A confirm, B back, LB/RB previous/next tab) · **M** = mouse (hover moves focus, click confirms, right-click = back on dialogs only).

| Screen | Entry points | Exits (action → destination) | `back` does | Default focus | Focus order / pad navigation | Notes |
|---|---|---|---|---|---|---|
| S0 Loading | app start | auto → S1 | nothing (no input) | — | — | Shows a progress bar and asset count. A load error shows the error text plus **Reload** (the only focusable). |
| S1 Title | S0, S7 "Title", S8 back, S1a back | Start Run → S1a or S2 · Codex → S1b · Settings → S6 · Credits → S8 · Fullscreen (toggle, stays) | nothing (root; there is no quit on the web) | **Start Run** | vertical list: Start Run, Codex, Settings, Fullscreen, Credits | The first input of any kind also unlocks audio (architecture §12). There is **no "press any key" gate**: it would be a dead step, since the first menu input unlocks audio anyway. Codex shows "Codex (new)" when entries were added since last viewed. |
| S1a Run Setup | S1 Start Run, S7 New Run (when eligible) | Begin → S2 · back → S1 | → S1 | **Begin** (the last-used loadout is pre-selected) | Row 1: loadout cards (left/right) · Row 2: curse level 0–3 (left/right; only after the first win) · Row 3: Begin | Locked loadouts show their milestone condition (for example "Defeat the Ossuary Knight"), never "???". |
| S1b / S3c Codex | S1, Pause tab | back → S1 / (tab) Pause | → parent | first category tab | Category tabs (Cards · Relics · Enemies · Reactions · Milestones) via LB/RB or Q/E; entry grid; detail pane on the right | Undiscovered entries show a silhouette and "Not yet found". Milestones always show the condition. |
| S2 Run | S1, S1a, S7 New Run, floor stairs | Tab/I/pad Back → S3 · Esc/pad Start → S3n · pedestal interact → S4/S4w · shop interact → S5 · death/victory → S7 | (Esc opens pause; it is not back) | — | — | Focus loss → S3n (scene-flow §3). Opening Pause is **queued** during a room fade (≤ 220 ms) and during the 700 ms death fade, and **refused** during the victory beat. |
| S3 Pause (all tabs) | S2 (Tab / Esc / focus loss), S4/S5 via Tab, S4 Take | back → S2 (or → the `returnTo` modal) | **Wands:** held card → drop it back; else close. **Other tabs:** close. | Tab from the entry key: Wands (Tab/I/Back) or Menu (Esc/Start/focus loss) | LB/RB or Q/E cycle tabs; the tab bar is also clickable. Tab order: Wands · Relics · Map · Codex · Menu | Tab or I while in Pause = `back` (toggle behaviour; architecture already binds Tab as UI back). Esc/Start on any tab = `back`. |
| S3n Pause:Menu | as S3 | Resume → S2 · Settings → S6 (stacked) · Controls → S6 on Controls · Abandon Run → D1 | → S2 | **Resume** | vertical | |
| S4 Reward draft | interact with a reward pedestal (E / pad X) | Take → card: S3 {heldCard}; relic: applies, → S2 · Tab → S3 {returnTo:'reward'} · back → S2 (**pedestal stays**) | close; the offer is kept unchanged | the **first** offered item | left/right across the 2–3 offers; down → "Your wands" strip (read-only focus for details) → footer (Edit wands · Close) | **There is no in-modal Skip.** Closing keeps the pedestal and its exact offer. Forfeiting happens only by leaving the room (D4). This removes the only irreversible action from a modal the player might close by reflex. |
| S4w Wand offer | interact with a wand pedestal, or buy the shop wand | Take (free wand slot) → S2 · Swap for wand *n* → D5 → S2 · back → S2 (pedestal stays; shop: purchase cancelled, no charge) | close | **Take** if a wand slot is free, else the carried wand with the fewest filled slots | left/right across carried wands; the new wand's panel is at the top | Swapping shows exactly which cards move to the bag and how many overflow onto the floor (D5). |
| S5 Shop | interact with the shopkeeper or any shop pedestal (focus starts on that pedestal's item) | Buy (confirm on item) · Reroll · Tab → S3 {returnTo:'shop'} · Leave/back → S2 | close | the interacted item, else the first affordable item | 2 rows: [card, card, card] / [relic, wand-or-card, heal]; down → Reroll · Leave | Unaffordable items stay focusable and show "Need 12 more coins". A disabled Buy always states its reason (bag full, HP full, too expensive). Buying a card keeps you in the shop, and the card goes to the bag with a toast; it does **not** jump to the editor, because a shop visit is a multi-purchase session. |
| S6 Settings | S1, S3n | back → parent (S1 or S3n) | dialog open → close it; else → parent | first group | Left rail: groups (up/down); right/confirm enters the group; items up/down; left/right adjusts sliders and toggles; back returns to the rail | Every change applies and saves immediately (debounced). There is no Apply/Cancel pair (`settings-spec.md`). |
| S6k Rebind capture | S6 Controls, confirm on a binding | the next key or mouse button → assigned · Esc → cancel | cancel | — | — | Esc can't be bound (it is the guaranteed way out). A conflict swaps the two bindings and says so in a line under the row. |
| S7 Run End | death / victory / abandon | New Run → S1a or S2 · Title → S1 · See unlocks → S7u (only if new) | → S1 (Title) | **See unlocks** if any are new, else **New Run** | vertical buttons; the summary panels are focusable for detail (final wands, relics) | Death shows the enemy that dealt the killing hit, with its icon. The seed is shown here only (`systems.md` §7). |
| S7u Unlocks | S7 | Continue → S7 (focus New Run) | same as Continue | **Continue** | the unlock cards are focusable for detail | Lists every newly unlocked id with icon, name, one-line desc, and the milestone name. |
| S8 Credits | S1 | back → S1 | → S1 | the scroll region | up/down scroll 12 px per step, PgUp/PgDn or LB/RB one page; wheel | Manual scroll by default (no auto-scroll, so it is reduced-motion safe). Content comes from `assets/credits.json` (TA Wave 3). CC-BY lines are verbatim (§6). |

### 3.1 Input focus rules (all screens)

- **One focused control at a time**, drawn with the focus ring defined in `accessibility-spec.md` §6: a 1 px bright ring plus a 1 px dark outer ring, visible on any background and not colour-dependent.
- **Mouse hover moves focus**, but only on actual pointer motion. A stationary cursor never steals focus from keyboard or pad navigation (this prevents the "cursor parked on a button" fight).
- **The last active device** (architecture §8) decides glyphs: KB keycaps vs pad buttons in every footer hint and prompt. The switch happens on the first meaningful input from the other device, never mid-press.
- **Focus memory:** re-entering a screen restores its last focus (per scene instance), except the documented defaults above for commit screens (S7, S1a).
- **Directional navigation is spatial:** the nearest focusable in the pressed direction by centre distance, weighted 2:1 against off-axis offset. Wrap-around is on only inside 1-D lists (menus, rails). 2-D grids stop at their edges; they don't wrap across regions unexpectedly.
- **UI intents go only to the top of the stack** (scene-flow §3). While a dialog is open inside a scene, the scene's other controls are inert (the dialog owns focus).
- **Gameplay input never leaks into UI:** `InputRouter.clearHeld()` on every modal close back to the run (scene-flow §3). Toggle-cast state (`settings-spec.md`) is kept across modals and shown on the HUD.

### 3.2 `returnTo` (Reward/Shop ↔ Wand editor) — a seam request to the Game Developer

Reward and Shop must reach the wand editor and come back **without the run resuming in between and without re-rolling the offer**. scene-flow allows only one modal at a time, so this is a *replace*, not a stack:

- `flow.replace('pause', {tab:'wands', returnTo:{key:'reward'|'shop', data}})` stops the current modal and launches Pause **without** `resume('run')`.
- On Pause close: if `returnTo` is set → `flow.replace(returnTo.key, returnTo.data)`; else the normal close (resume run).
- The offer lives in `RunState` (scene-flow §4: overlays never own run data), so the replaced modal re-displays the identical offer. The shop keeps its reroll count.
- Chains stay at depth 1: Pause opened with `returnTo` can't open another `returnTo` target.

---

## §4 Commit screens and confirm dialogs

| ID | Trigger | Text (English; i18n key in brackets) | Options (default focus **bold**) |
|---|---|---|---|
| D1 | Pause:Menu → Abandon Run | "Abandon this run? Progress toward milestones is kept." [`confirm.abandon`] | **Keep playing** · Abandon |
| D2 | Editor → Salvage (a card dropped on the Salvage bin, or pad Y) | "Salvage {card} for {n} coins?" [`confirm.salvage`] | **Cancel** · Salvage |
| D3 | Editor: drop a held card when the bag is full (back / close with a card in hand and no bag space) | "Your bag is full. What happens to {card}?" [`confirm.bagFull`] | **Keep holding** · Salvage for {n} coins · Discard |
| D4 | Walking into a door while a reward pedestal in the room is untaken | "Leave the {reward kind} behind?" [`confirm.leaveReward`] | **Go back** · Leave it |
| D5 | Wand offer → Swap for wand *n* | "Replace {wand}? Its {k} cards go to your bag{; m won't fit and will drop here}." [`confirm.swapWand`] | **Cancel** · Replace |
| D6 | Settings → Data → Reset progress | "Erase all unlocks, codex and stats? This can't be undone." [`confirm.reset`] | **Cancel** · Erase (this button activates only after a 1.0 s **hold**, or after focusing it and pressing confirm twice; either path works, so no one is forced into a hold) |

**Commit screens (§0 rule 1 exception):** S0 Loading (no input), S7 Run End (`back` = Title, which is a valid exit), S7u Unlocks (`back` = Continue). None of them traps the player.

D4 notes: the door does not commit until the player confirms, and the player is pushed back 8 px out of the door trigger on "Go back". D4 fires once per door approach, not once per frame. It never fires for an already-taken or empty pedestal.

---

## §5 Depth audit (IA justification)

| Path | Depth | Justified by |
|---|---|---|
| Run → Pause (5 tabs) | 1 | 5 tabs × 1 screen. Tabs beat a hub menu because the editor (the most-used page, 0.5–2 visits per room) is one key away. |
| Run → Pause:Menu → Settings (6 groups) | 2 | ~25 options can't fit one 640×360 page at legible sizes; groups keep each page ≤ 8 rows. |
| Settings → Rebind capture | 3 | modal capture is required so the captured key isn't interpreted as navigation. |
| Title → Codex (5 categories) | 1 | 43 cards + 26 relics + 13 enemies + 5 reactions + 9 milestones = 96 entries → categories required. |
| Reward/Shop → Editor (`returnTo`) | 1 (replace, not stack) | lets the player check the wand before committing coins or a pick. |

No path exceeds depth 3. No screen has a single child (which would be a pointless level).

---

## §6 Credits content contract (S8)

- Sections in order: **Spellwright** (studio line) · **Art** (0x72, Kenney, 7Soul1, Emcee Flesher, CodeManu, DevWizard, Shade, BitingChaos, … as courtesy for CC0) · **Sound** · **Music** · **Engine** (Phaser, MIT) · **Fonts** (Kenney, CC0).
- **CC-BY entries are verbatim** (`asset-inventory.md` §1). Each shipped Kevin MacLeod track gets its own line: *"<Title>" Kevin MacLeod (incompetech.com), Licensed under Creative Commons: By Attribution 4.0 License*. The ViRiX and Little Robot Sound Factory lines appear in their author-requested form. The screen renders `assets/credits.json` (TA Wave 3), so no string is hand-typed into the scene. A missing `credits.json` is a boot error, not an empty screen.
- Layout: a centred column 400 px wide, body text T1 (`accessibility-spec.md` §2), section heads T2. URLs are printed as text (no link handling in-canvas). Lines wrap at 400 px; there is no truncation.

---

## §7 Audio and motion moments (briefs, not specs)

- **Audio Director:** UI cues needed at: focus move (`ui_move`), confirm (`ui_confirm`), back (`ui_back`), disabled confirm (`ui_denied`, a distinct and softer cue), tab change (`ui_tab`), card pick-up / place / swap (`ui_card_pick`, `ui_card_place`), salvage (`ui_salvage`), purchase (`ui_buy`), unlock reveal (`ui_unlock`), rebind captured (`ui_confirm`). Title music starts on the first input. The music bus ducks −6 dB while any modal is open (the game is paused; the room's music should recede, not stop).
- **Animator:** root-screen transitions fade ≤ 250 ms. Modal open: backdrop fade 120 ms + panel rise 8 px over 120 ms. Close: 90 ms. Under reduced motion: fades only, no rise (`accessibility-spec.md` §4). Tab switch: instant content swap with a 2-frame underline slide. Nothing in the UI holds input for longer than 120 ms (inputs during a transition are queued, not dropped).

---

## §8 DOG self-check (information-architecture-and-navigation)

- **Where am I / where from / how back:** every screen has a title or a highlighted tab, the entry point is listed in §3, and `back` is defined for every row. ✔
- **Dead ends:** none. The commit screens exit by default focus. ✔
- **Modal traps:** the one irreversible action inside a modal was removed (Reward "Skip"); every other irreversible action sits behind a confirm with the safe option focused (§4). ✔
- **Depth justified by content count:** §5. ✔
- **Gamepad navigation for all:** the pad column in §3 covers every screen, and §3.1 gives the spatial rules. ✔
