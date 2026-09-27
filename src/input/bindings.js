// input/bindings.js — default bindings (architecture §8). Keyboard uses KeyboardEvent.code
// (layout-independent: WASD stays WASD on AZERTY), mouse buttons are 'Mouse0/1/2', wheel is
// 'WheelUp/WheelDown'. Gamepad uses W3C Standard-mapping button indices.
// Overrides live in Save.settings.bindings.{kbm,pad} as { action: [codes] }. UX owns final layout.

export const KBM_DEFAULTS = {
  moveUp: ['KeyW', 'ArrowUp'],
  moveDown: ['KeyS', 'ArrowDown'],
  moveLeft: ['KeyA', 'ArrowLeft'],
  moveRight: ['KeyD', 'ArrowRight'],
  cast: ['Mouse0'],
  altCast: [],                    // unused by the design (mechanic-spec §13): RMB is dash
  dash: ['Space', 'Mouse2'],
  interact: ['KeyE'],             // E = interact only (mechanic-spec §13 resolves the E conflict)
  wandNext: ['WheelDown', 'KeyQ'],// Q cycles forward; wheel both ways
  wandPrev: ['WheelUp'],
  wand1: ['Digit1'], wand2: ['Digit2'], wand3: ['Digit3'], wand4: [],   // 3 wand slots (rules.player.wandSlots)
  inventory: ['Tab', 'KeyI'],
  pause: ['Escape'],
};

// UI channel (menus). Never rebound per action; routed to the top overlay only.
export const KBM_UI = {
  up: ['ArrowUp', 'KeyW'], down: ['ArrowDown', 'KeyS'], left: ['ArrowLeft', 'KeyA'], right: ['ArrowRight', 'KeyD'],
  confirm: ['Enter', 'Space'], back: ['Escape', 'Backspace', 'Tab'], tabPrev: ['KeyQ'], tabNext: ['KeyE'],
};

// W3C Standard Gamepad (Xbox / PlayStation names): 0 A/Cross, 1 B/Circle, 2 X/Square, 3 Y/Triangle,
// 4 LB/L1, 5 RB/R1, 6 LT/L2, 7 RT/R2, 8 View/Create, 9 Menu/Options, 10 LS/L3, 11 RS/R3, 12 Up, 13 Down,
// 14 Left, 15 Right, 16 Guide/PS (never bound: the OS may capture it), 17 DualSense touchpad click
// (Chrome/Edge; platform/gamepad.js remaps raw Sony HID to these indices). Prompts: src/input/prompts.js.
export const PAD_DEFAULTS = {
  cast: [7],
  altCast: [],
  dash: [0, 4],
  interact: [2],
  wandNext: [5],
  wandPrev: [3],
  inventory: [8, 17],            // View/Create + DualSense touchpad click (controller-prompts §2.1)
  pause: [9],
};

export const PAD_UI = {
  up: [12], down: [13], left: [14], right: [15],
  confirm: [0], back: [1, 8, 9, 17], tabPrev: [4], tabNext: [5],
};

// Editor-scoped pad intents (ui/extraKeys.js; wand-editor-ux §9): X/Square quick move, Y/Triangle salvage,
// LT/L2 · RT/R2 switch wand. Also the source of the editor prompt tokens (prompts.js).
export const PAD_EDITOR = { 2: 'quickMove', 3: 'salvage', 6: 'wandPrev', 7: 'wandNext' };

// Analog triggers (standard 6/7) use hysteresis: feel-spec `padTriggerPress` / `padTriggerRelease`,
// installed by InputRouter.applyTunables(). Every other button is pressed at value > 0.5.
export const PAD_TRIGGERS = [6, 7];
export const PAD_DIGITAL_PRESS = 0.5;

// Stick shaping: pre-boot defaults only. After Boot, InputRouter.applyTunables() replaces the two
// deadzones with feel-spec `moveStickDeadzone` / `aimStickDeadzone` (verbatim).
export const PAD_MOVE_DEADZONE = 0.2;
export const PAD_AIM_DEADZONE = 0.3;
export const PAD_MENU_FLICK = 0.6;
export const PAD_MENU_REARM = 0.3;

export function mergeBindings(defaults, overrides) {
  const out = {};
  for (const k of Object.keys(defaults)) out[k] = Array.isArray(overrides?.[k]) ? overrides[k].slice() : defaults[k].slice();
  return out;
}
