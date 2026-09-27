// sim/World.js — one room: grid → collision masks, markers, raycasts, walkable queries, and the
// room's static rendering (floor/walls/pits/pillars/crates/doors). Rooms are NOT scenes (scene-flow §1):
// RoomDirector builds a World per room and destroys it on exit.
//
// Legend (rooms.json): # wall · . floor · o pillar (blocks all) · ~ pit (blocks walkers; shots/flyers pass)
//   b crate (6 HP, blocks all until broken) · P player · x enemy spawn · d single door (2 tiles, row 0)
//   D choice doors (left pair, right pair) · c pedestal · B boss spawn
//
// Masks: SOLID_ALL (walls, pillars, crates, closed doors) blocks everything; GROUND = SOLID_ALL | pits.

import { TILE, DEPTH } from '../config.js';
import { Art } from '../core/art.js';

export const CELL = { FLOOR: 0, WALL: 1, PILLAR: 2, PIT: 3, CRATE: 4, DOOR: 5 };
const FLOOR_TINT = { 1: 0xffffff, 2: 0xc9d6e6, 3: 0xe6c9d0 };   // placeholder floor themes (style-guide §6.2; TA LUTs replace)

export class World {
  /**
   * @param {Phaser.Scene} scene
   * @param {object} tpl   rooms.json template
   * @param {object} opts  { floor, rng (fx stream for decor), crateHp }
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
    this._rebuildMasks();
    this._render(opts.rng);
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
      const all = c === CELL.WALL || c === CELL.PILLAR || c === CELL.CRATE || c === CELL.DOOR;
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

  /** Random walkable tile centre (ai/run stream), optionally ≥ minDist from (px,py) and ≥ wallClear tiles from walls. */
  randomWalkable(rng, opt = {}) {
    const cands = [];
    for (let ty = 1; ty < this.rows - 1; ty++) for (let tx = 1; tx < this.cols - 1; tx++) {
      const i = ty * this.cols + tx;
      if ((opt.flyer ? this.solidAll[i] : this.solidGround[i])) continue;
      const cx = tx * TILE + TILE / 2, cy = ty * TILE + TILE / 2;
      if (opt.minDist && opt.from && Math.hypot(cx - opt.from.x, cy - opt.from.y) < opt.minDist) continue;
      if (opt.maxDist && opt.from && Math.hypot(cx - opt.from.x, cy - opt.from.y) > opt.maxDist) continue;
      if (opt.wallClear && !this._clearAround(tx, ty, opt.wallClear)) continue;
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
    const texKey = `tiles_f${this.floor}`;
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
    const map = this.visMap = s.make.tilemap({ width: this.cols, height: this.rows + 1, tileWidth: TILE, tileHeight: TILE });
    const tset = map.addTilesetImage('tiles', texKey, TILE, TILE, ts.margin, ts.spacing);
    const floor = map.createBlankLayer('floor', tset, 0, -TILE).setDepth(DEPTH.floor);
    const walls = map.createBlankLayer('walls', tset, 0, -TILE).setDepth(DEPTH.floor + 1);
    const tops = map.createBlankLayer('wallTops', tset, 0, -TILE).setDepth(DEPTH.wallTops);
    this.objects.push(floor, walls, tops);
    const isWallish = (x, y) => { if (x < 0 || y < 0 || x >= this.cols || y >= this.rows) return true; const c = this.cell[y * this.cols + x]; return c === CELL.WALL || c === CELL.DOOR; };
    const floorKeys = Object.keys(ts.floorWeights).map((k) => ({ k, weight: ts.floorWeights[k] }));
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
        floor.putTileAt(ix.pit_void, x, Y);
        const north = this.idx(x, y - 1);
        if (north >= 0 && this.cell[north] !== CELL.PIT && this.cell[north] !== CELL.WALL) floor.putTileAt(ix.edge_down, x, Y);
        continue;
      }
      // floor (pillar/crate cells get floor under them)
      if (y > 0 && isWallish(x, y - 1) && ix[`floor_atlas_${10 + (x % 4)}`] != null) { floor.putTileAt(ix[`floor_atlas_${10 + (x % 4)}`], x, Y); continue; }
      let pick = rng ? rng.weighted(floorKeys).k : 'floor_1';
      if (pick !== 'floor_1' && ((x > 0 && cracked[i - 1]) || (y > 0 && cracked[i - this.cols]))) pick = 'floor_1';
      if (pick !== 'floor_1') cracked[i] = 1;
      floor.putTileAt(ix[pick], x, Y);
    }
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
      }
    }
    // torches: a mirrored pair flanking each door on the north wall (animated `tiles_torch`)
    const hasTorch = s.anims.exists('tiles_torch');
    for (const d of this.markers.doors) {
      const x0 = d.tiles[0].x * TILE, x1 = (d.tiles[d.tiles.length - 1].x + 1) * TILE, y = d.tiles[0].y * TILE + 8;
      for (const tx of [x0 - 24, x1 + 24]) {
        if (tx < 8 || tx > this.w - 8) continue;
        const t = hasTorch ? s.add.sprite(tx, y, Art.get('tiles.torch', 0).key).play({ key: 'tiles_torch', startFrame: rng ? rng.int(8) : 0 }) : null;
        if (t) {
          t.setDepth(DEPTH.wallTops + 1); this.objects.push(t);
          const gA = Art.getQuiet('authored.glow_32');                                    // torch-light ADD #ee8e2e α 0.35
          this.objects.push(s.add.image(tx, y + 2, gA ? gA.key : 'ph-glow', gA ? gA.frame : undefined).setBlendMode(1).setTint(0xee8e2e).setAlpha(0.35).setDepth(DEPTH.projectilesAdd));
        }
      }
    }
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
    if (this.map) this.map.destroy();
  }
}

function multiply(c, t) {
  if (t === 0xffffff) return c;
  const r = (((c >> 16) & 255) * ((t >> 16) & 255)) / 255, g = (((c >> 8) & 255) * ((t >> 8) & 255)) / 255, b = ((c & 255) * (t & 255)) / 255;
  return ((r | 0) << 16) | ((g | 0) << 8) | (b | 0);
}
