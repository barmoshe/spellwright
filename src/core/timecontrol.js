// core/timecontrol.js — hit-stop (architecture §4 "Time control"). Owned by SystemScene (which never
// pauses), reachable at registry 'time'.
//
// A hit-stop pauses the WHOLE `run` scene via SceneFlow.holdRun('hitstop'). A paused Phaser scene
// still renders but does not update, so everything in it freezes on the same frame and resumes on
// the same frame:
//   Arcade world + worldstep sim · the scene's tweens · every sprite animation on its update list ·
//   particle emitters · the scene clock (timers) · camera effects (a shake starts after the freeze)
// Audio is NOT paused (feel-spec §handoffs: cues play on the hit frame). Input edges keep latching
// in the router and are consumed on the first step after the freeze (a buffered press is not lost).
// The duration is counted in real ms on the SystemScene clock; overlapping requests extend to the
// later end, never add up.

import { warnOnce } from './log.js';

export class TimeControl {
  constructor(flow) {
    this.flow = flow;
    this.until = 0;           // performance.now() ms when the current hit-stop ends (0 = none)
    this.count = 0;
  }

  get active() { return this.until > 0; }

  /** Freeze the run for `ms` real milliseconds (feel-spec *HitstopMs values, verbatim). */
  hitstop(ms) {
    if (!(ms > 0)) return;
    const end = performance.now() + ms;
    if (end <= this.until) return;
    if (!this.active) {
      this.flow.holdRun('hitstop');
      if (!this.flow.isRunHeld('hitstop')) { warnOnce('hitstop-no-run', 'hit-stop requested with no active run'); return; }
    }
    this.until = end;
    this.count++;
  }

  /** Called every frame by SystemScene.update. */
  update(now) {
    if (this.until > 0 && now >= this.until) {
      this.until = 0;
      this.flow.releaseRun('hitstop');
    }
  }

  /** Run end / scene change: drop any pending freeze without resuming. */
  cancel() { this.until = 0; }
}
