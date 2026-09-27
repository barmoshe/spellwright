// core/art.js — the ONE place that turns an art-slot-map id into a texture + frame (TA contract:
// asset-manifest.json atlases; frame keys follow art-slot-map ids / assets/ATLAS-KEYS.md).
//
//   Art.get('enemies.bat.idle', 0)    → { key, frame } | null
//   Art.img(scene, x, y, id, i)        → Image (placeholder if the frame is missing)
//   Art.anim(scene, clipKey)           → animation key if a clip exists (created in Boot), else null
//
// Missing keys NEVER crash: a generated placeholder texture is used and the gap is reported once
// (__SW__.art.missing()). When the TA delivers, the naming bridge is `candidates()` below.

import { warnOnce } from './log.js';

const frameIndex = new Map();     // frameName -> atlasKey
const missing = new Set();
let manifestRef = null;

export const Art = {
  /** Called by Boot after the manifest's atlases are loaded. */
  index(scene, manifest) {
    manifestRef = manifest;
    frameIndex.clear();
    if (!manifest) return;
    for (const key of Object.keys(manifest.atlases || {})) {
      const tex = scene.textures.get(key);
      if (!tex || tex.key === '__MISSING') continue;
      for (const f of tex.getFrameNames()) frameIndex.set(f, key);
    }
    for (const key of Object.keys(manifest.images || {})) if (scene.textures.exists(key)) frameIndex.set(key, key);
  },

  /**
   * Candidate frame keys for an id (assets/ATLAS-KEYS.md grammar: the art-slot-map path + `.N`).
   * Floor variants (`@f2`/`@f3`) are tried first when `Art.floor` > 1.
   */
  candidates(id, i) {
    const base = i == null ? [id, `${id}.0`] : [`${id}.${i}`];
    if (this.floor > 1) return base.map((b) => `${b}@f${this.floor}`).concat(base);
    return base;
  },
  floor: 1,

  get(id, i) {
    for (const c of this.candidates(id, i)) {
      const key = frameIndex.get(c);
      if (key) return key === c ? { key, frame: undefined } : { key, frame: c };
    }
    if (!missing.has(id)) { missing.add(id); if (frameIndex.size) warnOnce('art-missing', `art slot(s) without an atlas frame — see __SW__.art.missing()`); }
    return null;
  },

  has(id, i) { return !!this.getQuiet(id, i); },
  getQuiet(id, i) { for (const c of this.candidates(id, i)) { const key = frameIndex.get(c); if (key) return key === c ? { key } : { key, frame: c }; } return null; },

  /** Frame count for a numbered sequence id_0..id_n (0 if none). */
  count(id) { let n = 0; while (n < 64 && this.getQuiet(id, n)) n++; return n; },

  /** Image from an id, falling back to a placeholder texture key. */
  img(scene, x, y, id, i, placeholder = 'ph-px') {
    const a = this.get(id, i);
    return a ? scene.add.image(x, y, a.key, a.frame) : scene.add.image(x, y, placeholder);
  },

  /** Apply an id's frame to an existing Image/Sprite; returns false if missing (object untouched). */
  apply(obj, id, i) {
    const a = this.getQuiet(id, i);
    if (!a) return false;
    obj.setTexture(a.key, a.frame);
    return true;
  },

  missing() { return [...missing]; },
  loaded() { return frameIndex.size > 0; },
  manifest() { return manifestRef; },
};

if (typeof window !== 'undefined') { window.__SW__ = window.__SW__ || {}; window.__SW__.art = Art; }
