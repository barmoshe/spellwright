// input/prompts.js — THE prompt-glyph table (controller-prompts §3). Keyed by (family, W3C standard
// button index). Replaces the three disagreeing tables (HudKit.PAD_BTN, kit.actionGlyph.PAD,
// SettingsScene.PAD_NAMES). Phaser-free: the drawing lives in ui/HudKit.js glyph().
//
// Atlas frame keys come from the TA's contract, `asset-manifest.json` → `prompts.byStdIndex`
// (installPromptAtlas at boot). Shared d-pad / stick frames follow ATLAS-KEYS.md `prompt.pad.<id>`.
// Text + fallback shape come from the UX table (§3, §5). Families: 'xbox' | 'ps' ('kbm' is procedural
// keycaps from the live bindings and never reaches this table).

import { PAD_UI, PAD_EDITOR } from './bindings.js';

// face: which position of the 12×12 diamond is filled (§5); sym: 5×5 PlayStation symbol (§5);
// pill: the short T-small legend used in the pill fallback (§5 "Touch" keeps the pill ≤ 30 px).
const TABLE = {
  0: { xbox: { text: 'A', face: 'bottom' }, ps: { text: 'Cross', face: 'bottom', sym: 'cross' } },
  1: { xbox: { text: 'B', face: 'right' }, ps: { text: 'Circle', face: 'right', sym: 'circle' } },
  2: { xbox: { text: 'X', face: 'left' }, ps: { text: 'Square', face: 'left', sym: 'square' } },
  3: { xbox: { text: 'Y', face: 'top' }, ps: { text: 'Triangle', face: 'top', sym: 'triangle' } },
  4: { xbox: { text: 'LB' }, ps: { text: 'L1' } },
  5: { xbox: { text: 'RB' }, ps: { text: 'R1' } },
  6: { xbox: { text: 'LT' }, ps: { text: 'L2' } },
  7: { xbox: { text: 'RT' }, ps: { text: 'R2' } },
  8: { xbox: { text: 'View' }, ps: { text: 'Create' } },
  9: { xbox: { text: 'Menu' }, ps: { text: 'Options' } },
  10: { xbox: { text: 'LS' }, ps: { text: 'L3' } },
  11: { xbox: { text: 'RS' }, ps: { text: 'R3' } },
  12: { xbox: { text: 'Up', dpad: 'up' }, ps: { text: 'Up', dpad: 'up' } },
  13: { xbox: { text: 'Down', dpad: 'down' }, ps: { text: 'Down', dpad: 'down' } },
  14: { xbox: { text: 'Left', dpad: 'left' }, ps: { text: 'Left', dpad: 'left' } },
  15: { xbox: { text: 'Right', dpad: 'right' }, ps: { text: 'Right', dpad: 'right' } },
  17: { ps: { text: 'Touchpad', pill: 'Touch' } },          // no Xbox equivalent
};
// Pseudo-buttons (no single index): shared across families.
const SHARED = {
  dpad: { text: 'D-pad', dpad: 'all', atlas: 'prompt.pad.dpad' },
  dpad_ud: { text: 'D-pad', dpad: 'ud', atlas: 'prompt.pad.dpad_ud' },
  dpad_lr: { text: 'D-pad', dpad: 'lr', atlas: 'prompt.pad.dpad_lr' },
  stick_l: { text: 'L', atlas: 'prompt.pad.stick_l', stick: 'l' },
  stick_r: { text: 'R', atlas: 'prompt.pad.stick_r', stick: 'r' },
};
/** Alias indices: bound, listed in the Settings table, but never drawn in a [token] prompt (§2.1: the prompt shows Create). */
const PROMPT_ALIAS = new Set([17]);

let atlasByIdx = {};

// controller-prompts §9.2: the `touch` family. Token → touch glyph id (+ text fallback). Pictures match the
// on-screen controls. Atlas frames `prompt.touch.<id>` are bound when the TA packs them; until then HudKit
// draws the procedural 12×12 pictogram (TOUCH_MASK there), and text-only contexts use `text`.
const TOUCH = {
  move: { id: 'stick_l', text: 'Left side' }, aim: { id: 'stick_r', text: 'Right side' },
  dash: { id: 'dash', text: 'DASH' }, wandNext: { id: 'swap', text: 'SWAP' }, wandPrev: { id: 'swap', text: 'SWAP' }, wand13: { id: 'swap', text: 'SWAP' },
  interact: { id: 'use', text: 'USE' }, inventory: { id: 'edit', text: 'EDIT' }, pause: { id: 'pause', text: 'PAUSE' },
  confirm: { id: 'tap', text: 'Tap' }, back: { id: 'back', text: 'Back' }, dpad: { id: 'drag', text: 'Drag' },
  tabPrev: { id: 'tap', text: 'Tap a tab' }, tabNext: { id: 'tap', text: 'Tap a tab' },
  quickMove: { id: null, text: 'To bag' }, salvage: { id: null, text: 'Salvage' },
  editorWandPrev: { id: 'tap', text: 'Tap a wand' }, editorWandNext: { id: 'tap', text: 'Tap a wand' },
};
/** Touch glyph entry for a token: { touch: id|null, text, atlas? }. `[cast]` depends on touchFire. */
export function touchEntry(token, touchFire = 'auto') {
  const e = token === 'cast' ? (touchFire === 'stick' ? { id: 'stick_r', text: 'Right side' } : { id: 'auto', text: 'Auto' }) : TOUCH[token];
  if (!e) return null;
  return { touch: e.id, text: e.text, atlas: e.id ? `prompt.touch.${e.id}` : null };
}

/** Boot: adopt the TA's `prompts.byStdIndex` (family → frame key). Missing block ⇒ procedural fallback everywhere. */
export function installPromptAtlas(manifestPrompts) {
  atlasByIdx = (manifestPrompts && manifestPrompts.byStdIndex) || {};
}

/**
 * The glyph entry for (family, idx | pseudo-key): { text, atlas?, face?, sym?, pill?, dpad?, stick? } or null
 * when the family has no such button (e.g. Xbox touchpad).
 */
export function promptEntry(family, key) {
  const fam = family === 'ps' ? 'ps' : 'xbox';
  if (typeof key === 'string' && SHARED[key]) return SHARED[key];
  const row = TABLE[key];
  const e = row && row[fam];
  if (!e) return null;
  const a = atlasByIdx[key] && atlasByIdx[key][fam];
  return a ? { ...e, atlas: a } : e;
}

/** Text-only contexts (§5): "Cross", "L1", "Create" … never "X"/"O" for Cross/Circle. */
export function promptText(family, key) {
  const e = promptEntry(family, key);
  return e ? e.text : '';
}

/** Settings Controls table pad column: every bound index (aliases included), " · " separated. */
export function promptListText(family, indices) {
  const out = [];
  for (const i of indices || []) { const s = promptText(family, i); if (s && !out.includes(s)) out.push(s); }
  return out.join(' · ');
}

const first = (a) => (a && a.length ? [a[0]] : []);
const promptable = (list) => (list || []).filter((i) => !PROMPT_ALIAS.has(i));

/**
 * The glyph keys a `[token]` names on a pad family: std indices or pseudo-keys, in prompt order.
 * Gameplay tokens read the router's LIVE pad bindings (bindings.pad is keyed by index, so both families
 * share it); UI tokens read PAD_UI / PAD_EDITOR. Unknown token → [] (caller shows the token text).
 */
export function tokenKeys(router, token) {
  const pad = (router && router.pad) || {};
  const byIntent = (intent) => Object.keys(PAD_EDITOR).filter((k) => PAD_EDITOR[k] === intent).map(Number);
  switch (token) {
    case 'move': return ['stick_l'];
    case 'aim': return ['stick_r'];
    case 'dpad': return ['dpad'];
    case 'wandNext': case 'wand13': return [...first(promptable(pad.wandNext)), ...first(promptable(pad.wandPrev))];
    case 'dash': return promptable(pad.dash).slice(0, 2);
    case 'confirm': return first(promptable(PAD_UI.confirm));
    case 'back': return first(promptable(PAD_UI.back));
    case 'tabPrev': return first(promptable(PAD_UI.tabPrev));
    case 'tabNext': return first(promptable(PAD_UI.tabNext));
    case 'quickMove': return byIntent('quickMove');
    case 'salvage': return byIntent('salvage');
    case 'editorWandPrev': return byIntent('wandPrev');
    case 'editorWandNext': return byIntent('wandNext');
    default: return first(promptable(pad[token]));
  }
}
