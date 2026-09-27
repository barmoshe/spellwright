// sim/enemies/devArena.js — enemy-developer harness (`?enemyharness=1`, Boot hook). Starts a REAL run (the
// lead's RunScene, RoomDirector, Player, Shots, Combat) in the floor's start room and adds Shift-hotkeys to
// spawn every enemy, apply statuses and jump to each boss, so AI, telegraphs, interrupts and deaths are
// exercised against the actual integration. Console API: __SW__.arena.* (same actions).
//
//   Shift+1..0,-,=  spawn bat skeleton cultist frost_mage brute slime fire_imp eye_turret wraith necromancer stone_golem skull
//   Shift+Q         spawn an elite of the last spawned id
//   Shift+C / X / Z chill / shock / freeze the nearest enemy        Shift+V  30 damage to the nearest
//   Shift+G         god mode        Shift+K kill all        Shift+B boss room (this floor)        Shift+N next floor
//   Shift+R         ×0.9 curse windups (curse L2 feel)       Shift+T toggle reduced motion flag

const ORDER = ['bat', 'skeleton', 'cultist', 'frost_mage', 'brute', 'slime', 'fire_imp', 'eye_turret', 'wraith', 'necromancer', 'stone_golem', 'skull'];
const KEYS = ['Digit1', 'Digit2', 'Digit3', 'Digit4', 'Digit5', 'Digit6', 'Digit7', 'Digit8', 'Digit9', 'Digit0', 'Minus', 'Equal'];

export function start(boot) {
  const game = boot.game;
  boot.scene.start('run', { seed: 20260927 });
  const run = game.scene.getScene('run');
  run.events.once('create', () => install(run));
}

function install(run) {
  const ctx = () => run.ctx;
  let lastId = 'skeleton';
  const spawnNear = (id, opts = {}) => {
    const c = ctx(); if (!c || !c.world) return null;
    const p = c.player;
    const pt = c.world.randomWalkable(c.rng.fx, { flyer: false, from: { x: p.x, y: p.y }, minDist: 70, maxDist: 150, wallClear: 1 })
      || c.world.randomWalkable(c.rng.fx, { from: { x: p.x, y: p.y }, minDist: 40 });
    if (!pt) return null;
    lastId = id;
    return c.enemies.spawn(id, pt.x, pt.y, { portal: true, ...opts });
  };
  const nearest = () => { const c = ctx(); return c ? c.enemies.nearest(c.player.x, c.player.y, 1e6, null) : null; };
  const api = {
    spawn: spawnNear,
    boss: (id) => { const c = ctx(); const w = c.world; const m = w.markers.boss || { x: w.w / 2, y: w.h / 3 }; return c.enemies.spawnBoss(id, m.x, m.y); },
    chill: (e = nearest()) => e && ctx().combat.applyStatus(e, 'chill'),
    shock: (e = nearest()) => e && ctx().combat.applyStatus(e, 'shock'),
    freeze: (e = nearest()) => { if (!e) return; for (let i = 0; i < 3; i++) ctx().combat.applyStatus(e, 'chill'); },
    hit: (e = nearest(), n = 30) => e && ctx().combat.hitEnemy(e, n, { source: 'direct', x: e.x, y: e.y }),
    god: (on = true) => { run.god = on; ctx().player.iframesMs = on ? 1e12 : 0; },
    killAll: () => ctx().enemies.killAll('damage'),
    bossRoom: () => run._debugJump(9),
    nextFloor: () => run._transition(() => ctx().director.nextFloor()),
    curse: (m = 0.9) => { const c = ctx(); c.curse = Object.assign({}, c.curse || {}, { windupMult: m }); },
    reduced: (on) => { const c = ctx(); c.flags.reducedMotion = on ?? !c.flags.reducedMotion; return c.flags.reducedMotion; },
    ctx,
    // ---- verification helpers: freeze the run on a telegraph moment and blow up a region of the canvas
    /** Resume, wait until an enemy `id` is winding up at progress ≥ pmin (optional attack type), then pause. */
    waitWind: (id, pmin = 0, type = null, ms = 12000) => api.waitState(id, (e) => e.ai.state === 'windup' && (!type || e.ai.atk.type === type) && e.ai.wElapsed / e.ai.wTotal >= pmin, ms),
    /** Resume, wait until an enemy `id` satisfies pred(e), then pause the run scene (it keeps rendering). */
    waitState: async (id, pred, ms = 12000) => {
      run.scene.resume();
      const t0 = performance.now();
      while (performance.now() - t0 < ms) {
        await new Promise((r) => setTimeout(r, 8));   // not rAF: a hidden preview pane pauses rAF
        const e = ctx().enemies.live.find((x) => (!id || x.id === id) && pred(x));
        if (e) { run.scene.pause(); return api.info(e); }
      }
      return 'timeout';
    },
    info: (e) => ({ id: e.id, uid: e.uid, alive: e.alive, state: e.ai.state, atk: e.ai.atk && e.ai.atk.id, p: e.ai.wTotal ? +(e.ai.wElapsed / e.ai.wTotal).toFixed(2) : 0,
      locked: e.ai.locked, stun: e.ai.stunKind, hp: +e.hp.toFixed(1), x: e.x | 0, y: e.y | 0, decals: ctx().enemies.debug.decals() }),
    /** Drive the game loop by hand (a hidden preview pane throttles timers): step until pred() is truthy. */
    until: async (pred, maxMs = 20000) => {
      const g = run.game, n = Math.ceil(maxMs / 16.6667);
      for (let i = 0; i < n; i++) {
        api._t = Math.max(api._t || 0, performance.now()) + 16.6667;
        g.step(api._t, 16.6667);
        const r = pred();
        if (r) return r;
        if (i % 60 === 59) await new Promise((res) => setTimeout(res, 0));
      }
      return null;
    },
    pump: (ms) => api.until(() => false, ms),
    resume: () => { api.unpeek(); run.scene.resume(); },
    pause: () => run.scene.pause(),
    /** Overlay a nearest-neighbour ×scale blow-up of a world-space region (w×h px) on the page. */
    peek: (wx, wy, w = 160, h = 90, scale = 5) => new Promise((res) => {
      const g = run.game, v = ctx().cam.view;
      const sx = Math.max(0, Math.round(wx - v.x - w / 2)), sy = Math.max(0, Math.round(wy - v.y - h / 2));
      g.renderer.snapshotArea(sx, sy, w, h, (img) => {
        let o = document.getElementById('peek');
        if (!o) { o = document.createElement('div'); o.id = 'peek'; o.style.cssText = 'position:fixed;left:0;top:0;z-index:99999;background:#000;'; document.body.appendChild(o); }
        o.innerHTML = '';
        const c = document.createElement('canvas'); c.width = w * scale; c.height = h * scale;
        const cx = c.getContext('2d'); cx.imageSmoothingEnabled = false; cx.drawImage(img, 0, 0, w * scale, h * scale);
        o.appendChild(c); o.style.display = 'block'; res('ok');
      });
    }),
    unpeek: () => { const o = document.getElementById('peek'); if (o) o.style.display = 'none'; },
  };
  window.__SW__ = window.__SW__ || {};
  window.__SW__.arena = api;
  run.input.keyboard.on('keydown', (ev) => {
    if (!ev.shiftKey) return;
    const i = KEYS.indexOf(ev.code);
    if (i >= 0) { spawnNear(ORDER[i]); return; }
    switch (ev.code) {
      case 'KeyQ': spawnNear(lastId, { elite: true }); break;
      case 'KeyC': api.chill(); break;
      case 'KeyX': api.shock(); break;
      case 'KeyZ': api.freeze(); break;
      case 'KeyV': api.hit(); break;
      case 'KeyG': api.god(!run.god); break;
      case 'KeyK': api.killAll(); break;
      case 'KeyB': api.bossRoom(); break;
      case 'KeyN': api.nextFloor(); break;
      case 'KeyR': api.curse(0.9); break;
      case 'KeyT': api.reduced(); break;
      default: break;
    }
  });
  console.info('[enemyharness] Shift+1..= spawn · Q elite · C/X/Z chill/shock/freeze · V hit · G god · K kill · B boss · N floor · R curse · T reduced');
}
