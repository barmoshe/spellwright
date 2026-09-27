// run/meta.js — meta milestones (progression-and-pacing §7; data/unlocks.json). Evaluated at run end
// (and safely re-evaluated any time): conditions read lifetime counters in the save plus this run's
// summary. Returns the newly achieved milestones so run-end can show S7u.

/**
 * @param {object} cat      catalogue
 * @param {object} Save     core/save.js store (after recordRun(summary))
 * @param {object} summary  RunState.summary()
 * @returns {{ id, name, desc, unlocks }[]} newly achieved milestones (their unlocks already applied)
 */
export function evaluateMilestones(cat, Save, summary) {
  const m = Save.meta;
  const fresh = [];
  for (const u of cat.unlocks) {
    if (m.milestones.includes(u.id)) continue;
    if (!conditionMet(u.condition, m, summary)) continue;
    m.milestones.push(u.id);
    for (const [kind, ids] of Object.entries(u.unlocks || {})) for (const id of ids) Save.unlock(kind, id);
    fresh.push(u);
  }
  if (fresh.length) Save.flush();
  return fresh;
}

function conditionMet(c, meta, s) {
  switch (c.type) {
    case 'reach_floor': return Math.max(meta.stats.bestFloor, s.maxFloor || 0) >= c.value;
    case 'kill_boss': return (s.bossesKilled || []).includes(c.value);
    case 'reactions_seen': return c.value.every((r) => meta.reactionsSeen.includes(r));
    case 'lifetime_kills': return meta.stats.kills >= c.value;
    case 'payload_released': return meta.stats.payloadsReleased >= c.value;
    case 'lifetime_deaths': return meta.stats.deaths >= c.value;
    default: return false;
  }
}

/** Progress lines for the closest unmet milestones (run-end "next goals", progression §7). */
export function nextGoals(cat, Save, n = 2) {
  const m = Save.meta;
  return cat.unlocks.filter((u) => !m.milestones.includes(u.id)).slice(0, n);
}
