// run/RunState.js — ALL run data (scene-flow.md §4). Plain JS, no Phaser references: serialisable, and
// the pure spell engine operates on its wand states directly.
//
// WRITERS: RunScene systems and overlays, ONLY through the methods below. Every mutation emits a bus
// event (EV.*) so HUD/overlays never poll. READERS: anyone, via fields/getters (treat as read-only).
//
// Card locations (wand editor, reward, shop) use a single address form:
//   { wand: <index 0..2>, slot: <index> }  |  { wand: 'bag', slot: <index 0..bagCapacity-1> }
// The bag is a FIXED-length array (bagCapacity, nulls = empty cells) so cells are addressable.

import { makeStreams } from '../core/rng.js';
import { EV } from '../core/ev.js';
import { createWandState, applyEditReset, buildOrder, effectiveRechargeMs, manaMaxOf, previewCycle } from '../spells/index.js';
import { castRules } from '../data/catalog.js';
import { rollDraft, rollShop, priceOf, salvageValue, rerollCost } from './economy.js';

export class RunState {
  /**
   * @param {object} o
   * @param {number} o.seed
   * @param {object} o.cat          catalogue (data/catalog.js)
   * @param {string} o.loadoutId
   * @param {number} o.curseLevel   0..3
   * @param {boolean} o.tutorial    first run (save.meta.ftue.tutorialDone === false)
   * @param {(kind:string, id:string)=>boolean} o.isUnlocked   meta unlock check
   * @param {(evt:string, ...a:any[])=>void} o.emit            bus emitter (keeps this module Phaser-free)
   */
  constructor(o) {
    const cat = this.cat = o.cat;
    this.seed = o.seed >>> 0;
    this.rng = makeStreams(this.seed);
    this.emit = o.emit || (() => {});
    this.isUnlocked = o.isUnlocked || (() => true);
    this.loadoutId = o.loadoutId || 'apprentice';
    this.curseLevel = o.curseLevel | 0;
    this.curse = this.curseLevel ? cat.rules.curses.levels.find((l) => l.level === this.curseLevel) : null;
    this.tutorial = !!o.tutorial;
    const P = cat.rules.player;

    // ---- player ----
    this.maxHp = Math.max(1, P.maxHp + (this.curse ? this.curse.playerMaxHpAdd : 0));
    this.hp = this.maxHp;
    this.shield = 0;
    this.coins = P.startCoins || 0;
    this.statuses = { playerSlowMs: 0 };

    // ---- inventory ----
    this.wandSlots = P.wandSlots;
    this.wands = [];                    // [{ id, def, state }]
    this.activeWand = 0;
    this.bag = new Array(P.bagCapacity).fill(null);
    this.relics = [];
    this.relicCounters = {};            // relicId -> number (every-N counters, once flags, trigger counts)

    // ---- route ----
    this.floor = 1;
    this.step = 0;
    this.route = [];                    // [{ floor, step, roomKind, reward, templateId, cleared }]
    this.floorLimits = { heal: 0, wand: 0 };
    this.usedTemplates = new Set();

    // ---- offers (overlays never own run data: screen-graph §3.2) ----
    this.offer = null;                  // { kind:'spell'|'modifier'|'relic'|'bossRelic'|'wand', items:[id], taken:false, roomKey }
    this.shop = null;                   // { stock:[{slot,kind,id,price,sold}], rerolls, freeRerolls, roomKey }

    // ---- stats ----
    this.stats = { kills: 0, casts: 0, damageDealt: 0, roomsCleared: 0, timeFrames: 0, payloadsReleased: 0,
      reactionsSeen: [], bossesKilled: [], elitesKilled: 0, maxFloor: 1, killer: null, coinsEarned: 0 };
    this.ended = false;
    this.outcome = null;

    this._recomputeMods();

    // ---- loadout ----
    const lo = cat.loadouts[this.loadoutId] || cat.loadouts.apprentice;
    for (const w of lo.wands) this._addWandInternal(w.wandId, w.cards);
    for (const id of lo.bag || []) this._bagPut(id);
    for (const id of lo.relics || []) this.addRelic(id, true);
  }

  // =====================================================================================
  // Relic-derived modifiers (recomputed on every relic change; read by sim + spell env)
  // =====================================================================================
  _recomputeMods() {
    const pm = { moveSpeedMult: 1, dashCharges: 0, pickupRadiusMult: 1, manaRegenMult: 1, manaMaxMult: 1, castDelayMult: 1, rechargeMult: 1 };
    const eco = { coinMult: 1, shopPriceMult: 1, freeRerollsPerShop: 0 };
    const shotStats = [], effectParams = [], statusRules = [], onEvent = [];
    for (const rid of this.relics) {
      const r = this.cat.relics[rid];
      for (const e of r.effects) {
        if (e.type === 'player_stat') {
          if (e.stat === 'maxHp') continue;                      // applied once on acquire
          pm[e.stat] = e.op === 'mult' ? (pm[e.stat] ?? 1) * e.value : (pm[e.stat] ?? 0) + e.value;
        } else if (e.type === 'economy') {
          eco[e.field] = e.op === 'mult' ? (eco[e.field] ?? 1) * e.value : (eco[e.field] ?? 0) + e.value;
        } else if (e.type === 'shot_stat') shotStats.push(e);
        else if (e.type === 'effect_param') effectParams.push(e);
        else if (e.type === 'status_rule') statusRules.push(e);
        else if (e.type === 'on_event') onEvent.push({ relicId: rid, ...e });
      }
    }
    this.playerMods = pm; this.economyMods = eco;
    this.relicShotStats = shotStats; this.effectParams = effectParams; this.statusRules = statusRules; this.onEventRelics = onEvent;
    this.statusTable = this._buildStatusTable();
  }

  /** rules.status / rules.reactions with relic status_rule overrides applied (mechanic-spec §7). */
  _buildStatusTable() {
    const st = JSON.parse(JSON.stringify(this.cat.rules.status));
    const re = JSON.parse(JSON.stringify(this.cat.rules.reactions));
    for (const r of this.statusRules || []) {
      const tgt = r.status === 'reactions' ? re : st[r.status === 'freeze' ? 'freeze' : r.status];
      if (!tgt) continue;
      const cur = tgt[r.field] ?? 0;
      tgt[r.field] = r.op === 'mult' ? cur * r.value : r.op === 'set' ? r.value : cur + r.value;
    }
    return { status: st, reactions: re };
  }

  /** The castWand env (spell RNG stream). Preview callers pass rng: run.rng.spell.clone(). */
  spellEnv(rng = this.rng.spell) {
    return { rules: castRules(this.cat), player: this.playerMods, relicShotStats: this.relicShotStats, effectParams: this.effectParams, rng };
  }

  // =====================================================================================
  // Player
  // =====================================================================================
  setHp(v) { this.hp = Math.max(0, Math.min(this.maxHp, v)); this.emit(EV.PLAYER_HP, this.hp, this.maxHp); }
  damage(n) { this.setHp(this.hp - n); return this.hp <= 0; }
  heal(n) { if (n > 0) this.setHp(this.hp + n); }
  addMaxHp(n) {
    const cap = this.cat.rules.player.maxHpCap;
    this.maxHp = Math.max(1, Math.min(cap, this.maxHp + n));
    this.setHp(this.hp + Math.max(0, n));
  }
  setShield(n) { this.shield = Math.max(0, Math.min(this.cat.rules.player.shieldMaxCharges, n)); this.emit(EV.PLAYER_SHIELD, this.shield); }
  addCoins(n) {
    if (n > 0) this.stats.coinsEarned += n;
    this.coins = Math.max(0, this.coins + n);
    this.emit(EV.PLAYER_GOLD, this.coins, n);
  }
  /** feel-spec `dashChargesBase` + relic dashCharges (mechanic-spec §2). */
  dashChargesMax(base) { return base + (this.playerMods.dashCharges | 0); }

  // =====================================================================================
  // Wands
  // =====================================================================================
  _addWandInternal(wandId, cards) {
    const def = this.cat.wands[wandId];
    const slots = (cards || def.presetCards || []).slice(0, def.capacity);
    if (!this.playerMods) this._recomputeMods();
    const state = createWandState(def, slots, this.cat.cards, this.rng.spell, this.spellEnv());
    this.wands.push({ id: wandId, def, state });
    return this.wands.length - 1;
  }
  get wand() { return this.wands[this.activeWand] || null; }
  selectWand(i, swapLockMs = 0) {
    if (i < 0 || i >= this.wands.length || i === this.activeWand) return false;
    this.activeWand = i;
    this.wands[i].state.swapLockMs = Math.max(this.wands[i].state.swapLockMs, swapLockMs);
    this.emit(EV.WAND_ACTIVE, i);
    return true;
  }
  cycleWand(dir, swapLockMs) { return this.wands.length > 1 && this.selectWand((this.activeWand + dir + this.wands.length) % this.wands.length, swapLockMs); }
  effectiveRecharge(i) { const w = this.wands[i]; return effectiveRechargeMs(w.def, w.state, this.cat.cards, this.spellEnv()); }
  manaMax(i) { return manaMaxOf(this.wands[i].def, this.spellEnv()); }

  /** Wand-editor preview (wand-editor-ux §5.1) — never mutates anything. */
  preview(wandIndex, slotsOverride) {
    const w = this.wands[wandIndex];
    return previewCycle(w.def, slotsOverride || w.state.slots, this.cat.cards, this.spellEnv(this.rng.spell.clone()));
  }

  /**
   * Take a wand (S4w). If `replaceIndex` is null and a wand slot is free, append it; else replace that wand:
   * its cards go to the bag, overflow is returned (the caller drops them as pickups).
   * @returns {{ index:number, overflow:string[] }}
   */
  takeWand(wandId, replaceIndex = null, cards = null) {
    let overflow = [];
    let idx;
    if (replaceIndex == null && this.wands.length < this.wandSlots) {
      idx = this._addWandInternal(wandId, cards);
    } else {
      idx = replaceIndex ?? this.activeWand;
      const old = this.wands[idx];
      for (const id of old.state.slots) if (id) { if (!this._bagPut(id)) overflow.push(id); }
      const def = this.cat.wands[wandId];
      const state = createWandState(def, (cards || def.presetCards || []).slice(0, def.capacity), this.cat.cards, this.rng.spell, this.spellEnv());
      this.wands[idx] = { id: wandId, def, state };
    }
    this.emit(EV.WAND_CHANGED, idx);
    this.emit(EV.BAG_CHANGED);
    if (overflow.length) this.emit(EV.CARD_OVERFLOW, overflow);
    return { index: idx, overflow };
  }

  /** Shop wand (S5 → S4w): the purchase completes only when the player takes it. */
  buyWand(i, replaceIndex = null) {
    const it = this.shop && this.shop.stock[i];
    if (!it || it.kind !== 'wand' || it.sold || this.coins < it.price) return null;
    this.addCoins(-it.price);
    it.sold = true;
    this.emit(EV.SHOP_CHANGED);
    return this.takeWand(it.id, replaceIndex);
  }
  /** Discard (D3): the card is destroyed with no coins. */
  discard(loc) { const id = this.getCell(loc); if (!id) return; this.setCell(loc, null); this.emit(EV.CARD_DISCARDED, id); }

  // =====================================================================================
  // Cards: bag + slot addressing (wand editor primitives; UI owns "held card" state)
  // =====================================================================================
  get bagCount() { return this.bag.reduce((n, x) => n + (x ? 1 : 0), 0); }
  get bagFull() { return this.bagCount >= this.bag.length; }
  firstFreeBag() { return this.bag.indexOf(null); }
  _bagPut(id) { const i = this.bag.indexOf(null); if (i < 0) return false; this.bag[i] = id; return true; }
  /** Add a card to the first free bag cell. @returns {number} bag index or -1 if full. */
  addCard(id) {
    const i = this.bag.indexOf(null);
    if (i < 0) return -1;
    this.bag[i] = id;
    this.emit(EV.BAG_CHANGED);
    this.emit(EV.CARD_GAINED, id);
    return i;
  }
  getCell(loc) { return loc.wand === 'bag' ? this.bag[loc.slot] ?? null : this.wands[loc.wand].state.slots[loc.slot] ?? null; }
  /** Raw set (no deck reset — resets happen once, at editor close, via commitEdits). */
  setCell(loc, id) {
    if (loc.wand === 'bag') this.bag[loc.slot] = id ?? null;
    else this.wands[loc.wand].state.slots[loc.slot] = id ?? null;
    this.emit(loc.wand === 'bag' ? EV.BAG_CHANGED : EV.WAND_CHANGED, loc.wand);
  }
  /** Swap two cells (the editor's only placement semantic, wand-editor-ux §3.4). */
  swapCells(a, b) { const x = this.getCell(a), y = this.getCell(b); this.setCell(a, y); this.setCell(b, x); }
  firstEmptySlot(wandIndex) { return this.wands[wandIndex].state.slots.indexOf(null); }

  /** Editor snapshot/revert (wand-editor-ux §1, §3.4 Revert). */
  snapshot() { return { wands: this.wands.map((w) => ({ id: w.id, slots: w.state.slots.slice() })), bag: this.bag.slice(), coins: this.coins }; }
  isWandChanged(i, snap) { const s = snap.wands[i]; return !s || s.id !== this.wands[i].id || s.slots.some((x, k) => x !== this.wands[i].state.slots[k]); }
  anyChanged(snap) { return this.wands.some((_, i) => this.isWandChanged(i, snap)) || snap.bag.some((x, k) => x !== this.bag[k]); }
  revert(snap) {
    snap.wands.forEach((s, i) => { if (this.wands[i] && this.wands[i].id === s.id) this.wands[i].state.slots = s.slots.slice(); });
    this.bag = snap.bag.slice();
    this.emit(EV.WAND_CHANGED, -1); this.emit(EV.BAG_CHANGED);
  }
  /**
   * Editor close: every wand whose slots differ from the snapshot pays editForcesRecharge
   * (mechanic-spec §3.3). Moving out and back, or Revert, is not a change. @returns {number[]} changed wands
   */
  commitEdits(snap) {
    const changed = [];
    this.wands.forEach((w, i) => {
      if (!this.isWandChanged(i, snap)) return;
      applyEditReset(w.def, w.state, this.cat.cards, this.spellEnv(), this.rng.spell);
      changed.push(i);
      this.emit(EV.WAND_CHANGED, i);
      this.emit(EV.WAND_RECHARGE_START, i, w.state.rechargeTimerMs);
    });
    return changed;
  }
  salvageValue(cardId) { return salvageValue(this.cat, cardId, this.floor); }
  /** Salvage the card at `loc` (bag or slot). @returns coins gained */
  salvage(loc) {
    const id = this.getCell(loc);
    if (!id) return 0;
    const v = this.salvageValue(id);
    this.setCell(loc, null);
    this.addCoins(v);
    this.emit(EV.CARD_SALVAGED, id, v);
    return v;
  }

  /** Salvage a card that lives in no cell (an origin-less held reward card). @returns coins gained */
  salvageHeld(cardId) {
    if (!cardId) return 0;
    const v = this.salvageValue(cardId);
    this.addCoins(v);
    this.emit(EV.CARD_SALVAGED, cardId, v);
    return v;
  }
  /** Discard a card that lives in no cell (origin-less held reward card). */
  discardHeld(cardId) { if (cardId) this.emit(EV.CARD_DISCARDED, cardId); }

  // =====================================================================================
  // Relics
  // =====================================================================================
  hasRelic(id) { return this.relics.includes(id); }
  addRelic(id, silent = false) {
    if (this.hasRelic(id) || !this.cat.relics[id]) return false;
    this.relics.push(id);
    this.relicCounters[id] = 0;
    for (const e of this.cat.relics[id].effects) if (e.type === 'player_stat' && e.stat === 'maxHp') this.addMaxHp(e.value);
    const oldMax = this.wands.map((_, i) => this.manaMax(i));
    this._recomputeMods();
    // manaMaxMult: current mana keeps its fraction (mechanic-spec §7)
    this.wands.forEach((w, i) => { const nm = this.manaMax(i); if (oldMax[i] > 0) w.state.mana = (w.state.mana / oldMax[i]) * nm; });
    if (!silent) this.emit(EV.RELIC_GAINED, id);
    return true;
  }

  // =====================================================================================
  // Offers: reward drafts, wand offers, shop (screen-graph S4/S4w/S5; offers live here)
  // =====================================================================================
  /** Create (or keep) the room's reward offer. kind: 'spell'|'modifier'|'relic'|'bossRelic'|'wand' */
  makeOffer(kind, roomKey, fixedItems = null) {
    if (this.offer && this.offer.roomKey === roomKey) return this.offer;
    const drafts = this.cat.economy.drafts;
    let items;
    if (fixedItems) items = fixedItems.slice();
    else if (kind === 'relic' || kind === 'bossRelic') items = rollDraft(this.cat, 'relic', kind === 'bossRelic' ? drafts.bossRelic : drafts.relic, this.floor, this.rng.loot, this.isUnlocked, new Set(this.relics));
    else if (kind === 'wand') items = rollDraft(this.cat, 'wand', 1, this.floor, this.rng.loot, this.isUnlocked);
    else items = rollDraft(this.cat, kind, drafts[kind] || 3, this.floor, this.rng.loot, this.isUnlocked);
    this.offer = { kind, items, taken: false, roomKey };
    this.emit(EV.REWARD_OFFER, this.offer);
    return this.offer;
  }
  /** Take offer item i. Cards return the id (the UI then holds it in the editor); relics apply now. */
  takeOffer(i) {
    const o = this.offer;
    if (!o || o.taken || !o.items[i]) return null;
    const id = o.items[i];
    o.taken = true;
    if (o.kind === 'relic' || o.kind === 'bossRelic') this.addRelic(id);
    this.emit(EV.REWARD_PICKED, id, o.kind);
    return id;
  }
  get priceMult() { return this.economyMods.shopPriceMult; }
  openShop(roomKey) {
    if (this.shop && this.shop.roomKey === roomKey) return this.shop;
    this.shop = { roomKey, rerolls: 0, freeRerolls: this.economyMods.freeRerollsPerShop | 0,
      stock: rollShop(this.cat, this.floor, this.rng.loot, this.isUnlocked, this.relics, this.priceMult) };
    this.emit(EV.SHOP_CHANGED);
    return this.shop;
  }
  get rerollCost() { return this.shop ? rerollCost(this.cat, this.shop.rerolls, this.shop.freeRerolls) : 0; }
  reroll() {
    const s = this.shop; if (!s) return false;
    const cost = this.rerollCost;
    if (this.coins < cost) return false;
    this.addCoins(-cost);
    s.rerolls++;
    const fresh = rollShop(this.cat, this.floor, this.rng.loot, this.isUnlocked, this.relics, this.priceMult);
    s.stock = s.stock.map((it, i) => (it.kind === 'heal' ? it : (it.sold && it.id ? { ...fresh[i] } : fresh[i])));
    this.emit(EV.SHOP_CHANGED);
    return true;
  }
  /**
   * Why an item can't be bought now (UI shows the reason), or null if it can.
   * @returns {null|{reason:'sold'|'coins'|'bagFull'|'hpFull'|'owned', need?:number}}
   */
  cantBuy(i) {
    const it = this.shop && this.shop.stock[i];
    if (!it || it.sold || !it.id) return { reason: 'sold' };
    if (this.coins < it.price) return { reason: 'coins', need: it.price - this.coins };
    if (it.kind === 'card' && this.bagFull) return { reason: 'bagFull' };
    if (it.kind === 'heal' && this.hp >= this.maxHp) return { reason: 'hpFull' };
    if (it.kind === 'relic' && this.hasRelic(it.id)) return { reason: 'owned' };
    return null;
  }
  /** Buy stock item i. Wands are NOT granted here (UI routes to the wand offer S4w, then calls takeWand). */
  buy(i) {
    if (this.cantBuy(i)) return false;
    const it = this.shop.stock[i];
    this.addCoins(-it.price);
    it.sold = true;
    if (it.kind === 'card') this.addCard(it.id);
    else if (it.kind === 'relic') this.addRelic(it.id);
    else if (it.kind === 'heal') this.heal(this.cat.economy.prices.healPotionAmount);
    this.emit(EV.SHOP_CHANGED);
    this.emit(EV.SHOP_BOUGHT, it);
    return true;
  }
  priceOf(kind, id) { return priceOf(this.cat, kind, id, this.floor, this.priceMult); }

  // =====================================================================================
  // Route / stats / end
  // =====================================================================================
  recordReaction(name) {
    if (this.stats.reactionsSeen.includes(name)) return false;
    this.stats.reactionsSeen.push(name);
    return true;
  }
  end(outcome, killer = null) {
    if (this.ended) return;
    this.ended = true; this.outcome = outcome;
    if (killer) this.stats.killer = killer;
    this.emit(EV.RUN_END, outcome);
  }
  summary() {
    return {
      outcome: this.outcome, floor: this.floor, step: this.step, kills: this.stats.kills, timeS: this.stats.timeFrames / 60,
      seed: this.seed, killer: this.stats.killer, loadoutId: this.loadoutId, curseLevel: this.curseLevel,
      wands: this.wands.map((w) => ({ id: w.id, slots: w.state.slots.slice() })), relics: this.relics.slice(),
      bossesKilled: this.stats.bossesKilled.slice(), reactionsSeen: this.stats.reactionsSeen.slice(),
      payloadsReleased: this.stats.payloadsReleased, maxFloor: this.stats.maxFloor, coinsEarned: this.stats.coinsEarned,
    };
  }
}

// Re-exported for UI code that previews without a RunState (codex etc.)
export { buildOrder };
