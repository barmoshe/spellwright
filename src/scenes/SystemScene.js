// SystemScene — persistent service scene (scene-flow.md §1). First in the scene list, never
// stopped, renders nothing. Owns: InputRouter, AudioMixer, SceneFlow, DisplayScaler, FocusBoundary,
// and the DOM perf overlay (F3). Publishes services on the game registry for every other scene.

import Phaser from '../../lib/phaser.esm.min.js';
import { createBus, EV, listen } from '../core/events.js';
import { InputRouter } from '../input/InputRouter.js';
import { AudioMixer } from '../core/audio.js';
import { SceneFlow } from '../core/sceneflow.js';
import { TimeControl } from '../core/timecontrol.js';
import { Save } from '../core/save.js';
import { DisplayScaler } from '../platform/display.js';
import { FocusBoundary } from '../platform/focus.js';
import { DEBUG } from '../config.js';

export class SystemScene extends Phaser.Scene {
  constructor() { super({ key: 'system', active: true }); }

  create() {
    const reg = this.registry;
    const bus = createBus();
    const router = new InputRouter(this, bus, Save.settings);
    const mixer = new AudioMixer(this.game);
    const flow = new SceneFlow(this.game, router);
    const display = new DisplayScaler(this.game, () => Save.settings.scaleMode);
    const timeCtl = new TimeControl(flow);
    reg.set('bus', bus); reg.set('router', router); reg.set('mixer', mixer); reg.set('flow', flow); reg.set('display', display);
    reg.set('time', timeCtl);
    this.timeCtl = timeCtl;
    reg.set('perf', { simMs: 0, proj: 0, enemies: 0, steps: 0 });
    this.router = router; this.flow = flow; this.display = display; this.mixer = mixer;
    mixer.bind(bus, flow);
    mixer.panRef = () => { const r = this.game.scene.getScene('run'); return r && r.cameras && r.cameras.main ? r.cameras.main.scrollX + 320 : 320; };

    this.focus = new FocusBoundary({
      onLost: () => {
        router.clearHeld();
        const sm = this.game.scene;
        // Run may be mid-hit-stop (paused by reason 'hitstop'): still open the pause menu.
        // ?nofocuspause (debug/automation only): skip the auto-pause so scripted verification isn't interrupted
        if ((sm.isActive('run') || sm.isPaused('run')) && !flow.top() && !/[?&]nofocuspause\b/.test(location.search)) flow.open('pause', { tab: 'menu' });
        if (Save.settings.muteOnFocusLoss) mixer.suspend();
        Save.flush();
      },
      onRegained: () => mixer.resume(),
    });

    // Perf overlay (DOM; zero draw calls). F3 toggles; Settings → Show FPS persists it.
    this.perfEl = document.getElementById('perf');
    this.perfOn = DEBUG || Save.settings.showFps;
    this.input.keyboard.on('keydown-F3', () => { this.perfOn = !this.perfOn; if (!this.perfOn) this.perfEl.style.display = 'none'; });
    listen(this, bus, EV.SETTINGS_CHANGED, (k, v) => { if (k === 'showFps') { this.perfOn = DEBUG || !!v; if (!this.perfOn) this.perfEl.style.display = 'none'; } });
    this.input.keyboard.on('keydown-F11', (e) => { e.preventDefault?.(); display.toggleFullscreen(); });
    this._perfT = 0;

    this.scene.launch('boot');
  }

  update(time, delta) {
    this.router.pollFrame();
    this.timeCtl.update(performance.now());
    const sm = this.game.scene;
    const runExists = sm.isActive('run') || sm.isPaused('run');
    this.mixer.setOverlay(runExists && !!this.flow.top() && this.flow.top() !== 'confirm');
    if (sm.isActive('title') && this.mixer.unlocked && this.mixer.music.state !== 'TITLE' && !this.mixer.voices.some((v) => v.cue.startsWith('stg_'))) this.mixer.setMusic('TITLE');
    this.mixer.update(delta);
    if (this.perfOn) {
      this._perfT += delta;
      if (this._perfT >= 250) {
        this._perfT = 0;
        const p = this.registry.get('perf');
        const loop = this.game.loop;
        this.perfEl.style.display = 'block';
        this.perfEl.textContent =
          `fps ${loop.actualFps.toFixed(0)}  zoom ${this.display.mode}:${this.display.zoom.toFixed(2)}\n` +
          `sim ${p.simMs.toFixed(2)} ms/step  steps ${p.steps}\n` +
          `proj ${p.proj}  enemies ${p.enemies}  input ${this.router.device}\n` +
          `overlay ${this.flow.top() || '-'}  holds ${[...this.flow.runHolds].join(',') || '-'}`;
      }
    }
  }
}
