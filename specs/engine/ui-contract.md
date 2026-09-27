# Spellwright — UI ↔ engine contract (Wave 4 build)

**Owner:** Game Developer · **Audience:** the developers building `src/ui/*` and the UI scenes. Every API named here exists in code, and this file is the single list of what UI code may call. UI code never reaches into sim internals.

## 0. Ownership (who writes which files)

| Area | Files | Owner |
|---|---|---|
| Sim, world, RunScene, Boot, audio, art binding, input, spells, data | `src/scenes/{RunScene,BootScene,SystemScene}.js`, `src/sim/*`, `src/run/*`, `src/spells/*`, `src/core/*`, `src/data/*`, `src/platform/*`, `src/input/*`, `src/effects/*`, `src/main.js`, `index.html` | Game Developer (lead) |
| Modal screens | `src/scenes/{TitleScene,PauseScene,RewardScene,ShopScene,RunEndScene,SettingsScene,CreditsScene}.js`, `src/ui/{WandEditor,CodexView,Dialog,nav,RunSetup,...}.js` | UI developer A |
| HUD + in-world UI + FTUE | `src/scenes/HudScene.js`, `src/ui/{WorldHud,DamageNumbers,Toasts,Ftue,...}.js` | UI developer B |
| Shared primitives | `src/ui/kit.js` (text roles, palette, panels, focus ring, card cells, icons, keycaps), `src/ui/Menu.js` | shared: **extend, don't break signatures**; a new helper goes in your own file |
| i18n strings | `src/i18n/en.js` | shared: add keys under your own prefix (`hud.*`, `ftue.*`, `pause.*`, `editor.*`, `shop.*`, …) |

Don't edit files you don't own. If you need an engine hook that isn't here, write it down in your final report (in the objection format if it blocks you) and mock around it.

## 1. Services (from `this.registry`)

| Key | Type | Use |
|---|---|---|
| `bus` | EventEmitter | Subscribe with `listen(scene, bus, EV.X, fn)` from `core/events.js` (auto-removed on shutdown). |
| `router` | `InputRouter` | Menus: `router.consumeUI()` returns an **ordered** array of `'up'\|'down'\|'left'\|'right'\|'confirm'\|'back'\|'tabPrev'\|'tabNext'`, drained each frame; process it in order. `router.device` is `'kbm'\|'pad'`. `router.clearHeld()`. `router.kbm` holds the current bindings (action → codes). `router.applyBindings(overrides)` applies rebinding. |
| `flow` | `SceneFlow` | `open(key,data)`, `close(key)`, `replace(key,data)` (returnTo, screen-graph §3.2), `top()`, `isOpen(key)`. Only the top modal handles UI input. |
| `mixer` | `AudioMixer` | `mixer.fire(cueId)`. Missing cues are no-ops (counted). UI cue ids: `ui_move ui_confirm ui_back ui_denied ui_tab ui_card_pick ui_card_place ui_salvage ui_buy ui_unlock` (screen-graph §7). `mixer.refreshVolumes()` after volume settings change. |
| `display` | `DisplayScaler` | `apply()` after a scale-mode change; `toggleFullscreen()` (must run inside a user gesture); `isFullscreen`. |
| `time` | `TimeControl` | read-only for UI. |
| `run` | `RunState` or undefined | Present while a run exists (also during pause/reward/shop/run-end). |
| `credits` | object | `assets/credits.json` once the TA delivers it. |

Other singletons (imports): `Save` (`core/save.js`), `cat()` (`data/catalog.js`, the catalogue), `T(key)` (`core/tunables.js`, feel/motion tunables), `Art` (`core/art.js`), `t(key, params)` (`core/i18n.js`), `kit` (`ui/kit.js`).

## 2. RunState API (`src/run/RunState.js`), the only way to change run data

Read-only fields: `hp maxHp shield coins floor step wands[{id,def,state:{slots,order,cursor,mana,castTimerMs,rechargeTimerMs,swapLockMs}}] activeWand bag[] (fixed length, null = empty) relics[] relicCounters{} route[] offer shop stats{kills,casts,...} playerMods economyMods curseLevel loadoutId tutorial`.

| Method | Notes |
|---|---|
| `manaMax(i)`, `effectiveRecharge(i)` | wand numbers after relics |
| `preview(wandIndex, slotsOverride?)` | wand-editor dry-run (§4 below); never mutates |
| `getCell(loc)`, `setCell(loc,id)`, `swapCells(a,b)`, `firstEmptySlot(w)`, `firstFreeBag()`, `bagFull`, `bagCount` | `loc = {wand:0..2, slot}` or `{wand:'bag', slot}` |
| `snapshot()`, `revert(snap)`, `anyChanged(snap)`, `isWandChanged(i,snap)`, `commitEdits(snap)` | Editor: take a snapshot on open; **call `commitEdits(snap)` on close** (applies editForcesRecharge to changed wands only); Revert = `revert(snap)` |
| `salvageValue(id)`, `salvage(loc)`, `discard(loc)`, `addCard(id)` → bag index or −1 | |
| `selectWand(i, swapLockMs)` | UI doesn't need it (the sim does it) |
| `offer` `{kind:'spell'\|'modifier'\|'relic'\|'bossRelic'\|'wand', items:[id], taken, roomKey}`; `takeOffer(i)` → id | Relics apply inside `takeOffer`. Cards: the UI then opens the editor with the card **held** (`flow.replace('pause',{tab:'wands', heldCard:id})`). Wands: `takeWand(wandId, replaceIndex|null)` → `{index, overflow}` |
| `shop` `{stock:[{slot,kind:'card'\|'relic'\|'wand'\|'heal',id,price,sold}], rerolls, freeRerolls}`; `cantBuy(i)` → `null\|{reason:'sold'\|'coins'\|'bagFull'\|'hpFull'\|'owned', need}`; `buy(i)`; `buyWand(i, replaceIndex)`; `reroll()`; `rerollCost` | A shop wand goes through the wand offer (S4w) and completes via `buyWand` |
| `summary()` | run-end data |

**Events** (payload shapes in `src/core/ev.js`; this is the complete list): `player:hp shield gold mana dash hurt dashed moved slow lowhp`, `wand:changed active cast sputter recharge-start recharge`, `bag:changed card:gained salvaged overflow discarded`, `relic:gained triggered`, `reward:offer picked`, `shop:changed bought`, `room:enter cleared`, `floor:enter`, `wave:spawn`, `doors:open`, `enemy:killed windup`, `boss:start hp phase dead`, `combat:reaction status-first dmg`, `ui:interact toast`, `input:device`, `settings:changed`, `ftue:event`, `run:start end`.

`wand:cast` payload: `{wand, firedSlots:[slotIndex], skippedSlots:[slotIndex], drawnSlots:[slotIndex|'always'], cursor, nextSlot, empty, recharge:boolean}`. That is enough for H10/H11 without polling.

## 3. RunScene probe (`this.scene.get('run').hudProbe()`), per-frame read for spatial UI only

```js
{ player: { x, y /*feet*/, coreX, coreY, aimX, aimY, speed, moving, alive,
            dashCharges, dashMax, dashRefillFrac, slowed },
  wand:   { index, recharging, rechargeFrac /*0..1 remaining*/, castReady, holdMs /*current cast hold duration*/ },
  camera: { scrollX, scrollY },
  room:   { kind, templateId, cleared, inCombat, enemiesAlive, controllable /*false during fades, boss intro, death, victory*/ },
  near:   { crateDist, enemyDist, interact: {kind, verb, x, y} | null,
            doors: [{x, y, roomKind, reward, label, choice}], pedestals: [{x, y, kind, count, taken}], shopDist, hasDangerEnemy,
            elites: [{x, y /*sprite top*/, hpFrac, damaged}], offscreen: [{x, y}] /*only when ≤ 2 enemies alive*/ },
  hudOcclusion /* bitmask 1 tl · 2 tc · 4 tr · 8 bl: player, enemy or enemy bullet under that HUD cluster */ }
```
`combat:dmg` also carries `id` (the enemy uid) for aggregation. (Added for UI B's objection, accepted.)

`WorldHud` (UI B) is constructed by RunScene as `new WorldHud(runScene)` and called as `worldHud.update(dtMs)` every **render frame** while the run updates (so it freezes with hit-stop). It draws in **world coordinates** at depth ≥ 90: the reticle, spatial twins (hud-layout §3.3), damage numbers (listen to `combat:dmg`), the interact prompt, door icons and labels, pedestal previews, and FTUE verb prompts. `destroy()` is called on shutdown.

FTUE runner signals besides the events above: `ftue:event` with names `cast-release {holdMs}`, `danger-spawn` (a charge or damage ≥ 2 attacker entered its portal), `danger-windup`, `editor-opened`, `card-slotted`, `wand-swapped`, `door-near {choice}`, `door-entered`, `shop-near`, `shop-opened`, `wandoffer-opened`, `room-fade-end`.

## 4. Preview output (`run.preview(i, slots)`), wand-editor-ux §5.1

```js
{ casts: [{ index, drawn:[{cardId, slotIndex|'always', skippedNoMana, wrapped}], wasted:[cardId],
            inertTriggers:[{cardId, reason:'carrier'|'payload'|'depth'}], skipped:[cardId], truncatedShots,
            shots:[ShotSpec], delayAfterMs, recharge:boolean, manaSpent, wrapped, firedSlots }],
  cycleMs, manaPerCycle, maxManaSingleCast, dpsSingleTarget, sustainable, secondsOfFire, regenPerS, manaMax,
  effectiveRechargeMs, shuffle, warnings:[{id:'W1'..'W7', severity:'error'|'warn', cardId?, cast?, data?}] }
```
`ShotSpec = { cardId, behavior:{type,...}, stats:{damage,speed,lifetimeMs,radius,spreadDeg,pierce,bounce,homing,knockback,statusChance,critChance}, element, isCrit, critTotal, onHit[], onExpire[], onTick, angleOffset, payload:ShotSpec[]|null, trigger:'hit'|'expire'|'timer'|null, triggerTimerMs, modIds[] }`.
The numbers were verified against mechanic-spec §11 by `node scripts/check-spells.mjs` (all examples pass).

## 5. Scene data contracts

| Scene | `scene.run(key, data)` data |
|---|---|
| `pause` | `{tab:'wands'\|'relics'\|'map'\|'codex'\|'menu', heldCard?:cardId, returnTo?:{key:'reward'\|'shop', data}}` |
| `reward` | `{}`; reads `run.offer`. For a shop wand: `{mode:'wand', wandId, shopIndex}`. For a treasure wand: `run.offer.kind === 'wand'` |
| `shop` | `{focusIndex?}`; reads `run.shop` (the sim calls `run.openShop()` before opening) |
| `run-end` | `{summary, milestones:[unlocks.json record], nextGoals:[record]}` |
| `run` | `{loadoutId, curseLevel}` (from Title / Run Setup) |
| `settings` | `{from:'title'\|'pause', group?:'controls'}` |

Close rules: Reward and Shop close with `flow.close(key)`. Pause closes with `flow.close('pause')`, or with `flow.replace(returnTo.key, returnTo.data)` when `returnTo` is set. The sim listens for overlay closes. It never needs a callback.

## 6. Feel and motion tunables UI code must read (unread-tunable check = 0 at Wave 5)
- UI B: `damageNumberRiseMs`, `damageNumberRisePx`, `critNumberScale`, `hurtFlashMs`, `sputterFlashMs` (HUD mana frame flash), `interactRadius` (prompt show), and the HUD motion in motion-spec §4.
- UI A: motion-spec §1–§3 and §5 values are prose (no tunables block). Implement them as written.
