// spells/index.js — barrel for the pure spell engine (mechanic-spec §4/§5.1; architecture §5).
export { castWand, createWandState, buildOrder, tickWand, canCast, isRecharging, applyEditReset,
  effectiveRechargeMs, manaMaxOf, manaRegenOf } from './evaluate.js';
export { composeShot, STAT_KEYS } from './stats.js';
export { previewCycle } from './preview.js';
