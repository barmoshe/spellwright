// core/sceneflow.js — overlay stack + pause/resume protocol (scene-flow.md §3).
// One instance, owned by SystemScene, reachable at registry 'flow'.
//   flow.open('pause', {tab:'wands'})   flow.close('pause')   flow.top()
// Only one modal at a time, except the explicit pause → settings stack. Reward/shop requests made
// while another modal is open are queued until it closes.
//
// The `run` scene is paused by REASONS (a set), never by a bare pause()/resume() pair:
//   'overlay'  — any modal is open
//   'hitstop'  — core/timecontrol.js freeze frame
// It resumes only when the set is empty, so a hit-stop ending under an open menu can't unpause the
// run, and closing a menu mid-hit-stop can't cut the freeze short.

const STACKABLE_ABOVE = { settings: ['pause', 'title'] };

export class SceneFlow {
  constructor(game, router) {
    this.game = game;
    this.router = router;
    this.stack = [];
    this.queue = [];
    this.runHolds = new Set();
    this.onModal = null;                          // (open: bool) → display.setModal (phone view size, aspect-ratio-spec)
  }
  _modalHook(on) { if (this.onModal) this.onModal(on); }

  get scenes() { return this.game.scene; }
  top() { return this.stack.length ? this.stack[this.stack.length - 1] : null; }
  isOpen(key) { return this.stack.includes(key); }

  /** Add a pause reason for the `run` scene (no-op if run isn't active). */
  holdRun(reason) {
    const sm = this.scenes;
    if (!sm.isActive('run') && !sm.isPaused('run')) return;
    this.runHolds.add(reason);
    if (!sm.isPaused('run')) sm.pause('run');
  }

  /** Remove a pause reason; resumes `run` when no reason remains. */
  releaseRun(reason) {
    if (!this.runHolds.delete(reason)) return;
    const sm = this.scenes;
    if (this.runHolds.size === 0 && sm.isPaused('run')) sm.resume('run');
  }

  isRunHeld(reason) { return this.runHolds.has(reason); }

  open(key, data = {}) {
    if (this.isOpen(key)) return false;
    const top = this.top();
    if (top && !(STACKABLE_ABOVE[key] || []).includes(top)) {
      this.queue.push({ key, data });
      return false;
    }
    const sm = this.scenes;
    this.holdRun('overlay');
    if (top) sm.pause(top);                       // settings over pause: pause the pause menu
    this.stack.push(key);                         // pushed first: listeners of the size flip below see the modal
    if (!top) this._modalHook(true);              // BEFORE the scene starts: it is built at the menu size
    sm.run(key, data);
    sm.bringToTop(key);
    this.router.clearHeld();
    return true;
  }

  close(key) {
    const i = this.stack.lastIndexOf(key);
    if (i < 0) return;
    this.stack.splice(i, 1);
    const sm = this.scenes;
    sm.stop(key);
    const top = this.top();
    if (top) { sm.resume(top); }
    else if (this.queue.length) { const next = this.queue.shift(); this.open(next.key, next.data); return; }
    else { this._modalHook(false); this.releaseRun('overlay'); }
    this.router.clearHeld();
  }

  /**
   * Replace the top modal with another WITHOUT resuming the run (screen-graph §3.2 `returnTo`):
   *   Reward/Shop → flow.replace('pause', {tab:'wands', returnTo:{key:'reward', data}})
   *   Pause close with returnTo → flow.replace(returnTo.key, returnTo.data)
   * The run stays held by 'overlay' throughout; the offer lives in RunState so it re-displays unchanged.
   */
  replace(key, data = {}) {
    const top = this.top();
    if (!top) return this.open(key, data);
    const sm = this.scenes;
    this.stack.pop();
    sm.stop(top);
    sm.run(key, data);
    sm.bringToTop(key);
    this.stack.push(key);
    this.router.clearHeld();
    return true;
  }

  /** Close everything (e.g. run end). Drops every run hold without resuming the run. */
  clear() {
    for (const key of [...this.stack].reverse()) this.scenes.stop(key);
    this.stack.length = 0; this.queue.length = 0;
    this.runHolds.clear();
    this._modalHook(false);
  }
}
