// input/InputRouter.js — one Intent per sim step from any device (architecture §8).
//
// Lives in SystemScene (first in the scene list, never stopped), so raw state is gathered before
// any other scene updates. Gameplay reads ONLY `router.sample(originX, originY)` once per fixed sim
// step; menus read ONLY `router.consumeUI()`. Nothing else reads keys, buttons or pointers.
//
// Edge latching: presses that land between two sim steps are latched in `_pressed` and consumed
// by the next sample(), so taps are never lost at any render rate.

import { KBM_DEFAULTS, KBM_UI, PAD_DEFAULTS, PAD_UI, PAD_MOVE_DEADZONE, PAD_AIM_DEADZONE,
  PAD_MENU_FLICK, PAD_MENU_REARM, PAD_DIGITAL_PRESS, mergeBindings } from './bindings.js';
import { EV } from '../core/events.js';
import { Save } from '../core/save.js';
import { PadReader, PAD_BUTTONS } from '../platform/gamepad.js';

const EDGE_ACTIONS = ['cast', 'altCast', 'dash', 'interact', 'wandNext', 'wandPrev', 'wand1', 'wand2', 'wand3', 'wand4', 'inventory', 'pause'];
const UI_ACTIONS = ['up', 'down', 'left', 'right', 'confirm', 'back', 'tabPrev', 'tabNext'];

function radial(x, y, dead) {
  const m = Math.hypot(x, y);
  if (m < dead) return 0;
  return Math.min(1, (m - dead) / (1 - dead)) / m;   // scale factor to apply to (x, y)
}

export class InputRouter {
  constructor(scene, bus, settings) {
    this.scene = scene;
    this.bus = bus;
    this.device = 'kbm';
    this.keysDown = new Set();          // KeyboardEvent.code + 'Mouse0..2'
    this._pressed = new Set();          // latched gameplay edges (action names)
    this._ui = [];                      // latched UI edges, IN ORDER (menus replay them in sequence)
    this._uiOut = [];                   // swap buffer returned by consumeUI() (no per-frame allocation)
    this.padReader = new PadReader();   // platform/gamepad.js: the ONE Gamepad-API reader (standard indices)
    this._padPrev = new Float32Array(PAD_BUTTONS);
    this.padNow = new Float32Array(PAD_BUTTONS);   // this frame's digital-ised state (triggers latched 0/1) — ExtraKeys reads it
    this._famSent = 'kbm';                          // last prompt family announced on EV.INPUT_DEVICE
    this._trig = [false, false];         // latched analog-trigger state (6, 7)
    this.trigPress = 0.2; this.trigRelease = 0.1;   // pre-boot defaults; applyTunables sets the feel-spec values
    this._menuStickArmed = true;
    this.lastAimX = 1; this.lastAimY = 0;
    this.pointerX = 0; this.pointerY = 0;
    this.enabled = true;
    this.castLatch = false;             // settings castMode 'toggle' (settings-spec §1.1)
    this.moveDead = PAD_MOVE_DEADZONE;
    this.aimDead = PAD_AIM_DEADZONE;

    // Reusable Intent (no per-step allocation).
    this.intent = {
      moveX: 0, moveY: 0, aimX: 1, aimY: 0, aimScreenX: 0, aimScreenY: 0,
      castHeld: false, castPressed: false, altCastHeld: false, altCastPressed: false,
      dashPressed: false, interactPressed: false, wandNext: false, wandPrev: false, wandSlot: 0,
      openInventory: false, pause: false, device: 'kbm',
    };
    this.applyBindings(settings.bindings);

    const kb = scene.input.keyboard;
    kb.addCapture('SPACE,TAB,UP,DOWN,LEFT,RIGHT');
    kb.on('keydown', (e) => this._onDown(e.code, false, e.repeat));
    kb.on('keyup', (e) => this.keysDown.delete(e.code));
    scene.input.on('pointerdown', (p) => { this.pointerX = p.x; this.pointerY = p.y; this._onDown(`Mouse${p.button}`); });
    scene.input.on('pointerup', (p) => this.keysDown.delete(`Mouse${p.button}`));
    scene.input.on('pointermove', (p) => { this.pointerX = p.x; this.pointerY = p.y; this._setDevice('kbm'); });
    scene.input.on('wheel', (p, over, dx, dy) => { if (dy) this._onDown(dy > 0 ? 'WheelDown' : 'WheelUp', true); });
    if (scene.input.mouse) scene.input.mouse.disableContextMenu();
    // promptStyle is a prompt-family input: a settings change re-announces the family (controller-prompts §1 rule 4)
    bus.on(EV.SETTINGS_CHANGED, (k) => { if (k === 'promptStyle') this._checkFamily(); });
  }

  /**
   * controller-prompts §1: the ONE prompt-family resolver. 'kbm' whenever the last input was the
   * keyboard/mouse (promptStyle never overrides the keyboard); otherwise the forced setting, else the
   * auto-classified family of the pad in hand. Every scene compares THIS, never `device === 'pad'`.
   */
  get promptFamily() { return this.device === 'kbm' ? 'kbm' : this.padPromptFamily; }
  /** The pad family even while the keyboard is in use (Settings Controls table pad column, §4 G8). */
  get padPromptFamily() {
    const s = Save.settings.promptStyle;
    if (s === 'xbox') return 'xbox';
    if (s === 'playstation') return 'ps';
    return this.padReader.family;          // last pad seen (persists across disconnect); 'xbox' if none yet
  }
  _checkFamily() {
    const f = this.promptFamily;
    if (f === this._famSent) return;
    this._famSent = f;
    this.bus.emit(EV.INPUT_DEVICE, this.device, f);
  }

  /** Called once by Boot after the feel-spec is parsed: deadzones come from it verbatim. */
  applyTunables(T) {
    this.moveDead = T('moveStickDeadzone', PAD_MOVE_DEADZONE);
    this.aimDead = T('aimStickDeadzone', PAD_AIM_DEADZONE);
    // analog triggers 6/7: press/release hysteresis (feel-spec §cast 6). An inverted pair is clamped
    // to release = press − 0.05, as the spec requires.
    this.trigPress = T('padTriggerPress', 0.2);
    const rel = T('padTriggerRelease', 0.1);
    this.trigRelease = rel < this.trigPress ? rel : Math.max(0, this.trigPress - 0.05);
  }

  applyBindings(overrides = {}) {
    this.kbm = mergeBindings(KBM_DEFAULTS, overrides.kbm);
    this.pad = mergeBindings(PAD_DEFAULTS, overrides.pad);
    // reverse lookup code -> actions
    this._codeToActions = new Map();
    for (const [action, codes] of Object.entries(this.kbm)) for (const c of codes) {
      if (!this._codeToActions.has(c)) this._codeToActions.set(c, []);
      this._codeToActions.get(c).push(action);
    }
    this._codeToUI = new Map();
    for (const [action, codes] of Object.entries(KBM_UI)) for (const c of codes) {
      if (!this._codeToUI.has(c)) this._codeToUI.set(c, []);
      this._codeToUI.get(c).push(action);
    }
  }

  _setDevice(d) {
    if (this.device === d) return;
    this.device = d;
    this._checkFamily();                   // a device switch always changes the family (kbm <-> pad)
  }

  /**
   * @param {string} code      KeyboardEvent.code | 'Mouse0..2' | 'WheelUp/Down'
   * @param {boolean} impulse  no held state (wheel)
   * @param {boolean} repeat   OS key auto-repeat: only menu DIRECTIONS repeat; gameplay edges and
   *                           confirm/back never do (holding Tab must not flicker the editor).
   */
  _onDown(code, impulse = false, repeat = false) {
    if (!this.enabled) return;
    if (!impulse) this.keysDown.add(code);
    this._setDevice('kbm');
    const ui = this._codeToUI.get(code);
    if (ui) for (const a of ui) if (!repeat || a === 'up' || a === 'down' || a === 'left' || a === 'right') this._pushUI(a);
    if (repeat) return;
    const acts = this._codeToActions.get(code);
    if (acts) for (const a of acts) this._pressed.add(a);
  }

  /** UI edges are only consumed while a menu is up; cap the queue so gameplay can't grow it. */
  _pushUI(a) {
    if (this._ui.length >= 16) this._ui.shift();
    this._ui.push(a);
  }

  _held(action) {
    const codes = this.kbm[action];
    for (let i = 0; i < codes.length; i++) if (this.keysDown.has(codes[i])) return true;
    return false;
  }

  /** This frame's normalised pad snapshot (polled once in pollFrame), or null when none is connected. */
  _getPad() { return this.padReader.connected ? this.padReader : null; }

  /** Digital state of a pad button. Triggers (6/7) use the latched hysteresis state from pollFrame. */
  _padBtn(pad, idx) { if (idx === 6 || idx === 7) return this._trig[idx - 6]; return pad.buttons[idx] > PAD_DIGITAL_PRESS; }
  /** Update + return a trigger's latched state: pressed at ≥ trigPress, released only below trigRelease. */
  _trigger(i, v) { const k = i - 6; this._trig[k] = this._trig[k] ? v >= this.trigRelease : v >= this.trigPress; return this._trig[k]; }
  _padHeld(pad, action) {
    const list = this.pad[action]; if (!list || !pad) return false;
    for (let i = 0; i < list.length; i++) if (this._padBtn(pad, list[i])) return true;
    return false;
  }

  /** Called every render frame by SystemScene.update: latch gamepad edges. */
  pollFrame() {
    const pad = this.padReader.poll();
    if (!pad) { this.padNow.fill(0); this._trig[0] = this._trig[1] = false; return; }
    for (let i = 0; i < PAD_BUTTONS; i++) {
      // triggers: map the hysteresis latch onto 0/1 so every edge test stays one rule (> 0.5)
      this.padNow[i] = (i === 6 || i === 7) ? (this._trigger(i, pad.buttons[i]) ? 1 : 0) : pad.buttons[i];
    }
    if (this.device === 'pad') this._checkFamily();   // pad-to-pad swap with a different id (§1 rule 4)
    if (!this.enabled) return;
    for (let i = 0; i < PAD_BUTTONS; i++) {
      const v = this.padNow[i];
      if (v > 0.5 && this._padPrev[i] <= 0.5) {
        this._setDevice('pad');
        for (const [a, list] of Object.entries(this.pad)) if (list.includes(i)) this._pressed.add(a);
        for (const [a, list] of Object.entries(PAD_UI)) if (list.includes(i)) this._pushUI(a);
      }
      this._padPrev[i] = v;
    }
    const ls = pad.leftStick, rs = pad.rightStick;
    if (Math.hypot(ls.x, ls.y) > this.moveDead || Math.hypot(rs.x, rs.y) > this.aimDead) this._setDevice('pad');
    // Menu nav from left-stick flicks (edge with re-arm).
    const m = Math.max(Math.abs(ls.x), Math.abs(ls.y));
    if (this._menuStickArmed && m > PAD_MENU_FLICK) {
      this._menuStickArmed = false;
      if (Math.abs(ls.x) > Math.abs(ls.y)) this._pushUI(ls.x > 0 ? 'right' : 'left');
      else this._pushUI(ls.y > 0 ? 'down' : 'up');
    } else if (m < PAD_MENU_REARM) this._menuStickArmed = true;
  }

  /**
   * Gameplay intent for ONE sim step. (originX, originY) = the caster's SCREEN position, used to
   * turn the mouse pointer into an aim vector. Consumes latched edges.
   */
  sample(originX, originY) {
    const it = this.intent;
    const pad = this._getPad();
    let mx = 0, my = 0;
    if (this._held('moveLeft')) mx -= 1;
    if (this._held('moveRight')) mx += 1;
    if (this._held('moveUp')) my -= 1;
    if (this._held('moveDown')) my += 1;
    if (mx && my) { mx *= Math.SQRT1_2; my *= Math.SQRT1_2; }
    if (pad) {
      const s = radial(pad.leftStick.x, pad.leftStick.y, this.moveDead);
      if (s) { mx = pad.leftStick.x * s; my = pad.leftStick.y * s; }
    }
    it.moveX = mx; it.moveY = my;

    if (this.device === 'pad' && pad) {
      const s = radial(pad.rightStick.x, pad.rightStick.y, this.aimDead);
      if (s) { const m = Math.hypot(pad.rightStick.x, pad.rightStick.y); this.lastAimX = pad.rightStick.x / m; this.lastAimY = pad.rightStick.y / m; }
    } else {
      const dx = this.pointerX - originX, dy = this.pointerY - originY;
      const m = Math.hypot(dx, dy);
      if (m > 0.5) { this.lastAimX = dx / m; this.lastAimY = dy / m; }
    }
    it.aimX = this.lastAimX; it.aimY = this.lastAimY;
    it.aimScreenX = this.pointerX; it.aimScreenY = this.pointerY;

    const P = this._pressed;
    it.castHeld = this._held('cast') || this._padHeld(pad, 'cast');
    if (Save.settings.castMode === 'toggle') {
      if (P.has('cast')) this.castLatch = !this.castLatch;
      it.castHeld = this.castLatch;          // survives modals; RunScene clears it on run end
    }
    it.altCastHeld = this._held('altCast') || this._padHeld(pad, 'altCast');
    it.castPressed = P.has('cast');
    it.altCastPressed = P.has('altCast');
    it.dashPressed = P.has('dash');
    it.interactPressed = P.has('interact');
    it.wandNext = P.has('wandNext');
    it.wandPrev = P.has('wandPrev');
    it.wandSlot = P.has('wand1') ? 1 : P.has('wand2') ? 2 : P.has('wand3') ? 3 : P.has('wand4') ? 4 : 0;
    it.openInventory = P.has('inventory');
    it.pause = P.has('pause');
    it.device = this.device;
    P.clear();
    return it;
  }

  /**
   * Drain latched UI edges for the top overlay, in press order. The returned array is a reused
   * buffer, valid until the next consumeUI() call.
   */
  consumeUI() {
    const out = this._ui;
    this._ui = this._uiOut;
    this._ui.length = 0;
    this._uiOut = out;
    return out;
  }

  resetCastLatch() { this.castLatch = false; }

  /** Drop gameplay edges only (e.g. a Tab press that opened the editor must not re-fire). */
  dropPressed() { this._pressed.clear(); }

  /** Focus loss / overlay transitions: nothing stays held, no stale edges. */
  clearHeld() {
    this.keysDown.clear();
    this._pressed.clear();
    this._ui.length = 0;
  }
}
