// sim/enemies/FlowField.js — tile BFS flow fields toward the player (mechanic-spec §9.1 `chaser`/`kiter`),
// recomputed at rules.enemies.flowFieldHz (4 Hz). Two fields per room:
//   ground — walls, pillars, crates AND pits blocked (world.solidGround)
//   flyer  — walls, pillars, crates blocked; pits open (world.solidAll)
// Zero allocation after the room's first build: typed arrays sized to the room, reused per recompute.
// Sampling returns a unit direction toward the lowest-distance neighbour (8-way, no corner cutting), or
// away from the player (`sign` −1, kiter flee = flow-field inverse).

import { TILE } from '../../config.js';

const UNREACHED = 0x7fff;
// 8-neighbour offsets: orthogonals first (so ties prefer straight moves).
const NX = [1, -1, 0, 0, 1, 1, -1, -1];
const NY = [0, 0, 1, -1, 1, -1, 1, -1];

class Field {
  constructor() { this.dist = null; this.queue = null; this.n = 0; }
  ensure(n) {
    if (this.n !== n) { this.dist = new Int16Array(n); this.queue = new Int32Array(n); this.n = n; }
  }
}

export class FlowField {
  constructor() {
    this.world = null;
    this.ground = new Field();
    this.flyer = new Field();
    this.cols = 0; this.rows = 0;
    this.accMs = 0;
    this.periodMs = 250;
    this.srcTx = -1; this.srcTy = -1;
    this.out = { x: 0, y: 0, ok: false };   // reused sample result
  }

  setWorld(world, hz) {
    this.world = world;
    this.periodMs = 1000 / (hz || 4);
    if (!world) return;
    this.cols = world.cols; this.rows = world.rows;
    const n = this.cols * this.rows;
    this.ground.ensure(n); this.flyer.ensure(n);
    this.srcTx = -1; this.accMs = this.periodMs;   // force a build on the next step
  }

  /** Advance the 4 Hz clock; rebuild both fields when due (or when forced). */
  step(dtMs, px, py, force) {
    if (!this.world) return;
    this.accMs += dtMs;
    if (!force && this.accMs < this.periodMs) return;
    this.accMs = 0;
    const tx = Math.floor(px / TILE), ty = Math.floor(py / TILE);
    this.srcTx = tx; this.srcTy = ty;
    this._bfs(this.ground, this.world.solidGround, tx, ty);
    this._bfs(this.flyer, this.world.solidAll, tx, ty);
  }

  _bfs(f, solid, tx, ty) {
    const cols = this.cols, rows = this.rows, dist = f.dist, q = f.queue;
    dist.fill(UNREACHED);
    if (tx < 0 || ty < 0 || tx >= cols || ty >= rows) return;
    let head = 0, tail = 0;
    const s = ty * cols + tx;
    dist[s] = 0; q[tail++] = s;
    while (head < tail) {
      const i = q[head++];
      const x = i % cols, y = (i - x) / cols, d = dist[i] + 1;
      for (let k = 0; k < 4; k++) {           // 4-way BFS (Manhattan); sampling uses 8-way descent
        const nx = x + NX[k], ny = y + NY[k];
        if (nx < 0 || ny < 0 || nx >= cols || ny >= rows) continue;
        const j = ny * cols + nx;
        if (solid[j] || dist[j] !== UNREACHED) continue;
        dist[j] = d; q[tail++] = j;
      }
    }
  }

  /**
   * Direction for an actor at (x, y). sign +1 = toward the player, −1 = away (flee).
   * @returns {{x:number,y:number,ok:boolean}} the shared `out` object (read immediately)
   */
  sample(x, y, flyer, sign = 1) {
    const out = this.out; out.ok = false; out.x = 0; out.y = 0;
    if (!this.world || this.srcTx < 0) return out;
    const f = flyer ? this.flyer : this.ground;
    const solid = flyer ? this.world.solidAll : this.world.solidGround;
    const cols = this.cols, rows = this.rows, dist = f.dist;
    const tx = Math.floor(x / TILE), ty = Math.floor(y / TILE);
    if (tx < 0 || ty < 0 || tx >= cols || ty >= rows) return out;
    const here = dist[ty * cols + tx];
    let best = -1, bestD = here === UNREACHED ? (sign > 0 ? UNREACHED : -1) : here;
    for (let k = 0; k < 8; k++) {
      const nx = tx + NX[k], ny = ty + NY[k];
      if (nx < 0 || ny < 0 || nx >= cols || ny >= rows) continue;
      const j = ny * cols + nx;
      if (solid[j]) continue;
      if (k >= 4 && (solid[ty * cols + nx] || solid[ny * cols + tx])) continue;   // no corner cutting
      const d = dist[j];
      if (d === UNREACHED) continue;
      if (sign > 0 ? d < bestD : d > bestD) { bestD = d; best = k; }
    }
    if (best < 0) return out;
    const cx = (tx + NX[best]) * TILE + TILE / 2, cy = (ty + NY[best]) * TILE + TILE / 2;
    const dx = cx - x, dy = cy - y, l = Math.sqrt(dx * dx + dy * dy);
    if (l < 1e-3) return out;
    out.x = dx / l; out.y = dy / l; out.ok = true;
    return out;
  }

  /** Tile distance to the player (UNREACHED → Infinity). */
  distance(x, y, flyer) {
    if (!this.world) return Infinity;
    const f = flyer ? this.flyer : this.ground;
    const tx = Math.floor(x / TILE), ty = Math.floor(y / TILE);
    if (tx < 0 || ty < 0 || tx >= this.cols || ty >= this.rows) return Infinity;
    const d = f.dist[ty * this.cols + tx];
    return d === UNREACHED ? Infinity : d;
  }
}
