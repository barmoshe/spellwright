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
motion-id: boss-name-card            # v1 entry, SUPERSEDED in v2 by `boss-intro-card` (§13); kept so v1 references resolve
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
timeline: "f0–f3 loop @ 12 fps until spawnPortalMs − spawnEmergeMs (650 ms in v2; the ambush twist's 1100 ms portal loops longer) → f4–f7 collapse @ 20 fps (200 ms, synced with the enemy emerge) → f8–f9 sparkle @ 20 fps (100 ms, after the enemy is active)"
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

---

# v2 (Wave A2) entries

Authored to: UX `mobile-touch-spec.md` §3–§6, §11 (touch), `ftue-flow.md` §5 (ghost hand, first-block tips), `wand-editor-ux.md` §10–§11 (phone mode, insert-or-swap, mana bar, Enables chips), `screen-graph.md` §9 (Mode Select, Goals, Reward Skip/Reroll, Forge, Daily result), `hud-layout.md` §9 (touch HUD, counter pips, intro card, phase banner, door threats, affix nameplates), and `design-v2.md` §5/§9 (duos, forge). §0 rules apply unchanged: Penner eases by semantics, no UI element shakes (accessibility §4.2), no fractional scale on pixel UI, input never blocked (queued or live), and every entry has a reduced-motion fallback. Cue ids follow the Audio Director's `specs/audio/cue-spec.json` (`event-markers.md` §5); ids still marked *proposed* have no cue yet.

## §7 Touch controls (HudScene clock; `mobile-touch-spec.md`)

```yaml
motion-id: touch-stick-appear
type: microinteraction
applies_to: move / aim stick (ring R = touchStickRadiusPx 28, knob r 10), on pointerdown in its zone
runtime: immediate (no tween)
duration_ms: 0                        # UX §11: "appear (0 ms, no pop)": the base is under the thumb on the touch frame
transform: [ { property: opacity, target: [ring, disc, knob], from: 0, to: "per mobile-touch-spec §3.2 alphas" } ]
reduced_motion: keep
notes: No scale-in. A pop would put motion under the thumb exactly when the eye should be on the play field.
```

```yaml
motion-id: touch-stick-follow
type: microinteraction
applies_to: knob (both sticks) and move-stick base on overshoot
runtime: per-frame position (no tween, no smoothing)
transform:
  - { property: position, target: knob, to: "base + clamp(finger − base, R)", every: render frame }
  - { property: position, target: move-base, to: "finger − dir·R when |finger − base| > R", every: render frame }   # base follows the thumb 1:1: any easing = input lag + drift
reduced_motion: keep                  # it is input feedback, not decoration
notes: The drawn base is clamped ≥ R + 2 px inside the canvas; the vector math uses the true touch point (UX §3.2).
```

```yaml
motion-id: touch-stick-override
type: microinteraction
applies_to: aim stick crossing touchAimOverride (0.30), in either direction
runtime: phaser-tween
duration_ms: 66
ease: Quad.easeOut
transform:
  - { property: opacity, target: aim-ring, from: 0.35, to: 0.6 }              # "you are aiming by hand"; reverse on dropping below
  - { property: opacity, target: auto-target-marker, from: 1, to: 0, duration_ms: 0 }   # the marker hides at once; the pad aim pip shows (UX §3.3)
reduced_motion: reduce
reduced_motion_alternative: alpha steps instantly
```

```yaml
motion-id: touch-stick-release
type: microinteraction
applies_to: stick on pointerup / pointercancel / modal open
runtime: phaser-tween
duration_ms: 120                      # UX §11
ease: Quad.easeIn
transform: [ { property: opacity, target: [ring, disc, knob], from: current, to: 0 } ]
reduced_motion: reduce
reduced_motion_alternative: disappears instantly
notes: The stick is released in the input layer on the release frame; the fade is cosmetic only. A new touch in the zone mid-fade kills the tween and re-appears at the new point.
```

```yaml
motion-id: touch-buttons-reveal
type: microinteraction
applies_to: DASH / SWAP buttons, on the first touch ever seen this session (or at once with touchControls: on)
runtime: phaser-tween
duration_ms: 200                      # UX §3.2
ease: Quad.easeOut
transform: [ { property: opacity, from: 0, to: 1 } ]
reduced_motion: reduce
reduced_motion_alternative: appear
```

```yaml
motion-id: touch-button-press
type: microinteraction
applies_to: DASH, SWAP, USE (fire on press), PAUSE, EDIT (release-over-same)
runtime: phaser-tween
duration_ms: 80                       # UX §4.2 / §11: body offset 1 px down, darker fill for 80 ms
ease: Quad.easeOut
transform: [ { property: translateY, from: 0, to: 1 }, { property: tint, target: body, to: "MULTIPLY #b0b0b0" } ]
release: { duration_ms: 80, ease: Quad.easeOut, transform: [ { property: translateY, from: 1, to: 0 }, { property: tint, to: none } ] }
audio: [ { on: TWEEN_START, cue_id: touch_ui_tap, bus: ui } ]          # + haptic 6 ms (Rumble backend)
reduced_motion: keep                  # essential affordance
notes: PAUSE/EDIT hold the pressed look while the finger stays inside the hit rect and release it with no activation if the finger slides off (release-over-same, UX §6). DASH/SWAP/USE play the press on pointerdown, and the release plays after 80 ms even if the finger stays down.
```

```yaml
motion-id: touch-dash-cooldown
type: notification
applies_to: DASH ring while any charge refills
runtime: per-sim-report (no free-running tween)
duration_ms: dashCooldownMs           # feel
ease: Linear                          # timing-critical
transform:
  - { property: arc-sweep, target: dash-ring, from: 0, to: 360, direction: clockwise }
  - { property: opacity, target: dash-icon, from: 0.5, to: 1, at: complete, duration_ms: 0 }
complete: { duration_ms: 66, transform: [ { property: tint, target: dash-ring, from: "FILL flash (1 step)", to: none } ] }   # "ready" tick
reduced_motion: keep                  # a timer, information
```

```yaml
motion-id: touch-swap-icon
type: microinteraction
applies_to: SWAP button icon (the NEXT wand's 16 px icon + digit + counter pips), on wand:changed
runtime: phaser-tween
duration_ms: 90                       # UX §11
ease: Quad.easeInOut
transform: [ { property: opacity, target: old-icon, from: 1, to: 0 }, { property: opacity, target: new-icon, from: 0, to: 1 } ]
lockout: { duration_ms: wandSwapMs, ease: Linear, transform: [ { property: opacity, target: button, from: 0.5, to: 1 } ] }
reduced_motion: reduce
reduced_motion_alternative: icon swaps instantly; the lockout alpha is kept
```

```yaml
motion-id: touch-use-popin
type: microinteraction
applies_to: USE button appearing when an interactable enters interactRadius; its verb icon
runtime: phaser-tween
duration_ms: 120                      # UX §11: a 2-frame 1 px lift, never a fractional scale
ease: Back.easeOut
transform: [ { property: opacity, from: 0, to: 1, duration_ms: 66 }, { property: translateY, from: 1, to: 0 } ]
exit: { duration_ms: 90, ease: Quad.easeIn, transform: [ { property: opacity, from: 1, to: 0 } ] }
reduced_motion: reduce
reduced_motion_alternative: appear / disappear
```

```yaml
motion-id: touch-auto-target-marker
type: microinteraction
applies_to: the auto-fire target (4 corner brackets, 1 px, around the target's body rect + 2 px); RunScene clock
runtime: phaser-tween
duration_ms: 66
ease: Cubic.easeOut
transform: [ { property: rect, from: previous-target-rect, to: new-target-rect } ]   # retarget slides, so the switch is readable
idle: { note: "no pulse, brackets are static while locked (a pulsing marker on every target competes with telegraphs, T1 > marker)" }
reduced_motion: reduce
reduced_motion_alternative: brackets jump to the new target
notes: Hidden while the aim-stick override is active (touch-stick-override). Never drawn over a windup decal's rim (the brackets sit on the sprite, the decal on the floor).
```

```yaml
motion-id: rotate-overlay-pictogram
type: ambient
applies_to: DOM #rotate phone pictogram (portrait on a phone)
runtime: css
duration_ms: 2000                     # UX: rotates 90° once per 2 s
ease: "cubic-bezier(0.65, 0, 0.35, 1)"   # easeInOutCubic
keyframes: "0% rotate(0) · 30% rotate(90deg) · 70% rotate(90deg) · 100% rotate(0)"
reduced_motion: disable
reduced_motion_alternative: static pictogram with the ↻ arrow (UX)
```

```yaml
motion-id: welcome-back-header
type: modal
applies_to: Pause:Menu "Welcome back" header after focus return (mobile-touch-spec §7)
runtime: phaser-tween
duration_ms: 150
ease: Cubic.easeOut
transform: [ { property: opacity, from: 0, to: 1 }, { property: translateY, from: -4, to: 0 } ]
reduced_motion: reduce
reduced_motion_alternative: opacity only
notes: Plays after modal-open. The 180 ms open-guard is re-armed at reveal and is independent of this tween.
```

## §8 Coaching (Pause:Wands; `ftue-flow.md` §5)

```yaml
motion-id: coach-ghost-hand
type: ambient
applies_to: ghost hand 16×16 (+ optional 2-frame tap pose) + a 1× translucent card copy, from the held card's cell to the engine-derived goal cell
runtime: phaser-tween (chain, repeat -1)
start_delay_ms: 1500                  # UX: only after 1.5 s without editor input
phases:
  appear: { duration_ms: 150, ease: Quad.easeOut, transform: [ { property: opacity, target: [hand, card-copy], from: 0, to: "1 / 0.5" } ] }
  travel: { duration_ms: 900, ease: Cubic.easeInOut, transform: [ { property: position, target: [hand, card-copy], from: source-cell, to: goal-cell } ] }   # UX 900 ms; in-place traversal → easeInOut
  tap:    { duration_ms: 100, transform: [ { property: frame, target: hand, to: "tap pose (2 f) or translateY +1 px" } ] }
  hold:   { duration_ms: 500, transform: [] }                   # UX 500 ms
  fade:   { duration_ms: 150, ease: Quad.easeIn, transform: [ { property: opacity, target: [hand, card-copy], to: 0 } ] }
goal_ring: { applies_to: goal cell, duration_ms: 400, ease: Sine.easeInOut, transform: [ { property: opacity, target: "2 px ring", from: 1, to: 0.4, yoyo: true, repeat: -1 } ] }
touch_offset: { y_px: -16, note: "hand drawn above the path so the player's finger never hides it (UX §5.1.6)" }
path: { shape: "straight line; insert goals end on the insert-bar position, not the cell centre" }
hide: "any editor input kills the chain at once (no fade-out); it re-arms after the next 1.5 s idle"
reduced_motion: disable
reduced_motion_alternative: static hand on the goal cell + 1 px dotted line from source to goal + static ring (UX)
notes: The hand and copy draw above the cells, below pane C. Loop period = 150 + 900 + 100 + 500 + 150 = 1.8 s, slow enough to read and follow, and never faster than one demo per 1.5 s.
```

```yaml
motion-id: coach-first-block-tip
type: notification
applies_to: P12 first-block tip (per defence type) in the FTUE prompt slot
runtime: phaser-tween
phases:
  enter: { duration_ms: 150, ease: Cubic.easeOut, transform: [ { property: opacity, from: 0, to: 1 }, { property: translateY, from: 4, to: 0 } ] }
  icon:  { duration_ms: 400, ease: Sine.easeInOut, transform: [ { property: opacity, target: defence-icon, from: 1, to: 0.5, yoyo: true, repeat: 1 } ] }   # two pulses, then static
  exit:  { duration_ms: 150, ease: Quad.easeIn, transform: [ { property: opacity, from: 1, to: 0 } ] }
reduced_motion: reduce
reduced_motion_alternative: appear/disappear, static icon (ftue §0 rule 7 pattern)
```

## §9 Wand editor v2 (`wand-editor-ux.md` §10–§11)

```yaml
motion-id: editor-insert-marker
type: microinteraction
applies_to: insert-bar (2×40 px at the target cell's left edge) / swap-ring (2 px) while hovering a target
runtime: immediate + tween
transform:
  - { property: opacity, target: marker, from: 0, to: 1, duration_ms: 0 }      # the result must be visible before the drop: no fade-in lag
  - { property: translateX, target: "▸ arrows on the cards that will shift", from: 0, to: 1, yoyo: true, repeat: -1, duration_ms: 300, ease: Sine.easeInOut }   # 1 px nudge in the shift direction
reduced_motion: reduce
reduced_motion_alternative: static arrows
```

```yaml
motion-id: editor-insert-shift
type: microinteraction
applies_to: cards shifted by an insert drop (`placementFor` mode = insert)
runtime: phaser-tween
duration_ms: 90
ease: Cubic.easeOut
transform: [ { property: translateX, target: shifted-cards, from: old-cell-x, to: new-cell-x } ]   # simultaneous with editor-card-place's travel; the seat bounce plays on the inserted card only
audio: [ { on: TWEEN_START, cue_id: ui_card_place, bus: ui } ]
reduced_motion: reduce
reduced_motion_alternative: cards snap
```

```yaml
motion-id: editor-touch-ghost
type: microinteraction
applies_to: 2× (64×64) drag ghost on touch, at finger − (0, 56) (flips below when finger.y < 72)
runtime: per-frame position (no smoothing)
transform:
  - { property: position, to: "finger − (0, 56)", every: render frame }
  - { property: flip, to: "below-finger when finger.y < 72", duration_ms: 66, ease: Cubic.easeOut }   # the only eased move: the flip crosses the finger
lift: { duration_ms: 66, ease: Cubic.easeOut, transform: [ { property: translateY, from: 0, to: -56 }, { property: opacity, from: 0, to: 0.9 } ] }   # plays once the drag passes touchDragThresholdPx
reduced_motion: reduce
reduced_motion_alternative: the ghost appears at the offset without the lift
```

```yaml
motion-id: editor-delta-chip
type: microinteraction
applies_to: DPS / mana delta chip beside the ghost while hovering a valid target
runtime: phaser-tween
duration_ms: 66
ease: Quad.easeOut
transform: [ { property: opacity, from: 0, to: 1 } ]
exit: { duration_ms: 50, ease: Quad.easeIn, transform: [ { property: opacity, to: 0 } ] }
reduced_motion: keep                  # a fade this short is not vestibular motion
```

```yaml
motion-id: editor-mana-bar-preview
type: microinteraction
applies_to: summary mana bar (use/s tick, regen solid, overspend hatch) while a card hovers a target
runtime: phaser-tween
duration_ms: 150
ease: Cubic.easeInOut                 # in-place change
transform: [ { property: [tick-x, hatch-width], from: before, to: after } ]
ghost_tick: { note: "a 1 px ghost tick stays at the before-state (UX §11.1)" }
reduced_motion: reduce
reduced_motion_alternative: jumps; the ghost tick is kept (UX)
```

```yaml
motion-id: editor-enables-chip
type: microinteraction
applies_to: Enables chips (pierce / blast / shock) on hover delta
runtime: phaser-tween
gained: { duration_ms: 120, ease: Back.easeOut, transform: [ { property: translateY, from: -2, to: 0 }, { property: opacity, from: 0, to: 1 } ], prefix: "+" }
lost:   { duration_ms: 0, transform: [ { property: strike-line, to: visible } ] }   # a line, not a colour (UX)
reduced_motion: reduce
reduced_motion_alternative: gained chips appear without the lift
```

```yaml
motion-id: editor-counter-pip-link
type: notification
applies_to: counter pips on wand cards matching the next door's threat, on editor open (wand-editor-ux §11.3)
runtime: phaser-tween
duration_ms: 400
ease: Sine.easeInOut
transform: [ { property: opacity, target: matching-pips, from: 1, to: 0.3, yoyo: true, repeat: 0 } ]   # pulses once
reduced_motion: reduce
reduced_motion_alternative: a 1 px ring around the matching pips for 1 s
```

## §10 Forge (Shop → Forge tab; `screen-graph.md` §9.5, `design-v2.md` §9)

```yaml
motion-id: forge-merge
type: stinger
applies_to: D7 confirmed "Merge" (2 copies → level-2 card) in the Forge recipe column / pane C
runtime: phaser-tween (chain)
total_duration_ms: 620
phases:
  converge: { duration_ms: 180, ease: Cubic.easeIn, transform: [ { property: position, target: [copy-a, copy-b], from: "their row positions", to: "result slot centre" } ] }
  fuse:     { duration_ms: 50,  transform: [ { property: tint, target: "copies + result", from: "FILL flash (3 steps)", to: none } ], fx: "8 motes burst from the centre (element hue of the card)" }
  reveal:   { duration_ms: 160, ease: Back.easeOut, transform: [ { property: translateY, target: result-card, from: 4, to: 0 }, { property: opacity, target: result-card, from: 0, to: 1 } ] }
  level-pip: { duration_ms: 120, ease: Back.easeOut, transform: [ { property: translateY, target: "level-2 pip (art)", from: -3, to: 0 } ] }
  stat-diff: { duration_ms: 110, transform: [ { property: tint, target: "▲ stat lines", from: "#facb3e", to: normal } ] }
audio: [ { on: phase:fuse:start, cue_id: forge_merge, bus: ui } ]
reduced_motion: reduce
reduced_motion_alternative: copies fade out (120 ms), result fades in (120 ms), pip and stat highlight kept
notes: Input is live after `fuse` (a tap during reveal completes it). If the merged card sat in a wand slot, the slot's ↻ badge plays editor-changed-badge after reveal.
```

```yaml
motion-id: forge-evolve
type: stinger
applies_to: D7 confirmed "Evolve" (level-2 card + catalyst relic → evolved card; the relic is kept)
runtime: phaser-tween (chain)
total_duration_ms: 950
phases:
  gather:  { duration_ms: 250, ease: Cubic.easeInOut, transform: [ { property: position, target: base-card, to: centre }, { property: position, target: "catalyst ghost (a copy; the relic icon stays in place)", from: relic-icon, to: centre } ] }
  orbit:   { duration_ms: 250, ease: Linear, transform: [ { property: angle, target: catalyst-ghost, from: 0, to: 360, radius_px: 10 } ] }   # the "catalyst is not consumed" read: it circles, then returns
  flash:   { duration_ms: 66,  transform: [ { property: tint, target: base-card, from: "FILL flash (4 steps)", to: none } ], fx: "12 motes + evolved-frame glint" }
  reveal:  { duration_ms: 220, ease: Back.easeOut, transform: [ { property: translateY, target: evolved-card, from: 6, to: 0 }, { property: opacity, from: 0, to: 1 }, { property: frame, to: "evolved frame (art)" } ] }
  return:  { duration_ms: 164, ease: Cubic.easeOut, transform: [ { property: position, target: catalyst-ghost, from: centre, to: relic-icon }, { property: opacity, target: catalyst-ghost, to: 0 } ] }
rarity_glint: "reward-draft-deal rarity_glint once, on reveal complete"
audio: [ { on: phase:gather:start, cue_id: forge_evolve, bus: ui } ]
reduced_motion: reduce
reduced_motion_alternative: base fades out, evolved fades in (150 ms each), "Kindling stays" line highlights; no orbit
notes: The longest UI beat in the game, deliberately. An evolution is the run's power spike (design-v2 §9), and it still stays under 1 s with input live after `flash`.
```

```yaml
motion-id: forge-slot-buy
type: microinteraction
applies_to: "+1 Slot" purchase (plain buy, no confirm)
runtime: phaser-tween
duration_ms: 200
ease: Back.easeOut
transform: [ { property: translateX, target: "new empty slot cell on the wand card", from: -4, to: 0 }, { property: opacity, from: 0, to: 1 } ]
audio: [ { on: TWEEN_START, cue_id: forge_slot, bus: ui } ]
reduced_motion: reduce
reduced_motion_alternative: slot appears
```

## §11 Reward v2 (`screen-graph.md` §9.4)

```yaml
motion-id: reward-reroll
type: microinteraction
applies_to: S4 Reroll (cost 8, +8; max 2)
runtime: phaser-tween (chain)
phases:
  out: { duration_ms: 100, ease: Quad.easeIn, stagger_ms: 30, transform: [ { property: translateY, target: offered-cards, from: 0, to: 8 }, { property: opacity, from: 1, to: 0 } ] }
  in:  "reward-draft-deal with stagger_ms 40 (the kind never changes, so the frames stay and only the contents re-deal)"
cost_label: { duration_ms: 120, ease: Back.easeOut, transform: [ { property: translateY, target: reroll-cost, from: -2, to: 0 } ] }   # the new price lands
audio: [ { on: phase:out:start, cue_id: ui_reroll, bus: ui } ]
denied: ui-denied (the reason line: "Need 5 more gold" / "No rerolls left")
reduced_motion: reduce
reduced_motion_alternative: cards cross-fade (100 ms)
```

```yaml
motion-id: reward-skip
type: stinger
applies_to: S4 Skip (+6 + 4 × floor gold); the modal closes after
runtime: phaser-tween (chain)
total_duration_ms: 420
phases:
  cards:  { duration_ms: 120, ease: Quad.easeIn, transform: [ { property: translateY, target: offered-cards, from: 0, to: 8 }, { property: opacity, from: 1, to: 0 } ] }
  coins:  { duration_ms: 300, ease: Cubic.easeIn, stagger_ms: 30, count: "min(ceil(gold / 3), 6)", transform: [ { property: position, target: "coin icons (8×8)", from: skip-button, to: "HUD coin icon (H6)" } ] }   # the trade is shown: gold goes where gold lives
then: "modal-close; hud-coins-bump on the last coin's arrival; the world pedestal plays world-reward-rise in reverse (sink 150 ms Quad.easeIn)"
audio: [ { on: phase:cards:start, cue_id: reward_skip, bus: ui } ]
reduced_motion: reduce
reduced_motion_alternative: cards fade; no coin flight; the coin counter updates on close
```

```yaml
motion-id: duo-offer
type: stinger
applies_to: a DUO relic card in a relic draft (both parents owned)
runtime: phaser-tween (chain), runs inside reward-draft-deal for that card
total_duration_ms: 420
phases:
  parents: { duration_ms: 200, ease: Cubic.easeOut, transform: [ { property: translateX, target: "parent icon L / R (16 px)", from: "±24", to: "±9 (their slots on the card)" } ] }
  link:    { duration_ms: 100, transform: [ { property: width, target: "1 px link line between the parents", from: 0, to: full } ] }
  checks:  { duration_ms: 120, ease: Back.easeOut, stagger_ms: 60, transform: [ { property: translateY, target: "✔ owned marks", from: -2, to: 0 } ] }
audio: [ { on: phase:link:start, cue_id: duo_unlock, bus: ui } ]
reduced_motion: reduce
reduced_motion_alternative: parents, link and checks appear with the card
```

```yaml
motion-id: duo-take
type: stinger
applies_to: taking a duo relic
runtime: phaser-tween
total_duration_ms: 600
phases:
  parents-pulse: { duration_ms: 250, ease: Sine.easeInOut, transform: [ { property: opacity, target: "both parent icons in the relic row (H3)", from: 0.5, to: 1 } ] }   # they "answer" together
  fly:           { duration_ms: 350, ease: Cubic.easeInOut, transform: [ { property: position, target: duo-icon, from: card, to: "relic row slot" } ] }
then: hud-toast (relic gained)
audio: [ { on: phase:parents-pulse:start, cue_id: duo_unlock, bus: ui } ]
reduced_motion: reduce
reduced_motion_alternative: icon appears in the relic row; toast
```

## §12 Meta screens (`screen-graph.md` §9.2, §9.3, §9.6)

```yaml
motion-id: mode-select
type: modal
applies_to: S1m Mode Select (3 mode cards, loadout row, Heat stepper)
runtime: phaser-tween
enter: { duration_ms: 200, stagger_ms: 60, ease: Cubic.easeOut, transform: [ { property: translateY, target: mode-cards, from: 8, to: 0 }, { property: opacity, from: 0, to: 1 } ] }
focus: reward-card-focus (−3 px lift, 66 ms)
select: { duration_ms: 33, transform: [ { property: tint, target: chosen-card-frame, from: "FILL flash (2 f)", to: none } ] }
heat_stepper: { duration_ms: 90, ease: Cubic.easeOut, transform: [ { property: translateY, target: heat-numeral, from: "±4 (direction of the step)", to: 0 }, { property: opacity, from: 0, to: 1 } ] }
gentle_disables_heat: { duration_ms: 120, ease: Quad.easeOut, transform: [ { property: opacity, target: heat-selector, from: 1, to: 0.5 } ] }   # + the reason line (UX)
locked_card: ui-denied (a dead press; no shake)
daily_card: { note: "Begin on Daily plays `daily_start` (cue) at the modal-close start" }
audio: [ { on: select, cue_id: ui_confirm, bus: ui } ]
reduced_motion: reduce
reduced_motion_alternative: no stagger, no lift; numeral swaps instantly
```

```yaml
motion-id: goals-list
type: modal
applies_to: S1g Goals list (≈15 rows, 24 px pitch)
runtime: phaser-tween
enter: { duration_ms: 160, stagger_ms: 20, max_staggered_rows: 8, ease: Cubic.easeOut, transform: [ { property: opacity, from: 0, to: 1 }, { property: translateX, from: -4, to: 0 } ] }   # rows beyond 8 appear with row 8
next_goal_row: { duration_ms: 150, ease: Cubic.easeInOut, transform: [ { property: height, from: 24, to: 48 } ] }   # expands to 2 lines after enter; scroll eases to it (200 ms Cubic.easeInOut)
title_badge: { applies_to: "Title → Goals '!' badge", duration_ms: 500, ease: Sine.easeInOut, transform: [ { property: opacity, from: 1, to: 0.4, yoyo: true, repeat: 1 } ], then: static }   # two pulses, then static
reduced_motion: reduce
reduced_motion_alternative: rows appear together; row expanded from the start; badge static
```

```yaml
motion-id: goal-complete
type: stinger
applies_to: Run End (S7) "Goal complete" line + the reward reveal, and Goals row status change ○/▶ → ✔ or ◐
runtime: phaser-tween
total_duration_ms: 700
phases:
  stamp:  { duration_ms: 160, ease: Back.easeOut, transform: [ { property: translateY, target: "✔ status glyph", from: -6, to: 0 }, { property: opacity, from: 0, to: 1 } ] }
  reward: { duration_ms: 240, ease: Cubic.easeOut, delay_ms: 100, transform: [ { property: translateY, target: "reward icon + name", from: 6, to: 0 }, { property: opacity, from: 0, to: 1 } ] }
  glint:  { duration_ms: 300, transform: [ { property: translateX, target: diagonal-glint-stripe, from: icon-left, to: icon-right } ] }
audio: [ { on: phase:stamp:start, cue_id: stg_goal, bus: ui } ]   # ui_unlock when the reward is an unlock
reduced_motion: reduce
reduced_motion_alternative: stamp and reward fade in (120 ms); no glint
notes: Queued payouts (◐) stamp with the half-glyph and no reward phase.
```

```yaml
motion-id: daily-result
type: modal
applies_to: S7d Daily result (header, rule + loadout line, share line, Copy)
runtime: phaser-tween
enter: runend-summary (stagger 80)
share_line: { duration_ms: 200, ease: Cubic.easeOut, transform: [ { property: opacity, from: 0, to: 1 } ] }   # no type-on: the line must be selectable-looking immediately
copy_success: { duration_ms: 150, ease: Back.easeOut, transform: [ { property: translateY, target: "Copied ✔ chip", from: 2, to: 0 }, { property: opacity, from: 0, to: 1 } ], then: "hud-toast timing; 6 ms haptic on touch (UX)" }
first_try_badge: { duration_ms: 160, ease: Back.easeOut, transform: [ { property: translateY, target: "'First try' / 'Practice' badge", from: -4, to: 0 } ] }
audio: [ { on: copy_success, cue_id: ui_confirm, bus: ui } ]
reduced_motion: reduce
reduced_motion_alternative: opacity only
```

## §13 In-run v2 HUD and world moments

```yaml
motion-id: boss-intro-card
type: stinger
applies_to: boss and mini-boss intro card (hud-layout §9.6) during the activation delay A (1200 boss / 800 mini)
runtime: phaser-tween (HudScene)
total_duration_ms: A
phases:
  letterbox: { duration_ms: introLetterboxMs, ease: Cubic.easeOut, transform: [ { property: translateY, target: "bars 16 px (top/bottom)", from: "∓16", to: 0 } ] }
  hud-dim:   { duration_ms: 150, ease: Quad.easeOut, transform: [ { property: opacity, target: hud-clusters, from: 1, to: 0.4 } ] }
  name:      { at_ms: "150 boss / 100 mini", duration_ms: 200, ease: Cubic.easeOut, transform: [ { property: translateX, from: -24, to: 0 }, { property: opacity, from: 0, to: 1 } ] }
  subtitle:  { at_ms: "300 / 200", duration_ms: 160, ease: Cubic.easeOut, transform: [ { property: opacity, from: 0, to: 1 } ] }
  adapt:     { at_ms: "450 / 300", duration_ms: 160, ease: Back.easeOut, transform: [ { property: translateY, from: 4, to: 0 }, { property: opacity, from: 0, to: 1 } ], condition: "an adapt rule applied" }
  out:       { at_ms: "A − 200", duration_ms: 200, ease: Quad.easeIn, transform: [ { property: opacity, target: [card, bars-slide-out], to: 0 }, { property: opacity, target: hud-clusters, to: 1 } ] }
audio:
  - { on: phase:name:start, cue_id: "stg_boss_intro + boss_roar_<id> | stg_miniboss_intro + miniboss_roar_<id>", bus: music-stinger }
  - { on: phase:adapt:start, cue_id: stg_boss_adapt, bus: sfx }
sync: "state-graph-spec §8.4 table; the boss rise (§4 intro) plays at pan arrival (bosses) / 0 ms (minis)"
reduced_motion: reduce
reduced_motion_alternative: bars and card appear/disappear (no slides); timings unchanged; the boss pan becomes UX's fade cut
```

```yaml
motion-id: boss-phase-banner
type: stinger
applies_to: phase banner under the boss bar (hud-layout §9.6), on boss:phase, after the phase hit-stop ends
runtime: phaser-tween (HudScene)
total_duration_ms: phaseBannerMs              # 1500 (UX)
phases:
  bar-flash: { duration_ms: 33, transform: [ { property: tint, target: bar-frame, from: "FILL flash (2 f)", to: none } ] }   # flash-intensity scaled
  in:   { duration_ms: 160, ease: Back.easeOut, transform: [ { property: translateY, from: -4, to: 0 }, { property: opacity, from: 0, to: 1 } ] }
  hold: { duration_ms: "phaseBannerMs − 360" }
  out:  { duration_ms: 200, ease: Quad.easeIn, transform: [ { property: opacity, from: 1, to: 0 } ] }
reduced_motion: reduce
reduced_motion_alternative: opacity only (UX: instant alpha steps)
```

```yaml
motion-id: door-threat-icon
type: stinger
applies_to: the third door icon (threat) / risk icon, joining world-door-open's `icons` phase
runtime: phaser-tween
stagger_ms: 60                         # room kind → reward kind → threat, left to right
duration_ms: 200
ease: Back.easeOut
transform: [ { property: translateY, from: -4, to: 0 }, { property: opacity, from: 0, to: 1 } ]
risk_door: { note: "the risk icon adds one ember glint every 3 s (1 px, T2 prop budget); no pulse (a risk is a choice, not a hazard)" }
audio: [ { on: "threat icon TWEEN_START (once per room, first threat door only)", cue_id: door_threat, bus: sfx } ]
reduced_motion: reduce
reduced_motion_alternative: icons fade in together; no glint
```

```yaml
motion-id: twist-banner
type: stinger
applies_to: H15 twist banner ("Ambush!" / "Darkness") on room entry, before wave 0
runtime: phaser-tween
total_duration_ms: 1200
phases: "banner-room-cleared phases (160 punch / 840 hold / 200 out)"
dark_light: { note: "the dark twist's light radius (lightRadiusPx 72) fades in from full over 400 ms Cubic.easeInOut after the fade-in, so 'the lights go out' is seen, not cut" }
reduced_motion: reduce
reduced_motion_alternative: opacity only; the light radius snaps
```

```yaml
motion-id: affix-nameplate
type: notification
applies_to: elite affix glyph (7×7, persistent) + title (T1, 1.5 s on spawn and on the first hit) 3 px above the sprite
runtime: phaser-tween (RunScene clock: world object)
glyph_in: { at: "spawn emerge end", duration_ms: 120, ease: Back.easeOut, transform: [ { property: translateY, from: 2, to: 0 }, { property: opacity, from: 0, to: 1 } ] }
title: { in: 120, hold: 1260, out: 120, ease_in: Cubic.easeOut, ease_out: Quad.easeIn, transform: [ { property: opacity, from: 0, to: 1 } ] }
audio: [ { on: "title in (spawn)", cue_id: affix_reveal, bus: sfx, proposed: true } ]
reduced_motion: reduce
reduced_motion_alternative: opacity steps only
```

```yaml
motion-id: world-defence-word
type: notification
applies_to: "BLOCKED" / "ARMOURED" / "WARDED" / "BROKEN" words + 7×7 icon replacing the damage number (hud-layout §9.6; aggregated per enemy per 500 ms)
runtime: phaser-tween (RunScene)
base: world-damage-number (same rise, same fade, same reduced-motion rule)
differences: [ "no crit scale", "grey #b6cbcf (UX)", "BROKEN: 1-step spawn_pop + held 150 ms longer before the rise" ]
```

```yaml
motion-id: hud-counter-pips
type: notification
applies_to: counter pips (HUD, 7×7; SWAP button sub-row on touch) when a defence enters/leaves the room, and fill changes
runtime: phaser-tween (HudScene)
appear: { duration_ms: 120, ease: Back.easeOut, transform: [ { property: translateY, from: -2, to: 0 }, { property: opacity, from: 0, to: 1 } ] }
fill_change: { duration_ms: 33, transform: [ { property: tint, from: "FILL flash (2 f)", to: none } ] }   # wand swap made it countered / not
disappear: { duration_ms: 150, ease: Quad.easeIn, transform: [ { property: opacity, to: 0 } ] }
reduced_motion: reduce
reduced_motion_alternative: appear/disappear; the fill change is instant (shape carries it)
```

```yaml
motion-id: hud-mode-badge
type: ambient
applies_to: mode badge ("Heat 3" / "Gentle +2♥ 10%" / "Daily"), C2
runtime: phaser-tween
behaviour: "same peripheral fade as H4 (hud-layout §3.1: 100 % for 3 s on room:enter, then 40 %; 150 ms linear)"
reduced_motion: reduce
reduced_motion_alternative: instant alpha steps
```
