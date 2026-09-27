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
// device glyphs (hud-layout §3.5, ftue-flow §2 rules 10–11: current bindings, current device)
// ---------------------------------------------------------------------------------------------
const PAD_BTN = { cast: 'RT', dash: 'A', interact: 'X', inventory: 'View', pause: 'Menu', wandNext: 'RB', wandPrev: 'Y', altDash: 'LB' };
const FACE = { A: 'bottom', B: 'right', X: 'left', Y: 'top' };

function codeLabel(code) {
  if (!code) return '?';
  return code.replace(/^Key/, '').replace(/^Digit/, '').replace(/^Arrow/, '').replace('Mouse0', 'LMB').replace('Mouse2', 'RMB')
    .replace('Mouse1', 'MMB').replace('Escape', 'Esc').replace('WheelDown', 'Wheel').replace('WheelUp', 'Wheel');
}

/**
 * Glyph labels for a prompt token on the current device. Returns an array of labels (joined with "/"
 * in prompts). Tokens: move · aim · cast · dash · interact · inventory · wandNext · wand13 · pause.
 */
export function glyphLabels(router, token) {
  const pad = router && router.device === 'pad';
  const kbm = (router && router.kbm) || {};
  switch (token) {
    case 'move': {
      if (pad) return ['L'];
      const k = ['moveUp', 'moveLeft', 'moveDown', 'moveRight'].map((a) => codeLabel((kbm[a] || [])[0]));
      return k.every((s) => s.length === 1) ? [k.join('')] : [k.join(' ')];
    }
    case 'aim': return [pad ? 'R' : 'Mouse'];
    case 'wand13': return pad ? ['RB', 'Y'] : [[1, 2, 3].map((i) => codeLabel((kbm[`wand${i}`] || [])[0])).join('-')];
    case 'dash': return pad ? ['A', 'LB'] : (kbm.dash || []).slice(0, 2).map(codeLabel);
    case 'wandNext': return pad ? ['RB', 'Y'] : (kbm.wandNext || []).slice(0, 2).map(codeLabel).reverse();
    default:
      if (pad) return [PAD_BTN[token] || token];
      return [codeLabel((kbm[token] || [])[0])];
  }
}

/**
 * A glyph for one label: keycap (KB+M), or a pad face-position diamond with the letter (A/B/X/Y are
 * drawn as positions so a non-Xbox pad reads by position, not colour), or a pad pill (RT/LB/…).
 * Returns a Container of width `._w` (Phaser 4 containers own `w`/`h`), height 12, origin top-left.
 */
export function glyph(scene, x, y, label, pad) {
  const c = scene.add.container(x, y);
  const g = scene.add.graphics();
  c.add(g);
  if (pad && FACE[label]) {
    // 12×12 diamond of four 3×3 dots; the pressed position is filled, then the letter.
    const pos = { top: [4, 0], left: [0, 4], right: [8, 4], bottom: [4, 8] };
    g.fillStyle(C.stroke, 1).fillRect(-1, -1, 14, 14);
    for (const [k, [px, py]] of Object.entries(pos)) {
      g.fillStyle(k === FACE[label] ? C.text : 0x4b5468, 1).fillRect(px, py, 4, 4);
    }
    const t = txt(scene, 14, 6, label, 'Tsmall', { origin: [0, 0.5] });
    c.add(t);
    c._w = 14 + Math.max(5, label.length * 5);
  } else {
    const w = Math.max(12, label.length * 5 + 5);
    const round = pad;
    g.fillStyle(C.stroke, 1).fillRect(round ? 1 : 0, 0, w - (round ? 2 : 0), 12).fillRect(0, round ? 1 : 0, w, round ? 10 : 12);
    g.fillStyle(0x4b5468, 1).fillRect(1, 1, w - 2, 10).fillStyle(0x6a7590, 1).fillRect(1, 1, w - 2, 1);
    c.add(txt(scene, Math.floor(w / 2), 6, label, 'Tsmall', { origin: [0.5, 0.5] }));
    c._w = w;
  }
  c.setSize(c._w, 12);
  return c;
}

/**
 * Lay out a prompt string with `[token]` placeholders into a row of glyphs and T1 text.
 * Returns a Container (origin top-left) with `._w` / `._h` / `.lines`. Example: "Hold [cast] to keep casting".
 */
export function promptRow(scene, str, router, role = 'T1', maxW = Infinity) {
  const c = scene.add.container(0, 0);
  const pad = router && router.device === 'pad';
  const LINE = 13, GAP = 3;
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
      const labels = glyphLabels(router, m[1]);
      // a multi-glyph token ("Space/RMB") stays on one line
      const grp = scene.add.container(0, 0);
      let gx = 0;
      labels.forEach((lab, i) => {
        if (i > 0) { const s = txt(scene, gx, 6, '/', role, { origin: [0, 0.5] }); grp.add(s); gx += Math.ceil(s.width) + 1; }
        const gl = glyph(scene, gx, 0, lab, pad);
        grp.add(gl); gx += gl._w + 1;
      });
      place(grp, Math.max(1, gx - 1));
    } else {
      for (const word of p.split(/\s+/)) {
        if (!word) continue;
        const t = txt(scene, 0, 0, word, role, { origin: [0, 0.5] });
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
