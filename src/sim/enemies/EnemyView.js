// sim/enemies/EnemyView.js — state-graph-spec §3/§4 projection of the AI onto sprites (R2: views mirror the
// sim, never drive it) + telegraphs.md §2 body tells, §3 hit reactions, §4 deaths.
//
// Per enemy: ONE body Image (+ a weapon overlay Image for the Knight/Lich). Everything else is batched into
// three shared Graphics (one draw call each, architecture §11):
//   groundG  (depth shadows 20)          shadows, elite gold ground rings (R10), spawn portals, goo splats
//   overlayG (above the actor band)      status overlays, dizzy stars, ice shell, "!" vulnerable, poison digits, boss cast glyph
//   glowG    (ADD band 61)               shoot hand-glow, muzzle, spiral motes, frost halo, skull trail
// All motion is computed from the SIM clock (ctx.time.ms) and AI progress (R3), so hit-stop freezes it and
// chill stretches it; views never run fixed tweens for gameplay-coupled motion.
// R7 anchors (tokens.ANCHOR) are ON-SCREEN offsets (the Archlich row already includes its ×2), never × base.
// R4: scales quantized to 1/8 (x-only on 32 px / boss-class sprites), integer offsets. R5: one tint channel
// with fixed priority; hit flash re-arms after hitFlashRearmMs and never overrides the lock window. R6: facing
// with facingDeadband. R8: reduced motion drops jitter/squash/strobes/shake but keeps every telegraph.

import Phaser from '../../../lib/phaser.esm.min.js';
import { DEPTH } from '../../config.js';
import { Art } from '../../core/art.js';
import { Save } from '../../core/save.js';
import { COL, EL_HUE, FLYER_HOVER_PX, DEG, TAU, q8, clamp, quadIn, quadOut, lerpColor, OUTLINE, DEF_COL } from './tokens.js';
import { placeholderKey, placeholderSize } from './placeholderArt.js';

const TM = Phaser.TintModes;
const STEP_MS = 1000 / 60;
const FAMILY_HUE = { bone: 0xd9d2c0, flesh: 0x9a5a4a, slime: 0x6fbf4f, spirit: 0xcfd8e8, caster: 0x8b7cf0, construct: 0x8a8a92 };
// 3×5 pixel digits (poison stack numerals)
const DIGITS = ['111101101101111', '010110010010111', '111001111100111', '111001111001111', '101101111001001',
  '111100111001111', '111100111101111', '111001001001001', '111101111101111', '111101111001111'];
const backOut = (t) => { const s = 1.70158; const u = t - 1; return u * u * ((s + 1) * u + s) + 1; };

export class EnemyViews {
  constructor(sys) {
    this.sys = sys;
    this.ctx = sys.ctx;
    const s = this.scene = sys.scene;
    const T = sys.T;
    // motion-tunables (state-graph-spec §1) + feel (feel-spec), read once — every enemy-domain row is consumed here
    this.t = {
      idleFps: T('enemyIdleFps'), runFps: T('enemyRunFps'), flapFps: T('flyerFlapFps'), bobPx: T('flyerBobPx'), bobMs: T('flyerBobPeriodMs'),
      emergeMs: T('spawnEmergeMs'), openingMs: T('telegraphOpeningMs'), jitterPx: T('telegraphJitterPx'), stretchMs: T('releaseStretchMs'),
      squashMs: T('hitSquashMs'), rearmMs: T('hitFlashRearmMs'), collapseMs: T('corpseCollapseMs'), stunHz: T('stunJitterHz'),
      dizzyMs: T('dizzyOrbitPeriodMs'), risePx: T('bossRisePx'), deadband: T('facingDeadband'), flashMs: T('enemyHitFlashMs'),
      puff: T('deathPuffParticles'), fadeMs: T('corpseFadeMs'), panMs: T('bossIntroPanMs'), phaseMs: T('bossPhaseShockwaveMs'),
      unravelMs: T('bossDeathUnravelMs'), deathStopMs: T('bossDeathHitstopMs'),
      // v2 (state-graph-spec §8 / telegraphs §3.7–3.8): defence reads + affix outline
      defReadMs: T('defenceReadCooldownMs', 120), recoilPx: T('defenceRecoilPx', 1), breakFreezeMs: T('defenceBreakFreezeMs', 66),
      breakShards: T('defenceBreakShards', 6), wardOrbitMs: T('wardOrbitPeriodMs', 1200), wardPopMs: T('wardPopMs', 150),
      wardStepMs: T('wardRegrowStepMs', 130), guardBlinkMs: T('guardEndBlinkMs', 500), affixPeriodMs: T('affixPulsePeriodMs', 1600),
      affixAlphaMin: T('affixPulseAlphaMin', 0.45),
    };
    this.groundG = s.add.graphics().setDepth(DEPTH.shadows);
    this.overlayG = s.add.graphics().setDepth(DEPTH.actors + 0.9);
    this.glowG = s.add.graphics().setDepth(DEPTH.projectilesAdd).setBlendMode(Phaser.BlendModes.ADD);
    this.views = [];
    this.free = [];
    this.frameCache = new Map();
    // TA flipbook art (assets/ATLAS-KEYS.md) drawn immediate-mode from a sprite pool, frames on the SIM clock
    this.sprPool = []; this.sprN = 0; this.countCache = new Map();
    this.art = {
      portal: this.count('fx.spawn_portal') >= 10, sigil: this.count('fx.summon_sigil') > 0, glyph: this.count('fx.cast_glyph') > 0,
      burn: this.count('status.burn.overlay') > 0, shocked: this.count('status.shocked.overlay') > 0,
      poison: this.count('status.poison.overlay') > 0, frozen: this.count('status.frozen.overlay') > 0,
    };
    sys.tl.artSigil = this.art.sigil;     // TelegraphLayer keeps drawing only the grey fizzle for sigils
  }

  count(id) { let n = this.countCache.get(id); if (n === undefined) { n = Art.count(id); this.countCache.set(id, n); } return n; }

  /**
   * One pooled Image for this render frame: frame `i` of art id `id` (wrapped). add → ADD blend
   * (codemanu greyscale-baked light, tinted with the token); tint −1 = none. originY 0.5 centred, 1 = feet.
   */
  spr(id, i, x, y, depth, add, tint, alpha, rot, originY) {
    const n = this.count(id);
    const a = n ? Art.getQuiet(id, ((i % n) + n) % n) : Art.getQuiet(id);    // non-indexed ids (authored.*) too
    if (!a) return null;
    let im = this.sprPool[this.sprN];
    if (!im) { im = this.scene.add.image(0, 0, a.key, a.frame); this.sprPool.push(im); }
    this.sprN++;
    im.setTexture(a.key, a.frame).setOrigin(0.5, originY).setPosition(Math.round(x), Math.round(y)).setDepth(depth)
      .setBlendMode(add ? Phaser.BlendModes.ADD : Phaser.BlendModes.NORMAL).setAlpha(alpha).setRotation(rot).setVisible(true)
      .setScale(1).setFlipX(false);                                  // pooled: v2 overlays may scale/flip (defence plates)
    if (tint >= 0) im.setTint(tint).setTintMode(TM.MULTIPLY); else im.setTint(0xffffff).setTintMode(TM.MULTIPLY);
    return im;
  }

  get reduced() { return !!this.ctx.flags.reducedMotion; }

  attach(e) {
    const v = this.free.pop() || new EnemyView(this);
    v.bind(e);
    e.view = v;
    this.views.push(v);
    return v;
  }

  /** Frames for an actor: TA atlas frames when present, else generated placeholders (never crash on a miss). */
  framesFor(e) {
    const aff = !!(e.elite && e.affixes && e.affixes.length);
    const key = `${e.id}|${e.elite ? 1 : 0}|${aff ? 1 : 0}`;
    let fr = this.frameCache.get(key);
    if (fr) return fr;
    const base = e.isBoss ? `bosses.${e.id}` : `enemies.${e.id}`;
    const nI = Art.count(`${base}.idle`);
    fr = { idle: [], move: [], windup: null, originY: 1, placeholder: false, base, rings: null, hasRing: false };
    if (nI > 0) {
      // TA atlas-key contract: enemies.<id>.{idle,move,windup_frame}[_elite].N (elite = baked gold outline, own pivot).
      // v2 (state-graph §8.2): an affixed elite draws the BASE frames + the affix outline overlay (ring1); the
      // baked _elite frames stay the fallback for actors without ring frames. Ring frames resolve lazily (ringFrame).
      fr.hasRing = !!Art.getQuiet(`${base}.idle.ring1`, 0);
      const sfx = e.elite && !(aff && fr.hasRing) && Art.count(`${base}.idle_elite`) ? '_elite' : '';
      const ni = Art.count(`${base}.idle${sfx}`);
      for (let i = 0; i < ni; i++) { const a = Art.getQuiet(`${base}.idle${sfx}`, i); if (a) fr.idle.push(a); }
      const nm = Art.count(`${base}.move${sfx}`);
      for (let i = 0; i < nm; i++) { const a = Art.getQuiet(`${base}.move${sfx}`, i); if (a) fr.move.push(a); }
      if (!fr.move.length) fr.move = fr.idle;
      fr.windup = Art.getQuiet(`${base}.windup_frame${sfx}`, 0) || Art.getQuiet(`${base}.windup_frame`, 0);
    } else {
      const k = placeholderKey(this.scene, e.id, e.elite);
      fr.idle = [{ key: k, frame: '0' }, { key: k, frame: '1' }];
      fr.move = fr.idle;
      fr.placeholder = true;
      const sz = placeholderSize(e.id);
      fr.originY = (sz.h - sz.pad) / sz.h;
      if (e.id === 'eye_turret') fr.windup = { key: placeholderKey(this.scene, 'eye_turret_glare', e.elite), frame: '0' };
    }
    this.frameCache.set(key, fr);
    return fr;
  }

  /** Lazy per-actor ring-overlay frame lookup (plan Addendum 6: resolved on first use, never all at spawn). */
  ringFrame(fr, clip, ring, i) {
    if (!fr.hasRing) return null;
    const rings = fr.rings || (fr.rings = {});
    const k = `${clip}.${ring}`;
    let list = rings[k];
    if (!list) {
      list = rings[k] = [];
      const id = `${fr.base}.${clip}.${ring}`;
      const n = Art.count(id);
      for (let j = 0; j < n; j++) { const a = Art.getQuiet(id, j); if (a) list.push(a); }
    }
    return list.length ? list[i % list.length] : null;
  }

  weaponTexture(kind) {
    const ids = kind === 'blade'
      ? ['bosses.ossuary_knight.weapon_overlay.boss_knight_blade', 'bosses.ossuary_knight.blade', 'boss_knight_blade', 'weapon_knight_sword']
      : ['bosses.archlich.weapon_overlay.boss_lich_staff', 'bosses.archlich.staff', 'boss_lich_staff'];
    for (const id of ids) { const a = Art.getQuiet(id, 0) || Art.getQuiet(id); if (a) return { key: a.key, frame: a.frame, ph: false }; }
    return { key: placeholderKey(this.scene, kind, false), frame: '0', ph: true };
  }

  /** Sim-step cosmetics (fx-stream particles on sim cadence). */
  step(dt) { for (let i = 0; i < this.views.length; i++) this.views[i].stepFx(dt); }

  render() {
    this.groundG.clear(); this.overlayG.clear(); this.glowG.clear();
    this.sprN = 0;
    for (let i = this.views.length - 1; i >= 0; i--) {
      const v = this.views[i];
      v.render();
      if (v.done) { this.views[i] = this.views[this.views.length - 1]; this.views.pop(); v.release(); }
    }
    if (this.art.sigil) this._sigils();
    for (let i = this.sprN; i < this.sprPool.length; i++) { const im = this.sprPool[i]; if (im.visible) im.setVisible(false); }
  }

  /** Summon sigils (fx.summon_sigil, clip 16 f @ 20 fps loop, ADD, hostile token): α ∝ p, rotating 120°/s. */
  _sigils() {
    const tl = this.sys.tl;
    for (let i = 0; i < tl.live.length; i++) {
      const d = tl.live[i];
      if (d.kind !== 'sigil' || d.mode === 'fizzle') continue;
      const a = d.mode === 'flash' ? 1 : clamp(d.p, 0.15, 1);
      this.spr('fx.summon_sigil', Math.floor((d.age * 20) / 1000), d.x, d.y, DEPTH.decals + 0.5, true, COL.portalHi, a, d.rot, 0.5);
    }
  }

  clear() {
    for (const v of this.views) v.release();
    this.views.length = 0;
    for (const im of this.sprPool) im.setVisible(false);
    this.groundG.clear(); this.overlayG.clear(); this.glowG.clear();
  }

  destroy() {
    this.clear();
    for (const v of this.free) v.destroy();
    this.free.length = 0;
    this.groundG.destroy(); this.overlayG.destroy(); this.glowG.destroy();
    for (const im of this.sprPool) im.destroy();
    this.sprPool.length = 0;
  }

  // ------------------------------------------------------------------ pixel helpers (integer px)
  ellipse(g, cx, cy, w, h, color, alpha) {
    if (w <= 0 || h <= 0 || alpha <= 0) return;
    g.fillStyle(color, alpha);
    const hh = h / 2, hw = w / 2;
    for (let row = 0; row < h; row++) {
      const dy = row + 0.5 - hh;
      const half = Math.round(hw * Math.sqrt(Math.max(0, 1 - (dy * dy) / (hh * hh))));
      if (half > 0) g.fillRect(Math.round(cx - half), Math.round(cy - hh + row), half * 2, 1);
    }
  }
  digit(g, x, y, n, color) {
    const bits = DIGITS[n % 10];
    g.fillStyle(COL.rimDark, 1).fillRect(x - 1, y - 1, 5, 7);
    g.fillStyle(color, 1);
    for (let i = 0; i < 15; i++) if (bits[i] === '1') g.fillRect(x + (i % 3), y + ((i / 3) | 0), 1, 1);
  }
}

class EnemyView {
  constructor(L) {
    this.L = L;
    this.sprite = L.scene.add.image(-100, -100, 'ph-px').setVisible(false);
    this.weapon = null;
    this.outline = null;          // v2 affix / dark-twist outline overlay (ring frames), created on first use
    this.e = null;
    this.done = false;
  }

  bind(e) {
    const L = this.L, now = L.ctx.time.ms;
    this.e = e;
    this.fr = L.framesFor(e);
    this.base = e.actor.base || 1;
    this.xOnly = e.anchor === undefined ? false : (e.actor.cls === 'boss' || e.actor.cls === 'lich');
    const f0 = this.fr.idle[0];
    this.sprite.setTexture(f0.key, f0.frame).setOrigin(0.5, this.fr.originY).setScale(this.base).setVisible(false)
      .setAlpha(1).setFlipX(false).setActive(true);
    this.sprite.setTint(0xffffff).setTintMode(TM.MULTIPLY);
    this.tintC = 0xffffff; this.tintM = TM.MULTIPLY;
    this.curKey = f0.key; this.curFrame = f0.frame;
    this.facing = 1;
    this.stateSeen = ''; this.stateAt = now;
    this.flashAt = -1e9; this.flashUntil = -1e9; this.squashUntil = -1e9; this.squashX = true; this.recoilUntil = -1e9; this.recoilX = 0; this.recoilY = 0;
    this.animT = 0; this.lastNow = now; this.frameIdx = 0; this.lastFrameIdx = -1;
    this.moteT = 0; this.dustT = 0; this.ghostT = 0; this.bubbleT = 0;
    this.blinkNext = now + 2500 + L.sys.fxRng.float(0, 1500); this.blinkAt = -1e9;
    this.dying = false; this.done = false; this.dieAt = 0; this.deathKind = ''; this.puffed = false; this.sx = e.x; this.sy = e.feetY;
    this.slideVx = 0; this.slideVy = 0; this.frozenAt = -1e9; this.wasFrozen = false; this.thawAt = -1e9; this.weaponGone = false;
    // v2 defence / affix read state (sim-clock ms)
    this.defReadAt = -1e9; this.blockUntil = -1e9; this.freezeUntil = -1e9; this.clangUntil = -1e9; this.rattleUntil = -1e9;
    this.wardFormAt = -1e9; this.regrowAt = -1e9; this.guardAt = -1e9; this.mirrorAt = -1e9; this.affixHoldUntil = -1e9;
    this.affixPhase = L.sys.fxRng.float(0, 1);
    this.hasteT = 0;
    if (this.outline) this.outline.setVisible(false);
    const wk = e.actor.weapon;
    if (wk) {
      const t = L.weaponTexture(wk);
      if (!this.weapon) this.weapon = L.scene.add.image(0, 0, t.key, t.frame);
      else this.weapon.setTexture(t.key, t.frame);
      this.weapon.setOrigin(0.5, wk === 'blade' ? 0.85 : 0.9).setScale(this.base).setVisible(false).setAlpha(1).setRotation(0);
      this.weaponKind = wk;
    } else { this.weaponKind = null; if (this.weapon) this.weapon.setVisible(false); }
  }

  // ------------------------------------------------------------------ Combat hooks (contract: e.view.flash())
  flash() {
    const e = this.e; if (!e || this.dying) return;
    const L = this.L, now = L.ctx.time.ms, t = L.t;
    if (now < this.flashUntil + t.rearmMs) return;                 // R5 re-arm (flash duty ≤ 60 %)
    const ai = e.ai;
    if (ai.state === 'windup' && ai.locked) {                     // lock window: the decal carries the hit read (1-step outline brighten)
      for (let i = 0; i < ai.decN; i++) if (ai.dec[i]) ai.dec[i].brighten = L.sys.tl.step + 1;
      return;
    }
    this.flashAt = now; this.flashUntil = now + t.flashMs;
    if (L.reduced) return;
    const p = L.ctx.player;
    if (e.isBoss) {                                                // bosses: 1 px recoil along the shot heading, no squash
      const dx = e.x - p.x, dy = e.y - p.y, d = Math.hypot(dx, dy) || 1;
      this.recoilX = Math.round(dx / d); this.recoilY = Math.round(dy / d); this.recoilUntil = now + STEP_MS;
    } else if (ai.state !== 'frozen') {
      this.squashUntil = now + t.squashMs;
      this.squashX = Math.abs(e.x - p.x) >= Math.abs(e.y - p.y);
    }
  }
  /** Hits on an invulnerable boss (intro / phase-shift): grey clink, no flash (telegraphs §3.3). */
  clink() {
    const e = this.e; if (!e) return;
    this.L.ctx.fx.particles('spark', e.x, e.y, 2, { color: 0xb8b8c8, speed: 40, lifeMs: 120 });
  }
  // ------------------------------------------------------------------ v2 defence reads (telegraphs §3.7; state-graph §8.1)
  /**
   * Driven only by the sim (Defences): block | wear | break | reduce | reduce-blast | absorb | empty | strip |
   * grant | regrow | spawn | guard-start | guard-end. Repeat reads within defenceReadCooldownMs coalesce per
   * enemy (a 20-hit/s stream shows ≤ 8 reads/s); break / strip are never throttled. Blocks never use the body flash.
   */
  defenceEvent(kind, o) {
    const e = this.e; if (!e || this.dying) return;
    const L = this.L, now = L.ctx.time.ms, t = L.t, fx = L.ctx.fx, reduced = L.reduced, p = L.ctx.player;
    const hitThrottled = kind === 'block' || kind === 'wear' || kind === 'absorb' || kind === 'reduce' || kind === 'reduce-blast';
    if (hitThrottled) { if (now - this.defReadAt < t.defReadMs) return; this.defReadAt = now; }
    const away = Math.atan2(e.y - p.coreY, e.x - p.coreX);          // pushed away from the shooter
    const cy = e.y;
    switch (kind) {
      case 'block': case 'wear': {
        this.blockUntil = now + STEP_MS;
        if (!reduced) { this.recoilX = Math.round(Math.cos(away) * t.recoilPx); this.recoilY = Math.round(Math.sin(away) * t.recoilPx); this.recoilUntil = now + 2 * STEP_MS; }
        const fa = away + Math.PI;                                   // the plate faces the shooter; sparks glance off tangentially
        const px = e.x + Math.cos(fa) * e.r, py = cy + Math.sin(fa) * e.r;
        fx.particles('spark', px, py, 1, { color: DEF_COL.shield, speed: 55, dir: fa + Math.PI / 2, spread: 0.25, lifeMs: 150 });
        fx.particles('spark', px, py, 1, { color: DEF_COL.shield, speed: 55, dir: fa - Math.PI / 2, spread: 0.25, lifeMs: 150 });
        if (kind === 'wear') fx.particles('shard', px, py + 2, 1, { color: DEF_COL.shield, speed: 20, gravity: 80, lifeMs: 300 });
        break;
      }
      case 'break': {
        const col = o && o.type === 'armour' ? DEF_COL.armour : DEF_COL.shield;
        fx.particles('shard', e.x, cy, reduced ? Math.min(3, t.breakShards) : t.breakShards, { color: col, speed: 70, dir: away, spread: 1.1, lifeMs: 250 });
        this.freezeUntil = now + t.breakFreezeMs;
        break;
      }
      case 'reduce': case 'reduce-blast': {
        this.clangUntil = now + STEP_MS;                             // R5 2a: steel FILL instead of the white flash
        const n = kind === 'reduce-blast' ? 4 : 2;
        if (!reduced) { if (kind === 'reduce-blast') this.rattleUntil = now + 2 * STEP_MS; fx.particles('shard', e.x, cy, n, { color: DEF_COL.armour, speed: 45, lifeMs: 220 }); }
        else fx.particles('shard', e.x, cy, Math.min(3, n), { color: DEF_COL.armour, speed: 45, lifeMs: 220 });
        break;
      }
      case 'absorb': case 'empty': {                                  // the mote nearest the shot pops (a small cyan ring)
        const m = this._nearestMote(e, now, away + Math.PI);
        if (m) L.sys.tl.ring(m.x, m.y, 1, 3, t.wardPopMs, DEF_COL.ward, 1, 1);
        break;
      }
      case 'strip': {                                                 // every mote bursts; a shock arc crackles to core
        const n = Math.min(18, 6 * Math.max(1, this.lastMotes || 1));
        fx.particles('spark', e.x, cy, reduced ? 3 : n, { color: DEF_COL.ward, speed: 60, lifeMs: 220 });
        fx.bolt(p.coreX + (e.x - p.coreX) * 0.6, p.coreY + (cy - p.coreY) * 0.6, e.x, cy, { color: EL_HUE.shock, ms: STEP_MS });
        this.freezeUntil = now + t.breakFreezeMs;
        break;
      }
      case 'grant': this.wardFormAt = now; break;
      case 'regrow': this.wardFormAt = now; this.regrowAt = now; break;
      case 'spawn': this.wardFormAt = -1e9; this.regrowAt = -1e9; break;
      case 'guard-start': this.guardAt = now; this.regrowAt = now; break;
      default: break;
    }
  }
  /** Tether arrival read on the ward recipient (telegraphs §2.14): motes re-form from the arrival. */
  wardArrive() { this.wardFormAt = this.L.ctx.time.ms; }
  /** First player hit on an elite: the outline holds at α 1 for 600 ms (telegraphs §3.8). */
  affixHold() { this.affixHoldUntil = this.L.ctx.time.ms + 600; }
  /** mirror release: 1-step ghost flash at the hand (telegraphs §2.15). */
  mirrorFlash() { this.mirrorAt = this.L.ctx.time.ms; }

  _motePos(e, now, i, n, out) {
    const a = (now / this.L.t.wardOrbitMs) * TAU + (i * TAU) / n, R = e.r + 5;
    out.x = e.x + Math.cos(a) * R; out.y = e.y + Math.sin(a) * R * 0.75;
    return out;
  }
  _nearestMote(e, now, toward) {
    const n = Math.max(1, Math.min(6, this.lastMotes || 1));
    let best = null, bd = 1e9;
    const tmp = this._mp || (this._mp = { x: 0, y: 0 }), res = this._mb || (this._mb = { x: 0, y: 0 });
    const tx = e.x + Math.cos(toward) * 20, ty = e.y + Math.sin(toward) * 20;
    for (let i = 0; i < n; i++) {
      this._motePos(e, now, i, n, tmp);
      const d = (tmp.x - tx) ** 2 + (tmp.y - ty) ** 2;
      if (d < bd) { bd = d; res.x = tmp.x; res.y = tmp.y; best = res; }
    }
    return best;
  }

  /** Frozen → thaw (Combat fires the freeze_shatter cue): shell shatter + 4 shards. */
  thaw() {
    const e = this.e; if (!e) return;
    const fx = this.L.ctx.fx;
    fx.flipbook('fx.freeze_shatter', e.x, e.y, { silentFallback: true });
    fx.particles('shard', e.x, e.y, 4, { color: 0xcae6f5, speed: 60 });
    this.thawAt = this.L.ctx.time.ms;
  }

  die() {
    const e = this.e, L = this.L;
    this.dying = true;
    this.dieAt = L.ctx.time.ms + (e.deathDelayMs || 0);
    const a = e.actor;
    this.deathKind = e.isBoss ? 'boss' : e.ai.exploded ? 'imp' : a.death;
    this.sx = e.x; this.sy = e.feetY;
    this.slideVx = e.kbVx; this.slideVy = e.kbVy;
    this.puffed = false;
  }

  // ------------------------------------------------------------------ sim-step cosmetics (fx stream)
  stepFx(dt) {
    const e = this.e; if (!e || this.dying || !e.alive) return;
    const L = this.L, fx = L.ctx.fx, ai = e.ai, rng = L.sys.fxRng, a = e.actor, st = ai.state;
    if (st === 'spawning' || st === 'intro') return;
    this.moteT += dt; this.dustT += dt; this.ghostT += dt; this.bubbleT += dt;
    if (e.affixes.length && e.affixes.includes('hasted') && st === 'move' && this.sprite.visible && !L.reduced) {   // state-graph §8.2 hasted ghost
      this.hasteT += dt;
      if (this.hasteT >= 200) { this.hasteT = 0; fx.afterimage(this.sprite, { tint: OUTLINE['outline.gold'], alpha: 0.35, fadeMs: 150 }); }
    }
    if (a.mote && (st === 'move' || st === 'recover') && this.moteT >= a.moteMs) {
      this.moteT = 0;
      fx.particles(a.id === 'fire_imp' ? 'ember' : 'mote', e.x + rng.float(-3, 3), e.y - 2, 1, { color: a.mote, speed: 8, lifeMs: 500 });
    }
    const type = ai.atk && ai.atk.type;
    if (st === 'windup' && type === 'charge' && this.dustT >= 150) {       // pawing: 2 dust scuffs per 150 ms
      this.dustT = 0; fx.particles('dust', e.x, e.feetY, 2, { speed: 20, lifeMs: 250 });
    }
    if (st === 'act' && type === 'charge' && this.ghostT >= 50 && this.sprite.visible) {   // 2 speed-line afterimages / 100 ms
      this.ghostT = 0; fx.afterimage(this.sprite, { tint: COL.rim, alpha: 0.4, fadeMs: 120 });
    }
    if (st === 'windup' && type === 'blink' && this.moteT >= 25) {         // motes drift up, 4 per 100 ms
      this.moteT = 0; fx.particles('mote', e.x + rng.float(-4, 4), e.y, 1, { color: 0xcfc0ff, speed: 10, lifeMs: 400 });
    }
    if (st === 'windup' && type === 'spiral' && e.id === 'mire_queen' && this.bubbleT >= 100) {
      this.bubbleT = 0; fx.particles('bubble', e.x + rng.float(-8, 8), e.y, 1, { color: 0x97da3f, speed: 10, lifeMs: 450 });
    }
    if (st === 'windup' && ai.atk && ai.atk.id === 'soul_storm' && this.moteT >= 75) {   // souls converge from r = 60
      this.moteT = 0;
      const ang = rng.float(0, TAU);
      fx.particles('soul', e.x + Math.cos(ang) * 60, e.y + Math.sin(ang) * 60, 1, { color: 0xcfc0ff, speed: 70, dir: ang + Math.PI, spread: 0.05, lifeMs: 700, gravity: 0 });
    }
    if (st === 'windup' && type === 'slam' && ai.atk.at === 'self' && this.dustT >= 120) {  // pebbles lift
      this.dustT = 0; fx.particles('dust', e.x + rng.float(-e.r, e.r), e.feetY, 1, { speed: 12, gravity: -30, lifeMs: 300 });
    }
  }

  // ------------------------------------------------------------------ render (per frame; sim-clock driven)
  render() {
    const e = this.e; if (!e) { this.done = true; return; }
    const L = this.L, ctx = L.ctx, now = ctx.time.ms;
    const dtNow = Math.max(0, now - this.lastNow); this.lastNow = now;
    if (this.dying) { this._renderDying(now, dtNow); return; }
    const ai = e.ai, t = L.t, a = e.actor, anc = e.anchor, base = this.base, spr = this.sprite, reduced = L.reduced;
    const st = ai.state;
    if (st !== this.stateSeen) { this._enter(st, now); }
    const inSt = now - this.stateAt;
    const frozen = st === 'frozen';

    // ---- clip + rate
    let frames = this.fr.idle, fps = t.idleFps * (a.idleFpsMult || 1), timeScale = 1;
    let ox = 0, oy = 0, sx = 1, sy = 1, alpha = a.alpha ?? 1;
    const bv = e.body && e.body.enable ? e.body.velocity : null;
    const vmag = bv ? Math.hypot(bv.x, bv.y) : 0;
    const moving = (st === 'move' || st === 'approach') && vmag > 8;
    if (moving) { frames = this.fr.move; fps = t.runFps * clamp(vmag / Math.max(1, e.speed), 0.6, 1.25); }
    if (a.clip === 'C') fps = t.flapFps;
    if (a.jiggle) fps = (moving ? t.runFps : t.idleFps) + 10;

    // ---- facing (R6): velocity in move, toward the player (locked aim for chargers) otherwise
    let fdx;
    if (st === 'move' || st === 'approach') fdx = vmag > 1 ? bv.x / vmag : 0;
    else fdx = Math.cos(ai.aim);
    if (Math.abs(fdx) >= t.deadband) this.facing = fdx < 0 ? -1 : 1;

    // ---- telegraph tint (R5 priority 4) + per-state procedural layer
    let hot = -1;                 // ADD colour or −1
    let fillReq = false;          // a FILL request other than the hit flash (imp strobe, entry flashes)
    let useWindup = false;
    let invuln = st === 'spawning' || st === 'intro' || st === 'phase';
    const type = ai.atk ? ai.atk.type : '';
    const openingMs = t.openingMs;
    if (st === 'spawning') {
      const portalMs = e.portalMs ?? L.sys.rules.enemies.spawnPortalMs, em = portalMs - t.emergeMs;
      if (inSt < em) alpha = 0;
      else sy = q8(clamp(backOut(clamp((inSt - em) / t.emergeMs, 0, 1)), 0, 1.25));
    } else if (st === 'windup') {
      const p = ai.wElapsed / ai.wTotal, lockAt = ai.wTotal - L.sys.lockMs;
      const inOpen = ai.wElapsed < openingMs, kOpen = clamp(ai.wElapsed / openingMs, 0, 1);
      const ps = clamp((ai.wElapsed - openingMs) / Math.max(1, lockAt - openingMs), 0, 1);
      timeScale = ai.locked ? 0 : 1.5;
      hot = ai.locked ? COL.hotPeak : lerpColor(0x000000, COL.hotMid, ps);
      const stepsInLock = ai.locked ? Math.floor((ai.wElapsed - lockAt) / STEP_MS) : 0;
      if (ai.locked && !reduced && (stepsInLock >> 1) % 2 === 1) ox += t.jitterPx;                // lock tremble
      const ca = Math.cos(ai.aim), sa = Math.sin(ai.aim);
      switch (type) {
        case 'melee_swipe':
          ox -= Math.round(ca * 2 * quadOut(kOpen)); oy -= Math.round(sa * 2 * quadOut(kOpen));      // rear-back opposite the aim
          if (e.id === 'skeleton' && inOpen) sx = 1.125;                                             // wind-up coil
          break;
        case 'shoot':
          if (e.id === 'mire_queen') oy -= Math.round(2 * kOpen); else if (e.id !== 'eye_turret') oy -= 1;   // casters stand tall
          if (e.id === 'wraith') alpha = 0.85 + 0.15 * kOpen;                                       // solidifies to shoot
          if (e.id === 'eye_turret' || a.windupFrame) useWindup = true;
          this._handGlow(e, p, ai, now, false);
          break;
        case 'ring': {
          if (e.id === 'eye_turret' || a.windupFrame) useWindup = true;
          const pulses = [0, 0.33, 0.6, 0.8];
          for (let i = 0; i < 4; i++) { const t0 = pulses[i] * ai.wTotal; if (ai.wElapsed >= t0 && ai.wElapsed < t0 + 2 * STEP_MS) sx = 1.125; }
          if (ai.atk.id === 'soul_storm') oy -= Math.round(t.risePx * p);
          if (ai.atk.id === 'frost_ring') { const r = e.r + 4 + Math.floor(p * 3); this._glowRing(e.x, e.y, r, EL_HUE.frost, 0.6); }
          break;
        }
        case 'spiral':
          if (e.id === 'mire_queen' && !reduced) sx = (Math.floor(ai.wElapsed / 125) % 2) ? 1.125 : 1;    // inflate at 4 Hz
          this._spiralMotes(e, ai, p);
          break;
        case 'charge':
          oy += 2; if (e.id === 'brute') sx = 1.125;                                                // [tell-scale] braced stance
          ox -= Math.round(ca * 2 * quadOut(kOpen)); oy -= Math.round(sa * 2 * quadOut(kOpen));
          break;
        case 'slam':
          if (ai.atk.at === 'target') { oy += Math.round(3 * kOpen); sx = this.xOnly ? 1.0625 : 1.125; }   // crouch [tell-scale]
          else oy -= Math.round(3 * kOpen);                                                          // rear up
          break;
        case 'summon':
          oy -= Math.round(2 * kOpen);
          if (e.id === 'mire_queen' && ((ps > 0.3 && ps < 0.4) || (ps > 0.63 && ps < 0.73))) sx = 1.0625;  // belly heave
          break;
        case 'blink': {
          alpha = (p < 0.5 ? 1 : 0.5) * (a.alpha ?? 1);
          if (!reduced && (Math.floor(ai.wElapsed / (2 * STEP_MS)) % 2 === 1)) ox += 1;             // dither shimmer
          if (ai.locked) { const k = clamp((ai.wElapsed - lockAt) / L.sys.lockMs, 0, 0.999); sx = 1 - 0.25 * (1 + Math.floor(k * 3)); }  // collapse 0.75/0.5/0.25
          break;
        }
        case 'self_destruct': {
          oy += 1;                                                                                   // hunch
          const s = p < 0.25 ? 1 : p < 0.5 ? 1.125 : !ai.locked ? 1.25 : 1.375;                     // [tell-scale] stepped swell
          sx = s; sy = s;
          if (!reduced) {
            if (ai.locked) fillReq = true;                                                           // steady in the lock window
            else {
              const period = Math.max(4, Math.round(12 - 8 * p));                                    // 12 → 4 steps
              const stepNo = Math.floor(ai.wElapsed / STEP_MS);
              if (stepNo % period === 0) fillReq = true;
            }
          }
          break;
        }
        case 'hazard':
          if (e.id === 'mire_queen' && ((ps > 0.2 && ps < 0.27) || (ps > 0.5 && ps < 0.57) || (ps > 0.8 && ps < 0.87))) oy += 2;   // spitting
          break;
        case 'ward_allies':                                                                          // telegraphs §2.14
          if (ai.wardSelf && !(ai.wardTargets && ai.wardTargets.length)) oy += Math.round(2 * kOpen);   // veil: hunch
          else oy -= Math.round(2 * kOpen);                                                          // lantern raised
          this._tethers(e, ai, p, now);
          break;
        case 'mirror':                                                                               // telegraphs §2.15 (as shoot)
          oy -= 1;
          this._handGlow(e, p, ai, now, false);
          break;
        default: break;
      }
      if (e.isBoss && (type === 'shoot' || type === 'ring' || type === 'spiral' || type === 'mirror')) this._castGlyph(e, now, p);
    } else if (st === 'act' || st === 'airborne') {
      const ca = Math.cos(ai.aim), sa = Math.sin(ai.aim);
      if (inSt < t.stretchMs && st === 'act' && !reduced) { if (Math.abs(ca) >= Math.abs(sa)) sx = 1.125; else sy = 1.125; }   // release stretch
      switch (type) {
        case 'melee_swipe': if (inSt < 50) { ox += Math.round(ca * 3); oy += Math.round(sa * 3); } break;
        case 'shoot': if (inSt < 2 * STEP_MS) { ox -= Math.round(ca); oy -= Math.round(sa); } if (inSt < 3 * STEP_MS) this._handGlow(e, 1, ai, now, true); break;
        case 'charge': frames = this.fr.move; fps = t.runFps; timeScale = 1.25; break;
        case 'spiral':
          hot = lerpColor(0x000000, COL.hotPeak, 0.5);                                              // "still firing"
          this._spiralMotes(e, ai, 1);
          if (e.isBoss) this._castGlyph(e, now, 1);
          break;
        case 'slam':
          if (st === 'airborne') {
            const tt = ai.air;
            oy -= Math.round(4 * 40 * tt * (1 - tt));                                                // parabola, H = 40 px
            alpha = 0.85;
          }
          break;
        case 'ring': break;
        case 'mirror': if (inSt < 3 * STEP_MS) this._handGlow(e, 1, ai, now, true); break;
        default: break;
      }
    } else if (st === 'recover') {
      timeScale = 0.5;
      if (inSt < 100) oy -= 1;                                                                       // slump
      if (type === 'slam' && inSt < 83 && !reduced) sx = 1.125;                                      // landing squash
      if (type === 'blink') {                                                                        // reappear: scaleX 0.25 → 1, alpha 0.5 → base
        const k = clamp(inSt / Math.max(1, ai.atk.recoverMs || 150), 0, 1), bo = backOut(k);
        sx = q8(clamp(0.25 + 0.75 * bo, 0.25, 1.125)); alpha = 0.5 + ((a.alpha ?? 1) - 0.5) * k;
      }
    } else if (st === 'stunned') {
      timeScale = 0;
      if (ai.stunKind === 'shock') { if (!reduced) ox += (Math.floor((inSt * t.stunHz * 2) / 1000) % 2) ? t.jitterPx : -t.jitterPx; }
      else if (inSt < 83 && !reduced) { const ca = Math.cos(ai.aim); if (Math.abs(ca) >= Math.abs(Math.sin(ai.aim))) sx = 0.75; else sy = 0.75; }
    } else if (frozen) {
      timeScale = 0;
      if (inSt < STEP_MS) fillReq = true;                                                            // 1-step crack-in flash
    } else if (st === 'intro') {
      const rise = e.tier === 'mini' ? 0 : t.panMs / 2;                                             // minis: no pan, rise at 0 (§8.3)
      if (inSt < rise) { timeScale = 0; oy += t.risePx; }
      else if (inSt < rise + 300) oy += Math.round(t.risePx * (1 - clamp(backOut((inSt - rise) / 300), 0, 1.2)));
      const act = e.activateMs || L.sys.rules.enemies.bossActivateDelayMs;
      if (inSt >= act - 150 && inSt < act - 150 + STEP_MS) fillReq = true;   // "awake"
    } else if (st === 'phase') {
      if (inSt < STEP_MS) fillReq = true;                                                            // FILL held through the phase stop
      if (!reduced) ox += (Math.floor((inSt * t.stunHz * 2) / 1000) % 2) ? 1 : -1;
      const inv = ai.invulnMs || 1200, span = Math.max(1, inv - 300);
      if (inSt < span) {                                                                             // 3 aura pulses (ADD #5a3a8a, sine)
        const k = Math.sin(((inSt / span) * 3) * Math.PI);
        if (k > 0.05) hot = lerpColor(0x000000, COL.aura, Math.abs(k));
      } else if (inSt < inv) { oy -= 2; sx = 0.9375; }                                              // roar pose
    }
    if (e.id === 'eye_turret' && (st === 'move' || st === 'recover')) {                              // idle eye blink every 2.5–4 s
      if (now >= this.blinkNext) { this.blinkAt = now; this.blinkNext = now + 2500 + L.sys.fxRng.float(0, 1500); }
      const bt = now - this.blinkAt;
      if (bt < 120) sy = bt < 40 ? 0.625 : bt < 80 ? 0.25 : 0.625;
    }
    if (!moving && (st === 'move' || st === 'recover') && a.clip === 'D' && !e.flying) oy -= (Math.floor(now / 625) % 2);   // breath 0.8 Hz
    if (moving && a.clip === 'D') oy -= (Math.floor(now / 62.5) % 2);                                // chatter 8 Hz
    if (moving && a.clip === 'B' && this.frameIdx % 2 === 0) oy -= 1;                               // class B hop on f0/f2

    // ---- hit squash / boss recoil (re-armed with the flash)
    if (now < this.squashUntil && !frozen && !e.isBoss) { if (this.squashX) { sx *= 1.125; sy *= 0.875; } else { sx *= 0.875; sy *= 1.125; } }
    if (now < this.recoilUntil) { ox += this.recoilX; oy += this.recoilY; }

    // ---- frame advance (sim-time, pauses with hit-stop; frozen/stunned/lock hold the frame; defence break = local anim freeze)
    if (now < this.freezeUntil) timeScale = 0;
    if (now < this.rattleUntil) ox += (Math.floor(now / STEP_MS) % 2) ? 1 : -1;      // blast into armour: plate rattle ±1 px
    this.animT += dtNow * timeScale;
    const n = frames.length;
    this.frameIdx = n > 1 ? Math.floor((this.animT / 1000) * fps) % n : 0;
    let fr = frames[this.frameIdx] || frames[0];
    if (useWindup && this.fr.windup) fr = this.fr.windup;
    if (fr.key !== this.curKey || fr.frame !== this.curFrame) { spr.setTexture(fr.key, fr.frame); this.curKey = fr.key; this.curFrame = fr.frame; }
    if (moving && this.frameIdx !== this.lastFrameIdx && (this.frameIdx === 0 || this.frameIdx === 2)) {
      if (a.heavySteps) L.sys.fire('heavy_step'); else if (e.isBoss) L.sys.fire('boss_step');
    }
    this.lastFrameIdx = this.frameIdx;

    // ---- place (feet anchor, integer px; flyers hover + bob)
    let bob = 0;
    if (e.flying) bob = Math.round(Math.sin((now / t.bobMs) * TAU) * t.bobPx);
    const fx0 = Math.round(e.x), fy0 = Math.round(e.feetY);
    const spriteY = fy0 - (e.flying ? FLYER_HOVER_PX : 0) + bob + oy;
    const baseS = base;
    const qx = q8(sx), qy = this.xOnly ? 1 : q8(sy);
    spr.setPosition(fx0 + ox, spriteY).setScale(baseS * (this.xOnly ? (sx === 1.0625 || sx === 0.9375 ? sx : qx) : qx), baseS * (this.xOnly ? 1 : qy));
    spr.setFlipX(this.facing < 0).setAlpha(clamp(alpha, 0, 1)).setVisible(alpha > 0);
    spr.setDepth(DEPTH.actors + e.feetY / 10000);

    // ---- R5 tint priority
    this._tint(now, frozen, hot, fillReq, invuln, e);

    // ---- ground layer: elite ring + shadow (shadow stays on the ground under flyers)
    const g = L.groundG;
    const airK = st === 'airborne' ? (1 - 0.375 * Math.sin(Math.PI * ai.air)) : 1;
    const shw = anc.shadow[0] * airK, shh = Math.max(2, Math.round(anc.shadow[1] * airK));
    if (e.elite && st !== 'spawning') L.ellipse(g, fx0, fy0, anc.ring[0], anc.ring[1], COL.eliteGold, 0.5);
    else if (e.elite) L.ellipse(g, fx0, fy0, anc.ring[0], anc.ring[1], COL.eliteGold, 0.5 * clamp(inSt / 200, 0, 1));
    if (alpha > 0) L.ellipse(g, fx0, fy0, Math.round(shw), shh, 0x000000, 0.35);

    // ---- weapon overlay (Knight blade / Lich staff)
    if (this.weapon) this._weapon(e, fx0 + ox, spriteY, st, type, now);

    // ---- status overlays (overlayG)
    if (e.portalSpawn) this._portal(e, now);
    if (st !== 'spawning') this._status(e, fx0, spriteY, now);
    if (a.trail && alpha > 0) this._glowDisc(fx0, spriteY + anc.core, 5, COL.hotPeak, 0.35);
    // ---- v2: defence overlay region (state-graph §8.1) + affix / dark-twist outline (§8.2)
    if (st !== 'spawning' && alpha > 0) this._defence(e, fx0 + ox, spriteY, now, ai);
    this._outline(e, frames, useWindup, now, st, ai, alpha);
    if (now - this.mirrorAt < 2 * STEP_MS) this._glowDisc(fx0 + anc.hand[0] * this.facing, spriteY + anc.hand[1], 5, 0xffffff, 0.9);
  }

  // ------------------------------------------------------------------ v2 overlays
  _defence(e, x, spriteY, now, ai) {
    const d = e.defence; if (!d) { this.lastMotes = 0; return; }
    const L = this.L, t = L.t, anc = e.anchor, b = this.base, cy = Math.round(spriteY + anc.core);
    const regrowK = now - this.regrowAt < 300 ? Math.floor((now - this.regrowAt) / 100 + 1) / 3 : 1;   // Stepped 3 over 300 ms
    const bodyD = this.sprite.depth;
    if (d.type === 'shield') {
      const a = L.ctx.combat.defences.facing(e), ca = Math.cos(a), sa = Math.sin(a);
      const dep = sa < -0.6 ? bodyD - 0.00003 : bodyD + 0.00003;                                      // facing up: the plate is behind
      const flash = now < this.blockUntil;
      if (d.temp) {                                                                                    // guard: boss plate + front-arc rim (§2.13)
        const want = e.r + 6, radii = [10, 12, 14, 16, 18, 22];
        let R = radii[0]; for (const r of radii) if (r <= want) R = r;
        const left = d.untilMs - now;
        const blinkOff = left < t.guardBlinkMs && (Math.floor(left / 125) % 2 === 1);                 // 4 Hz blink at the end
        if (!blinkOff) L.spr(`authored.shield_arc_r${R}${flash ? '_hit' : ''}`, 0, e.x, cy, dep, false, -1, 0.85 * regrowK, a, 0.5);
      } else if (flash) {
        const R = e.r + 6 <= 12 ? 10 : e.r + 6 <= 16 ? 14 : 18;
        L.spr(`authored.shield_arc_r${R}_hit`, 0, e.x, cy, dep, false, -1, 0.9, a, 0.5);             // the block glint on the front arc
      }
      const wb = d.wearBlocks, stage = d.blocks >= Math.ceil((2 * wb) / 3) ? 2 : d.blocks >= Math.ceil(wb / 3) ? 1 : 0;
      const off = Math.max(4, e.r - 1);
      const im = L.spr(`defences.shield.held.${stage === 0 ? 'fresh' : stage === 1 ? 'worn' : 'cracked'}`, 0,
        x + ca * off, cy + sa * off * 0.6, dep, false, -1, regrowK, 0, 0.5);
      if (im) { im.setScale(b).setFlipX(ca < 0); if (flash) im.setTint(0xffffff).setTintMode(TM.FILL); }
      this.lastMotes = 0;
    } else if (d.type === 'ward') {
      const n = d.hits;
      const formed = now - this.wardFormAt < n * t.wardStepMs ? Math.min(n, Math.floor((now - this.wardFormAt) / t.wardStepMs) + 1) : n;
      const shown = Math.min(6, formed);
      this.lastMotes = shown;
      const mp = this._mp || (this._mp = { x: 0, y: 0 });
      for (let i = 0; i < shown; i++) {
        this._motePos(e, now, i, shown, mp);
        const back = Math.sin((now / t.wardOrbitMs) * TAU + (i * TAU) / shown) < 0;
        L.spr('defences.ward.pips', i < formed && now - this.wardFormAt < (i + 1) * t.wardStepMs + 60 ? 2 : 0, mp.x, mp.y - (e.y - cy), back ? bodyD - 0.00003 : bodyD + 0.00003, false, -1, 1, 0, 0.5);
      }
      if (n > 6) L.digit(L.overlayG, Math.round(x + e.r + 6), cy - 3, Math.min(9, n), DEF_COL.ward);
    } else if (d.type === 'armour') {                                                                 // steel plates: intact > 66 / dented > 33 / cracked
      const frac = d.max > 0 ? d.points / d.max : 0;
      const plates = frac > 0.66 ? 3 : frac > 0.33 ? 2 : 1;
      const g = L.overlayG, w = 3 * b, h = 2 * b, y0 = cy - Math.round(h * 1.5);
      for (let i = 0; i < plates; i++) {
        const px = Math.round(x - w / 2 + (i === 1 ? -w + 1 : i === 2 ? w - 1 : 0)), py = y0 + (i === 0 ? 0 : h);
        g.fillStyle(COL.rimDark, regrowK).fillRect(px - 1, py - 1, w + 2, h + 2);
        g.fillStyle(DEF_COL.armour, regrowK).fillRect(px, py, w, h);
      }
      this.lastMotes = 0;
    }
  }

  /** ward_allies tethers: dashed 1 px defence-ward lines caster → recipient, α ∝ p, solid at the lock (§2.14). */
  _tethers(e, ai, p, now) {
    const list = ai.wardTargets; if (!list || !list.length) return;
    const g = this.L.overlayG, a = 0.3 + 0.7 * clamp(p, 0, 1);
    g.lineStyle(1, DEF_COL.ward, a);
    for (let k = 0; k < list.length; k++) {
      const o = list[k]; if (!o.alive) continue;
      const dx = o.x - e.x, dy = o.y - e.y, L = Math.hypot(dx, dy); if (L < 2) continue;
      if (ai.locked) { g.lineBetween(Math.round(e.x), Math.round(e.y), Math.round(o.x), Math.round(o.y)); continue; }
      const ux = dx / L, uy = dy / L, crawl = Math.floor(now / 66) % 3;
      for (let s0 = crawl; s0 < L; s0 += 3) {
        const s1 = Math.min(L, s0 + 2);
        g.lineBetween(Math.round(e.x + ux * s0), Math.round(e.y + uy * s0), Math.round(e.x + ux * s1), Math.round(e.y + uy * s1));
      }
    }
  }

  /**
   * Affix outline overlay (ring1 frame index-synced to the body, NORMAL tint with the affix token, feet on the
   * body's feet via the frame pivot → setOriginFromFrame). Pulse α affixPulseAlphaMin ↔ 1 (Sine, random phase),
   * held at 1 in the lock window and for 600 ms after the first hit; two affixes alternate tokens each half period.
   * Dark twist: every enemy gets the ring1 outline in #fdf7ed at α 1 (the affix token wins on elites).
   */
  _outline(e, frames, useWindup, now, st, ai, alpha) {
    const L = this.L, fr = this.fr;
    const affixed = e.elite && e.affixes.length > 0;
    const dark = L.sys.darkOutline;
    if ((!affixed && !dark) || !fr.hasRing || alpha <= 0 || !this.sprite.visible) { if (this.outline) this.outline.setVisible(false); return; }
    const clip = useWindup && this.fr.windup ? 'windup_frame' : (frames === fr.move && fr.move !== fr.idle ? 'move' : 'idle');
    const a = L.ringFrame(fr, clip, 'ring1', clip === 'windup_frame' ? 0 : this.frameIdx) || L.ringFrame(fr, 'idle', 'ring1', this.frameIdx);
    if (!a) { if (this.outline) this.outline.setVisible(false); return; }
    let ol = this.outline;
    if (!ol) ol = this.outline = L.scene.add.image(0, 0, a.key, a.frame);
    if (ol.texture.key !== a.key || ol.frame.name !== a.frame) ol.setTexture(a.key, a.frame);
    ol.setOriginFromFrame();
    let color = OUTLINE.dark, oa = 1;
    if (affixed) {
      const P = L.t.affixPeriodMs, k = ((now / P) + this.affixPhase) % 1;
      const half = e.affixes.length > 1 && k >= 0.5 ? 1 : 0;                    // swap at the α minimum (k = 0 / 0.5 troughs)
      const AF = L.ctx.cat.affixes || {};
      const def = AF[e.affixes[half]] || AF[e.affixes[0]];
      color = (def && OUTLINE[def.outlineKey]) ?? COL.eliteGold;
      const hold = L.reduced || now < this.affixHoldUntil || (st === 'windup' && ai.locked);
      oa = hold ? 1 : L.t.affixAlphaMin + (1 - L.t.affixAlphaMin) * (0.5 - 0.5 * Math.cos(k * 2 * TAU));
    }
    const sp = this.sprite;
    // Dark twist (B's objection): the outline must read ABOVE the darkness layer (DEPTH_DARK 61.5) → 61.75
    ol.setPosition(sp.x, sp.y).setScale(sp.scaleX, sp.scaleY).setFlipX(sp.flipX).setDepth(dark ? 61.75 : sp.depth + 0.00002)
      .setTint(color).setTintMode(TM.MULTIPLY).setAlpha(oa * clamp(alpha, 0, 1)).setVisible(true);
  }

  _enter(st, now) {
    const prev = this.stateSeen;
    this.stateSeen = st; this.stateAt = now;
    if (st === 'frozen') this.frozenAt = now;
    if (prev === 'windup' && st !== 'act' && st !== 'airborne') this.animT = 0;
  }

  /** R5: dying/strobe FILL > hit flash > frozen > telegraph ADD > invuln > chill > clear. */
  _tint(now, frozen, hot, fillReq, invuln, e) {
    const L = this.L;
    const flashing = now < this.flashUntil;
    let mode, color;
    if (fillReq || flashing) {
      const k = (Save.settings.flashIntensity ?? 100) / 100;       // R8: FILL as ADD ×k, nothing at 0
      if (k >= 1) { mode = TM.FILL; color = COL.flash; }
      else if (k > 0) { const c = Math.round(255 * k); mode = TM.ADD; color = (c << 16) | (c << 8) | c; }
      else { mode = null; }
      if (mode === null) { fillReq = false; }
    }
    if (!mode && now < this.clangUntil) { mode = TM.FILL; color = DEF_COL.armour; }          // armour clang (R5 2a)
    if (!mode) {
      if (frozen) { mode = TM.MULTIPLY; color = COL.frostTint; }
      else if (hot >= 0) { mode = TM.ADD; color = hot; }
      else if (invuln) { mode = TM.MULTIPLY; color = COL.invuln; }
      else if (e.status && e.status.chillStacks > 0) { mode = TM.MULTIPLY; color = e.status.chillStacks >= 2 ? COL.chill2 : COL.chill1; }
      else { mode = TM.MULTIPLY; color = 0xffffff; }
    }
    if (mode !== this.tintM || color !== this.tintC) {
      this.sprite.setTint(color).setTintMode(mode);
      this.tintM = mode; this.tintC = color;
    }
    void L;
  }

  // ------------------------------------------------------------------ overlays
  _handGlow(e, p, ai, now, muzzle) {
    const L = this.L, anc = e.anchor, b = this.base;
    const hx = Math.round(e.x + anc.hand[0] * this.facing), hy = Math.round(e.feetY + anc.hand[1] - (e.flying ? FLYER_HOVER_PX : 0));
    const el = (ai.atk && ai.atk.projectile && ai.atk.projectile.element) || 'arcane';
    const col = EL_HUE[el] || COL.rim;
    let r = 1 + Math.round(3 * clamp(p, 0, 1));
    if (!muzzle && !ai.locked && !L.reduced) r += (Math.floor(now / 62.5) % 2) ? 1 : 0;              // 8 Hz pulse
    const white = muzzle || (ai.locked && L.ctx.time.step === ai.lockStep);
    this._glowDisc(hx, hy, muzzle ? 5 : r, white ? 0xffffff : col, muzzle ? 0.9 : 0.8);
    if (e.id === 'frost_mage' && !muzzle) {                                                           // 3 frost motes orbit the glow
      const g = L.glowG; g.fillStyle(EL_HUE.frost, 0.9);
      for (let i = 0; i < 3; i++) { const a = now / 200 + (i * TAU) / 3; g.fillRect(Math.round(hx + Math.cos(a) * 5), Math.round(hy + Math.sin(a) * 3), 1, 1); }
    }
  }
  _glowDisc(x, y, r, color, alpha) { this.L.glowG.fillStyle(color, alpha).fillCircle(Math.round(x), Math.round(y), r); }
  _glowRing(x, y, r, color, alpha) { this.L.glowG.lineStyle(1, color, alpha).strokeCircle(Math.round(x), Math.round(y), r); }

  /** Spiral spin-up motes (telegraphs §2.4): actual first-shot angles, ω(p) = ω_fire·Quad.easeIn(p), closed form. */
  _spiralMotes(e, ai, p) {
    const atk = ai.atk, g = this.L.glowG;
    const col = EL_HUE[(atk.projectile && atk.projectile.element) || 'arcane'] || COL.rim;
    const wFire = atk.rotateDegPerShot / atk.intervalMs;                        // deg / ms
    let ang;
    let size = 3;
    if (ai.state === 'windup') ang = ai.base - (wFire * ai.wTotal * (1 - p * p * p)) / 3;
    else {
      ang = ai.base + wFire * ai.actT;
      const total = atk.shotsPerArm * atk.intervalMs;
      if (total - ai.actT < 200) size = Math.max(1, Math.round(3 - 2 * clamp(1 - (total - ai.actT) / 200, 0, 1)));
    }
    const r = e.r + 8;
    g.fillStyle(col, 0.9);
    for (let i = 0; i < atk.arms; i++) {
      const a = (ang + (360 * i) / atk.arms) * DEG;
      g.fillRect(Math.round(e.x + Math.cos(a) * r - size / 2), Math.round(e.y + Math.sin(a) * r - size / 2), size, size);
    }
  }

  /** Boss cast glyph (fx.cast_glyph fallback): hostile rune ring at core, rotating. */
  _castGlyph(e, now, p) {
    const L = this.L;
    if (L.art.glyph) {       // fx_cast_glyph: 16 f @ 20 fps loop, ADD, hostile token, at core
      L.spr('fx.cast_glyph', Math.floor((now * 20) / 1000), e.x, e.y, DEPTH.projectilesAdd, true, COL.rim, 0.5 + 0.5 * clamp(p, 0, 1), 0, 0.5);
      return;
    }
    const g = L.overlayG, x = Math.round(e.x), y = Math.round(e.y);
    const r = 6, a0 = now / 300;
    g.fillStyle(COL.rimDark, 0.8);
    g.fillStyle(COL.rim, 0.5 + 0.5 * clamp(p, 0, 1));
    for (let i = 0; i < 12; i++) { if (i % 3 === 2) continue; const a = a0 + (i * TAU) / 12; g.fillRect(Math.round(x + Math.cos(a) * r), Math.round(y + Math.sin(a) * r), 1, 1); }
    for (let i = 0; i < 4; i++) { const a = -a0 + (i * TAU) / 4; g.fillRect(Math.round(x + Math.cos(a) * 3), Math.round(y + Math.sin(a) * 3), 1, 1); }
  }

  /**
   * Spawn portal at the feet: fx_spawn_portal_open (f0–3 @ 14 fps, loop) until spawnPortalMs − spawnEmergeMs,
   * then fx_spawn_portal_close (f4–9 @ 14 fps, once; may finish after the enemy is live). Graphics fallback.
   */
  _portal(e, now) {
    const L = this.L, t = now - e.spawnMs, portalMs = e.portalMs ?? L.sys.rules.enemies.spawnPortalMs, em = portalMs - L.t.emergeMs;
    const x = Math.round(e.x), feetY = Math.round(e.feetY);
    if (L.art.portal) {
      const closeF = Math.floor(((t - em) * 14) / 1000);
      if (t >= em && closeF >= 6) { e.portalSpawn = false; return; }
      const f = t < em ? Math.floor((t * 14) / 1000) % 4 : 4 + closeF;
      L.spr('fx.spawn_portal', f, x, feetY - 4, DEPTH.shadows + 0.5, false, -1, 1, 0, 0.5);
      return;
    }
    if (t >= portalMs) { e.portalSpawn = false; return; }
    const g = L.groundG;
    const k = clamp(t / portalMs, 0, 1);
    const collapse = k > 0.8 ? 1 - (k - 0.8) / 0.2 : 1;
    const w = Math.round(16 * collapse), h = Math.max(2, Math.round(6 * collapse));
    L.ellipse(g, x, feetY, w, h, 0x1a0a14, 0.85);
    const a0 = t / 120;
    g.fillStyle(COL.portalHi, 0.95);
    for (let i = 0; i < 10; i++) {
      if (i % 3 === 2) continue;
      const a = a0 + (i * TAU) / 10;
      g.fillRect(Math.round(x + (Math.cos(a) * w) / 2), Math.round(feetY + (Math.sin(a) * h) / 2), 1, 1);
    }
    if (k > 0.85) { g.fillStyle(0xfdf7ed, 1 - (k - 0.85) / 0.15); g.fillRect(x - 1, feetY - 3, 1, 1).fillRect(x + 2, feetY - 5, 1, 1); }
  }

  _status(e, x, spriteY, now) {
    const L = this.L, g = L.overlayG, st = e.status, anc = e.anchor, b = this.base;
    if (!st) return;
    const hx = x, hy = Math.round(spriteY + anc.head - 2), cy = Math.round(spriteY + anc.core);
    // frozen: ice shell over the lower 16 px
    if (st.frozenMs > 0 && L.art.frozen) {                        // status.frozen.overlay (ice shell, α 0.7, lower 16 px)
      L.spr('status.frozen.overlay', 0, x, Math.round(spriteY), DEPTH.actors + e.feetY / 10000 + 0.0002, false, -1, 0.7, 0, 1);
    } else if (st.frozenMs > 0) {
      const w = 16, h = Math.min(16, Math.round(-anc.core * 2 + 4));
      g.fillStyle(COL.frostTint, 0.35).fillRect(x - w / 2, Math.round(spriteY) - h, w, h);
      g.lineStyle(1, 0xcae6f5, 0.9).strokeRect(x - w / 2 + 0.5, Math.round(spriteY) - h + 0.5, w - 1, h - 1);
      g.fillStyle(0xffffff, 0.8).fillRect(x - 5, Math.round(spriteY) - h + 2, 1, 3).fillRect(x - 4, Math.round(spriteY) - h + 2, 2, 1);
    }
    let lx = hx - 5;
    // chill: 1–2 pips (3rd stack = the frozen shell instead)
    if (st.chillStacks > 0 && st.frozenMs <= 0) {
      for (let i = 0; i < Math.min(2, st.chillStacks); i++) {
        g.fillStyle(COL.rimDark, 1).fillRect(lx - 1, hy - 1, 4, 4); g.fillStyle(0xcae6f5, 1).fillRect(lx, hy, 2, 2); lx += 4;
      }
    }
    // burn: 2 flame pips flickering at 10 fps
    const od = DEPTH.actors + 0.9;
    if (st.burnMs > 0 && L.art.burn) {                            // status_burn: 2 f @ 10 fps at head
      L.spr('status.burn.overlay', Math.floor((now * 10) / 1000), st.poisonStacks > 0 ? hx - 4 : hx, hy - 4, od, false, -1, 1, 0, 0.5);
    } else if (st.burnMs > 0) {
      const f = Math.floor(now / 100) % 2;
      for (let i = 0; i < 2; i++) {
        const fx = hx - 1 + i * 3, h = (i + f) % 2 ? 3 : 2;
        g.fillStyle(0xee8e2e, 1).fillRect(fx, hy - h, 2, h);
        g.fillStyle(0xfacb3e, 1).fillRect(fx, hy - h - 1, 1, 1);
      }
    }
    // poison: drip + numeral for ≥ 2 stacks
    if (st.poisonStacks > 0) {
      const px = hx + (L.art.poison ? 6 : 5), dy = Math.floor(now / 250) % 3;
      if (L.art.poison) L.spr('status.poison.overlay', Math.floor((now * 4) / 1000), px, hy - 2, od, false, -1, 1, 0, 0.5);   // status_poison: 2 f @ 4 fps
      else {
        g.fillStyle(COL.rimDark, 1).fillRect(px - 1, hy - 1, 3, 4);
        g.fillStyle(0x97da3f, 1).fillRect(px, hy, 1, 2).fillRect(px, hy + 2 + dy, 1, 1);
      }
      if (st.poisonStacks >= 2) L.digit(g, px + (L.art.poison ? 6 : 3), hy - 2, Math.min(9, st.poisonStacks), 0x97da3f);
    }
    // shock / vulnerable: 3 yellow sparks orbiting core; "!" above the head
    if ((st.stunMs > 0 || st.vulnerableMs > 0) && L.art.shocked) {   // status_shocked: 6 f @ 15 fps at core
      L.spr('status.shocked.overlay', Math.floor((now * 15) / 1000), x, cy, od, false, -1, 1, 0, 0.5);
    } else if (st.stunMs > 0 || st.vulnerableMs > 0) {
      g.fillStyle(0xfacb3e, 1);
      for (let i = 0; i < 3; i++) { const a = now / 64 + (i * TAU) / 3; g.fillRect(Math.round(x + Math.cos(a) * (e.r + 2)), Math.round(cy + Math.sin(a) * 3), 1, 1); }
    }
    if (st.vulnerableMs > 0) {
      const vy = hy - 8;
      g.fillStyle(COL.rimDark, 1).fillRect(hx - 1, vy - 1, 3, 7);
      g.fillStyle(0xfacb3e, 1).fillRect(hx, vy, 1, 3).fillRect(hx, vy + 4, 1, 1);
    }
    // dizzy stars (charge wall-stun)
    if (e.ai.state === 'stunned' && e.ai.stunKind === 'wall') {
      const T = L.t.dizzyMs;
      g.fillStyle(0xfacb3e, 1);
      for (let i = 0; i < 3; i++) {
        const a = (now / T) * TAU + (i * TAU) / 3;
        const sx = Math.round(hx + Math.cos(a) * 6), sy = Math.round(hy + 2 + Math.sin(a) * 2);
        g.fillRect(sx, sy, 1, 1).fillRect(sx - 1, sy, 3, 1).fillRect(sx, sy - 1, 1, 3);
      }
    }
  }

  /** Knight blade / Lich staff overlays (state-graph §3.1 G2, telegraphs §2.1/§2.2/§2.8/§2.9). */
  _weapon(e, x, spriteY, st, type, now) {
    const w = this.weapon, ai = e.ai, anc = e.anchor, b = this.base, f = this.facing;
    if (this.weaponGone) { w.setVisible(false); return; }
    const hx = x + anc.hand[0] * f, hy = spriteY + anc.hand[1];
    let point = f > 0 ? -60 * DEG : -120 * DEG;              // rest: up-forward
    let dy = 0;
    const kOpen = st === 'windup' ? clamp(ai.wElapsed / this.L.t.openingMs, 0, 1) : 0;
    const aim = ai.aim;
    if (this.weaponKind === 'blade') {
      if (st === 'windup' && type === 'melee_swipe') {
        const lockAt = ai.wTotal - this.L.sys.lockMs;
        const ps = clamp((ai.wElapsed - this.L.t.openingMs) / Math.max(1, lockAt - this.L.t.openingMs), 0, 1);
        point = aim - f * (40 + 110 * quadOut(ps)) * DEG;
      } else if (st === 'act' && type === 'melee_swipe') {
        const k = clamp((now - this.stateAt) / (3 * STEP_MS), 0, 1), arc = (ai.atk.arcDeg || 140) * DEG;
        point = aim - f * 150 * DEG * (1 - k) + f * (arc / 2) * k;           // 3-step smear through the arc
      } else if (st === 'windup' && type === 'shoot') point = aim - f * 120 * DEG * kOpen;
      else if (st === 'act' && type === 'shoot') point = aim;
      else if ((st === 'windup' || st === 'act') && type === 'summon') point = 90 * DEG * kOpen + point * (1 - kOpen);   // planted
      else if (st === 'recover' && ai.atk && ai.atk.type === 'melee_swipe') point = f > 0 ? 60 * DEG : 120 * DEG;         // "open" pose
    } else {
      if ((st === 'windup' || st === 'act') && type === 'shoot') { point = -90 * DEG; dy = -Math.round(6 * (st === 'act' ? 1 : kOpen)); }   // raised overhead
      else if ((st === 'windup' || st === 'act') && type === 'hazard') point = 90 * DEG;                                                   // planted
      else point = -90 * DEG;
    }
    w.setPosition(Math.round(hx), Math.round(hy + dy)).setRotation(point + Math.PI / 2).setDepth(this.sprite.depth + 0.00001)
      .setVisible(this.sprite.visible).setAlpha(this.sprite.alpha);
  }

  // ------------------------------------------------------------------ deaths (visual-only `dying`, telegraphs §4)
  _renderDying(now, dtNow) {
    const e = this.e, L = this.L, spr = this.sprite, t = L.t, fx = L.ctx.fx, anc = e.anchor, b = this.base;
    if (this.outline && this.outline.visible) this.outline.setVisible(false);     // the overlay falls with the corpse
    const k = now - this.dieAt;
    const rng = L.sys.fxRng;
    if (k < 0) return;                                          // staggered chain/cleanup deaths wait (sim-dead already)
    const fx0 = Math.round(this.sx), fy0 = Math.round(this.sy);
    const kind = this.deathKind;
    if (!this.puffed) {
      this.puffed = true;
      const hue = FAMILY_HUE[e.actor.family] || 0x8a7a70;
      const n = Math.round((kind === 'golem' ? 12 : t.puff) * (e.elite ? 1.5 : 1));
      const cy = fy0 + anc.core;
      if (kind !== 'boss' && kind !== 'imp') { fx.particles('dust', fx0, cy, n >> 1, { speed: 35 }); fx.particles('spark', fx0, cy, n - (n >> 1), { color: hue, speed: 45 }); }
      if (e.elite) fx.particles('shard', fx0, cy, 6, { color: COL.eliteGold, speed: 70 });
      if (kind === 'wraith') fx.particles('mote', fx0, cy, 8, { color: 0xcfd8e8, speed: 12, gravity: -30, lifeMs: 600 });
      if (e.killCause === 'summoner' && e.soulTo) { const dx = e.soulX - fx0, dy = e.soulY - cy; fx.particles('soul', fx0, cy, 1, { color: 0x8b7cf0, speed: Math.hypot(dx, dy) * 5, dir: Math.atan2(dy, dx), spread: 0.01, lifeMs: 200, gravity: 0 }); }
      if (kind === 'imp') fx.particles('ember', fx0, cy, 6, { color: 0xee8e2e, speed: 50 });
      if (kind === 'slime') this.gooAt = now;
    }
    // residual knockback slide (decays at knockbackDecay)
    const decay = (L.sys.knockDecay * dtNow) / 1000, sp = Math.hypot(this.slideVx, this.slideVy);
    if (sp > 0) { const ns = Math.max(0, sp - decay); this.slideVx *= ns / sp; this.slideVy *= ns / sp; this.sx += (this.slideVx * dtNow) / 1000; this.sy += (this.slideVy * dtNow) / 1000; }
    let sx = 1, sy = 1, oy = 0, ox = 0, alpha = e.actor.alpha ?? 1, fill = false, corpse = false, visible = true, end = 0;
    const flashHold = 2 * STEP_MS;
    switch (kind) {
      case 'imp': fill = k < STEP_MS; visible = k < STEP_MS; end = STEP_MS; break;
      case 'slime':
        if (k < 83) { sx = 1.25; sy = 0.75; fill = k < flashHold; } else visible = false;
        end = 83 + t.fadeMs;
        L.ellipse(L.groundG, fx0, fy0, 14, 5, 0x4f9a3a, 0.6 * clamp(1 - (k - 83) / t.fadeMs, 0, 1));   // goo splat
        break;
      case 'wraith': alpha *= 1 - Math.floor(clamp(k / 300, 0, 1) * 4) / 4; oy = -Math.round(4 * clamp(k / 300, 0, 1)); end = 300; break;
      case 'boss': {
        const d = L.sys.boss.deathOf(e);
        const reduced = L.reduced;
        if (d) {
          if (!d.final) {
            if (!reduced) ox = (Math.floor((k * t.stunHz * 2) / 1000) % 2) ? 1 : -1;
            fill = k < STEP_MS || (!reduced && d.strobeStep === L.ctx.time.step);
          } else alpha = 1 - Math.floor(clamp((d.t - d.finalAt) / 300, 0, 1) * 4) / 4;
          if (this.weapon && !this.weaponGone && d.t > 100) {
            this.weaponGone = true;
            const wx = this.weapon.x, wy = this.weapon.y;
            if (this.weaponKind === 'staff') fx.particles('shard', wx, wy - 8, 8, { color: 0x8b7cf0, speed: 60 });
            else fx.particles('spark', wx, wy, 4, { color: 0xd6dde6, speed: 30 });
            this.weapon.setVisible(false);
          }
          end = Infinity;
        } else { visible = false; end = 0; }
        break;
      }
      case 'flyer': {
        fill = k < flashHold;
        const fall = 150;
        if (k < fall) oy = -Math.round(FLYER_HOVER_PX * (1 - quadIn(k / fall)));
        else if (k < fall + STEP_MS) oy = -1;
        const c0 = fall + STEP_MS;
        if (k >= c0) corpse = true;
        const ck = clamp((k - c0) / t.collapseMs, 0, 1);
        sy = 1 - 0.125 * Math.min(4, Math.floor(ck * 4) + (ck > 0 ? 1 : 0)) * (k >= c0 ? 1 : 0);
        if (k >= c0 + t.collapseMs) alpha *= 1 - quadIn(clamp((k - c0 - t.collapseMs) / t.fadeMs, 0, 1));
        end = c0 + t.collapseMs + t.fadeMs;
        break;
      }
      default: {                                                // ground, golem
        fill = k < flashHold;
        if (kind === 'golem' && k >= flashHold && k < flashHold + 2 * STEP_MS) oy = 1;
        if (k >= flashHold) corpse = true;
        const ck = clamp((k - flashHold) / t.collapseMs, 0, 1);
        if (k >= flashHold) sy = 1 - 0.125 * Math.min(4, 1 + Math.floor(ck * 3.999));     // 0.875 0.75 0.625 0.5
        if (k >= flashHold + t.collapseMs) alpha *= 1 - quadIn(clamp((k - flashHold - t.collapseMs) / t.fadeMs, 0, 1));
        end = flashHold + t.collapseMs + t.fadeMs;
      }
    }
    if (e.elite) {                                               // ground ring collapses to 0 width over corpseCollapseMs
      const rk = clamp(1 - k / t.collapseMs, 0, 1);
      if (rk > 0) L.ellipse(L.groundG, fx0, fy0, Math.round(anc.ring[0] * rk), anc.ring[1], COL.eliteGold, 0.5);
    }
    if (visible && alpha > 0) L.ellipse(L.groundG, fx0, fy0, anc.shadow[0], anc.shadow[1], 0x000000, 0.35 * alpha);
    const hover = e.flying && kind !== 'flyer' ? FLYER_HOVER_PX : 0;
    spr.setPosition(fx0 + ox, fy0 - hover + oy).setScale(b * (this.xOnly ? 1 : q8(sx)) * (this.xOnly && sx !== 1 ? sx : 1), b * (this.xOnly ? 1 : q8(sy)));
    if (this.xOnly) spr.setScale(b * q8(sx), b * (kind === 'boss' ? 1 : q8(sy)));
    spr.setAlpha(clamp(alpha, 0, 1)).setVisible(visible && alpha > 0);
    if (fill) this._tint(now, false, -1, true, false, e);
    else if (corpse) { if (this.tintM !== TM.MULTIPLY || this.tintC !== COL.corpse) { spr.setTint(COL.corpse).setTintMode(TM.MULTIPLY); this.tintM = TM.MULTIPLY; this.tintC = COL.corpse; } }
    else this._tint(now, false, -1, false, false, e);
    if (this.weapon && !this.weaponGone) this.weapon.setPosition(this.weapon.x, this.weapon.y).setVisible(visible);
    if (k >= end) this.done = true;
    void rng;
  }

  release() {
    const e = this.e;
    this.sprite.setVisible(false).setActive(false);
    if (this.weapon) this.weapon.setVisible(false);
    if (this.outline) this.outline.setVisible(false);
    if (e) { e.view = null; }
    this.e = null;
    this.done = false; this.dying = false;
    this.L.free.push(this);
  }

  destroy() { this.sprite.destroy(); if (this.weapon) this.weapon.destroy(); if (this.outline) this.outline.destroy(); }
}
