// ui/HudKit.js — HUD-only primitives (UI developer B). ui-artwork §4–§5 pixels with generated
// fallbacks, device glyphs (hud-layout §3.5), motion/flash helpers (accessibility-spec §4).
//
// ART: every HUD glyph is looked up as `ui.<frame>` (art-slot-map `ui`, frame names from
// assets/src/art/spellwright_ui.json) through core/art.js. Until the TA's UI atlas lands, the same
// name resolves to a texture generated ONCE from the pixel masks below (`hudfb:<name>`), so every
// HUD element is an Image either way and switching state is a setTexture(), never a redraw.

import { Art } from '../core/art.js';
import { Save } from '../core/save.js';
import { C, txt } from './kit.js';
import { promptEntry, promptText, tokenKeys } from '../input/prompts.js';

// ---------------------------------------------------------------------------------------------
// settings-derived helpers
// ---------------------------------------------------------------------------------------------
export const reducedMotion = () => Save.reducedMotion;
/** Flash-intensity scale 0..1 (settings-spec: Flash intensity 0–100%). */
export const flashScale = () => Math.max(0, Math.min(1, (Save.settings.flashIntensity ?? 100) / 100));
export const hintsOn = () => Save.settings.tutorialHints !== false;

// ---------------------------------------------------------------------------------------------
// pixel masks → fallback textures
// ---------------------------------------------------------------------------------------------
const PAL = {
  '#': C.stroke, w: C.text, d: 0x4a2a32, r: C.hpRed, l: 0xf6a08c, b: C.mana, c: 0xcae6f5,
  y: C.gold, o: C.bronze, e: C.error, k: 0x3b3550, s: C.slateLight, g: C.dim,
};

const HEART = [
  '..###...###..',
  '.#rrr#.#rrr#.',
  '#rrlrr#rrrrr#',
  '#rlrrrrrrrrr#',
  '#rrrrrrrrrrr#',
  '#rrrrrrrrrrr#',
  '.#rrrrrrrrr#.',
  '..#rrrrrrr#..',
  '...#rrrrr#...',
  '....#rrr#....',
  '.....#r#.....',
  '......#......',
];
const heartVariant = (fn) => HEART.map((row, y) => [...row].map((ch, x) => fn(ch, x, y)).join(''));

// `outline: true` masks are drawn in their colours and get a 1 px #222222 8-neighbour keyline
// (texture grows by 1 px on each side: callers offset by −1).
const MASKS = {
  ui_heart_full: { rows: HEART },
  ui_heart_half: { rows: heartVariant((ch, x) => (x >= 7 && (ch === 'r' || ch === 'l') ? 'd' : ch)) },
  ui_heart_empty: { rows: heartVariant((ch) => (ch === 'r' || ch === 'l' ? 'd' : ch)) },
  shield_hex_13x12: { rows: [
    '...#######...', '..#bbbbbbb#..', '.#bbcbbbbbb#.', '#bbcbbbbbbbb#', '#bbbbbbbbbbb#', '#bbbbbbbbbbb#',
    '#bbbbbbbbbbb#', '#bbbbbbbbbbb#', '.#bbbbbbbbb#.', '..#bbbbbbb#..', '...#######...', '.............'] },
  pip_start: { outline: true, rows: ['..www..', '.w...w.', 'w.....w', 'w.....w', 'w.....w', '.w...w.', '..www..'] },
  pip_combat: { outline: true, rows: ['.......', '.wwwww.', '.wwwww.', '.wwwww.', '.wwwww.', '.wwwww.', '.......'] },
  pip_elite: { outline: true, rows: ['...w...', '..www..', '.wwwww.', 'wwwwwww', '.wwwww.', '..www..', '...w...'] },
  pip_treasure: { outline: true, rows: ['.......', '...w...', '..www..', '..www..', '.wwwww.', 'wwwwwww', '.......'] },
  pip_shop: { outline: true, rows: ['..www..', '.wwwww.', 'wwwwwww', 'wwwwwww', 'wwwwwww', '.wwwww.', '..www..'] },
  pip_future: { outline: true, rows: ['.......', '.wwwww.', '.w...w.', '.w...w.', '.w...w.', '.wwwww.', '.......'] },
  pip_boss_9: { outline: true, rows: ['..wwwww..', '.wwwwwww.', 'wwwwwwwww', 'ww..w..ww', 'ww..w..ww', 'wwwwwwwww', '.www.www.', '..w.w.w..', '..wwwww..'] },
  pip_current_9: { rows: ['yyyyyyyyy', 'y.......y', 'y.......y', 'y.......y', 'y.......y', 'y.......y', 'y.......y', 'y.......y', 'yyyyyyyyy'] },
  coin_anim_f0: { rows: ['..####..', '.#yyyy#.', '#yywyyy#', '#ywyyyo#', '#yyyyyo#', '#yyyyoo#', '.#yooo#.', '..####..'] },
  bag_8: { rows: ['..#..#..', '...##...', '..#oo#..', '.#oooo#.', '#oowooo#', '#oooooo#', '#oooooo#', '.######.'] },
  g_warn: { rows: ['....#....', '...#y#...', '...#y#...', '..#y#y#..', '..#y#y#..', '.#yy#yy#.', '.#yyyyy#.', '#yyy#yyy#', '#########'] },
  g_stop: { rows: ['..#####..', '.#eeeee#.', '#eeeeeee#', '#eeeeeee#', '#ewwwwwe#', '#eeeeeee#', '#eeeeeee#', '.#eeeee#.', '..#####..'] },
  g_hand: { outline: true, rows: ['.w.w.w.', '.w.w.w.', '.wwwww.', 'ww.www.', '.wwwww.', '..www..', '..www..'] },
  g_ok: { outline: true, rows: ['.......', '......w', '.....w.', 'w...w..', '.w.w...', '..w....', '.......'] },
  g_chevron_5x3: { outline: true, rows: ['..w..', '.www.', 'wwwww'] },
  reticle_9x9: { outline: true, rows: ['....w....', '....w....', '....w....', '.........', 'www.w.www', '.........', '....w....', '....w....', '....w....'] },
  aim_pip_5x5: { outline: true, rows: ['..w..', '.w.w.', 'w...w', '.w.w.', '..w..'] },
  hatch_4: { rows: ['w...', '.w..', '..w.', '...w'] },
  // reward-kind shapes for door badges (hud-layout §6: spell ● · modifier ◈ · relic ◇ · wand ⟋ · coins ◉ · heal ✚)
  rk_spell: { outline: true, rows: ['..www..', '.wwwww.', 'wwwwwww', 'wwwwwww', 'wwwwwww', '.wwwww.', '..www..'] },
  rk_modifier: { outline: true, rows: ['...w...', '..w.w..', '.w.w.w.', 'w.www.w', '.w.w.w.', '..w.w..', '...w...'] },
  rk_relic: { outline: true, rows: ['...w...', '..w.w..', '.w...w.', 'w.....w', '.w...w.', '..w.w..', '...w...'] },
  rk_wand: { outline: true, rows: ['......w', '.....w.', '....w..', '...w...', '..w....', '.w.....', 'w......'] },
  rk_coins: { outline: true, rows: ['..www..', '.w...w.', 'w.www.w', 'w.www.w', 'w.www.w', '.w...w.', '..www..'] },
  rk_heal: { outline: true, rows: ['..www..', '..www..', 'wwwwwww', 'wwwwwww', 'wwwwwww', '..www..', '..www..'] },
  rk_shop: { outline: true, rows: ['..www..', '.wwwww.', 'wwwwwww', 'wwwwwww', 'wwwwwww', '.wwwww.', '..www..'] },
  rk_boss: { outline: true, rows: ['.wwwww.', 'wwwwwww', 'w..w..w', 'wwwwwww', '.ww.ww.', '.w.w.w.', '.......'] },
  rk_none: { outline: true, rows: ['.......', '.......', '.......', '.wwwww.', '.......', '.......', '.......'] },
};

function dilate(rows) {
  const h = rows.length, w = rows[0].length;
  const out = [];
  for (let y = -1; y <= h; y++) {
    let line = '';
    for (let x = -1; x <= w; x++) {
      const ch = rows[y] && rows[y][x];
      if (ch && ch !== '.') { line += ch; continue; }
      let near = false;
      for (let dy = -1; dy <= 1 && !near; dy++) for (let dx = -1; dx <= 1; dx++) {
        const n = rows[y + dy] && rows[y + dy][x + dx];
        if (n && n !== '.' && n !== '#') { near = true; break; }
      }
      line += near ? '#' : '.';
    }
    out.push(line);
  }
  return out;
}

/** Generate every fallback texture once per game (textures are global). */
export function ensureHudTextures(scene) {
  if (scene.textures.exists('hudfb:pip_combat')) return;
  const g = scene.make.graphics({ x: 0, y: 0 }, false);
  for (const [name, m] of Object.entries(MASKS)) {
    const rows = m.outline ? dilate(m.rows) : m.rows;
    g.clear();
    for (let y = 0; y < rows.length; y++) for (let x = 0; x < rows[y].length; x++) {
      const ch = rows[y][x];
      if (ch === '.') continue;
      g.fillStyle(PAL[ch] ?? C.text, 1).fillRect(x, y, 1, 1);
    }
    g.generateTexture(`hudfb:${name}`, rows[0].length, rows.length);
  }
  // procedural frames (ui-artwork §4 H8 badges; empty wand slot)
  const box = (key, w, h, draw) => { g.clear(); draw(g); g.generateTexture(key, w, h); };
  box('hudfb:badge_20', 20, 20, (q) => {
    q.fillStyle(C.stroke, 1).fillRect(0, 0, 20, 20).fillStyle(C.panel, 1).fillRect(1, 1, 18, 18);
    q.lineStyle(1, C.slate, 1).strokeRect(1.5, 1.5, 17, 17);
  });
  box('hudfb:badge_20_equipped', 20, 20, (q) => {
    q.fillStyle(C.stroke, 1).fillRect(0, 0, 20, 20).fillStyle(C.text, 1).fillRect(1, 1, 18, 18).fillStyle(C.panel, 1).fillRect(3, 3, 14, 14);
  });
  box('hudfb:badge_20_empty', 20, 20, (q) => {
    q.fillStyle(C.stroke, 0.6).fillRect(0, 0, 20, 20);
    q.fillStyle(C.slateDark, 1);
    for (let i = 1; i < 19; i += 4) { q.fillRect(i, 1, 2, 1).fillRect(i, 18, 2, 1).fillRect(1, i, 1, 2).fillRect(18, i, 1, 2); }
  });
  g.destroy();
}

/** Outline masks carry a 1 px keyline outside the authored box: draw offset by −1. */
export const fbPad = (name) => (MASKS[name] && MASKS[name].outline ? 1 : 0);

/** {key, frame, pad} for a ui-artwork frame name: the TA's atlas first, the generated fallback second. */
export function hudTex(name) {
  const a = Art.getQuiet(`ui.${name}`) || Art.getQuiet(name);
  if (a) return { key: a.key, frame: a.frame, pad: 0 };
  return { key: `hudfb:${name}`, frame: undefined, pad: fbPad(name) };
}

/** Image at the authored box's top-left (x, y). `img.setGlyph(name)` swaps the frame. */
export function hudImage(scene, x, y, name) {
  const t = hudTex(name);
  const im = scene.add.image(x - t.pad, y - t.pad, t.key, t.frame).setOrigin(0);
  im.__bx = x; im.__by = y; im.__glyph = name;
  im.setGlyph = (n) => {
    if (n === im.__glyph) return im;
    const tt = hudTex(n);
    im.setTexture(tt.key, tt.frame);
    im.setPosition(im.__bx - tt.pad, im.__by - tt.pad);
    im.__glyph = n;
    return im;
  };
  im.moveBox = (nx, ny) => { im.__bx = nx; im.__by = ny; const tt = hudTex(im.__glyph); im.setPosition(nx - tt.pad, ny - tt.pad); return im; };
  return im;
}

/** Centred image (world UI). */
export function hudImageC(scene, x, y, name) {
  const t = hudTex(name);
  return scene.add.image(x, y, t.key, t.frame);
}

// ---------------------------------------------------------------------------------------------
// device glyphs (hud-layout §3.5, ftue-flow §2 rules 10–11, controller-prompts §3–§5: current
// bindings, current PROMPT FAMILY). Pad legends resolve through input/prompts.js only.
// ---------------------------------------------------------------------------------------------
/** controller-prompts §5 5×5 PlayStation symbols ('#' = symbol colour). Never the letters X / O. */
const PS_SYM = {
  cross: ['#...#', '.#.#.', '..#..', '.#.#.', '#...#'],
  circle: ['.###.', '#...#', '#...#', '#...#', '.###.'],
  square: ['#####', '#...#', '#...#', '#...#', '#####'],
  triangle: ['..#..', '.#.#.', '.#.#.', '#...#', '#####'],
};
const BODY = 0x4b5468;

/** Draw a 5×5 PS symbol into Graphics g at (x, y) (top-left), 1 px outline-free (callers add the halo). */
export function drawPsSymbol(g, x, y, sym, color = C.text) {
  const rows = PS_SYM[sym]; if (!rows) return;
  g.fillStyle(color, 1);
  for (let r = 0; r < 5; r++) for (let c = 0; c < 5; c++) if (rows[r][c] === '#') g.fillRect(x + c, y + r, 1, 1);
}

function codeLabel(code) {
  if (!code) return '?';
  return code.replace(/^Key/, '').replace(/^Digit/, '').replace(/^Arrow/, '').replace('Mouse0', 'LMB').replace('Mouse2', 'RMB')
    .replace('Mouse1', 'MMB').replace('Escape', 'Esc').replace('WheelDown', 'Wheel').replace('WheelUp', 'Wheel');
}

/**
 * Glyph specs for a prompt token on the current prompt family. Keyboard: `{ key: label }` keycaps from
 * the live bindings. Pad: `{ fam, idx }` where idx is a W3C standard index or a prompts.js pseudo-key.
 * Tokens: gameplay actions + move · aim · wand13, and the UI tokens of controller-prompts §3.
 */
export function glyphSpecs(router, token) {
  const fam = router ? router.promptFamily : 'kbm';
  if (fam !== 'kbm') return tokenKeys(router, token).map((idx) => ({ fam, idx }));
  const kbm = (router && router.kbm) || {};
  switch (token) {
    case 'move': {
      const k = ['moveUp', 'moveLeft', 'moveDown', 'moveRight'].map((a) => codeLabel((kbm[a] || [])[0]));
      return [{ key: k.every((x) => x.length === 1) ? k.join('') : k.join(' ') }];
    }
    case 'aim': return [{ key: 'Mouse' }];
    case 'wand13': return [{ key: [1, 2, 3].map((i) => codeLabel((kbm[`wand${i}`] || [])[0])).join('-') }];
    case 'dash': return (kbm.dash || []).slice(0, 2).map((c) => ({ key: codeLabel(c) }));
    case 'wandNext': return (kbm.wandNext || []).slice(0, 2).map((c) => ({ key: codeLabel(c) })).reverse();
    default: return [{ key: codeLabel((kbm[token] || [])[0]) }];
  }
}
/** Text-only labels for a token (tooltips / logs): "Cross", "L1", "RT" … never "X" for Cross. */
export function glyphLabels(router, token) {
  return glyphSpecs(router, token).map((g) => (g.key !== undefined ? g.key : promptText(g.fam, g.idx)));
}

/**
 * One glyph, 12 px tall, origin top-left, width in `._w`. `spec` is a glyphSpecs() entry (or a plain
 * keycap label string). Pad glyphs use the TA's 12 px `prompt.*` atlas frame when packed; otherwise the
 * controller-prompts §5 fallback: position diamond + letter (Xbox) or + 5×5 symbol (PS), pills for the
 * rest. Returns a Container (Phaser 4 containers own `w`/`h`, hence `_w`).
 */
export function glyph(scene, x, y, spec) {
  if (typeof spec === 'string') spec = { key: spec };
  const c = scene.add.container(x, y);
  const e = spec.key === undefined ? promptEntry(spec.fam, spec.idx) : null;
  const a = e && e.atlas ? Art.getQuiet(e.atlas) : null;
  if (a) {
    const im = scene.add.image(0, 0, a.key, a.frame).setOrigin(0, 0);
    c.add(im);
    c._w = Math.round(im.width);
  } else {
    const g = scene.add.graphics();
    c.add(g);
    if (e && e.face) {
      // 12×12 diamond of four 4×4 dots; the pressed position is filled, then the legend (letter or symbol).
      const pos = { top: [4, 0], left: [0, 4], right: [8, 4], bottom: [4, 8] };
      g.fillStyle(C.stroke, 1).fillRect(-1, -1, 14, 14);
      for (const [k, [px, py]] of Object.entries(pos)) g.fillStyle(k === e.face ? C.text : BODY, 1).fillRect(px, py, 4, 4);
      if (e.sym) {
        g.fillStyle(C.stroke, 1).fillRect(13, 2, 7, 7);          // 1 px #222222 halo (accessibility-spec §2.2)
        drawPsSymbol(g, 14, 3, e.sym);
        c._w = 20;
      } else {
        c.add(txt(scene, 14, 6, e.text, 'Tsmall', { origin: [0, 0.5] }));
        c._w = 14 + Math.max(5, e.text.length * 5);
      }
    } else if (e && e.dpad) {
      // D-pad plus: arms filled for the directions the prompt names ('all' | 'ud' | 'lr' | one direction)
      g.fillStyle(C.stroke, 1).fillRect(3, -1, 6, 14).fillRect(-1, 3, 14, 6);
      g.fillStyle(BODY, 1).fillRect(4, 0, 4, 12).fillRect(0, 4, 12, 4);
      const on = { all: ['up', 'down', 'left', 'right'], ud: ['up', 'down'], lr: ['left', 'right'] }[e.dpad] || [e.dpad];
      const arm = { up: [4, 0, 4, 4], down: [4, 8, 4, 4], left: [0, 4, 4, 4], right: [8, 4, 4, 4] };
      g.fillStyle(C.text, 1);
      for (const d of on) { const r = arm[d]; if (r) g.fillRect(r[0], r[1], r[2], r[3]); }
      c._w = 12;
    } else {
      const label = e ? (e.pill || e.text) : (spec.key !== undefined ? spec.key : '?');
      const pill = spec.key === undefined;               // pad: rounded pill; keyboard: square keycap
      const w = Math.max(12, label.length * 5 + 5);
      g.fillStyle(C.stroke, 1).fillRect(pill ? 1 : 0, 0, w - (pill ? 2 : 0), 12).fillRect(0, pill ? 1 : 0, w, pill ? 10 : 12);
      g.fillStyle(BODY, 1).fillRect(1, 1, w - 2, 10).fillStyle(0x6a7590, 1).fillRect(1, 1, w - 2, 1);
      c.add(txt(scene, Math.floor(w / 2), 6, label, 'Tsmall', { origin: [0.5, 0.5] }));
      c._w = w;
    }
  }
  c.setSize(c._w, 12);
  return c;
}

/**
 * Lay out a prompt string with `[token]` placeholders into a row of glyphs and text.
 * Returns a Container (origin top-left) with `._w` / `._h` / `.lines`. Example: "Hold [cast] to keep casting".
 */
export function promptRow(scene, str, router, role = 'T1', maxW = Infinity, color = undefined) {
  const c = scene.add.container(0, 0);
  const LINE = 13, GAP = 3;
  const topts = color === undefined ? { origin: [0, 0.5] } : { origin: [0, 0.5], color };
  let x = 0, y = 0, w = 0;
  const place = (obj, ow) => {
    if (x > 0 && x + ow > maxW) { x = 0; y += LINE; }
    obj.setPosition(x, obj.__vc ? y + 6 : y);
    c.add(obj);
    x += ow; w = Math.max(w, x);
    x += GAP;
  };
  const parts = String(str).split(/(\[[a-zA-Z0-9]+\])/);
  for (const p of parts) {
    if (!p) continue;
    const m = /^\[([a-zA-Z0-9]+)\]$/.exec(p);
    if (m) {
      const specs = glyphSpecs(router, m[1]);
      if (!specs.length) { const t = txt(scene, 0, 0, m[1], role, topts); t.__vc = true; place(t, Math.ceil(t.width)); continue; }
      // a multi-glyph token ("Space/RMB") stays on one line
      const grp = scene.add.container(0, 0);
      let gx = 0;
      specs.forEach((sp, i) => {
        if (i > 0) { const s = txt(scene, gx, 6, '/', role, topts); grp.add(s); gx += Math.ceil(s.width) + 1; }
        const gl = glyph(scene, gx, 0, sp);
        grp.add(gl); gx += gl._w + 1;
      });
      place(grp, Math.max(1, gx - 1));
    } else {
      for (const word of p.split(/\s+/)) {
        if (!word) continue;
        const t = txt(scene, 0, 0, word, role, topts);
        t.__vc = true;
        place(t, Math.ceil(t.width));
      }
    }
  }
  c._w = Math.max(1, w);
  c._h = y + 12;
  c.lines = y / LINE + 1;
  return c;
}

/**
 * A footer / hint line on the current prompt family: keyboard strings render as plain text (unchanged
 * look); pad strings carry `[token]`s and render through promptRow. `align` positions the row about x;
 * `y` is the row's TOP. Returns the display object with `._w`.
 */
export function hintLine(scene, x, y, str, router, { align = 'left', color = C.dim, role = 'T1' } = {}) {
  if (!router || router.promptFamily === 'kbm' || !/\[[a-zA-Z0-9]+\]/.test(str)) {
    const t = txt(scene, x, y, str, role, { origin: [align === 'center' ? 0.5 : align === 'right' ? 1 : 0, 0], color });
    t._w = Math.ceil(t.width);
    return t;
  }
  const r = promptRow(scene, str, router, role, Infinity, color);
  r.setPosition(align === 'center' ? Math.round(x - r._w / 2) : align === 'right' ? x - r._w : x, y);
  return r;
}

/** Dark panel (ui-artwork §1 panel_dark) drawn into Graphics at (x, y, w, h). */
export function drawDarkPanel(g, x, y, w, h, alpha = 1) {
  g.fillStyle(C.stroke, alpha).fillRect(x, y, w, h);
  g.fillStyle(C.panel, alpha).fillRect(x + 1, y + 1, w - 2, h - 2);
  g.lineStyle(1, C.slateDark, alpha).strokeRect(x + 1.5, y + 1.5, w - 3, h - 3);
  return g;
}

/** Room-kind → pip frame (hud-layout H4 shape family). */
export const PIP_FOR_KIND = { start: 'pip_start', combat: 'pip_combat', elite: 'pip_elite', treasure: 'pip_treasure', shop: 'pip_shop', boss: 'pip_boss_9' };
/** Reward kind → door badge frame (icon16 reward_kind.* when the TA delivers it, shape fallback otherwise). */
export function rewardKindTex(kind) {
  const a = Art.getQuiet(`icon16.reward_kind.${kind}`) || Art.getQuiet(`reward_kind.${kind}.icon16`);
  if (a) return { key: a.key, frame: a.frame };
  const fb = MASKS[`rk_${kind}`] ? `rk_${kind}` : kind === 'bossRelic' ? 'rk_relic' : 'rk_none';
  return { key: `hudfb:${fb}`, frame: undefined };
}

/** Clamp a screen-space box into hud-layout §2.4 spatial box (6, 44, 628, 262). */
export const SPATIAL = { x: 6, y: 44, w: 628, h: 262 };
export function clampBox(sx, sy, w, h) {
  const x = Math.max(SPATIAL.x, Math.min(SPATIAL.x + SPATIAL.w - w, sx));
  const y = Math.max(SPATIAL.y, Math.min(SPATIAL.y + SPATIAL.h - h, sy));
  return [Math.round(x), Math.round(y)];
}
