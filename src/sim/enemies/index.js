// sim/enemies/index.js — boot-time registration of the enemy vocabulary in the effect registry
// (architecture §6). Boot imports this statically so validateEffects() sees every movement key
// (chaser, kiter, swarm, stationary, drifter) and every attack type (melee_swipe, shoot, ring, spiral,
// charge, slam, summon, blink, self_destruct, hazard, sequence) before it walks the data.
import './movement.js';
import './attacks.js';
export { EnemySystem } from './EnemySystem.js';
