// config.js — engine constants (specs/engine/architecture.md §2). NOT feel numbers: feel values
// come verbatim from specs/design/feel-spec.md via core/tunables.js; content numbers come from
// data/*.json via core/db.js. Only engine-structural constants live here.

// ---- Internal resolution (architecture §3, specs/ux/aspect-ratio-spec.md §1) -----------------------------------
// The view size adapts to the screen (viewFor below): width 640..800 everywhere, and on PHONES DURING PLAY a smaller
// height (288..360) so the world, HUD and text render bigger. VIEW_W / VIEW_H / UI_OX / UI_OY are LIVE ES-module bindings:
// the first value is decided here at module evaluation (before main.js builds Phaser.Game), and
// platform/display.js may change it later through setViewSize() (then scale.setGameSize + EV.DISPLAY_CHANGED; every
// layout reflows). Read them at use time — never cache a derived value in a module-level constant.
// UI_W × UI_H is the design space every modal/overlay is laid out in; ui/uiSpace.js centres it at UI_OX.
export const UI_W = 640, UI_H = 360;
export const VIEW_MIN_W = 640;
export const VIEW_MAX_W = 800;      // widest room (768) + 16 px void each side; 20:9 phones (aspect-ratio-spec §1)
export const VIEW_H_BASE = 360;

/**
 * The view-size rule (aspect-ratio-spec §1 + the orchestrator's phone-play rule, 2026-09-27).
 * vw, vh = CSS viewport. opts.landscape (touch devices): a portrait viewport is sized for the landscape it will be
 * played in. mode = 'auto' | 'integer' | 'fill' (Settings → Scaling).
 *   MENU / desktop (H 360):  W = clamp(even(floor(lw / sY)), 640, 800), sY = the height-derived scale
 *   PHONE PLAY (opts.phonePlay: a phone, in a run, no modal open) — bigger world, HUD and text:
 *     H = even(clamp(ceil(640 / aspect), 288, 360)),  W = clamp(even(round(H × aspect)), 640, 800)
 *     (every 640×360-designed screen — modals, Title, Run-end — is shown at the MENU size, so it always fits)
 * Returns { w, h }.
 */
export function viewFor(vw, vh, mode = 'auto', opts = {}) {
  if (!vw || !vh) return { w: UI_W, h: VIEW_H_BASE };
  const lw = opts.landscape ? Math.max(vw, vh) : vw, lh = opts.landscape ? Math.min(vw, vh) : vh;
  if (opts.phonePlay) {
    const aspect = lw / lh;
    let h = Math.max(288, Math.min(VIEW_H_BASE, Math.ceil(VIEW_MIN_W / aspect)));
    h += h & 1;
    const w = Math.max(VIEW_MIN_W, Math.min(VIEW_MAX_W, Math.round(h * aspect) & ~1));
    return { w, h };
  }
  const H = VIEW_H_BASE;
  const fit = Math.min(lh / H, lw / VIEW_MIN_W);
  const k = Math.floor(fit);
  const integer = mode === 'integer' || (mode === 'auto' && k >= 2);
  const sY = integer ? Math.max(1, k) : fit;
  return { w: Math.max(VIEW_MIN_W, Math.min(VIEW_MAX_W, Math.floor(lw / sY) & ~1)), h: H };
}

function bootView() {
  if (typeof window === 'undefined') return { w: UI_W, h: VIEW_H_BASE };
  const q = /[?&]view=(\d+)x(\d+)/.exec(location.search);        // craft/debug override: ?view=800x360 (pinned)
  if (q) return { w: Math.max(320, +q[1] & ~1), h: Math.max(180, +q[2] & ~1), pinned: true };
  const vv = window.visualViewport;
  const vw = (vv && vv.width) || window.innerWidth, vh = (vv && vv.height) || window.innerHeight;
  let mode = 'auto';
  try { const s = JSON.parse(localStorage.getItem('spellwright.save') || 'null'); if (s && s.settings && s.settings.scaleMode) mode = s.settings.scaleMode; } catch (e) { /* default */ }
  const coarse = typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches;
  return viewFor(vw, vh, mode, { landscape: coarse });   // boot = Title = the MENU size
}
const BOOT = bootView();
export let VIEW_W = BOOT.w;         // 640..800, even — LIVE
export let VIEW_H = BOOT.h;         // 360 — LIVE
/** Offset of the UI_W × UI_H design space inside the view (overlays are centred). LIVE. */
export let UI_OX = Math.round((VIEW_W - UI_W) / 2);
export let UI_OY = Math.round((VIEW_H - UI_H) / 2);
/** ?view=WxH pins the size (display.js never changes it). */
export const VIEW_PINNED = !!BOOT.pinned;
/** display.js only. Returns true when the size changed. */
export function setViewSize(w, h = VIEW_H) {
  if (w === VIEW_W && h === VIEW_H) return false;
  VIEW_W = w; VIEW_H = h;
  UI_OX = Math.round((VIEW_W - UI_W) / 2); UI_OY = Math.round((VIEW_H - UI_H) / 2);
  return true;
}

export const TILE = 16;             // px, tile grid of the dungeon packs
export const SIM_HZ = 60;           // fixed sim step; designer `frames` == sim steps 1:1
export const SIM_DT = 1 / SIM_HZ;   // s

// Entity caps (architecture §2 / §11). Pools are prewarmed to these sizes.
export const MAX_PROJECTILES = 512; // budget: 400 live
export const MAX_ENEMIES = 64;      // budget: 40 live
export const CAST_INSTRUCTION_CAP = 64;
export const TRIGGER_DEPTH_CAP = 6;

// Spatial hash cell for projectile-vs-enemy queries (architecture §4).
export const HASH_CELL = 32;

// Depth bands (architecture §9). Actors add y/10000 for y-sorting inside their band.
export const DEPTH = {
  floor: 0,
  decals: 10,
  shadows: 20,
  pickups: 30,
  actors: 40,
  projectiles: 60,
  projectilesAdd: 61,   // ALL additive-blend sprites share this band => one blend switch per frame
  enemyProjectiles: 62, // above the player ADD band so 200 glows can't wash one out (style-guide §4.1)
  fx: 70,
  wallTops: 80,
};

// Debug mode: ?debug in the URL. Enables stress mode (F2), perf overlay default, tunables read-tracking.
export const DEBUG = typeof location !== 'undefined' && /[?&]debug\b/.test(location.search);

export const GAME_ID = 'spellwright';
