// sim/Defences.js — mechanic-spec §9.6 defences (v2): shield · armour · ward, driven by the §9.7 keywords
// each damage instance carries (pierce breaks shields, blast tears armour, shock strips wards). Every
// defence also erodes WITHOUT its keyword, so nothing is unkillable ("the right keyword makes it fast;
// anything makes it possible"). Numbers: rules.defences (+ the spec on the enemy / affix / attack / boss).
//
// Runtime state lives on the enemy (cross-slice contract 1):
//   e.defence      null | { type:'shield', wearBlocks, blocks, temp, untilMs }
//                        | { type:'armour', points, max }
//                        | { type:'ward',   hits, max }
//   e.defenceBase  the spec the defence was built from (regrow: warded elites, boss phase onEnter.regrowDefence)
//   e.defenceStash a permanent defence held aside while a temporary `guard` shield is up
// Combat owns the pipeline and calls pre() (shield/ward: block the whole instance?), armourSoak() (the bar
// soaks first; overflow carries into HP at full value) and dot() (status ticks). Every read emits
// EV.DEFENCE {uid, id, defence, result, keyword, x, y, boss, dot} — FX (EnemyView), cues (mixer, throttled
// by the cue-spec rate group), the first-block tip (Ftue), haptics (Rumble) and run.stats.defencesBroken.
// Pure sim: no Phaser import; views are reached only through e.view.defenceEvent(kind) (R2: views mirror).

import { EV } from '../core/ev.js';
import { track } from '../core/log.js';

const DEG = Math.PI / 180;
const TAU = Math.PI * 2;
const angDiff = (a, b) => { let d = (a - b) % TAU; if (d > Math.PI) d -= TAU; else if (d <= -Math.PI) d += TAU; return d; };

/** Result codes of pre(): the instance passes (maybe after breaking the defence) or is swallowed whole. */
export const PASS = 0, BLOCKED = 1;

export class Defences {
  constructor(ctx) {
    this.ctx = ctx;
    this.kw = { pierce: false, blast: false, shock: false };     // scratch (no per-hit allocation)
  }
  get R() { return this.ctx.rules.defences; }

  // ------------------------------------------------------------------ building
  /**
   * Runtime defence from a data spec. o.hpMult scales armour points (enemies: floor hpMult per
   * rules.defences.armour.pointsScaleWithFloorHp; bosses/minis: absolute). o.maxHp feeds pointsFracOfHp (affix).
   */
  make(spec, o = {}) {
    if (!spec || !spec.type) return null;
    const R = this.R;
    switch (spec.type) {
      case 'shield': return { type: 'shield', wearBlocks: Math.max(1, spec.wearBlocks ?? R.shield.wearBlocks), blocks: 0, temp: false, untilMs: 0 };
      case 'armour': {
        let pts = spec.points != null ? spec.points * (R.armour.pointsScaleWithFloorHp && o.hpMult ? o.hpMult : 1)
          : (spec.pointsFracOfHp || 0) * (o.maxHp || 0);
        pts = Math.max(1, pts);
        return { type: 'armour', points: pts, max: pts };
      }
      case 'ward': { const h = Math.max(1, Math.round(spec.hits ?? R.ward.hits)); return { type: 'ward', hits: h, max: h }; }
      default: return null;
    }
  }

  /** Give `e` a defence (spawn / affix / boss init). kind → the view's region entry ('spawn' | 'grant' | 'regrow'). */
  set(e, spec, o = {}, kind = 'spawn') {
    const d = this.make(spec, o);
    e.defence = d;
    if (d && !o.noBase) e.defenceBase = { spec, hpMult: o.hpMult, maxHp: o.maxHp, regrowMs: o.regrowMs || 0 };
    e.defenceRegrowMs = 0;
    if (d && e.view && e.view.defenceEvent) e.view.defenceEvent(kind);
    return d;
  }

  /** True when e's shield front arc faces the point (x, y) (AutoAim: feel-spec touch-aim "not fully shielded from the player's side"). */
  shieldFaces(e, x, y) {
    const d = e.defence;
    if (!d || d.type !== 'shield') return false;
    const half = (this.R.shield.frontArcDeg * DEG) / 2;
    return Math.abs(angDiff(Math.atan2(y - e.y, x - e.x), this.facing(e))) <= half;
  }

  /** Facing for the front arc: toward the player while moving / winding up; the committed aim while acting. */
  facing(e) {
    const ai = e.ai, st = ai.state;
    if (st === 'windup' || st === 'act' || st === 'recover' || (st === 'stunned' && ai.stunKind === 'wall')) return ai.aim;
    const p = this.ctx.player;
    return Math.atan2(p.coreY - e.y, p.coreX - e.x);
  }

  /**
   * §9.7 keywords of one damage instance, derived at hit time from what the shot actually does.
   * o: { source, element, pierce (direct shot with composed pierce ≥ 1, or boomerang/orbit), blast }
   */
  keywords(o) {
    const k = this.kw, src = o.source;
    k.pierce = src === 'direct' && !!o.pierce;
    k.blast = !!o.blast || src === 'explode';
    k.shock = o.element === 'shock' || src === 'chain' || src === 'zap';
    return k;
  }

  // ------------------------------------------------------------------ the checks (Combat calls these)
  /**
   * Shield / ward check BEFORE damage, reactions and statuses: returns BLOCKED when the instance is
   * swallowed whole (0 damage, no status, no reaction, no knockback), PASS otherwise (the defence may
   * have broken on the way — the breaking pierce / shock hit lands at full value on the same step).
   */
  pre(e, o, kw) {
    const d = e.defence;
    if (!d || d.type === 'armour') return PASS;
    const x = o.x ?? e.x, y = o.y ?? e.y;
    if (d.type === 'shield') {
      const p = this.ctx.player;
      const fx = o.fromX ?? p.coreX, fy = o.fromY ?? p.coreY;
      let dx = fx - e.x, dy = fy - e.y;
      if (dx * dx + dy * dy < 4) { dx = p.coreX - e.x; dy = p.coreY - e.y; }          // source at the centre → the shooter's side
      const half = (this.R.shield.frontArcDeg * DEG) / 2;
      if (Math.abs(angDiff(Math.atan2(dy, dx), this.facing(e))) > half) return PASS;   // flank / behind: lands normally
      if (kw.pierce) { this._break(e, 'pierce', x, y); return PASS; }                  // pierce shatters it, the hit lands
      d.blocks++;
      if (d.blocks >= d.wearBlocks) { this._break(e, null, x, y); return BLOCKED; }     // worn out: this block is the last
      const wb = d.wearBlocks, s1 = Math.ceil(wb / 3), s2 = Math.ceil((2 * wb) / 3);
      const wear = d.blocks === s1 || d.blocks === s2;
      this._emit(e, wear ? 'wear' : 'blocked', null, x, y, false);
      if (e.view && e.view.defenceEvent) e.view.defenceEvent(wear ? 'wear' : 'block', o);
      return BLOCKED;
    }
    // ward: shock strips the whole ward and lands; anything else spends one charge
    if (kw.shock) { this._break(e, 'shock', x, y); return PASS; }
    d.hits--;
    if (d.hits <= 0) { this._break(e, null, x, y); return BLOCKED; }
    this._emit(e, 'absorbed', null, x, y, false);
    if (e.view && e.view.defenceEvent) e.view.defenceEvent('absorb', o);
    return BLOCKED;
  }

  /** Armour bar: soaks first with the keyword multiplier; returns the HP damage (overflow at full value). */
  armourSoak(e, dmg, o, kw, dot = false) {
    const d = e.defence;
    if (!d || d.type !== 'armour' || !(dmg > 0)) return dmg;
    const A = this.R.armour;
    const mult = kw.blast ? A.blastMult : dot ? A.dotMult : o.source === 'direct' ? A.directMult : A.otherMult;
    const eff = dmg * mult;
    const soak = Math.min(d.points, eff);
    d.points -= soak;
    const hp = mult > 0 ? Math.max(0, dmg - soak / mult) : 0;
    const x = o.x ?? e.x, y = o.y ?? e.y;
    if (d.points <= 1e-6) { this._break(e, kw.blast ? 'blast' : null, x, y); return hp; }
    this._emit(e, 'reduced', kw.blast ? 'blast' : null, x, y, dot, soak);
    if (!dot && e.view && e.view.defenceEvent) e.view.defenceEvent(kw.blast ? 'reduce-blast' : 'reduce', o);
    return hp;
  }

  /** Status tick vs a defence: wards swallow it without spending a charge (silent), armour soaks × dotMult. */
  dot(e, dmg) {
    const d = e.defence;
    if (!d) return dmg;
    if (d.type === 'ward') return this.R.ward.blocksDot ? 0 : dmg;
    if (d.type === 'armour') { const k = this.kw; k.pierce = false; k.blast = false; k.shock = false; return this.armourSoak(e, dmg, { source: 'status' }, k, true); }
    return dmg;
  }

  _break(e, keyword, x, y) {
    const d = e.defence;
    const type = d.type;
    const wasTemp = d.type === 'shield' && d.temp;
    e.defence = wasTemp && e.defenceStash ? e.defenceStash : null;
    e.defenceStash = null;
    if (wasTemp) e.guardBroken = true;
    // warded elites regrow their ward after eliteRegrowMs (affix regrowMs); nothing else regrows on its own
    const base = e.defenceBase;
    e.defenceRegrowMs = type === 'ward' && base && base.regrowMs > 0 && !e.defence ? base.regrowMs : 0;
    const run = this.ctx.run;
    run.stats.defencesBroken = (run.stats.defencesBroken || 0) + 1;
    this._emit(e, 'break', keyword, x, y, false, 0, type);
    if (e.view && e.view.defenceEvent) e.view.defenceEvent(type === 'ward' ? (keyword ? 'strip' : 'empty') : 'break', { x, y, type });
    track('defence_break', { enemy: e.id, type, keyword });
  }

  _emit(e, result, keyword, x, y, dot, amount = 0, type) {
    this.ctx.bus.emit(EV.DEFENCE, { uid: e.uid, id: e.id, defence: type || (e.defence && e.defence.type), result, keyword, x, y, boss: !!e.isBoss, dot: !!dot, amount });
    if (dot) return;                                       // swallowed/soaked ticks show nothing (no spam)
    const headY = e.y - (e.headOffset ?? (e.r + 8));
    const def = type || (e.defence && e.defence.type);
    const word = result === 'break' ? (keyword ? 'broken' : def === 'ward' ? 'warded' : def === 'armour' ? 'armoured' : 'blocked')
      : result === 'reduced' ? 'armoured' : result === 'absorbed' ? 'warded' : 'blocked';
    this.ctx.bus.emit(EV.DAMAGE_NUMBER, { id: e.uid, x: e.x, y: headY, amount: 0, crit: false, element: null, target: 'enemy', word, defence: def });
  }

  // ------------------------------------------------------------------ attacks & bosses
  /** `guard` attack: raise a temporary shield for ms (same break/wear rules); a permanent defence waits aside. */
  guard(e, spec, ms) {
    if (e.defence && !(e.defence.type === 'shield' && e.defence.temp)) e.defenceStash = e.defence;
    const d = this.make(spec && spec.type ? spec : { type: 'shield' });
    if (!d) return;
    d.temp = true; d.untilMs = this.ctx.time.ms + ms;
    e.defence = d; e.guardBroken = false;
    if (e.view && e.view.defenceEvent) e.view.defenceEvent('guard-start');
  }
  /** Guard over (timer / attack end / phase abort): drop the temporary shield, restore the stashed defence. */
  endGuard(e) {
    const d = e.defence;
    if (!d || d.type !== 'shield' || !d.temp) return;
    e.defence = e.defenceStash || null; e.defenceStash = null;
    if (e.view && e.view.defenceEvent) e.view.defenceEvent('guard-end');
  }

  /** `ward_allies` grant: a ward of `hits` (the view plays the tether arrival). */
  grantWard(e, hits) {
    const d = this.make({ type: 'ward', hits });
    e.defence = d;
    if (e.view && e.view.defenceEvent) e.view.defenceEvent('grant');
    return d;
  }

  /** Boss/mini phase onEnter.regrowDefence: restore that fraction of the boss's own (post-adapt) defence. */
  regrow(e, frac) {
    const base = e.defenceBase;
    if (!base || !(frac > 0)) return;
    const full = this.make(base.spec, base);
    if (!full) return;
    const d = e.defence && e.defence.type === full.type ? e.defence : null;
    if (full.type === 'shield') e.defence = full;                                                   // a fresh plate
    else if (full.type === 'armour') { const cur = d ? d.points : 0; full.points = Math.min(full.max, cur + full.max * frac); e.defence = full; }
    else { const cur = d ? d.hits : 0; full.hits = Math.max(1, Math.min(full.max, cur + Math.round(full.max * frac))); e.defence = full; }
    e.defenceStash = null;
    if (e.view && e.view.defenceEvent) e.view.defenceEvent('regrow');
  }

  /** Per sim step (EnemySystem): guard timers and warded-elite regrowth. */
  stepEnemy(e, dt) {
    const d = e.defence;
    if (d && d.type === 'shield' && d.temp && this.ctx.time.ms >= d.untilMs) this.endGuard(e);
    if (!e.defence && e.defenceRegrowMs > 0) {
      e.defenceRegrowMs -= dt;
      if (e.defenceRegrowMs <= 0) {
        e.defenceRegrowMs = 0;
        const b = e.defenceBase;
        e.defence = this.make(b.spec, b);
        if (e.defence && e.view && e.view.defenceEvent) e.view.defenceEvent('regrow');
        this.ctx.mixer && this.ctx.mixer.fire('ward_raise', { x: e.x });
      }
    }
  }
}
