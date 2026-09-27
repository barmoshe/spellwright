// PauseScene — modal overlay S3 (screen-graph §1, §3): tabs Wands · Relics · Map · Codex · Menu.
// Opened from the run (Tab/I/Back → Wands; Esc/Start/focus loss → Menu), from Reward/Shop via
// flow.replace with `returnTo`, and from a Reward card Take with `heldCard`.
//
// Data (ui-contract §5): { tab, heldCard?, returnTo?:{key, data} }.
// The editor snapshot is taken on open; commitEdits(snap) runs on close (changed wands pay
// editForcesRecharge); close = flow.close('pause') or flow.replace(returnTo.key, returnTo.data).

import Phaser from '../../lib/phaser.esm.min.js';
import { UI_W, onReflow, viewLeft, viewRight, screenX, screenY } from '../ui/uiSpace.js';   // 640×360 overlay design space
import { modalChrome } from './overlay.js';
import { FocusNav } from '../ui/nav.js';
import { ExtraKeys } from '../ui/extraKeys.js';
import { WandEditor } from '../ui/WandEditor.js';
import { CodexView } from '../ui/CodexView.js';
import { Dialog } from '../ui/Dialog.js';
import { C, txt, icon, keycap } from '../ui/kit.js';
import { button, glyph, richLine, box, reduced, drawGlyph } from '../ui/draw.js';
import { cat } from '../data/catalog.js';
import { Art } from '../core/art.js';
import { t } from '../core/i18n.js';
import { rarityWord } from '../ui/fmt.js';
import { EV, listen } from '../core/events.js';
import { glyph as padGlyph, glyphSpecs } from '../ui/HudKit.js';

const TABS = ['wands', 'relics', 'map', 'codex', 'menu'];
const TAB_W = 76, TAB_X0 = Math.round((UI_W - TAB_W * TABS.length) / 2);

export class PauseScene extends Phaser.Scene {
  constructor() { super('pause'); }

  init(data) {
    this.args = data || {};
    this.tab = TABS.includes(this.args.tab) ? this.args.tab : (this.args.heldCard ? 'wands' : 'menu');
    if (this.args.heldCard) this.tab = 'wands';
  }

  create() {
    this.m = modalChrome(this, { swap: !!this.args._swap });
    Object.assign(this, { router: this.m.router, flow: this.m.flow, bus: this.m.bus, run: this.m.run, mixer: this.m.mixer });
    this.touchUi = !!(this.router && this.router.touchProfile);
    // mobile-touch-spec §7.3 welcome-back: the reveal re-arms the open-guard and shows the reorientation header
    listen(this, this.bus, EV.WELCOME_BACK, () => {
      if (this.nav) this.nav.rearmGuard();
      if (this.tab === 'menu' && !this.closing) this.showTab('menu');
    });
    this.__dialog = null;
    this.closing = false;
    this.snap = this.run ? this.run.snapshot() : null;
    const top = () => this.flow.top() === 'pause' && !this.__dialog && !this.closing;
    this.nav = new FocusNav(this, { layer: this.m.panel, isActive: top, onMove: (it) => this.onNavMove(it) });
    this.extra = new ExtraKeys(this, top);
    this.buildTabBar();
    this.content = this.add.container(0, 0);
    this.m.panel.add(this.content);
    this.focusMemo = {};
    this.showTab(this.tab, true);
    this.events.once('shutdown', () => { if (this.editor) this.editor.destroy(); });
  }

  // ------------------------------------------------------------------------------------ tab bar
  buildTabBar() {
    const p = this.m.panel;
    // wand-editor-ux §10.4: the tab bar is 24 px tall in the touch profile (≥ 24 px targets); 20 on desktop
    const TB = this.touchUi ? 24 : 20;
    // aspect-ratio-spec §4: the strip spans the whole view (0…W); the tabs stay centred in the 640 design space
    const strip = () => { const b = box(this, viewLeft(), 0, viewRight() - viewLeft(), TB, 'dark'); p.addAt(b, 0); return b; };
    this.tabStrip = strip();
    onReflow(this, () => { if (this.tabStrip) this.tabStrip.destroy(); this.tabStrip = strip(); });
    this.buildTabKeys();
    this.tabTexts = TABS.map((k, i) => {
      const x = TAB_X0 + i * TAB_W;
      const tx = txt(this, x + TAB_W / 2, TB === 24 ? 5 : 3, t(`pause.tab.${k}`), 'T1', { origin: [0.5, 0], color: C.dim });
      p.add(tx);
      this.nav.add({ id: `tab:${k}`, x, y: TB === 24 ? 0 : 2, w: TAB_W, h: TB === 24 ? 24 : 16, clickOnly: true, onClick: () => this.switchTab(k) });
      return tx;
    });
    this.underline = this.add.rectangle(TAB_X0, TB - 3, TAB_W - 16, 2, C.gold).setOrigin(0);
    p.add(this.underline);
  }

  paintTabs(snap) {
    const i = TABS.indexOf(this.tab);
    this.tabTexts.forEach((tx, k) => { const col = k === i ? C.text : C.dim; if (tx.setColor) tx.setColor('#' + col.toString(16).padStart(6, '0')); else tx.setTint(col); });
    const x = TAB_X0 + i * TAB_W + 8;
    if (snap || reduced()) this.underline.x = x;
    else this.tweens.add({ targets: this.underline, x, duration: 33, ease: 'Quad.easeOut' });
  }

  switchTab(key) {
    if (key === this.tab || this.closing) return;
    if (this.tab === 'wands' && this.editor && this.editor.held && !this.editor.tryRelease()) return;   // D3 shown
    if (this.tab === 'wands' && this.editor && this.editor.held) return;
    this.mixer.fire('ui_tab');
    this.showTab(key);
  }

  showTab(key, first = false) {
    if (this.nav.current && !this.nav.current.startsWith('tab:')) this.focusMemo[this.tab] = this.nav.current;
    if (this.editor) { this.lastSel = this.editor.sel; this.editor.destroy(); this.editor = null; }
    if (this.codex) { this.codex.destroy(); this.codex = null; }
    this.content.removeAll(true);
    for (const id of [...this.nav.order]) if (!id.startsWith('tab:')) this.nav.remove(id);
    this.tab = key;
    this.paintTabs(first);
    this.detail = null;
    if (key === 'wands') this.buildWands(first);
    else if (key === 'relics') this.buildRelics();
    else if (key === 'map') this.buildMap();
    else if (key === 'codex') this.codex = new CodexView(this, this.content, this.nav, { inPause: true });
    else this.buildMenu();
    const memo = this.focusMemo[key];
    if (key !== 'wands' && memo && this.nav.has(memo)) this.nav.focus(memo, { silent: true, snap: true });
    this.nav.raise();
  }

  onNavMove(it) {
    if (this.tab === 'wands' && this.editor) this.editor.onFocus(it);
    else if (this.tab === 'relics' && it.relicId) this.relicDetail(it.relicId);
    else if (this.tab === 'codex' && this.codex) this.codex.onFocus(it);
  }

  // -------------------------------------------------------------------------------------- tabs
  buildWands(first) {
    if (!this.run || !this.run.wands.length) { this.content.add(txt(this, UI_W / 2, 150, t('pause.noRun'), 'T1', { origin: [0.5, 0.5], color: C.dim })); return; }
    this.editor = new WandEditor(this, this.content, this.nav, { snap: this.snap, heldCard: first ? this.args.heldCard : null, sel: this.lastSel });
    if (!first) { const memo = this.focusMemo.wands; if (memo && this.nav.has(memo)) this.nav.focus(memo, { silent: true, snap: true }); }
  }

  buildRelics() {
    const c = this.content, run = this.run;
    c.add(box(this, 8, 24, 336, 316, 'dark'));
    c.add(box(this, 352, 24, 280, 316, 'dark'));
    c.add(txt(this, 16, 28, t('pause.relicsHead', { n: run ? run.relics.length : 0 }), 'T2'));
    this.relicDetailC = this.add.container(0, 0); c.add(this.relicDetailC);
    const list = run ? run.relics : [];
    if (!list.length) { c.add(txt(this, 176, 180, t('pause.noRelics'), 'T1', { origin: [0.5, 0.5], color: C.dim, wrap: 300, align: 'center' })); this.relicDetail(null); return; }
    const ids = [];
    list.forEach((rid, i) => {
      const x = 18 + (i % 8) * 40, y = 50 + Math.floor(i / 8) * 40;
      c.add(this.add.graphics().fillStyle(C.stroke, 1).fillRect(x, y, 36, 36).fillStyle(C.panel, 1).fillRect(x + 1, y + 1, 34, 34));
      c.add(icon(this, x + 18, y + 18, 'relics', rid, 32));
      const id = `r:${i}`; ids.push(id);
      this.nav.add({ id, x, y, w: 36, h: 36, relicId: rid, onConfirm: () => {} });
    });
    this.nav.focus(ids[0], { silent: true, snap: true });
    this.relicDetail(list[0]);
  }

  relicDetail(rid) {
    const c = this.relicDetailC; if (!c) return;
    c.removeAll(true);
    if (!rid) { c.add(txt(this, 362, 34, t('pause.relicsPrimer'), 'T1', { color: C.dim, wrap: 260 })); return; }
    const r = cat().relics[rid];
    c.add(icon(this, 378, 50, 'relics', rid, 32));
    c.add(txt(this, 400, 36, r.name, 'T2', { wrap: 224 }));
    c.add(txt(this, 400, 54, rarityWord(r.rarity), 'T1', { color: C.rar[r.rarity] ?? C.dim }));
    c.add(txt(this, 362, 78, r.desc, 'T1', { wrap: 260 }));
    const n = this.run.relicCounters[rid] | 0;
    const hasTrigger = r.effects.some((e) => e.type === 'on_event');
    if (hasTrigger) c.add(txt(this, 362, 130, t('pause.relicTriggered', { n }), 'T1', { color: C.dim }));
  }

  buildMap() {
    const c = this.content, run = this.run;
    c.add(box(this, 8, 24, 624, 316, 'dark'));
    if (!run) return;
    const floors = cat().floorList;
    floors.forEach((f, fi) => {
      const y0 = 34 + fi * 88;
      const fl = fi + 1;
      const cur = fl === run.floor;
      c.add(txt(this, 20, y0, t('pause.mapFloor', { n: fl, name: f.name }), 'T2', { color: cur ? C.text : fl < run.floor ? C.dim : C.disabled }));
      const steps = (f.steps || []).length;
      const visited = run.route.filter((r) => r.floor === fl);
      const g = this.add.graphics(); c.add(g);
      const total = steps + 1;                       // + boss
      const pitch = Math.min(44, Math.floor(580 / total));
      for (let s = 0; s < total; s++) {
        const x = 24 + s * pitch, y = y0 + 26;
        const v = visited.find((r) => r.step === s);
        const isBoss = s === steps;
        const kind = isBoss ? 'boss' : v ? v.roomKind : null;
        if (s > 0) g.fillStyle(C.slateDark, 1).fillRect(x - pitch + 12, y + 5, pitch - 14, 1);
        this.drawPip(g, x, y, kind, !!v || (isBoss && fl < run.floor));
        if (cur && s === run.step) { g.lineStyle(1, C.stroke, 1).strokeRect(x - 3.5, y - 3.5, 18, 18); g.lineStyle(1, C.gold, 1).strokeRect(x - 2.5, y - 2.5, 16, 16); }
        if (v && v.reward) {
          const rk = { spell: 'spells', modifier: 'modifiers' }[v.reward];
          const a = Art.getQuiet(`reward_kind.${v.reward}.icon16`) || Art.getQuiet(`icon16.reward_kind.${v.reward}`);
          if (a) c.add(this.add.image(x + 5, y + 24, a.key, a.frame));
          // (no 3-letter fallback, §2.3 #26: the 16 px reward-kind icon carries it)
        }
      }
    });
    // legend + run info
    const legend = ['start', 'combat', 'elite', 'treasure', 'shop', 'boss'];
    const g = this.add.graphics(); c.add(g);
    legend.forEach((k, i) => { const x = 20 + i * 86; this.drawPip(g, x, 300, k, true); c.add(txt(this, x + 16, 299, t(`pause.room.${k}`), 'T1', { color: C.dim })); });
    const s = run.stats;
    const mm = Math.floor(s.timeFrames / 3600), ss = Math.floor(s.timeFrames / 60) % 60;
    c.add(txt(this, 20, 320, t('pause.mapInfo', { time: `${mm}:${String(ss).padStart(2, '0')}`, kills: s.kills }), 'T1'));
  }

  /** Floor-track pip (hud-layout H4 shapes, so kind reads without colour). */
  drawPip(g, x, y, kind, seen) {
    const col = seen ? C.text : C.disabled;
    const a = kind && Art.getQuiet(`ui.pip_${kind === 'boss' ? 'boss_9' : kind}`);
    g.fillStyle(C.stroke, 1);
    switch (kind) {
      case 'start': g.fillCircle(x + 5, y + 5, 5); g.fillStyle(col, 1).fillCircle(x + 5, y + 5, 4); g.fillStyle(C.stroke, 1).fillCircle(x + 5, y + 5, 2); break;
      case 'combat': g.fillRect(x, y, 10, 10); g.fillStyle(col, 1).fillRect(x + 1, y + 1, 8, 8); break;
      case 'elite': g.fillPoints([{ x: x + 5, y: y - 1 }, { x: x + 11, y: y + 5 }, { x: x + 5, y: y + 11 }, { x: x - 1, y: y + 5 }], true);
        g.fillStyle(C.gold, 1).fillPoints([{ x: x + 5, y }, { x: x + 10, y: y + 5 }, { x: x + 5, y: y + 10 }, { x, y: y + 5 }], true); break;
      case 'treasure': g.fillTriangle(x + 5, y - 1, x + 11, y + 10, x - 1, y + 10); g.fillStyle(col, 1).fillTriangle(x + 5, y + 1, x + 9, y + 9, x + 1, y + 9); break;
      case 'shop': g.fillCircle(x + 5, y + 5, 5); g.fillStyle(C.gold, 1).fillCircle(x + 5, y + 5, 4); break;
      case 'boss': g.fillRect(x - 1, y - 1, 12, 12); g.fillStyle(C.hpRed, 1).fillRect(x, y, 10, 10); drawGlyph(g, x + 1, y + 1, 'no', C.stroke); break;
      default: g.lineStyle(1, C.disabled, 1).strokeRect(x + 1.5, y + 1.5, 7, 7);
    }
    void a;
  }

  buildMenu() {
    const c = this.content;
    c.add(box(this, UI_W / 2 - 110, 70, 220, 190, 'ornate'));
    c.add(txt(this, UI_W / 2, 82, t('pause.title'), 'T2', { origin: [0.5, 0] }));
    // welcome-back header (§7.3): T2 + a T1 reorientation line, only after a hold (focus loss / rotation)
    if (this.registry.get('welcomeBack') && this.run) {
      const r = this.run;
      // aspect-ratio-spec §5.1: title (W/2, sT + 30), subtitle (W/2, sT + 46) ≤ 440 wide, ≤ 2 lines, bottom ≤ 66 (the
      // Menu box top − 4). The HUD is hidden under every modal, so nothing collides with it any more.
      const disp = this.registry.get('display'), sT = screenY(disp ? disp.safe.t : 0);
      c.add(txt(this, UI_W / 2, sT + 30, t('welcome.title'), 'T2', { origin: [0.5, 0] }));
      c.add(txt(this, UI_W / 2, sT + 46, t('welcome.line', { floor: r.floor, room: (r.step || 0) + 1, hp: r.hp, max: r.maxHp, wand: r.activeWand + 1 }), 'T1', { origin: [0.5, 0], color: C.dim, wrap: 440, align: 'center' }));
    }
    const items = [
      { id: 'm:resume', label: t('pause.resume'), kind: 'primary', act: () => this.requestClose() },
      { id: 'm:settings', label: t('pause.settings'), act: () => this.flow.open('settings', { from: 'pause' }) },
      { id: 'm:controls', label: t('pause.controls'), act: () => this.flow.open('settings', { from: 'pause', group: 'controls' }) },
      { id: 'm:abandon', label: t('pause.abandon'), kind: 'danger', act: () => this.askAbandon() },
    ];
    // touch profile: the primary (Resume) is ≥ 37 px tall (mobile-touch-spec §5.2), rows ≥ 24
    items.forEach((it, i) => {
      const x = UI_W / 2 - 80;
      const h = this.touchUi && i === 0 ? 37 : 24;
      const y = this.touchUi ? (i === 0 ? 102 : 148 + (i - 1) * 32) : 108 + i * 34;
      const b = button(this, x, y, 160, h, it.label, { kind: it.kind });
      c.add(b);
      this.nav.add({ id: it.id, x, y, w: 160, h, onFocus: () => b.setFocused(true), onBlur: () => b.setFocused(false),
        onConfirm: () => { b.press(); this.mixer.fire('ui_confirm'); it.act(); } });
    });
    this.nav.linkList(items.map((i) => i.id), 'v', true);
    this.nav.focus('m:resume', { silent: true, snap: true });
  }

  askAbandon() {
    this.__dialog = new Dialog(this, { mainNav: this.nav, text: t('confirm.abandon'),
      options: [{ label: t('confirm.keepPlaying') }, { label: t('confirm.abandonBtn'), kind: 'danger', action: () => this.abandonRun() }] });
  }

  /** Abandon (D1 confirmed) → run-end {abandon}. Uses the RunScene's end path when present. */
  abandonRun() {
    const rs = this.scene.get('run');
    if (this.snap && this.run) this.run.commitEdits(this.snap);
    if (rs && rs.sys && (rs.sys.isActive() || rs.sys.isPaused()) && typeof rs.endRun === 'function') { rs.endRun('abandon'); return; }
    // No live RunScene (dev harness): finish the run here so the flow is still exercisable.
    if (this.run) this.run.end('abandon');
    this.flow.clear();
    this.scene.start('run-end', { summary: this.run ? this.run.summary() : { outcome: 'abandon' }, milestones: [], nextGoals: [] });
  }

  // ------------------------------------------------------------------------------------ close
  requestClose() {
    if (this.closing) return;
    this.registry.set('welcomeBack', false);
    if (this.editor && this.editor.held && !this.editor.tryRelease()) return;   // D3 (never a trap)
    if (this.editor && this.editor.held) return;
    this.closing = true;
    if (this.snap && this.run) this.run.commitEdits(this.snap);
    const rt = this.args.returnTo;
    this.m.close(() => {
      if (rt) this.flow.replace(rt.key, { ...(rt.data || {}), _swap: true });
      else this.flow.close('pause');
    }, { swap: !!rt });
  }

  /** G5 tab-bar keys: Q/E keycaps on keyboard, [tabPrev]/[tabNext] glyphs (LB/RB · L1/R1) on a pad. */
  buildTabKeys() {
    if (this.kPrev) { this.kPrev.destroy(); this.kNext.destroy(); }
    const fam = this._fam = this.router.promptFamily;
    if (fam === 'touch') {                     // touch: tabs are tapped; the modal Back button owns the top-left
      this.kPrev = this.add.container(0, 0); this.kNext = this.add.container(0, 0);
    } else if (fam === 'kbm') {
      this.kPrev = keycap(this, 10, 4, 'Q');
      this.kNext = keycap(this, UI_W - 24, 4, 'E');
    } else {
      this.kPrev = padGlyph(this, 10, 4, glyphSpecs(this.router, 'tabPrev')[0]);
      this.kNext = padGlyph(this, 0, 4, glyphSpecs(this.router, 'tabNext')[0]);
      this.kNext.x = UI_W - 12 - this.kNext._w;
    }
    this.m.panel.add([this.kPrev, this.kNext]);
  }

  update() {
    if (this.flow.top() !== 'pause') return;
    const ui = this.router.consumeUI();
    const ex = this.extra.consume();
    for (let i = 0; i < ui.length; i++) this.onIntent(ui[i]);
    for (let i = 0; i < ex.length; i++) this.onExtra(ex[i]);
    if (this.editor && this.editor.heldObj && this.editor.pointerMode) this.editor.drawHeld();
    // controller-prompts §4 G5/G6: tab keycaps + editor footer follow the prompt family live
    if (this.router.promptFamily !== this._fam) { this.buildTabKeys(); if (this.editor) this.editor.buildFooter(); }
  }

  onIntent(a) {
    if (this.closing) return;
    if (this.__dialog) { this.__dialog.handle(a); return; }
    if (a === 'tabPrev' || a === 'tabNext') {
      const i = TABS.indexOf(this.tab), d = a === 'tabNext' ? 1 : TABS.length - 1;
      this.switchTab(TABS[(i + d) % TABS.length]);
      return;
    }
    if (this.tab === 'wands' && this.editor) {
      const r = this.editor.handle(a);
      if (r === 'close') this.requestClose();
      return;
    }
    if (this.tab === 'codex' && this.codex && this.codex.handle(a)) return;
    if (a === 'back') { this.requestClose(); return; }
    if (!this.nav.current || this.nav.current.startsWith('tab:')) { const first = this.nav.order.find((k) => !k.startsWith('tab:')); if (first) { this.nav.focus(first); return; } }
    this.nav.handle(a);
  }

  onExtra(a) {
    if (this.closing || this.__dialog) return;
    if (a === 'back') { this.onIntent('back'); return; }
    if (this.tab === 'wands' && this.editor) this.editor.extra(a);
  }
}
