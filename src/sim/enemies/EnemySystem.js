// sim/enemies/EnemySystem.js — sim-contract.md §3: spawn, step, pools, separation, contact damage, kills,
// hazards, and the shared attack state machine (mechanic-spec §9.2) for every enemy and boss.
//
//   move → windup (telegraph) → act → recover → move        (+ spawning, stunned, frozen, airborne; bosses: intro, phase)
//
// Selection (a)–(d): attacks cycle IN ORDER; one starts when (a) the previous attack's cooldown has elapsed
// (stretched by chill: the cooldown timer advances at combat.windupRate), (b) player within triggerRange,
// (c) LOS if needsLos (world.hasLos: walls/pillars/crates block, pits don't), (d) the enemy's centre is
// inside the camera view inset by onScreenInsetPx (rules.enemies.attackRequiresOnScreen). Failing → keep
// moving, re-check next step, never skip ahead. Windup timer: wElapsed += dt × windupRate (chill stretch);
// aim tracks until wTotal − aimLockBeforeReleaseMs, then locks. Windups floored after curse/phase mults.
// Interrupts (Combat → e.ai.onInterrupt('stun'|'freeze')): cancel + 100 ms fizzle; the SAME attack is
// retried after cooldownMs × interruptCooldownFrac.
//
// Runs inside RunScene's fixed 60 Hz worldstep (architecture §4): Arcade has already integrated bodies and
// resolved tile colliders when step() runs; we read positions, think, and set velocities for the next step.
// Allocation: a FRESH Enemy object per spawn (stable identity: a reference held by the lead — homing target,
// RoomDirector's boss watch — never turns into a different enemy), pooled bare Arcade bodies, pooled views and
// decals; no per-step allocation in
// the loops (event payloads are allocated only on rare events: windup start, spawn, death).

import { EV } from '../../core/ev.js';
import { warnOnce, track } from '../../core/log.js';
import { getEffect } from '../../effects/registry.js';
import { MAX_ENEMIES } from '../../config.js';
import { FlowField } from './FlowField.js';
import { TelegraphLayer } from './TelegraphLayer.js';
import { EnemyViews } from './EnemyView.js';
import { BossBrain } from './bosses.js';
import './movement.js';
import './attacks.js';
import { ACTOR, ANCHOR, FLYER_HOVER_PX, HAZARD_LOOK, TAU, actorOf, clamp } from './tokens.js';

let UID = 1;
// release cues fired by the generic machine (ring/spiral/blink/slam/hazard fire theirs inside the type)
const FIRE_OPT = Object.freeze({ fire: true }), ACID_OPT = Object.freeze({ fire: false });
const RELEASE_CUE_GENERIC = Object.freeze({ melee_swipe: 'release_swipe', shoot: 'release_shoot', charge: 'enemy_charge_go', summon: 'enemy_summon_rise' });

function newAi() {
  return {
    state: 'spawning', t: 0, idx: 0, cool: 0, atk: null, impl: null,
    wElapsed: 0, wTotal: 1, locked: false, aim: 0, tx: 0, ty: 0, sx0: 0, sy0: 0,
    actT: 0, actDur: 0, recMs: 0, n: 0, base: 0, hit: false, relStep: -99, lockStep: -99,
    dec: new Array(8).fill(null), decN: 0, ticks: null, pts: new Float32Array(10), ptsN: 0,
    mvx: 0, mvy: 0, fleeMs: 0, strafeDir: 1, strafeMs: 0, wobbleT: 0, wobblePhase: 0, retreatMs: 0, driftAng: 0, driftMs: 0,
    wallStunMs: 0, stunKind: '', seq: null, seqIdx: 0, air: 0, blinkX: 0, blinkY: 0, blinkInAt: -1, exploded: false,
    phase: 0, pi: 0, idleMs: 0, approachMs: 0, invulnMs: 0, knockPending: 0, roseCue: false,
    onInterrupt: null, clampDamage: null, _clamp: null,
  };
}

function newEnemy() {
  return {
    uid: 0, id: '', def: null, x: 0, y: 0, r: 4, feetY: 0, feetOff: 0, flying: false, alive: false, hittable: false,
    hp: 0, maxHp: 0, elite: false, isBoss: false, kbResist: 0, immune: new Set(), status: null, kbVx: 0, kbVy: 0,
    coins: [0, 0], threat: 0, ai: newAi(), view: null, body: null, speed: 0, contactDamage: 1, summoner: null,
    noCoins: false, immovable: false, invuln: false, headOffset: 12, spawnMs: 0, summon: false, killCause: null,
    deathMs: 0, deathDelayMs: 0, actor: null, anchor: null, stationary: false,
  };
}

export class EnemySystem {
  constructor(ctx) {
    this.ctx = ctx;
    this.scene = ctx.scene;
    this.system = this;              // attacks reach system APIs through sys.system (same object)
    this.rules = ctx.rules;
    this.T = ctx.T;
    this.rng = ctx.rng.ai;           // gameplay decisions ONLY
    this.fxRng = ctx.rng.fx;         // cosmetics ONLY
    this.lockMs = this.rules.enemies.aimLockBeforeReleaseMs;
    this.knockDecay = ctx.T('knockbackDecay');

    this.bodyFree = [];               // pooled bare Arcade bodies (bodies are the expensive part)
    this.allBodies = [];
    this._live = [];
    this._snaps = [];                // snapshot stack for safe (and nested) iteration while kills/spawns happen
    this._snapLevel = 0;
    this._sumList = [];
    this.groundBodies = [];
    this.flyerBodies = [];
    this.colliders = [];
    this.worldRef = null;

    this.flow = new FlowField();
    this.tl = new TelegraphLayer(this.scene, ctx.T);
    this.views = new EnemyViews(this);
    this.boss = new BossBrain(this);

    this.hazards = [];
    this.hazFree = [];
    this.dir = { x: 0, y: 0, ok: false };
    this.blinkOpt = { flyer: false, from: null, minDist: 0, maxDist: 0, wallClear: 0 };
    this.hazOpt = { flyer: false, from: null, minDist: 0, maxDist: 0, wallClear: 0 };
    this.playerPt = { x: 0, y: 0 };
    this._bo = { x: 0, y: 0, angleDeg: 0, speed: 0, radius: 3, element: 'arcane', lifetimeMs: 3000, damage: 1, ownerUid: 0 };
    this._waveCueStep = -1;
    this._decalTraceStep = -1;
    this.stats = { spawned: 0, killed: 0, windups: 0, interrupts: 0 };
    if (typeof window !== 'undefined') { window.__SW__ = window.__SW__ || {}; window.__SW__.enemies = this; }
  }

  _wireAi(e) {
    const ai = e.ai;
    ai.onInterrupt = (reason) => this.interrupt(e, reason);
    ai._clamp = (amount) => this.boss.clamp(e, amount);
  }

  // ================================================================== contract: queries
  get live() { return this._live; }
  aliveCount() { let n = 0; for (let i = 0; i < this._live.length; i++) if (this._live[i].alive) n++; return n; }
  forEachAlive(fn) {
    const it = this._snapshot();
    for (let i = 0; i < it.length; i++) { const e = it[i]; if (e.alive) fn(e); }
    this._unsnap(it);
  }
  queryCircle(x, y, r, fn) {
    const it = this._snapshot();
    for (let i = 0; i < it.length; i++) {
      const e = it[i];
      if (!e.alive || !e.hittable) continue;
      const dx = e.x - x, dy = e.y - y, rr = r + e.r;
      if (dx * dx + dy * dy <= rr * rr) fn(e);
    }
    this._unsnap(it);
  }
  nearest(x, y, range, exclude) {
    let best = null, bd = range * range;
    for (let i = 0; i < this._live.length; i++) {
      const e = this._live[i];
      if (!e.alive || !e.hittable || (exclude && exclude.has(e.uid))) continue;
      const dx = e.x - x, dy = e.y - y, d = dx * dx + dy * dy;
      if (d <= bd) { bd = d; best = e; }
    }
    return best;
  }
  /** True while a boss death sequence is playing (the lead gates the boss-room clear on EV.BOSS_DEAD). */
  get bossDying() { return this.boss.deaths.length > 0; }

  /** Snapshot stack: iteration stays safe while callbacks kill/spawn, and nested iterations don't clobber. */
  _snapshot() {
    const lvl = this._snapLevel++;
    let arr = this._snaps[lvl];
    if (!arr) arr = this._snaps[lvl] = [];
    const L = this._live;
    arr.length = L.length;
    for (let i = 0; i < L.length; i++) arr[i] = L[i];
    return arr;
  }
  _unsnap(arr) { arr.length = 0; this._snapLevel--; }

  // ================================================================== spawn
  /**
   * opts: { elite:false, boss:false, summoner:null, portal:true, noCoins:false, summon:false, kbx, kby }
   * HP = def.hp × floor.hpMult × (curse?.enemyHpMult||1) × (elite ? rules.enemies.elite.hpMult : 1)
   */
  spawn(defId, x, y, opts = {}) {
    const def = this.ctx.cat.enemies[defId];
    if (!def) { warnOnce(`enemy-unknown:${defId}`, `spawn: no enemy "${defId}" in data/enemies.json`); return null; }
    return this._spawn(def, x, y, opts, false);
  }

  spawnBoss(bossId, x, y) {
    const def = this.ctx.cat.bosses[bossId];
    if (!def) { warnOnce(`boss-unknown:${bossId}`, `spawnBoss: no boss "${bossId}" in data/bosses.json`); return null; }
    const e = this._spawn(def, x, y, { portal: false, noCoins: true }, true);
    if (e) this.boss.init(e, def);
    return e;
  }

  _spawn(def, x, y, opts, isBoss) {
    const ctx = this.ctx, er = this.rules.enemies;
    if (this.aliveCount() >= MAX_ENEMIES) { warnOnce('enemy-cap', `enemy cap reached (${MAX_ENEMIES})`); track('engine_warning', { key: 'enemy-cap' }); return null; }
    const e = newEnemy();
    this._wireAi(e);
    const actor = actorOf(def.id), anc = ANCHOR[actor.cls];
    const elite = !!opts.elite && !isBoss;
    const curse = ctx.curse;
    e.uid = UID++; e.id = def.id; e.def = def; e.actor = actor; e.anchor = anc;
    e.flying = !!def.flying; e.r = def.radius; e.speed = def.speed || 0;
    e.isBoss = isBoss; e.elite = elite;
    e.stationary = def.movement && def.movement.type === 'stationary';
    // never spawn inside a blocker (robustness against bad markers)
    const w = ctx.world;
    if (w && (e.flying ? w.blocksShots(x, y) : w.blocksGround(x, y))) { const n = w.nearestWalkable(x, y, 3); if (n) { x = n.x; y = n.y; } }
    e.x = x; e.y = y;
    e.feetOff = -anc.core + (e.flying ? FLYER_HOVER_PX : 0);
    e.feetY = y + e.feetOff;
    e.headOffset = y - (e.feetY + anc.head - (e.flying ? FLYER_HOVER_PX : 0));
    const hpMult = isBoss ? 1 : ctx.floor.hpMult;
    e.maxHp = e.hp = def.hp * hpMult * ((curse && curse.enemyHpMult) || 1) * (elite ? er.elite.hpMult : 1);
    e.kbResist = Math.min(1, (def.kbResist || 0) + (elite ? er.elite.kbResistAdd : 0));
    e.immune.clear(); for (const s of def.immune || []) e.immune.add(s);
    e.status = ctx.combat.newStatus();
    e.kbVx = opts.kbx || 0; e.kbVy = opts.kby || 0;
    e.coins[0] = (def.coins && def.coins[0]) || 0; e.coins[1] = (def.coins && def.coins[1]) || 0;
    e.threat = (def.threat || 0) * (elite ? er.eliteThreatMult : 1);
    e.contactDamage = def.contactDamage ?? 1;
    e.summoner = opts.summoner || null; e.summon = !!opts.summon;
    e.noCoins = !!opts.noCoins;
    e.immovable = false; e.invuln = false; e.killCause = null; e.deathDelayMs = 0; e.introMs = 0; e.soulTo = 0;
    e.alive = true;
    e.spawnMs = ctx.time.ms;
    e.portalSpawn = opts.portal !== false;
    // ai reset
    const ai = e.ai;
    const portal = opts.portal !== false;
    ai.state = portal ? 'spawning' : 'move'; ai.t = 0; ai.idx = 0; ai.cool = 0; ai.atk = null; ai.impl = null;
    ai.locked = false; ai.decN = 0; for (let i = 0; i < ai.dec.length; i++) ai.dec[i] = null; ai.ticks = null;
    ai.mvx = 0; ai.mvy = 0; ai.fleeMs = 0; ai.strafeDir = this.rng.chance(0.5) ? 1 : -1; ai.strafeMs = this.rules.enemies.kiterStrafeFlipMs;
    ai.wobbleT = 0; ai.wobblePhase = this.rng.float(0, TAU); ai.retreatMs = 0; ai.driftAng = this.rng.float(0, TAU); ai.driftMs = this.rules.enemies.drifterTurnMs;
    ai.wallStunMs = 0; ai.stunKind = ''; ai.seq = null; ai.seqIdx = 0; ai.air = 0; ai.blinkInAt = -1; ai.exploded = false;
    ai.relStep = -99; ai.lockStep = -99; ai.phase = 0; ai.pi = 0; ai.idleMs = 0; ai.approachMs = 0; ai.invulnMs = 0; ai.knockPending = 0;
    ai.clampDamage = isBoss ? ai._clamp : null;
    e.hittable = !portal;
    // body (pooled)
    this._attachBody(e);
    this._live.push(e);
    this.views.attach(e);
    this.stats.spawned++;
    // FTUE: a charge attacker or a ≥ 2-damage attacker enters its portal
    if (portal && !isBoss && (def.attacks || []).some((a) => a.type === 'charge' || (a.damage || 0) >= 2)) {
      ctx.bus.emit(EV.FTUE, 'danger-spawn', { id: def.id, x, y });
    }
    if (portal && !opts.summon && this._waveCueStep !== ctx.time.step) { this._waveCueStep = ctx.time.step; this.fire('wave_spawn'); }
    track('enemy_spawn', { id: def.id, elite, boss: isBoss });
    return e;
  }

  _attachBody(e) {
    const r = e.r;
    let b = this.bodyFree.pop();
    if (!b) {
      b = this.scene.physics.add.body(e.x - r, e.y - r, r * 2, r * 2);
      b.setCollideWorldBounds(false);
      this.allBodies.push(b);
    }
    e.body = b;
    b.setCircle(r);
    b.enable = true;
    b.reset(e.x - r, e.y - r);
    b.setVelocity(0, 0);
    (e.flying ? this.flyerBodies : this.groundBodies).push(b);
  }
  _detachBody(e) {
    const b = e.body; if (!b) return;
    b.setVelocity(0, 0);
    b.enable = false;
    for (let k = 0; k < 2; k++) { const arr = k ? this.flyerBodies : this.groundBodies; const i = arr.indexOf(b); if (i >= 0) { arr[i] = arr[arr.length - 1]; arr.pop(); } }
    e.body = null;
    this.bodyFree.push(b);
  }

  // ================================================================== kill
  kill(e, cause = 'damage') {
    if (!e || !e.alive) return;
    const ctx = this.ctx, ai = e.ai;
    // imp killed mid-fuse with explodeIfKilledDuringWindup → detonates on the kill step (and drops coins)
    if (ai.state === 'windup' && ai.impl && ai.impl.onKilledInWindup && cause !== 'cleanup' && cause !== 'summoner') {
      ai.impl.onKilledInWindup(this, e, ai.atk);
    }
    if (ai.impl && (ai.state === 'windup' || ai.state === 'act' || ai.state === 'airborne')) this._cancelAttack(e, !ai.exploded);
    e.alive = false; e.hittable = false;
    e.killCause = cause; e.deathMs = ctx.time.ms;
    this._detachBody(e);
    this.stats.killed++;
    ctx.combat.onEnemyKilled(e, cause);
    // kill / elite_kill / boss_death cues are fired by the lead's mixer from EV.ENEMY_KILLED (not here)
    // onDeath: slime → slimelets at parent ± 4 px perpendicular to the kill heading, live at once, pushed apart
    const od = e.def.onDeath;
    if (od && od.type === 'spawn' && cause !== 'cleanup') {
      const p = ctx.player;
      let hx = e.x - p.x, hy = e.y - p.y; const hl = Math.hypot(hx, hy) || 1; hx /= hl; hy /= hl;
      const px = -hy, py = hx;
      for (let i = 0; i < od.count; i++) {
        const s = i % 2 === 0 ? 1 : -1, k = 4 * (1 + (i >> 1));
        this.spawn(od.enemyId, e.x + px * k * s, e.y + py * k * s, { portal: false, kbx: px * 80 * s, kby: py * 80 * s, onDeathOf: e.uid });
      }
    }
    // summons die with their summoner (visually staggered 60 ms by distance, telegraphs §4.2)
    // (a boss's adds are removed by its death's cleanup instead: no kill credit, 40 ms stagger)
    if (this.rules.enemies.summonsDieWithSummoner && !e.isBoss) this._killSummons(e);
    if (e.isBoss) this.boss.onKilled(e);
    e.view && e.view.die(cause);
  }

  _killSummons(owner) {
    const list = this._sumList;
    list.length = 0;
    for (let i = 0; i < this._live.length; i++) { const o = this._live[i]; if (o.alive && o.summoner === owner) list.push(o); }
    if (!list.length) return;
    list.sort((a, b) => Math.hypot(a.x - owner.x, a.y - owner.y) - Math.hypot(b.x - owner.x, b.y - owner.y));
    const n = list.length;
    for (let i = 0; i < n; i++) { const o = list[i]; o.deathDelayMs = 60 * i; o.soulTo = owner.uid; o.soulX = owner.x; o.soulY = owner.y; }
    // kill from a private copy: a summon's own death may recurse into this list
    const copy = list.slice(0, n); list.length = 0;
    for (let i = 0; i < n; i++) this.kill(copy[i], 'summoner');
  }

  /** Boss death / room-clear cleanup: no coins, no kill cues. Visual stagger by distance from (x, y). */
  killAll(cause = 'cleanup', fromX, fromY, staggerMs = 0) {
    const it = this._snapshot();
    if (staggerMs && fromX != null) {
      it.sort((a, b) => Math.hypot(a.x - fromX, a.y - fromY) - Math.hypot(b.x - fromX, b.y - fromY));
      let k = 0;
      for (let i = 0; i < it.length; i++) if (it[i].alive) it[i].deathDelayMs = staggerMs * k++;
    }
    for (let i = 0; i < it.length; i++) { const e = it[i]; if (e.alive) this.kill(e, cause); }
    this._unsnap(it);
  }

  countSummons(owner) {
    let n = 0;
    for (let i = 0; i < this._live.length; i++) { const o = this._live[i]; if (o.alive && o.summoner === owner) n++; }
    return n;
  }

  // ================================================================== room lifecycle
  /** Lead hook: called after every room build (old layers are destroyed on room unload). */
  onWorld(world) { this._bindWorld(world); }

  _bindWorld(world) {
    for (const c of this.colliders) c.destroy();
    this.colliders.length = 0;
    this.worldRef = world;
    this.flow.setWorld(world, this.rules.enemies.flowFieldHz);
    if (!world) return;
    const phys = this.scene.physics;
    this.colliders.push(phys.add.collider(this.groundBodies, world.layerGround));
    this.colliders.push(phys.add.collider(this.flyerBodies, world.layerAll));
  }

  /** Room unload: everything goes back to the pools. */
  clear() {
    for (let i = 0; i < this._live.length; i++) {
      const e = this._live[i];
      if (e.alive && e.ai.impl) this._cancelAttack(e, false);
      e.alive = false; e.hittable = false;
      this._detachBody(e);
      e.summoner = null;
    }
    this._live.length = 0;
    this.views.clear();
    for (const h of this.hazards) this.hazFree.push(h);
    this.hazards.length = 0;
    this.tl.clear();
    this.boss.clear();
    for (const c of this.colliders) c.destroy();
    this.colliders.length = 0;
    this.worldRef = null;
  }

  destroy() {
    this.clear();
    for (const b of this.allBodies) b.destroy();
    this.allBodies.length = 0; this.bodyFree.length = 0;
    this.views.destroy();
    this.tl.destroy();
    if (typeof window !== 'undefined' && window.__SW__ && window.__SW__.enemies === this) window.__SW__.enemies = null;
  }

  // ================================================================== step (fixed 60 Hz, sim clock)
  step(dt) {
    const ctx = this.ctx;
    if (ctx.world !== this.worldRef) this._bindWorld(ctx.world);
    if (!ctx.world) return;
    this.tl.tick(dt);
    this._compact();
    const p = ctx.player;
    this.flow.step(dt, p.x, p.y, false);

    const it = this._snapshot();
    for (let i = 0; i < it.length; i++) { const e = it[i]; if (e.alive) this._stepEnemy(e, dt); }
    this._unsnap(it);

    this._separate();
    this._applyVelocities(dt);
    this._contact();
    this._stepHazards(dt);
    this.boss.stepDeaths(dt);
    this.views.step(dt);
  }

  /** Per render frame: views + the telegraph layer (redrawn once per sim step). */
  render(dtMs) {
    this.views.render(dtMs);
    this.tl.redraw();
  }

  _compact() {
    let j = 0;
    const L = this._live;
    for (let i = 0; i < L.length; i++) if (L[i].alive) L[j++] = L[i];
    L.length = j;
  }

  _syncPos(e) {
    const b = e.body;
    if (b && b.enable) { e.x = b.center.x; e.y = b.center.y; }
    e.feetY = e.y + e.feetOff;
  }
  placeBody(e, x, y) {
    e.x = x; e.y = y; e.feetY = y + e.feetOff;
    if (e.body) { e.body.reset(x - e.r, y - e.r); }
  }

  // ------------------------------------------------------------------ per enemy
  _stepEnemy(e, dt) {
    const ai = e.ai, ctx = this.ctx;
    this._syncPos(e);
    ai.t += dt;
    if (ai.blinkInAt >= 0 && ctx.time.step >= ai.blinkInAt) { ai.blinkInAt = -1; this.fire('enemy_blink_in'); }
    if (e.isBoss && this.boss.step(e, dt)) return;

    if (ai.state === 'spawning') {
      ai.mvx = 0; ai.mvy = 0;
      if (ai.t >= this.rules.enemies.spawnPortalMs) { ai.state = 'move'; ai.t = 0; e.hittable = true; }
      return;
    }
    // status-driven: frozen / shock-stunned → no move, no attack, no contact
    const cb = ctx.combat;
    const frozen = cb.isFrozen(e), shocked = cb.isStunned(e);
    if (frozen || shocked) {
      if (ai.state === 'windup' || ai.state === 'act') this.interrupt(e, frozen ? 'freeze' : 'stun');
      if (ai.state !== 'airborne') {
        const st = frozen ? 'frozen' : 'stunned';
        if (ai.state !== st) { ai.state = st; ai.t = 0; ai.stunKind = frozen ? '' : 'shock'; }
        ai.mvx = 0; ai.mvy = 0;
        return;
      }
    } else if (ai.state === 'frozen' || (ai.state === 'stunned' && ai.stunKind === 'shock')) {
      ai.state = 'move'; ai.t = 0;
    }
    switch (ai.state) {
      case 'stunned':            // charge wall-stun (normal damage taken)
        ai.mvx = 0; ai.mvy = 0;
        ai.wallStunMs -= dt;
        if (ai.wallStunMs <= 0) { ai.state = 'move'; ai.t = 0; this._finishAttack(e); }
        return;
      case 'windup': this._runWindup(e, dt); return;
      case 'act': case 'airborne': this._runAct(e, dt); return;
      case 'recover': this._runRecover(e, dt); return;
      case 'approach':
      case 'move':
      default:
        this._move(e, dt);
        if (e.isBoss) this.boss.think(e, dt);
        else { ai.cool -= dt * cb.windupRate(e); this._tryAttack(e); }
    }
  }

  _move(e, dt) {
    const mv = e.def.movement ? getEffect('movement', e.def.movement.type) : null;
    if (mv && mv.step) mv.step(e, this, dt); else { e.ai.mvx = 0; e.ai.mvy = 0; }
  }

  _tryAttack(e) {
    const ai = e.ai, atks = e.def.attacks, ctx = this.ctx, p = ctx.player;
    if (ai.cool > 0 || !atks || !atks.length || !p.alive) return;
    const atk = atks[ai.idx % atks.length];
    if (atk.type === 'summon' && this.countSummons(e) >= atk.maxAlive) {     // already at maxAlive → skipped, cooldown applies
      ai.idx++; ai.cool = atk.cooldownMs || 0; return;
    }
    const dx = p.x - e.x, dy = p.y - e.y;
    if (atk.triggerRange != null && dx * dx + dy * dy > atk.triggerRange * atk.triggerRange) return;       // (b)
    if (atk.needsLos && !ctx.world.hasLos(e.x, e.y, p.x, p.y)) return;                                     // (c)
    if (!this.onScreen(e)) return;                                                                          // (d)
    this.startAttack(e, atk);
  }

  /** (d) the onScreen gate: the attacker's centre inside the camera view inset by onScreenInsetPx. */
  onScreen(e) {
    const er = this.rules.enemies;
    if (!er.attackRequiresOnScreen || !this.ctx.cam) return true;
    return this.ctx.cam.inView(e.x, e.y, er.onScreenInsetPx);
  }

  windupFor(e, atk) {
    const er = this.rules.enemies, curse = this.ctx.curse;
    const w = atk.windupMs * ((curse && curse.windupMult) || 1) * (e.isBoss ? this.boss.windupMult(e) : 1);
    const floor = (atk.damage || 0) >= 2 ? er.heavyTelegraphMinMs : e.isBoss ? er.bossTelegraphMinMs : er.telegraphMinMs;
    return Math.max(w, floor);
  }

  startAttack(e, atk) {
    const ai = e.ai;
    let impl = getEffect('attack', atk.type);
    if (impl.isSequence) {
      ai.seq = atk; ai.seqIdx = 0;
      atk = this._seqStep(e, atk, 0);
      if (!atk) { ai.seq = null; return; }
      impl = getEffect('attack', atk.type);
    }
    this._beginWindup(e, atk, impl);
  }
  _seqStep(e, seq, i) {
    const id = seq.steps[i];
    const a = (e.def.attacks || []).find((x) => x.id === id);
    if (!a) warnOnce(`seq-missing:${e.id}:${id}`, `sequence ${seq.id} names unknown attack "${id}"`);
    return a || null;
  }

  _beginWindup(e, atk, impl) {
    const ai = e.ai, ctx = this.ctx, p = ctx.player;
    ai.atk = atk; ai.impl = impl;
    ai.state = 'windup'; ai.t = 0;
    ai.wElapsed = 0; ai.wTotal = this.windupFor(e, atk);
    ai.locked = false; ai.ticks = null; ai.decN = 0; ai.n = 0; ai.exploded = false; ai.hit = false; ai.lockStep = -99;
    ai.aim = Math.atan2(p.coreY - e.y, p.coreX - e.x);
    ai.mvx = 0; ai.mvy = 0;
    if (impl.begin) impl.begin(this, e, atk);
    if (impl.update) impl.update(this, e, atk, 0);
    this.stats.windups++;
    const heavy = (atk.damage || 0) >= 2;
    ctx.bus.emit(EV.ENEMY_WINDUP, { id: e.id, attack: atk.id, type: atk.type, x: e.x, y: e.y, heavy });
    if (atk.type === 'charge' || heavy) ctx.bus.emit(EV.FTUE, 'danger-windup', { id: e.id, attack: atk.id, x: e.x, y: e.y });
    // mixer routes enemy_windup_<type> to the cue-spec windup_* ids (hazard: {fire:true} → the fire variant)
    this.fire(`enemy_windup_${atk.type}`, atk.type === 'hazard' ? (atk.element === 'fire' ? FIRE_OPT : ACID_OPT) : undefined);
    track('enemy_windup', { id: e.id, attack: atk.id });
  }

  _runWindup(e, dt) {
    const ai = e.ai, ctx = this.ctx, p = ctx.player, atk = ai.atk;
    ai.mvx = 0; ai.mvy = 0;
    ai.wElapsed += dt * ctx.combat.windupRate(e);          // chill stretches the telegraph (R3)
    if (!ai.locked) {
      ai.aim = Math.atan2(p.coreY - e.y, p.coreX - e.x);   // aimed attacks track until the lock
      if (ai.wElapsed >= ai.wTotal - this.lockMs) {
        ai.locked = true; ai.lockStep = ctx.time.step;
        if ((atk.damage || 0) >= 2) this.fire('enemy_lock');
      }
    }
    if (ai.impl.update) ai.impl.update(this, e, atk, Math.min(1, ai.wElapsed / ai.wTotal));
    if (ai.wElapsed >= ai.wTotal) this._release(e);
  }

  _release(e) {
    const ai = e.ai, atk = ai.atk, ctx = this.ctx;
    ai.state = 'act'; ai.t = 0; ai.actT = 0; ai.relStep = ctx.time.step;
    const rc = RELEASE_CUE_GENERIC[atk.type];
    if (rc) this.fire(rc);
    const dur = ai.impl.release ? ai.impl.release(this, e, atk) : 0;
    if (!e.alive) return;
    ai.actDur = dur || 0;
    if (ai.state === 'airborne') return;
    if (ai.actDur <= 0) this._toRecover(e);
  }

  _runAct(e, dt) {
    const ai = e.ai, impl = ai.impl, atk = ai.atk;
    ai.actT += dt * this.ctx.combat.windupRate(e);
    ai.mvx = 0; ai.mvy = 0;
    const res = impl.act ? impl.act(this, e, atk, dt) : 'done';
    if (!e.alive) return;
    if (res === 'stun') {                                   // charge hit a wall/pillar/crate/pit edge
      if (impl.end) impl.end(this, e, atk);
      ai.state = 'stunned'; ai.stunKind = 'wall'; ai.t = 0; ai.seq = null;
      ai.mvx = 0; ai.mvy = 0;
      return;
    }
    if (res === 'done' || ai.actT >= ai.actDur) {
      if (impl.end) impl.end(this, e, atk); else this.removeDecals(e);
      this._toRecover(e);
    }
  }

  _toRecover(e) {
    const ai = e.ai, seq = ai.seq;
    ai.state = 'recover'; ai.t = 0;
    ai.recMs = seq && ai.seqIdx < seq.steps.length - 1 ? (seq.gapMs || 0) : (ai.atk.recoverMs || 0);
    ai.mvx = 0; ai.mvy = 0;
  }

  _runRecover(e, dt) {
    const ai = e.ai;
    ai.mvx = 0; ai.mvy = 0;
    ai.recMs -= dt * this.ctx.combat.windupRate(e);
    if (ai.recMs > 0) return;
    const seq = ai.seq;
    if (seq && ai.seqIdx < seq.steps.length - 1) {          // sequence: next step, its own windup
      ai.seqIdx++;
      const next = this._seqStep(e, seq, ai.seqIdx);
      if (next) { this._beginWindup(e, next, getEffect('attack', next.type)); return; }
    }
    ai.state = 'move'; ai.t = 0;
    this._finishAttack(e);
  }

  /** Attack fully done (recover elapsed or wall-stun over): cooldown, cycle, boss idle. */
  _finishAttack(e) {
    const ai = e.ai;
    const done = ai.seq || ai.atk;
    ai.seq = null;
    if (e.isBoss) { this.boss.onAttackDone(e); return; }
    ai.cool = (done && done.cooldownMs) || 0;
    ai.idx++;
  }

  /** Combat → e.ai.onInterrupt('stun'|'freeze'): cancel the windup, fizzle, cooldown × interruptCooldownFrac. */
  interrupt(e, reason) {
    const ai = e.ai;
    if (!e.alive || !ai.impl) return;
    if (ai.state !== 'windup' && ai.state !== 'act') return;
    if (ai.state === 'act' && ai.actDur <= 0) return;
    const atk = ai.seq || ai.atk;
    this._cancelAttack(e, true);
    this.stats.interrupts++;
    ai.cool = (atk.cooldownMs || 0) * this.rules.status.shock.interruptCooldownFrac;
    ai.seq = null;
    ai.state = reason === 'freeze' ? 'frozen' : 'stunned'; ai.stunKind = reason === 'freeze' ? '' : 'shock'; ai.t = 0;
    ai.mvx = 0; ai.mvy = 0;
    track('enemy_interrupt', { id: e.id, attack: atk.id, reason });
  }

  /** Abort the current attack (interrupt, death, boss phase change). fizzle=true → grey 100 ms fade + smoke. */
  _cancelAttack(e, fizzle) {
    const ai = e.ai;
    if (ai.impl && ai.impl.cancel) ai.impl.cancel(this, e, ai.atk);
    if (ai.impl && ai.impl.end && ai.state === 'act') ai.impl.end(this, e, ai.atk);
    let any = false;
    for (let i = 0; i < ai.decN; i++) {
      const d = ai.dec[i];
      if (!d) continue;
      if (fizzle) { this.tl.toFizzle(d); if (!any) this.ctx.fx.particles('smoke', d.x, d.y, 3, { color: 0x8a8a8a, speed: 10, lifeMs: 300 }); any = true; }
      else this.tl.remove(d);
      ai.dec[i] = null;
    }
    ai.decN = 0; ai.ticks = null;
    if (fizzle && ai.state === 'windup') {
      if (!any) this.ctx.fx.particles('smoke', e.x, e.y - 2, 3, { color: 0x8a8a8a, speed: 10, lifeMs: 300 });
      this.fire('enemy_interrupt');
    }
    e.immovable = false;
    if (e.body && !e.body.enable && e.alive) { e.body.enable = true; this.placeBody(e, e.x, e.y); }
    if (e.alive && !e.invuln && ai.state !== 'spawning') e.hittable = true;
    ai.impl = null;
  }

  // ------------------------------------------------------------------ crowd separation, velocities, contact
  _separate() {
    const L = this._live, n = L.length;
    for (let i = 0; i < n; i++) {
      const a = L[i];
      if (!a.alive || a.ai.state === 'airborne') continue;
      for (let j = i + 1; j < n; j++) {
        const b = L[j];
        if (!b.alive || b.flying !== a.flying || b.ai.state === 'airborne') continue;
        const dx = b.x - a.x, dy = b.y - a.y, rr = a.r + b.r;
        const d2 = dx * dx + dy * dy;
        if (d2 >= rr * rr) continue;
        const d = Math.sqrt(d2) || 0.01;
        const push = Math.min(60, (rr - d) * 10);
        const nx = d2 > 0.0001 ? dx / d : 1, ny = d2 > 0.0001 ? dy / d : 0;
        const fa = this._pinned(a), fb = this._pinned(b);
        if (fa && fb) continue;
        const ka = fa ? 0 : fb ? 1 : 0.5, kb = fb ? 0 : fa ? 1 : 0.5;
        a.ai.mvx -= nx * push * ka * 2; a.ai.mvy -= ny * push * ka * 2;
        b.ai.mvx += nx * push * kb * 2; b.ai.mvy += ny * push * kb * 2;
      }
    }
  }
  _pinned(e) { return e.isBoss || e.stationary || e.immovable || e.ai.state === 'spawning' || e.kbResist >= 1; }

  _applyVelocities(dt) {
    const L = this._live, decay = (this.knockDecay * dt) / 1000;
    for (let i = 0; i < L.length; i++) {
      const e = L[i];
      if (!e.alive || !e.body || !e.body.enable) continue;
      if (e.immovable || e.kbResist >= 1 || e.stationary) { e.kbVx = 0; e.kbVy = 0; }
      else {
        const k = Math.hypot(e.kbVx, e.kbVy);
        if (k > 0) { const nk = Math.max(0, k - decay); e.kbVx *= nk / k; e.kbVy *= nk / k; }
      }
      e.body.setVelocity(e.ai.mvx + e.kbVx, e.ai.mvy + e.kbVy);
    }
  }

  _contact() {
    const p = this.ctx.player;
    if (!p.alive) return;
    const L = this._live;
    for (let i = 0; i < L.length; i++) {
      const e = L[i];
      if (!e.alive || e.contactDamage <= 0) continue;
      const st = e.ai.state;
      if (st === 'spawning' || st === 'frozen' || st === 'airborne' || st === 'intro' || st === 'dead') continue;
      if (st === 'stunned' && e.ai.stunKind === 'shock') continue;
      if (st === 'act' && e.ai.atk && e.ai.atk.type === 'charge') continue;     // the charge applies its own hit
      const dx = p.coreX - e.x, dy = p.coreY - e.y, rr = e.r + p.hurtR;
      if (dx * dx + dy * dy > rr * rr) continue;
      if (!p.canBeHit()) continue;
      if (this.hurtPlayer(e, e.contactDamage, 'contact') && e.def.movement && e.def.movement.type === 'swarm') {
        e.ai.retreatMs = e.def.movement.retreatMs || 0;                         // swarm: flee after contact
      }
    }
  }

  // ------------------------------------------------------------------ hazards (active pools outlive their caster's attack)
  addHazard(x, y, atk, owner) {
    const h = this.hazFree.pop() || {};
    const look = HAZARD_LOOK[atk.element] || HAZARD_LOOK.poison;
    h.x = x; h.y = y; h.r = atk.radius; h.dmg = atk.damage; h.element = atk.element; h.dur = atk.durationMs; h.tick = atk.tickMs;
    h.t = 0; h.nextTick = 0; h.inside = false; h.flashT = 1e9; h.ownerId = owner ? owner.id : 'hazard'; h.look = look; h.fxT = 0;
    const d = this.tl.add('hazardActive', 0, true);
    if (d) { d.x = x; d.y = y; d.r = atk.radius; d.fillColor = look.fill; d.fillAlpha = look.alpha; d.innerColor = look.inner; }
    h.decal = d;
    this.hazards.push(h);
    return h;
  }
  _stepHazards(dt) {
    const p = this.ctx.player;
    for (let i = this.hazards.length - 1; i >= 0; i--) {
      const h = this.hazards[i];
      h.t += dt; h.flashT += dt; h.fxT += dt;
      if (h.t >= h.dur) {                                         // damage ends, THEN the harmless fade starts
        if (h.decal) this.tl.toFade(h.decal, 200);
        this.hazards[i] = this.hazards[this.hazards.length - 1]; this.hazards.pop(); this.hazFree.push(h);
        continue;
      }
      let tickNow = false;
      if (h.t >= h.nextTick) { tickNow = true; h.nextTick += h.tick; h.flashT = 0; }
      const dx = p.coreX - h.x, dy = p.coreY - h.y;
      const inside = p.alive && dx * dx + dy * dy <= h.r * h.r;
      if (inside && (!h.inside || tickNow)) this._hurtRaw(h.ownerId, h.dmg, 'hazard');   // on entry and every tickMs
      h.inside = inside;
      if (h.decal) { h.decal.tick = clamp(1 - h.flashT / 200, 0, 1); h.decal.blink = h.dur - h.t <= 500; }
      if (h.fxT >= 400) { h.fxT = 0; this.ctx.fx.particles(h.look.particle, h.x + this.fxRng.float(-h.r * 0.6, h.r * 0.6), h.y + this.fxRng.float(-h.r * 0.4, h.r * 0.4), 1, { color: h.look.inner, speed: 6, lifeMs: 600 }); }
    }
  }
  clearHazards() {
    for (const h of this.hazards) { if (h.decal) this.tl.toFade(h.decal, 200); this.hazFree.push(h); }
    this.hazards.length = 0;
  }

  // ================================================================== services used by attacks / bosses / views
  slow(e) { return this.ctx.combat.slowFactor(e); }
  fire(cue, opts) { const m = this.ctx.mixer; if (m && cue) m.fire(cue, opts); }

  hurtPlayer(e, dmg, kind) { return this._hurtRaw(e ? e.id : null, dmg, kind); }
  _hurtRaw(enemyId, dmg, kind) {
    const p = this.ctx.player;
    if (!p || !p.alive || !(dmg > 0)) return false;
    return p.hurt(dmg, { kind, enemyId });
  }

  /** Enemy bullet; floor enemyProjSpeedMult is applied HERE (sim-contract §2 ctx.shots). */
  bullet(e, x, y, angleDeg, speed, proj, damage) {
    const o = this._bo;
    o.x = x; o.y = y; o.angleDeg = angleDeg; o.speed = speed * (this.ctx.floor.enemyProjSpeedMult || 1);
    o.radius = (proj && proj.radius) || 3; o.element = (proj && proj.element) || 'arcane'; o.lifetimeMs = (proj && proj.lifetimeMs) || 3000;
    o.damage = damage ?? 1; o.ownerUid = e ? e.uid : 0;
    return this.ctx.shots.enemyBullet(o);
  }

  decal(e, kind, damaging) {
    const ai = e.ai;
    if (ai.decN >= ai.dec.length) return null;
    const d = this.tl.add(kind, e.uid, damaging);
    ai.dec[ai.decN++] = d;
    return d;
  }
  flashDecals(e) {
    const ai = e.ai;
    for (let i = 0; i < ai.decN; i++) { const d = ai.dec[i]; if (d) { if (d.kind === 'aimTicks' || d.kind === 'aimLines' || d.kind === 'spokes' || d.kind === 'pulseRing') this.tl.remove(d); else this.tl.toFlash(d); } ai.dec[i] = null; }
    ai.decN = 0; ai.ticks = null;
  }
  removeDecals(e) {
    const ai = e.ai;
    for (let i = 0; i < ai.decN; i++) { if (ai.dec[i]) this.tl.remove(ai.dec[i]); ai.dec[i] = null; }
    ai.decN = 0; ai.ticks = null;
  }

  /** Debug/verification helpers (console: __SW__.enemies.debug.*). */
  get debug() {
    return {
      list: () => this._live.filter((e) => e.alive).map((e) => ({ uid: e.uid, id: e.id, hp: +e.hp.toFixed(1), state: e.ai.state, atk: e.ai.atk && e.ai.atk.id, x: e.x | 0, y: e.y | 0 })),
      decals: () => this.tl.live.map((d) => `${d.kind}:${d.mode}${d.locked ? ':L' : ''}`),
      stats: () => ({ ...this.stats, live: this.aliveCount(), hazards: this.hazards.length, decals: this.tl.live.length }),
    };
  }
}

export { ACTOR };
