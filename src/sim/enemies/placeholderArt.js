// sim/enemies/placeholderArt.js — readable placeholder actors until the Technical Artist's atlases land.
// One generated strip texture per actor (and an elite variant with the 1 px elite-gold outline, R10),
// with 2 frames ('0' rest, '1' breath/hop down 1 px). Distinct silhouette + palette per enemy id, closed
// 1 px #222222 outline (style-guide §3.1). Generated ONCE per game (textures are global); never shipped
// when Art has the real frames (EnemyView prefers Art.get('enemies.<id>.idle', i)).
//
// Primitive list per actor, coordinates in the frame with the FEET at (w/2, h−1):
//   ['r', x, y, w, h, color]  ['c', x, y, r, color]  ['e', cx, cy, w, h, color]  ['t', x1,y1,x2,y2,x3,y3, color]

const D = 0x222222;

const SHAPES = {
  bat: { w: 16, h: 12, p: [
    ['t', 1, 3, 7, 5, 5, 9, 0x5b3a7a], ['t', 15, 3, 9, 5, 11, 9, 0x5b3a7a], ['c', 8, 6, 3, 0x7a4f9a],
    ['r', 6, 5, 1, 1, 0xdc4a7b], ['r', 9, 5, 1, 1, 0xdc4a7b], ['r', 7, 9, 2, 2, 0x5b3a7a]] },
  skeleton: { w: 12, h: 16, p: [
    ['r', 4, 11, 1, 5, 0xd9d2c0], ['r', 7, 11, 1, 5, 0xd9d2c0], ['r', 3, 7, 6, 5, 0xd9d2c0], ['r', 4, 8, 4, 1, 0x8a8272],
    ['r', 4, 10, 4, 1, 0x8a8272], ['r', 1, 7, 1, 5, 0xd9d2c0], ['r', 10, 7, 1, 5, 0xd9d2c0], ['c', 6, 4, 3, 0xefe8d6],
    ['r', 4, 3, 2, 2, 0x1a1418], ['r', 7, 3, 2, 2, 0x1a1418], ['r', 5, 6, 3, 1, 0x8a8272]] },
  cultist: { w: 12, h: 20, p: [
    ['t', 6, 6, 1, 19, 11, 19, 0x7a1f35], ['r', 3, 9, 6, 10, 0x7a1f35], ['c', 6, 5, 4, 0x5a1628],
    ['r', 4, 5, 4, 3, 0x120a0e], ['r', 5, 6, 1, 1, 0xfdd0d6], ['r', 7, 6, 1, 1, 0xfdd0d6], ['r', 3, 12, 6, 1, 0xc9a24a]] },
  frost_mage: { w: 12, h: 20, p: [
    ['t', 6, 6, 1, 19, 11, 19, 0x2f6f95], ['r', 3, 9, 6, 10, 0x2f6f95], ['c', 6, 5, 4, 0x245a7a],
    ['r', 4, 5, 4, 3, 0x0e1a24], ['r', 5, 6, 1, 1, 0xcae6f5], ['r', 7, 6, 1, 1, 0xcae6f5], ['r', 3, 12, 6, 1, 0xcae6f5],
    ['t', 6, 0, 4, 3, 8, 3, 0x72d6ce]] },
  brute: { w: 14, h: 20, p: [
    ['r', 3, 15, 3, 5, 0x4a5538], ['r', 8, 15, 3, 5, 0x4a5538], ['r', 2, 6, 10, 10, 0x5e6b4a], ['r', 0, 6, 3, 8, 0x6d7a55],
    ['r', 11, 6, 3, 8, 0x6d7a55], ['r', 4, 1, 6, 6, 0xb9b09a], ['r', 5, 3, 1, 1, D], ['r', 8, 3, 1, 1, D], ['r', 5, 5, 4, 1, 0x7a2a2a]] },
  slime: { w: 14, h: 11, p: [
    ['e', 7, 6, 13, 9, 0x4f9a3a], ['e', 7, 7, 9, 5, 0x6fbf4f], ['r', 4, 3, 2, 1, 0xc8ef7a], ['r', 4, 5, 1, 2, D], ['r', 9, 5, 1, 2, D]] },
  slimelet: { w: 9, h: 8, p: [['e', 4, 4, 8, 6, 0x4f9a3a], ['r', 2, 3, 1, 1, D], ['r', 6, 3, 1, 1, D], ['r', 3, 2, 1, 1, 0xc8ef7a]] },
  fire_imp: { w: 12, h: 14, p: [
    ['r', 4, 11, 1, 3, 0xa53a1a], ['r', 7, 11, 1, 3, 0xa53a1a], ['c', 6, 8, 4, 0xd8562a], ['t', 2, 1, 3, 5, 5, 4, 0xfacb3e],
    ['t', 10, 1, 9, 5, 7, 4, 0xfacb3e], ['c', 6, 5, 3, 0xe8703a], ['r', 4, 5, 1, 1, 0xfff6b8], ['r', 7, 5, 1, 1, 0xfff6b8],
    ['r', 10, 9, 2, 1, 0xa53a1a]] },
  eye_turret: { w: 14, h: 16, p: [
    ['r', 3, 11, 8, 5, 0x6d6470], ['r', 2, 14, 10, 2, 0x5a525e], ['c', 7, 7, 5, 0xefe6d8], ['c', 7, 7, 2, 0x7a3a9a], ['r', 7, 6, 1, 1, 0xffffff]] },
  eye_turret_glare: { w: 14, h: 16, p: [
    ['r', 3, 11, 8, 5, 0x6d6470], ['r', 2, 14, 10, 2, 0x5a525e], ['c', 7, 7, 5, 0xefe6d8], ['c', 7, 7, 3, 0xdc4a7b], ['c', 7, 7, 1, 0x62232f],
    ['r', 2, 2, 11, 2, 0x5a525e], ['r', 2, 11, 11, 1, 0x5a525e]] },
  wraith: { w: 12, h: 14, p: [
    ['r', 2, 5, 9, 7, 0xcfd8e8], ['c', 6, 5, 4, 0xe6ecf5], ['t', 2, 11, 4, 11, 3, 13, 0xcfd8e8], ['t', 5, 11, 7, 11, 6, 13, 0xcfd8e8],
    ['t', 8, 11, 10, 11, 9, 13, 0xcfd8e8], ['r', 4, 4, 1, 2, 0x2a2438], ['r', 7, 4, 1, 2, 0x2a2438], ['r', 5, 8, 2, 1, 0x2a2438]] },
  necromancer: { w: 13, h: 20, p: [
    ['r', 11, 2, 1, 17, 0x6d4b27], ['c', 11, 2, 2, 0xefe8d6], ['t', 6, 6, 1, 19, 10, 19, 0x3a2450], ['r', 3, 9, 6, 10, 0x3a2450],
    ['c', 6, 5, 4, 0x2a1838], ['r', 4, 5, 4, 3, 0x0e0a14], ['r', 5, 6, 1, 1, 0x97da3f], ['r', 7, 6, 1, 1, 0x97da3f], ['r', 3, 13, 6, 1, 0x8b7cf0]] },
  skull: { w: 10, h: 9, p: [['c', 5, 4, 4, 0xefe8d6], ['r', 3, 6, 5, 3, 0xd9d2c0], ['r', 3, 3, 2, 2, 0x62232f], ['r', 6, 3, 2, 2, 0x62232f], ['r', 4, 7, 1, 1, D], ['r', 6, 7, 1, 1, D]] },
  stone_golem: { w: 22, h: 24, p: [
    ['r', 5, 18, 4, 6, 0x5f5f68], ['r', 13, 18, 4, 6, 0x5f5f68], ['r', 3, 6, 16, 13, 0x7a7a82], ['r', 0, 8, 4, 10, 0x8a8a92],
    ['r', 18, 8, 4, 10, 0x8a8a92], ['r', 7, 1, 8, 6, 0x8a8a92], ['r', 9, 3, 1, 1, 0xfacb3e], ['r', 12, 3, 1, 1, 0xfacb3e],
    ['r', 6, 10, 3, 1, 0x5f5f68], ['r', 12, 13, 4, 1, 0x5f5f68], ['r', 8, 15, 1, 3, 0x5f5f68]] },
  ossuary_knight: { w: 26, h: 32, p: [
    ['r', 8, 25, 4, 7, 0x4a4f5a], ['r', 14, 25, 4, 7, 0x4a4f5a], ['r', 6, 11, 14, 15, 0x6b7280], ['r', 3, 10, 6, 6, 0x8a92a0],
    ['r', 17, 10, 6, 6, 0x8a92a0], ['r', 8, 14, 10, 1, 0xd9d2c0], ['r', 8, 17, 10, 1, 0xd9d2c0], ['r', 8, 20, 10, 1, 0xd9d2c0],
    ['r', 8, 2, 10, 10, 0x8a92a0], ['r', 9, 6, 8, 2, 0x120a0e], ['r', 11, 6, 1, 1, 0xdc4a7b], ['r', 14, 6, 1, 1, 0xdc4a7b],
    ['t', 13, 0, 11, 3, 15, 3, 0x9f294e]] },
  mire_queen: { w: 28, h: 28, p: [
    ['r', 6, 22, 5, 6, 0x3d5a2e], ['r', 17, 22, 5, 6, 0x3d5a2e], ['e', 14, 15, 26, 20, 0x4d6b3a], ['e', 14, 18, 16, 10, 0x7a9a55],
    ['r', 9, 9, 3, 2, 0xfacb3e], ['r', 16, 9, 3, 2, 0xfacb3e], ['r', 10, 13, 8, 2, 0x2a3a1e],
    ['t', 8, 5, 10, 1, 12, 5, 0xc9a24a], ['t', 12, 5, 14, 0, 16, 5, 0xc9a24a], ['t', 16, 5, 18, 1, 20, 5, 0xc9a24a]] },
  archlich: { w: 16, h: 23, p: [
    ['t', 8, 8, 1, 22, 15, 22, 0x2e1f4a], ['r', 4, 10, 8, 12, 0x2e1f4a], ['r', 4, 14, 8, 1, 0xc9a24a], ['r', 7, 10, 2, 12, 0x4a2f6e],
    ['c', 8, 6, 4, 0xefe8d6], ['r', 6, 5, 1, 2, 0x8b7cf0], ['r', 9, 5, 1, 2, 0x8b7cf0], ['r', 7, 8, 2, 1, 0x62232f],
    ['t', 4, 3, 5, 0, 6, 3, 0xfacb3e], ['t', 7, 3, 8, 0, 9, 3, 0xfacb3e], ['t', 10, 3, 11, 0, 12, 3, 0xfacb3e]] },
  // weapon overlays (origin at the grip)
  blade: { w: 5, h: 18, p: [['r', 2, 0, 1, 12, 0xd6dde6], ['r', 1, 1, 1, 10, 0xaab2bd], ['r', 0, 12, 5, 1, 0x9f294e], ['r', 2, 13, 1, 4, 0x6d4b27]] },
  staff: { w: 6, h: 16, p: [['r', 2, 4, 2, 12, 0x6d4b27], ['c', 3, 3, 2, 0x8b7cf0], ['r', 3, 2, 1, 1, 0xfdf7ed]] },
};

const PAD = 2;          // room for the outline(s)
export const PH_FRAMES = 2;

function prim(g, p, ox, oy, color, grow) {
  const c = color ?? p[p.length - 1];
  g.fillStyle(c, 1);
  switch (p[0]) {
    case 'r': g.fillRect(ox + p[1] - grow, oy + p[2] - grow, p[3] + grow * 2, p[4] + grow * 2); break;
    case 'c': g.fillCircle(ox + p[1] + 0.5, oy + p[2] + 0.5, p[3] + grow); break;
    case 'e': g.fillEllipse(ox + p[1], oy + p[2], p[3] + grow * 2, p[4] + grow * 2, 16); break;
    case 't': {
      const cx = (p[1] + p[3] + p[5]) / 3, cy = (p[2] + p[4] + p[6]) / 3;
      const k = grow ? 1 + grow / 3 : 1;
      g.fillTriangle(ox + cx + (p[1] - cx) * k, oy + cy + (p[2] - cy) * k, ox + cx + (p[3] - cx) * k, oy + cy + (p[4] - cy) * k,
        ox + cx + (p[5] - cx) * k, oy + cy + (p[6] - cy) * k);
      break;
    }
    default: break;
  }
}

function drawShape(g, sh, ox, oy, elite) {
  if (elite) for (const p of sh.p) prim(g, p, ox, oy, 0xfacb3e, 2);
  for (const p of sh.p) prim(g, p, ox, oy, D, 1);
  for (const p of sh.p) prim(g, p, ox, oy, null, 0);
}

/** Texture key for an actor placeholder ('ph' | 'ph-elite'); generated lazily. */
export function placeholderKey(scene, id, elite = false) {
  const sh = SHAPES[id] || SHAPES.skeleton;
  const key = `swe-${SHAPES[id] ? id : 'skeleton'}${elite ? '-elite' : ''}`;
  if (scene.textures.exists(key)) return key;
  const fw = sh.w + PAD * 2, fh = sh.h + PAD * 2;
  const g = scene.make.graphics({ x: 0, y: 0 }, false);
  for (let f = 0; f < PH_FRAMES; f++) drawShape(g, sh, f * fw + PAD, PAD + (f === 1 ? 1 : 0), elite);
  g.generateTexture(key, fw * PH_FRAMES, fh);
  g.destroy();
  const tex = scene.textures.get(key);
  for (let f = 0; f < PH_FRAMES; f++) tex.add(String(f), 0, f * fw, 0, fw, fh);
  return key;
}

/** Frame size (incl. padding) of a placeholder, for origin/anchor math. */
export function placeholderSize(id) {
  const sh = SHAPES[id] || SHAPES.skeleton;
  return { w: sh.w + PAD * 2, h: sh.h + PAD * 2, pad: PAD };
}

export function hasPlaceholder(id) { return !!SHAPES[id]; }
