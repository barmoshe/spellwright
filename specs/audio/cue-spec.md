# Spellwright — `cue-spec`

**Owner:** Audio Director · **Status:** Wave 2, v1.0 (2026-09-27) · **Consumers:** Technical Artist (Wave 3: render and encode), Game Developer (Wave 4: `src/core/audio.js`).
**Authoritative data:** [`cue-spec.json`](cue-spec.json). This doc explains it; where they differ, the JSON wins. **Schema:** `gamestudio/.claude/skills/cue-specification-and-handoff/references/cue-spec-schema.md` (each object in `cues[]`), plus project fields listed below.
**Siblings:** [`sonic-brief.md`](sonic-brief.md) v1.0 · [`mix-bus-topology.md`](mix-bus-topology.md) v1.0 (the `mixer` block copies its numbers) · [`credits.md`](credits.md).

**Scope:** 124 cues and 159 rendered files: 114 one-shots (SFX, UI and stingers), 9 music beds and 1 ambience loop. Every event in `mechanic-spec` §14, `event-markers.md` (including the *proposed* ids), `screen-graph` §7, `wand-editor-ux` and `settings-spec` audio previews is either routed to a cue (`event_routing`) or listed in `silent_events` on purpose.

---

## 1. What the Technical Artist runs (no follow-up needed)

Every file is described by one command. Run everything from the project root.

1. `mkdir -p assets/_work/audio`. Run each `cues[].process[].render_cmd`. Each command trims every source layer (`atrim` in/len), pitch-shifts it (`asetrate`), applies its filters, adds a 3 ms fade-in, sets its layer gain and offset, mixes the layers, cuts to the final length and adds the fade-out. It writes a 32-bit float `<name>.pre.wav`, so summed layers can't clip.
2. Measure, normalize, match variants, then encode. These are `encode.step_2` to `step_6`:
   - One-shots are normalized to **−14 LUFS max momentary**. The limiter is 4× oversampled, so true peak is ≤ −1 dBTP.
   - Loops are normalized to **−18 LUFS integrated** with gain only. Ambience is −18.5 (see §5).
   - Encode: `oggenc -q 4` for SFX, UI and ambience; `-q 5` for stingers and music. Then `aac_at` `.m4a` at 96 kbps, or 160 kbps for stingers and music.
3. **Step 7, gain correction.** A short or peaky file can't reach −14 without heavy limiting, so it lands under that target (a 73 ms `hit_arcane` measures about −19). The runtime gain is then set to `min(0, mix_target_lufs − measured)`, which keeps the level plan in `mix-bus-topology` §4 true. `mix_target_lufs` is given per cue.
4. Fill in `measured`, then write the compact runtime copy to `assets/audio/cue-spec.json`. The `jq` command is in `encode.runtime_copy`; the copy is about 120 KB with the render data stripped.

**Checked in scratch on 2026-09-27** (in the session scratchpad, not the project):
- Sample commands ran: casts, layered reactions, the heartbeat, stingers, and every loop.
- Output durations match `duration_ms`.
- Every loop seam's wrap discontinuity is below the file's 99th-percentile adjacent-sample difference (`music.scratch_render_check`).
- Normalization gives true peak ≤ −1.0 dBTP on `pickup_coin`, `kill_bone`, `player_hurt` and `cast_fire`.

Two traps were found and are already fixed in the commands:
- A 16-bit pre-render clipped the hot beds; the pre-render is now 32-bit float.
- EQ applied after the seam cut clicked at sample 0, because of IIR filter warm-up. EQ now runs on the full source before the cut.

**Files:** `assets/audio/<cue>.ogg` + `.m4a` for a single-variant cue, or `<cue>_v<N>.ogg/.m4a` when a cue has variants. Archival WAVs go to `assets/_work/audio/`, which is not shipped.

## 2. Casting and the projectile-density contract

- **One cast cue per cast step, never one per projectile.** The element is that of the first spell fired in the step. `cast_multicast_layer` is added when shots ≥ 3. `cast_heavy_layer` is added for the `heavy` modifier and for comet, fireball, frost_lance and thunder_orb.
- Casts are 150–190 ms long, 3 variants each, with the transient in the first 10 ms. Fire sources are swells, so each is cut 20–25 ms before its measured envelope peak.
- Casts: cap 3, `min_interval` 55 ms. Hits: cap 3, 45 ms. Kills: cap 3, 35 ms. With same-step coalescing, a ×3 multicast at the 50 ms engine floor holds at 7 or fewer voices (`mix-bus-topology` §3 worked example).
- **Danger speaks first.** Every `windup_*`, `enemy_lock`, `heavy_impact` and `boss_roar_*` is low-passed at 4 kHz or lower, pitched down, and carries `danger_duck: true` (D1: `sfx.player` −5 dB).

## 3. Cue tables

Columns: source layers as `file [in ms + length ms]`, pitch in semitones, layer gain, layer offset; output length; fade-out; `default_gain_db` (design value, see step 7); pitch jitter; polyphony cap and minimum retrigger interval; priority; trigger. For cues with several variants only v1 is shown; every variant is in the JSON.

### Player (sfx.player)

| Cue | Source [in ms + len ms] pitch/gain/offset | Out ms | Fade-out ms | Gain dB | Pitch jitter ¢ | Poly / min ms | Prio | Trigger |
|---|---|---|---|---|---|---|---|---|
| `cast_arcane` | spell_02.ogg [20+170] (v1 of 3) | 170 | 70 | -12 | ±80 | 3 / 55 | 72 | cast{element:arcane} |
| `cast_fire` | spell_fire_06.ogg [45+190] (v1 of 3) | 190 | 70 | -12 | ±80 | 3 / 55 | 72 | cast{element:fire} |
| `cast_frost` | Ice attack 2.wav [0+160] (v1 of 3) | 168 | 70 | -12 | ±80 | 3 / 55 | 72 | cast{element:frost} |
| `cast_shock` | laserSmall_000.ogg [0+150] -1st + Misc 02.wav [0+140] -6dB (v1 of 3) | 178 | 70 | -12 | ±80 | 3 / 55 | 72 | cast{element:shock} |
| `cast_poison` | spit_03.ogg [10+150] (v1 of 3) | 150 | 70 | -12 | ±80 | 3 / 55 | 72 | cast{element:poison} |
| `cast_multicast_layer` | cloth2.ogg [70+140] +3st | 118 | 70 | -15 | ±60 | 1 / 150 | 64 | cast{shots>=3} (layer, same step as cast_<element>) |
| `cast_heavy_layer` | Fire impact 1.wav [250+260] -5st | 347 | 120 | -12 | ±50 | 1 / 200 | 66 | cast{heavy:true} (layer) |
| `sputter` | breath.ogg [25+160] +4st | 127 | 76 | -16 | ±40 | 1 / 250 | 60 | sputter (mana skip or empty group) |
| `wand_recharge` | item_gem_04.ogg [215+200] +3st | 168 | 90 | -17 | 0 | 1 / 200 | 45 | wand_recharge (deck reset END) |
| `wand_swap` | wood_03.ogg [0+150] + metalLatch.ogg [35+100] -2st -8dB @30ms | 150 | 60 | -16 | 0 | 1 / 80 | 60 | wand_swap |
| `dash` | Wind effects 5.wav [150+200] +2st (v1 of 2) | 200 | 90 | -10 | ±50 | 1 / 100 | 74 | dash (sim frame 0) |
| `teleport` | Misc 02.wav [0+250] -3st + Wind effects 5.wav [150+180] +3st -6dB | 297 | 110 | -10 | 0 | 1 / 150 | 72 | teleport_caster (blink_bolt) |

### Impacts, statuses, reactions, kills (sfx.impact)

| Cue | Source [in ms + len ms] pitch/gain/offset | Out ms | Fade-out ms | Gain dB | Pitch jitter ¢ | Poly / min ms | Prio | Trigger |
|---|---|---|---|---|---|---|---|---|
| `hit_arcane` | impactGlass_light_000.ogg [0+90] +3st (v1 of 3) | 76 | 45 | -13 | ±120 | 3 / 45 | 50 | hit_enemy{element:arcane} |
| `hit_fire` | impactPunch_medium_000.ogg [0+130] + spell_fire_06.ogg [60+100] -8dB (v1 of 3) | 130 | 50 | -13 | ±120 | 3 / 45 | 50 | hit_enemy{element:fire} |
| `hit_frost` | impactGlass_heavy_000.ogg [0+120] + Ice attack 2.wav [0+90] -6dB (v1 of 3) | 135 | 50 | -13 | ±120 | 3 / 45 | 50 | hit_enemy{element:frost} |
| `hit_shock` | impactTin_medium_000.ogg [0+100] + Misc 02.wav [0+90] -1st -6dB (v1 of 3) | 100 | 50 | -13 | ±120 | 3 / 45 | 50 | hit_enemy{element:shock} |
| `hit_poison` | eat_03.ogg [25+110] (v1 of 3) | 110 | 50 | -13 | ±120 | 3 / 45 | 50 | hit_enemy{element:poison} |
| `crit` | impactMetal_heavy_001.ogg [0+110] +5st | 82 | 49 | -12 | ±80 | 2 / 60 | 62 | crit (layer on hit_enemy) |
| `status_burn` | spell_fire_07.ogg [240+220] | 220 | 90 | -17 | ±60 | 2 / 120 | 30 | status_apply{status:burn} |
| `status_chill` | impactGlass_medium_000.ogg [0+180] +5st | 135 | 80 | -17 | ±60 | 2 / 120 | 30 | status_apply{status:chill} |
| `status_shock` | Misc 02.wav [0+180] | 180 | 90 | -17 | ±60 | 2 / 120 | 30 | status_apply{status:shock} |
| `status_poison` | burble_02.ogg [100+200] +2st | 178 | 90 | -17 | ±60 | 2 / 120 | 30 | status_apply{status:poison} |
| `status_freeze` | impactGlass_heavy_001.ogg [0+200] -3st | 238 | 90 | -15 | ±60 | 2 / 120 | 35 | status_apply{status:freeze} (ice shell forms) |
| `freeze_shatter` | impactGlass_heavy_001.ogg [0+260] + impactGlass_medium_000.ogg [0+250] +3st -4dB | 260 | 120 | -8 | ±60 | 2 / 80 | 80 | freeze_shatter (frozen-thaw / shatter) |
| `reaction_melt` | Fire impact 1.wav [260+420] + impactGlass_medium_000.ogg [0+250] -6dB + burble_01.ogg [150+300] +5st -8dB @60ms | 420 | 200 | -5 | ±30 | 2 / 90 | 90 | reaction{name:melt} |
| `reaction_overload` | explosionCrunch_000.ogg [0+420] + Misc 02.wav [0+350] -4dB + forceField_002.ogg [0+300] +4st -8dB | 420 | 200 | -5 | ±30 | 2 / 90 | 90 | reaction{name:overload} |
| `reaction_blight` | burble_01.ogg [60+450] -2st + spell_fire_02.ogg [60+400] -3dB + spit_02.ogg [200+250] -5dB @80ms | 505 | 220 | -5 | ±30 | 2 / 90 | 90 | reaction{name:blight} |
| `reaction_superconduct` | impactGlass_heavy_001.ogg [0+350] + laserLarge_000.ogg [0+350] -5st -4dB + forceField_000.ogg [0+300] +7st -8dB | 467 | 180 | -5 | ±30 | 2 / 90 | 90 | reaction{name:superconduct} |
| `reaction_quench` | Fire impact 1.wav [600+330] + impactGlass_light_002.ogg [0+150] -2st -4dB | 330 | 180 | -10 | ±30 | 2 / 90 | 90 | reaction{name:quench} |
| `chain_zap` | forceField_000.ogg [0+180] +7st + Misc 02.wav [0+150] -6dB (v1 of 2) | 150 | 80 | -13 | ±100 | 2 / 60 | 50 | chain_zap (chain arc, thunder_orb zap tick) |
| `payload_release` | item_gem_02.ogg [10+110] +5st | 82 | 49 | -14 | ±80 | 2 / 60 | 50 | payload_release (trigger card fires its next group) |
| `zone_open` | burble_02.ogg [45+350] -3st | 416 | 150 | -15 | ±60 | 2 / 150 | 35 | zone_spawn (toxic_flask pool / onHit zone) |
| `explode_small` | explosionCrunch_000.ogg [0+280] -2st (v1 of 2) | 314 | 150 | -9 | ±100 | 2 / 50 | 62 | explode{radiusPx<bigExplosionRadiusPx(40)} |
| `explode_big` | lowFrequency_explosion_000.ogg [35+600] + explosionCrunch_001.ogg [0+500] -3dB | 600 | 300 | -4 | ±60 | 2 / 90 | 80 | explode{radiusPx>=40} |
| `kill_bone` | stones_04.ogg [20+160] +2st + wood_01.ogg [0+140] +3st -4dB @30ms (v1 of 3) | 178 | 88 | -9 | ±100 | 3 / 35 | 62 | kill{family:bone} (skeleton, skull) |
| `kill_flesh` | creature_hurt_02.ogg [15+250] + impactSoft_medium_001.ogg [0+120] -4dB (v1 of 2) | 262 | 100 | -9 | ±100 | 3 / 35 | 62 | kill{family:flesh} (bat, brute) |
| `kill_slime` | creature_slime_04.ogg [150+220] (v1 of 2) | 223 | 100 | -9 | ±100 | 3 / 35 | 62 | kill{family:slime} (slime, slimelet) |
| `kill_spirit` | weird_03.ogg [10+250] -5st | 334 | 100 | -9 | ±100 | 3 / 35 | 62 | kill{family:spirit} (wraith) |
| `kill_caster` | creature_die_01.ogg [380+300] (v1 of 2) | 300 | 100 | -9 | ±100 | 3 / 35 | 62 | kill{family:caster} (cultist, frost_mage, necromancer) |
| `kill_construct` | impactMining_000.ogg [0+300] -4st + stones_03.ogg [5+280] -4dB | 378 | 100 | -9 | ±100 | 3 / 35 | 62 | kill{family:construct} (eye_turret, stone_golem) |
| `elite_kill` | impactBell_heavy_004.ogg [0+290] +5st + impactGlass_heavy_000.ogg [0+230] -4dB | 230 | 120 | -5 | 0 | 1 / 150 | 80 | kill{elite:true} (layer on the family kill) |

### Player critical (sfx.critical)

| Cue | Source [in ms + len ms] pitch/gain/offset | Out ms | Fade-out ms | Gain dB | Pitch jitter ¢ | Poly / min ms | Prio | Trigger |
|---|---|---|---|---|---|---|---|---|
| `player_hurt` | grunt_04.ogg [25+280] + impactPunch_heavy_000.ogg [0+200] -3dB (v1 of 2) | 280 | 120 | -1 | ±30 | 1 / 100 | 100 | player_hurt |
| `shield_break` | impactGlass_heavy_001.ogg [0+350] -2st + impactPlate_heavy_000.ogg [0+300] -4dB | 393 | 150 | -1 | 0 | 1 / 100 | 100 | shield_break |
| `player_death` | impactBell_heavy_001.ogg [0+1300] -12st + grunt_01.ogg [65+600] -2st -3dB | 2600 | 900 | 0 | 0 | 1 / 1000 | 100 | player_death (frame 0 of the death beat) |
| `body_fall` | impactSoft_heavy_000.ogg [0+300] -3st + cloth1.ogg [70+250] -6dB | 357 | 150 | -6 | 0 | 1 / 1000 | 95 | body_fall (death + 300 ms after the stop) |
| `revive` | Healing Full.wav [160+1100] + impactBell_heavy_000.ogg [0+900] -5st -6dB | 1201 | 500 | -3 | 0 | 1 / 1000 | 100 | revive (relic) |
| `low_hp_heartbeat` | impactSoft_heavy_000.ogg [0+200] -7st + impactSoft_heavy_001.ogg [0+200] -7st -3dB @260ms + impactSoft_heavy_000.ogg [0+200] -7st @900ms + impactSoft_heavy_001.ogg [0+200] -7st -3dB @1160ms | 1460 | 200 | -8 | 0 | 1 / 2000 | 90 | low_hp (HP crosses to <= 2; one-shot, not a loop) |

### World (sfx.world)

| Cue | Source [in ms + len ms] pitch/gain/offset | Out ms | Fade-out ms | Gain dB | Pitch jitter ¢ | Poly / min ms | Prio | Trigger |
|---|---|---|---|---|---|---|---|---|
| `heal` | Healing Full.wav [160+700] | 700 | 350 | -10 | 0 | 1 / 300 | 60 | heal (relic heal / fountain) |
| `run_start` | impactBell_heavy_001.ogg [0+1700] -5st | 2269 | 900 | -4 | 0 | 1 / 2000 | 90 | run_start (start room fade-in complete) |
| `floor_descend` | impactBell_heavy_001.ogg [0+1500] -10st + Wind effects 5.wav [125+1100] -4st -4dB | 2673 | 1000 | -4 | 0 | 1 / 2000 | 80 | floor_descend / portal_enter (sink start) |
| `door_open` | doorOpen_1.ogg [40+450] -2st (v1 of 2) | 505 | 200 | -8 | ±50 | 2 / 100 | 72 | door_open{index} (room clear +450 ms, +120 ms per door; index>0 plays at -6 dB) |
| `door_close` | doorClose_3.ogg [10+500] -3st + stones_03.ogg [0+280] -2st -6dB | 595 | 200 | -6 | 0 | 1 / 300 | 75 | door_close (room fade-in +250 ms; combat/elite/boss rooms) |
| `chest_open` | creak3.ogg [20+250] + metalLatch.ogg [35+120] -2st -3dB @180ms | 315 | 100 | -10 | 0 | 1 / 300 | 60 | chest_open (anticipation start) |
| `crate_break` | impactPlank_medium_000.ogg [0+300] + wood_04.ogg [45+200] -4dB (v1 of 2) | 314 | 120 | -10 | ±80 | 2 / 60 | 45 | crate_break (break step) |
| `pickup_coin` | Pickup_Gold_01.wav [0+120] (v1 of 4) | 120 | 50 | -17 | ±20 | 3 / 30 | 30 | pickup_coin{streak} |
| `pickup_card` | bookFlip3.ogg [30+200] + item_gem_01.ogg [0+150] +2st -4dB @40ms | 200 | 90 | -10 | 0 | 1 / 150 | 72 | pickup_card (reward Take confirm) |
| `relic_gain` | impactBell_heavy_003.ogg [0+400] +7st + item_gem_04.ogg [215+250] -3dB @60ms | 310 | 150 | -8 | 0 | 1 / 200 | 72 | relic_gain (draft take, shop buy, single-offer pickup) |
| `wand_pickup` | beltHandle1.ogg [15+180] + item_gem_03.ogg [5+140] +3st -3dB @40ms | 180 | 80 | -9 | 0 | 1 / 200 | 72 | wand_pickup (wand offer taken) |
| `reward_appear` | stones_02.ogg [120+400] -4st | 504 | 150 | -11 | 0 | 1 / 300 | 55 | reward_appear (room clear +300 ms, pedestal rises) |

### Danger lane: enemies and bosses (sfx.danger)

| Cue | Source [in ms + len ms] pitch/gain/offset | Out ms | Fade-out ms | Gain dB | Pitch jitter ¢ | Poly / min ms | Prio | Trigger |
|---|---|---|---|---|---|---|---|---|
| `wave_spawn` | Spell_03.wav [600+700] -3st | 832 | 300 | -8 | 0 | 1 / 500 | 75 | wave_spawn (first portal of each wave) |
| `windup_swipe` | drawKnife3.ogg [60+250] -4st | 315 | 120 | -7 | ±50 | 2 / 80 | 86 | enemy_windup{type:melee_swipe} |
| `windup_shoot` | Misc 02.wav [0+300] -7st | 449 | 120 | -7 | ±50 | 2 / 80 | 86 | enemy_windup{type:shoot} |
| `windup_ring` | Spell_01.wav [50+400] -5st | 534 | 120 | -7 | ±50 | 2 / 80 | 86 | enemy_windup{type:ring} |
| `windup_spiral` | engineCircular_000.ogg [1500+600] -5st | 801 | 120 | -7 | ±50 | 2 / 80 | 86 | enemy_windup{type:spiral} |
| `windup_charge` | troll_02.ogg [150+400] -3st | 476 | 120 | -7 | ±50 | 2 / 80 | 86 | enemy_windup{type:charge} |
| `windup_slam` | stones_02.ogg [120+400] -5st | 534 | 120 | -7 | ±50 | 2 / 80 | 86 | enemy_windup{type:slam} (self and target) |
| `windup_summon` | Spell_00.wav [0+600] -7st | 899 | 250 | -7 | ±50 | 2 / 80 | 86 | enemy_windup{type:summon} |
| `windup_blink` | Wind effects 5.wav [125+300] -6st | 424 | 120 | -7 | ±50 | 2 / 80 | 86 | enemy_windup{type:blink} |
| `windup_self_destruct` | spell_fire_03.ogg [0+600] -2st | 673 | 150 | -7 | ±50 | 2 / 80 | 86 | enemy_windup{type:self_destruct} (fire_imp fuse) |
| `windup_hazard_acid` | burble_01.ogg [60+400] -6st | 566 | 120 | -7 | ±50 | 2 / 80 | 86 | enemy_windup{type:hazard, attackId:acid_pools} (marks appear) |
| `windup_hazard_fire` | spell_fire_04.ogg [35+400] -6st | 566 | 120 | -7 | ±50 | 2 / 80 | 86 | enemy_windup{type:hazard, attackId:fire_zones} (marks appear) |
| `enemy_lock` | lock_02.ogg [45+110] -3st | 131 | 40 | -6 | 0 | 2 / 60 | 88 | enemy_lock (W-9, damage >= 2 attacks only) |
| `release_swipe` | blade_03.ogg [5+180] -4st | 227 | 100 | -11 | ±60 | 2 / 70 | 50 | enemy_release{type:melee_swipe} (whoosh; the hit itself = player_hurt) |
| `release_shoot` | laserLarge_000.ogg [0+200] -7st (v1 of 2) | 317 | 100 | -11 | ±60 | 2 / 70 | 50 | enemy_release{type:shoot} (once per volley) |
| `release_ring` | forceField_001.ogg [0+300] -7st | 449 | 100 | -11 | ±60 | 2 / 70 | 50 | enemy_release{type:ring} (once per volley) and spiral start |
| `enemy_charge_go` | Wind effects 5.wav [125+350] -8st + troll_03.ogg [30+250] -2st -4dB | 556 | 150 | -8 | 0 | 2 / 100 | 70 | enemy_release{type:charge} |
| `enemy_leap` | cloth1.ogg [70+300] -6st | 424 | 150 | -11 | 0 | 1 / 200 | 55 | enemy_release{type:slam, target} take-off (leap) |
| `enemy_summon_rise` | Spell_04.wav [60+700] -5st | 934 | 300 | -9 | 0 | 1 / 400 | 60 | enemy_release{type:summon} (portals open) |
| `enemy_blink_out` | cloth2.ogg [55+200] -5st | 267 | 90 | -11 | 0 | 2 / 100 | 55 | blink_out (W, vanish) |
| `enemy_blink_in` | Misc 02.wav [0+220] -8st | 349 | 100 | -10 | 0 | 2 / 100 | 58 | blink_in (W+1, reappear) |
| `hazard_on_acid` | burble_02.ogg [45+350] -4st | 441 | 150 | -11 | 0 | 1 / 300 | 55 | hazard_on{attackId:acid_pools} |
| `hazard_on_fire` | spell_fire_06.ogg [45+350] -5st | 467 | 150 | -11 | 0 | 1 / 300 | 55 | hazard_on{attackId:fire_zones} |
| `enemy_interrupt` | Misc 02.wav [300+200] -10st | 356 | 120 | -12 | 0 | 2 / 80 | 45 | enemy_interrupt (windup fizzled by stun/freeze/death) |
| `heavy_impact` | impactMining_000.ogg [0+400] -5st + lowFrequency_explosion_001.ogg [20+300] -3dB | 534 | 200 | -4 | 0 | 2 / 120 | 80 | heavy_impact (slam land, charge wall-stun, golem stomp) |
| `heavy_step` | stones_04.ogg [20+200] -7st | 300 | 100 | -15 | ±60 | 2 / 150 | 30 | heavy_step (stone_golem move clip frames 0 and 2) |
| `boss_step` | impactMining_000.ogg [0+250] -6st | 354 | 120 | -13 | ±60 | 2 / 150 | 35 | boss_step (boss move clip frames 0 and 2) |
| `boss_intro_rise` | engineCircular_000.ogg [1200+1000] -7st | 1498 | 300 | -6 | 0 | 1 / 2000 | 85 | boss_intro (at bossIntroPanMs/2 = 450 ms) |
| `boss_roar_knight` | creature_roar_03.ogg [30+1000] -4st + stones_03.ogg [5+600] -3st -5dB | 1260 | 400 | 0 | 0 | 1 / 1000 | 95 | boss_activate / boss_phase {boss:ossuary_knight} |
| `boss_roar_queen` | monster_04.ogg [140+1000] -3st + burble_01.ogg [60+700] -5st -6dB | 1189 | 400 | 0 | 0 | 1 / 1000 | 95 | boss_activate / boss_phase {boss:mire_queen} |
| `boss_roar_lich` | Dragon_Growl_00.wav [30+2000] -3st | 2378 | 700 | 0 | 0 | 1 / 1000 | 95 | boss_activate / boss_phase {boss:archlich} |
| `boss_death` | Fire impact 1.wav [250+1800] -5st + lowFrequency_explosion_000.ogg [35+1200] -3dB + impactBell_heavy_000.ogg [0+1400] -7st -4dB | 2403 | 1000 | 0 | 0 | 1 / 3000 | 95 | boss_death (frame 0 of the death stop) |

### Stingers (music.stinger, stereo)

| Cue | Source [in ms + len ms] pitch/gain/offset | Out ms | Fade-out ms | Gain dB | Pitch jitter ¢ | Poly / min ms | Prio | Trigger |
|---|---|---|---|---|---|---|---|---|
| `stg_room_clear` | jingles_PIZZI04.ogg [10+560] + impactBell_heavy_002.ogg [0+690] -3st -8dB | 821 | 250 | -3 | 0 | 1 / 500 | 95 | room_clear (t=0) |
| `stg_boss_intro` | jingles_HIT15.ogg [0+1160] + impactBell_heavy_001.ogg [0+1700] -5st -4dB | 2269 | 700 | 0 | 0 | 1 / 500 | 95 | boss_activate (after the pan; with boss_roar_*) |
| `stg_boss_phase` | jingles_HIT03.ogg [15+730] + impactBell_heavy_001.ogg [0+1200] -3st -4dB | 1427 | 500 | 0 | 0 | 1 / 500 | 95 | boss_phase (t=0, inside the 1200/1500 ms invulnerable beat) |
| `stg_boss_clear` | Jingle_Achievement_00.wav [0+3560] | 3560 | 900 | -1 | 0 | 1 / 500 | 95 | boss_death +600 ms (floors 1-2) |
| `stg_victory` | Jingle_Win_00.wav [0+7000] | 7000 | 1500 | -1 | 0 | 1 / 500 | 95 | boss_death +600 ms (floor 3 = run won) |
| `stg_death` | Jingle_Lose_00.wav [0+4200] + impactBell_heavy_001.ogg [0+1500] -12st -8dB | 4200 | 900 | -1 | 0 | 1 / 500 | 95 | player_death +400 ms (after D8 clears the beds) |
| `stg_unlock` | Jingle_Achievement_00.wav [0+1300] +2st | 1158 | 500 | -3 | 0 | 1 / 500 | 95 | S7u Unlocks screen opens |

### UI (ui)

| Cue | Source [in ms + len ms] pitch/gain/offset | Out ms | Fade-out ms | Gain dB | Pitch jitter ¢ | Poly / min ms | Prio | Trigger |
|---|---|---|---|---|---|---|---|---|
| `ui_move` | bookFlip3.ogg [25+60] | 60 | 25 | -18 | ±30 | 2 / 40 | 40 | ui_move (focus moves) |
| `ui_confirm` | bookPlace3.ogg [5+120] | 120 | 40 | -14 | 0 | 2 / 40 | 40 | ui_confirm (confirm, rebind captured; FTUE step done at -6 dB) |
| `ui_back` | bookClose.ogg [55+120] -2st | 135 | 40 | -15 | 0 | 2 / 40 | 40 | ui_back |
| `ui_denied` | bookPlace1.ogg [20+100] -5st | 133 | 40 | -18 | 0 | 2 / 120 | 40 | ui_denied (disabled confirm) |
| `ui_tab` | bookFlip2.ogg [0+180] | 180 | 40 | -16 | 0 | 2 / 40 | 40 | ui_tab (pause tabs, codex tabs) |
| `ui_book_open` | bookFlip1.ogg [540+220] + bookOpen.ogg [15+120] -4dB @40ms | 220 | 90 | -13 | 0 | 2 / 200 | 40 | overlay_open (pause / reward / shop / settings) |
| `ui_book_close` | bookClose.ogg [55+150] | 150 | 40 | -14 | 0 | 2 / 200 | 40 | overlay_close |
| `ui_card_pick` | bookFlip3.ogg [25+120] +2st | 107 | 40 | -15 | 0 | 2 / 40 | 40 | ui_card_pick |
| `ui_card_place` | bookPlace2.ogg [25+140] | 140 | 40 | -14 | 0 | 2 / 40 | 40 | ui_card_place |
| `ui_card_swap` | bookFlip2.ogg [0+120] + bookPlace3.ogg [5+110] -2dB @60ms | 170 | 40 | -14 | 0 | 2 / 40 | 40 | ui_card_swap |
| `ui_salvage` | cloth2.ogg [55+220] + handleCoins2.ogg [20+250] -4dB @80ms | 330 | 100 | -13 | 0 | 2 / 150 | 40 | ui_salvage (card salvaged for coins) |
| `ui_buy` | handleCoins.ogg [50+300] | 300 | 120 | -12 | 0 | 2 / 150 | 40 | ui_buy (shop purchase) |
| `ui_reroll` | bookFlip1.ogg [540+200] +2st + handleCoins2.ogg [20+250] -6dB @50ms | 300 | 90 | -13 | 0 | 2 / 150 | 40 | ui_reroll (shop reroll) |
| `ui_unlock` | item_gem_04.ogg [215+250] +5st | 187 | 112 | -12 | 0 | 2 / 150 | 40 | ui_unlock (each unlock card revealed on S7u) |
| `ui_preview_up` | item_gem_02.ogg [10+60] +7st | 40 | 24 | -22 | 0 | 2 / 250 | 40 | ui_preview_up (held card over target, DPS delta > 0; optional) |
| `reward_open` | Inventory_Open_01.wav [0+450] | 450 | 200 | -13 | 0 | 2 / 300 | 40 | reward modal opens (S4 / S4w) — replaces ui_book_open for rewards |

## 4. Music: the explore ↔ combat ↔ boss structure

Beds are **pre-baked seamless loop files**. The whole rendered file loops (`loop: true`; `rendered_loop_start_s` 0). The seam is baked by crossfading `[Le − xf, Le)` into `[Ls − xf, Ls)` (`acrossfade`, qsin), so sample 0 of a metered bed is a downbeat. EQ: every bed gets a −2.5 dB dip at 2.8 kHz (Q 1) to leave room for casts and telegraphs. `mus_title`, `mus_explore` and `amb_cave` also get the small-speaker harmonic chain (`mix-bus-topology` §7).

| Cue | Source | Tempo | Loop in source [Ls, Le) s | Rendered loop | Seam xf s | Gain dB | Load group | Plays in |
|---|---|---|---|---|---|---|---|---|
| `mus_title` | Dark Fog.mp3 | 72.0 | 28.32 → 88.32 | 0 → 60.0 (whole file loops) | 0.833 | 2 | title | TITLE state (Title / Credits / Run-end after its stinger) |
| `mus_explore` | Ossuary 6 - Air.mp3 | — | 141.0 → 227.5 | 0 → 86.5 (whole file loops) | 3.0 | 0 | run | EXPLORE state |
| `mus_combat_a` | Unholy Knight.mp3 | 139.995 | 27.421 → 116.567 | 0 → 89.146 (whole file loops) | 0.429 | -3 | run | COMBAT state, floors 1-2 |
| `mus_combat_b` | Volatile Reaction.mp3 | 154.995 | 27.468 → 132.761 | 0 → 105.293 (whole file loops) | 0.387 | -3 | floor3 | COMBAT state, floor 3 |
| `mus_boss_a_p1` | Five Armies.mp3 | 114.01 | 14.214 → 58.421 | 0 → 44.207 (whole file loops) | 0.526 | -1 | boss_a | BOSS_P1, floors 1-2 (ossuary_knight, mire_queen) |
| `mus_boss_a_p2` | Five Armies.mp3 | 114.01 | 113.153 → 146.834 | 0 → 33.681 (whole file loops) | 0.526 | -1 | boss_a | BOSS_P2, floors 1-2 |
| `mus_boss_final_p1` | Aggressor.mp3 | 150.0 | 12.385 → 50.785 | 0 → 38.4 (whole file loops) | 0.4 | -1 | boss_final | BOSS_P1, floor 3 (archlich) |
| `mus_boss_final_p2` | Aggressor.mp3 | 150.0 | 89.185 → 127.585 | 0 → 38.4 (whole file loops) | 0.4 | -1 | boss_final | BOSS_P2, floor 3 |
| `mus_boss_final_p3` | Aggressor.mp3 | 150.0 | 175.585 → 213.985 | 0 → 38.4 (whole file loops) | 0.4 | -1 | boss_final | BOSS_P3, floor 3 |
| `amb_cave` | Ambience_Cave_00.wav | — | 4.25 → 51.5 | 0 → 47.25 (whole file loops) | 3.0 | -13.5 | run | run_start (loops for the whole run; floor 2 detune -200 cents; D1/D2/D6/D8 targets) |

**Crossfade rules** (`music_state_machine`; equal-power means `g_out = cos(t·π/2)`, `g_in = sin(t·π/2)`):
- **Explore → combat:** on `door_close` + `roomEnterGraceMs` 500, an **equal-power crossfade of 1200 ms**. Explore **pauses** at the end of its fade and keeps its position. The combat bed **resumes** where it last stopped; the first combat of a floor starts at 0. The door slam and the wave portal mask the seam.
- **Combat → explore:** on `room_clear` at t = 0, `stg_room_clear` plays (D3 −6 dB). The combat bed fades out over 600 ms and pauses. Explore resumes at t = 400 ms with a 2500 ms fade-in.
- **Boss:** explore fades over the 900 ms pan. On activation, the roar and `stg_boss_intro` play, then `_p1` starts at sample 0 when the stinger ends. On `boss_phase`, the bed fades out over 300 ms, the stinger and roar play, and the next bed starts at sample 0 at t = 900 ms with a 100 ms fade-in. On boss death, the bed fades out over 400 ms, then `stg_boss_clear` (F1–F2) or `stg_victory` (F3) plays at +600 ms.
- **Victory:** `stg_victory` (LRSF *Jingle_Win*, 7.0 s). **Game over:** D8 clears the beds, then `stg_death` plays at +400 ms (LRSF *Jingle_Lose* + the Toll at −12 st, 4.2 s). The game then returns to TITLE.
- A transition that arrives mid-crossfade retargets the ramps from their current values; it never restarts them.

## 5. Loading, and deviations from the finished docs

- **Load groups** (`load_groups`): the decoded budget is ≤ 128 MB. Loading all 10 loops at boot would be about 200 MB of decoded PCM. So: `boot` = all one-shots (about 14 MB); `title`; `run` = explore, combat_a and ambience; `floor3` = combat_b; `boss_a` and `boss_final` load during the 900 ms boss pan. **Game Developer:** today `core/audio.js` queues every cue in Boot pass 2. It needs to queue by `load_group` and unload the groups that are left behind.
- `amb_cave` targets **−18.5 LUFS** integrated, not −18. At −18 its true peak is −1.2 dBTP, over the −1.5 ceiling, and a limiter would break the seam. `default_gain_db` −13.5 keeps it at −32 in the mix.
- `low_hp_heartbeat` is a **1.46 s one-shot** (two lub-dubs) that fires when HP drops to 2 or less. It is not a loop, per `hud-layout` §3.4. The D7 music filter carries the ongoing state.
- UX `screen-graph` §7 asks for a −6 dB music duck while a modal is open. `mix-bus-topology` D6 (1.8 kHz low-pass + −4 dB) replaces it; that doc is authoritative.
- `measured` and `abx_transparency` are `pending` / `not_run` until the Technical Artist renders. Nothing in this spec claims a measurement that wasn't taken. The sonic brief's "120 cues, 190 files" is superseded by the counts above.

## 6. Provenance

Every cue lists each source file, pack, author and licence under `provenance`. The cues that use CC-BY sources match `credits.md` exactly: ViRiX in 21 cues, Little Robot Sound Factory in 12, and all six Kevin MacLeod tracks. The no-go sources are unused: Kenney NES, Sax and Steel jingles, and the CC0 chiptunes.

## 7. Revision 1.1 (2026-09-27): the Technical Artist's small-speaker objection, accepted

The Technical Artist measured 9 `sfx_critical` cues losing more than 6 dB through the 250 Hz high-pass (step 8). Each now gets the beds' parallel harmonic chain, applied after the fade-out: `lowpass 180 → +36 dB → tanh → high-pass 250 (24 dB/oct)`, mixed back under the dry signal at the level below. The level was tuned per cue. A scratch re-measure used the Technical Artist's method (max M delta through `highpass=f=250,highpass=f=250`).

| Cue | Loss before (TA) | Harmonic level | Loss after (scratch) |
|---|---|---|---|
| `low_hp_heartbeat` | 31.7 | −2 dB | 5.2 |
| `heavy_impact` | 15.8 | −2 dB | 4.3 |
| `body_fall` | 15.0 | −2 dB | 4.2 |
| `boss_death` | 11.9 | −3 dB | 5.1 |
| `boss_roar_queen` | 9.9 | −6 dB | 5.5 |
| `wave_spawn` | 9.6 | −14 dB | 4.2 |
| `player_death` | 8.1 | −10 dB | 4.6 |
| `explode_big` | 7.9 | −8 dB | 5.3 |
| `boss_roar_knight` | 7.8 | −8 dB | 5.1 |

The Technical Artist re-renders these 9 cues only, running steps 1–8 again. Their `version` is now 1.1, and `revision_log` is updated.

## 8. Revision 1.2 (2026-09-27): Spellwright v2 (Wave A2)

**Inputs:** `design-v2.md` §4–§11, `content-inventory.md` §0, `mobile-touch-spec.md` §8/§11 and `screen-graph.md` §9. 31 new one-shot cues bring the totals to **155 cues and 196 files**. All new sources are CC0 (Kenney, rubberduck), so `credits.md` is unchanged. Every new cue is in load group `boot`. The Technical Artist renders only the `version: "1.2"` cues (`revision_log`).

**Defence throttle (block spam never masks hurt).**
- `shield_block`, `armour_clang_chip` and `ward_pop` share the **`defence_chip` rate group** (`mixer.rate_groups`):
  - at most one start per 100 ms across all three;
  - at most 2 group voices sounding at once;
  - no start within **150 ms** of any `sfx.critical` voice starting.
- The chip voices sit at −28/−29 LUFS in the mix, so 2 overlapping voices sum to about −25. `player_hurt` is −15, and D2 ducks `sfx.impact` by a further −4 dB, which leaves ≥ 14 dB of separation at 10 blocks/s.
- The *answers* are loud and never stolen, like a reaction (priority 80, D4):
  - `shield_shatter` (pierce breaks the shield);
  - `armour_clang_blast` (blast hits armour; priority 64);
  - `armour_break` (the armour bar runs out);
  - `ward_break` (shock strips the ward).
- The wrong-tool chips are thin and dull. The player hears the counter system: a *dull chip* means the wrong tool, a *big crack* means the right one.

**Id note.** The requested enemy `shield_break` is **`shield_shatter`**, because `shield_break` is already the player's warding-sigil shield (v1 id, used by `event-markers` §1 and mix D2). The requested armour clang is split into `armour_clang_chip` / `armour_clang_blast`. `reward_reroll` routes to the existing `ui_reroll`, since it is the same verb as the shop reroll.

**Mini-bosses.**
- The combat bed keeps playing; there is no boss bed for a mini-boss.
- On activation: `stg_miniboss_intro` + `miniboss_roar_<id>`.
- On death: `miniboss_death`, then the normal `room_clear` release.
- Boss adapt: `stg_boss_adapt` (the Toll reversed into a hit, meaning "it read you"). Mercy adapts use the same stinger at −6 dB.

**Phone and `audioSession: ambient`.**
- The game plays under the player's own music and obeys the silent switch, so no cue may depend on sub-bass.
- Every new cue was rendered in scratch and measured with the Technical Artist's method (max M delta through `highpass=f=250` twice). The worst case is 5.8 dB (limit 6).
- 4 cues needed the harmonic chain: `windup_ward` 12.6 → 5.3, `windup_mirror` 9.3 → 5.2, `miniboss_roar_warden` 12.3 → 4.0, `miniboss_death` 8.5 → 5.2.
- `touch_ui_tap` is 44 ms, on the UI bus, with an 80 ms minimum interval.

**New enemies.**
- `tomb_sentinel`: its spear thrust reuses `windup_swipe` / `release_swipe`. Its death is the `construct` kill.
- `lantern_acolyte`: `windup_ward` → `ward_raise`. Its death is the `caster` kill.
- The new attack types `ward_allies`, `guard` and `mirror`, and the Heat hazard `bone_rain`, have their own windup and release cues. The other Heat attacks reuse existing ring and spiral cues.

| Cue | Sub-bus | Source [in+len ms] | Out ms | Gain dB | Poly / min ms | Prio | Scratch HPF loss dB | Trigger |
|---|---|---|---|---|---|---|---|---|
| `shield_block` | sfx.impact | impactMetal_light_000.ogg [0+110] -4st (v1 of 3) | 139 | -14 | 2 / 100 | 40 | 0.6 | defence{type:shield, outcome:block} (front hit absorbed) |
| `shield_wear` | sfx.impact | impactPlate_heavy_001.ogg [0+330] -3st + wood_04.ogg [45+200] -2st -4dB @40 | 392 | -9 | 1 / 200 | 72 | 1.1 | defence{type:shield, outcome:wear} (7th block without pierce: shield cracks and drops) |
| `shield_shatter` | sfx.impact | impactPlate_heavy_000.ogg [0+400] + impactMetal_heavy_001.ogg [0+250] +3st -3dB + stones_04.ogg [20+200] -5dB @50 | 400 | -5 | 2 / 150 | 80 | 0.6 | defence{type:shield, outcome:break} (pierce shatters it) — the enemy shield; the PLAYER shield keeps `shield_break` |
| `armour_clang_chip` | sfx.impact | impactMetal_medium_001.ogg [0+100] -2st (v1 of 3) | 119 | -15 | 2 / 100 | 40 | 0.1 | defence{type:armour, outcome:hit, keyword:none} (direct/DoT chip at x0.4 / x0.25) |
| `armour_clang_blast` | sfx.impact | impactPlate_heavy_002.ogg [0+300] -4st + impactMining_001.ogg [0+200] -2st -4dB (v1 of 2) | 400 | -9 | 2 / 70 | 64 | 3.4 | defence{type:armour, outcome:hit, keyword:blast} (x2.5) |
| `armour_break` | sfx.impact | metalPot1.ogg [90+700] -5st + stones_03.ogg [5+400] -2st -3dB | 934 | -5 | 2 / 150 | 80 | 0.8 | defence{type:armour, outcome:break} (bar depleted) |
| `ward_pop` | sfx.impact | impactGlass_light_003.ogg [0+90] +5st (v1 of 2) | 71 | -15 | 2 / 100 | 40 | 0.0 | defence{type:ward, outcome:block} (a charge swallows a hit) |
| `ward_break` | sfx.impact | impactGlass_medium_001.ogg [0+350] +2st + forceField_003.ogg [0+250] +5st -5dB | 312 | -6 | 2 / 150 | 80 | 0.2 | defence{type:ward, outcome:break} (shock strips it, or the last charge spent) |
| `windup_ward` | sfx.danger | forceField_004.ogg [0+450] -6st · harmonics -6 dB | 636 | -7 | 2 / 80 | 86 | 5.3 | enemy_windup{type:ward_allies} (kindle_ward, kindle_choir, veil) |
| `ward_raise` | sfx.danger | impactBell_heavy_004.ogg [0+300] +2st + impactGlass_light_000.ogg [0+150] -3st -6dB @40 | 267 | -11 | 1 / 300 | 60 | 1.2 | enemy_release{type:ward_allies} (wards land on allies / self) |
| `windup_guard` | sfx.danger | drawKnife1.ogg [65+250] -6st + impactPlate_heavy_001.ogg [0+250] -4st -4dB @120 | 435 | -7 | 2 / 80 | 86 | 3.2 | enemy_windup{type:guard} (knight shield_wall) |
| `guard_raise` | sfx.danger | impactPlate_heavy_003.ogg [0+350] -5st + stones_01.ogg [20+150] -3st -5dB | 467 | -9 | 1 / 300 | 60 | 2.4 | enemy_release{type:guard} (shield wall planted) |
| `windup_mirror` | sfx.danger | forceField_002.ogg [0+600] -5st (areverse) · harmonics -8 dB | 801 | -7 | 2 / 80 | 86 | 5.2 | enemy_windup{type:mirror} (archlich mirror_volley) |
| `windup_hazard_bone` | sfx.danger | stones_02.ogg [120+400] -3st | 476 | -7 | 2 / 80 | 86 | 0.1 | enemy_windup{type:hazard, attackId:bone_rain} (heat 4+) |
| `hazard_on_bone` | sfx.danger | stones_04.ogg [20+250] -2st + wood_01.ogg [0+150] -4dB @60 | 281 | -11 | 1 / 300 | 55 | 0.0 | hazard_on{attackId:bone_rain} |
| `miniboss_roar_warden` | sfx.danger | roar_02.ogg [45+500] -5st + impactPlate_heavy_000.ogg [0+350] -5st -5dB · harmonics -6 dB | 667 | 0 | 1 / 1000 | 95 | 4.0 | boss_activate / boss_phase {boss:grave_warden} |
| `miniboss_roar_matron` | sfx.danger | howl.ogg [25+550] -4st (aecho) | 693 | 0 | 1 / 1000 | 95 | 1.6 | boss_activate / boss_phase {boss:lantern_matron} |
| `miniboss_roar_colossus` | sfx.danger | metalPot1.ogg [90+800] -8st + monster_07.ogg [255+600] -6st -4dB | 1270 | 0 | 1 / 1000 | 95 | 2.0 | boss_activate / boss_phase {boss:iron_colossus} |
| `miniboss_death` | sfx.danger | lowFrequency_explosion_000.ogg [35+800] -2st + explosionCrunch_001.ogg [0+600] -3st -3dB + impactBell_heavy_002.ogg [0+690] -3st -5dB · harmonics -6 dB | 898 | -2 | 1 / 2000 | 95 | 5.2 | boss_death{tier:mini} |
| `stg_miniboss_intro` | music.stinger | jingles_HIT11.ogg [15+940] -2st + impactBell_heavy_002.ogg [0+690] -5st -4dB | 1055 | -1 | 1 / 500 | 95 | 3.9 | boss_activate{tier:mini} (after miniBossActivateDelayMs; with miniboss_roar_*) |
| `stg_boss_adapt` | music.stinger | impactBell_heavy_001.ogg [0+900] -7st (areverse) + jingles_HIT13.ogg [20+270] -3st -2dB @1130 | 1451 | -2 | 1 / 500 | 95 | 5.0 | boss_adapt (adapt banner shows: shield_wall / veil / mirror / resist / mercy) |
| `door_threat` | sfx.world | impactBell_heavy_003.ogg [0+450] -9st + drawKnife2.ogg [0+250] -6st -8dB @60 | 757 | -11 | 1 / 400 | 55 | 5.2 | door_threat_shown (a threat or risk door label reveals; once per door per room) |
| `duo_unlock` | sfx.world | impactBell_heavy_003.ogg [0+450] +5st + impactBell_heavy_003.ogg [0+450] +12st -2dB @130 + item_gem_04.ogg [215+300] -5dB @200 | 500 | -6 | 1 / 500 | 80 | 0.4 | duo_formed (a duo relic is taken: both parents owned) |
| `corrupted_take` | sfx.world | impactBell_heavy_001.ogg [0+1000] -8st + creature_monster_03.ogg [110+600] -7st -4dB + burble_02.ogg [45+400] -6st -8dB @150 | 1587 | -6 | 1 / 500 | 80 | 5.8 | corrupted_take (a corrupted relic is taken from the risk-door draft) |
| `daily_start` | sfx.world | impactBell_heavy_001.ogg [0+1300] -5st + impactBell_heavy_001.ogg [0+1300] -3st -3dB @450 | 1996 | -4 | 1 / 2000 | 90 | 5.3 | run_start{mode:daily} (replaces run_start) |
| `stg_goal` | music.stinger | jingles_PIZZI05.ogg [10+520] + impactBell_heavy_004.ogg [0+290] +5st -6dB @300 | 520 | -3 | 1 / 500 | 95 | 3.8 | goal_earned (a goal pays: at run end, or immediately for later goals) |
| `forge_merge` | ui | impactMetal_medium_000.ogg [0+250] -3st + impactMetal_medium_003.ogg [0+200] -1st -2dB @110 + item_gem_04.ogg [215+300] +3st -5dB @200 | 452 | -10 | 2 / 300 | 40 | 0.1 | forge_merge (Merge confirmed in the Forge tab) |
| `forge_evolve` | ui | impactMetal_heavy_001.ogg [0+300] -3st + impactBell_heavy_000.ogg [0+900] +2st -3dB @80 + item_gem_04.ogg [215+350] +7st -4dB @300 | 882 | -8 | 2 / 500 | 40 | 0.6 | forge_evolve (Evolve confirmed) |
| `forge_slot` | ui | metalLatch.ogg [35+120] -2st + wood_03.ogg [0+150] -3dB @60 | 210 | -12 | 2 / 300 | 40 | 0.1 | forge_slot (+1 Slot bought) |
| `reward_skip` | ui | bookClose.ogg [55+150] -2st + handleCoins2.ogg [20+250] -3dB @70 | 320 | -13 | 2 / 300 | 40 | 1.7 | reward_skip (Skip +gold) |
| `touch_ui_tap` | ui | bookPlace3.ogg [10+55] +4st | 44 | -20 | 2 / 80 | 40 | 0.1 | touch_ui_tap (touch-down on any touch control or menu item; menus keep ui_confirm/ui_back on release) |

**Animator seam.** When this was written, `event-markers.md` had no v2 markers yet. The routing is keyed to design events (`defence{type,outcome,keyword}`, `boss_activate{tier}`, `boss_adapt`, `door_threat_shown`, `duo_formed`, `corrupted_take`, `forge_*`, `reward_skip`, `goal_earned`, `touch_ui_tap`). A marker id the Animator proposes later maps onto these as an alias in `event_routing`; no sound needs to change.

## 9. Revision 1.3 (2026-09-27): Worlds

**Inputs:** `v2-overhaul-plan.md` Addendum — Worlds and `specs/design/worlds.md`. Each world has its own explore/combat bed pair, ambience, entry stinger, native kill voices and twist cues. The keys match `floors.json` `world{music: "music.wN", ambience: "amb.wN"}`, and `world_audio.keys` resolves them. The orchestrator's long form, `music.world.<id>.explore|combat`, is an alias. Totals: **169 cues and 213 files.** The new sources are CC0, plus new regions of MacLeod tracks that are already credited, so `credits.md` is unchanged.

| World | `music.wN` explore | `music.wN` combat | Boss beds | `amb.wN` | `stg.wN` | Identity |
|---|---|---|---|---|---|---|
| **W1 The Sunken Crypt** | `mus_explore` (Ossuary 6, 141–227.5 s) | `mus_combat_a` (Unholy Knight) | Five Armies p1/p2 | `amb_cave` | `run_start` (Toll −5 st, dry) | stone and bone, the crypt's room tone |
| **W2 The Drowned Halls** | **`mus_explore_w2`** (Dark Fog breakdown, 138.32–198.32 s, 18 bars, low-pass 2.4 kHz) | `mus_combat_b` (Volatile Reaction; **moved from F3**) | Five Armies p1/p2 | **`amb_drowned`** (pressure drone + 13 drips and bubbles, 42 s) | **`stg_world_w2`** (low-passed Toll + bubble + drip) | under water: bells at a distance |
| **W3 The Last Library** | **`mus_explore_w3`** (Ossuary 6's sparse movement, 60–130 s, dry with air) | **`mus_combat_c`** (Aggressor, 127.585–175.585 s, 30 bars between the final-boss regions) | Aggressor p1–p3 | **`amb_library`** (hall hum + page turns, candle crackle, shelf creaks, 42 s) | **`stg_world_w3`** (Toll dry + page + candle + book shut) | dry paper and candle; combat is the Archlich theme before its climax |

**Scratch checks** (the Technical Artist's methods):
- `mus_explore_w2`: seam clean · TP after norm -1.5 · HPF loss 3.7
- `mus_explore_w3`: seam clean · TP after norm -4.6 · HPF loss 2.4
- `mus_combat_c`: seam clean · TP after norm -7.0 · HPF loss 4.0
- `amb_drowned`: seam clean · TP after norm -4.1 · HPF loss 3.6
- `amb_library`: seam clean · TP after norm -1.6 · HPF loss 5.6. It targets −18.8 LUFS (gain −13.2) so it meets −1.5 dBTP without a limiter.

**Ambience construction:** a pitched, filtered drone is cut into a seamless 6 s cell, looped ×7, and the identity events are baked on top. Every event ends at least 1.5 s before the wrap, so the seam stays clean. The drone runs 5–6 dB under the events, because on a phone the drips and pages carry the world while the drone only fills the room.

**Transitions:**
- At `floor_descend`, the current world's explore bed and ambience fade out over 1500 ms.
- When the world card shows, `stg.wN` plays (D3). Then `music.wN.explore` fades in over 2000 ms and `amb.wN` over 1500 ms.
- The v1 floor-2 `amb_cave` detune rule is retired.

**Loading:** per-world load groups `world_w1..w3`. The next world loads at descend start, and the previous world unloads once the next explore bed is audible. The W2 → W3 peak is about 96 MB, within the 128 MB budget.

**Natives and twists** (`world_audio.worlds.*.natives_kill`, `event_routing`):
- `bone_archer` → bone kill.
- `drowned_thrall` and `mire_leech` → `kill_drowned`.
- `animated_armor` → construct kill.
- `bound_tome` → `kill_paper`.
- `ink_imp` → `explode_ink`.
- The native attacks reuse the windup and release cues for their attack types.
- The Flooded twist gets `water_splash` (250 ms, 2 voices; the player's own splash +4 dB) and `shock_arc_water`.
- The Bookshelves twist gets `shelf_ignite` and `shelf_collapse`.

| Cue | Source [in+len ms] | Out ms | Gain dB | Poly / min ms | HPF loss dB | Trigger |
|---|---|---|---|---|---|---|
| `stg_world_w2` | impactBell_heavy_001.ogg [0+1500] -5st + burble_01.ogg [60+600] -5st @250 + drop_004.ogg [0+280] -8st @700 | 2002 | -2 | 1 / 500 | 5.1 | world_enter{world:w2} (world title card shows, after floor_descend) |
| `stg_world_w3` | impactBell_heavy_001.ogg [0+1500] -3st + bookFlip1.ogg [540+220] -2st @200 + spell_fire_06.ogg [45+500] -3st @350 + bookClose.ogg [55+150] -4st @900 | 1784 | -2 | 1 / 500 | 3.4 | world_enter{world:w3} (world title card shows, after floor_descend) |
| `kill_drowned` | creature_slime_02.ogg [160+220] -3st + drop_003.ogg [0+180] -6st @60 | 355 | -9 | 3 / 35 | 2.6 | kill{family:drowned} (W2 natives) |
| `kill_paper` | bookFlip2.ogg [0+200] -2st + bookClose.ogg [55+150] -4st @90 | 279 | -9 | 3 / 35 | 1.8 | kill{family:paper} (W3 natives: animated books, ink, candles) |
| `explode_ink` | explosionCrunch_000.ogg [0+300] -4st + creature_slime_02.ogg [160+250] -3st | 378 | -9 | 2 / 50 | 2.6 | explode{source:ink_imp} (ink_fuse self-destruct or killed mid-fuse) |
| `water_splash` | burble_02.ogg [45+200] +3st + drop_004.ogg [0+200] -4st @30 | 282 | -17 | 2 / 250 | 0.1 | water_enter (player or a ground enemy steps into a water tile; W2) |
| `shock_arc_water` | forceField_001.ogg [0+200] +5st + drop_001.ogg [0+130] +3st @20 | 150 | -13 | 2 / 80 | 0.3 | shock_arc (flooded twist: a shock hit arcs through water to other enemies) |
| `shelf_ignite` | spell_fire_04.ogg [245+450] + bookFlip1.ogg [540+220] +3st @60 | 450 | -11 | 2 / 150 | 0.0 | bookshelf_ignite (fire hit on a bookshelf; W3) |
| `shelf_collapse` | impactPlank_medium_001.ogg [0+350] -3st + bookPlace1.ogg [25+200] -3st @80 + bookPlace2.ogg [30+200] -5st @160 + wood_04.ogg [45+200] -3st @40 | 427 | -9 | 2 / 120 | 3.0 | bookshelf_collapse (burn ends, or a blast destroys it; W3) |

**Deviations from the designer's hints** (`worlds.md` §4):
- W1 "low choir" comes from the Ossuary bed plus the cave's drips; there is no choir source in the packs.
- W3 "ticking" isn't there, because a steady tick in a loop would fight the cast rhythm (pillar 1). The "low brass" is Aggressor.
- W1/W2 boss beds stay shared (Five Armies). A dedicated W2 boss bed would need a 7th track, and none is on disk.
