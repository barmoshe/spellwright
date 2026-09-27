// run/economy.js — drafts, shop stock, prices, rerolls, salvage (systems.md §3, §8, §10; design-v2 §9; economy.json).
// PURE (catalogue + RNG in, plain data out). All randomness uses the run's `loot` stream.
//
// v2 levers (economy.json, every number from data):
//   rarity pity    rare weight += pity.rareOffset (starts rareOffsetStart, +stepPerMiss per draft with no rare+, cap; resets on rare+)
//   tag lean       candidate weight × perTagMult per OWNED tag it carries (owned = ≥ ownedThreshold owned items), cap
//   counter guar.  one draft slot carries the keyword the next test asks for when nothing owned carries it
//   duo weight     duo relics join relic drafts only when both parents are owned (feature `duos`), weight × offerWeightMult
//   sale           1 non-heal shop slot × sale.mult
//   ban            banned ids never appear again this run
//   forge-only     level-2 / evolved cards (pool:false) never appear in drafts, shops or crates

import { isForgeOnly, isPlainRelic } from '../data/catalog.js';

const RARITY_ORDER = ['legendary', 'rare', 'uncommon', 'common'];

export const econ = (cat, id) => cat.economy[id];

/** Ids available for a draft or shop of `kind` ('spell'|'modifier'|'card'|'relic'|'wand'). */
export function poolFor(cat, kind, floor, isUnlocked, exclude = new Set()) {
  let list;
  if (kind === 'spell') list = Object.values(cat.spells);
  else if (kind === 'modifier') list = Object.values(cat.modifiers);
  else if (kind === 'card') list = cat.cardList;
  else if (kind === 'relic') list = cat.relicList.filter(isPlainRelic);
  else if (kind === 'wand') list = cat.wandList.filter((w) => w.rarity !== 'starter');
  else list = [];
  if (kind === 'spell' || kind === 'modifier' || kind === 'card') list = list.filter((r) => !isForgeOnly(cat, r.id));
  const lockKind = kind === 'relic' ? 'relics' : kind === 'wand' ? 'wands' : 'cards';
  return list.filter((r) => (r.minFloor ?? 1) <= floor && !exclude.has(r.id) && isUnlocked(lockKind, r.id));
}

/** Roll one rarity from economy.rarity.weightsByFloor (+ the pity offset on `rare`). */
function rollRarity(cat, floor, rng, pity) {
  const w = econ(cat, 'rarity').weightsByFloor[String(floor)] || econ(cat, 'rarity').weightsByFloor['1'];
  const items = Object.entries(w).map(([rarity, weight]) => ({ rarity, weight: rarity === 'rare' && pity ? Math.max(0, weight + pity.rareOffset) : weight }));
  if (!items.some((x) => x.weight > 0)) return 'common';
  return rng.weighted(items).rarity;
}

/** Tags carried by ≥ ownedThreshold owned items (economy.tagLean). `items` = [{tags:[]}, …]. */
export function ownedTagSet(cat, items) {
  const tl = econ(cat, 'tagLean');
  const n = new Map();
  for (const it of items) for (const tg of (it && it.tags) || []) n.set(tg, (n.get(tg) || 0) + 1);
  const out = new Set();
  for (const [tg, k] of n) if (k >= ((tl && tl.ownedThreshold) || 2)) out.add(tg);
  return out;
}

/** Tag-lean weight multiplier for one candidate (× perTagMult per owned tag, capped). */
export function leanOf(cat, rec, ownedTags) {
  const tl = econ(cat, 'tagLean');
  if (!tl || !ownedTags || !ownedTags.size) return 1;
  let m = 1;
  for (const tg of rec.tags || []) if (ownedTags.has(tg)) m *= tl.perTagMult;
  return Math.min(tl.cap, m);
}

/** Weighted pick inside the rolled rarity (falls to the next LOWER rarity if empty); duos ride along any bucket. */
function pickWeighted(cat, pool, rarity, rng, o) {
  const weightOf = (r) => leanOf(cat, r, o.ownedTags) * (r.duo ? (r.duo.offerWeightMult || econ(cat, 'drafts').duoOfferWeightMult || 1) : 1);
  const duos = pool.filter((r) => r.duo);
  let idx = RARITY_ORDER.indexOf(rarity);
  if (idx < 0) idx = RARITY_ORDER.length - 1;
  for (; idx < RARITY_ORDER.length; idx++) {
    const bucket = pool.filter((r) => r.rarity === RARITY_ORDER[idx]).concat(duos);
    if (bucket.length) return rng.weighted(bucket, weightOf);
  }
  return pool.length ? rng.weighted(pool, weightOf) : null;
}

/**
 * N distinct ids of a kind, each rarity rolled independently (systems §8 draft rules; design-v2 §9 levers).
 * @param {object} [o]
 *   o.pity       {rareOffset} — read, and updated ONCE for this draft unless o.noPityUpdate
 *   o.ownedTags  Set of owned tags (tag lean)
 *   o.banned     Set of banned ids (ban)
 *   o.duos       duo relic records eligible now (both parents owned, feature on) — relic drafts only
 *   o.counter    { keyword } — guarantee one item carrying it (spell / modifier drafts per counterGuarantee.draftKinds)
 * @returns {string[]} ids (the array also carries `.counterIndex` when the guarantee swapped a slot)
 */
export function rollDraft(cat, kind, n, floor, rng, isUnlocked, exclude = new Set(), o = {}) {
  const out = [];
  const taken = new Set(exclude);
  if (o.banned) for (const id of o.banned) taken.add(id);
  let rare = false;
  for (let i = 0; i < n; i++) {
    let pool = poolFor(cat, kind, floor, isUnlocked, taken);
    if (kind === 'relic' && o.duos && o.duos.length) pool = pool.concat(o.duos.filter((d) => !taken.has(d.id)));
    if (!pool.length) break;
    const r = pickWeighted(cat, pool, rollRarity(cat, floor, rng, o.pity), rng, o);
    if (!r) break;
    if (r.rarity === 'rare' || r.rarity === 'legendary') rare = true;
    out.push(r.id); taken.add(r.id);
  }
  // counter guarantee (economy.counterGuarantee): replace the LAST slot unless an item already carries it
  const cg = econ(cat, 'counterGuarantee');
  if (o.counter && o.counter.keyword && cg && (cg.draftKinds || []).includes(kind) && out.length) {
    const kw = o.counter.keyword;
    const carries = (id) => ((cat.cards[id] || {}).keywords || []).includes(kw);
    let at = out.findIndex(carries);
    if (at < 0) {
      const cands = poolFor(cat, kind, floor, isUnlocked, taken).filter((r) => (r.keywords || []).includes(kw));
      if (cands.length) {
        at = out.length - 1;
        out[at] = rng.weighted(cands, (r) => leanOf(cat, r, o.ownedTags)).id;
      }
    }
    if (at >= 0) out.counterIndex = at;
  }
  if (o.pity && !o.noPityUpdate) updatePity(cat, kind, o.pity, rare || out.some((id) => isRareId(cat, kind, id)));
  return out;
}

const isRareId = (cat, kind, id) => {
  const r = kind === 'relic' ? cat.relics[id] : kind === 'wand' ? cat.wands[id] : cat.cards[id];
  return !!r && (econ(cat, 'pity').resetOn || ['rare', 'legendary']).includes(r.rarity);
};

/** economy.pity: +stepPerMiss per draft with no rare+, capped; reset on rare+. Only for pity.appliesTo kinds. */
export function updatePity(cat, kind, pity, gotRare) {
  const p = econ(cat, 'pity');
  if (!p || !(p.appliesTo || []).includes(kind)) return;
  pity.rareOffset = gotRare ? p.rareOffsetStart : Math.min(p.cap, pity.rareOffset + p.stepPerMiss);
}
export const newPity = (cat) => ({ rareOffset: (econ(cat, 'pity') || {}).rareOffsetStart ?? 0 });

/** Risk-door draft (rules.risk.rewardDraft): corrupted relics only, never owned, never banned. */
export function rollCorrupted(cat, n, rng, owned = new Set(), banned = new Set()) {
  const pool = cat.corruptedList.filter((r) => !owned.has(r.id) && !banned.has(r.id)).slice();
  const out = [];
  while (out.length < n && pool.length) { const i = rng.int(pool.length); out.push(pool[i].id); pool.splice(i, 1); }
  return out;
}

export function priceOf(cat, kind, id, floor, priceMult = 1) {
  const p = econ(cat, 'prices');
  const fm = p.floorPriceMult[Math.max(0, Math.min(p.floorPriceMult.length - 1, floor - 1))];
  let base;
  // rarities with no price row (duo / corrupted relics, evolved cards) price as the table's top non-legendary row
  if (kind === 'heal') base = p.healPotion;
  else if (kind === 'relic') base = p.relic[cat.relics[id].rarity] ?? p.relic.rare;
  else if (kind === 'wand') base = p.wand[cat.wands[id].rarity] ?? p.wand.rare;
  else base = p.card[cat.cards[id].rarity] ?? p.card.rare;
  return Math.round(base * fm * priceMult);
}

export function salvageValue(cat, cardId, floor) {
  return Math.floor(econ(cat, 'salvage').frac * priceOf(cat, 'card', cardId, floor));
}

/**
 * Shop stock per economy.shopStock: 3 cards, 1 relic, 1 wand (floor ≥ 2, else card), 1 heal; one sale slot.
 * @param {object} [o] { pity, ownedTags, banned, saleIndex (keep the sale slot across rerolls) }
 * @returns stock [{slot, kind, id, price, basePrice, sale, sold}] with `.saleIndex`
 */
export function rollShop(cat, floor, rng, isUnlocked, ownedRelics, priceMult, o = {}) {
  const stock = [];
  const takenCards = new Set();
  let rare = false;
  const draftOpts = { pity: o.pity, ownedTags: o.ownedTags, banned: o.banned, noPityUpdate: true };
  for (const slot of econ(cat, 'shopStock').slots) {
    let kind = slot.slot;
    if (kind === 'wand' && floor < (slot.minFloor || 1)) kind = slot.fallback || 'card';
    if (kind === 'heal') { const pr = priceOf(cat, 'heal', null, floor, priceMult); stock.push({ slot: slot.slot, kind: 'heal', id: 'heal_potion', price: pr, basePrice: pr, sale: false, sold: false }); continue; }
    const exclude = kind === 'relic' ? new Set(ownedRelics) : kind === 'card' ? takenCards : new Set();
    const [id] = rollDraft(cat, kind, 1, floor, rng, isUnlocked, exclude, draftOpts);
    if (!id) { stock.push({ slot: slot.slot, kind, id: null, price: 0, basePrice: 0, sale: false, sold: true }); continue; }
    if (kind === 'card') takenCards.add(id);
    if (isRareId(cat, kind, id)) rare = true;
    const pr = priceOf(cat, kind, id, floor, priceMult);
    stock.push({ slot: slot.slot, kind, id, price: pr, basePrice: pr, sale: false, sold: false });
  }
  if (o.pity) updatePity(cat, 'card', o.pity, rare);
  applySale(cat, stock, rng, o.saleIndex);
  return stock;
}

/** economy.sale: `slots` random non-excluded, non-empty slots at × mult (kept on the same index across rerolls). */
export function applySale(cat, stock, rng, keepIndex = null) {
  const sale = econ(cat, 'sale');
  const shopRec = econ(cat, 'shopStock');
  if (!sale || (shopRec && shopRec.saleSlot === false)) return stock;
  const ok = (it) => it && it.id && !it.sold && !(sale.excludes || []).includes(it.kind);
  let idx = keepIndex;
  if (idx == null || !ok(stock[idx])) {
    const elig = stock.map((it, i) => (ok(it) ? i : -1)).filter((i) => i >= 0);
    idx = elig.length ? elig[rng.int(elig.length)] : null;
  }
  if (idx != null) { const it = stock[idx]; it.sale = true; it.price = Math.max(1, Math.round(it.basePrice * sale.mult)); }
  stock.saleIndex = idx;
  return stock;
}

export function rerollCost(cat, rerollsDone, freeRerolls) {
  if (rerollsDone < freeRerolls) return 0;
  const r = econ(cat, 'reroll');
  return r.base + r.step * (rerollsDone - freeRerolls);
}

/** Reward-draft reroll (economy.draftReroll): base, +step per reroll, max per offer. null = no rerolls left. */
export function draftRerollCost(cat, rerollsDone) {
  const r = econ(cat, 'draftReroll');
  if (!r || rerollsDone >= r.maxPerOffer) return null;
  return r.base + r.step * rerollsDone;
}

/** Skip pay (economy.skip): coinsBase + coinsPerFloor × floor. */
export function skipPay(cat, floor) {
  const s = econ(cat, 'skip');
  return s ? s.coinsBase + s.coinsPerFloor * floor : 0;
}

/** Forge recipe cost (forge.json cost {base, perFloor}) and slot cost (costBase + costStep × bought). */
export const forgeCost = (recipe, floor) => (recipe.cost ? recipe.cost.base + recipe.cost.perFloor * floor : 0);
export const slotCost = (slotRec, bought) => slotRec.costBase + slotRec.costStep * bought;
