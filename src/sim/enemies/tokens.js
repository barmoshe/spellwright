// sim/enemies/tokens.js — style-guide §2.4 tint/decal tokens (the dev maps NAMES; hexes live only here),
// state-graph-spec R7 anchor classes, and per-actor bindings (art-slot-map G1/G2 clip classes, cue families).
// Pure data + tiny math helpers. No Phaser import.

export const COL = Object.freeze({
  flash: 0xffffff,          // FILL
  frostTint: 0x8fd8ff,      // MULTIPLY (frozen, R5 p3)
  chill1: 0xcae6f5,         // MULTIPLY (chill 1 stack, R5 p6)
  chill2: 0x9fd0e8,         // MULTIPLY (chill 2 stacks)
  hotMid: 0x4a1526,         // ADD telegraph-hot signal target
  hotPeak: 0x9f294e,        // ADD telegraph-hot peak (lock window)
  invuln: 0xb8b8c8,         // MULTIPLY (spawn, boss intro/phase-shift, R5 p5)
  fill: 0xdc4a7b,           // telegraph-fill
  rim: 0xfdd0d6,            // telegraph-rim outer keyline
  rimDark: 0x222222,        // telegraph-rim inner keyline / world outline
  eliteGold: 0xfacb3e,      // elite-gold
  fizzle: 0x8a8a8a,         // interrupted-windup grey (telegraphs §1.5)
  corpse: 0x606060,         // corpse MULTIPLY (telegraphs §4.1)
  invulnWhite: 0xe8e8f0,    // phase shockwave ring (invuln grey-white, telegraphs §2.12)
  aura: 0x5a3a8a,           // phase-shift aura pulse (state-graph §4)
  portal: 0x9f294e,         // spawn portal (hostile LUT)
  portalHi: 0xf78697,
  shadow: 0x0b0a10,
});

/** Element hues (style-guide §4.1 enemy rims + player element ramps) for glows, motes, muzzle, particles. */
export const EL_HUE = Object.freeze({ arcane: 0xfdd0d6, frost: 0x72d6ce, poison: 0x97da3f, fire: 0xee8e2e, shock: 0xfacb3e });

/** Hazard pools (art-slot-map `zones.hazard.*`): fill, alpha, inner rim. */
export const HAZARD_LOOK = Object.freeze({
  poison: { fill: 0x3d734f, alpha: 0.5, inner: 0x97da3f, particle: 'bubble', cue: 'hazard_on_acid' },
  fire: { fill: 0x8f4029, alpha: 0.5, inner: 0xee8e2e, particle: 'ember', cue: 'hazard_on_fire' },
});

/** R7 anchors, offsets from the FEET point (origin 0.5, 1.0). Bodies sit at `core` (flyers: + hover). */
export const ANCHOR = Object.freeze({
  tiny: { core: -3, hand: [2, -3], head: -9, shadow: [8, 2], ring: [12, 4] },
  small: { core: -6, hand: [4, -5], head: -15, shadow: [10, 3], ring: [14, 5] },
  tall: { core: -8, hand: [4, -8], head: -21, shadow: [10, 3], ring: [14, 5] },
  boss: { core: -14, hand: [9, -14], head: -34, shadow: [22, 5], ring: [26, 7] },
  lich: { core: -16, hand: [8, -16], head: -44, shadow: [22, 5], ring: [26, 7] },
});
export const FLYER_HOVER_PX = 6;

/**
 * Actor bindings (state-graph-spec §3.1 table + art-slot-map classes). `family` → cue-spec kill_<family>.
 * death: ground | flyer | wraith | slime | imp | golem  (telegraphs §4).
 */
export const ACTOR = Object.freeze({
  bat: { cls: 'small', clip: 'C', family: 'flesh', death: 'flyer' },
  skeleton: { cls: 'small', clip: 'A', family: 'bone', death: 'ground' },
  cultist: { cls: 'tall', clip: 'A', family: 'caster', death: 'ground' },
  frost_mage: { cls: 'tall', clip: 'A', family: 'caster', death: 'ground', mote: 0x72d6ce, moteMs: 400 },
  brute: { cls: 'tall', clip: 'A', family: 'flesh', death: 'ground' },
  slime: { cls: 'small', clip: 'B', family: 'slime', death: 'slime' },
  slimelet: { cls: 'tiny', clip: 'B', family: 'slime', death: 'ground', jiggle: true },
  fire_imp: { cls: 'small', clip: 'A', family: 'flesh', death: 'ground', mote: 0xee8e2e, moteMs: 300 },
  eye_turret: { cls: 'small', clip: 'D', family: 'construct', death: 'ground', blink: true },
  wraith: { cls: 'small', clip: 'A', family: 'spirit', death: 'wraith', alpha: 0.85 },
  necromancer: { cls: 'tall', clip: 'B', family: 'caster', death: 'ground' },
  skull: { cls: 'small', clip: 'D', family: 'bone', death: 'flyer', trail: true },
  stone_golem: { cls: 'boss', clip: 'A', family: 'construct', death: 'golem', idleFpsMult: 0.75, heavySteps: true },
  ossuary_knight: { cls: 'boss', clip: 'A', family: 'bone', death: 'boss', weapon: 'blade', roar: 'boss_roar_knight' },
  mire_queen: { cls: 'boss', clip: 'A', family: 'flesh', death: 'boss', roar: 'boss_roar_queen' },
  archlich: { cls: 'lich', clip: 'B', family: 'caster', death: 'boss', base: 2, weapon: 'staff', roar: 'boss_roar_lich' },
});
export const actorOf = (id) => ACTOR[id] || { cls: 'small', clip: 'A', family: 'flesh', death: 'ground' };

// ---------------------------------------------------------------- math helpers (no allocation)
export const DEG = Math.PI / 180;
export const TAU = Math.PI * 2;
/** R4: quantize a scale to 1/8 steps. */
export const q8 = (s) => Math.round(s * 8) / 8;
export const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);
export const quadIn = (t) => t * t;
export const quadOut = (t) => t * (2 - t);
export const cubicOut = (t) => { const u = t - 1; return u * u * u + 1; };
export function lerpColor(a, b, t) {
  t = clamp(t, 0, 1);
  const r = ((a >> 16) & 255) + ((((b >> 16) & 255) - ((a >> 16) & 255)) * t);
  const g = ((a >> 8) & 255) + ((((b >> 8) & 255) - ((a >> 8) & 255)) * t);
  const bl = (a & 255) + (((b & 255) - (a & 255)) * t);
  return ((r | 0) << 16) | ((g | 0) << 8) | (bl | 0);
}
/** Smallest signed angle difference a−b in (−π, π]. */
export function angDiff(a, b) {
  let d = (a - b) % TAU;
  if (d > Math.PI) d -= TAU; else if (d <= -Math.PI) d += TAU;
  return d;
}
/** Distance from point (px,py) to segment (ax,ay)-(bx,by). */
export function distToSeg(px, py, ax, ay, bx, by) {
  const dx = bx - ax, dy = by - ay, l2 = dx * dx + dy * dy;
  let t = l2 > 0 ? ((px - ax) * dx + (py - ay) * dy) / l2 : 0;
  t = clamp(t, 0, 1);
  const qx = ax + dx * t - px, qy = ay + dy * t - py;
  return Math.sqrt(qx * qx + qy * qy);
}
