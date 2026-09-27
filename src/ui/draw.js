// ui/draw.js — UI developer A's drawing helpers on top of kit.js: glyph icons (ui-artwork §4 glyph
// set, vector fallback until the TA's atlas lands), rich one-line text with inline glyphs, text fitting,
// buttons/tabs/chips (ui-artwork §7), and motion helpers that honour reduced motion (motion-spec §0.5).
//
// Glyphs are NEVER font characters (the Kenney fonts are Latin-1 only, wand-editor-ux §7): i18n
// strings carry `[[name]]` tokens and richLine() lays out text + glyph images left to right.

import { Art } from '../core/art.js';
import { Save } from '../core/save.js';
import { C, txt, setColor, drawPanel, hex } from './kit.js';

export const reduced = () => Save.reducedMotion;

// ------------------------------------------------------------------------------------------ glyphs
const GLYPH_COLOR = { warn: C.warn, stop: C.error, ok: C.ok, no: C.error, up: C.ok, down: C.error, recharge: C.text,
  wrap: C.dim, arrow: C.dim, hand: C.text, lock: C.dim, trigger: C.bronze, coin: C.gold, heart: C.hpRed, chevron: C.gold,
  star: C.gold, plus: C.text, bag: C.dim, check: C.ok };
const ART_NAME = { warn: 'g_warn', stop: 'g_stop', ok: 'g_ok', check: 'g_ok', no: 'g_no', recharge: 'g_recharge', wrap: 'g_wrap',
  arrow: 'g_arrow', up: 'g_up', down: 'g_down', hand: 'g_hand', trigger: 'g_trigger', lock: 'g_lock_7x7', chevron: 'g_chevron_5x3',
  star: 'g_new_5x5', plus: 'g_plus_5x5', bag: 'bag_8', coin: 'coin_icon.0', heart: 'hearts.0' };

/** A 9×9 glyph (ui-artwork §4 glyph set). Returns an Image (atlas) or a Graphics (vector fallback), origin top-left. */
export function glyph(scene, x, y, name, color) {
  const a = Art.getQuiet(`ui.${ART_NAME[name] || name}`) || Art.getQuiet(ART_NAME[name] || name);
  if (a) return scene.add.image(x, y, a.key, a.frame).setOrigin(0);
  const g = scene.add.graphics().setPosition(x, y);
  drawGlyph(g, 0, 0, name, color ?? GLYPH_COLOR[name] ?? C.text);
  g.width = 9; g.height = 9;
  return g;
}

export function drawGlyph(g, x, y, name, col) {
  const K = C.stroke;
  switch (name) {
    case 'warn':   // triangle (amber) — shape carries severity
      g.fillStyle(K).fillTriangle(x + 4.5, y - 0.5, x + 9.5, y + 9, x - 0.5, y + 9);
      g.fillStyle(col).fillTriangle(x + 4.5, y + 1, x + 8.2, y + 8, x + 0.8, y + 8);
      g.fillStyle(K).fillRect(x + 4, y + 3, 1, 3).fillRect(x + 4, y + 7, 1, 1); break;
    case 'stop': { // octagon (red)
      const o = (d) => [[3 - d, 0 - d], [6 + d, 0 - d], [9 + d, 3 - d], [9 + d, 6 + d], [6 + d, 9 + d], [3 - d, 9 + d], [0 - d, 6 + d], [0 - d, 3 - d]].map(([a, b]) => ({ x: x + a, y: y + b }));
      g.fillStyle(K).fillPoints(o(0.6), true); g.fillStyle(col).fillPoints(o(-0.4), true);
      g.fillStyle(K).fillRect(x + 2, y + 4, 5, 1); break; }
    case 'ok': case 'check':
      g.lineStyle(3, K).lineBetween(x + 1, y + 5, x + 3.5, y + 7.5).lineBetween(x + 3.5, y + 7.5, x + 8, y + 1.5);
      g.lineStyle(1.5, col).lineBetween(x + 1, y + 5, x + 3.5, y + 7.5).lineBetween(x + 3.5, y + 7.5, x + 8, y + 1.5); break;
    case 'no':
      g.lineStyle(3, K).lineBetween(x + 1.5, y + 1.5, x + 7.5, y + 7.5).lineBetween(x + 7.5, y + 1.5, x + 1.5, y + 7.5);
      g.lineStyle(1.5, col).lineBetween(x + 1.5, y + 1.5, x + 7.5, y + 7.5).lineBetween(x + 7.5, y + 1.5, x + 1.5, y + 7.5); break;
    case 'up':
      g.fillStyle(K).fillTriangle(x + 4.5, y, x + 9, y + 8, x, y + 8); g.fillStyle(col).fillTriangle(x + 4.5, y + 1.5, x + 7.6, y + 7, x + 1.4, y + 7); break;
    case 'down':
      g.fillStyle(K).fillTriangle(x, y + 1, x + 9, y + 1, x + 4.5, y + 9); g.fillStyle(col).fillTriangle(x + 1.4, y + 2, x + 7.6, y + 2, x + 4.5, y + 7.5); break;
    case 'arrow':
      g.fillStyle(col).fillRect(x + 1, y + 4, 5, 1).fillTriangle(x + 5, y + 1.5, x + 8.5, y + 4.5, x + 5, y + 7.5); break;
    case 'wrap':   // ↩
      g.lineStyle(1, col).beginPath().arc(x + 5, y + 4.5, 3, -Math.PI / 2, Math.PI / 2, false).strokePath();
      g.fillStyle(col).fillRect(x + 2, y + 1, 3, 1).fillTriangle(x + 0.5, y + 1.5, x + 3, y - 0.5, x + 3, y + 3.5); break;
    case 'recharge': // ↻
      g.lineStyle(1.5, K).beginPath().arc(x + 4.5, y + 4.5, 3.2, -1.2, 4.3, false).strokePath();
      g.lineStyle(1, col).beginPath().arc(x + 4.5, y + 4.5, 3.2, -1.2, 4.3, false).strokePath();
      g.fillStyle(col).fillTriangle(x + 5, y - 0.5, x + 8.5, y + 1.8, x + 5, y + 3.8); break;
    case 'hand':
      g.fillStyle(K).fillRect(x + 1, y + 1, 7, 8); g.fillStyle(col).fillRect(x + 2, y + 4, 5, 4).fillRect(x + 2, y + 2, 1, 2).fillRect(x + 4, y + 1, 1, 3).fillRect(x + 6, y + 2, 1, 2); break;
    case 'lock':
      g.fillStyle(K).fillRect(x + 1, y + 3, 7, 6); g.fillStyle(col).fillRect(x + 2, y + 4, 5, 4);
      g.lineStyle(1, col).strokeRect(x + 3.5, y + 1.5, 2, 3); break;
    case 'trigger':
      g.fillStyle(K).fillRect(x, y, 9, 9); g.fillStyle(col).fillRect(x + 1, y + 1, 7, 2).fillRect(x + 4, y + 3, 1, 5); break;
    case 'chevron':
      g.fillStyle(col).fillTriangle(x, y, x + 5, y, x + 2.5, y + 3); break;
    case 'coin':
      g.fillStyle(K).fillCircle(x + 4.5, y + 4.5, 4); g.fillStyle(col).fillCircle(x + 4.5, y + 4.5, 3); g.fillStyle(0xfff3b0).fillRect(x + 3, y + 3, 1, 2); break;
    case 'heart':
      g.fillStyle(K).fillCircle(x + 2.8, y + 3.3, 2.8).fillCircle(x + 6.2, y + 3.3, 2.8).fillTriangle(x, y + 4, x + 9, y + 4, x + 4.5, y + 9);
      g.fillStyle(col).fillCircle(x + 2.8, y + 3.3, 1.9).fillCircle(x + 6.2, y + 3.3, 1.9).fillTriangle(x + 1, y + 4, x + 8, y + 4, x + 4.5, y + 7.8); break;
    case 'star':
      g.fillStyle(K).fillRect(x, y, 7, 7); g.fillStyle(col).fillRect(x + 3, y + 1, 1, 5).fillRect(x + 1, y + 3, 5, 1).fillRect(x + 2, y + 2, 3, 3); break;
    case 'plus':
      g.fillStyle(K).fillRect(x, y, 7, 7); g.fillStyle(col).fillRect(x + 3, y + 1, 1, 5).fillRect(x + 1, y + 3, 5, 1); break;
    case 'bag':
      g.fillStyle(K).fillRect(x + 1, y + 2, 7, 7); g.fillStyle(col).fillRect(x + 2, y + 3, 5, 5).fillRect(x + 3, y + 1, 3, 2); break;
    default:
      g.fillStyle(col).fillRect(x + 2, y + 2, 5, 5);
  }
  return g;
}

// --------------------------------------------------------------------------------------- rich text
/**
 * One line of text with inline glyphs: `parts` = a string containing `[[glyph]]` tokens, or an array of
 * strings / {g:name, color} / {t:string, color}. Returns a Container (width = laid-out width).
 * opts: { color, role, align:'left'|'right'|'center' (relative to x) }
 */
export function richLine(scene, x, y, parts, opts = {}) {
  const role = opts.role || 'T1';
  const list = typeof parts === 'string' ? splitTokens(parts) : parts;
  const c = scene.add.container(x, y);
  let cx = 0;
  const h = 10;
  for (const p of list) {
    if (p == null || p === '') continue;
    if (typeof p === 'object' && p.g) {
      const gy = Math.round((h - 9) / 2) + (role === 'T1' ? 1 : 0);
      c.add(glyph(scene, cx, gy, p.g, p.color));
      cx += 10;
    } else {
      const s = typeof p === 'object' ? p.t : p;
      const col = typeof p === 'object' && p.color != null ? p.color : (opts.color ?? C.text);
      const t = txt(scene, cx, 0, s, role, { color: col });
      c.add(t);
      cx += Math.ceil(t.width);
    }
  }
  c.lineWidth = cx;
  if (opts.align === 'right') c.x = Math.round(x - cx);
  else if (opts.align === 'center') c.x = Math.round(x - cx / 2);
  return c;
}
export function splitTokens(s) {
  const out = [];
  const re = /\[\[(\w+)\]\]/g;
  let last = 0, m;
  while ((m = re.exec(s))) { if (m.index > last) out.push(s.slice(last, m.index)); out.push({ g: m[1] }); last = re.lastIndex; }
  if (last < s.length) out.push(s.slice(last));
  return out;
}

/** Trim a text object to maxW with a trailing ellipsis (the editor's ONE truncation rule, wand-editor-ux §5.2). */
export function fitText(t, maxW) {
  if (t.width <= maxW) return false;
  let s = String(t.text);
  while (s.length > 1 && t.width > maxW) { s = s.slice(0, -1); t.setText(s.trimEnd() + '…'); }
  return true;
}

// ---------------------------------------------------------------------------------------- buttons
/**
 * Button (ui-artwork §7). kind: 'button' | 'primary' | 'danger'. Returns a Container with
 * .setFocused(b) .setDisabled(b) .setLabel(s) .press() and a .rect {x,y,w,h} in parent coords.
 */
export function button(scene, x, y, w, h, label, opts = {}) {
  const c = scene.add.container(x, y);
  const g = scene.add.graphics();
  const t = typeof label === 'string' && label.includes('[[')
    ? richLine(scene, w / 2, Math.round(h / 2 - 6), label, { align: 'center' })
    : txt(scene, Math.round(w / 2), Math.round(h / 2), label, opts.role || 'T1', { origin: [0.5, 0.5] });
  c.add([g, t]);
  c.setSize(w, h);
  const kind = opts.kind || 'button';
  let focused = false, disabled = !!opts.disabled, selected = !!opts.selected;
  // atlas 9-slices (normal + hover) when the TA frames exist; danger keeps the vector red-corner look
  const base = kind === 'primary' ? 'primary' : kind === 'danger' ? null : 'button';
  const nsN = base && nine(scene, base, w, h), nsH = base && nine(scene, base + '-hover', w, h);
  if (nsN && nsH) { c.addAt(nsN, 0); c.addAt(nsH, 1); nsH.setVisible(false); }
  const redraw = () => {
    g.clear();
    const k = kind === 'primary' ? (focused ? 'primary-hover' : 'primary') : kind === 'danger' ? 'danger' : focused ? 'button-hover' : 'button';
    if (nsN && nsH) { nsN.setVisible(!focused); nsH.setVisible(focused); }
    else drawPanel(g, 0, 0, w, h, k);
    if (selected) g.fillStyle(C.gold, 1).fillRect(3, h - 3, w - 6, 2);           // tabs / toggles: underline
    if (disabled) g.fillStyle(0x000000, 0.45).fillRect(1, 1, w - 2, h - 2);
    if (t.setAlpha) t.setAlpha(disabled ? 0.55 : 1);
  };
  redraw();
  c.btnW = w; c.btnH = h; c.label = t;
  c.setFocused = (b) => { if (focused !== b) { focused = b; redraw(); } return c; };
  c.setDisabled = (b) => { if (disabled !== b) { disabled = b; redraw(); } return c; };
  c.setSelected = (b) => { if (selected !== b) { selected = b; redraw(); } return c; };
  c.isDisabled = () => disabled;
  c.setLabel = (s) => { if (t.setText) t.setText(s); return c; };
  c.press = () => pressMotion(scene, t);
  return c;
}

/** ui-button-press (66 ms down 1 px, 100 ms back) — kept under reduced motion (essential affordance). */
export function pressMotion(scene, obj) {
  if (!obj || obj.__pressing) return;
  obj.__pressing = true;
  const y0 = obj.y;
  scene.tweens.add({ targets: obj, y: y0 + 1, duration: 66, ease: 'Quad.easeOut', yoyo: true, hold: 0,
    onComplete: () => { obj.y = y0; obj.__pressing = false; } });
}

/** ui-denied (150 ms dead press + reason highlight). Never a shake (accessibility-spec §4.2). */
export function deniedMotion(scene, obj, reasonText) {
  if (obj && !reduced()) pressMotion(scene, obj);
  if (reasonText) { setColor(reasonText, C.warn); scene.time.delayedCall(150, () => reasonText.active && setColor(reasonText, reasonText.__baseColor ?? C.text)); }
}

// ui-artwork §1/§7: Kenney 9-slice frames from the TA's ui atlas (panel over a #2a2a3a fill); vector fallback.
const NINE = { dark: ['ui.panel_dark', 6], ornate: ['ui.panel_ornate', 10], button: ['ui.button', 5], 'button-hover': ['ui.button.hover', 5],
  primary: ['ui.button_primary', 5], 'primary-hover': ['ui.button_primary.hover', 5] };
function nine(scene, kind, w, h) {
  const n = NINE[kind]; if (!n) return null;
  const a = Art.getQuiet(n[0]);
  if (!a || w < n[1] * 2 + 2 || h < n[1] * 2 + 2) return null;
  try { return scene.add.nineslice(0, 0, a.key, a.frame, w, h, n[1], n[1], n[1], n[1]).setOrigin(0); } catch (e) { return null; }
}

/** A panel (dark | ornate | danger | button kinds) sized in one call; returns a Container (atlas) or Graphics (vector). */
export function box(scene, x, y, w, h, kind = 'dark') {
  const ns = kind === 'dark' || kind === 'ornate' ? nine(scene, kind, w, h) : null;
  if (ns) {
    const c = scene.add.container(x, y);
    c.add(scene.add.graphics().fillStyle(C.panel, 1).fillRect(2, 2, w - 4, h - 4));
    c.add(ns);
    return c;
  }
  const g = scene.add.graphics(); drawPanel(g, x, y, w, h, kind); return g;
}

/** Horizontal divider line. */
export function divider(scene, x, y, w, color = C.slateDark) { return scene.add.graphics().fillStyle(color, 1).fillRect(x, y, w, 1); }

/** Fade/translate-in helper (motion-spec entrances): reduced motion → alpha only. */
export function enter(scene, targets, { dy = 8, duration = 120, delay = 0, ease = 'Cubic.easeOut' } = {}) {
  const list = Array.isArray(targets) ? targets : [targets];
  for (const o of list) {
    const y1 = o.y;
    o.setAlpha(0);
    if (!reduced()) o.y = y1 + dy;
    scene.tweens.add({ targets: o, alpha: 1, y: y1, duration, delay, ease,
      onUpdate: () => { o.y = Math.round(o.y); } });
  }
}

/** Enemy / boss portrait from the world atlas (first idle frame), fitted into a `box` px square. */
export function actorIcon(scene, x, y, id, box = 32) {
  const a = Art.getQuiet(`enemies.${id}.idle.0`) || Art.getQuiet(`bosses.${id}.idle.0`);
  if (!a) return null;
  const im = scene.add.image(x, y, a.key, a.frame).setOrigin(0.5);
  const m = Math.max(im.width, im.height);
  if (m > box) im.setScale(m > box * 2 ? 1 / Math.ceil(m / box) : 0.5);
  return im;
}

export { hex };
