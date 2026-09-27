// ui/nav.js — one focus model for every modal screen (screen-graph §3.1, accessibility-spec §6).
//
//   const nav = new FocusNav(scene, { layer, isActive: () => flow.top() === scene.scene.key });
//   nav.add({ id, x, y, w, h, onConfirm, onLeft?, onRight?, onFocus?, nav?:{up,down,left,right}, disabled? })
//   nav.handle(action)  // one UI intent from router.consumeUI(); returns true if consumed
//
// - Directional focus is SPATIAL: the nearest focusable in the pressed direction by centre distance,
//   weighted 2:1 against the off-axis offset. Explicit `nav` neighbours override it (ids, null = stop).
//   Wrap-around only inside explicit 1-D lists (linkList(..., wrap:true)).
// - Mouse hover moves focus ONLY on real pointer motion (a parked cursor never steals focus).
// - Left click = focus + confirm (item.onClick if given). Right click = item.onRightClick or nav.onBack.
// - Focus ring = kit.drawFocus (1 px gold + 1 px dark), tweened 50 ms (ui-focus-move); snaps under reduced motion.
// Rects are in the coordinates of `layer` (a Container, default the scene root at 0,0).

import { drawFocus } from './kit.js';
import { reduced } from './draw.js';

export class FocusNav {
  constructor(scene, opts = {}) {
    this.scene = scene;
    this.layer = opts.layer || null;
    this.isActive = opts.isActive || (() => true);
    this.onBack = opts.onBack || null;
    this.onMove = opts.onMove || null;          // (item) => void — sound + detail refresh
    this.mixer = scene.registry.get('mixer');
    this.items = new Map();
    this.order = [];
    this.current = null;
    this.ringOn = opts.ring !== false;
    this.ring = scene.add.graphics().setDepth(opts.depth ?? 900);
    if (this.layer) this.layer.add(this.ring);
    this.ringRect = null;
    this._tw = null;
    this._last = { x: -1, y: -1 };
    this.suspended = false;

    const input = scene.input;
    this._onMove = (p) => {
      if (!this._live()) return;
      if (p.x === this._last.x && p.y === this._last.y) return;     // real motion only
      this._last.x = p.x; this._last.y = p.y;
      if (this.onPointerMove) this.onPointerMove(p);
      const it = this.hit(p.x, p.y);
      if (it && !it.noHover && !it.clickOnly && it.id !== this.current) this.focus(it.id);
    };
    this._onDown = (p) => {
      if (!this._live()) return;
      if (this.onPointerDown && this.onPointerDown(p) === true) return;
      const it = this.hit(p.x, p.y);
      if (p.button === 2) {
        if (it && it.onRightClick) { it.onRightClick(p); return; }
        if (this.onBack) this.onBack('mouse');
        return;
      }
      if (p.button !== 0 || !it) return;
      if (it.clickOnly) { if (it.onClick) it.onClick(p); return; }
      if (it.id !== this.current) this.focus(it.id, { silent: true });
      if (it.onClick) it.onClick(p); else this.confirm();
    };
    this._onUp = (p) => { if (this._live() && this.onPointerUp) this.onPointerUp(p); };
    this._onWheel = (p, over, dx, dy) => { if (this._live() && this.onWheel) this.onWheel(p, dy); };
    input.on('pointermove', this._onMove);
    input.on('pointerdown', this._onDown);
    input.on('pointerup', this._onUp);
    input.on('wheel', this._onWheel);
    scene.events.once('shutdown', () => this.destroy());
  }

  _live() { return !this.suspended && this.isActive(); }

  /** Layer offset (a moving panel container shifts every rect). */
  _off() { return this.layer ? { x: this.layer.x, y: this.layer.y } : { x: 0, y: 0 }; }

  add(item) {
    if (!this.items.has(item.id)) this.order.push(item.id);
    this.items.set(item.id, item);
    return item;
  }
  remove(id) { this.items.delete(id); this.order = this.order.filter((k) => k !== id); if (this.current === id) this.current = null; }
  clear(prefix) {
    for (const id of [...this.order]) if (!prefix || id.startsWith(prefix)) this.remove(id);
    if (!this.current) this._drawRing(null);
  }
  get(id) { return this.items.get(id); }
  has(id) { return this.items.has(id) && !this.items.get(id).hidden; }
  cur() { return this.current ? this.items.get(this.current) : null; }

  /** Explicit 1-D list: fills nav.up/down (axis 'v') or nav.left/right (axis 'h'); wrap on request. */
  linkList(ids, axis = 'v', wrap = true) {
    const [prev, next] = axis === 'v' ? ['up', 'down'] : ['left', 'right'];
    ids.forEach((id, i) => {
      const it = this.items.get(id); if (!it) return;
      it.nav = it.nav || {};
      it.nav[prev] = i > 0 ? ids[i - 1] : wrap ? ids[ids.length - 1] : (it.nav[prev] ?? null);
      it.nav[next] = i < ids.length - 1 ? ids[i + 1] : wrap ? ids[0] : (it.nav[next] ?? null);
    });
  }

  hit(px, py) {
    const o = this._off();
    for (let i = this.order.length - 1; i >= 0; i--) {
      const it = this.items.get(this.order[i]);
      if (!it || it.hidden || it.noPointer) continue;
      const x = it.x + o.x, y = it.y + o.y;
      if (px >= x && px < x + it.w && py >= y && py < y + it.h) return it;
    }
    return null;
  }

  focus(id, { silent = false, snap = false } = {}) {
    const it = this.items.get(id);
    if (!it || it.hidden) return false;
    const prev = this.current;
    this.current = id;
    if (prev && prev !== id) { const p = this.items.get(prev); if (p && p.onBlur) p.onBlur(); }
    if (it.onFocus) it.onFocus(it);
    this._drawRing(it, snap || !prev);
    if (!silent && prev !== id && this.mixer) this.mixer.fire('ui_move');
    if (this.onMove) this.onMove(it, prev);
    return true;
  }

  /** Re-draw the ring (after a rect moved, e.g. scroll). */
  refresh() { const it = this.cur(); this._drawRing(it, true); }

  _drawRing(it, snap) {
    if (!this.ringOn) return;
    if (!it || it.noRing) { this.ring.clear(); this.ringRect = null; return; }
    const to = { x: it.x, y: it.y, w: it.w, h: it.h };
    if (this._tw) { this._tw.stop(); this._tw = null; }
    if (snap || !this.ringRect || reduced()) { this.ringRect = { ...to }; this._paint(); return; }
    const r = this.ringRect;
    this._tw = this.scene.tweens.add({ targets: r, x: to.x, y: to.y, w: to.w, h: to.h, duration: 50, ease: 'Cubic.easeOut',
      onUpdate: () => this._paint(), onComplete: () => { Object.assign(r, to); this._paint(); } });
  }
  _paint() {
    const r = this.ringRect;
    this.ring.clear();
    if (r) drawFocus(this.ring, Math.round(r.x), Math.round(r.y), Math.round(r.w), Math.round(r.h));
  }
  hideRing(b) { this.ring.setVisible(!b); }
  /** Keep the ring above content built after the nav (containers draw in child order). */
  raise() { if (this.layer) this.layer.bringToTop(this.ring); else this.ring.setDepth(900); }

  /** Spatial neighbour of `from` in direction dir. */
  neighbour(from, dir) {
    const it = this.items.get(from);
    if (!it) return this.order.find((k) => { const o = this.items.get(k); return !o.hidden && !o.clickOnly && !o.noKeyNav && !o.offscreen; }) || null;
    if (it.nav && dir in it.nav) {
      let n = it.nav[dir];
      if (typeof n === 'function') n = n();
      // skip hidden explicit targets by falling through to spatial search
      if (n === null) return null;
      if (n && this.has(n)) return n;
    }
    const cx = it.x + it.w / 2, cy = it.y + it.h / 2;
    let best = null, bestScore = Infinity;
    for (const id of this.order) {
      if (id === from) continue;
      const o = this.items.get(id);
      if (o.hidden || o.noKeyNav || o.clickOnly) continue;
      if (it.scope && o.scope !== it.scope) continue;
      const ox = o.x + o.w / 2, oy = o.y + o.h / 2;
      const dx = ox - cx, dy = oy - cy;
      let along, off;
      if (dir === 'right') { along = dx; off = dy; } else if (dir === 'left') { along = -dx; off = dy; }
      else if (dir === 'down') { along = dy; off = dx; } else { along = -dy; off = dx; }
      if (along <= 2) continue;
      const score = along + 2 * Math.abs(off);
      if (score < bestScore) { bestScore = score; best = id; }
    }
    return best;
  }

  move(dir) {
    const it = this.cur();
    if (it && it.onDir && it.onDir(dir) === true) return true;
    const n = this.neighbour(this.current, dir);
    if (n) { this.focus(n); return true; }
    return false;
  }

  confirm() {
    const it = this.cur();
    if (!it) return false;
    if (it.disabled) { if (it.onDenied) it.onDenied(); else if (this.mixer) this.mixer.fire('ui_denied'); return true; }
    if (it.onConfirm) { it.onConfirm(it); return true; }
    return false;
  }

  /** Handle one UI intent. left/right go to item.onLeft/onRight (sliders) before spatial movement. */
  handle(a) {
    const it = this.cur();
    if (a === 'up' || a === 'down') return this.move(a);
    if (a === 'left' || a === 'right') {
      const fn = it && (a === 'left' ? it.onLeft : it.onRight);
      if (fn) { fn(it); return true; }
      return this.move(a);
    }
    if (a === 'confirm') return this.confirm();
    return false;
  }

  destroy() {
    const input = this.scene.input;
    if (!input) return;
    input.off('pointermove', this._onMove);
    input.off('pointerdown', this._onDown);
    input.off('pointerup', this._onUp);
    input.off('wheel', this._onWheel);
  }
}
