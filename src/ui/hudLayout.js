// ui/hudLayout.js — THE HUD layout, as one pure, reflowable object (hud-layout.md §9, mobile-touch-spec §3–§4).
//
//   layoutFor(profile ∈ {'desktop','touch'}, S = {l,t,r,b} safe rect in game px, opts = {stickSide, wandCount})
//
// returns every HUD rect by name. HudScene and input/TouchSticks.js read ONLY this object; no other file
// holds a HUD coordinate. Desktop returns exactly the hud-layout §2.1 numbers (with the §9.5 T1
// promotions). The touch profile moves all persistent HUD into the top band y ∈ [st, st + 54), puts the
// DASH / SWAP / USE thumb buttons bottom-right (mirrored with `stickSide: 'swapped'`) and PAUSE / EDIT
// top-right, and defines the stick zones (which extend into the letterbox: x < 0 or > 640 is valid).
// validateLayout(L) is the §9.4 checker (logging only; the ?debug F4 overlay draws the same rects).

import { VIEW_W, VIEW_H } from '../config.js';

export const BAND_H = 54;                 // touch top band height (hud-layout §9.2)
const BTN_VIS = 38, BTN_HIT = 46;         // DASH / SWAP / USE (mobile-touch-spec §4.1)
const SQ_VIS = 28, SQ_HIT = 40;           // PAUSE / EDIT

const circ = (name, cx, cy) => ({ name, kind: 'circle', cx, cy, r: BTN_HIT / 2, vr: BTN_VIS / 2,
  x: cx - BTN_HIT / 2, y: cy - BTN_HIT / 2, w: BTN_HIT, h: BTN_HIT });
const sq = (name, cx, cy) => ({ name, kind: 'square', cx, cy, r: SQ_HIT / 2, vr: SQ_VIS / 2,
  x: cx - SQ_HIT / 2, y: cy - SQ_HIT / 2, w: SQ_HIT, h: SQ_HIT });

/** @returns the layout object (see file header). */
export function layoutFor(profile, S = { l: 0, t: 0, r: VIEW_W, b: VIEW_H }, opts = {}) {
  const touch = profile === 'touch';
  const sl = touch ? S.l : 0, st = touch ? S.t : 0, sr = touch ? S.r : VIEW_W, sb = touch ? S.b : VIEW_H;
  const swapped = opts.stickSide === 'swapped';
  const L = { profile: touch ? 'touch' : 'desktop', safe: { l: sl, t: st, r: sr, b: sb }, swapped };
  if (!touch) {
    // hud-layout §2.1 (desktop), §9.5 promotions
    Object.assign(L, {
      hearts: { x: 6, dx: 14, y: 6 },
      relics: { x: 6, y: 22, dx: 18, max: 8, moreX: 150, moreY: 24 },
      track: { labelX: 276, pipX: 280, pipDx: 9, pipY: 8 },
      boss: { x: 170, y: 17, w: 300, h: 6 },
      miniBoss: { x: 230, y: 17, w: 180, h: 6 },          // §9.2 desktop: 300 × miniBossBarScale 0.6, centred on 320
      bossName: { x: 320, y: 3 },
      phaseBanner: { x: 320, y: 27 },                     // §9.6: directly under the bar, y 26–38
      counters: { x: 222, dx: 9, y: 347 },                // §9.3 desktop: right of the promoted mana value
      introCard: { y: 60, bars: 16 },                     // §9.6 mini-boss intro card, y 60–110 + 16 px letterbox bars
      right: { x: 634, coinY: 5, bagY: 19 },
      badges: { x: 6, dx: 22, y: 334, up: 330, glyphY: 318 },
      strip: { y: 324, cellDx: 19, x0: null },
      chevY: 343, rbarY: 343,
      mana: { x: 76, y: 348, w: 120, h: 6 },
      manaText: { x: 199, y: 344 },
      auto: { x: 76, y: 312 },
      toast: { mode: 'column', x: 434, w: 200, bottom: 354, max: 2 },
      banner: { y: 70 },
      clusters: { tl: [6, 6, 144, 34], tc: [262, 6, 110, 12], tr: [560, 6, 74, 24], bl: [6, 312, 264, 42] },
      bossCluster: [170, 4, 300, 20],
      buttons: {},
      zones: null,
    });
    return L;
  }
  // ---- touch profile (hud-layout §9.2; S-relative) ----
  const bx = (dx) => (swapped ? sl + dx : sr - dx);            // DASH/SWAP/USE mirror; PAUSE/EDIT stay right
  Object.assign(L, {
    hearts: { x: sl + 6, dx: 14, y: st + 6 },
    relics: { x: sr - 100 - 18 * 5, y: st + 34, dx: 18, max: 5, moreX: sr - 100 - 18 * 5 - 3, moreY: st + 36, moreRight: true },
    track: { labelX: 352, pipX: 356, pipDx: 9, pipY: st + 8 },
    boss: { x: 300, y: st + 19, w: 196, h: 6 },
    miniBoss: { x: 339, y: st + 19, w: 118, h: 6 },       // §9.2: × miniBossBarScale 0.6, centred on 398
    bossName: { x: 398, y: st + 3 },
    phaseBanner: { x: 398, y: st + 28 },
    counters: { x: sl + 224, dx: 9, y: st + 46 },         // §9.3 touch: in the top band, right of the mana value
    introCard: { y: st + 60, bars: 16 },
    right: { x: sr - 100, coinY: st + 5, bagY: st + 19 },
    badges: { x: sl + 6, dx: 22, y: st + 26, up: st + 22, glyphY: st + 44 },
    strip: { y: st + 24, cellDx: 19, x0: sl + 76 },
    chevY: st + 43, rbarY: st + 43,
    mana: { x: sl + 76, y: st + 46, w: 120, h: 6 },
    manaText: { x: sl + 199, y: st + 42 },
    auto: null,
    toast: { mode: 'top', x: 320 - 140, w: 280, top: st + 56, max: 1 },
    banner: { y: st + 100 },
    // cluster keys follow the HudScene containers: tl = hearts/shield (+ relics' container), bl = the wand cluster (now top-left)
    clusters: { tl: [sl + 6, st + 4, 100, 16], tc: [300, st + 4, 196, 22], tr: [452, st + 4, sr - 100 - 452, 48], bl: [sl + 6, st + 20, 264, 34] },
    bossCluster: [300, st + 2, 196, 24],
    buttons: {
      dash: circ('dash', bx(30), sb - 30),
      swap: circ('swap', bx(30), sb - 80),
      use: circ('use', bx(80), sb - 30),
      pause: sq('pause', sr - 20, st + 20),
      edit: sq('edit', sr - 64, st + 20),
    },
  });
  // stick zones: whole viewport below the band (letterbox included → ±∞ horizontally, clamp at use)
  const top = st + BAND_H, BIG = 10000;
  const left = { name: 'zoneL', x: -BIG, y: top, w: BIG + 320, h: BIG };
  const right = { name: 'zoneR', x: 320, y: top, w: BIG, h: BIG };
  L.zones = swapped ? { move: { ...right, name: 'move' }, aim: { ...left, name: 'aim' } } : { move: { ...left, name: 'move' }, aim: { ...right, name: 'aim' } };
  return L;
}

const inter = (a, b) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
const inside = (a, S) => a.x >= S.l - 0.01 && a.y >= S.t - 0.01 && a.x + a.w <= S.r + 0.01 && a.y + a.h <= S.b + 0.01;

/** Is (x, y) inside a button's hit shape (circle or square)? */
export function hitButton(btn, x, y, inflate = 0) {
  if (!btn) return false;
  if (btn.kind === 'circle') return (x - btn.cx) ** 2 + (y - btn.cy) ** 2 <= (btn.r + inflate) ** 2;
  return x >= btn.x - inflate && x < btn.x + btn.w + inflate && y >= btn.y - inflate && y < btn.y + btn.h + inflate;
}

/**
 * hud-layout §9.4 validator: (a) rects inside S, (b) no two interactive rects intersect, (c) no persistent
 * HUD rect intersects a stick zone, (d) transients only in the top strip, (e) hit rects ≥ 37 px.
 * Returns the list of failures (strings naming the rect pair); logs nothing itself.
 */
export function validateLayout(L) {
  const out = [];
  if (L.profile !== 'touch') return out;
  const S = L.safe;
  const btns = Object.values(L.buttons);
  const persistent = Object.entries(L.clusters).filter(([, r]) => r[2] > 0).map(([k, r]) => ({ name: `cluster.${k}`, x: r[0], y: r[1], w: r[2], h: r[3] }));
  persistent.push({ name: 'boss', x: L.bossCluster[0], y: L.bossCluster[1], w: L.bossCluster[2], h: L.bossCluster[3] });
  if (L.counters) persistent.push({ name: 'counters', x: L.counters.x, y: L.counters.y, w: L.counters.dx * 2 + 7, h: 7 });
  if (L.miniBoss) persistent.push({ name: 'miniBoss', x: L.miniBoss.x, y: L.miniBoss.y, w: L.miniBoss.w, h: L.miniBoss.h });
  for (const b of [...btns, ...persistent]) if (!inside(b, S)) out.push(`(a) ${b.name} outside safe rect`);
  for (let i = 0; i < btns.length; i++) for (let j = i + 1; j < btns.length; j++) {
    const a = btns[i], b = btns[j];
    const hit = a.kind === 'circle' && b.kind === 'circle' ? Math.hypot(a.cx - b.cx, a.cy - b.cy) < a.r + b.r : inter(a, b);
    if (hit) out.push(`(b) ${a.name} × ${b.name}`);
  }
  for (const z of [L.zones.move, L.zones.aim]) for (const p of persistent) if (inter(p, z)) out.push(`(c) ${p.name} × zone.${z.name}`);
  const toast = { name: 'toast', x: L.toast.x, y: L.toast.top, w: L.toast.w, h: 28 };
  const transients = [toast, { name: 'banner', x: 180, y: L.banner.y, w: 280, h: 26 }];
  if (L.phaseBanner) transients.push({ name: 'phaseBanner', x: L.phaseBanner.x - 100, y: L.phaseBanner.y, w: 200, h: 12 });
  if (L.introCard) transients.push({ name: 'introCard', x: 160, y: L.introCard.y, w: 320, h: 50 });
  for (const tr of transients) if (tr.y + tr.h > S.t + 130) out.push(`(d) ${tr.name} below the top strip`);
  for (const b of btns) if (Math.min(b.w, b.h) < 37) out.push(`(e) ${b.name} hit < 37 px`);
  return out;
}
