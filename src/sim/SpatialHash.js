// sim/SpatialHash.js — uniform grid over hit targets (enemies / boss parts), rebuilt every sim
// step, ZERO allocation (architecture §4). Targets are referenced by index into a caller-owned
// array. A target overlapping several cells is inserted in each; queries de-duplicate with stamps.

export class SpatialHash {
  constructor(cellSize, maxTargets, maxCellsPerTarget = 4) {
    this.cell = cellSize;
    this.inv = 1 / cellSize;
    this.maxNodes = maxTargets * maxCellsPerTarget;
    this.nodeTarget = new Int32Array(this.maxNodes);
    this.nodeNext = new Int32Array(this.maxNodes);
    this.stamp = new Int32Array(maxTargets);
    this.queryId = 0;
    this.nodes = 0;
    this.cols = 1; this.rows = 1; this.ox = 0; this.oy = 0;
    this.head = new Int32Array(1).fill(-1);
  }

  /** Size the grid to a room (world rect). Allocates only on room load. */
  resize(x, y, w, h) {
    this.ox = x; this.oy = y;
    this.cols = Math.max(1, Math.ceil(w * this.inv));
    this.rows = Math.max(1, Math.ceil(h * this.inv));
    const n = this.cols * this.rows;
    if (this.head.length < n) this.head = new Int32Array(n);
    this.clear();
  }

  clear() { this.head.fill(-1); this.nodes = 0; }

  _cx(x) { const c = ((x - this.ox) * this.inv) | 0; return c < 0 ? 0 : c >= this.cols ? this.cols - 1 : c; }
  _cy(y) { const c = ((y - this.oy) * this.inv) | 0; return c < 0 ? 0 : c >= this.rows ? this.rows - 1 : c; }

  insert(index, x, y, r) {
    const x0 = this._cx(x - r), x1 = this._cx(x + r), y0 = this._cy(y - r), y1 = this._cy(y + r);
    for (let cy = y0; cy <= y1; cy++) for (let cx = x0; cx <= x1; cx++) {
      if (this.nodes >= this.maxNodes) return;
      const c = cy * this.cols + cx, n = this.nodes++;
      this.nodeTarget[n] = index;
      this.nodeNext[n] = this.head[c];
      this.head[c] = n;
    }
  }

  /**
   * Visit every target index whose cell overlaps the circle's AABB, once each.
   * `visit(index)` returns true to stop early. Caller does the exact circle test.
   */
  query(x, y, r, visit) {
    const q = ++this.queryId;
    const x0 = this._cx(x - r), x1 = this._cx(x + r), y0 = this._cy(y - r), y1 = this._cy(y + r);
    for (let cy = y0; cy <= y1; cy++) for (let cx = x0; cx <= x1; cx++) {
      for (let n = this.head[cy * this.cols + cx]; n !== -1; n = this.nodeNext[n]) {
        const t = this.nodeTarget[n];
        if (this.stamp[t] === q) continue;
        this.stamp[t] = q;
        if (visit(t)) return;
      }
    }
  }
}
