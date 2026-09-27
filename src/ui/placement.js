// ui/placement.js — the ONE placement rule of the wand editor (wand-editor-ux §10.3, insert-or-swap on
// every device). PURE: no Phaser, no RunState — the editor draws its marker from the result and
// RunState.placeCard() applies the very same result, so the marker can never lie about the drop.
//
//   dropped on         | the row has an empty slot (origin counts as empty) | the row is full
//   an empty slot      | place                                              | —
//   a filled slot      | insert before it (shift toward the nearest empty)  | swap
//   a bag cell         | place / swap (the bag is unordered; never insert)  | —

const NONE = Object.freeze({ mode: 'none', to: -1, landing: -1, shifts: [], dir: 0, displaced: null, slots: null });

/**
 * @param {{index:(number|'bag'), slots:(string|null)[]} | (string|null)[]} wand
 *        the TARGET row: a wand's slots (index = wand index) or the bag (index = 'bag'). A bare array
 *        is treated as an ordered row with no same-row origin.
 * @param {{wand:(number|'bag'), slot:number} | null} fromRef   the held card's origin (null = origin-less,
 *        e.g. a reward card). When it lies in the target row, its cell counts as EMPTY.
 * @param {number} toIndex   the target cell in the row
 * @param {string|null} [heldId]  the held card id (defaults to the card at a same-row origin); only
 *        needed to fill `slots` for cross-row moves
 * @returns {{
 *   mode: 'place'|'insert'|'swap'|'none',  // 'none' = dropped on its own origin (a cancel)
 *   to: number,                            // the target cell
 *   landing: number,                       // where the held card ends up (to, or to−1 on a left shift)
 *   shifts: {from:number, to:number}[],    // cards of the row that move one cell (insert only)
 *   dir: 1|-1|0,                           // shift direction (the ▸ / ◂ markers)
 *   displaced: string|null,                // swap: the card that leaves the target (→ origin, or hand-over)
 *   slots: (string|null)[]                 // the target row AFTER the move (same-row origin included)
 * }}
 */
export function placementFor(wand, fromRef, toIndex, heldId = null) {
  const bare = Array.isArray(wand);
  const src = bare ? wand : (wand.slots || (wand.state && wand.state.slots) || []);
  const index = bare ? undefined : wand.index;
  if (!(toIndex >= 0 && toIndex < src.length)) return NONE;
  const ordered = index !== 'bag';
  const sameRow = !!fromRef && index !== undefined && fromRef.wand === index;
  if (sameRow && fromRef.slot === toIndex) return NONE;
  const id = heldId ?? (sameRow ? src[fromRef.slot] ?? null : null);
  const v = src.map((x) => x ?? null);
  if (sameRow) v[fromRef.slot] = null;                         // the origin counts as empty

  const out = { mode: 'place', to: toIndex, landing: toIndex, shifts: [], dir: 0, displaced: null, slots: v };
  if (v[toIndex] == null) { v[toIndex] = id; return out; }

  if (!ordered) {                                               // bag: swap (displaced → origin)
    out.mode = 'swap'; out.displaced = v[toIndex];
    v[toIndex] = id;
    if (sameRow) v[fromRef.slot] = out.displaced;
    return out;
  }
  // insert before the target: nearest empty to the RIGHT first …
  let j = -1;
  for (let k = toIndex + 1; k < v.length; k++) if (v[k] == null) { j = k; break; }
  if (j >= 0) {
    for (let k = j; k > toIndex; k--) { v[k] = v[k - 1]; out.shifts.push({ from: k - 1, to: k }); }
    out.shifts.reverse();
    v[toIndex] = id;
    out.mode = 'insert'; out.dir = 1;
    return out;
  }
  // … else the nearest empty to the LEFT: the cards between it and the target shift left, and the held
  // card lands immediately before the target card.
  for (let k = toIndex - 1; k >= 0; k--) if (v[k] == null) { j = k; break; }
  if (j >= 0) {
    for (let k = j; k < toIndex - 1; k++) { v[k] = v[k + 1]; out.shifts.push({ from: k + 1, to: k }); }
    out.landing = toIndex - 1;
    v[out.landing] = id;
    out.mode = 'insert'; out.dir = -1;
    return out;
  }
  // the row is full (never for a same-row move): swap
  out.mode = 'swap'; out.displaced = v[toIndex];
  v[toIndex] = id;
  return out;
}
