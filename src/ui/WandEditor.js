// ui/WandEditor.js — Pause → Wands tab (wand-editor-ux.md). The player writes the program here; the
// editor's one job: the player can PREDICT what the wand will fire before closing it.
//
// Ownership: RunState owns every card (edits go through getCell/setCell/swapCells/salvage/discard);
// this class owns only view state: the selected wand, the HELD card {id, origin|null}, focus, scroll.
// A held card WITH an origin stays in its origin cell in RunState (drawn as a ghost) until it is
// placed — so placement is one swapCells (the only semantic, §3.4) and "back" costs nothing.
// A held card with NO origin (a reward Take) lives only here until placed.
//
// Snapshot/commit are owned by PauseScene (taken on open, commitEdits(snap) on close); Revert = revert(snap).
// Rebuilds happen on change only (edit, wand select, focus while holding) — never per frame.

import { C, txt, cardCell, icon, cardKind, setColor } from './kit.js';
import { glyph, richLine, fitText, button, reduced, box, deniedMotion } from './draw.js';
import { Dialog } from './Dialog.js';
import { cat } from '../data/catalog.js';
import { t } from '../core/i18n.js';
import { EV } from '../core/events.js';
import { Save } from '../core/save.js';
import { SYM, pmDeg, initSymbols, sec, sec2, num, cardOf, cardName, typeWord, rarityWord, cardRows, modifierLines, castShotsText, castDetailLines, warningText } from './fmt.js';

const SLOT_X = 137, SLOT_Y = 42, PITCH = 38, CELL = 36;
const BAG_X = 137, BAG_Y = 116;
const PV_X = 136, PV_Y = 210, PV_PITCH = 17, PV_LINES = 5;
const C_X = 528, C_Y = 22, C_W = 104, C_H = 318;
const same = (a, b) => a && b && a.wand === b.wand && a.slot === b.slot;
const locKey = (l) => (l.wand === 'bag' ? `b:${l.slot}` : `s:${l.slot}`);

export class WandEditor {
  /**
   * @param {Phaser.Scene} scene   PauseScene
   * @param {Phaser.GameObjects.Container} root  the tab content container
   * @param {FocusNav} nav
   * @param {{snap, heldCard?:string}} o
   */
  constructor(scene, root, nav, o) {
    this.scene = scene; this.root = root; this.nav = nav;
    initSymbols(scene);
    const reg = scene.registry;
    this.run = reg.get('run'); this.bus = reg.get('bus'); this.mixer = reg.get('mixer'); this.router = reg.get('router');
    this.snap = o.snap;
    this.sel = Math.min(o.sel ?? this.run.activeWand, this.run.wands.length - 1);
    this.held = o.heldCard ? { id: o.heldCard, origin: null, fromReward: true } : null;
    this.coach = !!(o.heldCard && cardOf(o.heldCard) && cardOf(o.heldCard).type !== 'projectile' && !Save.flag('slotModifier'));
    this.pvScroll = 0; this.cScroll = 0;
    this.reason = null;          // transient reason line in C ("Wand is full")
    this.pointerMode = false;
    this.cellObjs = {};
    this.lastFocus = null;

    // layers (draw order): static frames → regions → overlay → held card
    this.cStatic = scene.add.container(0, 0);
    this.cA = scene.add.container(0, 0); this.cA2 = scene.add.container(0, 0);
    this.cB = scene.add.container(0, 0); this.cBag = scene.add.container(0, 0); this.cSalv = scene.add.container(0, 0);
    this.cPrev = scene.add.container(0, 0); this.cC = scene.add.container(0, 0); this.cFoot = scene.add.container(0, 0);
    this.over = scene.add.graphics();
    this.cHeld = scene.add.container(0, 0);
    root.add([this.cStatic, this.cA, this.cA2, this.cB, this.cBag, this.cSalv, this.cPrev, this.cC, this.cFoot, this.over]);
    nav.raise();
    root.add(this.cHeld);

    this.buildStatic();
    this.inCombat = this.probeCombat();
    this.recompute();
    this.rebuildAll();

    // entry focus (§3.5)
    const w = this.run.wands[this.sel];
    if (this.held) {
      const fe = w ? this.run.firstEmptySlot(this.sel) : -1;
      this.nav.focus(`s:${fe >= 0 ? fe : 0}`, { silent: true, snap: true });
      this.pulseSlot(fe >= 0 ? fe : 0);
    } else if (w) {
      this.nav.focus(`s:${this.nextSlot()}`, { silent: true, snap: true });
    }
    this.drawHeld();
    this.onFocus(this.nav.cur());

    // mouse: drag-drop, sticky pick, quick move (§3.1)
    nav.onPointerDown = (p) => this.pointerDown(p);
    nav.onPointerMove = (p) => this.pointerMove(p);
    nav.onPointerUp = (p) => this.pointerUp(p);
    nav.onWheel = (p, dy) => this.wheel(p, dy);

    this.bus.emit(EV.FTUE, 'editor-opened');
    if (!o.heldCard) Save.setFlag('editorOpened');
  }

  // ======================================================================================== model
  probeCombat() {
    try { const rs = this.scene.scene.get('run'); const pr = rs && rs.hudProbe && rs.hudProbe(); return !!(pr && pr.room && pr.room.inCombat); }
    catch (e) { return false; }
  }
  wand(i = this.sel) { return this.run.wands[i]; }
  hasAlways(i = this.sel) { const w = this.wand(i); return !!(w && (w.def.alwaysCast || []).length); }
  slotX(k) { return SLOT_X + (this.hasAlways() ? PITCH : 0) + k * PITCH; }
  cellXY(loc) { return loc.wand === 'bag' ? { x: BAG_X + (loc.slot % 6) * PITCH, y: BAG_Y + Math.floor(loc.slot / 6) * PITCH } : { x: this.slotX(loc.slot), y: SLOT_Y }; }
  locOf(id) {
    if (id.startsWith('s:')) return { wand: this.sel, slot: +id.slice(2) };
    if (id.startsWith('b:')) return { wand: 'bag', slot: +id.slice(2) };
    return null;
  }
  nextSlot() {
    const st = this.wand().state;
    if (!st.order.length) return 0;
    return st.order[st.cursor < st.order.length ? st.cursor : 0];
  }
  changed(i) { return this.run.isWandChanged(i, this.snap); }

  /** Preview of the current state (recomputed on every edit). */
  recompute() {
    this.pv = this.wand() ? this.run.preview(this.sel) : null;
  }

  /** Hypothetical slots of the selected wand if the held card were dropped on `target`, or null. */
  hypoSlots(target) {
    const h = this.held; if (!h || !target || !this.wand()) return null;
    const sel = this.sel;
    const cur = this.wand().state.slots.slice();
    const before = cur.join('|');
    if (target.kind === 'cell') {
      const loc = target.loc;
      if (h.origin) {
        if (same(h.origin, loc)) return null;
        const atB = this.run.getCell(loc);
        if (h.origin.wand === sel) cur[h.origin.slot] = atB;
        if (loc.wand === sel) cur[loc.slot] = h.id;
      } else if (loc.wand === sel) cur[loc.slot] = h.id;
    } else if (target.kind === 'wand') {
      const fe = this.run.firstEmptySlot(target.i);
      if (fe < 0) return null;
      if (h.origin && h.origin.wand === sel) cur[h.origin.slot] = null;
      if (target.i === sel) cur[fe] = h.id;
    } else if (target.kind === 'salv') {
      if (h.origin && h.origin.wand === sel) cur[h.origin.slot] = null;
    }
    return cur.join('|') === before ? null : cur;
  }

  targetOf(id) {
    if (!id) return null;
    if (id.startsWith('s:') || id.startsWith('b:')) return { kind: 'cell', loc: this.locOf(id) };
    if (id.startsWith('w:')) { const i = +id.slice(2); return i < this.run.wands.length ? { kind: 'wand', i } : null; }
    if (id === 'salv') return { kind: 'salv' };
    return null;
  }

  // ======================================================================================== static
  buildStatic() {
    const s = this.scene, c = this.cStatic;
    // region grounds: text never sits on the live game (accessibility-spec §2.2: text on the #2a2a3a panel)
    c.add(box(s, 4, 20, 128, 322, 'dark'));
    c.add(box(s, 132, 20, 392, 322, 'dark'));
    c.add(txt(s, 8, 184, t('editor.wandStats'), 'Tsmall', { color: C.dim }));
    c.add(box(s, C_X, C_Y, C_W, C_H, 'dark'));
    c.add(box(s, 380, 116, 136, 74, 'danger'));
    c.add(glyph(s, 386, 122, 'coin'));
    c.add(txt(s, 398, 121, t('editor.salvage'), 'T1'));
    c.add(txt(s, 138, 196, t('editor.previewHead'), 'T1', { color: C.dim }));
    c.add(s.add.graphics().fillStyle(C.slateDark, 1).fillRect(136, 206, 384, 1).fillRect(136, 298, 384, 1));
    this.nav.add({ id: 'salv', x: 380, y: 116, w: 136, h: 74, onConfirm: () => this.confirmOn('salv'),
      nav: { left: 'b:5', up: () => `s:${Math.max(0, this.wand() ? this.wand().def.capacity - 1 : 0)}`, down: () => (this.nav.has('p:0') ? 'p:0' : 'revert') } });
  }

  // ======================================================================================== build
  /** Rebuild every region; the focused id survives (its item object is replaced by the rebuild). */
  rebuildAll() {
    const cur = this.nav.current;
    this.buildWands(); this.buildStats(); this.buildSlots(); this.buildBag(); this.buildSalvage(); this.buildPreview(); this.buildFooter();
    if (cur && this.nav.has(cur)) { this.nav.current = cur; this.nav.refresh(); }
    this.buildDetail();
    this.nav.raise();
    this.root.bringToTop(this.cHeld);
    this.drawTargetOverlay();
  }

  buildWands() {
    const s = this.scene, c = this.cA;
    c.removeAll(true);
    this.nav.clear('w:');
    const slots = Math.max(this.run.wandSlots, this.run.wands.length);
    for (let i = 0; i < slots; i++) {
      const x = 8, y = 22 + i * 42;
      const w = this.run.wands[i];
      const g = s.add.graphics();
      c.add(g);
      if (!w) {
        g.lineStyle(1, C.dim, 1);
        for (let k = 2; k < 118; k += 6) { g.lineBetween(x + k, y + 0.5, x + k + 3, y + 0.5); g.lineBetween(x + k, y + 39.5, x + k + 3, y + 39.5); }
        for (let k = 2; k < 38; k += 6) { g.lineBetween(x + 0.5, y + k, x + 0.5, y + k + 3); g.lineBetween(x + 119.5, y + k, x + 119.5, y + k + 3); }
        c.add(txt(s, x + 60, y + 20, t('editor.emptyWandSlot'), 'T1', { origin: [0.5, 0.5], color: C.disabled }));
        continue;
      }
      const selected = i === this.sel;
      g.fillStyle(C.stroke, 1).fillRect(x, y, 120, 40).fillStyle(C.panel, 1).fillRect(x + 1, y + 1, 118, 38);
      if (selected) {
        g.lineStyle(2, C.text, 1).strokeRect(x + 1, y + 1, 118, 38);
        g.fillStyle(C.text, 1).fillRect(x + 120, y + 19, 8, 2);           // connector to region B
      } else g.lineStyle(1, C.slateDark, 1).strokeRect(x + 1.5, y + 1.5, 117, 37);
      c.add(icon(s, x + 20, y + 20, 'wands', w.id, 32));
      c.add(txt(s, x + 40, y + 3, w.def.name, 'T1', { wrap: 76 }));
      const filled = w.state.slots.filter(Boolean).length;
      c.add(txt(s, x + 40, y + 30, this.changed(i) ? `${filled}/${w.def.capacity}` : t('editor.slotsFill', { n: filled, cap: w.def.capacity }), 'Tsmall', { color: C.dim }));
      if (i === this.run.activeWand) c.add(glyph(s, x + 109, y + 2, 'hand'));
      if (this.changed(i)) c.add(richLine(s, x + 118, y + 29, [{ g: 'recharge' }, sec2(this.run.effectiveRecharge(i))], { role: 'Tsmall', align: 'right' }));
      const id = `w:${i}`;
      this.nav.add({ id, x, y, w: 120, h: 40, onConfirm: () => this.confirmOn(id),
        nav: { right: () => `s:${i === this.sel ? 0 : 0}`, left: null, up: i > 0 ? `w:${i - 1}` : null,
          down: i < this.run.wands.length - 1 ? `w:${i + 1}` : 'revert' } });
    }
  }

  buildStats() {
    const s = this.scene, c = this.cA2;
    c.removeAll(true);
    const w = this.wand(); if (!w || !this.pv) return;
    const pm = this.run.playerMods, pv = this.pv, d = w.def;
    const star = (b) => (b ? '*' : '');
    const rows = [
      [t('editor.stat.slots'), `${w.state.slots.filter(Boolean).length}/${d.capacity}`],
      [t('editor.stat.mana'), `${Math.round(pv.manaMax)}${star(pm.manaMaxMult !== 1)} +${Math.round(pv.regenPerS)}${star(pm.manaRegenMult !== 1)}/s`],
      [t('editor.stat.castDelay'), `${sec2(d.castDelayMs * (pm.castDelayMult || 1))}${star(pm.castDelayMult !== 1)}`],
      [t('editor.stat.recharge'), `${sec2(pv.effectiveRechargeMs)}${star(pm.rechargeMult !== 1)}`],
      [t('editor.stat.spread'), pmDeg(num(d.spreadDeg))],
      [t('editor.stat.speed'), `×${d.speedMult.toFixed(2)}`],
      [t('editor.stat.spellsPerCast'), String(d.spellsPerCast)],
      [t('editor.stat.shuffle'), d.shuffle ? t('editor.yes') : t('editor.no')],
      [t('editor.stat.always'), (d.alwaysCast || []).length ? '' : '-'],
    ];
    // Always cast = the card's 16 px icon (spec A2), the name is in C when the wand card is focused
    (d.alwaysCast || []).forEach((id, k) => c.add(icon(s, 119 - k * 18, 194 + 8 * 12 + 6, cardOf(id).type === 'projectile' ? 'spells' : 'modifiers', id, 16)));
    rows.forEach(([l, v], r) => {
      c.add(txt(s, 8, 194 + r * 12, l, 'T1', { color: C.dim }));
      const vt = txt(s, 127, 194 + r * 12, v, 'T1', { origin: [1, 0] });
      c.add(vt);
    });
  }

  buildSlots() {
    const s = this.scene, c = this.cB;
    c.removeAll(true);
    this.nav.clear('s:');
    for (const k of Object.keys(this.cellObjs)) if (k.startsWith('s:')) delete this.cellObjs[k];
    const w = this.wand(); if (!w) return;
    const d = w.def, cap = d.capacity;
    const shown = this.shownPv();
    c.add(txt(s, 136, 22, w.def.name, 'T1'));
    c.add(txt(s, 519, 22, t('editor.slotsHead', { n: w.state.slots.filter(Boolean).length, cap }), 'T1', { origin: [1, 0] }));
    // always-cast virtual cell
    if (this.hasAlways()) {
      const vc = cardCell(s, SLOT_X, SLOT_Y, cardOf(d.alwaysCast[0]), CELL, { virtual: true });
      c.add(vc);
    }
    // per-slot state from the preview: skipped for mana, warning badges
    const skipped = new Set(), badge = {};
    if (shown && !shown.shuffle) {
      for (const cs of shown.casts) for (const dr of cs.drawn) if (dr.skippedNoMana && dr.slotIndex !== 'always') skipped.add(dr.slotIndex);
      for (const wn of shown.warnings) {
        if (wn.id === 'W2') w.state.slots.forEach((id, k) => { if (id === wn.cardId) badge[k] = 'stop'; });
        if (wn.id === 'W4' || wn.id === 'W5') {
          const cs = shown.casts[(wn.cast || 1) - 1];
          const dr = cs && cs.drawn.find((x) => x.cardId === wn.cardId && x.slotIndex !== 'always');
          if (dr && badge[dr.slotIndex] !== 'stop') badge[dr.slotIndex] = 'warn';
        }
      }
    }
    for (let k = 0; k < cap; k++) {
      const x = this.slotX(k), loc = { wand: this.sel, slot: k };
      c.add(txt(s, x + 18, 34, String(k + 1), 'Tsmall', { origin: [0.5, 0], color: C.dim }));
      const ghost = this.held && this.held.origin && same(this.held.origin, loc);
      const id = ghost ? null : w.state.slots[k];
      const cell = cardCell(s, x, SLOT_Y, cardOf(id), CELL, { isNew: false });
      if (skipped.has(k)) cell.setState('skipped');
      c.add(cell);
      if (badge[k]) c.add(glyph(s, x + 27, SLOT_Y - 3, badge[k]));
      this.cellObjs[`s:${k}`] = cell;
      const fid = `s:${k}`;
      this.nav.add({ id: fid, x, y: SLOT_Y, w: CELL, h: CELL, onConfirm: () => this.confirmOn(fid),
        nav: { up: null, left: k > 0 ? `s:${k - 1}` : `w:${this.sel}`, right: k < cap - 1 ? `s:${k + 1}` : null, down: `b:${Math.min(k, 5)}` } });
    }
    // B4 next-card chevron (or ↻ at slot 1 once changed)
    if (this.changed(this.sel)) c.add(glyph(s, this.slotX(0) + 13, 77, 'recharge'));
    else if (w.state.order.length && !d.shuffle) c.add(glyph(s, this.slotX(this.nextSlot()) + 15, 79, 'chevron'));
    // B5 cast brackets
    if (shown) this.drawBrackets(c, shown, cap);
  }

  drawBrackets(c, pv, cap) {
    const s = this.scene;
    if (pv.shuffle) { c.add(txt(s, 136, 86, t('editor.shuffled'), 'Tsmall', { color: C.dim })); return; }
    const g = s.add.graphics();
    c.add(g);
    const rowEnd = this.slotX(cap - 1) + CELL;
    const seg = (x0, x1, y, dashed) => {
      g.lineStyle(1, C.dim, 1);
      if (dashed) for (let x = x0; x < x1; x += 4) g.lineBetween(x, y + 0.5, Math.min(x + 2, x1), y + 0.5);
      else g.lineBetween(x0, y + 0.5, x1, y + 0.5);
      g.lineBetween(x0 + 0.5, y - 3, x0 + 0.5, y + 0.5);
    };
    for (const cs of pv.casts) {
      const recs = cs.drawn.filter((d) => d.slotIndex !== 'always');
      if (!recs.length) continue;
      const wi = recs.findIndex((d) => d.wrapped);
      const pre = wi < 0 ? recs : recs.slice(0, wi), post = wi < 0 ? [] : recs.slice(wi);
      if (pre.length) {
        const a = Math.min(...pre.map((d) => d.slotIndex)), b = Math.max(...pre.map((d) => d.slotIndex));
        const x0 = this.slotX(a) + 2, x1 = post.length ? rowEnd : this.slotX(b) + CELL - 2;
        seg(x0, x1, 86, false);
        if (!post.length) g.lineBetween(x1 - 0.5, 83, x1 - 0.5, 86.5);
        const lx = Math.round((x0 + x1) / 2);
        g.fillStyle(0x000000, 1).fillRect(lx - 4, 82, 8, 8);
        c.add(txt(s, lx, 83, String(cs.index), 'Tsmall', { origin: [0.5, 0] }));
        if (post.length) c.add(glyph(s, rowEnd + 1, 81, 'wrap'));
      }
      if (post.length) {
        const b = Math.max(...post.map((d) => d.slotIndex));
        const x0 = this.slotX(0) + 2, x1 = this.slotX(b) + CELL - 2;
        seg(x0, x1, 96, true);
        g.lineBetween(x1 - 0.5, 93, x1 - 0.5, 96.5);
        const lx = Math.round((x0 + x1) / 2);
        g.fillStyle(0x000000, 1).fillRect(lx - 4, 92, 8, 8);
        c.add(txt(s, lx, 93, String(cs.index), 'Tsmall', { origin: [0.5, 0] }));
      }
    }
  }

  buildBag() {
    const s = this.scene, c = this.cBag, run = this.run;
    c.removeAll(true);
    this.nav.clear('b:');
    for (const k of Object.keys(this.cellObjs)) if (k.startsWith('b:')) delete this.cellObjs[k];
    const n = run.bagCount, cap = run.bag.length;
    if (n >= cap) c.add(richLine(s, 136, 104, [{ g: 'stop' }, ' ', t('editor.bagFull')]));
    else c.add(richLine(s, 136, 104, n === cap - 1 ? [t('editor.bagHead', { n, cap }), ' ', { g: 'warn' }] : [t('editor.bagHead', { n, cap })]));
    for (let k = 0; k < cap; k++) {
      const loc = { wand: 'bag', slot: k }, { x, y } = this.cellXY(loc);
      const ghost = this.held && this.held.origin && same(this.held.origin, loc);
      const id = ghost ? null : run.bag[k];
      const cell = cardCell(s, x, y, cardOf(id), CELL);
      c.add(cell);
      this.cellObjs[`b:${k}`] = cell;
      const row = Math.floor(k / 6), col = k % 6;
      const fid = `b:${k}`;
      this.nav.add({ id: fid, x, y, w: CELL, h: CELL, onConfirm: () => this.confirmOn(fid),
        nav: { left: col > 0 ? `b:${k - 1}` : `w:${this.sel}`, right: col < 5 ? `b:${k + 1}` : 'salv',
          up: row > 0 ? `b:${k - 6}` : () => `s:${Math.min(col, (this.wand() ? this.wand().def.capacity : 1) - 1)}`,
          down: row < 1 && k + 6 < cap ? `b:${k + 6}` : () => (this.nav.has('p:0') ? 'p:0' : 'revert') } });
    }
  }

  buildSalvage() {
    const s = this.scene, c = this.cSalv;
    c.removeAll(true);
    const line = this.held ? t('editor.salvageGain', { n: this.run.salvageValue(this.held.id) }) : t('editor.salvageHint');
    c.add(txt(s, 386, 140, line, this.held ? 'T1' : 'Tsmall', { color: this.held ? C.gold : C.dim, wrap: 124 }));
  }

  shownPv() { return this.hypoPv || this.pv; }

  buildPreview() {
    const s = this.scene, c = this.cPrev;
    c.removeAll(true);
    this.nav.clear('p:');
    const pv = this.shownPv(); if (!pv) return;
    const w = this.wand();
    // list = casts then warnings (W7 lives in the summary)
    const lines = pv.casts.map((cs) => ({ kind: 'cast', cs }));
    for (const wn of pv.warnings) if (wn.id !== 'W7') lines.push({ kind: 'warn', wn });
    if (pv.shuffle) lines.unshift({ kind: 'note', text: t('editor.shuffleNote') });
    this.pvLines = lines;
    this.pvScroll = Math.max(0, Math.min(this.pvScroll, lines.length - PV_LINES));
    const vis = lines.slice(this.pvScroll, this.pvScroll + PV_LINES);
    vis.forEach((ln, j) => {
      const y = PV_Y + j * PV_PITCH, idx = this.pvScroll + j;
      if (ln.kind === 'cast') this.castLine(c, ln.cs, y, w);
      else if (ln.kind === 'warn') {
        c.add(glyph(s, 138, y + 2, ln.wn.severity === 'error' ? 'stop' : 'warn'));
        const tx = txt(s, 151, y, warningText(ln.wn, pv), 'T1', { color: ln.wn.severity === 'error' ? C.error : C.warn });
        fitText(tx, 366); c.add(tx);
      } else c.add(txt(s, 138, y, ln.text, 'T1', { color: C.dim }));
      const pid = `p:${idx}`;
      this.nav.add({ id: pid, x: 136, y: y - 1, w: 384, h: PV_PITCH, onConfirm: () => {},
        nav: { up: idx > 0 ? `p:${idx - 1}` : 'b:6', down: idx < lines.length - 1 ? `p:${idx + 1}` : 'revert', left: null, right: null } });
    });
    // off-screen lines stay focusable by id (scroll brings them into view)
    lines.forEach((_, idx) => {
      if (idx >= this.pvScroll && idx < this.pvScroll + PV_LINES) return;
      this.nav.add({ id: `p:${idx}`, x: 136, y: -100, w: 1, h: 1, noPointer: true, noRing: true, offscreen: true,
        nav: { up: idx > 0 ? `p:${idx - 1}` : 'b:6', down: idx < lines.length - 1 ? `p:${idx + 1}` : 'revert', left: null, right: null } });
    });
    if (lines.length > this.pvScroll + PV_LINES) c.add(txt(s, 519, 285, t('editor.more', { n: lines.length - this.pvScroll - PV_LINES }), 'Tsmall', { origin: [1, 0], color: C.dim }));
    this.buildSummary(c, pv);
  }

  castLine(c, cs, y, w) {
    const s = this.scene;
    c.add(txt(s, 138, y, String(cs.index), 'T1', { color: C.dim }));
    let x = 150;
    const recs = cs.drawn;
    const max = 5;
    recs.slice(0, max).forEach((d) => {
      if (d.wrapped) { c.add(glyph(s, x, y + 3, 'wrap')); x += 10; }
      const card = cardOf(d.cardId);
      const kindKey = card && card.type === 'projectile' ? 'spells' : 'modifiers';
      c.add(icon(s, x + 8, y + 7, kindKey, d.cardId, 16));
      if (d.skippedNoMana) c.add(s.add.graphics().lineStyle(2, C.error, 1).lineBetween(x + 1, y + 15, x + 15, y + 1));
      if (d.slotIndex === 'always') c.add(glyph(s, x + 9, y + 8, 'lock'));
      x += 17;
    });
    if (recs.length > max) { c.add(txt(s, x, y, `+${recs.length - max}`, 'Tsmall', { color: C.dim })); x += 12; }
    c.add(glyph(s, Math.max(x + 2, 236), y + 3, 'arrow'));
    const timing = cs.recharge ? t('editor.rechargeT', { s: sec2(cs.delayAfterMs) }) : t('editor.waitT', { s: sec2(cs.delayAfterMs) });
    const tt = txt(s, 519, y, timing, 'T1', { origin: [1, 0], color: C.dim });
    c.add(tt);
    const sx = Math.max(x + 14, 248);
    const maxW = 519 - tt.width - 6 - sx;
    const st = txt(s, sx, y, castShotsText(cs, w.def), 'T1');
    if (st.width > maxW) st.setText(castShotsText(cs, w.def, true));   // long form when it fits, else the short form
    fitText(st, maxW);
    c.add(st);
  }

  buildSummary(c, pv) {
    const s = this.scene;
    const before = this.hypoPv ? this.pv : null;
    const dps = (p) => Math.round(p.dpsSingleTarget);
    const tilde = pv.shuffle ? '~' : '';
    // line 1: cycle + ≈DPS (with before → after deltas while a held card hovers a target)
    let l1;
    if (before) {
      const dd = dps(pv) - dps(before), dc = pv.cycleMs - before.cycleMs;
      l1 = [t('editor.sumCycleDelta', { a: (before.cycleMs / 1000).toFixed(2), b: (pv.cycleMs / 1000).toFixed(2), to: SYM.to }), ' '];
      if (Math.abs(dc) > 0.5) l1.push({ g: dc < 0 ? 'down' : 'up', color: dc < 0 ? C.ok : C.warn });
      l1.push(' · ', t('editor.sumDpsDelta', { t: tilde, ax: SYM.approx, a: dps(before), b: dps(pv), to: SYM.to }), ' ');
      if (dd) l1.push({ g: dd > 0 ? 'up' : 'down' }, `(${dd > 0 ? '+' : '-'}${Math.abs(dd)})`);
    } else l1 = [t('editor.sumCycle', { s: (pv.cycleMs / 1000).toFixed(2), t: tilde, ax: SYM.approx, dps: dps(pv) })];
    const r1 = richLine(s, 138, 300, l1);
    c.add(r1);
    // line 2: mana per cycle + sustainability
    const l2 = [t('editor.sumMana', { m: Math.round(pv.manaPerCycle), r: Math.round(pv.regenPerS) }), '  '];
    if (pv.sustainable) l2.push({ g: 'ok' }, ' ', { t: t('editor.sustainable'), color: C.ok });
    else l2.push({ g: 'no' }, ' ', { t: t('editor.sputters', { s: pv.secondsOfFire }), color: C.warn });
    c.add(richLine(s, 138, 313, l2));
    // line 3: warnings count (focus jumps to the first warning line)
    const nw = pv.warnings.filter((w) => w.id !== 'W7').length;
    if (nw) {
      const first = this.pvLines.findIndex((l) => l.kind === 'warn');
      c.add(richLine(s, 138, 326, [{ g: 'warn' }, ' ', t('editor.warnings', { n: nw })], { color: C.warn }));
      this.nav.add({ id: 'p:sum', x: 136, y: 325, w: 200, h: 13, onConfirm: () => this.nav.focus(`p:${first}`),
        nav: { up: this.pvLines.length ? `p:${this.pvLines.length - 1}` : 'b:6', down: 'revert', left: null, right: null } });
    }
    // editor-preview-value-change: gold highlight on a changed summary after a drop (kept under reduced motion)
    if (this._flashSummary) { this._flashSummary = false; r1.list.forEach((o) => o.type !== 'Graphics' && setColor(o, C.warn)); this.scene.time.delayedCall(200, () => r1.active && r1.list.forEach((o) => o.type !== 'Graphics' && setColor(o, C.text))); }
  }

  scrollPvTo(idx) {
    if (idx < this.pvScroll) this.pvScroll = idx;
    else if (idx >= this.pvScroll + PV_LINES) this.pvScroll = idx - PV_LINES + 1;
    else return;
    const cur = this.nav.current;
    this.buildPreview();
    this.nav.raise(); this.root.bringToTop(this.cHeld);
    if (cur && this.nav.has(cur)) { this.nav.current = cur; this.nav.refresh(); }
  }

  // ---------------------------------------------------------------------------------- detail pane C
  buildDetail() {
    const s = this.scene, c = this.cC;
    c.removeAll(true);
    const x = C_X + 4, W = 96;
    let y = C_Y + 4 - this.cScroll;
    const add = (o, h, dy = 0) => { o.y = y + dy; c.add(o); o.setVisible(y >= C_Y && y + h <= C_Y + C_H); y += h; return o; };
    const line = (str, color = C.text, role = 'T1') => { const o = txt(s, x, 0, str, role, { color, wrap: W }); add(o, Math.max(12, Math.ceil(o.height))); return o; };
    const rows = (list) => list.forEach(([l, v]) => {
      const a = txt(s, x, 0, l, 'T1', { color: C.dim }); const b = txt(s, x + W, 0, v, 'T1', { origin: [1, 0] });
      a.y = y; b.y = y; const vis = y >= C_Y && y + 12 <= C_Y + C_H; a.setVisible(vis); b.setVisible(vis); c.add([a, b]); y += 12;
    });
    const sep = () => { const g = s.add.graphics().fillStyle(C.slateDark, 1).fillRect(x, 0, W, 1); add(g, 5); };

    if (this.reason) { line(this.reason, C.warn); sep(); }
    if (this.coach && this.held) { line(t('editor.coach'), C.gold); sep(); }
    const focus = this.nav.current;
    const heldCard = this.held ? cardOf(this.held.id) : null;
    const cellId = focus && (focus.startsWith('s:') || focus.startsWith('b:')) ? this.run.getCell(this.locOf(focus)) : null;
    const showCard = heldCard || (cellId && !(this.held && this.held.origin && same(this.held.origin, this.locOf(focus))) ? cardOf(cellId) : null);

    if (showCard) this.cardDetail(showCard, { add, line, rows, sep, x }, !heldCard && focus.startsWith('s:') ? +focus.slice(2) : null);
    else if (focus && focus.startsWith('w:') && this.run.wands[+focus.slice(2)]) this.wandDetail(+focus.slice(2), { line, rows, sep });
    else if (focus && focus.startsWith('p:') && this.pvLines) {
      const ln = focus === 'p:sum' ? null : this.pvLines[+focus.slice(2)];
      if (ln && ln.kind === 'cast') {
        line(t('editor.castN', { k: ln.cs.index }), C.text, 'T2');
        for (const l of castDetailLines(ln.cs)) line(l, l.startsWith('  ') ? C.dim : C.text);
        line(ln.cs.recharge ? t('editor.rechargeT', { s: sec2(ln.cs.delayAfterMs) }) : t('editor.waitT', { s: sec2(ln.cs.delayAfterMs) }), C.dim);
      } else if (ln && ln.kind === 'warn') line(warningText(ln.wn, this.shownPv()), ln.wn.severity === 'error' ? C.error : C.warn);
      else if (ln) line(ln.text, C.dim);
      else line(t('editor.warnings', { n: this.shownPv().warnings.filter((w) => w.id !== 'W7').length }), C.warn);
    } else if (focus === 'salv') {
      line(t('editor.salvage'), C.text, 'T2');
      line(t('editor.salvageDesc'), C.dim);
    } else if (focus && (focus.startsWith('s:') || focus.startsWith('b:'))) {
      line(t(focus.startsWith('s:') ? 'editor.emptySlot' : 'editor.emptyBag'), C.dim);
    } else if (focus === 'revert' && !this.run.anyChanged(this.snap)) {
      line(t('editor.nothingChanged'), C.dim);
    } else {
      for (let i = 1; i <= 4; i++) line(t(`editor.primer${i}`), C.dim);
    }
    this.cContentH = y + this.cScroll - C_Y;
  }

  cardDetail(card, h, slotIdx) {
    const s = this.scene, { add, line, rows, sep, x } = h;
    const kind = card.type === 'projectile' ? 'spells' : 'modifiers';
    add(icon(s, x + 48, 0, kind, card.id, 32), 34, 16);      // centre-origin icon
    line(card.name);
    line(typeWord(card), C.dim);
    line(rarityWord(card.rarity), C.rar[card.rarity] ?? C.dim);
    sep();
    rows(cardRows(card));
    if (card.type !== 'projectile') for (const l of modifierLines(card)) line(l);
    // in context: which cast this slot fires in, and why it is wasted/skipped
    if (slotIdx != null && this.pv) {
      const cs = this.pv.casts.find((k) => k.drawn.some((d) => d.slotIndex === slotIdx));
      if (cs) {
        const d = cs.drawn.find((x2) => x2.slotIndex === slotIdx);
        line(t('editor.firesIn', { k: cs.index }), C.dim);
        if (d.skippedNoMana) line(t('editor.skippedMana', { m: card.mana, max: Math.round(this.pv.manaMax) }), C.error);
      }
      if ((card.mana || 0) > 0 && this.pv.manaMax && card.mana > this.pv.manaMax * 0.5 && card.mana <= this.pv.manaMax) line(t('editor.costsOf', { m: card.mana, max: Math.round(this.pv.manaMax) }), C.warn);
      for (const w of this.pv.warnings) if ((w.id === 'W4' || w.id === 'W5' || w.id === 'W2') && w.cardId === card.id) line(warningText(w, this.pv), w.severity === 'error' ? C.error : C.warn);
    }
    sep();
    line(card.desc, C.dim);
    if (card.type === 'modifier') line(t('editor.rule.modifier'), C.dim);
  }

  wandDetail(i, h) {
    const { line, rows, sep } = h;
    const w = this.run.wands[i], d = w.def, pm = this.run.playerMods;
    const pv = i === this.sel ? this.pv : this.run.preview(i);
    line(d.name); line(rarityWord(d.rarity), C.rar[d.rarity] ?? C.dim); sep();
    const arrow = (a, b, f = (v) => v) => (Math.abs(a - b) < 1e-6 ? f(a) : `${f(a)} → ${f(b)}`);
    const addMs = w.state.slots.reduce((a, id) => a + ((id && cardOf(id).rechargeAddMs) || 0), 0);
    rows([
      [t('editor.stat.slots'), String(d.capacity)],
      [t('editor.stat.manaMax'), arrow(d.manaMax, pv.manaMax, Math.round)],
      [t('editor.stat.regen'), arrow(d.manaRegen, pv.regenPerS, (v) => `${Math.round(v)}/s`)],
      [t('editor.stat.castDelay'), arrow(d.castDelayMs, d.castDelayMs * (pm.castDelayMult || 1), sec)],
      [t('editor.stat.recharge'), arrow(d.rechargeMs, pv.effectiveRechargeMs, sec)],
      [t('editor.stat.spread'), pmDeg(num(d.spreadDeg))],
      [t('editor.stat.speed'), `×${d.speedMult.toFixed(2)}`],
      [t('editor.stat.spellsPerCast'), String(d.spellsPerCast)],
    ]);
    if (addMs) line(t('editor.rechargeAdds', { s: sec(addMs) }), C.dim);
    if (d.shuffle) line(t('editor.shuffleLine'), C.dim);
    if ((d.alwaysCast || []).length) line(t('editor.alwaysLine', { card: d.alwaysCast.map(cardName).join(', ') }), C.dim);
    if (this.changed(i)) line(t('editor.changedLine', { s: sec(this.run.effectiveRecharge(i)) }), C.warn);
    if (i === this.run.activeWand) line(t('editor.equipped'), C.dim);
    sep(); line(d.desc, C.dim);
  }

  // ---------------------------------------------------------------------------------------- footer
  buildFooter() {
    const s = this.scene, c = this.cFoot;
    c.removeAll(true);
    const changed = this.run.anyChanged(this.snap);
    const rv = button(s, 8, 344, 50, 14, t('editor.revert'));
    rv.setDisabled(!changed);
    const cl = button(s, 62, 344, 50, 14, t('editor.close'));
    c.add([rv, cl]);
    this.btnRevert = rv; this.btnClose = cl;
    this.nav.add({ id: 'revert', x: 8, y: 344, w: 50, h: 14, disabled: !changed,
      onFocus: () => rv.setFocused(true), onBlur: () => rv.setFocused(false),
      onDenied: () => { this.mixer.fire('ui_denied'); deniedMotion(s, rv.label); this.say(t('editor.nothingChanged')); },
      onConfirm: () => this.doRevert(), nav: { right: 'close', left: null, up: () => this.upFromFooter(), down: null } });
    this.nav.add({ id: 'close', x: 62, y: 344, w: 50, h: 14, onFocus: () => cl.setFocused(true), onBlur: () => cl.setFocused(false),
      onConfirm: () => this.scene.requestClose(), nav: { left: 'revert', right: null, up: () => this.upFromFooter(), down: null } });
    // device hints (drop trailing hints until they fit; Close is always kept)
    const pad = this.router.device === 'pad';
    const hk = this.held ? (pad ? 'editor.hintPadHeld' : 'editor.hintKbHeld') : (pad ? 'editor.hintPad' : 'editor.hintKb');
    const parts = t(hk).split(' · ');
    if (this.held && !this.held.origin) parts.unshift(t(pad ? 'editor.hintToBagPad' : 'editor.hintToBag'));
    const right = changed ? [{ g: 'recharge' }, ' ', t('editor.changedStatus')] : this.inCombat ? [t('editor.pausedCombat')] : [];
    const rl = richLine(s, 632, 345, right, { align: 'right', color: changed ? C.warn : C.dim });
    c.add(rl);
    const maxW = 632 - rl.lineWidth - 12 - 118;
    let ht;
    for (let n = parts.length; n >= 1; n--) {
      const str = n === parts.length ? parts.join(' · ') : [...parts.slice(0, n - 1), parts[parts.length - 1]].join(' · ');
      if (ht) ht.destroy();
      ht = txt(s, 118, 345, str, 'T1', { color: C.dim });
      if (ht.width <= maxW) break;
    }
    c.add(ht);
  }
  upFromFooter() {
    if (this.nav.has('p:sum')) return 'p:sum';
    if (this.pvLines && this.pvLines.length) return `p:${Math.min(this.pvLines.length - 1, this.pvScroll + PV_LINES - 1)}`;
    return 'b:6';
  }

  // ================================================================================ interaction
  say(reason) { this.reason = reason; this.buildDetail(); }

  /** Focus moved (nav.onMove). Clears the transient reason; while holding, recompute the hover preview. */
  onFocus(item) {
    if (!item) return;
    this.reason = null;
    this.cScroll = 0;
    if (/^p:\d+$/.test(item.id)) {                      // bring an off-screen preview line into view
      const idx = +item.id.slice(2);
      if (idx < this.pvScroll || idx >= this.pvScroll + PV_LINES) { this.scrollPvTo(idx); item = this.nav.cur() || item; }
    }
    if (this.held) {
      const hypo = this.hypoSlots(this.targetOf(item.id));
      const key = hypo ? hypo.join('|') : '';
      if (key !== this._hypoKey) {
        this._hypoKey = key;
        this.hypoPv = hypo ? this.run.preview(this.sel, hypo) : null;
        this.buildSlots(); this.buildPreview();
        this.nav.raise(); this.root.bringToTop(this.cHeld);
        if (this.nav.has(item.id)) { this.nav.current = item.id; this.nav.refresh(); }
      }
      this.moveHeldTo(item);
    }
    this.buildDetail();
    this.drawTargetOverlay();
  }

  /** Valid-target inner frame / invalid ⛔ while holding (§3.1). */
  drawTargetOverlay() {
    const g = this.over; g.clear();
    this.cA.list.filter((o) => o.__stop).forEach((o) => o.destroy());
    if (!this.held) return;
    // full wand cards show ⛔ while holding
    this.run.wands.forEach((w, i) => {
      if (this.run.firstEmptySlot(i) < 0 && !(this.held.origin && this.held.origin.wand === i)) {
        const gl = glyph(this.scene, 8 + 97, 22 + i * 42 + 2, 'stop'); gl.__stop = true; this.cA.add(gl);
      }
    });
    const it = this.nav.cur(); const tg = it && this.targetOf(it.id);
    if (!tg) return;
    if (tg.kind === 'wand' && this.run.firstEmptySlot(tg.i) < 0) return;
    g.lineStyle(1, C.text, 1).strokeRect(it.x + 2.5, it.y + 2.5, it.w - 5, it.h - 5);
  }

  pulseSlot(k) {
    const obj = this.cellObjs[`s:${k}`]; if (!obj) return;
    const g = this.scene.add.graphics();
    g.lineStyle(1, C.text, 1).strokeRect(this.slotX(k) + 1.5, SLOT_Y + 1.5, CELL - 3, CELL - 3);
    this.cB.add(g);
    if (reduced()) return;                        // static bright outline
    this.scene.tweens.add({ targets: g, alpha: 0.3, duration: 200, ease: 'Sine.easeInOut', yoyo: true, repeat: 1, onComplete: () => g.setAlpha(1) });
  }

  pick(loc) {
    const id = this.run.getCell(loc);
    if (!id) return false;
    this.held = { id, origin: loc };
    this.mixer.fire('ui_card_pick');
    this._hypoKey = null; this.hypoPv = null;
    this.rebuildAll();
    this.drawHeld(this.cellXY(loc));
    this.onFocus(this.nav.cur());
    return true;
  }

  /** Drop the held card on a target (§3.4). */
  dropOn(tg) {
    const h = this.held; if (!h || !tg) return;
    const run = this.run;
    const from = this.heldPos();
    if (tg.kind === 'salv') { this.askSalvage(); return; }
    let loc;
    if (tg.kind === 'wand') {
      const fe = run.firstEmptySlot(tg.i);
      if (fe < 0) { this.mixer.fire('ui_denied'); this.say(t('editor.wandFull')); return; }
      loc = { wand: tg.i, slot: fe };
      this.sel = tg.i;
    } else loc = tg.loc;
    let handOver = null, displaced = null;
    if (h.origin) {
      if (same(h.origin, loc)) { this.cancelHeld(); return; }
      displaced = run.getCell(loc);
      run.swapCells(h.origin, loc);
    } else {
      displaced = run.getCell(loc);
      run.setCell(loc, h.id);
      if (displaced) handOver = displaced;
    }
    const placedKind = cardOf(h.id).type;
    const origin = h.origin;
    this.held = handOver ? { id: handOver, origin: null, fromReward: true } : null;
    if (loc.wand !== 'bag') {
      this.bus.emit(EV.FTUE, 'card-slotted');
      if (placedKind !== 'projectile') { Save.setFlag('slotModifier'); this.coach = false; }
    }
    this.mixer.fire('ui_card_place');
    this.afterEdit();
    // motion: travel held → target (90 ms) + seat; displaced → origin (120 ms)
    this.animArrive(loc, from, 90);
    if (displaced && origin) this.animArrive(origin, this.cellXY(loc), 120, true);
    if (loc.wand !== 'bag') this.tick(loc);
    if (handOver) this.drawHeld(this.cellXY(loc));
  }

  cancelHeld() {
    const h = this.held; if (!h) return true;
    if (h.origin) {
      const from = this.heldPos();
      this.held = null;
      this.mixer.fire('ui_card_place');
      this.afterEdit(false);
      this.animArrive(h.origin, from, 120);
      return true;
    }
    const free = this.run.firstFreeBag();
    if (free >= 0) {
      const from = this.heldPos();
      this.run.setCell({ wand: 'bag', slot: free }, h.id);
      this.held = null;
      this.mixer.fire('ui_card_place');
      this.afterEdit();
      this.animArrive({ wand: 'bag', slot: free }, from, 120);
      return true;
    }
    this.askBagFull();
    return false;
  }

  afterEdit(flash = true) {
    this._hypoKey = null; this.hypoPv = null;
    this.recompute();
    this._flashSummary = flash;
    const cur = this.nav.current;
    this.rebuildAll();
    if (cur && this.nav.has(cur)) { this.nav.current = cur; this.nav.refresh(); }
    this.drawHeld();
    this.onFocus(this.nav.cur());
  }

  animArrive(loc, from, ms, displaced = false) {
    const obj = this.cellObjs[loc.wand === 'bag' ? `b:${loc.slot}` : (loc.wand === this.sel ? `s:${loc.slot}` : null)];
    if (!obj || !from) return;
    if (reduced()) { if (displaced) { obj.setAlpha(0.6); this.scene.time.delayedCall(33, () => obj.active && obj.setAlpha(1)); } return; }
    const hx = obj.x, hy = obj.y;
    obj.setPosition(from.x, from.y);
    this.scene.tweens.add({ targets: obj, x: hx, y: hy - (displaced ? 0 : 1), duration: ms, ease: displaced ? 'Cubic.easeInOut' : 'Cubic.easeOut',
      onUpdate: () => { obj.x = Math.round(obj.x); obj.y = Math.round(obj.y); },
      onComplete: () => { if (displaced) return; this.scene.tweens.add({ targets: obj, y: hy, duration: 83, ease: 'Back.easeOut' }); } });
  }

  /** Completion tick on a slot (ftue-flow §2 rule 7). */
  tick(loc) {
    if (loc.wand !== this.sel) return;
    const g = glyph(this.scene, this.slotX(loc.slot) + 26, SLOT_Y + 25, 'ok');
    this.cB.add(g);
    this.scene.time.delayedCall(300, () => g.active && g.destroy());
  }

  askSalvage(loc = null) {
    const id = loc ? this.run.getCell(loc) : this.held && this.held.id;
    if (!id) return;
    const n = this.run.salvageValue(id);
    new Dialog(this.scene, { mainNav: this.nav, text: t('confirm.salvage', { card: cardName(id), n }),
      options: [{ label: t('confirm.cancel') }, { label: t('confirm.salvageBtn'), kind: 'danger', action: () => this.doSalvage(loc) }] });
  }

  doSalvage(loc) {
    const run = this.run;
    let target = loc;
    if (!target && this.held) {
      if (this.held.origin) target = this.held.origin;
      else {                                            // origin-less held card (reward): no cell to salvage from
        run.salvageHeld(this.held.id);
        this.held = null;
        this.mixer.fire('ui_salvage');
        this.afterEdit(); return;
      }
    }
    if (this.held && this.held.origin && same(this.held.origin, target)) this.held = null;
    run.salvage(target);
    this.mixer.fire('ui_salvage');
    this.afterEdit();
  }

  askBagFull() {
    const id = this.held.id, n = this.run.salvageValue(id);
    new Dialog(this.scene, { mainNav: this.nav, width: 360, text: t('confirm.bagFull', { card: cardName(id) }),
      options: [{ label: t('confirm.keepHolding') }, { label: t('confirm.salvageFor', { n }), kind: 'primary', action: () => this.doSalvage(null) },
        { label: t('confirm.discard'), kind: 'danger', action: () => { this.run.discardHeld(id); this.held = null; this.mixer.fire('ui_back'); this.afterEdit(); } }] });
  }

  quickMove(loc) {
    const run = this.run;
    const id = run.getCell(loc); if (!id) return;
    if (loc.wand === 'bag') {
      const fe = this.wand() ? run.firstEmptySlot(this.sel) : -1;
      if (fe < 0) { this.mixer.fire('ui_denied'); this.say(t('editor.wandFull')); return; }
      const to = { wand: this.sel, slot: fe };
      run.swapCells(loc, to);
      this.bus.emit(EV.FTUE, 'card-slotted');
      if (cardOf(id).type !== 'projectile') Save.setFlag('slotModifier');
      this.mixer.fire('ui_card_place'); this.afterEdit(); this.animArrive(to, this.cellXY(loc), 90);
    } else {
      const fb = run.firstFreeBag();
      if (fb < 0) { this.mixer.fire('ui_denied'); this.say(t('editor.bagFullReason')); return; }
      const to = { wand: 'bag', slot: fb };
      run.swapCells(loc, to);
      this.mixer.fire('ui_card_place'); this.afterEdit(); this.animArrive(to, this.cellXY(loc), 90);
    }
  }

  doRevert() {
    if (!this.run.anyChanged(this.snap)) return;
    const keep = this.held && !this.held.origin ? this.held : null;
    this.run.revert(this.snap);
    this.held = keep;
    this.mixer.fire('ui_back');
    this.afterEdit(false);
  }

  selectWand(i) {
    if (i < 0 || i >= this.run.wands.length || i === this.sel) return;
    this.sel = i; this.pvScroll = 0;
    this.mixer.fire('ui_tab');
    this._hypoKey = null; this.hypoPv = null;
    this.recompute();
    const cur = this.nav.current;
    this.rebuildAll();
    let f = cur;
    if (cur && cur.startsWith('s:') && !this.nav.has(cur)) f = `s:${this.wand().def.capacity - 1}`;
    if (f && this.nav.has(f)) this.nav.focus(f, { silent: true }); else this.nav.focus(`s:0`, { silent: true });
    this.onFocus(this.nav.cur());
  }

  /** confirm on a focusable (A / Enter / click). */
  confirmOn(id) {
    const tg = this.targetOf(id);
    if (this.held) {
      if (tg) this.dropOn(tg);
      return;
    }
    if (id.startsWith('w:')) { this.selectWand(+id.slice(2)); return; }
    if (tg && tg.kind === 'cell') { if (!this.pick(tg.loc)) this.mixer.fire('ui_denied'); return; }
    if (id === 'salv') { this.mixer.fire('ui_denied'); this.say(t('editor.salvagePickFirst')); }
  }

  // ------------------------------------------------------------------------------------ intents
  /** Generic UI intent (up/down/left/right/confirm/back). Returns 'close' when the editor wants to close. */
  handle(a) {
    this.pointerMode = false;
    if (a === 'back') {
      if (this.held) { this.cancelHeld(); return true; }
      return 'close';
    }
    return this.nav.handle(a);
  }

  /** Editor-scoped extra intents (extraKeys shim). */
  extra(a) {
    const it = this.nav.cur();
    const loc = it && this.locOf(it.id);
    switch (a) {
      case 'quickMove': if (!this.held && loc) this.quickMove(loc); break;
      case 'salvage':
        if (this.held) this.askSalvage();
        else if (loc && this.run.getCell(loc)) this.askSalvage(loc);
        else { this.mixer.fire('ui_denied'); this.say(t('editor.salvagePickFirst')); }
        break;
      case 'wandPrev': this.selectWand((this.sel + this.run.wands.length - 1) % this.run.wands.length); break;
      case 'wandNext': this.selectWand((this.sel + 1) % this.run.wands.length); break;
      case 'wand1': case 'wand2': case 'wand3': case 'wand4': this.selectWand(+a.slice(4) - 1); break;
      case 'revert': if (this.run.anyChanged(this.snap)) this.doRevert(); else { this.mixer.fire('ui_denied'); this.say(t('editor.nothingChanged')); } break;
      case 'scrollUp': case 'scrollDown': {
        const d = a === 'scrollUp' ? -1 : 1;
        const pvScrollable = this.pvLines && this.pvLines.length > PV_LINES;
        if (pvScrollable && !(this.cContentH > C_H && !(it && it.id.startsWith('p:')))) {
          this.pvScroll = Math.max(0, Math.min(this.pvLines.length - PV_LINES, this.pvScroll + d)); this.buildPreview(); this.nav.raise(); this.root.bringToTop(this.cHeld);
        } else { this.cScroll = Math.max(0, Math.min(Math.max(0, this.cContentH - C_H + 8), this.cScroll + d * 24)); this.buildDetail(); }
        break;
      }
      default: return false;
    }
    return true;
  }

  // ------------------------------------------------------------------------------------- pointer
  isCellWithCard(it) { const l = it && this.locOf(it.id); return l && this.run.getCell(l) && !(this.held && this.held.origin && same(this.held.origin, l)); }

  pointerDown(p) {
    if (this.scene.__dialog) return true;
    this.pointerMode = true;
    const it = this.nav.hit(p.x, p.y);
    const shift = p.event && p.event.shiftKey;
    if (p.button === 2) {                                   // RMB: cancel held, or quick move
      if (this.held) this.cancelHeld();
      else if (it && this.isCellWithCard(it)) { this.nav.focus(it.id, { silent: true }); this.quickMove(this.locOf(it.id)); }
      return true;
    }
    if (p.button !== 0) return true;
    if (this.held) {
      const tg = it && this.targetOf(it.id);
      if (tg) { this.nav.focus(it.id, { silent: true }); this.dropOn(tg); return true; }
      if (!it) { this.cancelHeld(); return true; }          // empty space → back to origin
      return false;                                         // footer/tabs/preview: normal handling
    }
    if (it && this.isCellWithCard(it)) {
      this.nav.focus(it.id, { silent: true });
      if (shift) { this.quickMove(this.locOf(it.id)); return true; }
      this.press = { id: it.id, x: p.x, y: p.y };
      return true;
    }
    return false;
  }

  pointerMove(p) {
    this.pointerMode = true;
    if (this.press && !this.held && Math.hypot(p.x - this.press.x, p.y - this.press.y) >= 4) {
      const loc = this.locOf(this.press.id);
      this.dragging = true;
      this.pick(loc);
    }
    if (this.held) this.drawHeld();
  }

  pointerUp(p) {
    const press = this.press; this.press = null;
    if (this.dragging) {
      this.dragging = false;
      const it = this.nav.hit(p.x, p.y), tg = it && this.targetOf(it.id);
      if (tg) this.dropOn(tg); else this.cancelHeld();
      return;
    }
    if (press && !this.held) {
      const it = this.nav.hit(p.x, p.y);
      if (it && it.id === press.id) this.pick(this.locOf(press.id));   // sticky pick-up (no-hold alternative)
    }
  }

  wheel(p, dy) {
    const d = dy > 0 ? 1 : -1;
    if (p.x >= C_X && p.y >= C_Y) { this.cScroll = Math.max(0, Math.min(Math.max(0, this.cContentH - C_H + 8), this.cScroll + d * 24)); this.buildDetail(); }
    else if (p.x >= 136 && p.x < 520 && p.y >= 194 && this.pvLines && this.pvLines.length > PV_LINES) {
      this.pvScroll = Math.max(0, Math.min(this.pvLines.length - PV_LINES, this.pvScroll + d)); this.buildPreview(); this.nav.raise(); this.root.bringToTop(this.cHeld);
    }
  }

  // ----------------------------------------------------------------------------------- held card
  heldPos() {
    if (!this.held) return null;
    if (this.heldObj) return { x: this.heldObj.x, y: this.heldObj.y };
    return null;
  }

  /** Held-card sprite: mouse = cursor +4,+4 at 90% alpha with a 1 px shadow; keys/pad = 4 px above the focused cell. */
  drawHeld(fromXY) {
    if (!this.held) { if (this.heldObj) { this.heldObj.destroy(); this.heldObj = null; this.heldId = null; } return; }
    if (!this.heldObj || this.heldId !== this.held.id) {
      if (this.heldObj) this.heldObj.destroy();
      const c = this.scene.add.container(0, 0);
      c.add(this.scene.add.rectangle(1, 1, CELL, CELL, 0x000000, 0.5).setOrigin(0));
      c.add(cardCell(this.scene, 0, 0, cardOf(this.held.id), CELL));
      c.setAlpha(0.9);
      this.cHeld.add(c);
      this.heldObj = c; this.heldId = this.held.id;
      if (fromXY) c.setPosition(fromXY.x, fromXY.y);
      const to = this.heldTarget();
      if (fromXY && to && !reduced()) this.scene.tweens.add({ targets: c, x: to.x, y: to.y, duration: 66, ease: 'Cubic.easeOut' });
      else if (to) c.setPosition(to.x, to.y);
      return;
    }
    if (this.pointerMode) { const to = this.heldTarget(); if (to) this.heldObj.setPosition(to.x, to.y); }
  }

  heldTarget() {
    if (this.pointerMode) {
      const p = this.scene.input.activePointer;
      return { x: Math.round(p.x + 2), y: Math.round(p.y + 2) };
    }
    const it = this.nav.cur();
    if (!it) return null;
    return { x: it.x + Math.round((it.w - CELL) / 2), y: it.y + Math.round((it.h - CELL) / 2) - 4 };
  }

  moveHeldTo(item) {
    if (!this.heldObj || this.pointerMode) return;
    const to = this.heldTarget(); if (!to) return;
    if (reduced()) { this.heldObj.setPosition(to.x, to.y); return; }
    this.scene.tweens.add({ targets: this.heldObj, x: to.x, y: to.y, duration: 50, ease: 'Cubic.easeOut' });
  }

  /** Can the editor close right now? (held card with nowhere to go → D3, never a trap) */
  tryRelease() {
    if (!this.held) return true;
    return this.cancelHeld() && !this.held;
  }

  destroy() {
    this.nav.onPointerDown = null; this.nav.onPointerMove = null; this.nav.onPointerUp = null; this.nav.onWheel = null;
  }
}

export { cardKind };
