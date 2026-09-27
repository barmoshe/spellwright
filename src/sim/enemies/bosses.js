// sim/enemies/bosses.js — mechanic-spec §10 + progression-and-pacing §5 + state-graph-spec §4 (boss graph).
//
//  intro (bossActivateDelayMs, inert + invulnerable, camera pan bossIntroPanMs)
//   → pattern loop: idle(idleMs, moving per movement) → [approach ≤ approachMs for melee] → windup → act → recover → …
//   phase i active while hpFrac > phases[i].untilHpFrac. Damage that would cross the threshold is CLAMPED
//   at it (Combat calls e.ai.clampDamage first). Entering a phase: abort the attack (fizzle), clear enemy
//   bullets, bossPhaseHitstopMs, invulnerable invulnMs, shockwave knockback (the first step after the stop)
//   + ring (bossPhaseShockwaveRadiusPx over bossPhaseShockwaveMs), optional summon, then pattern[0].
//   Final-phase windupMult (× 0.9) with floors (EnemySystem.windupFor).
//   Death: kill every other enemy (40 ms stagger by distance), clear bullets, bossDeathHitstopMs, unravel
//   bossDeathUnravelMs (700 under reduced motion) with a burst every bossDeathBurstIntervalMs, final big
//   burst, 300 ms dissolve, THEN EV.BOSS_DEAD (the rewards/room-clear beat, telegraphs §4.4 ≈ 1.9 s).

//
// v2 (Wave D, mechanic-spec §10.1–10.2): tier "mini" rides the same brain — miniBossActivateDelayMs, no camera
// pan, miniBossDeathHitstopMs + a short unravel, EV.BOSS_DEAD {id, tier} (the director keeps the floor going).
// Defences (bosses[].defence) are built at init AFTER the build-reading `adapt` (≤ adaptMaxRulesApplied, first
// matching rule; mercy rules soften a mini's defence for a player lacking its test keyword), announced on the
// intro card (EV.BOSS_ADAPT + EV.BOSS_INTRO) so the counter is never hidden. Phase onEnter.regrowDefence
// restores that fraction of the boss's own defence inside the invulnerable window. Patterns are per-instance
// copies (data is frozen) so `add_attack` can insert. `heatAttack` joins the last phase at Heat ≥ 4 (bossHeatAttack).

import { EV } from '../../core/ev.js';
import { track } from '../../core/log.js';
import { t } from '../../core/i18n.js';
import { keywordsOf } from '../../data/catalog.js';
import { COL, TAU } from './tokens.js';

export class BossBrain {
  constructor(sys) {
    this.sys = sys;
    this.deaths = [];
  }
  get ctx() { return this.sys.ctx; }
  get T() { return this.sys.T; }

  init(e, def, tierOverride) {
    const ctx = this.ctx, ai = e.ai, er = this.sys.rules.enemies;
    const mini = (tierOverride || def.tier) === 'mini';
    e.tier = mini ? 'mini' : 'boss';
    e.maxHp = e.hp = def.hp * ((ctx.curse && ctx.curse.enemyHpMult) || 1);   // absolute hp × curse only
    e.kbResist = 1;
    ai.state = 'intro'; ai.t = 0; ai.phase = 0; ai.pi = 0; ai.idleMs = 0; ai.roseCue = false;
    e.hittable = false; e.invuln = true;
    e.activateMs = mini ? (er.miniBossActivateDelayMs ?? er.bossActivateDelayMs) : er.bossActivateDelayMs;
    e.introMs = e.activateMs;                    // RoomDirector/HUD read this: counts down to 0 at activation
    e.patterns = def.phases.map((p) => p.pattern.slice());
    e.resist = null;
    // Heat ≥ 4 (rules.heat bossHeatAttack): the boss adds its heatAttack to its LAST phase's pattern (mechanic-spec §10;
    // idempotent — minis whose heatAttack is already in the pattern are unchanged)
    const heat = ctx.heat || null;
    if (heat && heat.bossHeatAttack && def.heatAttack && this._atk(e, def.heatAttack)) {
      const last = e.patterns[e.patterns.length - 1];
      if (!last.includes(def.heatAttack)) last.push(def.heatAttack);
    }
    // build-reading adapt (§10.2), then the (possibly softened) defence
    const spec = def.defence ? { ...def.defence } : null;
    const applied = this._adapt(e, def, spec);
    if (spec) ctx.combat.defences.set(e, spec, {}, 'spawn');
    const name = def.intro && def.intro.titleKey ? t(def.intro.titleKey) : def.name;
    const subtitle = def.intro && def.intro.subtitleKey ? t(def.intro.subtitleKey) : (def.title || '');
    ctx.bus.emit(EV.BOSS_START, {
      id: def.id, name, title: def.title, hp: e.hp, maxHp: e.maxHp,
      thresholds: def.phases.map((p) => p.untilHpFrac).filter((f) => f > 0),
      tier: e.tier, defence: spec ? spec.type : null,
    });
    ctx.bus.emit(EV.BOSS_HP, e.hp, e.maxHp);
    if (applied) ctx.bus.emit(EV.BOSS_ADAPT, { id: def.id, tier: e.tier, rule: applied.rule.id, bannerKey: applied.rule.bannerKey || null, params: applied.params, mercy: applied.mercy });
    ctx.bus.emit(EV.BOSS_INTRO, {
      id: def.id, tier: e.tier, name, subtitle, nameKey: (def.intro && def.intro.titleKey) || null, subtitleKey: (def.intro && def.intro.subtitleKey) || null,
      adaptKey: applied ? applied.rule.bannerKey || null : null, adaptParams: applied ? applied.params : null, activateMs: e.activateMs,
    });
    if (!mini && ctx.cam && ctx.cam.panTo) ctx.cam.panTo(e.x, e.y, this.T('bossIntroPanMs'));    // minis: one-screen arena, no pan
    track('boss_start', { id: def.id, tier: e.tier, adapt: applied ? applied.rule.id : null });
  }

  // ------------------------------------------------------------------ adapt (mechanic-spec §10.2)
  /** The player's build as the boss reads it: all carried wands' slots + the active wand's preview. */
  readBuild() {
    const ctx = this.ctx, run = ctx.run, cat = ctx.cat;
    const out = { maxShots: 0, castRate: 0, elements: {}, topElement: null, topShare: 0, keywords: new Set() };
    if (!run || !run.wands || !run.wands.length) return out;
    try {
      const pv = run.preview(run.activeWand);
      for (const c of pv.casts) out.maxShots = Math.max(out.maxShots, c.shots ? c.shots.length : 0);
      out.castRate = pv.cycleMs > 0 ? pv.casts.length / (pv.cycleMs / 1000) : 0;
    } catch (err) { /* a broken preview reads as an empty build: no multicast / cast-rate rule fires */ }
    let total = 0;
    for (const w of run.wands) {
      const ids = [...(w.state.slots || []), ...((w.def && w.def.alwaysCast) || [])];
      for (const id of ids) {
        if (!id) continue;
        const c = cat.cards[id];
        if (!c) continue;
        for (const k of keywordsOf(cat, id)) out.keywords.add(k);
        if (c.type === 'projectile' && c.element) { out.elements[c.element] = (out.elements[c.element] || 0) + 1; total++; }
      }
    }
    for (const [el, n] of Object.entries(out.elements)) { const sh = n / Math.max(1, total); if (sh > out.topShare) { out.topShare = sh; out.topElement = el; } }
    out.total = total;
    return out;
  }

  _when(w, b) {
    switch (w && w.type) {
      case 'multicast_at_least': return b.maxShots >= w.value;
      case 'dominant_element': {
        if (!b.total) return false;
        if (w.element === 'any') return b.topShare >= w.minShare;
        return ((b.elements[w.element] || 0) / b.total) >= w.minShare;
      }
      case 'cast_rate_above': return b.castRate > w.value;
      case 'has_keyword': return b.keywords.has(w.keyword);
      case 'lacks_keyword': return !b.keywords.has(w.keyword);
      case 'always': return true;
      default: return false;
    }
  }

  /** Apply the first matching adapt rule (≤ rules.boss.adaptMaxRulesApplied). Returns {rule, params, mercy} or null. */
  _adapt(e, def, spec) {
    const rules = def.adapt || [];
    const RB = this.ctx.rules.boss || {};
    const max = RB.adaptMaxRulesApplied ?? 1;
    if (!rules.length || max <= 0) return null;
    const heat = this.ctx.heat || null;                        // Wave E: Heat ≥ 4 skips mini mercy rules
    const b = this.readBuild();
    for (const r of rules) {
      const th = r.then || {};
      const mercy = e.tier === 'mini' && th.type === 'defence_param';
      if (mercy && heat && heat.bossAdaptAlways) continue;
      if (!this._when(r.when, b)) continue;
      const params = {};
      switch (th.type) {
        case 'resist': {
          const el = th.element === 'dominant' ? b.topElement : th.element;
          if (!el) continue;
          const mult = Math.max(th.mult ?? 1, RB.adaptResistFloor ?? 0.6);             // never a hard counter
          e.resist = e.resist || {};
          e.resist[el] = mult;
          params.element = t(`boss.adapt.element.${el}`);
          params.Element = params.element.charAt(0).toUpperCase() + params.element.slice(1);
          params.mult = mult; params.elementId = el;
          break;
        }
        case 'add_attack': {
          const pi = Math.min(th.phase || 0, e.patterns.length - 1);
          const pat = e.patterns[pi];
          if (!this._atk(e, th.attackId)) continue;
          if (!pat.includes(th.attackId)) pat.splice(Math.min(1, pat.length), 0, th.attackId);   // after its first entry (idempotent)
          params.attackId = th.attackId; params.phase = pi;
          break;
        }
        case 'defence_param': {
          if (!spec || !th.field) continue;
          if (th.value != null) spec[th.field] = th.value;
          else if (th.mult != null && typeof spec[th.field] === 'number') spec[th.field] = spec[th.field] * th.mult;
          params.field = th.field; params.value = spec[th.field];
          break;
        }
        default: continue;
      }
      return { rule: r, params, mercy };
    }
    return null;
  }

  phaseDef(e) { return e.def.phases[Math.min(e.ai.phase, e.def.phases.length - 1)]; }
  windupMult(e) { const p = this.phaseDef(e); return (p && p.windupMult) || 1; }

  /** Combat: clamp damage at the current phase threshold (no phase skipping with one big hit). */
  clamp(e, amount) {
    if (!e.alive || e.invuln || !e.hittable) return 0;
    const ph = this.phaseDef(e);
    const thr = ph.untilHpFrac * e.maxHp;
    if (thr > 0 && e.ai.phase < e.def.phases.length - 1 && e.hp - amount < thr) return Math.max(0, e.hp - thr);
    return amount;
  }

  /**
   * Boss-only states. Returns true when the step is fully handled here (intro / phase-shift); false lets
   * the shared machine run (move/approach/windup/act/recover/stunned).
   */
  step(e, dt) {
    const ai = e.ai, ctx = this.ctx;
    // phase threshold reached (hp was clamped onto it) → enter the next phase
    if (ai.state !== 'intro' && ai.state !== 'phase' && ai.phase < e.def.phases.length - 1) {
      const thr = this.phaseDef(e).untilHpFrac * e.maxHp;
      if (e.hp <= thr + 1e-6) { this._enterPhase(e, ai.phase + 1); return true; }
    }
    if (ai.state === 'intro') {
      ai.mvx = 0; ai.mvy = 0;
      const riseAt = e.tier === 'mini' ? 0 : this.T('bossIntroPanMs') / 2;              // minis rise at 0 (state-graph §8.3)
      if (!ai.roseCue && ai.t >= riseAt) { ai.roseCue = true; this.sys.fire('boss_intro_rise'); }
      e.introMs = Math.max(0, e.activateMs - ai.t);
      if (ai.t >= e.activateMs) {
        e.introMs = 0;
        ai.state = 'move'; ai.t = 0; e.invuln = false; e.hittable = true;
        ai.idleMs = this.phaseDef(e).idleMs; ai.pi = 0;
        if (e.tier !== 'mini' && ctx.cam && ctx.cam.release) ctx.cam.release(this.T('bossIntroPanMs'));
        track('boss_active', { id: e.id, tier: e.tier });
      }
      return true;
    }
    if (ai.state === 'phase') {
      ai.mvx = 0; ai.mvy = 0;
      if (ai.knockPending && ai.t >= dt) {        // the first step after the phase hit-stop
        const p = ctx.player;
        const dx = p.x - e.x, dy = p.y - e.y, d = Math.hypot(dx, dy) || 1;
        p.knock((dx / d) * ai.knockPending, (dy / d) * ai.knockPending);
        this.sys.tl.ring(e.x, e.y, 0, this.T('bossPhaseShockwaveRadiusPx'), this.T('bossPhaseShockwaveMs'), COL.invulnWhite, 1, 2);
        ai.knockPending = 0;
      }
      if (ai.t >= ai.invulnMs) {
        ai.state = 'move'; ai.t = 0; e.invuln = false; e.hittable = true;
        ai.pi = 0; ai.idleMs = 0;                      // then start pattern[0]
      }
      return true;
    }
    return false;
  }

  _enterPhase(e, idx) {
    const ctx = this.ctx, ai = e.ai, sys = this.sys;
    if (ai.impl) sys._cancelAttack(e, true);            // abort the current attack
    ai.seq = null;
    ai.phase = idx;
    const ph = this.phaseDef(e), on = ph.onEnter || {};
    if (on.regrowDefence > 0) ctx.combat.defences.regrow(e, on.regrowDefence);   // plays inside the invulnerable window
    if (on.clearProjectiles !== false) ctx.shots.clearEnemyBullets({ pop: true });
    ctx.fx.hitstop(this.T('bossPhaseHitstopMs'));
    ctx.fx.addTrauma(this.T('traumaBossPhase', 1));
    ai.state = 'phase'; ai.t = 0;
    ai.invulnMs = on.invulnMs || 0;
    ai.knockPending = on.shockwaveKnockback || 0;
    e.invuln = true; e.hittable = false;
    e.kbVx = 0; e.kbVy = 0;
    if (on.summon && on.summon.enemyId) {
      const R = sys.rules.enemies.summonRingRadiusPx * 1.5, n = on.summon.count || 1, a0 = sys.rng.float(0, TAU);
      for (let i = 0; i < n; i++) {
        const a = a0 + (TAU * i) / n;
        sys.spawn(on.summon.enemyId, e.x + Math.cos(a) * R, e.y + Math.sin(a) * R, { summoner: e, portal: true, noCoins: true, summon: true });
      }
    }
    ctx.fx.flipbook('fx.phase_burst', e.x, e.y, { add: true, tint: COL.invulnWhite, color: COL.invulnWhite, fps: 20 });   // codemanu: ADD + tint, 21 f @ 20 fps
    ctx.bus.emit(EV.BOSS_PHASE, idx);
    // boss_phase stinger + roar: the lead's mixer fires them from EV.BOSS_PHASE
    track('boss_phase', { id: e.id, phase: idx });
  }

  /** Called in move/approach: idle countdown, then the next pattern entry (with the approach and onScreen gate). */
  think(e, dt) {
    const ai = e.ai, sys = this.sys, p = this.ctx.player;
    if (!p.alive) return;
    const ph = this.phaseDef(e);
    const pat = (e.patterns && e.patterns[Math.min(ai.phase, e.patterns.length - 1)]) || ph.pattern;
    const atkId = pat[ai.pi % pat.length];
    const atk = this._atk(e, atkId);
    if (!atk) { ai.pi++; return; }
    if (ai.state === 'approach') {                     // melee close-in before the windup, max approachMs
      ai.approachMs -= dt;
      const dx = p.x - e.x, dy = p.y - e.y, d = Math.hypot(dx, dy) || 1;
      const slow = sys.slow(e);
      ai.mvx = (dx / d) * e.speed * slow; ai.mvy = (dy / d) * e.speed * slow;
      const f = sys.flow.sample(e.x, e.y, e.flying, 1);
      if (f.ok && sys.ctx.world.raycast(e.x, e.y, p.x, p.y, 'ground') < d - 1) { ai.mvx = f.x * e.speed * slow; ai.mvy = f.y * e.speed * slow; }
      if ((d <= atk.approachRange || ai.approachMs <= 0) && sys.onScreen(e)) { ai.mvx = 0; ai.mvy = 0; sys.startAttack(e, atk); }
      return;
    }
    ai.idleMs -= dt;
    if (ai.idleMs > 0) return;
    if (atk.type === 'summon' && sys.countSummons(e) >= atk.maxAlive) { ai.pi++; ai.idleMs = ph.idleMs; return; }   // skipped
    if (!sys.onScreen(e)) return;                      // (d) keep moving, re-check each step
    if (atk.type === 'melee_swipe' && atk.approachMs) {
      const d = Math.hypot(p.x - e.x, p.y - e.y);
      if (d > atk.approachRange) { ai.state = 'approach'; ai.approachMs = atk.approachMs; ai.t = 0; return; }
    }
    sys.startAttack(e, atk);
  }

  _atk(e, id) {
    const list = e.def.attacks;
    for (let i = 0; i < list.length; i++) if (list[i].id === id) return list[i];
    return null;
  }

  onAttackDone(e) {
    const ai = e.ai;
    ai.pi++;
    ai.idleMs = this.phaseDef(e).idleMs;
    ai.state = 'move';
  }

  // ------------------------------------------------------------------ death
  onKilled(e) {
    const ctx = this.ctx, sys = this.sys;
    sys.killAll('cleanup', e.x, e.y, 40);             // every other enemy: §4.1, staggered 40 ms by distance
    ctx.shots.clearEnemyBullets({ pop: true });
    sys.clearHazards();
    const mini = e.tier === 'mini';
    // minis: the shorter stop (the 300 ms boss stop stays the run's biggest freeze), traumaBigExplosion, short unravel
    ctx.fx.hitstop(mini ? this.T('miniBossDeathHitstopMs', 160) : this.T('bossDeathHitstopMs'));
    ctx.fx.addTrauma(mini ? this.T('traumaBigExplosion', 0.71) : this.T('traumaBossKill', 1));
    // boss_death / miniboss_death cue: the mixer (EV.ENEMY_KILLED {boss:true, tier}) — frame 0 of the death stop
    const U = mini ? this.T('miniBossDeathUnravelMs', 700) : this.T('bossDeathUnravelMs');
    const unravel = ctx.flags.reducedMotion ? Math.round(U / 2) : U;
    e.defence = null; e.defenceStash = null; e.defenceRegrowMs = 0;    // the overlay falls with the corpse (no break read)
    this.deaths.push({ e, id: e.id, uid: e.uid, tier: e.tier, x: e.x, y: e.y, t: 0, nextBurst: 0, unravel, final: false, done: false });
    track('boss_dead', { id: e.id });
  }

  stepDeaths(dt) {
    for (let i = this.deaths.length - 1; i >= 0; i--) {
      const d = this.deaths[i];
      d.t += dt;
      const ctx = this.ctx, T = this.T, e = d.e;
      const box = e.anchor, bw = 12;
      while (d.t < d.unravel && d.t >= d.nextBurst) {   // unravel: a small burst at a random point in the body bbox (fx stream)
        const bx = d.x + this.sys.fxRng.float(-bw, bw), by = e.feetY + this.sys.fxRng.float(box.head, 0);
        ctx.fx.flipbook('fx.explosion', bx, by, { scale: 1, silentFallback: false, color: 0xee8e2e });
        ctx.fx.particles('ember', bx, by, 4, { color: 0xee8e2e, speed: 40, lifeMs: 250 });
        d.strobeStep = ctx.time.step;                 // EnemyView: 1-step FILL strobe synced to the burst
        d.nextBurst += T('bossDeathBurstIntervalMs');
      }
      if (!d.final && d.t >= d.unravel) {              // final burst at core
        d.final = true; d.finalAt = d.t;
        const cy = e.feetY + box.core;
        const R = d.tier === 'mini' ? Math.round(T('bigExplosionRadiusPx') * 0.5) : T('bigExplosionRadiusPx');   // mini: a medium burst
        ctx.fx.explosion(d.x, cy, R, { hostile: false, element: 'fire' });
        ctx.fx.explosionTrauma(R);
        this.sys.fire(d.tier === 'mini' ? 'explode_small' : 'explode_big');
        if (e.id === 'archlich') ctx.fx.particles('soul', d.x, cy, 16, { speed: 30, lifeMs: 1200, gravity: -60 });
      }
      if (d.final && d.t >= d.finalAt + 300) {
        this.deaths.splice(i, 1);
        ctx.bus.emit(EV.BOSS_DEAD, { id: d.id, tier: d.tier || 'boss' });
      }
    }
  }
  deathOf(e) { for (const d of this.deaths) if (d.e === e) return d; return null; }

  clear() { this.deaths.length = 0; }
}

