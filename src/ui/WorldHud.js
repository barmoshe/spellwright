// ui/WorldHud.js — spatial, event-driven UI drawn in WORLD coordinates inside RunScene (ui-contract §3;
// hud-layout §3.3, §4, §6; motion-spec §6). Owned by UI developer B.
//
//   const worldHud = new WorldHud(runScene);   // RunScene.create
//   worldHud.update(dtMs);                      // every render frame while the run updates (freezes with hit-stop)
//   worldHud.destroy();                         // RunScene shutdown
//
// Draws: the reticle (KB+M) / aim pip (pad), the recharge ring, dash readiness, damage numbers, the
// interact prompt, door choice icons + labels, pedestal previews + glints, and FTUE verb prompts.
// Reads `runScene.hudProbe()` once per frame (spatial data only); everything else is bus-driven.
// Phone room zoom (aspect-ratio-spec §3.3): labels / prompts / door icons are placed in SCREEN px through the sim
// camera's live view (_sx/_sy/_setScreen) and counter-scaled by 1/z, so world-anchored text is always drawn at 1:1
// (no fractional bitmap-text scaling, O-UX-3); reticle, rings, bars and chevrons are icons and zoom with the world.
// Depth band 90–99 (above wall-tops 80). No per-frame setText: text objects are rebuilt only when
// their content key changes; per-frame work is setPosition / Graphics redraw of a few rects.

import { EV } from '../core/events.js';
import { T } from '../core/tunables.js';
import { t } from '../core/i18n.js';
import { C, txt } from './kit.js';
import { ensureHudTextures, hudImageC, hudTex, promptRow, drawDarkPanel, reducedMotion, PIP_FOR_KIND, rewardKindTex, clampBox, SPATIAL } from './HudKit.js';
import { DamageNumbers } from './DamageNumbers.js';
import { Ftue } from './Ftue.js';
import { VIEW_W, VIEW_H } from '../config.js';

const D = { doors: 90, pedestal: 90, dash: 92, dmg: 95, interact: 96, door: 96, ftue: 97, reticle: 99 };
// v2 doors (hud-layout §9.6): room-kind pip for the new kinds, reward shape for the new reward kinds, and the
// defence shape a keyword test asks for (mini-boss / puzzle doors carry no rolled threat, only a keyword)
const DOOR_PIP = { ...PIP_FOR_KIND, miniboss: 'pip_elite' };
const DOOR_REWARD = { miniboss: 'relic', corrupted: 'relic', boss: 'bossRelic' };
const DEF_FOR_KW = { pierce: 'shield', blast: 'armour', shock: 'ward' };
/** floors.json threat iconKey 'threat.<id>' / rules.risk.doorIconKey 'door.risk' → ui atlas frame 'door_<id>' (ATLAS-KEYS ui.door_*). */
const doorFrame = (iconKey) => (iconKey ? `door_${String(iconKey).split('.').pop()}` : null);
const NEAR = 48;                   // door label / pedestal preview proximity (hud-layout §6)
const GLINT_MS = 2500, GLINT_ON_MS = 100;

export class WorldHud {
  constructor(runScene) {
    const s = this.scene = runScene;
    const reg = s.registry;
    this.bus = reg.get('bus');
    this.router = reg.get('router');
    this.flow = reg.get('flow');
    this.mixer = reg.get('mixer');
    this.run = reg.get('run');
    this._handlers = [];
    this._v = { x: 0, y: 0 };
    this._placed = [];
    ensureHudTextures(s);

    this.interactRadius = T('interactRadius');
    this.clock = 0;

    // spatial twins
    this.reticle = hudImageC(s, 0, 0, 'reticle_9x9').setDepth(D.reticle).setVisible(false);
    this.aimPip = hudImageC(s, 0, 0, 'aim_pip_5x5').setDepth(D.reticle).setVisible(false);
    this.ring = s.add.graphics().setDepth(D.reticle);
    this.dashG = s.add.graphics().setDepth(D.dash);
    this.eliteG = s.add.graphics().setDepth(D.dash);        // elite HP bars (hud-layout §3.3)
    this.chevG = s.add.graphics().setDepth(D.reticle - 1);  // last-enemy chevrons (hud-layout §3.3)
    this._dashKey = '';

    // damage numbers + FTUE
    this.dmg = new DamageNumbers(s, this.run);
    this.ftue = new Ftue(this);

    // in-world labels
    this.interact = null; this._interactKey = '';
    this.doorIcons = [];            // [{c, x, y, roomKind, reward, label, choice}]
    this.doorLabel = null; this._doorKey = '';
    this.pedLabels = new Map();     // index -> {c, key}
    this.glints = s.add.graphics().setDepth(D.pedestal + 1);
    this.glintPhase = [];
    this.ftuePrompt = null; this._ftueKey = '';
    this.tickImg = null;
    this.eventPrompt = null;        // ui:interact override {text, x, y}

    this.on(EV.DAMAGE_NUMBER, (d) => this.dmg.spawn(d));
    this.on(EV.REACTION, (d) => { if (d) this.dmg.reaction(d.name, d.x, d.y, !!d.first); });
    this.on(EV.DOORS_OPEN, (list) => this._doorsOpen(list));
    this.on(EV.ROOM_ENTER, () => this._roomEnter());
    this.on(EV.INTERACT_PROMPT, (p) => { this.eventPrompt = p || null; });
    this.on(EV.INPUT_DEVICE, () => { this._interactKey = ''; this._ftueKey = ''; });
    this.on(EV.SETTINGS_CHANGED, () => { this._interactKey = ''; this._ftueKey = ''; this._doorKey = ''; });
    this.on(EV.WAND_CAST, (d) => this._rememberSkipped(d));

    s.events.once('shutdown', () => this.destroy());
  }

  /** The sim camera's live world view {x, y, z} (sim/Camera.js), or the scene camera when there is no sim rig. */
  _view() {
    const c = this.scene.ctx && this.scene.ctx.cam;
    if (c && c.view) return c.view;
    const cam = this.scene.cameras.main;
    return { x: cam.scrollX, y: cam.scrollY, z: 1 };
  }
  _sx(x) { const v = this._view(); return (x - v.x) * v.z; }
  _sy(y) { const v = this._view(); return (y - v.y) * v.z; }
  /** Place a world-UI object at a SCREEN position, drawn 1:1 whatever the camera zoom. */
  _setScreen(obj, sx, sy) {
    const v = this._view();
    obj.setPosition(v.x + sx / v.z, v.y + sy / v.z);
    const k = 1 / v.z;
    if (obj.scaleX !== k) obj.setScale(k);
  }

  /** Bus subscription removed on destroy() (and on RunScene shutdown). */
  on(evt, fn) { this.bus.on(evt, fn, this); this._handlers.push([evt, fn]); }

  _rememberSkipped(d) {
    if (!d || !d.skippedSlots || !d.skippedSlots.length || !this.run) return;
    const w = this.run.wands[d.wand ?? this.run.activeWand];
    const id = w && w.state.slots[d.skippedSlots[0]];
    const card = id && this.run.cat.cards[id];
    this.lastSkippedCardName = card ? card.name : null;
  }

  // ------------------------------------------------------------------ doors
  _doorsOpen(list) {
    this._clearDoors();
    if (!Array.isArray(list)) return;
    const s = this.scene;
    const rm = reducedMotion();
    const riskKey = this.run && this.run.cat && this.run.cat.rules.risk ? this.run.cat.rules.risk.doorIconKey : 'door.risk';
    list.forEach((d, i) => {
      const c = s.add.container(0, 0).setDepth(D.doors);
      const g = s.add.graphics();
      // third icon: the risk door's icon replaces the threat icon; else the rolled threat; else the keyword test's defence shape
      const third = d.risk ? doorFrame(riskKey) : d.threatIcon ? doorFrame(d.threatIcon) : d.threat ? `door_${d.threat}` : d.keyword ? `door_${DEF_FOR_KW[d.keyword] || 'unknown'}` : null;
      const w = third ? 58 : 38;
      drawDarkPanel(g, 0, 0, 18, 18); drawDarkPanel(g, 20, 0, 18, 18);
      if (third) drawDarkPanel(g, 40, 0, 18, 18);
      c.add(g);
      const rk = hudTex(DOOR_PIP[d.roomKind] || 'pip_future');
      c.add(s.add.image(9, 9, rk.key, rk.frame));
      const rw = rewardKindTex(DOOR_REWARD[d.reward] || d.reward || 'none');
      c.add(s.add.image(29, 9, rw.key, rw.frame));
      if (third) { const tt = hudTex(third); c.add(s.add.image(49, 9, tt.key, tt.frame)); }
      const e = { c, w, x: d.x, y: d.y, roomKind: d.roomKind, reward: d.reward, choice: d.choice, label: d.label, index: i, n: list.length, dy: 0,
        threat: d.threat || null, risk: !!d.risk, puzzle: !!d.puzzle, keyword: d.keyword || null, testName: d.testName || null };
      this.doorIcons.push(e);
      this._placeDoor(e);
      // world-door-open `icons` phase: 100 ms after the swap, Back.easeOut −4 → 0 px + fade (RM: fade only)
      c.setAlpha(0);
      if (rm) s.tweens.add({ targets: c, alpha: 1, duration: 200, delay: 100 });
      else {
        e.dy = -4;
        s.tweens.add({ targets: e, dy: 0, duration: 200, delay: 100, ease: 'Back.easeOut' });
        s.tweens.add({ targets: c, alpha: 1, duration: 200, delay: 100, ease: 'Quad.easeOut' });
      }
    });
  }

  /** Icons sit 20 px above the door frame's top (door (x, y) = door centre, 16×32 frame → top y − 16). */
  _placeDoor(e) {
    const w = e.w || 38;
    const [sx, sy] = clampBox(Math.round(this._sx(e.x)) - Math.round(w / 2), Math.round(this._sy(e.y - 16)) - 20, w, 18);
    this._setScreen(e.c, sx, sy + Math.round(e.dy));
    e.sx = sx; e.sy = sy;                                  // SCREEN px (the door label steps around them)
    this._placed.push({ x: sx, y: sy, w, h: 18 });
  }

  /** Clamp a label into the spatial box and step it clear of labels already placed this frame. */
  _place(obj, sx, sy, w, h) {
    let [x, y] = clampBox(sx, sy, w, h);
    for (let tries = 0; tries < 6; tries++) {
      let hit = null;
      for (const b of this._placed) if (x < b.x + b.w + 1 && x + w + 1 > b.x && y < b.y + b.h + 1 && y + h + 1 > b.y) { hit = b; break; }
      if (!hit) break;
      let ny = hit.y - h - 2;
      if (ny < SPATIAL.y) ny = hit.y + hit.h + 2;
      [x, y] = clampBox(x, ny, w, h);
    }
    this._placed.push({ x, y, w, h });
    this._setScreen(obj, x, y);
    return [x, y];
  }

  _clearDoors() {
    for (const e of this.doorIcons) { this.scene.tweens.killTweensOf(e); this.scene.tweens.killTweensOf(e.c); e.c.destroy(); }
    this.doorIcons.length = 0;
    if (this.doorLabel) { this.doorLabel.destroy(); this.doorLabel = null; this._doorKey = ''; }
  }

  _doorText(e) {
    if (typeof e.label === 'string' && e.label) return e.label;
    const room = t(`world.room.${e.puzzle ? 'puzzle' : e.roomKind || 'combat'}`);
    const reward = e.reward ? t(`world.reward.${e.reward}`) : '';
    return reward ? t('world.door.label', { room, reward }) : room;
  }
  /** v2 label lines (hud-layout §9.6): threat ("Shielded foes: bring PIERCE"), mini-boss / puzzle test, risk trade. */
  _doorLines(e) {
    const out = [];
    const kw = e.keyword ? t(`world.kw.${e.keyword}`) : '';
    if (e.roomKind === 'miniboss') out.push(t(kw ? 'world.door.mini' : 'world.door.miniNoKw', { name: e.testName || '', kw }));
    else if (e.puzzle) out.push(t(kw ? 'world.door.puzzle' : 'world.door.puzzleNoKw', { name: e.testName || '', kw }));
    else if (e.threat && e.threat !== 'none') out.push(t(`threat.${e.threat}`));
    if (e.risk) {
      const R = (this.run && this.run.cat && this.run.cat.rules.risk) || {};
      out.push(t('world.door.risk', { n: R.extraElites ?? 1, k: R.rewardDraft ?? 2 }));
    }
    return out;
  }

  _roomEnter() {
    this._clearDoors();
    for (const v of this.pedLabels.values()) v.c.destroy();
    this.pedLabels.clear();
    this.glintPhase.length = 0;
    this.dmg.clear();
    this.eventPrompt = null;
  }

  // ------------------------------------------------------------------ per-frame
  update(dtMs) {
    const s = this.scene;
    if (!s.sys || !s.sys.isActive()) return;
    const probe = typeof s.hudProbe === 'function' ? s.hudProbe() : null;
    const dt = Math.min(100, dtMs || 0);
    this.clock += dt;
    this.dmg.update(dt);
    if (!probe || !probe.player) return;
    const P = probe.player, cam = s.cameras.main;
    const dev = this.router ? this.router.device : 'kbm';
    const pad = dev === 'pad' || dev === 'touch';
    const ctl = probe.room ? probe.room.controllable !== false : true;

    // ---- reticle / aim pip (hud-layout §3.3; touch: the pip only while the aim stick overrides, the auto
    // target marker is the HUD's corner ticks — mobile-touch-spec §3.3) ----
    let rx, ry;
    const it = s.ctx && s.ctx.intent;
    const touchPip = dev !== 'touch' || !!(it && it.aimSource === 'stick' && it.castHeld);
    if (!pad) {
      cam.getWorldPoint(this.router.pointerX, this.router.pointerY, this._v);
      rx = Math.round(this._v.x); ry = Math.round(this._v.y);
      this.reticle.setPosition(rx, ry).setVisible(P.alive !== false);
      this.aimPip.setVisible(false);
    } else {
      rx = Math.round(P.coreX + (P.aimX || 0) * 40); ry = Math.round(P.coreY + (P.aimY || 0) * 40);
      this.aimPip.setPosition(rx, ry).setVisible(P.alive !== false && touchPip);
      this.reticle.setVisible(false);
    }

    // ---- recharge ring: 13×13, 1 px light arc on a dark ring, filling clockwise ----
    this.ring.clear();
    const W = probe.wand;
    if (W && W.recharging && P.alive !== false) {
      const done = Math.max(0, Math.min(1, 1 - (W.rechargeFrac ?? 1)));
      this.ring.lineStyle(3, C.stroke, 1).strokeCircle(rx, ry, 6);
      if (done > 0) {
        this.ring.lineStyle(1, C.text, 1).beginPath();
        this.ring.arc(rx, ry, 6, -Math.PI / 2, -Math.PI / 2 + done * Math.PI * 2, false);
        this.ring.strokePath();
      }
    }

    // ---- dash readiness: 12×2 bar 4 px below the feet, one segment per charge, only while refilling ----
    const dMax = P.dashMax || 1, dCh = P.dashCharges ?? dMax;
    const refilling = dCh < dMax && P.alive !== false;
    const frac = refilling ? Math.floor((P.dashRefillFrac || 0) * 12) : 0;
    const key = refilling ? `${Math.round(P.x)},${Math.round(P.y)},${dCh},${dMax},${frac}` : '';
    if (key !== this._dashKey) {
      this._dashKey = key;
      this.dashG.clear();
      if (refilling) {
        const x0 = Math.round(P.x) - 6, y0 = Math.round(P.y) + 4;
        const segW = Math.floor((12 - (dMax - 1)) / dMax);
        this.dashG.fillStyle(C.stroke, 1).fillRect(x0 - 1, y0 - 1, 14, 4);
        for (let i = 0; i < dMax; i++) {
          const sx = x0 + i * (segW + 1);
          let f = i < dCh ? 1 : i === dCh ? (P.dashRefillFrac || 0) : 0;
          if (f > 0) this.dashG.fillStyle(C.text, 1).fillRect(sx, y0, Math.max(1, Math.round(segW * f)), 2);
        }
      }
    }

    // ---- elite HP (16×2, 3 px above the sprite, after the first damage) + last-enemy chevrons ----
    this._updateEnemyTwins(probe, cam);

    // Spatial labels are placed in priority order; a later box that would overlap an earlier one
    // moves above it (or below when clamped at the top), so labels never stack illegibly.
    this._placed.length = 0;
    // ---- doors: follow camera clamp (fixed obstacles for the labels below) ----
    for (const e of this.doorIcons) this._placeDoor(e);

    // ---- interact prompt (nearest interactable within interactRadius) ----
    this._updateInteract(probe, pad);

    // ---- pedestals: preview within 48 px, glint every 2.5 s (random phase, fx stream) ----
    this._updatePedestals(probe, P);

    // ---- door label within 48 px ----
    this._updateDoorLabel(P);

    // ---- FTUE verb prompt, 28 px above the head ----
    const verb = this.ftue.update(dt, probe);
    this._updateFtue(verb, P, ctl);
  }

  /**
   * Optional probe fields (engine hook requested from the lead):
   *   near.elites:    [{x, y (sprite top), hpFrac, damaged}]  → 16×2 bar 3 px above the sprite once damaged
   *   near.offscreen: [{x, y}] (only when ≤ 2 enemies are alive) → 8×8 edge chevron pointing at each
   */
  _updateEnemyTwins(probe, cam) {
    const near = probe.near || {};
    const el = near.elites || [];
    this.eliteG.clear();
    for (const e of el) {
      if (!e.damaged && !(e.hpFrac < 1)) continue;
      const x = Math.round(e.x) - 8, y = Math.round(e.y) - 3 - 2;
      this.eliteG.fillStyle(C.stroke, 1).fillRect(x - 1, y - 1, 18, 4);
      this.eliteG.fillStyle(C.gold, 1).fillRect(x, y, Math.max(0, Math.round(16 * Math.max(0, Math.min(1, e.hpFrac)))), 2);
    }
    const off = near.offscreen || [];
    this.chevG.clear();
    if (!off.length) return;
    const cx = VIEW_W / 2, cy = VIEW_H / 2;        // screen centre
    for (const e of off) {
      const sx = this._sx(e.x), sy = this._sy(e.y);
      const dx = sx - cx, dy = sy - cy;
      const m = Math.hypot(dx, dy) || 1;
      // project onto the spatial box edge, inset 6 px so the 8×8 chevron stays inside the §2.4 clamp
      const kx = dx ? ((dx > 0 ? SPATIAL.x + SPATIAL.w - 6 : SPATIAL.x + 6) - cx) / dx : Infinity;
      const ky = dy ? ((dy > 0 ? SPATIAL.y + SPATIAL.h - 6 : SPATIAL.y + 6) - cy) / dy : Infinity;
      const k = Math.min(kx, ky);
      const v = this._view();                                 // screen edge point → world (the chevron is an icon: it zooms)
      const px = Math.round(v.x + (cx + dx * k) / v.z), py = Math.round(v.y + (cy + dy * k) / v.z);
      const ux = dx / m, uy = dy / m;
      const tip = [px + ux * 5, py + uy * 5], l = [px - ux * 3 - uy * 3, py - uy * 3 + ux * 3], r = [px - ux * 3 + uy * 3, py - uy * 3 - ux * 3];   // 8 long × 6 wide arrowhead
      this.chevG.fillStyle(C.stroke, 1).fillTriangle(tip[0] + ux, tip[1] + uy, l[0] - uy, l[1] + ux, r[0] + uy, r[1] - ux);
      this.chevG.fillStyle(C.text, 1).fillTriangle(tip[0], tip[1], l[0], l[1], r[0], r[1]);
    }
  }

  _updateInteract(probe, pad) {
    const s = this.scene;
    let it = probe.near && probe.near.interact;
    if (it && Math.hypot(it.x - probe.player.x, it.y - probe.player.y) > this.interactRadius + 8) it = null;
    if (!it && this.eventPrompt) it = { verb: this.eventPrompt.text, x: this.eventPrompt.x, y: this.eventPrompt.y, kind: 'event' };
    const shopLine = it && it.kind === 'shop' ? this.ftue.shopLine() : null;
    const k = it ? `${it.kind}|${it.verb}|${pad}|${shopLine || ''}` : '';
    if (k !== this._interactKey) {
      this._interactKey = k;
      if (this.interact) { this.interact.destroy(); this.interact = null; }
      if (it) {
        const verbTxt = it.kind === 'event' ? it.verb : t(`world.verb.${it.verb || 'take'}`);
        const c = s.add.container(0, 0).setDepth(D.interact);
        const g = s.add.graphics(); c.add(g);
        const row = promptRow(s, `[interact] ${verbTxt}`, this.router, 'T1');
        row.setPosition(4, 4); c.add(row);
        let w = row._w + 8, h = 20;
        if (shopLine) {
          const line = promptRow(s, shopLine, this.router, 'T1', 180);
          line.setPosition(4, 19); c.add(line);
          w = Math.max(w, line._w + 8); h = 19 + line._h + 4;
        }
        drawDarkPanel(g, 0, 0, w, h);
        c._w = w; c._h = h;
        this.interact = c;
      }
    }
    if (this.interact && it) {
      this._place(this.interact, this._sx(it.x) - this.interact._w / 2, this._sy(it.y - 8) - 6 - this.interact._h, this.interact._w, this.interact._h);
    }
  }

  _updateDoorLabel(P) {
    let best = null, bd = NEAR;
    for (const e of this.doorIcons) {
      const d = Math.hypot(e.x - P.x, e.y - P.y);
      if (d <= bd) { bd = d; best = e; }
    }
    const isChoice = best && (best.choice || this.doorIcons.length > 1);
    const hint = best && isChoice ? this.ftue.doorLine() : null;
    const k = best ? `${best.index}|${hint || ''}` : '';
    if (k !== this._doorKey) {
      this._doorKey = k;
      if (this.doorLabel) { this.doorLabel.destroy(); this.doorLabel = null; }
      if (best) {
        const s = this.scene;
        const c = s.add.container(0, 0).setDepth(D.door);
        const g = s.add.graphics(); c.add(g);
        const main = txt(s, 4, 3, this._doorText(best), 'T1');
        c.add(main);
        let w = Math.ceil(main.width) + 8, h = 18;
        const lines = this._doorLines(best);
        for (let li = 0; li < lines.length; li++) {
          const lt = txt(s, 4, h - 1, lines[li], 'T1', { color: best.risk && li === lines.length - 1 ? C.gold : C.dim });
          c.add(lt);
          w = Math.max(w, Math.ceil(lt.width) + 8); h += 13;
        }
        if (hint) {
          const line = promptRow(s, hint, this.router, 'T1', 220);
          line.setPosition(4, h - 1); c.add(line);
          w = Math.max(w, line._w + 8); h = h - 1 + line._h + 3;
        }
        drawDarkPanel(g, 0, 0, w, h);
        c._w = w; c._h = h; c.door = best;
        this.doorLabel = c;
      }
    }
    if (this.doorLabel) {
      const e = this.doorLabel.door;
      const L = this.doorLabel;
      // above the icons; when the clamp leaves no room there (doors in the top wall), below them instead (screen px)
      let top = e.sy - 2 - L._h;
      if (top < SPATIAL.y) top = e.sy + 18 + 2;
      this._place(L, this._sx(e.x) - L._w / 2, top, L._w, L._h);
    }
  }

  _updatePedestals(probe, P) {
    const s = this.scene;
    const list = (probe.near && probe.near.pedestals) || [];
    const rm = reducedMotion();
    const fx = this.run && this.run.rng && this.run.rng.fx;
    this.glints.clear();
    for (let i = 0; i < list.length; i++) {
      const p = list[i];
      if (this.glintPhase[i] == null) this.glintPhase[i] = { phase: fx ? fx.float(0, GLINT_MS) : (i * 911) % GLINT_MS, cycle: -1, dx: 0, dy: 0 };
      const gp = this.glintPhase[i];
      if (!p.taken) {
        const tt = this.clock + gp.phase;
        const cyc = Math.floor(tt / GLINT_MS);
        if (cyc !== gp.cycle) {                // new glint: random edge pixel from the fx stream
          gp.cycle = cyc;
          const edge = fx ? fx.int(4) : cyc % 4, off = fx ? fx.range(-5, 5) : 0;
          gp.dx = edge === 0 ? -6 : edge === 1 ? 6 : off; gp.dy = edge === 2 ? -14 : edge === 3 ? -2 : off - 8;
        }
        if (rm || tt % GLINT_MS < GLINT_ON_MS) this.glints.fillStyle(C.text, 1).fillRect(Math.round(p.x + gp.dx), Math.round(p.y + gp.dy), 1, 1);
      }
      // preview label
      const near = !p.taken && Math.hypot(p.x - P.x, p.y - P.y) <= NEAR;
      const k = near ? `${p.kind}|${p.count}` : '';
      const cur = this.pedLabels.get(i);
      if ((cur ? cur.key : '') !== k) {
        if (cur) { cur.c.destroy(); this.pedLabels.delete(i); }
        if (near) {
          const kind = t(`world.reward.${p.kind}`);
          const str = p.count > 1 ? t('world.pedestal', { kind, n: p.count }) : kind;
          const c = s.add.container(0, 0).setDepth(D.pedestal);
          const g = s.add.graphics(); c.add(g);
          const tx = txt(s, 4, 3, str, 'T1'); c.add(tx);
          const w = Math.ceil(tx.width) + 8, h = 18;
          drawDarkPanel(g, 0, 0, w, h);
          c._w = w; c._h = h;
          this.pedLabels.set(i, { c, key: k });
        }
      }
      const lab = this.pedLabels.get(i);
      if (lab) {
        this._place(lab.c, this._sx(p.x) - lab.c._w / 2, this._sy(p.y) - 20 - lab.c._h, lab.c._w, lab.c._h);
      }
    }
    for (const [i, v] of this.pedLabels) if (i >= list.length) { v.c.destroy(); this.pedLabels.delete(i); }
  }

  _updateFtue(verb, P, ctl) {
    const s = this.scene;
    const show = verb && ctl && P.alive !== false;
    const k = show ? `${verb.id}|${this.ftue.verbEpoch}|${this.router.device}` : '';
    if (k !== this._ftueKey) {
      const had = this.ftuePrompt;
      this._ftueKey = k;
      if (had) {
        // completion: fade over 150 ms (RM: instant); otherwise just remove
        if (!show && this.ftue.tick > 0 && !reducedMotion()) {
          this.ftuePrompt = null;
          s.tweens.add({ targets: had, alpha: 0, duration: 150, onComplete: () => had.destroy() });
        } else { had.destroy(); this.ftuePrompt = null; }
      }
      if (show) {
        const c = s.add.container(0, 0).setDepth(D.ftue);
        const g = s.add.graphics(); c.add(g);
        const row = promptRow(s, this.ftue.verbText(verb.id), this.router, 'T1', 220);
        row.setPosition(4, 4); c.add(row);
        c._w = row._w + 8; c._h = row._h + 8;
        drawDarkPanel(g, 0, 0, c._w, c._h);
        c.frame = s.add.graphics(); c.add(c.frame);
        this.ftuePrompt = c;
      }
    }
    const headY = P.y - 16;
    if (this.ftuePrompt && show) {
      const c = this.ftuePrompt;
      this._place(c, this._sx(P.x) - c._w / 2, this._sy(headY) - 28 - c._h / 2, c._w, c._h);
      // P4 windup emphasis: brighten (RM: thicker frame instead of a pulse)
      const bright = this.ftue.bright;
      if (bright !== c.bright) {
        c.bright = bright;
        c.frame.clear();
        if (bright) {
          if (reducedMotion()) c.frame.lineStyle(2, C.gold, 1).strokeRect(1, 1, c._w - 2, c._h - 2);
          else c.frame.lineStyle(1, C.gold, 1).strokeRect(0.5, 0.5, c._w - 1, c._h - 1).fillStyle(C.text, 0.12).fillRect(1, 1, c._w - 2, c._h - 2);
        }
      }
    }
    // ✔ completion tick (300 ms) in the prompt's place
    if (this.ftue.tick > 0) {
      if (!this.tickImg) this.tickImg = hudImageC(s, 0, 0, 'g_ok').setDepth(D.ftue + 1);
      const [sx, sy] = clampBox(this._sx(P.x) - 4, this._sy(headY) - 28 - 4, 9, 9);
      this._setScreen(this.tickImg, sx + 4, sy + 4);
      this.tickImg.setVisible(true);
    } else if (this.tickImg) this.tickImg.setVisible(false);
  }

  destroy() {
    if (this._destroyed) return;
    this._destroyed = true;
    for (const [e, fn] of this._handlers) this.bus.off(e, fn, this);
    this._handlers.length = 0;
    this._clearDoors();
    for (const v of this.pedLabels.values()) v.c.destroy();
    this.pedLabels.clear();
    for (const o of [this.reticle, this.aimPip, this.ring, this.dashG, this.eliteG, this.chevG, this.glints, this.interact, this.ftuePrompt, this.tickImg]) if (o && o.scene) o.destroy();
    this.dmg.destroy();
  }
}
