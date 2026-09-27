// sim/Combat.js — mechanic-spec §8: the damage-instance pipeline, statuses, reactions, knockback, kills.
//
// dmg = base × damageMult × (crit ? crit.mult : 1) × (shocked-vulnerable ? vulnerableMult : 1)
//       × reactionMult (a reaction REPLACES the frozen multiplier) × (frozen && no reaction ? freeze.damageTakenMult : 1)
// then: hp −= dmg (boss clamp first) → status (if alive, not immune, rolled on the spell stream) → knockback (direct/explode).
// Status ticks: no element, no crit, no reactions, × floor hpMult. Reaction damage is elementless and never reacts.
// Status numbers come from run.statusTable (rules.status/reactions with relic status_rule overrides).

import { EV } from '../core/ev.js';
import { track } from '../core/log.js';
import { Save } from '../core/save.js';

const ELEMENT_STATUS = { fire: 'burn', frost: 'chill', shock: 'shock', poison: 'poison' };

export class Combat {
  constructor(ctx) {
    this.ctx = ctx;
    this.lastKillStopMs = -1e9;
  }
  get run() { return this.ctx.run; }
  get S() { return this.ctx.run.statusTable.status; }
  get R() { return this.ctx.run.statusTable.reactions; }
  get hpMult() { return this.ctx.floor.hpMult; }

  newStatus() {
    return { burnMs: 0, burnTick: 0, chillStacks: 0, chillMs: 0, frozenMs: 0, freezeImmuneMs: 0, stunMs: 0, stunImmuneMs: 0,
      vulnerableMs: 0, poisonStacks: 0, poisonMs: 0, poisonTick: 0 };
  }

  // ------------------------------------------------------------------ status queries (AI reads these)
  isFrozen(e) { return e.status.frozenMs > 0; }
  isStunned(e) { return e.status.stunMs > 0; }
  /** Movement/attack speed multiplier from chill (−slowPerStack per stack; boss cap slowCap). */
  slowFactor(e) {
    const st = e.status;
    if (st.chillStacks <= 0) return 1;
    let slow = st.chillStacks * this.S.chill.slowPerStack;
    if (e.isBoss) slow = Math.min(slow, this.S.boss.slowCap);
    return Math.max(0.05, 1 - slow);
  }
  /** Windups and cooldowns stretch ×1/(1−slow): the progress rate is the slow factor (mechanic-spec §8.2). */
  windupRate(e) { return this.slowFactor(e); }
  statusesOf(e) {
    const st = e.status, out = [];
    if (st.burnMs > 0) out.push('burn'); if (st.chillStacks > 0) out.push('chilled'); if (st.frozenMs > 0) out.push('frozen');
    if (st.stunMs > 0 || st.vulnerableMs > 0) out.push('shocked'); if (st.poisonStacks > 0) out.push('poison');
    return out;
  }

  // ------------------------------------------------------------------ the pipeline
  /**
   * One damage instance from the player's side.
   * o: { element, statusChance, isCrit, damageMult=1, knock:{dx,dy,speed}|null, source:'direct'|'explode'|'chain'|'zone'|'zap'|'relic'|'reaction'|'status'|'enemy',
   *      canReact=true, canStatus=true, x, y }
   * @returns {number} damage dealt (0 if not hittable)
   */
  hitEnemy(e, base, o = {}) {
    if (!e.alive || !e.hittable) { if (e.alive && !e.hittable && e.isBoss && e.view && e.view.clink) e.view.clink(); return 0; }
    const st = e.status;
    const rules = this.ctx.rules;
    const element = o.element || null;
    let dmg = base * (o.damageMult ?? 1);
    if (o.isCrit) dmg *= rules.crit.mult;
    if (st.vulnerableMs > 0) dmg *= this.S.shock.vulnerableMult;
    let reaction = null;
    if (element && o.canReact !== false && o.source !== 'reaction' && o.source !== 'status') reaction = this._reaction(e, element);
    // a reaction REPLACES the frozen multiplier (mechanic-spec §8.1)
    if (reaction) { if (reaction.mult) dmg *= reaction.mult; }
    else if (st.frozenMs > 0) dmg *= this.S.freeze.damageTakenMult;

    const dealt = this._applyDamage(e, dmg, { crit: !!o.isCrit, element, reaction: reaction && reaction.name, source: o.source, x: o.x, y: o.y });
    if (reaction) this._afterReaction(e, reaction, dmg, element);
    if (e.alive) {
      // E's own status (unless the reaction consumed it, e.g. Melt applies no burn)
      if (element && o.canStatus !== false && !(reaction && reaction.blocksStatus)) {
        const chance = o.statusChance ?? 0;
        if (chance > 0 && this.ctx.rng.spell.next() < chance) this.applyStatus(e, ELEMENT_STATUS[element]);
      }
      if (o.knock && (o.source === 'direct' || o.source === 'explode')) this.knockEnemy(e, o.knock.dx, o.knock.dy, o.knock.speed);
    }
    return dealt;
  }

  /** Contract alias: enemy-sourced damage to enemies (self_destruct.enemyDamage). No crit/status/reaction. */
  damageEnemy(e, amount, opts = {}) {
    if (!e.alive || !e.hittable) return 0;
    return this._applyDamage(e, amount, { crit: false, element: null, source: opts.source || 'enemy' });
  }

  _applyDamage(e, dmg, info) {
    if (dmg <= 0) return 0;
    if (e.ai && e.ai.clampDamage) dmg = e.ai.clampDamage(dmg);
    if (dmg <= 0) return 0;
    e.hp -= dmg;
    this.run.stats.damageDealt += dmg;
    if (e.view && e.view.flash && info.source !== 'status') e.view.flash();
    const headY = e.y - (e.headOffset ?? (e.r + 8));
    this.ctx.bus.emit(EV.DAMAGE_NUMBER, { id: e.uid, x: e.x, y: headY, amount: Math.ceil(dmg), crit: !!info.crit, element: info.element, reaction: info.reaction || null, target: 'enemy', source: info.source });
    if (e.isBoss) this.ctx.bus.emit(EV.BOSS_HP, Math.max(0, e.hp), e.maxHp);
    if (e.hp <= 0 && e.alive) this.ctx.enemies.kill(e, info.source === 'status' ? 'status' : 'damage');
    return dmg;
  }

  // ------------------------------------------------------------------ statuses
  applyStatus(e, status) {
    if (!status || !e.alive) return;
    const st = e.status, S = this.S, imm = e.immune;
    const first = (name) => {
      this.ctx.mixer.fire(`status_${name}`, { x: e.x });
      if (!Save.flag(`status.${name}`)) this.ctx.bus.emit(EV.STATUS_FIRST, { status: name });
    };
    switch (status) {
      case 'burn':
        if (imm.has('burn')) return;
        if (st.burnMs <= 0) st.burnTick = S.burn.tickMs;
        st.burnMs = S.burn.durationMs;
        first('burn');
        break;
      case 'chill':
        if (imm.has('chill') || st.freezeImmuneMs > 0 || st.frozenMs > 0) return;
        st.chillStacks = Math.min(S.chill.maxStacks, st.chillStacks + 1);
        st.chillMs = S.chill.durationMs;
        first('chill');
        if (st.chillStacks >= S.chill.freezeStacks && !imm.has('freeze') && !e.isBoss) this._freeze(e);
        break;
      case 'shock':
        st.vulnerableMs = S.shock.vulnerableMs;                         // vulnerability always refreshes
        first('shock');
        if (!imm.has('stun') && st.stunImmuneMs <= 0 && !e.isBoss) {
          st.stunMs = S.shock.stunMs;
          st.stunImmuneMs = S.shock.stunMs + S.shock.stunImmunityMs;    // immunity runs for stunImmunityMs after the stun
          if (e.ai && e.ai.onInterrupt) e.ai.onInterrupt('stun');
        }
        break;
      case 'poison':
        if (imm.has('poison')) return;
        if (st.poisonStacks <= 0) st.poisonTick = S.poison.tickMs;
        st.poisonStacks = Math.min(S.poison.maxStacks, st.poisonStacks + 1);
        st.poisonMs = S.poison.durationMs;
        first('poison');
        break;
      default: break;
    }
  }

  _freeze(e) {
    const st = e.status;
    st.frozenMs = this.S.freeze.freezeMs;
    st.chillStacks = 0; st.chillMs = 0;
    this.ctx.mixer.fire('status_freeze', { x: e.x });
    if (!Save.flag('status.freeze')) this.ctx.bus.emit(EV.STATUS_FIRST, { status: 'freeze' });
    if (e.ai && e.ai.onInterrupt) e.ai.onInterrupt('freeze');
  }
  _thaw(e) {
    const st = e.status;
    st.frozenMs = 0; st.chillStacks = 0; st.chillMs = 0;
    st.freezeImmuneMs = this.S.freeze.immunityMs;
    if (e.view && e.view.thaw) e.view.thaw();
    this.ctx.mixer.fire('freeze_shatter');
  }

  /** Once per sim step: status timers and ticks (tick damage × floor hpMult, elementless). */
  stepStatuses(dt) {
    const S = this.S;
    this.ctx.enemies.forEachAlive((e) => {
      const st = e.status;
      if (st.burnMs > 0) {
        st.burnMs -= dt; st.burnTick -= dt;
        if (st.burnTick <= 0) { st.burnTick += S.burn.tickMs; this._tick(e, S.burn.tickDamage); }
        if (st.burnMs <= 0) st.burnMs = 0;
      }
      if (!e.alive) return;
      if (st.poisonStacks > 0) {
        st.poisonMs -= dt; st.poisonTick -= dt;
        if (st.poisonTick <= 0) { st.poisonTick += S.poison.tickMs; this._tick(e, S.poison.damagePerStack * st.poisonStacks); }
        if (st.poisonMs <= 0) { st.poisonStacks = 0; st.poisonMs = 0; }
      }
      if (!e.alive) return;
      if (st.chillStacks > 0) { st.chillMs -= dt; if (st.chillMs <= 0) { st.chillStacks = 0; st.chillMs = 0; } }
      if (st.frozenMs > 0) { st.frozenMs -= dt; if (st.frozenMs <= 0) this._thaw(e); }
      if (st.freezeImmuneMs > 0) st.freezeImmuneMs = Math.max(0, st.freezeImmuneMs - dt);
      if (st.stunMs > 0) st.stunMs = Math.max(0, st.stunMs - dt);
      if (st.stunImmuneMs > 0) st.stunImmuneMs = Math.max(0, st.stunImmuneMs - dt);
      if (st.vulnerableMs > 0) st.vulnerableMs = Math.max(0, st.vulnerableMs - dt);
    });
  }
  _tick(e, amount) {
    const mult = this.S.tickDamageScalesWithFloorHp ? this.hpMult : 1;
    this._applyDamage(e, amount * mult, { crit: false, element: null, source: 'status', x: e.x, y: e.y });
  }

  // ------------------------------------------------------------------ reactions (mechanic-spec §8.3)
  _reaction(e, element) {
    const st = e.status, R = this.R;
    const rmul = R.damageMult;
    if (element === 'fire' && (st.chillStacks > 0 || st.frozenMs > 0)) return { name: 'melt', mult: R.melt.damageMult * rmul, blocksStatus: true };
    if (element === 'shock' && st.burnMs > 0) return { name: 'overload', mult: undefined };
    if (element === 'fire' && st.poisonStacks > 0) return { name: 'blight', mult: undefined };
    if (element === 'shock' && st.frozenMs > 0) return { name: 'superconduct', mult: R.superconduct.damageMult * rmul };
    if (element === 'frost' && st.burnMs > 0) return { name: 'quench', mult: undefined };
    return null;
  }
  _afterReaction(e, r, instanceDamage, element) {
    const st = e.status, R = this.R;
    const rmul = R.damageMult;
    switch (r.name) {
      case 'melt':
        st.chillStacks = 0; st.chillMs = 0;
        if (st.frozenMs > 0) { st.frozenMs = 0; st.freezeImmuneMs = this.S.freeze.immunityMs; if (e.view && e.view.thaw) e.view.thaw(); }
        else st.freezeImmuneMs = this.S.freeze.immunityMs;
        break;
      case 'overload': {
        st.burnMs = 0;
        const dmg = instanceDamage * R.overload.damageMult * rmul;
        this.explodeAt(e.x, e.y, R.overload.radius, dmg, { element: null, source: 'reaction', canReact: false, canStatus: false, noKnock: true });
        break;
      }
      case 'blight': {
        const stacks = st.poisonStacks;
        st.poisonStacks = 0; st.poisonMs = 0;
        if (e.alive) this._applyDamage(e, stacks * R.blight.damagePerStack * this.hpMult * rmul, { crit: false, element: null, reaction: 'blight', source: 'reaction' });
        this.ctx.fx.flipbook('fx.poison_burst', e.x, e.y, {});
        break;
      }
      case 'superconduct':
        st.frozenMs = 0; st.chillStacks = 0; st.chillMs = 0; st.freezeImmuneMs = this.S.freeze.immunityMs;
        if (e.view && e.view.thaw) e.view.thaw();
        this.ctx.enemies.queryCircle(e.x, e.y, R.superconduct.chillRadius, (o) => { if (o !== e) this.applyStatus(o, 'chill'); });
        break;
      case 'quench':
        st.burnMs = 0;
        this.ctx.fx.particles('smoke', e.x, e.y - 6, 4, {});
        break;
      default: break;
    }
    const first = this.run.recordReaction(r.name);
    Save.discover('reactions', r.name);
    this.ctx.bus.emit(EV.REACTION, { name: r.name, first, x: e.x, y: e.y });
    track('reaction', r.name);
  }

  // ------------------------------------------------------------------ area damage
  /**
   * Radial explosion (mechanic-spec §6.1 explode): every enemy (and crate) whose circle overlaps takes damage,
   * rolls status, gets radial knockback. No self-damage, ever.
   */
  explodeAt(x, y, radius, damage, o = {}) {
    this.ctx.enemies.queryCircle(x, y, radius, (e) => {
      const dx = e.x - x, dy = e.y - y, d = Math.hypot(dx, dy) || 1;
      this.hitEnemy(e, damage, { element: o.element, statusChance: o.statusChance ?? 0, isCrit: !!o.isCrit, source: o.source || 'explode',
        canReact: o.canReact, canStatus: o.canStatus, knock: o.noKnock || !o.knockback ? null : { dx: dx / d, dy: dy / d, speed: o.knockback }, x: e.x, y: e.y });
    });
    this.damageCratesInRadius(x, y, radius, damage);
    const T = this.ctx.T;
    if (radius >= T('bigExplosionRadiusPx')) this.ctx.fx.shake(T('bigExplosionShakePx'), T('bigExplosionShakeMs'));
    else this.ctx.fx.shake(T('explosionShakePx'), T('explosionShakeMs'));
    this.ctx.fx.explosion(x, y, radius, { element: o.element });
    this.ctx.mixer.fire(radius >= T('bigExplosionRadiusPx') ? 'explode_big' : 'explode_small', { x });
  }

  damageCratesInRadius(x, y, r, dmg) {
    const w = this.ctx.world; if (!w || !w.crateHp.size) return;
    for (const i of [...w.crateHp.keys()]) {
      const cx = (i % w.cols) * 16 + 8, cy = Math.floor(i / w.cols) * 16 + 8;
      if (Math.hypot(cx - x, cy - y) <= r + 8) this.hitCrate(i, dmg);
    }
  }
  hitCrate(i, dmg) {
    const w = this.ctx.world;
    const cx = (i % w.cols) * 16 + 8, cy = Math.floor(i / w.cols) * 16 + 8;
    if (w.hitCrate(i, dmg)) {
      this.ctx.fx.particles('dust', cx, cy, 6, { color: 0xa3703a, speed: 50 });
      this.ctx.fx.flipbook('fx.crate_break', cx, cy, { silentFallback: true });
      this.ctx.mixer.fire('crate_break');
      if (this.ctx.rng.loot.chance(this.ctx.cat.economy.rewards.crateCoinChance)) this.ctx.pickups.coin(cx, cy, 1);
      this.ctx.bus.emit(EV.FTUE, 'crate-broken');
      return true;
    }
    this.ctx.mixer.fire('crate_hit');
    return false;
  }

  knockEnemy(e, dx, dy, speed) {
    if (!speed || e.kbResist >= 1 || e.immovable) return;
    const k = speed * (1 - e.kbResist);
    e.kbVx += dx * k; e.kbVy += dy * k;
  }

  // ------------------------------------------------------------------ kills
  /** Called exactly once by EnemySystem.kill(). cause: 'damage'|'status'|'self_destruct'|'summoner'|'cleanup' */
  onEnemyKilled(e, cause) {
    if (cause === 'cleanup') return;
    const run = this.run;
    const T = this.ctx.T;
    run.stats.kills++;
    if (e.elite) run.stats.elitesKilled++;
    Save.discover('enemies', e.id);
    // coins: [min,max] × floor.coinMult × elite ×3 × relic coinMult (systems §1)
    const noCoins = e.noCoins || (cause === 'self_destruct' && !this.ctx.rules.enemies.selfDestructDropsCoins);
    if (!noCoins && e.coins) {
      const base = this.ctx.rng.loot.range(e.coins[0], e.coins[1]);
      const n = Math.round(base * this.ctx.floor.coinMult * (e.elite ? this.ctx.rules.enemies.elite.coinMult : 1) * run.economyMods.coinMult);
      if (n > 0) this.ctx.pickups.coin(e.x, e.y, n);
    }
    // kill hit-stop (feel §impact): capped rate for normal kills, elites ignore the interval
    if (!e.isBoss) {
      const now = this.ctx.time.ms;
      if (e.elite) this.ctx.fx.hitstop(T('eliteKillHitstopMs'));
      else if (now - this.lastKillStopMs >= T('killHitstopMinIntervalMs')) { this.lastKillStopMs = now; this.ctx.fx.hitstop(T('killHitstopMs')); }
    }
    const statuses = this.statusesOf(e);
    this.ctx.bus.emit(EV.ENEMY_KILLED, { id: e.id, elite: !!e.elite, boss: !!e.isBoss, x: e.x, y: e.y, statuses });
    this.ctx.relics.onEvent('kill', { enemy: e, x: e.x, y: e.y, statuses, elite: !!e.elite });
    track('kill', { enemy: e.id, elite: !!e.elite });
  }
}
