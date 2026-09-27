// ui/devHarness.js — UI dev aid: `?harness=<name>` (routed by BootScene) opens one modal screen over a
// SYNTHETIC RunState, without starting a real run (RunScene is not needed). Craft self-verification only.
//
//   editor · editor-held · reward · reward-relic · wand-offer · shop · pause-map · codex · settings ·
//   runend · unlocks · setup · title · credits · pause-menu · relics
// Options: &full (bag near full, 3 wands) · &bagfull (12/12 bag, for D3) · &reveal (codex shows everything)

import { RunState } from '../run/RunState.js';
import { cat } from '../data/catalog.js';
import { Save } from '../core/save.js';

const has = (k) => new RegExp(`[?&]${k}\\b`).test(location.search);

function makeRun(bus, opts = {}) {
  const C = cat();
  const run = new RunState({ seed: 1234567, cat: C, loadoutId: 'apprentice', curseLevel: 0, tutorial: false,
    isUnlocked: Save.isUnlocked.bind(Save), emit: (e, ...a) => bus.emit(e, ...a) });
  run.addCoins(opts.coins ?? 85);
  for (const id of ['double_cast', 'fire_bolt', 'damage_up', 'ice_shard', 'homing'].slice(0, opts.bag ?? 5)) run.addCard(id);
  if (opts.wands !== false) run.takeWand('twin_fork', null, ['fire_bolt', 'ice_shard', 'double_cast']);
  if (opts.threeWands) run.takeWand('echo_wand', null, ['spark_bolt']);
  if (opts.fillBag) { const ids = ['spark_bolt', 'triple_cast', 'bounce', 'pierce', 'split', 'magic_missile', 'fireball', 'venom_dart']; let i = 0; while (!run.bagFull) run.addCard(ids[i++ % ids.length]); }
  run.addRelic('mana_font');
  run.addRelic('sand_hourglass');
  run.addRelic('echo_chamber');
  run.relicCounters.echo_chamber = 7;
  run.floor = 1; run.step = 4;
  run.route = [
    { floor: 1, step: 0, roomKind: 'start', reward: null, cleared: true },
    { floor: 1, step: 1, roomKind: 'combat', reward: 'modifier', cleared: true },
    { floor: 1, step: 2, roomKind: 'combat', reward: 'spell', cleared: true },
    { floor: 1, step: 3, roomKind: 'treasure', reward: 'wand', cleared: true },
    { floor: 1, step: 4, roomKind: 'elite', reward: 'relic', cleared: false },
  ];
  run.stats.kills = 37; run.stats.timeFrames = 60 * 312;
  return run;
}

export function start(boot, name) {
  const reg = boot.registry;
  const bus = reg.get('bus'), flow = reg.get('flow');
  const full = has('full');
  const run = makeRun(bus, { threeWands: full, fillBag: has('bagfull') });
  reg.set('run', run);
  window.__SW__ = window.__SW__ || {}; window.__SW__.harnessRun = run;
  const sm = boot.scene;
  const openModal = (key, data) => { sm.stop('boot'); flow.open(key, data); };
  switch (name) {
    case 'editor': openModal('pause', { tab: 'wands' }); break;
    case 'editor-held': { run.makeOffer('modifier', 'h:1', ['double_cast', 'damage_up', 'homing']); const id = run.takeOffer(0); openModal('pause', { tab: 'wands', heldCard: id }); break; }
    case 'reward': run.makeOffer('modifier', 'h:1', ['double_cast', 'split', 'infuse_fire']); openModal('reward', {}); break;
    case 'reward-spell': run.makeOffer('spell', 'h:1'); openModal('reward', {}); break;
    case 'reward-relic': run.makeOffer('relic', 'h:2'); openModal('reward', {}); break;
    case 'wand-offer': run.makeOffer('wand', 'h:3', ['oak_staff']); openModal('reward', {}); break;
    case 'shop': run.floor = 2; run.openShop('h:4'); openModal('shop', {}); break;
    case 'pause-map': openModal('pause', { tab: 'map' }); break;
    case 'pause-menu': openModal('pause', { tab: 'menu' }); break;
    case 'relics': openModal('pause', { tab: 'relics' }); break;
    case 'codex': openModal('pause', { tab: 'codex' }); break;
    case 'settings': sm.get('title').events.once('create', () => flow.open('settings', { from: 'title' })); sm.start('title'); break;
    case 'runend': case 'unlocks': {
      run.stats.killer = 'brute';
      run.end('death');
      const C = cat();
      const milestones = name === 'unlocks' || has('ms') ? [C.unlocks[0], C.unlocks[7]] : [];
      const nextGoals = C.unlocks.filter((u) => !milestones.includes(u)).slice(0, 2);
      sm.start('run-end', { summary: run.summary(), milestones, nextGoals });
      break;
    }
    case 'setup': sm.start('title', { openSetup: true }); break;
    case 'title': sm.start('title'); break;
    case 'credits': sm.start('credits'); break;
    default: console.warn(`[harness] unknown harness "${name}"`); sm.start('title');
  }
  console.info(`[harness] ${name} — synthetic run seed ${run.seed}; window.__SW__.harnessRun`);
}
