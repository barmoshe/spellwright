// platform/display.js — the scaler (architecture §3, settings-spec §1.1). The ONLY module that
// listens to window resize. Settings → Scaling (`scaleMode`):
//   auto    (default) integer zoom k when k ≥ 2, else FIT — a ×1 canvas on a 1366×768 laptop
//           (viewport ≈1366×650) would be 47% of the width with 7-CSS-px text (O-UX-1)
//   integer always integer zoom max(1, k)
//   fill    always FIT (fractional; nearest filtering, pixels may be uneven)

import { VIEW_W, VIEW_H } from '../config.js';

export class DisplayScaler {
  constructor(game, getScaleMode) {
    this.game = game;
    this.getScaleMode = getScaleMode;   // () => 'auto' | 'integer' | 'fill' (Save.settings.scaleMode)
    this.zoom = 1;
    this.mode = 'integer';
    this._onResize = () => this.apply();
    window.addEventListener('resize', this._onResize);
    this.apply();
  }

  apply() {
    const w = window.innerWidth, h = window.innerHeight;
    // Layout not ready yet (hidden pane / early boot): retry next frame instead of collapsing to 0.
    if (!w || !h) { requestAnimationFrame(() => this.apply()); return; }
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

  destroy() { window.removeEventListener('resize', this._onResize); }
}
