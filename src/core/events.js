// core/events.js — the ONLY cross-scene channel (scene-flow.md §5). One bus at registry 'bus'.
// Listeners are registered with a scene context and removed on scene shutdown (use listen()).
// Payload shapes are part of the contract (UI and sim agree on them here).

import Phaser from '../../lib/phaser.esm.min.js';

export { EV } from './ev.js';

export function createBus() { return new Phaser.Events.EventEmitter(); }

/**
 * Subscribe `fn` on `bus` for the lifetime of `scene`; auto-removed on shutdown.
 * Use this instead of bus.on() inside scenes so teardown can't be forgotten.
 */
export function listen(scene, bus, evt, fn) {
  bus.on(evt, fn, scene);
  scene.events.once('shutdown', () => bus.off(evt, fn, scene));
}
