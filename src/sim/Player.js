// sim/Player.js — mechanic-spec §2 + feel-spec §move/§dash/§hurt + state-graph-spec §2 (player-body and
// player-wand graphs, run in parallel). Physics is a bare Arcade body (circle, feel `playerBodyRadius`) that
// collides with the room's `ground` layer; the sprite is presentation, placed at the feet (R7 anchors).
//
// Anchors (R7): feet = body centre + (0, BODY_TO_FEET); core (hurtbox centre, shots, muzzle) = feet − (0, 8).

import Phaser from '../../lib/phaser.esm.min.js';
import { DEPTH } from '../config.js';
import { EV } from '../core/ev.js';
import { Art } from '../core/art.js';
import { Save } from '../core/save.js';

const BODY_TO_FEET = 4;
const DEG = Math.PI / 180;
const ELEMENT_TINT = { arcane: 0xcfc0ff, fire: 0xee8e2e, frost: 0xcae6f5, shock: 0xfacb3e, poison: 0x97da3f };

export class Player {
  constructor(ctx, x, y) {
    this.ctx = ctx;
    const s = this.scene = ctx.scene;
    const T = ctx.T;
    this.r = T('playerBodyRadius');
    this.hurtR = T('playerHurtboxRadius');
    this.body = s.physics.add.body(x - this.r, y - this.r, this.r * 2, this.r * 2);
    this.body.setCircle(this.r);
    this.body.setCollideWorldBounds(false);
    this.alive = true;
    this.vx = 0; this.vy = 0;
    this.aimX = 1; this.aimY = 0;
    this.iframesMs = 0; this.dashIframesMs = 0;
    this.dashMs = 0; this.dashDirX = 0; this.dashDirY = 0; this.dashT = 0; this.afterimagesDone = 0;
    this.dashBufferMs = 0;
    this.dashMax = ctx.run.dashChargesMax(T('dashChargesBase'));
    this.dashCharges = this.dashMax;
    this.dashRefillMs = 0;
    this.slowMs = 0;
    this.movedMs = 0;
    this.lowHp = false;
    this.controllable = true;
    // presentation state
    this.bodyState = 'spawn'; this.bodyStateMs = 0;
    this.wandState = 'ready'; this.wandStateMs = 0;
    this.kickMs = 0; this.kickX = 0; this.kickY = 0;
    this.muzzleMs = 0; this.muzzleColor = 0xffffff;
    this.facing = 1;
    this.hurtPoseMs = 0;
    this._buildView();
  }

  get T() { return this.ctx.T; }
  get x() { return this.body.center.x; }
  get y() { return this.body.center.y; }
  get feetX() { return this.body.center.x; }
  get feetY() { return this.body.center.y + BODY_TO_FEET; }
  get coreX() { return this.body.center.x; }
  get coreY() { return this.body.center.y + BODY_TO_FEET - 8; }
  get isDashing() { return this.dashMs > 0; }
  get isAirborne() { return false; }
  get speed() { return Math.hypot(this.body.velocity.x, this.body.velocity.y); }
  canBeHit() { return this.alive && this.iframesMs <= 0 && this.dashIframesMs <= 0; }

  setPosition(x, y) { this.body.reset(x - this.r, y - this.r); }
  teleport(x, y) { this.setPosition(x, y); this.syncView(); }

  // =================================================================== simulation (one fixed step)
  step(it, dt) {
    const T = this.T, run = this.ctx.run;
    this.dashMax = run.dashChargesMax(T('dashChargesBase'));
    if (this.iframesMs > 0) this.iframesMs = Math.max(0, this.iframesMs - dt);
    if (this.dashIframesMs > 0) this.dashIframesMs = Math.max(0, this.dashIframesMs - dt);
    if (this.slowMs > 0) { this.slowMs -= dt; if (this.slowMs <= 0) { this.slowMs = 0; this.ctx.bus.emit(EV.PLAYER_SLOW, false); } }
    if (!this.alive) { this.body.setVelocity(0, 0); return; }

    // aim (pad assist is applied by RunScene before this step)
    this.aimX = it.aimX; this.aimY = it.aimY;
    const ctrl = this.controllable;

    // dash charges refill one at a time, dashCooldownMs after the dash ends
    if (this.dashCharges < this.dashMax && this.dashMs <= 0) {
      this.dashRefillMs -= dt;
      if (this.dashRefillMs <= 0) { this.dashCharges++; this.dashRefillMs = this.dashCharges < this.dashMax ? T('dashCooldownMs') : 0; this._emitDash(); }
    }
    // dash input (buffered)
    const padBonus = it.device === 'pad' ? T('padBufferBonusMs') : 0;
    if (ctrl && it.dashPressed) this.dashBufferMs = T('dashBufferMs') + padBonus;
    if (this.dashBufferMs > 0) {
      if (this.dashMs <= 0 && this.dashCharges > 0 && ctrl) { this._startDash(it); this.dashBufferMs = 0; }
      else this.dashBufferMs -= dt;
    }

    if (this.dashMs > 0) {
      this.dashMs -= dt; this.dashT += dt;
      // afterimages at k·dashDurationMs/N
      const N = T('dashAfterimages');
      while (this.afterimagesDone < N && this.dashT >= (this.afterimagesDone * T('dashDurationMs')) / N) {
        this.ctx.fx.afterimage(this.sprite, { tint: 0x5698cc, alpha: T('dashAfterimageAlpha'), fadeMs: T('dashAfterimageFadeMs') });
        this.afterimagesDone++;
      }
      this.body.setVelocity(this.dashDirX * T('dashSpeed'), this.dashDirY * T('dashSpeed'));
      if (this.dashMs <= 0) {
        this.dashMs = 0;
        const exit = T('moveSpeed') * T('dashExitVelocityFrac');
        this.body.setVelocity(this.dashDirX * exit, this.dashDirY * exit);
        if (this.dashCharges < this.dashMax && this.dashRefillMs <= 0) this.dashRefillMs = T('dashCooldownMs');
        this._setBody(this.speed >= T('runEnterSpeed') ? 'run' : 'idle');
      }
      return;
    }

    // movement: velocity moves toward target by ≤ accel·dt (speeding up) or decel·dt (slowing/stopping)
    let mx = ctrl ? it.moveX : 0, my = ctrl ? it.moveY : 0;
    const mag = Math.hypot(mx, my);
    const pm = run.playerMods;
    let spd = T('moveSpeed') * pm.moveSpeedMult * (it.castHeld && ctrl ? T('castMoveMult') : 1) * (this.slowMs > 0 ? 1 - run.statusTable.status.playerSlow.slowFrac : 1);
    const tx = mx * spd, ty = my * spd;
    const v = this.body.velocity;
    const cur = Math.hypot(v.x, v.y), tgt = Math.hypot(tx, ty);
    const rate = (tgt >= cur ? T('moveAccel') : T('moveDecel')) * (dt / 1000);
    const dx = tx - v.x, dy = ty - v.y, dl = Math.hypot(dx, dy);
    if (dl <= rate || dl < 1e-6) this.body.setVelocity(tx, ty);
    else this.body.setVelocity(v.x + (dx / dl) * rate, v.y + (dy / dl) * rate);
    if (mag > 0.2) {
      this.movedMs += dt;
      if (!this._movedEmitted) { this._movedEmitted = true; this.ctx.bus.emit(EV.PLAYER_MOVED); }
    }
    // body graph (hysteresis)
    const sp = this.speed;
    if (this.bodyState === 'hurt') { this.hurtPoseMs -= dt; if (this.hurtPoseMs <= 0) this._setBody(sp >= T('runEnterSpeed') ? 'run' : 'idle'); }
    else if (this.bodyState === 'idle' && sp >= T('runEnterSpeed')) this._setBody('run');
    else if (this.bodyState === 'run' && sp < T('runExitSpeed')) this._setBody('idle');
  }

  _startDash(it) {
    const T = this.T;
    let dx = it.moveX, dy = it.moveY;
    const m = Math.hypot(dx, dy);
    if (m < 0.2) { dx = it.aimX; dy = it.aimY; } else { dx /= m; dy /= m; }   // direction = move input, else aim
    this.dashDirX = dx; this.dashDirY = dy;
    this.dashMs = T('dashDurationMs'); this.dashT = 0; this.afterimagesDone = 0;
    this.dashIframesMs = T('dashIframesMs');
    this.dashCharges--;
    this._emitDash();
    this._setBody('dash');
    this.ctx.fx.particles('dust', this.feetX, this.feetY, 4, { dir: Math.atan2(-dy, -dx), spread: 0.5, speed: 35 });
    this.ctx.mixer.fire('dash');
    this.ctx.bus.emit(EV.PLAYER_DASHED);
    Save.setFlag('dash');
    this.ctx.relics.onEvent('dash_start', { x: this.x, y: this.y });
  }
  _emitDash() { this.ctx.bus.emit(EV.PLAYER_DASH, this.dashCharges, this.dashMax, this.dashRefillMs > 0 ? 1 - this.dashRefillMs / this.T('dashCooldownMs') : 1); }
  get dashRefillFrac() { return this.dashCharges >= this.dashMax ? 1 : 1 - Math.max(0, this.dashRefillMs) / this.T('dashCooldownMs'); }

  applySlow(ms) {
    if (!this.alive) return;
    if (this.slowMs <= 0) this.ctx.bus.emit(EV.PLAYER_SLOW, true);
    this.slowMs = Math.max(this.slowMs, ms);
  }

  knock(ix, iy) { if (this.alive && this.dashMs <= 0) this.body.setVelocity(this.body.velocity.x + ix, this.body.velocity.y + iy); }

  /**
   * Hurt resolution (mechanic-spec §2) for one damage instance. @returns {boolean} true if it landed.
   * source: { kind, enemyId, x, y }
   */
  hurt(damage, source = {}) {
    if (!this.canBeHit() || damage <= 0) return false;
    const T = this.T, run = this.ctx.run, fx = this.ctx.fx;
    const sx = source.x ?? this.x, sy = source.y ?? this.y - 1;
    const kx = this.x - sx, ky = this.y - sy, kl = Math.hypot(kx, ky) || 1;
    this.iframesMs = T('hurtIframesMs');
    if (run.shield > 0) {
      run.setShield(run.shield - 1);
      fx.hitstop(T('shieldBreakHitstopMs'));
      fx.flipbook('fx.freeze_shatter', this.coreX, this.coreY, {});
      fx.particles('shard', this.coreX, this.coreY, 6, { color: 0x72d6ce, speed: 70 });
      this.ctx.mixer.fire('shield_break');
      this.ctx.bus.emit(EV.PLAYER_HURT, { damage: 0, source, shieldBroke: true });
      return true;
    }
    const dead = run.damage(damage);
    this.ctx.bus.emit(EV.DAMAGE_NUMBER, { x: this.coreX, y: this.coreY - 14, amount: damage, crit: false, element: null, target: 'player' });
    if (dead) {
      const revived = this.ctx.relics.onEvent('lethal', { x: this.x, y: this.y });
      if (revived && run.hp > 0) {
        this.iframesMs = T('hurtIframesMs');
        fx.hitstop(T('hurtHitstopMs'));
        fx.particles('ember', this.coreX, this.coreY, 12, { color: 0xfacb3e, speed: 60 });
        this.ctx.mixer.fire('revive');
        this._setBody('hurt', 0xfacb3e);
        this.ctx.bus.emit(EV.PLAYER_HURT, { damage, source, revived: true });
        return true;
      }
      run.stats.killer = source.enemyId || null;
      this._die(kx / kl);
      return true;
    }
    fx.hitstop(T('hurtHitstopMs'));
    fx.shake(T('hurtShakePx'), T('hurtShakeMs'));
    this.body.setVelocity((kx / kl) * T('hurtKnockback'), (ky / kl) * T('hurtKnockback'));
    this._setBody('hurt');
    this.ctx.mixer.fire('player_hurt');
    this.ctx.bus.emit(EV.PLAYER_HURT, { damage, source, shieldBroke: false });
    this.ctx.relics.onEvent('hurt', { x: this.x, y: this.y });
    const low = run.hp <= 2;
    if (low !== this.lowHp) { this.lowHp = low; this.ctx.bus.emit(EV.LOW_HP, low); if (low) this.ctx.mixer.fire('low_hp'); }
    return true;
  }

  _die(side) {
    this.alive = false;
    this.body.setVelocity(0, 0);
    this.body.enable = false;
    this.ctx.flags.lethalOccurred = true;
    this._setBody('dead');
    this._setWand('hidden');
    this.ctx.fx.hitstop(this.T('hurtHitstopMs'));
    this.ctx.mixer.fire('player_death');
    this.deathSide = side >= 0 ? 1 : -1;
  }

  // =================================================================== presentation
  _skin() { return (this.ctx.cat.loadouts[this.ctx.run.loadoutId] && ({ apprentice: 'm', stormcaller: 'm', pyromancer: 'f', hexer: 'f' })[this.ctx.run.loadoutId]) || 'm'; }

  _buildView() {
    const s = this.scene;
    const sh = Art.getQuiet('authored.shadow_10x3');
    this.shadow = (sh ? s.add.image(0, 0, sh.key, sh.frame) : s.add.image(0, 0, 'ph-shadow-10')).setDepth(DEPTH.shadows).setOrigin(0.5, 0.5);
    const a = Art.getQuiet(`player.wizzard_${this._skin()}.idle`, 0);
    this.sprite = a ? s.add.sprite(0, 0, a.key, a.frame) : s.add.sprite(0, 0, 'ph-player');
    this.sprite.setOrigin(0.5, 1);
    this.animKeys = this._makeAnims();
    this.wand = s.add.image(0, 0, 'ph-wand').setOrigin(0.5, 1);
    this._wandSkin();
    const g16 = Art.getQuiet('authored.glow_16');
    const glow = (x) => (g16 ? s.add.image(0, 0, g16.key, g16.frame) : s.add.image(0, 0, 'ph-glow'));
    this.tip = glow().setBlendMode(Phaser.BlendModes.ADD).setDepth(DEPTH.projectilesAdd).setScale(0.5).setAlpha(0.35);
    this.muzzle = glow().setBlendMode(Phaser.BlendModes.ADD).setDepth(DEPTH.projectilesAdd).setVisible(false);
    // shield: 8_protectioncircle loop (TA `fx_shield`), tint #72d6ce α 0.35, ADD (codemanu greyscale-baked)
    const shA = Art.getQuiet('player.shield_overlay', 0);
    this.shieldFx = (shA ? s.add.sprite(0, 0, shA.key, shA.frame) : s.add.sprite(0, 0, 'ph-ring')).setDepth(DEPTH.fx).setAlpha(0.35).setTint(0x72d6ce).setVisible(false);
    if (shA) this.shieldFx.setBlendMode(Phaser.BlendModes.ADD);
    if (shA && s.anims.exists('fx_shield')) this.shieldFx.play('fx_shield');
    this._setBody('spawn');
    this.syncView();
  }

  /** Player clips (state-graph §2.1): created once from TA frames if present. */
  _makeAnims() {
    const anims = this.scene.anims, skin = this._skin();
    const keys = {};
    // TA animation-export clips (assets/ATLAS-KEYS.md): player_idle_m / player_run_m … per skin
    if (anims.exists(`player_idle_${skin}`)) {
      keys.idle = `player_idle_${skin}`; keys.run = `player_run_${skin}`;
      anims.get(keys.idle).frameRate = this.T('playerIdleFps'); anims.get(keys.run).frameRate = this.T('playerRunFps');
      keys.hit = Art.getQuiet(`player.wizzard_${skin}.hit`, 0); keys.dash = Art.getQuiet(`player.wizzard_${skin}.run`, 2);
      return keys;
    }
    for (const [clip, fpsKey] of [['idle', 'playerIdleFps'], ['run', 'playerRunFps']]) {
      const id = `player.wizzard_${skin}.${clip}`;
      const n = Art.count(id);
      const key = `player_${clip}_${skin}`;
      const fps = this.T(fpsKey);
      if (n && !anims.exists(key)) {
        anims.create({ key, frames: Array.from({ length: n }, (_, i) => { const a = Art.get(id, i); return { key: a.key, frame: a.frame }; }), frameRate: fps, repeat: -1 });
      }
      keys[clip] = n ? key : null;
    }
    const hit = Art.getQuiet(`player.wizzard_${skin}.hit`, 0);
    const dash = Art.getQuiet(`player.wizzard_${skin}.run`, 2);
    keys.hit = hit; keys.dash = dash;
    return keys;
  }

  _wandSkin() {
    const wid = this.ctx.run.wand ? this.ctx.run.wand.id : 'apprentice_wand';
    if (!Art.apply(this.wand, `wands.${wid}.held`, 0)) this.wand.setTexture('ph-wand');
  }

  _setBody(state, tint) {
    const prev = this.bodyState;
    this.bodyState = state; this.bodyStateMs = 0;
    const sp = this.sprite, k = this.animKeys;
    sp.anims.timeScale = 1;
    if (state === 'idle' && k.idle) sp.play(k.idle, true);
    else if (state === 'run' && k.run) { if (prev !== 'run') sp.play(k.run, true); }
    else if (state === 'dash') { sp.stop(); if (k.dash) sp.setTexture(k.dash.key, k.dash.frame); this.stretchMs = this.T('dashStretchMs'); }
    else if (state === 'hurt' || state === 'dead') {
      sp.stop(); if (k.hit) sp.setTexture(k.hit.key, k.hit.frame);
      this.hurtPoseMs = this.T('hurtPoseMs');
      this.hurtTintSteps = 3; this.hurtTint = tint ?? 0xda4e38;
    } else if (state === 'spawn') { sp.setScale(1, 0); sp.setAlpha(0); if (k.idle) sp.play(k.idle, true); }
  }

  _setWand(state) { this.wandState = state; this.wandStateMs = 0; }

  /** Called by Caster on every cast step (wand graph `firing`). */
  onCast(element) {
    const T = this.T;
    this._setWand('firing');
    this.kickMs = T('castKickMs');
    this.kickX = -this.aimX * T('castKickPx'); this.kickY = -this.aimY * T('castKickPx');
    this.muzzleMs = T('muzzleFlashMs'); this.muzzleColor = ELEMENT_TINT[element] || 0xffffff;
    this.glowPulse = 0;
  }
  onSputter() { this.ctx.fx.particles('smoke', this.tipX, this.tipY, 3, { speed: 10, lifeMs: this.T('sputterFlashMs') * 3 }); }
  onSwap() { this._setWand('swap-lock'); this._wandSkin(); this.swapFlash = 1; }
  onRechargeStart() { if (this.wandState !== 'swap-lock') this._setWand('recharging'); }
  onRechargeEnd() { if (this.wandState === 'recharging') this._setWand('ready'); }

  get tipX() { return this.coreX + this.aimX * this.T('wandTipOffsetPx'); }
  get tipY() { return this.coreY + this.aimY * this.T('wandTipOffsetPx'); }

  /** Per render frame (frozen with hit-stop). */
  syncView(dtMs = 0) {
    const T = this.T, sp = this.sprite, rm = this.ctx.flags.reducedMotion;
    this.bodyStateMs += dtMs; this.wandStateMs += dtMs;
    if (this.kickMs > 0) this.kickMs = Math.max(0, this.kickMs - dtMs);
    const kickK = this.kickMs > 0 ? Phaser.Math.Easing.Quadratic.Out(this.kickMs / T('castKickMs')) : 0;
    const kx = Math.round(this.kickX * kickK), ky = Math.round(this.kickY * kickK);
    const fx = Math.round(this.feetX) + kx, fy = Math.round(this.feetY) + ky;
    sp.setPosition(fx, fy).setDepth(DEPTH.actors + fy / 10000);
    this.shadow.setPosition(Math.round(this.feetX), Math.round(this.feetY));

    if (this.bodyState !== 'dead') {
      // facing (R6): flip only past the deadband
      if (Math.abs(this.aimX) >= T('facingDeadband')) this.facing = this.aimX < 0 ? -1 : 1;
      sp.setFlipX(this.bodyState === 'dash' ? this.dashDirX < 0 : this.facing < 0);
      // run fps scales with speed (state-graph §2.1)
      if (this.bodyState === 'run') {
        const maxS = T('moveSpeed') * this.ctx.run.playerMods.moveSpeedMult;
        sp.anims.timeScale = Math.max(T('runFpsSpeedScaleMin'), Math.min(1, this.speed / maxS));
      }
      // scale: spawn materialize / dash stretch (quantized 1/8, R4)
      let sx = 1, sy = 1;
      if (this.bodyState === 'spawn') {
        const k = Math.min(1, this.bodyStateMs / 250);
        sy = Math.round(Phaser.Math.Easing.Back.Out(k) * 8) / 8; sp.setAlpha(Math.min(1, this.bodyStateMs / 120));
        if (k >= 1) { this._setBody(this.speed >= T('runEnterSpeed') ? 'run' : 'idle'); sp.setAlpha(1); }
      } else if (this.bodyState === 'dash' && this.stretchMs > 0) {
        this.stretchMs = Math.max(0, this.stretchMs - dtMs);
        const k = this.stretchMs / T('dashStretchMs');
        sx = Math.round((1 + 0.25 * k) * 8) / 8; sy = Math.round((1 - 0.25 * k) * 8) / 8;
      } else if (this.bodyState === 'hurt' && this.bodyStateMs < T('hitSquashMs') && !rm) { sx = 1.125; sy = 0.875; }
      sp.setScale(sx, sy);
      // tint: hurt flash (FILL flash 1 step, then hurt red 2 steps) scaled by flashIntensity (R8)
      if (this.hurtTintSteps > 0) {
        const fi = Save.settings.flashIntensity / 100;
        if (fi <= 0) sp.clearTint();
        else if (fi >= 1) sp.setTint(this.hurtTintSteps === 3 ? 0xffffff : this.hurtTint).setTintMode(Phaser.TintModes.FILL);
        else sp.setTint(this.hurtTintSteps === 3 ? 0xffffff : this.hurtTint).setTintMode(Phaser.TintModes.ADD);
        if (dtMs > 0) this.hurtTintSteps--;
      } else sp.clearTint();
      // i-frame flicker (visibility toggle every hurtFlickerPeriodMs; reduced motion: alpha 1 ↔ 0.45)
      if (this.iframesMs > 0 && this.bodyState !== 'spawn') {
        const on = Math.floor(this.iframesMs / T('hurtFlickerPeriodMs')) % 2 === 0;
        if (rm) { sp.setVisible(true).setAlpha(on ? 1 : 0.45); } else { sp.setVisible(on); sp.setAlpha(1); }
        this.wand.setVisible(sp.visible);
      } else if (this.bodyState !== 'spawn') { sp.setVisible(true).setAlpha(1); this.wand.setVisible(this.wandState !== 'hidden'); }
    } else {
      this._deathView(dtMs);
    }

    // held wand (state-graph §2.3): tip lands exactly at core + aim × wandTipOffsetPx
    const w = this.wand;
    if (this.wandState !== 'hidden') {
      const off = T('wandTipOffsetPx') - 10;
      w.setPosition(Math.round(this.coreX + this.aimX * off) + kx, Math.round(this.coreY + this.aimY * off) + ky);
      w.setRotation(Math.atan2(this.aimY, this.aimX) + Math.PI / 2);
      w.setDepth(DEPTH.actors + fy / 10000 + (this.aimY < -0.35 ? -0.00001 : 0.00001));
      // swap-lock tint: 1-step FILL flash, then MULTIPLY #808080 easing to none over wandSwapMs
      if (this.wandState === 'swap-lock') {
        if (this.swapFlash) { w.setTint(0xffffff).setTintMode(Phaser.TintModes.FILL); if (dtMs > 0) this.swapFlash = 0; }
        else { const k = Math.min(1, this.wandStateMs / T('wandSwapMs')); const c = Math.round(0x80 + (0xff - 0x80) * k); w.setTint((c << 16) | (c << 8) | c).setTintMode(Phaser.TintModes.MULTIPLY); }
        if (this.wandStateMs >= T('wandSwapMs')) { w.clearTint(); this._setWand(this.ctx.run.wand && this.ctx.run.wand.state.rechargeTimerMs > 0 ? 'recharging' : 'ready'); }
      } else w.clearTint();
      if (this.wandState === 'firing' && this.kickMs <= 0) this._setWand(this.ctx.run.wand && this.ctx.run.wand.state.rechargeTimerMs > 0 ? 'recharging' : 'ready');
    }
    // tip glow: ready 0.35 · firing 1.0 → sine 0.6–1.0 (castGlowPulseMs) while held · recharging 0.15
    const tip = this.tip;
    tip.setPosition(Math.round(this.tipX) + kx, Math.round(this.tipY) + ky).setVisible(this.wandState !== 'hidden' && sp.visible);
    const castHeld = this.ctx.intent && this.ctx.intent.castHeld;
    let ta = 0.35;
    if (this.wandState === 'recharging') ta = 0.15;
    else if (this.wandState === 'firing' || castHeld) ta = 0.8 + 0.2 * Math.sin((this.ctx.time.ms / T('castGlowPulseMs')) * Math.PI * 2);
    tip.setAlpha(ta).setTint(ELEMENT_TINT[this.ctx.lastElement] || 0xcfc0ff);
    // muzzle flash (muzzleFlashMs)
    if (this.muzzleMs > 0) {
      this.muzzleMs = Math.max(0, this.muzzleMs - dtMs);
      this.muzzle.setVisible(true).setPosition(Math.round(this.tipX), Math.round(this.tipY)).setTint(this.muzzleColor).setScale(0.75).setAlpha(Save.settings.flashIntensity / 100);
    } else this.muzzle.setVisible(false);
    // shield overlay
    const sh = this.ctx.run.shield > 0 && this.alive;
    this.shieldFx.setVisible(sh).setPosition(Math.round(this.coreX), Math.round(this.coreY));
    // player slow motes (1 per 150 ms from core)
    if (this.slowMs > 0 && dtMs > 0) { this._slowT = (this._slowT || 0) + dtMs; if (this._slowT >= 150) { this._slowT = 0; this.ctx.fx.particles('mote', this.coreX, this.coreY, 1, { color: 0x72d6ce, speed: 6, gravity: 20, lifeMs: 500 }); } }
  }

  /** player-body `dead` (state-graph §2.2): fall → dissolve → hold → done. Runs on real frames after the stop. */
  _deathView(dtMs) {
    const T = this.T, sp = this.sprite;
    const t = this.bodyStateMs;
    const fall = T('playerDeathFallMs'), diss = T('playerDeathDissolveMs'), hold = T('playerDeathHoldMs');
    sp.setVisible(true);
    if (t < fall) sp.setRotation(this.deathSide * (Math.PI / 2) * Phaser.Math.Easing.Quadratic.In(t / fall));
    else {
      sp.setRotation(this.deathSide * Math.PI / 2);
      if (!this._fell) { this._fell = true; this.ctx.fx.particles('dust', this.feetX, this.feetY, 8, { speed: 30 }); this.ctx.fx.flipbook('fx.soul_release', this.coreX, this.coreY - 6, { add: true }); this.ctx.fx.particles('soul', this.coreX, this.coreY, 6, { speed: 18, lifeMs: 900 }); }
      const k = Math.min(1, (t - fall) / diss);
      sp.setAlpha(k < 0.33 ? 1 : k < 0.66 ? 0.66 : k < 1 ? 0.33 : 0);
    }
    if (t >= fall + diss + hold && !this._deathDone) { this._deathDone = true; this.ctx.onPlayerDeathDone(); }
  }

  destroy() {
    this.body.destroy();
    for (const o of [this.sprite, this.shadow, this.wand, this.tip, this.muzzle, this.shieldFx]) o.destroy();
  }
}
