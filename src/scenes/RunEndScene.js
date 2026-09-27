// RunEndScene — S7 Run End (root) and its S7u Unlocks sub-panel (screen-graph §1–§3; progression §8).
// Data (ui-contract §5): { summary, milestones:[unlocks.json record], nextGoals:[record] }.
// The outcome is the player's first question, so the summary shows first with a "n new unlocks"
// banner and focus on See unlocks; Continue from S7u returns here with focus on New Run.
// back = Title. The seed is shown here only (systems.md §7). The RunState is dropped on leaving.

import Phaser from '../../lib/phaser.esm.min.js';
import { VIEW_W, VIEW_H } from '../config.js';
import { services } from './overlay.js';
import { FocusNav } from '../ui/nav.js';
import { setupEligible, cursesUnlocked } from '../ui/RunSetup.js';
import { C, txt, icon, cardCell } from '../ui/kit.js';
import { button, box, glyph, richLine, reduced, actorIcon } from '../ui/draw.js';
import { cat } from '../data/catalog.js';
import { Save } from '../core/save.js';
import { t } from '../core/i18n.js';
import { cardOf } from '../ui/fmt.js';

export class RunEndScene extends Phaser.Scene {
  constructor() { super('run-end'); }

  init(data) {
    const d = data || {};
    // tolerate the Wave-1 shape (summary passed directly)
    this.summary = d.summary || (d.outcome ? d : { outcome: 'abandon', floor: 1, step: 0, kills: 0, timeS: 0, wands: [], relics: [] });
    this.milestones = d.milestones || [];
    this.nextGoals = d.nextGoals || [];
  }

  create() {
    Object.assign(this, services(this));
    this.router.clearHeld();
    this.leaving = false;
    this.root = this.add.container(0, 0);
    this.body = this.add.container(0, 0);
    this.root.add(this.body);
    this.nav = new FocusNav(this, { layer: this.root, isActive: () => !this.leaving, onMove: (it) => this.detailFor(it) });
    this.cameras.main.fadeIn(250, 0, 0, 0);
    this.buildSummary();
  }

  // ======================================================================================= S7
  buildSummary() {
    const s = this, r = this.body, sm = this.summary;
    this.mode = 'summary';
    this.nav.clear();
    r.removeAll(true);
    this.nav.raise();
    const panels = [];
    const head = this.add.container(0, 0); r.add(head); panels.push(head);
    const outcome = ['death', 'victory', 'abandon'].includes(sm.outcome) ? sm.outcome : 'abandon';
    head.add(txt(s, VIEW_W / 2, 22, t(`runend.${outcome}`), 'display', { origin: [0.5, 0.5], color: outcome === 'victory' ? C.gold : outcome === 'death' ? C.error : C.text }));
    if (outcome === 'death' && sm.killer) {
      const k = cat().enemies[sm.killer] || cat().bosses[sm.killer];
      const name = k ? k.name : sm.killer;
      const line = this.add.container(0, 0); head.add(line);
      const tx = txt(s, 0, 40, t('runend.killedBy', { name }), 'T1', { color: C.dim });
      const ic = actorIcon(s, 0, 46, sm.killer, 16) || icon(s, 0, 46, 'enemies', sm.killer, 16);
      const w = tx.width + 20;
      ic.x = VIEW_W / 2 - w / 2 + 8; tx.x = VIEW_W / 2 - w / 2 + 20;
      line.add([ic, tx]);
    } else if (outcome === 'victory') head.add(txt(s, VIEW_W / 2, 40, t('runend.victorySub'), 'T1', { origin: [0.5, 0], color: C.dim }));

    // stats
    const st = this.add.container(0, 0); r.add(st); panels.push(st);
    st.add(box(s, 16, 58, 250, 182, 'dark'));
    st.add(txt(s, 24, 62, t('runend.stats'), 'T2'));
    const floorName = (cat().floorList[(sm.floor || 1) - 1] || {}).name || '';
    const mm = Math.floor((sm.timeS || 0) / 60), ss = Math.floor(sm.timeS || 0) % 60;
    const lo = cat().loadouts[sm.loadoutId];
    const rows = [
      [t('runend.floor'), t('runend.floorVal', { n: sm.floor || 1, step: (sm.step | 0) + 1 })],
      ['', floorName],
      [t('runend.time'), `${mm}:${String(ss).padStart(2, '0')}`],
      [t('runend.kills'), String(sm.kills | 0)],
      [t('runend.coins'), String(sm.coinsEarned | 0)],
      [t('runend.loadout'), lo ? lo.name : (sm.loadoutId || '-')],
      [t('runend.curse'), sm.curseLevel ? String(sm.curseLevel) : '-'],
      [t('runend.seed'), String(sm.seed ?? '-')],
    ];
    rows.forEach(([l, v], i) => { st.add(txt(s, 24, 82 + i * 18, l, 'T1', { color: C.dim })); st.add(txt(s, 258, 82 + i * 18, v, 'T1', { origin: [1, 0], color: l ? C.text : C.dim })); });

    // final wands + relics
    const wp = this.add.container(0, 0); r.add(wp); panels.push(wp);
    wp.add(box(s, 274, 58, 350, 182, 'dark'));
    wp.add(txt(s, 282, 62, t('runend.wands'), 'T2'));
    (sm.wands || []).forEach((w, i) => {
      const y = 84 + i * 30, def = cat().wands[w.id];
      wp.add(icon(s, 290, y + 9, 'wands', w.id, 16));
      w.slots.forEach((cid, k) => wp.add(cardCell(s, 302 + k * 19, y, cardOf(cid), 18)));
      this.nav.add({ id: `w:${i}`, x: 280, y: y - 3, w: 338, h: 24, wand: w, def, onConfirm: () => {} });
    });
    wp.add(txt(s, 282, 176, t('runend.relics', { n: (sm.relics || []).length }), 'T1', { color: C.dim }));
    (sm.relics || []).forEach((rid, i) => {
      const x = 284 + (i % 16) * 20, y = 192 + Math.floor(i / 16) * 20;
      wp.add(icon(s, x + 8, y + 8, 'relics', rid, 16));
      this.nav.add({ id: `r:${i}`, x, y, w: 18, h: 18, relic: rid, onConfirm: () => {} });
    });

    // progress: new unlocks banner + next goals
    const pg = this.add.container(0, 0); r.add(pg); panels.push(pg);
    pg.add(box(s, 16, 246, 608, 62, 'dark'));
    let y = 250;
    if (this.milestones.length) {
      const bn = richLine(s, 24, y, [{ g: 'star' }, ' ', { t: t('runend.newUnlocks', { n: this.milestones.length }), color: C.gold }, '  ', { t: this.milestones.map((m) => m.name).join(' · '), color: C.text }]);
      pg.add(bn);
      this.banner = bn;
      y += 16;
    }
    pg.add(txt(s, 24, y, t('runend.nextGoals'), 'T1', { color: C.dim })); y += 13;
    for (const g of this.nextGoals.slice(0, 2)) {
      const un = unlockNames(g);
      const tx = txt(s, 32, y, t('runend.pair', { a: g.name, b: g.desc }) + (un ? ' ' + t('runend.unlocksArrow', { list: un }) : ''), 'T1', { wrap: 580 });
      pg.add(tx); y += 13;
    }
    if (!this.nextGoals.length) pg.add(txt(s, 32, y, t('runend.allDone'), 'T1', { color: C.dim }));
    this.detail = txt(s, VIEW_W / 2, 314, '', 'T1', { origin: [0.5, 0], color: C.dim });
    r.add(this.detail);

    // buttons
    const btns = [];
    if (this.milestones.length) btns.push({ id: 'b:unlocks', label: t('runend.seeUnlocks'), kind: 'primary', act: () => this.showUnlocks() });
    btns.push({ id: 'b:new', label: t('runend.newRun'), kind: this.milestones.length ? 'button' : 'primary', act: () => this.newRun() });
    btns.push({ id: 'b:title', label: t('runend.title'), act: () => this.toTitle() });
    const bw = 130, x0 = VIEW_W / 2 - (btns.length * (bw + 8) - 8) / 2;
    const bp = this.add.container(0, 0); r.add(bp); panels.push(bp);
    btns.forEach((b, i) => {
      const x = x0 + i * (bw + 8);
      const o = button(s, x, 330, bw, 22, b.label, { kind: b.kind });
      bp.add(o);
      this.nav.add({ id: b.id, x, y: 330, w: bw, h: 22, onFocus: () => o.setFocused(true), onBlur: () => o.setFocused(false),
        onConfirm: () => { o.press(); this.mixer.fire('ui_confirm'); b.act(); }, nav: { up: 'w:0', down: null } });
    });
    this.nav.linkList(btns.map((b) => b.id), 'h', false);
    this.nav.raise();
    this.nav.focus(this.milestones.length && !this.seenUnlocks ? 'b:unlocks' : 'b:new', { silent: true, snap: true });

    // runend-summary: panels stagger in 80 ms (reduced: together, 150 ms); input is live from frame 0
    panels.forEach((p, i) => {
      p.setAlpha(0);
      if (reduced()) this.tweens.add({ targets: p, alpha: 1, duration: 150 });
      else { p.y = 8; this.tweens.add({ targets: p, alpha: 1, y: 0, duration: 200, delay: i * 80, ease: 'Cubic.easeOut', onUpdate: () => { p.y = Math.round(p.y); } }); }
    });
    if (this.banner && !this.seenUnlocks) {
      this.time.delayedCall(reduced() ? 0 : 320, () => {
        this.mixer.fire('ui_unlock');
        if (!reduced() && this.banner.active) { const y0 = this.banner.y; this.banner.y = y0 - 6; this.tweens.add({ targets: this.banner, y: y0, duration: 160, ease: 'Back.easeOut' }); }
      });
    }
  }

  detailFor(it) {
    if (!this.detail || !it) return;
    let s = '';
    if (it.wand) s = t('runend.pair', { a: it.def ? it.def.name : it.wand.id, b: it.wand.slots.filter(Boolean).map((c) => cardOf(c).name).join(', ') || t('runend.emptyWand') });
    else if (it.relic) { const r = cat().relics[it.relic]; s = r ? t('runend.pair', { a: r.name, b: r.desc }) : it.relic; }
    else if (it.unlock) s = it.unlock;
    this.detail.setText(s);
  }

  // ====================================================================================== S7u
  showUnlocks() {
    const s = this, r = this.body;
    this.mode = 'unlocks';
    this.seenUnlocks = true;
    this.nav.clear();
    r.removeAll(true);
    this.nav.raise();
    r.add(box(s, 16, 16, 608, 328, 'ornate'));
    r.add(txt(s, VIEW_W / 2, 24, t('runend.unlocksTitle'), 'T2', { origin: [0.5, 0] }));
    let y = 48;
    const ids = [];
    for (const m of this.milestones) {
      r.add(richLine(s, 32, y, [{ g: 'ok' }, ' ', { t: m.name, color: C.gold }, ' - ', { t: m.desc, color: C.dim }]));
      y += 16;
      for (const [kind, list] of Object.entries(m.unlocks || {})) for (const id of list) {
        if (y > 300) break;
        const rec = recOf(kind, id);
        const iconKind = kind === 'cards' ? (rec && rec.type === 'projectile' ? 'spells' : 'modifiers') : kind;
        if (kind === 'cards' && rec) r.add(cardCell(s, 40, y, rec, 18));
        else if (kind !== 'features' && kind !== 'loadouts') r.add(icon(s, 49, y + 9, iconKind, id, 16));
        else r.add(glyph(s, 44, y + 4, kind === 'loadouts' ? 'hand' : 'star'));
        const name = rec ? rec.name : t(`codex.feature.${id}`);
        const desc = rec ? rec.desc : t(`codex.featureDesc.${id}`);
        const tx = txt(s, 64, y + 3, t('runend.unlockLine', { name, kind: t('runend.kind.' + kind), desc }), 'T1', { wrap: 540 });
        r.add(tx);
        const nid = `u:${ids.length}`; ids.push(nid);
        this.nav.add({ id: nid, x: 36, y, w: 580, h: 20, unlock: `${name}: ${desc}`, onConfirm: () => {} });
        y += Math.max(20, Math.ceil(tx.height) + 4);
      }
      y += 4;
    }
    const b = button(s, VIEW_W / 2 - 60, 316, 120, 22, t('runend.continue'), { kind: 'primary' });
    r.add(b);
    this.nav.add({ id: 'u:continue', x: VIEW_W / 2 - 60, y: 316, w: 120, h: 22, onFocus: () => b.setFocused(true), onBlur: () => b.setFocused(false),
      onConfirm: () => { b.press(); this.closeUnlocks(); } });
    this.nav.linkList([...ids, 'u:continue'], 'v', false);
    this.nav.raise();
    this.nav.focus('u:continue', { silent: true, snap: true });
  }

  closeUnlocks() { this.mixer.fire('ui_back'); this.buildSummary(); this.nav.focus('b:new', { silent: true, snap: true }); }

  // ---------------------------------------------------------------------------------- exits
  newRun() {
    this.registry.remove('run');
    if (setupEligible()) { this.go('title', { openSetup: true }); return; }
    const last = Save.meta.lastLoadout;
    this.go('run', { loadoutId: Save.isUnlocked('loadouts', last) ? last : 'apprentice', curseLevel: cursesUnlocked() ? Save.meta.curseLevel | 0 : 0 });
  }

  toTitle() { this.registry.remove('run'); this.go('title'); }

  go(key, data = {}) {
    if (this.leaving) return;
    this.leaving = true;
    const cam = this.cameras.main;
    cam.once('camerafadeoutcomplete', () => this.scene.start(key, data));
    cam.fadeOut(200, 0, 0, 0);
  }

  update() {
    if (this.leaving) return;
    const ui = this.router.consumeUI();
    for (let i = 0; i < ui.length; i++) {
      const a = ui[i];
      if (this.leaving) break;
      if (a === 'back') { if (this.mode === 'unlocks') this.closeUnlocks(); else { this.mixer.fire('ui_back'); this.toTitle(); } continue; }
      if (a === 'tabPrev' || a === 'tabNext') continue;
      this.nav.handle(a);
    }
  }
}

function recOf(kind, id) {
  const k = cat();
  return kind === 'cards' ? k.cards[id] : kind === 'wands' ? k.wands[id] : kind === 'relics' ? k.relics[id] : kind === 'loadouts' ? k.loadouts[id] : null;
}
function unlockNames(u) {
  const out = [];
  for (const [kind, ids] of Object.entries(u.unlocks || {})) for (const id of ids) { const r = recOf(kind, id); out.push(r ? r.name : t(`codex.feature.${id}`)); }
  return out.join(', ');
}
