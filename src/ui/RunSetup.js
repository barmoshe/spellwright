// ui/RunSetup.js — S1a Run Setup (screen-graph §1, §3; progression-and-pacing §7). A Title sub-panel.
// Row 1: loadout cards (locked ones state their milestone condition, never "???") · Row 2: curse
// level 0–3 (only once curses are unlocked) · Row 3: Begin (default focus; last-used loadout pre-selected).

import { C, txt, icon, cardCell } from './kit.js';
import { box, button, glyph, richLine } from './draw.js';
import { cat } from '../data/catalog.js';
import { Save } from '../core/save.js';
import { t } from '../core/i18n.js';
import { cardOf } from './fmt.js';

export const cursesUnlocked = () => Save.isUnlocked('features', 'curses');
export function setupEligible() {
  const unlocked = cat().loadoutList.filter((l) => Save.isUnlocked('loadouts', l.id)).length;
  return unlocked >= 2 || cursesUnlocked();
}

export class RunSetup {
  /** onBegin({loadoutId, curseLevel}), onBack() */
  constructor(scene, root, nav, { onBegin, onBack }) {
    this.scene = scene; this.nav = nav; this.onBegin = onBegin; this.onBack = onBack;
    this.mixer = scene.registry.get('mixer');
    this.c = scene.add.container(0, 0); root.add(this.c);
    const list = cat().loadoutList;
    this.list = list;
    const last = list.find((l) => l.id === Save.meta.lastLoadout && Save.isUnlocked('loadouts', l.id));
    this.sel = last ? last.id : 'apprentice';
    this.curses = cursesUnlocked();
    this.curse = this.curses ? Save.meta.curseLevel | 0 : 0;
    this.build();
    nav.focus('su:begin', { silent: true, snap: true });
  }

  build() {
    const s = this.scene, c = this.c;
    c.removeAll(true);
    this.nav.clear('su:');
    c.add(box(s, 16, 40, 608, 300, 'ornate'));
    c.add(txt(s, 320, 48, t('setup.title'), 'T2', { origin: [0.5, 0] }));
    c.add(txt(s, 32, 66, t('setup.loadout'), 'T1', { color: C.dim }));
    const n = this.list.length, W = 138, gap = 8, x0 = Math.round((640 - (n * W + (n - 1) * gap)) / 2);
    const ids = [];
    this.list.forEach((lo, i) => {
      const x = x0 + i * (W + gap), y = 80;
      const unlocked = Save.isUnlocked('loadouts', lo.id);
      const on = lo.id === this.sel;
      const g = s.add.graphics(); c.add(g);
      g.fillStyle(C.stroke, 1).fillRect(x, y, W, 130).fillStyle(unlocked ? C.panel : 0x1f1f2a, 1).fillRect(x + 1, y + 1, W - 2, 128);
      g.lineStyle(on ? 2 : 1, on ? C.gold : C.slateDark, 1).strokeRect(x + (on ? 1 : 1.5), y + (on ? 1 : 1.5), W - (on ? 2 : 3), 128 - (on ? 0 : 1));
      if (on) c.add(glyph(s, x + W - 13, y + 4, 'ok'));
      c.add(txt(s, x + 8, y + 6, lo.name, 'T2', { color: unlocked ? C.text : C.disabled }));
      if (unlocked) {
        lo.wands.forEach((w, k) => {
          c.add(icon(s, x + 16, y + 38 + k * 22, 'wands', w.wandId, 16));
          w.cards.forEach((cid, j) => c.add(cardCell(s, x + 28 + j * 19, y + 29 + k * 22, cardOf(cid), 18)));
        });
        c.add(txt(s, x + 8, y + 82, lo.desc, 'T1', { color: C.dim, wrap: W - 16 }));
      } else {
        c.add(glyph(s, x + 8, y + 30, 'lock'));
        const ms = cat().unlocks.find((u) => (u.unlocks.loadouts || []).includes(lo.id));
        c.add(txt(s, x + 8, y + 44, ms ? t('setup.lockedBy', { cond: ms.desc, name: ms.name }) : t('setup.locked'), 'T1', { color: C.dim, wrap: W - 16 }));
      }
      const id = `su:l:${i}`; ids.push(id);
      this.nav.add({ id, x, y, w: W, h: 130, disabled: !unlocked, onConfirm: () => this.pick(lo.id), onDenied: () => this.mixer.fire('ui_denied'),
        nav: { up: null, down: this.curses ? 'su:curse' : 'su:begin' } });
    });
    this.nav.linkList(ids, 'h', false);
    // curse row
    if (this.curses) {
      c.add(txt(s, 32, 222, t('setup.curse'), 'T1', { color: C.dim }));
      const cx = 200;
      c.add(richLine(s, cx, 222, [t('setup.curseLevel', { n: this.curse }), '   ', { t: this.curse ? t(`setup.curseDesc.${this.curse}`) : t('setup.curseNone'), color: C.dim }]));
      this.nav.add({ id: 'su:curse', x: 190, y: 218, w: 420, h: 18, onLeft: () => this.setCurse(-1), onRight: () => this.setCurse(1), onConfirm: () => this.setCurse(1),
        nav: { up: ids[0], down: 'su:begin' } });
    }
    const b = button(s, 250, 290, 140, 24, t('setup.begin'), { kind: 'primary' });
    const bk = button(s, 400, 290, 90, 24, t('setup.back'));
    c.add([b, bk]);
    this.nav.add({ id: 'su:begin', x: 250, y: 290, w: 140, h: 24, onFocus: () => b.setFocused(true), onBlur: () => b.setFocused(false),
      onConfirm: () => { b.press(); this.begin(); }, nav: { up: this.curses ? 'su:curse' : ids[Math.max(0, this.list.findIndex((l) => l.id === this.sel))], right: 'su:back', left: null, down: null } });
    this.nav.add({ id: 'su:back', x: 400, y: 290, w: 90, h: 24, onFocus: () => bk.setFocused(true), onBlur: () => bk.setFocused(false),
      onConfirm: () => this.onBack(), nav: { left: 'su:begin', up: 'su:begin', right: null, down: null } });
    this.nav.raise();
  }

  pick(id) {
    if (id === this.sel) return;
    this.sel = id; this.mixer.fire('ui_confirm');
    const cur = this.nav.current;
    this.build();
    if (cur && this.nav.has(cur)) this.nav.focus(cur, { silent: true, snap: true });
  }

  setCurse(d) {
    const n = Math.max(0, Math.min(3, this.curse + d));
    if (n === this.curse) { this.mixer.fire('ui_denied'); return; }
    this.curse = n; this.mixer.fire('ui_move');
    this.build(); this.nav.focus('su:curse', { silent: true, snap: true });
  }

  begin() {
    Save.setMeta('lastLoadout', this.sel);
    Save.setMeta('curseLevel', this.curse);
    this.onBegin({ loadoutId: this.sel, curseLevel: this.curse });
  }

  destroy() { this.nav.clear('su:'); if (this.c.active) this.c.destroy(); }
}
