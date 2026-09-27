// ui/WandEditor.js — Pause → Wands tab (wand-editor-ux.md). The player writes the program here; the
// editor's one job: the player can PREDICT what the wand will fire before closing it.
//
// Ownership: RunState owns every card (edits go through getCell/placeCard/salvage/discard); this class
// owns only view state: the selected wand, the HELD card {id, origin|null}, the touch SELECTION (tsel),
// focus, scroll. A held card WITH an origin stays in its origin cell in RunState (drawn as a ghost) until
// it is placed — so "back" costs nothing. A held card with NO origin (a reward Take) lives only here.
//
// Placement (v2, §10.3 insert-or-swap on every device): ONE pure function, placementFor() in
// ui/placement.js, decides place / insert / swap. The marker drawn before the drop, the hover preview and
// RunState.placeCard() all read the same result.
//
// Phone mode (§10.1–10.4) = router.device === 'touch': tap selects (no lift), tap a destination moves,
// drag lifts past touchDragThresholdPx with a finger−(0,16) hot spot, a 2× ghost and a delta chip; pane C
// grows touch buttons that replace the footer; every region shifts down 6 px under the taller tab bar.
//
// Snapshot/commit are owned by PauseScene (taken on open, commitEdits(snap) on close); Revert = revert(snap).
// Rebuilds happen on change only (edit, wand select, focus while holding, device switch) — never per frame.

import { C, txt, cardCell, icon, cardKind, setColor } from './kit.js';
import { glyph, richLine, fitText, button, reduced, box, deniedMotion } from './draw.js';
import { Dialog } from './Dialog.js';
import { t } from '../core/i18n.js';
import { EV } from '../core/events.js';
import { Save } from '../core/save.js';
import { T } from '../core/tunables.js';
import { VIEW_W, VIEW_H } from '../config.js';
import { hintLine, ensureHudTextures, hudTex } from './HudKit.js';
import { placementFor } from './placement.js';
import { GhostCoach } from './Ftue.js';
import { Art } from '../core/art.js';
import { cat } from '../data/catalog.js';
import { BREAKING, planKeywords, wandKeywords, cardKeywords } from '../spells/keywords.js';
import { SYM, pmDeg, initSymbols, sec, sec2, num, cardOf, cardName, typeWord, rarityWord, cardRows, modifierLines, castShotsText, castDetailLines, warningText } from './fmt.js';

const SLOT_X = 137, SLOT_Y = 42, PITCH = 38, CELL = 36;
const BAG_X = 137, BAG_Y = 116;
const PV_X = 136, PV_Y = 210, PV_PITCH = 17, PV_LINES = 5;
const C_X = 528, C_Y = 22, C_W = 104, C_H = 318;
const TOUCH_DY = 6;                                   // §10.4 layout: 24 px touch tabs push every region down 6 px
const PANE_BTN = { x: C_X + 2, w: 100, h: 24, hPrimary: 37, gap: 2 };   // §10.1 pane C buttons (hit-size floor)
const BAR = { x: 136, y: 314, w: 150, h: 6, textX: 292 };              // §11.1 mana bar
const same = (a, b) => a && b && a.wand === b.wand && a.slot === b.slot;

// ∞ is not Latin-1: use it only when the baked body font carries it, else the i18n word (§7 glyph rule).
let INF = null;
function infSym(scene) {
  if (INF) return INF;
  const cache = scene.cache.bitmapFont;
  const keys = cache.getKeys ? cache.getKeys() : [];
  const k = keys.find((x) => /body/.test(x)) || keys[0];
  if (!k) return '∞';                                  // canvas-text fallback renders any glyph (not cached)
  INF = ((cache.get(k).data || {}).chars || {})[0x221e] ? '∞' : t('editor.never');
  return INF;
}

export class WandEditor {
  /**
   * @param {Phaser.Scene} scene   PauseScene
   * @param {Phaser.GameObjects.Container} root  the tab content container
   * @param {FocusNav} nav
   * @param {{snap, heldCard?:string, sel?:number}} o
   */
  constructor(scene, root, nav, o) {
    this.scene = scene; this.root = root; this.nav = nav;
    initSymbols(scene);
    ensureHudTextures(scene);                            // hatch_4 (the HUD's low-mana hatch, §11.1)
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
    this.tsel = null;            // touch: the SELECTED (not lifted) card's cell (§10.1)
    this.touchDrag = false;      // touch: a lifted card follows the finger (2× ghost)
    this.scrolling = false;      // touch: a vertical drag is scrolling B9 / C
    this._noTarget = false;      // touch drag: the hot spot is over nothing droppable
    this._bar = null; this._barTw = null;

    // layers (draw order): static frames → regions → overlay → markers → held card
    this.cStatic = scene.add.container(0, 0);
    this.cA = scene.add.container(0, 0); this.cA2 = scene.add.container(0, 0);
    this.cB = scene.add.container(0, 0); this.cBag = scene.add.container(0, 0); this.cSalv = scene.add.container(0, 0);
    this.cPrev = scene.add.container(0, 0); this.cC = scene.add.container(0, 0); this.cFoot = scene.add.container(0, 0);
    this.over = scene.add.graphics();                    // screen-space frames drawn from nav rects
    this.cMark = scene.add.container(0, 0);              // region-space placement markers (§10.3)
    this.cHeld = scene.add.container(0, 0);              // screen space
    root.add([this.cStatic, this.cA, this.cA2, this.cB, this.cBag, this.cSalv, this.cPrev, this.cC, this.cFoot, this.over, this.cMark]);
    nav.raise();
    root.add(this.cHeld);

    this.applyProfile();
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
    // ghost-hand coach (ftue-flow §5.1): engine-derived goal slot, shown after 1.5 s idle (ui/Ftue.js)
    this.ghost = this.coach && this.held ? new GhostCoach(this) : null;
    if (this.ghost) this.buildDetail();

    // pointer: mouse drag-drop / sticky pick / quick move (§3.1); touch select / tap-move / drag (§10.1)
    nav.onPointerDown = (p) => { this.pokeGhost(); return this.pointerDown(p); };
    nav.onPointerMove = (p) => { this.pokeGhost(); return this.pointerMove(p); };
    nav.onPointerUp = (p) => { this.pokeGhost(); return this.pointerUp(p); };
    nav.onWheel = (p, dy) => this.wheel(p, dy);
    // a drag released off the canvas never reaches nav's pointerup: return the card (never lost, §10.1)
    this._upOutside = (p) => { if (this.nav.isActive() && !this.nav.suspended) this.abortDrag(); };
    scene.input.on('pointerupoutside', this._upOutside);
    // device / prompt-family switch: rebuild the profile (footer hints ↔ pane buttons, 6 px shift)
    this._onDevice = () => this.deviceChanged();
    this.bus.on(EV.INPUT_DEVICE, this._onDevice);

    this.bus.emit(EV.FTUE, 'editor-opened');
    if (!o.heldCard) Save.setFlag('editorOpened');
  }

  // ======================================================================================== profile
  /** Touch profile = router.device 'touch' (InputRouter). Sets the 6 px shift and pane C's content floor. */
  applyProfile() {
    this.touch = !!this.router && this.router.device === 'touch';
    this.dy = this.touch ? TOUCH_DY : 0;
    for (const c of [this.cStatic, this.cA, this.cA2, this.cB, this.cBag, this.cSalv, this.cPrev, this.cC, this.cFoot, this.cMark]) c.y = this.dy;
    this.paneBtnTop = C_Y + C_H - 4 - (PANE_BTN.hPrimary + 2 * PANE_BTN.h + 2 * PANE_BTN.gap);
    this.cBottom = this.touch ? this.paneBtnTop - 4 : C_Y + C_H;
  }

  deviceChanged() {
    const was = this.touch;
    if (this.dragging) this.abortDrag();                 // a pending press survives (the switch may BE this tap)
    this.applyProfile();
    if (!this.touch) this.tsel = null;
    if (was !== this.touch) this.buildStatic();
    this.rebuildAll();
    this.drawHeld();
  }

  /** Every focusable goes through here: region-space rect → screen rect (+dy); no hover focus on touch. */
  navAdd(item) {
    item.y += this.dy;
    if (this.touch) item.noHover = true;
    return this.nav.add(item);
  }
  /** Region-space point → screen space (the held card, animations). */
  scr(p) { return p ? { x: p.x, y: p.y + this.dy } : null; }

  // ======================================================================================== model
  probeCombat() {
    try { const rs = this.scene.scene.get('run'); const pr = rs && rs.hudProbe && rs.hudProbe(); return !!(pr && pr.room && pr.room.inCombat); }
    catch (e) { return false; }
  }
  wand(i = this.sel) { return this.run.wands[i]; }
  hasAlways(i = this.sel) { const w = this.wand(i); return !!(w && (w.def.alwaysCast || []).length); }
  slotX(k) { return SLOT_X + (this.hasAlways() ? PITCH : 0) + k * PITCH; }
  cellXY(loc) { return loc.wand === 'bag' ? { x: BAG_X + (loc.slot % 6) * PITCH, y: BAG_Y + Math.floor(loc.slot / 6) * PITCH } : { x: this.slotX(loc.slot), y: SLOT_Y }; }
  /** Region-space cell rect if the cell is on screen (the bag, or a slot of the selected wand). */
  visibleCell(loc) { return loc && (loc.wand === 'bag' || loc.wand === this.sel) ? this.cellXY(loc) : null; }
  locOf(id) {
    if (!id) return null;
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

  /** §10.3: what dropping the held card on `loc` does (the marker, the preview and the drop all use this). */
  planFor(loc) {
    const h = this.held; if (!h || !loc) return null;
    return placementFor(this.run.placementRow(loc.wand), h.origin, loc.slot, h.id);
  }

  /** Hypothetical slots of the selected wand if the held card were dropped on `target`, or null. */
  hypoSlots(target) {
    const h = this.held; if (!h || !target || !this.wand()) return null;
    const sel = this.sel;
    let cur = this.wand().state.slots.slice();
    const before = cur.join('|');
    if (target.kind === 'cell') {
      const plan = this.planFor(target.loc);
      if (!plan || plan.mode === 'none') return null;
      if (target.loc.wand === sel) cur = plan.slots.slice();
      else if (h.origin && h.origin.wand === sel) cur[h.origin.slot] = plan.mode === 'swap' ? plan.displaced : null;
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
    c.removeAll(true);
    // region grounds: text never sits on the live game (accessibility-spec §2.2: text on the #2a2a3a panel)
    c.add(box(s, 4, 20, 128, 322, 'dark'));
    c.add(box(s, 132, 20, 392, 322, 'dark'));
    c.add(txt(s, 8, 182, t('editor.wandStats'), 'T1', { color: C.dim }));      // a11y §2.3 #11: promoted
    c.add(box(s, C_X, C_Y, C_W, C_H, 'dark'));
    c.add(box(s, 380, 116, 136, 74, 'danger'));
    c.add(glyph(s, 386, 122, 'coin'));
    c.add(txt(s, 398, 121, t('editor.salvage'), 'T1'));
    c.add(txt(s, 138, 196, t('editor.previewHead'), 'T1', { color: C.dim }));
    c.add(s.add.graphics().fillStyle(C.slateDark, 1).fillRect(136, 206, 384, 1).fillRect(136, 298, 384, 1));
    this.navAdd({ id: 'salv', x: 380, y: 116, w: 136, h: 74, onConfirm: () => this.confirmOn('salv'),
      nav: { left: 'b:5', up: () => `s:${Math.max(0, this.wand() ? this.wand().def.capacity - 1 : 0)}`, down: () => (this.nav.has('p:0') ? 'p:0' : 'revert') } });
  }

  // ======================================================================================== build
  /** Rebuild every region; the focused id survives (its item object is replaced by the rebuild). */
  rebuildAll() {
    const cur = this.nav.current;
    this.buildWands(); this.buildStats(); this.buildSlots(); this.buildBag(); this.buildSalvage(); this.buildPreview(); this.buildFooter();
    if (cur && this.nav.has(cur)) { this.nav.current = cur; this.nav.refresh(); }
    this.buildDetail();
    if (cur && this.nav.current !== cur && this.nav.has(cur)) { this.nav.current = cur; this.nav.refresh(); }   // pane buttons (touch)
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
      // a11y §2.3 #12: "2/4" in T1 (the word "slots" dropped; B1 says "Slots 2/4")
      c.add(txt(s, x + 40, y + 27, t('editor.fill', { n: filled, cap: w.def.capacity }), 'T1', { color: C.dim }));
      if (i === this.run.activeWand) c.add(glyph(s, x + 109, y + 2, 'hand'));
      // a11y §2.3 #13: ↻ badge promoted to T1, right-aligned
      if (this.changed(i)) c.add(richLine(s, x + 118, y + 27, [{ g: 'recharge' }, sec2(this.run.effectiveRecharge(i))], { role: 'T1', align: 'right' }));
      this.drawCounterPips(c, i, x, y);
      const id = `w:${i}`;
      this.navAdd({ id, x, y, w: 120, h: 40, onConfirm: () => this.confirmOn(id),
        nav: { right: () => 's:0', left: null, up: i > 0 ? `w:${i - 1}` : null,
          down: i < this.run.wands.length - 1 ? `w:${i + 1}` : 'revert' } });
    }
  }

  /**
   * wand-editor-ux §11.3: counter pips right of the "2/4" fill — one 7×7 pip per defence type (shield ← PIERCE,
   * armour ← BLAST, ward ← SHOCK), FILLED when this wand's dry-run fires the countering keyword, HOLLOW when it
   * doesn't (shape, not colour). The pip for the next test's keyword (run.upcomingKeyword) pulses once per open.
   */
  drawCounterPips(c, wandIndex, x, y) {
    const w = this.run.wands[wandIndex]; if (!w) return;
    const k = wandKeywords(this.run, wandIndex);
    const fill = txt(this.scene, 0, 0, t('editor.fill', { n: w.state.slots.filter(Boolean).length, cap: w.def.capacity }), 'T1');
    const px = x + 40 + Math.ceil(fill.width) + 4;
    fill.destroy();
    // the ↻ badge (changed wand) is right-aligned at x + 118: tighten the pitch so the row never reaches it
    this.pipRow(c, k, px, y + 29, this.changed(wandIndex) ? 8 : 9, wandIndex);
  }

  /** One row of 3 counter pips at (x, y), pitch `pitch`: filled (keyword icon) = counters, hollow = doesn't. */
  pipRow(c, k, x, y, pitch, pulseKey = null) {
    const s = this.scene;
    BREAKING.forEach((kw, j) => {
      const px = x + j * pitch, on = !!k[kw];
      let o;
      if (on) {
        const art = Art.getQuiet(`ui.kw_${kw}`);
        o = art ? s.add.image(px, y, art.key, art.frame).setOrigin(0).setDisplaySize(7, 7)
          : s.add.graphics().fillStyle(C.text, 1).fillRect(px, y, 7, 7).fillStyle(C.stroke, 1).fillRect(px + 3, y + 3, 1, 1);
      } else o = s.add.graphics().lineStyle(1, C.dim, 1).strokeRect(px + 0.5, y + 0.5, 6, 6);
      c.add(o);
      // door-threat link (§11.3): the next test's keyword pulses once per open on every wand that counters it
      const key = `${pulseKey}:${kw}`;
      if (on && pulseKey != null && kw === this.run.upcomingKeyword && !reduced() && !(this._pulsed || (this._pulsed = new Set())).has(key)) {
        this._pulsed.add(key);
        s.tweens.add({ targets: o, alpha: 0.2, duration: 160, yoyo: true, repeat: 1, ease: 'Sine.easeInOut' });
      }
    });
    return x + 3 * pitch;
  }

  buildStats() {
    const s = this.scene, c = this.cA2;
    c.removeAll(true);
    const w = this.wand(); if (!w || !this.pv) return;
    const pm = this.run.playerMods, pv = this.pv, d = w.def;
    const star = (b) => (b ? '*' : '');
    const Y0 = 196;                                                   // a11y §2.3 #11: rows start at 196
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
      [t('editor.stat.counters'), ''],                                  // §11.3 A2 row: pips drawn below
    ];
    this.pipRow(c, wandKeywords(this.run, this.sel), 127 - 3 * 9 + 2, Y0 + 9 * 12 + 2, 9);
    // Always cast = the card's 16 px icon (spec A2), the name is in C when the wand card is focused
    (d.alwaysCast || []).forEach((id, k) => c.add(icon(s, 119 - k * 18, Y0 + 8 * 12 + 6, cardOf(id).type === 'projectile' ? 'spells' : 'modifiers', id, 16)));
    rows.forEach(([l, v], r) => {
      c.add(txt(s, 8, Y0 + r * 12, l, 'T1', { color: C.dim }));
      c.add(txt(s, 127, Y0 + r * 12, v, 'T1', { origin: [1, 0] }));
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
    if (this.hasAlways()) c.add(cardCell(s, SLOT_X, SLOT_Y, cardOf(d.alwaysCast[0]), CELL, { virtual: true }));
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
    // a11y §2.3 #14: slot indices dropped (order is left to right; pane C names the slot)
    for (let k = 0; k < cap; k++) {
      const x = this.slotX(k), loc = { wand: this.sel, slot: k };
      const ghost = this.held && this.held.origin && same(this.held.origin, loc);
      const id = ghost ? null : w.state.slots[k];
      const cell = cardCell(s, x, SLOT_Y, cardOf(id), CELL, { isNew: false });
      if (skipped.has(k)) cell.setState('skipped');
      c.add(cell);
      if (badge[k]) c.add(glyph(s, x + 27, SLOT_Y - 3, badge[k]));
      this.cellObjs[`s:${k}`] = cell;
      const fid = `s:${k}`;
      this.navAdd({ id: fid, x, y: SLOT_Y, w: CELL, h: CELL, onConfirm: () => this.confirmOn(fid),
        nav: { up: null, left: k > 0 ? `s:${k - 1}` : `w:${this.sel}`, right: k < cap - 1 ? `s:${k + 1}` : null, down: `b:${Math.min(k, 5)}` } });
    }
    // B4 next-card chevron (or ↻ at slot 1 once changed)
    if (this.changed(this.sel)) c.add(glyph(s, this.slotX(0) + 13, 77, 'recharge'));
    else if (w.state.order.length && !d.shuffle) c.add(glyph(s, this.slotX(this.nextSlot()) + 15, 79, 'chevron'));
    // B5 cast brackets
    if (shown) this.drawBrackets(c, shown, cap);
  }

  /** B5 (v2 lanes): lane 1 y 80–95 = bracket + T1 cast number; lane 2 y 97–101 = dashed wrap line + ↩ only. */
  drawBrackets(c, pv, cap) {
    const s = this.scene;
    if (pv.shuffle) { c.add(txt(s, 136, 84, t('editor.shuffled'), 'T1', { color: C.dim })); return; }   // a11y #15
    const g = s.add.graphics();
    c.add(g);
    const L1 = 88, L2 = 99;                              // line y of lane 1 / lane 2
    const rowEnd = this.slotX(cap - 1) + CELL;
    const seg = (x0, x1, y, dashed, tick) => {
      g.lineStyle(1, C.dim, 1);
      if (dashed) for (let x = x0; x < x1; x += 4) g.lineBetween(x, y + 0.5, Math.min(x + 2, x1), y + 0.5);
      else g.lineBetween(x0, y + 0.5, x1, y + 0.5);
      g.lineBetween(x0 + 0.5, y - tick, x0 + 0.5, y + 0.5);
    };
    const labels = [];
    for (const cs of pv.casts) {
      const recs = cs.drawn.filter((d) => d.slotIndex !== 'always');
      if (!recs.length) continue;
      const wi = recs.findIndex((d) => d.wrapped);
      const pre = wi < 0 ? recs : recs.slice(0, wi), post = wi < 0 ? [] : recs.slice(wi);
      if (pre.length) {
        const a = Math.min(...pre.map((d) => d.slotIndex)), b = Math.max(...pre.map((d) => d.slotIndex));
        const x0 = this.slotX(a) + 2, x1 = post.length ? rowEnd : this.slotX(b) + CELL - 2;
        seg(x0, x1, L1, false, 3);
        if (!post.length) g.lineBetween(x1 - 0.5, L1 - 3, x1 - 0.5, L1 + 0.5);
        labels.push({ x: Math.round((x0 + x1) / 2), n: cs.index });           // a11y #16: T1 at y 84
        if (post.length) c.add(glyph(s, rowEnd + 1, 84, 'wrap'));
      }
      if (post.length) {                                                     // a11y #17: no number on lane 2
        const b = Math.max(...post.map((d) => d.slotIndex));
        const x0 = this.slotX(0) + 2, x1 = this.slotX(b) + CELL - 2;
        c.add(glyph(s, x0 - 1, 93, 'wrap'));
        seg(x0 + 10, x1, L2, true, 2);
        g.lineBetween(x1 - 0.5, L2 - 2, x1 - 0.5, L2 + 0.5);
      }
    }
    for (const l of labels) {
      const lt = txt(s, l.x, 84, String(l.n), 'T1', { origin: [0.5, 0] });
      const hw = Math.ceil(lt.width / 2) + 2;
      g.fillStyle(0x000000, 1).fillRect(l.x - hw, 83, hw * 2, 12);
      c.add(lt);
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
      this.navAdd({ id: fid, x, y, w: CELL, h: CELL, onConfirm: () => this.confirmOn(fid),
        nav: { left: col > 0 ? `b:${k - 1}` : `w:${this.sel}`, right: col < 5 ? `b:${k + 1}` : 'salv',
          up: row > 0 ? `b:${k - 6}` : () => `s:${Math.min(col, (this.wand() ? this.wand().def.capacity : 1) - 1)}`,
          down: row < 1 && k + 6 < cap ? `b:${k + 6}` : () => (this.nav.has('p:0') ? 'p:0' : 'revert') } });
    }
  }

  buildSalvage() {
    const s = this.scene, c = this.cSalv;
    c.removeAll(true);
    const line = this.held ? t('editor.salvageGain', { n: this.run.salvageValue(this.held.id) }) : t('editor.salvageHint');
    c.add(txt(s, 386, 140, line, 'T1', { color: this.held ? C.gold : C.dim, wrap: 124 }));   // a11y #18: T1
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
      this.navAdd({ id: pid, x: 136, y: y - 1, w: 384, h: PV_PITCH, onConfirm: () => {},
        nav: { up: idx > 0 ? `p:${idx - 1}` : 'b:6', down: idx < lines.length - 1 ? `p:${idx + 1}` : 'revert', left: null, right: null } });
    });
    // off-screen lines stay focusable by id (scroll brings them into view)
    lines.forEach((_, idx) => {
      if (idx >= this.pvScroll && idx < this.pvScroll + PV_LINES) return;
      this.nav.add({ id: `p:${idx}`, x: 136, y: -100, w: 1, h: 1, noPointer: true, noRing: true, noHover: true, offscreen: true,
        nav: { up: idx > 0 ? `p:${idx - 1}` : 'b:6', down: idx < lines.length - 1 ? `p:${idx + 1}` : 'revert', left: null, right: null } });
    });
    // a11y #19: "▼ n more" in T1, right-aligned at (519, 286)
    if (lines.length > this.pvScroll + PV_LINES) c.add(richLine(s, 519, 286, [{ g: 'down', color: C.dim }, ' ', t('editor.more', { n: lines.length - this.pvScroll - PV_LINES })], { align: 'right', color: C.dim }));
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
    if (recs.length > max) { c.add(txt(s, x, y, `+${recs.length - max}`, 'T1', { color: C.dim })); x += 14; }   // a11y #20
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
    // line 2: the mana bar, use/s vs regen/s + "runs dry" (§11.1)
    this.buildManaBar(c, pv, before);
    // line 3: Enables chips (Wave D) on the left; the warnings count right-aligned (focus jumps to the first warning)
    this.buildEnablesChips(c, pv, before);
    const nw = pv.warnings.filter((w) => w.id !== 'W7').length;
    if (nw) {
      const first = this.pvLines.findIndex((l) => l.kind === 'warn');
      const rl = richLine(s, 519, 326, [{ g: 'warn' }, ' ', t('editor.warnings', { n: nw })], { color: C.warn, align: 'right' });
      c.add(rl);
      this.navAdd({ id: 'p:sum', x: rl.x - 2, y: 325, w: rl.lineWidth + 4, h: 13, onConfirm: () => this.nav.focus(`p:${first}`),
        nav: { up: this.pvLines.length ? `p:${this.pvLines.length - 1}` : 'b:6', down: 'revert', left: null, right: null } });
    }
    // editor-preview-value-change: gold highlight on a changed summary after a drop (kept under reduced motion)
    if (this._flashSummary) { this._flashSummary = false; r1.list.forEach((o) => o.type !== 'Graphics' && setColor(o, C.warn)); this.scene.time.delayedCall(200, () => r1.active && r1.list.forEach((o) => o.type !== 'Graphics' && setColor(o, C.text))); }
  }

  /**
   * wand-editor-ux §11.2: "Enables: [PIERCE] [BLAST] [SHOCK]" at (138, 326) — the defence-breaking keywords the
   * program's FIRED shots produce this cycle (spells/keywords.js, the same derivation as the HUD pips). While a
   * held card hovers a target: a gained chip flashes in with a "+" prefix, a lost chip shows struck through
   * (a line, not a colour). None → "Enables: -".
   */
  buildEnablesChips(c, pv, before) {
    const s = this.scene;
    const now = planKeywords(pv), was = before ? planKeywords(before) : null;
    let x = 138;
    const head = txt(s, x, 326, t('editor.enables'), 'T1', { color: C.dim });
    c.add(head);
    x += Math.ceil(head.width) + 4;
    const shown = BREAKING.filter((kw) => now[kw] || (was && was[kw]));
    if (!shown.length) { c.add(txt(s, x, 326, t('editor.enablesNone'), 'T1', { color: C.dim })); return; }
    for (const kw of shown) {
      const gained = was && now[kw] && !was[kw], lost = was && !now[kw] && was[kw];
      const label = `${gained ? '+' : ''}${t(`kw.${kw}`)}`;
      const tt = txt(s, x + 11, 326, label, 'T1', { color: lost ? C.dim : C.text });
      const w = 11 + Math.ceil(tt.width) + 3;
      const g = s.add.graphics().fillStyle(C.stroke, 1).fillRect(x, 325, w, 12).lineStyle(1, lost ? C.slateDark : C.slateLight, 1).strokeRect(x + 0.5, 325.5, w - 1, 11);
      c.add(g);
      const art = Art.getQuiet(`ui.kw_${kw}`);
      if (art) c.add(s.add.image(x + 2, 327, art.key, art.frame).setOrigin(0).setDisplaySize(7, 7).setAlpha(lost ? 0.4 : 1));
      else c.add(s.add.graphics().fillStyle(lost ? C.dim : C.text, 1).fillRect(x + 2, 327, 7, 7));
      c.add(tt);
      if (lost) c.add(s.add.graphics().lineStyle(1, C.text, 1).lineBetween(x + 1, 331.5, x + w - 1, 331.5));
      if (gained && !reduced()) { tt.setAlpha(0); s.tweens.add({ targets: tt, alpha: 1, duration: 120 }); }
      x += w + 3;
    }
  }

  /**
   * §11.1 mana bar at (136, 314, 150, 6): full length = max(use/s, regen/s); solid = regen/s; 1 px tick =
   * use/s; use > regen → the overspend is HATCHED (shape, not colour). While a held card hovers a target the
   * bar tweens to the after-state and a ghost tick keeps the before-state (reduced motion: jump).
   */
  buildManaBar(c, pv, before) {
    const s = this.scene, { x: X, y: Y, w: W, h: H } = BAR;
    const rate = (p) => ({ use: p.cycleMs > 0 ? (p.manaPerCycle / p.cycleMs) * 1000 : 0, regen: p.regenPerS });
    const a = rate(pv), b = before ? rate(before) : null;
    const L = Math.max(a.use, a.regen, b ? b.use : 0, b ? b.regen : 0, 1e-6);   // one scale for before & after
    const px = (v) => Math.round((Math.min(v, L) / L) * W);
    const target = { r: px(a.regen), u: px(a.use) };
    const ghost = b ? px(b.use) : null;
    const g = s.add.graphics();
    const ht = hudTex('hatch_4');
    const hatch = s.add.tileSprite(X, Y, 1, H, ht.key, ht.frame).setOrigin(0).setAlpha(0.9).setVisible(false);
    c.add([g, hatch]);
    const paint = (st) => {
      if (!g.active) return;
      const r = Math.round(st.r), u = Math.round(st.u);
      g.clear();
      g.fillStyle(C.stroke, 1).fillRect(X - 1, Y - 1, W + 2, H + 2);
      if (r > 0) { g.fillStyle(C.mana, 1).fillRect(X, Y, r, H); g.fillStyle(C.manaTop, 1).fillRect(X, Y, r, 1); }
      const over = u - r;
      if (over >= 1) { g.fillStyle(C.slateDark, 1).fillRect(X + r, Y, over, H); hatch.setPosition(X + r, Y); hatch.width = over; hatch.setVisible(true); }
      else hatch.setVisible(false);
      if (ghost != null) g.fillStyle(C.text, 0.4).fillRect(X + Math.min(ghost, W - 1), Y - 1, 1, H + 2);
      g.fillStyle(C.text, 1).fillRect(X + Math.min(u, W - 1), Y - 1, 1, H + 2);
    };
    if (this._barTw) { this._barTw.stop(); this._barTw = null; }
    const from = this._bar;
    this._bar = { ...target };
    if (from && (from.r !== target.r || from.u !== target.u) && !reduced()) {
      const st = { ...from };
      paint(st);
      this._barTw = s.tweens.add({ targets: st, r: target.r, u: target.u, duration: T('editorManaBarTweenMs', 120), ease: 'Cubic.easeOut',
        onUpdate: () => paint(st), onComplete: () => { this._barTw = null; paint(target); } });
    } else paint(target);

    // text: "{use}/s use · {regen}/s regen   ✔ Never runs dry" | "⚠ Runs dry after N s" (+ ▲/▼ vs before)
    const use = t('editor.manaUse', { u: Math.round(a.use), r: Math.round(a.regen) });
    const useShort = t('editor.manaUseShort', { u: Math.round(a.use), r: Math.round(a.regen) });
    const verdict = pv.sustainable ? [{ g: 'ok' }, ' ', { t: t('editor.neverDry'), color: C.ok }]
      : [{ g: 'warn' }, ' ', { t: t('editor.runsDry', { n: pv.secondsOfFire }), color: C.warn }];
    const dry = (p) => (p.sustainable ? Infinity : p.secondsOfFire);
    let delta = [], was = [];
    if (before && dry(before) !== dry(pv)) {
      delta = [' ', { g: dry(pv) > dry(before) ? 'up' : 'down' }];
      was = [' ', { t: before.sustainable ? t('editor.wasNever') : t('editor.wasDry', { n: before.secondsOfFire }), color: C.dim }];
    }
    const maxW = 519 - BAR.textX;
    // 227 px right of the bar: the full "use · regen" wording fits only with a short verdict, so the
    // "runs dry" sentence (the one that matters, §11.1) wins and the rates drop their words first.
    const tries = [[use, '  ', ...verdict, ...delta, ...was], [use, '  ', ...verdict, ...delta], [useShort, '  ', ...verdict, ...delta, ...was], [useShort, '  ', ...verdict, ...delta], [useShort, ' ', ...verdict]];
    let rl = null;
    for (const parts of tries) {
      if (rl) rl.destroy();
      rl = richLine(s, BAR.textX, 313, parts, { color: C.dim });
      if (rl.lineWidth <= maxW) break;
    }
    c.add(rl);
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
  setPvScroll(v) {
    const n = Math.max(0, Math.min((this.pvLines ? this.pvLines.length : 0) - PV_LINES, v));
    if (n === this.pvScroll) return;
    this.pvScroll = n; this.buildPreview(); this.nav.raise(); this.root.bringToTop(this.cHeld);
  }
  setCScroll(v) {
    const n = Math.max(0, Math.min(Math.max(0, this.cContentH - (this.cBottom - C_Y) + 8), v));
    if (n === this.cScroll) return;
    this.cScroll = n; this.buildDetail();
  }

  // ---------------------------------------------------------------------------------- detail pane C
  buildDetail() {
    const s = this.scene, c = this.cC;
    c.removeAll(true);
    const x = C_X + 4, W = 96, bottom = this.cBottom;
    let y = C_Y + 4 - this.cScroll;
    const add = (o, h, dy = 0) => { o.y = y + dy; c.add(o); o.setVisible(y >= C_Y && y + h <= bottom); y += h; return o; };
    const line = (str, color = C.text, role = 'T1') => { const o = txt(s, x, 0, str, role, { color, wrap: W }); add(o, Math.max(12, Math.ceil(o.height))); return o; };
    const rows = (list) => list.forEach(([l, v]) => {
      const a = txt(s, x, 0, l, 'T1', { color: C.dim }); const b = txt(s, x + W, 0, v, 'T1', { origin: [1, 0] });
      a.y = y;
      // a long value (e.g. "Splits into 4 on end") wraps onto its own right-aligned line instead of crossing the pane edge
      if (a.width + 6 + b.width > W) { const va = y >= C_Y && y + 12 <= bottom; a.setVisible(va); c.add(a); y += 12; if (b.width > W) { b.destroy(); line(v); return; } }
      b.y = y; const vis = y >= C_Y && y + 12 <= bottom; if (a.y === y) a.setVisible(vis); b.setVisible(vis); if (a.y === y) c.add(a); c.add(b); y += 12;
    });
    const sep = () => { const g = s.add.graphics().fillStyle(C.slateDark, 1).fillRect(x, 0, W, 1); add(g, 5); };

    if (this.reason) { line(this.reason, C.warn); sep(); }
    if (this.coach && this.held) { line((this.ghost && this.ghost.line) || t('editor.coach'), C.gold); sep(); }
    let focus = this.nav.current;
    // touch: while a pane button is focused, C keeps describing the selected card the buttons act on
    if (this.touch && this.tsel && (!focus || focus.startsWith('tb:') || focus === 'revert')) {
      if (this.tsel.wand === 'bag') focus = `b:${this.tsel.slot}`; else if (this.tsel.wand === this.sel) focus = `s:${this.tsel.slot}`;
    }
    // a11y §2.3 #14: the slot index lives here now ("Slot 5"), not over the cells
    if (focus && focus.startsWith('s:')) line(t('editor.slotN', { n: +focus.slice(2) + 1 }), C.dim);
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
    if (this.touch) this.buildPaneButtons(); else this.nav.clear('tb:');
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
    // §11.2: "Enables: [PIERCE]" for a card whose shots carry a breaking keyword; a modifier ADDS it to what follows
    const ck = cardKeywords(cat(), card.id);
    const brk = BREAKING.filter((kw) => ck[kw]).map((kw) => t(`kw.${kw}`));
    if (brk.length) line(card.type === 'projectile' ? t('editor.enablesCard', { kws: brk.join(', ') }) : t('editor.addsKw', { kws: brk.join(', ') }), C.gold);
    const desc = ck.list.filter((kw) => !BREAKING.includes(kw)).concat(card.tags || []);
    if (desc.length) line(t('editor.tagsRow', { tags: [...new Set(desc)].join(', ') }), C.dim);
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

  /** The card pane C's touch buttons act on: the held card, else the touch selection, else the focused card. */
  touchSubject() {
    if (this.held) return this.held.origin ? { loc: this.held.origin, id: this.held.id } : { id: this.held.id };
    if (this.tsel && this.run.getCell(this.tsel)) return { loc: this.tsel, id: this.run.getCell(this.tsel) };
    const loc = this.locOf(this.nav.current);
    const id = loc && this.run.getCell(loc);
    return id ? { loc, id } : null;
  }

  /** §10.1: pane C buttons on touch (replacing RMB / X / Delete / R and the footer): [To bag|To wand] · [Salvage +n] · [Revert]. */
  buildPaneButtons() {
    const s = this.scene, c = this.cC, P = PANE_BTN;
    const subj = this.touchSubject();
    const changed = this.run.anyChanged(this.snap);
    let y = this.paneBtnTop;
    const mk = (id, h, label, kind, enabled, act, reason) => {
      const b = button(s, P.x, y, P.w, h, label, { kind });
      b.setDisabled(!enabled);
      c.add(b);
      this.navAdd({ id, x: P.x, y, w: P.w, h, disabled: !enabled,
        onFocus: () => b.setFocused(true), onBlur: () => b.setFocused(false),
        onDenied: () => { this.mixer.fire('ui_denied'); deniedMotion(s, b.label); this.say(reason); },
        onConfirm: () => { b.press(); act(); } });
      if (this.nav.current === id) b.setFocused(true);
      y += h + P.gap;
    };
    // primary: quick move (whichever applies)
    const inSlot = subj && subj.loc && subj.loc.wand !== 'bag';
    mk('tb:move', P.hPrimary, t(inSlot ? 'editor.btnToBag' : 'editor.btnToWand'), 'primary', !!subj, () => this.touchQuickMove(), t('editor.selectFirst'));
    mk('tb:salv', P.h, subj ? t('editor.btnSalvage', { n: this.run.salvageValue(subj.id) }) : t('editor.btnSalvageNone'), 'button', !!subj,
      () => { const sj = this.touchSubject(); if (sj) this.askSalvage(this.held ? null : sj.loc); }, t('editor.selectFirst'));
    mk('revert', P.h, t('editor.revert'), 'button', changed, () => this.doRevert(), t('editor.nothingChanged'));
    this.nav.linkList(['tb:move', 'tb:salv', 'revert'], 'v', false);
  }

  touchQuickMove() {
    const sj = this.touchSubject(); if (!sj) return;
    if (this.held && !this.held.origin) { this.dropOn({ kind: 'wand', i: this.sel }); return; }   // reward card → wand
    if (this.held) { const loc = this.held.origin; this.cancelHeld(); this.quickMove(loc); return; }
    this.quickMove(sj.loc);
  }

  // ---------------------------------------------------------------------------------------- footer
  buildFooter() {
    const s = this.scene, c = this.cFoot;
    c.removeAll(true);
    if (this.touch) {                          // §10.4: no footer row on touch; pane C's buttons replace it
      this.nav.remove('close'); this.nav.remove('revert');
      this.btnRevert = null; this.btnClose = null;
      return;
    }
    const changed = this.run.anyChanged(this.snap);
    const rv = button(s, 8, 344, 50, 14, t('editor.revert'));
    rv.setDisabled(!changed);
    const cl = button(s, 62, 344, 50, 14, t('editor.close'));
    c.add([rv, cl]);
    this.btnRevert = rv; this.btnClose = cl;
    this.navAdd({ id: 'revert', x: 8, y: 344, w: 50, h: 14, disabled: !changed,
      onFocus: () => rv.setFocused(true), onBlur: () => rv.setFocused(false),
      onDenied: () => { this.mixer.fire('ui_denied'); deniedMotion(s, rv.label); this.say(t('editor.nothingChanged')); },
      onConfirm: () => this.doRevert(), nav: { right: 'close', left: null, up: () => this.upFromFooter(), down: null } });
    this.navAdd({ id: 'close', x: 62, y: 344, w: 50, h: 14, onFocus: () => cl.setFocused(true), onBlur: () => cl.setFocused(false),
      onConfirm: () => this.scene.requestClose(), nav: { left: 'revert', right: null, up: () => this.upFromFooter(), down: null } });
    // device hints (drop trailing hints until they fit; Close is always kept)
    const pad = this.router.promptFamily !== 'kbm';   // G6: [token] strings on a pad family (controller-prompts §3)
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
      ht = hintLine(s, 118, 345, str, this.router);
      if (ht._w <= maxW) break;
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
      const hypo = this._noTarget ? null : this.hypoSlots(this.targetOf(item.id));
      const key = hypo ? hypo.join('|') : '';
      if (key !== this._hypoKey) {
        this._hypoKey = key;
        this.hypoPv = hypo ? this.run.preview(this.sel, hypo) : null;
        this.buildSlots(); this.buildPreview();
        this.nav.raise(); this.root.bringToTop(this.cHeld);
        if (this.nav.has(item.id)) { this.nav.current = item.id; this.nav.refresh(); }
        // §9 audio: a soft tick when the hovered drop raises ≈DPS (on a preview change, never per focus move)
        if (this.hypoPv && this.pv && Math.round(this.hypoPv.dpsSingleTarget) > Math.round(this.pv.dpsSingleTarget)) this.mixer.fire('ui_preview_up');
        this.buildChip();
      }
      this.moveHeldTo(item);
    }
    this.buildDetail();
    this.drawTargetOverlay();
  }

  /**
   * Markers (§3.1, §10.3). Screen-space `over`: the 1 px valid frame on wand cards / salvage. Region-space
   * `cMark`: the touch selection frame, the insert-bar + ▸ shift arrows, the swap-ring, and the translucent
   * displaced card drawn in the origin for a swap. Everything is derived from placementFor → never lies.
   */
  drawTargetOverlay() {
    const g = this.over; g.clear();
    const m = this.cMark; m.removeAll(true);
    this.cA.list.filter((o) => o.__stop).forEach((o) => o.destroy());
    const s = this.scene;
    if (this.tsel && !this.held) {                      // touch selection: 2 px bright frame (not lifted)
      const r = this.visibleCell(this.tsel);
      if (r) m.add(s.add.graphics().lineStyle(2, C.text, 1).strokeRect(r.x + 1, r.y + 1, CELL - 2, CELL - 2));
    }
    if (!this.held) return;
    // full wand cards show ⛔ while holding
    this.run.wands.forEach((w, i) => {
      if (this.run.firstEmptySlot(i) < 0 && !(this.held.origin && this.held.origin.wand === i)) {
        const gl = glyph(s, 8 + 97, 22 + i * 42 + 2, 'stop'); gl.__stop = true; this.cA.add(gl);
      }
    });
    if (this._noTarget) return;
    const it = this.nav.cur(); const tg = it && this.targetOf(it.id);
    if (!tg) return;
    if (tg.kind !== 'cell') {
      if (tg.kind === 'wand' && this.run.firstEmptySlot(tg.i) < 0) return;
      g.lineStyle(1, C.text, 1).strokeRect(it.x + 2.5, it.y + 2.5, it.w - 5, it.h - 5);
      return;
    }
    const plan = this.planFor(tg.loc);
    if (!plan || plan.mode === 'none') return;
    const q = s.add.graphics(); m.add(q);
    const cell = this.cellXY(tg.loc);
    if (plan.mode === 'insert') {
      // insert-bar: 2 px × 40 px in the gap at the target cell's left edge (1 px keyline each side)
      q.fillStyle(C.stroke, 1).fillRect(cell.x - 3, cell.y - 3, 4, 42);
      q.fillStyle(C.text, 1).fillRect(cell.x - 2, cell.y - 2, 2, 40);
      for (const sh of plan.shifts) {                   // ▸ / ◂ over every card that will shift
        const p = this.cellXY({ wand: tg.loc.wand, slot: sh.from });
        const cx = p.x + 18, top = p.y - 7;
        if (plan.dir > 0) { q.fillStyle(C.stroke, 1).fillTriangle(cx - 3, top - 1, cx - 3, top + 7, cx + 2, top + 3); q.fillStyle(C.text, 1).fillTriangle(cx - 2, top + 1, cx - 2, top + 5, cx + 1, top + 3); }
        else { q.fillStyle(C.stroke, 1).fillTriangle(cx + 3, top - 1, cx + 3, top + 7, cx - 2, top + 3); q.fillStyle(C.text, 1).fillTriangle(cx + 2, top + 1, cx + 2, top + 5, cx - 1, top + 3); }
      }
    } else {
      // swap-ring (also the place marker): a 2 px ring around the target cell
      q.lineStyle(2, C.text, 1).strokeRect(cell.x - 1, cell.y - 1, CELL + 2, CELL + 2);
      if (plan.mode === 'swap' && plan.displaced && this.held.origin) {
        const o = this.visibleCell(this.held.origin);
        if (o) m.add(cardCell(s, o.x, o.y, cardOf(plan.displaced), CELL).setAlpha(0.45));
      }
    }
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
    this.tsel = null;
    this.mixer.fire('ui_card_pick');
    this._hypoKey = null; this.hypoPv = null;
    this.rebuildAll();
    this.drawHeld(this.scr(this.cellXY(loc)));
    this.onFocus(this.nav.cur());
    return true;
  }

  /** Drop the held card on a target (§10.3 via placementFor → RunState.placeCard). `fromXY` = screen space. */
  dropOn(tg, fromXY = this.heldPos()) {
    const h = this.held; if (!h || !tg) return;
    const run = this.run;
    if (tg.kind === 'salv') { this.askSalvage(); return; }
    let loc;
    if (tg.kind === 'wand') {
      const fe = run.firstEmptySlot(tg.i);
      if (fe < 0) { this.mixer.fire('ui_denied'); this.say(t('editor.wandFull')); return; }
      loc = { wand: tg.i, slot: fe };
      this.sel = tg.i;
    } else loc = tg.loc;
    if (h.origin && same(h.origin, loc)) { this.cancelHeld(); return; }
    const plan = this.planFor(loc);
    if (!plan || plan.mode === 'none') { this.cancelHeld(); return; }
    const res = run.placeCard(h.origin || { held: h.id }, loc, plan.mode);
    if (!res) { this.mixer.fire('ui_denied'); return; }
    const placedKind = cardOf(h.id).type;
    const origin = h.origin;
    this.held = res.handOver ? { id: res.handOver, origin: null, fromReward: true } : null;
    if (loc.wand !== 'bag') {
      this.bus.emit(EV.FTUE, 'card-slotted');
      if (placedKind !== 'projectile') { Save.setFlag('slotModifier'); this.coach = false; }
    }
    this.mixer.fire(res.mode === 'swap' ? 'ui_card_swap' : 'ui_card_place');
    this.afterEdit();
    // motion: held → landing (90 ms) + seat; shifted cards slide one pitch; a swapped card → origin (120 ms)
    const land = { wand: loc.wand, slot: res.landing };
    this.animArrive(land, fromXY, 90);
    for (const sh of res.shifts) this.animArrive({ wand: loc.wand, slot: sh.to }, this.scr(this.cellXY({ wand: loc.wand, slot: sh.from })), 90, true);
    if (res.mode === 'swap' && origin) this.animArrive(origin, this.scr(this.cellXY(loc)), 120, true);
    if (loc.wand !== 'bag') this.tick(land);
    if (res.handOver) this.drawHeld(this.scr(this.cellXY(loc)));
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

  /** Any editor input re-arms the ghost coach's idle timer (and kills a running demo). */
  pokeGhost() { if (this.ghost) this.ghost.poke(); }

  afterEdit(flash = true) {
    if (this.ghost) { if (!this.coach || !this.held) { this.ghost.destroy(); this.ghost = null; } else this.ghost.recompute(); }
    this._hypoKey = null; this.hypoPv = null;
    this.tsel = null;                                   // a touch selection is consumed by any edit
    this.recompute();
    this._flashSummary = flash;
    const cur = this.nav.current;
    this.rebuildAll();
    if (cur && this.nav.has(cur)) { this.nav.current = cur; this.nav.refresh(); }
    this.drawHeld();
    this.onFocus(this.nav.cur());
  }

  /** Slide a rebuilt cell from `from` (SCREEN space) to its home. */
  animArrive(loc, from, ms, displaced = false) {
    const obj = this.cellObjs[loc.wand === 'bag' ? `b:${loc.slot}` : (loc.wand === this.sel ? `s:${loc.slot}` : null)];
    if (!obj || !from) return;
    if (reduced()) { if (displaced) { obj.setAlpha(0.6); this.scene.time.delayedCall(33, () => obj.active && obj.setAlpha(1)); } return; }
    const hx = obj.x, hy = obj.y;
    obj.setPosition(from.x, from.y - this.dy);
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

  /** Quick move (RMB / X / touch [To bag|To wand]): slot → first free bag cell; bag → first empty slot. */
  quickMove(loc) {
    const run = this.run;
    const id = run.getCell(loc); if (!id) return;
    let to;
    if (loc.wand === 'bag') {
      const fe = this.wand() ? run.firstEmptySlot(this.sel) : -1;
      if (fe < 0) { this.mixer.fire('ui_denied'); this.say(t('editor.wandFull')); return; }
      to = { wand: this.sel, slot: fe };
    } else {
      const fb = run.firstFreeBag();
      if (fb < 0) { this.mixer.fire('ui_denied'); this.say(t('editor.bagFullReason')); return; }
      to = { wand: 'bag', slot: fb };
    }
    if (!run.placeCard(loc, to, 'place')) { this.mixer.fire('ui_denied'); return; }
    if (to.wand !== 'bag') {
      this.bus.emit(EV.FTUE, 'card-slotted');
      if (cardOf(id).type !== 'projectile') Save.setFlag('slotModifier');
    }
    this.mixer.fire('ui_card_place'); this.afterEdit(); this.animArrive(to, this.scr(this.cellXY(loc)), 90);
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
    this._hypoKey = null; this.hypoPv = null; this._bar = null;
    this.recompute();
    const cur = this.nav.current;
    this.rebuildAll();
    let f = cur;
    if (cur && cur.startsWith('s:') && !this.nav.has(cur)) f = `s:${this.wand().def.capacity - 1}`;
    if (f && this.nav.has(f)) this.nav.focus(f, { silent: true }); else this.nav.focus(`s:0`, { silent: true });
    this.onFocus(this.nav.cur());
  }

  /** confirm on a focusable (A / Enter / click). A on a filled slot while holding = §10.3 (insert or swap). */
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
    this.pokeGhost();
    this.pointerMode = false;
    if (a === 'back') {
      if (this.held) { this.cancelHeld(); return true; }
      if (this.tsel) { this.tsel = null; this.drawTargetOverlay(); this.buildDetail(); return true; }
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
        if (pvScrollable && !(this.cContentH > this.cBottom - C_Y && !(it && it.id.startsWith('p:')))) this.setPvScroll(this.pvScroll + d);
        else this.setCScroll(this.cScroll + d * 24);
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
    if (p.wasTouch) return this.touchDown(p);
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
    if (p.wasTouch || this.touchDrag || this.scrolling || (this.press && this.press.touch)) { this.touchMove(p); return; }
    this.pointerMode = true;
    if (this.press && !this.held && Math.hypot(p.x - this.press.x, p.y - this.press.y) >= T('mouseDragThresholdPx', 4)) {
      const loc = this.locOf(this.press.id);
      this.dragging = true;
      this.pick(loc);
    }
    if (this.held) this.drawHeld();
  }

  pointerUp(p) {
    if (p.wasTouch || this.touchDrag || this.scrolling || (this.press && this.press.touch)) { this.touchUp(p); return; }
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
    const d = dy > 0 ? 1 : -1, ly = p.y - this.dy;
    if (p.x >= C_X && ly >= C_Y) this.setCScroll(this.cScroll + d * 24);
    else if (p.x >= 136 && p.x < 520 && ly >= 194 && this.pvLines && this.pvLines.length > PV_LINES) this.setPvScroll(this.pvScroll + d);
  }

  // ------------------------------------------------------------------------------ touch (§10.1–10.2)
  /** Touch press: editor items are handled on RELEASE (tap) or on travel (drag / scroll); buttons stay nav's. */
  touchDown(p) {
    this.pointerMode = false;
    const it = this.nav.hit(p.x, p.y);
    const id = it ? it.id : null;
    if (id && (id.startsWith('tb:') || id === 'revert' || id === 'close')) return false;   // tap = focus + activate
    const ly = p.y - this.dy;
    const inPv = p.x >= 136 && p.x < 520 && ly >= 194 && ly < 340;
    const inC = p.x >= C_X && p.x < C_X + C_W && ly >= C_Y && ly < this.cBottom;
    const mine = id && (/^[sbwp]:/.test(id) || id === 'salv');
    if (!mine && !inPv && !inC) {
      if (this.tsel && !id) { this.tsel = null; this.drawTargetOverlay(); }   // tap on empty space: deselect
      return false;
    }
    this.press = { id, x: p.x, y: p.y, touch: true, scroll: inPv ? 'pv' : inC ? 'c' : null, pv0: this.pvScroll, c0: this.cScroll };
    return true;
  }

  touchMove(p) {
    this._tp = { x: p.x, y: p.y };
    const press = this.press;
    if (press && press.touch && !press.dead && !this.touchDrag && !this.scrolling) {
      const dx = p.x - press.x, dy = p.y - press.y;
      if (Math.hypot(dx, dy) > T('touchDragThresholdPx', 6)) {
        const loc = this.locOf(press.id);
        if (press.scroll && Math.abs(dy) >= Math.abs(dx)) this.scrolling = true;          // B9 / C: scroll, nothing activates
        else if (loc && !this.held && this.run.getCell(loc)) {                             // lift (§10.1 drag)
          this.touchDrag = true; this.dragging = true; this._noTarget = false;
          this.pick(loc);
        } else press.dead = true;                                                           // travel cancels the tap
      }
    }
    if (this.scrolling && press) {
      const dy = p.y - press.y;
      if (press.scroll === 'pv') this.setPvScroll(press.pv0 + Math.round(-dy / PV_PITCH));
      else this.setCScroll(press.c0 - dy);
      return;
    }
    if (this.touchDrag && this.held) {
      this.touchHover(p);
      this.drawHeld();
    }
  }

  /** §10.2 hot spot: the drop target is the cell under finger − (0, touchHotspotOffsetPx). */
  hotItem(p) {
    const it = this.nav.hit(p.x, p.y - T('touchHotspotOffsetPx', 16));
    return it && this.targetOf(it.id) ? it : null;
  }
  touchHover(p) {
    const it = this.hotItem(p);
    if (it) {
      const wasNone = this._noTarget;
      this._noTarget = false; this.nav.hideRing(false);
      if (it.id !== this.nav.current) this.nav.focus(it.id, { silent: true });
      else if (wasNone) this.onFocus(it);
    } else if (!this._noTarget) {
      this._noTarget = true; this.nav.hideRing(true);
      this.onFocus(this.nav.cur());
    }
  }

  touchUp(p) {
    const press = this.press; this.press = null;
    if (this.scrolling) { this.scrolling = false; return; }
    if (this.touchDrag) {
      const it = p.wasCanceled ? null : this.hotItem(p);            // pointercancel / off-target → back to origin
      this.endTouchDrag();
      const tg = it && this.targetOf(it.id);
      if (tg) { this.nav.focus(it.id, { silent: true }); this.dropOn(tg); } else this.cancelHeld();
      return;
    }
    if (!press || press.dead || p.wasCanceled) return;
    const it = this.nav.hit(p.x, p.y);
    if (!it || it.id !== press.id) return;
    this.touchTap(it);
  }

  endTouchDrag() {
    this.touchDrag = false; this.dragging = false;
    this._noTarget = false; this.nav.hideRing(false);
    if (this.heldObj) this.heldObj.setScale(1);
    this.clearChip();
  }

  /** A drag that can't complete (released off the canvas, device switch): the card returns to its origin. */
  abortDrag() {
    this.press = null; this.scrolling = false;
    if (!this.dragging) return;
    const wasTouch = this.touchDrag;
    this.dragging = false;
    if (wasTouch) this.endTouchDrag();
    this.cancelHeld();
  }

  /** §10.1 tap: select (no lift) · tap again deselects · tap a destination while selected = move there (§10.3). */
  touchTap(it) {
    const id = it.id, tg = this.targetOf(id);
    if (this.held) {                                     // an origin-less reward card: tap places it
      if (tg) { this.nav.focus(id, { silent: true }); this.dropOn(tg); } else this.nav.focus(id, { silent: true });
      return;
    }
    if (this.tsel) {
      const from = this.tsel;
      if (tg && tg.kind === 'cell' && same(tg.loc, from)) { this.tsel = null; this.mixer.fire('ui_back'); this.drawTargetOverlay(); this.buildDetail(); return; }
      if (tg && tg.kind === 'salv') { this.askSalvage(from); return; }
      if (tg) {
        const cardId = this.run.getCell(from);
        if (!cardId) { this.tsel = null; return; }
        this.nav.focus(id, { silent: true });
        const h = { id: cardId, origin: from };
        this.held = h;
        this.dropOn(tg, this.scr(this.visibleCell(from)));
        if (this.held === h) { this.held = null; this.tsel = from; this.rebuildAll(); }   // denied: stay selected
        return;
      }
      this.nav.focus(id, { silent: true });              // a preview line: inspect only
      return;
    }
    if (id.startsWith('w:')) { this.selectWand(+id.slice(2)); return; }
    this.nav.focus(id, { silent: true });
    if (tg && tg.kind === 'cell' && this.run.getCell(tg.loc)) { this.tsel = tg.loc; this.mixer.fire('ui_move'); }
    else if (id === 'salv') { this.mixer.fire('ui_denied'); this.say(t('editor.salvagePickFirst')); return; }
    this.drawTargetOverlay(); this.buildDetail();
  }

  // ----------------------------------------------------------------------------------- held card
  heldPos() {
    if (!this.held) return null;
    if (this.heldObj) return { x: this.heldObj.x, y: this.heldObj.y };
    return null;
  }

  /**
   * Held-card sprite (screen space). Mouse = cursor +2,+2 at 90% alpha with a 1 px shadow; keys/pad = 4 px
   * above the focused cell; touch drag = the 2× ghost at finger − (0, 56), clamped, flipped below near the top.
   */
  drawHeld(fromXY) {
    if (!this.held) { if (this.heldObj) { this.heldObj.destroy(); this.heldObj = null; this.heldId = null; } this.clearChip(); return; }
    const scale = this.touchDrag ? 2 : 1;
    if (!this.heldObj || this.heldId !== this.held.id) {
      if (this.heldObj) this.heldObj.destroy();
      const c = this.scene.add.container(0, 0);
      c.add(this.scene.add.rectangle(1, 1, CELL, CELL, 0x222222, 0.6).setOrigin(0));
      c.add(cardCell(this.scene, 0, 0, cardOf(this.held.id), CELL));
      c.setAlpha(0.9).setScale(scale);
      this.cHeld.add(c);
      this.heldObj = c; this.heldId = this.held.id;
      if (fromXY) c.setPosition(fromXY.x, fromXY.y);
      const to = this.heldTarget();
      if (fromXY && to && !reduced()) this.scene.tweens.add({ targets: c, x: to.x, y: to.y, duration: 66, ease: 'Cubic.easeOut' });
      else if (to) c.setPosition(to.x, to.y);
      this.placeChip();
      return;
    }
    this.heldObj.setScale(scale);
    if (this.pointerMode || this.touchDrag) { const to = this.heldTarget(); if (to) this.heldObj.setPosition(to.x, to.y); }
    this.placeChip();
  }

  heldTarget() {
    if (this.touchDrag) {
      const p = this._tp || this.scene.input.activePointer;
      const S = CELL * 2, off = T('touchGhostOffsetPx', 56);
      const cy = p.y < T('touchGhostFlipYPx', 72) ? p.y + off : p.y - off;
      return { x: Math.max(0, Math.min(VIEW_W - S, Math.round(p.x - S / 2))), y: Math.max(0, Math.min(VIEW_H - S, Math.round(cy - S / 2))) };
    }
    if (this.pointerMode) {
      const p = this.scene.input.activePointer;
      return { x: Math.round(p.x + 2), y: Math.round(p.y + 2) };
    }
    const it = this.nav.cur();
    if (!it) return null;
    return { x: it.x + Math.round((it.w - CELL) / 2), y: it.y + Math.round((it.h - CELL) / 2) - 4 };
  }

  moveHeldTo(item) {
    if (!this.heldObj || this.pointerMode || this.touchDrag) return;
    const to = this.heldTarget(); if (!to) return;
    if (reduced()) { this.heldObj.setPosition(to.x, to.y); return; }
    this.scene.tweens.add({ targets: this.heldObj, x: to.x, y: to.y, duration: 50, ease: 'Cubic.easeOut' });
  }

  /**
   * §10.2 delta chip beside the 2× ghost (touch drag over a valid target only): "DPS 15→25 ▲" /
   * "mana 8 s→∞" — the same dry-run as the §5.3 summary, kept next to the eye while the finger covers it.
   */
  buildChip() {
    this.clearChip();
    if (!this.touchDrag || !this.hypoPv || !this.pv) return;
    const s = this.scene, a = this.pv, b = this.hypoPv;
    const dps = (p) => Math.round(p.dpsSingleTarget);
    const dd = dps(b) - dps(a);
    const dry = (p) => (p.sustainable ? infSym(s) : t('editor.chipSec', { n: p.secondsOfFire }));
    const dryN = (p) => (p.sustainable ? Infinity : p.secondsOfFire);
    const l1 = [t('editor.chipDps', { a: dps(a), b: dps(b), to: SYM.to })];
    if (dd) l1.push(' ', { g: dd > 0 ? 'up' : 'down' });
    const l2 = [t('editor.chipMana', { a: dry(a), b: dry(b), to: SYM.to })];
    if (dryN(b) !== dryN(a)) l2.push(' ', { g: dryN(b) > dryN(a) ? 'up' : 'down' });
    const c = s.add.container(0, 0);
    const g = s.add.graphics();
    const r1 = richLine(s, 4, 2, l1), r2 = richLine(s, 4, 14, l2);
    const w = Math.max(r1.lineWidth, r2.lineWidth) + 8, h = 26;
    g.fillStyle(C.stroke, 1).fillRect(0, 0, w, h).fillStyle(C.panel, 1).fillRect(1, 1, w - 2, h - 2);
    c.add([g, r1, r2]);
    c.chipW = w; c.chipH = h;
    this.cHeld.add(c);
    this.chipObj = c;
    this.placeChip();
  }
  placeChip() {
    const c = this.chipObj, o = this.heldObj;
    if (!c || !o) return;
    const S = CELL * 2;
    let x = o.x + S + 4;
    if (x + c.chipW > VIEW_W) x = o.x - c.chipW - 4;                 // near the right edge: to the left
    const y = Math.max(0, Math.min(VIEW_H - c.chipH, o.y + Math.round((S - c.chipH) / 2)));
    c.setPosition(Math.max(0, x), y);
  }
  clearChip() { if (this.chipObj) { this.chipObj.destroy(); this.chipObj = null; } }

  /** Can the editor close right now? (held card with nowhere to go → D3, never a trap) */
  tryRelease() {
    if (!this.held) return true;
    return this.cancelHeld() && !this.held;
  }

  destroy() {
    if (this.ghost) { this.ghost.destroy(); this.ghost = null; }
    this.nav.onPointerDown = null; this.nav.onPointerMove = null; this.nav.onPointerUp = null; this.nav.onWheel = null;
    if (this._barTw) { this._barTw.stop(); this._barTw = null; }
    this.scene.input.off('pointerupoutside', this._upOutside);
    this.bus.off(EV.INPUT_DEVICE, this._onDevice);
  }
}

export { cardKind };
