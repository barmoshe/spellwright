// RunEndScene — S7 Run End (root) and its S7u Unlocks sub-panel (screen-graph §1–§3; progression §8).
// Data (ui-contract §5): { summary, milestones:[unlocks.json record], nextGoals:[record] }.
// The outcome is the player's first question, so the summary shows first with a "n new unlocks"
// banner and focus on See unlocks; Continue from S7u returns here with focus on New Run.
// back = Title. The seed is shown here only (systems.md §7). The RunState is dropped on leaving.
// v2 (screen-graph §9.3/§9.6): `milestones` = goals PAID at this run end; a "Next goal" line with progress;
// queued (earned, unpaid) goals are named as such; Daily runs get the S7d share panel (share line + Copy,
// clipboard inside the confirm, D8 selectable DOM fallback) with default focus on Copy.

import Phaser from '../../lib/phaser.esm.min.js';
import { UI_W, UI_H } from '../ui/uiSpace.js';   // 640×360 overlay design space
import { services } from './overlay.js';
import { FocusNav } from '../ui/nav.js';
import { setupEligible, dailyResultText } from '../ui/RunSetup.js';
import { armRun, earnedGoals, goalProgress, shareLine } from '../run/meta.js';
import { C, txt, icon, cardCell } from '../ui/kit.js';
import { button, box, glyph, richLine, reduced, actorIcon } from '../ui/draw.js';
import { cat } from '../data/catalog.js';
import { Save } from '../core/save.js';
import { t } from '../core/i18n.js';
import { T } from '../core/tunables.js';
import { cardOf } from '../ui/fmt.js';

export class RunEndScene extends Phaser.Scene {
  constructor() { super('run-end'); }

  init(data) {
    const d = data || {};
    // tolerate the Wave-1 shape (summary passed directly)
    this.summary = d.summary || (d.outcome ? d : { outcome: 'abandon', floor: 1, step: 0, kills: 0, timeS: 0, wands: [], relics: [] });
    this.milestones = d.milestones || [];
    this.nextGoals = d.nextGoals || [];
  }

  create() {
    Object.assign(this, services(this));
    this.router.clearHeld();
    this.leaving = false;
    this.root = this.add.container(0, 0);
    this.body = this.add.container(0, 0);
    this.root.add(this.body);
    this.nav = new FocusNav(this, { layer: this.root, isActive: () => !this.leaving, onMove: (it) => this.detailFor(it) });
    this.cameras.main.fadeIn(250, 0, 0, 0);
    // feel-spec §flow: every input is ignored for runEndInputGuardMs (an in-flight tap can't skip the summary)
    this.guardUntil = performance.now() + T('runEndInputGuardMs', 350);
    this.buildSummary();
    this.nav.openAt = this.guardUntil - T('uiOpenGuardMs', 180);   // pointer guard covers the same window
  }

  // ======================================================================================= S7
  buildSummary() {
    const s = this, r = this.body, sm = this.summary;
    this.mode = 'summary';
    this.nav.clear();
    r.removeAll(true);
    this.nav.raise();
    const panels = [];
    const head = this.add.container(0, 0); r.add(head); panels.push(head);
    const outcome = ['death', 'victory', 'abandon'].includes(sm.outcome) ? sm.outcome : 'abandon';
    head.add(txt(s, UI_W / 2, 22, t(`runend.${outcome}`), 'display', { origin: [0.5, 0.5], color: outcome === 'victory' ? C.gold : outcome === 'death' ? C.error : C.text }));
    if (outcome === 'death' && sm.killer) {
      const k = cat().enemies[sm.killer] || cat().bosses[sm.killer];
      const name = k ? k.name : sm.killer;
      const line = this.add.container(0, 0); head.add(line);
      const tx = txt(s, 0, 40, t('runend.killedBy', { name }), 'T1', { color: C.dim });
      const ic = actorIcon(s, 0, 46, sm.killer, 16) || icon(s, 0, 46, 'enemies', sm.killer, 16);
      const w = tx.width + 20;
      ic.x = UI_W / 2 - w / 2 + 8; tx.x = UI_W / 2 - w / 2 + 20;
      line.add([ic, tx]);
    } else if (outcome === 'victory') head.add(txt(s, UI_W / 2, 40, t('runend.victorySub'), 'T1', { origin: [0.5, 0], color: C.dim }));

    // stats
    const st = this.add.container(0, 0); r.add(st); panels.push(st);
    st.add(box(s, 16, 58, 250, 182, 'dark'));
    st.add(txt(s, 24, 62, t('runend.stats'), 'T2'));
    const floorName = (cat().floorList[(sm.floor || 1) - 1] || {}).name || '';
    const mm = Math.floor((sm.timeS || 0) / 60), ss = Math.floor(sm.timeS || 0) % 60;
    const lo = cat().loadouts[sm.loadoutId];
    const rows = [
      [t('runend.floor'), t('runend.floorVal', { n: sm.floor || 1, step: (sm.step | 0) + 1 })],
      ['', floorName],
      [t('runend.time'), `${mm}:${String(ss).padStart(2, '0')}`],
      [t('runend.kills'), String(sm.kills | 0)],
      [t('runend.coins'), String(sm.coinsEarned | 0)],
      [t('runend.loadout'), lo ? lo.name : (sm.loadoutId || '-')],
      [t('runend.mode'), modeText(sm)],
      [t('runend.seed'), String(sm.seed ?? '-')],
    ];
    rows.forEach(([l, v], i) => { st.add(txt(s, 24, 82 + i * 18, l, 'T1', { color: C.dim })); st.add(txt(s, 258, 82 + i * 18, v, 'T1', { origin: [1, 0], color: l ? C.text : C.dim })); });

    // final wands + relics
    const wp = this.add.container(0, 0); r.add(wp); panels.push(wp);
    wp.add(box(s, 274, 58, 350, 182, 'dark'));
    wp.add(txt(s, 282, 62, t('runend.wands'), 'T2'));
    (sm.wands || []).forEach((w, i) => {
      const y = 84 + i * 30, def = cat().wands[w.id];
      wp.add(icon(s, 290, y + 9, 'wands', w.id, 16));
      w.slots.forEach((cid, k) => wp.add(cardCell(s, 302 + k * 19, y, cardOf(cid), 18)));
      this.nav.add({ id: `w:${i}`, x: 280, y: y - 3, w: 338, h: 24, wand: w, def, onConfirm: () => {} });
    });
    wp.add(txt(s, 282, 176, t('runend.relics', { n: (sm.relics || []).length }), 'T1', { color: C.dim }));
    (sm.relics || []).forEach((rid, i) => {
      const x = 284 + (i % 16) * 20, y = 192 + Math.floor(i / 16) * 20;
      wp.add(icon(s, x + 8, y + 8, 'relics', rid, 16));
      this.nav.add({ id: `r:${i}`, x, y, w: 18, h: 18, relic: rid, onConfirm: () => {} });
    });

    // progress: goals paid banner + (Daily) the share panel / (else) next goal + queued goals
    const pg = this.add.container(0, 0); r.add(pg); panels.push(pg);
    pg.add(box(s, 16, 246, 608, 62, 'dark'));
    let y = 250;
    if (this.milestones.length) {
      const bn = richLine(s, 24, y, [{ g: 'star' }, ' ', { t: t('runend.goalsPaid', { n: this.milestones.length }), color: C.gold }, '  ', { t: this.milestones.map((m) => m.name).join(' · '), color: C.text }]);
      pg.add(bn);
      this.banner = bn;
      y += 14;
    }
    const daily = sm.mode === 'daily' && sm.daily ? Save.meta.daily : null;
    this.shareText = null;
    if (daily && daily.first) {
      const first = daily.first, k = cat();
      const lo = k.loadouts[first.loadoutId];
      this.shareText = shareLine(k, first, { loadout: lo ? lo.name : first.loadoutId, rule: t(`daily.${first.ruleId}`) });
      const sl = txt(s, 24, y, this.shareText, 'T1', { wrap: 470 });
      pg.add(sl);
      y += Math.max(13, Math.ceil(sl.height) + 1);
      const practice = daily.attempts > 1;
      const badge = txt(s, 24, y, practice ? t('runend.dailyPractice', { result: dailyResultText(first) }) : t('runend.dailyFirst'), 'T1', { color: practice ? C.dim : C.gold });
      pg.add(badge);
      if (daily.best) pg.add(txt(s, 500, y, t('runend.dailyBest', { best: dailyResultText(daily.best) }), 'T1', { origin: [1, 0], color: C.dim }));
      if (!reduced()) { const by = badge.y; badge.y = by - 4; this.tweens.add({ targets: badge, y: by, duration: 160, ease: 'Back.easeOut', delay: 300 }); }
    } else {
      const heatUp = sm.mode === 'standard' && sm.outcome === 'victory' && Save.isUnlocked('features', 'heat') && (sm.heatLevel | 0) + 1 <= (Save.meta.heat.max | 0);
      if (heatUp) { pg.add(richLine(s, 24, y, [{ g: 'up' }, ' ', { t: t('runend.heatUnlocked', { n: (sm.heatLevel | 0) + 1 }), color: C.gold }])); y += 13; }
      const g = this.nextGoals[0];
      if (g) {
        const pr = goalProgress(g, Save.meta);
        const tx = txt(s, 24, y, t('runend.nextGoal', { name: g.name, cond: g.desc }) + (pr ? ` (${pr.cur}/${pr.need})` : ''), 'T1', { wrap: 590 });
        pg.add(tx); y += Math.max(13, Math.ceil(tx.height) + 1);
      } else if (!earnedGoals(cat(), Save).length) pg.add(txt(s, 24, y, t('runend.allDone'), 'T1', { color: C.dim }));
      const q = earnedGoals(cat(), Save);
      if (q.length && y < 296) pg.add(txt(s, 24, y, t('runend.goalsQueued', { list: q.map((x) => x.name).join(', ') }), 'T1', { color: C.dim, wrap: 590 }));
    }
    this.detail = txt(s, UI_W / 2, 314, '', 'T1', { origin: [0.5, 0], color: C.dim });
    r.add(this.detail);

    // buttons
    const btns = [];
    if (this.shareText) btns.push({ id: 'b:copy', label: t('runend.copy'), kind: 'primary', act: () => this.copyShare() });
    if (this.milestones.length) btns.push({ id: 'b:unlocks', label: t('runend.seeUnlocks'), kind: this.shareText ? 'button' : 'primary', act: () => this.showUnlocks() });
    btns.push({ id: 'b:new', label: t('runend.newRun'), kind: this.milestones.length ? 'button' : 'primary', act: () => this.newRun() });
    btns.push({ id: 'b:title', label: t('runend.title'), act: () => this.toTitle() });
    const bw = 130, x0 = UI_W / 2 - (btns.length * (bw + 8) - 8) / 2;
    const bp = this.add.container(0, 0); r.add(bp); panels.push(bp);
    btns.forEach((b, i) => {
      const x = x0 + i * (bw + 8);
      const o = button(s, x, 330, bw, 22, b.label, { kind: b.kind });
      bp.add(o);
      this.nav.add({ id: b.id, x, y: 330, w: bw, h: 22, onFocus: () => o.setFocused(true), onBlur: () => o.setFocused(false),
        onConfirm: () => { o.press(); this.mixer.fire('ui_confirm'); b.act(); }, nav: { up: 'w:0', down: null } });
    });
    this.nav.linkList(btns.map((b) => b.id), 'h', false);
    this.nav.raise();
    // feel-spec §flow (v2): first focus is "New run" (death → control ≤ 3 s); "See unlocks" stays one press away.
    // S7d (Daily): default focus is Copy (screen-graph §9.6).
    this.nav.focus(this.shareText ? 'b:copy' : 'b:new', { silent: true, snap: true });

    // runend-summary: panels stagger in 80 ms (reduced: together, 150 ms); input is live from frame 0
    panels.forEach((p, i) => {
      p.setAlpha(0);
      if (reduced()) this.tweens.add({ targets: p, alpha: 1, duration: 150 });
      else { p.y = 8; this.tweens.add({ targets: p, alpha: 1, y: 0, duration: 200, delay: i * 80, ease: 'Cubic.easeOut', onUpdate: () => { p.y = Math.round(p.y); } }); }
    });
    if (this.banner && !this.seenUnlocks) {
      this.time.delayedCall(reduced() ? 0 : 320, () => {
        this.mixer.fire('stg_goal');                                      // goal-complete stamp (cue-spec goal_earned)
        if (!reduced() && this.banner.active) { const y0 = this.banner.y; this.banner.y = y0 - 6; this.tweens.add({ targets: this.banner, y: y0, duration: 160, ease: 'Back.easeOut' }); }
      });
    }
  }

  detailFor(it) {
    if (!this.detail || !it) return;
    let s = '';
    if (it.wand) s = t('runend.pair', { a: it.def ? it.def.name : it.wand.id, b: it.wand.slots.filter(Boolean).map((c) => cardOf(c).name).join(', ') || t('runend.emptyWand') });
    else if (it.relic) { const r = cat().relics[it.relic]; s = r ? t('runend.pair', { a: r.name, b: r.desc }) : it.relic; }
    else if (it.unlock) s = it.unlock;
    this.detail.setText(s);
  }

  // ====================================================================================== S7u
  showUnlocks() {
    const s = this, r = this.body;
    this.mode = 'unlocks';
    this.seenUnlocks = true;
    this.nav.clear();
    r.removeAll(true);
    this.nav.raise();
    r.add(box(s, 16, 16, 608, 328, 'ornate'));
    r.add(txt(s, UI_W / 2, 24, t('runend.unlocksTitle'), 'T2', { origin: [0.5, 0] }));
    let y = 48;
    const ids = [];
    for (const m of this.milestones) {
      r.add(richLine(s, 32, y, [{ g: 'ok' }, ' ', { t: m.name, color: C.gold }, ' - ', { t: m.desc, color: C.dim }]));
      y += 16;
      for (const [kind, list] of Object.entries(m.unlocks || {})) for (const id of list) {
        if (y > 300) break;
        const rec = recOf(kind, id);
        const iconKind = kind === 'cards' ? (rec && rec.type === 'projectile' ? 'spells' : 'modifiers') : kind;
        if (kind === 'cards' && rec) r.add(cardCell(s, 40, y, rec, 18));
        else if (kind !== 'features' && kind !== 'loadouts' && kind !== 'stats') r.add(icon(s, 49, y + 9, iconKind, id, 16));
        else r.add(glyph(s, 44, y + 4, kind === 'loadouts' ? 'hand' : kind === 'stats' ? 'plus' : 'star'));
        const stat = kind === 'stats' ? id : null;
        const name = stat ? t(`goals.stat.${stat.stat}`, { n: stat.add }) : rec ? rec.name : t(`codex.feature.${id}`);
        const desc = stat ? t(`goals.statDesc.${stat.stat}`) : rec ? rec.desc : t(`codex.featureDesc.${id}`);
        const tx = txt(s, 64, y + 3, t('runend.unlockLine', { name, kind: t('runend.kind.' + kind), desc }), 'T1', { wrap: 540 });
        r.add(tx);
        const nid = `u:${ids.length}`; ids.push(nid);
        this.nav.add({ id: nid, x: 36, y, w: 580, h: 20, unlock: `${name}: ${desc}`, onConfirm: () => {} });
        y += Math.max(20, Math.ceil(tx.height) + 4);
      }
      y += 4;
    }
    const b = button(s, UI_W / 2 - 60, 316, 120, 22, t('runend.continue'), { kind: 'primary' });
    r.add(b);
    this.nav.add({ id: 'u:continue', x: UI_W / 2 - 60, y: 316, w: 120, h: 22, onFocus: () => b.setFocused(true), onBlur: () => b.setFocused(false),
      onConfirm: () => { b.press(); this.closeUnlocks(); } });
    this.nav.linkList([...ids, 'u:continue'], 'v', false);
    this.nav.raise();
    this.nav.focus('u:continue', { silent: true, snap: true });
  }

  closeUnlocks() { this.mixer.fire('ui_back'); this.buildSummary(); this.nav.focus('b:new', { silent: true, snap: true }); }

  // ---------------------------------------------------------------------------------- exits
  newRun() {
    this.closeCopyDialog();
    this.registry.remove('run');
    if (setupEligible()) { this.go('title', { openSetup: true }); return; }
    const last = Save.meta.lastLoadout;
    armRun({ mode: 'standard', heat: 0 });
    this.go('run', { loadoutId: Save.isUnlocked('loadouts', last) ? last : 'apprentice' });
  }

  // ------------------------------------------------------------------------- S7d copy (screen-graph §9.6)
  /** Copy runs INSIDE the confirm (the input's user activation); any failure opens D8 with a selectable line. */
  copyShare() {
    const line = this.shareText;
    if (!line) return;
    const ok = () => {
      if (!this.sys || !this.sys.isActive()) return;
      this.mixer.fire('ui_confirm');
      try { if (navigator.vibrate && this.router.device === 'touch') navigator.vibrate(6); } catch (_) { /* no haptics */ }
      this.showChip(t('runend.copied'));
    };
    try {
      if (!navigator.clipboard || !navigator.clipboard.writeText || !window.isSecureContext) throw new Error('no clipboard');
      navigator.clipboard.writeText(line).then(ok, () => this.openCopyDialog(line));
    } catch (e) { this.openCopyDialog(line); }
  }

  showChip(str) {
    if (this.chip) this.chip.destroy();
    const it = this.nav.get('b:copy');
    const x = it ? it.x + it.w / 2 : UI_W / 2, y = it ? it.y - 14 : 300;
    const c = this.add.container(0, 0);
    const tx = richLine(this, 0, 0, [{ g: 'ok' }, ' ', { t: str, color: C.ok }]);
    const w = tx.lineWidth || 60;
    tx.x = Math.round(x - w / 2); tx.y = y;
    c.add(tx);
    this.root.add(c);
    this.chip = c;
    if (!reduced()) { tx.y = y + 2; tx.setAlpha(0); this.tweens.add({ targets: tx, y, alpha: 1, duration: 150, ease: 'Back.easeOut' }); }
    this.time.delayedCall(1600, () => { if (c.active) c.destroy(); if (this.chip === c) this.chip = null; });
  }

  /** D8: the share line in a DOM <textarea readonly> (canvas text can't be selected), pre-selected, + Done. */
  openCopyDialog(line) {
    if (this.copyDlg) return;
    const touch = this.router.device === 'touch';
    const wrap = document.createElement('div');
    wrap.setAttribute('role', 'dialog');
    wrap.setAttribute('aria-label', t('runend.copyTitle'));
    wrap.style.cssText = 'position:fixed;inset:0;display:flex;align-items:center;justify-content:center;background:rgba(0,0,0,.6);z-index:50;font:14px monospace;';
    const panel = document.createElement('div');
    panel.style.cssText = 'background:#2a2a3a;border:2px solid #facb3e;color:#fdf7ed;padding:14px;max-width:min(560px,92vw);width:100%;box-sizing:border-box;';
    const title = document.createElement('div'); title.textContent = t('runend.copyTitle'); title.style.cssText = 'margin-bottom:8px;';
    const ta = document.createElement('textarea');
    ta.readOnly = true; ta.value = line; ta.rows = 3;
    ta.style.cssText = 'width:100%;box-sizing:border-box;background:#151520;color:#fdf7ed;border:1px solid #647685;font:14px monospace;padding:6px;resize:none;user-select:text;-webkit-user-select:text;';
    const hint = document.createElement('div'); hint.textContent = t(touch ? 'runend.copyHintTouch' : 'runend.copyHintKb'); hint.style.cssText = 'margin:8px 0;color:#b6cbcf;';
    const done = document.createElement('button'); done.textContent = t('runend.done');
    done.style.cssText = 'min-width:120px;min-height:37px;background:#facb3e;color:#222;border:0;font:14px monospace;cursor:pointer;';
    done.addEventListener('click', () => this.closeCopyDialog());
    panel.append(title, ta, hint, done); wrap.append(panel);
    document.body.appendChild(wrap);
    this.copyDlg = wrap;
    ta.focus(); ta.select(); try { ta.setSelectionRange(0, line.length); } catch (_) { /* old Safari */ }
    this.events.once('shutdown', () => this.closeCopyDialog());
  }
  closeCopyDialog() {
    if (!this.copyDlg) return;
    this.copyDlg.remove(); this.copyDlg = null;
    this.mixer.fire('ui_back');
  }

  toTitle() { this.closeCopyDialog(); this.registry.remove('run'); this.go('title'); }

  go(key, data = {}) {
    if (this.leaving) return;
    this.leaving = true;
    const cam = this.cameras.main;
    cam.once('camerafadeoutcomplete', () => this.scene.start(key, data));
    // feel-spec §flow: New run → control within retryToControlMs, including the room fade-in
    const ms = key === 'run' ? Math.max(60, Math.min(200, T('retryToControlMs', 700) - T('roomFadeMs'))) : 200;
    cam.fadeOut(ms, 0, 0, 0);
  }

  update() {
    if (this.leaving) return;
    const ui = this.router.consumeUI();
    if (performance.now() < this.guardUntil) return;
    for (let i = 0; i < ui.length; i++) {
      const a = ui[i];
      if (this.leaving) break;
      if (this.copyDlg) { if (a === 'back' || a === 'confirm') this.closeCopyDialog(); continue; }   // D8 owns input
      if (a === 'back') { if (this.mode === 'unlocks') this.closeUnlocks(); else { this.mixer.fire('ui_back'); this.toTitle(); } continue; }
      if (a === 'tabPrev' || a === 'tabNext') continue;
      this.nav.handle(a);
    }
  }
}

/** Mode row: "Heat 3" / "Gentle +2 · 10%" / "Daily 2026-09-27" / "Standard". */
function modeText(sm) {
  if (sm.mode === 'gentle' && sm.gentle) return t('runend.modeGentle', { h: sm.gentle.bonusHalfHearts | 0, p: Math.round((sm.gentle.absorbChance || 0) * 100) });
  if (sm.mode === 'daily' && sm.daily) return t('runend.modeDaily', { date: sm.daily.date });
  return sm.heatLevel ? t('mode.heatN', { n: sm.heatLevel }) : t('mode.standard');
}

function recOf(kind, id) {
  const k = cat();
  return kind === 'cards' ? k.cards[id] : kind === 'wands' ? k.wands[id] : kind === 'relics' ? k.relics[id] : kind === 'loadouts' ? k.loadouts[id] : null;
}
