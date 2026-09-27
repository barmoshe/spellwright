# Spellwright — how to run

## Serve (runtime origin: **http**, never `file://`)

```bash
cd gamestudio/output/games/spellwright
python3 -m http.server 8741
# open http://localhost:8741/          (add ?debug for dev keys + the perf overlay)
```

No build step, no dependencies: plain ES modules and Phaser 4.1.0 vendored at `lib/phaser.esm.min.js`. The Browser-preview launch config is named `spellwright`. Use Chrome, Edge, Firefox or Safari (Safari loads the `.m4a` audio variants).

## Controls

| Action | Keyboard + mouse | Gamepad (twin-stick) |
|---|---|---|
| Move | WASD / arrows | left stick |
| Aim | mouse | right stick (aim assist on the pad only; Settings → Aim assist) |
| Cast (hold) | LMB (Settings → Cast mode: Toggle available) | RT |
| Dash (i-frames) | Space or RMB | A or LB |
| Interact (pedestal, shop, pickup) | E | X |
| Switch wand | 1–3, Q, mouse wheel | RB / Y |
| Wand editor | Tab / I | Back / View |
| Pause | Esc | Start |
| Menus | arrows / WASD, Enter, Esc · Q/E switch tabs | D-pad or left stick, A, B · LB/RB |
| Fullscreen | Title → Fullscreen, Settings, or F11 | — |

Walk through an open door to choose the next room (the door shows room kind + reward).

## What a run is

3 floors × 10 rooms: Sanctum or Landing → door-choice rooms (combat, elite, treasure) → shop → … → boss. The Ossuary Knight (F1), the Mire Queen (F2) and Vorn, the Archlich (F3, the victory). Your first run plays the scripted teaching rooms (Sanctum → First Blood → The Gauntlet). Meta progress (unlocks, codex, loadouts, curses) persists in `localStorage` (`spellwright.save`).

## Debug (`?debug` in the URL)

| Key | Effect |
|---|---|
| F3 | perf overlay (fps, sim ms/step, live projectiles/enemies, input device, overlay stack) |
| F4 | god mode (toggle) |
| F6 | kill every enemy in the room (awards kills/coins) |
| F7 | jump to this floor's **boss room** |
| F8 | descend to the **next floor** (landing) |
| J | jump to the next step of the floor |
| F9 | +200 coins, a random relic, and six test cards (double_cast, trigger_hit, fireball, chain_lightning, ice_shard, damage_up) |
| K | die (run end: death) |
| F10 | victory (run end: victory) |

To reach the final boss: F8, F8, F7. `?nofocuspause` (automation only) disables the focus-loss auto-pause. Console hooks: `__SW__.log.last('cast', 5)`, `__SW__.tunables.unread()` (read-tracking with `?debug`), `__SW__.tunables.fallbacks()`, `__SW__.effects.list()`, `__SW__.art.missing()`, `__SW__.save`, `__SW__.db`.

Enemy arena (`?debug&enemyharness=1`, the real run in the floor's start room) adds Shift-hotkeys:
Shift+1..0,-,= spawn bat, skeleton, cultist, frost_mage, brute, slime, fire_imp, eye_turret, wraith, necromancer, stone_golem, skull · Shift+Q elite of the last id · Shift+C / X / Z chill / shock / freeze the nearest enemy · Shift+V 30 damage to the nearest · Shift+G god mode · Shift+K kill all · Shift+B boss room · Shift+N next floor · Shift+R ×0.9 curse windups · Shift+T toggle reduced motion.

Dev harnesses: `?harness=<screen>` (modal screens with a synthetic run: `editor`, `editor-held`, `reward`, `reward-relic`, `wand-offer`, `shop`, `pause-map`, `codex`, `settings`, `runend`, `unlocks`, `setup`, `title`), `?hudharness=1` (HUD + world HUD), `?enemyharness=1` (enemy AI arena).

## Craft self-verification (I1: review aids, not a test suite)

- `node scripts/check-spells.mjs` runs the pure spell engine against mechanic-spec §11 (every worked example, the twin_fork trap and shuffle determinism) and prints PASS/FAIL per line.

## Documented simplifications and deviations

(Recorded per studio §8 item 3.)

- **Audio D6/D7 low-pass**: the music low-pass part of the overlay and low-HP ducks is dropped. The gain moves are kept, per the cue-spec fallback clause (`mixer.ducks.fallback`).
- **Audio loading**: by `load_group` (boot + title at boot; run at run start; floor3 / boss_a / boss_final on entry). Groups left behind are unloaded. This accepts the Audio Director's objection against loading every cue at boot.
- **Time units**: the sim keeps designer `…Ms` durations in ms and advances them by 1000/60 per fixed step. That is equivalent to the `round(ms·60/1000)` step conversion to within one step.
- **Fixed-step sim at 60 Hz without render interpolation** (architecture §4). On 120/144 Hz panels sprites move on 60 Hz steps.
- **Touch input is deferred** (README).
- **Fonts**: the TA bitmap fonts don't have glyphs for ± ° ≈ or em/en dashes. UI copy uses ASCII instead: `+/-`, ` deg`, `~`, `-`.
- **Wand editor §5.5 Ex2**: the drop order follows wand-editor-ux §3.4, the authoritative placement rule. The changed-slot "badge pop" micro-motion isn't built; changed slots use the static highlight.
- **Status HUD**: chill pips and the vulnerable glyph are drawn from the ui-atlas frames only. There's no extra per-status motion.
- **Editor-scoped keys**: `src/ui/extraKeys.js` is the contract for screen-specific modal intents (quick-move, salvage, wand select, scroll, Reward/Shop → editor). `InputRouter.consumeUI()` carries only the 8 generic menu intents. Neither set is rebindable.
- **Start-room crate barrier**: the sanctum door sits on the boundary between two crate tiles, so the player has to break the crate on either side to walk straight through. That's intended; it's the "break things" beat. There's no corner-nudge on the player body.
- **Automation flag** `?nofocuspause` skips the focus-loss auto-pause. Debug/verification only.
