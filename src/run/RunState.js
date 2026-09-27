// run/RunState.js — ALL run data (scene-flow.md §4). Plain JS, no Phaser references: serialisable, and
// the pure spell engine operates on its wand states directly.
//
// WRITERS: RunScene systems and overlays, ONLY through the methods below. Every mutation emits a bus
// event (EV.*) so HUD/overlays never poll. READERS: anyone, via fields/getters (treat as read-only).
//
// Card locations (wand editor, reward, shop) use a single address form:
//   { wand: <index 0..2>, slot: <index> }  |  { wand: 'bag', slot: <index 0..bagCapacity-1> }
// The bag is a FIXED-length array (bagCapacity, nulls = empty cells) so cells are addressable.

import { makeStreams, RNG } from '../core/rng.js';
import { EV } from '../core/ev.js';
import { DEBUG } from '../config.js';
import { createWandState, applyEditReset, buildOrder, effectiveRechargeMs, manaMaxOf, previewCycle } from '../spells/index.js';
import { ownedKeywords } from '../spells/keywords.js';
import { castRules, duosFor } from '../data/catalog.js';
import { rollDraft, rollShop, priceOf, salvageValue, rerollCost, newPity, ownedTagSet, rollCorrupted, draftRerollCost, skipPay,
  forgeCost, slotCost } from './economy.js';
import { placementFor } from '../ui/placement.js';
import { takeArmedRun, heatRecord, fnv1a32 } from './meta.js';

// Relic v2 condition evaluators (mechanic-spec §7.1). `live` = { standingMs, enemiesAlive } (Caster, once per step).
const COND = {
  hp_at_most: (r, c) => r.hp <= c.value,
  hp_full: (r) => r.hp >= r.maxHp,
  standing_ms_at_least: (r, c) => r.live.standingMs >= c.value,
  enemies_alive_at_least: (r, c) => r.live.enemiesAlive >= c.value,
  first_cast_after_recharge: () => false,          // per wand, at shot spawn: handled in spellEnv(rng, wandIndex)
};
// Scaling counters (mechanic-spec §7.1 `scaling.per`): raw monotonic run counts; resetOn subtracts a per-relic base.
const PER = {
  kills: (r) => r.stats.kills,
  clean_rooms: (r) => r.stats.cleanRooms,
  coins_held: (r) => r.coins,
  rooms_cleared: (r) => r.stats.roomsCleared,
};

export class RunState {
  /**
   * @param {object} o
   * @param {number} o.seed
   * @param {object} o.cat          catalogue (data/catalog.js)
   * @param {string} o.loadoutId
   * @param {number} [o.curseLevel] DEPRECATED (v1 curses; ignored — Heat replaces it, design-v2 §11)
   * @param {object} [o.mode]       { mode:'standard'|'gentle'|'daily', heat, daily:{date,seed,loadoutId,ruleId}, gentle:{bonusHalfHearts,absorbChance},
   *                                  startCapacity } — defaults to the config armed by Mode Select (run/meta.js armRun)
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
    this.tutorial = !!o.tutorial;
    const P = cat.rules.player;

    // ---- mode (design-v2 §11; Wave E). Read by the sim through the fields below only. ----
    const md = o.mode || takeArmedRun() || {};
    this.mode = ['gentle', 'daily'].includes(md.mode) && !this.tutorial ? md.mode : 'standard';
    this.heatLevel = this.mode === 'standard' ? Math.max(0, Math.min(cat.rules.heat.maxLevel || 5, md.heat | 0)) : 0;
    this.heat = heatRecord(cat, this.heatLevel);            // rules.heat.levels[n] or null (RoomDirector reads run.heat)
    // The sim's existing difficulty seam is ctx.curse ({enemyHpMult, windupMult, playerMaxHpAdd, eliteExtraBudget}):
    // Heat feeds it so enemy HP, windups and max HP need no sim change. rules.curses itself is no longer read.
    this.curseLevel = 0;
    this.curse = this.heat ? { enemyHpMult: this.heat.enemyHpMult, windupMult: this.heat.windupMult, playerMaxHpAdd: this.heat.playerMaxHpAdd, eliteExtraBudget: 0 } : null;
    this.daily = this.mode === 'daily' && md.daily ? { ...md.daily } : null;
    if (this.daily) {
      this.dailyRule = (cat.modes.daily.rulePool || []).find((r) => r.id === this.daily.ruleId) || null;
      const dl = this.daily.loadoutId;                        // modes.json daily.loadoutRespectsUnlocks (false: everyone plays the same run)
      if (cat.loadouts[dl] && (!cat.modes.daily.loadoutRespectsUnlocks || this.isUnlocked('loadouts', dl))) this.loadoutId = dl;
    }
    this.gentle = this.mode === 'gentle' ? { bonusHalfHearts: md.gentle ? md.gentle.bonusHalfHearts | 0 : 0, absorbChance: md.gentle ? +md.gentle.absorbChance || 0 : 0 } : null;
    this.gentleRng = new RNG((this.seed ^ fnv1a32('gentle')) >>> 0 || 1);   // own stream: shrugs never shift loot/ai
    // run rules the SIM reads (Daily): { elite_rooms_extra_elite, enemy_speed_mult, … } — one named data point
    this.runRules = {};
    this.modeEffects = [];                                  // player_stat / shot_stat / economy entries, as relic effects
    if (this.dailyRule) for (const e of this.dailyRule.effects) {
      if (e.type === 'run_rule') this.runRules[e.rule] = e.value;
      else this.modeEffects.push({ relicId: `daily:${this.dailyRule.id}`, ...e });
    }
    this.startCapacityAdd = (md.startCapacity | 0) + ((this.runRules.wand_capacity_add | 0));

    // ---- player ----
    const maxHpAdd = (this.curse ? this.curse.playerMaxHpAdd : 0) + (this.gentle ? this.gentle.bonusHalfHearts : 0)
      + this.modeEffects.reduce((a, e) => a + (e.type === 'player_stat' && e.stat === 'maxHp' ? e.value : 0), 0);
    this.maxHp = Math.max(1, Math.min(P.maxHpCap, P.maxHp + maxHpAdd));
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
    this.relicRules = {};               // rule id -> merged params (mechanic-spec §7.1 `rule` type; one application point)
    this.scaleBase = {};                // relicId -> raw count at the last resetOn event (scaling relics)
    this.live = { standingMs: 0, enemiesAlive: 0, hurtThisRoom: false };   // per-step condition inputs (Caster.tickLive)
    this.freeCast = [];                 // wand index -> next cast pays 0 (free_cast_after_full_recharge)
    this.slotBonus = new Array(P.wandSlots).fill(0);   // forge +1 slot, per wand POSITION (takeWand keeps it)
    this.forgeSlotsBought = 0;
    this.cards = cat.cards;             // the card table the engine casts with (a derived copy under modifier_mana_zero)

    // ---- economy v2 (design-v2 §9) ----
    this.pity = newPity(cat);           // rarity pity (economy.pity)
    this.banned = new Set();            // shop ban: removed from the run's pools
    this.upcomingKeyword = null;        // set by the director (B): the keyword the next door / mini-boss / puzzle asks for
    // meta features gate v2 systems (unlocks.json); ?debug opens them all for testing
    const feat = (id) => DEBUG || this.isUnlocked('features', id);
    this.features = { forge: feat('forge'), duos: feat('duos'), corrupted: feat('corrupted') };

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
      reactionsSeen: [], bossesKilled: [], elitesKilled: 0, maxFloor: 1, killer: null, coinsEarned: 0,
      cleanRooms: 0, defencesBroken: 0, forged: 0, skips: 0, draftRerolls: 0 };
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
    const pm = { moveSpeedMult: 1, dashCharges: 0, pickupRadiusMult: 1, manaRegenMult: 1, manaMaxMult: 1, castDelayMult: 1, rechargeMult: 1, manaMaxAdd: 0 };
    const eco = { coinMult: 1, shopPriceMult: 1, freeRerollsPerShop: 0 };
    const shotStats = [], effectParams = [], statusRules = [], onEvent = [], dynPlayer = [], rules = {};
    // Heat shop multiplier + Daily rule entries join the relic loop (the single application point)
    if (this.heat && this.heat.shopPriceMult && this.heat.shopPriceMult !== 1) eco.shopPriceMult *= this.heat.shopPriceMult;
    const sources = this.relics.map((rid) => [rid, this.cat.relics[rid].effects]);
    if (this.modeEffects && this.modeEffects.length) sources.push([this.modeEffects[0].relicId, this.modeEffects]);
    for (const [rid, effects] of sources) {
      for (const e0 of effects) {
        const e = { relicId: rid, ...e0 };
        if (e.type === 'player_stat') {
          if (e.stat === 'maxHp') continue;                      // applied once on acquire
          if (e.condition || e.scaling) { dynPlayer.push(e); continue; }
          pm[e.stat] = e.op === 'mult' ? (pm[e.stat] ?? 1) * e.value : (pm[e.stat] ?? 0) + e.value;
        } else if (e.type === 'economy') {
          eco[e.field] = e.op === 'mult' ? (eco[e.field] ?? 1) * e.value : (eco[e.field] ?? 0) + e.value;
        } else if (e.type === 'shot_stat') shotStats.push(e);
        else if (e.type === 'effect_param') effectParams.push(e);
        else if (e.type === 'status_rule') statusRules.push(e);
        else if (e.type === 'on_event') onEvent.push(e);
        else if (e.type === 'rule') {
          // several rule relics of different kinds compose; wrap_no_recharge takes the max perCycle (mechanic-spec §7.1 stacking)
          const cur = rules[e.rule];
          rules[e.rule] = e.rule === 'wrap_no_recharge' && cur ? { ...e, perCycle: Math.max(cur.perCycle | 0, e.perCycle | 0) } : { ...e };
        }
      }
    }
    this.economyMods = eco; this.statusRules = statusRules; this.onEventRelics = onEvent; this.relicRules = rules;
    this._pmBase = pm; this._dynPlayer = dynPlayer;
    this._shotStatsAll = shotStats.filter((e) => !(e.condition && e.condition.type === 'first_cast_after_recharge'));
    this._firstCastAll = shotStats.filter((e) => e.condition && e.condition.type === 'first_cast_after_recharge');
    this._effectParamsAll = effectParams;
    this.statusTable = this._buildStatusTable();
    this.cards = this._buildCardTable();
    this._liveKey = null;
    this.refreshLive();
  }

  /** modifier_mana_zero (Hollow Runes): modifier-table cards cost 0 mana and add castDelayAddMs each (engine untouched). */
  _buildCardTable() {
    const r = this.relicRules.modifier_mana_zero;
    if (!r) return this.cat.cards;
    const out = { ...this.cat.cards };
    for (const id of Object.keys(this.cat.modifiers)) {
      const c = this.cat.modifiers[id];
      out[id] = Object.freeze({ ...c, mana: 0, castDelayAddMs: (c.castDelayAddMs || 0) + (r.castDelayAddMs || 0) });
    }
    return Object.freeze(out);
  }

  /** Scaling bonus for one entry: min(cap, floor(count / every) × add) (mechanic-spec §7.1). */
  _scaleBonus(e) {
    const sc = e.scaling, per = PER[sc.per];
    if (!per) return 0;
    const count = Math.max(0, per(this) - (this.scaleBase[e.relicId] || 0));
    return Math.min(sc.cap, Math.floor(count / Math.max(1, sc.every)) * sc.add);
  }
  /** The entry's effective value (scaling: mult → 1 + bonus, add → value + bonus). */
  _valueOf(e) {
    if (!e.scaling) return e.value;
    const b = this._scaleBonus(e);
    return e.op === 'mult' ? 1 + b : e.value + b;
  }
  _condOk(e) { if (!e.condition) return true; const f = COND[e.condition.type]; return f ? f(this, e.condition) : false; }

  /**
   * Re-evaluate conditional / scaling relic entries (the live half of the single application point). Called by
   * _recomputeMods and once per sim step by the Caster; rebuilds only when an input changed (no per-step garbage
   * in the common case). Writes playerMods, relicShotStats, effectParams and the per-wand def overlays.
   */
  refreshLive() {
    const dyn = this._dynPlayer || [];
    let key = '';
    const touch = (e) => { key += (this._condOk(e) ? '1' : '0') + (e.scaling ? ':' + this._scaleBonus(e) : '') + ','; };
    for (const e of dyn) touch(e);
    for (const e of this._shotStatsAll) if (e.condition || e.scaling) touch(e);
    for (const e of this._effectParamsAll) if (e.condition || e.scaling) touch(e);
    key += `|${this.slotBonus.join('.')}`;
    if (key === this._liveKey) return false;
    this._liveKey = key;
    const pm = { ...this._pmBase };
    for (const e of dyn) {
      if (!this._condOk(e)) continue;
      const v = this._valueOf(e);
      pm[e.stat] = e.op === 'mult' ? (pm[e.stat] ?? 1) * v : (pm[e.stat] ?? 0) + v;
    }
    this.playerMods = pm;
    this.relicShotStats = this._shotStatsAll.filter((e) => this._condOk(e)).map((e) => (e.scaling ? { ...e, value: this._valueOf(e) } : e));
    this._firstCastStats = this._firstCastAll.map((e) => (e.scaling ? { ...e, value: this._valueOf(e) } : e));
    this.effectParams = this._effectParamsAll.filter((e) => this._condOk(e)).map((e) => (e.scaling ? { ...e, value: this._valueOf(e) } : e));
    for (let i = 0; i < (this.wands || []).length; i++) this._applyWandOverlay(i);
    return true;
  }

  /**
   * Per-step condition inputs (Caster): standing = no move input; enemiesAlive from the enemy system.
   * @returns {boolean} true if the live mods changed
   */
  tickLive(dtMs, moving, enemiesAlive) {
    this.live.standingMs = moving ? 0 : Math.min(this.live.standingMs + dtMs, 1e7);
    this.live.enemiesAlive = enemiesAlive | 0;
    return this.refreshLive();
  }

  /**
   * The wand's EFFECTIVE def: catalogue def + forge slots (capacity, cap forge.slot.maxCapacity) + relic manaMaxAdd
   * (deepening_well) + spells_per_cast_add (hungry_rune). `w.def` is replaced only when a value changes, so every
   * reader (engine, editor, HUD) sees the same numbers. Growing capacity pads the slots with empty cells.
   */
  _applyWandOverlay(i) {
    const w = this.wands[i]; if (!w) return;
    const base = w.baseDef || this.cat.wands[w.id];
    w.baseDef = base;
    const fs = this.cat.forgeSlot;
    // mode capacity (goal +1 starting slot, Daily "Wide") sits on top of the forge cap; forge slots stack on it
    const sa = this.startCapacityAdd | 0;
    const capMax = Math.max(base.capacity, fs ? fs.maxCapacity : base.capacity) + sa;
    const capacity = Math.min(capMax, base.capacity + sa + (this.slotBonus[i] | 0));
    const manaMax = base.manaMax + ((this.playerMods && this.playerMods.manaMaxAdd) || 0);
    const spc = (base.spellsPerCast || 1) + ((this.relicRules.spells_per_cast_add && this.relicRules.spells_per_cast_add.value) | 0);
    const shuffle = !!base.shuffle || !!(this.runRules && this.runRules.all_wands_shuffle);     // Daily "Chaos"
    if (w.def && w.def.capacity === capacity && w.def.manaMax === manaMax && w.def.spellsPerCast === spc && !!w.def.shuffle === shuffle && w.def.id === base.id) return;
    w.def = (capacity === base.capacity && manaMax === base.manaMax && spc === (base.spellsPerCast || 1) && shuffle === !!base.shuffle) ? base
      : Object.freeze({ ...base, capacity, manaMax, spellsPerCast: spc, shuffle });
    if (w.state) while (w.state.slots.length < capacity) w.state.slots.push(null);
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
    // duo rules that retune a reaction (read by Combat via statusTable; splash / chain / spread run in sim/Relics.js)
    const R = this.relicRules || {};
    if (R.melt_boost && re.melt) { re.melt.damageMult = R.melt_boost.damageMult; re.melt.chillSplashRadius = R.melt_boost.chillSplashRadius; }
    if (R.overload_chain && re.overload) re.overload.chain = { jumps: R.overload_chain.jumps, range: R.overload_chain.range };
    if (R.blight_spread && re.blight) re.blight.spread = { radius: R.blight_spread.radius, stackFrac: R.blight_spread.stackFrac };
    return { status: st, reactions: re };
  }

  /**
   * The castWand env (spell RNG stream). Preview callers pass rng: run.rng.spell.clone(). With `wandIndex`, shot
   * stats conditioned on `first_cast_after_recharge` join when that wand is at the start of its cycle (cursor 0).
   */
  spellEnv(rng = this.rng.spell, wandIndex = null) {
    if (!this._castRules) this._castRules = castRules(this.cat);
    let shotStats = this.relicShotStats;
    if (wandIndex != null && this._firstCastStats && this._firstCastStats.length) {
      const w = this.wands[wandIndex];
      if (w && w.state.cursor === 0) shotStats = shotStats.concat(this._firstCastStats);
    }
    return { rules: this._castRules, player: this.playerMods, relicShotStats: shotStats, effectParams: this.effectParams, rng, relicRules: this.relicRules };
  }

  // =====================================================================================
  // Player
  // =====================================================================================
  setHp(v) { this.hp = Math.max(0, Math.min(this.maxHp, v)); this.emit(EV.PLAYER_HP, this.hp, this.maxHp); }
  /** HP loss (a shield block never reaches here). Scaling relics with resetOn:"hurt" restart; the room is no longer clean. */
  damage(n) {
    if (n > 0) this._onHurt();
    this.setHp(this.hp - n);
    return this.hp <= 0;
  }
  _onHurt() {
    this.live.hurtThisRoom = true;
    for (const rid of this.relics) for (const e of this.cat.relics[rid].effects) {
      if (e.scaling && e.scaling.resetOn === 'hurt' && PER[e.scaling.per]) this.scaleBase[rid] = PER[e.scaling.per](this);
    }
  }
  /** Relic hooks from sim/Relics.js on room_enter / room_clear (clean-room counting for scaling relics). */
  onRoomEnter() { this.live.hurtThisRoom = false; }
  onRoomClear() { if (!this.live.hurtThisRoom) this.stats.cleanRooms++; }
  /** cast_toll (Blood Ink): HP loss that is NOT a hurt (no i-frames, no resetOn); neverLethal keeps 1 HP. @returns lost */
  toll(damage, neverLethal) {
    const floor = neverLethal ? 1 : 0;
    const to = Math.max(floor, this.hp - damage);
    const lost = this.hp - to;
    if (lost > 0) this.setHp(to);
    return lost;
  }
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
    const base = this.cat.wands[wandId];
    if (!this.playerMods) this._recomputeMods();
    const i = this.wands.length;
    this.wands.push({ id: wandId, baseDef: base, def: base, state: null });
    this._applyWandOverlay(i);
    const def = this.wands[i].def;
    const slots = (cards || def.presetCards || []).slice(0, def.capacity);
    this.wands[i].state = createWandState(def, slots, this.cards, this.rng.spell, this.spellEnv());
    return i;
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
  effectiveRecharge(i) { const w = this.wands[i]; return effectiveRechargeMs(w.def, w.state, this.cards, this.spellEnv()); }
  manaMax(i) { return manaMaxOf(this.wands[i].def, this.spellEnv()); }

  /** Wand-editor preview (wand-editor-ux §5.1) — never mutates anything. */
  preview(wandIndex, slotsOverride) {
    const w = this.wands[wandIndex];
    return previewCycle(w.def, slotsOverride || w.state.slots, this.cards, this.spellEnv(this.rng.spell.clone()));
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
      // the forge slot bonus belongs to the wand POSITION: the new wand keeps it (capacity cap still applies)
      const base = this.cat.wands[wandId];
      this.wands[idx] = { id: wandId, baseDef: base, def: base, state: null };
      this._applyWandOverlay(idx);
      const def = this.wands[idx].def;
      this.wands[idx].state = createWandState(def, (cards || def.presetCards || []).slice(0, def.capacity), this.cards, this.rng.spell, this.spellEnv());
      this.freeCast[idx] = false;
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
    if (loc.wand === 'bag') { if (loc.slot < 0 || loc.slot >= this.bag.length) return; this.bag[loc.slot] = id ?? null; }
    else {
      const w = this.wands[loc.wand];
      if (!w || loc.slot < 0 || loc.slot >= w.def.capacity) return;             // respects forge slot overrides
      while (w.state.slots.length < w.def.capacity) w.state.slots.push(null);
      w.state.slots[loc.slot] = id ?? null;
    }
    this.emit(loc.wand === 'bag' ? EV.BAG_CHANGED : EV.WAND_CHANGED, loc.wand);
  }
  /** Swap two cells (raw primitive; the editor places through placeCard, wand-editor-ux §10.3). */
  swapCells(a, b) { const x = this.getCell(a), y = this.getCell(b); this.setCell(a, y); this.setCell(b, x); }
  /** The target row for placementFor (a live view, not a copy — placementFor never mutates it). */
  placementRow(wand) { return { index: wand, slots: wand === 'bag' ? this.bag : this.wands[wand].state.slots }; }
  /**
   * Place a card per wand-editor-ux §10.3 (insert-or-swap). The shift/landing is recomputed by the SAME
   * pure placementFor() the editor drew its marker from; if it no longer yields `mode` (stale marker)
   * nothing changes. Every changed cell goes through setCell (same events as swapCells; no deck reset —
   * that happens once at editor close via commitEdits).
   * @param {{wand:(number|'bag'), slot:number} | {held:string}} from  the held card's origin cell, or
   *        {held: cardId} for an origin-less card (a reward Take)
   * @param {{wand:(number|'bag'), slot:number}} to
   * @param {'place'|'insert'|'swap'} [mode]  the mode the caller showed; omitted = accept the computed one
   * @returns {null | (ReturnType<typeof placementFor> & { handOver: string|null })}  handOver = the card
   *          displaced by an origin-less swap (the UI now holds it)
   */
  placeCard(from, to, mode) {
    const originLess = !!from && Object.prototype.hasOwnProperty.call(from, 'held');
    const origin = originLess ? null : from;
    const heldId = originLess ? from.held : origin && this.getCell(origin);
    if (!heldId) return null;
    const plan = placementFor(this.placementRow(to.wand), origin, to.slot, heldId);
    if (plan.mode === 'none' || (mode && plan.mode !== mode)) return null;
    const row = to.wand === 'bag' ? this.bag : this.wands[to.wand].state.slots;
    const next = plan.slots;
    for (let k = 0; k < next.length; k++) if ((row[k] ?? null) !== (next[k] ?? null)) this.setCell({ wand: to.wand, slot: k }, next[k]);
    if (origin && origin.wand !== to.wand) this.setCell(origin, plan.mode === 'swap' ? plan.displaced : null);
    return { ...plan, handOver: originLess && plan.mode === 'swap' ? plan.displaced : null };
  }
  firstEmptySlot(wandIndex) { return this.wands[wandIndex].state.slots.indexOf(null); }

  /** Editor snapshot/revert (wand-editor-ux §1, §3.4 Revert). */
  snapshot() { return { wands: this.wands.map((w) => ({ id: w.id, slots: w.state.slots.slice() })), bag: this.bag.slice(), coins: this.coins }; }
  isWandChanged(i, snap) { const s = snap.wands[i]; return !s || s.id !== this.wands[i].id || s.slots.some((x, k) => x !== this.wands[i].state.slots[k]); }
  anyChanged(snap) { return this.wands.some((_, i) => this.isWandChanged(i, snap)) || snap.bag.some((x, k) => x !== this.bag[k]); }
  revert(snap) {
    snap.wands.forEach((s, i) => {
      const w = this.wands[i];
      if (!w || w.id !== s.id) return;
      const slots = s.slots.slice();
      while (slots.length < w.def.capacity) slots.push(null);                  // a forge slot bought after the snapshot stays
      w.state.slots = slots;
    });
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
      applyEditReset(w.def, w.state, this.cards, this.spellEnv(), this.rng.spell);
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
  // ---- draft inputs (design-v2 §9) ----
  /** Tags owned at ≥ tagLean.ownedThreshold items (cards in wands + bag, and relics). */
  ownedTags() {
    const items = [];
    for (const w of this.wands) for (const id of w.state.slots) if (id && this.cat.cards[id]) items.push(this.cat.cards[id]);
    for (const id of this.bag) if (id && this.cat.cards[id]) items.push(this.cat.cards[id]);
    for (const id of this.relics) items.push(this.cat.relics[id]);
    return ownedTagSet(this.cat, items);
  }
  /** The counter guarantee's keyword for the next draft, or null (the player already owns a card carrying it). */
  counterNeeded() {
    const kw = this.upcomingKeyword;
    if (!kw) return null;
    const own = ownedKeywords(this);
    return Object.prototype.hasOwnProperty.call(own, kw) && !own[kw] ? kw : null;
  }
  _draftOpts(kind) {
    const o = { pity: this.pity, ownedTags: this.ownedTags(), banned: this.banned };
    if (kind === 'relic' && this.features.duos) o.duos = duosFor(this.cat, this.relics);
    const kw = this.counterNeeded();
    if (kw) o.counter = { keyword: kw };
    return o;
  }
  _rollItems(kind, risk) {
    const drafts = this.cat.economy.drafts;
    const owned = new Set(this.relics);
    if (risk) return rollCorrupted(this.cat, (this.cat.rules.risk && this.cat.rules.risk.rewardDraft) || 2, this.rng.loot, owned, this.banned);
    if (kind === 'relic' || kind === 'bossRelic') return rollDraft(this.cat, 'relic', kind === 'bossRelic' ? drafts.bossRelic : drafts.relic, this.floor, this.rng.loot, this.isUnlocked, owned, this._draftOpts('relic'));
    if (kind === 'wand') return rollDraft(this.cat, 'wand', 1, this.floor, this.rng.loot, this.isUnlocked);
    return rollDraft(this.cat, kind, drafts[kind] || 3, this.floor, this.rng.loot, this.isUnlocked, new Set(), this._draftOpts(kind));
  }
  _announceOffer() {
    const o = this.offer;
    this.emit(EV.REWARD_OFFER, o);
    if (o.kind === 'relic' || o.kind === 'bossRelic') for (const id of o.items) if (this.cat.relics[id] && this.cat.relics[id].duo) this.emit(EV.DUO_OFFERED, { id });
  }

  /**
   * Create (or keep) the room's reward offer. kind: 'spell'|'modifier'|'relic'|'bossRelic'|'wand'.
   * `req` (or a plain object in place of fixedItems): { risk: true } → a risk-door draft of rules.risk.rewardDraft
   * corrupted relics (the director passes it; the `corrupted` feature gates the door upstream).
   */
  makeOffer(kind, roomKey, fixedItems = null, req = null) {
    if (fixedItems && !Array.isArray(fixedItems) && typeof fixedItems === 'object') { req = fixedItems; fixedItems = null; }
    req = req || {};
    if (this.offer && this.offer.roomKey === roomKey) return this.offer;
    const risk = !!req.risk && (kind === 'relic' || kind === 'bossRelic' || kind === 'risk');
    if (kind === 'risk') kind = 'relic';
    const items = fixedItems ? fixedItems.slice() : this._rollItems(kind, risk);
    this.offer = { kind, items, taken: false, skipped: false, roomKey, fixed: !!fixedItems, risk, rerolls: 0,
      counterIndex: items.counterIndex ?? null, counterKeyword: items.counterIndex != null ? this.upcomingKeyword : null };
    this._announceOffer();
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
  /** Skip + Reroll exist on drafts only (not wand offers, not the fixed tutorial offer). */
  get offerIsDraft() { const o = this.offer; return !!o && !o.taken && !o.fixed && o.kind !== 'wand'; }
  /** economy.skip: 6 + 4 × floor coins. */
  get skipPay() { return skipPay(this.cat, this.floor); }
  /** Skip the draft: take the gold, forfeit the offer (the pedestal goes inert). @returns coins paid, or 0 */
  skipOffer() {
    if (!this.offerIsDraft) return 0;
    const o = this.offer, n = this.skipPay;
    o.taken = true; o.skipped = true;
    this.stats.skips++;
    this.addCoins(n);
    this.emit(EV.REWARD_SKIPPED, { kind: o.kind, coins: n, roomKey: o.roomKey });
    return n;
  }
  /** economy.draftReroll cost for the current offer, or null when none are left. */
  get offerRerollCost() { return this.offer ? draftRerollCost(this.cat, this.offer.rerolls | 0) : null; }
  /** Why the draft can't be rerolled now: null | {reason:'none'|'coins'|'fixed', need?} */
  cantRerollOffer() {
    if (!this.offerIsDraft) return { reason: 'fixed' };
    const c = this.offerRerollCost;
    if (c == null) return { reason: 'none' };
    if (this.coins < c) return { reason: 'coins', need: c - this.coins };
    return null;
  }
  /** Replace every offered item with a new roll of the SAME kind (risk drafts stay corrupted). */
  rerollOffer() {
    if (this.cantRerollOffer()) return false;
    const o = this.offer, c = this.offerRerollCost;
    this.addCoins(-c);
    o.rerolls++;
    this.stats.draftRerolls++;
    const items = this._rollItems(o.kind, o.risk);
    o.items = items;
    o.counterIndex = items.counterIndex ?? null;
    o.counterKeyword = items.counterIndex != null ? this.upcomingKeyword : null;
    this._announceOffer();
    return true;
  }

  get priceMult() { return this.economyMods.shopPriceMult; }
  _shopOpts(saleIndex = null) { return { pity: this.pity, ownedTags: this.ownedTags(), banned: this.banned, saleIndex }; }
  openShop(roomKey) {
    if (this.shop && this.shop.roomKey === roomKey) return this.shop;
    const stock = rollShop(this.cat, this.floor, this.rng.loot, this.isUnlocked, this.relics, this.priceMult, this._shopOpts());
    this.shop = { roomKey, rerolls: 0, freeRerolls: this.economyMods.freeRerollsPerShop | 0, bans: 0, saleIndex: stock.saleIndex ?? null, stock };
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
    const fresh = rollShop(this.cat, this.floor, this.rng.loot, this.isUnlocked, this.relics, this.priceMult, this._shopOpts(s.saleIndex));
    s.stock = s.stock.map((it, i) => (it.kind === 'heal' ? it : { ...fresh[i] }));
    this.emit(EV.SHOP_CHANGED);
    return true;
  }
  /** economy.ban: bans left in this shop. */
  get bansLeft() { const b = this.cat.economy.ban; return this.shop && b ? Math.max(0, b.perShop - (this.shop.bans | 0)) : 0; }
  /** Why stock item i can't be banned: null | {reason:'none'|'kind'|'sold'} */
  cantBan(i) {
    const it = this.shop && this.shop.stock[i];
    if (!it || it.sold || !it.id) return { reason: 'sold' };
    if (it.kind !== 'card' && it.kind !== 'relic') return { reason: 'kind' };
    if (!this.bansLeft) return { reason: 'none' };
    return null;
  }
  /** Ban stock item i from the run's pools (screen-graph §9.5b: the banned slot restocks with a new item). */
  ban(i) {
    if (this.cantBan(i)) return false;
    const s = this.shop, it = s.stock[i];
    this.banned.add(it.id);
    s.bans = (s.bans | 0) + 1;
    const exclude = new Set(it.kind === 'relic' ? this.relics : []);
    for (const x of s.stock) if (x.id) exclude.add(x.id);
    const [id] = rollDraft(this.cat, it.kind, 1, this.floor, this.rng.loot, this.isUnlocked, exclude, { ownedTags: this.ownedTags(), banned: this.banned, pity: this.pity, noPityUpdate: true });
    if (id) {
      const pr = priceOf(this.cat, it.kind, id, this.floor, this.priceMult);
      const salePrice = it.sale ? Math.max(1, Math.round(pr * this.cat.economy.sale.mult)) : pr;
      s.stock[i] = { ...it, id, basePrice: pr, price: salePrice, sold: false };
    } else s.stock[i] = { ...it, id: null, price: 0, sold: true };
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

  // =====================================================================================
  // Forge (shop tab S5f; forge.json; design-v2 §9, systems §11)
  // =====================================================================================
  /** Every cell holding `id`: wand slots (wand order) first, then the bag. */
  cardLocations(id) {
    const out = [];
    this.wands.forEach((w, i) => w.state.slots.forEach((x, k) => { if (x === id) out.push({ wand: i, slot: k }); }));
    this.bag.forEach((x, k) => { if (x === id) out.push({ wand: 'bag', slot: k }); });
    return out;
  }
  /**
   * The forge's rows with availability + reasons (never throws; the UI shows every reason).
   * merges: [{recipe, cost, have, ok, reason}] · evolves: [{recipe, cost, hasBase, hasCatalyst, ok, reason}]
   * slots: [{wand, capacity, next, cost, ok, reason}]
   */
  forgeState() {
    const cat = this.cat, fl = this.floor;
    const merges = cat.forgeMerges.map((recipe) => {
      const have = this.cardLocations(recipe.from).length, cost = forgeCost(recipe, fl);
      const reason = have < recipe.count ? 'parts' : this.coins < cost ? 'coins' : null;
      return { recipe, cost, have, ok: !reason, reason, need: reason === 'coins' ? cost - this.coins : 0 };
    });
    const evolves = cat.forgeEvolves.map((recipe) => {
      const hasBase = this.cardLocations(recipe.base).length > 0;
      const c = recipe.catalyst || {};
      const hasCatalyst = c.kind === 'relic' ? this.hasRelic(c.id) : this.cardLocations(c.id).length > 0;
      const cost = forgeCost(recipe, fl);
      const reason = !hasBase || !hasCatalyst ? 'parts' : this.coins < cost ? 'coins' : null;
      return { recipe, cost, hasBase, hasCatalyst, ok: !reason, reason, need: reason === 'coins' ? cost - this.coins : 0 };
    });
    const fs = cat.forgeSlot;
    const slots = fs ? this.wands.map((w, i) => {
      const cost = slotCost(fs, this.forgeSlotsBought);
      const reason = w.def.capacity >= fs.maxCapacity ? 'max' : this.forgeSlotsBought >= fs.maxBuysPerRun ? 'bought' : this.coins < cost ? 'coins' : null;
      return { wand: i, capacity: w.def.capacity, next: w.def.capacity + 1, cost, ok: !reason, reason, need: reason === 'coins' ? cost - this.coins : 0 };
    }) : [];
    return { merges, evolves, slots };
  }
  /** A changed wand pays its edit reset NOW (the sim is paused under the shop; = "on the next close"). */
  _forgeReset(wandIndex) {
    const w = this.wands[wandIndex]; if (!w) return;
    applyEditReset(w.def, w.state, this.cards, this.spellEnv(), this.rng.spell);
    this.emit(EV.WAND_CHANGED, wandIndex);
    this.emit(EV.WAND_RECHARGE_START, wandIndex, w.state.rechargeTimerMs);
  }
  /**
   * The cells a forge op uses: [0] = where the result lands (the first copy: wands before bag), then the consumed
   * copies — taken from the BAG first, so a merge never empties a wand slot it doesn't have to.
   */
  _forgeCells(id, count) {
    const all = this.cardLocations(id);
    if (!all.length) return [];
    const [first, ...rest] = all;
    rest.sort((a, b) => (a.wand === 'bag' ? 0 : 1) - (b.wand === 'bag' ? 0 : 1));
    return [first, ...rest].slice(0, count);
  }
  /** Slots a forge result would produce, per affected wand (for the DPS delta preview). @returns {wand, slots}[] */
  forgeOutcome(kind, recipe) {
    const from = kind === 'merge' ? recipe.from : recipe.base;
    const locs = this._forgeCells(from, kind === 'merge' ? recipe.count : 1);
    const byWand = new Map();
    locs.forEach((l, k) => {
      if (l.wand === 'bag') return;
      if (!byWand.has(l.wand)) byWand.set(l.wand, this.wands[l.wand].state.slots.slice());
      byWand.get(l.wand)[l.slot] = k === 0 ? recipe.to : null;
    });
    return [...byWand].map(([wand, slots]) => ({ wand, slots }));
  }
  /** Merge `recipe.count` copies → the level-2 card in the FIRST source's cell (screen-graph §9.5). */
  forgeMerge(recipeId) {
    const row = this.forgeState().merges.find((m) => m.recipe.id === recipeId);
    if (!row || !row.ok) return null;
    const r = row.recipe;
    const locs = this._forgeCells(r.from, r.count);
    this.addCoins(-row.cost);
    const changed = new Set();
    locs.forEach((l, k) => { this.setCell(l, k === 0 ? r.to : null); if (l.wand !== 'bag') changed.add(l.wand); });
    for (const i of changed) this._forgeReset(i);
    this.stats.forged++;
    this.emit(EV.BAG_CHANGED);
    this.emit(EV.CARD_GAINED, r.to);
    this.emit(EV.FORGE, { kind: 'merge', cardId: r.from, result: r.to });
    return r.to;
  }
  /** Evolve a level-2 card with its catalyst → the evolved card in the base's cell; a relic catalyst is kept. */
  forgeEvolve(recipeId) {
    const row = this.forgeState().evolves.find((m) => m.recipe.id === recipeId);
    if (!row || !row.ok) return null;
    const r = row.recipe;
    const l = this.cardLocations(r.base)[0];
    this.addCoins(-row.cost);
    this.setCell(l, r.to);
    if (r.catalyst && r.catalyst.kind !== 'relic' && r.catalyst.consumed !== false) {
      const cl = this.cardLocations(r.catalyst.id)[0]; if (cl) this.setCell(cl, null);
    }
    if (l.wand !== 'bag') this._forgeReset(l.wand);
    this.stats.forged++;
    this.stats.evolves = (this.stats.evolves | 0) + 1;                 // goal g_forgewright (evolve_card)
    this.emit(EV.CARD_GAINED, r.to);
    this.emit(EV.FORGE, { kind: 'evolve', cardId: r.base, result: r.to });
    return r.to;
  }
  /** +1 slot on wand i (forge.slot: costBase + costStep × bought, max per run, capacity cap). */
  forgeSlot(i) {
    const row = this.forgeState().slots[i];
    if (!row || !row.ok) return false;
    this.addCoins(-row.cost);
    this.forgeSlotsBought++;
    this.slotBonus[i] = (this.slotBonus[i] | 0) + 1;
    this._applyWandOverlay(i);
    this.stats.forged++;
    this.emit(EV.WAND_CHANGED, i);
    this.emit(EV.FORGE, { kind: 'slot', cardId: null, result: this.wands[i].def.capacity, wand: i });
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
  /** Mini-boss / boss ids whose room this run entered (route kinds × floors.json; goal reach_miniboss). */
  _bossesReached() {
    const out = [];
    for (const r of this.route) {
      const fd = this.cat.floors && this.cat.floors[`f${r.floor}`];
      const id = fd && (r.roomKind === 'miniboss' ? fd.miniBoss : r.roomKind === 'boss' ? fd.boss : null);
      if (id && !out.includes(id)) out.push(id);
    }
    return out;
  }
  /** HUD mode badge text parts (hud-layout §9.2 modeBadge): { mode, heat, bonusHalfHearts, absorbPct } or null for Heat 0. */
  get modeBadge() {
    if (this.mode === 'gentle') return { mode: 'gentle', bonusHalfHearts: this.gentle.bonusHalfHearts, absorbPct: Math.round(this.gentle.absorbChance * 100) };
    if (this.mode === 'daily') return { mode: 'daily', date: this.daily && this.daily.date, ruleId: this.daily && this.daily.ruleId };
    return this.heatLevel ? { mode: 'standard', heat: this.heatLevel } : null;
  }
  summary() {
    return {
      outcome: this.outcome, floor: this.floor, step: this.step, kills: this.stats.kills, timeS: this.stats.timeFrames / 60,
      seed: this.seed, killer: this.stats.killer, loadoutId: this.loadoutId,
      // v2 mode + goal inputs (save.recordRun → run/meta.js goals)
      mode: this.mode, heatLevel: this.heatLevel, daily: this.daily ? { date: this.daily.date, loadoutId: this.daily.loadoutId, ruleId: this.daily.ruleId } : null,
      gentle: this.gentle ? { ...this.gentle } : null,
      defencesBroken: this.stats.defencesBroken | 0, evolves: this.stats.evolves | 0,
      duosFormed: this.relics.filter((id) => this.cat.relics[id] && (this.cat.relics[id].category === 'duo' || this.cat.relics[id].rarity === 'duo')).length,
      miniBossesKilled: (this.stats.miniBossesKilled || []).slice(), bossesReached: this._bossesReached(),
      wands: this.wands.map((w) => ({ id: w.id, slots: w.state.slots.slice() })), relics: this.relics.slice(),
      bossesKilled: this.stats.bossesKilled.slice(), reactionsSeen: this.stats.reactionsSeen.slice(),
      payloadsReleased: this.stats.payloadsReleased, maxFloor: this.stats.maxFloor, coinsEarned: this.stats.coinsEarned,
    };
  }
}

// Re-exported for UI code that previews without a RunState (codex etc.)
export { buildOrder };
