// ConfirmScene — a small generic confirm modal (screen-graph §4 dialogs raised from the RUN, e.g. D4 "Leave the
// reward behind?"). Default focus = the SAFE option. back = the safe option. Keyboard, pad and mouse.
//   flow.open('confirm', { text, options: [{label, value}], safeIndex: 0, onResult(value) })

import { T } from '../core/tunables.js';
import Phaser from '../../lib/phaser.esm.min.js';
import { UI_W, UI_H, fullRect, uiCamera } from '../ui/uiSpace.js';   // 640×360 overlay design space
import { txt, panel, drawFocus, C } from '../ui/kit.js';

export class ConfirmScene extends Phaser.Scene {
  constructor() { super('confirm'); }

  init(data) { this.d = data || {}; }

  create() {
    this.router = this.registry.get('router');
    this.flow = this.registry.get('flow');
    const d = this.d;
    this.openAt = performance.now(); this._down = -1;
    uiCamera(this);
    const bd = fullRect(this, 0x07060c, 0.6).setInteractive();
    bd.on('pointerdown', (p) => { if (p.rightButtonDown()) this.finish(d.options[d.safeIndex ?? 0].value); });
    const w = 300, h = 86, x = (UI_W - w) / 2, y = (UI_H - h) / 2;
    panel(this, x, y, w, h, 'ornate');
    txt(this, UI_W / 2, y + 12, d.text || '', 'T1', { origin: [0.5, 0], wrap: w - 24, align: 'center' });
    this.focus = d.safeIndex ?? 0;
    this.btns = d.options.map((o, i) => {
      const bw = 120, bx = UI_W / 2 + (i - (d.options.length - 1) / 2) * (bw + 12) - bw / 2, by = y + h - 30;
      const g = this.add.graphics();
      const label = txt(this, bx + bw / 2, by + 10, o.label, 'T1', { origin: [0.5, 0.5] });
      const hit = this.add.rectangle(bx, by, bw, 20, 0, 0).setOrigin(0).setInteractive({ useHandCursor: true });
      hit.on('pointermove', () => { if (this.focus !== i) { this.focus = i; this.paint(); } });
      // release-over-same + open-guard (mobile-touch-spec §6)
      hit.on('pointerdown', (p) => { this._down = (!p.rightButtonDown() && performance.now() - this.openAt >= T('uiOpenGuardMs', 180)) ? i : -1; });
      hit.on('pointerup', (p) => { if (this._down === i && !p.rightButtonDown()) this.finish(o.value); this._down = -1; });
      return { g, label, bx, by, bw, i, o };
    });
    this.paint();
  }

  paint() {
    for (const b of this.btns) {
      b.g.clear();
      b.g.fillStyle(C.stroke).fillRect(b.bx, b.by, b.bw, 20).fillStyle(b.i === this.focus ? 0x4b5468 : 0x3a3f52).fillRect(b.bx + 1, b.by + 1, b.bw - 2, 18);
      if (b.i === this.focus) drawFocus(b.g, b.bx, b.by, b.bw, 20);
    }
  }

  finish(value) {
    if (this._done) return; this._done = true;
    const cb = this.d.onResult;
    this.flow.close('confirm');
    if (cb) cb(value);
  }

  update() {
    if (this.flow.top() !== 'confirm') return;
    for (const a of this.router.consumeUI()) {
      if (a === 'left' || a === 'up') { this.focus = (this.focus + this.btns.length - 1) % this.btns.length; this.paint(); }
      else if (a === 'right' || a === 'down') { this.focus = (this.focus + 1) % this.btns.length; this.paint(); }
      else if (a === 'confirm') { this.finish(this.btns[this.focus].o.value); return; }
      else if (a === 'back') { this.finish(this.d.options[this.d.safeIndex ?? 0].value); return; }
    }
  }
}
