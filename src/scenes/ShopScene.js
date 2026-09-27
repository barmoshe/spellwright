// ShopScene — S5 (screen-graph §1, §3; systems.md §8). Reads run.shop (the sim calls run.openShop()
// before opening). Buy / Reroll / Tab → editor (returnTo) / Leave. A shop visit is a multi-purchase
// session: buying a card sends it to the bag and stays here. A disabled Buy ALWAYS states its reason
// (run.cantBuy). A shop wand routes to the wand offer (S4w) and completes via run.buyWand.
// Data: { focusIndex? }.

import { hintLine } from '../ui/HudKit.js';
import Phaser from '../../lib/phaser.esm.min.js';
import { VIEW_W } from '../config.js';
import { modalChrome } from './overlay.js';
import { FocusNav } from '../ui/nav.js';
import { ExtraKeys, EDITOR_KEYS, dropShadowedBack } from '../ui/extraKeys.js';
import { C, txt, icon, cardCell, setColor } from '../ui/kit.js';
import { button, box, glyph, richLine, reduced, deniedMotion } from '../ui/draw.js';
import { cat } from '../data/catalog.js';
import { Save } from '../core/save.js';
import { EV, listen } from '../core/events.js';
import { t } from '../core/i18n.js';
import { cardOf, typeWord, rarityWord, cardRows, modifierLines } from '../ui/fmt.js';

const IW = 180, IH = 104;
const POS = [[34, 44], [230, 44], [426, 44], [34, 158], [230, 158], [426, 158]];

export class ShopScene extends Phaser.Scene {
  constructor() { super('shop'); }

  init(data) { this.args = data || {}; }

  create() {
    this.m = modalChrome(this, { swap: !!this.args._swap });
    Object.assign(this, { router: this.m.router, flow: this.m.flow, bus: this.m.bus, run: this.m.run, mixer: this.m.mixer });
    this.closing = false; this.__dialog = null;
    const top = () => this.flow.top() === 'shop' && !this.closing;
    this.nav = new FocusNav(this, { layer: this.m.panel, isActive: top, onMove: (it) => this.showDetail(it) });
    this.extra = new ExtraKeys(this, top, EDITOR_KEYS);
    const p = this.p = this.m.panel;
    p.add(box(this, 16, 8, 608, 344, 'ornate'));
    p.add(txt(this, VIEW_W / 2, 14, t('shop.title'), 'T2', { origin: [0.5, 0] }));
    this.coinsC = this.add.container(0, 0); p.add(this.coinsC);
    this.stockC = this.add.container(0, 0); p.add(this.stockC);
    this.detailC = this.add.container(0, 0); p.add(this.detailC);
    this.footC = this.add.container(0, 0); p.add(this.footC);
    if (!this.run || !this.run.shop) { p.add(txt(this, VIEW_W / 2, 150, t('shop.none'), 'T1', { origin: [0.5, 0.5], color: C.dim })); this.buildFooter(); this.nav.focus('f:leave', { silent: true, snap: true }); return; }
    this.buildCoins();
    this.buildStock();
    this.buildFooter();
    // default focus: the interacted item, else the first affordable item
    let f = this.args.focusIndex;
    if (f == null || !this.nav.has(`i:${f}`)) { f = this.run.shop.stock.findIndex((_, i) => !this.run.cantBuy(i)); if (f < 0) f = 0; }
    this.nav.focus(`i:${f}`, { silent: true, snap: true });
    this.showDetail(this.nav.cur());
    this.nav.raise();
    // affordability changes with coins/HP/bag: rebuild the stock (on change only, never per frame)
    const refresh = () => { if (!this.closing && !this._mutating) this.refreshAll(this.nav.current); };
    listen(this, this.bus, EV.PLAYER_GOLD, refresh);
    listen(this, this.bus, EV.PLAYER_HP, refresh);
    listen(this, this.bus, EV.BAG_CHANGED, refresh);
    this.bus.emit(EV.FTUE, 'shop-opened');
    Save.setFlag('shop');
  }

  buildCoins() {
    const c = this.coinsC; c.removeAll(true);
    c.add(richLine(this, 606, 16, [{ g: 'coin' }, ' ', String(this.run.coins)], { align: 'right', color: C.gold }));
  }

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
        ic.add(richLine(this, 8, 60, [{ g: 'coin' }, ' ', { t: String(it.price), color: why && why.reason === 'coins' ? C.error : C.gold }]));
        const rl = txt(this, 8, 76, why ? this.reasonText(why) : t('shop.buy'), 'T1', { color: why ? C.dim : C.ok, wrap: IW - 16 });
        rl.__baseColor = why ? C.dim : C.ok;
        ic.add(rl);
        this.items[i] = { ic, rl, draw, art };
      }
      if (!this.items[i]) this.items[i] = { ic, draw, art };
      const col = i % 3, row = Math.floor(i / 3);
      this.nav.add({ id: `i:${i}`, x, y, w: IW, h: IH, stock: i, disabled: !!why, onConfirm: () => this.buy(i), onDenied: () => this.denied(i),
        onFocus: () => this.focusItem(i, true), onBlur: () => this.focusItem(i, false),
        nav: { left: col > 0 ? `i:${i - 1}` : null, right: col < 2 && i + 1 < run.shop.stock.length ? `i:${i + 1}` : null,
          up: row > 0 ? `i:${i - 3}` : null, down: row === 0 && i + 3 < run.shop.stock.length ? `i:${i + 3}` : 'f:reroll' } });
    });
  }

  focusItem(i, on) {
    const k = this.items[i]; if (!k) return;
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

  buildFooter() {
    const c = this.footC; c.removeAll(true);
    this.nav.clear('f:');
    const run = this.run;
    const cost = run && run.shop ? run.rerollCost : 0;
    const canReroll = !!(run && run.shop && run.coins >= cost);
    const label = run && run.shop ? (cost === 0 ? t('shop.rerollFree') : t('shop.reroll', { n: cost })) : t('shop.reroll', { n: '-' });
    const rb = button(this, 190, 272, 120, 20, label);
    rb.setDisabled(!canReroll);
    const lb = button(this, 330, 272, 120, 20, t('shop.leave'));
    const fam = this._fam = this.router.promptFamily;   // G7 (controller-prompts §4)
    const eb = fam === 'kbm' ? richLine(this, VIEW_W / 2, 300, t('shop.editHint'), { align: 'center', color: C.dim })
      : hintLine(this, VIEW_W / 2, 300, t('shop.editHintPad'), this.router, { align: 'center' });
    c.add([rb, lb, eb]);
    this.nav.add({ id: 'f:reroll', x: 190, y: 272, w: 120, h: 20, disabled: !canReroll || !run || !run.shop,
      onDenied: () => { this.mixer.fire('ui_denied'); deniedMotion(this, rb.label); this.setDetail(t('shop.reason.coins', { n: cost - (run ? run.coins : 0) })); },
      onConfirm: () => { rb.press(); this.reroll(); }, onFocus: () => rb.setFocused(true), onBlur: () => rb.setFocused(false),
      nav: { up: 'i:4', right: 'f:leave', left: null, down: null } });
    this.nav.add({ id: 'f:leave', x: 330, y: 272, w: 120, h: 20, onConfirm: () => { lb.press(); this.close(); },
      onFocus: () => lb.setFocused(true), onBlur: () => lb.setFocused(false), nav: { up: 'i:5', left: 'f:reroll', right: null, down: null } });
    this.nav.add({ id: 'f:edit', x: VIEW_W / 2 - 110, y: 298, w: 220, h: 14, clickOnly: true, onClick: () => this.toEditor() });
  }

  setDetail(extra) { this._extraLine = extra; this.showDetail(this.nav.cur()); }

  showDetail(it) {
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
    else if (it && it.id === 'f:leave') s = t('shop.leaveDesc');
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

  reroll() {
    this._mutating = true;
    const ok = this.run.reroll();
    this._mutating = false;
    if (!ok) { this.mixer.fire('ui_denied'); return; }
    this.mixer.fire('ui_confirm');
    this.refreshAll('f:reroll');
    // reroll: the rerollable items deal in (stagger 40)
    this.items.forEach((k, i) => {
      if (!k || this.run.shop.stock[i].kind === 'heal') return;
      k.ic.setAlpha(0);
      if (reduced()) this.tweens.add({ targets: k.ic, alpha: 1, duration: 120 });
      else { const y0 = POS[i][1]; k.ic.y = y0 + 16; this.tweens.add({ targets: k.ic, alpha: 1, y: y0, duration: 200, delay: 40 * i, ease: 'Back.easeOut' }); }
    });
  }

  refreshAll(focusId) {
    if (!this.scene.isActive()) return;
    this.buildCoins(); this.buildStock(); this.buildFooter();
    this.nav.raise();
    if (this.nav.has(focusId)) this.nav.focus(focusId, { silent: true, snap: true });
    this.showDetail(this.nav.cur());
  }

  toEditor() {
    if (this.closing) return;
    this.closing = true;
    this.m.close(() => this.flow.replace('pause', { tab: 'wands', returnTo: { key: 'shop', data: { focusIndex: this.nav.cur() && this.nav.cur().stock } }, _swap: true }), { swap: true });
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
    if (ex.includes('editor') && !this.closing) { this.toEditor(); return; }
    for (let i = 0; i < ui.length; i++) {
      const a = ui[i];
      if (this.closing) break;
      if (a === 'back') { this.close(); break; }
      if (a === 'tabPrev' || a === 'tabNext') continue;
      this.nav.handle(a);
    }
    if (this.router.promptFamily !== this._fam) { if (this.run && this.run.shop) { const cur = this.nav.current; this.buildFooter(); this.nav.raise(); if (cur) { this.nav.current = cur; this.nav.refresh(); } } }
  }
}

export { setColor };
