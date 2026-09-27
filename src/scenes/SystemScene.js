// SystemScene — persistent service scene (scene-flow.md §1). First in the scene list, never
// stopped, renders nothing. Owns: InputRouter, AudioMixer, SceneFlow, DisplayScaler, FocusBoundary,
// and the DOM perf overlay (F3). Publishes services on the game registry for every other scene.

import Phaser from '../../lib/phaser.esm.min.js';
import { createBus, EV, listen } from '../core/events.js';
import { InputRouter } from '../input/InputRouter.js';
import { Rumble } from '../input/Rumble.js';
import { TouchSticks } from '../input/TouchSticks.js';
import { AudioMixer } from '../core/audio.js';
import { SceneFlow } from '../core/sceneflow.js';
import { TimeControl } from '../core/timecontrol.js';
import { Save } from '../core/save.js';
import { DisplayScaler } from '../platform/display.js';
import { FocusBoundary } from '../platform/focus.js';
import { DEBUG } from '../config.js';
import { t } from '../core/i18n.js';

export class SystemScene extends Phaser.Scene {
  constructor() { super({ key: 'system', active: true }); }

  create() {
    const reg = this.registry;
    const bus = createBus();
    const router = new InputRouter(this, bus, Save.settings);
    const mixer = new AudioMixer(this.game);
    const flow = new SceneFlow(this.game, router);
    // Run hold (scene-flow §3): the same path for focus loss and the portrait overlay (mobile-touch-spec §7.1).
    // Never auto-resumes; the reveal marks the Pause menu with the welcome-back header (§7.3).
    const holdRun = (why) => {
      const sm = this.game.scene;
      const inRun = sm.isActive('run') || sm.isPaused('run');
      if (!inRun) return;
      if (why !== 'focus' || !/[?&]nofocuspause\b/.test(location.search)) {
        if (!flow.top()) flow.open('pause', { tab: 'menu' });
        if (flow.isOpen('pause')) reg.set('welcomeBack', true);
      }
    };
    const reveal = () => { if (reg.get('welcomeBack')) bus.emit(EV.WELCOME_BACK); };
    const display = new DisplayScaler(this.game, () => Save.settings.scaleMode, bus, {
      onPortrait: () => { router.clearHeld(); holdRun('rotate'); },
      onLandscape: () => reveal(),
    });
    const timeCtl = new TimeControl(flow);
    // touch (mobile-touch-spec §3–§4): whole-viewport sticks + thumb buttons, active only in a run with no modal
    router.touch = new TouchSticks(router, display, (btn) => bus.emit(EV.TOUCH_TAP, btn));
    router.gameplayActive = () => {
      if (flow.top()) return false;
      const sm = this.game.scene;
      return sm.isActive('run') || sm.isPaused('run') || sm.isActive('hudstub');
    };
    reg.set('bus', bus); reg.set('router', router); reg.set('mixer', mixer); reg.set('flow', flow); reg.set('display', display);
    reg.set('time', timeCtl);
    // controller-prompts §6: rumble is blocked while any modal is up (pause, editor, shop, reward, settings,
    // confirm) and during room fades; focus loss resets it below.
    const rumble = new Rumble(router, bus, () => {
      if (flow.top()) return true;
      const run = this.game.scene.getScene('run');
      return !!(run && run.sys && run.sys.isActive() && run.transitioning);
    });
    reg.set('rumble', rumble);
    this.rumble = rumble;
    window.__SW__ = window.__SW__ || {};
    window.__SW__.input = router; window.__SW__.rumble = rumble;   // console: __SW__.input.promptFamily, __SW__.rumble.log
    this.timeCtl = timeCtl;
    reg.set('perf', { simMs: 0, proj: 0, enemies: 0, steps: 0 });
    this.router = router; this.flow = flow; this.display = display; this.mixer = mixer;
    mixer.bind(bus, flow);
    mixer.panRef = () => { const r = this.game.scene.getScene('run'); return r && r.cameras && r.cameras.main ? r.cameras.main.scrollX + 320 : 320; };

    this.focus = new FocusBoundary({
      onLost: () => {
        router.clearHeld();
        rumble.stop();
        // Run may be mid-hit-stop (paused by reason 'hitstop'): still open the pause menu.
        // ?nofocuspause (debug/automation only): skip the auto-pause so scripted verification isn't interrupted
        holdRun('focus');
        if (Save.settings.muteOnFocusLoss) mixer.suspend();
        Save.flush();
      },
      onRegained: () => { mixer.resume(); reveal(); },
    });

    // Audio unlock (mobile-touch-spec §8.1): iOS only unlocks on a touch END. Global, capture, passive, so the
    // first tap anywhere (incl. the rotate overlay) unlocks — not only on Title.
    const unlock = () => mixer.unlock();
    for (const ev of ['touchend', 'click', 'keydown', 'pointerup']) window.addEventListener(ev, unlock, { capture: true, passive: true });
    document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible' && mixer.unlocked) mixer.resume(); });
    try { if (navigator.audioSession) navigator.audioSession.type = 'ambient'; } catch (e) { /* unsupported */ }
    const rotateCopy = () => display.setOverlayText(t('rotate.text'), Save.reducedMotion);
    rotateCopy();
    listen(this, bus, EV.SETTINGS_CHANGED, (k) => { if (k === 'reducedMotion') rotateCopy(); });

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
    this.rumble.update();
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
