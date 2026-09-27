// sim/RoomDirector.js — the run's room flow (design-v2 §2/§6, progression-and-pacing §10–§12, mechanic-spec §9.5):
//   route: 3 floors × 9 steps (0 start · 1..7 door steps · 4 MINI-BOSS · 6 shop · 7 PUZZLE · 8 boss), from
//          floors.json `steps` (`fixed` → one centre door; `choose: 2` → two weighted, distinct doors, run stream;
//          per-floor `limits` heal/wand/corrupted; risk door ≤ rules.risk.maxPerRun per run, feature-gated).
//          First run: F1 steps 1–2 use `tutorialTemplate` + fixedWaves + tutorialReward; `tutorialDone` is set
//          when step 3's doors open (unchanged v1 behaviour).
//   door threats: an option with `threat: 'roll'` draws from floor.threats (weight, minStep ≤ step; run stream) when
//          the doors are rolled; the rolled threat rides on the door (WorldHud icon + label) and is GUARANTEED in the
//          room (its anchor goes into the first anchored wave, or the last wave if no wave was anchored).
//   waves (progression §11 grammar): per wave 1 anchor (0 for the run's very first wave) + a 2nd from step 5 on
//          floors 2–3 when the budget allows + 35% support from floor 2 + pressure fill to budget (swarm: pressureOnly
//          ids, budget × budgetMult) up to maxPerWave. Puzzle rooms: fixedWaves always. Elite rooms: wave 0 places
//          the elite(s) first (+ rules.risk.extraElites behind a risk door).
//   pacing: next wave when ≥ nextWaveKilledFrac of this wave is dead or ≤ nextWaveWhenAliveAtMost alive, after
//          ≥ nextWaveMinElapsedMs (or at once when the room is empty); maxAlive overflow queues.
//   spawn safety: ≥ minSpawnDistPx from the player and never inside ±spawnAimConeDeg of the aim within
//          spawnAimConeRangePx; if no marker qualifies, the farthest marker.
//   mini-boss (step 4, `miniboss` kind): floors.*.miniBoss in miniBossRoom through the boss path (tier 'mini');
//          its death clears the room (reward + doors) and NEVER ends the floor.
//   twists (rules.twists; cuttable): ambush (wave 0 in a ring round the player, longer portal) · dark (a darkness
//          layer below DEPTH.enemyProjectiles with a light cookie on the player and on player shots). ≤ maxPerFloor,
//          never on neverOn kinds or puzzle/tutorial rooms.
//   run.upcomingKeyword = the keyword the next door threat / mini-boss / puzzle asks (C's counter guarantee).
//   worlds (specs/design/worlds.md): the World is built with floors[].world (tileset, props, world twist). World
//          twists: candlelight (W1) = this file's darkness layer at 1 − ambientLight with candle light pools;
//          flooded (W2) / bookshelves (W3) live in World + Combat; burning shelves tick here (sim step). ROOM_ENTER
//          carries `worldTwist` (the active world twist id or null). Harness: forceTwist may name a world twist.
//   rooms are rebuilt, not scenes (scene-flow §1): fade out → unload → load → fade in (feel roomFadeMs)

import { TILE, DEPTH } from '../config.js';
import { EV } from '../core/ev.js';
import { listen } from '../core/events.js';
import { Save } from '../core/save.js';
import { World } from './World.js';
import { track, warnOnce } from '../core/log.js';
import { rollDraft } from '../run/economy.js';
import { Art } from '../core/art.js';

function artImage(scene, x, y, id, fallback) { const a = Art.getQuiet(id, 0); return a ? scene.add.image(x, y, a.key, a.frame) : scene.add.image(x, y, fallback); }

const TAU = Math.PI * 2;
/** Dark-twist layer depth: above actors and player shots, BELOW enemy bullets (artist ask; contract §8). */
export const DEPTH_DARK = (DEPTH.projectilesAdd + DEPTH.enemyProjectiles) / 2;
const KEYWORD_FOR_DEFENCE = { shield: 'pierce', armour: 'blast', ward: 'shock' };

export class RoomDirector {
  constructor(ctx) {
    this.ctx = ctx;
    this.room = null;          // { kind, reward, templateId, tpl, key, name, puzzle, risk, threat, twist }
    this.waves = [];           // pending waves: [[{id, elite}]]
    this.waveIndex = -1;
    this.waveElapsed = 0;
    this.waveUnits = [];       // [{e, uid}] spawned this wave
    this.waveTotal = 0;
    this.pending = [];         // queued units of the current wave (maxAlive overflow)
    this.combatActive = false;
    this.cleared = false;
    this.transitioning = false;
    this.doorsOpen = [];
    this.graceMs = 0;
    this.pedestal = null;
    this.wavesSpawned = 0;     // run-wide (grammar: the run's very first wave has no anchor)
    this.floorTwists = 0;
    this.riskOffered = 0;      // run-wide (rules.risk.maxPerRun)
    this.force = {};           // dev harness: { doorThreat, riskDoor } consumed by the next door roll
    this.dark = null;
  }
  get run() { return this.ctx.run; }
  get cat() { return this.ctx.cat; }
  get rules() { return this.ctx.rules; }
  get floorDef() { return this.cat.floors[`f${this.run.floor}`]; }

  // ================================================================== room choice
  /** Load a room for (floor, step) from a door option {room:kind, reward, puzzle?, risk?, threat?}. opts.forceTwist (harness). */
  enterRoom(option, opts = {}) {
    const run = this.run, fd = this.floorDef, ctx = this.ctx;
    const kind = option.room;
    let tplId;
    const forcedWorldTwist = this._worldTwistById(opts.forceTwist);
    const stepDef = fd.steps[run.step] || {};
    const tutorialRoom = kind === 'combat' && !option.puzzle && run.tutorial && run.floor === 1 && !!stepDef.tutorialTemplate && !Save.flag('tutorialDone');
    if (kind === 'start') tplId = fd.startRoom;
    else if (kind === 'shop') tplId = fd.shopRoom;
    else if (kind === 'treasure') tplId = fd.treasureRoom;
    else if (kind === 'boss') tplId = fd.bossRoom;
    else if (kind === 'miniboss') tplId = fd.miniBossRoom;
    else if (kind === 'elite') tplId = this._pickTemplate(fd.eliteRooms);
    else if (option.puzzle && fd.puzzleRooms && fd.puzzleRooms.length) tplId = this._pickTemplate(fd.puzzleRooms);
    else if (tutorialRoom) tplId = stepDef.tutorialTemplate;
    else tplId = this._pickTemplate(fd.combatRooms);
    if (opts.forceTpl && this.cat.rooms[opts.forceTpl]) tplId = opts.forceTpl;          // dev harness (&tpl=<rooms.json id>)
    const tpl = this.cat.rooms[tplId];
    run.usedTemplates.add(tplId);
    this.lastTemplate = tplId;
    const key = `f${run.floor}s${run.step}`;
    const puzzle = !!option.puzzle && !!tpl.puzzle;
    const threat = option.threat && option.threat !== 'none' ? this._threatDef(option.threat) : null;
    this.room = { kind, reward: option.reward, templateId: tplId, tpl, key, name: tpl.name, puzzle, risk: !!option.risk, threat, twist: null, tutorial: tutorialRoom };
    run.route.push({ floor: run.floor, step: run.step, roomKind: kind, reward: option.reward, templateId: tplId, cleared: false,
      puzzle, risk: !!option.risk, threat: threat ? threat.id : null });

    // build the world
    ctx.world = new World(ctx.scene, tpl, { floor: run.floor, rng: ctx.rng.fx, crateHp: this.rules.enemies.crateHp,
      world: fd.world || null, roomKind: puzzle ? 'puzzle' : kind, tutorial: tutorialRoom, layoutRng: ctx.rng.run, forceTwist: forcedWorldTwist });
    const W = ctx.world;
    const worldTwist = (W.water && 'flooded') || (W.shelves && 'bookshelves') || (W.candlelight && 'candlelight') || null;
    this.room.worldTwist = worldTwist;
    ctx.onWorldBuilt();
    this.cleared = false; this.combatActive = false; this.doorsOpen = []; this.pedestal = null;
    this.waveIndex = -1; this.waves = []; this.waveElapsed = 0; this.waveUnits = []; this.waveTotal = 0; this.pending = [];
    this.bossSpawned = false; this.boss = null; this.bossUid = -1; this.bossDeathHandled = false;
    this.graceMs = this.rules.waves.roomEnterGraceMs;

    // twist (rolled before the waves: an ambush reshapes wave 0's placement)
    const twist = this._rollTwist(kind, opts.forceTwist);
    this.room.twist = twist;
    ctx.twist = twist;
    if (twist) this.floorTwists++;
    run.route[run.route.length - 1].twist = twist;

    if (kind === 'combat' || kind === 'elite') this._planWaves(kind, tpl);
    else if (kind === 'boss' || kind === 'miniboss') this.combatActive = true;

    // the next test's keyword, looking ahead from here (refined when this room's doors are rolled)
    run.upcomingKeyword = this._lookAheadKeyword(run.step + 1);

    ctx.bus.emit(EV.ROOM_ENTER, { floor: run.floor, step: run.step, kind, templateId: tplId, reward: option.reward, name: tpl.name,
      puzzle, risk: !!option.risk, threat: threat ? threat.id : null, twist, keyword: this._keywordOf(option), worldTwist,
      world: fd.world ? fd.world.id : null });
    if (twist) {
      if (twist === 'dark') this._makeDark();
      ctx.bus.emit(EV.TWIST, { kind: twist });
    }
    if (twist !== 'dark' && W.candlelight) this._makeCandle(W.candlelight);
    ctx.relics.onEvent('room_enter', { x: ctx.player.x, y: ctx.player.y });
    track('room_enter', { floor: run.floor, step: run.step, kind, tpl: tplId, threat: threat ? threat.id : null, twist, puzzle });

    // rest rooms: no enemies → rewards/doors immediately
    if (kind === 'start' || kind === 'treasure' || kind === 'shop') this._restRoom(kind);
  }

  _pickTemplate(list) {
    const rng = this.ctx.rng.run;
    const fresh = list.filter((id) => id !== this.lastTemplate && !this.run.usedTemplates.has(id));
    const pool = fresh.length ? fresh : list.filter((id) => id !== this.lastTemplate);
    return rng.pick(pool.length ? pool : list);
  }

  // ================================================================== threats · keywords
  /** A threat record by id: this floor's first, then any floor's (harness may force a foreign threat). */
  _threatDef(id) {
    const own = (this.floorDef.threats || []).find((t) => t.id === id);
    if (own) return own;
    for (const f of this.cat.floorList || Object.values(this.cat.floors)) { const t = (f.threats || []).find((x) => x.id === id); if (t) return t; }
    warnOnce(`threat-unknown:${id}`, `RoomDirector: no threat "${id}" in floors.json`);
    return null;
  }
  /** Door threat roll (progression §11): floor.threats, weight, minStep ≤ step, run stream. Returns an id ('none' included). */
  _rollThreat(step) {
    if (this.force.doorThreat) return this.force.doorThreat;
    const pool = (this.floorDef.threats || []).filter((t) => (t.minStep ?? 1) <= step && t.weight > 0);
    if (!pool.length) return null;
    return this.ctx.rng.run.weighted(pool).id;
  }
  _defenceKeyword(type) { const d = this.rules.defences && this.rules.defences[type]; return (d && d.breakKeyword) || KEYWORD_FOR_DEFENCE[type] || null; }
  _miniKeyword() {
    const fd = this.floorDef, def = fd.miniBoss && this.cat.bosses[fd.miniBoss];
    return (def && def.defence && this._defenceKeyword(def.defence.type)) || fd.testKeyword || null;
  }
  _puzzleKeyword() {
    const fd = this.floorDef, id = fd.puzzleRooms && fd.puzzleRooms[0];
    return (id && this.cat.rooms[id] && this.cat.rooms[id].testKeyword) || fd.testKeyword || null;
  }
  /** The keyword a door option asks for (threat / mini-boss / puzzle), or null. */
  _keywordOf(o) {
    if (!o) return null;
    if (o.room === 'miniboss') return this._miniKeyword();
    if (o.puzzle) return this._puzzleKeyword();
    const t = o.threat && o.threat !== 'none' ? this._threatDef(o.threat) : null;
    return (t && t.keyword) || null;
  }
  /** First keyword test at or after `fromStep` whose question is already known (mini-boss / puzzle), else null. */
  _lookAheadKeyword(fromStep) {
    const steps = this.floorDef.steps;
    for (let s = Math.max(0, fromStep); s < steps.length; s++) {
      const f = steps[s].fixed;
      if (!f) continue;
      if (f.room === 'miniboss') return this._miniKeyword();
      if (f.puzzle) return this._puzzleKeyword();
    }
    return null;
  }
  /** contract §5: run.upcomingKeyword = what the next door threat / mini-boss / puzzle asks. */
  _setUpcoming(options) {
    let kw = null;
    for (const o of options) { kw = this._keywordOf(o); if (kw) break; }
    this.run.upcomingKeyword = kw || this._lookAheadKeyword(this.run.step + 2);
  }

  // ================================================================== twists (rules.twists; cuttable)
  _rollTwist(kind, forced) {
    const tw = this.rules.twists;
    if (!tw) return null;
    if (forced) return forced === 'ambush' || forced === 'dark' ? forced : null;
    if (kind !== 'combat' && kind !== 'elite') return null;
    if ((tw.neverOn || []).includes(kind)) return null;
    if (this.room.puzzle && tw.neverOnPuzzle !== false) return null;
    if (this.room.tutorial) return null;
    if (this.floorTwists >= (tw.maxPerFloor ?? 1)) return null;
    const rng = this.ctx.rng.run;
    for (const t of this.floorDef.twists || []) {
      if (this.run.step < (t.minStep ?? 1)) continue;
      if (t.id === 'dark' && !tw.dark) continue;
      if (rng.chance(t.chance || 0)) return t.id;
    }
    return null;
  }

  _makeDark() {
    if (this.dark) this.dark.destroy();
    this.dark = new DarkLayer(this.ctx, this.rules.twists.dark);
  }
  /**
   * W1 Candlelight (worlds.md §3.1, floors.f1.world.twist): the dark-twist renderer at a milder level — fill α =
   * 1 − ambientLight, a light pool of candleLightRadiusPx on every candle prop, spells light spellLightRadiusPx, the
   * player keeps the dark twist's own light; enemies outlined (enemyOutline) and telegraphs above the darkness.
   */
  _makeCandle(tw) {
    if (this.dark) this.dark.destroy();
    const dk = (this.rules.twists && this.rules.twists.dark) || {};
    this.dark = new DarkLayer(this.ctx, { lightRadiusPx: dk.lightRadiusPx ?? 72, spellLightRadiusPx: tw.spellLightRadiusPx ?? 28,
      alpha: 1 - (tw.ambientLight ?? 0.55), lights: this.ctx.world.lights, candleRadiusPx: tw.candleLightRadiusPx ?? 56,
      telegraphsFullBright: tw.telegraphsFullBright !== false });
    if (tw.enemyOutline !== false && this.ctx.enemies) this.ctx.enemies.darkOutline = true;
  }
  /** A world twist record by id ('candlelight' | 'flooded' | 'bookshelves') from any floor's world block (harness), else null. */
  _worldTwistById(id) {
    if (!id || id === 'ambush' || id === 'dark') return null;
    for (const f of this.cat.floorList || Object.values(this.cat.floors)) if (f.world && f.world.twist && f.world.twist.id === id) return f.world.twist;
    warnOnce(`world-twist-unknown:${id}`, `RoomDirector: no world twist "${id}" in floors.json`);
    return null;
  }
  /** Sim-step world twist upkeep: burning bookshelves (aura burn on enemies, then collapse). */
  _stepWorld(dt) {
    const ctx = this.ctx, w = ctx.world;
    if (!w || !w.shelves || !w.shelves.size) return;
    w.stepShelves(dt, w.shelfCfg.auraTickMs,   // floors.json world.twist.burnAuraTickMs (World.shelfCfg)
      (x, y, r) => ctx.combat.shelfAura(x, y, r), (x, y) => ctx.combat.shelfCollapsed(x, y));
  }
  /** Presentation hook (RunScene.update, per render frame): world tile animation + the darkness layer. */
  render() {
    const w = this.ctx.world;
    if (!w) return;
    w.animate(this.ctx.scene.time.now, !!this.ctx.flags.reducedMotion);
    if (this.dark) this.dark.render();
  }

  // ================================================================== waves (progression §11)
  _roleOf(id) { const d = this.cat.enemies[id]; return (d && d.role) || 'pressure'; }
  _cost(id) { const d = this.cat.enemies[id]; return (d && d.threat) || 0; }

  _planWaves(kind, tpl) {
    const run = this.run, fd = this.floorDef, rules = this.rules, room = this.room;
    if (tpl.fixedWaves && (room.puzzle || (run.tutorial && !Save.flag('tutorialDone')))) {
      this.waves = tpl.fixedWaves.map((w) => { const out = []; for (const g of w) for (let i = 0; i < g.count; i++) out.push({ id: g.enemy, elite: false }); return out; });
      return;
    }
    const wc = fd.waves[kind === 'elite' ? 'elite' : 'combat'];
    const step = run.step;
    const rw = rules.waves, g = rw.grammar || {};
    const growth = rw.waveGrowth;
    const rng = this.ctx.rng.ai;
    const threat = room.threat;
    const threatAnchors = threat && threat.anchors && threat.anchors.length ? threat.anchors : null;
    let threatPlaced = !threatAnchors;
    const swarm = threat && threat.pressureOnly && threat.pressureOnly.length ? threat : null;
    const maxPer = rw.maxPerWave;
    const doubleOk = step >= (g.doubleAnchorFromStep ?? 5) && (g.doubleAnchorFloors || [2, 3]).includes(run.floor);
    const heat = run.heat || null;                                    // Wave E (rules.heat level record) — optional
    const pool = fd.enemyPool.filter((p) => p.minStep <= step && this._cost(p.id) > 0);
    const ofRole = (role) => pool.filter((p) => this._roleOf(p.id) === role);
    const anchorsPool = ofRole('anchor'), supportPool = ofRole('support');
    let pressurePool = pool.filter((p) => this._roleOf(p.id) === 'pressure');
    if (swarm) { const only = pressurePool.filter((p) => swarm.pressureOnly.includes(p.id)); if (only.length) pressurePool = only; }

    for (let w = 0; w < wc.count; w++) {
      let budget = Math.floor(Math.floor(wc.budgetBase + wc.budgetPerStep * step) * (1 + growth * w));
      if (swarm) budget = Math.floor(budget * (swarm.budgetMult || 1));
      if (heat && heat.extraBudgetPerWave) budget += heat.extraBudgetPerWave;
      if (kind === 'elite' && w === 0 && this.ctx.curse) budget += this.ctx.curse.eliteExtraBudget || 0;
      const wave = [];
      const firstOfRun = this.wavesSpawned === 0 && w === 0;
      let anchors = firstOfRun ? (g.firstWaveOfRunAnchors ?? 0) : (g.anchorsPerWave ?? 1);
      const extraAnchor = !firstOfRun && doubleOk ? 1 : 0;

      // elite room, wave 0: the elite(s) first (a threat anchor if it is an elite candidate), each at threat × eliteThreatMult
      if (kind === 'elite' && w === 0) {
        const n = (wc.elites || 1) + (room.risk ? (rules.risk && rules.risk.extraElites) || 0 : 0)
          + ((run.runRules && run.runRules.elite_rooms_extra_elite) | 0);                  // Daily Double Elites rule
        for (let e = 0; e < n; e++) {
          let id = null;
          if (!threatPlaced) { const c = threatAnchors.filter((a) => fd.eliteCandidates.includes(a)); if (c.length) { id = rng.pick(c); threatPlaced = true; } }
          if (!id) { const cands = fd.eliteCandidates.filter((x) => this._minStepOk(x, step)); id = rng.pick(cands.length ? cands : fd.eliteCandidates); }
          wave.push({ id, elite: true });
          budget -= this._cost(id) * rules.enemies.eliteThreatMult;
          if (this._roleOf(id) === 'anchor' && anchors > 0) anchors--;
        }
      }
      // anchors: the door's threat anchor goes into the first anchored wave (guaranteed, even over budget)
      for (let a = 0; a < anchors + extraAnchor && wave.length < maxPer; a++) {
        const extra = a >= anchors;
        if (!threatPlaced && !extra) {
          const id = rng.pick(threatAnchors);
          wave.push({ id, elite: false }); budget -= this._cost(id); threatPlaced = true;
          continue;
        }
        const cands = anchorsPool.filter((p) => this._cost(p.id) <= budget);
        if (!cands.length) break;
        const pick = rng.weighted(cands);
        wave.push({ id: pick.id, elite: false }); budget -= this._cost(pick.id);
      }
      // support joins (floor ≥ supportMinFloor, supportChance) when one fits
      if (run.floor >= (g.supportMinFloor ?? 2) && wave.length < maxPer && rng.chance(g.supportChance ?? 0)) {
        const cands = supportPool.filter((p) => this._cost(p.id) <= budget);
        if (cands.length) { const pick = rng.weighted(cands); wave.push({ id: pick.id, elite: false }); budget -= this._cost(pick.id); }
      }
      // pressure fill to budget
      while (wave.length < maxPer) {
        const cands = pressurePool.filter((p) => this._cost(p.id) <= budget);
        if (!cands.length) break;
        const pick = rng.weighted(cands);
        wave.push({ id: pick.id, elite: false });
        budget -= this._cost(pick.id);
      }
      this.waves.push(wave);
    }
    // guarantee: a threat whose anchor found no anchored wave goes into the last wave
    if (!threatPlaced) {
      if (!this.waves.length) this.waves.push([]);
      this.waves[this.waves.length - 1].unshift({ id: rng.pick(threatAnchors), elite: false });
    }
  }
  _minStepOk(id, step) { const e = this.floorDef.enemyPool.find((p) => p.id === id); return !e || e.minStep <= step; }

  _spawnWave() {
    const ctx = this.ctx;
    this.waveIndex++;
    this.waveElapsed = 0;
    const wave = this.waves[this.waveIndex] || [];
    this.waveUnits = [];
    this.waveTotal = wave.length;
    this.pending = wave.slice();
    const tw = this.rules.twists;
    this.ambushWave = this.room.twist === 'ambush' && this.waveIndex === ((tw && tw.ambush && tw.ambush.appliesToWave) ?? 0);
    this._spawnPending();
    this.wavesSpawned++;
    ctx.bus.emit(EV.WAVE_SPAWN, { index: this.waveIndex, count: wave.length, ambush: this.ambushWave });
    ctx.mixer.fire('wave_spawn', this.ambushWave ? { gainDb: 2 } : {});
  }

  /** Spawn the queued units while the room is under maxAlive (mechanic-spec §9.5 overflow queue). */
  _spawnPending() {
    const ctx = this.ctx, er = this.rules.enemies;
    const cap = er.maxAlive ?? 14;
    let alive = ctx.enemies.aliveCount();
    const batch = [];
    while (this.pending.length && alive < cap) { batch.push(this.pending.shift()); alive++; }
    if (!batch.length) return;
    const rng = ctx.rng.ai;
    const pts = this.ambushWave ? this._ambushRing(batch.length) : null;
    const amb = this.rules.twists && this.rules.twists.ambush;
    batch.forEach((u, i) => {
      const def = this.cat.enemies[u.id];
      const pos = (pts && pts[i]) || this._spawnPoint(def, rng);
      const jitter = { x: rng.float(-4, 4), y: rng.float(-4, 4) };
      const opts = { elite: u.elite, portal: true };
      if (this.ambushWave && amb && amb.portalMs) opts.portalMs = amb.portalMs;       // EnemySystem honours opts.portalMs (A)
      const e = pos ? ctx.enemies.spawn(u.id, pos.x + jitter.x, pos.y + jitter.y, opts) : null;
      this.waveUnits.push({ e, uid: e ? e.uid : -1 });
    });
  }

  /** Spawn-safety test (mechanic-spec §9.5): ≥ minSpawnDistPx and outside the ±cone within coneRange of the aim. */
  _safeFn() {
    const p = this.ctx.player, er = this.rules.enemies;
    const minD = er.minSpawnDistPx, cone = (er.spawnAimConeDeg ?? 35) * Math.PI / 180, coneR = er.spawnAimConeRangePx ?? 220;
    const aim = Math.atan2(p.aimY || 0, p.aimX || 1);
    return (x, y) => {
      const dx = x - p.x, dy = y - p.y, d = Math.hypot(dx, dy);
      if (d < minD) return false;
      if (d <= coneR) { let a = Math.atan2(dy, dx) - aim; a = Math.atan2(Math.sin(a), Math.cos(a)); if (Math.abs(a) <= cone) return false; }
      return true;
    };
  }
  _spawnPoint(def, rng) {
    const w = this.ctx.world, p = this.ctx.player;
    const safe = this._safeFn();
    if (def && def.flying && rng.chance(0.5)) { const pos = w.randomWalkable(rng, { flyer: true, filter: safe }); if (pos) return pos; }
    const markers = w.markers.spawns;
    const ok = markers.filter((m) => safe(m.x, m.y));
    if (ok.length) return rng.pick(ok);
    if (markers.length) {                                               // no marker qualifies → the farthest one
      let best = markers[0], bd = -1;
      for (const m of markers) { const d = Math.hypot(m.x - p.x, m.y - p.y); if (d > bd) { bd = d; best = m; } }
      return best;
    }
    return w.randomWalkable(rng, { from: p, minDist: this.rules.enemies.minSpawnDistPx }) || w.randomWalkable(rng, { from: p, minDist: 64 });
  }
  /** Ambush: n points on a ring (rules.twists.ambush.spawnRingPx) round the player, spread over the arc OUTSIDE the aim cone. */
  _ambushRing(n) {
    const ctx = this.ctx, w = ctx.world, p = ctx.player, er = this.rules.enemies;
    const R = this.rules.twists.ambush.spawnRingPx;
    const cone = (er.spawnAimConeDeg ?? 35) * Math.PI / 180;
    const aim = Math.atan2(p.aimY || 0, p.aimX || 1);
    const arc = TAU - 2 * cone;
    const out = [];
    for (let i = 0; i < n; i++) {
      const a = aim + cone + (i + 0.5) * arc / n;
      const x = p.x + Math.cos(a) * R, y = p.y + Math.sin(a) * R;
      out.push(w.blocksGround(x, y) ? w.nearestWalkable(x, y, 2) : { x, y });
    }
    return out;
  }
  _killedFrac() {
    if (!this.waveTotal) return 1;
    let dead = 0;
    for (const u of this.waveUnits) if (!u.e || !u.e.alive || u.e.uid !== u.uid) dead++;
    return dead / this.waveTotal;
  }

  // ================================================================== per step
  step(dt) {
    if (this.transitioning || !this.room) return;
    this._stepWorld(dt);
    const ctx = this.ctx, rw = this.rules.waves;
    if (this.graceMs > 0) { this.graceMs -= dt; return; }
    const kind = this.room.kind;
    if (kind === 'boss' || kind === 'miniboss') { this._stepBoss(dt); return; }
    if (!this.cleared && this.waves.length) {
      if (this.waveIndex < 0) this._spawnWave();
      else {
        if (this.pending.length) this._spawnPending();
        this.waveElapsed += dt;
        const alive = ctx.enemies.aliveCount();
        const last = this.waveIndex >= this.waves.length - 1;
        const settled = !this.pending.length;
        const paced = this.waveElapsed >= rw.nextWaveMinElapsedMs && (alive <= rw.nextWaveWhenAliveAtMost || this._killedFrac() >= (rw.nextWaveKilledFrac ?? 1));
        if (!last && settled && (alive === 0 || paced)) this._spawnWave();
        else if (last && settled && alive === 0) this._clear();
      }
      this.combatActive = !this.cleared;
    }
    this._checkDoors();
  }

  /** Boss path for both tiers: 'boss' (floor end) and 'miniboss' (tier 'mini': clears the room, never ends the floor). */
  _stepBoss(dt) {
    const ctx = this.ctx, fd = this.floorDef;
    const mini = this.room.kind === 'miniboss';
    const id = mini ? fd.miniBoss : fd.boss;
    if (!this.bossSpawned) {
      this.bossSpawned = true;
      const m = ctx.world.markers.boss || { x: ctx.world.w / 2, y: ctx.world.h / 3 };
      this.boss = ctx.enemies.spawnBoss(id, m.x, m.y, { tier: mini ? 'mini' : 'boss' });
      this.bossUid = this.boss ? this.boss.uid : -1;
      this.combatActive = true;
      if (!this.boss) {                                                   // never soft-lock on a missing boss
        warnOnce(`boss-spawn-failed:${id}`, `RoomDirector: spawnBoss("${id}") failed; clearing the room`);
        this.bossDeathHandled = true;
        if (mini) this._clear(); else this._bossCleared();
      }
      return;
    }
    const dead = this.boss && (!this.boss.alive || this.boss.uid !== this.bossUid);
    if (!this.cleared && dead && !this.bossDeathHandled) {
      this.bossDeathHandled = true;
      const stats = this.run.stats;
      if (mini) (stats.miniBossesKilled || (stats.miniBossesKilled = [])).push(id);
      else stats.bossesKilled.push(id);
      // wait for the death visual (bossDeathUnravelMs + burst) then award
      const wait = ctx.T('bossDeathUnravelMs') + 600;
      ctx.scene.time.delayedCall(wait, () => {
        if (!this.room || this.cleared) return;
        if (mini) { ctx.enemies.killAll('cleanup'); this._clear(); } else this._bossCleared();
      });
    }
    this._checkDoors();
  }

  /** A heal REWARD (heal door heart, mini/boss rewards.heal) after Heat's healRewardAdd; never below 1 half-heart. */
  _healReward(n) {
    const add = (this.run.heat && this.run.heat.healRewardAdd) | 0;
    return add ? Math.max(1, n + add) : n;
  }

  _bossCleared() {
    const ctx = this.ctx, fd = this.floorDef;
    if (fd.index >= 3 || this.run.floor >= 3) { ctx.onVictory(); return; }
    const rw = this.cat.bosses[fd.boss].rewards || {};
    this.cleared = true; this.combatActive = false;
    const c = { x: ctx.world.w / 2, y: ctx.world.h / 2 };
    if (rw.coins) ctx.pickups.coin(c.x, c.y, rw.coins);
    if (rw.heal) this.run.heal(this._healReward(rw.heal));
    this._placeRewardPedestal('bossRelic', c.x, c.y + 16);
    ctx.pickups.vacuumAll();
    this.room && (this.run.route[this.run.route.length - 1].cleared = true);
    this.run.stats.roomsCleared++;
    ctx.bus.emit(EV.ROOM_CLEARED, { floor: this.run.floor, step: this.run.step, kind: 'boss' });
    ctx.mixer.fire('room_clear');
    ctx.scene.time.delayedCall(450, () => this._openDoors([{ room: 'stairs', reward: 'floor' }]));
  }

  // ================================================================== clear & rewards
  _clear() {
    const ctx = this.ctx, run = this.run;
    if (this.cleared) return;
    this.cleared = true; this.combatActive = false;
    run.route[run.route.length - 1].cleared = true;
    run.stats.roomsCleared++;
    ctx.pickups.vacuumAll();
    ctx.bus.emit(EV.ROOM_CLEARED, { floor: run.floor, step: run.step, kind: this.room.kind, puzzle: this.room.puzzle });
    ctx.relics.onEvent('room_clear', { x: ctx.player.x, y: ctx.player.y });
    ctx.mixer.fire('room_clear');
    track('room_clear', { floor: run.floor, step: run.step });
    // doors are ROLLED now (threats included) so the reward draft sees run.upcomingKeyword (counter guarantee);
    // reward appears at room clear + 300 ms, doors at + 450 ms (event-markers §4)
    const next = this._nextOptions();
    this._setUpcoming(next);
    ctx.scene.time.delayedCall(300, () => this._grantReward(this.room.reward));
    ctx.scene.time.delayedCall(450, () => this._openDoors(next));
  }

  _roomCenter() {
    const w = this.ctx.world;
    const ped = w.markers.pedestals[0];
    if (ped) return ped;
    // centre-ish walkable tile
    return w.nearestWalkable(w.w / 2, w.h / 2, 6) || { x: w.w / 2, y: w.h / 2 };
  }

  _grantReward(kind) {
    const ctx = this.ctx, run = this.run, eco = this.cat.economy;
    if (!this.room || !ctx.world) return;
    const c = this._roomCenter();
    const tpl = this.room.tpl;
    if (tpl.tutorialReward && run.tutorial && !Save.flag('tutorialDone')) {
      this._placeRewardPedestal(tpl.tutorialReward.kind, c.x, c.y, tpl.tutorialReward.offer);
      return;
    }
    switch (kind) {
      case 'spell': case 'modifier': case 'relic': case 'wand':
        this._placeRewardPedestal(kind, c.x, c.y);
        break;
      case 'miniboss': {                                                   // mini relic draft + the mini's own rewards
        const b = this.cat.bosses[this.floorDef.miniBoss];
        const rw = (b && b.rewards) || {};
        if (rw.coins) ctx.pickups.coin(c.x, c.y + 16, rw.coins);
        if (rw.heal) run.heal(this._healReward(rw.heal));
        this._placeRewardPedestal('relic', c.x, c.y);
        break;
      }
      case 'corrupted':                                                    // risk door: C's draft yields corrupted relics
        this._placeRewardPedestal('relic', c.x, c.y, null, { risk: true });
        break;
      case 'coins': ctx.pickups.coin(c.x, c.y, eco.rewards.coinsBase + eco.rewards.coinsPerFloor * run.floor); break;
      case 'heal': ctx.pickups.heart(c.x, c.y, this._healReward(eco.rewards.healAmount)); break;
      default: break;
    }
    if (kind === 'heal') run.floorLimits.heal++;
    if (kind === 'wand') run.floorLimits.wand++;
    if (kind === 'corrupted') run.floorLimits.corrupted = (run.floorLimits.corrupted | 0) + 1;
    ctx.mixer.fire('reward_appear');
  }

  /** A reward pedestal: interact → the reward modal (the offer lives in RunState). req = {risk} (contract §5). */
  _placeRewardPedestal(kind, x, y, fixed = null, req = null) {
    const ctx = this.ctx, run = this.run;
    const roomKey = `${this.room.key}:${kind}`;
    if (req) run.makeOffer(kind, roomKey, fixed, req); else run.makeOffer(kind, roomKey, fixed);
    const risk = !!(req && req.risk);
    const g = artImage(ctx.scene, x, y, 'tiles.pedestal', 'ph-pedestal').setDepth(30);
    const tint = risk ? 0xb03a5b : kind === 'relic' || kind === 'bossRelic' ? 0x8b7cf0 : kind === 'wand' ? 0xfacb3e : 0x5698cc;
    const glow = artImage(ctx.scene, x, y - 8, 'authored.glow_16', 'ph-glow').setBlendMode(1).setDepth(61).setAlpha(0.5).setTint(tint);
    const label = { spell: 'Spell draft', modifier: 'Modifier draft', relic: 'Relic', bossRelic: 'Relic', wand: 'Wand' }[kind];
    const n = run.offer.items.length;
    const it = ctx.pickups.addInteract({ kind: 'pedestal', rewardKind: risk ? 'corrupted' : kind, x, y, verb: 'take', label, count: n, roomKey,
      onUse: () => { if (run.offer && run.offer.roomKey === roomKey && !run.offer.taken) { ctx.openOverlay('reward', {}); return true; } return false; } });
    it.sprite = g; it.glow = glow;
    this.pedestal = it;
    ctx.fx.particles('mote', x, y - 6, 6, { color: 0xfdf7ed, speed: 20 });
    // C's ask: a skipped draft leaves no inert pedestal behind (EV.REWARD_SKIPPED {roomKey})
    if (!this._skipHooked) {
      this._skipHooked = true;
      listen(ctx.scene, ctx.bus, EV.REWARD_SKIPPED, (d) => {
        const p = this.pedestal;
        if (!p || !d || d.roomKey !== p.roomKey) return;
        ctx.fx.particles('mote', p.x, p.y - 6, 6, { color: 0xfdf7ed, speed: 20 });
        ctx.pickups.removeInteract(p);                   // destroys its sprite + glow
        this.pedestal = null;
      });
    }
  }

  _restRoom(kind) {
    const ctx = this.ctx, run = this.run;
    this.cleared = true;
    const next = this._nextOptions();                                    // rolled first: the shop/treasure draft sees upcomingKeyword
    this._setUpcoming(next);
    if (kind === 'treasure') {
      const c = this._roomCenter();
      this._placeRewardPedestal(this.room.reward === 'wand' ? 'wand' : 'relic', c.x, c.y);
      if (this.room.reward === 'wand') run.floorLimits.wand++;
      if (this.cat.economy.rewards.treasureBonusCard) {
        const [id] = rollDraft(this.cat, 'card', 1, run.floor, run.rng.loot, run.isUnlocked);
        if (id) ctx.pickups.card(c.x + 24, c.y + 12, id);
      }
    }
    if (kind === 'shop') this._setupShop();
    // start / landing / shop / treasure: doors open right away
    ctx.scene.time.delayedCall(kind === 'start' ? 0 : 250, () => this._openDoors(next));
  }
  _setupShop() {
    const ctx = this.ctx, run = this.run, w = ctx.world;
    const shop = run.openShop(`${this.room.key}:shop`);
    const peds = w.markers.pedestals.slice().sort((a, b) => a.y - b.y || a.x - b.x);
    shop.stock.forEach((item, i) => {
      const p = peds[i]; if (!p) return;
      const g = artImage(ctx.scene, p.x, p.y, 'tiles.pedestal', 'ph-pedestal').setDepth(30);
      const it = ctx.pickups.addInteract({ kind: 'shop-item', x: p.x, y: p.y, verb: 'shop', label: '', shopIndex: i,
        onUse: () => { ctx.openOverlay('shop', { focusIndex: i }); Save.setFlag('shop'); return true; } });
      it.sprite = g;
    });
    // shopkeeper (top centre)
    const kx = w.w / 2, ky = 3 * TILE;
    const k = ctx.scene.add.image(kx, ky, 'ph-keeper').setOrigin(0.5, 1).setDepth(40 + ky / 10000);
    const it = ctx.pickups.addInteract({ kind: 'shopkeeper', x: kx, y: ky - 4, verb: 'shop', label: '', extraRadius: 8,
      onUse: () => { ctx.openOverlay('shop', {}); Save.setFlag('shop'); return true; } });
    it.sprite = k;
    ctx.mixer.fire('shop_enter');
  }

  // ================================================================== doors
  /**
   * Options for the next step (floors.json steps[step+1]); limits heal/wand/corrupted per floor; the risk door is
   * feature-gated and ≤ rules.risk.maxPerRun per run; `threat: 'roll'` options get their door threat rolled here.
   */
  _nextOptions() {
    const run = this.run, fd = this.floorDef;
    const nextStep = run.step + 1;
    const next = fd.steps[nextStep];
    if (!next) return [];
    const riskMax = (this.rules.risk && this.rules.risk.maxPerRun) ?? 1;
    const mk = (o) => {
      const out = { room: o.room, reward: o.reward, puzzle: !!o.puzzle, risk: !!o.risk, threat: null };
      if (o.threat === 'roll') out.threat = this._rollThreat(nextStep);
      return out;
    };
    let out;
    if (next.fixed) out = [mk(next.fixed)];
    else {
      const lim = fd.limits || {};
      const fl = run.floorLimits || {};
      const featOn = (f) => (run.features && f in run.features ? !!run.features[f] : Save.isUnlocked('features', f));   // RunState.features (C) first
      const riskOk = (o) => !o.risk || (this.riskOffered < riskMax && (!o.requiresFeature || featOn(o.requiresFeature)));
      const all = next.from.filter((o) => !((o.reward === 'heal' && (fl.heal | 0) >= (lim.heal ?? 99)) || (o.reward === 'wand' && (fl.wand | 0) >= (lim.wand ?? 99))
        || (o.reward === 'corrupted' && (fl.corrupted | 0) >= (lim.corrupted ?? 99))));
      let pool = all.filter(riskOk);
      const picked = [];
      const rng = this.ctx.rng.run;
      const n = Math.min(next.choose || 2, pool.length);
      for (let i = 0; i < n; i++) {
        const pick = rng.weighted(pool);
        picked.push(pick);
        pool = pool.filter((o) => o !== pick);
      }
      // dev harness: force a risk door into the pair (feature/limit gates bypassed)
      if (this.force.riskDoor && !picked.some((o) => o.risk)) {
        const r = next.from.find((o) => o.risk);
        if (r) { if (picked.length >= 2) picked[picked.length - 1] = r; else picked.push(r); }
      }
      out = picked.map(mk);
    }
    if (out.some((o) => o.risk)) this.riskOffered++;
    this.force.doorThreat = null; this.force.riskDoor = false;
    return out;
  }

  _openDoors(options) {
    const ctx = this.ctx, run = this.run;
    if (!options.length || !ctx.world) return;
    const doors = ctx.world.openDoors(options);
    this.doorsOpen = doors;
    ctx.bus.emit(EV.DOORS_OPEN, doors.map((d) => {
      const o = d.option;
      const t = o.threat ? this._threatDef(o.threat) : null;
      return { roomKind: o.room, reward: o.reward, x: d.x, y: d.y, choice: d.kind === 'choice' || options.length > 1,
        threat: o.threat || null, risk: !!o.risk, puzzle: !!o.puzzle, keyword: this._keywordOf(o),
        threatIcon: t ? t.iconKey : null, testName: this._testName(o) };
    }));
    doors.forEach((d, i) => ctx.scene.time.delayedCall(i * 120, () => ctx.mixer.fire('door_open', { index: i })));   // +120 ms per door, later ones −6 dB
    // cue-spec door_threat_shown: threat and risk doors (none / swarm stay silent)
    if (options.some((o) => o.risk || (o.threat && this._keywordOf(o)))) ctx.scene.time.delayedCall(doors.length * 120, () => ctx.mixer.fire('door_threat'));
    // FTUE: tutorialDone is set when F1 step 3's doors open (step 2 cleared)
    if (run.tutorial && run.floor === 1 && run.step + 1 >= 3 && !Save.flag('tutorialDone')) Save.setFlag('tutorialDone');
    ctx.player.controllable = true;
  }
  /** Display name of the test behind a mini-boss / puzzle door (door label), or null. */
  _testName(o) {
    const fd = this.floorDef;
    if (o.room === 'miniboss') { const b = this.cat.bosses[fd.miniBoss]; return b ? b.name : null; }
    if (o.puzzle) { const r = fd.puzzleRooms && this.cat.rooms[fd.puzzleRooms[0]]; return r ? r.name : null; }
    return null;
  }

  /** Walk-through detection: the player's feet cross into an open door's opening (top row) → transition (D4 if a reward is untaken). */
  _checkDoors() {
    if (!this.doorsOpen.length || this.transitioning) return;
    const p = this.ctx.player;
    if (!p.alive) return;
    // re-arm D4 once the player has stepped off the door trigger (or the dialog was dismissed any other way)
    if (this._askedDoor && !this.ctx.scene.registry.get('flow').isOpen('confirm')) {
      const d = this._askedDoor;
      if (p.feetY > d.tiles[0].y * TILE + 6 + 4) this._askedDoor = null;
    }
    for (const d of this.doorsOpen) {
      const x0 = d.tiles[0].x * TILE, x1 = (d.tiles[d.tiles.length - 1].x + 1) * TILE;
      const near = Math.hypot(p.x - d.x, p.y - d.y) < 48;
      if (near && !d._nearEmitted) { d._nearEmitted = true; this.ctx.bus.emit(EV.FTUE, 'door-near', { choice: d.kind === 'choice' }); }
      if (p.x >= x0 && p.x <= x1 && p.feetY <= d.tiles[0].y * TILE + 6) {
        if (this._untakenReward() && !d._confirmed) {
          if (this._askedDoor === d) continue;
          this._askedDoor = d;
          this.ctx.askConfirm('leaveReward', (leave) => {
            if (leave) { d._confirmed = true; this._go(d); }
            else { p.setPosition(p.x, p.y + 8 + TILE); this._askedDoor = null; }
          });
          return;
        }
        this._go(d);
        return;
      }
    }
  }
  _untakenReward() { const o = this.run.offer; return this.pedestal && o && o.roomKey === this.pedestal.roomKey && !o.taken; }

  _go(door) {
    const ctx = this.ctx;
    Save.setFlag('doors');
    ctx.bus.emit(EV.FTUE, 'door-entered');
    const opt = door.option;
    if (opt.room === 'stairs') { ctx.transition(() => this.nextFloor()); return; }
    ctx.transition(() => { this.run.step++; this.enterRoom(opt); });
  }

  _resetFloorState() {
    const run = this.run;
    run.step = 0;
    run.floorLimits = { heal: 0, wand: 0, corrupted: 0 };
    run.usedTemplates = new Set();
    run.stats.maxFloor = Math.max(run.stats.maxFloor, run.floor);
    this.floorTwists = 0;
  }

  nextFloor() {
    const run = this.run;
    this.ctx.mixer.fire('floor_descend');
    run.floor++;
    this._resetFloorState();
    this.ctx.setFloor(run.floor);
    this.ctx.bus.emit(EV.FLOOR_ENTER, { floor: run.floor, name: this.floorDef.name });
    this.enterRoom({ room: 'start', reward: null });
  }

  /**
   * Dev harness (?harness=floor:N:step:M, __SW__.room.jump): enter floor N step M directly (the caller wraps it in a
   * transition when a room is loaded). force = { room: 'combat'|'elite'|'miniboss'|'puzzle'|'boss'|'shop'|'treasure'|'start',
   * threat: id, twist: 'ambush'|'dark'|'candlelight'|'flooded'|'bookshelves', risk: bool, doorThreat: id, riskDoor: bool,
   * tpl: rooms.json template id }. A world twist forces that world's twist into this room (any world, any room kind).
   */
  jumpTo(floor, step, force = {}) {
    const run = this.run;
    const nf = Math.max(1, Math.min(3, floor | 0));
    if (nf !== run.floor) {
      run.floor = nf;
      this._resetFloorState();
      this.ctx.setFloor(nf);
      this.ctx.bus.emit(EV.FLOOR_ENTER, { floor: nf, name: this.floorDef.name });
    }
    const fd = this.floorDef;
    run.step = Math.max(0, Math.min(fd.steps.length - 1, step | 0));
    const sd = fd.steps[run.step];
    const base = sd.fixed || sd.from[0];
    let opt = { room: base.room, reward: base.reward, puzzle: !!base.puzzle, risk: !!base.risk, threat: base.threat === 'roll' ? this._rollThreat(run.step) : null };
    const R = { combat: ['combat', 'spell'], elite: ['elite', 'relic'], miniboss: ['miniboss', 'miniboss'], boss: ['boss', 'boss'], shop: ['shop', null], treasure: ['treasure', 'relic'], start: ['start', null] };
    if (force.room === 'puzzle') opt = { room: 'combat', reward: 'spell', puzzle: true, risk: false, threat: null };
    else if (force.room && R[force.room]) opt = { room: R[force.room][0], reward: R[force.room][1], puzzle: false, risk: false, threat: opt.threat };
    if (force.risk) Object.assign(opt, { room: 'elite', reward: 'corrupted', risk: true, puzzle: false });
    if (force.threat) opt.threat = force.threat;
    if (opt.room !== 'combat' && opt.room !== 'elite') opt.threat = null;
    this.force.doorThreat = force.doorThreat || null;
    this.force.riskDoor = !!force.riskDoor;
    if (force.riskDoor || force.risk) this.riskOffered = 0;
    this.enterRoom(opt, { forceTwist: force.twist || null, forceTpl: force.tpl || null });
  }

  unload() {
    const ctx = this.ctx;
    ctx.enemies.clear();
    ctx.shots.clearAll();
    ctx.zones.clear();
    ctx.pickups.clear();
    ctx.fx.clear();
    if (this.dark) { this.dark.destroy(); this.dark = null; }
    ctx.twist = null;
    if (ctx.world) ctx.world.destroy();
    ctx.world = null;
    this.doorsOpen = [];
    this.pedestal = null;
  }
}

/**
 * Dark twist (rules.twists.dark): one world-space RenderTexture over the room, cleared + filled + erased each render
 * frame with a light cookie on the player (lightRadiusPx) and on up to MAX_LIGHTS player shots (spellLightRadiusPx).
 * Depth DEPTH_DARK: above actors / player shots, below enemy bullets (they stay readable in the dark). One extra
 * render-target pass per frame, only in a dark room. Cookies: authored.light_r72 / light_r28 (fallback: a canvas
 * radial gradient generated once).
 */
const MAX_LIGHTS = 48;
class DarkLayer {
  constructor(ctx, cfg) {
    this.ctx = ctx;
    const s = ctx.scene, w = ctx.world;
    const pad = 96;
    this.x0 = -pad; this.y0 = -pad - TILE;
    this.alpha = cfg.alpha ?? ctx.T('darkTwistAlpha', 0.9);
    this.rt = s.add.renderTexture(this.x0, this.y0, w.w + 2 * pad, w.h + 2 * pad + TILE).setOrigin(0, 0).setDepth(DEPTH_DARK);
    this.big = this._cookie('authored.light_r72', cfg.lightRadiusPx);
    this.small = this._cookie('authored.light_r28', cfg.spellLightRadiusPx);
    // candlelight: static light pools on the room's candle props (World.lights)
    this.lights = cfg.lights && cfg.lights.length ? cfg.lights : null;
    this.candle = this.lights ? this._cookie('authored.light_r72', cfg.candleRadiusPx ?? 56) : null;
    // readability guarantee (worlds.md §3.1, style-guide §E): darkness never hides a threat — the telegraph layer draws
    // ABOVE the darkness while it exists (enemy outlines 61.75 and enemy bullets 62 already do)
    const tl = cfg.telegraphsFullBright !== false && ctx.enemies && ctx.enemies.tl;
    if (tl && tl.g) { this.tlG = tl.g; this.tlDepth = tl.g.depth; tl.g.setDepth(DEPTH_DARK + 0.05); }
  }
  _cookie(id, radius) {
    const s = this.ctx.scene;
    let a = Art.getQuiet(id, 0);
    if (!a) {
      const key = `dark:cookie${radius}`;
      if (!s.textures.exists(key)) {
        const d = radius * 2 + 1, tex = s.textures.createCanvas(key, d, d), c = tex.getContext();
        const g = c.createRadialGradient(radius + 0.5, radius + 0.5, 0, radius + 0.5, radius + 0.5, radius);
        g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(0.6, 'rgba(255,255,255,0.85)'); g.addColorStop(1, 'rgba(255,255,255,0)');
        c.fillStyle = g; c.fillRect(0, 0, d, d); tex.refresh();
      }
      a = { key };
    }
    const im = s.make.image({ x: 0, y: 0, key: a.key, frame: a.frame, add: false }).setOrigin(0.5);
    im.setScale((radius * 2 + 1) / Math.max(1, im.width));
    return im;
  }
  render() {
    const ctx = this.ctx, p = ctx.player, rt = this.rt;
    rt.clear();
    rt.fill(0x05030a, this.alpha);
    // commands are buffered until render(): the cookie images stay at (0, 0) and x/y ride on each command as an
    // offset (Phaser 4.1 DynamicTexture DRAW adds x/y to the object's own position for that command only)
    if (p && p.alive !== false) rt.erase(this.big, Math.round(p.coreX - this.x0), Math.round(p.coreY - this.y0));
    if (this.lights) for (const l of this.lights) rt.erase(this.candle, Math.round(l.x - this.x0), Math.round(l.y - this.y0));
    let n = 0;
    for (const sh of ctx.shots.live) {
      if (!sh.alive || sh.team !== 0) continue;
      if (++n > MAX_LIGHTS) break;
      rt.erase(this.small, Math.round(sh.x - this.x0), Math.round(sh.y - this.y0));
    }
    rt.render();
  }
  destroy() {
    this.rt.destroy(); this.big.destroy(); this.small.destroy();
    if (this.candle) this.candle.destroy();
    if (this.tlG && this.tlG.scene) this.tlG.setDepth(this.tlDepth);
  }
}
