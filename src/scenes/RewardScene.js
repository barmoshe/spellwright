// RewardScene — S4 reward draft and S4w wand offer (screen-graph §1, §3; ui-contract §5).
// Reads run.offer (overlays never own run data). Closing keeps the pedestal and its exact offer.
// v2 (screen-graph §9.4): drafts gain **Skip (+gold)** (economy.skip; the explicit forfeit, no confirm, never the
// default focus) and **Reroll (cost)** (economy.draftReroll: max 2 per offer; kind never changes). Card chips:
// "Counters: {defence}" (counter guarantee), "DUO" (+ parent icons with ✔ owned), "NEW". The fixed tutorial draft
// and wand offers have neither Skip nor Reroll.
//
//   S4  kind spell|modifier → Take → flow.replace('pause', {tab:'wands', heldCard:id})  (card is HELD)
//       kind relic|bossRelic → Take applies in takeOffer → close (HUD toasts relic:gained)
//   S4w data.mode 'wand' (shop wand: {wandId, shopIndex}) or offer.kind 'wand' (treasure)
//       Take into a free wand slot · Swap for wand n → D5 → takeWand / buyWand
//   Tab → Pause:Wands with returnTo (same offer on return).

import Phaser from '../../lib/phaser.esm.min.js';
import { UI_W } from '../ui/uiSpace.js';   // 640×360 overlay design space
import { modalChrome } from './overlay.js';
import { FocusNav } from '../ui/nav.js';
import { Dialog } from '../ui/Dialog.js';
import { ExtraKeys, EDITOR_KEYS, dropShadowedBack } from '../ui/extraKeys.js';
import { C, txt, icon, cardCell, setColor } from '../ui/kit.js';
import { button, box, glyph, richLine, reduced } from '../ui/draw.js';
import { cat } from '../data/catalog.js';
import { Save } from '../core/save.js';
import { EV } from '../core/events.js';
import { t } from '../core/i18n.js';
import { cardRows, modifierLines, typeWord, rarityWord, sec2, num, cardOf, pmDeg, initSymbols } from '../ui/fmt.js';
import { defenceFor } from '../spells/keywords.js';

export class RewardScene extends Phaser.Scene {
  constructor() { super('reward'); }

  init(data) { this.args = data || {}; }

  create() {
    initSymbols(this);
    this.m = modalChrome(this, { swap: !!this.args._swap });
    Object.assign(this, { router: this.m.router, flow: this.m.flow, bus: this.m.bus, run: this.m.run, mixer: this.m.mixer });
    this.__dialog = null; this.closing = false;
    const top = () => this.flow.top() === 'reward' && !this.__dialog && !this.closing;
    this.nav = new FocusNav(this, { layer: this.m.panel, isActive: top, onMove: (it) => this.onMove(it) });
    this.extra = new ExtraKeys(this, top, EDITOR_KEYS);
    this.p = this.m.panel;
    const o = this.run && this.run.offer;
    this.wandMode = this.args.mode === 'wand' || (o && o.kind === 'wand' && !o.taken);
    if (this.wandMode) this.buildWandOffer();
    else if (!o || o.taken || !o.items.length) { this.time.delayedCall(0, () => this.flow.close('reward')); return; }
    else this.buildDraft(o);
    this.nav.raise();
  }

  // ======================================================================================= S4
  buildDraft(o, rebuilt = false) {
    const s = this, run = this.run;
    const p = this.dc = this.add.container(0, 0);
    this.p.add(p);
    const isRelic = o.kind === 'relic' || o.kind === 'bossRelic';
    const touch = !!(this.router && this.router.touchProfile);
    p.add(box(s, 16, 8, 608, 344, 'ornate'));
    p.add(txt(s, UI_W / 2, 16, t(isRelic ? 'reward.titleRelic' : 'reward.title'), 'T2', { origin: [0.5, 0] }));
    p.add(txt(s, UI_W / 2, 32, t(o.risk ? 'reward.sub.risk' : `reward.sub.${o.kind}`), 'T1', { origin: [0.5, 0], color: o.risk ? C.warn : C.dim }));
    const n = o.items.length, W = 176, gap = 12;
    const x0 = Math.round((UI_W - (n * W + (n - 1) * gap)) / 2);
    this.cards = [];
    o.items.forEach((id, i) => {
      const x = x0 + i * (W + gap), y = 50;
      const c = this.add.container(x, y);
      p.add(c);
      const g = this.add.graphics(); c.add(g);
      const rec = isRelic ? cat().relics[id] : cardOf(id);
      const draw = (focused) => { g.clear(); g.fillStyle(C.stroke, 1).fillRect(0, 0, W, 196).fillStyle(C.panel, 1).fillRect(1, 1, W - 2, 194);
        g.lineStyle(1, focused ? C.gold : C.slateDark, 1).strokeRect(1.5, 1.5, W - 3, 193);
        g.fillStyle(C.rar[rec.rarity] ?? (rec.rarity === 'corrupted' ? C.error : C.dim), 1).fillRect(8, 192, W - 16, 1); };
      draw(false);
      if (isRelic) c.add(icon(s, 26, 26, 'relics', id, 32));
      else c.add(cardCell(s, 8, 8, rec, 36, { isNew: !Save.isDiscovered('cards', id) }));
      c.add(txt(s, 50, 8, rec.name, 'T1', { wrap: W - 56 }));
      c.add(txt(s, 50, 34, isRelic ? rarityWord(rec.rarity) : `${typeWord(rec)}`, 'T1', { color: C.dim, wrap: W - 56 }));
      if (!isRelic) c.add(txt(s, 50, 46, rarityWord(rec.rarity), 'T1', { color: C.rar[rec.rarity] ?? C.dim }));
      if (!isRelic && !Save.isDiscovered('cards', id)) c.add(richLine(s, W - 8, 6, [{ g: 'star' }, ' ', t('reward.new')], { align: 'right', role: 'T1', color: C.gold }));   // §2.3 #22
      // v2 draft chips (screen-graph §9.4): a tab above the card's top-left, at most 2 (the rest live in the detail line)
      const chips = [];
      const kw = run.upcomingKeyword;
      if (!isRelic && kw && (rec.keywords || []).includes(kw)) chips.push({ label: t('reward.counters', { defence: t(`kw.defence.${defenceFor(cat(), kw)}`) }), color: C.gold });
      if (isRelic && rec.duo) chips.push({ label: t('reward.duo'), color: C.gold });
      if (isRelic && (rec.category === 'corrupted' || rec.rarity === 'corrupted')) chips.push({ label: t('reward.corrupted'), color: C.error });
      let cx = 8;
      for (const ch of chips.slice(0, 2)) {
        // a tab sitting ON the card's top edge: the card's border line stops at the tab (no line through the label)
        const tt = txt(s, cx + 3, -5, ch.label, 'T1', { color: ch.color });
        const cw = Math.ceil(tt.width) + 6;
        c.add(this.add.graphics().fillStyle(C.stroke, 1).fillRect(cx - 1, -8, cw + 2, 16).fillStyle(C.panel, 1).fillRect(cx, -7, cw, 14)
          .lineStyle(1, ch.color, 1).strokeRect(cx + 0.5, -6.5, cw - 1, 13));
        c.add(tt); cx += cw + 4;
      }
      let y2 = 64;
      if (isRelic) {
        const dt = txt(s, 8, y2, rec.desc, 'T1', { wrap: W - 16 }); c.add(dt);
        if (rec.duo) {                                   // both parents with a ✔ each (non-colour: the tick is a shape)
          const yy = Math.max(y2 + Math.ceil(dt.height) + 8, 130);
          c.add(txt(s, 8, yy, t('reward.duoParents'), 'T1', { color: C.dim }));
          rec.duo.parents.forEach((pid, k) => {
            const px = 16 + k * 76;
            c.add(icon(s, px, yy + 22, 'relics', pid, 16));
            c.add(richLine(s, px + 12, yy + 16, [run.hasRelic(pid) ? { g: 'check' } : { g: 'no' }, ' ', { t: cat().relics[pid].name.split(' ')[0], color: C.dim }], { role: 'T1' }));
          });
        }
      } else {
        const rows = cardRows(rec).slice(0, 6);
        for (const [l, v] of rows) { c.add(txt(s, 8, y2, l, 'T1', { color: C.dim })); c.add(txt(s, W - 8, y2, v, 'T1', { origin: [1, 0] })); y2 += 12; }
        if (rec.type !== 'projectile') for (const l of modifierLines(rec).slice(0, 2)) { const tt = txt(s, 8, y2, l, 'T1', { wrap: W - 16 }); c.add(tt); y2 += Math.ceil(tt.height) + 1; }
        c.add(txt(s, 8, Math.max(y2 + 4, 150), rec.desc, 'T1', { color: C.dim, wrap: W - 16 }));
      }
      c.add(txt(s, W / 2, 178, t('reward.take'), 'T1', { origin: [0.5, 0], color: C.gold }));
      this.cards.push({ c, draw, x, y });
      const idf = `o:${i}`;
      this.nav.add({ id: idf, x, y, w: W, h: 196, twoTap: true, onConfirm: () => this.take(i),   // touch: tap inspects, tap again takes (§5.2)
        onFocus: () => this.focusCard(i, true), onBlur: () => this.focusCard(i, false),
        nav: { up: null, down: 'strip', left: i > 0 ? `o:${i - 1}` : null, right: i < n - 1 ? `o:${i + 1}` : null } });
    });
    // "Your wands" strip (read-only focus for details)
    const sy = 256;
    p.add(txt(s, 32, sy, t('reward.yourWands'), 'T1', { color: C.dim }));
    this.strip = this.add.container(0, 0); p.add(this.strip);
    let x = 32;
    run.wands.forEach((w, wi) => {
      this.strip.add(icon(s, x + 8, sy + 22, 'wands', w.id, 16));
      w.state.slots.forEach((id, k) => this.strip.add(cardCell(s, x + 18 + k * 19, sy + 13, cardOf(id), 18)));
      x += 18 + w.def.capacity * 19 + 16;
    });
    this.nav.add({ id: 'strip', x: 28, y: sy + 10, w: Math.max(40, Math.min(580, x - 28)), h: 24, onConfirm: () => this.toEditor(),
      nav: { up: 'o:0', down: 'f:edit', left: null, right: null } });
    // footer: Edit wands · Close  …  Reroll (cost) · Skip (+gold)   (+ reason line)
    this.detail = txt(s, 32, 292, '', 'T1', { color: C.dim, wrap: 576 });
    p.add(this.detail);
    const hSmall = touch ? 30 : 20;
    const foot = [{ id: 'f:edit', label: t('reward.editWands'), x: 32, w: 116, h: hSmall, act: () => this.toEditor() },
      { id: 'f:close', label: t('reward.close'), x: 160, w: 116, h: hSmall, act: () => this.close() }];
    if (run.offerIsDraft) {
      const why = run.cantRerollOffer(), cost = run.offerRerollCost;
      foot.push({ id: 'f:reroll', label: cost == null ? t('reward.rerollNone') : t('reward.reroll', { n: cost }), x: 374, w: 110, h: 30,
        disabled: !!why, denied: () => this.rerollDenied(), act: () => this.reroll() });
      foot.push({ id: 'f:skip', label: t('reward.skip', { n: run.skipPay }), x: 496, w: 110, h: 30, act: () => this.skip() });   // ≥ 12 px from Take targets
    }
    this.footer(foot, 318, 'strip');
    if (!rebuilt) {
      this.nav.focus('o:0', { silent: true, snap: true });
      this.focusCard(0, true);
    }
    // reward-draft-deal: 200 ms, stagger 60, Back.easeOut (reduced: all fade in together, 120 ms)
    this.cards.forEach((k, i) => {
      k.c.setAlpha(0);
      if (reduced()) this.tweens.add({ targets: k.c, alpha: 1, duration: 120 });
      else { k.c.y = k.y + 16; this.tweens.add({ targets: k.c, alpha: 1, y: k.y, duration: 200, delay: 60 * i, ease: 'Back.easeOut', onUpdate: () => { k.c.y = Math.round(k.c.y); } }); }
    });
    this.mixer.fire('ui_card_deal');
  }

  /** Draft reroll (economy.draftReroll): a new roll of the same kind; focus stays on Reroll. */
  reroll() {
    if (this.closing) return;
    if (!this.run.rerollOffer()) { this.rerollDenied(); return; }
    this.mixer.fire('ui_reroll');
    this.bus.emit(EV.FTUE, 'reward-rerolled');
    const o = this.run.offer;
    this.nav.clear();
    this.dc.destroy();
    this.buildDraft(o, true);
    this.nav.raise();
    this.nav.focus(this.nav.has('f:reroll') ? 'f:reroll' : 'o:0', { silent: true, snap: true });
    this.onMove(this.nav.cur());
  }
  rerollDenied() {
    const why = this.run.cantRerollOffer();
    this.mixer.fire('ui_denied');
    if (why) this.detail.setText(why.reason === 'coins' ? t('reward.rerollNeed', { n: why.need }) : t('reward.rerollNoneHint'));
  }
  /** Skip (economy.skip): take the gold, forfeit the offer, close. No confirm: the label states the trade. */
  skip() {
    if (this.closing) return;
    if (!this.run.offerIsDraft) return;
    this.run.skipOffer();
    this.mixer.fire('reward_skip');
    this.closing = true;
    this.m.close(() => this.flow.close('reward'));
  }

  focusCard(i, on) {
    const k = this.cards && this.cards[i]; if (!k) return;
    k.draw(on);
    if (reduced()) return;
    this.tweens.add({ targets: k.c, y: k.y - (on ? 3 : 0), duration: 66, ease: 'Quad.easeOut' });
  }

  footer(items, y, upId) {
    let x = UI_W / 2 - (items.length * 124 - 8) / 2;
    const ids = [];
    for (const it of items) {
      // explicit x/w/h (v2 draft footer) or the v1 centred 116×20 row
      const bx = it.x ?? x, bw = it.w ?? 116, bh = it.h ?? 20, by = y + (30 - bh) / 2 * (it.h != null ? 1 : 0);
      const b = button(this, bx, by, bw, bh, it.label, { kind: it.kind, disabled: !!it.disabled });
      (this.dc || this.p).add(b);
      this.nav.add({ id: it.id, x: bx, y: by, w: bw, h: bh, disabled: !!it.disabled, onDenied: it.denied,
        onFocus: () => b.setFocused(true), onBlur: () => b.setFocused(false),
        onConfirm: () => { b.press(); it.act(); }, nav: { up: upId, down: null } });
      ids.push(it.id); x += 124;
    }
    this.nav.linkList(ids, 'h', false);
  }

  onMove(it) {
    if (!this.detail) return;
    let s = '';
    if (it.id === 'strip') s = t('reward.stripHint');
    else if (it.id === 'f:edit') s = t('reward.editHint');
    else if (it.id === 'f:close') s = t('reward.closeHint');
    else if (it.id === 'f:skip') s = t('reward.skipHint', { n: this.run.skipPay });
    else if (it.id === 'f:reroll') { const why = this.run.cantRerollOffer(); s = !why ? t('reward.rerollHint') : why.reason === 'coins' ? t('reward.rerollNeed', { n: why.need }) : t('reward.rerollNoneHint'); }
    else if (it.id && it.id.startsWith('o:')) s = this.chipDetail(+it.id.slice(2));
    this.detail.setText(s);
  }

  /** The detail line for a focused draft card: its chips in full (counter reason, duo parents). */
  chipDetail(i) {
    const o = this.run.offer; if (!o) return '';
    const id = o.items[i]; if (!id) return '';
    const kw = this.run.upcomingKeyword;
    const rec = cat().cards[id] || cat().relics[id];
    if (rec && rec.duo) return t('reward.duoHint', { a: cat().relics[rec.duo.parents[0]].name, b: cat().relics[rec.duo.parents[1]].name });
    if (rec && (rec.category === 'corrupted')) return t('reward.corruptedHint');
    if (kw && rec && (rec.keywords || []).includes(kw)) return t('reward.countersHint', { kw: t(`kw.${kw}`), defence: t(`kw.defence.${defenceFor(cat(), kw)}`) });
    return '';
  }

  take(i) {
    if (this.closing) return;
    const o = this.run.offer;
    const kind = o.kind;
    const id = this.run.takeOffer(i);
    if (!id) return;
    const rel = cat().relics[id];
    // cue-spec v1.2: duo_unlock / corrupted_take play for those relics (relic_gain routing stays with audio.js)
    this.mixer.fire(rel && rel.duo ? 'duo_unlock' : rel && rel.category === 'corrupted' ? 'corrupted_take' : 'pickup_card');
    // reward-take: 2-frame flash on the chosen, others drop 8 px and fade (120 ms)
    const chosen = this.cards[i];
    const fl = this.add.rectangle(chosen.x, chosen.c.y, 176, 196, 0xffffff, 0.8).setOrigin(0);
    this.p.add(fl);
    this.time.delayedCall(33, () => fl.destroy());
    this.cards.forEach((k, j) => { if (j !== i && !reduced()) this.tweens.add({ targets: k.c, y: k.c.y + 8, alpha: 0, duration: 120, ease: 'Quad.easeIn' }); });
    this.closing = true;
    this.time.delayedCall(reduced() ? 40 : 150, () => {
      if (kind === 'relic' || kind === 'bossRelic') this.m.close(() => this.flow.close('reward'));
      else this.m.close(() => this.flow.replace('pause', { tab: 'wands', heldCard: id, _swap: true }), { swap: true });
    });
  }

  toEditor() {
    if (this.closing) return;
    this.closing = true;
    const data = this.wandMode && this.args.mode === 'wand' ? { mode: 'wand', wandId: this.args.wandId, shopIndex: this.args.shopIndex } : {};
    this.m.close(() => this.flow.replace('pause', { tab: 'wands', returnTo: { key: 'reward', data }, _swap: true }), { swap: true });
  }

  close() {
    if (this.closing) return;
    this.closing = true;
    // Shop wand: purchase cancelled, no charge → back to the shop on that item.
    if (this.args.mode === 'wand' && this.args.shopIndex != null) this.m.close(() => this.flow.replace('shop', { focusIndex: this.args.shopIndex, _swap: true }), { swap: true });
    else this.m.close(() => this.flow.close('reward'));
  }

  // ====================================================================================== S4w
  buildWandOffer() {
    const s = this, p = this.p, run = this.run;
    const shop = this.args.mode === 'wand' && this.args.shopIndex != null;
    const wandId = this.args.wandId || (run.offer && run.offer.items[0]);
    this.newWandId = wandId;
    const d = cat().wands[wandId];
    p.add(box(s, 16, 8, 608, 344, 'ornate'));
    p.add(txt(s, UI_W / 2, 16, t('reward.wandTitle'), 'T2', { origin: [0.5, 0] }));
    // new wand panel
    p.add(box(s, 32, 34, 576, 112, 'dark'));
    p.add(icon(s, 58, 60, 'wands', wandId, 32));
    p.add(txt(s, 82, 42, d.name, 'T2'));
    p.add(txt(s, 82, 58, `${rarityWord(d.rarity)}${shop ? ' · ' + t('shop.price', { n: run.shop.stock[this.args.shopIndex].price }) : ''}`, 'T1', { color: C.rar[d.rarity] ?? C.dim }));
    p.add(txt(s, 82, 72, d.desc, 'T1', { color: C.dim, wrap: 300 }));
    const rows = [
      [t('editor.stat.slots'), String(d.capacity)], [t('editor.stat.manaMax'), String(d.manaMax)], [t('editor.stat.regen'), `${d.manaRegen}/s`],
      [t('editor.stat.castDelay'), sec2(d.castDelayMs)], [t('editor.stat.recharge'), sec2(d.rechargeMs)], [t('editor.stat.spread'), pmDeg(num(d.spreadDeg))],
      [t('editor.stat.spellsPerCast'), String(d.spellsPerCast)], [t('editor.stat.shuffle'), d.shuffle ? t('editor.yes') : t('editor.no')],
    ];
    rows.forEach(([l, v], r) => { const x = 400 + (r % 2) * 104, y = 42 + Math.floor(r / 2) * 12; p.add(txt(s, x, y, l, 'T1', { color: C.dim })); p.add(txt(s, x + 98, y, v, 'T1', { origin: [1, 0] })); });
    (d.presetCards || []).forEach((cid, k) => p.add(cardCell(s, 82 + k * 20, 118, cardOf(cid), 18)));
    if ((d.alwaysCast || []).length) p.add(txt(s, 400, 94, t('editor.alwaysLine', { card: d.alwaysCast.map((x) => cardOf(x).name).join(', ') }), 'T1', { color: C.dim, wrap: 200 }));
    // P11 coach line (first wand offer)
    if (!Save.flag('wandOffer')) { p.add(txt(s, UI_W / 2, 150, t('reward.wandCoach'), 'T1', { origin: [0.5, 0], color: C.gold })); Save.setFlag('wandOffer'); }
    this.bus.emit(EV.FTUE, 'wandoffer-opened');
    // carried wands (swap targets) + Take
    const free = run.wands.length < run.wandSlots;
    const ids = [];
    const y = 168;
    p.add(txt(s, 32, y - 2, t('reward.carried'), 'T1', { color: C.dim }));
    const cw = 180, gap = 12;
    run.wands.forEach((w, i) => {
      const x = 32 + i * (cw + gap), yy = y + 12;
      const g = this.add.graphics(); p.add(g);
      const draw = (f) => { g.clear().fillStyle(C.stroke, 1).fillRect(x, yy, cw, 84).fillStyle(C.panel, 1).fillRect(x + 1, yy + 1, cw - 2, 82).lineStyle(1, f ? C.gold : C.slateDark, 1).strokeRect(x + 1.5, yy + 1.5, cw - 3, 81); };
      draw(false);
      p.add(icon(s, x + 14, yy + 14, 'wands', w.id, 16));
      p.add(txt(s, x + 26, yy + 6, w.def.name, 'T1', { wrap: cw - 30 }));
      w.state.slots.forEach((cid, k) => p.add(cardCell(s, x + 6 + (k % 8) * 20, yy + 30 + Math.floor(k / 8) * 20, cardOf(cid), 18)));
      p.add(txt(s, x + cw / 2, yy + 70, t('reward.swapFor'), 'T1', { origin: [0.5, 0], color: C.warn }));
      const id = `c:${i}`; ids.push(id);
      this.nav.add({ id, x, y: yy, w: cw, h: 84, twoTap: true, onConfirm: () => this.askSwap(i), onFocus: () => draw(true), onBlur: () => draw(false) });
    });
    this.nav.linkList(ids, 'h', false);
    this.detail = txt(s, 32, 272, '', 'T1', { color: C.dim, wrap: 576 });
    p.add(this.detail);
    const foot = [];
    if (free) foot.push({ id: 'f:take', label: t('reward.takeWand'), kind: 'primary', act: () => this.takeWand(null) });
    foot.push({ id: 'f:edit', label: t('reward.editWands'), act: () => this.toEditor() });
    foot.push({ id: 'f:close', label: t(shop ? 'reward.cancelBuy' : 'reward.close'), act: () => this.close() });
    this.footer(foot, 318, ids[0] || null);
    ids.forEach((id) => { this.nav.get(id).nav = { ...(this.nav.get(id).nav || {}), down: foot[0].id, up: null }; });
    // default focus: Take if a slot is free, else the carried wand with the fewest filled slots
    if (free) this.nav.focus('f:take', { silent: true, snap: true });
    else {
      let best = 0, bn = Infinity;
      run.wands.forEach((w, i) => { const n = w.state.slots.filter(Boolean).length; if (n < bn) { bn = n; best = i; } });
      this.nav.focus(`c:${best}`, { silent: true, snap: true });
    }
    this.onMove = (it) => this.detail.setText(it.id.startsWith('c:') ? t('reward.swapHint') : it.id === 'f:take' ? t('reward.takeHint') : '');
    this.onMove(this.nav.cur());
  }

  askSwap(i) {
    const run = this.run, w = run.wands[i];
    const k = w.state.slots.filter(Boolean).length;
    const free = run.bag.length - run.bagCount;
    const m = Math.max(0, k - free);
    const text = t('confirm.swapWand', { wand: w.def.name, k }) + (m ? t('confirm.swapWandOverflow', { m }) : '') + '.';
    this.__dialog = new Dialog(this, { mainNav: this.nav, text, width: 340,
      options: [{ label: t('confirm.cancel') }, { label: t('confirm.replace'), kind: 'danger', action: () => this.takeWand(i) }] });
  }

  takeWand(replaceIndex) {
    if (this.closing) return;
    const run = this.run;
    const shop = this.args.mode === 'wand' && this.args.shopIndex != null;
    if (shop) {
      const r = run.buyWand(this.args.shopIndex, replaceIndex);
      if (!r) { this.mixer.fire('ui_denied'); this.detail.setText(t('shop.reason.coins', { n: run.cantBuy(this.args.shopIndex)?.need ?? '' })); return; }
      this.mixer.fire('ui_buy');
      this.closing = true;
      this.m.close(() => this.flow.replace('shop', { focusIndex: this.args.shopIndex, _swap: true }), { swap: true });
      return;
    }
    run.takeOffer(0);
    run.takeWand(this.newWandId, replaceIndex);
    this.mixer.fire('ui_confirm');
    this.closing = true;
    this.m.close(() => this.flow.close('reward'));
  }

  update() {
    if (this.flow.top() !== 'reward') return;
    const ex = this.extra.consume();
    const ui = dropShadowedBack(this.router.consumeUI(), ex);
    if (ex.includes('editor') && !this.__dialog && !this.closing) { this.toEditor(); return; }
    for (let i = 0; i < ui.length; i++) {
      const a = ui[i];
      if (this.closing) break;
      if (this.__dialog) { this.__dialog.handle(a); continue; }
      if (a === 'back') { this.close(); break; }
      if (a === 'tabPrev' || a === 'tabNext') continue;
      this.nav.handle(a);
    }
  }
}

export { setColor, glyph };
