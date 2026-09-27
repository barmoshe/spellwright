// ui/Ftue.js — the FTUE prompt runner (ftue-flow.md §1–§3). Owned by UI developer B.
//
// Constructed by WorldHud and advanced by WorldHud.update(dt, probe), i.e. ONLY while the run sim is
// updating: every timer below is therefore "controllable time" (modals pause the run, so they never
// count) and additionally gated by `probe.room.controllable` (room fades, boss intro, death, victory).
//
// Triggers are player-state predicates from bus events + hudProbe() — never a wall clock from scene
// start. Completion flags are written through Save.setFlag whether or not the prompt ever showed
// (rule 4). Show caps: every display writes `ftue.<id>.shown.<n>` (a boolean flag per display, because
// the save normaliser keeps only `true` values in meta.ftue); at the cap without completion the prompt
// writes `<id>.retired` when that display ends. "Reset tutorial" (Save.clearFtue) wipes all of it.
//
// Slots: ONE verb prompt above the player (P1, P2, P2b, P4, P8; priority P4 > P2 > P1 > P2b > P8),
// toast prompts through the H14 queue (P3b, P5, P9, and P7 which is never suppressed), and two
// line prompts rendered by WorldHud on existing in-world UI (P6 door label, P10 shop interact prompt).
// P3 / P11 coach lines live in UI developer A's screens.

import { EV } from '../core/events.js';
import { Save } from '../core/save.js';
import { t } from '../core/i18n.js';
import { hintsOn } from './HudKit.js';
import { keywordsOf } from '../data/catalog.js';
import { C, cardCell } from './kit.js';
import { glyph, reduced } from './draw.js';
import { cardOf } from './fmt.js';

const VERB = {
  //      flag         cap  hint  priority  sticky (stays until complete / room ends)  maxShowMs
  P4: { flag: 'dash', cap: 2, hint: true, pri: 5, sticky: true },
  P2t: { flag: 'aimStick', cap: Infinity, hint: false, pri: 4.5, sticky: true, touch: true },   // v2 touch crate lesson (ftue-flow §5.3)
  P2: { flag: 'cast', cap: 3, hint: true, pri: 4, sticky: true },
  P1: { flag: 'move', cap: 3, hint: false, pri: 3, sticky: true },
  P2b: { flag: 'holdCast', cap: 2, hint: true, pri: 2, sticky: false, maxShowMs: 6000 },
  P8: { flag: 'wandSwap', cap: 2, hint: true, pri: 1, sticky: false, maxShowMs: 6000 },
};
const LINE = { P6: { flag: 'doors', cap: 2 }, P10: { flag: 'shop', cap: 1 }, P3b: { flag: 'editorOpened', cap: 2 } };
const STATUS_KEY = { burn: 'burn', burning: 'burn', chill: 'chill', chilled: 'chill', freeze: 'freeze', frozen: 'freeze', shock: 'shock', shocked: 'shock', poison: 'poison', poisoned: 'poison' };

const TILE3 = 48;          // "within 3 tiles" (P2a) / door + pedestal proximity
const P8_CLEAR_PX = 160;

export class Ftue {
  /** @param {import('./WorldHud.js').WorldHud} worldHud */
  constructor(worldHud) {
    this.w = worldHud;
    this.scene = worldHud.scene;
    this.bus = worldHud.bus;
    this.router = worldHud.router;
    this.run = worldHud.run;
    this.mixer = worldHud.mixer;

    // player-state accumulators (controllable ms)
    this.idleMs = 0; this.moveMs = 0; this.noCastMs = 0; this.moveNoCastMs = 0;
    this.clock = 0;
    this.taps = [];              // clock stamps of cast releases < 200 ms
    this.dangerRoom = false;     // P4: a teaching attacker has spawned in this room
    this.brightMs = 0;           // P4 windup brighten remaining
    this.hasSecondWand = this.run ? this.run.wands.length >= 2 : false;

    this.verb = null;            // { id, showMs, text }
    this.verbEpoch = 0;          // bumps whenever the verb prompt (or its glyphs) change → WorldHud rebuilds
    this.tick = 0;               // completion ✔ feedback ms remaining (WorldHud renders)
    this.lineShownThisRoom = new Set();
    this.pendingToasts = [];

    const on = (e, fn) => worldHud.on(e, fn);
    on(EV.WAND_CAST, () => {
      this.noCastMs = 0; this.moveNoCastMs = 0;
      // touch (ftue-flow §5.3): auto-fire casts don't complete P2 — only an aim-stick cast does
      if (!this._touch()) { this.complete('P2'); return; }
      const it = this.scene.ctx && this.scene.ctx.intent;
      if (it && it.aimSource === 'stick') { this.stickCastAt = this.clock; this.noStickCastMs = 0; this.complete('P2'); }
      else if (it && it.aimSource === 'auto') this.autoFired = true;
    });
    this.stickCastAt = -1e9; this.noStickCastMs = 0; this.autoFired = false; this.touchRoomsCleared = 0;
    on(EV.PLAYER_DASHED, () => this.complete('P4'));
    on(EV.WAND_ACTIVE, (i) => { if (this.run && this.run.wands.length >= 2 && this._lastActive != null && i !== this._lastActive) this.complete('P8'); this._lastActive = i; });
    on(EV.WAND_CHANGED, () => { if (this.run && this.run.wands.length >= 2) this.hasSecondWand = true; });
    on(EV.ROOM_ENTER, (d) => { this._roomEnd('enter'); this._worldTip(d); });
    on(EV.ROOM_CLEARED, () => { this._roomEnd('cleared'); if (this._touch() && ++this.touchRoomsCleared >= 3) this.complete('P2'); });
    on(EV.STATUS_FIRST, (d) => this._status(d && d.status));
    on(EV.REACTION, (d) => { if (d && d.first) this._toast({ key: `P7:${d.name}`, text: t(`toast.reaction.${d.name}`), icon: { element: reactionElement(d.name) } }, true); });
    on(EV.WAND_SPUTTER, (d) => this._sputter(d));
    on(EV.DEFENCE, (d) => this._firstBlock(d));
    on(EV.SETTINGS_CHANGED, (k) => { if (k === 'tutorialHints' && !hintsOn() && this.verb && VERB[this.verb.id].hint) this._hide(false); });
    on(EV.INPUT_DEVICE, () => { this.verbEpoch++; });
    on(EV.FTUE, (name, data) => this._signal(name, data || {}));
    this._lastActive = this.run ? this.run.activeWand : null;
  }

  /** After Settings → Reset tutorial (or the harness): forget this session's accumulators too. */
  resetSession() {
    this.idleMs = 0; this.moveMs = 0; this.noCastMs = 0; this.moveNoCastMs = 0; this.taps.length = 0;
    this.lineShownThisRoom.clear(); this.pendingToasts.length = 0;
    if (this.verb) { this.verb = null; this.verbEpoch++; }
  }

  // ------------------------------------------------------------------ flags
  static flagOf(id) { return (VERB[id] || LINE[id] || {}).flag; }
  done(id) { const f = Ftue.flagOf(id); return !!f && Save.flag(f); }
  retired(id) { return Save.flag(`${id}.retired`); }
  shownCount(id) { let n = 0; while (Save.flag(`${id}.shown.${n + 1}`)) n++; return n; }
  _markShown(id) { Save.setFlag(`${id}.shown.${this.shownCount(id) + 1}`); }
  _maybeRetire(id, cap) { if (!this.done(id) && this.shownCount(id) >= cap) Save.setFlag(`${id}.retired`); }

  /** Completion beats display (rule 4): the flag is written whether or not the prompt showed. */
  complete(id) {
    const f = Ftue.flagOf(id);
    if (!f || Save.flag(f)) return;
    Save.setFlag(f);
    if (this.verb && this.verb.id === id) {
      this._hide(true);
      this.tick = 300;                                        // ✔ in the prompt's place (rule 7)
      const s = this.mixer && this.mixer.fire('ui_confirm');
      if (s && s.setVolume) s.setVolume(s.volume * 0.5);      // −6 dB
    }
  }

  _hide(completed) {
    const v = this.verb;
    if (!v) return;
    this.verb = null; this.verbEpoch++;
    if (!completed) this._maybeRetire(v.id, VERB[v.id].cap);
  }

  // ------------------------------------------------------------------ signals
  _signal(name, d) {
    switch (name) {
      case 'cast-release': {
        const hold = d.holdMs || 0;
        if (hold >= 1000) this.complete('P2b');
        else if (hold < 200) { this.taps.push(this.clock); if (this.taps.length > 8) this.taps.shift(); }
        this.complete('P2');
        break;
      }
      case 'crate-hit': case 'crate-broken':
        if (this._touch() && this.clock - this.stickCastAt < 1500) { this.complete('P2t'); this.complete('P2'); }
        break;
      case 'danger-spawn': this.dangerRoom = true; break;
      case 'danger-windup': this.brightMs = d.windupMs || windupOf(this.run, d) || 700; break;
      case 'editor-opened': Save.setFlag('editorOpened'); break;
      case 'card-slotted': Save.setFlag('slotModifier'); break;
      case 'wand-swapped': this.complete('P8'); break;
      case 'door-entered': Save.setFlag('doors'); break;
      case 'shop-opened': Save.setFlag('shop'); break;
      default: break;
    }
  }

  _roomEnd(kind) {
    // A verb prompt's display episode ends with the room (P4: "until completed or the room clears").
    if (this.verb && (kind === 'enter' || this.verb.id === 'P4')) this._hide(false);
    if (kind === 'enter') {
      this.dangerRoom = false; this.idleMs = 0; this.taps.length = 0; this.brightMs = 0;
      for (const id of this.lineShownThisRoom) this._maybeRetire(id, LINE[id].cap);
      this.lineShownThisRoom.clear();
    }
    // P3b at room:enter / room:cleared
    const r = this.run;
    if (r && hintsOn() && !Save.flag('slotModifier') && !Save.flag('editorOpened') && !this.retired('P3b')
        && this.shownCount('P3b') < LINE.P3b.cap && r.bagCount >= 1 && r.wand && r.firstEmptySlot(r.activeWand) >= 0) {
      this._toast({ key: 'P3b', make: () => t('ftue.P3b'), icon: { glyph: 'g_hand' }, onShow: () => { this._markShown('P3b'); this._maybeRetire('P3b', LINE.P3b.cap); } });
    }
  }

  _status(s) {
    const k = STATUS_KEY[s];
    if (!k || !hintsOn() || Save.flag(`status.${k}`)) return;
    this._toast({ key: `P5:${k}`, text: t(`toast.status.${k}`), icon: { element: STATUS_ELEMENT[k] }, onShow: () => Save.setFlag(`status.${k}`) });
  }

  /**
   * ftue-flow §5.2 (P12): the first block of each defence type per profile → name — counter — consequence
   * (numbers from rules.defences), then the engine-derived line (a carried wand that already answers, or where
   * to look). Hint-gated like P5; the BLOCKED word itself is always shown. Flag `block.<type>`.
   */
  _firstBlock(d) {
    if (!d || d.dot || !(d.result === 'blocked' || d.result === 'reduced' || d.result === 'absorbed' || d.result === 'wear')) return;
    const type = d.defence;
    if (!type || !hintsOn() || Save.flag(`block.${type}`)) return;
    const run = this.run, R = run && run.cat.rules.defences;
    if (!R || !R[type]) return;
    const kw = R[type].breakKeyword;
    const params = type === 'shield' ? { n: R.shield.wearBlocks } : type === 'armour' ? { blast: R.armour.blastMult, direct: R.armour.directMult } : { n: R.ward.hits };
    let k = -1;
    for (let i = 0; i < run.wands.length && k < 0; i++) {
      for (const id of run.wands[i].state.slots || []) if (id && keywordsOf(run.cat, id).includes(kw)) { k = i; break; }
    }
    const KW = t(`ftue.kw.${kw}`);
    this._toast({ key: `P12:${type}`, text: t(`ftue.block.${type}`, params), icon: { glyph: 'g_stop' }, onShow: () => Save.setFlag(`block.${type}`) });
    this._toast(k >= 0
      ? { key: `P12b:${type}`, make: () => t('ftue.block.has', { k: k + 1, kw: KW }), icon: { glyph: 'g_hand' } }
      : { key: `P12b:${type}`, text: t('ftue.block.lacks', { kw: KW }), icon: { glyph: 'g_warn' } });
  }

  /** worlds.md §4: the first room with a flooded / bookshelves world twist → one tip per save (flag `world.<twist>`). */
  _worldTip(d) {
    const tw = d && d.worldTwist;
    if ((tw !== 'flooded' && tw !== 'bookshelves') || !hintsOn() || Save.flag(`world.${tw}`)) return;
    this._toast({ key: `PW:${tw}`, text: t(`tip.world.${tw}`), icon: { glyph: 'g_hand' }, onShow: () => Save.setFlag(`world.${tw}`) });
  }

  _sputter(d) {
    if (!d || d.reason !== 'mana' || !hintsOn() || Save.flag('sputter')) return;
    const def = d.cardId && this.run && this.run.cat.cards[d.cardId];
    const card = (def && def.name) || this.w.lastSkippedCardName || t('ftue.aCard');
    this._toast({ key: 'P9', text: t('ftue.P9', { card }), icon: { glyph: 'g_warn' }, onShow: () => Save.setFlag('sputter') });
  }

  /** Toast prompts wait for controllable time (rule 3), then enter the H14 queue. */
  _toast(tt, immediate = false) {
    if (immediate) { this.bus.emit(EV.TOAST, tt); return; }
    if (!this.pendingToasts.some((p) => p.key === tt.key)) this.pendingToasts.push(tt);
  }

  // ------------------------------------------------------------------ line prompts (rendered by WorldHud)
  /** P6: door label second line. Counts one display per room. */
  doorLine() {
    if (!hintsOn() || Save.flag('doors') || this.retired('P6')) return null;
    if (!this.lineShownThisRoom.has('P6')) {
      if (this.shownCount('P6') >= LINE.P6.cap) return null;
      this.lineShownThisRoom.add('P6'); this._markShown('P6');
    }
    return t('ftue.P6');
  }
  /** P10: shop interact prompt extra line. */
  shopLine() {
    if (!hintsOn() || Save.flag('shop') || this.retired('P10')) return null;
    if (!this.lineShownThisRoom.has('P10')) {
      if (this.shownCount('P10') >= LINE.P10.cap) return null;
      this.lineShownThisRoom.add('P10'); this._markShown('P10');
    }
    return t('ftue.P10');
  }

  // ------------------------------------------------------------------ per-frame
  /** @returns the verb prompt to show ({id, text, bright}) or null. */
  update(dt, probe) {
    if (this.tick > 0) this.tick = Math.max(0, this.tick - dt);
    const ctl = !!(probe && probe.room && probe.room.controllable !== false && probe.player && probe.player.alive !== false);
    if (!ctl) return null;                    // never during fades / boss intro / death / victory (rule 3)
    this.clock += dt;
    const P = probe.player;
    const moving = !!P.moving;
    if (moving) { this.idleMs = 0; this.moveMs += dt; this.moveNoCastMs += dt; } else this.idleMs += dt;
    this.noCastMs += dt; this.noStickCastMs += dt;
    if (this.brightMs > 0) this.brightMs = Math.max(0, this.brightMs - dt);
    if (this.moveMs >= 1000) this.complete('P1');
    if (probe.wand && probe.wand.holdMs >= 1000) this.complete('P2b');

    // flush toast prompts now that the player is in control
    while (this.pendingToasts.length) {
      const tt = this.pendingToasts.shift();
      if (tt.onShow) tt.onShow();
      this.bus.emit(EV.TOAST, tt);
    }

    // triggered verb prompts, highest priority first
    const near = probe.near || {};
    const nearDist = Math.min(near.crateDist ?? Infinity, near.enemyDist ?? Infinity);
    const now = this.clock;
    while (this.taps.length && now - this.taps[0] > 5000) this.taps.shift();
    const inCombatRoom = !!(probe.room && (probe.room.inCombat || /combat|elite|boss/.test(probe.room.kind || '')));
    const touch = this._touch();
    const noEnemy = !(near.enemyDist < Infinity);
    const want = {
      P4: this.dangerRoom,
      // P2t (touch only, not hint-gated): at a crate, no living enemy, no aim-stick cast for 2 s
      P2t: touch && (near.crateDist ?? Infinity) <= TILE3 && noEnemy && this.noStickCastMs >= 2000,
      // P2 on touch: auto-fire mode shows on the first auto-fire at an enemy; stick mode is covered by P2t
      P2: touch ? (Save.settings.touchFire !== 'stick' && this.autoFired && !noEnemy)
        : ((nearDist <= TILE3 && this.noCastMs >= 2000) || this.moveNoCastMs >= 6000),
      P1: this.idleMs >= 3000,
      P2b: !touch && inCombatRoom && this.taps.length >= 5,
      P8: this.hasSecondWand && !(near.enemyDist <= P8_CLEAR_PX),
    };
    let best = null;
    for (const id of ['P4', 'P2t', 'P2', 'P1', 'P2b', 'P8']) {
      const d = VERB[id];
      if (d.touch && !touch) continue;
      if (this.done(id) || this.retired(id) || (d.hint && !hintsOn())) continue;
      const showing = this.verb && this.verb.id === id;
      if (showing) { best = id; break; }                        // a shown prompt keeps its slot unless outranked
      if (!want[id] || this.shownCount(id) >= d.cap) continue;
      best = id; break;
    }
    if (this.verb && best !== this.verb.id) {
      // outranked (or no longer valid): the lower one returns to the queue and re-checks later (rule 1)
      const cur = this.verb;
      if (!best || VERB[best].pri > VERB[cur.id].pri) this._hide(false);
    }
    if (best && (!this.verb || this.verb.id !== best)) {
      this.verb = { id: best, showMs: 0 };
      this._markShown(best);
      this.verbEpoch++;
    }
    if (this.verb) {
      this.verb.showMs += dt;
      const d = VERB[this.verb.id];
      if (!d.sticky && this.verb.showMs >= d.maxShowMs) this._hide(false);
    }
    if (!this.verb) return null;
    return this.verb;
  }

  _touch() { return !!(this.router && this.router.promptFamily === 'touch'); }

  /** i18n text of the current verb prompt, for the current device / cast mode (t() picks `.touch` variants). */
  verbText(id) {
    if (id === 'P2b' && Save.settings.castMode === 'toggle') return t('ftue.P2b.toggle');
    if (id === 'P8' && this.router && this.router.device === 'pad') return t('ftue.P8.pad');
    return t(`ftue.${id}`);
  }
  get bright() { return this.brightMs > 0 && this.verb && this.verb.id === 'P4'; }
}

const STATUS_ELEMENT = { burn: 'fire', chill: 'frost', freeze: 'frost', shock: 'shock', poison: 'poison' };
function reactionElement(name) { return { melt: 'fire', overload: 'shock', blight: 'poison', superconduct: 'frost', quench: 'frost' }[name] || 'arcane'; }
/** The windup of the attack named by a `danger-windup` signal ({id: enemy def or instance id, attack}), for the P4 brighten. */
function windupOf(run, d) {
  const cat = run && run.cat;
  if (!cat || !d) return 0;
  for (const tbl of [cat.enemies, cat.bosses]) {
    const e = tbl && (tbl[d.id] || tbl[d.enemyId]);
    const a = e && e.attacks && e.attacks.find((x) => x.id === d.attack);
    if (a && a.windupMs) return a.windupMs;
  }
  return 0;
}


// =====================================================================================================
// Ghost-hand coach (ftue-flow §5.1; motion-spec coach-ghost-hand). Lives inside the wand editor while a
// coached card is held (P3: the first modifier). The goal slot is NEVER hard-coded: every legal drop of the
// held card on the selected wand (each empty slot = place, each filled slot = insert while the wand has room;
// the editor's own placementFor rule) is dry-run through the preview engine (run.preview → previewCycle)
// and scored: (a) no NEW warning · (b) largest ~DPS gain · (c) smallest mana/s increase · (d) leftmost.
// If every candidate ties on (b) there is no ghost and pane C says "Any slot works here."
// Shown only after 1.5 s without editor input; any input kills the loop at once and re-arms the timer.
// Simplifications (recorded): only P3 is coached (P13/P14 lessons are not built); completion stays the
// editor's existing rule (any wand placement of the non-projectile card), not the (a)+(b) check.
// =====================================================================================================
const GHOST = { idleMs: 1500, appearMs: 150, travelMs: 900, tapMs: 100, holdMs: 500, fadeMs: 150, touchOffsetY: -16 };
const warnKey = (w) => `${w.id}:${w.cardId || ''}`;

export class GhostCoach {
  /** @param {import('./WandEditor.js').WandEditor} ed */
  constructor(ed) {
    this.ed = ed; this.scene = ed.scene;
    this.c = this.scene.add.container(0, 0);
    ed.root.add(this.c);
    ed.root.bringToTop(ed.cHeld);
    this.parts = [];
    this.goal = null; this.line = null;
    this.recompute();
    this.poke();
  }

  /** The engine-derived goal for the current held card + selected wand (§5.1 step 2). */
  recompute() {
    const ed = this.ed, run = ed.run, h = ed.held, w = ed.wand();
    this.goal = null; this.line = null;
    if (!h || !w) return;
    const base = run.preview(ed.sel);
    const baseW = new Set(base.warnings.map(warnKey));
    const manaPS = (pv) => (pv.cycleMs > 0 ? (pv.manaPerCycle / pv.cycleMs) * 1000 : 0);
    const cands = [];
    for (let k = 0; k < w.def.capacity; k++) {
      const plan = ed.planFor({ wand: ed.sel, slot: k });
      if (!plan || (plan.mode !== 'place' && plan.mode !== 'insert') || !plan.slots) continue;
      const pv = run.preview(ed.sel, plan.slots);
      cands.push({ k, plan, pv, dps: pv.dpsSingleTarget, mana: manaPS(pv), newWarn: pv.warnings.some((x) => !baseW.has(warnKey(x))) });
    }
    if (!cands.length) return;
    const pool = cands.some((c) => !c.newWarn) ? cands.filter((c) => !c.newWarn) : cands;
    const r2 = (v) => Math.round(v * 100) / 100;
    const hi = Math.max(...pool.map((c) => r2(c.dps))), lo = Math.min(...pool.map((c) => r2(c.dps)));
    if (hi - lo < 0.01 && pool.length > 1) { this.line = t('editor.coachAny'); return; }
    pool.sort((a, b) => r2(b.dps) - r2(a.dps) || a.mana - b.mana || a.k - b.k);
    const g = pool[0];
    this.goal = g;
    const cards = run.cards;
    const after = g.plan.slots.slice(g.plan.landing + 1).find((id) => id && cards[id] && cards[id].type === 'projectile');
    const nm = (id) => (cards[id] && cards[id].name) || id;
    this.line = after
      ? t('editor.coachGhost', { card: nm(h.id), spell: nm(after), a: Math.round(base.dpsSingleTarget), b: Math.round(g.dps) })
      : null;
  }

  /** Any editor input: kill the demo at once (no fade) and re-arm the idle timer. */
  poke() {
    this.stop();
    if (this.timer) this.timer.remove(false);
    this.timer = this.scene.time.delayedCall(GHOST.idleMs, () => { this.timer = null; this.show(); });
  }

  stop() {
    for (const tw of this.tweens || []) tw.stop();
    this.tweens = [];
    if (this.step) { this.step.remove(false); this.step = null; }
    for (const p of this.parts) p.destroy();
    this.parts = [];
  }

  _src() {
    const o = this.ed.heldObj;
    return o ? { x: o.x, y: o.y } : null;
  }
  _dst() {
    const ed = this.ed, g = this.goal;
    const cell = ed.scr(ed.cellXY({ wand: ed.sel, slot: g.plan.to }));
    // insert goals end on the insert bar (between cells), not the cell centre (motion-spec path)
    return g.plan.mode === 'insert' ? { x: cell.x - 12, y: cell.y, insert: true, cell } : { x: cell.x, y: cell.y, cell };
  }

  show() {
    const ed = this.ed;
    if (!ed.held || !ed.coach || ed.touchDrag || ed.tsel || ed.dragging) return;
    this.recompute();
    if (!this.goal) return;
    const s = this.scene, src = this._src(), dst = this._dst();
    if (!src) return;
    const CELL = 36, touch = !!ed.touch, oy = touch ? GHOST.touchOffsetY : 0;
    // ring on the goal cell (a 2 px ring, or the insert bar)
    const ring = s.add.graphics();
    if (dst.insert) ring.fillStyle(C.gold, 1).fillRect(dst.cell.x - 3, dst.cell.y - 1, 2, CELL + 2);
    else ring.lineStyle(2, C.gold, 1).strokeRect(dst.cell.x + 1, dst.cell.y + 1, CELL - 2, CELL - 2);
    this.c.add(ring); this.parts.push(ring);
    const handAt = (p) => ({ x: p.x + CELL / 2 - 2, y: p.y + CELL / 2 - 4 + oy });
    if (reduced()) {
      // reduced motion: static hand on the goal + a 1 px dotted line from source to goal + static ring
      const dl = s.add.graphics().fillStyle(C.gold, 1);
      const ax = src.x + CELL / 2, ay = src.y + CELL / 2, bx = dst.x + CELL / 2, by = dst.y + CELL / 2;
      const n = Math.max(1, Math.floor(Math.hypot(bx - ax, by - ay) / 4));
      for (let i = 0; i <= n; i++) dl.fillRect(Math.round(ax + ((bx - ax) * i) / n), Math.round(ay + ((by - ay) * i) / n), 1, 1);
      const hp = handAt(dst);
      const hand = glyph(s, hp.x, hp.y, 'hand').setScale(2);
      this.c.add([dl, hand]); this.parts.push(dl, hand);
      return;
    }
    const tw = (cfg) => {
      this.tweens = this.tweens.filter((o) => o.isPlaying && o.isPlaying());      // drop finished loop tweens (no growth)
      const x = s.tweens.add(cfg); this.tweens.push(x); return x;
    };
    tw({ targets: ring, alpha: 0.4, duration: 400, ease: 'Sine.easeInOut', yoyo: true, repeat: -1 });
    const copy = cardCell(s, 0, 0, cardOf(ed.held.id), CELL);
    const hand = glyph(s, 0, 0, 'hand').setScale(2);
    this.c.add([copy, hand]); this.parts.push(copy, hand);
    const loop = () => {
      if (!copy.active) return;
      const a = this._src() || src, hs = handAt(a), hd = handAt(dst);
      copy.setPosition(a.x, a.y).setAlpha(0); hand.setPosition(hs.x, hs.y).setAlpha(0);
      tw({ targets: copy, alpha: 0.5, duration: GHOST.appearMs, ease: 'Quad.easeOut' });
      tw({ targets: hand, alpha: 1, duration: GHOST.appearMs, ease: 'Quad.easeOut', onComplete: () => {
        tw({ targets: copy, x: dst.x, y: dst.y, duration: GHOST.travelMs, ease: 'Cubic.easeInOut' });
        tw({ targets: hand, x: hd.x, y: hd.y, duration: GHOST.travelMs, ease: 'Cubic.easeInOut', onComplete: () => {
          hand.y += 1;                                                      // tap
          this.step = s.time.delayedCall(GHOST.tapMs + GHOST.holdMs, () => {
            this.step = null;
            tw({ targets: [copy, hand], alpha: 0, duration: GHOST.fadeMs, ease: 'Quad.easeIn', onComplete: loop });
          });
        } });
      } });
    };
    loop();
  }

  destroy() {
    this.stop();
    if (this.timer) { this.timer.remove(false); this.timer = null; }
    if (this.c.active) this.c.destroy();
  }
}
