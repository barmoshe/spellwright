// ui/GoalsView.js — S1g Goals, a Title sub-panel (screen-graph §9.3; data/unlocks.json; rules.goals).
// One row per goal in the designer's order, 24 px pitch; the NEXT goal row is expanded to 2 lines with
// countable progress, and focus + scroll start on it. Status is shape-coded, never colour-only:
//   done = check · earned (queued payout) = half-filled circle "Earned - reward at your next run's end" ·
//   next = arrow · later = hollow circle. Later goals show their condition; their reward is a silhouette.
// Scrolling is virtual (only rows fully inside the list rect are built), so no mask is needed.

import { C, txt, icon, cardCell } from './kit.js';
import { box, button, glyph, reduced, fitText } from './draw.js';
import { cat } from '../data/catalog.js';
import { Save } from '../core/save.js';
import { t } from '../core/i18n.js';
import { goalsInOrder, goalStatus, goalProgress } from '../run/meta.js';

const L = { x: 24, y: 40, w: 592, h: 292 };
const ROW = 24, NEXT_ROW = 48;

export class GoalsView {
  constructor(scene, root, nav, { onBack }) {
    this.scene = scene; this.nav = nav; this.onBack = onBack;
    this.mixer = scene.registry.get('mixer');
    this.c = scene.add.container(0, 0); root.add(this.c);
    this.goals = goalsInOrder(cat());
    const nextI = this.goals.findIndex((g) => goalStatus(cat(), Save, g) === 'next');
    this.sel = nextI >= 0 ? nextI : 0;
    this.top = 0;
    this.first = true;
    this.prevWheel = nav.onWheel;
    nav.onWheel = (p, dy) => this.step(dy > 0 ? 1 : -1);
    this.build();
  }

  heightOf(i) { return goalStatus(cat(), Save, this.goals[i]) === 'next' ? NEXT_ROW : ROW; }

  /** Scroll so the selected row is fully inside the list rect (screen-graph: focus + scroll start on next). */
  clampTop() {
    let y = 0; for (let i = this.top; i < this.sel; i++) y += this.heightOf(i);
    if (this.sel < this.top) this.top = this.sel;
    while (y + this.heightOf(this.sel) > L.h - 4 && this.top < this.sel) { y -= this.heightOf(this.top); this.top++; }
  }

  build() {
    const s = this.scene, c = this.c, k = cat();
    c.removeAll(true);
    this.nav.clear('gl:');
    this.clampTop();
    c.add(txt(s, 320, 22, t('goals.title'), 'T2', { origin: [0.5, 0] }));
    const done = this.goals.filter((g) => Save.meta.milestones.includes(g.id)).length;
    c.add(txt(s, L.x + L.w, 26, t('goals.count', { n: done, total: this.goals.length }), 'T1', { origin: [1, 0], color: C.dim }));
    c.add(box(s, L.x, L.y, L.w, L.h, 'dark'));
    let y = L.y + 4;
    const rows = [];
    for (let i = this.top; i < this.goals.length; i++) {
      const g = this.goals[i], h = this.heightOf(i);
      if (y + h > L.y + L.h - 2) break;
      const st = goalStatus(k, Save, g);
      const row = s.add.container(0, 0); c.add(row); rows.push(row);
      const x = L.x + 6;
      row.add(statusIcon(s, x, y + 7, st));
      row.add(txt(s, x + 16, y + 6, g.name, 'T1', { color: st === 'later' ? C.dim : st === 'next' ? C.gold : C.text }));
      row.add(txt(s, x + 140, y + 6, st === 'earned' ? t('goals.earned') : g.desc, 'T1', { color: st === 'earned' ? C.gold : C.dim, wrap: 276 }));
      this._reward(row, x + 424, y + 3, g, st);
      if (st === 'next') {
        const pr = goalProgress(g, Save.meta);
        row.add(txt(s, x + 16, y + 26, pr ? t('goals.progress', { cur: pr.cur, need: pr.need }) : t('goals.nextHint'), 'T1', { color: C.dim }));
        const all = rewardNames(g);                                         // the full reward list on line 2
        if (all.length > 1) row.add(txt(s, x + 140, y + 26, t('goals.rewardAll', { list: all.join(', ') }), 'T1', { color: C.gold, wrap: 440 }));
      }
      const id = `gl:${i}`;
      this.nav.add({ id, x: L.x + 2, y, w: L.w - 4, h, noRing: false, onConfirm: () => {}, onFocus: () => { if (this.sel !== i) { this.sel = i; } } });
      y += h;
    }
    // scroll hints
    if (this.top > 0) c.add(glyph(s, L.x + L.w - 14, L.y + 2, 'up'));
    if (this.top + rows.length < this.goals.length) c.add(glyph(s, L.x + L.w - 14, L.y + L.h - 11, 'down'));
    // Back (touch-safe; Esc / B also go back)
    const b = button(s, L.x + L.w - 96, 336, 96, 22, t('setup.back'));
    c.add(b);
    this.nav.add({ id: 'gl:back', x: L.x + L.w - 96, y: 336, w: 96, h: 22, clickOnly: true, onFocus: () => b.setFocused(true), onBlur: () => b.setFocused(false),
      onConfirm: () => this.onBack() });
    this.nav.raise();
    this.nav.focus(`gl:${this.sel}`, { silent: true, snap: true });
    // goals-list motion: rows stagger in on open (≤ 8 staggered); reduced: together
    if (this.first) {
      this.first = false;
      if (!reduced()) rows.forEach((r, i) => { r.setAlpha(0); r.x = -4; s.tweens.add({ targets: r, alpha: 1, x: 0, duration: 160, delay: Math.min(i, 7) * 20, ease: 'Cubic.easeOut', onUpdate: () => { r.x = Math.round(r.x); } }); });
    }
  }

  _reward(row, x, y, g, st) {
    const s = this.scene, k = cat();
    const list = [];
    for (const [kind, ids] of Object.entries(g.unlocks || {})) for (const id of ids) list.push([kind, id]);
    if (!list.length) return;
    const [kind, id] = list[0];
    if (st === 'later') {                         // silhouette + class, no spoiler
      row.add(s.add.graphics().fillStyle(0x151520, 1).fillRect(x, y + 1, 16, 16).lineStyle(1, C.slateDark, 1).strokeRect(x + 0.5, y + 1.5, 15, 15));
      row.add(txt(s, x + 22, y + 3, t('goals.rewardLater', { kind: t(`goals.kind.${kind === 'cards' ? cardClass(k.cards[id]) : kind}`) }), 'T1', { color: C.dim }));
      return;
    }
    if (kind === 'cards' && k.cards[id]) row.add(cardCell(s, x, y, k.cards[id], 18));
    else if (kind === 'wands' || kind === 'relics') row.add(icon(s, x + 8, y + 9, kind, id, 16));
    else row.add(glyph(s, x + 4, y + 5, kind === 'loadouts' ? 'hand' : kind === 'stats' ? 'plus' : 'star'));
    const names = list.map(([kd, i2]) => nameOf(kd, i2));
    const rt = txt(s, x + 22, y + 3, names.length > 1 ? `${names[0]} +${names.length - 1}` : names[0], 'T1', { color: st === 'done' ? C.text : C.gold });
    fitText(rt, 140);
    row.add(rt);
  }

  step(d) {
    const n = Math.max(0, Math.min(this.goals.length - 1, this.sel + d));
    if (n === this.sel) return;
    this.sel = n; this.mixer.fire('ui_move');
    this.build();
  }

  /** Title forwards UI intents; up/down move through ALL goals (rows off-screen included). */
  handle(a) {
    if (a === 'up') { this.step(-1); return true; }
    if (a === 'down') { this.step(1); return true; }
    if (a === 'left' || a === 'right' || a === 'confirm') return true;
    return false;
  }

  destroy() { this.nav.onWheel = this.prevWheel || null; this.nav.clear('gl:'); if (this.c.active) this.c.destroy(); }
}

function statusIcon(s, x, y, st) {
  if (st === 'done') return glyph(s, x, y, 'ok');
  if (st === 'next') return glyph(s, x, y, 'arrow', C.gold);
  const g = s.add.graphics();
  if (st === 'earned') {   // half-filled circle (◐): the left half filled
    g.fillStyle(C.stroke, 1).fillCircle(x + 4.5, y + 4.5, 4.5);
    g.fillStyle(C.gold, 1).slice(x + 4.5, y + 4.5, 3.5, Math.PI / 2, Math.PI * 1.5, false).fillPath();
    g.lineStyle(1, C.gold, 1).strokeCircle(x + 4.5, y + 4.5, 3.5);
  } else g.lineStyle(1, C.slateLight, 1).strokeCircle(x + 4.5, y + 4.5, 3.5);   // hollow circle (○)
  return g;
}

function rewardNames(g) {
  const out = [];
  for (const [kind, ids] of Object.entries(g.unlocks || {})) for (const id of ids) out.push(nameOf(kind, id));
  return out;
}
const cardClass = (c) => (!c ? 'cards' : c.type === 'projectile' ? 'spell' : 'modifier');
function nameOf(kind, id) {
  const k = cat();
  if (kind === 'stats') return t(`goals.stat.${id.stat}`, { n: id.add });
  const rec = kind === 'cards' ? k.cards[id] : kind === 'wands' ? k.wands[id] : kind === 'relics' ? k.relics[id] : kind === 'loadouts' ? k.loadouts[id] : null;
  return rec ? rec.name : t(`codex.feature.${id}`);
}
