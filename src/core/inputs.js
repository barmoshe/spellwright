// core/inputs.js — the upstream deliverables Boot loads (architecture §0/§7). One place to see what
// the engine consumes from other roles. `null` = not delivered yet (Wave 1): Boot skips it (no 404
// noise) and lists it on the dev banner. Wave 4 sets every entry.

export const INPUTS = {
  dataIndex: 'data/index.json',            // Game Designer (Wave 4: live)
  feelSpec: 'specs/design/feel-spec.md',   // Game Designer (feel-tunables blocks)
  motionSpec: 'specs/motion/state-graph-spec.md',  // Animator (motion-tunables block, same row shape)
  assetManifest: 'asset-manifest.json',      // Technical Artist (atlases, tilesets, fonts, anims, audio groups)
  cueSpec: 'assets/audio/cue-spec.json',     // Audio Director (gain-corrected runtime copy)
  credits: 'assets/credits.json',            // Technical Artist
};
