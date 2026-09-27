// platform/display.js — the scaler + phone viewport boundary (architecture §3, settings-spec §1.1,
// mobile-touch-spec §1/§2/§7). The ONLY module that listens to window resize / orientationchange /
// visualViewport. Settings → Scaling (`scaleMode`):
//   auto    (default) integer zoom k when k ≥ 2, else FIT — a ×1 canvas on a 1366×768 laptop
//           (viewport ≈1366×650) would be 47% of the width with 7-CSS-px text (O-UX-1)
//   integer always integer zoom max(1, k)
//   fill    always FIT (fractional; nearest filtering, pixels may be uneven)
//
// v2 (phones): computes the SAFE RECT in game px from the #safe-probe element (env(safe-area-inset-*)
// minus the letterbox on that edge, ÷ scale, rounded up), `isPhone`, portrait detection with the DOM
// #rotate overlay, and emits EV.DISPLAY_CHANGED({ safe, zoom, isPhone, portrait }) on any change.
// iOS can rotate without a resize event, so the size is also polled (cheap: 4 reads every 500 ms).

import { VIEW_W, VIEW_H } from '../config.js';
import { EV } from '../core/ev.js';

const mm = (q) => (typeof matchMedia === 'function' ? matchMedia(q).matches : false);

/** mobile-touch-spec §2: coarse pointer AND a small screen. Gates the rotate overlay, phone caps, A2HS. */
export function detectPhone() {
  const s = typeof screen !== 'undefined' ? Math.min(screen.width, screen.height) : 1000;
  return mm('(pointer: coarse)') && s < 600;
}
/** A touch-capable device (settings-spec §6 shows the Touch rows). */
export const canTouch = () => mm('(any-pointer: coarse)') || (typeof navigator !== 'undefined' && navigator.maxTouchPoints > 0);

export class DisplayScaler {
  /**
   * @param game          Phaser.Game
   * @param getScaleMode  () => 'auto' | 'integer' | 'fill' (Save.settings.scaleMode)
   * @param bus           game event bus (EV.DISPLAY_CHANGED)
   * @param hooks         { onPortrait(): void, onLandscape(): void } — run hold / welcome-back (§7.1, §7.3)
   */
  constructor(game, getScaleMode, bus = null, hooks = {}) {
    this.game = game;
    this.getScaleMode = getScaleMode;
    this.bus = bus;
    this.hooks = hooks;
    this.zoom = 1;
    this.mode = 'integer';
    this.safe = { l: 0, t: 0, r: VIEW_W, b: VIEW_H };   // safe rect in game px (edges, not size)
    this.isPhone = detectPhone();
    this.portrait = false;
    this._sig = '';
    this._w = 0; this._h = 0;
    this.probe = typeof document !== 'undefined' ? document.getElementById('safe-probe') : null;
    this.rotateEl = typeof document !== 'undefined' ? document.getElementById('rotate') : null;
    this._onResize = () => this.apply();
    window.addEventListener('resize', this._onResize);
    window.addEventListener('orientationchange', this._onResize);
    if (window.visualViewport) window.visualViewport.addEventListener('resize', this._onResize);
    this._poll = setInterval(() => { if (window.innerWidth !== this._w || window.innerHeight !== this._h) this.apply(); }, 500);
    this.apply();
  }

  apply() {
    const w = window.innerWidth, h = window.innerHeight;
    // Layout not ready yet (hidden pane / early boot): retry next frame instead of collapsing to 0.
    if (!w || !h) { requestAnimationFrame(() => this.apply()); return; }
    this._w = w; this._h = h;
    const fit = Math.min(w / VIEW_W, h / VIEW_H);
    const k = Math.floor(fit);
    const mode = this.getScaleMode();
    const useInteger = mode === 'integer' || (mode === 'auto' && k >= 2);
    // ONE code path: Scale.NONE + setZoom. Fractional zoom = aspect-correct "fill". (Switching the
    // ScaleManager to FIT after boot does NOT update displaySize's aspect mode in 4.1.0 — it
    // stretched the canvas to the window; found 2026-09-27.)
    this.mode = useInteger ? 'integer' : 'fit';
    this.zoom = useInteger ? Math.max(1, k) : fit;
    this.game.scale.setZoom(this.zoom);
    this._computeSafe(w, h);
    this._orientation(w, h);
    const sig = `${this.zoom.toFixed(4)}|${this.safe.l}|${this.safe.t}|${this.safe.r}|${this.safe.b}|${this.portrait}`;
    if (sig !== this._sig) {
      this._sig = sig;
      if (this.bus) this.bus.emit(EV.DISPLAY_CHANGED, { safe: { ...this.safe }, zoom: this.zoom, isPhone: this.isPhone, portrait: this.portrait });
    }
  }

  /** §1: inset_game = ceil(max(0, env(inset) − letterbox on that edge) / scale), per edge. */
  _computeSafe(w, h) {
    let top = 0, right = 0, bottom = 0, left = 0;
    if (this.probe) {
      const cs = getComputedStyle(this.probe);
      top = parseFloat(cs.paddingTop) || 0; right = parseFloat(cs.paddingRight) || 0;
      bottom = parseFloat(cs.paddingBottom) || 0; left = parseFloat(cs.paddingLeft) || 0;
    }
    const cw = VIEW_W * this.zoom, ch = VIEW_H * this.zoom;
    const lbX = Math.max(0, (w - cw) / 2), lbY = Math.max(0, (h - ch) / 2);
    const g = (inset, lb) => Math.ceil(Math.max(0, inset - lb) / this.zoom);
    this.safe = { l: g(left, lbX), t: g(top, lbY), r: VIEW_W - g(right, lbX), b: VIEW_H - g(bottom, lbY) };
  }

  /** §7.1: coarse-pointer device held in portrait → DOM overlay + run hold; landscape → welcome-back. */
  _orientation(w, h) {
    const coarse = this.isPhone || mm('(pointer: coarse)');
    const portrait = coarse && h > w;
    if (portrait === this.portrait) return;
    this.portrait = portrait;
    if (this.rotateEl) this.rotateEl.classList.toggle('on', portrait);
    if (portrait) { if (this.hooks.onPortrait) this.hooks.onPortrait(); }
    else if (this.hooks.onLandscape) this.hooks.onLandscape();
  }

  /** Rotate-overlay copy (i18n) + reduced-motion (static pictogram). */
  setOverlayText(text, reduced) {
    const el = typeof document !== 'undefined' ? document.getElementById('rotate-text') : null;
    if (el && text) el.textContent = text;
    if (this.rotateEl) this.rotateEl.classList.toggle('static', !!reduced);
  }

  /** Client (CSS px) → game px, valid OUTSIDE the canvas too (letterbox thumbs, §1). */
  toGame(clientX, clientY) {
    const c = this.game.canvas;
    const r = c ? c.getBoundingClientRect() : { left: 0, top: 0, width: VIEW_W, height: VIEW_H };
    return { x: (clientX - r.left) * (VIEW_W / (r.width || VIEW_W)), y: (clientY - r.top) * (VIEW_H / (r.height || VIEW_H)) };
  }

  /** Must be called inside (or right after) a user gesture — browsers reject it otherwise. */
  toggleFullscreen() {
    const scale = this.game.scale;
    if (scale.isFullscreen) { scale.stopFullscreen(); return true; }
    // Gamepad presses are not user activation (HTML spec), so a pad "Fullscreen" would make the browser
    // reject requestFullscreen with an uncaught promise error. Skip it cleanly instead (F11 / mouse / keys work).
    if (navigator.userActivation && !navigator.userActivation.isActive) return false;
    scale.startFullscreen();
    return true;
  }

  get isFullscreen() { return this.game.scale.isFullscreen; }

  destroy() {
    window.removeEventListener('resize', this._onResize);
    window.removeEventListener('orientationchange', this._onResize);
    if (window.visualViewport) window.visualViewport.removeEventListener('resize', this._onResize);
    clearInterval(this._poll);
  }
}
