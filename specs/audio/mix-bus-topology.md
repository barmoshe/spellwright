# Spellwright — `mix-bus-topology`

**Owner:** Audio Director · **Status:** Wave 2, v1.0 (2026-09-27) · **Consumers:** Game Developer (`src/core/audio.js` mixer, `architecture.md` §12), Technical Artist (encode targets §8), UX Designer (volume curve §2, audio twins).
**Pattern:** `mix-and-mastering/references/bus-topology-pattern.md`, adapted for a projectile-dense game. **Machine-readable copy:** `cue-spec.json` → `mixer` (the JSON is authoritative for numbers; this doc explains them).
**Brief:** [`sonic-brief.md`](sonic-brief.md) v1.0. **Cues:** [`cue-spec.json`](cue-spec.json) · [`cue-spec.md`](cue-spec.md).

---

## §1 Graph

```
voice: AudioBufferSource ─► voice Gain (cue gain + jitter + ladder + coalesce boost) ─► [StereoPanner if positional]
   │
   ├─► sfx.player ──┐
   ├─► sfx.impact ──┤
   ├─► sfx.danger ──┼─► sfx bus Gain (sfxVolume) ──────────────┐
   ├─► sfx.critical ┤                                          │
   ├─► sfx.world ───┘                                          │
   ├─► ui bus Gain (uiVolume) ─────────────────────────────────┤
   ├─► ambience bus Gain (sfxVolume) ──────────────────────────┤
   ├─► music.beds Gain ─► music.filter (Biquad lowpass, idle 20 kHz) ─► music bus Gain (musicVolume) ─┤
   └─► music.stinger Gain ─────────────────────────────────────► music bus Gain ─┘                    │
                                                                                                      ▼
            master Gain (masterVolume) ─► DynamicsCompressor (safety limiter) ─► makeup-cancel Gain −1.7 dB ─► destination
```

- **Implementation latitude (Game Developer):** Phaser 4's `WebAudioSound` chains `source → volumeNode → (pannerNode) → muteNode → manager.destination`. You can either re-route each sound's last node into a bus `GainNode`, or treat each bus as a scalar that multiplies every active voice's volume. The second option applies ducking by ramping the bus scalar and re-applying it to that bus's live voices. Both are acceptable. The numbers below are the contract, not the node layout.
- **`music.filter` is the only non-gain node.** If routing into a `BiquadFilterNode` isn't clean, drop the filter part of §5 D6/D7 and keep their gain moves. Say so, and the Audio Director accepts the gain-only fallback.
- **Master safety limiter:** `DynamicsCompressorNode {threshold: −3 dB, knee: 0, ratio: 20, attack: 0.002 s, release: 0.12 s}` followed by a `GainNode` at **−1.7 dB**. Per the Web Audio spec the compressor applies automatic makeup gain = 0.6 × |curve gain at 0 dBFS| = 0.6 × 2.85 dB ≈ 1.7 dB. The trailing gain cancels it, so everything below threshold passes at unity. This is a brick-wall safety net for 25+ summed voices, not a loudness tool. It should engage rarely (§9 check 4).

## §2 Buses and base gains

Levels are carried by per-cue `default_gain_db` (see §4). Bus gains are **0 dB** at default settings and exist as ducking targets and user-volume points.

| Bus / sub-bus | Base | User control | Carries | Voice cap | Steal |
|---|---|---|---|---|---|
| `master` | 0 dB | `masterVolume` | everything | global **30** | lowest priority, oldest first |
| `sfx.player` | 0 dB | `sfxVolume` | casts, cast layers, sputter, wand ready/swap, dash, teleport | **4** | lowest priority, oldest first |
| `sfx.impact` | 0 dB | `sfxVolume` | hits, crits, statuses, reactions, kills, explosions, chains, payloads, zones | **8** | lowest priority, oldest first |
| `sfx.danger` | 0 dB | `sfxVolume` | enemy windups, lock, release, heavy impact, boss roars/steps/death, wave portal | **5** | lowest priority, oldest first |
| `sfx.critical` | 0 dB | `sfxVolume` | player hurt, shield break, death, body fall, revive, low-HP heartbeat | **3** | never stolen |
| `sfx.world` | 0 dB | `sfxVolume` | doors, chests, crates, pickups, shop, heal, descend, reward pedestal | **4** | lowest priority, oldest first |
| `ui` | 0 dB | `uiVolume` (new key, `settings-spec.md`) | menus, editor, overlays | **4** | newest replaces oldest |
| `ambience` | 0 dB | `sfxVolume` | `amb_cave` | **1** | — |
| `music.beds` | 0 dB | `musicVolume` | explore / combat / boss / title loops | **3** (crossfade overlap) | — |
| `music.stinger` | 0 dB | `musicVolume` | `stg_*` | **1** | newest replaces oldest |

**Volume curve (every slider):** `gain_dB(v) = 40·log10(v / v_default)` for `v > 0`, clamped to +4 dB; `v = 0` is a hard mute (gain 0). The defaults (`master 80, music 70, sfx 90, ui 80`) map to **exactly 0 dB**, so the designed balance is what a player hears out of the box. The curve is a squared-amplitude law (−6 dB per halving of v relative to its default), which is perceptually even. Example: music at 35 → −12 dB, sfx at 45 → −12 dB.

## §3 Voice management (the projectile-density contract)

Order of checks on every `mixer.fire(event, params)`:

1. **Routing.** `event_routing` resolves the event plus params to 0–3 cue ids (element cast + multicast layer + heavy layer, for example). Unknown or `silent_events` → no-op, no warning.
2. **Step coalescing.** A given cue id starts **at most one voice per sim step** (16.67 ms). Extra requests in the same step raise that voice's `count`. The voice gets **+1.5 dB per doubling of count, capped at +3 dB** (4 same-step hits = one voice at +3 dB).
3. **Rate limit.** If less than the cue's `min_interval_ms` has passed since this cue last **started** a voice, the request is **dropped**, not queued. The clock is audio time (`AudioContext.currentTime`), so hit-stop doesn't bunch voices up (cues still fire during hit-stop; `feel-spec` §handoffs).
4. **Per-cue polyphony.** If `active(cue) ≥ max_simultaneous`, apply the cue's `voice_steal`: `oldest` = fade the oldest instance of this cue; `quietest` = fade the lowest current-gain instance; `never` = drop the new request; `newest_replaces_oldest` = same as oldest (UI and stingers).
5. **Sub-bus cap, then global cap.** If full, the new voice steals the **lowest-priority** active voice on that sub-bus (ties go to the oldest), but **only if the new priority ≥ the victim's**. Otherwise the new voice is dropped. Voices with `voice_steal: never` are never victims.
6. **Steal fade:** every stolen voice ramps to 0 over **15 ms** (`linearRampToValueAtTime`), then `stop()`. Never hard-stop a sounding voice, because that clicks.

**Worked example (the brief's case: ×3 multicast at the engine floor).** The fastest legal wand has `minCastDelayMs` 50, so ≤ 20 cast steps/s, and ×3 multicast gives 60 projectiles/s, all fire element:

| Stage | Requests/s in | Voices started/s | Max simultaneous |
|---|---|---|---|
| `cast` → `cast_fire` (one per cast step, never per projectile) | 20 | ≤ 18 (`min_interval` 55 ms) | 3 (cap), each 180 ms |
| `cast_multicast_layer` (shots ≥ 3) | 20 | ≤ 6.7 (150 ms) | 1 |
| `hit_enemy` → `hit_fire` (60 projectile hits/s) | 60 | ≤ 22 (45 ms), same-step hits coalesced | 3 |
| `kill` → family kill | ~6 | ≤ 6 (35 ms) | 3 |
| **`sfx.player` + `sfx.impact` total** | 106 | ≤ 53 | **≤ 7** (caps 4 + 8 not reached) |

The stream becomes a ~18 Hz rhythmic pulse at a bounded level: 3 overlapping −26 LUFS voices ≈ −21.2 LUFS. It never becomes a wash, and it leaves the danger lane at −21 LUFS voices plus the −5 dB danger duck.

**Priorities** (0–100, per cue in `cue-spec.json`): 100 player hurt / shield break / death / revive · 95 boss roars, boss death, stingers, body fall · 90 reactions, low-HP heartbeat, run start · 85–88 enemy windups and lock · 80 big explosion, elite kill, heavy impact, freeze shatter, descend · 70–75 casts, dash, teleport, door close/open, wave portal, relic/wand pickup · 60–68 kills, crits, small explosions, cast layers · 45–55 hits, chain, payload, releases · 25–35 statuses, coins, steps.

**Positional panning:** cues with `spatial.is_positional` use a `StereoPannerNode` with `pan = clamp((x − camera.midX) / 320, −1, 1) × width`. Width is **0.5** for world and enemy sources and **0.25** for player-originated sources. Panning is never the only locator (`accessibility-spec.md` §7). Players who use mono speakers lose nothing.

## §4 Level plan (what the per-cue gains produce)

Every SFX, UI and stinger file is normalized to a common reference (§8). `default_gain_db` then places one **voice** at a target max-momentary loudness. Gains are capped at 0 dB: where a peaky source can't reach its target, it plays slightly under target rather than above unity.

| Layer | Voice target (LUFS, max momentary) | Why |
|---|---|---|
| Player hurt / shield break / death | −15 / −15 / −14 | The loudest one-shots in the game. The player must never miss a hit on themselves. |
| Boss roar, boss death, boss intro/phase stinger | −14 … −16 | Peak moments. They duck the music (§5). |
| Reactions (4) / quench | −19 / −24 | The "aha": above the combat texture. |
| Enemy windups and lock | −20 … −22 | 4–6 dB above casts, plus the −5 dB danger duck = 9–11 dB of separation. |
| Big explosion, heavy impact, elite kill | −18 / −18 / −19 | Heavy events, each with a music duck of −3 dB. |
| Kills | −22 … −24 | They punctuate but sit under the telegraphs. |
| Player casts | −26 | A rhythmic texture. Up to 3 voices sum to ≈ −21. |
| Hits | −27 | The same lane as casts but one step quieter, since there are many. |
| Statuses, coins, steps, UI navigation | −30 … −33 | Background detail. |
| Music: title / explore / combat / boss | −16 / −18 / −21 / −19 (file −18 I + gain) | Combat music drops 3 dB because the SFX density fills the mix. |
| Ambience | −32 | Room tone. |

**Master targets (at default settings):** **−16 LUFS integrated ±1** over a 60 s floor-1 combat capture, **−18 ±1** in explore/crafting valleys (an intentional release), true peak **≤ −1 dBTP** at the destination. Loudest designed moment: player hurt during a boss phase with a big explosion: −15 + −18 + boss bed −19 (ducked −8) ≈ −13.5 LUFS momentary. The −3 dB limiter threshold leaves ≥ 2 dB of margin.

## §5 Ducking and treatments (bus-gain automation, not sidechain compressors)

`setTargetAtTime` ramps. When several ducks target the same bus, **apply the deepest one, not the sum**, so ducks never compound into pumping. "Hold" is measured from the trigger.

| Id | Source cues | Target → amount | Attack | Hold | Release | Why |
|---|---|---|---|---|---|---|
| **D1 danger** | every cue with `danger_duck: true` (all `windup_*`, `enemy_lock`, `heavy_impact`, `boss_roar_*`) | `sfx.player` −5 dB; `ambience` −3 dB | 10 ms | min(cue duration, 400 ms) | 150 ms | Pillar 2. The player's own spam never buries a telegraph. |
| **D2 hurt** | `player_hurt`, `shield_break`, `revive`, `player_death` | `music.beds` −8, `sfx.player` −8, `sfx.impact` −4, `ambience` −6 | 5 ms | 90 ms (`hurtHitstopMs`; 60 for shield) | 400 ms | The sting reads in isolation. |
| **D3 stinger** | any `stg_*` | `music.beds` −6 | 50 ms | stinger length − 300 ms | 600 ms | The stinger punctuates above the bed. |
| **D4 reaction** | `reaction_*` | `sfx.player` −3 | 10 ms | 150 ms | 200 ms | The "aha" pops through a cast stream. |
| **D5 big moment** | `explode_big`, `elite_kill`, `heavy_impact`, `boss_death` | `music.beds` −3 | 20 ms | 150 ms | 300 ms | Weight without masking. |
| **D6 overlay** | `overlay_open` for pause / reward / shop / settings-from-run (not on Title) | `music.filter` lowpass **1800 Hz** (Q 0.707) + `music.beds` −4 dB; `ambience` −6 dB | 250 ms | while open | 250 ms | "You are inside the book." The run is paused and the music keeps going, muffled. |
| **D7 low HP** | `low_hp` on (HP ≤ 2) | `music.filter` lowpass **1400 Hz** + `music.beds` −3 dB | 600 ms | while HP ≤ 2 | 800 ms | Pairs with the HUD heart pulse and vignette (the accessibility twin). With D6 also active, use the lower cutoff. |
| **D8 death** | `player_death` | `music.beds` → silence; `ambience` → silence | 700 ms (matches the 700 ms death fade) / 1200 ms | — | — | Clears the stage for `stg_death`. |

UI never ducks gameplay, and gameplay never ducks UI. Pause freezes the run scene, but sounding one-shot tails finish (≤ 1.8 s). `low_hp_heartbeat` **pauses** while an overlay is open and resumes on close.

## §6 Adaptive music state machine

The structure is horizontal re-sequencing between **pre-baked seamless loop files** (loop points in §7), plus two filter treatments. It needs no bespoke engine work: Phaser `sound.play({loop: true})`, `pause()`/`resume()` and volume ramps are enough.

| State | Bed(s) | Enter on | Transition |
|---|---|---|---|
| `TITLE` | `mus_title` | Title / Credits / Run-end (after the stinger ends) | fade in 1500 ms |
| `EXPLORE` | `mus_explore` | `run_start` (start room), `room_enter{kind ∈ start, landing, treasure, shop}`, after `room_clear` | from TITLE: title out 1000 ms, explore in 2000 ms. From COMBAT: see `room_clear`. |
| `COMBAT` | `mus_combat_a` (floors 1–2), `mus_combat_b` (floor 3) | `door_close` (combat/elite room; after `rules.waves.roomEnterGraceMs`) | **equal-power crossfade 1200 ms**. Explore **pauses** when its fade completes, and the combat bed **resumes from where it last stopped**, so each room doesn't restart the same 30 s. The first combat of a floor starts at 0 (a section downbeat). The `door_close` slam and `wave_spawn` portal mask the crossfade. |
| (release) | — | `room_clear` | `stg_room_clear` fires at t=0 (D3). The combat bed fades out 600 ms from t=0 and pauses (it keeps its position). Explore resumes at t=400 ms with a 2500 ms fade-in. |
| `BOSS_Pn` | F1–F2: `mus_boss_a_p1` → `mus_boss_a_p2`; F3: `mus_boss_final_p1` → `p2` → `p3` | boss room enter: explore fades out over `bossIntroPanMs` (900 ms). At boss activation: `boss_roar_*` + `stg_boss_intro`, then `…_p1` **starts at sample 0 when the stinger ends** (sample 0 is a downbeat). | `boss_phase`: the current bed fades out 300 ms from t=0. `stg_boss_phase` and the roar play. The next phase bed starts at sample 0 at t=900 ms with a 100 ms fade-in, **inside** the 1200/1500 ms invulnerable beat, so the music change *is* the phase change. |
| (boss down) | — | `boss_death` | Bed fades 400 ms. `boss_death` SFX plays, then `stg_boss_clear` at +600 ms (F1–F2) or `stg_victory` at +600 ms (F3). EXPLORE resumes 2000 ms after the stinger starts (fade 3000 ms) on F1–F2. On F3, go to run-end, then TITLE after the stinger ends. |
| `DEATH` | — | `player_death` | D8. `stg_death` starts at +400 ms (the Animator's "hold ends" marker lands inside it). Then TITLE after the stinger. |
| floor change | — | `floor_descend` | Explore keeps playing through the fade. Floor 2 sets ambience `detune −200` cents ("drowned": deeper and wetter). Floor 3 swaps the combat bed to `mus_combat_b`. |

**Cycle-safety rules:** a transition that arrives mid-crossfade retargets the ramps from their current values (no restart). `room_clear` never fires during BOSS. Stingers are `newest_replaces_oldest`.

## §7 Music loop engineering (why the loops are seamless)

Every bed is rendered as a **self-contained seamless loop file**. The loop region `[Ls, Le)` is an integer number of 4/4 bars on a beat grid fitted to the audio (onset autocorrelation, grid scores 7–15× mean onset strength for the metered tracks). The seam is baked with a **pre-roll crossfade**: the final `xf` seconds of the file are `[Le − xf, Le)` fading out (quarter-sine) mixed with `[Ls − xf, Ls)` fading in. Wrapping from the file's end to its start therefore continues exactly as the original did from `Ls − xf` into `Ls`. Measured wrap discontinuity is 0.0003–0.012 (full scale), always below the 99th-percentile adjacent-sample difference of the same file, so there is no click. Every value is in `cue-spec.json` → `process`.

| Cue | Source | Tempo | Loop `[Ls, Le)` s | Length | xf |
|---|---|---|---|---|---|
| `mus_title` | *Dark Fog* | 72.000 | 28.320 → 88.320 | 18 bars · 60.00 s | 1 beat (0.833 s) |
| `mus_explore` | *Ossuary 6 – Air* | unmetered | 141.00 → 227.50 | 86.50 s | 3.0 s (spectral-match search) |
| `mus_combat_a` | *Unholy Knight* | 139.995 | 27.421 → 116.567 | 52 bars · 89.15 s (A–B–A′) | 1 beat |
| `mus_combat_b` | *Volatile Reaction* | 154.995 | 27.468 → 132.761 | 68 bars · 105.29 s | 1 beat |
| `mus_boss_a_p1` | *Five Armies* | 114.010 | 14.214 → 58.421 | 21 bars · 44.21 s | 1 beat |
| `mus_boss_a_p2` | *Five Armies* | 114.010 | 113.153 → 146.834 | 16 bars · 33.68 s (climax) | 1 beat |
| `mus_boss_final_p1/p2/p3` | *Aggressor* | 150.000 | 12.385→50.785 · 89.185→127.585 · 175.585→213.985 | 24 bars · 38.40 s each | 1 beat |
| `amb_cave` (mono) | LRSF *Ambience_Cave_00* | — | 4.25 → 51.50 | 47.25 s | 3.0 s |

**Small-speaker translation** (`mus_title`, `mus_explore`, `amb_cave`). Measured before processing, these sub-drone beds lost 11–14 dB of loudness through a 24 dB/oct 250 Hz high-pass, which means they would vanish on laptop speakers. They get parallel low-band harmonic generation: `lowpass 180 → +36 dB → tanh soft-clip → high-pass 250 → −14 dB`, mixed back in, plus a low shelf of −8 dB at 120 Hz and a +5 dB bell at 450 Hz. After processing the loss is ≤ 6 dB (`measured.small_speaker_loss_db`). The metered combat and boss beds already lose ≤ 2 dB. Every music bed also gets a −2/−3 dB dip at 2.8 kHz (Q 1) to open the cast/telegraph lane.

## §8 Mastering and encode targets (Technical Artist executes; the commands are in `cue-spec.json` → `encode`)

| Class | Reference level (file) | True peak | Channels | Ogg Vorbis (`oggenc`, libvorbis) | AAC-LC `.m4a` (Safari/iOS fallback) |
|---|---|---|---|---|---|
| SFX / UI | max-momentary −14 LUFS, **variant-matched per cue** (all variants within 3 dB; peaky sources TP-limited) | ≤ −1.0 dBTP | mono 44.1 kHz | `-q 4` (~64–80 kbps) | `aac_at` 96 kbps (fallback `-c:a aac -b:a 96k`) |
| Stingers | max-momentary −14 LUFS | ≤ −1.0 dBTP | stereo 44.1 kHz | `-q 5` | 160 kbps |
| Music beds | **−18 LUFS integrated** (loop file) | ≤ −1.5 dBTP (measured −3.3 … −7.4, no limiter needed) | stereo 44.1 kHz | `-q 5` (~160 kbps) | 160 kbps |
| Ambience | −18 LUFS integrated | ≤ −1.5 dBTP | mono | `-q 4` | 96 kbps |

- **Why these bitrates:** Vorbis q4 mono and q5 stereo are transparent for dry one-shots and orchestral beds at web playback. The only codec-fragile content is the 8–13 kHz coin sparkle (`pickup_coin`), which stays inside Vorbis q4's ~18 kHz low-pass. Transient pre-echo is not a risk at these rates for ≤ 200 ms one-shots with 2–3 ms fade-ins.
- **Gapless:** Vorbis loops are sample-exact in `decodeAudioData`. AAC adds encoder priming; ffmpeg writes an MP4 edit list that Safari honours. Wave 5 must check the loop seam on Safari (§9). If a click appears on Safari only, report it and don't redesign. The Audio Director then picks between (a) re-trimming that `.m4a` by its measured priming offset and (b) a mixer-side 30 ms overlap restart for that one bed.
- **Decoded-memory budget:** Web Audio holds decoded float32 PCM (384 KB/s stereo, 192 KB/s mono at 48 kHz). Loads must keep **≤ 128 MB resident**. See the `load_group` policy in `cue-spec.md` §Loading. The worst case is the floor-3 boss room: explore 86.5 s + combat_b 105.3 s + final boss 115.2 s stereo + ambience 47.25 s mono ≈ **127 MB**, with `mus_title` unloaded during runs. SFX, UI and stingers total ≈ 14 MB.

## §9 Wave 5 on-device review (craft self-verification, not an automated test; I1)

1. **Laptop speakers, default settings, F1 combat room:** every telegraph is audible over a held rapid wand, and the arcane/fire casts never mask a windup (listen for D1).
2. **Phone speaker (or a laptop at 30% volume):** explore music, heartbeat and explosions are still present (small-speaker translation).
3. **Every loop plays through its seam 3× on Chrome and Safari** with no click or level jump.
4. **Master limiter** stays out of heavy gain reduction in a 60 s F3 fight. If it pumps, lower `sfx.impact` by 2 dB and report the change in `cue-spec.json`.
5. **A 60 s capture** (browser tab recording → `ffmpeg -af ebur128`) reads −16 ±1 LUFS integrated in combat and −18 ±1 in a crafting valley.
