// ui/uiSpace.js — the overlay DESIGN SPACE (architecture §3, specs/ux/aspect-ratio-spec.md §4).
//
// Every modal / menu scene (Title, Pause, Reward, Shop, Settings, RunEnd, Credits, Confirm) is laid out in a fixed
// UI_W × UI_H (640 × 360) design space. The view is wider on wide phones / desktop windows (config.js VIEW_W,
// 640..800), so uiCamera() scrolls the scene's main camera by −UI_OX: design x 0..640 lands centred in the view
// (the spec's "one container at ox = round((W − 640) / 2)"), and nothing laid out in design space needs to know W.
// Things that must span or anchor to the SCREEN use these helpers instead:
//   fullRect()      — dims / backdrops (a design rect at 0,0 would leave the side columns undimmed)
//   screenX/Y()     — a SCREEN position (a safe-rect edge) → design coordinates
//   onReflow(s, f)  — re-run f after a live width change (display.js → EV.DISPLAY_CHANGED); fullRect registers itself
// Pointer coordinates: ui/nav.js hands its handlers a design-space pointer (x/y shifted by the camera scroll), so nav
// rects, drags and slider tests stay in design coordinates. Phaser interactive objects need nothing — the input
// plugin already maps through the camera.

import { VIEW_W, VIEW_H, UI_W, UI_H, UI_OX, UI_OY } from '../config.js';
import { EV } from '../core/ev.js';

export { UI_W, UI_H };

/** Centre the design space in the view; re-centre (and run the scene's reflow hooks) on a live width change. */
export function uiCamera(scene) {
  const cam = scene.cameras.main;
  cam.setScroll(-UI_OX, -UI_OY);
  if (!scene.__uiReflow) {
    scene.__uiReflow = [];
    const bus = scene.registry.get('bus');
    if (bus) {
      const fn = () => {                                              // width or safe-rect change
        if (!scene.sys || !scene.sys.isActive() && !scene.sys.isPaused()) return;
        scene.cameras.main.setScroll(-UI_OX, -UI_OY);
        for (const f of scene.__uiReflow) f();
      };
      bus.on(EV.DISPLAY_CHANGED, fn);
      scene.events.once('shutdown', () => { bus.off(EV.DISPLAY_CHANGED, fn); scene.__uiReflow = null; });
    }
  }
  return cam;
}

/** Register a callback to re-run after a live width change (the scene must have called uiCamera). */
export function onReflow(scene, f) {
  if (scene.__uiReflow) scene.__uiReflow.push(f);
  return f;
}

/** A rectangle covering the WHOLE view, in design coordinates (dims, backdrops). Follows live width changes. */
export function fullRect(scene, color = 0x000000, alpha = 1) {
  const r = scene.add.rectangle(-UI_OX, -UI_OY, VIEW_W, VIEW_H, color, alpha).setOrigin(0);
  onReflow(scene, () => { if (r.active) r.setPosition(-UI_OX, -UI_OY).setSize(VIEW_W, VIEW_H); });
  return r;
}

/** Screen (view) px → design px. Live. */
export const screenX = (x) => x - UI_OX;
export const screenY = (y) => y - UI_OY;
/** Design-space x of the view's left / right edge. Live. */
export const viewLeft = () => -UI_OX;
export const viewRight = () => VIEW_W - UI_OX;
