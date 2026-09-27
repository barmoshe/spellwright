// sim/Relics.js — mechanic-spec §7 relic vocabulary. Passive types are folded into RunState modifiers
// (shot_stat, player_stat, status_rule, effect_param, economy: run/RunState._recomputeMods). This module
// registers every type and action key once (architecture §6) and runs the `on_event` relics:
//   events: kill · hurt · lethal · room_enter · room_clear · dash_start · wand_recharge · crit
//   filter {status: burn|frozen|poison|shocked|chilled} | {elite: true} · every: N (deterministic counter) · once
//   actions: heal · mana · explode · spawn_spell · shield · revive · coins

//
// v2 (mechanic-spec §7.1): `condition` / `scaling` entries and every `rule` are folded by run/RunState
// (_recomputeMods + refreshLive — the single application point). This module adds the rule hooks that need the
// sim: clean-room counting (room_enter / room_clear), cast_toll, free_cast_after_full_recharge, payload_repeat
// (Caster calls the helpers below), melt_boost splash / overload_chain / blight_spread (EV.REACTION), and
// self_blast (EV.FX_EXPLOSION of the player's own blasts).

import { defineEffect, getEffect } from '../effects/registry.js';
import { EV } from '../core/ev.js';
import { listen } from '../core/events.js';
import { warnOnce } from '../core/log.js';
import { spawnRelicSpell } from './Effects.js';

for (const t of ['shot_stat', 'player_stat', 'status_rule', 'effect_param', 'economy']) defineEffect('relic', t, { passive: true });
defineEffect('relic', 'on_event', { passive: false });
// `rule` relics: one entry per rule id below; RunState merges them into run.relicRules (mechanic-spec §7.1).
export const RULES = Object.freeze(['modifier_mana_zero', 'payload_repeat', 'wrap_no_recharge', 'free_cast_after_full_recharge', 'melt_boost',
  'overload_chain', 'blight_spread', 'spells_per_cast_add', 'cast_toll', 'self_blast']);
defineEffect('relic', 'rule', { passive: true, rules: RULES });

defineEffect('action', 'heal', { run(ctx, a) { ctx.run.heal(a.amount); } });
defineEffect('action', 'coins', { run(ctx, a, ev) { ctx.pickups.coin(ev.x ?? ctx.player.x, ev.y ?? ctx.player.y, a.amount); } });
defineEffect('action', 'mana', {
  run(ctx, a, ev) {
    const i = ev.wandIndex ?? ctx.run.activeWand;
    const w = ctx.run.wands[i]; if (!w) return;
    w.state.mana = Math.min(ctx.run.manaMax(i), w.state.mana + a.amount);
  },
});
defineEffect('action', 'explode', {
  // absolute damage × floor hpMult; rolls status at statusChance 1.0 for its element; no knockback
  run(ctx, a, ev) {
    const x = ev.x ?? ctx.player.x, y = ev.y ?? ctx.player.y;
    ctx.combat.explodeAt(x, y, a.radius, a.damage * ctx.floor.hpMult, { element: a.element, statusChance: 1, source: 'relic', noKnock: true });
  },
});
defineEffect('action', 'spawn_spell', { run(ctx, a, ev) { spawnRelicSpell(ctx, a.spellId, a.pattern, ev.x ?? ctx.player.coreX, ev.y ?? ctx.player.coreY); } });
defineEffect('action', 'shield', {
  run(ctx, a) { ctx.run.setShield(Math.min(ctx.rules.player.shieldMaxCharges, Math.max(ctx.run.shield, a.charges))); },
});
defineEffect('action', 'revive', { run(ctx, a) { ctx.run.setHp(Math.min(ctx.run.maxHp, a.hp)); } });

const STATUS_FILTER = { burn: 'burn', frozen: 'frozen', poison: 'poison', shocked: 'shocked', chilled: 'chilled' };

export class RelicSystem {
  constructor(ctx) {
    this.ctx = ctx;
    this.lastSelfBlastMs = -1e9;
    for (const r of ctx.cat.relicList) for (const e of r.effects) {
      if (e.type === 'rule' && !RULES.includes(e.rule)) warnOnce(`relic-rule:${e.rule}`, `relic rule "${e.rule}" (${r.id}) has no implementation`);
    }
    if (ctx.scene && ctx.bus) {
      listen(ctx.scene, ctx.bus, EV.REACTION, (ev) => this._onReaction(ev));
      listen(ctx.scene, ctx.bus, EV.FX_EXPLOSION, (ev) => this._onExplosion(ev));
    }
  }

  /** Relic id that owns a rule (for EV.RELIC_TRIGGERED / the S3r trigger count). */
  _ruleFired(rule) {
    const r = this.ctx.run.relicRules[rule];
    if (!r) return;
    const run = this.ctx.run;
    run.relicCounters[r.relicId] = (run.relicCounters[r.relicId] || 0) + 1;
    this.ctx.bus.emit(EV.RELIC_TRIGGERED, r.relicId);
  }

  // ---------------------------------------------------------------- rule hooks the Caster calls
  /** free_cast_after_full_recharge (Overflow Cell): a wand that finishes its recharge at full mana gets a free cast. */
  onWandRecharged(i) {
    const run = this.ctx.run;
    if (!run.relicRules.free_cast_after_full_recharge) return;
    const w = run.wands[i];
    run.freeCast[i] = !!w && w.state.mana >= run.manaMax(i) - 1e-6;
  }
  /** Refund the mana a free cast spent (the plan already fired with the wand's real skip rule). */
  applyFreeCast(i, plan) {
    const run = this.ctx.run;
    if (!run.freeCast[i]) return;
    run.freeCast[i] = false;
    if (!plan || plan.manaSpent <= 0) return;
    const w = run.wands[i];
    w.state.mana = Math.min(run.manaMax(i), w.state.mana + plan.manaSpent);
    this._ruleFired('free_cast_after_full_recharge');
  }
  /** payload_repeat (Echoing Payload): every payload list gains `count` echo copies at × damageMult (nested too). */
  echoPayloads(shots, fanDeg) {
    const r = this.ctx.run.relicRules.payload_repeat;
    if (!r) return;
    const walk = (list) => {
      for (const s of list) {
        if (!s.payload || !s.payload.length) continue;
        walk(s.payload);
        const base = s.payload.slice(), extra = [];
        for (let k = 1; k <= (r.count | 0); k++) {
          const off = (k % 2 ? 1 : -1) * Math.ceil(k / 2) * fanDeg;
          for (const p of base) extra.push(clonePayload(p, r.damageMult, off));
        }
        s.payload = base.concat(extra);
      }
    };
    walk(shots);
  }
  /** cast_toll (Blood Ink): every `every` casts lose `damage` HP; neverLethal keeps 1 HP. Not a hurt (no i-frames). */
  onCast() {
    const ctx = this.ctx, run = ctx.run, r = run.relicRules.cast_toll;
    if (!r || !r.every || run.stats.casts % r.every !== 0) return;
    const lost = run.toll(r.damage, !!r.neverLethal);
    if (lost <= 0) return;
    const p = ctx.player;
    ctx.bus.emit(EV.DAMAGE_NUMBER, { x: p.coreX, y: p.coreY - 14, amount: lost, crit: false, element: null, target: 'player' });
    ctx.bus.emit(EV.PLAYER_HURT, { damage: lost, source: { kind: 'toll' }, shieldBroke: false });
    ctx.mixer.fire('player_hurt');
    this._ruleFired('cast_toll');
  }

  // ---------------------------------------------------------------- reaction duos (EV.REACTION {name, x, y, damage?, stacks?})
  _onReaction(ev) {
    const ctx = this.ctx, run = ctx.run, R = run.relicRules;
    if (!ev || !ctx.enemies || !ctx.combat) return;
    const T = ctx.T;
    const isTarget = (e) => Math.abs(e.x - ev.x) < 0.5 && Math.abs(e.y - ev.y) < 0.5;
    if (ev.name === 'melt' && R.melt_boost && R.melt_boost.chillSplashRadius > 0) {
      ctx.enemies.queryCircle(ev.x, ev.y, R.melt_boost.chillSplashRadius, (e) => { if (!isTarget(e)) ctx.combat.applyStatus(e, 'chill'); });
      ctx.fx.ring(ev.x, ev.y, R.melt_boost.chillSplashRadius, { r0: 4, grow: true, ms: 180, color: 0xcae6f5, alpha: 0.5 });
      this._ruleFired('melt_boost');
    } else if (ev.name === 'overload' && R.overload_chain) {
      // arcs deal the Overload's damage (payload `damage` when Combat provides it; else the tunable fallback × floor HP)
      const dmg = ev.damage != null ? ev.damage : (R.overload_chain.fallbackDamage ?? 0) * ctx.floor.hpMult;   // designer: data, not a tunable
      const hit = new Set();
      let from = null;
      ctx.enemies.queryCircle(ev.x, ev.y, 1, (e) => { if (!from) from = e; });
      if (from) hit.add(from.uid);
      let fx = ev.x, fy = ev.y;
      for (let j = 0; j < (R.overload_chain.jumps | 0); j++) {
        const next = ctx.enemies.nearest(fx, fy, R.overload_chain.range, hit);
        if (!next) break;
        hit.add(next.uid);
        ctx.fx.bolt(fx, fy - 4, next.x, next.y - 4, { color: 0xfacb3e, ms: 120 });
        ctx.combat.hitEnemy(next, dmg, { element: null, source: 'reaction', reaction: 'overload', canReact: false, canStatus: false, x: next.x, y: next.y });
        fx = next.x; fy = next.y;
      }
      if (hit.size > (from ? 1 : 0)) { ctx.mixer.fire('chain_zap'); this._ruleFired('overload_chain'); }
    } else if (ev.name === 'blight' && R.blight_spread) {
      const stacks = ev.stacks != null ? ev.stacks : (R.blight_spread.fallbackStacks ?? 0);
      const n = Math.max(1, Math.floor(stacks * R.blight_spread.stackFrac));
      let any = false;
      ctx.enemies.queryCircle(ev.x, ev.y, R.blight_spread.radius, (e) => {
        if (isTarget(e)) return;
        for (let k = 0; k < n; k++) ctx.combat.applyStatus(e, 'poison');
        any = true;
      });
      if (any) this._ruleFired('blight_spread');
    }
  }

  // ---------------------------------------------------------------- self_blast (Unstable Core): your blasts can hurt you
  _onExplosion(ev) {
    const ctx = this.ctx, r = ctx.run.relicRules.self_blast, p = ctx.player;
    if (!r || !ev || ev.hostile || !p || !p.alive) return;
    const now = ctx.time.ms;
    if (now - this.lastSelfBlastMs < (r.cooldownMs || 0)) return;
    if (Math.hypot(p.coreX - ev.x, p.coreY - ev.y) > ev.r) return;
    if (p.hurt(r.damage, { kind: 'self_blast', x: ev.x, y: ev.y })) { this.lastSelfBlastMs = now; this._ruleFired('self_blast'); }
  }

  /**
   * Dispatch a relic event. Returns true if any relic acted (used by `lethal` → revive).
   * ev: { x, y, enemy, statuses, elite, wandIndex }
   */
  onEvent(event, ev = {}) {
    const run = this.ctx.run;
    let acted = false;
    if (event === 'room_enter') run.onRoomEnter();          // clean-room counting (scaling: clean_rooms)
    else if (event === 'room_clear') run.onRoomClear();
    for (const r of run.onEventRelics || []) {
      if (r.event !== event) continue;
      const key = `${r.relicId}:${event}`;
      if (r.once && run.relicCounters[`${key}:used`]) continue;
      if (r.filter) {
        if (r.filter.elite && !ev.elite) continue;
        if (r.filter.status && !(ev.statuses || []).includes(STATUS_FILTER[r.filter.status])) continue;
      }
      if (r.every) {
        run.relicCounters[key] = (run.relicCounters[key] || 0) + 1;
        if (run.relicCounters[key] % r.every !== 0) continue;
      }
      if (r.chance != null && !this.ctx.rng.run.chance(r.chance)) continue;
      const impl = getEffect('action', r.action.type);
      if (!impl.run) continue;
      impl.run(this.ctx, r.action, ev);
      if (r.once) run.relicCounters[`${key}:used`] = 1;
      run.relicCounters[r.relicId] = (run.relicCounters[r.relicId] || 0) + 1;     // "trigger count this run" (S3r)
      this.ctx.bus.emit(EV.RELIC_TRIGGERED, r.relicId);
      this.ctx.mixer.fire('relic_proc');
      acted = true;
    }
    return acted;
  }
}

/** A payload echo: deep copy, damage × mult, a small fan offset so the echo reads as a second release. */
function clonePayload(p, damageMult, offDeg) {
  return { ...p, stats: { ...p.stats, damage: p.stats.damage * damageMult }, angleOffset: (p.angleOffset || 0) + offDeg,
    onHit: (p.onHit || []).map((e) => ({ ...e })), onExpire: (p.onExpire || []).map((e) => ({ ...e })),
    payload: p.payload ? p.payload.map((q) => clonePayload(q, damageMult, 0)) : null };
}
