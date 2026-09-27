// sim/Relics.js — mechanic-spec §7 relic vocabulary. Passive types are folded into RunState modifiers
// (shot_stat, player_stat, status_rule, effect_param, economy: run/RunState._recomputeMods). This module
// registers every type and action key once (architecture §6) and runs the `on_event` relics:
//   events: kill · hurt · lethal · room_enter · room_clear · dash_start · wand_recharge · crit
//   filter {status: burn|frozen|poison|shocked|chilled} | {elite: true} · every: N (deterministic counter) · once
//   actions: heal · mana · explode · spawn_spell · shield · revive · coins

import { defineEffect, getEffect } from '../effects/registry.js';
import { EV } from '../core/ev.js';
import { spawnRelicSpell } from './Effects.js';

for (const t of ['shot_stat', 'player_stat', 'status_rule', 'effect_param', 'economy']) defineEffect('relic', t, { passive: true });
defineEffect('relic', 'on_event', { passive: false });

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
  constructor(ctx) { this.ctx = ctx; }

  /**
   * Dispatch a relic event. Returns true if any relic acted (used by `lethal` → revive).
   * ev: { x, y, enemy, statuses, elite, wandIndex }
   */
  onEvent(event, ev = {}) {
    const run = this.ctx.run;
    let acted = false;
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
