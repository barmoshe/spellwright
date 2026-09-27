// ui/hudLayout.js — THE HUD layout, as one pure, reflowable object (hud-layout.md §9, mobile-touch-spec §3–§4).
//
//   layoutFor(profile ∈ {'desktop','touch'}, S = {l,t,r,b} safe rect in game px, opts = {stickSide, wandCount})
//
// returns every HUD rect by name. HudScene and input/TouchSticks.js read ONLY this object; no other file
// holds a HUD coordinate. Desktop returns exactly the hud-layout §2.1 numbers (with the §9.5 T1
// promotions). The touch profile moves all persistent HUD into the top band y ∈ [st, st + 54), puts the
// DASH / SWAP / USE thumb buttons bottom-right (mirrored with `stickSide: 'swapped'`) and PAUSE / EDIT
// top-right, and defines the stick zones (which extend into the letterbox: x < 0 or > VIEW_W is valid).
//
// Wide views (config.js VIEW_W 640..800, aspect-ratio-spec): every number below is the 640×360 design value plus an
// anchor offset — left clusters stay at the (safe) left, right clusters move by rx = VIEW_W − 640, top-centre items by
// cx0 = (VIEW_W − 640) / 2, bottom items by by = VIEW_H − 360. At 640×360 the result is the §2.1 / §9.2 numbers exactly.
// validateLayout(L) is the §9.4 checker (logging only; the ?debug F4 overlay draws the same rects).

import { VIEW_W, VIEW_H } from '../config.js';

export const BAND_H = 54;
/**
 * aspect-ratio-spec §4 world-UI clamp box (replaces the fixed hud-layout §2.4 (6, 44, 628, 262)):
 * (sL + 6, y0, (W − sR − 6) − (sL + 6), 306 − y0), y0 = 44 on desktop, band bottom + 2 on touch.
 */
export function spatialFor(L) {
  const S = L.safe, y0 = L.profile === 'touch' ? S.t + BAND_H + 2 : 44;
  const x0 = (L.profile === 'touch' ? S.l : 0) + 6, x1 = (L.profile === 'touch' ? S.r : VIEW_W) - 6;
  return { x: x0, y: y0, w: x1 - x0, h: (VIEW_H - 54) - y0 };
}                 // touch top band height (hud-layout §9.2)
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
  const W = VIEW_W, H = VIEW_H, cx0 = Math.round((W - 640) / 2), rx = W - 640, by = H - 360, CX = Math.round(W / 2);
  const L = { profile: touch ? 'touch' : 'desktop', safe: { l: sl, t: st, r: sr, b: sb }, swapped };
  if (!touch) {
    // hud-layout §2.1 (desktop), §9.5 promotions
    Object.assign(L, {
      hearts: { x: 6, dx: 14, y: 6 },
      relics: { x: 6, y: 22, dx: 18, max: 8, moreX: 150, moreY: 24 },
      track: { labelX: cx0 + 276, pipX: cx0 + 280, pipDx: 9, pipY: 8 },
      modeBadge: { x: cx0 + 258, y: 6, w: 80 },                 // §9.2 desktop addition: T1 right-aligned at (258, 6); tc cluster
      boss: { x: cx0 + 170, y: 17, w: 300, h: 6 },
      miniBoss: { x: cx0 + 230, y: 17, w: 180, h: 6 },          // §9.2 desktop: 300 × miniBossBarScale 0.6, centred on 320
      bossName: { x: CX, y: 3 },
      phaseBanner: { x: CX, y: 27 },                     // §9.6: directly under the bar, y 26–38
      counters: { x: 222, dx: 9, y: by + 347 },                // §9.3 desktop: right of the promoted mana value
      introCard: { y: 60, bars: 16 },                     // §9.6 mini-boss intro card, y 60–110 + 16 px letterbox bars
      right: { x: rx + 634, coinY: 5, bagY: 19 },
      badges: { x: 6, dx: 22, y: by + 334, up: by + 330, glyphY: by + 318 },
      strip: { y: by + 324, cellDx: 19, x0: null },
      chevY: by + 343, rbarY: by + 343,
      mana: { x: 76, y: by + 348, w: 120, h: 6 },
      manaText: { x: 199, y: by + 344 },
      auto: { x: 76, y: by + 312 },
      toast: { mode: 'column', x: rx + 434, w: 200, bottom: by + 354, max: 2 },
      banner: { y: 70 },
      clusters: { tl: [6, 6, 144, 34], tc: [cx0 + 178, 6, 194, 12], tr: [rx + 560, 6, 74, 24], bl: [6, by + 312, 264, 42] },   // tc: mode badge (178–258) + track
      bossCluster: [cx0 + 170, 4, 300, 20],
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
    track: { labelX: cx0 + 352, pipX: cx0 + 356, pipDx: 9, pipY: st + 8 },
    modeBadge: { x: cx0 + 334, y: st + 6, w: 77 },             // §9.2: T1 right-aligned at x 334 (257–334), hidden with the boss bar
    boss: { x: cx0 + 300, y: st + 19, w: 196, h: 6 },
    miniBoss: { x: cx0 + 339, y: st + 19, w: 118, h: 6 },       // §9.2: × miniBossBarScale 0.6, centred on 398
    bossName: { x: cx0 + 398, y: st + 3 },
    phaseBanner: { x: cx0 + 398, y: st + 28 },
    counters: { x: sl + 224, dx: 9, y: st + 46 },         // §9.3 touch: in the top band, right of the mana value
    introCard: { y: st + 60, bars: 16 },
    right: { x: sr - 100, coinY: st + 5, bagY: st + 19 },
    badges: { x: sl + 6, dx: 22, y: st + 26, up: st + 22, glyphY: st + 44 },
    strip: { y: st + 24, cellDx: 19, x0: sl + 76 },
    chevY: st + 43, rbarY: st + 43,
    mana: { x: sl + 76, y: st + 46, w: 120, h: 6 },
    manaText: { x: sl + 199, y: st + 42 },
    auto: null,
    toast: { mode: 'top', x: CX - 140, w: 280, top: st + 56, max: 1 },
    banner: { y: st + 100 },
    // cluster keys follow the HudScene containers: tl = hearts/shield (+ relics' container), bl = the wand cluster (now top-left)
    clusters: { tl: [sl + 6, st + 4, 100, 16], tc: [cx0 + 257, st + 4, 239, 22], tr: [sr - 188, st + 4, 88, 48], bl: [sl + 6, st + 20, 264, 34] },
    bossCluster: [cx0 + 300, st + 2, 196, 24],
    buttons: {
      dash: circ('dash', bx(30), sb - 30),
      swap: circ('swap', bx(30), sb - 80),
      use: circ('use', bx(80), sb - 30),
      pause: sq('pause', sr - 20, st + 20),
      edit: sq('edit', sr - 64, st + 20),
    },
  });
  // aspect-ratio-spec §4.1 — touch band at H < 360 (phones in play): the 54 px band keeps its left / right clusters at
  // the §9.2 y values; the CENTRE thins to one row (y sT+3 … sT+21, centred on W/2): floor track OR boss bar + name,
  // mode badge right-aligned at W/2 − 56. The right cluster (coins, bag, relics ≤ 5) right-aligns to sr − 90.
  if (H < 360) {
    const RX = sr - 90;
    Object.assign(L, {
      track: { labelX: CX - 36, pipX: CX - 32, pipDx: 9, pipY: st + 8 },
      modeBadge: { x: CX - 56, y: st + 6, w: 77 },
      boss: { x: CX - 98, y: st + 14, w: 196, h: 6 },
      miniBoss: { x: CX - 59, y: st + 14, w: 118, h: 6 },
      bossName: { x: CX, y: st + 3 },
      phaseBanner: { x: CX, y: st + 23 },
      right: { x: RX, coinY: st + 5, bagY: st + 19 },
      relics: { x: RX - 18 * 5, y: st + 34, dx: 18, max: 5, moreX: RX - 18 * 5 - 3, moreY: st + 36, moreRight: true },
      bossCluster: [CX - 98, st + 2, 196, 18],
    });
    L.clusters = { ...L.clusters, tc: [CX - 133, st + 2, 231, 18], tr: [RX - 90, st + 4, 90, 48] };
  }
  // aspect-ratio-spec §4 collision fallback: TC overlapping TL/BL or TR → hide the mode badge first, then draw the
  // boss bar at the mini-boss width. (Only reachable at W 640 with notch insets; no shipping phone does both.)
  const tcHits = (x0, y0, w, h) => ['tl', 'bl', 'tr'].some((k) => { const r = L.clusters[k]; return x0 < r[0] + r[2] && r[0] < x0 + w && y0 < r[1] + r[3] && r[1] < y0 + h; });
  if (tcHits(L.modeBadge.x - L.modeBadge.w, L.modeBadge.y, L.modeBadge.w, 10)) L.modeBadge.hidden = true;
  if (tcHits(L.boss.x, L.boss.y, L.boss.w, L.boss.h)) { L.boss = { ...L.miniBoss }; L.bossCluster = [L.miniBoss.x, L.bossCluster[1], L.miniBoss.w, L.bossCluster[3]]; }
  // stick zones: whole viewport below the band (letterbox included → ±∞ horizontally, clamp at use)
  const top = st + BAND_H, BIG = 10000;
  const left = { name: 'zoneL', x: -BIG, y: top, w: BIG + CX, h: BIG };
  const right = { name: 'zoneR', x: CX, y: top, w: BIG, h: BIG };
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
  if (L.modeBadge) persistent.push({ name: 'modeBadge', x: L.modeBadge.x - L.modeBadge.w, y: L.modeBadge.y, w: L.modeBadge.w, h: 10 });
  if (L.miniBoss) persistent.push({ name: 'miniBoss', x: L.miniBoss.x, y: L.miniBoss.y, w: L.miniBoss.w, h: L.miniBoss.h });
  for (const b of [...btns, ...persistent]) if (!inside(b, S)) out.push(`(a) ${b.name} outside safe rect`);
  for (let i = 0; i < btns.length; i++) for (let j = i + 1; j < btns.length; j++) {
    const a = btns[i], b = btns[j];
    const hit = a.kind === 'circle' && b.kind === 'circle' ? Math.hypot(a.cx - b.cx, a.cy - b.cy) < a.r + b.r : inter(a, b);
    if (hit) out.push(`(b) ${a.name} × ${b.name}`);
  }
  for (const z of [L.zones.move, L.zones.aim]) for (const p of persistent) if (inter(p, z)) out.push(`(c) ${p.name} × zone.${z.name}`);
  const toast = { name: 'toast', x: L.toast.x, y: L.toast.top, w: L.toast.w, h: 28 };
  const CX = Math.round(VIEW_W / 2);
  const transients = [toast, { name: 'banner', x: CX - 140, y: L.banner.y, w: 280, h: 26 }];
  if (L.phaseBanner) transients.push({ name: 'phaseBanner', x: L.phaseBanner.x - 100, y: L.phaseBanner.y, w: 200, h: 12 });
  if (L.introCard) transients.push({ name: 'introCard', x: CX - 160, y: L.introCard.y, w: 320, h: 50 });
  for (const tr of transients) if (tr.y + tr.h > S.t + 130) out.push(`(d) ${tr.name} below the top strip`);
  for (const b of btns) if (Math.min(b.w, b.h) < 37) out.push(`(e) ${b.name} hit < 37 px`);
  return out;
}
