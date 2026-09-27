# Spellwright — `motion-spec` (UI, HUD, world objects)

**Owner:** Animator · **Status:** Wave 2, v1 · **Template:** `gamestudio/.claude/skills/ui-and-screen-motion/tools/motion-spec-yaml-template.md`
**Authored to:** UX `screen-graph.md` (§7 motion briefs), `hud-layout.md` (H1–H15, §4 damage numbers, §6 in-world UI), `wand-editor-ux.md` (§3 pick/place/swap). Also `feel-spec.md` (`roomFadeMs`, `damageNumberRise*`, pickup/magnet values), `scene-flow.md` §2–§3.
**Consumers:** Game Developer (tween configs; each YAML entry maps 1:1 to a `scene.tweens.add` / `chain` config). Audio Director (`audio:` rows; ids are theirs, and new ids are marked *proposed*). UX Designer (conformance to their flow).
**Skill DOGs honoured:** `ui-and-screen-motion` (Penner ease chosen by semantics; durations in the perceptual band; Linear only for timers and progress) · `object-and-environmental-animation` (attention tier per object; concrete bob; glint ≤ 1 per 2–4 s).

---

## §0 Rules for every entry

1. **Ease semantics.** Entrances `*.easeOut`, exits `*.easeIn`, in-place/traversal `*.easeInOut`, confirmations `Back.easeOut`, ambient loops `Sine.easeInOut`. `Linear` is used **only** for timing-critical bars and timers (recharge, swap lockout, hazard timers) and for alpha fades whose duration the feel-spec owns.
2. **Durations.** Press/feedback 66–150 ms · micro-moves 50–120 ms · modals ≤ 120 ms in / 90 ms out (UX §7) · root transitions ≤ 250 ms · stingers ≤ 1 200 ms. Nothing blocks input: **input during any UI motion is live or queued, never dropped** (UX §7). A confirm during a deal-in completes the deal instantly.
3. **Pixel integrity** (state-graph R4). UI translation is in whole px (`Math.round` in `onUpdate`). **No non-integer scale on bitmap text or pixel UI.** Crit numbers use integer ×2, aligning with UX objection O-UX-3 against `critNumberScale` 1.5 (the Animator concurs; no separate objection). "Pop" is expressed as a 1–2 px offset or a 1-step brighten, never a scale overshoot.
4. **Clocks.** HUD and modal motion runs on the HudScene / modal scene clocks and is **not** frozen by hit-stop. World-object motion (pickups, doors, damage numbers) runs on RunScene and **is** frozen by hit-stop (state-graph R3), because it lives in the game world.
5. **Reduced motion** (UX `accessibility-spec` §4): every entry declares its fallback. The default is to fade only, with no offsets, overshoot, bob or shake.
6. **Attention tiers (world):** T1 characters > T2 hazards/active props (doors mid-open, spawn portals) > T3 pickups > T4 ambient (torches, fountains). A lower tier never moves more (amplitude × frequency) than a higher tier on screen.

---

## §1 Screen and modal transitions

```yaml
motion-id: screen-root-fade
type: screen-transition
applies_to: sceneflow root change (title ⇄ run ⇄ run-end, credits)
runtime: phaser-tween
phases:
  outgoing: { duration_ms: 200, ease: Quad.easeIn,  transform: [ { property: opacity, target: black-cover, from: 0, to: 1 } ] }
  incoming: { duration_ms: 250, ease: Quad.easeOut, transform: [ { property: opacity, target: black-cover, from: 1, to: 0 } ] }
cover_load_seam: { enabled: true, cover_animation: none, min_cover_duration_ms: 17 }   # scene.start only after the fade-out completes (scene-flow §2); hold black until the new scene's create() resolves
audio: [ { on: phase:outgoing:start, cue_id: none } ]
reduced_motion: keep            # a fade is already the reduced form
notes: Death → run-end starts after the player death beat (state-graph §2.2, ≈1.5 s). Victory starts after boss death + 600 ms hold.
```

```yaml
motion-id: screen-room-transition
type: screen-transition
applies_to: RoomDirector unload/load (rooms are not scenes)
runtime: phaser-tween (camera fade)
phases:
  outgoing: { duration_ms: roomFadeMs, ease: Quad.easeIn,  transform: [ { property: opacity, target: camera-fade, from: 0, to: 1 } ] }   # feel-spec value, 220
  incoming: { duration_ms: roomFadeMs, ease: Quad.easeOut, transform: [ { property: opacity, target: camera-fade, from: 1, to: 0 } ] }
cover_load_seam: { enabled: true, min_cover_duration_ms: 17 }   # unload+load happen at full black; hold black ≥ 1 frame and until load() returns
reduced_motion: keep
notes: The player walks through the door and is placed 1 tile inside the opposite door at full black. Combat rooms: the doors slam 250 ms after the fade-in (world-door-close).
```

```yaml
motion-id: screen-floor-descend
type: screen-transition
applies_to: stairs / exit portal after a boss (floors 1–2)
runtime: phaser-tween
total_duration_ms: 2650
phases:
  sink:      { duration_ms: 300,  ease: Cubic.easeIn,  transform: [ { property: translateY, target: player, from: 0, to: 6 }, { property: opacity, target: player, from: 1, to: 0 } ] }   # into the portal ring (puny portal cyan collapse f4..f9)
  fade-out:  { duration_ms: 250,  ease: Quad.easeIn,   transform: [ { property: opacity, target: black-cover, from: 0, to: 1 } ] }
  title:     { duration_ms: 1800, transform: [] }       # H15 floor title card (banner-floor-title) plays over black, then the Landing loads
  fade-in:   { duration_ms: 300,  ease: Quad.easeOut,  transform: [ { property: opacity, target: black-cover, from: 1, to: 0 } ] }
audio: [ { on: phase:sink:start, cue_id: portal_enter, bus: sfx, proposed: true } ]
reduced_motion: reduce
reduced_motion_alternative: { sink: "opacity only, 200 ms", title: unchanged }
```

```yaml
motion-id: modal-open
type: modal
applies_to: pause | reward | shop | settings (sceneflow.open)
runtime: phaser-tween
duration_ms: 120
ease: Cubic.easeOut
transform:
  - { property: opacity,    target: backdrop, from: 0, to: 0.7 }     # "frozen game at 30% brightness" (wand-editor-ux)
  - { property: opacity,    target: panel,    from: 0, to: 1 }
  - { property: translateY, target: panel,    from: 8, to: 0 }       # UX §7: panel rise 8 px over 120 ms
audio: [ { on: TWEEN_START, cue_id: ui_confirm, bus: ui } ]
reduced_motion: reduce
reduced_motion_alternative: opacity only (no rise), 120 ms
```

```yaml
motion-id: modal-close
type: modal
applies_to: any modal (sceneflow.close)
runtime: phaser-tween
duration_ms: 90
ease: Quad.easeIn
transform:
  - { property: opacity,    target: [backdrop, panel], from: current, to: 0 }
  - { property: translateY, target: panel, from: 0, to: 4 }
audio: [ { on: TWEEN_START, cue_id: ui_back, bus: ui } ]
reduced_motion: reduce
reduced_motion_alternative: opacity only, 90 ms
notes: scene.resume('run') fires on TWEEN_COMPLETE, and InputRouter.clearHeld() at the same moment (scene-flow §3). Reward/Shop ⇄ Wand editor `returnTo` is a replace, so it plays modal-close (90) then modal-open (120) with no backdrop fade (the backdrop stays at 0.7).
```

```yaml
motion-id: modal-tab-switch
type: microinteraction
applies_to: pause tab bar (Wands · Relics · Map · Codex · Menu)
runtime: phaser-tween
duration_ms: 33                  # UX §7: "2-frame underline slide"; content swaps instantly
ease: Quad.easeOut
transform: [ { property: translateX, target: tab-underline, from: prev-tab-x, to: next-tab-x } ]
audio: [ { on: TWEEN_START, cue_id: ui_tab, bus: ui } ]
reduced_motion: disable
reduced_motion_alternative: underline snaps
```

---

## §2 Generic menu microinteractions

```yaml
motion-id: ui-focus-move
type: microinteraction
applies_to: focus frame on any focusable (title, pause, reward, shop, settings, run-end)
runtime: phaser-tween
duration_ms: 50
ease: Cubic.easeOut
transform: [ { property: translateX/translateY + width/height, target: focus-frame, from: prev-rect, to: next-rect } ]   # integer px each step
audio: [ { on: TWEEN_START, cue_id: ui_move, bus: ui } ]
reduced_motion: disable
reduced_motion_alternative: frame snaps to the new rect
```

```yaml
motion-id: ui-button-press
type: microinteraction
applies_to: every button (9-slice)
runtime: phaser-tween
duration_ms: 66
ease: Quad.easeOut
transform: [ { property: translateY, from: 0, to: 1 }, { property: frame, from: normal, to: pressed } ]   # Kenney 9-slice "pressed" variant
release: { duration_ms: 100, ease: Quad.easeOut, transform: [ { property: translateY, from: 1, to: 0 }, { property: frame, to: normal } ] }
audio: [ { on: TWEEN_START, cue_id: ui_confirm, bus: ui } ]
reduced_motion: keep             # essential affordance feedback
```

```yaml
motion-id: ui-denied
type: microinteraction
applies_to: disabled confirm (Buy too expensive, full wand, bag full, Revert with nothing changed)
runtime: phaser-tween
duration_ms: 150
ease: Quad.easeOut
transform: [ { property: translateY, from: 0, to: 1, yoyo: true }, { property: tint, target: button, to: "MULTIPLY #6a6a6a (disabled look) for the press" }, { property: tint, target: reason-line, from: "#facb3e", to: "normal", duration_ms: 150 } ]   # a dead press, NOT a shake: accessibility-spec §4.2 "no UI element shakes"
audio: [ { on: TWEEN_START, cue_id: ui_denied, bus: ui } ]
reduced_motion: reduce
reduced_motion_alternative: no press offset; the reason-line highlight is kept
```

---

## §3 Wand editor (Pause → Wands; `wand-editor-ux.md` §3)

```yaml
motion-id: editor-card-pick
type: microinteraction
applies_to: B3 slot / B7 bag cell → held card (drag start, or sticky pick-up)
runtime: phaser-tween
duration_ms: 66
ease: Cubic.easeOut
transform:
  - { property: position, target: held-card-32px, from: cell-centre, to: "cursor + (4, 4)" }   # wand-editor-ux §3: held at +4,+4, 90% alpha, 1 px drop shadow
  - { property: opacity,  target: held-card-32px, from: 1, to: 0.9 }
  - { property: style,    target: origin-cell, to: dashed-ghost }                               # instant, frame 0
audio: [ { on: TWEEN_START, cue_id: ui_card_pick, bus: ui } ]
reduced_motion: disable
reduced_motion_alternative: card appears at cursor+(4,4) instantly
notes: |
  After the 66 ms settle the held card follows the pointer 1:1 every render frame, with no smoothing
  and no lag (drag latency reads as sluggish). Pad/keyboard: the held card sits 4 px above
  the focused cell and moves cell-to-cell with ui-focus-move timing (50 ms Cubic.easeOut).
  Valid-target inner frame and ⛔ badge appear instantly (no tween); the preview's ▲/▼ deltas
  update the same frame (the "visible before drop" promise).
```

```yaml
motion-id: editor-card-place
type: microinteraction
applies_to: held card → target cell (empty slot/bag, or wand card A1 → first empty slot)
runtime: phaser-tween (chain)
phases:
  travel: { duration_ms: 90, ease: Cubic.easeOut, transform: [ { property: position, from: held-pos, to: target-cell-centre }, { property: opacity, from: 0.9, to: 1 } ] }
  seat:   { duration_ms: 83, ease: Back.easeOut,  transform: [ { property: translateY, from: -1, to: 0 } ] }   # 1 px settle, the "click into slot"
audio: [ { on: phase:seat:start, cue_id: ui_card_place, bus: ui } ]
reduced_motion: reduce
reduced_motion_alternative: travel only (90 ms, Quad.easeOut), no seat
notes: A wand-card (A1) drop travels to that wand's first empty slot even though the slot strip may be for another wand, and the strip switches to that wand on arrival. The ↻ "Changed: recharges" badge pops in on the wand card via editor-changed-badge.
```

```yaml
motion-id: editor-card-swap
type: microinteraction
applies_to: drop on a filled cell
runtime: phaser-tween
duration_ms: 120
ease: Cubic.easeInOut
transform:
  - { property: position, target: held-card,      from: held-pos,        to: target-cell-centre }   # then the seat phase of editor-card-place
  - { property: position, target: displaced-card, from: target-cell-centre, to: origin-cell-centre } # simultaneous; drawn under the held card
audio: [ { on: TWEEN_START, cue_id: ui_card_place, bus: ui } ]
reduced_motion: reduce
reduced_motion_alternative: both cards snap to their cells; the displaced cell brightens 2 frames
notes: No-origin swap ("hand-over", a card taken from a reward) → the displaced card lifts into the hand with editor-card-pick instead of travelling to an origin.
```

```yaml
motion-id: editor-card-return
type: microinteraction
applies_to: drop on empty space / RMB / B / Esc (return to origin, or the first empty bag cell)
runtime: phaser-tween
duration_ms: 120
ease: Quad.easeOut
transform: [ { property: position, from: held-pos, to: origin-cell-centre }, { property: opacity, from: 0.9, to: 1 } ]
audio: [ { on: TWEEN_COMPLETE, cue_id: ui_card_place, bus: ui } ]
reduced_motion: reduce
reduced_motion_alternative: snap
notes: Rejected drop on a full wand card → the card stays held, the wand card plays ui-denied (a dead press, not a shake), and the reason shows in pane C.
```

```yaml
motion-id: editor-card-salvage
type: microinteraction
applies_to: D2 confirmed (card → salvage bin)
runtime: phaser-tween
duration_ms: 150
ease: Cubic.easeIn
transform: [ { property: position, from: held-pos, to: bin-icon-centre }, { property: opacity, from: 0.9, to: 0 } ]
audio: [ { on: TWEEN_COMPLETE, cue_id: ui_salvage, bus: ui } ]
reduced_motion: reduce
reduced_motion_alternative: card fades in place, 100 ms
notes: On complete, the HUD coin icon plays hud-coins-bump.
```

```yaml
motion-id: editor-changed-badge
type: microinteraction
applies_to: ↻ badge on a wand card / "↻" marker at slot 1 (B4)
runtime: phaser-tween
duration_ms: 120
ease: Back.easeOut
transform: [ { property: translateY, from: -2, to: 0 }, { property: opacity, from: 0, to: 1 } ]
reduced_motion: reduce
reduced_motion_alternative: appears instantly
```

```yaml
motion-id: editor-preview-value-change
type: microinteraction
applies_to: B9 preview lines whose value changed after a drop (cycle, ≈DPS, sustainability)
runtime: phaser-tween
duration_ms: 200
ease: Quad.easeOut
transform: [ { property: tint, target: changed-value-text, from: "#facb3e (gold highlight)", to: "normal text colour" } ]   # BitmapText tint, not scale
reduced_motion: keep            # it is information (what changed), and it doesn't move
```

```yaml
motion-id: editor-entry-focus-pulse
type: microinteraction
applies_to: first empty slot on entry from Reward "Take" (wand-editor-ux §3.5)
runtime: phaser-tween
duration_ms: 200
ease: Sine.easeInOut
transform: [ { property: opacity, target: slot-outline-bright, from: 1, to: 0.3, yoyo: true, repeat: 1 } ]   # "2-frame pulse" read as two pulses
reduced_motion: disable
reduced_motion_alternative: static bright outline
```

---

## §4 HUD (HudScene clock; `hud-layout.md` H-numbers)

```yaml
motion-id: hud-cast-cursor-advance
type: microinteraction
applies_to: H10 slot strip + H11 next-card chevron, on `wand:cast` (drawn indices)
runtime: phaser-tween
duration_ms: "min(50, effectiveCastDelayMs / 2)"
ease: Quad.easeOut
transform:
  - { property: opacity,    target: drawn-cells, from: 1, to: 0.4, duration_ms: 0 }     # instant: timing-critical state, never tweened
  - { property: translateX, target: chevron, from: cell[i].x, to: cell[next].x }
  - { property: tint,       target: drawn-cells, from: "FILL flash (1 step)", to: none, condition: "cast rate < 8/s" }
reduced_motion: reduce
reduced_motion_alternative: chevron snaps; no brighten
notes: |
  If effectiveCastDelayMs < 100 the chevron snaps (no tween). A wand firing at 10–20 casts/s
  would otherwise keep the chevron permanently mid-slide, and the strip would strobe. The
  1-step brighten is dropped above 8 casts/s for the same reason (HUD noise and flash budget).
  The chevron tween is killed and restarted on every cast (no queueing).
```

```yaml
motion-id: hud-sputter
type: microinteraction
applies_to: H10 skipped cell slash + H13 mana frame, on sputter
runtime: phaser-tween
duration_ms: 250                 # UX: slash overlay 250 ms
ease: Quad.easeIn
transform:
  - { property: opacity, target: slash-overlay, from: 1, to: 0, delay_ms: 150 }   # held 150, fades 100
  - { property: tint,    target: mana-frame, from: "#da4e38 (palette red)", to: none, duration_ms: sputterFlashMs, ease: Linear }  # feel value 90
audio: [ { on: TWEEN_START, cue_id: sputter, bus: sfx } ]
reduced_motion: keep            # information; flash scaled by the flash-intensity setting (UX)
```

```yaml
motion-id: hud-wand-recharge
type: notification
applies_to: H12 recharge bar + H10/H11, `wand:recharge` start → end
runtime: phaser-tween
phases:
  fill:     { duration_ms: effectiveRechargeMs, ease: Linear, transform: [ { property: width, target: recharge-bar, from: 0, to: full } ] }   # timing-critical → Linear
  complete: { duration_ms: 100, ease: Cubic.easeInOut, transform: [ { property: translateX, target: chevron, from: bar-end, to: cell[0].x }, { property: opacity, target: strip-cells, from: 0.4, to: 1, duration_ms: 0 }, { property: tint, target: strip, from: "FILL flash (1 step)", to: none } ] }
audio: [ { on: phase:complete:start, cue_id: wand_recharge, bus: sfx } ]
reduced_motion: reduce
reduced_motion_alternative: no brighten; chevron snaps
notes: The bar is drawn from sim-reported remaining recharge each HUD update (bus-coalesced), not free-running, so a hit-stop or pause can't desync it. Tween only between reports.
```

```yaml
motion-id: hud-wand-swap
type: microinteraction
applies_to: H8 badges + H10 strip, on `wand:changed` (swap)
runtime: phaser-tween
duration_ms: 100
ease: Back.easeOut
transform:
  - { property: translateY, target: new-equipped-badge, from: 334, to: 330 }                        # raised (UX position cue)
  - { property: translateY, target: prev-badge, from: 330, to: 334, ease: Quad.easeOut }
  - { property: opacity,    target: strip-content, from: 0, to: 1, duration_ms: 66, ease: Quad.easeOut }
  - { property: opacity,    target: lockout-overlay, from: 0.5, to: 0, duration_ms: wandSwapMs, ease: Linear }   # feel 120; grey hatch over the strip = can't cast yet
audio: [ { on: TWEEN_START, cue_id: wand_swap, bus: sfx } ]
reduced_motion: reduce
reduced_motion_alternative: badges snap; the lockout overlay is kept (information)
```

```yaml
motion-id: hud-heart-loss
type: notification
applies_to: H1 the heart that lost HP, on `player:hp` decrease
runtime: phaser-tween
duration_ms: 150
ease: Linear
transform:
  - { property: tint,       from: "FILL flash (2 frames)", to: none }    # UX: 2-frame white fill-flash
  - { property: frame,      to: new-state, at: frame:2 }                  # full→half / half→empty swaps after the flash
particles: [ { on: frame:2, fx_id: heart-shard, count: 2, notes: "2 px red shards fall 6 px, 250 ms" } ]
reduced_motion: reduce
reduced_motion_alternative: flash (scaled by flashIntensity), no shards (no jitter in any mode: accessibility-spec §4.2, no UI element shakes)
```

```yaml
motion-id: hud-heart-gain
type: notification
applies_to: H1 heart(s) filled (heal door, potion, boss heal, fang)
runtime: phaser-tween
duration_ms: 150
ease: Back.easeOut
transform: [ { property: translateY, from: -2, to: 0 }, { property: frame, to: new-state, at: TWEEN_START } ]
stagger_ms: 60                  # multi-heart heals fill left→right
audio: [ { on: TWEEN_START, cue_id: heal, bus: sfx, proposed: true } ]
reduced_motion: reduce
reduced_motion_alternative: frame swap only
```

```yaml
motion-id: hud-low-hp
type: ambient
applies_to: H1 remaining heart(s) + the camera Vignette filter, while HP ≤ 2
runtime: phaser-tween
duration_ms: 500                # half-period → 1 Hz (UX)
ease: Sine.easeInOut
transform: [ { property: opacity, target: remaining-hearts, from: 1.0, to: 0.55, yoyo: true, repeat: -1 } ]
audio: [ { on: enter, cue_id: low_hp, bus: sfx } ]
reduced_motion: disable
reduced_motion_alternative: static hearts; the vignette stays static at 30 % (UX §3.4)
notes: The vignette itself does not pulse (one camera filter, static strength 0.3). Only the hearts pulse. Stops when HP > 2.
```

```yaml
motion-id: hud-shield-break
type: notification
applies_to: H2 shield pip
runtime: flipbook
duration_ms: 150                # UX: 3-frame shatter → 3 frames @ 20 fps
reduced_motion: disable
reduced_motion_alternative: pip disappears
```

```yaml
motion-id: hud-boss-bar
type: notification
applies_to: H5 boss bar (damage chip, phase change)
runtime: phaser-tween
phases:
  chip-hold:  { duration_ms: 400, transform: [] }                          # UX: chip drains 400 ms after the last hit; each hit restarts the hold
  chip-drain: { duration_ms: 250, ease: Quad.easeIn, transform: [ { property: width, target: chip-segment, from: chip, to: fill } ] }
  phase:      { duration_ms: 33,  transform: [ { property: tint, target: bar-frame, from: "FILL flash", to: none } ] }   # 2-frame frame flash on boss:phase
  intro-fill: { duration_ms: 600, ease: Cubic.easeOut, transform: [ { property: width, target: fill, from: 0, to: full } ] }   # on boss activate (during the 1 200 ms intro)
reduced_motion: reduce
reduced_motion_alternative: chip snaps to fill; intro fill instant; phase flash kept
```

```yaml
motion-id: hud-coins-bump
type: microinteraction
applies_to: H6 coin icon on `player:gold` increase
runtime: phaser-tween
duration_ms: 120                # UX: icon bobs 1 px for 120 ms
ease: Quad.easeOut
transform: [ { property: translateY, from: 0, to: -1, yoyo: true } ]     # 60 up, 60 down
reduced_motion: disable
notes: Coalesced. A coin-vacuum burst of 20 coins restarts the bump at most once per 120 ms (no jitter storm).
```

```yaml
motion-id: hud-relic-proc
type: notification
applies_to: H3 relic icon on proc
runtime: phaser-tween
duration_ms: 600
ease: Quad.easeIn
transform: [ { property: opacity, from: 1.0, to: 0.5, delay_ms: 450 } ]   # held at 100% with a 1 px frame, fades back to the 50% rest
reduced_motion: keep            # UX: frame only (no flash) under reduced motion
```

```yaml
motion-id: hud-toast
type: notification
position: H14 right column, stacking up from y 354
runtime: phaser-tween
phases:
  enter: { duration_ms: 180, ease: Cubic.easeOut, transform: [ { property: translateX, from: 16, to: 0 }, { property: opacity, from: 0, to: 1 } ] }
  hold:  { duration_ms: "3000 + 1000 per extra line" }      # UX; frozen while a modal is open
  exit:  { duration_ms: 150, ease: Quad.easeIn,  transform: [ { property: translateX, from: 0, to: 8 }, { property: opacity, from: 1, to: 0 } ] }
  restack: { duration_ms: 120, ease: Cubic.easeInOut, transform: [ { property: translateY, target: older-toast, from: y, to: "y − toast-height − 2" } ] }
audio: [ { on: phase:enter:start, cue_id: toast, bus: ui, proposed: true } ]
reduced_motion: reduce
reduced_motion_alternative: fade only (UX), enter 120 / exit 100
```

```yaml
motion-id: banner-room-cleared
type: stinger
applies_to: H15 "Room cleared" (queued until the last enemy's death visual completes)
runtime: phaser-tween
total_duration_ms: 1200          # UX
phases:
  punch:     { duration_ms: 160, ease: Back.easeOut, transform: [ { property: translateY, from: -6, to: 0 }, { property: opacity, from: 0, to: 1 } ] }
  hold:      { duration_ms: 840, transform: [] }
  dissipate: { duration_ms: 200, ease: Quad.easeIn,  transform: [ { property: translateY, from: 0, to: -4 }, { property: opacity, from: 1, to: 0 } ] }
audio: [ { on: phase:punch:start, cue_id: room_clear, bus: music-stinger } ]
world_sync:
  - { at_ms: 0,   action: "coin vacuum starts (feel-spec §pickup room-clear magnetize)" }
  - { at_ms: 300, action: "world-reward-rise (if the room has a reward)" }
  - { at_ms: 450, action: "world-door-open sequence starts" }
reduced_motion: reduce
reduced_motion_alternative: opacity only; world_sync timings unchanged
```

```yaml
motion-id: banner-floor-title
type: stinger
applies_to: H15 floor title card ("Floor 2 — The Drowned Halls"), T1 ×2
runtime: phaser-tween
total_duration_ms: 1800          # UX
phases:
  enter: { duration_ms: 250,  ease: Cubic.easeOut, transform: [ { property: opacity, from: 0, to: 1 }, { property: translateY, from: 4, to: 0 } ] }
  hold:  { duration_ms: 1300 }
  exit:  { duration_ms: 250,  ease: Quad.easeIn,   transform: [ { property: opacity, from: 1, to: 0 } ] }
reduced_motion: reduce
reduced_motion_alternative: opacity only
```

```yaml
motion-id: boss-name-card
type: stinger
applies_to: H15 boss name + title, inside bossActivateDelayMs (1200)
runtime: phaser-tween
total_duration_ms: 1200
phases:
  enter: { duration_ms: 200, ease: Cubic.easeOut, transform: [ { property: translateX, from: -24, to: 0 }, { property: opacity, from: 0, to: 1 } ] }
  hold:  { duration_ms: 800 }
  exit:  { duration_ms: 200, ease: Quad.easeIn,   transform: [ { property: translateX, from: 0, to: 24 }, { property: opacity, from: 1, to: 0 } ] }
audio: [ { on: phase:enter:start, cue_id: boss_intro, bus: music-stinger, proposed: true } ]
sync: "enter starts on camera-pan arrival at the boss (bossIntroPanMs/2), the same moment as the boss rise (state-graph §4 intro)"
reduced_motion: reduce
reduced_motion_alternative: opacity only
```

---

## §5 Reward, shop, run-end screens

```yaml
motion-id: reward-draft-deal
type: modal
applies_to: S4 reward draft cards (2–3), after modal-open
runtime: phaser-tween
duration_ms: 200
stagger_ms: 60                  # left → right; 3 cards finish at 320 ms
ease: Back.easeOut
transform: [ { property: translateY, from: 16, to: 0 }, { property: opacity, from: 0, to: 1 } ]
rarity_glint: { applies_to: "rarity ≥ rare", on: TWEEN_COMPLETE, duration_ms: 300, ease: Quad.easeInOut, transform: [ { property: translateX, target: diagonal-glint-stripe, from: card-left, to: card-right } ], repeat_every_ms: 3000 }
audio: [ { on: TWEEN_START, cue_id: ui_card_deal, bus: ui, proposed: true } ]
reduced_motion: reduce
reduced_motion_alternative: all cards fade in together (120 ms); glint once, no repeat
notes: Focus is live from frame 0 on the first card. Confirm during the deal completes it instantly.
```

```yaml
motion-id: reward-card-focus
type: microinteraction
applies_to: focused reward/shop item
runtime: phaser-tween
duration_ms: 66
ease: Quad.easeOut
transform: [ { property: translateY, from: 0, to: -3 }, { property: frame, to: focused-outline } ]
release: { duration_ms: 66, ease: Quad.easeOut, transform: [ { property: translateY, from: -3, to: 0 } ] }
audio: [ { on: TWEEN_START, cue_id: ui_move, bus: ui } ]
reduced_motion: reduce
reduced_motion_alternative: outline only, no lift
```

```yaml
motion-id: reward-take
type: stinger
applies_to: S4 Take (card → wand editor with heldCard; relic → applied + toast)
runtime: phaser-tween
total_duration_ms: 150
phases:
  confirm: { duration_ms: 33,  transform: [ { property: tint, target: chosen, from: "FILL flash", to: none } ] }   # 2-frame flash
  others:  { duration_ms: 120, ease: Quad.easeIn, transform: [ { property: translateY, target: unchosen, from: 0, to: 8 }, { property: opacity, target: unchosen, from: 1, to: 0 } ] }
audio: [ { on: phase:confirm:start, cue_id: pickup_card, bus: sfx } ]   # relic: `relic_gain` (proposed)
reduced_motion: reduce
reduced_motion_alternative: flash only, then close
notes: Card → the screen replace (modal-close 90 + modal-open 120) into Pause:Wands, where the card is already held (editor-entry-focus-pulse). Relic → modal-close, then hud-toast.
```

```yaml
motion-id: shop-buy
type: microinteraction
applies_to: S5 purchased item
runtime: phaser-tween
duration_ms: 150
ease: Cubic.easeIn
transform: [ { property: translateY, target: item-icon, from: 0, to: -8 }, { property: opacity, target: item-icon, from: 1, to: 0 } ]
audio: [ { on: TWEEN_START, cue_id: ui_buy, bus: ui } ]
reduced_motion: reduce
reduced_motion_alternative: icon fades, 100 ms
notes: The pedestal shows "Sold" instantly. Coins update with hud-coins-bump. Card → hud-toast. Reroll: the 5 rerollable items play reward-draft-deal (stagger 40).
```

```yaml
motion-id: runend-summary
type: modal
applies_to: S7 panels (outcome header, stats, final wands, relics, buttons)
runtime: phaser-tween
duration_ms: 200
stagger_ms: 80
ease: Cubic.easeOut
transform: [ { property: translateY, from: 8, to: 0 }, { property: opacity, from: 0, to: 1 } ]
unlock_banner: { duration_ms: 160, ease: Back.easeOut, transform: [ { property: translateY, from: -6, to: 0 }, { property: opacity, from: 0, to: 1 } ], audio: { cue_id: ui_unlock, bus: ui } }
reduced_motion: reduce
reduced_motion_alternative: all panels fade in together, 150 ms
notes: Input is live from frame 0 (a confirm skips the stagger).
```

---

## §6 World objects (RunScene clock; frozen by hit-stop)

```yaml
motion-id: world-damage-number
type: notification
applies_to: pooled BitmapText at the enemy `head` anchor (hud-layout §4 policy)
runtime: phaser-tween
duration_ms: damageNumberRiseMs                 # feel 450
ease: Cubic.easeOut                              # decelerating float = settles into place
transform:
  - { property: translateY, from: 0, to: "-damageNumberRisePx" }   # feel 10
  - { property: opacity, from: 1, to: 0, delay_ms: "damageNumberRiseMs − 150", duration_ms: 150, ease: Linear }   # UX: fades over its last 150 ms
spawn_pop: { duration_ms: 17, transform: [ { property: translateY, from: +2, to: 0 } ] }   # 1-step 2 px "pop" instead of a scale overshoot
crit: { scale: 2, tint: yellow, suffix: "!" }   # integer ×2 (UX O-UX-3)
aggregate: "a hit within 200 ms (UX) adds into the number, restarts the tween from the current y, and replays spawn_pop"
reduced_motion: reduce
reduced_motion_alternative: no rise; appear, hold 450 ms, fade (UX)
```

```yaml
motion-id: world-coin-pop
type: ambient
applies_to: coin_anim (0x72, 6×7, 4 f) spawned on enemy death / crate / coin burst
attention_tier: T3
runtime: phaser-tween + anims
spin: { animation_key: coin_spin, frames: 4, fps: 10, loop: true }
hop:  { duration_ms: 300, ease: "Quad.easeOut up / Quad.easeIn down", transform: [ { property: sprite-offsetY, from: 0, to: -8, yoyo: true } ], then: { duration_ms: 150, transform: [ { property: sprite-offsetY, from: 0, to: -3, yoyo: true } ] } }
notes: |
  The planar pop (coinPopSpeed, coinPopDecay) is sim-owned. The hop is a sprite y-offset only (the shadow
  stays on the ground). It is magnet-eligible after coinMagnetDelayMs (feel), independent of the hop.
reduced_motion: reduce
reduced_motion_alternative: no hop; spin kept (4-frame coin spin is the object's identity)
```

```yaml
motion-id: world-coin-magnet
type: microinteraction
applies_to: coin in magnet range, or the room-clear vacuum
runtime: anims
transform: [ { property: anim-fps, target: coin_spin, from: 10, to: 20 } ]    # spins faster while flying (the pull read)
collect: { on: "within pickupRadius", action: "1-step white FILL, then release to the pool", audio: { cue_id: pickup_coin, bus: sfx } }
reduced_motion: keep
```

```yaml
motion-id: world-pickup-bob
type: ambient
applies_to: items resting on pedestals (card, relic, wand, heart, potion) and dropped cards (slot map `pickups`; `wand_drop` is the full 8×30 staff at a fixed 45° with the bob applied to the whole rotated sprite)
attention_tier: T3
runtime: phaser-tween
duration_ms: 1000               # half-period → 2.0 s full cycle
ease: Sine.easeInOut
transform:
  - { property: sprite-offsetY, from: 0, to: -2, yoyo: true, repeat: -1 }   # 2 px amplitude at 16 px scale (DOG: 2–6 px at 64 px → 1–2 px here, max end)
  - { property: shadow-width,   from: 10, to: 8, yoyo: true, repeat: -1 }   # integer px, the shadow shrinks as the item rises
glint: { interval_ms: 2500, duration_ms: 100, fx: "1 px sparkle at a random edge pixel (fx stream)" }   # O-ANIM-2 accepted: 2.5 s, random phase per pedestal (DOG: ≤ 1 glint per 2–4 s)
phase_offset: "random per item (fx stream) so adjacent pedestals don't bob in lockstep"
reduced_motion: disable
reduced_motion_alternative: static item with a static glint pixel (UX)
```

```yaml
motion-id: world-reward-rise
type: stinger
applies_to: reward pedestal appearing at room clear / boss death
attention_tier: T2 (while rising), then T3
runtime: phaser-tween
total_duration_ms: 450
phases:
  rise: { duration_ms: 300, ease: Back.easeOut, transform: [ { property: translateY, target: pedestal, from: 8, to: 0 }, { property: opacity, target: pedestal, from: 0, to: 1 } ] }
  item: { duration_ms: 150, ease: Cubic.easeOut, transform: [ { property: sprite-offsetY, target: item, from: 4, to: 0 }, { property: opacity, target: item, from: 0, to: 1 } ], fx: "6-mote sparkle burst" }
then: world-pickup-bob
audio: [ { on: phase:rise:start, cue_id: reward_appear, bus: sfx, proposed: true } ]
reduced_motion: reduce
reduced_motion_alternative: fade in, 150 ms
```

```yaml
motion-id: world-door-open
type: stinger
applies_to: every exit door (0x72 doors_leaf closed → open, 2-state), on room clear (+450 ms)
attention_tier: T2
runtime: phaser-tween
stagger_ms: 120                 # doors open nearest-first (distance to the player)
phases:
  unlock: { duration_ms: 100, ease: Sine.easeInOut, transform: [ { property: translateY, target: door-leaf, from: 0, to: "1 px, 2 half-cycles" } ] }   # the latch clunk
  swap:   { duration_ms: 0, transform: [ { property: frame, target: door-leaf, to: doors_leaf_open } ], fx: "dust puff at the threshold (4 particles)" }
  icons:  { duration_ms: 200, ease: Back.easeOut, delay_ms: 100, transform: [ { property: translateY, target: door-choice-icons, from: -4, to: 0 }, { property: opacity, target: door-choice-icons, from: 0, to: 1 } ] }   # hud-layout §6 icons 20 px above the frame
audio: [ { on: phase:swap:start, cue_id: door_open, bus: sfx, voice_cap: "first door full gain, subsequent −6 dB" } ]
reduced_motion: reduce
reduced_motion_alternative: no shake; frame swap and icons fade in
```

```yaml
motion-id: world-door-close
type: microinteraction
applies_to: exit doors of a combat/elite/boss room, 250 ms after screen-room-transition fade-in
attention_tier: T2
runtime: phaser-tween
duration_ms: 80
ease: Quad.easeOut
transform: [ { property: frame, to: doors_leaf_closed, at: TWEEN_START }, { property: translateY, from: -1, to: 0 }, { property: tint, to: "MULTIPLY door-locked (held until world-door-open swap)" } ]
camera: [ { shake_magnitude_px: 0 } ]   # no shake: feel-spec reserves shakes for impacts
audio: [ { on: TWEEN_START, cue_id: door_close, bus: sfx, proposed: true } ]
reduced_motion: keep
```

```yaml
motion-id: world-chest-open
type: stinger
applies_to: treasure/vault reward presented as a chest (only if the 2D Artist maps the vault pedestal to 0x72 chest_full_open_anim, 3 f)
attention_tier: T2
runtime: anims + phaser-tween
total_duration_ms: 550
phases:
  anticipation: { duration_ms: 150, ease: Sine.easeInOut, transform: [ { property: translateX, target: chest, from: 0, to: "±1 px, 3 half-cycles" } ] }
  open:         { duration_ms: 250, animation_key: chest_open, frames: 3, fps: 12 }
  reveal:       { duration_ms: 150, ease: Back.easeOut, on: "open frame 2", transform: [ { property: sprite-offsetY, target: reward-item, from: 0, to: -10 } ], fx: "additive light shaft sprite, alpha 0.8 → 0 over 400 ms" }
then: "reward item settles into world-pickup-bob above the open chest; interacting opens S4/S4w"
audio: [ { on: phase:anticipation:start, cue_id: chest_open, bus: sfx, proposed: true } ]
reduced_motion: reduce
reduced_motion_alternative: skip anticipation; open + item fade in
notes: If no chest is mapped, the vault uses world-reward-rise and this entry is unused (the dev drops it; it is not a tunable).
```

```yaml
motion-id: world-spawn-portal
type: ambient
applies_to: enemy spawn portal (state-graph §3.2 `spawning`) = slot-map `fx.spawn_portal` (Puny purple row 11 through `L_PORTAL_HOSTILE`), 10 f
attention_tier: T2
runtime: anims
timeline: "f0–f3 loop @ 12 fps until spawnPortalMs − spawnEmergeMs (500 ms) → f4–f7 collapse @ 20 fps (200 ms, synced with the enemy emerge) → f8–f9 sparkle @ 20 fps (100 ms, after the enemy is active)"
audio: [ { on: "first portal of a wave, frame 0", cue_id: wave_spawn, bus: sfx } ]   # once per wave, not per enemy
reduced_motion: keep            # it is a telegraph (where enemies will appear)
```

```yaml
motion-id: world-ambient-props
type: ambient
applies_to: wall torches (puny 8 f), wall fountains (0x72 3 f), floor spikes (decor only)
attention_tier: T4
runtime: anims
fps: { torch: 8, fountain: 6 }
phase_offset: "random start frame per instance (fx stream); no two adjacent torches in phase"
reduced_motion: keep            # low-amplitude T4 loops; below the T3 pickup bob in salience
notes: T4 must never out-move T3. Torch flicker is frame animation with no light-radius pulsing.
```

---

## §7 Audio id alignment (for the Audio Director's `cue-spec`)

Existing ids used here (mechanic-spec §14 / UX screen-graph §7): `ui_move`, `ui_confirm`, `ui_back`, `ui_denied`, `ui_tab`, `ui_card_pick`, `ui_card_place`, `ui_salvage`, `ui_buy`, `ui_unlock`, `sputter`, `wand_recharge`, `wand_swap`, `low_hp`, `room_clear`, `pickup_coin`, `pickup_card`, `door_open`, `wave_spawn`.
**Proposed new ids** (Audio Director accepts, renames or folds): `portal_enter`, `heal`, `toast`, `boss_intro`, `ui_card_deal`, `relic_gain`, `reward_appear`, `door_close`, `chest_open`. Motion never depends on them existing: an absent cue is a silent moment, not a broken motion.
