// ui/kit.js — shared UI primitives for every screen and the HUD (accessibility-spec §2, ui-artwork §1–§3,
// style-guide §2.4). One implementation of: text roles, palette tokens, panels, focus ring, card cells,
// icons, keycaps. Art comes through core/art.js; every primitive has a generated fallback so screens work
// before (and if) an atlas frame is missing.
//
// TEXT: every text object is BitmapText when the TA's baked fonts are loaded (roles below); until then a
// canvas Text fallback with the same 1 px #222222 stroke. Never scale text fractionally (O-UX-3).

import Phaser from '../../lib/phaser.esm.min.js';
import { Art } from '../core/art.js';

// ---- palette tokens (accessibility-spec §2.2, style-guide §2.4, ui-artwork §1) ----
export const C = {
  panel: 0x2a2a3a, stroke: 0x222222,
  text: 0xfdf7ed, dim: 0xb6cbcf, warn: 0xfacb3e, error: 0xff6b5e, ok: 0x97da3f, mana: 0x5698cc, manaTop: 0x72d6ce,
  gold: 0xfacb3e, disabled: 0x6e6886, bronze: 0xc58747, slate: 0x647685, slateLight: 0x94afc6, slateDark: 0x515f6b,
  hostile: 0xdc4a7b, hostileRim: 0xfdd0d6, telegraphPeak: 0x9f294e, hpRed: 0xda4e38,
  rar: { common: 0xb6cbcf, uncommon: 0x5698cc, rare: 0x8b7cf0, legendary: 0xfacb3e, starter: 0xb6cbcf },
  element: { arcane: 0xcfc0ff, fire: 0xee8e2e, frost: 0xcae6f5, shock: 0xfacb3e, poison: 0x97da3f },
};
export const hex = (n) => '#' + n.toString(16).padStart(6, '0');

// ---- text roles (accessibility-spec §2.1) ----
// cap heights: T1 7 px (Kenney Pixel 16 em), T2 9 px (Kenney High 16), Tsmall 5 px (Kenney Mini 8); display = T1 ×2
const ROLE = {
  T1: { font: 'body', size: 16, fallbackPx: 11, pitch: 12 },
  T2: { font: 'heading', size: 16, fallbackPx: 13, pitch: 14 },
  Tsmall: { font: 'small', size: 8, fallbackPx: 8, pitch: 8 },
  display: { font: 'body', size: 16, scale: 2, fallbackPx: 22, pitch: 24 },
};
export const PITCH = { T1: 12, T2: 14, Tsmall: 8, display: 24 };

const FONT = { body: null, heading: null, small: null };   // resolved bitmap-font cache keys
/**
 * Called by Boot after loading: the TA's glyph sheets live in the `ui` atlas (assets/ATLAS-KEYS.md Fonts).
 * Every text role uses the OUTLINED variant (1 px #222222 stroke baked in; accessibility-spec §2.2).
 */
export function resolveFonts(scene) {
  const manifest = scene.cache.json.get('asset-manifest');
  const fonts = (manifest && manifest.bitmapFontsInAtlas) || {};
  const BM = Phaser.GameObjects.BitmapText;
  for (const [key, f] of Object.entries(fonts)) {
    if (scene.cache.bitmapFont.exists(key)) continue;
    if (!scene.textures.exists(f.atlas) || !scene.cache.xml.exists(key)) continue;
    try { BM.ParseFromAtlas(scene, key, f.atlas, f.frame, key); } catch (e) { console.warn('[fonts] parse failed', key, e); }
  }
  const has = (k) => scene.cache.bitmapFont.exists(k);
  FONT.body = has('font.body_outline') ? 'font.body_outline' : has('font.body') ? 'font.body' : null;
  FONT.heading = has('font.heading_outline') ? 'font.heading_outline' : FONT.body;
  FONT.small = has('font.small_outline') ? 'font.small_outline' : FONT.body;
  return { ...FONT };
}
export const fontsLoaded = () => !!FONT.body;

/**
 * Text in a role. Returns a BitmapText or Text (both support setText/setTint-ish via kit.setColor).
 * opts: { color (int token), origin [x,y], align:'left'|'center'|'right', wrap (px), alpha }
 */
export function txt(scene, x, y, str, role = 'T1', opts = {}) {
  const r = ROLE[role] || ROLE.T1;
  const color = opts.color ?? C.text;
  let t;
  const key = FONT[r.font];
  if (key) {
    t = scene.add.bitmapText(x, y, key, String(str), r.size);
    if (r.scale) t.setScale(r.scale);
    if (opts.wrap) t.setMaxWidth(Math.floor(opts.wrap / (r.scale || 1)));
    if (opts.align === 'center') t.setCenterAlign?.(); else if (opts.align === 'right') t.setRightAlign?.();
    t.setTint(color);
  } else {
    t = scene.add.text(x, y, String(str), {
      fontFamily: 'monospace', fontSize: `${r.fallbackPx}px`, color: hex(color), stroke: '#222222', strokeThickness: 2,
      align: opts.align || 'left', wordWrap: opts.wrap ? { width: opts.wrap, useAdvancedWrap: true } : undefined,
      lineSpacing: Math.max(0, r.pitch - r.fallbackPx - 2),
    });
  }
  if (opts.origin) t.setOrigin(opts.origin[0], opts.origin[1]);
  if (opts.alpha != null) t.setAlpha(opts.alpha);
  t.__role = role;
  return t;
}
export function setColor(t, color) {
  if (t.setTint && t.type === 'BitmapText') t.setTint(color); else if (t.setColor) t.setColor(hex(color));
  return t;
}

// ---- panels (ui-artwork §1) ----
/** kind: 'dark' (toasts, tooltips, detail) | 'ornate' (modals) | 'button' | 'button-hover' | 'primary' | 'danger' */
export function panel(scene, x, y, w, h, kind = 'dark', opts = {}) {
  const g = scene.add.graphics();
  drawPanel(g, 0, 0, w, h, kind, opts);
  g.setPosition(x, y);
  return g;
}
export function drawPanel(g, x, y, w, h, kind = 'dark', opts = {}) {
  const fill = { dark: C.panel, ornate: C.panel, button: 0x3a3f52, 'button-hover': 0x4b5468, primary: 0x6d4b27, 'primary-hover': 0x8a5f31, danger: 0x5a2a32 }[kind] ?? C.panel;
  const edge = { dark: C.slateDark, ornate: C.slate, button: C.slateDark, 'button-hover': C.slateLight, primary: C.bronze, 'primary-hover': 0xe0b070, danger: 0xb04050 }[kind] ?? C.slate;
  g.fillStyle(C.stroke, opts.alpha ?? 1).fillRect(x, y, w, h);
  g.fillStyle(fill, opts.alpha ?? 1).fillRect(x + 1, y + 1, w - 2, h - 2);
  g.lineStyle(1, edge, 1).strokeRect(x + 1.5, y + 1.5, w - 3, h - 3);
  if (kind === 'ornate') {                    // rivet corners
    g.fillStyle(C.slateLight, 1);
    for (const [cx, cy] of [[x + 3, y + 3], [x + w - 5, y + 3], [x + 3, y + h - 5], [x + w - 5, y + h - 5]]) g.fillRect(cx, cy, 2, 2);
  }
  return g;
}

/** Focus ring (accessibility-spec §6): 1 px bright ring + 1 px dark outer ring, outside the box. */
export function drawFocus(g, x, y, w, h, alpha = 1) {
  g.lineStyle(1, C.stroke, alpha).strokeRect(x - 2.5, y - 2.5, w + 5, h + 5);
  g.lineStyle(1, C.gold, alpha).strokeRect(x - 1.5, y - 1.5, w + 3, h + 3);
  return g;
}

// ---- icons ----
/** Icon ids follow art-slot-map (`icon32.<kind>.<id>` / `icon16.<kind>.<id>`), kind ∈ spells|modifiers|relics|wands|reward_kind */
export function iconId(kind, id, size = 32) { return `icon${size}.${kind}.${id}`; }
export function icon(scene, x, y, kind, id, size = 32) {
  const a = Art.get(iconId(kind, id, size)) || Art.getQuiet(`${kind}.${id}.icon${size === 16 ? '16' : ''}`) || Art.getQuiet(`${kind}.${id}.icon`);
  if (a) { const im = scene.add.image(x, y, a.key, a.frame); if (size === 16 && im.width > 20) im.setDisplaySize(16, 16); return im; }
  // fallback: a letter glyph in a keylined square
  const c = scene.add.container(x, y);
  const g = scene.add.graphics();
  const s = size - 2;
  g.fillStyle(C.stroke, 1).fillRect(-s / 2, -s / 2, s, s).fillStyle(0x3b3550, 1).fillRect(-s / 2 + 1, -s / 2 + 1, s - 2, s - 2);
  c.add(g);
  const label = (id || '?').split('_').map((p) => p[0]).join('').slice(0, 2).toUpperCase();
  c.add(txt(scene, 0, 0, label, size >= 32 ? 'T1' : 'Tsmall', { origin: [0.5, 0.5], color: C.dim }));
  return c;
}

// ---- card cells (ui-artwork §2; wand-editor-ux §2.2) — type reads from SILHOUETTE ----
export const cardKind = (card) => (!card ? 'empty' : card.type === 'projectile' ? 'spell' : card.type);   // spell|modifier|multicast|trigger
const TRIGGER_LETTER = { hit: 'H', expire: 'E', timer: 'T' };

/**
 * A card cell. size 36 (editor) or 18 (HUD). Returns a Container with .setState(state) where state ∈
 * {'normal','next','drawn','skipped','empty'}. opts: { virtual (always-cast), showMana (default size 36), isNew }
 */
export function cardCell(scene, x, y, card, size = 36, opts = {}) {
  const c = scene.add.container(x, y);
  const g = scene.add.graphics();
  c.add(g);
  const kind = opts.virtual ? 'always' : cardKind(card);
  const inner = size === 36 ? 32 : 16, off = size === 36 ? 2 : 1;
  // fill
  g.fillStyle(C.panel, 1).fillRect(off, off, inner, inner);
  if (card) {
    const kindKey = card.type === 'projectile' ? 'spells' : 'modifiers';
    const im = icon(scene, off + inner / 2, off + inner / 2, kindKey, card.id, size === 36 ? 32 : 16);
    c.add(im);
  }
  // frame silhouette overlay (authored frames if present)
  const frameId = `ui.card_${kind === 'always' ? 'always' : kind}_${size}`;
  const af = kind !== 'empty' && Art.getQuiet(frameId);
  const fg = scene.add.graphics();
  c.add(fg);
  if (af) c.add(scene.add.image(0, 0, af.key, af.frame).setOrigin(0));
  else drawCardFrame(fg, size, kind, card);
  // badges
  if (card && size === 36) {
    if (kind === 'spell') drawElementBadge(fg, size - 9, size - 9, card.element || 'arcane');
    if (kind === 'modifier') { fg.fillStyle(C.stroke).fillRect(size - 9, 2, 7, 7).fillStyle(C.text).fillRect(size - 7, 5, 3, 1).fillRect(size - 6, 4, 1, 3); }
    if (kind === 'multicast') { chip(scene, c, size - 9, 2, `×${card.count}`); }
    if (kind === 'trigger') { chip(scene, c, size - 9, 2, TRIGGER_LETTER[card.event] || 'T'); }
    if (opts.showMana !== false) chip(scene, c, 2, size - 9, String(card.mana ?? 0));
    if (opts.isNew) chip(scene, c, 2, 2, 'N', C.gold);
  } else if (card && size === 18 && kind === 'spell') {
    fg.fillStyle(C.element[card.element] || C.text, 1).fillRect(14, 14, 3, 3);
  }
  if (opts.virtual) chip(scene, c, 2, 2, 'L', C.dim);
  c.setSize(size, size);
  c.cardKind = kind;
  const overlay = scene.add.graphics();
  c.add(overlay);
  c.setState = (state) => {
    overlay.clear();
    c.setAlpha(state === 'drawn' ? 0.4 : 1);
    if (state === 'next') overlay.lineStyle(1, C.gold, 1).strokeRect(off + 0.5, off + 0.5, inner - 1, inner - 1);
    if (state === 'skipped') { overlay.lineStyle(2, C.error, 1).lineBetween(off, off + inner, off + inner, off); }
    return c;
  };
  return c;
}

function chip(scene, c, x, y, s, color = C.text) {
  const g = scene.add.graphics();
  g.fillStyle(C.stroke, 1).fillRect(x, y, Math.max(7, s.length * 4 + 3), 7);
  c.add(g);
  c.add(txt(scene, x + 1, y, s, 'Tsmall', { color }));
}

/** Silhouette per type: spell rounded · modifier chamfered · multicast double line · trigger arrow notch. */
export function drawCardFrame(g, size, kind, card) {
  const s = size, w = 2;
  g.lineStyle(1, C.stroke, 1);
  if (kind === 'empty') {                         // dashed empty cell
    g.lineStyle(1, C.dim, 1);
    for (let i = 1; i < s - 1; i += 4) { g.lineBetween(i, 1.5, i + 2, 1.5); g.lineBetween(i, s - 1.5, i + 2, s - 1.5); g.lineBetween(1.5, i, 1.5, i + 2); g.lineBetween(s - 1.5, i, s - 1.5, i + 2); }
    return;
  }
  const edge = kind === 'spell' ? (C.element[card && card.element] || C.text) : kind === 'always' ? C.slate : C.bronze;
  if (kind === 'spell' || kind === 'always') {    // rounded
    g.lineStyle(w, C.stroke, 1).strokeRoundedRect(1, 1, s - 2, s - 2, s >= 36 ? 5 : 3);
    g.lineStyle(1, edge, 1).strokeRoundedRect(1.5, 1.5, s - 3, s - 3, s >= 36 ? 4 : 2);
  } else if (kind === 'modifier') {               // chamfered + inner line
    const k = s >= 36 ? 4 : 2;
    const pts = [[k, 0.5], [s - k, 0.5], [s - 0.5, k], [s - 0.5, s - k], [s - k, s - 0.5], [k, s - 0.5], [0.5, s - k], [0.5, k]];
    g.lineStyle(2, C.stroke, 1).strokePoints(pts.map(([x, y]) => ({ x, y })), true);
    g.lineStyle(1, edge, 1).strokePoints(pts.map(([x, y]) => ({ x: x + (x < s / 2 ? 1 : -1), y: y + (y < s / 2 ? 1 : -1) })), true);
  } else if (kind === 'multicast') {              // double line
    g.lineStyle(1, C.stroke, 1).strokeRect(0.5, 0.5, s - 1, s - 1);
    g.lineStyle(1, edge, 1).strokeRect(1.5, 1.5, s - 3, s - 3).strokeRect(3.5, 3.5, s - 7, s - 7);
  } else if (kind === 'trigger') {                // arrow notch on the right edge
    const m = s / 2, n = s >= 36 ? 5 : 3;
    const pts = [[0.5, 0.5], [s - 0.5, 0.5], [s - 0.5, m - n], [s - n - 0.5, m], [s - 0.5, m + n], [s - 0.5, s - 0.5], [0.5, s - 0.5]];
    g.lineStyle(2, C.stroke, 1).strokePoints(pts.map(([x, y]) => ({ x, y })), true);
    g.lineStyle(1, edge, 1).strokePoints(pts.map(([x, y]) => ({ x: x + (x < m ? 1 : -1), y: y + (y < m ? 1 : y > m ? -1 : 0) })), true);
  }
}

/** Element shape badge (7×7): arcane orb · fire flame · frost diamond · shock zigzag · poison droplet. */
export function drawElementBadge(g, x, y, element) {
  const col = C.element[element] || C.text;
  g.fillStyle(C.stroke, 1).fillRect(x - 1, y - 1, 9, 9);
  g.fillStyle(col, 1);
  switch (element) {
    case 'fire': g.fillTriangle(x + 3.5, y, x + 6.5, y + 6.5, x + 0.5, y + 6.5); break;
    case 'frost': g.fillPoints([{ x: x + 3.5, y }, { x: x + 7, y: y + 3.5 }, { x: x + 3.5, y: y + 7 }, { x, y: y + 3.5 }], true); break;
    case 'shock': g.fillRect(x + 1, y, 5, 2).fillRect(x + 3, y + 2, 2, 2).fillRect(x + 1, y + 4, 5, 2).fillRect(x + 3, y + 6, 2, 1); break;
    case 'poison': g.fillCircle(x + 3.5, y + 4.5, 2.5).fillTriangle(x + 3.5, y, x + 1.2, y + 3.5, x + 5.8, y + 3.5); break;
    default: g.fillCircle(x + 3.5, y + 3.5, 3);
  }
}

// ---- keycaps / device glyphs (hud-layout §3.5) ----
export function keycap(scene, x, y, label) {
  const c = scene.add.container(x, y);
  const w = Math.max(12, label.length * 5 + 5);
  const g = scene.add.graphics();
  g.fillStyle(C.stroke, 1).fillRect(0, 0, w, 12).fillStyle(0x4b5468, 1).fillRect(1, 1, w - 2, 10).fillStyle(0x6a7590, 1).fillRect(1, 1, w - 2, 1);
  c.add(g);
  c.add(txt(scene, w / 2, 6, label, 'Tsmall', { origin: [0.5, 0.5] }));
  c.setSize(w, 12);
  return c;
}

/** The glyph shown for an action on the current device (bindings are the source of truth). */
export function actionGlyph(router, action) {
  const pad = router.device === 'pad';
  const PAD = { cast: 'RT', dash: 'A', interact: 'X', inventory: 'Back', pause: 'Start', wandNext: 'RB', wandPrev: 'Y', confirm: 'A', back: 'B', tabPrev: 'LB', tabNext: 'RB' };
  if (pad) return PAD[action] || action;
  const codes = (router.kbm && router.kbm[action]) || [];
  const c = codes[0] || '';
  return c.replace(/^Key/, '').replace(/^Digit/, '').replace('Mouse0', 'LMB').replace('Mouse2', 'RMB').replace('Escape', 'Esc').replace('Space', 'Space');
}
