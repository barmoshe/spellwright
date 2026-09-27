// ui/Dialog.js — in-scene confirm dialogs D1–D6 (screen-graph §4). A dialog is a STATE inside its
// owning scene (never a scene, never on the overlay stack). While open it owns focus: the scene's own
// FocusNav is suspended and the scene routes UI intents to dialog.handle().
//
// Rules: default focus = the SAFE option (options[defaultIndex], normally index 0). `back`, Esc/B and
// right-click = the safe cancel. An option with `confirmTwice` (D6 Erase) activates after a 1.0 s
// mouse HOLD, or after being confirmed twice (keyboard / pad) — nobody is forced into a hold.

import { VIEW_W, VIEW_H } from '../config.js';
import { C, txt, drawPanel } from './kit.js';
import { button, reduced, richLine } from './draw.js';
import { FocusNav } from './nav.js';
import { t } from '../core/i18n.js';

export class Dialog {
  /**
   * @param {Phaser.Scene} scene
   * @param {object} o { text, lines?:string[], options:[{label, kind?, action, confirmTwice?}], defaultIndex?, onCancel?, width?, mainNav? }
   */
  constructor(scene, o) {
    this.scene = scene;
    this.o = o;
    this.mixer = scene.registry.get('mixer');
    this.mainNav = o.mainNav || null;
    if (this.mainNav) this.mainNav.suspended = true;
    const W = o.width || 320;
    const root = this.root = scene.add.container(0, 0).setDepth(2000);
    const dim = scene.add.rectangle(0, 0, VIEW_W, VIEW_H, 0x000000, 0.55).setOrigin(0);
    root.add(dim);
    const panel = this.panel = scene.add.container(Math.round((VIEW_W - W) / 2), 0);
    root.add(panel);
    const body = txt(scene, 14, 14, o.text, 'T1', { wrap: W - 28 });
    const extra = (o.lines || []).map((s, i) => richLine(scene, 14, 0, s, { color: C.dim }));
    let y = 14 + Math.ceil(body.height) + 6;
    for (const e of extra) { e.y = y; y += 12; }
    const btnY = y + 6;
    const H = btnY + 22 + 12;
    const g = scene.add.graphics();
    drawPanel(g, 0, 0, W, H, 'ornate');
    panel.add([g, body, ...extra]);
    panel.y = Math.round((VIEW_H - H) / 2);

    this.nav = new FocusNav(scene, { layer: panel, onBack: () => this.cancel(), depth: 2001 });
    const n = o.options.length;
    const gap = 8;
    const bw = Math.min(130, Math.floor((W - 28 - gap * (n - 1)) / n));
    let bx = Math.round((W - (bw * n + gap * (n - 1))) / 2);
    this.buttons = [];
    o.options.forEach((opt, i) => {
      const b = button(scene, bx, btnY, bw, 22, opt.label, { kind: opt.kind || 'button' });
      panel.add(b);
      this.buttons.push(b);
      const id = `opt${i}`;
      this.nav.add({ id, x: bx, y: btnY, w: bw, h: 22,
        onFocus: () => { this.buttons.forEach((bb, k) => bb.setFocused(k === i)); this._disarm(i); },
        onConfirm: () => this._choose(i),
        onClick: () => { if (!opt.confirmTwice) this._choose(i); } });
      bx += bw + gap;
    });
    this.nav.linkList(o.options.map((_, i) => `opt${i}`), 'h', false);
    this.nav.raise();

    // D6 hold path (mouse): press and hold 1.0 s on a confirmTwice option.
    this.holdBar = scene.add.graphics();
    panel.add(this.holdBar);
    this.nav.onPointerDown = (p) => {
      const it = this.nav.hit(p.x, p.y);
      if (!it || p.button !== 0) return false;
      const i = +it.id.slice(3);
      if (!o.options[i].confirmTwice) return false;
      this.nav.focus(it.id, { silent: true });
      this._startHold(i);
      return true;
    };
    this.nav.onPointerUp = () => this._stopHold();

    this.nav.focus(`opt${o.defaultIndex || 0}`, { silent: true, snap: true });
    root.setAlpha(0);
    scene.tweens.add({ targets: root, alpha: 1, duration: 120, ease: 'Cubic.easeOut' });
    if (!reduced()) { const y1 = panel.y; panel.y += 8; scene.tweens.add({ targets: panel, y: y1, duration: 120, ease: 'Cubic.easeOut' }); }
    this.open = true;
    scene.__dialog = this;
    this._armed = -1;
  }

  _disarm(except) {
    if (this._armed >= 0 && this._armed !== except) {
      this.buttons[this._armed].setLabel(this.o.options[this._armed].label);
      this._armed = -1;
    }
  }

  _choose(i) {
    const opt = this.o.options[i];
    if (opt.confirmTwice && this._armed !== i) {
      this._armed = i;
      this.buttons[i].setLabel(opt.armLabel || t('confirm.pressAgain'));
      this.buttons[i].press();
      this.mixer.fire('ui_move');
      return;
    }
    this.buttons[i].press();
    this.mixer.fire(i === (this.o.defaultIndex || 0) ? 'ui_back' : 'ui_confirm');
    this.close();
    if (opt.action) opt.action();
  }

  _startHold(i) {
    this._stopHold();
    const b = this.buttons[i];
    const st = { f: 0 };
    this._holdTw = this.scene.tweens.add({ targets: st, f: 1, duration: 1000, ease: 'Linear',
      onUpdate: () => { this.holdBar.clear().fillStyle(C.error, 1).fillRect(b.x + 3, b.y + b.btnH - 4, Math.round((b.btnW - 6) * st.f), 2); },
      onComplete: () => { this._holdTw = null; this.holdBar.clear(); this._armed = i; this._choose(i); } });
  }
  _stopHold() { if (this._holdTw) { this._holdTw.stop(); this._holdTw = null; this.holdBar.clear(); } }

  cancel() {
    if (!this.open) return;
    this.mixer.fire('ui_back');
    this.close();
    if (this.o.onCancel) this.o.onCancel();
  }

  /** One UI intent. Returns true (a dialog consumes everything while open). */
  handle(a) {
    if (!this.open) return false;
    if (a === 'back') { this.cancel(); return true; }
    if (a === 'tabPrev' || a === 'tabNext') return true;
    this.nav.handle(a);
    return true;
  }

  close() {
    if (!this.open) return;
    this.open = false;
    this._stopHold();
    if (this.scene.__dialog === this) this.scene.__dialog = null;
    this.nav.suspended = true;
    this.nav.destroy();
    if (this.mainNav) this.mainNav.suspended = false;
    const root = this.root;
    this.scene.tweens.add({ targets: root, alpha: 0, duration: 90, ease: 'Quad.easeIn', onComplete: () => root.destroy() });
  }
}

/** Convenience: the standard 2-option confirm (safe first). */
export function confirmDialog(scene, mainNav, text, safeLabel, actLabel, action, opts = {}) {
  return new Dialog(scene, { text, mainNav, lines: opts.lines, width: opts.width,
    options: [{ label: safeLabel }, { label: actLabel, kind: opts.kind || 'danger', action, confirmTwice: opts.confirmTwice, armLabel: opts.armLabel }],
    onCancel: opts.onCancel });
}
