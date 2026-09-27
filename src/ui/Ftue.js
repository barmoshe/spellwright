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

const VERB = {
  //      flag         cap  hint  priority  sticky (stays until complete / room ends)  maxShowMs
  P4: { flag: 'dash', cap: 2, hint: true, pri: 5, sticky: true },
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
    on(EV.WAND_CAST, () => { this.noCastMs = 0; this.moveNoCastMs = 0; this.complete('P2'); });
    on(EV.PLAYER_DASHED, () => this.complete('P4'));
    on(EV.WAND_ACTIVE, (i) => { if (this.run && this.run.wands.length >= 2 && this._lastActive != null && i !== this._lastActive) this.complete('P8'); this._lastActive = i; });
    on(EV.WAND_CHANGED, () => { if (this.run && this.run.wands.length >= 2) this.hasSecondWand = true; });
    on(EV.ROOM_ENTER, () => this._roomEnd('enter'));
    on(EV.ROOM_CLEARED, () => this._roomEnd('cleared'));
    on(EV.STATUS_FIRST, (d) => this._status(d && d.status));
    on(EV.REACTION, (d) => { if (d && d.first) this._toast({ key: `P7:${d.name}`, text: t(`toast.reaction.${d.name}`), icon: { element: reactionElement(d.name) } }, true); });
    on(EV.WAND_SPUTTER, (d) => this._sputter(d));
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
    this.noCastMs += dt;
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
    const want = {
      P4: this.dangerRoom,
      P2: (nearDist <= TILE3 && this.noCastMs >= 2000) || this.moveNoCastMs >= 6000,
      P1: this.idleMs >= 3000,
      P2b: inCombatRoom && this.taps.length >= 5,
      P8: this.hasSecondWand && !(near.enemyDist <= P8_CLEAR_PX),
    };
    let best = null;
    for (const id of ['P4', 'P2', 'P1', 'P2b', 'P8']) {
      const d = VERB[id];
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

  /** i18n text of the current verb prompt, for the current device / cast mode. */
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
