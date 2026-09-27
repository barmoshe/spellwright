// BootScene — one-shot load + validation (scene-flow.md §1, architecture §7).
// Phaser 4 preload() is SYNCHRONOUS: config files load through the Loader; follow-up files are
// queued from 'filecomplete-*' events into the SAME pass so the progress bar is honest. Audio is a
// second pass in create() (its paths come from the cue-spec loaded in pass 1).

import Phaser from '../../lib/phaser.esm.min.js';
import { VIEW_W, VIEW_H, DEBUG } from '../config.js';
import { INPUTS } from '../core/inputs.js';
import { setManifest, queueManifest } from '../core/manifest.js';
import { DB } from '../core/db.js';
import { installTunables, T } from '../core/tunables.js';
import { buildCatalog, setCatalog } from '../data/catalog.js';
import { Save } from '../core/save.js';
import { Art } from '../core/art.js';
import { resolveFonts } from '../ui/kit.js';
import { installPromptAtlas } from '../input/prompts.js';
import { validateEffects } from '../effects/registry.js';
import '../sim/Shots.js';
import '../sim/Effects.js';
import '../sim/Relics.js';
import '../sim/enemies/index.js';
import { makePlaceholders } from '../core/placeholders.js';
import { t } from '../core/i18n.js';

export class BootScene extends Phaser.Scene {
  constructor() { super('boot'); }

  preload() {
    this.t0 = performance.now();
    const cx = VIEW_W / 2, cy = VIEW_H / 2;
    this.add.text(cx, cy - 20, t('title.name'), { fontFamily: 'monospace', fontSize: '16px', color: '#ffe28a' }).setOrigin(0.5);
    this.add.text(cx, cy + 22, t('boot.loading'), { fontFamily: 'monospace', fontSize: '8px', color: '#8a82a8' }).setOrigin(0.5);
    this.add.rectangle(cx - 80, cy, 160, 6, 0x2a2438).setOrigin(0, 0.5);
    const bar = this.add.rectangle(cx - 79, cy, 1, 4, 0xffe28a).setOrigin(0, 0.5);
    this.load.on('progress', (p) => { bar.width = Math.max(1, 158 * p); });

    if (INPUTS.feelSpec) this.load.text('feel-spec', INPUTS.feelSpec);
    if (INPUTS.motionSpec) this.load.text('motion-spec', INPUTS.motionSpec);
    if (INPUTS.cueSpec) this.load.json('cue-spec', INPUTS.cueSpec);
    if (INPUTS.credits) this.load.json('credits', INPUTS.credits);
    if (INPUTS.assetManifest) {
      this.load.json('asset-manifest', INPUTS.assetManifest);
      this.load.once('filecomplete-json-asset-manifest', (key, type, m) => { setManifest(m); queueManifest(this.load); });
    }
    if (INPUTS.dataIndex) {
      this.load.json('data-index', INPUTS.dataIndex);
      this.load.once('filecomplete-json-data-index', (key, type, idx) => {
        for (const [table, url] of DB.filesFromIndex(idx)) this.load.json(`data:${table}`, url);
      });
    }
    this.load.on('loaderror', (file) => { this.loadErrors = (this.loadErrors || []); this.loadErrors.push(`load failed: ${file.key} (${file.url})`); });
  }

  create() {
    const errors = [...(this.loadErrors || [])];

    // Feel tunables: parsed verbatim out of the feel-spec markdown.
    const tr = installTunables([this.cache.text.get('feel-spec'), this.cache.text.get('motion-spec')]);
    errors.push(...tr.errors);
    this.registry.get('router').applyTunables(T);

    // Designer data tables: verbatim, validated, frozen.
    for (const [table] of DB.filesFromIndex(DB.index)) DB.install(table, this.cache.json.get(`data:${table}`));
    DB.finish();
    errors.push(...DB.errors);
    const catalog = buildCatalog(DB.tables);
    setCatalog(catalog);
    Save.setLockTable(catalog.lockedByDefault);
    errors.push(...validateEffects(DB).map((k) => `effect not implemented: ${k}`));

    const credits = this.cache.json.get('credits');
    if (credits) this.registry.set('credits', credits);
    // TA animations (assets/ATLAS-KEYS.md Animations) + tileset index / wall autotile table
    const anims = this.cache.json.get('manifest.json.anims');
    if (anims) { try { this.anims.fromJSON(anims); } catch (e) { errors.push(`anims: ${e.message}`); } }
    this.registry.set('tileset', this.cache.json.get('manifest.json.tileset') || null);
    Art.index(this, this.cache.json.get('asset-manifest'));
    installPromptAtlas((this.cache.json.get('asset-manifest') || {}).prompts);   // controller-prompts §3 (TA byStdIndex)
    resolveFonts(this);

    makePlaceholders(this);

    const pending = Object.entries(INPUTS).filter(([, v]) => !v).map(([k]) => k);
    if (pending.length) console.info(`[boot] upstream inputs not delivered yet: ${pending.join(', ')} (src/core/inputs.js)`);
    console.info(`[boot] tunables: ${tr.count}, data tables: ${Object.keys(DB.tables).length}, ${(performance.now() - this.t0).toFixed(0)} ms`);
    this.showBanner(errors, DEBUG ? pending : []);

    // Pass 2: audio — the cue-spec + manifest load groups `boot` and `title` (Audio Director objection: groups,
    // never everything at once; mix-bus-topology §8 128 MB decoded budget).
    const mixer = this.registry.get('mixer');
    mixer.configure(this.cache.json.get('cue-spec'), this.cache.json.get('asset-manifest'));
    const queued = mixer.queueGroups(this.load, ['boot', 'title']);
    // optional modules built by other developers (graceful if absent: sim-contract / ui-contract)
    this.modsReady = Promise.allSettled([import('../sim/enemies/EnemySystem.js'), import('../ui/WorldHud.js')]).then(([en, wh]) => {
      const mods = {};
      if (en.status === 'fulfilled' && en.value.EnemySystem) mods.EnemySystem = en.value.EnemySystem;
      else console.info('[boot] enemy module not present — using EnemyStub');
      if (wh.status === 'fulfilled' && wh.value.WorldHud) mods.WorldHud = wh.value.WorldHud;
      this.registry.set('mods', mods);
    });
    if (queued) { this.load.once('complete', () => this.modsReady.then(() => this.advance())); this.load.start(); }
    else this.modsReady.then(() => this.advance());
  }

  showBanner(errors, pending) {
    const el = document.getElementById('dev-banner');
    if (!el) return;
    const lines = [];
    if (errors.length) { lines.push(`${errors.length} boot error(s):`, ...errors.map((e) => `  • ${e}`)); console.error('[boot] errors:\n' + errors.join('\n')); }
    if (pending.length) lines.push(`pending upstream inputs: ${pending.join(', ')}`);
    if (lines.length) { el.textContent = lines.join('\n'); el.style.display = 'block'; el.style.background = errors.length ? '#7a1030' : '#2a2a4a'; }
  }

  advance() {
    if (this._advanced) return;
    this._advanced = true;
    // Dev harness: ?harness=<name> jumps straight to a UI screen with a synthetic RunState (UI dev aid).
    const h = /[?&]harness=([\w-]+)/.exec(location.search);
    if (/[?&]enemyharness\b/.test(location.search)) { import('../sim/enemies/devArena.js').then((m) => m.start(this)).catch((e) => { console.error(e); this.scene.start('title'); }); return; }
    if (/[?&]hudharness\b/.test(location.search)) { import('../ui/hudHarness.js').then((m) => m.start(this)).catch((e) => { console.error(e); this.scene.start('title'); }); return; }
    if (h) { import('../ui/devHarness.js').then((m) => m.start(this, h[1])).catch((e) => { console.error(e); this.scene.start('title'); }); return; }
    this.scene.start('title');
  }
}
