// CreditsScene — S8 (screen-graph §3, §6). Renders assets/credits.json (TA-owned; registry 'credits'),
// never hand-typed strings: CC-BY lines are printed verbatim. Centred 400 px column, section heads T2,
// body T1, URLs as text. Manual scroll only (reduced-motion safe): up/down 12 px, LB/RB or
// PgUp/PgDn one page, mouse wheel. back → Title.
//
// Accepted credits.json shapes (the TA's file is authoritative; this reader is tolerant):
//   { sections:[{ title, lines:[string | {text}|{title,author,license,url,attribution}] }] }
//   { entries:[{ section?, title|name, author, license, url, attribution? }] }   (grouped by section)

import { hintLine } from '../ui/HudKit.js';
import Phaser from '../../lib/phaser.esm.min.js';
import { VIEW_W, VIEW_H } from '../config.js';
import { services } from './overlay.js';
import { ExtraKeys } from '../ui/extraKeys.js';
import { C, txt } from '../ui/kit.js';
import { box } from '../ui/draw.js';
import { t } from '../core/i18n.js';

const COL_W = 400, TOP = 30, BOTTOM = 330;

function entryLine(e) {
  if (typeof e === 'string') return e;
  if (e.attribution) return e.attribution;
  if (e.text) return e.text;
  return [e.title || e.name, e.author, e.license, e.url].filter(Boolean).join(' · ');
}

export function creditSections(c) {
  if (!c) return null;
  if (Array.isArray(c.sections)) return c.sections.map((s) => ({ title: s.title || s.name || '', lines: (s.lines || s.entries || []).map(entryLine) }));
  const list = Array.isArray(c.entries) ? c.entries : Array.isArray(c) ? c : null;
  if (!list) return null;
  const by = new Map();
  for (const e of list) { const k = e.section || e.category || e.kind || ''; if (!by.has(k)) by.set(k, []); by.get(k).push(entryLine(e)); }
  return [...by].map(([title, lines]) => ({ title, lines }));
}

export class CreditsScene extends Phaser.Scene {
  constructor() { super('credits'); }

  create() {
    Object.assign(this, services(this));
    this.router.clearHeld();
    this.leaving = false;
    this.cameras.main.fadeIn(250, 0, 0, 0);
    box(this, VIEW_W / 2 - COL_W / 2 - 12, 4, COL_W + 24, 352, 'ornate');
    txt(this, VIEW_W / 2, 10, t('credits.title'), 'T2', { origin: [0.5, 0] });
    this.col = this.add.container(0, 0);
    this.lines = [];
    let y = 0;
    const add = (s, role, color) => { const o = txt(this, VIEW_W / 2, y, s, role, { origin: [0.5, 0], wrap: COL_W, align: 'center', color }); this.col.add(o); this.lines.push(o); y += Math.ceil(o.height) + (role === 'T2' ? 6 : 3); };
    add(t('credits.studio'), 'T2', C.gold); y += 6;
    const secs = creditSections(this.registry.get('credits'));
    if (!secs) { add(t('credits.pending'), 'T1', C.warn); console.warn('[credits] assets/credits.json not loaded (TA deliverable) — S8 requires it'); }
    else for (const s of secs) { if (s.title) add(s.title, 'T2', C.text); for (const l of s.lines) add(l, 'T1', C.dim); y += 8; }
    this.contentH = y;
    this.scroll = 0;
    this.layout();
    this.buildHint();
    this.extra = new ExtraKeys(this, () => !this.leaving, { keys: { PageUp: 'pageUp', PageDown: 'pageDown' }, pad: {} });
    this.input.on('wheel', (p, o, dx, dy) => this.scrollBy(dy > 0 ? 24 : -24));
    this.input.on('pointerdown', (p) => { if (p.button === 2) this.back(); });
  }

  /** G10 footer: rebuilt whenever the prompt family changes (controller-prompts §4). */
  buildHint() {
    if (this.hint) this.hint.destroy();
    const fam = this._fam = this.router.promptFamily;
    this.hint = hintLine(this, VIEW_W / 2, 342, t(fam === 'kbm' ? 'credits.hintKb' : 'credits.hintPad'), this.router, { align: 'center' });
  }

  /** Cull lines outside the visible band (no mask: masks break batching). */
  layout() {
    this.col.y = TOP - this.scroll;
    for (const o of this.lines) { const y = o.y + this.col.y; o.setVisible(y >= TOP - 2 && y + o.height <= BOTTOM + 2); }
  }

  scrollBy(d) {
    const max = Math.max(0, this.contentH - (BOTTOM - TOP));
    const n = Math.max(0, Math.min(max, this.scroll + d));
    if (n !== this.scroll) { this.scroll = n; this.layout(); }
  }

  back() {
    if (this.leaving) return;
    this.leaving = true;
    this.mixer.fire('ui_back');
    this.cameras.main.once('camerafadeoutcomplete', () => this.scene.start('title'));
    this.cameras.main.fadeOut(200, 0, 0, 0);
  }

  update() {
    if (this.leaving) return;
    if (this.router.promptFamily !== this._fam) this.buildHint();
    const page = BOTTOM - TOP - 24;
    for (const a of this.extra.consume()) this.scrollBy(a === 'pageUp' ? -page : page);
    const ui = this.router.consumeUI();
    for (let i = 0; i < ui.length; i++) {
      const a = ui[i];
      if (a === 'back') { this.back(); return; }
      if (a === 'up') this.scrollBy(-12);
      else if (a === 'down') this.scrollBy(12);
      else if (a === 'tabPrev') this.scrollBy(-page);
      else if (a === 'tabNext') this.scrollBy(page);
    }
  }
}
