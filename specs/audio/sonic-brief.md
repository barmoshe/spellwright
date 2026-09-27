# Spellwright — Sonic Brief

**Version:** v1.0  |  **Locked:** 2026-09-27  |  **Audio Director:** studio Audio Director (Wave 2)
**Visual coherence with:** Spellwright `style-guide` v1 (Wave 2, 2026-09-27): "Magic is light, danger is ink"
**Voice:** project. It is built around what was downloaded and measured, the same "source-before-style" rule the art follows.
**Siblings:** [`mix-bus-topology.md`](mix-bus-topology.md) · [`cue-spec.json`](cue-spec.json) / [`cue-spec.md`](cue-spec.md) · [`credits.md`](credits.md)

## 1. Audio pillars

1. **The wand is an instrument.** Every cast is one short note, 90–215 ms, with its transient in the first 10 ms, in its element's timbre family (§3). A 16-casts/s wand should read as a rhythm, not a wash. One cast cue fires per cast step, never one per projectile.
2. **Danger speaks first.** Enemy telegraphs sit in a darker, lower lane (≈150 Hz–3.5 kHz, low-passed) than the player's bright casts (≈1–9 kHz, high-passed). Every windup, lock and heavy impact also ducks the player's own cast bus by 5 dB, so a telegraph is never buried under the player's own wand.
3. **A candle-lit crypt, not a cathedral.** Sounds are dry and close. Nothing that can fire more than 2×/s has a tail over 400 ms, and there is no big reverb anywhere; only spirits, the summoner and the lich get a short stone slap. **The Toll** (§4) is the dungeon's voice.
4. **Orchestral dread underneath, crunchy pixels on top.** The music is dark orchestral/hybrid (Kevin MacLeod), with 2–3 dB carved out at 2.8 kHz to leave room for casts and telegraphs. SFX are short, dry and transient-led, the audio twin of 1 px outlines.
5. **Reactions are the "aha".** The five elemental reactions are the only combat sounds with 2–3 layers and 330–600 ms length. They play at priority 90 and are never voice-stolen.

## 2. No-go list

- **No chiptune or 8-bit bleeps.** That rules out Kenney NES jingles and the CC0 chiptune tracks. Pixel art is not chiptune here: they would pull the game toward retro-arcade and clash harmonically with the orchestral beds.
- **No saxophone or steel-drum jingles.** They break the register.
- **No per-bullet sounds.** Neither player projectiles nor enemy bullets get one. There is one cast cue per cast step, one enemy release cue per attack or volley, and spiral per-shot ticks are declined.
- **No player footsteps.** The wand is the player's voice. The Animator's proposed `footstep` marker stays silent on purpose (`silent_events` in `cue-spec.json`).
- **No unprocessed sci-fi timbres.** Every Kenney sci-fi source is pitched down 1–7 semitones, filtered, or layered with a crackle or sweetener so it never reads as "pew".
- **No sub-only impacts.** Every combat cue keeps ≥ 150–800 Hz body. The measured small-speaker loss (24 dB/oct HPF at 250 Hz) is ≤ 6 dB for every shipped loop and every gameplay-critical cue (`cue-spec.json` → `measured.small_speaker_loss_db`).
- **No VO, no dialogue.** Creature vocals are short grunts only (I11).
- **No UI sound louder than a gameplay-critical cue.** UI voices target −26 to −32 LUFS (max momentary). Critical gameplay cues target −14 to −19.

## 3. Sonic palette

| # | Element | Role | Source (measured) | Process tail | Visual pair | Replacement |
|---|---|---|---|---|---|---|
| 1 | **Arcane = glass/crystal tine** | cast + hit | rubberduck `item_gem_01–03`, `spell_02`; Kenney `impactGlass_light` (tonal 1.1–2.7 kHz) | HPF 400–500, LPF 9 k, +3 st on hits | violet round orbs, bright core | ViRiX `Misc 02` high sparkle |
| 2 | **Fire = breath/flame** | cast + hit + burn | rubberduck `spell_fire_01/02/04/06` cut *into* the swell peak (onset ≤ 2 ms) | 3 ms fade-in at peak, HPF 250, fire hits = Kenney punch + crackle layer | orange teardrop comet | `spell_fire_05/07` |
| 3 | **Frost = ice-crack/tine** | cast + hit + shatter | ViRiX `Ice attack 2` (3–10 kHz), Kenney `impactGlass_heavy/medium` (tonal 0.7–1.1 kHz) | pitch ±2–3 st variants, HPF 500 | cyan shards | Kenney `impactGlass_light` +9 st |
| 4 | **Shock = buzz + crackle** | cast + hit + chain | Kenney `laserSmall` pitched −1…−3 st **+** ViRiX `Misc 02` crackle (11–14 kHz) layer; `forceField` +7 st for chains | the crackle layer is what hides the sci-fi source | yellow jagged bolt | `impactTin` + crackle |
| 5 | **Poison = wet bloop/spit** | cast + hit + zone | rubberduck `spit_01/03`, `creature_slime_01/03/04`, `eat_02–04`, `burble_01/02` | HPF 150–250, −2…+5 st | green droplet | Kenney `slime_000` |
| 6 | **Danger = scrape, growl, rumble** | enemy windups, lock, release | Kenney `drawKnife` (−4/−5 st, LPF 3.5 k), rubberduck `lock_02`, `troll_02`, `stones_02/03`, LRSF `Spell_00/02`, Kenney `engineCircular` spin-up | always darker than the cast lane: LPF ≤ 4 kHz, pitched down | "danger is ink": dark core, crimson rim | rubberduck `creature_roar_01/03` |
| 7 | **The Toll (motif)** | boss intro/phase, run start, descend, room-clear under-bell, death | Kenney `impactBell_heavy_000–003` (partials 225–545 Hz) | −3…−12 st, long fade | wall banners and fountains, the crypt itself | LRSF `Dragon_Growl` low end |
| 8 | **Spellbook paper (UI voice)** | overlays, wand editor, cards | Kenney RPG `bookOpen/Close/Flip/Place` | HPF 100–600, dry | UI slate + bronze, cards as pages | Kenney `interface-sounds` |
| 9 | **Dark orchestral bed** | music | MacLeod: *Unholy Knight*, *Volatile Reaction*, *Five Armies*, *Aggressor* (metered, beat-grid fitted); *Dark Fog*, *Ossuary 6 – Air* (beds) | 2.8 kHz dip of −2/−3 dB; drone beds get small-speaker translation (§7) | low-value stone floor | the other MacLeod tracks on disk |

## 4. Motif lock: "The Toll"

- **Main motif:** one struck low bell. The source is `impactBell_heavy_001`, whose fundamental partial is ≈ 240 Hz (A♯3/B3 region). It is always struck once and left to ring out; it is never looped and never played as a melody.
- **Function:** "the dungeon notices you." It marks thresholds, not combat.
- **Transformation map:**
  - Run start → toll at −5 st (`run_start`): the dungeon accepts you.
  - Room clear → a quiet toll (`bell_heavy_002`, −8 dB) under an ascending pizzicato run (`stg_room_clear`): release.
  - Boss intro → toll at −5 st under an orchestral hit (`stg_boss_intro`), then the boss roar.
  - Boss phase → toll at −3 st under an orchestral hit (`stg_boss_phase`) during the 1.2–1.5 s invulnerable beat.
  - Descend a floor → toll at −10 st plus a falling wind (`floor_descend`).
  - Player death → toll at −12 st, the lowest it ever sounds (`player_death`).
- **Subordinate motif, "the Page":** paper foley is the only UI timbre. Cards are pages and the wand editor is a spellbook (`overlay_open` = the book opens).

## 5. Reference titles

| # | Title | Where | Take | Reject | Tags |
|---|---|---|---|---|---|
| 1 | **Magicraft** (2024) | https://store.steampowered.com/search/?term=Magicraft (whole game) | Genre anchor: fast wand casting, element-coded spells, room waves | Its busier cast layering; we cap casts at 3 voices and 16/s | pillar 1, genre |
| 2 | **Noita** (2020) | https://store.steampowered.com/app/881100/ (whole game) | Very short, element-coded cast one-shots; the "no mana" fizzle (our `sputter`) | Physics-noise density; we stay sparse | pillar 1, palette 1–5 |
| 3 | **Enter the Gungeon** (2016) | https://store.steampowered.com/app/311690/ (whole game) | Enemy bullets are readable by sound at release (one cue per volley); a dry, punchy mix | The comedic tone of its UI stingers | pillar 2 |
| 4 | **Hades** (2020) | https://store.steampowered.com/app/1145360/ (boss phase transitions; room clear) | A stinger masks every music transition; the boss phase beat is an audio event | Its through-composed music; ours is loop-segmented | adaptive structure |
| 5 | **Darkest Dungeon** (2016) | https://store.steampowered.com/app/262060/ (hamlet / crypt) | Gothic dread, and the bell as the dungeon's voice | Heavy narration and VO (a no-go here) | pillar 3, motif |

Timestamps are not given. These are whole-game sound-design references, cited for approach rather than for a specific cue.

## 6. Emotional register grid (one axis: threat)

| Anchor | Beats | Palette subset | Music |
|---|---|---|---|
| **Rest / valley** | title, start/landing, treasure, shop, every cleared room, crafting | Page, Toll (quiet), cave ambience | `mus_explore` (*Ossuary 6 – Air*, 86.5 s loop), `mus_title` (*Dark Fog*) |
| **Tension step** | room lock, wave portal, windups | Danger lane, `door_close`, `wave_spawn` | `mus_combat_a/b` fades in |
| **Combat** | wave fights, 1–3 waves | all 5 elements + impacts | *Unholy Knight* (F1–F2) / *Volatile Reaction* (F3) |
| **Peak** | elite, boss phases | reactions, `heavy_impact`, boss roars | *Five Armies* p1→p2 (Knight, Queen); *Aggressor* p1→p2→p3 (Archlich) |
| **Release** | room clear, boss clear, victory | Toll + pizzicato, Win jingle | back to `mus_explore` |
| **Loss** | death | Toll −12 st, Lose jingle | silence, then title |

## 7. Visual–audio coherence pairings

| Visual decision (style-guide) | Sonic implication | Reason |
|---|---|---|
| "Magic is light": outline-less, bright-cored player spells | Player casts and hits live in the bright lane (bands 1–9 kHz, HPF 250–500) | Hue brightness pairs with spectral brightness: "mine" is high |
| "Danger is ink": dark-cored, outlined hostile shots; crimson telegraph hue | Enemy tells and releases are low-passed (≤ 3.5–4 kHz) and pitched down | "Theirs" is dark, so mine/theirs can be sorted by ear as fast as by eye |
| 1 px `#222222` outlines, flat ramps, no AA | Transient-led, dry one-shots; fades ≤ 3 ms at onset | A crisp edge on screen pairs with a crisp attack in the ear |
| Uniform room light plus torch pools | A constant cave room tone (`amb_cave`, −32 LUFS in mix) and no reverb wash | Readability first on both channels |
| Element shape families (orb / teardrop / shard / jagged / droplet) | Timbre families (tine / breath / crack / buzz / bloop) | Both hue and timbre are backed by a second channel (shape / band) |

## 8. Differentiation test status

- **Tested:** not run. The studio has no listening pass before Wave 5, and the Audio Director authored this by measurement (onset, loudness, spectrum, small-speaker loss), not by ear.
- **Result:** pending the Wave 5 on-device review (phone plus laptop speakers). The review checklist is in `mix-bus-topology.md` §9.
- **Decisions that set us apart from a stock asset-pack soundtrack:** (1) the **danger duck**: telegraphs duck the player's own cast bus −5 dB; (2) **the Toll**: one struck bell marks every threshold, so a single timbre carries the dungeon's identity across music and SFX.

## 9. Hand-off status

- [x] Composition. No original score in v1: licensed MacLeod beds are integrated per pillar 4 (EQ carve plus loop engineering). See `cue-spec.md` §Music.
- [x] Adaptive music structure: `mix-bus-topology.md` §6 (state machine).
- [x] Sound design: `cue-spec.json` (120 cues, 190 rendered files, every variant processed and measured).
- [x] Mix and mastering: `mix-bus-topology.md`.
- [ ] Visual-coherence sign-off from 2D Artist (this brief cites `style-guide` §1, §2.3, §3.1).
- [ ] Approval log: Technical Artist (Wave 3 execution), Game Developer (Wave 4 mixer).
