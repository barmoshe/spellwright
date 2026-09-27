// core/manifest.js — asset-manifest.json consumer (TA contract; asset-manifest V1 schema).
// Hashed paths come ONLY from the manifest; no hash is ever hardcoded. Tolerant of absence
// during Wave 1 (TA delivers in Wave 3): the skeleton renders generated placeholder textures.

let MANIFEST = null;
export function setManifest(m) { MANIFEST = m || null; }
export function getManifest() { return MANIFEST; }

/** Queue every asset the manifest declares into `loader` (one pass so the progress bar covers it). */
export function queueManifest(loader) {
  const m = MANIFEST;
  if (!m) return 0;
  let n = 0;
  for (const [key, a] of Object.entries(m.atlases || {})) { loader.atlas(key, a.image, a.data); n++; }
  for (const [key, img] of Object.entries(m.images || m.backgrounds || {})) { loader.image(key, img.image || img); n++; }
  for (const [key, j] of Object.entries(m.json || {})) { loader.json(`manifest.json.${key}`, j.url); n++; }
  for (const [key, x] of Object.entries(m.xml || {})) { loader.xml(key, x.url); n++; }
  for (const [key, s] of Object.entries(m.spritesheets || {})) {
    loader.spritesheet(key, s.image, { frameWidth: s.frameWidth, frameHeight: s.frameHeight, margin: s.margin || 0, spacing: s.spacing || 0 });
    n++;
  }
  for (const [key, t] of Object.entries(m.tilemaps || {})) { loader.tilemapTiledJSON(key, t.data || t); n++; }
  for (const [key, f] of Object.entries(m.bitmapFonts || {})) { loader.bitmapFont(key, f.image, f.data); n++; }
  // Audio is queued by core/audio.js from the cue-spec (Audio Director contract), not here.
  return n;
}
