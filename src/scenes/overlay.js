// scenes/overlay.js — shared modal chrome (scene-flow §3, motion-spec §1 modal-open / modal-close).
//
//   const m = modalChrome(this, { title, swap })   // backdrop + panel container + services
//   m.close(() => flow.close('reward'))             // 90 ms close motion, THEN the flow action
//
// Backdrop = the frozen game at 30% brightness (70% black). Open: backdrop 0 → 0.7 and panel alpha
// 0 → 1 + rise 8 px over 120 ms Cubic.easeOut; reduced motion = fades only. A `swap` open (a
// flow.replace between Reward/Shop and Pause, screen-graph §3.2) keeps the backdrop at 0.7.
// Input is live from frame 0 (nothing blocks input for more than 120 ms, screen-graph §7).

import { UI_W, uiCamera, fullRect, screenX, screenY, onReflow } from '../ui/uiSpace.js';
import { reduced } from '../ui/draw.js';
import { txt, C } from '../ui/kit.js';
import { initSymbols } from '../ui/fmt.js';
import { T } from '../core/tunables.js';

export function services(scene) {
  uiCamera(scene);                 // every scene that takes services() is laid out in the 640×360 design space
  initSymbols(scene);
  const reg = scene.registry;
  return { router: reg.get('router'), flow: reg.get('flow'), bus: reg.get('bus'), run: reg.get('run'), mixer: reg.get('mixer'), display: reg.get('display') };
}

export function modalChrome(scene, opts = {}) {
  const s = services(scene);
  const bd = fullRect(scene, 0x000000, 0.7);          // the WHOLE view (HUD + side columns), not just the 640 design space
  const panel = scene.add.container(0, 0);
  if (opts.title) panel.add(txt(scene, UI_W / 2, 8, opts.title, 'T2', { origin: [0.5, 0] }));
  if (opts.swap) bd.setAlpha(1);
  else { bd.setAlpha(0); scene.tweens.add({ targets: bd, alpha: 1, duration: 120, ease: 'Cubic.easeOut' }); }
  panel.setAlpha(0);
  if (!reduced()) panel.y = 8;
  scene.tweens.add({ targets: panel, alpha: 1, y: 0, duration: 120, ease: 'Cubic.easeOut', onUpdate: () => { panel.y = Math.round(panel.y); } });
  if (!opts.swap && opts.openCue !== false) s.mixer.fire('ui_confirm');

  let closing = false;
  const close = (then, { swap = false } = {}) => {
    if (closing) return;
    closing = true;
    s.mixer.fire('ui_back');
    const targets = swap ? [panel] : [panel, bd];
    scene.tweens.add({ targets, alpha: 0, duration: 90, ease: 'Quad.easeIn' });
    if (!reduced()) scene.tweens.add({ targets: panel, y: 4, duration: 90, ease: 'Quad.easeIn' });
    scene.time.delayedCall(90, () => then && then());
  };
  const back = s.router && s.router.touchProfile ? touchBackButton(scene, s.router, panel) : null;
  return { ...s, backdrop: bd, panel, close, isClosing: () => closing, back };
}

/**
 * mobile-touch-spec §5.2: every modal draws a Back button (‹, 28 px visual, 40×40 hit) at (sL + 20, sT + 20) in the
 * touch profile — there is no Esc on a phone. Release-over-same + the open-guard (§6); its action is the screen's
 * own `back` (pushed into the router's UI channel, so each screen keeps one back path).
 */
export function touchBackButton(scene, router, layer) {
  const disp = scene.registry.get('display');
  const S = disp ? disp.safe : { l: 0, t: 0 };
  const cx = screenX(S.l + 20), cy = screenY(S.t + 20);   // anchored to the SCREEN's safe top-left, in design coords
  const c = scene.add.container(0, 0).setDepth(2000);
  const g = scene.add.graphics();
  g.fillStyle(0x222222, 0.9).fillRect(cx - 15, cy - 15, 30, 30).fillStyle(0x2a2a3a, 0.9).fillRect(cx - 14, cy - 14, 28, 28);
  g.fillStyle(C.text, 1);
  for (let i = 0; i < 5; i++) { g.fillRect(cx + 1 - i, cy - 4 + i, 2, 1); g.fillRect(cx + 1 - i, cy + 4 - i, 2, 1); }   // ‹ chevron
  const hit = scene.add.rectangle(cx - 20, cy - 20, 40, 40, 0, 0).setOrigin(0).setInteractive();
  const openAt = performance.now();
  let down = false;
  hit.on('pointerdown', () => { down = performance.now() - openAt >= T('uiOpenGuardMs', 180); });
  hit.on('pointerout', () => { down = false; });
  hit.on('pointerup', () => { if (down) router._pushUI('back'); down = false; });
  c.add([g, hit]);
  onReflow(scene, () => {           // live width / safe-rect change: follow the screen corner
    const S2 = disp ? disp.safe : { l: 0, t: 0 };
    if (c.active) c.setPosition(screenX(S2.l + 20) - cx, screenY(S2.t + 20) - cy);
  });
  void layer;                 // scene-level at depth 2000 (not in the panel), so screen content built later never covers it
  return c;
}

/** Back-compat for any caller of the Wave-1 helper. */
export function overlayChrome(scene, title) { return modalChrome(scene, { title }); }

export { C };
