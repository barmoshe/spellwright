// core/placeholders.js — generated fallback textures. Every art slot resolves through core/art.js first; these
// exist so the game is fully playable (and readable) before or without a TA atlas frame. They follow the
// style-guide's readability grammar anyway: player shots = bright core + element SHAPE, no outline;
// enemy bullets = perfect disc, dark core, bright rim, 1 px #222222 outline (style-guide §4.1).

export const PH = { px: 'ph-px', player: 'ph-player', enemy: 'ph-enemy', bolt: 'ph-bolt' };

const EL = {
  arcane: { core: 0xffffff, mid: 0xcfc0ff, edge: 0x8b7cf0 },
  fire: { core: 0xfff6b8, mid: 0xee8e2e, edge: 0xb04a14 },
  frost: { core: 0xffffff, mid: 0xcae6f5, edge: 0x72d6ce },
  shock: { core: 0xffffff, mid: 0xfacb3e, edge: 0xc58747 },
  poison: { core: 0xe8ffb0, mid: 0x97da3f, edge: 0x4a8a2a },
};
const HOSTILE = {
  arcane: { core: 0x62232f, rim: 0xfdd0d6 },
  frost: { core: 0x1f3a48, rim: 0x72d6ce },
  poison: { core: 0x243a14, rim: 0x97da3f },
  fire: { core: 0x4a1e0a, rim: 0xfacb3e },
};

export function makePlaceholders(scene) {
  const g = scene.make.graphics({ x: 0, y: 0 }, false);
  const gen = (key, w, h, draw) => { if (scene.textures.exists(key)) return; g.clear(); draw(g); g.generateTexture(key, w, h); };

  gen('ph-px', 2, 2, (q) => q.fillStyle(0xffffff).fillRect(0, 0, 2, 2));
  gen('sw-collide', 32, 16, (q) => { q.fillStyle(0x000000, 0).fillRect(0, 0, 16, 16); q.fillStyle(0xff00ff, 1).fillRect(16, 0, 16, 16); });
  gen('ph-tiles', 32, 16, (q) => { q.fillStyle(0x3b302f).fillRect(0, 0, 16, 16); q.fillStyle(0x5a4a48).fillRect(16, 0, 16, 16); });
  gen('ph-pillar', 16, 32, (q) => {
    q.fillStyle(0x222222).fillRect(2, 0, 12, 32); q.fillStyle(0x7a6663).fillRect(3, 1, 10, 30);
    q.fillStyle(0x94807c).fillRect(3, 1, 3, 30); q.fillStyle(0x5a4a48).fillRect(3, 26, 10, 5); q.fillStyle(0x8a7470).fillRect(2, 0, 12, 3);
  });
  gen('ph-crate', 16, 16, (q) => {
    q.fillStyle(0x222222).fillRect(1, 2, 14, 14); q.fillStyle(0xa3703a).fillRect(2, 3, 12, 12);
    q.fillStyle(0xc58747).fillRect(2, 3, 12, 2); q.fillStyle(0x6d4b27).fillRect(2, 8, 12, 1).fillRect(7, 3, 1, 12);
  });
  gen('ph-shadow-10', 10, 3, (q) => q.fillStyle(0x000000, 0.5).fillEllipse(5, 1.5, 10, 3));
  gen('ph-shadow-22', 22, 5, (q) => q.fillStyle(0x000000, 0.5).fillEllipse(11, 2.5, 22, 5));
  gen('ph-player', 16, 28, (q) => {
    q.fillStyle(0x222222).fillRect(4, 7, 9, 21); q.fillStyle(0x3a4a9a).fillRect(5, 12, 7, 15);   // robe
    q.fillStyle(0x4d63c8).fillRect(5, 12, 3, 15);
    q.fillStyle(0xe8c8a8).fillRect(6, 9, 5, 4);                                                 // face
    q.fillStyle(0x2e3a7a).fillTriangle(3, 10, 13, 10, 8, 0);                                    // hat
    q.fillStyle(0xfacb3e).fillRect(7, 5, 2, 2);
  });
  gen('ph-wand', 4, 10, (q) => { q.fillStyle(0x6d4b27).fillRect(1, 3, 2, 7); q.fillStyle(0x8b7cf0).fillRect(0, 0, 4, 4); q.fillStyle(0xffffff).fillRect(1, 1, 1, 1); });
  gen('ph-glow', 16, 16, (q) => { for (let r = 8; r > 0; r -= 2) q.fillStyle(0xffffff, 0.12 + (8 - r) * 0.05).fillCircle(8, 8, r); });
  gen('ph-ring', 24, 24, (q) => { q.lineStyle(1, 0xffffff, 1).strokeCircle(12, 12, 10); q.lineStyle(1, 0xffffff, 0.5).strokeCircle(12, 12, 8); });
  gen('ph-coin', 6, 7, (q) => { q.fillStyle(0x222222).fillRect(0, 0, 6, 7); q.fillStyle(0xfacb3e).fillRect(1, 1, 4, 5); q.fillStyle(0xfff6b8).fillRect(1, 1, 2, 2); });
  gen('ph-heart', 13, 12, (q) => {
    q.fillStyle(0x222222).fillCircle(4, 4, 4).fillCircle(9, 4, 4).fillTriangle(0, 5, 13, 5, 6.5, 12);
    q.fillStyle(0xda4e38).fillCircle(4, 4, 3).fillCircle(9, 4, 3).fillTriangle(1, 5, 12, 5, 6.5, 11);
  });
  gen('ph-pedestal', 16, 12, (q) => { q.fillStyle(0x222222).fillRect(1, 2, 14, 10); q.fillStyle(0x778d9f).fillRect(2, 3, 12, 8); q.fillStyle(0x94afc6).fillRect(2, 3, 12, 2); });
  gen('ph-keeper', 16, 24, (q) => {
    q.fillStyle(0x222222).fillRect(3, 5, 10, 19); q.fillStyle(0x6d4b27).fillRect(4, 10, 8, 13);
    q.fillStyle(0xe8c8a8).fillRect(5, 6, 6, 4); q.fillStyle(0xfacb3e).fillRect(4, 3, 8, 3);
  });
  gen('ph-enemy', 14, 14, (q) => { q.fillStyle(0x222222).fillCircle(7, 7, 7); q.fillStyle(0xd0485a).fillCircle(7, 7, 6); });

  // player shots: element SHAPE, bright core, no outline (style-guide §4.1)
  for (const [el, c] of Object.entries(EL)) {
    gen(`ph-shot-${el}`, 8, 8, (q) => {
      if (el === 'fire') { q.fillStyle(c.edge).fillTriangle(0, 4, 7, 1, 7, 7); q.fillStyle(c.mid).fillTriangle(2, 4, 7, 2, 7, 6); q.fillStyle(c.core).fillCircle(6, 4, 1.5); }
      else if (el === 'frost') { q.fillStyle(c.edge).fillPoints([{ x: 0, y: 4 }, { x: 4, y: 1 }, { x: 8, y: 4 }, { x: 4, y: 7 }], true); q.fillStyle(c.core).fillRect(3, 3, 3, 2); }
      else if (el === 'shock') { q.fillStyle(c.mid).fillRect(0, 2, 3, 2).fillRect(2, 3, 3, 2).fillRect(4, 4, 4, 2); q.fillStyle(c.core).fillRect(3, 3, 2, 2); }
      else if (el === 'poison') { q.fillStyle(c.edge).fillCircle(4, 5, 3); q.fillStyle(c.mid).fillTriangle(4, 0, 1.5, 4, 6.5, 4); q.fillStyle(c.core).fillCircle(4, 5, 1.5); }
      else { q.fillStyle(c.edge).fillCircle(4, 4, 4); q.fillStyle(c.mid).fillCircle(4, 4, 3); q.fillStyle(c.core).fillCircle(4, 4, 1.5); }
    });
  }
  gen('ph-bolt', 6, 6, (q) => { q.fillStyle(0xfff1a8).fillCircle(3, 3, 3); q.fillStyle(0xffffff).fillCircle(3, 3, 1); });

  // enemy bullets: disc, dark core, bright rim, 1 px outline; diameter = 2r+1 (7/9/13); frost rim segmented
  for (const [el, c] of Object.entries(HOSTILE)) {
    for (const d of [7, 9, 13]) {
      gen(`ph-eb-${el}-${d}`, d, d, (q) => {
        const r = d / 2;
        q.fillStyle(0x222222).fillCircle(r, r, r);
        q.fillStyle(c.rim).fillCircle(r, r, r - 1);
        q.fillStyle(c.core).fillCircle(r, r, Math.max(1, r - 2.5));
        if (el === 'frost') { q.fillStyle(0x222222); const k = Math.round(r * 0.7); q.fillRect(r - k - 1, r - k - 1, 2, 2).fillRect(r + k - 1, r - k - 1, 2, 2).fillRect(r - k - 1, r + k - 1, 2, 2).fillRect(r + k - 1, r + k - 1, 2, 2); }
      });
    }
  }
  g.destroy();
}
