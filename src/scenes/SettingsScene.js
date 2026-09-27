// SettingsScene — S6 (+ S6k rebind capture, D6 reset) per settings-spec.md. Modal from Title or Pause.
// Every change applies live and saves immediately (Save's 500 ms debounce); there is no Apply/Cancel.
// Writes go through Save only, then the consumer is notified: volumes → mixer.refreshVolumes(),
// scaleMode → display.apply(), bindings → router.applyBindings(Save.settings.bindings), and every
// change → bus 'settings:changed' (key, value). Data: { from:'title'|'pause', group? }.

import Phaser from '../../lib/phaser.esm.min.js';
import { UI_W, UI_H, fullRect } from '../ui/uiSpace.js';   // 640×360 overlay design space
import { modalChrome } from './overlay.js';
import { FocusNav } from '../ui/nav.js';
import { Dialog } from '../ui/Dialog.js';
import { C, txt, drawPanel } from '../ui/kit.js';
import { box, reduced, richLine, glyph } from '../ui/draw.js';
import { Save } from '../core/save.js';
import { EV } from '../core/events.js';
import { T } from '../core/tunables.js';
import { t } from '../core/i18n.js';
import { KBM_DEFAULTS } from '../input/bindings.js';
import { promptListText } from '../input/prompts.js';
import { hintLine } from '../ui/HudKit.js';
import { canTouch } from '../platform/display.js';
import { canVibrate } from '../input/Rumble.js';

// Defaults are settings-spec §1 (the save module owns validation; this table owns the "Reset group" values).
const GROUPS = [
  { k: 'audio', rows: [
    { k: 'masterVolume', type: 'slider', step: 5, def: 80, cue: 'ui_confirm' },
    { k: 'musicVolume', type: 'slider', step: 5, def: 70, cue: null },
    { k: 'sfxVolume', type: 'slider', step: 5, def: 90, cue: 'hit_enemy' },
    { k: 'uiVolume', type: 'slider', step: 5, def: 80, cue: 'ui_move' },
    { k: 'muteOnFocusLoss', type: 'toggle', def: true },
  ] },
  { k: 'display', rows: [
    { k: 'scaleMode', type: 'enum', values: ['auto', 'integer', 'fill'], def: 'auto', descPer: true },
    { k: '__fullscreen', type: 'toggle', action: true },
    { k: 'bloom', type: 'toggle', def: false },
    { k: 'showFps', type: 'toggle', def: false },
  ] },
  { k: 'comfort', preview: true, rows: [
    { k: 'reducedMotion', type: 'enum', values: [null, true, false], def: null },
    { k: 'screenShake', type: 'slider', step: 10, def: 100, pct: true },
    { k: 'flashIntensity', type: 'slider', step: 10, def: 100, pct: true },
    { k: 'vibration', type: 'enum', values: ['off', 'low', 'high'], def: 'low', noPreview: true },   // controller-prompts §7
    { k: 'haptics', type: 'enum', values: ['off', 'low', 'high'], def: 'low', noPreview: true, touchOnly: true },   // settings-spec §6
    { k: 'enemyShotEmphasis', type: 'enum', values: ['standard', 'high'], def: 'standard' },
    { k: 'damageNumbers', type: 'toggle', def: true },
    { k: 'showHitbox', type: 'toggle', def: false },
  ] },
  { k: 'gameplay', preview: true, rows: [
    { k: 'castMode', type: 'enum', values: ['hold', 'toggle'], def: 'hold', descPer: true },
    { k: 'aimAssist', type: 'slider', step: 10, def: 100, pct: true },
    // controller-prompts §7 fallback placement: the Controls table fills its group, so Button prompts sits here
    { k: 'promptStyle', type: 'enum', values: ['auto', 'xbox', 'playstation'], def: 'auto', noPreview: true },
    { k: 'tutorialHints', type: 'toggle', def: true },
    { k: '__resetTutorial', type: 'button' },
  ] },
  // settings-spec §6 touch rows. DEVIATION (documented): a "Touch" rail group instead of a sub-heading above the
  // Controls table — the 15-row bindings table fills the Controls group at 640×360 and it has no scroller yet.
  { k: 'touch', touchOnly: true, rows: [
    { k: 'touchControls', type: 'enum', values: ['auto', 'on', 'off'], def: 'auto', descPer: true, noPreview: true },
    { k: 'touchFire', type: 'enum', values: ['auto', 'stick'], def: 'auto', descPer: true, noPreview: true },
    { k: 'touchStickSide', type: 'enum', values: ['standard', 'swapped'], def: 'standard', descPer: true, noPreview: true },
  ] },
  { k: 'controls', controls: true, rows: [] },
  { k: 'data', rows: [
    { k: 'language', type: 'enum', values: ['en'], def: 'en', disabled: true },
    { k: '__resetProgress', type: 'button', danger: true },
  ] },
];
// Controls table (settings-spec §2). Esc (pause) and mouse aim are locked.
const ACTIONS = ['moveUp', 'moveDown', 'moveLeft', 'moveRight', 'cast', 'dash', 'interact', 'wandNext', 'wandPrev', 'wand1', 'wand2', 'wand3', 'inventory', 'pause'];

const ROW_Y = 30, LABEL_X = 160, CTRL_R = 616;
let ROW_H = 18, RAIL_H = 20, RAIL_Y = 30;          // settings-spec §6: 24 px pitch (rows and rail) in the touch profile

export function codeName(code) {
  if (!code) return '-';
  const M = { Mouse0: 'LMB', Mouse1: 'MMB', Mouse2: 'RMB', WheelUp: t('settings.key.wheelUp'), WheelDown: t('settings.key.wheelDown'), Escape: 'Esc', Space: t('settings.key.space'),
    ArrowUp: t('settings.key.up'), ArrowDown: t('settings.key.down'), ArrowLeft: t('settings.key.left'), ArrowRight: t('settings.key.right'),
    ShiftLeft: 'L Shift', ShiftRight: 'R Shift', ControlLeft: 'L Ctrl', ControlRight: 'R Ctrl', AltLeft: 'L Alt', AltRight: 'R Alt', Backquote: '`' };
  if (M[code]) return M[code];
  return code.replace(/^Key/, '').replace(/^Digit/, '').replace(/^Numpad/, 'Num ');
}

export class SettingsScene extends Phaser.Scene {
  constructor() { super('settings'); }

  init(data) { this.args = data || {}; }

  create() {
    // settings-spec §6: touch rows only on a touch-capable device or once a touch was seen this session
    const rt = this.registry.get('router');
    this.touchCapable = canTouch() || !!(rt && rt.touch && rt.touch.seen);
    this.G = GROUPS.filter((g) => !g.touchOnly || this.touchCapable);
    this.touchUi = !!(rt && rt.touchProfile);
    ROW_H = this.touchUi ? 24 : 18; RAIL_H = this.touchUi ? 24 : 20; RAIL_Y = this.touchUi ? 44 : 30;   // rail clears the Back button
    this.m = modalChrome(this, {});
    Object.assign(this, { router: this.m.router, flow: this.m.flow, bus: this.m.bus, mixer: this.m.mixer, display: this.m.display });
    this.__dialog = null; this.capture = null; this.closing = false;
    const top = () => this.flow.top() === 'settings' && !this.__dialog && !this.capture && !this.closing;
    const p = this.p = this.m.panel;
    p.add(box(this, 8, 4, 624, 354, 'ornate'));
    const hx = this.touchUi ? 44 : 16;                 // touch: the modal Back button owns the top-left 40×40
    p.add(txt(this, hx, 8, t('settings.title'), 'T2'));
    p.add(txt(this, hx + 70, 10, t(this.args.from === 'pause' ? 'settings.crumbPause' : 'settings.crumbTitle'), 'T1', { color: C.dim }));   // §2.3 #23
    this.nav = new FocusNav(this, { layer: p, isActive: top, onMove: (it) => this.onMove(it) });
    this.railC = this.add.container(0, 0); this.contentC = this.add.container(0, 0);
    this.previewC = this.add.container(0, 0); this.descC = this.add.container(0, 0); this.footC = this.add.container(0, 0);
    p.add([this.railC, this.contentC, this.previewC, this.descC, this.footC]);
    p.add(box(this, 152, 314, 472, 28, 'dark'));
    p.bringToTop(this.descC);
    this.group = this.G.findIndex((g) => g.k === this.args.group);
    const startInGroup = this.group >= 0;
    if (this.group < 0) this.group = 0;
    this.buildRail();
    this.buildGroup();
    this.buildFooter();
    this.nav.raise();
    if (startInGroup) this.nav.focus(this.firstRowId(), { silent: true, snap: true });
    else this.nav.focus(`g:${this.group}`, { silent: true, snap: true });
    this.onMove(this.nav.cur());
    this.lastCue = 0;
  }

  // ---------------------------------------------------------------------------------------- rail
  paintRail() {
    const c = this.railC; c.removeAll(true);
    this.G.forEach((g, i) => {
      const y = RAIL_Y + i * RAIL_H, on = i === this.group;
      if (on) c.add(this.add.rectangle(16, y + 2, 2, RAIL_H - 4, C.gold).setOrigin(0));
      c.add(txt(this, 24, y + Math.round((RAIL_H - 14) / 2), t(`settings.group.${g.k}`), 'T1', { color: on ? C.text : C.dim }));
    });
  }

  buildRail() {
    this.paintRail();
    this.G.forEach((g, i) => {
      const y = RAIL_Y + i * RAIL_H;
      this.nav.add({ id: `g:${i}`, x: 16, y, w: 120, h: RAIL_H, rail: true,
        onFocus: () => { if (this.group !== i) { this.group = i; this.paintRail(); this.buildGroup(); this.nav.raise(); } },
        onConfirm: () => this.enterGroup(), onRight: () => this.enterGroup() });
    });
    this.nav.linkList(this.G.map((_, i) => `g:${i}`), 'v', true);
    for (let i = 0; i < this.G.length; i++) this.nav.get(`g:${i}`).nav.left = null;
  }

  enterGroup() { const id = this.firstRowId(); if (id) this.nav.focus(id); }
  firstRowId() { return this.rowIds && this.rowIds[0]; }

  // --------------------------------------------------------------------------------------- group
  buildGroup() {
    const c = this.contentC; c.removeAll(true);
    this.previewC.removeAll(true);
    this.nav.clear('r:'); this.nav.clear('k:');
    const g = this.G[this.group];
    this.rowIds = [];
    this.rowObjs = {};
    if (g.controls) { this.buildControls(); return; }
    const rows = [...g.rows.filter((r) => !r.touchOnly || this.touchCapable).map((r) => (r.k === 'haptics' && !canVibrate() ? { ...r, disabled: true } : r)), { k: '__resetGroup', type: 'button' }];
    rows.forEach((row, i) => {
      const y = ROW_Y + i * ROW_H, id = `r:${i}`;
      const rc = this.add.container(0, 0); c.add(rc);
      this.rowObjs[id] = { rc, row, y };
      this.drawRow(id);
      this.rowIds.push(id);
      this.nav.add({ id, x: 156, y: y - 1, w: 464, h: ROW_H, row, disabled: !!row.disabled,
        onDenied: () => { this.mixer.fire('ui_denied'); },
        onLeft: row.type === 'slider' || row.type === 'enum' || row.type === 'toggle' ? () => this.change(id, -1) : null,
        onRight: row.type === 'slider' || row.type === 'enum' || row.type === 'toggle' ? () => this.change(id, +1) : null,
        onConfirm: () => this.activate(id), onClick: (p) => this.click(id, p) });
    });
    this.nav.linkList(this.rowIds, 'v', false);
    for (const id of this.rowIds) this.nav.get(id).nav.left = `g:${this.group}`;
    if (g.preview) this.buildPreview();
  }

  label(row) {
    if (row.k === '__resetGroup') return t('settings.resetGroup');
    return t(`settings.row.${row.k}`);
  }
  valueOf(row) { return row.action ? this.display.isFullscreen : Save.settings[row.k]; }
  valueText(row, v) {
    if (row.type === 'slider') return `${v}%`;
    if (row.type === 'enum') return t(`settings.val.${row.k}.${String(v)}`);
    return '';
  }

  drawRow(id) {
    const o = this.rowObjs[id]; if (!o) return;
    const { rc, row, y } = o;
    rc.removeAll(true);
    const dis = !!row.disabled;
    rc.add(txt(this, LABEL_X, y + 2, this.label(row), 'T1', { color: dis ? C.disabled : C.text }));
    const v = this.valueOf(row);
    const g = this.add.graphics(); rc.add(g);
    if (row.type === 'slider') {
      const x0 = 470, w = 100, f = Math.round((v / 100) * w);
      g.fillStyle(C.stroke, 1).fillRect(x0 - 1, y + 6, w + 2, 6).fillStyle(C.slateDark, 1).fillRect(x0, y + 7, w, 4).fillStyle(C.mana, 1).fillRect(x0, y + 7, f, 4);
      g.fillStyle(C.stroke, 1).fillRect(x0 + f - 3, y + 3, 7, 12).fillStyle(C.text, 1).fillRect(x0 + f - 2, y + 4, 5, 10);
      rc.add(txt(this, CTRL_R, y + 2, this.valueText(row, v), 'T1', { origin: [1, 0] }));
    } else if (row.type === 'toggle') {
      const chip = (x, label, on) => {
        g.fillStyle(C.stroke, 1).fillRect(x, y + 1, 32, 15);
        if (on) g.fillStyle(C.slate, 1).fillRect(x + 1, y + 2, 30, 13).fillStyle(C.gold, 1).fillRect(x + 3, y + 13, 26, 1);
        else g.lineStyle(1, C.slateDark, 1).strokeRect(x + 1.5, y + 2.5, 29, 12);
        rc.add(txt(this, x + 16, y + 9, label, 'T1', { origin: [0.5, 0.5], color: on ? C.text : C.dim }));
      };
      chip(CTRL_R - 68, t('settings.on'), !!v);
      chip(CTRL_R - 32, t('settings.off'), !v);
    } else if (row.type === 'enum') {
      const x0 = 476, x1 = CTRL_R - 6;
      const col = dis ? C.disabled : C.text;
      g.fillStyle(col, 1).fillTriangle(x0 + 5, y + 4, x0 + 5, y + 14, x0, y + 9).fillTriangle(x1, y + 4, x1, y + 14, x1 + 5, y + 9);
      rc.add(txt(this, (x0 + x1 + 5) / 2, y + 2, this.valueText(row, v), 'T1', { origin: [0.5, 0], color: col }));
    } else if (row.type === 'button') {
      const w = 110, x = CTRL_R - w;
      drawPanel(g, x, y, w, 16, row.danger ? 'danger' : 'button');
      rc.add(txt(this, x + w / 2, y + 8, t(`settings.btn.${row.k}`), 'T1', { origin: [0.5, 0.5] }));
    }
  }

  change(id, dir) {
    const o = this.rowObjs[id]; if (!o) return;
    const row = o.row;
    if (row.disabled) { this.mixer.fire('ui_denied'); return; }
    if (row.action) { this.display.toggleFullscreen(); this.time.delayedCall(150, () => this.drawRow(id)); this.mixer.fire('ui_confirm'); return; }
    const v = Save.settings[row.k];
    let nv;
    if (row.type === 'slider') nv = Math.min(100, Math.max(0, v + dir * row.step));
    else if (row.type === 'toggle') nv = !v;
    else if (row.type === 'enum') { const n = row.values.length; nv = row.values[(row.values.indexOf(v) + (dir > 0 ? 1 : n - 1) + n) % n]; }
    else return;
    if (nv === v) { this.mixer.fire('ui_denied'); return; }
    this.apply(row.k, nv);
    this.drawRow(id);
    this.onMove(this.nav.cur());
    this.previewCue(row);
    if (row.k === 'vibration') { const rb = this.registry.get('rumble'); if (rb) rb.preview(); }   // §6 rule 5: same-screen preview
    else if (row.k === 'haptics') { const rb = this.registry.get('rumble'); if (rb) rb.previewHaptic(); }
    else if (this.G[this.group].preview && !row.noPreview) this.firePreview(row.k);
  }

  apply(k, v) {
    Save.setSetting(k, v);
    if (/Volume$/.test(k)) this.mixer.refreshVolumes();
    if (k === 'scaleMode') this.display.apply();
    if (k === 'bindings') this.router.applyBindings(Save.settings.bindings);
    this.bus.emit(EV.SETTINGS_CHANGED, k, Save.settings[k]);
  }

  /** Audio previews: a representative cue on that bus, at most once per 250 ms. */
  previewCue(row) {
    if (row.type !== 'slider' || !/Volume$/.test(row.k)) { this.mixer.fire('ui_move'); return; }
    const now = this.time.now;
    if (now - this.lastCue < 250) return;
    this.lastCue = now;
    if (row.cue) this.mixer.fire(row.cue);
  }

  activate(id) {
    const o = this.rowObjs[id]; if (!o) return;
    const row = o.row;
    if (row.type === 'button') { this.pressButton(row); return; }
    this.change(id, +1);
  }

  click(id, p) {
    const o = this.rowObjs[id]; if (!o) return;
    const row = o.row;
    if (row.type === 'slider') {
      const x = p.x - this.p.x;
      if (x >= 466 && x <= 574) {
        const v = Math.round(Math.max(0, Math.min(100, ((x - 470) / 100) * 100)) / row.step) * row.step;
        if (v !== Save.settings[row.k]) { this.apply(row.k, v); this.drawRow(id); this.previewCue(row); if (this.G[this.group].preview) this.firePreview(row.k); }
        return;
      }
    }
    if (row.type === 'toggle' && !row.action) {
      const x = p.x - this.p.x;
      if (x >= CTRL_R - 68 && x < CTRL_R - 36) { if (!Save.settings[row.k]) this.change(id, 1); return; }
      if (x >= CTRL_R - 32) { if (Save.settings[row.k]) this.change(id, 1); return; }
    }
    if (row.type === 'enum') { const x = p.x - this.p.x; this.change(id, x < 546 ? -1 : 1); return; }
    this.activate(id);
  }

  pressButton(row) {
    this.mixer.fire('ui_confirm');
    if (row.k === '__resetGroup') {
      const g = this.G[this.group];
      if (g.controls) { const b = Save.settings.bindings; this.apply('bindings', { kbm: {}, pad: b.pad || {} }); }
      else for (const r of g.rows) if ('def' in r && !r.disabled && Save.settings[r.k] !== r.def) this.apply(r.k, r.def);
      this.buildGroup(); this.nav.raise();
      this.nav.focus(this.rowIds[this.rowIds.length - 1], { silent: true, snap: true });
      this.say(t('settings.resetDone'));
      return;
    }
    if (row.k === '__resetTutorial') {
      this.__dialog = new Dialog(this, { mainNav: this.nav, text: t('confirm.resetTutorial'),
        options: [{ label: t('confirm.cancel') }, { label: t('confirm.resetTutorialBtn'), kind: 'primary', action: () => { Save.clearFtue(); this.say(t('settings.tutorialReset')); } }] });
      return;
    }
    if (row.k === '__resetProgress') {
      this.__dialog = new Dialog(this, { mainNav: this.nav, text: t('confirm.reset'),
        options: [{ label: t('confirm.cancel') }, { label: t('confirm.erase'), kind: 'danger', confirmTwice: true, armLabel: t('confirm.eraseArm'), action: () => { Save.reset(); this.say(t('settings.progressReset')); } }] });
    }
  }

  // ------------------------------------------------------------------------------------ controls
  buildControls() {
    const c = this.contentC;
    this._padFam = this.router.padPromptFamily;
    const kbm = this.router.kbm;
    c.add(txt(this, LABEL_X, 30, t('settings.col.action'), 'T1', { color: C.dim }));
    c.add(txt(this, 380, 30, t('settings.col.kbm'), 'T1', { origin: [0.5, 0], color: C.dim }));
    c.add(txt(this, 572, 30, t('settings.col.pad'), 'T1', { origin: [0.5, 0], color: C.dim }));
    const rows = [...ACTIONS, '__aim'];
    const ids = [];
    rows.forEach((a, i) => {
      const y = 44 + i * 14;
      c.add(txt(this, LABEL_X, y, t(`settings.action.${a}`), 'T1'));
      const locked = a === 'pause' || a === '__aim';
      const codes = a === '__aim' ? ['Mouse'] : (kbm[a] || []);
      for (let k = 0; k < 2; k++) {
        const x = 336 + k * 88, id = `k:${a}:${k}`;
        const code = codes[k];
        const g = this.add.graphics(); c.add(g);
        g.fillStyle(C.stroke, 1).fillRect(x, y - 1, 84, 13).fillStyle(locked ? 0x24242f : 0x3a3f52, 1).fillRect(x + 1, y, 82, 11);
        const label = a === '__aim' ? (k === 0 ? t('settings.key.mouse') : '') : codeName(code);
        c.add(txt(this, x + 42, y + 5, label, 'T1', { origin: [0.5, 0.5], color: locked ? C.dim : C.text }));
        if (locked && k === 0) c.add(glyph(this, x + 72, y + 1, 'lock'));
        if (a === '__aim' && k === 1) continue;
        this.nav.add({ id, x, y: y - 1, w: 84, h: 13, action: a, slot: k, locked, onConfirm: () => this.startCapture(a, k, locked) });
        ids.push(id);
      }
      // G8: the §3 TEXT column for the pad family (the last pad seen while on keyboard), live bindings
      const pad = a === '__aim' ? t('settings.pad.rstick') : /^move/.test(a) ? t('settings.pad.lstick') : promptListText(this._padFam, this.router.pad[a]) || '-';
      c.add(txt(this, 572, y, pad, 'T1', { origin: [0.5, 0], color: C.dim }));
    });
    const ry = 44 + rows.length * 14 + 4;
    c.add(txt(this, LABEL_X, ry + 18, t('settings.padNote'), 'T1', { color: C.dim, wrap: 456 }));   // §2.3 #24
    const g = this.add.graphics(); c.add(g);
    drawPanel(g, CTRL_R - 150, ry, 150, 16, 'button');
    c.add(txt(this, CTRL_R - 75, ry + 8, t('settings.resetControls'), 'T1', { origin: [0.5, 0.5] }));
    this.nav.add({ id: 'k:reset', x: CTRL_R - 150, y: ry, w: 150, h: 16, onConfirm: () => this.pressButton({ k: '__resetGroup' }) });
    this.rowIds = [ids[0], 'k:reset'];
    if (this.swapNote) { c.add(txt(this, LABEL_X, ry + 2, this.swapNote, 'T1', { color: C.warn })); }
    for (const id of ids) { const it = this.nav.get(id); it.nav = { left: it.slot === 0 ? `g:${this.group}` : null }; }
    this.nav.get(ids[0]).nav.up = null;
  }

  startCapture(action, slot, locked) {
    if (locked) { this.mixer.fire('ui_denied'); this.say(t(action === 'pause' ? 'settings.lockedEsc' : 'settings.lockedAim')); return; }
    this.mixer.fire('ui_confirm');
    const root = this.add.container(0, 0).setDepth(3000);
    root.add(fullRect(this, 0x000000, 0.55));
    const g = this.add.graphics(); drawPanel(g, UI_W / 2 - 150, 140, 300, 60, 'ornate'); root.add(g);
    root.add(txt(this, UI_W / 2, 158, t('settings.capture', { action: t(`settings.action.${action}`) }), 'T1', { origin: [0.5, 0], wrap: 280, align: 'center' }));
    const done = (code) => {
      this.input.keyboard.off('keydown', onKey);
      this.input.off('pointerdown', onPtr);
      this.input.off('wheel', onWheel);
      root.destroy();
      this.time.delayedCall(0, () => { this.capture = null; this.router.consumeUI(); });   // drop the captured key's menu edge
      if (code) this.assign(action, slot, code);
      else this.mixer.fire('ui_back');
    };
    const onKey = (e) => { e.preventDefault?.(); if (e.code === 'Escape') done(null); else done(e.code); };
    const onPtr = (p) => done(`Mouse${p.button}`);
    const onWheel = (p, o, dx, dy) => done(dy > 0 ? 'WheelDown' : 'WheelUp');
    // arm on the next tick so the confirm press that opened the dialog is not captured
    this.time.delayedCall(0, () => { this.input.keyboard.on('keydown', onKey); this.input.on('pointerdown', onPtr); this.input.on('wheel', onWheel); });
    this.capture = { action, slot, done };
  }

  /** Assign code to action[slot]. A conflict SWAPS the two bindings and says so (never a silent unbind). */
  assign(action, slot, code) {
    const cur = this.router.kbm;
    const over = { ...(Save.settings.bindings.kbm || {}) };
    const mine = (cur[action] || []).slice();
    const old = mine[slot];
    if (mine.includes(code) && mine.indexOf(code) !== slot) mine.splice(mine.indexOf(code), 1);
    mine[slot] = code;
    over[action] = mine.filter(Boolean);
    this.swapNote = null;
    for (const b of ACTIONS) {
      if (b === action) continue;
      const list = (cur[b] || []).slice();
      const j = list.indexOf(code);
      if (j < 0) continue;
      if (b === 'pause') continue;
      if (old) list[j] = old; else list.splice(j, 1);
      over[b] = list.filter(Boolean);
      this.swapNote = t('settings.swapped', { a: t(`settings.action.${action}`), b: t(`settings.action.${b}`) });
    }
    this.apply('bindings', { kbm: over, pad: Save.settings.bindings.pad || {} });
    this.mixer.fire('ui_confirm');
    const id = `k:${action}:${slot}`;
    this.buildGroup(); this.nav.raise();
    if (this.nav.has(id)) this.nav.focus(id, { silent: true, snap: true });
    this.onMove(this.nav.cur());
  }

  // ------------------------------------------------------------------------------------- preview
  buildPreview() {
    const c = this.previewC; c.removeAll(true);
    // touch profile: 24 px rows reach y ≈ 246, so the preview moves under the rail (it would sit under the controls)
    const x = this.pvX = this.touchUi ? 12 : 480, y = this.pvY = this.touchUi ? 218 : 200;
    c.add(box(this, x, y, 136, 90, 'dark'));
    // (the "Preview" label is dropped, §2.3 #25: the box is self-evident; the description bar names the setting)
    const scene = this.add.container(x, y); c.add(scene);
    this.pv = scene;
    const g = this.add.graphics(); scene.add(g);
    g.fillStyle(0x483b3a, 1).fillRect(4, 16, 128, 70);                       // floor tile (F1 tone)
    g.fillStyle(0x6d4b27, 1).fillRect(12, 60, 14, 14).lineStyle(1, C.stroke, 1).strokeRect(12.5, 60.5, 13, 13);   // crate
    this.pvDummy = this.add.rectangle(92, 44, 12, 18, 0x94afc6).setOrigin(0.5).setStrokeStyle(1, C.stroke); scene.add(this.pvDummy);
    this.pvFlash = this.add.rectangle(92, 44, 12, 18, 0xffffff).setOrigin(0.5).setAlpha(0); scene.add(this.pvFlash);
    this.pvWiz = this.add.rectangle(40, 44, 10, 16, 0x5698cc).setOrigin(0.5).setStrokeStyle(1, C.stroke); scene.add(this.pvWiz);
    this.pvPip = this.add.rectangle(40, 46, 3, 3, 0xffffff).setOrigin(0.5).setVisible(!!Save.settings.showHitbox); scene.add(this.pvPip);
  }

  /** Scripted hit in the preview box (settings-spec §3): shake, flash, number, enemy shot. */
  firePreview(k) {
    if (!this.pv) return;
    const S = Save.settings, rm = Save.reducedMotion;
    this.pvPip.setVisible(!!S.showHitbox);
    const shake = rm ? 0 : Math.round(T('shakeMaxPx') * T('traumaExplosion', 0.58) ** 2) * (S.screenShake / 100);   // one explosion's trauma² peak
    if (shake > 0) {
      const x0 = this.pvX, y0 = this.pvY; let n = 0;
      this.time.addEvent({ delay: 16, repeat: 8, callback: () => { n++; this.pv.setPosition(x0 + (n < 9 ? Math.round((Math.random() * 2 - 1) * shake) : 0), y0 + (n < 9 ? Math.round((Math.random() * 2 - 1) * shake) : 0)); } });
    }
    this.pvFlash.setAlpha(S.flashIntensity / 100);
    this.time.delayedCall(60, () => this.pvFlash.active && this.pvFlash.setAlpha(0));
    if (S.damageNumbers) {
      const num = txt(this, 92, 26, '12', 'T1', { origin: [0.5, 1] });
      this.pv.add(num);
      if (rm) this.time.delayedCall(500, () => num.destroy());
      else this.tweens.add({ targets: num, y: 16, alpha: 0, duration: 600, ease: 'Quad.easeOut', onComplete: () => num.destroy() });
    }
    // enemy shot crossing (dark core, bright rim; High adds a light outer ring)
    const shot = this.add.graphics(); this.pv.add(shot);
    const drawShot = () => { shot.clear(); if (S.enemyShotEmphasis === 'high') shot.lineStyle(1, C.text, 1).strokeCircle(0, 0, 5.5); shot.fillStyle(C.stroke, 1).fillCircle(0, 0, 4.5).fillStyle(0xf78697, 1).fillCircle(0, 0, 3.5).fillStyle(0x3e2a33, 1).fillCircle(0, 0, 2); };
    drawShot(); shot.setPosition(130, 72);
    this.tweens.add({ targets: shot, x: 6, duration: 900, ease: 'Linear', onComplete: () => shot.destroy() });
    void k;
  }

  // ------------------------------------------------------------------------------- description
  say(s) { this._say = s; this.onMove(this.nav.cur()); }

  onMove(it) {
    const c = this.descC; c.removeAll(true);
    let s = '';
    if (this._say) { s = this._say; this._say = null; }
    else if (!it) s = '';
    else if (it.rail) s = t(`settings.groupDesc.${this.G[this.group].k}`);
    else if (it.row) {
      const row = it.row;
      if (row.k === '__resetGroup') s = t('settings.desc.__resetGroup');
      else if (row.descPer) s = t(`settings.desc.${row.k}.${String(Save.settings[row.k])}`);
      else s = t(`settings.desc.${row.k}`);
      if (row.k === 'vibration' && this.router.padReader.connected && !this.router.padReader.actuator) s += ' ' + t('settings.desc.vibrationNoActuator');
      if (row.k === 'haptics' && !canVibrate()) s = t('settings.desc.hapticsNone');
    } else if (it.action) s = it.locked ? t(it.action === 'pause' ? 'settings.lockedEsc' : 'settings.lockedAim') : t('settings.desc.rebind', { action: t(`settings.action.${it.action}`) });
    else if (it.id === 'k:reset') s = t('settings.desc.resetControls');
    c.add(txt(this, 160, 318, s, 'T1', { color: C.dim, wrap: 456 }));
  }

  buildFooter() {
    const c = this.footC; c.removeAll(true);
    const fam = this._fam = this.router.promptFamily;
    c.add(hintLine(this, 16, 344, t(fam === 'kbm' ? 'settings.hintKb' : 'settings.hintPad'), this.router));
  }

  close() {
    if (this.closing) return;
    this.closing = true;
    Save.flush();
    this.m.close(() => this.flow.close('settings'));
  }

  update() {
    if (this.flow.top() !== 'settings') return;
    if (this.capture) { this.router.consumeUI(); return; }
    const ui = this.router.consumeUI();
    for (let i = 0; i < ui.length; i++) {
      const a = ui[i];
      if (this.closing) break;
      if (this.__dialog) { this.__dialog.handle(a); continue; }
      if (a === 'back') {
        const it = this.nav.cur();
        if (it && !it.rail) { this.mixer.fire('ui_back'); this.nav.focus(`g:${this.group}`, { silent: true }); continue; }
        this.close(); break;
      }
      if (a === 'tabPrev' || a === 'tabNext') {
        const n = this.G.length, gi = (this.group + (a === 'tabNext' ? 1 : n - 1)) % n;
        this.nav.focus(`g:${gi}`);
        continue;
      }
      this.nav.handle(a);
    }
    // controller-prompts §4 G8: footer + Controls pad column re-render on the frame the family changes
    if (this.router.promptFamily !== this._fam) this.buildFooter();
    if (this.G[this.group].controls && this.router.padPromptFamily !== this._padFam && !this.capture) {
      const cur = this.nav.current;
      this.buildGroup(); this.nav.raise();
      if (cur && this.nav.has(cur)) this.nav.focus(cur, { silent: true, snap: true });
    }
  }
}
