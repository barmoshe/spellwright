// core/pool.js — generic free-list pool (architecture §11: zero steady-state allocation).
// Objects are created up-front by `factory`, handed out by acquire(), returned by release().
// Nothing is destroyed mid-run; the owning scene destroys the pool on shutdown.

export class Pool {
  /**
   * @param {() => T} factory     creates one inactive object
   * @param {number} size         prewarm count == hard cap
   * @param {(o:T) => void} [onRelease] resets an object when returned
   * @template T
   */
  constructor(factory, size, onRelease) {
    this.items = new Array(size);
    this.free = new Array(size);
    this.onRelease = onRelease || null;
    for (let i = 0; i < size; i++) {
      const o = factory(i);
      o.__poolIndex = i;
      o.__live = false;
      this.items[i] = o;
      this.free[i] = o;
    }
    this.freeCount = size;
    this.refused = 0;           // acquire() calls rejected at cap (logged by owner, never silent)
  }

  get size() { return this.items.length; }
  get liveCount() { return this.items.length - this.freeCount; }

  /** @returns {T|null} null when the pool is exhausted (cap reached) */
  acquire() {
    if (this.freeCount === 0) { this.refused++; return null; }
    const o = this.free[--this.freeCount];
    this.free[this.freeCount] = null;
    o.__live = true;
    return o;
  }

  release(o) {
    if (!o.__live) return;      // double-release guard
    o.__live = false;
    if (this.onRelease) this.onRelease(o);
    this.free[this.freeCount++] = o;
  }

  releaseAll() {
    for (let i = 0; i < this.items.length; i++) if (this.items[i].__live) this.release(this.items[i]);
  }

  /** iterate live objects without allocating */
  forEachLive(fn) {
    const items = this.items;
    for (let i = 0; i < items.length; i++) if (items[i].__live) fn(items[i]);
  }

  destroy(destroyFn) {
    if (destroyFn) for (const o of this.items) destroyFn(o);
    this.items.length = 0; this.free.length = 0; this.freeCount = 0;
  }
}
