// sim/RoomDirector.js — the run's room flow (progression-and-pacing §1–§3, systems §8, mechanic-spec §9.5):
//   route: 3 floors × 10 steps (0 start · 1..8 door steps · 9 boss); door options per floors.json step
//          (`fixed` → one centre door; `choose: 2` → two weighted, distinct doors, run stream; per-floor
//          `limits` heal/wand) · templates avoid repeating the previous one · first run: F1 steps 1–2 use
//          `tutorialTemplate` + fixedWaves + tutorialReward; `tutorialDone` set when step 3's doors open
//   waves: budget(step, w) = floor(floor(base + perStep·step) × (1 + waveGrowth·w)); fillWave by weight
//          (ai stream); elites cost threat × eliteThreatMult; next wave at alive ≤ 2 after ≥ 8 s, or alive 0
//   clear: reward per the door's reward kind → pedestal / coins / heart; doors open with the next options
//   rooms are rebuilt, not scenes (scene-flow §1): fade out → unload → load → fade in (feel roomFadeMs)

import { TILE } from '../config.js';
import { EV } from '../core/ev.js';
import { Save } from '../core/save.js';
import { World } from './World.js';
import { track } from '../core/log.js';
import { rollDraft } from '../run/economy.js';
import { Art } from '../core/art.js';

function artImage(scene, x, y, id, fallback) { const a = Art.getQuiet(id, 0); return a ? scene.add.image(x, y, a.key, a.frame) : scene.add.image(x, y, fallback); }

export class RoomDirector {
  constructor(ctx) {
    this.ctx = ctx;
    this.room = null;          // { kind, reward, templateId, tpl, key }
    this.waves = [];           // pending waves: [[{id, elite}]]
    this.waveIndex = -1;
    this.waveElapsed = 0;
    this.combatActive = false;
    this.cleared = false;
    this.transitioning = false;
    this.doorsOpen = [];
    this.graceMs = 0;
    this.pedestal = null;
  }
  get run() { return this.ctx.run; }
  get cat() { return this.ctx.cat; }
  get floorDef() { return this.cat.floors[`f${this.run.floor}`]; }

  // ================================================================== room choice
  /** Load a room for (floor, step) from a door option {room:kind, reward}. */
  enterRoom(option, opts = {}) {
    const run = this.run, fd = this.floorDef, ctx = this.ctx;
    const kind = option.room;
    let tplId;
    const stepDef = fd.steps[run.step] || {};
    if (kind === 'start') tplId = fd.startRoom;
    else if (kind === 'shop') tplId = fd.shopRoom;
    else if (kind === 'treasure') tplId = fd.treasureRoom;
    else if (kind === 'boss') tplId = fd.bossRoom;
    else if (kind === 'elite') tplId = this._pickTemplate(fd.eliteRooms);
    else if (run.tutorial && run.floor === 1 && stepDef.tutorialTemplate && !Save.flag('tutorialDone')) tplId = stepDef.tutorialTemplate;
    else tplId = this._pickTemplate(fd.combatRooms);
    const tpl = this.cat.rooms[tplId];
    run.usedTemplates.add(tplId);
    this.lastTemplate = tplId;
    const key = `f${run.floor}s${run.step}`;
    this.room = { kind, reward: option.reward, templateId: tplId, tpl, key, name: tpl.name };
    run.route.push({ floor: run.floor, step: run.step, roomKind: kind, reward: option.reward, templateId: tplId, cleared: false });

    // build the world
    ctx.world = new World(ctx.scene, tpl, { floor: run.floor, rng: ctx.rng.fx, crateHp: ctx.rules.enemies.crateHp });
    ctx.onWorldBuilt();
    this.cleared = false; this.combatActive = false; this.doorsOpen = []; this.pedestal = null;
    this.waveIndex = -1; this.waves = []; this.waveElapsed = 0; this.bossSpawned = false;
    this.graceMs = ctx.rules.waves.roomEnterGraceMs;

    if (kind === 'combat' || kind === 'elite') this._planWaves(kind, tpl);
    else if (kind === 'boss') this.combatActive = true;

    ctx.bus.emit(EV.ROOM_ENTER, { floor: run.floor, step: run.step, kind, templateId: tplId, reward: option.reward, name: tpl.name });
    ctx.relics.onEvent('room_enter', { x: ctx.player.x, y: ctx.player.y });
    track('room_enter', { floor: run.floor, step: run.step, kind, tpl: tplId });

    // rest rooms: no enemies → rewards/doors immediately
    if (kind === 'start' || kind === 'treasure' || kind === 'shop') this._restRoom(kind);
  }

  _pickTemplate(list) {
    const rng = this.ctx.rng.run;
    const fresh = list.filter((id) => id !== this.lastTemplate && !this.run.usedTemplates.has(id));
    const pool = fresh.length ? fresh : list.filter((id) => id !== this.lastTemplate);
    return rng.pick(pool.length ? pool : list);
  }

  // ================================================================== waves (progression §3)
  _planWaves(kind, tpl) {
    const run = this.run, fd = this.floorDef, rules = this.ctx.rules;
    if (tpl.fixedWaves && run.tutorial && !Save.flag('tutorialDone')) {
      this.waves = tpl.fixedWaves.map((w) => { const out = []; for (const g of w) for (let i = 0; i < g.count; i++) out.push({ id: g.enemy, elite: false }); return out; });
      return;
    }
    const wc = fd.waves[kind === 'elite' ? 'elite' : 'combat'];
    const step = run.step;
    const growth = rules.waves.waveGrowth;
    const rng = this.ctx.rng.ai;
    for (let w = 0; w < wc.count; w++) {
      let budget = Math.floor(Math.floor(wc.budgetBase + wc.budgetPerStep * step) * (1 + growth * w));
      if (kind === 'elite' && w === 0 && this.ctx.curse) budget += this.ctx.curse.eliteExtraBudget || 0;
      const wave = [];
      if (kind === 'elite' && w === 0) {
        for (let e = 0; e < (wc.elites || 1); e++) {
          const cands = fd.eliteCandidates.filter((id) => this._minStepOk(id, step));
          const id = rng.pick(cands.length ? cands : fd.eliteCandidates);
          wave.push({ id, elite: true });
          budget -= this.cat.enemies[id].threat * rules.enemies.eliteThreatMult;
        }
      }
      while (wave.length < rules.waves.maxPerWave) {
        const cands = fd.enemyPool.filter((p) => p.minStep <= step && this.cat.enemies[p.id].threat <= budget && this.cat.enemies[p.id].threat > 0);
        if (!cands.length) break;
        const pick = rng.weighted(cands);
        wave.push({ id: pick.id, elite: false });
        budget -= this.cat.enemies[pick.id].threat;
      }
      this.waves.push(wave);
    }
  }
  _minStepOk(id, step) { const e = this.floorDef.enemyPool.find((p) => p.id === id); return !e || e.minStep <= step; }

  _spawnWave() {
    const ctx = this.ctx, rules = ctx.rules, w = ctx.world, p = ctx.player;
    this.waveIndex++;
    this.waveElapsed = 0;
    const wave = this.waves[this.waveIndex] || [];
    const rng = ctx.rng.ai;
    const markers = w.markers.spawns.slice();
    for (const u of wave) {
      const def = this.cat.enemies[u.id];
      let pos = null;
      const ok = markers.filter((m) => Math.hypot(m.x - p.x, m.y - p.y) >= rules.enemies.minSpawnDistPx);
      if (def.flying && rng.chance(0.5)) pos = w.randomWalkable(rng, { flyer: true, from: p, minDist: rules.enemies.minSpawnDistPx });
      if (!pos) pos = ok.length ? rng.pick(ok) : markers.sort((a, b) => Math.hypot(b.x - p.x, b.y - p.y) - Math.hypot(a.x - p.x, a.y - p.y))[0];
      if (!pos) pos = w.randomWalkable(rng, { from: p, minDist: 64 });
      const jitter = { x: rng.float(-4, 4), y: rng.float(-4, 4) };
      ctx.enemies.spawn(u.id, pos.x + jitter.x, pos.y + jitter.y, { elite: u.elite, portal: true });
    }
    ctx.bus.emit(EV.WAVE_SPAWN, { index: this.waveIndex, count: wave.length });
    ctx.mixer.fire('wave_spawn');
  }

  // ================================================================== per step
  step(dt) {
    if (this.transitioning || !this.room) return;
    const ctx = this.ctx, rules = ctx.rules;
    if (this.graceMs > 0) { this.graceMs -= dt; return; }
    if (this.room.kind === 'boss') { this._stepBoss(dt); return; }
    if (!this.cleared && this.waves.length) {
      const alive = ctx.enemies.aliveCount();
      if (this.waveIndex < 0) this._spawnWave();
      else {
        this.waveElapsed += dt;
        const last = this.waveIndex >= this.waves.length - 1;
        if (!last && (alive === 0 || (alive <= rules.waves.nextWaveWhenAliveAtMost && this.waveElapsed >= rules.waves.nextWaveMinElapsedMs))) this._spawnWave();
        else if (last && alive === 0) this._clear();
      }
      this.combatActive = !this.cleared;
    }
    this._checkDoors();
  }

  _stepBoss(dt) {
    const ctx = this.ctx;
    if (!this.bossSpawned) {
      this.bossSpawned = true;
      const m = ctx.world.markers.boss || { x: ctx.world.w / 2, y: ctx.world.h / 3 };
      this.boss = ctx.enemies.spawnBoss(this.floorDef.boss, m.x, m.y);
      this.combatActive = true;
      return;
    }
    if (!this.cleared && this.boss && !this.boss.alive && !this.bossDeathHandled) {
      this.bossDeathHandled = true;
      this.run.stats.bossesKilled.push(this.floorDef.boss);
      // wait for the death visual (bossDeathUnravelMs + burst) then award
      const wait = ctx.T('bossDeathUnravelMs') + 600;
      ctx.scene.time.delayedCall(wait, () => this._bossCleared());
    }
    this._checkDoors();
  }

  _bossCleared() {
    const ctx = this.ctx, fd = this.floorDef;
    if (fd.index >= 3 || this.run.floor >= 3) { ctx.onVictory(); return; }
    const rw = this.cat.bosses[fd.boss].rewards || {};
    this.cleared = true; this.combatActive = false;
    const c = { x: ctx.world.w / 2, y: ctx.world.h / 2 };
    if (rw.coins) ctx.pickups.coin(c.x, c.y, rw.coins);
    if (rw.heal) this.run.heal(rw.heal);
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
    this.cleared = true; this.combatActive = false;
    run.route[run.route.length - 1].cleared = true;
    run.stats.roomsCleared++;
    ctx.pickups.vacuumAll();
    ctx.bus.emit(EV.ROOM_CLEARED, { floor: run.floor, step: run.step, kind: this.room.kind });
    ctx.relics.onEvent('room_clear', { x: ctx.player.x, y: ctx.player.y });
    ctx.mixer.fire('room_clear');
    track('room_clear', { floor: run.floor, step: run.step });
    // reward appears at room clear + 300 ms, doors at + 450 ms (event-markers §4)
    ctx.scene.time.delayedCall(300, () => this._grantReward(this.room.reward));
    ctx.scene.time.delayedCall(450, () => this._openDoors(this._nextOptions()));
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
      case 'coins': ctx.pickups.coin(c.x, c.y, eco.rewards.coinsBase + eco.rewards.coinsPerFloor * run.floor); break;
      case 'heal': ctx.pickups.heart(c.x, c.y, eco.rewards.healAmount); break;
      default: break;
    }
    if (kind === 'heal') run.floorLimits.heal++;
    if (kind === 'wand') run.floorLimits.wand++;
    ctx.mixer.fire('reward_appear');
  }

  /** A reward pedestal: interact → the reward modal (the offer lives in RunState). */
  _placeRewardPedestal(kind, x, y, fixed = null) {
    const ctx = this.ctx, run = this.run;
    const roomKey = `${this.room.key}:${kind}`;
    run.makeOffer(kind, roomKey, fixed);
    const g = artImage(ctx.scene, x, y, 'tiles.pedestal', 'ph-pedestal').setDepth(30);
    const glow = artImage(ctx.scene, x, y - 8, 'authored.glow_16', 'ph-glow').setBlendMode(1).setDepth(61).setAlpha(0.5).setTint(kind === 'relic' || kind === 'bossRelic' ? 0x8b7cf0 : kind === 'wand' ? 0xfacb3e : 0x5698cc);
    const label = { spell: 'Spell draft', modifier: 'Modifier draft', relic: 'Relic', bossRelic: 'Relic', wand: 'Wand' }[kind];
    const n = run.offer.items.length;
    const it = ctx.pickups.addInteract({ kind: 'pedestal', rewardKind: kind, x, y, verb: 'take', label, count: n, roomKey,
      onUse: () => { if (run.offer && run.offer.roomKey === roomKey && !run.offer.taken) { ctx.openOverlay('reward', {}); return true; } return false; } });
    it.sprite = g; it.glow = glow;
    this.pedestal = it;
    ctx.fx.particles('mote', x, y - 6, 6, { color: 0xfdf7ed, speed: 20 });
  }

  _restRoom(kind) {
    const ctx = this.ctx, run = this.run, w = ctx.world;
    this.cleared = true;
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
    ctx.scene.time.delayedCall(kind === 'start' ? 0 : 250, () => this._openDoors(this._nextOptions()));
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
  /** Options for the next step (floors.json steps[step+1]); limits heal/wand per floor. */
  _nextOptions() {
    const run = this.run, fd = this.floorDef;
    const next = fd.steps[run.step + 1];
    if (!next) return [];
    if (next.fixed) return [{ room: next.fixed.room, reward: next.fixed.reward }];
    const lim = fd.limits || {};
    let pool = next.from.filter((o) => !((o.reward === 'heal' && run.floorLimits.heal >= (lim.heal ?? 99)) || (o.reward === 'wand' && run.floorLimits.wand >= (lim.wand ?? 99))));
    const out = [];
    const rng = this.ctx.rng.run;
    const n = Math.min(next.choose || 2, pool.length);
    for (let i = 0; i < n; i++) {
      const pick = rng.weighted(pool);
      out.push({ room: pick.room, reward: pick.reward });
      pool = pool.filter((o) => o !== pick);
    }
    return out;
  }

  _openDoors(options) {
    const ctx = this.ctx, run = this.run;
    if (!options.length) return;
    const doors = ctx.world.openDoors(options);
    this.doorsOpen = doors;
    ctx.bus.emit(EV.DOORS_OPEN, doors.map((d) => ({ roomKind: d.option.room, reward: d.option.reward, x: d.x, y: d.y, choice: d.kind === 'choice' || options.length > 1 })));
    doors.forEach((d, i) => ctx.scene.time.delayedCall(i * 120, () => ctx.mixer.fire('door_open', { index: i })));   // +120 ms per door, later ones −6 dB
    // FTUE: tutorialDone is set when F1 step 3's doors open (step 2 cleared)
    if (run.tutorial && run.floor === 1 && run.step + 1 >= 3 && !Save.flag('tutorialDone')) Save.setFlag('tutorialDone');
    ctx.player.controllable = true;
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

  nextFloor() {
    const run = this.run;
    this.ctx.mixer.fire('floor_descend');
    run.floor++;
    run.step = 0;
    run.floorLimits = { heal: 0, wand: 0 };
    run.usedTemplates = new Set();
    run.stats.maxFloor = Math.max(run.stats.maxFloor, run.floor);
    this.ctx.setFloor(run.floor);
    this.ctx.bus.emit(EV.FLOOR_ENTER, { floor: run.floor, name: this.floorDef.name });
    this.enterRoom({ room: 'start', reward: null });
  }

  unload() {
    const ctx = this.ctx;
    ctx.enemies.clear();
    ctx.shots.clearAll();
    ctx.zones.clear();
    ctx.pickups.clear();
    ctx.fx.clear();
    if (ctx.world) ctx.world.destroy();
    ctx.world = null;
    this.doorsOpen = [];
    this.pedestal = null;
  }
}
