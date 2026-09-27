// HudScene — the screen-space HUD (hud-layout.md H1–H15; motion-spec §4; accessibility-spec §2–§4, §7).
// Parallel, non-modal overlay (scene-flow §1/§3): it NEVER takes input and never polls run data for
// display — every element updates on a bus event (architecture §9: no per-frame setText). The only
// per-frame work is alpha easing (fades, occlusion), bars that are mid-animation, timers that run on
// the sim clock (they advance only while the sim scene is running, so hit-stop and modals freeze them),
// and one probe read for the occlusion fade (spatial, hud-layout §3.2).
//
// Launched by RunScene as `scene.launch('hud')`. `data.sim` names the sim scene (default 'run'; the
// HUD harness passes 'hudstub').

import Phaser from '../../lib/phaser.esm.min.js';
import { VIEW_W, VIEW_H } from '../config.js';
import { EV, listen } from '../core/events.js';
import { t } from '../core/i18n.js';
import { T } from '../core/tunables.js';
import { Save } from '../core/save.js';
import { cat } from '../data/catalog.js';
import { C, txt, icon, cardCell } from '../ui/kit.js';
import { ensureHudTextures, hudImage, hudTex, reducedMotion, flashScale, PIP_FOR_KIND, drawPsSymbol } from '../ui/HudKit.js';
import { promptEntry } from '../input/prompts.js';
import { Toasts } from '../ui/Toasts.js';

// hud-layout §2 geometry (internal px)
const HEART_X = 6, HEART_DX = 14, TOP_Y = 6;
const RELIC_X = 6, RELIC_Y = 22, RELIC_DX = 18, RELIC_MAX = 8;
const TRACK_LABEL_X = 276, PIP_X = 280, PIP_DX = 9, PIP_Y = 8;
const BOSS = { x: 170, y: 17, w: 300, h: 6 };
const RIGHT_X = 634;
const BADGE_X = 6, BADGE_DX = 22, BADGE_Y = 334, BADGE_UP = 330;
const STRIP_Y = 324, CELL_DX = 19, CHEV_Y = 343, RBAR_Y = 343;
const MANA = { x: 76, y: 348, w: 120, h: 6 };
const AUTO_POS = { x: 76, y: 316 };
// clusters for the occlusion fade (hud-layout §2.2 / §3.2)
const CLUSTER = { tl: [6, 6, 144, 34], tc: [262, 6, 110, 12], tr: [560, 6, 74, 24], bl: [6, 314, 264, 40] };
const BOSS_CLUSTER = [170, 4, 300, 20];

export class HudScene extends Phaser.Scene {
  constructor() { super('hud'); }

  init(data) { this.simKey = (data && data.sim) || 'run'; }

  create() {
    const reg = this.registry;
    this.bus = reg.get('bus');
    this.router = reg.get('router');
    this.flow = reg.get('flow');
    this.mixer = reg.get('mixer');
    this.run = reg.get('run');
    this.cat = cat();
    ensureHudTextures(this);

    this.now = 0;                         // HUD clock (ms), not frozen by hit-stop
    this.simActive = false;               // sim scene running this frame (sim-clock timers advance)
    this.sputterFlashMs = T('sputterFlashMs');
    this.hurtFlashMs = T('hurtFlashMs');
    this.wandSwapMs = T('wandSwapMs');
    this.fades = [];                      // C2 elements {objs, rest, wake, a}

    // cluster containers (occlusion fade multiplies these)
    this.cl = {};
    for (const k of ['tl', 'tc', 'tr', 'bl', 'boss']) this.cl[k] = { c: this.add.container(0, 0), a: 1, occ: false, clearAt: -1 };
    this.cl.boss.c.setVisible(false);

    this._buildHearts();
    this._buildRelics();
    this._buildTrack();
    this._buildBoss();
    this._buildTopRight();
    this._buildWand();
    this._buildBanners();
    this._buildHurtEdges();
    this.toasts = new Toasts(this, { flow: this.flow, router: this.router, mixer: this.mixer });

    this._listen();
    this._syncAll();

    this._lastTop = this.flow ? this.flow.top() : null;
    this.events.once('shutdown', () => this._shutdown());
  }

  // =============================================================================================
  // generic helpers
  // =============================================================================================
  get rm() { return reducedMotion(); }
  _tw(cfg) { return this.tweens.add(cfg); }
  /** A C2 element: rests at `rest` alpha, wakes to 100% for `holdMs` (hud-layout §3.1). */
  _fade(objs, rest) { const f = { objs, rest, wake: -1, a: rest, hold: 0 }; for (const o of objs) o.setAlpha(rest); this.fades.push(f); return f; }
  _wake(f, holdMs) { f.wake = Math.max(f.wake, this.now + holdMs); }
  _simRunning() { const sm = this.scene; return sm.isActive(this.simKey) && !sm.isPaused(this.simKey); }
  _sim() { return this.scene.get(this.simKey); }
  _modal() { return !!(this.flow && this.flow.top()); }

  // =============================================================================================
  // H1 hearts · H2 shield
  // =============================================================================================
  _buildHearts() {
    this.hearts = [];
    this.heartVal = [];
    this.shield = hudImage(this, 0, TOP_Y, 'shield_hex_13x12').setVisible(false);
    this.cl.tl.c.add(this.shield);
    this.shards = this.add.graphics();
    this.cl.tl.c.add(this.shards);
    this.lowHp = false;
    this.pulse = null;
  }

  _layoutHearts(maxHp) {
    const n = Math.min(6, Math.ceil(maxHp / 2));
    while (this.hearts.length > n) { const h = this.hearts.pop(); h.flash.destroy(); h.destroy(); this.heartVal.pop(); }
    while (this.hearts.length < n) {
      const i = this.hearts.length;
      const h = hudImage(this, HEART_X + HEART_DX * i, TOP_Y, 'ui_heart_full');
      const ft = hudTex('ui_heart_full');
      h.flash = this.add.image(h.x, h.y, ft.key, ft.frame).setOrigin(0).setVisible(false);
      h.flash.setTint(0xffffff).setTintMode(Phaser.TintModes.FILL);
      this.cl.tl.c.add([h, h.flash]);
      this.hearts.push(h); this.heartVal.push(2);
    }
    this.shield.moveBox(HEART_X + HEART_DX * n + 1, TOP_Y);
  }

  _setHp(hp, maxHp, animate = true) {
    this._layoutHearts(maxHp);
    const rm = this.rm;
    let healStagger = 0;
    for (let i = 0; i < this.hearts.length; i++) {
      const v = Math.max(0, Math.min(2, Math.ceil(hp) - 2 * i));
      const prev = this.heartVal[i];
      const h = this.hearts[i];
      const name = v === 2 ? 'ui_heart_full' : v === 1 ? 'ui_heart_half' : 'ui_heart_empty';
      this.heartVal[i] = v;
      if (!animate || v === prev) { h.setGlyph(name); continue; }
      if (v < prev) {
        // hud-heart-loss: 2-frame white fill flash (flash-scaled), frame swap after it, 2 px shards (not RM)
        const k = flashScale();
        const ft = hudTex(h.__glyph);
        h.flash.setTexture(ft.key, ft.frame).setPosition(h.x, h.y);
        h.flash.setVisible(k > 0).setAlpha(k);
        this.time.delayedCall(33, () => { h.flash.setVisible(false); h.setGlyph(name); });
        if (!rm) this._shardBurst(h.x + 6, h.y + 6);
      } else {
        // hud-heart-gain: frame swap at start, translateY −2 → 0 Back.easeOut 150 ms, stagger 60 (RM: swap only)
        h.setGlyph(name);
        if (!rm) {
          const by = h.y;
          h.y = by - 2;
          this._tw({ targets: h, y: by, duration: 150, delay: healStagger, ease: 'Back.easeOut', onUpdate: () => { h.y = Math.round(h.y); } });
          healStagger += 60;
        }
      }
    }
    this._setLowHp(hp > 0 && hp <= 2);
  }

  _shardBurst(x, y) {
    const shards = [{ x: x - 2, y, vx: -3 }, { x: x + 2, y, vx: 3 }];
    const o = { p: 0 };
    this._tw({ targets: o, p: 1, duration: 250, ease: 'Quad.easeIn', onUpdate: () => {
      this.shards.clear();
      for (const s of shards) this.shards.fillStyle(C.hpRed, 1 - o.p).fillRect(Math.round(s.x + s.vx * o.p), Math.round(s.y + 6 * o.p), 2, 2);
    }, onComplete: () => this.shards.clear() });
  }

  _setShield(n, animate = true) {
    const had = this.shield.visible;
    const has = n > 0;
    if (has) { this.shield.setVisible(true).setAlpha(1); return; }
    if (!had) return;
    this.shield.setVisible(false);
    if (!animate || this.rm) return;
    // hud-shield-break: 3-frame shatter (150 ms) — four hexagon shards fly apart and fade
    const cx = this.shield.__bx + 6, cy = this.shield.__by + 6;
    const o = { p: 0 };
    this._tw({ targets: o, p: 1, duration: 150, onUpdate: () => {
      this.shards.clear();
      const d = Math.round(1 + o.p * 5);
      this.shards.fillStyle(C.mana, 1 - o.p);
      this.shards.fillRect(cx - 4 - d, cy - 4 - d, 4, 4).fillRect(cx + d, cy - 4 - d, 4, 4).fillRect(cx - 4 - d, cy + d, 4, 4).fillRect(cx + d, cy + d, 4, 4);
    }, onComplete: () => this.shards.clear() });
  }

  /** hud-layout §3.4: HP ≤ 2 → remaining hearts pulse 100↔55% at 1 Hz (RM: static) + a static 30% dark-red edge vignette. */
  _setLowHp(on) {
    if (on === this.lowHp && !this._lowHpDirty) return;
    this._lowHpDirty = false;
    this.lowHp = on;
    if (this.pulse) { this.pulse.stop(); this.pulse = null; }
    for (const h of this.hearts) h.setAlpha(1);
    if (on && !this.rm) {
      const alive = this.hearts.filter((h, i) => this.heartVal[i] > 0);
      this.pulse = this._tw({ targets: alive, alpha: 0.55, duration: 500, ease: 'Sine.easeInOut', yoyo: true, repeat: -1 });
    }
    this._vignette(on);
  }

  /**
   * Low-HP vignette (hud-layout §3.4). NOT the 4.1 `Vignette` filter: its shader mixes by
   * sin(d/radius · π · strength) from the very centre and replaces the colour outright outside `radius`,
   * so it cannot leave the centre clean while holding 30% at the edges (measured in the harness: the whole
   * play field went red, which accessibility-spec §4.3 forbids). Instead: one elliptical gradient texture
   * generated once (centre alpha 0 → 30% dark red at the corners), drawn as a single HUD image under
   * every cluster. Zero filters, zero render targets, one quad. Fades in over 300 ms, never pulses.
   */
  _vignette(on) {
    if (!this.vigImg) {
      const key = 'hud:lowhp_vignette';
      if (!this.textures.exists(key)) {
        const tex = this.textures.createCanvas(key, VIEW_W, VIEW_H);
        const ctx = tex.getContext();
        ctx.save();
        ctx.translate(VIEW_W / 2, VIEW_H / 2);
        ctx.scale(1, VIEW_H / VIEW_W);
        const r = Math.hypot(VIEW_W / 2, VIEW_W / 2);
        const grad = ctx.createRadialGradient(0, 0, 0, 0, 0, r);
        grad.addColorStop(0, 'rgba(90,10,20,0)');
        grad.addColorStop(0.55, 'rgba(90,10,20,0)');
        grad.addColorStop(0.8, 'rgba(90,10,20,0.14)');
        grad.addColorStop(1, 'rgba(90,10,20,0.3)');
        ctx.fillStyle = grad;
        ctx.fillRect(-VIEW_W, -VIEW_W, VIEW_W * 2, VIEW_W * 2);
        ctx.restore();
        tex.refresh();
      }
      this.vigImg = this.add.image(0, 0, key).setOrigin(0).setDepth(-1).setAlpha(0).setVisible(false);
    }
    this.tweens.killTweensOf(this.vigImg);
    if (on) {
      this.vigImg.setVisible(true);
      this._tw({ targets: this.vigImg, alpha: 1, duration: 300, ease: 'Linear' });
    } else {
      this.vigImg.setAlpha(0).setVisible(false);
    }
  }

  // =============================================================================================
  // H3 relic row
  // =============================================================================================
  _buildRelics() {
    this.relicIcons = [];
    this.relicMore = txt(this, 150, 27, '', 'Tsmall').setVisible(false);
    this.relicFrame = this.add.graphics();
    this.cl.tl.c.add([this.relicMore, this.relicFrame]);
    this.relicFade = { rest: 0.5, wake: -1 };
    this.relicProc = new Map();          // relicId -> until (ms)
  }

  _setRelics() {
    for (const o of this.relicIcons) o.destroy();
    this.relicIcons = [];
    const list = this.run ? this.run.relics : [];
    list.slice(0, RELIC_MAX).forEach((id, i) => {
      const im = icon(this, RELIC_X + RELIC_DX * i + 8, RELIC_Y + 8, 'relics', id, 16);
      im.relicId = id;
      this.cl.tl.c.add(im);
      this.relicIcons.push(im);
    });
    const more = list.length - RELIC_MAX;
    this.relicMore.setVisible(more > 0);
    if (more > 0) this.relicMore.setText(`+${more}`);
  }

  _updateRelicAlpha(dt) {
    const base = this._c2Alpha(this.relicFade, dt);
    this.relicFrame.clear();
    for (let i = 0; i < this.relicIcons.length; i++) {
      const im = this.relicIcons[i];
      const until = this.relicProc.get(im.relicId) || 0;
      const proc = until > this.now;
      im.setAlpha(proc && !this.rm ? 1 : base);
      if (proc) this.relicFrame.lineStyle(1, C.text, 1).strokeRect(RELIC_X + RELIC_DX * i - 0.5, RELIC_Y - 0.5, 17, 17);
    }
    this.relicMore.setAlpha(base);
  }

  // =============================================================================================
  // H4 floor track · H5 boss bar
  // =============================================================================================
  _buildTrack() {
    this.trackLabel = txt(this, TRACK_LABEL_X, TOP_Y - 1, 'F1', 'T1', { origin: [1, 0] });
    this.pips = [];
    this.pipCurrent = hudImage(this, 0, PIP_Y - 1, 'pip_current_9').setVisible(false);
    this.cl.tc.c.add([this.trackLabel, this.pipCurrent]);
    this.visited = {};          // `${floor}:${step}` -> roomKind
    this.trackFade = this._fade([this.trackLabel, this.pipCurrent], 0.4);
  }

  _setTrack() {
    const r = this.run;
    const floor = r ? r.floor : 1;
    this.trackLabel.setText(t('hud.floor', { n: floor }));
    if (r && r.route) for (const e of r.route) if (e && e.roomKind != null) this.visited[`${e.floor}:${e.step}`] = e.roomKind;
    const fdef = this.cat && this.cat.floorList ? this.cat.floorList[floor - 1] : null;
    const n = fdef && fdef.steps ? fdef.steps.length : 10;
    for (const p of this.pips) p.destroy();
    this.pips = [];
    const step = r ? r.step : 0;
    for (let i = 0; i < n; i++) {
      const kind = i <= step ? this.visited[`${floor}:${i}`] : null;
      const name = kind ? PIP_FOR_KIND[kind] || 'pip_combat' : 'pip_future';
      const big = name === 'pip_boss_9';
      const im = hudImage(this, PIP_X + PIP_DX * i - (big ? 1 : 0), PIP_Y - (big ? 1 : 0), name);
      this.cl.tc.c.add(im);
      this.pips.push(im);
    }
    this.pipCurrent.moveBox(PIP_X + PIP_DX * Math.min(step, n - 1) - 1, PIP_Y - 1).setVisible(true);
    this.cl.tc.c.bringToTop(this.pipCurrent);
    this.trackFade.objs = [this.trackLabel, this.pipCurrent, ...this.pips];
    for (const o of this.trackFade.objs) o.setAlpha(this.trackFade.a);
  }

  _buildBoss() {
    const c = this.cl.boss.c;
    this.bossName = txt(this, VIEW_W / 2, 3, '', 'T1', { origin: [0.5, 0] });
    this.bossG = this.add.graphics();
    this.bossHatch = this.add.tileSprite(BOSS.x + 1, BOSS.y + 1, BOSS.w - 2, BOSS.h - 2, hudTex('hatch_4').key, hudTex('hatch_4').frame).setOrigin(0).setAlpha(0.55).setVisible(false);
    this.bossTicks = this.add.graphics();
    c.add([this.bossG, this.bossHatch, this.bossTicks, this.bossName]);
    this.boss = null;
  }

  _bossStart(d) {
    const def = this.cat && this.cat.bosses ? this.cat.bosses[d.id] : null;
    this.boss = {
      id: d.id, name: d.name || (def && def.name) || '', title: d.title || (def && def.title) || '',
      max: d.maxHp || d.hp || 1, hp: d.hp ?? d.maxHp ?? 1, fill: 0, chip: 0, lastHit: -1e9,
      thresholds: d.thresholds || (def && def.phases ? def.phases.map((p) => p.untilHpFrac) : []),
      phaseLabelUntil: 0, invulnMs: 0, flashUntil: 0, intro: 0, def,
    };
    const b = this.boss;
    this.bossName.setText(b.name);
    this.cl.boss.c.setVisible(true);
    this.cl.tc.c.setVisible(false);
    // phase ticks at each untilHpFrac (1×8, white with a dark outline)
    this.bossTicks.clear();
    for (const f of b.thresholds) {
      if (!(f > 0 && f < 1)) continue;
      const x = BOSS.x + 1 + Math.round((BOSS.w - 2) * f);
      this.bossTicks.fillStyle(C.stroke, 1).fillRect(x - 1, BOSS.y - 2, 3, 10).fillStyle(C.text, 1).fillRect(x, BOSS.y - 1, 1, 8);
    }
    // intro fill 0 → full over 600 ms Cubic.easeOut (RM: instant)
    const frac = b.hp / b.max;
    if (this.rm) { b.fill = b.chip = frac; this._drawBoss(); }
    else this._tw({ targets: b, fill: frac, chip: frac, duration: 600, ease: 'Cubic.easeOut', onUpdate: () => this._drawBoss() });
    this._drawBoss();
    // boss name card (H15) synced to the camera pan arrival (bossIntroPanMs / 2)
    this._banner({ kind: 'boss', text: b.name, sub: b.title, total: 1200, delay: Math.round(T('bossIntroPanMs') / 2), force: true });
  }

  _bossHp(hp, max) {
    const b = this.boss; if (!b) return;
    const prev = b.hp;
    b.hp = hp; b.max = max || b.max;
    const frac = Math.max(0, hp / b.max);
    this.tweens.killTweensOf(b);
    if (hp < prev) { b.chip = Math.max(b.chip, b.fill); b.lastHit = this.now; b.draining = false; }
    b.fill = frac;
    if (this.rm || hp >= prev) b.chip = Math.max(frac, hp >= prev ? frac : b.chip);
    if (this.rm) b.chip = frac;
    this._drawBoss();
  }

  _bossPhase(i) {
    const b = this.boss; if (!b) return;
    b.phaseLabelUntil = this.now + 2000;
    b.flashUntil = this.now + 33;                  // 2-frame frame flash (kept under RM; flash-scaled)
    this.bossName.setText(t('hud.phase', { name: b.name, n: (i | 0) + 1 }));
    const ph = b.def && b.def.phases && b.def.phases[i];
    const inv = ph && ph.onEnter && ph.onEnter.invulnMs;
    if (inv) b.invulnMs = inv;                      // hatched fill; counts down on the sim clock
    this._drawBoss();
  }

  _bossDead() {
    this.boss = null;
    this.cl.boss.c.setVisible(false);
    this.cl.tc.c.setVisible(true);
    this.bossHatch.setVisible(false);
    this._wake(this.trackFade, 3000);
  }

  _updateBoss(dt) {
    const b = this.boss; if (!b) return;
    let dirty = false;
    // chip holds 400 ms after the last hit, then drains to the fill over 250 ms Quad.easeIn
    if (b.chip > b.fill && !b.draining && this.now - b.lastHit >= 400) {
      b.draining = true;
      this._tw({ targets: b, chip: b.fill, duration: 250, ease: 'Quad.easeIn', onUpdate: () => this._drawBoss(), onComplete: () => { b.draining = false; } });
    }
    if (b.phaseLabelUntil && this.now >= b.phaseLabelUntil) { b.phaseLabelUntil = 0; this.bossName.setText(b.name); }
    if (b.flashUntil && this.now >= b.flashUntil) { b.flashUntil = 0; dirty = true; }
    if (b.invulnMs > 0 && this.simActive) { b.invulnMs = Math.max(0, b.invulnMs - dt); if (!b.invulnMs) dirty = true; }
    this.bossHatch.setVisible(b.invulnMs > 0);
    if (dirty) this._drawBoss();
  }

  _drawBoss() {
    const b = this.boss; if (!b) return;
    const g = this.bossG;
    const iw = BOSS.w - 2, ih = BOSS.h - 2;
    g.clear();
    const flash = b.flashUntil > this.now ? flashScale() : 0;
    g.fillStyle(C.stroke, 1).fillRect(BOSS.x - 1, BOSS.y - 1, BOSS.w + 2, BOSS.h + 2);
    g.fillStyle(flash > 0 ? C.text : C.slateLight, flash > 0 ? Math.max(0.35, flash) : 1).fillRect(BOSS.x, BOSS.y, BOSS.w, BOSS.h);
    g.fillStyle(C.panel, 1).fillRect(BOSS.x + 1, BOSS.y + 1, iw, ih);
    const fw = Math.round(iw * Math.max(0, Math.min(1, b.fill)));
    const cw = Math.round(iw * Math.max(0, Math.min(1, b.chip)));
    if (cw > fw) g.fillStyle(C.gold, 1).fillRect(BOSS.x + 1 + fw, BOSS.y + 1, cw - fw, ih);
    if (fw > 0) g.fillStyle(C.hpRed, 1).fillRect(BOSS.x + 1, BOSS.y + 1, fw, ih);
    this.bossHatch.width = Math.max(1, fw);
  }

  // =============================================================================================
  // H6 coins · H7 bag
  // =============================================================================================
  _buildTopRight() {
    const c = this.cl.tr.c;
    this.coinText = txt(this, RIGHT_X, TOP_Y - 1, '0', 'T1', { origin: [1, 0] });
    this.coinIcon = hudImage(this, 0, TOP_Y, 'coin_anim_f0');
    this.bagText = txt(this, RIGHT_X, 19, '0/12', 'T1', { origin: [1, 0] });
    this.bagIcon = hudImage(this, 0, 20, 'bag_8');
    this.bagWarn = hudImage(this, 0, 20, 'g_warn').setVisible(false);
    c.add([this.coinText, this.coinIcon, this.bagText, this.bagIcon, this.bagWarn]);
    this.coinFade = this._fade([this.coinText, this.coinIcon], 0.7);
    this.bagFade = this._fade([this.bagText, this.bagIcon, this.bagWarn], 0.7);
    this.lastBump = -1e9;
  }

  _setCoins(n, delta = 0, animate = true) {
    this.coinText.setText(String(n));
    const x = Math.round(RIGHT_X - this.coinText.width - 2 - 8);
    this.coinIcon.moveBox(x, TOP_Y);
    if (!animate) return;
    this._wake(this.coinFade, 2000);
    // hud-coins-bump: 1 px bob for 120 ms, coalesced to one per 120 ms (RM: none)
    if (delta > 0 && !this.rm && this.now - this.lastBump >= 120) {
      this.lastBump = this.now;
      this.coinIcon.moveBox(x, TOP_Y - 1);
      this.time.delayedCall(60, () => this.coinIcon.moveBox(Math.round(RIGHT_X - this.coinText.width - 10), TOP_Y));
    }
  }

  _setBag(animate = true) {
    const r = this.run; if (!r) return;
    const n = r.bagCount, cap = r.bag.length;
    const full = n >= cap;
    this.bagText.setText(full ? t('hud.bagFull') : `${n}/${cap}`);
    const x = Math.round(RIGHT_X - this.bagText.width - 2 - 8);
    this.bagIcon.moveBox(x, 20);
    const warn = full ? 'g_stop' : n >= cap - 1 ? 'g_warn' : null;
    this.bagWarn.setVisible(!!warn);
    if (warn) this.bagWarn.setGlyph(warn).moveBox(x - 11, 19);
    if (animate) this._wake(this.bagFade, 2000);
  }

  // =============================================================================================
  // H8 badges · H9 AUTO · H10 strip · H11 chevron · H12 recharge · H13 mana
  // =============================================================================================
  _buildWand() {
    const c = this.cl.bl.c;
    this.badges = [];                 // {frame, icon, overlay, keyGlyph, i}
    this.badgeLayer = this.add.container(0, 0);
    this.stripLayer = this.add.container(0, 0);
    this.stripOv = this.add.graphics();            // next frame + slashes + brighten
    this.chevron = hudImage(this, 0, CHEV_Y, 'g_chevron_5x3');
    this.rbar = this.add.graphics();
    this.manaG = this.add.graphics();
    this.manaHatch = this.add.tileSprite(MANA.x + 1, MANA.y + 1, MANA.w - 2, MANA.h - 2, hudTex('hatch_4').key, hudTex('hatch_4').frame).setOrigin(0).setAlpha(0.6).setVisible(false);
    this.manaText = txt(this, MANA.x + MANA.w + 3, MANA.y - 1, '', 'Tsmall');
    this.lockG = this.add.graphics();
    this.autoChip = this.add.container(AUTO_POS.x, AUTO_POS.y);
    const ag = this.add.graphics();
    const at = txt(this, 3, 1, t('hud.auto'), 'Tsmall');
    ag.fillStyle(C.stroke, 1).fillRect(0, 0, Math.ceil(at.width) + 6, 8).lineStyle(1, C.text, 1).strokeRect(0.5, 0.5, Math.ceil(at.width) + 5, 7);
    this.autoChip.add([ag, at]).setVisible(false);
    this.noSpells = txt(this, 0, STRIP_Y + 5, t('hud.noSpells'), 'Tsmall').setVisible(false);
    c.add([this.badgeLayer, this.stripLayer, this.stripOv, this.lockG, this.chevron, this.rbar, this.manaG, this.manaHatch, this.manaText, this.autoChip, this.noSpells]);

    this.mana = [];                   // per wand {v, max}
    this.rech = [];                   // per wand {total, left}
    this.drawn = new Set();           // drawn slot indices this cycle (active wand)
    this.slash = new Map();           // slot -> ms remaining (250)
    this.nextSlot = 0;
    this.cells = [];
    this.alwaysCells = [];
    this.lastCastAt = -1e9; this.castInterval = 1e9;
    this.manaFlash = 0; this.brighten = 0; this.lockMs = 0;
    this._manaShown = null;
    this.badgeFades = [];
  }

  get activeIdx() { return this.run ? this.run.activeWand : 0; }
  get stripX() { const nb = Math.max(3, this.run ? this.run.wandSlots : 3); return BADGE_X + BADGE_DX * nb + 4; }

  _setBadges() {
    for (const b of this.badges) b.c.destroy();
    this.badges = [];
    for (const f of this.badgeFades) { const i = this.fades.indexOf(f); if (i >= 0) this.fades.splice(i, 1); }
    this.badgeFades = [];
    const r = this.run; if (!r) return;
    const slots = Math.min(4, r.wandSlots || 3);
    const fam = this.router ? this.router.promptFamily : 'kbm';
    const pad = fam !== 'kbm';
    for (let i = 0; i < slots; i++) {
      const w = r.wands[i];
      const eq = i === r.activeWand;
      const c = this.add.container(BADGE_X + BADGE_DX * i, eq ? BADGE_UP : BADGE_Y);
      if (!w) { c.add(hudImage(this, 0, 0, 'badge_20_empty')); c.setAlpha(0.6); this.badgeLayer.add(c); this.badges.push({ c, i, empty: true }); continue; }
      const frame = hudImage(this, 0, 0, eq ? 'badge_20_equipped' : 'badge_20');
      const ic = icon(this, 10, 10, 'wands', w.id, 16);
      const ov = this.add.graphics();
      c.add([frame, ic, ov]);
      if (!pad) {
        const k = (this.router && this.router.kbm && (this.router.kbm[`wand${i + 1}`] || [])[0]) || `Digit${i + 1}`;
        c.add(txt(this, 2, 1, k.replace(/^Digit/, '').replace(/^Key/, ''), 'Tsmall'));
      }
      this.badgeLayer.add(c);
      const b = { c, i, frame, ov, eq };
      this.badges.push(b);
      if (!eq) { const f = this._fade([c], 0.7); this.badgeFades.push(f); b.fade = f; }
    }
    // pad cycle glyphs over the first and last badges (controller-prompts §4 G4, 8 px micro size):
    // "◂Y" / "RB▸" (Xbox) · "◂△" / "R1▸" (PS). Shoulders as Tsmall text, PS face buttons as the 5×5 symbol.
    if (pad && r.wands.length > 1) {
      const g = this.add.graphics();
      const last = BADGE_X + BADGE_DX * (r.wands.length - 1);
      g.fillStyle(C.text, 1).fillTriangle(BADGE_X, 326, BADGE_X + 3, 323, BADGE_X + 3, 329).fillTriangle(last + 20, 326, last + 17, 323, last + 17, 329);
      const bind = this.router.pad || {};
      const micro = (idx, x, right) => {
        const e = promptEntry(fam, idx);
        if (!e) return null;
        if (e.sym) { const sx = right ? x - 5 : x; g.fillStyle(C.stroke, 1).fillRect(sx - 1, 322, 7, 7); drawPsSymbol(g, sx, 323, e.sym); return null; }
        return txt(this, x, 322, e.text, 'Tsmall', right ? { origin: [1, 0] } : {});
      };
      const parts = [g, micro((bind.wandPrev || [3])[0], BADGE_X + 5, false), micro((bind.wandNext || [5])[0], last + 15, true)].filter(Boolean);
      const c = this.add.container(0, 0, parts);
      this.badgeLayer.add(c);
      this.badges.push({ c, i: -1, deco: true });
    }
    this._drawBadgeOverlays();
  }

  _drawBadgeOverlays() {
    for (const b of this.badges) {
      if (!b.ov) continue;
      b.ov.clear();
      const rc = this.rech[b.i];
      const left = rc && rc.total > 0 ? Math.max(0, Math.min(1, rc.left / rc.total)) : 0;
      if (left > 0) { const h = Math.round(16 * left); b.ov.fillStyle(C.stroke, 0.5).fillRect(2, 18 - h, 16, h); }
      const m = this.mana[b.i];
      if (m && m.max > 0) b.ov.fillStyle(C.mana, 1).fillRect(2, 17, Math.max(0, Math.round(16 * m.v / m.max)), 1);
    }
  }

  /** Rebuild the active wand's program strip (wand:changed / wand:active). Event-driven only. */
  _setStrip() {
    this.stripLayer.removeAll(true);
    this.cells = []; this.alwaysCells = [];
    const r = this.run; const w = r && r.wand;
    this.drawn.clear(); this.slash.clear();
    if (!w) return;
    const cards = this.cat ? this.cat.cards : {};
    let x = this.stripX;
    for (const id of w.def.alwaysCast || []) {
      const cell = cardCell(this, x, STRIP_Y, cards[id] || { id, type: 'projectile' }, 18, { virtual: true });
      this.stripLayer.add(cell); this.alwaysCells.push({ cell, x }); x += CELL_DX;
    }
    this.slotX0 = x;
    const slots = w.state.slots;
    const any = slots.some((s) => s != null);
    this.noSpells.setVisible(!any);
    if (!any) {
      const cell = cardCell(this, x, STRIP_Y, null, 18);
      this.stripLayer.add(cell); this.cells.push({ cell, x, empty: true });
      this.noSpells.setPosition(x + 22, STRIP_Y + 5);
    } else {
      slots.forEach((id, i) => {
        const cell = cardCell(this, x + CELL_DX * i, STRIP_Y, id ? cards[id] || { id, type: 'projectile' } : null, 18);
        this.stripLayer.add(cell); this.cells.push({ cell, x: x + CELL_DX * i, id });
      });
    }
    this.capW = CELL_DX * Math.max(1, slots.length) - 1;
    const st = w.state;
    this.nextSlot = st.order && st.order.length ? st.order[Math.min(st.cursor || 0, st.order.length - 1)] : slots.findIndex((s) => s != null);
    const rc = this.rech[r.activeWand];
    this._stripState(rc && rc.left > 0);
    this._placeChevron(false);
    this._drawMana();
  }

  _stripState(recharging) {
    for (let i = 0; i < this.cells.length; i++) {
      const c = this.cells[i];
      c.cell.setAlpha(recharging || this.drawn.has(i) ? 0.4 : 1);
    }
    this._drawStripOverlay();
  }

  _drawStripOverlay() {
    const g = this.stripOv;
    g.clear();
    const rc = this.rech[this.activeIdx];
    const recharging = rc && rc.left > 0;
    if (!recharging && this.cells[this.nextSlot] && !this.cells[this.nextSlot].empty) {
      const x = this.cells[this.nextSlot].x;
      g.lineStyle(1, C.gold, 1).strokeRect(x + 1.5, STRIP_Y + 1.5, 15, 15);
    }
    for (const [slot, ms] of this.slash) {
      const c = this.cells[slot]; if (!c) continue;
      const a = ms > 100 ? 1 : ms / 100;           // held 150, fades 100
      g.lineStyle(2, C.error, a).lineBetween(c.x + 1, STRIP_Y + 17, c.x + 17, STRIP_Y + 1);
    }
    if (this.brighten > 0 && this.brightenCells) {
      const k = 0.55 * flashScale();
      for (const i of this.brightenCells) { const c = this.cells[i]; if (c) g.fillStyle(0xffffff, k).fillRect(c.x + 1, STRIP_Y + 1, 16, 16); }
    }
  }

  _placeChevron(animate) {
    const rc = this.rech[this.activeIdx];
    const recharging = rc && rc.left > 0;
    const c = this.cells[this.nextSlot];
    const show = !recharging && c && !c.empty;
    this.chevron.setVisible(!!show);
    if (!show) return;
    const tx = c.x + 6;
    // hud-cast-cursor-advance: min(50, castDelay/2) Quad.easeOut; snaps above 10 casts/s and under RM.
    // The chevron tween is killed and restarted on every cast (no queueing).
    if (!animate || this.rm || this.castInterval < 100) { this._chevronTo(tx, 0); return; }
    this._chevronTo(tx, Math.min(50, this.castInterval / 2), 'Quad.easeOut');
  }

  /** The ONE chevron tween: any running one is stopped first so a stale tween can never land last. */
  _chevronTo(tx, ms, ease = 'Quad.easeOut', fromX = null) {
    if (this.chevTw) { this.chevTw.stop(); this.chevTw = null; }
    if (fromX != null) this.chevron.moveBox(Math.round(fromX), CHEV_Y);
    if (!ms) { this.chevron.moveBox(tx, CHEV_Y); return; }
    const o = { x: this.chevron.__bx };
    this.chevTw = this._tw({ targets: o, x: tx, duration: ms, ease, onUpdate: () => this.chevron.moveBox(Math.round(o.x), CHEV_Y), onComplete: () => { this.chevTw = null; } });
  }

  _onCast(d) {
    if (!d || !this.run) return;
    const wi = d.wand ?? this.activeIdx;
    if (wi !== this.activeIdx) return;
    this.castInterval = this.now - this.lastCastAt;
    this.lastCastAt = this.now;
    const fired = [];
    for (const s of d.drawnSlots || d.firedSlots || []) if (typeof s === 'number') { this.drawn.add(s); fired.push(s); }
    for (const s of d.skippedSlots || []) this.slash.set(s, 250);
    if (d.nextSlot != null) this.nextSlot = d.nextSlot;
    else if (d.cursor != null) { const st = this.run.wand.state; this.nextSlot = st.order ? st.order[d.cursor] ?? 0 : d.cursor; }
    // 1-step brighten of the fired cells, dropped above 8 casts/s (flash budget) and under RM
    if (!this.rm && this.castInterval >= 125 && fired.length) { this.brighten = 17; this.brightenCells = fired; }
    this._stripState(!!d.recharge);
    this._placeChevron(true);
    this._drawMana();
  }

  _onRechargeStart(i, ms) {
    this.rech[i] = { total: Math.max(1, ms || this.run.effectiveRecharge(i)), left: Math.max(1, ms || this.run.effectiveRecharge(i)) };
    if (i === this.activeIdx) { this._stripState(true); this._placeChevron(false); }
  }

  _onRecharge(i) {
    const was = this.rech[i] && this.rech[i].left > 0;
    this.rech[i] = { total: 0, left: 0 };
    const b = this.badges.find((x) => x.i === i);
    if (b && b.fade) this._wake(b.fade, 1000);
    this._drawBadgeOverlays();
    if (i !== this.activeIdx) return;
    this.drawn.clear();
    this.rbar.clear();
    const st = this.run.wand && this.run.wand.state;
    this.nextSlot = st && st.order && st.order.length ? st.order[0] : this.cells.findIndex((c) => c.id);
    // hud-wand-recharge complete: chevron to cell 1 (100 ms), cells to 100%, 1-frame brighten (RM: snap, no brighten)
    this._stripState(false);
    if (was && !this.rm) {
      this.brighten = 17; this.brightenCells = this.cells.map((_, k) => k);
      const c = this.cells[this.nextSlot];
      if (c) {
        this.chevron.setVisible(true);
        this._chevronTo(c.x + 6, 100, 'Cubic.easeInOut', this.slotX0 + this.capW - 5);
        return;
      }
    }
    this._placeChevron(false);
  }

  _drawRechargeBar() {
    const rc = this.rech[this.activeIdx];
    this.rbar.clear();
    if (!rc || rc.left <= 0 || !this.cells.length) return;
    const w = this.capW, x = this.slotX0;
    const p = 1 - rc.left / rc.total;
    this.rbar.fillStyle(C.panel, 1).fillRect(x, RBAR_Y, w, 2);
    this.rbar.fillStyle(C.dim, 1).fillRect(x, RBAR_Y, Math.round(w * p), 2);
  }

  _onMana(i, v, max) {
    this.mana[i] = { v, max };
    if (i === this.activeIdx) this._drawMana();
    this._badgesDirty = true;
  }

  _drawMana() {
    const r = this.run; if (!r || !r.wand) return;
    const i = r.activeWand;
    const m = this.mana[i] || { v: r.wand.state.mana, max: r.manaMax(i) };
    const g = this.manaG;
    g.clear();
    const flash = this.manaFlash > 0 ? flashScale() : 0;
    g.fillStyle(C.stroke, 1).fillRect(MANA.x, MANA.y, MANA.w, MANA.h);
    if (flash > 0) g.fillStyle(C.hpRed, flash).fillRect(MANA.x, MANA.y, MANA.w, MANA.h);
    g.fillStyle(C.panel, 1).fillRect(MANA.x + 1, MANA.y + 1, MANA.w - 2, MANA.h - 2);
    const fw = Math.round((MANA.w - 2) * Math.max(0, Math.min(1, m.v / (m.max || 1))));
    if (fw > 0) {
      g.fillStyle(C.mana, 1).fillRect(MANA.x + 1, MANA.y + 1, fw, MANA.h - 2);
      g.fillStyle(C.manaTop, 1).fillRect(MANA.x + 1, MANA.y + 1, fw, 1);
    }
    // low mana (< the next card's cost): hatched fill, not just recoloured
    const nextId = r.wand.state.slots[this.nextSlot];
    const cost = nextId && this.cat.cards[nextId] ? this.cat.cards[nextId].mana || 0 : 0;
    const low = cost > 0 && m.v < cost;
    this.manaHatch.setVisible(low && fw > 0);
    if (low) this.manaHatch.width = Math.max(1, fw);
    const shown = Math.floor(m.v);
    if (shown !== this._manaShown) { this._manaShown = shown; this.manaText.setText(String(shown)); }
  }

  _onSputter(d) {
    if (d && d.wand != null && d.wand !== this.activeIdx) return;
    this.manaFlash = this.sputterFlashMs;          // feel `sputterFlashMs`, flash-scaled
    this._drawMana();
  }

  _onWandActive(i) {
    const prev = this._eqPrev;
    this._eqPrev = i;
    this._setBadges();
    this._setStrip();
    for (const b of this.badges) if (b.fade && (b.i === prev)) this._wake(b.fade, 1000);
    // hud-wand-swap: badges translate 100 ms Back.easeOut, strip fades in 66 ms, lockout overlay wandSwapMs (kept under RM)
    if (prev != null && prev !== i && !this.rm) {
      const nb = this.badges.find((b) => b.i === i), pb = this.badges.find((b) => b.i === prev);
      if (nb) { nb.c.y = BADGE_Y; this._tw({ targets: nb.c, y: BADGE_UP, duration: 100, ease: 'Back.easeOut', onUpdate: () => { nb.c.y = Math.round(nb.c.y); } }); }
      if (pb) { pb.c.y = BADGE_UP; this._tw({ targets: pb.c, y: BADGE_Y, duration: 100, ease: 'Quad.easeOut', onUpdate: () => { pb.c.y = Math.round(pb.c.y); } }); }
      this.stripLayer.setAlpha(0);
      this._tw({ targets: this.stripLayer, alpha: 1, duration: 66, ease: 'Quad.easeOut' });
    }
    if (prev != null && prev !== i) this.lockMs = this.wandSwapMs;
  }

  _drawLock() {
    this.lockG.clear();
    if (this.lockMs <= 0 || !this.cells.length) return;
    const a = 0.5 * (this.lockMs / this.wandSwapMs);
    const x = this.slotX0, w = this.capW;
    this.lockG.fillStyle(C.stroke, a).fillRect(x, STRIP_Y, w, 18);
    this.lockG.lineStyle(1, C.disabled, a * 2);
    for (let k = -18; k < w; k += 4) this.lockG.lineBetween(x + Math.max(0, k), STRIP_Y + Math.max(0, -k) + 0, x + Math.min(w, k + 18), STRIP_Y + 18 - Math.max(0, k + 18 - w));
  }

  // =============================================================================================
  // H15 banners · hurt flash
  // =============================================================================================
  _buildBanners() {
    this.bannerQ = [];
    this.banner = null;
  }

  _banner(b) { this.bannerQ.push(b); }

  _updateBanners(dt) {
    if (this.banner || !this.bannerQ.length || this._modal()) return;
    const sim = this._sim();
    const probe = sim && typeof sim.hudProbe === 'function' && sim.sys.isActive() ? sim.hudProbe() : null;
    const b = this.bannerQ[0];
    if (!b.force && probe && probe.room && probe.room.inCombat) return;     // never during active combat
    if (b.delay > 0) { if (this.simActive) b.delay -= dt; return; }
    this.bannerQ.shift();
    this._showBanner(b);
  }

  _showBanner(b) {
    const c = this.add.container(VIEW_W / 2, 70).setDepth(40);
    let main;
    if (b.kind === 'floor') { main = txt(this, 0, 0, b.text, 'display', { origin: [0.5, 0] }); }
    else main = txt(this, 0, 0, b.text, 'T2', { origin: [0.5, 0] });
    c.add(main);
    if (b.sub) c.add(txt(this, 0, Math.ceil(main.height * (main.scaleY || 1)) + 2, b.sub, 'T1', { origin: [0.5, 0], color: C.dim }));
    this.banner = c;
    const rm = this.rm;
    const end = () => { c.destroy(); this.banner = null; };
    c.setAlpha(0);
    const X0 = VIEW_W / 2, Y0 = 70;
    const R = (o) => ({ ...o, onUpdate: () => { c.x = Math.round(c.x); c.y = Math.round(c.y); } });
    if (b.kind === 'cleared') {           // banner-room-cleared: punch 160 / hold 840 / dissipate 200
      if (rm) this.tweens.chain({ targets: c, tweens: [{ alpha: 1, duration: 160 }, { alpha: 0, duration: 200, delay: 840 }], onComplete: end });
      else { c.y = Y0 - 6; this.tweens.chain({ targets: c, tweens: [R({ y: Y0, alpha: 1, duration: 160, ease: 'Back.easeOut' }), R({ y: Y0 - 4, alpha: 0, duration: 200, delay: 840, ease: 'Quad.easeIn' })], onComplete: end }); }
    } else if (b.kind === 'floor') {      // banner-floor-title: enter 250 / hold 1300 / exit 250
      if (rm) this.tweens.chain({ targets: c, tweens: [{ alpha: 1, duration: 250 }, { alpha: 0, duration: 250, delay: 1300 }], onComplete: end });
      else { c.y = Y0 + 4; this.tweens.chain({ targets: c, tweens: [R({ y: Y0, alpha: 1, duration: 250, ease: 'Cubic.easeOut' }), { alpha: 0, duration: 250, delay: 1300, ease: 'Quad.easeIn' }], onComplete: end }); }
    } else {                              // boss-name-card: enter 200 / hold 800 / exit 200
      if (rm) this.tweens.chain({ targets: c, tweens: [{ alpha: 1, duration: 200 }, { alpha: 0, duration: 200, delay: 800 }], onComplete: end });
      else { c.x = X0 - 24; this.tweens.chain({ targets: c, tweens: [R({ x: X0, alpha: 1, duration: 200, ease: 'Cubic.easeOut' }), R({ x: X0 + 24, alpha: 0, duration: 200, delay: 800, ease: 'Quad.easeIn' })], onComplete: end }); }
    }
  }

  /** Red SCREEN-EDGE flash of `hurtFlashMs`, flash-scaled (accessibility-spec §4.3: no full-screen flash). */
  _buildHurtEdges() {
    const g = this.hurtG = this.add.graphics().setDepth(45).setVisible(false);
    const band = (k, a) => {
      g.fillStyle(C.hpRed, a);
      g.fillRect(k, k, VIEW_W - 2 * k, 3).fillRect(k, VIEW_H - k - 3, VIEW_W - 2 * k, 3);
      g.fillRect(k, k + 3, 3, VIEW_H - 2 * k - 6).fillRect(VIEW_W - k - 3, k + 3, 3, VIEW_H - 2 * k - 6);
    };
    band(0, 0.6); band(3, 0.35); band(6, 0.15);     // 9 px border ≈ 7.6% of the canvas (< the 25% large-flash area)
    this.hurtMs = 0;
  }

  _hurt() {
    const k = flashScale();
    if (k <= 0) return;
    this.hurtMs = this.hurtFlashMs;
    this.hurtG.setVisible(true).setAlpha(k);
  }

  // =============================================================================================
  // bus wiring
  // =============================================================================================
  _listen() {
    const on = (e, fn) => listen(this, this.bus, e, fn);
    on(EV.PLAYER_HP, (hp, max) => this._setHp(hp, max));
    on(EV.PLAYER_SHIELD, (n) => this._setShield(n));
    on(EV.PLAYER_HURT, (d) => { this._hurt(); if (d && d.shieldBroke) this._setShield(0); });
    on(EV.LOW_HP, (active) => this._setLowHp(!!active));
    on(EV.PLAYER_GOLD, (coins, delta) => this._setCoins(coins, delta));
    on(EV.BAG_CHANGED, () => this._setBag());
    on(EV.CARD_GAINED, (id) => this._cardGained(id));
    on(EV.REWARD_PICKED, (id) => { this._lastPicked = { id, at: this.now }; });
    on(EV.CARD_OVERFLOW, () => this._bagFullToast());
    on(EV.RELIC_GAINED, (id) => {
      this._setRelics(); this._wake(this.relicFade, 3000);
      const r = this.cat.relics[id];
      if (r) this.toasts.push({ key: `relic:${id}:${this.now}`, text: t('toast.relic', { name: r.name, desc: r.desc }), icon: { kind: 'relics', id } });
    });
    on(EV.RELIC_TRIGGERED, (id) => { this.relicProc.set(id, this.now + 600); this._wake(this.relicFade, 600); });
    on(EV.ROOM_ENTER, (d) => {
      if (d && d.kind != null) this.visited[`${d.floor ?? this.run.floor}:${d.step ?? this.run.step}`] = d.kind;
      this._setTrack(); this._wake(this.trackFade, 3000);
      this.bannerQ = this.bannerQ.filter((b) => b.kind !== 'cleared');
    });
    on(EV.ROOM_CLEARED, () => { this._setTrack(); this._wake(this.trackFade, 3000); this._banner({ kind: 'cleared', text: t('hud.roomCleared') }); });
    on(EV.FLOOR_ENTER, (d) => {
      const f = (d && d.floor) || (this.run && this.run.floor) || 1;
      const name = (d && d.name) || (this.cat.floorList[f - 1] || {}).name || '';
      this._setTrack();
      this._banner({ kind: 'floor', text: t('hud.floorTitle', { n: f, name }) });
    });
    on(EV.BOSS_START, (d) => this._bossStart(d || {}));
    on(EV.BOSS_HP, (hp, max) => this._bossHp(hp, max));
    on(EV.BOSS_PHASE, (i) => this._bossPhase(i));
    on(EV.BOSS_DEAD, () => this._bossDead());
    on(EV.WAND_CAST, (d) => this._onCast(d));
    on(EV.WAND_SPUTTER, (d) => this._onSputter(d));
    on(EV.WAND_RECHARGE_START, (i, ms) => this._onRechargeStart(i, ms));
    on(EV.WAND_RECHARGE, (i) => this._onRecharge(i));
    on(EV.WAND_CHANGED, () => { this._setBadges(); this._setStrip(); });
    on(EV.WAND_ACTIVE, (i) => this._onWandActive(i));
    on(EV.PLAYER_MANA, (i, v, max) => this._onMana(i, v, max));
    on(EV.TOAST, (d) => { if (d) this.toasts.push(d); });
    on(EV.INPUT_DEVICE, () => { this._setBadges(); this.toasts.refreshGlyphs(); });
    on(EV.SETTINGS_CHANGED, (k) => { if (k === 'reducedMotion' || k === 'flashIntensity') { this._lowHpDirty = true; this._setLowHp(this.lowHp); } });
    on(EV.RUN_END, () => { this._setLowHp(false); });
  }

  _cardGained(id) {
    // A card that reaches the bag OUTSIDE a draft (shop purchase, treasure bonus) earns a toast (hud-layout §5).
    const at = this.now;
    this.time.delayedCall(0, () => {
      if (this._lastPicked && this._lastPicked.id === id && Math.abs(this._lastPicked.at - at) < 100) return;
      const c = this.cat.cards[id]; if (!c) return;
      this.toasts.push({ make: () => t('toast.cardAdded', { name: c.name }), icon: { kind: c.type === 'projectile' ? 'spells' : 'modifiers', id } });
    });
  }

  _bagFullToast() {
    if (this.now - (this._bagToastAt ?? -1e9) < 10000) return;       // rate-limited to 1 per 10 s
    this._bagToastAt = this.now;
    this.toasts.push({ key: 'bagfull', make: () => t('toast.bagFull'), icon: { glyph: 'g_stop' } });
  }

  _syncAll() {
    const r = this.run;
    if (!r) return;
    this._eqPrev = r.activeWand;
    this._setHp(r.hp, r.maxHp, false);
    this._setShield(r.shield, false);
    this._setRelics();
    this._setTrack();
    this._setCoins(r.coins, 0, false);
    this._setBag(false);
    r.wands.forEach((w, i) => { this.mana[i] = { v: w.state.mana, max: r.manaMax(i) }; if (w.state.rechargeTimerMs > 0) this.rech[i] = { total: r.effectiveRecharge(i), left: w.state.rechargeTimerMs }; });
    this._setBadges();
    this._setStrip();
  }

  // =============================================================================================
  // per-frame: fades, occlusion, sim-clock timers, toasts, banners, cursor
  // =============================================================================================
  _c2Alpha(f, dt) {
    const target = this.now < f.wake ? 1 : f.rest;
    const cur = f.a ?? f.rest;
    const step = this.rm ? 1 : dt / 150;                              // 150 ms linear (RM: instant)
    f.a = cur < target ? Math.min(target, cur + step) : Math.max(target, cur - step);
    return f.a;
  }

  update(time, delta) {
    const dt = Math.min(100, delta);
    this.now += dt;
    this.simActive = this._simRunning();
    const modal = this._modal();

    // pause close wakes the floor track (hud-layout §3.1)
    const top = this.flow ? this.flow.top() : null;
    if (this._lastTop === 'pause' && !top) this._wake(this.trackFade, 3000);
    this._lastTop = top;

    for (const f of this.fades) { const a = this._c2Alpha(f, dt); for (const o of f.objs) if (o.alpha !== a) o.setAlpha(a); }
    this._updateRelicAlpha(dt);

    // sim-clock timers (frozen by hit-stop / modals): recharge, lockout, invulnerability
    if (this.simActive) {
      let any = false;
      for (let i = 0; i < this.rech.length; i++) { const rc = this.rech[i]; if (rc && rc.left > 0) { rc.left = Math.max(0, rc.left - dt); any = true; } }
      if (any || this._badgesDirty) { this._drawBadgeOverlays(); this._badgesDirty = false; }
      if (any) this._drawRechargeBar();
      if (this.lockMs > 0) { this.lockMs = Math.max(0, this.lockMs - dt); this._drawLock(); }
    } else if (this._badgesDirty) { this._drawBadgeOverlays(); this._badgesDirty = false; }

    // HUD-clock transients
    if (this.slash.size) { for (const [k, ms] of this.slash) { if (ms - dt <= 0) this.slash.delete(k); else this.slash.set(k, ms - dt); } this._drawStripOverlay(); }
    if (this.brighten > 0) { this.brighten -= dt; if (this.brighten <= 0) this.brightenCells = null; this._drawStripOverlay(); }
    if (this.manaFlash > 0) { this.manaFlash = Math.max(0, this.manaFlash - dt); this._drawMana(); }
    if (this.hurtMs > 0) {
      this.hurtMs = Math.max(0, this.hurtMs - dt);
      this.hurtG.setAlpha(flashScale() * (this.hurtMs / this.hurtFlashMs));
      if (!this.hurtMs) this.hurtG.setVisible(false);
    }
    this._updateBoss(dt);

    // H9 toggle-cast indicator (input state; changes only on a latch toggle)
    const auto = Save.settings.castMode === 'toggle' && !!(this.router && this.router.castLatch);
    if (auto !== this.autoChip.visible) this.autoChip.setVisible(auto);

    this._occlusion(dt);
    this.toasts.update(dt);
    this._updateBanners(dt);
    this._cursor(modal);
  }

  /** hud-layout §3.2: player body (probe) or sim-reported hostile overlap → cluster to 30% in 100 ms; back 300 ms after clear. */
  _occlusion(dt) {
    const sim = this._sim();
    const probe = sim && typeof sim.hudProbe === 'function' && sim.sys.isActive() ? sim.hudProbe() : null;
    let px0 = -1e9, py0 = -1e9, px1 = -1e9, py1 = -1e9;
    if (probe && probe.player && probe.camera) {
      const sx = probe.player.x - probe.camera.scrollX, sy = probe.player.y - probe.camera.scrollY;
      px0 = sx - 7; px1 = sx + 7; py0 = sy - 18; py1 = sy;
    }
    const mask = probe && probe.hudOcclusion | 0;          // optional sim bitmask: 1 tl, 2 tc, 4 tr, 8 bl
    const bits = { tl: 1, tc: 2, tr: 4, bl: 8, boss: 2 };
    for (const k of ['tl', 'tc', 'tr', 'bl', 'boss']) {
      const cl = this.cl[k];
      let r = k === 'boss' ? BOSS_CLUSTER : CLUSTER[k];
      if (k === 'bl' && this.cells.length) r = [6, 314, Math.max(264, this.slotX0 + this.capW - 6), 40];
      const hit = !!(mask & bits[k]) || (px1 >= r[0] - 4 && px0 <= r[0] + r[2] + 4 && py1 >= r[1] - 4 && py0 <= r[1] + r[3] + 4);
      if (hit) { cl.occ = true; cl.clearAt = -1; }
      else if (cl.occ) { if (cl.clearAt < 0) cl.clearAt = this.now; if (this.now - cl.clearAt >= 300) cl.occ = false; }
      const target = cl.occ ? 0.3 : 1;
      if (cl.a !== target) {
        const step = this.rm ? 1 : dt / 100 * 0.7;
        cl.a = cl.a < target ? Math.min(target, cl.a + step) : Math.max(target, cl.a - step);
        cl.c.setAlpha(cl.a);
      }
    }
  }

  /** The reticle replaces the OS cursor on the canvas while the run is unpaused; it returns in every modal. */
  _cursor(modal) {
    const sm = this.scene;
    const inRun = sm.isActive(this.simKey) || sm.isPaused(this.simKey);
    const want = !modal && inRun && this.router && this.router.device !== 'pad' ? 'none' : '';
    const cv = this.game.canvas;
    if (cv && cv.style.cursor !== want) cv.style.cursor = want;
  }

  _shutdown() {
    if (this.game && this.game.canvas) this.game.canvas.style.cursor = '';
    if (this.toasts) this.toasts.destroy();
    this.fades.length = 0;
  }
}
