// RunScene — owns a run (scene-flow.md §1/§4, architecture §4, sim-contract §1).
// ONE CLOCK: all gameplay runs in simStep(), subscribed to Arcade's 'worldstep' (60 Hz fixed). Presentation
// (views, particles, rings, world HUD) runs per render frame in update(); both freeze together under hit-stop
// because TimeControl pauses this whole scene (state-graph R3).

import Phaser from '../../lib/phaser.esm.min.js';
import { VIEW_W, VIEW_H, SIM_HZ, DEBUG, TILE } from '../config.js';
import { EV, listen } from '../core/events.js';
import { freshSeed } from '../core/rng.js';
import { T } from '../core/tunables.js';
import { Save } from '../core/save.js';
import { track } from '../core/log.js';
import { cat } from '../data/catalog.js';
import { RunState } from '../run/RunState.js';
import { evaluateMilestones, nextGoals } from '../run/meta.js';
import { Fx } from '../sim/Fx.js';
import { CameraRig } from '../sim/Camera.js';
import { Combat } from '../sim/Combat.js';
import { ShotSystem } from '../sim/Shots.js';
import { ZoneSystem } from '../sim/Effects.js';
import { Player } from '../sim/Player.js';
import { Caster, applyAimAssist } from '../sim/Caster.js';
import { AutoAim } from '../sim/AutoAim.js';
import { Pickups } from '../sim/Pickups.js';
import { RelicSystem } from '../sim/Relics.js';
import { RoomDirector } from '../sim/RoomDirector.js';
import { EnemySystem as EnemyStub } from '../sim/EnemyStub.js';

const DT_MS = 1000 / SIM_HZ;

export class RunScene extends Phaser.Scene {
  constructor() { super('run'); }

  init(data) { this.initData = data || {}; }

  create() {
    const reg = this.registry;
    this.bus = reg.get('bus');
    this.router = reg.get('router');
    this.flow = reg.get('flow');
    this.mixer = reg.get('mixer');
    this.perf = reg.get('perf');
    const C = cat();
    const d = this.initData;
    this.router.clearHeld();
    this.router.resetCastLatch();

    // ---- run state ----
    const loadoutId = d.loadoutId && C.loadouts[d.loadoutId] && Save.isUnlocked('loadouts', d.loadoutId) ? d.loadoutId : (Save.meta.lastLoadout && C.loadouts[Save.meta.lastLoadout] && Save.isUnlocked('loadouts', Save.meta.lastLoadout) ? Save.meta.lastLoadout : 'apprentice');
    const curseLevel = Save.isUnlocked('features', 'curses') ? (d.curseLevel ?? Save.meta.curseLevel ?? 0) : 0;
    const run = this.run = new RunState({
      seed: d.seed ?? freshSeed(), cat: C, loadoutId, curseLevel,
      tutorial: !Save.flag('tutorialDone'),
      isUnlocked: Save.isUnlocked.bind(Save), emit: (e, ...a) => this.bus.emit(e, ...a),
    });
    Save.setMeta('lastLoadout', loadoutId);
    reg.set('run', run);

    // ---- ctx (sim-contract §1) ----
    const ctx = this.ctx = {
      scene: this, run, cat: C, rules: C.rules, T, bus: this.bus, mixer: this.mixer, rng: run.rng,
      time: { ms: 0, step: 0, dt: DT_MS }, floor: null, curse: run.curse || null, heat: run.heat || null,   // heat: rules.heat.levels[n] (bosses, director)
      world: null, player: null, enemies: null, shots: null, combat: null, fx: null, cam: null, zones: null, pickups: null, relics: null, director: null,
      flags: { reducedMotion: Save.reducedMotion, lethalOccurred: false, victory: false },
      intent: null, lastElement: 'arcane', emphasis: Save.settings.enemyShotEmphasis === 'high',
      onWorldBuilt: () => this._onWorldBuilt(),
      onPlayerDeathDone: () => this.endRun('death'),
      onVictory: () => this._victory(),
      transition: (fn) => this._transition(fn),
      openOverlay: (key, data) => this.openOverlay(key, data),
      askConfirm: (kind, cb) => this._askConfirm(kind, cb),
      setFloor: (n) => this._setFloor(n),
    };
    this._setFloor(run.floor);
    ctx.fx = new Fx(ctx);
    ctx.cam = new CameraRig(ctx);
    ctx.combat = new Combat(ctx);
    ctx.relics = new RelicSystem(ctx);
    ctx.shots = new ShotSystem(ctx);
    ctx.zones = new ZoneSystem(ctx);
    ctx.pickups = new Pickups(ctx);
    const mods = reg.get('mods') || {};
    const Enemies = mods.EnemySystem || EnemyStub;
    ctx.enemies = new Enemies(ctx);
    this.usingEnemyStub = Enemies === EnemyStub;
    ctx.player = new Player(ctx, 100, 100);
    this.caster = new Caster(ctx);
    this.autoAim = new AutoAim(ctx);
    ctx.director = new RoomDirector(ctx);
    const WorldHud = mods.WorldHud;
    this.worldHud = WorldHud ? new WorldHud(this) : null;

    // ---- listeners ----
    listen(this, this.bus, EV.CARD_OVERFLOW, (ids) => { const p = ctx.player; ids.forEach((id, i) => ctx.pickups.card(p.x + (i - ids.length / 2) * 18, p.y + 16, id)); });
    listen(this, this.bus, EV.SETTINGS_CHANGED, () => { ctx.flags.reducedMotion = Save.reducedMotion; ctx.emphasis = Save.settings.enemyShotEmphasis === 'high'; });
    listen(this, this.bus, EV.WAND_ACTIVE, () => ctx.player && ctx.player._wandSkin());
    // codex discovery (screen-graph S1b): seen in a draft, in shop stock, or owned
    const disc = (id) => { if (C.cards[id]) Save.discover('cards', id); else if (C.relics[id]) Save.discover('relics', id); };
    listen(this, this.bus, EV.REWARD_OFFER, (o) => o && o.items.forEach(disc));
    listen(this, this.bus, EV.SHOP_CHANGED, () => run.shop && run.shop.stock.forEach((it) => it.id && disc(it.id)));
    listen(this, this.bus, EV.CARD_GAINED, disc);
    listen(this, this.bus, EV.RELIC_GAINED, disc);
    for (const w of run.wands) w.state.slots.forEach((id) => id && disc(id));
    listen(this, this.bus, EV.PLAYER_HP, (hp) => {                      // low-HP state clears on heal (hud-layout §3.4)
      const p = ctx.player; if (!p) return;
      const low = hp > 0 && hp <= 2;
      if (low !== p.lowHp) { p.lowHp = low; this.bus.emit(EV.LOW_HP, low); }
    });

    this.physics.world.on('worldstep', this.simStep, this);
    this.events.once('shutdown', this.onShutdown, this);
    this.input.setDefaultCursor('none');
    if (DEBUG) this._debugKeys();

    // dev harness (?harness=floor:N:step:M, ui/devHarness.js): start on floor N, then jump straight into step M
    const H = d.harness || null;
    if (H && !H.tpl && typeof location !== 'undefined') { const v = new URLSearchParams(location.search).get('tpl'); if (v) H.tpl = v.replace(/[^\w-]/g, ''); }
    if (H) { run.floor = Math.max(1, Math.min(3, H.floor | 0)); run.stats.maxFloor = Math.max(run.stats.maxFloor, run.floor); this._setFloor(run.floor); }
    this.scene.launch('hud');
    this.bus.emit(EV.RUN_START, run);
    this.bus.emit(EV.FLOOR_ENTER, { floor: run.floor, name: this._floorDef().name });
    if (H) ctx.director.jumpTo(run.floor, H.step, H);
    else ctx.director.enterRoom({ room: 'start', reward: null });
    if (DEBUG || H) this._roomApi();
    ctx.cam.snap();
    this.cameras.main.fadeIn(T('roomFadeMs'));
    track('run_start', { seed: run.seed, loadout: loadoutId, curse: curseLevel });
    this._emitInitial();
  }

  _floorDef() { return this.ctx.cat.floors[`f${this.run.floor}`]; }
  _setFloor(n) {
    const fd = this.ctx.cat.floors[`f${n}`];
    const heatShot = (this.run.heat && this.run.heat.enemyProjSpeedMult) || 1;          // Heat 3+: enemy shots faster (design-v2 §11)
    this.ctx.floor = { index: n, hpMult: fd.hpMult, enemyProjSpeedMult: (fd.enemyProjSpeedMult || 1) * heatShot, coinMult: fd.coinMult, def: fd };
  }

  _emitInitial() {
    const run = this.run;
    this.bus.emit(EV.PLAYER_HP, run.hp, run.maxHp);
    this.bus.emit(EV.PLAYER_GOLD, run.coins, 0);
    this.bus.emit(EV.WAND_CHANGED, -1);
    this.bus.emit(EV.WAND_ACTIVE, run.activeWand);
  }

  /** Called by RoomDirector after a World is built: place the player, rebuild colliders, size the hash, snap the camera. */
  _onWorldBuilt() {
    const ctx = this.ctx, w = ctx.world, p = ctx.player;
    if (this.playerCollider) this.playerCollider.destroy();
    p.setPosition(w.markers.player.x, w.markers.player.y);
    p.body.setVelocity(0, 0);
    this.playerCollider = this.physics.add.collider(p.body, w.layerGround);
    ctx.shots.resize(w);
    if (ctx.enemies.onWorld) ctx.enemies.onWorld(w);
    ctx.cam.snap();
    p._setBody('spawn');
  }

  // ================================================================== the fixed step
  simStep() {
    const t0 = performance.now();
    // feel-spec §flow (v2): death slow-mo — the sim runs at deathTimeScale for deathSlowMoMs after the lethal hit
    // (fixed step kept: whole steps are skipped, so determinism per step is unchanged)
    if (this.ctx.deathAt && t0 - this.ctx.deathAt < T('deathSlowMoMs', 500)) {
      this._slowAcc = (this._slowAcc || 0) + T('deathTimeScale', 0.35);
      if (this._slowAcc < 1) return;
      this._slowAcc -= 1;
    }
    const ctx = this.ctx, run = this.run;
    ctx.time.ms += DT_MS; ctx.time.step++;
    run.stats.timeFrames++;
    const p = ctx.player, cam = ctx.cam;
    const it = this.router.sample(p.coreX - cam.view.x, p.coreY - cam.view.y);
    it.aimWorldX = it.aimScreenX + cam.view.x; it.aimWorldY = it.aimScreenY + cam.view.y;
    ctx.intent = it;
    // touch (mobile-touch-spec §3.3): 'auto' → AutoAim picks target, aim and cast; otherwise the marker clears
    if (it.aimSource === 'auto') this.autoAim.apply(it, DT_MS);
    else if (this.autoAim.target) this.autoAim.clear();
    ctx.autoTarget = this.autoAim.target;
    applyAimAssist(ctx, it);

    // cast press/release tracking (FTUE P2b tap detection)
    if (this._prevHeld && !it.castHeld) this.bus.emit(EV.FTUE, 'cast-release', { holdMs: this._holdMs || 0 });
    this._holdMs = it.castHeld ? (this._holdMs || 0) + DT_MS : 0;
    this._prevHeld = it.castHeld;

    if (p.alive && p.controllable && !this.transitioning) {
      if (it.pause) { this.openOverlay('pause', { tab: 'menu' }); return; }
      if (it.openInventory) { this.openOverlay('pause', { tab: 'wands' }); return; }
      if (it.interactPressed) ctx.pickups.interact();
    }

    p.step(it, DT_MS);
    this.caster.step(it, DT_MS);
    if (ctx.world) {
      ctx.enemies.step(DT_MS);
      ctx.shots.step(DT_MS);
      ctx.zones.step(DT_MS);
      ctx.combat.stepStatuses(DT_MS);
      ctx.pickups.step(DT_MS);
      ctx.director.step(DT_MS);
    }
    ctx.fx.step(DT_MS);
    ctx.cam.step(DT_MS);

    const dt = performance.now() - t0;
    this.perf.simMs = this.perf.simMs * 0.9 + dt * 0.1;
    this.perf.proj = ctx.shots.live.length; this.perf.enemies = ctx.enemies.aliveCount(); this.perf.steps = ctx.time.step;
  }

  /** Presentation, per render frame (the scene pauses entirely under hit-stop and overlays). */
  update(time, delta) {
    const ctx = this.ctx;
    if (!ctx || !ctx.player) return;
    // feel-spec §flow: the run-end screen appears deathToRunEndMs after the lethal hit (the 250 ms fade is inside it)
    if (ctx.deathAt && !this.run.ended && performance.now() - ctx.deathAt >= T('deathToRunEndMs', 1100) - 250) this.endRun('death');
    ctx.player.syncView(delta);
    if (ctx.world) {
      if (ctx.enemies.render) ctx.enemies.render(delta);
      ctx.zones.render();
      ctx.pickups.render(delta);
      ctx.director.render();
    }
    ctx.fx.render(delta);
    if (this.worldHud) this.worldHud.update(delta);
  }

  // ================================================================== overlays & confirm
  openOverlay(key, data = {}) {
    if (this.transitioning || this.run.ended || !this.ctx.player.alive) return false;
    this.router.clearHeld();
    return this.flow.open(key, data);
  }

  _askConfirm(kind, cb) {
    const TEXT = { leaveReward: { text: 'Leave the reward behind?', options: [{ label: 'Go back', value: false }, { label: 'Leave it', value: true }] } };
    const d = TEXT[kind];
    if (!this.flow.open('confirm', { ...d, safeIndex: 0, onResult: cb })) cb(false);
  }

  // ================================================================== transitions
  _transition(fn) {
    if (this.transitioning) return;
    this.transitioning = true;
    const ctx = this.ctx, cam = this.cameras.main, ms = T('roomFadeMs');
    ctx.player.controllable = false;
    ctx.player.body.setVelocity(0, 0);
    cam.fadeOut(ms, 0, 0, 0);
    cam.once('camerafadeoutcomplete', () => {
      ctx.director.unload();
      fn();
      ctx.cam.snap();
      cam.fadeIn(ms, 0, 0, 0);
      cam.once('camerafadeincomplete', () => {
        this.transitioning = false;
        ctx.player.controllable = true;
        this.bus.emit(EV.FTUE, 'room-fade-end');
      });
    });
  }

  // ================================================================== run end
  _victory() {
    const ctx = this.ctx;
    if (ctx.flags.victory) return;
    ctx.flags.victory = true;
    ctx.player.controllable = false;
    ctx.enemies.killAll('cleanup');
    ctx.shots.clearEnemyBullets({ pop: true });
    this.mixer.fire('victory');
    this.time.delayedCall(2000, () => this.endRun('victory'));      // 2 s victory beat (progression §8)
  }

  endRun(outcome) {
    const run = this.run;
    if (run.ended) return;
    run.end(outcome, run.stats.killer);
    this.router.resetCastLatch();
    this.registry.get('time').cancel();
    const summary = run.summary();
    Save.recordRun(summary);
    const milestones = evaluateMilestones(this.ctx.cat, Save, summary);
    const goals = nextGoals(this.ctx.cat, Save, 2);
    track('run_end', { outcome, floor: summary.floor, kills: summary.kills, milestones: milestones.map((m) => m.id) });
    this.flow.clear();
    this.cameras.main.fadeOut(250, 0, 0, 0);
    this.cameras.main.once('camerafadeoutcomplete', () => {
      this.scene.stop('hud');
      this.scene.start('run-end', { summary, milestones, nextGoals: goals });
    });
  }

  // ================================================================== HUD probe (ui-contract §3)
  hudProbe() {
    const ctx = this.ctx, p = ctx.player, run = this.run, w = run.wand, d = ctx.director;
    const near = { crateDist: Infinity, enemyDist: Infinity, interact: null, doors: [], pedestals: [], shopDist: Infinity, hasDangerEnemy: false };
    if (ctx.world) {
      for (const i of ctx.world.crateHp.keys()) { const cx = (i % ctx.world.cols) * TILE + 8, cy = Math.floor(i / ctx.world.cols) * TILE + 8; near.crateDist = Math.min(near.crateDist, Math.hypot(cx - p.x, cy - p.y)); }
      ctx.enemies.forEachAlive((e) => { near.enemyDist = Math.min(near.enemyDist, Math.hypot(e.x - p.x, e.y - p.y)); });
      for (const dr of d.doorsOpen) near.doors.push({ x: dr.x, y: dr.y, roomKind: dr.option.room, reward: dr.option.reward, choice: dr.kind === 'choice' || d.doorsOpen.length > 1, label: null });
      for (const x of ctx.pickups.interacts) {
        if (x.kind === 'pedestal') near.pedestals.push({ x: x.x, y: x.y, kind: x.rewardKind, count: x.count, taken: !run.offer || run.offer.taken || run.offer.roomKey !== x.roomKey });
        if (x.kind === 'shop-item' || x.kind === 'shopkeeper') near.shopDist = Math.min(near.shopDist, Math.hypot(x.x - p.x, x.y - p.y));
      }
      // elites (HP bar once damaged) and off-screen chevrons when ≤ 2 remain (hud-layout §3.3)
      near.elites = []; near.offscreen = [];
      const alive = ctx.enemies.aliveCount();
      const v = ctx.cam.view;
      // defence types present on living enemies (contract §1; HUD counter pips, hud-layout §9.3): 1 shield · 2 armour · 4 ward
      let defMask = 0;
      ctx.enemies.forEachAlive((e) => {
        const dt = e.defence && e.defence.type;
        if (dt) defMask |= dt === 'shield' ? 1 : dt === 'armour' ? 2 : dt === 'ward' ? 4 : 0;
        const spr = e.view && e.view.sprite;
        const top = spr ? spr.y - spr.displayHeight * spr.originY : e.y - (e.r + 8);
        if (e.elite && !e.isBoss) near.elites.push({ x: e.x, y: top, hpFrac: Math.max(0, e.hp / e.maxHp), damaged: e.hp < e.maxHp });
        if (alive <= 2 && !ctx.cam.inView(e.x, e.y, 0)) near.offscreen.push({ x: e.x, y: e.y });
      });
      near.defences = defMask;
      // HUD occlusion (hud-layout §3.2): bit set when the player, an enemy or an enemy bullet sits under a corner cluster
      const boxes = [[1, 0, 0, 160, 44], [2, 170, 0, 300, 30], [4, 480, 0, 160, 40], [8, 0, 314, 272, 46]];
      let mask = 0;
      const test = (wx, wy) => { const sx = wx - v.x, sy = wy - v.y; for (const [bit, bx, by, bw, bh] of boxes) if (sx >= bx && sx < bx + bw && sy >= by && sy < by + bh) mask |= bit; };
      test(p.coreX, p.coreY);
      ctx.enemies.forEachAlive((e) => test(e.x, e.y));
      for (const sh of ctx.shots.live) if (sh.alive && sh.team === 1) test(sh.x, sh.y);
      this._occl = mask;
      const n = ctx.pickups.nearest;
      near.interact = n ? { kind: n.kind, verb: n.verb, x: n.x, y: n.y - (n.promptOffset ?? 12), label: n.label } : null;
    }
    return {
      player: { x: p.feetX, y: p.feetY, coreX: p.coreX, coreY: p.coreY, aimX: p.aimX, aimY: p.aimY, speed: p.speed, moving: p.speed > 1, alive: p.alive,
        dashCharges: p.dashCharges, dashMax: p.dashMax, dashRefillFrac: p.dashRefillFrac, slowed: p.slowMs > 0 },
      wand: w ? { index: run.activeWand, recharging: w.state.rechargeTimerMs > 0, rechargeFrac: w.state.rechargeTimerMs > 0 ? w.state.rechargeTimerMs / Math.max(1, this._lastRechargeTotal(w)) : 0,
        castReady: w.state.castTimerMs <= 0 && w.state.rechargeTimerMs <= 0, holdMs: this._holdMs || 0 } : null,
      camera: { scrollX: ctx.cam.view.x, scrollY: ctx.cam.view.y },
      room: { kind: d.room && d.room.kind, templateId: d.room && d.room.templateId, cleared: d.cleared, twist: d.room && d.room.twist, puzzle: !!(d.room && d.room.puzzle), inCombat: d.combatActive && ctx.enemies.aliveCount() > 0,
        enemiesAlive: ctx.enemies.aliveCount(), controllable: p.alive && p.controllable && !this.transitioning && !ctx.flags.victory && !(d.boss && d.boss.introMs > 0) },
      near,
      hudOcclusion: this._occl || 0,
    };
  }
  _lastRechargeTotal(w) {
    if (w.state.rechargeTimerMs > (w._rtTotal || 0) || !w._rtTotal) w._rtTotal = w.state.rechargeTimerMs;
    if (w.state.rechargeTimerMs <= 0) w._rtTotal = 0;
    return w._rtTotal || w.state.rechargeTimerMs;
  }

  // ================================================================== debug (?debug)
  _debugKeys() {
    const kb = this.input.keyboard, ctx = this.ctx, run = this.run;
    kb.on('keydown-F4', () => { this.god = !this.god; ctx.player.iframesMs = this.god ? 1e12 : 0; this.bus.emit(EV.TOAST, { text: `God mode ${this.god ? 'on' : 'off'}`, kind: 'info' }); });
    kb.on('keydown-F6', () => ctx.enemies.killAll('damage'));
    kb.on('keydown-F7', () => this._debugJump(99));
    kb.on('keydown-F8', () => { this._transition(() => ctx.director.nextFloor()); });
    kb.on('keydown-F9', () => {
      run.addCoins(200);
      const pool = ctx.cat.relicList.filter((r) => !run.hasRelic(r.id));
      if (pool.length) run.addRelic(ctx.rng.fx.pick(pool).id);
      for (const id of ['double_cast', 'trigger_hit', 'fireball', 'chain_lightning', 'ice_shard', 'damage_up']) run.addCard(id);
    });
    kb.on('keydown-F10', () => this._victory());
    kb.on('keydown-K', () => { ctx.player.iframesMs = 0; ctx.player.dashIframesMs = 0; this.run.setShield(0); ctx.player.hurt(99, { kind: 'debug' }); });
    kb.on('keydown-J', () => this._debugJump(ctx.director.room ? ctx.run.step + 1 : 1));
  }
  /** Jump to step `n` of the current floor (clamped: ≥ the last step = boss). */
  _debugJump(n, force = {}) {
    const ctx = this.ctx, last = this._floorDef().steps.length - 1;
    this._transition(() => ctx.director.jumpTo(this.run.floor, Math.min(last, n), force));
  }

  /**
   * Room-flow verification API (?debug or a floor harness): window.__SW__.room
   *   jump(floor, step, {room, threat, twist, risk, doorThreat, riskDoor, tpl}) · doors({threat, risk}) (forces the NEXT door roll)
   *   clear() (kills every enemy) · state() (room, waves, threat, twist, upcomingKeyword, world)
   * Worlds (worlds.md §3): twist may be a WORLD twist — 'candlelight' | 'flooded' | 'bookshelves' — forced into this room
   * in any world (URL: ?debug&harness=floor:N:step:M&twist=flooded[&tpl=<rooms.json id>]). Probes:
   *   wade() puts the player on the first water cell · zap(dmg) lands a shock hit on an in-water enemy (arc check)
   *   ignite() / chip(dmg) / blast() act on the first bookshelf · world() = the twist summary (also in state().world)
   */
  _roomApi() {
    const scene = this;
    const api = {
      jump: (floor, step, force = {}) => scene._transition(() => scene.ctx.director.jumpTo(floor, step, force)),
      doors: ({ threat = null, risk = false } = {}) => { const f = scene.ctx.director.force; f.doorThreat = threat; f.riskDoor = !!risk; return f; },
      clear: () => scene.ctx.enemies.killAll('damage'),
      state: () => {
        const d = scene.ctx.director, r = d.room || {};
        return { floor: scene.run.floor, step: scene.run.step, kind: r.kind, template: r.templateId, puzzle: r.puzzle, risk: r.risk,
          threat: r.threat ? r.threat.id : null, twist: r.twist, waves: d.waves.map((w) => w.map((u) => (u.elite ? '*' : '') + u.id)),
          waveIndex: d.waveIndex, pending: d.pending.length, killedFrac: d._killedFrac(), upcomingKeyword: scene.run.upcomingKeyword ?? null,
          doors: d.doorsOpen.map((x) => ({ ...x.option })), world: api.world() };
      },
      world: () => {
        const c = scene.ctx, w = c.world, r = c.director.room || {};
        if (!w) return null;
        let wet = 0; c.enemies.forEachAlive((e) => { if (c.combat._inWater(e)) wet++; });
        return { id: w.worldId, tileset: w.texKey, twist: r.worldTwist || null, water: w.waterCount, enemiesInWater: wet,
          shelves: w.shelves ? w.shelves.size : 0, burning: w.shelves ? [...w.shelves.values()].filter((x) => x.burnMs > 0).length : 0,
          candles: w.lights.length, darkness: !!c.director.dark, darkAlpha: c.director.dark ? c.director.dark.alpha : 0 };
      },
      wade: () => {
        const c = scene.ctx, w = c.world; if (!w || !w.water) return false;
        const i = w.water.indexOf(1); const p = w.cellCenter(i);
        c.player.setPosition(p.x, p.y); c.player.body.setVelocity(0, 0);
        return p;
      },
      zap: (dmg = 6) => {
        const c = scene.ctx; let target = null;
        c.enemies.forEachAlive((e) => { if (!target && c.combat._inWater(e)) target = e; });
        if (!target) return null;
        const before = new Map(); c.enemies.forEachAlive((e) => before.set(e.uid, e.hp));
        c.combat.hitEnemy(target, dmg, { element: 'shock', source: 'direct', statusChance: 0, x: target.x, y: target.y });
        const arced = []; c.enemies.forEachAlive((e) => { if (e !== target && before.has(e.uid) && e.hp < before.get(e.uid)) arced.push(e.id); });
        return { target: target.id, arced };
      },
      ignite: () => { const w = scene.ctx.world; const i = w && w.shelves ? w.shelves.keys().next().value : undefined; return i == null ? null : scene.ctx.combat.hitShelf(i, 1, 'fire'); },
      chip: (dmg = 4) => { const w = scene.ctx.world; const i = w && w.shelves ? w.shelves.keys().next().value : undefined; return i == null ? null : scene.ctx.combat.hitShelf(i, dmg, 'arcane'); },
      blast: () => {
        const w = scene.ctx.world; const i = w && w.shelves ? w.shelves.keys().next().value : undefined;
        if (i == null) return null;
        const p = w.cellCenter(i); scene.ctx.combat.explodeAt(p.x, p.y, 12, 0, { source: 'explode' });
        return { shelvesLeft: w.shelves.size };
      },
    };
    window.__SW__ = window.__SW__ || {};
    window.__SW__.room = api;
  }

  onShutdown() {
    const world = this.physics && this.physics.world;
    if (world) world.off('worldstep', this.simStep, this);
    const ctx = this.ctx;
    if (!ctx) return;
    try {
      if (this.worldHud) this.worldHud.destroy();
      ctx.director.unload();
      ctx.enemies.destroy && ctx.enemies.destroy();
      ctx.shots.destroy(); ctx.zones.destroy(); ctx.fx.destroy(); ctx.player.destroy();
    } catch (e) { console.warn('[run] teardown', e); }
    this.input.setDefaultCursor('default');
    this.ctx = null;
  }
}
