# Spellwright — `aspect-ratio-spec` (adaptive width, phone room zoom, overlay layering)

**Owner:** UX Designer · **Status:** v2.3, 2026-09-27 (v2.2 phone-height rule, §1; menu-height swap for modals, §6.0) · **Consumers:** Game Developer (display, camera, layout), 2D Artist (title/backdrop bleed), Game Designer (fairness note in §3.4).
**Evidence:** `refs/iphone-landscape-letterbox-2026-09-27.png` (pause) and `refs/iphone-landscape-gameplay-2026-09-27.png` (play). iPhone at 844×390 CSS (2.16:1): the canvas is 693 CSS wide with ~75 CSS px black bars on each side. A 416×240 room covers 65% of the canvas width and 67% of its height, drawn at 1.083×.
**Amends:** `mobile-touch-spec.md` §1 (safe-rect profiles A and B are replaced by the formula in §2), `hud-layout.md` §2.4 and §9.2 (anchoring), `accessibility-spec.md` §1 (the phone limitation line), `screen-graph.md` rule 6 (HUD visibility under modals).

**DOG for this spec:** (1) With W from 640 to 800 and side insets from 0 to 55 game px, no two HUD rects intersect, and no HUD rect leaves the safe rect S by less than 6 px. (2) On a phone, no enemy can attack while it is outside the band-free clear rect, and every room ≤ 240 tall is fully visible in that rect at a total scale ≥ 1.3×. (4) No modal element leaves S or enters the Back reserved corner, and no modal text is scaled (menu-height swap, §6.0). (3) While any modal is open, no HUD pixel or touch control is drawn or hit-testable.

---

## §1 Internal size W × H

**v2.2 (user override: "it is still small").** On phones the internal **height** now shrinks too, so everything (world, HUD, text, buttons) renders larger. This supersedes v2.1's "H = 360 everywhere".

```
aspect = max(vw, vh) / min(vw, vh)                  // a portrait boot sizes for landscape
Phone (isPhone):          H = even(clamp(ceil(640 / aspect), 288, 360));  W = even(round(H × aspect)) ∈ [640, 800]
16:9 devices and desktop: H = 360;  W = clamp(even(floor(vw_landscape / sY)), 640, 800)   // sY = FIT or integer k
```

| Device (landscape CSS) | W × H | Scale | T1 cap (CSS px) | Touch hit Ø 46 → CSS |
|---|---|---|---|---|
| iPhone 12–15 844×390 | 640×296 | 1.32 | 9.2 (was 7.6) | 61 |
| iPhone Pro Max 932×430 | 640×296 | 1.45 | 10.2 | 67 |
| iPhone SE 667×375 (1.78) | 640×360 | 1.04 | 7.3 (unchanged) | 48 |
| Android 20:9 915×412 | ≈ 640×288 | 1.43 | 10.0 | 66 |
| iPad, desktop | 640–800 × 360 | unchanged | unchanged | — |

- **W_MAX = 800** is kept for desktops and very wide phones. 800 = the widest room (768) + 16 px of void on each side. A 21:9 screen clamps to 800, leaving an invisible void-coloured bar.
- **Narrower than 16:9:** W = 640, with a top/bottom letterbox (unchanged).
- **Live recompute:** W and H are recomputed on `EV.DISPLAY_CHANGED` (debounced 150 ms), followed by `setGameSize`, then a rebuild of the layouts (§4), the modals (§6) and the camera (§3). Every positioning read of `VIEW_W` or `VIEW_H` is live.
- **Colours:** the page background, the canvas clear colour and the room void are all `#0b0a10`.
- **Accessibility:** this retires the phone legibility limitation recorded in `accessibility-spec` §1 on every notched phone. The one exception is the iPhone SE, which stays at 1.04×.

## §2 Safe rect (replaces `mobile-touch-spec.md` §1 profiles A and B)

The canvas now reaches the physical screen edges on phones, so the notch and Dynamic Island insets land **inside** the canvas.
- `S = (sL, sT, W − sR, H − sB)`, where `inset_game = ceil(max(0, env(inset) − letterbox_css) / scale)`. This is the existing formula; the letterbox is now about 0.
- Reference values at H 296 (scale 1.32): iPhone 14 `sL = sR = 36`; 14 Pro and 15 Pro `45`; `sT = 0`; `sB = 16`. Android and desktop: all 0. The worst-case safe width is **550** (640 − 2 × 45).
- **Margins:**
  - HUD content sits ≥ 6 px inside S (`hud-layout` §2.4, now measured from S instead of the canvas).
  - Touch buttons use their existing formulas with `sr = W − sR`.
  - Modal panel content sits ≥ 16 px inside the panel frame.
  - The **world may bleed under insets**; UI may not.
- Touch zones: move = `x < W/2`, aim = `x ≥ W/2` (was 320).

## §3 Phone world framing (v2.2)

The smaller H does the enlarging. The v2.1 fit zoom stays only as a small-room bonus, and it never zooms below 1.

### 3.1 Numbers

```
B     = sT + 54                 // touch HUD band bottom (kept at 54; see §4.1); desktop B = 0
clear = { x: sL + 4, y: B, w: W − sL − sR − 8, h: H − B }     // the world ignores sB and bleeds under the home bar
z     = isPhone && touch ? clamp(floor(min(clear.w / room.w, clear.h / room.h) × 16) / 16, 1, 1.5) : 1
```

- **Rooms that fit** (`room.h × z ≤ clear.h`): the camera is locked, and the room is centred in the clear rect with `cam.centerY = room.cy − (B / 2) / z`.
- **Rooms taller than the clear rect:** the camera follows vertically (existing lead rules). The camera's y-bounds are `[room.top − B, room.bottom]`, so the room's top wall can scroll down out from under the band.
- **The on-screen gate:** `attackRequiresOnScreen`, auto-aim candidates and spawn telegraphs test against the **clear rect in world coordinates**: `worldView` minus the band. They do not test the raw `worldView`. An enemy hidden under the HUD band therefore counts as off-screen and cannot attack. They also do not test the `VIEW_*` constants.
- **Zoom changes** happen only inside the room fade, or as a snap on `DISPLAY_CHANGED`.
- **World-anchored text stays at scale 1:** it renders through an unzoomed camera, or from `HudScene` via world→screen (O-UX-3).

### 3.2 iPhone 14 (640×296, clear 560×242)

| Room | z | Total CSS scale | Framing |
|---|---|---|---|
| 256×176, 288×176 | 1.375 | 1.81 | locked |
| 320×208, 352×208 | 1.125 | 1.48 | locked |
| 384×224 | 1.0625 | 1.40 | locked |
| 416×240, 480×240 (the screenshot) | 1.0 | 1.32 | locked. The room is 548×316 CSS = 65% × 81% of the screen (was 53% × 67%). The HUD and text grow too. |
| every room ≥ 272 tall (16 of 24, including the elite, the mini-boss and both boss arenas) | 1.0 | 1.32 | vertical follow. The 704- and 768-wide rooms also scroll horizontally. |

### 3.3 Game Designer flags (not objections)

- **Fewer attackers on phones.** In the 16 scrolling rooms, the on-screen gate holds back enemies above or below the view, so phones face fewer simultaneous attackers than desktop does.
- **Boss framing.** Recommended framing for the elite, mini-boss and boss rooms, which the GD owns in the feel-spec camera section: camera y target = `0.5 · player.y + 0.5 · boss.y`, clamped so the player stays ≥ 40 px inside the clear rect. This keeps the boss's telegraphs in view across the 110 px scroll of a 352-tall arena.

## §4 Anchoring rules per element class (x in game px on width W; y relative to H; desktop and touch alike)

| Class | Rule |
|---|---|
| HUD left clusters (hearts, wand badges, strip, mana, counters; desktop bottom-left) | `x = sL + x₆₄₀` |
| HUD right clusters (coins, bag, relics, PAUSE/EDIT; desktop bottom-right, AUTO chip) | `x = (W − sR) − (640 − x₆₄₀)` |
| HUD top-centre (floor track, boss bar and name, mode badge), toasts, banners, floor title card | `x = x₆₄₀ + (W − 640) / 2` when H = 360. When H < 360, use the **compact centre** (§4.1). |
| Collision fallback (validator) | If TC overlaps TL or TR by any px, hide the mode badge first, then draw the boss bar at the mini-boss width ×0.6 |
| Touch DASH / SWAP / USE, sticks | existing formulas with `sr = W − sR`; the swapped side uses `sL` |
| World-UI clamp box | `(sL + 6, y0, (W − sR − 6) − (sL + 6), (H − 54) − y0)`, where `y0` = 44 on desktop and `B + 2` on touch. Replaces the fixed `(6, 44, 628, 262)`. |
| Touch DASH / SWAP / USE at H 296 | `sb = H − sB = 280`: DASH (574, 250), SWAP (574, 200), USE (524, 250) on iPhone 14. Hit Ø stays 46 game px (61 CSS, ≥ 44 pt). Move/aim zones span y `B … H`, which is 226 px tall. |
| **Full-screen modals** (Pause tabs incl. wand editor, Reward, Shop, Settings, Confirm, Run-end, Title sub-panels: mode select, goals, codex) | The panel is designed at a width of 640 inside one container at `x = ox = round((W − 640) / 2)`. Its **height follows the three-band rule (§6)** when H < 360. The **backdrop** is `(0, 0, W, H)` at x 0, never at ox. |
| Pause tab bar | The strip background spans `0…W`. The tabs stay centred (`TAB_X0 = ox + (640 − 76 × 5) / 2`). |
| **Touch Back button** (every modal) | Stays at `(sL + 20, sT + 20)`. The **reserved corner** `(sL, sT, 44, 44)` may contain no panel content and no tab. Only the tab-bar strip passes under it. Panel content at `y < sT + 44` starts at `x ≥ max(ox + 16, sL + 44)`. |
| Title screen | The background art covers `W × H` (bleed; the 2D Artist supplies an 800-wide or tileable backdrop). Logo and menu are centred on `W / 2`. Corner items (version, credits) anchor to the safe corners. |
| Rotate overlay | DOM; unaffected. |

**Validator (`hud-layout` §9.4):** run `layoutFor` over (W × H) ∈ {640×288, 640×296, 640×360, 780×360, 800×360} × side insets {0, 36, 45, 55} × bottom inset {0, 16, 20}, for both profiles. Assert that no rects intersect, that every rect is at least 6 px inside S, and that nothing sits in the reserved corner while a modal is open.

### 4.1 Touch HUD band at H < 360: keep the 54 px height and thin the centre

**Decision:** the left (TL) and right (TR) clusters keep their three rows, at the **same y values as `hud-layout` §9.2**: hearts at 6; badges and strip at 24–41; chevrons at 43; mana at 46–52; relics at 34–50. Only the centre changes.

**Why not compact the band to two rows:** it saves only about 8 CSS px of height. It would also need mana and the strip side by side, which makes TL about 400 px wide, and that cannot fit next to TR inside the worst-case 550 px safe width.

**Compact centre** (only row A, y `sT + 3 … sT + 21`, centred on `W / 2`):
- **Floor track:** label plus pips, about 100 px wide, at `y = sT + 6`.
- **Boss / mini-boss:** name T1 at `(W / 2, sT + 3)`; bar at `(W / 2 − 98, sT + 14, 196, 6)`, or ×0.6 for the mini-boss. It replaces the floor track while shown.
- **Mode badge:** right-aligned at `W / 2 − 56`, `y = sT + 6`. It is the first element hidden on collision.

**Right cluster anchor:** coins, bag and the relic row right-align to `sr − 90` (EDIT's hit area starts at `sr − 84`). The relic row shows at most 5.

**Audit, worst case** (W 640, sL = sR = 45, 10 hearts):

| Element | x range |
|---|---|
| Hearts | 51–191 |
| Boss bar | 222–418 (y 14–20) |
| Strip | 121–332 (y 24–41) |
| Relics | 415–505 (y 34–50) |
| Coins | ≈ 475–505 (y 6–13) |
| EDIT / PAUSE | 511–595 |

- There is no overlap between row A and rows B and C.
- The band's centre occupies only y ≤ 21. The full 54 px of height exists only at x < 332 and x > 415.

## §5 Screenshot bug fixes

### 5.1 The HUD shows through the Pause overlay undimmed; the welcome subtitle collides with the mana bar and wand strip

**Rule (amends `screen-graph` rule 6):** while any modal scene is open, `HudScene` is `setVisible(false)` and its input is disabled. That covers the persistent HUD, the touch sticks, DASH/SWAP/USE and PAUSE/EDIT.
- It fades out over 90 ms together with the backdrop's rise, and fades back in over 120 ms after the modal's close motion finishes. Under reduced motion both are instant.
- A `swap` between modals (Reward ↔ Pause) keeps it hidden.
- **Why hide instead of dim:** every modal already restates what the player needs. Pause shows the reorientation line, the Shop shows coins, the editor shows wands and mana. A dimmed HUD under a dimmed backdrop duplicates that information and collides with the modal's top rows, which is exactly the bug in the screenshot. It also leaves live touch targets under a modal.

**Welcome-back placement:**
- Title: T2, centred at `(W / 2, sT + 30)`.
- Subtitle: T1, centred at `(W / 2, sT + 46)`, max width 440, max 2 lines (fits the 1.35× German expansion). Its bottom must be ≤ 66, the Menu box top (70) minus 4.
- Both lie outside the reserved corner and below the 24 px tab bar.

### 5.2 Other overlaps

- **(b1) Back button over pause content.** The touch Back button's 40 px hit square hangs 16 px below the 24 px tab bar, into the content area. The reserved-corner rule (§4) fixes it.
- **(b2) HUD over the top-left door.** In the gameplay screenshot, the mana value "50" (`sL + 199, sT + 42`) and the bar sit on the top-left door arch, over interactive world. The clear-rect framing (§3.1) puts every room with z > 1 below `B`. For rooms at z = 1 that are taller than the clear rect, the existing occlusion fade (`hud-layout` §3.2) applies.
- **(b3) Controls drawn over the Pause dim.** PAUSE/EDIT (top-right) and the DASH button (bottom-right) are drawn over the dim, and they are live. §5.1 fixes both.

## §6 Modals on compact phones

### 6.0 Shipped rule: the menu-height swap (v2.3; accepts the game-developer objection against v2.2 §6)

While any modal or menu scene is open, a compact phone switches to the **menu size**: H = 360 and `W = even(round(360 × aspect))`, clamped to [640, 800]. This is `setGameSize` under the backdrop's rise. When the last modal closes, the phone switches back to the gameplay size, and the HUD's 120 ms fade-in covers the swap. Title-side screens (Title, mode select, goals, codex, credits, run-end) always use the menu size.

- **Why I accept:** on a 390 px-tall screen, a 360-designed screen can't exceed 1.08× without a per-screen redesign. The swap fits every screen unchanged, at the legibility and target sizes already validated. Gameplay keeps its 1.32–1.45× gain.
- **Consequence:** menu text renders at 1.08×, T1 ≈ 7.6 CSS px. That is the baseline recorded in `accessibility-spec` §1.
- **Backlog:** §6.1 below is the per-screen redesign that would make menus larger too. Adopt it **one screen at a time**, starting with the wand editor and Pause › Menu. A screen that adopts it opts out of the swap.

**Wand editor vs touch Back (open item, fixed here).** In design coordinates, the Back hit rect is `(screenX(sL), screenY(sT), 40, 40)`: on iPhone 14 in menu size that is x −26…14, y 0…40, and on a 15 Pro Max x −15…25.
- **Rule:** in the touch profile, when `backHit.right + 4 > leftColumnFirstItem.x`, the wand editor's **left column (wand list) container** gets an extra `y += max(0, backHit.bottom + 4 − firstItem.top)`, which puts the first card's top at design y ≥ 44. The left-column box top moves with it (20 → 38 for its frame). This is added on top of `TOUCH_DY`.
- **Check:** the last wand row must still end ≤ 342 (+6). If it doesn't, cut the list's row gap by the overflow ÷ (rows − 1).
- **Scope:** the Back button itself does not move. This is the §4 reserved-corner rule applied to the editor. It covers every device, including W 640 (iPhone SE, iPad), where the overlap is larger than 6 px.

### 6.1 Backlog: the three-band redesign for H < 360, per screen

Scaling a 360-designed panel down to fit is **forbidden**: it would mean fractional bitmap text, which drops glyph rows (O-UX-3). Instead, each modal splits into three bands:

- **Header** (tabs, title; designed y < 40): kept at its designed y.
- **Footer** (buttons, hints, detail lines, mana/summary bars): anchored to the bottom, `y' = y − Δ`, where `Δ = 360 − (H − sB)`. Δ = 80 on iPhone 14 (296/16) and 72 on Android (288/0).
- **Body:** frames shrink by Δ. Lists scroll by row, with focus-follow and drag. Fixed blocks must fit within their body height, or they drop lines as specified below.

**Checks for every screen:** no content inside the reserved Back corner; body and footer do not intersect; everything within S.

| # | Screen (file) | Change needed at Δ = 80 |
|---|---|---|
| 1 | **Pause › Wands, the wand editor** (`WandEditor.js`) | **Highest risk.** Slots stay at y 42 (+6 on touch). Bag `BAG_Y` 116 → 100. Preview `PV_Y` 210 → 194, and `PV_LINES` = `max(3, floor((H − sB − 50 − PV_Y) / 17))`; extra lines scroll. Mana bar `BAR.y` 314 → `H − sB − 26`. Summary `p:sum` → `H − sB − 14`. Revert/Close (left column) → `H − sB − 16`. Pane C and the left boxes are `H − sB − 24` tall. Pane C buttons stack from the bottom. |
| 2 | **Pause › Map** (`PauseScene`) | Floor row pitch 88 → `floor((H − sB − 34 − 40) / 3)`, which is 63 on iPhone 14; the pips keep y0 + 26. Legend (300) and info (320) move to the footer. |
| 3 | **Pause › Relics** | Both boxes are `H − sB − 28` tall. The relic grid scrolls by rows. The detail text wraps inside the pane and gets a row scroll if it overflows. |
| 4 | **Pause › Codex, Title › Codex** (`CodexView`) | Panes 316 → `H − sB − 28`. The grid scrolls by rows. The detail pane scrolls. |
| 5 | **Pause › Menu (+ welcome back)** | **Fits unchanged:** the box spans 70–260, inside a limit of ≤ 272. |
| 6 | **Reward** (`RewardScene`, card/relic/wand modes) | Frame height `H − sB − 16`. `detail` (292 / 272) and `footer` (318) move by −Δ. The offer row must end ≤ detail y − 4. If it doesn't, drop the offer's inline description line; the `detail` line already carries it. |
| 7 | **Shop** (`ShopScene`) | Frame `H − sB − 16`. Buttons y 272, hints 300–326, the lines at 312/318 and the row cut-off `y + rowH > 310` all move by −Δ. Stock columns scroll by row. |
| 8 | **Settings** (`SettingsScene`) | Frame `H − sB − 8`. The description bar (314/318) and hint (344) move to the footer. The option list scrolls; it keeps focus in view. |
| 9 | **Run-end** (`RunEndScene`) | The wands box (58–240) stays. Goals-queued (< 296), detail (314) and buttons (330) move by −Δ. Stats text beyond the body: drop the lowest-priority stat rows first (they remain in the Codex). |
| 10 | **Goals** (`GoalsView`) | List `L.h` 292 → `292 − Δ`, scrolling by row. Back (336) moves to the footer. |
| 11 | **Mode select** (`RunSetup`) | Frame 316 → `316 − Δ`. Detail (250) moves by −Δ/2; Begin and Back (288/294) move to the footer. The mode cards must fit within 40 … detail y − 4. |
| 12 | **Credits** | Already a scroll; set its viewport to H. |
| 13 | **Confirm, Dialog, rebind capture** | **Fit:** they are centred on `H / 2` and 60–86 px tall. Their y must use `H / 2`, not 180. |
| 14 | **Title** | Logo and menu centred on `H / 2`; the menu column must be ≤ `H − 2 × 24`. |
