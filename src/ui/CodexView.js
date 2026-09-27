// ui/CodexView.js — shared Codex (S1b from Title, S3c as a Pause tab; screen-graph §1, §3).
// Categories: Cards · Relics · Enemies · Reactions · Milestones. Undiscovered entries show a
// silhouette and "Not yet found"; milestones always show their condition (progression §7).
// Read-only everywhere. Category tabs are focusables (top row); on Title, Q/E / LB/RB also switch.

import { C, txt, icon, cardCell } from './kit.js';
import { box, glyph, richLine, actorIcon } from './draw.js';
import { cat } from '../data/catalog.js';
import { Save } from '../core/save.js';
import { t } from '../core/i18n.js';
import { cardRows, modifierLines, typeWord, rarityWord } from './fmt.js';

const CATS = ['cards', 'relics', 'enemies', 'reactions', 'milestones'];
const REACTIONS = ['melt', 'overload', 'blight', 'superconduct', 'quench'];
const GX = 16, GY = 50, GP = 38, COLS = 9;

export class CodexView {
  /** opts: { inPause, revealAll, x0 } */
  constructor(scene, root, nav, opts = {}) {
    this.scene = scene; this.root = root; this.nav = nav; this.opts = { ...opts };
    if (typeof location !== 'undefined' && /[?&]harness=/.test(location.search) && /[?&]reveal\b/.test(location.search)) this.opts.revealAll = true;   // dev harness aid
    this.mixer = scene.registry.get('mixer');
    this.cat = opts.category || 'cards';
    this.c = scene.add.container(0, 0);
    root.add(this.c);
    this.frame = scene.add.container(0, 0);
    this.c.add(this.frame);
    this.frame.add(box(scene, 8, 24, 360, 316, 'dark'));
    this.frame.add(box(scene, 376, 24, 256, 316, 'dark'));
    this.tabs = scene.add.container(0, 0); this.grid = scene.add.container(0, 0); this.detail = scene.add.container(0, 0);
    this.c.add([this.tabs, this.grid, this.detail]);
    this.build();
  }

  known(kind, id) {
    if (this.opts.revealAll) return true;
    if (kind === 'milestones') return true;
    if (kind === 'reactions') return Save.meta.reactionsSeen.includes(id) || Save.isDiscovered('reactions', id);
    return Save.isDiscovered(kind, id);
  }

  entries(kind) {
    const k = cat();
    if (kind === 'cards') return k.cardList.map((c) => ({ id: c.id, rec: c }));
    if (kind === 'relics') return k.relicList.map((r) => ({ id: r.id, rec: r }));
    if (kind === 'enemies') return [...Object.values(k.enemies), ...Object.values(k.bosses)].map((e) => ({ id: e.id, rec: e }));
    if (kind === 'reactions') return REACTIONS.map((id) => ({ id, rec: { id, name: t(`codex.reaction.${id}`), desc: t(`codex.reactionDesc.${id}`) } }));
    return k.unlocks.map((u) => ({ id: u.id, rec: u }));
  }

  build() {
    const s = this.scene;
    this.tabs.removeAll(true); this.grid.removeAll(true);
    this.nav.clear('cx:');
    // category tabs
    const tw = 70;
    CATS.forEach((k, i) => {
      const x = 12 + i * tw, y = 28;
      const on = k === this.cat;
      const n = k === 'milestones' ? Save.meta.milestones.length : this.entries(k).filter((e) => this.known(k, e.id)).length, tot = this.entries(k).length;
      const tx = txt(s, x + tw / 2, y + 1, t(`codex.cat.${k}`), 'T1', { origin: [0.5, 0], color: on ? C.text : C.dim });
      this.tabs.add(tx);
      this.tabs.add(txt(s, x + tw / 2, y + 12, `${n}/${tot}`, 'Tsmall', { origin: [0.5, 0], color: C.dim }));
      if (on) this.tabs.add(s.add.rectangle(x + 8, y + 20, tw - 16, 2, C.gold).setOrigin(0));
      this.nav.add({ id: `cx:t:${k}`, x, y, w: tw, h: 20, onConfirm: () => this.setCat(k),
        nav: { down: 'cx:e:0', up: null } });
    });
    this.nav.linkList(CATS.map((k) => `cx:t:${k}`), 'h', false);
    // entry grid
    const list = this.entries(this.cat);
    this.list = list;
    list.forEach((e, i) => {
      const x = GX + (i % COLS) * GP, y = GY + 12 + Math.floor(i / COLS) * GP;
      const known = this.known(this.cat, e.id);
      this.grid.add(this.cellFor(e, x, y, known));
      const col = i % COLS, row = Math.floor(i / COLS);
      this.nav.add({ id: `cx:e:${i}`, x, y, w: 36, h: 36, codex: e, onConfirm: () => {},
        nav: { up: row === 0 ? `cx:t:${this.cat}` : `cx:e:${i - COLS}`, down: i + COLS < list.length ? `cx:e:${i + COLS}` : null,
          left: col > 0 ? `cx:e:${i - 1}` : null, right: col < COLS - 1 && i + 1 < list.length ? `cx:e:${i + 1}` : null } });
    });
    this.nav.raise();
    if (!this.nav.current || !this.nav.has(this.nav.current)) this.nav.focus(`cx:t:${this.cat}`, { silent: true, snap: true });
    this.showDetail(this.nav.cur());
  }

  cellFor(e, x, y, known) {
    const s = this.scene, k = this.cat;
    const c = s.add.container(x, y);
    const g = s.add.graphics().fillStyle(C.stroke, 1).fillRect(0, 0, 36, 36).fillStyle(C.panel, 1).fillRect(1, 1, 34, 34);
    c.add(g);
    if (!known) { c.add(txt(s, 18, 18, '?', 'T2', { origin: [0.5, 0.5], color: C.disabled })); return c; }
    if (k === 'cards') { c.add(cardCell(s, 0, 0, e.rec, 36)); return c; }
    if (k === 'relics') c.add(icon(s, 18, 18, 'relics', e.id, 32));
    else if (k === 'enemies') c.add(actorIcon(s, 18, 18, e.id, 32) || icon(s, 18, 18, 'enemies', e.id, 32));
    else if (k === 'reactions') c.add(txt(s, 18, 18, e.rec.name.slice(0, 2), 'T1', { origin: [0.5, 0.5], color: C.warn }));
    else {
      const got = Save.meta.milestones.includes(e.id);
      c.add(glyph(s, 13, 13, got ? 'ok' : 'lock'));
    }
    return c;
  }

  setCat(k) {
    if (k === this.cat) return;
    this.cat = k;
    this.mixer.fire('ui_tab');
    this.build();
    this.nav.focus(`cx:t:${k}`, { silent: true, snap: true });
  }

  onFocus(it) { if (it && it.id.startsWith('cx:')) this.showDetail(it); }

  showDetail(it) {
    const s = this.scene, d = this.detail;
    d.removeAll(true);
    const x = 386, W = 236;
    let y = 32;
    const line = (str, color = C.text, role = 'T1') => { const o = txt(s, x, y, str, role, { color, wrap: W }); d.add(o); y += Math.max(12, Math.ceil(o.height) + 1); return o; };
    if (!it || !it.codex) { line(t(`codex.cat.${this.cat}`), C.text, 'T2'); line(t('codex.primer'), C.dim); return; }
    const e = it.codex, k = this.cat, r = e.rec;
    if (!this.known(k, e.id)) { line(t('codex.notFound'), C.dim, 'T2'); if (k === 'cards' || k === 'relics') line(rarityWord(r.rarity), C.dim); return; }
    if (k === 'milestones') {
      const got = Save.meta.milestones.includes(e.id);
      d.add(richLine(s, x, y, [{ g: got ? 'ok' : 'lock' }, ' ', r.name], { role: 'T2' })); y += 16;
      line(r.desc, C.dim);
      const un = [];
      for (const [kind, ids] of Object.entries(r.unlocks || {})) for (const id of ids) un.push(nameOf(kind, id));
      if (un.length) line(t('codex.unlocks', { list: un.join(', ') }));
      line(got ? t('codex.achieved') : t('codex.notYet'), got ? C.ok : C.dim);
      return;
    }
    line(r.name, C.text, 'T2');
    if (k === 'cards') {
      line(`${typeWord(r)} · ${rarityWord(r.rarity)}`, C.dim);
      for (const [l, v] of cardRows(r)) { d.add(txt(s, x, y, l, 'T1', { color: C.dim })); d.add(txt(s, x + W, y, v, 'T1', { origin: [1, 0] })); y += 12; }
      if (r.type !== 'projectile') for (const l of modifierLines(r)) line(l);
      y += 4; line(r.desc, C.dim);
    } else if (k === 'relics') { line(rarityWord(r.rarity), C.rar[r.rarity] ?? C.dim); line(r.desc); }
    else if (k === 'enemies') { if (r.title) line(r.title, C.dim); line(r.desc || '', C.dim); if (r.hp) line(t('codex.hp', { n: r.hp })); }
    else line(r.desc);
  }

  /** Title context: Q/E (tabPrev/tabNext) switch categories. Returns true if consumed. */
  handle(a) {
    if (this.opts.inPause) return false;
    if (a === 'tabPrev' || a === 'tabNext') {
      const i = CATS.indexOf(this.cat), d = a === 'tabNext' ? 1 : CATS.length - 1;
      this.setCat(CATS[(i + d) % CATS.length]);
      return true;
    }
    return false;
  }

  destroy() { this.nav.clear('cx:'); if (this.c.active) this.c.destroy(); }
}

function nameOf(kind, id) {
  const k = cat();
  const rec = kind === 'cards' ? k.cards[id] : kind === 'wands' ? k.wands[id] : kind === 'relics' ? k.relics[id] : kind === 'loadouts' ? k.loadouts[id] : null;
  return rec ? rec.name : t(`codex.feature.${id}`);
}
