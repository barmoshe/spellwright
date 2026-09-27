// config.js — engine constants (specs/engine/architecture.md §2). NOT feel numbers: feel values
// come verbatim from specs/design/feel-spec.md via core/tunables.js; content numbers come from
// data/*.json via core/db.js. Only engine-structural constants live here.

export const VIEW_W = 640;          // internal resolution (architecture §3)
export const VIEW_H = 360;
export const TILE = 16;             // px, tile grid of the dungeon packs
export const SIM_HZ = 60;           // fixed sim step; designer `frames` == sim steps 1:1
export const SIM_DT = 1 / SIM_HZ;   // s

// Entity caps (architecture §2 / §11). Pools are prewarmed to these sizes.
export const MAX_PROJECTILES = 512; // budget: 400 live
export const MAX_ENEMIES = 64;      // budget: 40 live
export const CAST_INSTRUCTION_CAP = 64;
export const TRIGGER_DEPTH_CAP = 6;

// Spatial hash cell for projectile-vs-enemy queries (architecture §4).
export const HASH_CELL = 32;

// Depth bands (architecture §9). Actors add y/10000 for y-sorting inside their band.
export const DEPTH = {
  floor: 0,
  decals: 10,
  shadows: 20,
  pickups: 30,
  actors: 40,
  projectiles: 60,
  projectilesAdd: 61,   // ALL additive-blend sprites share this band => one blend switch per frame
  enemyProjectiles: 62, // above the player ADD band so 200 glows can't wash one out (style-guide §4.1)
  fx: 70,
  wallTops: 80,
};

// Debug mode: ?debug in the URL. Enables stress mode (F2), perf overlay default, tunables read-tracking.
export const DEBUG = typeof location !== 'undefined' && /[?&]debug\b/.test(location.search);

export const GAME_ID = 'spellwright';
