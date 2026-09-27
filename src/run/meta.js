// run/meta.js — v2 meta layer (design-v2 §11; data/modes.json, data/unlocks.json, rules.heat, rules.goals).
// PURE except for the run-arming handoff below: every function takes the catalogue and the save store
// (core/save.js) as arguments, so balance scripts and harnesses can call them without Phaser.
//
//  - Modes:  Standard (+ Heat tier 0..5), Gentle (grows with each lost Gentle run), Daily (UTC-date seed).
//  - Goals:  15 ordered goals. Early goals (order <= rules.goals.earlyMaxOrder) pay at most
//            rules.goals.earlyPayoutPerRun per run end, earliest first; satisfied early goals QUEUE in
//            meta.goals.earned. Later goals pay the moment they are satisfied. `meta.milestones` holds the
//            PAID goal ids (the v1 field name is kept so the codex reads it unchanged; save-schema v2).
//  - Arming: the Mode Select writes the chosen run config with armRun() just before `scene.start('run')`;
//            RunState takes it once in its constructor (takeArmedRun). One named seam, so RunScene's
//            create() needs no mode plumbing; an explicit `o.mode` on RunState wins over the armed one.

import { RNG } from '../core/rng.js';

// ------------------------------------------------------------------------------------------- arming
let armed = null;
/** @param {{mode:'standard'|'gentle'|'daily', heat?:number, daily?:object, gentle?:object}} cfg */
export function armRun(cfg) { armed = cfg ? { ...cfg } : null; }
/** One-shot: the config armed by the last Mode Select Begin, or null (tutorial / harness / legacy paths). */
export function takeArmedRun() { const a = armed; armed = null; return a; }

// ------------------------------------------------------------------------------------------- modes
/** FNV-1a 32-bit over a string (modes.json daily.seed.hash). */
export function fnv1a32(s) {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193); }
  return h >>> 0;
}
/** UTC calendar date 'YYYY-MM-DD' (modes.json daily.seed.format). */
export function utcDate(d = new Date()) { return d.toISOString().slice(0, 10); }

/**
 * Today's daily: seed = fnv1a32(salt + date); one loadout from the pool (unlock state ignored, so everyone
 * plays the same run) and one rule from the rule pool, both drawn from an RNG on that seed.
 */
export function dailyFor(cat, date = utcDate()) {
  const m = cat.modes.daily;
  const seed = fnv1a32(`${m.seed.salt}${date}`) || 1;
  const rng = new RNG(seed);
  const loadoutId = rng.pick(m.loadoutPool);
  const rule = rng.pick(m.rulePool);
  return { date, seed, loadoutId, ruleId: rule.id, rule };
}

/** Gentle numbers after `losses` lost Gentle runs (never decreases: losses only grow). */
export function gentleFor(cat, losses) {
  const r = cat.modes.gentle.rule;
  const n = Math.max(0, losses | 0);
  return {
    losses: n,
    bonusHalfHearts: Math.min(r.bonusHalfHeartsCap, n * r.bonusHalfHeartsPerLostRun),
    absorbChance: Math.min(r.absorbChanceCap, +(n * r.absorbChancePerLostRun).toFixed(4)),
  };
}

/** rules.heat level record for tier n (0 = none). */
export function heatRecord(cat, n) {
  if (!n) return null;
  return cat.rules.heat.levels.find((l) => l.level === n) || null;
}
export const heatMax = (cat) => cat.rules.heat.maxLevel || cat.rules.heat.levels.length;

/** The daily share line (modes.json daily.shareTemplate; ASCII only). `res` = a daily first-attempt record. */
export function shareLine(cat, res, names) {
  const m = cat.modes.daily;
  const mm = Math.floor((res.timeS || 0) / 60), ss = Math.floor(res.timeS || 0) % 60;
  const fill = { date: res.date, loadout: names.loadout, rule: names.rule, result: m.resultWords[res.outcome] || m.resultWords.abandon,
    floor: res.floor || 1, step: (res.step | 0) + 1, time: `${mm}:${String(ss).padStart(2, '0')}`, kills: res.kills | 0 };
  return m.shareTemplate.replace(/\{(\w+)\}/g, (_, k) => String(fill[k] ?? ''));
}

// ------------------------------------------------------------------------------------------- goals
const byOrder = (a, b) => (a.order ?? 0) - (b.order ?? 0);
export const goalsInOrder = (cat) => [...cat.unlocks].sort(byOrder);

/** Countable progress for a goal, or null ("Break 12/25 defences"). Reads lifetime meta only. */
export function goalProgress(g, meta) {
  const c = g.condition, st = meta.stats, v = c.value;
  const pair = (cur) => ({ cur: Math.min(cur | 0, v), need: v });
  switch (c.type) {
    case 'runs_finished': return pair((st.wins | 0) + (st.deaths | 0));
    case 'lifetime_deaths': return pair(st.deaths);
    case 'break_defence_n': return pair(st.defencesBroken);
    case 'payload_released': return v > 1 ? pair(st.payloadsReleased) : null;
    case 'lifetime_kills': return pair(st.kills);
    case 'reach_floor': return v > 1 ? pair(st.bestFloor) : null;
    default: return null;
  }
}

function conditionMet(c, meta) {
  const st = meta.stats;
  switch (c.type) {
    case 'runs_finished': return (st.wins | 0) + (st.deaths | 0) >= c.value;
    case 'reach_miniboss': return meta.bossesReached.includes(c.value);
    case 'reach_floor': return st.bestFloor >= c.value;
    case 'kill_boss': return meta.bossesKilled.includes(c.value);
    case 'lifetime_deaths': return st.deaths >= c.value;
    case 'break_defence_n': return (st.defencesBroken | 0) >= c.value;
    case 'payload_released': return st.payloadsReleased >= c.value;
    case 'evolve_card': return (st.evolves | 0) >= c.value;
    case 'duo_formed': return (st.duos | 0) >= c.value;
    case 'daily_complete': return (st.dailyComplete | 0) >= c.value;
    case 'win_heat': return st.bestHeatWin != null && st.bestHeatWin >= c.value;
    case 'reactions_seen': return c.value.every((r) => meta.reactionsSeen.includes(r));
    case 'lifetime_kills': return st.kills >= c.value;
    default: return false;
  }
}

/** Pay one goal: apply its unlock ids and stat bonuses, record it paid. */
function pay(Save, g) {
  const m = Save.meta;
  for (const [kind, ids] of Object.entries(g.unlocks || {})) {
    if (kind === 'stats') { for (const s of ids) m.statBonus[s.stat] = (m.statBonus[s.stat] | 0) + (s.add | 0); continue; }
    for (const id of ids) Save.unlock(kind, id);
  }
  if (!m.milestones.includes(g.id)) m.milestones.push(g.id);
}

/**
 * Run-end goal evaluation (called ONCE per run end by RunScene.endRun, after Save.recordRun(summary)).
 * Satisfied early goals join the queue; later goals pay now; then up to earlyPayoutPerRun queued goals pay.
 * @returns {object[]} goals PAID at this run end (their unlocks applied), in payout order
 */
export function evaluateMilestones(cat, Save, summary) {    // eslint-disable-line no-unused-vars
  const m = Save.meta, G = cat.rules.goals;
  const paid = [];
  for (const g of goalsInOrder(cat)) {
    if (m.milestones.includes(g.id) || m.goals.earned.includes(g.id)) continue;
    if (!conditionMet(g.condition, m)) continue;
    if (G.queueUnpaid && g.order <= G.earlyMaxOrder) m.goals.earned.push(g.id);
    else { pay(Save, g); paid.push(g); }
  }
  const order = Object.fromEntries(cat.unlocks.map((u) => [u.id, u.order]));
  m.goals.earned.sort((a, b) => (order[a] ?? 99) - (order[b] ?? 99));
  const early = [];
  for (let n = G.earlyPayoutPerRun ?? 1; n > 0 && m.goals.earned.length; n--) {
    const g = cat.unlocks.find((u) => u.id === m.goals.earned[0]);
    m.goals.earned.shift();
    if (g) { pay(Save, g); early.push(g); }
  }
  Save.flush();
  return [...early, ...paid];
}

/** Queued (earned, unpaid) goals, in order. */
export function earnedGoals(cat, Save) {
  const e = Save.meta.goals.earned;
  return goalsInOrder(cat).filter((g) => e.includes(g.id));
}

/** The next goals to chase: unpaid AND not yet earned, in the designer's order. */
export function nextGoals(cat, Save, n = 2) {
  const m = Save.meta;
  return goalsInOrder(cat).filter((g) => !m.milestones.includes(g.id) && !m.goals.earned.includes(g.id)).slice(0, n);
}

/** Goal status for the Goals screen: 'done' | 'earned' | 'next' | 'later'. */
export function goalStatus(cat, Save, g) {
  const m = Save.meta;
  if (m.milestones.includes(g.id)) return 'done';
  if (m.goals.earned.includes(g.id)) return 'earned';
  const nx = nextGoals(cat, Save, 1)[0];
  return nx && nx.id === g.id ? 'next' : 'later';
}

/** Number of goals completed (paid + earned): drives the Title "!" badge against meta.goals.seen. */
export const goalsCompleteCount = (Save) => Save.meta.milestones.length + Save.meta.goals.earned.length;
