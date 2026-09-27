// scenes/overlay.js — shared modal chrome (scene-flow §3, motion-spec §1 modal-open / modal-close).
//
//   const m = modalChrome(this, { title, swap })   // backdrop + panel container + services
//   m.close(() => flow.close('reward'))             // 90 ms close motion, THEN the flow action
//
// Backdrop = the frozen game at 30% brightness (70% black). Open: backdrop 0 → 0.7 and panel alpha
// 0 → 1 + rise 8 px over 120 ms Cubic.easeOut; reduced motion = fades only. A `swap` open (a
// flow.replace between Reward/Shop and Pause, screen-graph §3.2) keeps the backdrop at 0.7.
// Input is live from frame 0 (nothing blocks input for more than 120 ms, screen-graph §7).

import { VIEW_W, VIEW_H } from '../config.js';
import { reduced } from '../ui/draw.js';
import { txt, C } from '../ui/kit.js';
import { initSymbols } from '../ui/fmt.js';

export function services(scene) {
  initSymbols(scene);
  const reg = scene.registry;
  return { router: reg.get('router'), flow: reg.get('flow'), bus: reg.get('bus'), run: reg.get('run'), mixer: reg.get('mixer'), display: reg.get('display') };
}

export function modalChrome(scene, opts = {}) {
  const s = services(scene);
  const bd = scene.add.rectangle(0, 0, VIEW_W, VIEW_H, 0x000000, 0.7).setOrigin(0);
  const panel = scene.add.container(0, 0);
  if (opts.title) panel.add(txt(scene, VIEW_W / 2, 8, opts.title, 'T2', { origin: [0.5, 0] }));
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
  return { ...s, backdrop: bd, panel, close, isClosing: () => closing };
}

/** Back-compat for any caller of the Wave-1 helper. */
export function overlayChrome(scene, title) { return modalChrome(scene, { title }); }

export { C };
