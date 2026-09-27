// ui/hudHarness.js — DEV harness for the HUD, in-world UI and FTUE runner (UI developer B).
// Boot routes `?hudharness=1` here: start(bootScene) builds a synthetic RunState, a tiny stub sim scene
// ('hudstub') with a fake player driven by the real InputRouter intent, constructs WorldHud in it, launches
// HudScene against it, and fires scripted bus events on a timer so every element can be seen.
//
// Stub controls: WASD move · mouse aim · LMB cast (hold) · Space/RMB dash · Q / 1–3 wands · E nothing.
// Harness keys: N next scripted event now · P pause/resume the script · M reduced motion · H tutorial hints ·
//   F reset FTUE flags · G fake pad/kbm glyphs · T cast mode hold/toggle · B boss sequence · O open Pause (modal)
//   · L flash intensity 100/50/0 · K hit-stop probe (pauses the stub 400 ms)
// Not shipped behaviour: nothing in the game imports this file.

import Phaser from '../../lib/phaser.esm.min.js';
import { RunState } from '../run/RunState.js';
import { cat } from '../data/catalog.js';
import { Save } from '../core/save.js';
import { EV } from '../core/events.js';
import { WorldHud } from './WorldHud.js';
import { VIEW_W, VIEW_H } from '../config.js';

const WORLD = { w: 800, h: 480 };

class HudStub extends Phaser.Scene {
  constructor() { super('hudstub'); }

  create() {
    const reg = this.registry;
    this.bus = reg.get('bus');
    this.router = reg.get('router');
    this.flow = reg.get('flow');
    this.run = reg.get('run');
    const g = this.add.graphics();
    g.fillStyle(0x2f2630, 1).fillRect(0, 0, WORLD.w, WORLD.h);
    g.fillStyle(0x483b3a, 1).fillRect(32, 48, WORLD.w - 64, WORLD.h - 80);
    for (let x = 32; x < WORLD.w - 32; x += 16) for (let y = 48; y < WORLD.h - 32; y += 16) if (((x + y) >> 4) % 2) g.fillStyle(0x514241, 1).fillRect(x, y, 16, 16);
    this.cameras.main.setBounds(0, 0, WORLD.w, WORLD.h);

    this.p = { x: 400, y: 260, dash: 1, refill: 0 };
    this.player = this.add.image(this.p.x, this.p.y, 'ph-player').setOrigin(0.5, 1).setDepth(40);
    this.cameras.main.startFollow(this.player, true, 0.2, 0.2);
    this.enemies = [{ x: 300, y: 200, id: 'e1' }, { x: 520, y: 210, id: 'e2' }, { x: 470, y: 330, id: 'e3' }];
    this.enemySprites = this.enemies.map((e) => this.add.image(e.x, e.y, 'ph-enemy').setOrigin(0.5, 1).setDepth(40));
    this.crate = { x: 240, y: 320 };
    g.fillStyle(0x8a5f31, 1).fillRect(this.crate.x - 6, this.crate.y - 12, 12, 12);
    this.doors = [];
    this.pedestals = [{ x: 620, y: 300, kind: 'modifier', count: 3, taken: false }, { x: 180, y: 180, kind: 'relic', count: 2, taken: false }];
    for (const p of this.pedestals) g.fillStyle(0x94afc6, 1).fillRect(p.x - 6, p.y - 6, 12, 6);
    this.shop = { x: 700, y: 400 };
    g.fillStyle(0xfacb3e, 1).fillRect(this.shop.x - 5, this.shop.y - 10, 10, 10);
    this.doorG = this.add.graphics().setDepth(30);

    this.cast = { timer: 0, holdMs: 0, held: false };
    this.aim = { x: 1, y: 0 }; this.speed = 0; this.rechTotal = 1;
    this.wandCast = 0;

    this.worldHud = new WorldHud(this);
    this.scene.launch('hud', { sim: 'hudstub' });
    this.scene.bringToTop('hud');     // RunScene precedes 'hud' in the scene list; the stub is appended after it
    const banner = document.getElementById('dev-banner');   // boot's dev banner would cover the bottom HUD row
    if (banner && banner.style.display === 'block') { console.info('[hudharness] hiding dev banner:\n' + banner.textContent); banner.style.display = 'none'; }

    this.script = makeScript(this);
    this.scriptI = 0;
    this.scriptPaused = false;
    this.time.addEvent({ delay: 1400, loop: true, callback: () => { if (!this.scriptPaused) this.next(); } });
    this.bus.emit(EV.FLOOR_ENTER, { floor: 1, name: this.run.cat.floorList[0].name });
    this.bus.emit(EV.ROOM_ENTER, { floor: 1, step: 0, kind: 'start', templateId: 'harness' });

    const kb = this.input.keyboard;
    kb.on('keydown-N', () => this.next());
    kb.on('keydown-P', () => { this.scriptPaused = !this.scriptPaused; console.info('[hudharness] script', this.scriptPaused ? 'paused' : 'running'); });
    kb.on('keydown-M', () => { const v = !Save.reducedMotion; Save.setSetting('reducedMotion', v); this.bus.emit(EV.SETTINGS_CHANGED, 'reducedMotion', v); console.info('[hudharness] reducedMotion', v); });
    kb.on('keydown-H', () => { const v = !Save.settings.tutorialHints; Save.setSetting('tutorialHints', v); this.bus.emit(EV.SETTINGS_CHANGED, 'tutorialHints', v); console.info('[hudharness] hints', v); });
    kb.on('keydown-F', () => { Save.clearFtue(); this.worldHud.ftue.resetSession(); console.info('[hudharness] FTUE flags cleared'); });
    kb.on('keydown-G', () => { this.router.device = this.router.device === 'pad' ? 'kbm' : 'pad'; this.bus.emit(EV.INPUT_DEVICE, this.router.device); });
    kb.on('keydown-T', () => { const v = Save.settings.castMode === 'toggle' ? 'hold' : 'toggle'; Save.setSetting('castMode', v); this.router.resetCastLatch(); console.info('[hudharness] castMode', v); });
    kb.on('keydown-B', () => bossSequence(this));
    kb.on('keydown-O', () => this.flow.open('pause', { tab: 'menu' }));
    kb.on('keydown-L', () => { const v = { 100: 50, 50: 0, 0: 100 }[Save.settings.flashIntensity] ?? 100; Save.setSetting('flashIntensity', v); this.bus.emit(EV.SETTINGS_CHANGED, 'flashIntensity', v); console.info('[hudharness] flashIntensity', v); });
    kb.on('keydown-K', () => { this.scene.pause(); setTimeout(() => this.scene.resume(), 400); });
  }

  next() { const f = this.script[this.scriptI % this.script.length]; this.scriptI++; try { f(); } catch (e) { console.error('[hudharness] step failed', e); } }

  hudProbe() {
    const cam = this.cameras.main;
    const P = this.p;
    const w = this.run.wand;
    const d = (a) => Math.hypot(a.x - P.x, a.y - P.y);
    const enemyDist = Math.min(...this.enemies.map(d));
    let interact = null;
    for (const p of this.pedestals) if (!p.taken && d(p) <= 24) interact = { kind: 'pedestal', verb: 'take', x: p.x, y: p.y - 8 };
    if (d(this.shop) <= 24) interact = { kind: 'shop', verb: 'shop', x: this.shop.x, y: this.shop.y - 10 };
    const rt = w.state.rechargeTimerMs;
    this._probe = this._probe || { player: {}, wand: {}, camera: {}, room: {}, near: {} };
    const o = this._probe;
    Object.assign(o.player, { x: P.x, y: P.y, coreX: P.x, coreY: P.y - 8, aimX: this.aim.x, aimY: this.aim.y, speed: this.speed, moving: this.speed > 0, alive: true, dashCharges: P.dash, dashMax: 1, dashRefillFrac: P.refill, slowed: false });
    Object.assign(o.wand, { index: this.run.activeWand, recharging: rt > 0, rechargeFrac: rt > 0 ? rt / this.rechTotal : 0, castReady: rt <= 0, holdMs: this.cast.holdMs });
    Object.assign(o.camera, { scrollX: cam.scrollX, scrollY: cam.scrollY });
    Object.assign(o.room, { kind: this.roomKind || 'combat', templateId: 'harness', cleared: !!this.cleared, inCombat: !this.cleared, enemiesAlive: this.cleared ? 0 : 3, controllable: true });
    // optional probe fields requested from the lead (elite HP, last-enemy chevrons): a damaged elite and a far enemy
    const far = { x: WORLD.w - 20, y: WORLD.h - 20 };
    const fx = far.x - cam.scrollX, fy = far.y - cam.scrollY;
    const offscreen = fx < 0 || fy < 0 || fx > VIEW_W || fy > VIEW_H ? [far] : [];
    const e2 = this.enemies[1];
    Object.assign(o.near, { crateDist: d(this.crate), enemyDist, interact, doors: this.doors, pedestals: this.pedestals, shopDist: d(this.shop), hasDangerEnemy: false,
      elites: [{ x: e2.x, y: e2.y - 14, hpFrac: 0.6, damaged: true }], offscreen });
    return o;
  }

  update(time, delta) {
    const cam = this.cameras.main;
    const it = this.router.sample(this.p.x - cam.scrollX, this.p.y - 8 - cam.scrollY);
    this.aim = { x: it.aimX, y: it.aimY };
    const sp = 90 * (delta / 1000);
    this.speed = Math.hypot(it.moveX, it.moveY) * 90;
    this.p.x = Phaser.Math.Clamp(this.p.x + it.moveX * sp, 40, WORLD.w - 40);
    this.p.y = Phaser.Math.Clamp(this.p.y + it.moveY * sp, 64, WORLD.h - 36);
    if (it.dashPressed && this.p.dash > 0) { this.p.dash = 0; this.p.refill = 0; this.p.x += it.moveX * 30; this.p.y += it.moveY * 30; this.bus.emit(EV.PLAYER_DASHED); }
    if (this.p.dash < 1) { this.p.refill += delta / 900; if (this.p.refill >= 1) { this.p.dash = 1; this.p.refill = 0; } }
    this.player.setPosition(Math.round(this.p.x), Math.round(this.p.y));
    if (it.wandSlot && it.wandSlot <= this.run.wands.length && it.wandSlot - 1 !== this.run.activeWand) { this.run.selectWand(it.wandSlot - 1, 120); this.bus.emit(EV.FTUE, 'wand-swapped'); }
    if (it.wandNext || it.wandPrev) { if (this.run.cycleWand(it.wandNext ? 1 : -1, 120)) this.bus.emit(EV.FTUE, 'wand-swapped'); }
    this.tickWands(delta, it);
    this.worldHud.update(delta);
  }

  /** A minimal wand loop that emits the contract's wand events (mana, cast, sputter, recharge). */
  tickWands(delta, it) {
    const r = this.run;
    r.wands.forEach((w, i) => {
      const st = w.state, max = r.manaMax(i);
      st.mana = Math.min(max, st.mana + (w.def.manaRegen * delta) / 1000);
      if (st.rechargeTimerMs > 0) { st.rechargeTimerMs = Math.max(0, st.rechargeTimerMs - delta); if (!st.rechargeTimerMs) { st.cursor = 0; this.bus.emit(EV.WAND_RECHARGE, i); } }
      this.bus.emit(EV.PLAYER_MANA, i, st.mana, max);
    });
    const held = it.castHeld;
    if (held) this.cast.holdMs += delta;
    else if (this.cast.held) { this.bus.emit(EV.FTUE, 'cast-release', { holdMs: this.cast.holdMs }); this.cast.holdMs = 0; }
    this.cast.held = held;
    this.cast.timer = Math.max(0, this.cast.timer - delta);
    const w = r.wand, st = w.state;
    if ((held || it.castPressed) && this.cast.timer <= 0 && st.rechargeTimerMs <= 0) {
      const slots = st.order.length ? st.order : [];
      if (!slots.length) { this.bus.emit(EV.WAND_SPUTTER, { wand: r.activeWand, reason: 'empty' }); this.cast.timer = 250; return; }
      const slot = slots[st.cursor % slots.length];
      const card = r.cat.cards[st.slots[slot]];
      const skipped = [], drawn = [];
      if (card && st.mana < card.mana) { skipped.push(slot); this.bus.emit(EV.WAND_SPUTTER, { wand: r.activeWand, reason: 'mana' }); }
      else { drawn.push(slot); st.mana -= card ? card.mana : 0; }
      st.cursor++;
      const wrap = st.cursor >= slots.length;
      const nextSlot = wrap ? slots[0] : slots[st.cursor];
      this.bus.emit(EV.WAND_CAST, { wand: r.activeWand, firedSlots: drawn, skippedSlots: skipped, drawnSlots: drawn, cursor: st.cursor, nextSlot, empty: false, recharge: wrap });
      if (drawn.length) {
        const e = this.enemies[(this.wandCast++) % this.enemies.length];
        this.bus.emit(EV.DAMAGE_NUMBER, { x: e.x, y: e.y - 16, amount: card.stats ? card.stats.damage : 3, crit: Math.random() < 0.15, element: card.element, target: 'enemy', id: e.id });
      }
      this.cast.timer = w.def.castDelayMs;
      if (wrap) { this.rechTotal = r.effectiveRecharge(r.activeWand); st.rechargeTimerMs = this.rechTotal; this.bus.emit(EV.WAND_RECHARGE_START, r.activeWand, this.rechTotal); }
    }
  }
}

function makeScript(s) {
  const r = s.run, bus = s.bus;
  const e = (i) => s.enemies[i % s.enemies.length];
  return [
    () => { s.roomKind = 'combat'; s.cleared = false; bus.emit(EV.ROOM_ENTER, { floor: 1, step: 3, kind: 'combat', templateId: 'harness' }); },
    () => { r.addCoins(7); bus.emit(EV.DAMAGE_NUMBER, { x: e(0).x, y: e(0).y - 16, amount: 4.2, crit: false, target: 'enemy', id: 'e1' }); setTimeout(() => bus.emit(EV.DAMAGE_NUMBER, { x: e(0).x, y: e(0).y - 16, amount: 3, crit: true, target: 'enemy', id: 'e1' }), 120); },
    () => { r.damage(1); bus.emit(EV.PLAYER_HURT, { damage: 1, source: 'harness', shieldBroke: false }); },
    () => { const pool = r.cat.relicList.filter((x) => !r.relics.includes(x.id)); if (pool.length) r.addRelic(pool[0].id); },
    () => { if (r.relics.length) bus.emit(EV.RELIC_TRIGGERED, r.relics[0]); bus.emit(EV.STATUS_FIRST, { status: 'burn' }); },
    () => { bus.emit(EV.REACTION, { name: 'melt', first: true, x: e(1).x, y: e(1).y - 16 }); bus.emit(EV.DAMAGE_NUMBER, { x: e(1).x, y: e(1).y - 16, amount: 14, crit: false, target: 'enemy', id: 'e2' }); },
    () => { bus.emit(EV.DAMAGE_NUMBER, { x: e(2).x, y: e(2).y - 16, amount: 9, crit: false, target: 'enemy', id: 'e3' }); bus.emit(EV.REACTION, { name: 'overload', first: false, x: e(2).x, y: e(2).y - 16 }); },
    () => { r.addCard('spark_bolt'); },
    () => { s.cleared = true; bus.emit(EV.ROOM_CLEARED, { floor: 1, step: 3, kind: 'combat' }); },
    () => {
      s.doors = [{ x: 330, y: 64, roomKind: 'elite', reward: 'relic', choice: true }, { x: 470, y: 64, roomKind: 'treasure', reward: 'wand', choice: true }];
      s.doorG.clear(); for (const d of s.doors) s.doorG.fillStyle(0x222222, 1).fillRect(d.x - 8, d.y - 16, 16, 32);
      bus.emit(EV.DOORS_OPEN, s.doors);
    },
    () => { r.heal(2); r.addCoins(12); },
    () => { r.setShield(1); },
    () => { r.setHp(2); bus.emit(EV.LOW_HP, true); },
    () => { bus.emit(EV.PLAYER_HURT, { damage: 1, source: 'harness', shieldBroke: true }); r.setShield(0); },
    () => { r.setHp(r.maxHp); bus.emit(EV.LOW_HP, false); },
    () => { bus.emit(EV.WAND_SPUTTER, { wand: r.activeWand, reason: 'mana' }); bus.emit(EV.WAND_CAST, { wand: r.activeWand, firedSlots: [], skippedSlots: [1], drawnSlots: [], cursor: 2, nextSlot: 2, empty: false, recharge: false }); },
    () => { bus.emit(EV.TOAST, { text: 'Unlocked on run end: Pyromancer', icon: { glyph: 'g_ok' } }); bus.emit(EV.CARD_OVERFLOW, ['spark_bolt']); },
    () => { if (r.wands.length < 2) { const wid = r.cat.wandList.find((w) => !r.wands.some((x) => x.id === w.id)); if (wid) r.takeWand(wid.id, null); } },
    () => bossSequence(s),
  ];
}

function bossSequence(s) {
  const bus = s.bus, cat = s.run.cat;
  const boss = cat.bossList ? cat.bossList[0] : Object.values(cat.bosses)[0];
  let hp = boss.hp;
  bus.emit(EV.BOSS_START, { id: boss.id, name: boss.name, title: boss.title, hp, maxHp: boss.hp, thresholds: (boss.phases || []).map((p) => p.untilHpFrac) });
  let n = 0;
  const hit = () => {
    n++;
    hp = Math.max(0, hp - 60);
    bus.emit(EV.BOSS_HP, hp, boss.hp);
    if (n === 6) bus.emit(EV.BOSS_PHASE, 1);
    if (hp > 0 && n < 11) setTimeout(hit, n % 3 ? 150 : 700);
    else setTimeout(() => bus.emit(EV.BOSS_DEAD, { id: boss.id }), 1200);
  };
  setTimeout(hit, 1600);
}

/** Entry from BootScene (`?hudharness=1`). */
export function start(boot) {
  const game = boot.game;
  const bus = boot.registry.get('bus');
  const seed = 12345;
  const run = new RunState({ seed, cat: cat(), loadoutId: 'stormcaller', tutorial: false, isUnlocked: Save.isUnlocked.bind(Save), emit: (ev, ...a) => bus.emit(ev, ...a) });
  boot.registry.set('run', run);
  if (!game.scene.getScene('hudstub')) game.scene.add('hudstub', HudStub, false);
  boot.scene.start('hudstub');
  console.info('[hudharness] started — N next event · P pause script · M reduced motion · H hints · F reset FTUE · G pad glyphs · T cast mode · B boss · O pause modal · L flash · K hit-stop');
}
