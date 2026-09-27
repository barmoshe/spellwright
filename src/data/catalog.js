// data/catalog.js — typed views over the designer's data (loaded verbatim by core/db.js). PURE: no
// Phaser, usable from node. One place that knows table shapes, so gameplay code reads `CAT.cards.fireball`,
// `CAT.rules.casting.maxShotsPerCast`, `CAT.economy.prices`, never raw JSON paths.
//
// Conventions (mechanic-spec §0): spells + modifiers share one card-id namespace → CAT.cards.
// Time stays in ms in the catalogue; systems convert to sim steps once via toSteps().

const byId = (list) => Object.fromEntries((list || []).map((r) => [r.id, r]));

export function buildCatalog(tables) {
  const T = (name) => (tables[name] ? tables[name].list || tables[name] : []);
  const spells = T('spells'), modifiers = T('modifiers');
  const cards = { ...byId(spells), ...byId(modifiers) };
  const rules = byId(T('rules'));
  const economy = byId(T('economy'));
  const floors = T('floors');
  const cat = {
    cards,
    cardList: [...spells, ...modifiers],
    spells: byId(spells),
    modifiers: byId(modifiers),
    wands: byId(T('wands')),
    wandList: T('wands'),
    relics: byId(T('relics')),
    relicList: T('relics'),
    enemies: byId(T('enemies')),
    bosses: byId(T('bosses')),
    rooms: byId(T('rooms')),
    floors: byId(floors),
    floorList: floors.slice().sort((a, b) => (a.index ?? a.floor ?? 0) - (b.index ?? b.floor ?? 0)),
    rules,
    economy,
    unlocks: T('unlocks'),
    loadouts: byId(T('loadouts')),
    loadoutList: T('loadouts'),
    roomsMeta: tables.rooms && tables.rooms.meta ? tables.rooms.meta : {},
  };
  // Every id named in any unlocks[].unlocks is locked at first launch (progression §7).
  const locked = { cards: new Set(), wands: new Set(), relics: new Set(), loadouts: new Set(), features: new Set() };
  for (const u of cat.unlocks) for (const k of Object.keys(locked)) for (const id of (u.unlocks && u.unlocks[k]) || []) locked[k].add(id);
  cat.lockedByDefault = locked;
  return cat;
}

/** The castWand env's `rules` subset. */
export const castRules = (cat) => ({ casting: cat.rules.casting, crit: cat.rules.crit, shotClamps: cat.rules.shotClamps });

export const CAT = { current: null };
export function setCatalog(c) { CAT.current = c; }
export function cat() { return CAT.current; }
