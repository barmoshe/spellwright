// ui/Menu.js — one vertical menu implementation for every screen (skeleton-grade visuals; UX /
// 2D Artist own the final look). Driven by the InputRouter UI channel (keyboard / gamepad) AND the
// mouse (hover + click) — same items, one codepath.

import { t } from '../core/i18n.js';

export class Menu {
  /**
   * @param {Phaser.Scene} scene
   * @param {number} x   centre x
   * @param {number} y   top y
   * @param {{ label: string, key?: string, onSelect: () => void, onLeft?: () => void, onRight?: () => void }[]} items
   */
  constructor(scene, x, y, items, opts = {}) {
    this.scene = scene;
    this.items = items;
    this.index = 0;
    this.lineH = opts.lineH || 16;
    this.texts = items.map((it, i) => {
      const txt = scene.add.text(x, y + i * this.lineH, it.label ?? t(it.key), {
        fontFamily: 'monospace', fontSize: '10px', color: '#cfc8e8',
      }).setOrigin(0.5, 0).setInteractive({ useHandCursor: true });
      txt.on('pointerover', () => this.focus(i));
      txt.on('pointerdown', () => { this.focus(i); this.activate(); });
      return txt;
    });
    this.focus(0);
  }

  setLabel(i, s) { this.texts[i].setText(s); }

  focus(i) {
    this.index = (i + this.items.length) % this.items.length;
    this.texts.forEach((tx, k) => tx.setColor(k === this.index ? '#ffe28a' : '#cfc8e8'));
  }

  activate() { const it = this.items[this.index]; if (it && it.onSelect) it.onSelect(); }

  /**
   * Replay the UI edges drained from router.consumeUI(), in press order. Returns true as soon as
   * 'back' is seen (remaining edges are dropped — the caller is closing this screen).
   */
  handle(ui) {
    for (let i = 0; i < ui.length; i++) {
      const a = ui[i];
      if (a === 'back') return true;
      const it = this.items[this.index];
      if (a === 'up') this.focus(this.index - 1);
      else if (a === 'down') this.focus(this.index + 1);
      else if (a === 'left' && it.onLeft) it.onLeft();
      else if (a === 'right' && it.onRight) it.onRight();
      else if (a === 'confirm') { this.activate(); return false; }   // activation may change scenes
    }
    return false;
  }
}
