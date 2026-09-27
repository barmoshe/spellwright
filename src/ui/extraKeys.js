// ui/extraKeys.js — the editor-scoped UI intent reader (wand-editor-ux §9): quickMove, salvage,
// wandPrevUI/wandNextUI, wandSelect1..4, revert, scrollUp/Down, KeyI = back, and the Reward/Shop
// 'editor' intent. Adopted as the contract (Game Developer, Wave 4): InputRouter.consumeUI() carries
// the 8 generic menu intents shared by every modal; screen-specific intents stay here, read only
// while their modal is on top, so nothing reaches gameplay. Like the router's UI channel these keys
// are not rebindable (bindings.js KBM_UI).

const KEYS = {
  KeyX: 'quickMove', Delete: 'salvage', KeyR: 'revert', PageUp: 'scrollUp', PageDown: 'scrollDown', KeyI: 'back',
  Digit1: 'wand1', Digit2: 'wand2', Digit3: 'wand3', Digit4: 'wand4', Numpad1: 'wand1', Numpad2: 'wand2', Numpad3: 'wand3', Numpad4: 'wand4',
};
// W3C standard pad: 2 X, 3 Y, 6 LT, 7 RT
const PAD = { 2: 'quickMove', 3: 'salvage', 6: 'wandPrev', 7: 'wandNext' };

export class ExtraKeys {
  /** maps (optional): { keys: {code: intent}, pad: {buttonIndex: intent} } replace the editor maps. */
  constructor(scene, isActive, maps = null) {
    this.scene = scene;
    this.keys = maps ? maps.keys || {} : KEYS;
    this.pad = maps ? maps.pad || {} : PAD;
    this.isActive = isActive;
    this.q = [];
    this.prev = new Float32Array(17);
    this.stickArmed = true;
    // a button still held from the press that opened this screen must not fire an edge
    const gp0 = scene.input.gamepad, p0 = gp0 && gp0.total ? (gp0.pad1 || gp0.getPad(0)) : null;
    if (p0) for (let i = 0; i < Math.min(p0.buttons.length, 17); i++) this.prev[i] = p0.buttons[i].value;
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
    const gp = this.scene.input.gamepad;
    const pad = gp && gp.total ? (gp.pad1 || gp.getPad(0)) : null;
    if (pad) {
      const n = Math.min(pad.buttons.length, 17);
      for (let i = 0; i < n; i++) {
        const v = pad.buttons[i].value;
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

/** Reward / Shop: Tab, I and pad Back open the wand editor (screen-graph §3 "Tab → S3 {returnTo}").
 *  The router also reports these as 'back'; callers drop that one 'back' when 'editor' arrives. */
export const EDITOR_KEYS = { keys: { Tab: 'editor', KeyI: 'editor' }, pad: { 8: 'editor' } };

/** Drop one 'back' from a consumed UI array per 'editor' extra intent (same physical press). */
export function dropShadowedBack(ui, extra) {
  let n = extra.filter((a) => a === 'editor').length;
  if (!n) return ui;
  const out = [];
  for (const a of ui) { if (a === 'back' && n > 0) { n--; continue; } out.push(a); }
  return out;
}
