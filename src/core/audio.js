// core/audio.js — the mixer (architecture §12) implementing the Audio Director's cue-spec
// (assets/audio/cue-spec.json, gain-corrected runtime copy) + mix-bus-topology. Gameplay calls
// mixer.fire(eventOrCueId, opts) ONLY; this module owns routing, files, buses, voices, ducks and music.
//
//  • LOADING by load_group (Audio Director objection, accepted): boot+title at Boot; run at run start;
//    floor3 / boss_a / boss_final on entry; groups left behind are unloaded (decoded budget ≤ 128 MB).
//  • fire order (cue-spec mixer.fire_order): routing → step coalescing (one voice per cue per 16.67 ms step,
//    +1.5 dB per doubling, cap +3 dB) → min_interval_ms (drop, never queue) → per-cue polyphony/steal →
//    sub-bus cap then global cap (steal lowest priority, ties oldest, only if new ≥ victim; never_victim safe)
//  • volume curve: gain_dB(v) = 40·log10(v / v_default), clamp ≤ +4 dB; v = 0 → hard mute
//  • ducks D1–D8: several on one bus → the DEEPEST applies, never the sum. The D6/D7 low-pass part is
//    dropped (cue-spec fallback clause) — gain moves are kept.
//  • music state machine: TITLE · EXPLORE · COMBAT · RELEASE · BOSS(p) · DEATH with equal-power crossfades;
//    beds pause/resume to keep their position; loops use the rendered loop points (Safari .m4a pad fix).

import { Save } from './save.js';
import { EV } from './ev.js';
import { Log } from './log.js';

const DEFAULTS = { master: 80, music: 70, sfx: 90, ui: 80 };
const dbToGain = (db) => Math.pow(10, db / 20);
const curveDb = (v, d) => (v <= 0 ? -Infinity : Math.min(4, 40 * Math.log10(v / d)));

// event aliases used by gameplay code → cue ids (cue-spec event_routing)
const ALIAS = {
  room_clear: ['stg_room_clear'], explode: ['explode_small'], blink: ['teleport'],
  low_hp: ['low_hp_heartbeat'], victory: [], relic_proc: [], crate_hit: [], shop_enter: [], pickup_heart: [],
  status_chill: ['status_chill'], status_freeze: ['status_freeze'],
};
const KILL_FAMILY = { skeleton: 'bone', skull: 'bone', bat: 'flesh', brute: 'flesh', slime: 'slime', slimelet: 'slime', wraith: 'spirit',
  cultist: 'caster', frost_mage: 'caster', necromancer: 'caster', eye_turret: 'construct', stone_golem: 'construct', fire_imp: null };
const WINDUP = { melee_swipe: 'windup_swipe', shoot: 'windup_shoot', ring: 'windup_ring', spiral: 'windup_spiral', charge: 'windup_charge',
  slam: 'windup_slam', summon: 'windup_summon', blink: 'windup_blink', self_destruct: 'windup_self_destruct' };
const BOSS_KEY = { ossuary_knight: 'knight', mire_queen: 'queen', archlich: 'lich' };

export class AudioMixer {
  constructor(game) {
    this.game = game;
    this.sound = game.sound;
    this.cues = new Map();          // cueId -> spec (+ files urls)
    this.groups = {};               // group -> [cueId]
    this.loadedGroups = new Set();
    this.voices = [];               // { snd, cue, bus, sub, prio, t0, baseGain, duckBus }
    this.lastFire = new Map();      // cueId -> ms (min interval)
    this.stepFired = new Map();     // cueId -> {count, voice} this step
    this.norepeat = new Map();
    this.ducks = [];                // { id, targets:{bus:db}, t, attack, hold, release }
    this.states = { overlay: false, lowHp: false, dead: false };
    this.stateDb = {};              // current state-duck dB per bus (smoothed)
    this.music = { state: null, beds: new Map(), current: null, fades: [] };
    this.unlocked = !this.sound.locked;
    this.coinStreak = 0; this.lastCoinMs = 0;
    this._limiter();
    this.refreshVolumes();
  }

  // ------------------------------------------------------------------ configuration & loading
  configure(cueSpec, manifest) {
    this.spec = cueSpec || { cues: [] };
    this.subBuses = (this.spec.mixer && this.spec.mixer.sub_buses) || {};
    this.globalCap = (this.spec.mixer && this.spec.mixer.global_voice_cap) || 30;
    const man = (manifest && manifest.audio && manifest.audio.cues) || {};
    const ogg = typeof Audio !== 'undefined' && new Audio().canPlayType('audio/ogg; codecs="vorbis"') !== '';
    for (const c of this.spec.cues || []) {
      const m = man[c.cue_id];
      const urls = m ? m.files.map((pair) => (ogg ? pair[0] : pair[1] || pair[0])) : (c.files || []).map((f) => 'assets/audio/' + (ogg ? f.file_ogg : f.file_aac || f.file_ogg));
      const cue = { ...c, urls, keys: urls.map((_, i) => `sfx:${c.cue_id}:${i}`) };
      this.cues.set(c.cue_id, cue);
      const g = c.load_group || (m && m.load_group) || 'boot';
      (this.groups[g] = this.groups[g] || []).push(c.cue_id);
    }
  }

  /** Queue the files of `groups` not yet loaded. Returns the number of files queued. */
  queueGroups(loader, groups) {
    let n = 0;
    for (const g of groups) {
      if (this.loadedGroups.has(g)) continue;
      this.loadedGroups.add(g);
      for (const id of this.groups[g] || []) {
        const cue = this.cues.get(id);
        cue.urls.forEach((u, i) => { if (!this.game.cache.audio.exists(cue.keys[i])) { loader.audio(cue.keys[i], u); n++; } });
      }
    }
    return n;
  }
  /** Load groups at runtime through a scene's loader; cb when ready. */
  ensureGroups(scene, groups, cb) {
    const n = this.queueGroups(scene.load, groups);
    if (!n) { if (cb) cb(); return; }
    scene.load.once('complete', () => cb && cb());
    scene.load.start();
  }
  unloadGroup(g) {
    if (!this.loadedGroups.has(g)) return;
    this.loadedGroups.delete(g);
    for (const id of this.groups[g] || []) {
      const cue = this.cues.get(id);
      for (const k of cue.keys) { this.sound.removeByKey(k); if (this.game.cache.audio.exists(k)) this.game.cache.audio.remove(k); }
      this.music.beds.delete(id);
    }
  }

  _limiter() {
    const ctx = this.sound.context;
    if (!ctx || !this.sound.masterVolumeNode || this._lim) return;
    try {
      const L = (this.spec && this.spec.mixer && this.spec.mixer.limiter) || { threshold_db: -3, knee_db: 0, ratio: 20, attack_s: 0.002, release_s: 0.12 };
      const comp = ctx.createDynamicsCompressor();
      comp.threshold.value = L.threshold_db ?? -3; comp.knee.value = L.knee_db ?? 0; comp.ratio.value = L.ratio ?? 20;
      comp.attack.value = L.attack_s ?? 0.002; comp.release.value = L.release_s ?? 0.12;
      this.sound.masterVolumeNode.disconnect();
      this.sound.masterVolumeNode.connect(comp);
      comp.connect(ctx.destination);
      this._lim = comp;
    } catch (e) { console.warn('[audio] limiter unavailable', e); }
  }

  // ------------------------------------------------------------------ volumes
  refreshVolumes() {
    const s = Save.settings;
    this.userDb = {
      master: curveDb(s.masterVolume, DEFAULTS.master),
      music: curveDb(s.musicVolume, DEFAULTS.music),
      sfx: curveDb(s.sfxVolume, DEFAULTS.sfx),
      ambience: curveDb(s.sfxVolume, DEFAULTS.sfx),
      ui: curveDb(s.uiVolume ?? 80, DEFAULTS.ui),
    };
  }
  _gain(v, extraDb = 0) {
    const bus = v.bus;
    const db = this.userDb.master + (this.userDb[bus] ?? 0) + (v.baseDb || 0) + extraDb + this._duckDb(v.sub, bus);
    return Number.isFinite(db) ? Math.min(2, dbToGain(db)) : 0;
  }

  // ------------------------------------------------------------------ firing
  /**
   * fire(eventOrCueId, opts): opts { x (world) for pan, gainDb, detune, element, shots, heavy, family, elite, index }
   */
  fire(name, opts = {}) {
    const ids = this._route(name, opts);
    let last = null;
    for (const id of ids) last = this._play(id, opts) || last;
    return last;
  }

  _route(name, o) {
    if (this.cues.has(name)) {
      if (name === 'door_open' && o.index > 0) o.gainDb = (o.gainDb || 0) - 6;
      return [name];
    }
    if (ALIAS[name]) return ALIAS[name];
    if (name.startsWith('cast_')) {
      const out = [`cast_${name.slice(5)}`];
      if ((o.shots || 0) >= 3) out.push('cast_multicast_layer');
      if (o.heavy) out.push('cast_heavy_layer');
      return out.filter((x) => this.cues.has(x));
    }
    if (name.startsWith('enemy_windup_')) { const t = name.slice(13); return [t === 'hazard' ? (o.fire ? 'windup_hazard_fire' : 'windup_hazard_acid') : WINDUP[t]].filter(Boolean); }
    if (name.startsWith('kill:')) {
      const fam = KILL_FAMILY[name.slice(5)];
      const out = fam ? [`kill_${fam}`] : [];
      if (o.elite) out.push('elite_kill');
      return out;
    }
    Log.track('audio_unrouted', name);
    return [];
  }

  _play(id, o) {
    const cue = this.cues.get(id);
    if (!cue) { Log.track('audio_missing_cue', id); return null; }
    const avail = cue.keys.filter((k) => this.game.cache.audio.exists(k));
    if (!avail.length) { Log.track('audio_not_loaded', id); return null; }
    const now = performance.now();
    // step coalescing: one voice per cue per sim step; +1.5 dB per doubling (cap +3)
    const sf = this.stepFired.get(id);
    if (sf && now - sf.t < 16.7) {
      sf.count++;
      const boost = Math.min(3, 1.5 * Math.log2(sf.count));
      if (sf.voice && sf.voice.snd) { sf.voice.boostDb = boost; }
      return null;
    }
    // min interval (drop, never queue)
    const li = this.lastFire.get(id) || -1e9;
    if (cue.min_interval_ms && now - li < cue.min_interval_ms) return null;
    // polyphony
    const mine = this.voices.filter((v) => v.cue === id);
    const poly = cue.polyphony || { max_simultaneous: 4, voice_steal: 'oldest' };
    if (mine.length >= poly.max_simultaneous) {
      if (poly.voice_steal === 'never') return null;
      this._stop(mine[0]);
    }
    const prio = cue.priority ?? 50;
    // sub-bus cap
    const sub = cue.sub_bus || cue.bus;
    const sb = this.subBuses[sub];
    if (sb && sb.voice_cap) {
      const inSub = this.voices.filter((v) => v.sub === sub);
      if (inSub.length >= sb.voice_cap && !this._steal(inSub, prio, sb.steal)) return null;
    }
    if (this.voices.length >= this.globalCap && !this._steal(this.voices, prio, 'lowest_priority_then_oldest')) return null;

    // variant (random_no_repeat) + jitter (cosmetic randomness)
    const r = cue.randomization || {};
    let vi = 0;
    if (avail.length > 1) {
      const prev = this.norepeat.get(id);
      do { vi = Math.floor(Math.random() * avail.length); } while (r.selection === 'random_no_repeat' && avail.length > 1 && vi === prev);
      this.norepeat.set(id, vi);
    }
    const pj = r.pitch_jitter_cents || [0, 0], gj = r.gain_jitter_db || [0, 0];
    let detune = (o.detune || 0) + pj[0] + Math.random() * (pj[1] - pj[0]);
    if (id === 'pickup_coin') { this.coinStreak = now - this.lastCoinMs < 600 ? this.coinStreak + 1 : 0; this.lastCoinMs = now; detune += Math.min(50 * this.coinStreak, 600); }
    const baseDb = (cue.default_gain_db || 0) + (o.gainDb || 0) + gj[0] + Math.random() * (gj[1] - gj[0]);
    const v = { cue: id, bus: cue.bus, sub, prio, t0: now, baseDb, boostDb: 0, never: !!(poly.never_victim), snd: null };
    const snd = this.sound.add(avail[vi], { volume: 0, detune, loop: !!cue.loop });
    v.snd = snd;
    if (o.x != null && cue.spatial && cue.spatial.is_positional && snd.setPan && this.panRef) {
      const width = cue.spatial.width ?? 0.5;
      snd.setPan(Math.max(-1, Math.min(1, (o.x - this.panRef()) / 320)) * width);
    }
    snd.setVolume(this._gain(v));
    snd.once('complete', () => this._stop(v));
    snd.play();
    this.voices.push(v);
    this.lastFire.set(id, now);
    this.stepFired.set(id, { t: now, count: 1, voice: v });
    this._duckFrom(id, cue);
    Log.track('audio_fire', id);
    return snd;
  }

  _steal(pool, prio, mode) {
    if (mode === 'never') return false;
    let victim = null;
    for (const v of pool) {
      if (v.never) continue;
      if (!victim || v.prio < victim.prio || (v.prio === victim.prio && v.t0 < victim.t0)) victim = v;
    }
    if (!victim || prio < victim.prio) return false;
    this._stop(victim, 15);
    return true;
  }
  _stop(v, rampMs = 0) {
    const i = this.voices.indexOf(v);
    if (i >= 0) this.voices.splice(i, 1);
    const s = v.snd; if (!s) return;
    v.snd = null;
    if (rampMs > 0 && s.isPlaying) { this.game.scene.getScene('system').tweens.add({ targets: s, volume: 0, duration: rampMs, onComplete: () => { s.stop(); s.destroy(); } }); }
    else { s.stop(); s.destroy(); }
  }
  stopAll() { for (const v of this.voices.slice()) this._stop(v); }

  // ------------------------------------------------------------------ ducks (deepest applies)
  _duckFrom(id, cue) {
    const D = (this.spec.mixer && this.spec.mixer.ducks) || {};
    const add = (key, hold) => { const d = D[key]; if (d) this.ducks.push({ targets: d.targets, t: 0, a: d.attack_ms || 10, h: hold, r: d.release_ms || 200 }); };
    if (cue.danger_duck) add('D1_danger', Math.min(cue.duration_ms || 400, 400));
    if (['player_hurt', 'shield_break', 'revive', 'player_death'].includes(id)) add('D2_hurt', id === 'shield_break' ? 60 : 90);
    if (id.startsWith('stg_')) add('D3_stinger', Math.max(0, (cue.duration_ms || 600) - 300));
    if (id.startsWith('reaction_')) add('D4_reaction', 150);
    if (['explode_big', 'elite_kill', 'heavy_impact', 'boss_death'].includes(id)) add('D5_big', 150);
  }
  _duckDb(sub, bus) {
    let deepest = 0;
    for (const d of this.ducks) {
      const k = d.targets[sub] ?? d.targets[bus];
      if (typeof k !== 'number') continue;
      const env = d.t < d.a ? d.t / d.a : d.t < d.a + d.h ? 1 : Math.max(0, 1 - (d.t - d.a - d.h) / d.r);
      deepest = Math.min(deepest, k * env);
    }
    const st = this.stateDb[sub] ?? this.stateDb[bus] ?? 0;
    return Math.min(deepest, st) + 0;
  }

  /** Per render frame (SystemScene.update). */
  update(dtMs) {
    for (let i = this.ducks.length - 1; i >= 0; i--) { const d = this.ducks[i]; d.t += dtMs; if (d.t > d.a + d.h + d.r) this.ducks.splice(i, 1); }
    // state ducks D6 overlay / D7 low HP / D8 death, smoothed toward targets
    const D = (this.spec && this.spec.mixer && this.spec.mixer.ducks) || {};
    const want = {};
    const put = (targets) => { for (const [k, v] of Object.entries(targets || {})) if (typeof v === 'number') want[k] = Math.min(want[k] ?? 0, v); };
    if (this.states.overlay && D.D6_overlay) put(D.D6_overlay.targets);
    if (this.states.lowHp && D.D7_low_hp) put(D.D7_low_hp.targets);
    if (this.states.dead) { want['music.beds'] = -60; want.ambience = -60; }
    for (const k of new Set([...Object.keys(want), ...Object.keys(this.stateDb)])) {
      const cur = this.stateDb[k] ?? 0, tgt = want[k] ?? 0;
      // D6 attack/release 250 ms, D7 600/800 ms (approximated by one slope), D8 700 ms to silence
      const perMs = this.states.dead ? 60 / 700 : 8 / 250;
      const step = Math.sign(tgt - cur) * Math.min(Math.abs(tgt - cur), perMs * dtMs);
      this.stateDb[k] = cur + step;
      if (Math.abs(this.stateDb[k]) < 0.01 && tgt === 0) delete this.stateDb[k];
    }
    // music crossfades
    for (let i = this.music.fades.length - 1; i >= 0; i--) {
      const f = this.music.fades[i]; f.t += dtMs;
      const k = Math.min(1, f.t / f.ms);
      f.bed.fadeGain = f.dir > 0 ? Math.sin(k * Math.PI / 2) : Math.cos(k * Math.PI / 2);
      if (k >= 1) { this.music.fades.splice(i, 1); if (f.dir < 0 && f.bed.snd) { if (f.stop) { f.bed.snd.stop(); } else f.bed.snd.pause(); } }
    }
    for (const v of this.voices) if (v.snd) v.snd.setVolume(this._gain(v, v.boostDb || 0) * (v.bed ? v.bed.fadeGain ?? 1 : 1));
    for (const bed of this.music.beds.values()) if (bed.snd && bed.snd.isPlaying) bed.snd.setVolume(this._gain(bed.v) * (bed.fadeGain ?? 1));
  }

  // ------------------------------------------------------------------ music state machine
  _bed(id) {
    let bed = this.music.beds.get(id);
    if (bed && bed.snd) return bed;
    const cue = this.cues.get(id);
    if (!cue || !cue.keys.some((k) => this.game.cache.audio.exists(k))) return null;
    const key = cue.keys.find((k) => this.game.cache.audio.exists(k));
    const snd = this.sound.add(key, { volume: 0 });
    const m = cue.music || {};
    const loopLen = (m.rendered_loop_end_s ?? 0) - (m.rendered_loop_start_s ?? 0);
    if (cue.loop && loopLen > 1) snd.addMarker({ name: 'loop', start: m.rendered_loop_start_s || 0, duration: loopLen, config: { loop: true } });
    bed = { id, snd, v: { bus: 'music', sub: 'music.beds', baseDb: cue.default_gain_db || 0 }, fadeGain: 0, hasMarker: cue.loop && loopLen > 1 };
    this.music.beds.set(id, bed);
    return bed;
  }
  _fadeIn(id, ms, fromStart = false) {
    const bed = this._bed(id); if (!bed) return;
    this.music.fades = this.music.fades.filter((f) => f.bed !== bed);
    if (fromStart || (!bed.snd.isPlaying && !bed.snd.isPaused)) { bed.snd.stop(); bed.hasMarker ? bed.snd.play('loop') : bed.snd.play({ loop: true }); }
    else if (bed.snd.isPaused) bed.snd.resume();
    bed.fadeGain = 0;
    this.music.fades.push({ bed, t: 0, ms, dir: 1 });
    this.music.current = id;
  }
  _fadeOut(id, ms, stop = false) {
    const bed = this.music.beds.get(id); if (!bed || !bed.snd) return;
    this.music.fades = this.music.fades.filter((f) => f.bed !== bed);
    this.music.fades.push({ bed, t: 0, ms, dir: -1, stop });
  }
  _fadeOutAll(ms, except) { for (const id of this.music.beds.keys()) if (id !== except) this._fadeOut(id, ms); }

  /** High-level music states (cue-spec music_state_machine). */
  setMusic(state, o = {}) {
    const prev = this.music.state;
    this.music.state = state;
    const combatBed = this.floor >= 3 ? 'mus_combat_b' : 'mus_combat_a';
    switch (state) {
      case 'TITLE': this._fadeOutAll(1000, 'mus_title'); this._fadeIn('mus_title', 1500, true); break;
      case 'EXPLORE':
        if (prev === 'TITLE') { this._fadeOut('mus_title', 1000, true); this._fadeIn('mus_explore', 2000); }
        else if (prev === 'COMBAT') { this._fadeOut(combatBed, 1200); this._fadeIn('mus_explore', 1200); }
        else { this._fadeOutAll(o.fadeOutMs ?? 600, 'mus_explore'); this._fadeIn('mus_explore', o.fadeInMs ?? 2000); }
        break;
      case 'COMBAT': this._fadeOut('mus_explore', 1200); this._fadeIn(combatBed, 1200); break;
      case 'RELEASE':
        this._fadeOut(combatBed, 600);
        setTimeout(() => { if (this.music.state === 'RELEASE') { this.music.state = 'EXPLORE'; this._fadeIn('mus_explore', 2500); } }, 400);
        break;
      case 'BOSS': {
        const beds = o.final ? ['mus_boss_final_p1', 'mus_boss_final_p2', 'mus_boss_final_p3'] : ['mus_boss_a_p1', 'mus_boss_a_p2'];
        const bed = beds[Math.min(beds.length - 1, o.phase || 0)];
        this._fadeOutAll(o.phase ? 300 : 900, bed);
        setTimeout(() => this._fadeIn(bed, 100, true), o.phase ? 900 : 1200);
        break;
      }
      case 'BOSS_DOWN': this._fadeOutAll(400); break;
      case 'DEATH': this.states.dead = true; this._fadeOutAll(700); setTimeout(() => this.fire('stg_death'), 400); break;
      case 'SILENT': this._fadeOutAll(400); break;
      default: break;
    }
  }

  /** Subscribe to game events once (SystemScene). */
  bind(bus, flow) {
    this.flow = flow;
    bus.on(EV.RUN_START, (run) => {
      this.states.dead = false; this.floor = 1;
      this.ensureGroups(this.game.scene.getScene('system'), ['run'], () => { this.unloadGroup('title'); this.setMusic('EXPLORE'); this._ambience(true); });
      this.fire('run_start');
    });
    bus.on(EV.FLOOR_ENTER, ({ floor }) => {
      this.floor = floor;
      if (floor >= 3) this.ensureGroups(this.game.scene.getScene('system'), ['floor3'], () => this.unloadGroup('boss_a'));
    });
    bus.on(EV.ROOM_ENTER, ({ kind }) => {
      if (kind === 'combat' || kind === 'elite') { this.fire('door_close'); setTimeout(() => { if (this.music.state !== 'BOSS') this.setMusic('COMBAT'); }, 500); }
      else if (kind === 'boss') {
        const final = this.floor >= 3;
        this.ensureGroups(this.game.scene.getScene('system'), [final ? 'boss_final' : 'boss_a'], () => {});
        this._fadeOutAll(900);
        this.music.state = 'BOSS_WAIT';
      } else if (this.music.state !== 'EXPLORE') this.setMusic('EXPLORE');
    });
    bus.on(EV.ROOM_CLEARED, ({ kind }) => { if (kind !== 'boss') this.setMusic('RELEASE'); });
    bus.on(EV.BOSS_START, ({ id }) => { this.bossKey = BOSS_KEY[id]; this.fire(`boss_roar_${this.bossKey}`); this.fire('stg_boss_intro'); this.setMusic('BOSS', { final: this.floor >= 3, phase: 0 }); });
    bus.on(EV.BOSS_PHASE, (p) => { this.fire(`boss_roar_${this.bossKey}`); this.fire('stg_boss_phase'); this.setMusic('BOSS', { final: this.floor >= 3, phase: p }); });
    bus.on(EV.BOSS_DEAD, () => {
      this.setMusic('BOSS_DOWN');
      const final = this.floor >= 3;
      setTimeout(() => this.fire(final ? 'stg_victory' : 'stg_boss_clear'), 600);
      if (!final) setTimeout(() => { this.unloadGroup('boss_a'); this.setMusic('EXPLORE', { fadeInMs: 3000 }); }, 2600);
    });
    // boss_death fires on the kill frame (event-markers), the music/stinger timeline on BOSS_DEAD
    bus.on(EV.ENEMY_KILLED, (e) => { if (e.boss) this.fire('boss_death'); else this.fire(`kill:${e.id}`, { elite: e.elite, x: e.x }); });
    bus.on(EV.LOW_HP, (on) => { this.states.lowHp = on; });
    bus.on(EV.PLAYER_HP, (hp) => { if (hp > 2) this.states.lowHp = false; });
    bus.on(EV.RUN_END, (outcome) => {
      this._ambience(false);
      if (outcome === 'death') this.setMusic('DEATH');
      else if (outcome === 'abandon') this.setMusic('SILENT');
      this.states.lowHp = false;
    });
    bus.on(EV.REACTION, ({ name, x }) => this.fire(`reaction_${name}`, { x }));
    bus.on(EV.RELIC_GAINED, () => this.fire('relic_gain'));
    bus.on(EV.REWARD_PICKED, (id, kind) => { if (kind === 'wand') this.fire('wand_pickup'); else if (kind === 'spell' || kind === 'modifier') this.fire('pickup_card'); });
    bus.on(EV.PLAYER_HP, (hp, max) => { if (this._lastHp != null && hp > this._lastHp) this.fire('heal'); this._lastHp = hp; });
  }
  _ambience(on) {
    if (on) { const b = this._bed('amb_cave'); if (b) { b.v = { bus: 'ambience', sub: 'ambience', baseDb: this.cues.get('amb_cave').default_gain_db || 0 }; this._fadeIn('amb_cave', 2000); } }
    else this._fadeOut('amb_cave', 1200, true);
  }

  /** Called each frame by SystemScene: D6 state = any overlay open over a run (not Title). */
  setOverlay(open) { this.states.overlay = open; }

  // ------------------------------------------------------------------ autoplay policy
  unlock() {
    const ctx = this.sound.context;
    if (ctx && ctx.state === 'suspended') ctx.resume();
    if (!this.unlocked) { this.unlocked = true; this._limiter(); }
    // "Title music starts on the first input" (screen-graph §7)
    if (!this.music.state && this.game.scene.isActive('title')) this.setMusic('TITLE');
  }
  suspend() { const ctx = this.sound.context; if (ctx && ctx.state === 'running') ctx.suspend(); }
  resume() { const ctx = this.sound.context; if (ctx && this.unlocked && ctx.state === 'suspended') ctx.resume(); }
}
