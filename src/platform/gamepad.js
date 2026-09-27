// platform/gamepad.js — the ONE place that reads the browser Gamepad API (architecture §8, F4 boundary).
//
// Everything above this module sees a normalised pad in W3C Standard-mapping terms only:
//   buttons[0..17] (values 0..1), leftStick/rightStick {x, y}, the pad family ('xbox' | 'ps') and
//   the haptic actuator. Browser differences are absorbed here:
//   - mapping 'standard'          → read verbatim (Chrome/Edge DualSense also exposes index 17 = touchpad).
//   - mapping !== 'standard' AND a Sony pad (raw HID order, e.g. Firefox/Safari builds without a
//     built-in remap) → SONY_RAW table below (buttons, sticks, analog triggers on axes, hat d-pad).
//   - any other non-standard pad  → read verbatim (the pre-existing behaviour; controller-prompts §2.1 (f)).
//
// Polled once per render frame by InputRouter.pollFrame() (SystemScene, first scene). Zero allocation
// per frame: the snapshot object and its typed array are reused.

export const PAD_BUTTONS = 18;          // 0..16 standard + 17 (DualSense touchpad click, Chrome/Edge)

/** controller-prompts §1 step 3: Xbox is checked FIRST (Xbox pads report "Xbox Wireless Controller"). */
const XBOX_RE = /xbox|xinput|045e/i;
const SONY_RE = /054c|dualsense|dualshock|playstation|sony|wireless controller/i;

export function padFamily(id) {
  const s = String(id || '');
  if (XBOX_RE.test(s)) return 'xbox';
  if (SONY_RE.test(s)) return 'ps';
  return 'xbox';                         // Switch Pro, 8BitDo, generic: position diamonds read by position
}

/**
 * DualSense / DualShock 4 raw HID order → standard index (buttons). Raw: 0 Square, 1 Cross, 2 Circle,
 * 3 Triangle, 4 L1, 5 R1, 6 L2 (digital), 7 R2 (digital), 8 Create/Share, 9 Options, 10 L3, 11 R3,
 * 12 PS, 13 Touchpad click. (14 = DualSense mute: ignored, never bound.)
 */
const SONY_RAW_BUTTONS = [2, 0, 1, 3, 4, 5, 6, 7, 8, 9, 10, 11, 16, 17];
/** Raw axes: 0 LX, 1 LY, 2 RX, 3 L2 (-1..1), 4 R2 (-1..1), 5 RY, 9 hat switch (HID usage 0x39 − 0x30). */
const SONY_RAW_AXES = { lx: 0, ly: 1, rx: 2, l2: 3, r2: 4, ry: 5, hat: 9 };

export class PadReader {
  constructor() {
    this.buttons = new Float32Array(PAD_BUTTONS);
    this.leftStick = { x: 0, y: 0 };
    this.rightStick = { x: 0, y: 0 };
    this.connected = false;
    this.id = '';
    this.index = -1;
    this.family = 'xbox';
    this.remapped = false;               // true when the Sony raw → standard table is in use
    this.raw = null;                     // the native Gamepad of the last poll (haptics)
    // Chrome reports an analog-trigger axis as 0 (= half pressed once rescaled) until the trigger first
    // moves. A trigger axis is trusted only after it has been seen at a value other than exactly 0.
    this._trigSeen = [false, false];
  }

  /** Read the first connected pad (v1 is pad1 only). Returns this, or null when no pad is connected. */
  poll() {
    let list = null;
    try { list = typeof navigator !== 'undefined' && navigator.getGamepads ? navigator.getGamepads() : null; } catch (e) { list = null; }
    let gp = null;
    if (list) for (let i = 0; i < list.length; i++) { const p = list[i]; if (p && p.connected !== false) { gp = p; break; } }
    const b = this.buttons;
    if (!gp) {
      if (this.connected) { b.fill(0); this.leftStick.x = this.leftStick.y = this.rightStick.x = this.rightStick.y = 0; }
      this.connected = false; this.raw = null;
      return null;
    }
    if (gp.id !== this.id || gp.index !== this.index) {
      this.id = gp.id; this.index = gp.index;
      this.family = padFamily(gp.id);
      this._trigSeen[0] = this._trigSeen[1] = false;
    }
    this.connected = true;
    this.raw = gp;
    this.remapped = gp.mapping !== 'standard' && this.family === 'ps';
    const bt = gp.buttons, ax = gp.axes;
    if (!this.remapped) {
      const n = Math.min(bt.length, PAD_BUTTONS);
      for (let i = 0; i < n; i++) b[i] = bt[i] ? +bt[i].value || (bt[i].pressed ? 1 : 0) : 0;
      for (let i = n; i < PAD_BUTTONS; i++) b[i] = 0;
      this.leftStick.x = ax[0] || 0; this.leftStick.y = ax[1] || 0;
      this.rightStick.x = ax[2] || 0; this.rightStick.y = ax[3] || 0;
      return this;
    }
    // ---- Sony raw HID → standard ----
    b.fill(0);
    const n = Math.min(bt.length, SONY_RAW_BUTTONS.length);
    for (let i = 0; i < n; i++) { const v = bt[i] ? +bt[i].value || (bt[i].pressed ? 1 : 0) : 0; const s = SONY_RAW_BUTTONS[i]; if (v > b[s]) b[s] = v; }
    const A = SONY_RAW_AXES;
    this.leftStick.x = ax[A.lx] || 0; this.leftStick.y = ax[A.ly] || 0;
    this.rightStick.x = ax[A.rx] || 0; this.rightStick.y = ax[A.ry] || 0;
    // analog triggers on axes (-1 rest .. 1 full) → 0..1; the digital L2/R2 button is the floor
    const trig = (axis, k, std) => {
      if (ax.length <= axis) return;
      const a = ax[axis];
      if (a !== 0) this._trigSeen[k] = true;
      if (this._trigSeen[k]) b[std] = Math.max(b[std], Math.min(1, Math.max(0, (a + 1) / 2)));
    };
    trig(A.l2, 0, 6); trig(A.r2, 1, 7);
    // hat switch: 8 directions encoded -1 + (2/7)·dir (0 = up, clockwise); anything outside [-1, 1] is neutral
    if (ax.length > A.hat) {
      const h = ax[A.hat];
      if (h >= -1.05 && h <= 1.05) {
        const d = Math.round((h + 1) * 3.5) & 7;
        if (d === 7 || d === 0 || d === 1) b[12] = 1;
        if (d >= 1 && d <= 3) b[15] = 1;
        if (d >= 3 && d <= 5) b[13] = 1;
        if (d >= 5) b[14] = 1;
      }
    }
    return this;
  }

  /** The haptic actuator of the pad in hand, or null (Safari/Firefox today; controller-prompts §6). */
  get actuator() {
    const a = this.raw && this.raw.vibrationActuator;
    return a && typeof a.playEffect === 'function' ? a : null;
  }
}
