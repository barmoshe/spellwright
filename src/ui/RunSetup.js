// ui/RunSetup.js — S1m Mode Select, the S1a Run Setup successor (screen-graph §9.2; design-v2 §11;
// data/modes.json + rules.heat). A Title sub-panel.
//   Row 1: three mode cards — Standard (Heat tier stepper inside) · Daily (today's loadout + rule) · Gentle.
//   Row 2: loadout cards (Daily: the fixed daily loadout + rule, not selectable).
//   Row 3: Begin (default focus; last-used mode + loadout pre-selected) · Back.
// Deviation (recorded): the Heat stepper is its OWN focus row inside the Standard card (up/down reaches it,
// left/right steps the tier). Binding left/right on the Standard card itself would make Daily/Gentle
// unreachable by keys from the leftmost card (a keyboard trap, screen-graph §0).
// Begin arms the run config (run/meta.js armRun) and hands {loadoutId, seed?} to the Title.

import { C, txt, icon, cardCell } from './kit.js';
import { box, button, glyph, reduced } from './draw.js';
import { cat } from '../data/catalog.js';
import { Save } from '../core/save.js';
import { t } from '../core/i18n.js';
import { cardOf } from './fmt.js';
import { armRun, dailyFor, gentleFor, heatRecord, heatMax, utcDate } from '../run/meta.js';

const MODES = ['standard', 'daily', 'gentle'];
export const heatUnlocked = () => Save.isUnlocked('features', 'heat');
export const dailyUnlocked = () => Save.isUnlocked('features', 'daily');
/** S1m opens once the profile has a finished run; a fresh profile's Start Run begins Standard at once. */
export function setupEligible() { return (Save.meta.stats.runs | 0) > 0; }

/**
 * What tier n ADDS over tier n-1 (rules.heat levels are cumulative records; design-v2 §11 lists each tier's
 * additions), e.g. Heat 3 → "enemy shots x1.1 · shops +20% · heals -1". The full cumulative list at Heat 5 is
 * 9 items and cannot fit the 192 px card; the delta + "(+ lower tiers)" keeps it to two lines.
 */
export function heatChanges(rec, prev) {
  if (!rec) return t('mode.heat0');
  const out = [];
  const x = (v) => String(+v.toFixed(2));
  const P = prev || { enemyHpMult: 1, eliteAffixes: 1, extraBudgetPerWave: 0, enemyProjSpeedMult: 1, shopPriceMult: 1, healRewardAdd: 0, bossHeatAttack: false, windupMult: 1, playerMaxHpAdd: 0 };
  if (rec.enemyHpMult !== P.enemyHpMult) out.push(t('heat.hp', { v: x(rec.enemyHpMult) }));
  if (rec.eliteAffixes !== P.eliteAffixes) out.push(t('heat.affixes', { n: rec.eliteAffixes }));
  if (rec.extraBudgetPerWave !== P.extraBudgetPerWave) out.push(t('heat.budget', { n: rec.extraBudgetPerWave }));
  if (rec.enemyProjSpeedMult !== P.enemyProjSpeedMult) out.push(t('heat.shots', { v: x(rec.enemyProjSpeedMult) }));
  if (rec.shopPriceMult !== P.shopPriceMult) out.push(t('heat.shop', { n: Math.round((rec.shopPriceMult - 1) * 100) }));
  if (rec.healRewardAdd !== P.healRewardAdd) out.push(t('heat.heal', { n: rec.healRewardAdd }));
  if (rec.bossHeatAttack && !P.bossHeatAttack) out.push(t('heat.boss'));
  if (rec.windupMult !== P.windupMult) out.push(t('heat.windup', { v: x(rec.windupMult) }));
  if (rec.playerMaxHpAdd !== P.playerMaxHpAdd) out.push(t('heat.maxHp', { n: rec.playerMaxHpAdd / 2 }));
  return out.join(' · ') + (prev ? ' ' + t('heat.lower') : '');
}

export class RunSetup {
  /** onBegin({loadoutId, seed?}), onBack() */
  constructor(scene, root, nav, { onBegin, onBack }) {
    this.scene = scene; this.nav = nav; this.onBegin = onBegin; this.onBack = onBack;
    this.mixer = scene.registry.get('mixer');
    this.c = scene.add.container(0, 0); root.add(this.c);
    const k = cat();
    this.list = k.loadoutList;
    const last = this.list.find((l) => l.id === Save.meta.lastLoadout && Save.isUnlocked('loadouts', l.id));
    this.sel = last ? last.id : 'apprentice';
    this.mode = Save.meta.lastMode || 'standard';
    if (this.mode === 'daily' && !dailyUnlocked()) this.mode = 'standard';
    this.heatMax = heatUnlocked() ? Math.min(heatMax(k), Save.meta.heat.max | 0) : 0;
    this.heat = Math.min(this.heatMax, Save.meta.heat.last | 0);
    this.daily = dailyFor(k, utcDate());
    this.gentle = gentleFor(k, Save.meta.gentle.losses);
    this.firstBuild = true;
    this.build();
    nav.focus('su:begin', { silent: true, snap: true });
  }

  // ------------------------------------------------------------------------------------ build
  build() {
    const s = this.scene, c = this.c, k = cat();
    c.removeAll(true);
    this.nav.clear('su:');
    c.add(box(s, 16, 30, 608, 316, 'ornate'));
    c.add(txt(s, 320, 36, t('mode.title'), 'T2', { origin: [0.5, 0] }));
    const cardIds = [];
    const cards = [];
    MODES.forEach((id, i) => {
      const x = 24 + 200 * i, y = 54, W = 192, H = 120;
      const locked = id === 'daily' && !dailyUnlocked();
      const on = id === this.mode;
      const cc = s.add.container(0, 0); c.add(cc); cards.push(cc);
      const g = s.add.graphics(); cc.add(g);
      g.fillStyle(C.stroke, 1).fillRect(x, y, W, H).fillStyle(locked ? 0x1f1f2a : C.panel, 1).fillRect(x + 1, y + 1, W - 2, H - 2);
      g.lineStyle(on ? 2 : 1, on ? C.gold : C.slateDark, 1).strokeRect(x + (on ? 1 : 1.5), y + (on ? 1 : 1.5), W - (on ? 2 : 3), H - (on ? 2 : 3));
      if (on) cc.add(glyph(s, x + W - 13, y + 4, 'ok'));
      const gl = glyph(s, x + 8, y + 7, id === 'standard' ? 'star' : id === 'daily' ? 'recharge' : 'heart');
      gl.setScale(Math.max(1, Math.round(18 / (gl.width || 9))));                 // ~18 px mode icon, integer scale
      cc.add(gl);
      cc.add(txt(s, x + 30, y + 8, t(`mode.${id}`), 'T2', { color: locked ? C.disabled : C.text }));
      this[`_card_${id}`](cc, x, y, W, locked, on);
      const nid = `su:m:${i}`; cardIds.push(nid);
      this.nav.add({ id: nid, x, y, w: W, h: id === 'standard' && on && this.heatMax > 0 ? 64 : H, disabled: locked,
        onConfirm: () => this.pickMode(id), onDenied: () => this.mixer.fire('ui_denied'),
        nav: { up: null, down: id === 'standard' && on && this.heatMax > 0 ? 'su:heat' : 'su:l:first' } });
    });
    this.nav.linkList(cardIds, 'h', false);

    // row 2: loadouts (Daily: the fixed daily loadout + rule)
    const lids = [];
    if (this.mode === 'daily') {
      const lo = k.loadouts[this.daily.loadoutId];
      c.add(txt(s, 32, 186, t('mode.today', { loadout: lo ? lo.name : this.daily.loadoutId, rule: t(`daily.${this.daily.ruleId}`),
        desc: t(`daily.${this.daily.ruleId}.desc`) }), 'T1', { wrap: 576 }));
      if (lo) lo.wands.forEach((w, j) => {
        c.add(icon(s, 40 + j * 150, 216, 'wands', w.wandId, 16));
        w.cards.forEach((cid, q) => c.add(cardCell(s, 52 + j * 150 + q * 19, 207, cardOf(cid), 18)));
      });
    } else {
      c.add(txt(s, 32, 178, t('setup.loadout'), 'T1', { color: C.dim }));
      const n = this.list.length, W = 96, gap = 8, x0 = Math.round((640 - (n * W + (n - 1) * gap)) / 2), y = 190;
      this.list.forEach((lo, i) => {
        const x = x0 + i * (W + gap);
        const unlocked = Save.isUnlocked('loadouts', lo.id);
        const on = lo.id === this.sel;
        const g = s.add.graphics(); c.add(g);
        g.fillStyle(C.stroke, 1).fillRect(x, y, W, 56).fillStyle(unlocked ? C.panel : 0x1f1f2a, 1).fillRect(x + 1, y + 1, W - 2, 54);
        g.lineStyle(on ? 2 : 1, on ? C.gold : C.slateDark, 1).strokeRect(x + (on ? 1 : 1.5), y + (on ? 1 : 1.5), W - (on ? 2 : 3), 56 - (on ? 2 : 3));
        c.add(txt(s, x + 6, y + 4, lo.name, 'T1', { color: unlocked ? C.text : C.disabled }));
        if (unlocked) {
          const w0 = lo.wands[0];
          c.add(icon(s, x + 14, y + 32, 'wands', w0.wandId, 16));
          w0.cards.slice(0, 3).forEach((cid, j) => c.add(cardCell(s, x + 26 + j * 19, y + 23, cardOf(cid), 18)));
        } else c.add(glyph(s, x + 6, y + 22, 'lock'));
        const id = `su:l:${i}`; lids.push(id);
        this.nav.add({ id, x, y, w: W, h: 56, disabled: !unlocked, lo, onConfirm: () => this.pick(lo.id), onDenied: () => this.mixer.fire('ui_denied'),
          onFocus: () => this.loDetail(lo), onBlur: () => this.loDetail(null), nav: { up: 'su:m:0', down: 'su:begin' } });
      });
      this.nav.linkList(lids, 'h', false);
      // the first loadout row entry is the cards' "down" target
      const firstL = lids[Math.max(0, this.list.findIndex((l) => l.id === this.sel))];
      for (const id of cardIds) { const it = this.nav.get(id); if (it.nav.down === 'su:l:first') it.nav.down = firstL; }
      this.detail = txt(s, 320, 250, '', 'T1', { origin: [0.5, 0], color: C.dim, wrap: 580 });
      c.add(this.detail);
    }
    for (const id of cardIds) { const it = this.nav.get(id); if (it.nav.down === 'su:l:first') it.nav.down = 'su:begin'; }
    const hs = this.nav.get('su:heat');
    if (hs) hs.nav.down = lids[Math.max(0, this.list.findIndex((l) => l.id === this.sel))] || 'su:begin';

    // row 3: Begin · Back
    const b = button(s, 240, 288, 160, 37, t('setup.begin'), { kind: 'primary' });
    const bk = button(s, 410, 294, 90, 24, t('setup.back'));
    c.add([b, bk]);
    const upFromBegin = this.mode === 'daily' ? `su:m:${MODES.indexOf(this.mode)}` : lids[Math.max(0, this.list.findIndex((l) => l.id === this.sel))];
    this.nav.add({ id: 'su:begin', x: 240, y: 288, w: 160, h: 37, onFocus: () => b.setFocused(true), onBlur: () => b.setFocused(false),
      onConfirm: () => { b.press(); this.begin(); }, nav: { up: upFromBegin, right: 'su:back', left: null, down: null } });
    this.nav.add({ id: 'su:back', x: 410, y: 294, w: 90, h: 24, onFocus: () => bk.setFocused(true), onBlur: () => bk.setFocused(false),
      onConfirm: () => this.onBack(), nav: { left: 'su:begin', up: upFromBegin, right: null, down: null } });
    for (const id of lids) this.nav.get(id).nav.up = this.nav.get('su:heat') ? 'su:heat' : `su:m:${MODES.indexOf(this.mode)}`;
    this.nav.raise();

    // motion mode-select: cards stagger in (first open only); reduced: together, no lift
    if (this.firstBuild) {
      this.firstBuild = false;
      cards.forEach((cc, i) => {
        cc.setAlpha(0);
        if (reduced()) { cc.setAlpha(1); return; }
        cc.y = 8;
        s.tweens.add({ targets: cc, alpha: 1, y: 0, duration: 200, delay: i * 60, ease: 'Cubic.easeOut', onUpdate: () => { cc.y = Math.round(cc.y); } });
      });
    }
  }

  _card_standard(cc, x, y, W, locked, on) {
    const s = this.scene;
    cc.add(txt(s, x + 8, y + 26, t('mode.standard.desc'), 'T1', { color: C.dim, wrap: W - 16 }));
    if (this.mode === 'gentle') {
      cc.add(txt(s, x + 8, y + 64, t('mode.heatOffGentle'), 'T1', { color: C.disabled, wrap: W - 16 }).setAlpha(0.5));
    } else if (this.heatMax > 0) {
      const hx = x + 8, hy = y + 66;
      const lt = txt(s, hx, hy, '<', 'T1', { color: this.heat > 0 ? C.gold : C.disabled });
      const num = txt(s, hx + 12, hy, t('mode.heatN', { n: this.heat }), 'T1', { color: C.text });
      const rt = txt(s, hx + 12 + num.width + 6, hy, '>', 'T1', { color: this.heat < this.heatMax ? C.gold : C.disabled });
      cc.add([lt, num, rt]);
      this.heatNum = num;
      cc.add(txt(s, x + 8, y + 80, heatChanges(heatRecord(cat(), this.heat), heatRecord(cat(), this.heat - 1)), 'T1', { color: C.dim, wrap: W - 16 }));
      if (on) this.nav.add({ id: 'su:heat', x: x + 4, y: y + 62, w: W - 8, h: 18, onLeft: () => this.setHeat(-1), onRight: () => this.setHeat(1),
        onConfirm: () => this.setHeat(1), nav: { up: 'su:m:0', down: null } });
    } else {
      cc.add(txt(s, x + 8, y + 66, t('mode.heatLocked'), 'T1', { color: C.dim, wrap: W - 16 }));
    }
    const st = Save.meta.stats;
    const next = this.heatMax < heatMax(cat()) && heatUnlocked() ? t('mode.heatNext', { a: this.heatMax, b: this.heatMax + 1 }) : null;
    cc.add(txt(s, x + 8, y + 106, next && this.heat === this.heatMax ? next
      : t('mode.best', { heat: st.bestHeatWin == null ? '-' : st.bestHeatWin, floor: st.bestFloor | 0 }), 'T1', { color: C.dim }));
  }

  _card_daily(cc, x, y, W, locked) {
    const s = this.scene, k = cat();
    if (locked) {
      cc.add(glyph(s, x + 8, y + 30, 'lock'));
      cc.add(txt(s, x + 22, y + 29, t('mode.dailyLocked'), 'T1', { color: C.dim, wrap: W - 30 }));
      return;
    }
    const d = this.daily, lo = k.loadouts[d.loadoutId];
    cc.add(txt(s, x + 8, y + 26, t('mode.daily.desc'), 'T1', { color: C.dim, wrap: W - 16 }));
    cc.add(txt(s, x + 8, y + 60, d.date, 'T1'));
    cc.add(txt(s, x + 8, y + 74, t('mode.dailyPair', { loadout: lo ? lo.name : d.loadoutId, rule: t(`daily.${d.ruleId}`) }), 'T1', { color: C.gold, wrap: W - 16 }));
    const today = Save.meta.daily.date === d.date ? Save.meta.daily : null;
    const res = today && today.first;
    cc.add(txt(s, x + 8, y + 92, res ? t('mode.dailyFirst', { result: dailyResultText(res) }) : t('mode.dailyNot'), 'T1', { color: C.dim, wrap: W - 16 }));
    if (res) cc.add(txt(s, x + 8, y + 106, t('mode.dailyPractice'), 'T1', { color: C.dim }));
  }

  _card_gentle(cc, x, y, W) {
    const s = this.scene, g = this.gentle, r = cat().modes.gentle.rule;
    cc.add(txt(s, x + 8, y + 26, t('mode.gentle.desc'), 'T1', { color: C.dim, wrap: W - 16 }));
    cc.add(txt(s, x + 8, y + 62, t('mode.gentleNow', { h: g.bonusHalfHearts, p: Math.round(g.absorbChance * 100) }), 'T1', { wrap: W - 16 }));
    cc.add(txt(s, x + 8, y + 88, t('mode.gentleGrow', { h: r.bonusHalfHeartsCap, p: Math.round(r.absorbChanceCap * 100) }), 'T1', { color: C.dim, wrap: W - 16 }));
  }

  loDetail(lo) {
    if (!this.detail || !this.detail.active) return;
    if (!lo) { this.detail.setText(''); return; }
    if (Save.isUnlocked('loadouts', lo.id)) { this.detail.setText(lo.desc); return; }
    const ms = cat().unlocks.find((u) => (u.unlocks.loadouts || []).includes(lo.id));
    this.detail.setText(ms ? t('setup.lockedBy', { cond: ms.desc, name: ms.name }) : t('setup.locked'));
  }

  // ------------------------------------------------------------------------------------ actions
  refocus(id) { this.build(); if (this.nav.has(id)) this.nav.focus(id, { silent: true, snap: true }); else this.nav.focus('su:begin', { silent: true, snap: true }); }

  pickMode(id) {
    if (id === this.mode) { this.mixer.fire('ui_confirm'); return; }
    this.mode = id; this.mixer.fire('ui_confirm');
    this.refocus(`su:m:${MODES.indexOf(id)}`);
  }

  pick(id) {
    if (id === this.sel) return;
    this.sel = id; this.mixer.fire('ui_confirm');
    const cur = this.nav.current;
    this.build();
    if (cur && this.nav.has(cur)) this.nav.focus(cur, { silent: true, snap: true });
  }

  setHeat(d) {
    const n = Math.max(0, Math.min(this.heatMax, this.heat + d));
    if (n === this.heat) { this.mixer.fire('ui_denied'); return; }
    this.heat = n; this.mixer.fire('ui_move');
    this.refocus('su:heat');
    const num = this.heatNum;   // motion heat_stepper: the numeral slides in from the step direction
    if (num && !reduced()) { const y0 = num.y; num.y = y0 + (d > 0 ? 4 : -4); num.setAlpha(0); this.scene.tweens.add({ targets: num, y: y0, alpha: 1, duration: 90, ease: 'Cubic.easeOut' }); }
  }

  begin() {
    const k = cat(), mode = this.mode;
    Save.setMeta('lastMode', mode);
    if (mode === 'standard') { Save.meta.heat.last = this.heat; Save.persist(); }
    const cap = Save.meta.statBonus.startCapacity | 0;
    if (mode === 'daily') {
      armRun({ mode, daily: { date: this.daily.date, seed: this.daily.seed, loadoutId: this.daily.loadoutId, ruleId: this.daily.ruleId } });
      // daily_start replaces run_start at RUN_START (core/audio.js), so the confirm plays no start cue here
      this.onBegin({ loadoutId: this.daily.loadoutId, seed: this.daily.seed });
      return;
    }
    Save.setMeta('lastLoadout', this.sel);
    armRun(mode === 'gentle' ? { mode, gentle: gentleFor(k, Save.meta.gentle.losses), startCapacity: cap } : { mode, heat: this.heat, startCapacity: cap });
    this.onBegin({ loadoutId: this.sel });
  }

  destroy() { this.nav.clear('su:'); if (this.c.active) this.c.destroy(); }
}

/** "fell at 2-4" / "WON" (modes.json daily.resultWords). */
export function dailyResultText(r) {
  const w = cat().modes.daily.resultWords;
  return r.outcome === 'victory' ? w.victory : `${w[r.outcome] || w.abandon} ${r.floor || 1}-${(r.step | 0) + 1}`;
}
