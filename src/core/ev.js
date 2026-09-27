// core/ev.js — event-name constants + payload contract (Phaser-free, so pure modules and node can import it).
// The bus itself lives in core/events.js.

export const EV = Object.freeze({
  // run lifecycle
  RUN_START: 'run:start',                 // (run)
  RUN_END: 'run:end',                     // (outcome)
  FLOOR_ENTER: 'floor:enter',             // ({floor, name})
  ROOM_ENTER: 'room:enter',               // ({floor, step, kind, templateId, reward, name})
  ROOM_CLEARED: 'room:cleared',           // ({floor, step, kind})
  WAVE_SPAWN: 'wave:spawn',               // ({index, count})
  DOORS_OPEN: 'doors:open',               // ([{roomKind, reward, x, y}])
  // player
  PLAYER_HP: 'player:hp',                 // (hp, maxHp)
  PLAYER_SHIELD: 'player:shield',         // (charges)
  PLAYER_GOLD: 'player:gold',             // (coins, delta)
  PLAYER_MANA: 'player:mana',             // (wandIndex, mana, manaMax) — coalesced ≤ 1/step
  PLAYER_DASH: 'player:dash',             // (charges, max, refillFrac 0..1) — on change
  PLAYER_HURT: 'player:hurt',             // ({damage, source, shieldBroke})
  PLAYER_DASHED: 'player:dashed',         // ()
  PLAYER_MOVED: 'player:moved',           // () first movement of a room (FTUE)
  PLAYER_SLOW: 'player:slow',             // (active:boolean)
  LOW_HP: 'player:lowhp',                 // (active:boolean) HP ≤ 2
  // wands / cards
  WAND_CHANGED: 'wand:changed',           // (wandIndex | -1)
  WAND_ACTIVE: 'wand:active',             // (wandIndex)
  WAND_CAST: 'wand:cast',                 // ({wand, plan, firedSlots, cursor, empty})
  WAND_SPUTTER: 'wand:sputter',           // ({wand, reason:'mana'|'empty'})
  WAND_RECHARGE_START: 'wand:recharge-start', // (wandIndex, ms)
  WAND_RECHARGE: 'wand:recharge',         // (wandIndex) — recharge finished
  BAG_CHANGED: 'bag:changed',             // ()
  CARD_GAINED: 'card:gained',             // (cardId)
  CARD_SALVAGED: 'card:salvaged',         // (cardId, coins)
  CARD_OVERFLOW: 'card:overflow',         // ([cardId]) — didn't fit the bag; the sim drops them as world pickups
  CARD_DISCARDED: 'card:discarded',       // (cardId)
  RELIC_GAINED: 'relic:gained',           // (relicId)
  RELIC_TRIGGERED: 'relic:triggered',     // (relicId)
  // offers
  REWARD_OFFER: 'reward:offer',           // (offer)
  REWARD_PICKED: 'reward:picked',         // (id, kind)
  SHOP_CHANGED: 'shop:changed',           // ()
  SHOP_BOUGHT: 'shop:bought',             // (item)
  // combat
  ENEMY_KILLED: 'enemy:killed',           // ({id, elite, x, y, statuses})
  ENEMY_WINDUP: 'enemy:windup',           // ({id, attack, type, x, y}) — FTUE dash prompt, audio
  BOSS_START: 'boss:start',               // ({id, name, title, hp, maxHp, thresholds:[frac]})
  BOSS_HP: 'boss:hp',                     // (hp, maxHp)
  BOSS_PHASE: 'boss:phase',               // (phaseIndex)
  BOSS_DEAD: 'boss:dead',                 // ({id})
  REACTION: 'combat:reaction',            // ({name, first:boolean, x, y})
  STATUS_FIRST: 'combat:status-first',    // ({status})
  DAMAGE_NUMBER: 'combat:dmg',            // ({x, y, amount, crit, element, target:'enemy'|'player'})
  // world UI
  INTERACT_PROMPT: 'ui:interact',         // ({text, x, y} | null)   world coordinates; null hides
  TOAST: 'ui:toast',                      // ({text, icon?, kind?:'relic'|'reaction'|'info'|'unlock'})
  INPUT_DEVICE: 'input:device',           // (device 'kbm'|'pad', promptFamily 'kbm'|'xbox'|'ps') — on prompt-family change
  DISPLAY_CHANGED: 'display:changed',     // ({safe:{l,t,r,b}, zoom, isPhone, portrait}) — resize/rotation/safe-inset change (mobile-touch-spec §1)
  WELCOME_BACK: 'ui:welcome-back',        // () — the page/landscape returned while a run was held (mobile-touch-spec §7.3)
  TOUCH_PROFILE: 'input:touch-profile',   // (on:boolean) — the touch HUD profile switched (mobile-touch-spec §5.1)
  TOUCH_TAP: 'input:touch-tap',           // (button) — a thumb/HUD button press (haptic tick + touch_ui_tap)
  // ---- v2 Wave D contract (crafting pressure). Producers/consumers noted per event. ----
  DEFENCE: 'combat:defence',              // ({uid, id, defence:'shield'|'armour'|'ward', result:'blocked'|'reduced'|'absorbed'|'wear'|'break', keyword, x, y, boss:bool}) — sim/Combat → FX, audio, first-block tip, haptics, stats
  BOSS_ADAPT: 'boss:adapt',               // ({id, tier, rule, bannerKey, params}) — bosses.js → HUD intro card / phase banner line
  BOSS_INTRO: 'boss:intro',               // ({id, tier, name, subtitle, adaptKey|null}) — bosses.js → HUD intro card (mini-boss) / banner (boss)
  AFFIX_SHOWN: 'enemy:affix',             // ({uid, affixes:[id], x, y, first:'spawn'|'hit'}) — EnemySystem → WorldHud nameplate title
  TWIST: 'room:twist',                    // ({kind:'ambush'|'dark'}) — RoomDirector → HUD banner
  FORGE: 'forge:done',                    // ({kind:'merge'|'evolve'|'slot', cardId?, result?}) — ShopScene forge → audio, goals
  DUO_OFFERED: 'relic:duo-offered',       // ({id}) — economy → audio duo_unlock
  REWARD_SKIPPED: 'reward:skipped',       // ({kind, coins, roomKey}) — RunState.skipOffer → director may remove the (now inert) pedestal
  FX_EXPLOSION: 'fx:explosion',           // ({x, y, r, hostile}) — every explosion ring (rumble, controller-prompts §6)
  SETTINGS_CHANGED: 'settings:changed',   // (key, value)
  FTUE: 'ftue:event',                     // (name, data) — generic FTUE signal
});
