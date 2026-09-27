// sim/World.js — one room: grid → collision masks, markers, raycasts, walkable queries, and the
// room's static rendering (floor/walls/pits/pillars/crates/doors). Rooms are NOT scenes (scene-flow §1):
// RoomDirector builds a World per room and destroys it on exit.
//
// Legend (rooms.json): # wall · . floor · o pillar (blocks all) · ~ pit (blocks walkers; shots/flyers pass)
//   b crate (6 HP, blocks all until broken) · P player · x enemy spawn · d single door (2 tiles, row 0)
//   D choice doors (left pair, right pair) · c pedestal · B boss spawn
//
// Masks: SOLID_ALL (walls, pillars, crates, closed doors, bookshelves) blocks everything; GROUND = SOLID_ALL | pits.
//
// Worlds (specs/design/worlds.md; style-guide §12; tileset JSON `worlds` block): the room is drawn with the floor's
// `world.tileset` (per-world floor tiles + weights, W2 deep-water pits + shallow water + moss overlay, W3 parquet +
// north-face wall shelves) and per-world props (W1 candles/bone piles/cobwebs, W2 fountains/drains/drips, W3
// candelabras/piles/lectern/rune circle). The world twist (floors[].world.twist, appliesTo room kinds) is built here:
//   flooded     → `water` layer (walkable; ×moveMult for walkers; shock arcs; quench) — see inWater()
//   bookshelves → `SHELF` cells (a pillar variant with HP; fire → burning → collapse; blast → collapse)
//   candlelight → `lights` (candle light pools) consumed by RoomDirector's darkness layer
// Water is NOT a cell kind (it stays CELL.FLOOR for every mask/flow-field query); it lives in `this.water`.

import { TILE, DEPTH } from '../config.js';
import { Art } from '../core/art.js';

export const CELL = { FLOOR: 0, WALL: 1, PILLAR: 2, PIT: 3, CRATE: 4, DOOR: 5, SHELF: 6 };
const FLOOR_TINT = { 1: 0xffffff, 2: 0xc9d6e6, 3: 0xe6c9d0 };   // placeholder floor themes (style-guide §6.2; TA LUTs replace)
const DIRS4 = [['n', 0, -1], ['e', 1, 0], ['s', 0, 1], ['w', -1, 0]];
/** Per-world decor (art-slot-map.json → worlds.*.props / placement; style-guide §12). Counts are [min, max] per room. */
const WORLD_PROPS = {
  w1_sunken_crypt: { doorLight: 'torch', bonePiles: [1, 3], cobwebs: 4 },
  w2_drowned_halls: { doorLight: 'fountain', drains: 6, drips: [1, 2] },
  w3_last_library: { doorLight: 'torch', candelabra: [2, 4], piles: [1, 3], lectern: 0.5, rune: 0.5 },
};
const P_W1 = 'worlds.w1_sunken_crypt.props', P_W2 = 'worlds.w2_drowned_halls.props', P_W3 = 'worlds.w3_last_library.props';

export class World {
  /**
   * @param {Phaser.Scene} scene
   * @param {object} tpl   rooms.json template
   * @param {object} opts  { floor, rng (fx stream for decor), crateHp,
   *                         world (floors[].world), roomKind ('combat'|'elite'|'puzzle'|...), tutorial,
   *                         layoutRng (run stream: twist placement), forceTwist (harness: a world-twist record) }
   */
  constructor(scene, tpl, opts) {
    this.scene = scene;
    this.tpl = tpl;
    this.floor = opts.floor || 1;
    this.cols = tpl.width; this.rows = tpl.height;
    this.w = this.cols * TILE; this.h = this.rows * TILE;
    const n = this.cols * this.rows;
    this.cell = new Uint8Array(n);
    this.solidAll = new Uint8Array(n);
    this.solidGround = new Uint8Array(n);
    this.crateHp = new Map();
    this.markers = { player: null, spawns: [], pedestals: [], boss: null, doors: [] };
    const doorCells = [];
    for (let y = 0; y < this.rows; y++) {
      const row = tpl.grid[y];
      for (let x = 0; x < this.cols; x++) {
        const ch = row[x], i = y * this.cols + x;
        const cx = x * TILE + TILE / 2, cy = y * TILE + TILE / 2;
        let c = CELL.FLOOR;
        switch (ch) {
          case '#': c = CELL.WALL; break;
          case 'o': c = CELL.PILLAR; break;
          case '~': c = CELL.PIT; break;
          case 'b': c = CELL.CRATE; this.crateHp.set(i, opts.crateHp || 6); break;
          case 'd': case 'D': c = CELL.DOOR; doorCells.push({ x, y, ch }); break;
          case 'P': this.markers.player = { x: cx, y: cy }; break;
          case 'x': this.markers.spawns.push({ x: cx, y: cy }); break;
          case 'c': this.markers.pedestals.push({ x: cx, y: cy }); break;
          case 'B': this.markers.boss = { x: cx, y: cy }; break;
          default: break;
        }
        this.cell[i] = c;
      }
    }
    this._groupDoors(doorCells);
    if (!this.markers.player) this.markers.player = { x: this.w / 2, y: this.h - 3 * TILE };
    // ---- world + twist (worlds.md §3; numbers from floors[].world.twist)
    this.worldDef = opts.world || null;
    this.worldId = (this.worldDef && this.worldDef.id) || null;
    this.texKey = (this.worldDef && this.worldDef.tileset) || `tiles_f${this.floor}`;
    this.roomKind = opts.roomKind || null;
    const tw = opts.forceTwist || (this.worldDef && this.worldDef.twist) || null;
    this.twist = tw && (opts.forceTwist || (!opts.tutorial && (tw.appliesTo || []).includes(this.roomKind))) ? tw : null;
    this.water = null; this.waterCount = 0; this.waterMoveMult = 1; this.quench = false; this.arc = null; this.flyersIgnoreWater = true;
    this.shelves = null; this.shelfCfg = null;
    this.candlelight = null;
    this.lights = [];            // candle light pools {x, y} (candlelight darkness cookies)
    this.anim = [];              // tile-index swap groups (W2 water + deep-water pits; Phaser tilemaps don't animate)
    if (this.twist) {
      const lr = opts.layoutRng || opts.rng;
      if (this.twist.id === 'flooded') this._placeWater(tpl, this.twist, lr);
      else if (this.twist.id === 'bookshelves') this._placeShelves(this.twist, lr, !!opts.forceTwist);
      else if (this.twist.id === 'candlelight') this.candlelight = this.twist;
    }
    this._rebuildMasks();
    this._render(opts.rng);
  }

  // ---------------------------------------------------------------- world twists (worlds.md §3.2 / §3.3)
  /** Flooded: every floor tile within waterFromPitsTiles of a pit + puddlesPerRoom puddles of puddleRadiusTiles (run stream). */
  _placeWater(tpl, tw, rng) {
    const cols = this.cols, rows = this.rows, water = new Uint8Array(cols * rows);
    const never = new Set(tw.neverOn || ['P', 'd', 'D', 'c', 'B', 'x']);
    const ok = (x, y) => x >= 1 && y >= 1 && x < cols - 1 && y < rows - 1 && this.cell[y * cols + x] === CELL.FLOOR && !never.has(tpl.grid[y][x]);
    const R = tw.waterFromPitsTiles ?? 1;
    const cands = [];
    for (let y = 1; y < rows - 1; y++) for (let x = 1; x < cols - 1; x++) {
      if (!ok(x, y)) continue;
      cands.push(x, y);
      let pit = false;
      for (let oy = -R; oy <= R && !pit; oy++) for (let ox = -R; ox <= R; ox++) { const i = this.idx(x + ox, y + oy); if (i >= 0 && this.cell[i] === CELL.PIT) { pit = true; break; } }
      if (pit) water[y * cols + x] = 1;
    }
    const [lo, hi] = tw.puddlesPerRoom || [1, 3];
    const count = rng ? rng.range(lo, hi) : lo;
    const pr = tw.puddleRadiusTiles ?? 2;
    for (let k = 0; k < count && cands.length; k++) {
      const c = rng ? rng.int(cands.length / 2) * 2 : 0;
      const cx = cands[c], cy = cands[c + 1];
      for (let oy = -pr; oy <= pr; oy++) for (let ox = -pr; ox <= pr; ox++) if (ox * ox + oy * oy <= pr * pr && ok(cx + ox, cy + oy)) water[(cy + oy) * cols + cx + ox] = 1;
    }
    let n = 0; for (let i = 0; i < water.length; i++) n += water[i];
    if (!n) return;
    this.water = water; this.waterCount = n;
    this.waterMoveMult = tw.moveMult ?? 0.8;
    this.flyersIgnoreWater = tw.flyersIgnore !== false;
    this.quench = tw.waterQuenchesBurn !== false;
    this.arc = { r: tw.shockArcRadiusPx ?? 40, mult: tw.shockArcDamageMult ?? 0.5 };
  }

  /** Bookshelves: pillarToShelfChance of the room's pillars become SHELF cells (run stream). Forced (harness) → ≥ 1. */
  _placeShelves(tw, rng, forced) {
    const pillars = [];
    for (let i = 0; i < this.cell.length; i++) if (this.cell[i] === CELL.PILLAR) pillars.push(i);
    const p = tw.pillarToShelfChance ?? 0.5;
    const pick = [];
    for (const i of pillars) if (rng ? rng.chance(p) : false) pick.push(i);
    if (forced && !pick.length && pillars.length) pick.push(pillars[0]);
    if (!pick.length) return;
    this.shelfCfg = { hp: tw.shelfHp ?? 12, burnMs: tw.burnDurationMs ?? 2500, auraR: tw.burnAuraRadiusPx ?? 24, blast: tw.blastDestroys !== false };
    this.shelves = new Map();
    for (const i of pick) { this.cell[i] = CELL.SHELF; this.shelves.set(i, { hp: this.shelfCfg.hp, burnMs: 0, tickMs: 0, sprite: null, glow: null }); }
  }

  /** True when (x, y) is a shallow-water cell (flooded twist). */
  inWater(x, y) {
    if (!this.water) return false;
    const i = this.idx(Math.floor(x / TILE), Math.floor(y / TILE));
    return i >= 0 && this.water[i] === 1;
  }
  isShelfAt(x, y) { if (!this.shelves) return -1; const i = this.idx(Math.floor(x / TILE), Math.floor(y / TILE)); return i >= 0 && this.cell[i] === CELL.SHELF ? i : -1; }
  cellCenter(i) { return { x: (i % this.cols) * TILE + TILE / 2, y: Math.floor(i / this.cols) * TILE + TILE / 2 }; }
  /** Shelf cell indices whose centre lies within r (+ half a tile) of (x, y). */
  shelvesInRadius(x, y, r) {
    const out = [];
    if (!this.shelves) return out;
    for (const i of this.shelves.keys()) { const c = this.cellCenter(i); if (Math.hypot(c.x - x, c.y - y) <= r + TILE / 2) out.push(i); }
    return out;
  }
  /**
   * A player hit on a shelf: fire → ignite ('ignite'); other damage chips its HP ('chip' | 'collapse' at 0).
   * A burning shelf ignores further hits (it collapses when its burn ends). Returns null if nothing happened.
   */
  hitShelf(i, dmg, fire) {
    const sh = this.shelves && this.shelves.get(i);
    if (!sh || sh.burnMs > 0) return null;
    if (fire) {
      sh.burnMs = this.shelfCfg.burnMs; sh.tickMs = 0;
      const s = this.scene, c = this.cellCenter(i);
      if (sh.sprite && s.anims.exists('world_bookshelf_burning')) sh.sprite.play('world_bookshelf_burning');
      else if (sh.sprite) sh.sprite.setTint(0xee8e2e);
      const gA = Art.getQuiet('authored.glow_16');
      sh.glow = s.add.image(c.x, c.y - 8, gA ? gA.key : 'ph-glow', gA ? gA.frame : undefined).setBlendMode(1).setTint(0xee8e2e).setAlpha(0.5).setDepth(DEPTH.projectilesAdd);
      return 'ignite';
    }
    sh.hp -= dmg;
    if (sh.hp <= 0) { this.collapseShelf(i); return 'collapse'; }
    const spr = sh.sprite;
    if (spr) { spr.setTint(0xffffff).setTintMode(1); this.scene.time.delayedCall(50, () => spr.active && spr.clearTint()); }
    return 'chip';
  }
  /** Shelf → floor debris (cell becomes FLOOR; masks + collision layers rebuilt). */
  collapseShelf(i) {
    const sh = this.shelves && this.shelves.get(i);
    if (!sh) return false;
    this.shelves.delete(i);
    this.cell[i] = CELL.FLOOR;
    if (sh.sprite) sh.sprite.destroy();
    if (sh.glow) sh.glow.destroy();
    const c = this.cellCenter(i);
    const a = Art.getQuiet('authored.bookshelf_collapsed');
    if (a) this.objects.push(this.scene.add.image(c.x, c.y, a.key, a.frame).setDepth(DEPTH.decals));
    this._rebuildMasks();
    return true;
  }
  /** Burning shelves (sim step): onAura(x, y, r) every auraTickMs while burning; onCollapse(x, y) when the burn ends. */
  stepShelves(dt, auraTickMs, onAura, onCollapse) {
    if (!this.shelves) return;
    for (const [i, sh] of this.shelves) {
      if (sh.burnMs <= 0) continue;
      sh.burnMs -= dt; sh.tickMs -= dt;
      const c = this.cellCenter(i);
      if (sh.tickMs <= 0) { sh.tickMs += auraTickMs; onAura(c.x, c.y, this.shelfCfg.auraR); }
      if (sh.burnMs <= 0 && this.collapseShelf(i)) onCollapse(c.x, c.y);
    }
  }

  /** Render-frame tile animation (W2 shallow water + deep-water pits, `fps` from the tileset JSON). */
  animate(nowMs, reduced) {
    if (!this.anim.length || reduced) return;
    for (const g of this.anim) {
      const f = Math.floor((nowMs * g.fps) / 1000) % g.frames.length;
      if (f === g.f) continue;
      g.f = f;
      for (let k = 0; k < g.cells.length; k += 2) g.layer.putTileAt(g.frames[f], g.cells[k], g.cells[k + 1]);
    }
  }

  // ---------------------------------------------------------------- doors
  _groupDoors(cells) {
    // Adjacent door cells on the same row pair up into one 2-tile door.
    cells.sort((a, b) => a.y - b.y || a.x - b.x);
    const used = new Set();
    for (const c of cells) {
      const k = `${c.x},${c.y}`;
      if (used.has(k)) continue;
      const mate = cells.find((o) => o.y === c.y && o.x === c.x + 1 && !used.has(`${o.x},${o.y}`));
      used.add(k);
      const tiles = [c];
      if (mate) { used.add(`${mate.x},${mate.y}`); tiles.push(mate); }
      const cx = ((tiles[0].x + tiles[tiles.length - 1].x + 1) / 2) * TILE;
      this.markers.doors.push({ tiles, x: cx, y: c.y * TILE + TILE / 2, kind: c.ch === 'D' ? 'choice' : 'single', open: false, option: null, sprite: null });
    }
    const choice = this.markers.doors.filter((d) => d.kind === 'choice').sort((a, b) => a.x - b.x);
    choice.forEach((d, i) => { d.side = i === 0 ? 'left' : 'right'; });
    this.markers.doors.filter((d) => d.kind === 'single').forEach((d) => { d.side = 'center'; });
  }

  /** Assign options to doors and open them. options: [{roomKind, reward}] — 1 → centre/left door, 2 → left/right. */
  openDoors(options) {
    const singles = this.markers.doors.filter((d) => d.kind === 'single');
    const choices = this.markers.doors.filter((d) => d.kind === 'choice');
    let targets = options.length >= 2 && choices.length >= 2 ? choices : singles.length ? singles : choices;
    if (options.length === 1 && !singles.length) targets = [choices[0]];
    targets.forEach((d, i) => { if (options[i]) { d.option = options[i]; d.open = true; } });
    for (const d of this.markers.doors) if (d.open) for (const t of d.tiles) this.cell[t.y * this.cols + t.x] = CELL.FLOOR;
    this._rebuildMasks();
    this._refreshDoorVisuals();
    return this.markers.doors.filter((d) => d.open);
  }

  // ---------------------------------------------------------------- masks & queries
  _rebuildMasks() {
    for (let i = 0; i < this.cell.length; i++) {
      const c = this.cell[i];
      const all = c === CELL.WALL || c === CELL.PILLAR || c === CELL.CRATE || c === CELL.DOOR || c === CELL.SHELF;
      this.solidAll[i] = all ? 1 : 0;
      this.solidGround[i] = all || c === CELL.PIT ? 1 : 0;
    }
    this._syncCollisionLayers();
  }

  idx(tx, ty) { return tx < 0 || ty < 0 || tx >= this.cols || ty >= this.rows ? -1 : ty * this.cols + tx; }
  cellAt(x, y) { const i = this.idx((x / TILE) | 0, (y / TILE) | 0); return i < 0 ? CELL.WALL : this.cell[i]; }
  /** Out of bounds counts as solid — except the band above an OPEN door (row −1), so the player can exit. */
  blocksShots(x, y) { const i = this.idx(Math.floor(x / TILE), Math.floor(y / TILE)); return i < 0 ? true : this.solidAll[i] === 1; }
  blocksGround(x, y) { const i = this.idx(Math.floor(x / TILE), Math.floor(y / TILE)); return i < 0 ? true : this.solidGround[i] === 1; }
  isCrateAt(x, y) { const i = this.idx(Math.floor(x / TILE), Math.floor(y / TILE)); return i >= 0 && this.cell[i] === CELL.CRATE ? i : -1; }

  /**
   * Tile raycast (DDA). mask 'all' (walls/pillars/crates; pits don't block) or 'ground' (also pits).
   * @returns {number} distance to the first blocking cell boundary, or the full length if clear.
   */
  raycast(x0, y0, x1, y1, mask = 'all') {
    const grid = mask === 'ground' ? this.solidGround : this.solidAll;
    const dx = x1 - x0, dy = y1 - y0, len = Math.hypot(dx, dy);
    if (len < 1e-6) return 0;
    const stepLen = 4;
    const n = Math.ceil(len / stepLen);
    for (let k = 1; k <= n; k++) {
      const t = Math.min(1, k / n);
      const px = x0 + dx * t, py = y0 + dy * t;
      const i = this.idx(Math.floor(px / TILE), Math.floor(py / TILE));
      if (i < 0 || grid[i]) return Math.max(0, len * ((k - 1) / n));
    }
    return len;
  }
  hasLos(x0, y0, x1, y1) { return this.raycast(x0, y0, x1, y1, 'all') >= Math.hypot(x1 - x0, y1 - y0) - 0.5; }

  /** Nearest walkable (ground) tile centre to (x, y) within `radiusTiles`, or null. */
  nearestWalkable(x, y, radiusTiles) {
    const tx = Math.floor(x / TILE), ty = Math.floor(y / TILE);
    let best = null, bd = Infinity;
    for (let oy = -radiusTiles; oy <= radiusTiles; oy++) for (let ox = -radiusTiles; ox <= radiusTiles; ox++) {
      const i = this.idx(tx + ox, ty + oy);
      if (i < 0 || this.solidGround[i]) continue;
      const cx = (tx + ox) * TILE + TILE / 2, cy = (ty + oy) * TILE + TILE / 2;
      const d = (cx - x) ** 2 + (cy - y) ** 2;
      if (d < bd) { bd = d; best = { x: cx, y: cy }; }
    }
    return best;
  }

  /** Random walkable tile centre (ai/run stream), optionally ≥ minDist from (px,py), ≥ wallClear tiles from walls, and passing opt.filter(x, y). */
  randomWalkable(rng, opt = {}) {
    const cands = [];
    for (let ty = 1; ty < this.rows - 1; ty++) for (let tx = 1; tx < this.cols - 1; tx++) {
      const i = ty * this.cols + tx;
      if ((opt.flyer ? this.solidAll[i] : this.solidGround[i])) continue;
      const cx = tx * TILE + TILE / 2, cy = ty * TILE + TILE / 2;
      if (opt.minDist && opt.from && Math.hypot(cx - opt.from.x, cy - opt.from.y) < opt.minDist) continue;
      if (opt.maxDist && opt.from && Math.hypot(cx - opt.from.x, cy - opt.from.y) > opt.maxDist) continue;
      if (opt.wallClear && !this._clearAround(tx, ty, opt.wallClear)) continue;
      if (opt.filter && !opt.filter(cx, cy)) continue;
      cands.push({ x: cx, y: cy });
    }
    return cands.length ? rng.pick(cands) : null;
  }
  _clearAround(tx, ty, r) {
    for (let oy = -r; oy <= r; oy++) for (let ox = -r; ox <= r; ox++) { const i = this.idx(tx + ox, ty + oy); if (i < 0 || this.solidAll[i]) return false; }
    return true;
  }

  /** Damage a crate at cell index i; returns true when it breaks. */
  hitCrate(i, dmg) {
    if (!this.crateHp.has(i)) return false;
    const hp = this.crateHp.get(i) - dmg;
    const spr = this.crateSprites && this.crateSprites.get(i);
    if (hp > 0) {
      this.crateHp.set(i, hp);
      if (spr) { spr.setTint(0xffffff).setTintMode(1); this.scene.time.delayedCall(50, () => spr.active && spr.clearTint()); }
      return false;
    }
    this.crateHp.delete(i);
    this.cell[i] = CELL.FLOOR;
    if (spr) { spr.destroy(); this.crateSprites.delete(i); }
    this._rebuildMasks();
    return true;
  }

  // ---------------------------------------------------------------- Arcade collision layers
  /** Two invisible tilemap layers: `all` (blocks everyone) and `ground` (all + pits, walkers only). */
  _syncCollisionLayers() {
    if (!this.map) {
      const data = [];
      for (let y = 0; y < this.rows; y++) { const r = []; for (let x = 0; x < this.cols; x++) r.push(0); data.push(r); }
      this.map = this.scene.make.tilemap({ data, tileWidth: TILE, tileHeight: TILE });
      const ts = this.map.addTilesetImage('sw-collide', 'sw-collide', TILE, TILE, 0, 0);
      this.layerAll = this.map.createBlankLayer('all', ts, 0, 0).setVisible(false);
      this.layerGround = this.map.createBlankLayer('ground', ts, 0, 0).setVisible(false);
    }
    for (let y = 0; y < this.rows; y++) for (let x = 0; x < this.cols; x++) {
      const i = y * this.cols + x;
      this.layerAll.putTileAt(this.solidAll[i] ? 1 : 0, x, y);
      this.layerGround.putTileAt(this.solidGround[i] ? 1 : 0, x, y);
    }
    this.layerAll.setCollision(1);
    this.layerGround.setCollision(1);
  }

  // ---------------------------------------------------------------- rendering
  _render(rng) {
    this.objects = [];
    this.crateSprites = new Map();
    const ts = this.scene.registry.get('tileset');
    const texKey = this.scene.textures.exists(this.texKey) ? this.texKey : `tiles_f${this.floor}`;
    if (ts && this.scene.textures.exists(texKey)) this._renderTileset(ts, texKey, rng);
    else this._renderFallback(rng);
    this._renderProps(rng);
    this._refreshDoorVisuals();
  }

  /** TA tileset path (assets/ATLAS-KEYS.md "Tilemap tileset"): floors by weight (never two cracked tiles
   *  orthogonally adjacent), shadow fringe under walls, 47-blob wall autotile (bottom on `walls`, top overhang on
   *  `wallTops` at depth 80), pit void + north lip. One tilemap, three layers. */
  _renderTileset(ts, texKey, rng) {
    const s = this.scene, ix = ts.index;
    const WD = (ts.worlds && ts.worlds[texKey]) || null;       // tileset JSON `worlds` block (TA): per-world tile rules
    const map = this.visMap = s.make.tilemap({ width: this.cols, height: this.rows + 1, tileWidth: TILE, tileHeight: TILE });
    const tset = map.addTilesetImage('tiles', texKey, TILE, TILE, ts.margin, ts.spacing);
    const floor = map.createBlankLayer('floor', tset, 0, -TILE).setDepth(DEPTH.floor);
    const walls = map.createBlankLayer('walls', tset, 0, -TILE).setDepth(DEPTH.floor + 1);
    const tops = map.createBlankLayer('wallTops', tset, 0, -TILE).setDepth(DEPTH.wallTops);
    this.objects.push(floor, walls, tops);
    const layer = (name, depth) => { const l = map.createBlankLayer(name, tset, 0, -TILE).setDepth(depth); this.objects.push(l); return l; };
    const isWallish = (x, y) => { if (x < 0 || y < 0 || x >= this.cols || y >= this.rows) return true; const c = this.cell[y * this.cols + x]; return c === CELL.WALL || c === CELL.DOOR; };
    // floor tiles: the world's list + weights (W1/W2 = the 0x72 floor_1..8 set, W3 = parquet); primary = entry 0
    const floorList = WD && WD.floor ? WD.floor.map((t, k) => ({ t, weight: (WD.floorWeights && WD.floorWeights[k]) ?? 1 }))
      : Object.keys(ts.floorWeights).map((k) => ({ t: ix[k], weight: ts.floorWeights[k] }));
    const primary = floorList[0].t;
    const fringe = !WD || !WD.floor || WD.floor.includes(ix.floor_1);          // the stone shadow fringe only under stone floors
    const pitDef = WD && WD.pit;
    const pitFrames = Array.isArray(pitDef) ? pitDef : pitDef && pitDef.frames ? pitDef.frames : [ix.pit_void];
    const pitLip = WD && WD.pitLip != null ? WD.pitLip : ix.edge_down;
    // shallow water: the world's rule (W2), else the shared tileset indices (identical layout on every tileset; harness-forced water)
    const WA = !this.water ? null : WD && WD.water ? WD.water : ix.water_0 != null
      ? { frames: [ix.water_0, ix.water_1, ix.water_2], fps: 4, edges: { n: ix.water_edge_n, e: ix.water_edge_e, s: ix.water_edge_s, w: ix.water_edge_w } } : null;
    const pitCells = [], waterCells = [];
    const cracked = new Uint8Array(this.cols * this.rows);
    for (let y = 0; y < this.rows; y++) for (let x = 0; x < this.cols; x++) {
      const i = y * this.cols + x, c = this.cell[i];
      const Y = y + 1;                                          // layers are offset one row up for wall tops
      if (c === CELL.WALL || c === CELL.DOOR) {
        const N = isWallish(x, y - 1), E = isWallish(x + 1, y), S = isWallish(x, y + 1), W = isWallish(x - 1, y);
        let m = (N ? 1 : 0) | (E ? 4 : 0) | (S ? 16 : 0) | (W ? 64 : 0);
        if (N && E && isWallish(x + 1, y - 1)) m |= 2;
        if (S && E && isWallish(x + 1, y + 1)) m |= 8;
        if (S && W && isWallish(x - 1, y + 1)) m |= 32;
        if (N && W && isWallish(x - 1, y - 1)) m |= 128;
        const pair = ts.wallLookup[m] || ts.wallLookup['0'];
        walls.putTileAt(pair[0], x, Y);
        if (pair[1] >= 0) tops.putTileAt(pair[1], x, Y - 1);
        continue;
      }
      if (c === CELL.PIT) {
        const north = this.idx(x, y - 1);
        if (north >= 0 && this.cell[north] !== CELL.PIT && this.cell[north] !== CELL.WALL) floor.putTileAt(pitLip, x, Y);
        else { floor.putTileAt(pitFrames[0], x, Y); pitCells.push(x, Y); }
        continue;
      }
      if (WA && this.water[i]) { floor.putTileAt(WA.frames[0], x, Y); waterCells.push(x, Y); continue; }
      // floor (pillar/crate/shelf cells get floor under them)
      if (fringe && y > 0 && isWallish(x, y - 1) && ix[`floor_atlas_${10 + (x % 4)}`] != null) { floor.putTileAt(ix[`floor_atlas_${10 + (x % 4)}`], x, Y); continue; }
      let pick = rng ? rng.weighted(floorList).t : primary;
      if (pick !== primary && ((x > 0 && cracked[i - 1]) || (y > 0 && cracked[i - this.cols]))) pick = primary;
      if (pick !== primary) cracked[i] = 1;
      floor.putTileAt(pick, x, Y);
    }
    // W2: deep-water pits + shallow water animate by tile-index swap (tileset JSON fps)
    if (pitDef && pitDef.frames && pitDef.frames.length > 1 && pitCells.length) this.anim.push({ layer: floor, frames: pitDef.frames, fps: pitDef.fps || 4, cells: pitCells, f: 0 });
    if (WA) {
      if (WA.frames.length > 1 && waterCells.length) this.anim.push({ layer: floor, frames: WA.frames, fps: WA.fps || 4, cells: waterCells, f: 0 });
      // edge tile on each side of a water cell that borders walkable floor (one overlay layer per side, only if used)
      const edges = {};
      for (let k = 0; k < waterCells.length; k += 2) {
        const x = waterCells[k], y = waterCells[k + 1] - 1;
        for (const [d, dx, dy] of DIRS4) {
          const j = this.idx(x + dx, y + dy);
          if (j < 0 || this.water[j]) continue;
          const cj = this.cell[j];
          if (cj === CELL.WALL || cj === CELL.DOOR || cj === CELL.PIT) continue;
          const tile = WA.edges && WA.edges[d];
          if (tile == null) continue;
          (edges[d] || (edges[d] = layer(`waterEdge_${d}`, DEPTH.floor + 0.4))).putTileAt(tile, x, y + 1);
        }
      }
    }
    // W2: moss overlay on `coverage` of floor cells, never within 1 tile of a door or a spawn (fx stream)
    const OV = WD && WD.floorOverlay;
    if (OV && OV.tiles && OV.tiles.length && rng) {
      const near = this._nearMarkers(1);
      let ov = null;
      for (let y = 1; y < this.rows - 1; y++) for (let x = 1; x < this.cols - 1; x++) {
        const i = y * this.cols + x;
        if (this.cell[i] !== CELL.FLOOR || (this.water && this.water[i]) || near[i]) continue;
        if (!rng.chance(OV.coverage ?? 0.12)) continue;
        (ov || (ov = layer('floorOverlay', DEPTH.floor + 0.3))).putTileAt(rng.pick(OV.tiles), x, y + 1);
      }
    }
    // W3: a shelf overlay on every north-face wall tile (S neighbour is not a wall), except door-frame and torch cells
    const WS = WD && WD.wallShelf;
    if (WS && WS.tile != null) {
      const skip = new Set();
      for (const d of this.markers.doors) {
        const y = d.tiles[0].y, a = d.tiles[0].x, b = d.tiles[d.tiles.length - 1].x;
        for (const x of [a - 2, a - 1, b + 1, b + 2]) skip.add(y * this.cols + x);
      }
      const sh = layer('wallShelf', DEPTH.floor + 1.5);
      for (let y = 0; y < this.rows - 1; y++) for (let x = 0; x < this.cols; x++) {
        const i = y * this.cols + x;
        if (this.cell[i] !== CELL.WALL || skip.has(i)) continue;
        const below = this.cell[i + this.cols];
        if (below === CELL.WALL || below === CELL.DOOR) continue;
        sh.putTileAt(WS.tile, x, y + 1);
      }
    }
  }

  /** Cells within `r` tiles (Chebyshev) of any door or marker (player, spawn, pedestal, boss). */
  _nearMarkers(r) {
    const near = new Uint8Array(this.cols * this.rows);
    const mark = (tx, ty) => { for (let oy = -r; oy <= r; oy++) for (let ox = -r; ox <= r; ox++) { const j = this.idx(tx + ox, ty + oy); if (j >= 0) near[j] = 1; } };
    const pt = (p) => p && mark(Math.floor(p.x / TILE), Math.floor(p.y / TILE));
    pt(this.markers.player); pt(this.markers.boss);
    for (const p of this.markers.spawns) pt(p);
    for (const p of this.markers.pedestals) pt(p);
    for (const d of this.markers.doors) for (const t of d.tiles) mark(t.x, t.y);
    return near;
  }

  _renderFallback(rng) {
    const s = this.scene;
    const g = s.add.graphics().setDepth(DEPTH.floor);
    const wallG = s.add.graphics().setDepth(DEPTH.wallTops);
    this.objects.push(g, wallG);
    const tint = FLOOR_TINT[this.floor] || 0xffffff;
    for (let y = 0; y < this.rows; y++) for (let x = 0; x < this.cols; x++) {
      const c = this.cell[y * this.cols + x], X = x * TILE, Y = y * TILE;
      if (c === CELL.PIT) { g.fillStyle(0x0d0a10, 1).fillRect(X, Y, TILE, TILE); continue; }
      if (this.water && this.water[y * this.cols + x]) { g.fillStyle(0x314152, 1).fillRect(X, Y, TILE, TILE); continue; }   // style-guide §12.1 shallow water
      if (c === CELL.WALL || c === CELL.DOOR) {
        const below = this.idx(x, y + 1);
        if (below >= 0 && this.cell[below] !== CELL.WALL) { g.fillStyle(multiply(0x5a4a48, tint), 1).fillRect(X, Y, TILE, TILE); g.fillStyle(multiply(0x6d5a57, tint), 1).fillRect(X, Y, TILE, 2); }
        else wallG.fillStyle(multiply(0x2a2123, tint), 1).fillRect(X, Y, TILE, TILE);
        continue;
      }
      g.fillStyle(multiply([0x3b302f, 0x362b2a, 0x3e3231][(x * 7 + y * 13) % 3], tint), 1).fillRect(X, Y, TILE, TILE);
    }
  }

  /** Pillars (y-sorted, feet on the cell), crates, torches flanking doors, north-wall decor (style-guide §6.1). */
  _renderProps(rng) {
    const s = this.scene;
    Art.floor = this.floor;
    for (let y = 0; y < this.rows; y++) for (let x = 0; x < this.cols; x++) {
      const i = y * this.cols + x, c = this.cell[i];
      const fx = x * TILE + 8, fy = y * TILE + 16;
      if (c === CELL.PILLAR) {
        const a = Art.getQuiet('tiles.pillar', 0);
        const im = a ? s.add.image(fx, fy, a.key, a.frame) : s.add.image(fx, fy, 'ph-pillar');
        im.setOrigin(0.5, 1).setDepth(DEPTH.actors + fy / 10000);
        this.objects.push(im);
      } else if (c === CELL.CRATE) {
        const a = Art.getQuiet('tiles.crate', 0);
        const im = a ? s.add.image(fx, fy, a.key, a.frame) : s.add.image(fx, fy, 'ph-crate');
        im.setOrigin(0.5, 1).setDepth(DEPTH.actors + fy / 10000);
        this.crateSprites.set(i, im);
      } else if (c === CELL.SHELF) {                                           // W3 bookshelf (16×32, feet on the cell, y-sorted)
        const a = Art.getQuiet('worlds.w3_last_library.bookshelf', rng ? rng.int(2) : 0) || Art.getQuiet('authored.bookshelf_a') || Art.getQuiet('tiles.pillar', 0);
        const im = a ? s.add.sprite(fx, fy, a.key, a.frame) : s.add.sprite(fx, fy, 'ph-pillar');
        im.setOrigin(0.5, 1).setDepth(DEPTH.actors + fy / 10000);
        this.shelves.get(i).sprite = im;
      }
    }
    const WP = WORLD_PROPS[this.worldId] || null;
    // door lights: a mirrored pair flanking each door on the north wall — torches (animated `tiles_torch`, W1/W3) or
    // W2's blue wall fountains (top / mid / basin, glow_32 ADD #72d6ce α 0.25; art-slot-map worlds.w2 light)
    const fountain = WP && WP.doorLight === 'fountain' && s.anims.exists('tiles_wall_fountain_mid') && Art.getQuiet('tiles.wall_fountain', 0);
    const hasTorch = s.anims.exists('tiles_torch');
    const gA = Art.getQuiet('authored.glow_32');
    const glow = (x, y, tint, alpha) => this.objects.push(s.add.image(x, y, gA ? gA.key : 'ph-glow', gA ? gA.frame : undefined).setBlendMode(1).setTint(tint).setAlpha(alpha).setDepth(DEPTH.projectilesAdd));
    for (const d of this.markers.doors) {
      const x0 = d.tiles[0].x * TILE, x1 = (d.tiles[d.tiles.length - 1].x + 1) * TILE, y = d.tiles[0].y * TILE + 8;
      for (const tx of [x0 - 24, x1 + 24]) {
        if (tx < 8 || tx > this.w - 8) continue;
        if (fountain) {
          const top = Art.getQuiet('tiles.wall_fountain', 0);
          this.objects.push(s.add.image(tx, y - TILE, top.key, top.frame).setDepth(DEPTH.wallTops + 1));
          const mid = s.add.sprite(tx, y, top.key).play({ key: 'tiles_wall_fountain_mid', startFrame: rng ? rng.int(3) : 0 }).setDepth(DEPTH.wallTops + 1);
          this.objects.push(mid);
          if (s.anims.exists('tiles_wall_fountain_basin')) this.objects.push(s.add.sprite(tx, y + TILE, top.key).play({ key: 'tiles_wall_fountain_basin', startFrame: rng ? rng.int(3) : 0 }).setDepth(DEPTH.floor + 2));
          glow(tx, y + 8, 0x72d6ce, 0.25);
          continue;
        }
        const t = hasTorch ? s.add.sprite(tx, y, Art.get('tiles.torch', 0).key).play({ key: 'tiles_torch', startFrame: rng ? rng.int(8) : 0 }) : null;
        if (t) {
          t.setDepth(DEPTH.wallTops + 1); this.objects.push(t);
          glow(tx, y + 2, 0xee8e2e, 0.35);                                                // torch-light ADD #ee8e2e α 0.35
        }
      }
    }
    if (WP && rng) this._worldProps(WP, rng, glow);
    // north-wall decor ≤ 1 per 6 tiles (per-floor set)
    const decor = { 1: [0, 4, 5], 2: [1, 6], 3: [3, 0, 5] }[this.floor] || [0];
    for (let x = 2; x < this.cols - 2; x += 6) {
      if (!rng || !rng.chance(0.6)) continue;
      if (this.cell[x] !== CELL.WALL || (this.idx(x, 1) >= 0 && this.cell[this.cols + x] === CELL.WALL)) continue;
      if (this.markers.doors.some((d) => d.tiles.some((t) => Math.abs(t.x - x) <= 2))) continue;
      const a = Art.getQuiet('tiles.wall_decor', rng.pick(decor));
      if (a) this.objects.push(s.add.image(x * TILE + 8, 8, a.key, a.frame).setDepth(DEPTH.floor + 2));
    }
  }

  /**
   * Per-world decor (art-slot-map worlds.*.placement; style-guide §12): never blocks, never on a marker / door / water
   * cell or the reward centre. W1 candles (candlePerRoom from the candlelight twist data) also register light pools.
   */
  _worldProps(WP, rng, glow) {
    const s = this.scene, cols = this.cols, rows = this.rows;
    const near = this._nearMarkers(1);
    const cx0 = Math.floor(cols / 2), cy0 = Math.floor(rows / 2);
    for (let oy = -2; oy <= 2; oy++) for (let ox = -2; ox <= 2; ox++) { const j = this.idx(cx0 + ox, cy0 + oy); if (j >= 0) near[j] = 1; }
    const used = new Uint8Array(cols * rows);
    const free = (x, y) => {
      const i = this.idx(x, y);
      return i >= 0 && x > 0 && y > 0 && x < cols - 1 && y < rows - 1 && this.cell[i] === CELL.FLOOR && !near[i] && !used[i]
        && !(this.water && this.water[i]) && this.tpl.grid[y][x] === '.';
    };
    const solidAt = (x, y) => { const j = this.idx(x, y); const c = j < 0 ? CELL.WALL : this.cell[j]; return c === CELL.WALL || c === CELL.PILLAR || c === CELL.SHELF; };
    const byWall = [], open = [];
    for (let y = 1; y < rows - 1; y++) for (let x = 1; x < cols - 1; x++) {
      if (!free(x, y)) continue;
      open.push(x, y);
      if (solidAt(x, y - 1) || solidAt(x + 1, y) || solidAt(x - 1, y) || solidAt(x, y + 1)) byWall.push(x, y);
    }
    const take = (list) => {
      for (let n = 0; n < 16 && list.length; n++) {
        const k = rng.int(list.length / 2) * 2, x = list[k], y = list[k + 1];
        if (free(x, y)) { used[y * cols + x] = 1; return { x, y, cx: x * TILE + 8, cy: y * TILE + 8, fy: y * TILE + 15 }; }
      }
      return null;
    };
    const count = (r) => (Array.isArray(r) ? rng.range(r[0], r[1]) : rng.chance(r || 0) ? 1 : 0);
    const img = (id, i, x, y, depth) => { const a = Art.getQuiet(id, i); if (!a) return null; const im = s.add.image(x, y, a.key, a.frame).setDepth(depth); this.objects.push(im); return im; };
    const spr = (key, id, frames, x, y, depth) => {
      const a = Art.getQuiet(id, 0); if (!a) return null;
      const sp = s.add.sprite(x, y, a.key, a.frame).setDepth(depth);
      if (s.anims.exists(key)) sp.play({ key, startFrame: rng.int(frames) });
      this.objects.push(sp); return sp;
    };
    const g16 = Art.getQuiet('authored.glow_16');
    const glow16 = (x, y, tint, alpha) => this.objects.push(s.add.image(x, y, g16 ? g16.key : 'ph-glow', g16 ? g16.frame : undefined).setBlendMode(1).setTint(tint).setAlpha(alpha).setDepth(DEPTH.projectilesAdd));
    const wallSlot = (x) => x > 1 && x < cols - 2 && this.cell[x] === CELL.WALL && this.cell[cols + x] !== CELL.WALL && this.cell[cols + x] !== CELL.DOOR
      && !this.markers.doors.some((d) => d.tiles.some((t) => Math.abs(t.x - x) <= 3));

    if (this.worldId === 'w1_sunken_crypt') {
      const cl = this.worldDef && this.worldDef.twist && this.worldDef.twist.id === 'candlelight' ? this.worldDef.twist : null;
      const n = count((cl && cl.candlesPerRoom) || [3, 6]);
      for (let k = 0; k < n; k++) {
        const c = take(byWall); if (!c) break;
        const sp = spr('world_candles', `${P_W1}.candles`, 3, c.cx, c.fy, DEPTH.actors + c.fy / 10000);
        if (!sp) break;
        sp.setOrigin(0.5, 1);
        glow16(c.cx, c.fy - 8, 0xee8e2e, 0.35);
        this.lights.push({ x: c.cx, y: c.fy - 8 });
      }
      for (let k = count(WP.bonePiles); k > 0; k--) { const c = take(open); if (c) img(`${P_W1}.bone_pile`, 0, c.cx, c.cy, DEPTH.floor + 2); }
      let webs = 0;                                                         // cobwebs: NW / NE inner corners only
      for (let y = 1; y < rows - 1 && webs < WP.cobwebs; y++) for (let x = 1; x < cols - 1 && webs < WP.cobwebs; x++) {
        const i = y * cols + x;
        if (this.cell[i] !== CELL.FLOOR || this.cell[i - cols] !== CELL.WALL) continue;
        const nw = this.cell[i - 1] === CELL.WALL, ne = this.cell[i + 1] === CELL.WALL;
        if (!nw && !ne) continue;
        const im = img(`${P_W1}.cobweb`, 0, x * TILE + 8, y * TILE + 8, DEPTH.floor + 2);
        if (im && ne && !nw) im.setFlipX(true);
        webs++;
      }
    } else if (this.worldId === 'w2_drowned_halls') {
      let drains = 0;                                                       // sewer drains on the north wall (x ≡ 5 mod 12, between banners)
      for (let x = 5; x < cols - 2 && drains < WP.drains; x += 12) {
        if (!wallSlot(x)) continue;
        if (spr('world_drain', `${P_W2}.drain`, 8, x * TILE + 8, 8, DEPTH.floor + 2)) { glow(x * TILE + 8, 16, 0x72d6ce, 0.25); drains++; }
      }
      const slots = [];
      for (let x = 11; x < cols - 2; x += 12) if (wallSlot(x)) slots.push(x);
      for (let k = count(WP.drips); k > 0 && slots.length; k--) {
        const x = slots.splice(rng.int(slots.length), 1)[0];
        spr('world_drip', `${P_W2}.drip`, 4, x * TILE + 8, 8, DEPTH.floor + 2);
      }
    } else if (this.worldId === 'w3_last_library') {
      for (let k = count(WP.candelabra); k > 0; k--) {
        const c = take(byWall); if (!c) break;
        const sp = spr('world_candelabra', `${P_W3}.candelabra`, 3, c.cx, c.fy, DEPTH.actors + c.fy / 10000);
        if (sp) { sp.setOrigin(0.5, 1); glow16(c.cx, c.fy - 10, 0xfacb3e, 0.35); }
      }
      for (let k = count(WP.piles); k > 0; k--) { const c = take(open); if (c) img(rng.chance(0.5) ? `${P_W3}.scroll_pile` : `${P_W3}.book_pile`, 0, c.cx, c.cy, DEPTH.floor + 2); }
      if (count(WP.lectern)) { const c = take(open); const im = c && img(`${P_W3}.lectern`, 0, c.cx, c.fy, DEPTH.actors + c.fy / 10000); if (im) im.setOrigin(0.5, 1); }
      if (count(WP.rune)) {                                                 // rune circle: 32×32 on a free 2×2, static violet glow
        for (let n = 0; n < 16 && open.length; n++) {
          const k = rng.int(open.length / 2) * 2, x = open[k], y = open[k + 1];
          if (!free(x, y) || !free(x + 1, y) || !free(x, y + 1) || !free(x + 1, y + 1)) continue;
          for (const [ox, oy] of [[0, 0], [1, 0], [0, 1], [1, 1]]) used[(y + oy) * cols + x + ox] = 1;
          if (img(`${P_W3}.rune_circle`, 0, (x + 1) * TILE, (y + 1) * TILE, DEPTH.floor + 2)) glow((x + 1) * TILE, (y + 1) * TILE, 0x5956bd, 0.2);
          break;
        }
      }
    }
  }

  _refreshDoorVisuals() {
    const s = this.scene;
    for (const d of this.markers.doors) {
      if (d.sprite) d.sprite.destroy();
      const x0 = d.tiles[0].x * TILE, y0 = d.tiles[0].y * TILE, w = d.tiles.length * TILE;
      const c = s.add.container(0, 0).setDepth(DEPTH.wallTops + 1);
      const leafId = d.open ? 'tiles.door.states.open' : d.locked ? 'tiles.door.states.locked' : 'tiles.door.states.closed';
      const leaf = Art.getQuiet(leafId, 0);
      if (leaf) {
        c.add(s.add.image(x0, y0 + TILE, leaf.key, leaf.frame).setOrigin(0, 1).setDisplaySize(w, 32));
        const L = Art.getQuiet('tiles.door.frame', 0), Tp = Art.getQuiet('tiles.door.frame', 1), R = Art.getQuiet('tiles.door.frame', 2);
        if (L) c.add(s.add.image(x0 - 16, y0 + TILE, L.key, L.frame).setOrigin(0, 1));
        if (R) c.add(s.add.image(x0 + w, y0 + TILE, R.key, R.frame).setOrigin(0, 1));
        if (Tp) c.add(s.add.image(x0, y0 - 16, Tp.key, Tp.frame).setOrigin(0, 1).setDisplaySize(w, 16));
        if (!d.open && !d.option) c.list.forEach((o) => o.setTint && o.setTint(0x7a6a70).setTintMode(0));   // door-locked (MULTIPLY) while the room is live
      } else {
        const g = s.add.graphics(); c.add(g);
        g.fillStyle(0x1c1618, 1).fillRect(x0 - 2, y0 - 4, w + 4, 4);
        g.fillStyle(0x4a3c3a, 1).fillRect(x0 - 2, y0, 2, TILE).fillRect(x0 + w, y0, 2, TILE);
        if (d.open) { g.fillStyle(0x0d0a10, 1).fillRect(x0, y0, w, TILE); }
        else { g.fillStyle(0x6d4b27, 1).fillRect(x0, y0, w, TILE); g.fillStyle(0x7a6a70, 0.6).fillRect(x0, y0, w, TILE); }
      }
      d.sprite = c;
    }
  }

  destroy() {
    for (const o of this.objects || []) o.destroy();
    if (this.visMap) this.visMap.destroy();
    for (const d of this.markers.doors) if (d.sprite) d.sprite.destroy();
    if (this.crateSprites) for (const s of this.crateSprites.values()) s.destroy();
    if (this.shelves) for (const sh of this.shelves.values()) { if (sh.sprite) sh.sprite.destroy(); if (sh.glow) sh.glow.destroy(); }
    if (this.map) this.map.destroy();
  }
}

function multiply(c, t) {
  if (t === 0xffffff) return c;
  const r = (((c >> 16) & 255) * ((t >> 16) & 255)) / 255, g = (((c >> 8) & 255) * ((t >> 8) & 255)) / 255, b = ((c & 255) * (t & 255)) / 255;
  return ((r | 0) << 16) | ((g | 0) << 8) | (b | 0);
}
