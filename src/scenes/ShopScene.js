// ShopScene — S5 (screen-graph §1, §3, §9.5, §9.5b; systems.md §8). Reads run.shop (the sim calls run.openShop()
// before opening). A shop visit is a multi-purchase session. A disabled action ALWAYS states its reason.
//
// Tabs (v2): **Buy** · **Forge** — LB/RB or Q/E, or a tap/click on the tab. The tab is remembered per shop visit.
//   Buy   stock grid (sale slot: old price struck through + SALE chip), Reroll, Ban (1 per shop, D9 confirm;
//         KB Delete / pad △ / the Ban button act on the item last focused), Leave. A shop wand routes to S4w.
//   Forge (feature `forge`, else 🔒 + its goal): Merge · Evolve · +1 Slot columns (forge.json); pane C shows the
//         before/after (stat diff, ≈DPS delta per affected wand); Forge = primary; D7 confirm for merge/evolve.
// Data: { focusIndex?, tab? }.

import { hintLine } from '../ui/HudKit.js';
import Phaser from '../../lib/phaser.esm.min.js';
import { UI_W } from '../ui/uiSpace.js';   // 640×360 overlay design space
import { modalChrome } from './overlay.js';
import { FocusNav } from '../ui/nav.js';
import { Dialog } from '../ui/Dialog.js';
import { ExtraKeys, dropShadowedBack } from '../ui/extraKeys.js';
import { C, txt, icon, cardCell, setColor } from '../ui/kit.js';
import { button, box, glyph, richLine, reduced, deniedMotion, fitText } from '../ui/draw.js';
import { cat } from '../data/catalog.js';
import { Save } from '../core/save.js';
import { EV, listen } from '../core/events.js';
import { t } from '../core/i18n.js';
import { cardOf, typeWord, rarityWord, cardRows, modifierLines, SYM } from '../ui/fmt.js';

const IW = 180, IH = 104;
const POS = [[34, 44], [230, 44], [426, 44], [34, 158], [230, 158], [426, 158]];
// Forge layout (screen-graph §9.5, fitted to 640×360: three 160 px columns + pane C 94 px)
const FCOL = [24, 190, 356], FW = 160, FY = 40, PANE = { x: 522, y: 40, w: 94 };
// Reward/Shop editor keys + Ban (KB Delete / pad △ = W3C 3)
const SHOP_KEYS = { keys: { Tab: 'editor', KeyI: 'editor', Delete: 'ban' }, pad: { 8: 'editor', 17: 'editor', 3: 'ban' } };

export class ShopScene extends Phaser.Scene {
  constructor() { super('shop'); }

  init(data) { this.args = data || {}; }

  create() {
    this.m = modalChrome(this, { swap: !!this.args._swap });
    Object.assign(this, { router: this.m.router, flow: this.m.flow, bus: this.m.bus, run: this.m.run, mixer: this.m.mixer });
    this.closing = false; this.__dialog = null;
    this.touch = !!(this.router && this.router.touchProfile);
    const top = () => this.flow.top() === 'shop' && !this.closing && !this.__dialog;
    this.nav = new FocusNav(this, { layer: this.m.panel, isActive: top, onMove: (it) => this.showDetail(it) });
    this.extra = new ExtraKeys(this, top, SHOP_KEYS);
    const p = this.p = this.m.panel;
    p.add(box(this, 16, 8, 608, 344, 'ornate'));
    p.add(txt(this, UI_W / 2, 14, t('shop.title'), 'T2', { origin: [0.5, 0] }));
    this.tabC = this.add.container(0, 0); p.add(this.tabC);
    this.coinsC = this.add.container(0, 0); p.add(this.coinsC);
    this.stockC = this.add.container(0, 0); p.add(this.stockC);
    this.forgeC = this.add.container(0, 0); p.add(this.forgeC);
    this.detailC = this.add.container(0, 0); p.add(this.detailC);
    this.footC = this.add.container(0, 0); p.add(this.footC);
    this.lastItem = null;
    this.forgeSel = null;
    if (!this.run || !this.run.shop) { p.add(txt(this, UI_W / 2, 150, t('shop.none'), 'T1', { origin: [0.5, 0.5], color: C.dim })); this.tab = 'buy'; this.buildFooter(); this.nav.focus('f:leave', { silent: true, snap: true }); return; }
    // the tab is remembered per shop visit (run.shop.tab), a returnTo from the editor may name it
    this.tab = this.args.tab || this.run.shop.tab || 'buy';
    this.buildCoins();
    this.buildTabs();
    this.buildBody();
    this.buildFooter();
    this.focusDefault();
    this.nav.raise();
    // affordability changes with coins/HP/bag: rebuild (on change only, never per frame)
    const refresh = () => { if (!this.closing && !this._mutating) this.refreshAll(this.nav.current); };
    listen(this, this.bus, EV.PLAYER_GOLD, refresh);
    listen(this, this.bus, EV.PLAYER_HP, refresh);
    listen(this, this.bus, EV.BAG_CHANGED, refresh);
    this.bus.emit(EV.FTUE, 'shop-opened');
    Save.setFlag('shop');
  }

  focusDefault() {
    if (this.tab === 'forge') {
      const first = this.nav.order.find((id) => id.startsWith('fg:') && !this.nav.get(id).disabled) || this.nav.order.find((id) => id.startsWith('fg:'));
      this.nav.focus(first || 'f:leave', { silent: true, snap: true });
    } else {
      let f = this.args.focusIndex;
      if (f == null || !this.nav.has(`i:${f}`)) { f = this.run.shop.stock.findIndex((_, i) => !this.run.cantBuy(i)); if (f < 0) f = 0; }
      this.nav.focus(`i:${f}`, { silent: true, snap: true });
    }
    this.showDetail(this.nav.cur());
  }

  get forgeOpen() { return !!(this.run && this.run.features && this.run.features.forge); }

  // ================================================================================== tabs
  buildTabs() {
    const c = this.tabC; c.removeAll(true);
    this.nav.clear('tab:');
    const h = this.touch ? 24 : 16, y = 12;
    const tabs = [{ id: 'buy', label: t('shop.tab.buy') }, { id: 'forge', label: this.forgeOpen ? t('shop.tab.forge') : t('shop.tab.forgeLocked') }];
    let x = this.touch ? 48 : 34;                        // clear of the touch Back button's 40×40 hit (§9.7)
    for (const tb of tabs) {
      const w = 76;
      const b = button(this, x, y, w, h, tb.label, { selected: this.tab === tb.id });
      c.add(b);
      this.nav.add({ id: `tab:${tb.id}`, x, y, w, h, clickOnly: true, onClick: () => this.setTab(tb.id) });
      x += w + 4;
    }
  }

  setTab(tab) {
    if (tab === this.tab || this.closing) return;
    this.tab = tab;
    if (this.run.shop) this.run.shop.tab = tab;
    this.mixer.fire('ui_move');
    this.nav.clear();
    this.buildTabs(); this.buildBody(); this.buildFooter();
    this.focusDefault();
    this.nav.raise();
  }

  buildBody() {
    this.stockC.removeAll(true); this.forgeC.removeAll(true);
    this.nav.clear('i:'); this.nav.clear('fg:'); this.nav.clear('pane:');
    if (this.tab === 'forge') this.buildForge();
    else this.buildStock();
  }

  buildCoins() {
    const c = this.coinsC; c.removeAll(true);
    c.add(richLine(this, 606, 16, [{ g: 'coin' }, ' ', String(this.run.coins)], { align: 'right', color: C.gold }));
  }

  // ================================================================================== Buy tab
  buildStock() {
    const c = this.stockC, run = this.run;
    c.removeAll(true);
    this.nav.clear('i:');
    this.items = [];
    run.shop.stock.forEach((it, i) => {
      if (i >= POS.length) return;
      const [x, y] = POS[i];
      const ic = this.add.container(x, y);
      c.add(ic);
      const g = this.add.graphics(); ic.add(g);
      const why = run.cantBuy(i);
      const sold = it.sold || !it.id;
      const draw = (f) => { g.clear().fillStyle(C.stroke, 1).fillRect(0, 0, IW, IH).fillStyle(C.panel, 1).fillRect(1, 1, IW - 2, IH - 2)
        .lineStyle(1, f ? C.gold : C.slateDark, 1).strokeRect(1.5, 1.5, IW - 3, IH - 3); };
      draw(false);
      const name = this.itemName(it);
      const art = this.add.container(0, 0); ic.add(art);
      if (it.kind === 'card') art.add(cardCell(this, 8, 8, cardOf(it.id), 36, { isNew: !Save.isDiscovered('cards', it.id) }));
      else if (it.kind === 'relic') art.add(icon(this, 26, 26, 'relics', it.id, 32));
      else if (it.kind === 'wand') art.add(icon(this, 26, 26, 'wands', it.id, 32));
      else if (it.kind === 'heal') art.add(glyph(this, 20, 20, 'heart'));
      if (sold) art.setAlpha(0.3);
      ic.add(txt(this, 50, 8, name, 'T1', { wrap: IW - 56 }));
      ic.add(txt(this, 50, 34, this.itemSub(it), 'T1', { color: C.dim, wrap: IW - 56 }));
      if (sold) ic.add(txt(this, IW / 2, 62, t('shop.sold'), 'T2', { origin: [0.5, 0], color: C.dim }));
      else {
        const priceCol = why && why.reason === 'coins' ? C.error : C.gold;
        if (it.sale && it.basePrice !== it.price) {
          // §9.5b: old → new, the old price struck through (a line, not a colour) + a SALE chip
          const old = richLine(this, 8, 60, [{ g: 'coin' }, ' ', { t: String(it.basePrice), color: C.dim }]);
          ic.add(old);
          const ow = old.lineWidth || 30;
          ic.add(this.add.graphics().lineStyle(1, C.text, 1).lineBetween(18, 66.5, 8 + ow + 1, 66.5));
          ic.add(txt(this, 8 + ow + 6, 60, String(it.price), 'T1', { color: priceCol }));
          const st = txt(this, IW - 8, 6, t('shop.sale'), 'T1', { origin: [1, 0], color: C.gold });
          ic.add(this.add.graphics().fillStyle(C.stroke, 1).fillRect(IW - 10 - Math.ceil(st.width), 5, Math.ceil(st.width) + 4, 12).lineStyle(1, C.gold, 1).strokeRect(IW - 9.5 - Math.ceil(st.width), 5.5, Math.ceil(st.width) + 3, 11));
          ic.add(st);
        } else ic.add(richLine(this, 8, 60, [{ g: 'coin' }, ' ', { t: String(it.price), color: priceCol }]));
        const rl = txt(this, 8, 76, why ? this.reasonText(why) : t('shop.buy'), 'T1', { color: why ? C.dim : C.ok, wrap: IW - 16 });
        rl.__baseColor = why ? C.dim : C.ok;
        ic.add(rl);
        this.items[i] = { ic, rl, draw, art };
      }
      if (!this.items[i]) this.items[i] = { ic, draw, art };
      const col = i % 3, row = Math.floor(i / 3);
      this.nav.add({ id: `i:${i}`, x, y, w: IW, h: IH, stock: i, twoTap: true, disabled: !!why, onConfirm: () => this.buy(i), onDenied: () => this.denied(i),
        onFocus: () => { this.lastItem = i; this.focusItem(i, true); }, onBlur: () => this.focusItem(i, false),
        nav: { left: col > 0 ? `i:${i - 1}` : null, right: col < 2 && i + 1 < run.shop.stock.length ? `i:${i + 1}` : null,
          up: row > 0 ? `i:${i - 3}` : null, down: row === 0 && i + 3 < run.shop.stock.length ? `i:${i + 3}` : 'f:reroll' } });
    });
  }

  focusItem(i, on) {
    const k = this.items && this.items[i]; if (!k) return;
    k.draw(on);
    if (reduced()) return;
    const y0 = POS[i][1];
    this.tweens.add({ targets: k.ic, y: y0 - (on ? 3 : 0), duration: 66, ease: 'Quad.easeOut' });
  }

  itemName(it) {
    if (!it.id) return t('shop.empty');
    if (it.kind === 'card') return cardOf(it.id).name;
    if (it.kind === 'relic') return cat().relics[it.id].name;
    if (it.kind === 'wand') return cat().wands[it.id].name;
    return t('shop.heal');
  }
  itemSub(it) {
    if (!it.id) return '';
    if (it.kind === 'card') return typeWord(cardOf(it.id));
    if (it.kind === 'relic') return `${t('shop.kind.relic')} · ${rarityWord(cat().relics[it.id].rarity)}`;
    if (it.kind === 'wand') return `${t('shop.kind.wand')} · ${rarityWord(cat().wands[it.id].rarity)}`;
    return t('shop.healSub', { n: cat().economy.prices.healPotionAmount });
  }
  reasonText(why) {
    return t(`shop.reason.${why.reason}`, { n: why.need ?? '' });
  }

  // ================================================================================== footer
  buildFooter() {
    const c = this.footC; c.removeAll(true);
    this.nav.clear('f:');
    const run = this.run;
    const h = this.touch ? 30 : 20, y = 272;
    const fam = this._fam = this.router.promptFamily;   // G7 (controller-prompts §4)
    const hintY = this.tab === 'forge' ? 326 : this.touch ? 306 : 300;
    const eb = fam === 'kbm' ? richLine(this, UI_W / 2, hintY, t('shop.editHint'), { align: 'center', color: C.dim })
      : hintLine(this, UI_W / 2, hintY, t('shop.editHintPad'), this.router, { align: 'center' });
    c.add(eb);
    this.nav.add({ id: 'f:edit', x: UI_W / 2 - 110, y: hintY - 2, w: 220, h: 14, clickOnly: true, onClick: () => this.toEditor() });
    const forge = this.tab === 'forge' && run && run.shop;
    const lx = forge ? PANE.x : this.tab === 'buy' && run && run.shop ? 390 : UI_W / 2 - 60, lw = forge ? PANE.w : 120;
    const lb = button(this, lx, y, lw, h, t('shop.leave'));
    c.add(lb);
    const upOf = (fallback) => (this.tab === 'forge' ? (this._forgeLast || fallback) : fallback);
    this.nav.add({ id: 'f:leave', x: lx, y, w: lw, h, onConfirm: () => { lb.press(); this.close(); },
      onFocus: () => lb.setFocused(true), onBlur: () => lb.setFocused(false),
      nav: { up: forge ? 'pane:forge' : upOf('i:5'), left: this.tab === 'buy' ? 'f:ban' : forge ? () => this._forgeLast || null : null, right: null, down: null } });
    if (this.tab !== 'buy' || !run || !run.shop) return;
    // Reroll
    const cost = run.rerollCost;
    const canReroll = run.coins >= cost;
    const rb = button(this, 130, y, 120, h, cost === 0 ? t('shop.rerollFree') : t('shop.reroll', { n: cost }));
    rb.setDisabled(!canReroll);
    // Ban (economy.ban: 1 per shop, free) — acts on the item last focused
    const bans = run.bansLeft;
    const bb = button(this, 260, y, 120, h, t('shop.ban', { n: bans }));
    bb.setDisabled(!bans);
    c.add([rb, bb]);
    this.nav.add({ id: 'f:reroll', x: 130, y, w: 120, h, disabled: !canReroll,
      onDenied: () => { this.mixer.fire('ui_denied'); deniedMotion(this, rb.label); this.setDetail(t('shop.reason.coins', { n: cost - run.coins })); },
      onConfirm: () => { rb.press(); this.reroll(); }, onFocus: () => rb.setFocused(true), onBlur: () => rb.setFocused(false),
      nav: { up: 'i:3', right: 'f:ban', left: null, down: null } });
    this.nav.add({ id: 'f:ban', x: 260, y, w: 120, h, disabled: !bans,
      onDenied: () => { this.mixer.fire('ui_denied'); deniedMotion(this, bb.label); this.setDetail(t('shop.banNone')); },
      onConfirm: () => { bb.press(); this.askBan(this.lastItem); }, onFocus: () => bb.setFocused(true), onBlur: () => bb.setFocused(false),
      nav: { up: 'i:4', left: 'f:reroll', right: 'f:leave', down: null } });
  }

  setDetail(extra) { this._extraLine = extra; this.showDetail(this.nav.cur()); }

  showDetail(it) {
    if (this.tab === 'forge') { this.showForgePane(it); return; }
    const c = this.detailC; if (!c) return;
    c.removeAll(true);
    const run = this.run;
    const x = 34, y = 318, W = 572;
    let s = '';
    if (it && it.stock != null && run && run.shop) {
      const st = run.shop.stock[it.stock];
      if (st.id && st.kind === 'card') { const cd = cardOf(st.id); s = `${cd.desc}  ${cd.type !== 'projectile' ? modifierLines(cd).join(' · ') : cardRows(cd).slice(2, 6).map(([l, v]) => `${l} ${v}`).join(' · ')}`; }
      else if (st.id && st.kind === 'relic') s = cat().relics[st.id].desc;
      else if (st.id && st.kind === 'wand') { const w = cat().wands[st.id]; s = `${w.desc} ${t('shop.wandNote')}`; }
      else if (st.kind === 'heal') s = t('shop.healDesc', { n: cat().economy.prices.healPotionAmount });
    } else if (it && it.id === 'f:reroll') s = t('shop.rerollDesc');
    else if (it && it.id === 'f:ban') {
      const i = this.lastItem, st = i != null && run.shop.stock[i];
      const why = i == null ? { reason: 'pick' } : run.cantBan(i);
      s = !why ? t('shop.banDesc', { item: this.itemName(st) }) : t(`shop.banReason.${why.reason}`);
    } else if (it && it.id === 'f:leave') s = t('shop.leaveDesc');
    if (this._extraLine) { c.add(txt(this, x, y - 12, this._extraLine, 'T1', { color: C.warn })); this._extraLine = null; }
    c.add(txt(this, x, y, s, 'T1', { color: C.dim, wrap: W }));
  }

  denied(i) {
    const why = this.run.cantBuy(i);
    this.mixer.fire('ui_denied');
    const k = this.items[i];
    if (k && k.rl) deniedMotion(this, k.ic, k.rl);
    if (why) this.setDetail(this.reasonText(why));
  }

  buy(i) {
    const run = this.run, it = run.shop.stock[i];
    if (run.cantBuy(i)) { this.denied(i); return; }
    if (it.kind === 'wand') {                                // S5 → S4w; charged only when taken
      this.closing = true;
      this.m.close(() => this.flow.replace('reward', { mode: 'wand', wandId: it.id, shopIndex: i, _swap: true }), { swap: true });
      return;
    }
    const k = this.items[i];
    this._mutating = true;
    const ok = run.buy(i);
    this._mutating = false;
    if (!ok) { this.denied(i); return; }
    this.mixer.fire('ui_buy');
    // shop-buy: icon rises 8 px and fades (reduced: fades, 100 ms); "Sold" shows instantly after
    if (k && k.art) {
      if (reduced()) this.tweens.add({ targets: k.art, alpha: 0, duration: 100 });
      else this.tweens.add({ targets: k.art, y: -8, alpha: 0, duration: 150, ease: 'Cubic.easeIn' });
    }
    this.time.delayedCall(reduced() ? 100 : 150, () => this.refreshAll(`i:${i}`));
  }

  /** D9 (screen-graph §9.8): "Ban {item}? It won't appear again this run." — Cancel is the default. */
  askBan(i) {
    const run = this.run;
    const why = i == null ? { reason: 'pick' } : run.cantBan(i);
    if (why) { this.mixer.fire('ui_denied'); this.setDetail(t(`shop.banReason.${why.reason}`)); return; }
    const item = this.itemName(run.shop.stock[i]);
    this.__dialog = new Dialog(this, { mainNav: this.nav, text: t('confirm.ban', { item }), width: 320,
      options: [{ label: t('confirm.cancel') }, { label: t('confirm.banOk'), kind: 'danger', action: () => this.doBan(i) }] });
  }
  doBan(i) {
    this._mutating = true;
    const ok = this.run.ban(i);
    this._mutating = false;
    if (!ok) { this.mixer.fire('ui_denied'); return; }
    this.mixer.fire('ui_confirm');                            // cue-spec v1.2 shop_ban → ui_confirm
    this.refreshAll(`i:${i}`);
  }

  reroll() {
    this._mutating = true;
    const ok = this.run.reroll();
    this._mutating = false;
    if (!ok) { this.mixer.fire('ui_denied'); return; }
    this.mixer.fire('ui_reroll');
    this.refreshAll('f:reroll');
    // reroll: the rerollable items deal in (stagger 40)
    this.items.forEach((k, i) => {
      if (!k || this.run.shop.stock[i].kind === 'heal') return;
      k.ic.setAlpha(0);
      if (reduced()) this.tweens.add({ targets: k.ic, alpha: 1, duration: 120 });
      else { const y0 = POS[i][1]; k.ic.y = y0 + 16; this.tweens.add({ targets: k.ic, alpha: 1, y: y0, duration: 200, delay: 40 * i, ease: 'Back.easeOut' }); }
    });
  }

  // ================================================================================== Forge tab (S5f)
  buildForge() {
    const c = this.forgeC, run = this.run;
    c.removeAll(true);
    this.nav.clear('fg:'); this.nav.clear('pane:');
    this.forgeRows = {};
    if (!this.forgeOpen) {
      c.add(richLine(this, UI_W / 2, 130, [{ g: 'lock' }, ' ', t('shop.forgeLocked')], { align: 'center', color: C.dim }));
      c.add(txt(this, UI_W / 2, 146, t('shop.forgeLockedHint'), 'T1', { origin: [0.5, 0], color: C.dim, wrap: 360 }));
      return;
    }
    const st = run.forgeState();
    const rowH = this.touch ? 36 : 26;
    const heads = [t('forge.merge'), t('forge.evolve'), t('forge.slot')];
    heads.forEach((h, k) => c.add(txt(this, FCOL[k], FY, h, 'T1', { color: C.gold })));
    const cols = [[], [], []];
    // Merge: every pair of identical owned cards with a recipe
    for (const m of st.merges) if (m.have >= m.recipe.count) cols[0].push({ kind: 'merge', row: m });
    // Evolve: every recipe; missing parts dimmed with "Needs:"; undiscovered results as a silhouette
    for (const e of st.evolves) cols[1].push({ kind: 'evolve', row: e });
    // +1 Slot: one row per wand
    st.slots.forEach((sl) => cols[2].push({ kind: 'slot', row: sl }));
    const ids = [[], [], []];
    cols.forEach((list, k) => {
      if (!list.length) c.add(txt(this, FCOL[k], FY + 16, t(k === 0 ? 'forge.noPairs' : 'forge.none'), 'T1', { color: C.dim, wrap: FW }));
      list.forEach((r, j) => {
        const x = FCOL[k], y = FY + 14 + j * (rowH + 2);
        if (y + rowH > 310) return;
        const id = `fg:${r.kind}:${r.kind === 'slot' ? r.row.wand : r.row.recipe.id}`;
        const ok = r.row.ok;
        const rc = this.add.container(x, y); c.add(rc);
        const g = this.add.graphics(); rc.add(g);
        const draw = (f) => { g.clear().fillStyle(C.stroke, 1).fillRect(0, 0, FW, rowH).fillStyle(C.panel, 1).fillRect(1, 1, FW - 2, rowH - 2)
          .lineStyle(1, f ? C.gold : C.slateDark, 1).strokeRect(1.5, 1.5, FW - 3, rowH - 3); };
        draw(false);
        this.rowContent(rc, r, rowH);
        if (!ok) rc.setAlpha(r.row.reason === 'coins' ? 0.85 : 0.55);
        this.forgeRows[id] = { ...r, draw };
        ids[k].push(id);
        this.nav.add({ id, x, y, w: FW, h: rowH, twoTap: true, disabled: !ok, onConfirm: () => this.forgeAct(id), onDenied: () => this.forgeDenied(id),
          onFocus: () => { this.forgeSel = id; this._forgeLast = id; draw(true); }, onBlur: () => draw(false) });
      });
    });
    // grid links: up/down inside a column, left/right across columns (same row index, clamped)
    ids.forEach((col, k) => {
      this.nav.linkList(col, 'v', false);
      col.forEach((id, j) => {
        const it = this.nav.get(id);
        it.nav.left = k > 0 && ids[k - 1].length ? ids[k - 1][Math.min(j, ids[k - 1].length - 1)] : null;
        it.nav.right = k < 2 && ids[k + 1].length ? ids[k + 1][Math.min(j, ids[k + 1].length - 1)] : 'pane:forge';
        if (j === col.length - 1) it.nav.down = null;
      });
    });
    // pane C: the Forge primary button (acts on the selected row)
    const bh = this.touch ? 37 : 26, by = 272 - 6 - bh;
    this._paneBottom = by - 2;
    this.forgeBtn = button(this, PANE.x, by, PANE.w, bh, t('forge.do'), { kind: 'primary' });
    c.add(this.forgeBtn);
    this.nav.add({ id: 'pane:forge', x: PANE.x, y: by, w: PANE.w, h: bh, onConfirm: () => { this.forgeBtn.press(); if (this.forgeSel) this.forgeAct(this.forgeSel); },
      onFocus: () => this.forgeBtn.setFocused(true), onBlur: () => this.forgeBtn.setFocused(false),
      nav: { left: () => this.forgeSel || null, up: null, down: 'f:leave', right: null } });
    this.paneC = this.add.container(0, 0); c.add(this.paneC);
  }

  rowContent(rc, r, rowH) {
    const run = this.run, R = r.row;
    const coin = (n) => [{ g: 'coin' }, ' ', { t: String(n), color: R.reason === 'coins' ? C.error : C.gold }];
    if (r.kind === 'merge') {
      const from = cardOf(R.recipe.from), to = cardOf(R.recipe.to);
      rc.add(cardCell(this, 3, 3, from, 18));
      rc.add(txt(this, 24, 2, t('forge.mergeRow', { n: R.recipe.count, card: from.name }), 'T1', { wrap: 132 }));
      rc.add(richLine(this, 24, 13, [SYMTO(), ' ', { t: to.name, color: C.text }, ' · ', ...coin(R.cost)], { role: 'T1' }));
    } else if (r.kind === 'evolve') {
      const to = cardOf(R.recipe.to), base = cardOf(R.recipe.base), cata = R.recipe.catalyst;
      const known = Save.isDiscovered('cards', R.recipe.to) || R.ok;
      const im = cardCell(this, 3, 3, to, 18);
      if (!known) im.setAlpha(0.25);
      rc.add(im);
      rc.add(txt(this, 24, 2, known ? to.name : t('forge.unknown'), 'T1', { wrap: 132 }));
      const cname = cata.kind === 'relic' ? cat().relics[cata.id].name : cardOf(cata.id).name;
      if (R.ok || R.reason === 'coins') rc.add(richLine(this, 24, 13, [{ t: t('forge.stays', { relic: cname }), color: C.dim }], { role: 'T1' }));
      else {
        // one line inside the row (the full "Needs: …" reads in pane C); long pairs are cut with an ellipsis
        const nt = txt(this, 24, 13, t('forge.needs', { base: R.hasBase ? '' : base.name, plus: !R.hasBase && !R.hasCatalyst ? ' + ' : '', cata: R.hasCatalyst ? '' : cname }), 'T1', { color: C.dim });
        fitText(nt, 132); rc.add(nt);
      }
    } else {
      const w = run.wands[R.wand];
      rc.add(icon(this, 11, rowH / 2, 'wands', w.id, 16));
      rc.add(txt(this, 24, 2, w.def.name, 'T1', { wrap: 132 }));
      const line = R.reason === 'max' ? [{ t: t('forge.slotMax'), color: C.dim }] : R.reason === 'bought' ? [{ t: t('forge.slotBought', { n: cat().forgeSlot.maxBuysPerRun }), color: C.dim }]
        : [{ t: t('forge.slotRow', { a: R.capacity, b: R.next, to: SYM.to }) }, ' · ', ...coin(R.cost)];
      rc.add(richLine(this, 24, 13, line, { role: 'T1' }));
    }
  }

  /** Pane C: the focused row's full before/after (stat diff, ≈DPS delta per affected wand, catalyst note). */
  showForgePane(it) {
    const c = this.detailC; if (!c) return;
    c.removeAll(true);
    if (this.paneC) this.paneC.removeAll(true);
    const pc = this.paneC;
    if (this._extraLine) { c.add(txt(this, 34, 312, this._extraLine, 'T1', { color: C.warn })); this._extraLine = null; }
    if (!this.forgeOpen || !pc) return;
    const id = it && it.id && it.id.startsWith('fg:') ? it.id : this.forgeSel;
    const r = id && this.forgeRows[id];
    let y = PANE.y;
    const line = (s, color = C.text) => {
      if (y > (this._paneBottom || 260) - 10) return;                  // pane C never runs under the Forge button
      const tt = txt(this, PANE.x, y, s, 'T1', { color, wrap: PANE.w }); pc.add(tt); y += Math.ceil(tt.height) + 2;
    };
    if (!r) { line(t('forge.pick'), C.dim); return; }
    const R = r.row, run = this.run;
    if (r.kind === 'slot') {
      line(run.wands[R.wand].def.name);
      line(t('forge.slotRow', { a: R.capacity, b: R.next, to: SYM.to }), C.dim);
      if (R.reason) line(this.forgeReason(R), C.warn);
      return;
    }
    const recipe = R.recipe, fromId = r.kind === 'merge' ? recipe.from : recipe.base;
    line(`${cardOf(fromId).name} ${SYM.to} ${cardOf(recipe.to).name}`);
    // stat diff (the card rows whose values change)
    const a = cardRows(cardOf(fromId)), b = cardRows(cardOf(recipe.to));
    let n = 0;
    for (const [l, v] of b) {
      const old = a.find((x) => x[0] === l);
      if (old && old[1] !== v && n < 4) { line(`${l} ${old[1]} ${SYM.to} ${v}`, C.dim); n++; }
    }
    // ≈DPS delta for every wand that holds the affected cards
    for (const o of run.forgeOutcome(r.kind, recipe)) {
      const before = Math.round(run.preview(o.wand).dpsSingleTarget), after = Math.round(run.preview(o.wand, o.slots).dpsSingleTarget);
      line(t('forge.dps', { n: o.wand + 1, a: before, b: after, to: SYM.to }), after >= before ? C.ok : C.warn);
    }
    if (r.kind === 'evolve' && recipe.catalyst && recipe.catalyst.kind === 'relic') line(t('forge.stays', { relic: cat().relics[recipe.catalyst.id].name }), C.dim);
    if (R.reason) line(this.forgeReason(R), C.warn);
  }

  forgeReason(R) {
    if (R.reason === 'coins') return t('shop.reason.coins', { n: R.need });
    if (R.reason === 'max') return t('forge.slotMax');
    if (R.reason === 'bought') return t('forge.slotBought', { n: cat().forgeSlot.maxBuysPerRun });
    return t('forge.needParts');
  }

  forgeDenied(id) {
    const r = this.forgeRows[id]; if (!r) return;
    this.mixer.fire('ui_denied');
    this.forgeSel = id;
    this.setDetail(this.forgeReason(r.row));
  }

  /** Forge the row: merge/evolve ask D7 first (Cancel default); +1 slot is a plain buy. */
  forgeAct(id) {
    const r = this.forgeRows[id]; if (!r) return;
    if (!r.row.ok) { this.forgeDenied(id); return; }
    if (r.kind === 'slot') { this.doForge(r); return; }
    const recipe = r.row.recipe;
    const text = r.kind === 'merge'
      ? t('confirm.merge', { n: recipe.count, card: cardOf(recipe.from).name, result: cardOf(recipe.to).name })
      : t('confirm.evolve', { base: cardOf(recipe.base).name, cata: recipe.catalyst.kind === 'relic' ? cat().relics[recipe.catalyst.id].name : cardOf(recipe.catalyst.id).name, result: cardOf(recipe.to).name });
    this.__dialog = new Dialog(this, { mainNav: this.nav, text, width: 340,
      options: [{ label: t('confirm.cancel') }, { label: t(r.kind === 'merge' ? 'confirm.mergeOk' : 'confirm.evolveOk'), kind: 'primary', action: () => this.doForge(r) }] });
  }

  doForge(r) {
    const run = this.run;
    this._mutating = true;
    let ok;
    if (r.kind === 'merge') ok = run.forgeMerge(r.row.recipe.id);
    else if (r.kind === 'evolve') ok = run.forgeEvolve(r.row.recipe.id);
    else ok = run.forgeSlot(r.row.wand);
    this._mutating = false;
    if (!ok) { this.mixer.fire('ui_denied'); return; }
    this.mixer.fire(r.kind === 'merge' ? 'forge_merge' : r.kind === 'evolve' ? 'forge_evolve' : 'forge_slot');
    if (r.kind !== 'slot') Save.discover('cards', r.row.recipe.to);
    const keep = r.kind === 'slot' ? `fg:slot:${r.row.wand}` : null;
    this.refreshAll(keep);
  }

  // ================================================================================== shared
  refreshAll(focusId) {
    if (!this.scene.isActive()) return;
    this.buildCoins(); this.buildTabs(); this.buildBody(); this.buildFooter();
    this.nav.raise();
    if (focusId && this.nav.has(focusId)) this.nav.focus(focusId, { silent: true, snap: true });
    else if (!this.nav.cur()) this.focusDefault();
    this.showDetail(this.nav.cur());
  }

  toEditor() {
    if (this.closing) return;
    this.closing = true;
    const data = { focusIndex: this.nav.cur() && this.nav.cur().stock, tab: this.tab };
    this.m.close(() => this.flow.replace('pause', { tab: 'wands', returnTo: { key: 'shop', data }, _swap: true }), { swap: true });
  }

  close() {
    if (this.closing) return;
    this.closing = true;
    this.m.close(() => this.flow.close('shop'));
  }

  update() {
    if (this.flow.top() !== 'shop') return;
    const ex = this.extra.consume();
    const ui = dropShadowedBack(this.router.consumeUI(), ex);
    if (ex.includes('editor') && !this.closing && !this.__dialog) { this.toEditor(); return; }
    if (ex.includes('ban') && !this.closing && !this.__dialog && this.tab === 'buy' && this.run && this.run.shop) {
      const cur = this.nav.cur();
      this.askBan(cur && cur.stock != null ? cur.stock : this.lastItem);
    }
    for (let i = 0; i < ui.length; i++) {
      const a = ui[i];
      if (this.closing) break;
      if (this.__dialog) { this.__dialog.handle(a); continue; }
      if (a === 'back') { this.close(); break; }
      if (a === 'tabPrev' || a === 'tabNext') { if (this.run && this.run.shop) this.setTab(this.tab === 'buy' ? 'forge' : 'buy'); continue; }
      this.nav.handle(a);
    }
    if (this.router.promptFamily !== this._fam) { if (this.run && this.run.shop) { const cur = this.nav.current; this.buildFooter(); this.nav.raise(); if (cur) { this.nav.current = cur; this.nav.refresh(); } } }
  }
}

const SYMTO = () => SYM.to;

export { setColor };
