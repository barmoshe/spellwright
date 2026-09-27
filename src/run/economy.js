// run/economy.js — drafts, shop stock, prices, rerolls, salvage (systems.md §3, §8; economy.json).
// PURE (catalogue + RNG in, plain data out). All randomness uses the run's `loot` stream.

const RARITY_ORDER = ['legendary', 'rare', 'uncommon', 'common'];

export const econ = (cat, id) => cat.economy[id];

/** Ids available for a draft or shop of `kind` ('spell'|'modifier'|'card'|'relic'|'wand'). */
export function poolFor(cat, kind, floor, isUnlocked, exclude = new Set()) {
  let list;
  if (kind === 'spell') list = Object.values(cat.spells);
  else if (kind === 'modifier') list = Object.values(cat.modifiers);
  else if (kind === 'card') list = cat.cardList;
  else if (kind === 'relic') list = cat.relicList;
  else if (kind === 'wand') list = cat.wandList.filter((w) => w.rarity !== 'starter');
  else list = [];
  const lockKind = kind === 'relic' ? 'relics' : kind === 'wand' ? 'wands' : 'cards';
  return list.filter((r) => (r.minFloor ?? 1) <= floor && !exclude.has(r.id) && isUnlocked(lockKind, r.id));
}

/** Roll one rarity from economy.rarity.weightsByFloor; fall back to the next LOWER rarity if empty. */
function rollRarity(cat, floor, rng) {
  const w = econ(cat, 'rarity').weightsByFloor[String(floor)] || econ(cat, 'rarity').weightsByFloor['1'];
  const items = Object.entries(w).map(([rarity, weight]) => ({ rarity, weight }));
  return rng.weighted(items).rarity;
}

function pickByRarity(pool, rarity, rng) {
  let idx = RARITY_ORDER.indexOf(rarity);
  for (; idx < RARITY_ORDER.length; idx++) {
    const bucket = pool.filter((r) => r.rarity === RARITY_ORDER[idx]);
    if (bucket.length) return rng.pick(bucket);
  }
  return pool.length ? rng.pick(pool) : null;
}

/** N distinct ids of a kind, each rarity rolled independently (systems §8 draft rules). */
export function rollDraft(cat, kind, n, floor, rng, isUnlocked, exclude = new Set()) {
  const out = [];
  const taken = new Set(exclude);
  for (let i = 0; i < n; i++) {
    const pool = poolFor(cat, kind, floor, isUnlocked, taken);
    if (!pool.length) break;
    const r = pickByRarity(pool, rollRarity(cat, floor, rng), rng);
    if (!r) break;
    out.push(r.id); taken.add(r.id);
  }
  return out;
}

export function priceOf(cat, kind, id, floor, priceMult = 1) {
  const p = econ(cat, 'prices');
  const fm = p.floorPriceMult[Math.max(0, Math.min(p.floorPriceMult.length - 1, floor - 1))];
  let base;
  if (kind === 'heal') base = p.healPotion;
  else if (kind === 'relic') base = p.relic[cat.relics[id].rarity];
  else if (kind === 'wand') base = p.wand[cat.wands[id].rarity];
  else base = p.card[cat.cards[id].rarity];
  return Math.round(base * fm * priceMult);
}

export function salvageValue(cat, cardId, floor) {
  return Math.floor(econ(cat, 'salvage').frac * priceOf(cat, 'card', cardId, floor));
}

/** Shop stock per economy.shopStock: 3 cards, 1 relic, 1 wand (floor ≥ 2, else card), 1 heal. */
export function rollShop(cat, floor, rng, isUnlocked, ownedRelics, priceMult) {
  const stock = [];
  const takenCards = new Set();
  for (const slot of econ(cat, 'shopStock').slots) {
    let kind = slot.slot;
    if (kind === 'wand' && floor < (slot.minFloor || 1)) kind = slot.fallback || 'card';
    if (kind === 'heal') { stock.push({ slot: slot.slot, kind: 'heal', id: 'heal_potion', price: priceOf(cat, 'heal', null, floor, priceMult), sold: false }); continue; }
    const exclude = kind === 'relic' ? new Set(ownedRelics) : kind === 'card' ? takenCards : new Set();
    const [id] = rollDraft(cat, kind, 1, floor, rng, isUnlocked, exclude);
    if (!id) { stock.push({ slot: slot.slot, kind, id: null, price: 0, sold: true }); continue; }
    if (kind === 'card') takenCards.add(id);
    stock.push({ slot: slot.slot, kind, id, price: priceOf(cat, kind, id, floor, priceMult), sold: false });
  }
  return stock;
}

export function rerollCost(cat, rerollsDone, freeRerolls) {
  if (rerollsDone < freeRerolls) return 0;
  const r = econ(cat, 'reroll');
  return r.base + r.step * (rerollsDone - freeRerolls);
}
