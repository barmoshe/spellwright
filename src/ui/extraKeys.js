// ui/extraKeys.js — the editor-scoped UI intent reader (wand-editor-ux §9): quickMove, salvage,
// wandPrevUI/wandNextUI, wandSelect1..4, revert, scrollUp/Down, KeyI = back, and the Reward/Shop
// 'editor' intent. Adopted as the contract (Game Developer, Wave 4): InputRouter.consumeUI() carries
// the 8 generic menu intents shared by every modal; screen-specific intents stay here, read only
// while their modal is on top, so nothing reaches gameplay. Like the router's UI channel these keys
// are not rebindable (bindings.js KBM_UI).

import { PAD_EDITOR } from '../input/bindings.js';
import { PAD_BUTTONS } from '../platform/gamepad.js';

const KEYS = {
  KeyX: 'quickMove', Delete: 'salvage', KeyR: 'revert', PageUp: 'scrollUp', PageDown: 'scrollDown', KeyI: 'back',
  Digit1: 'wand1', Digit2: 'wand2', Digit3: 'wand3', Digit4: 'wand4', Numpad1: 'wand1', Numpad2: 'wand2', Numpad3: 'wand3', Numpad4: 'wand4',
};

// W3C standard pad: 2 X/Square, 3 Y/Triangle, 6 LT/L2, 7 RT/R2 (bindings.js PAD_EDITOR is the one table;
// its indices also feed the [quickMove]/[salvage]/[editorWand*] prompt tokens).
const PAD = PAD_EDITOR;

export class ExtraKeys {
  /** maps (optional): { keys: {code: intent}, pad: {buttonIndex: intent} } replace the editor maps. */
  constructor(scene, isActive, maps = null) {
    this.scene = scene;
    this.keys = maps ? maps.keys || {} : KEYS;
    this.pad = maps ? maps.pad || {} : PAD;
    this.isActive = isActive;
    this.q = [];
    this.prev = new Float32Array(PAD_BUTTONS);
    this.stickArmed = true;
    // Pad state comes from the router's normalised snapshot (platform/gamepad.js; triggers already carry
    // the feel-spec hysteresis as 0/1), never from the Gamepad API directly.
    this.router = scene.registry.get('router');
    // a button still held from the press that opened this screen must not fire an edge
    if (this.router) this.prev.set(this.router.padNow);
    this.shift = false;
    this._down = (e) => {
      this.shift = !!e.shiftKey;
      if (!this.isActive() || e.repeat && !/Page/.test(e.code)) return;
      const a = this.keys[e.code];
      if (a) this.q.push(a);
    };
    this._up = (e) => { this.shift = !!e.shiftKey; };
    scene.input.keyboard.on('keydown', this._down);
    scene.input.keyboard.on('keyup', this._up);
    scene.events.once('shutdown', () => { scene.input.keyboard.off('keydown', this._down); scene.input.keyboard.off('keyup', this._up); });
  }

  /** Poll pad edges (call once per frame from update) and drain the queue. */
  consume() {
    const r = this.router;
    const pad = r ? r._getPad() : null;
    if (pad) {
      const now = r.padNow;
      for (let i = 0; i < PAD_BUTTONS; i++) {
        const v = now[i];
        if (v > 0.5 && this.prev[i] <= 0.5 && this.pad[i] && this.isActive()) this.q.push(this.pad[i]);
        this.prev[i] = v;
      }
      const ry = pad.rightStick && this.keys === KEYS ? pad.rightStick.y : 0;
      if (this.stickArmed && Math.abs(ry) > 0.6) { this.stickArmed = false; if (this.isActive()) this.q.push(ry > 0 ? 'scrollDown' : 'scrollUp'); }
      else if (Math.abs(ry) < 0.3) this.stickArmed = true;
    }
    if (!this.isActive()) { this.q.length = 0; return []; }
    const out = this.q; this.q = [];
    return out;
  }
}

/** Reward / Shop: Tab, I, pad View/Create and the touchpad click open the wand editor (screen-graph §3 "Tab → S3 {returnTo}").
 *  The router also reports these as 'back'; callers drop that one 'back' when 'editor' arrives. */
export const EDITOR_KEYS = { keys: { Tab: 'editor', KeyI: 'editor' }, pad: { 8: 'editor', 17: 'editor' } };   // 17 = DualSense touchpad click

/** Drop one 'back' from a consumed UI array per 'editor' extra intent (same physical press). */
export function dropShadowedBack(ui, extra) {
  let n = extra.filter((a) => a === 'editor').length;
  if (!n) return ui;
  const out = [];
  for (const a of ui) { if (a === 'back' && n > 0) { n--; continue; } out.push(a); }
  return out;
}
