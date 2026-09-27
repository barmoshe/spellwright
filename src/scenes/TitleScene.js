// TitleScene — S1 Title (root) with sub-panels S1m Mode Select, S1g Goals and S1b Codex (screen-graph §1, §3, §9).
// Start Run (default focus) · Goals · Codex · Settings · Fullscreen · Credits. There is no "press any key"
// gate: the first input of any kind unlocks audio (autoplay policy). Root transitions fade
// (screen-root-fade: out 200 ms, in 250 ms); scene.start runs only after the fade-out completes.
// Data: { openSetup?, openCodex?, openGoals? } (Run End "New Run" routes here when Mode Select is eligible).

import Phaser from '../../lib/phaser.esm.min.js';
import { UI_W, UI_H } from '../ui/uiSpace.js';   // 640×360 overlay design space
import { services } from './overlay.js';
import { FocusNav } from '../ui/nav.js';
import { RunSetup, setupEligible } from '../ui/RunSetup.js';
import { CodexView } from '../ui/CodexView.js';
import { GoalsView } from '../ui/GoalsView.js';
import { armRun, goalsCompleteCount } from '../run/meta.js';
import { C, txt } from '../ui/kit.js';
import { hintLine } from '../ui/HudKit.js';
import { button, glyph } from '../ui/draw.js';
import { cat } from '../data/catalog.js';
import { Save } from '../core/save.js';
import { t } from '../core/i18n.js';

export function codexCounts() {
  const k = cat(), m = Save.meta;
  const total = m.discovered.cards.length + m.discovered.relics.length + m.discovered.enemies.length + m.discovered.reactions.length + m.milestones.length;
  return { seen: total, isNew: total > (m.codexSeenCount | 0), all: k.cardList.length + k.relicList.length };
}

export class TitleScene extends Phaser.Scene {
  constructor() { super('title'); }

  init(data) { this.args = data || {}; }

  create() {
    Object.assign(this, services(this));
    this.router.clearHeld();
    this.sub = null;              // 'setup' | 'codex' | null
    this.leaving = false;
    const top = () => !this.flow.top() && !this.leaving;
    this.root = this.add.container(0, 0);
    this.nav = new FocusNav(this, { layer: this.root, isActive: top, onMove: (it) => { if (this.codex) this.codex.onFocus(it); } });
    this.buildMain();
    this.cameras.main.fadeIn(250, 0, 0, 0);
    // Autoplay policy: any first input unlocks the audio context.
    const unlock = () => this.mixer.unlock();
    this.input.once('pointerdown', unlock);
    this.input.keyboard.once('keydown', unlock);
    if (this.args.openSetup) this.openSetup(true);
    else if (this.args.openCodex) this.openCodex();
    else if (this.args.openGoals) this.openGoals();
  }

  buildMain() {
    const r = this.root;
    this.mainC = this.add.container(0, 0); r.add(this.mainC);
    const c = this.mainC, cx = UI_W / 2;
    c.add(txt(this, cx, 70, t('title.name'), 'display', { origin: [0.5, 0.5] }));
    c.add(txt(this, cx, 96, t('title.tagline'), 'T1', { origin: [0.5, 0.5], color: C.dim }));
    const cc = codexCounts();
    const items = [
      { id: 'start', label: t('title.start'), kind: 'primary', act: () => this.startPressed() },
      { id: 'goals', label: t('title.goals'), act: () => this.openGoals() },
      { id: 'codex', label: cc.isNew ? t('title.codexNew') : t('title.codex'), act: () => this.openCodex() },
      { id: 'settings', label: t('title.settings'), act: () => this.flow.open('settings', { from: 'title' }) },
      { id: 'fullscreen', label: t('title.fullscreen'), act: () => this.display.toggleFullscreen() },
      { id: 'credits', label: t('title.credits'), act: () => this.go('credits') },
    ];
    this.btns = {};
    items.forEach((it, i) => {
      const x = cx - 80, y = 128 + i * 28;
      const b = button(this, x, y, 160, 22, it.label, { kind: it.kind });
      c.add(b);
      this.btns[it.id] = b;
      this.nav.add({ id: `t:${it.id}`, x, y, w: 160, h: 22, onFocus: () => b.setFocused(true), onBlur: () => b.setFocused(false),
        onConfirm: () => { b.press(); this.mixer.unlock(); this.mixer.fire('ui_confirm'); it.act(); } });
    });
    this.nav.linkList(items.map((i) => `t:${i.id}`), 'v', true);
    // Goals "!" badge: a goal was completed (paid or queued) since Goals was last opened (goals-list title_badge)
    if (goalsCompleteCount(Save) > (Save.meta.goals.seen | 0)) {
      const gb = this.btns.goals;
      const badge = txt(this, gb.x + 160 - 12, gb.y + 5, '!', 'T2', { color: C.gold });
      c.add(badge);
      if (!Save.reducedMotion) this.tweens.add({ targets: badge, alpha: 0.4, duration: 500, ease: 'Sine.easeInOut', yoyo: true, repeat: 1 });
    }
    this.buildHint();
    this.nav.raise();
    this.nav.focus(this.lastMain || 't:start', { silent: true, snap: true });
  }

  /** G9 footer: rebuilt whenever the prompt family changes (controller-prompts §4). */
  buildHint() {
    if (this.hint) this.hint.destroy();
    const fam = this._fam = this.router.promptFamily;
    this.hint = hintLine(this, UI_W / 2, UI_H - 20, t(fam === 'kbm' ? 'title.hintKb' : 'title.hintPad'), this.router, { align: 'center' });
    this.mainC.add(this.hint);
  }

  startPressed() {
    if (setupEligible()) this.openSetup(false);
    else { armRun({ mode: 'standard', heat: 0 }); this.beginRun({ loadoutId: 'apprentice' }); }   // fresh profile: straight in
  }

  openGoals() {
    this.lastMain = this.nav.current;
    this.mainC.setVisible(false);
    for (const id of [...this.nav.order]) if (id.startsWith('t:')) this.nav.get(id).hidden = true;
    this.sub = 'goals';
    this.goals = new GoalsView(this, this.root, this.nav, { onBack: () => this.closeSub() });
    Save.meta.goals.seen = goalsCompleteCount(Save); Save.persist();
  }

  openSetup(force) {
    if (!force && !setupEligible()) return;
    this.lastMain = this.nav.current;
    this.mainC.setVisible(false);
    for (const id of [...this.nav.order]) if (id.startsWith('t:')) this.nav.get(id).hidden = true;
    this.sub = 'setup';
    this.setup = new RunSetup(this, this.root, this.nav, { onBegin: (o) => this.beginRun(o), onBack: () => this.closeSub() });
  }

  openCodex() {
    this.lastMain = this.nav.current;
    this.mainC.setVisible(false);
    for (const id of [...this.nav.order]) if (id.startsWith('t:')) this.nav.get(id).hidden = true;
    this.sub = 'codex';
    this.codexHead = txt(this, 16, 6, t('codex.title'), 'T2');
    this.root.add(this.codexHead);
    this.codex = new CodexView(this, this.root, this.nav, {});
    const cc = codexCounts();
    Save.setMeta('codexSeenCount', cc.seen);
  }

  closeSub() {
    this.mixer.fire('ui_back');
    if (this.setup) { this.setup.destroy(); this.setup = null; }
    if (this.goals) { this.goals.destroy(); this.goals = null; }
    if (this.codex) { this.codex.destroy(); this.codex = null; if (this.codexHead) this.codexHead.destroy(); }
    this.sub = null;
    this.mainC.destroy();
    this.nav.clear('t:');
    this.buildMain();
  }

  beginRun({ loadoutId, seed }) {
    this.mixer.unlock();
    this.go('run', seed != null ? { loadoutId, seed } : { loadoutId });
  }

  /** Root transition: fade out 200 ms, then scene.start. */
  go(key, data = {}) {
    if (this.leaving) return;
    this.leaving = true;
    const cam = this.cameras.main;
    cam.once('camerafadeoutcomplete', () => this.scene.start(key, data));
    cam.fadeOut(200, 0, 0, 0);
  }

  update() {
    if (this.mainC && this.router.promptFamily !== this._fam) this.buildHint();
    if (this.flow.top() || this.leaving) return;         // a modal (settings) owns UI input
    const ui = this.router.consumeUI();
    if (ui.length) this.mixer.unlock();
    for (let i = 0; i < ui.length; i++) {
      const a = ui[i];
      if (this.leaving || this.flow.top()) break;
      if (this.sub === 'codex' && this.codex && this.codex.handle(a)) continue;
      if (this.sub === 'goals' && this.goals && this.goals.handle(a)) continue;
      if (a === 'back') { if (this.sub) this.closeSub(); continue; }        // root: no quit on the web
      if (a === 'tabPrev' || a === 'tabNext') continue;
      this.nav.handle(a);
    }
  }
}

export { glyph };
