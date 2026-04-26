# 3D Cuboid Drill — Master Notes

User's mental training drill: running coordinate sequences through a 3x3x3 cuboid grid, imagining cells lighting up. Started as numeric sequence visualization, evolved into elite-level parallel-sequence training. Reports real near-transfer benefits — smoother mouse/cursor control (motor imagery → motor execution), better mental simulation, sharper focus.

## User's current skill level (2026-04-26)

- Can hold **4 parallel 7-step sequences** simultaneously in working memory
- ~28 bound positions tracked at once — elite mnemonist territory
- Reports the orb-with-tail visualization transfers directly to mouse cursor smoothness
- Drill goal: cognitively demanding yet "feels like floating / flying"

## Imagery protocol (the verdict from research)

- **Background:** natural eyes-closed black + faint phosphene shimmer. Don't fight to make it OLED black; accept what's there.
- **Cuboid frame:** faint blue wireframe, dim (~20% brightness), always visible. Don't make invisible — that adds reconstruction load + drift.
- **Active cell:** soft warm-gold glow with gentle bloom (~80% brightness). Not pure white — softer is more stable.
- **Motion trail:** short comet-tail (~200-400ms) connecting previous to current cell, then fades. NOT a persistent orb. The flick of light is what recruits motor cortex (Jeannerod, Decety) — that's where the cursor transfer comes from.
- **Fade behavior:** previous orb dims to ~20% as new one ignites. Two-three orbs back you can still see ghost-traces.
- **Floor plane:** optional. Add only if cube starts drifting/tilting in long sessions.
- **Multiple sequences:** color-code only when running parallel — gold (primary) + cyan / magenta / green (secondary). Single sequence = pure gold.
- **Pacing:** ~1 second per step, breath-coupled (inhale 3 steps, exhale 4 — asymmetry prevents metronomic boredom).
- **Viewpoint:** start from outside (god-view), advanced: switch to first-person inside the orb on rep 3-4.

### Why these choices (research basis)
- Pure black void destabilizes long visualization (Tibetan tantric tradition + Kosslyn afterimage research)
- Phosphene research: visual cortex naturally generates blue-violet and gold tones with eyes closed
- Motor imagery (Jeannerod, Decety, Munzert) — continuous-trajectory imagery activates M1/SMA more than static endpoints. Persistent orb burns WM tracking. Short comet-tail is the compromise.
- Wickens' multiple-resource theory — distinct color channels reduce cross-stream interference for parallel sequences
- Pearson & Kosslyn 2015: schematic-but-luminous beats high-detail because detail eats WM. Glow yes, texture no.
- Holmes & Collins PETTLEP: kinesthetic imagery transfers stronger to motor skill than purely visual — graduated mode 2

## Path design rules

- **Sequence length:** 7 is the sweet spot (Corsi span ~5-6 + 3D scaffold = +1-2). Below 5 boring, above 9 drops out of flow.
- **Manhattan distance per step:** ≥3 for "flying" feel. Face-adjacent steps make the orb crawl. Knight-jumps (M=√5) and body-diagonals (M=6) are the rocket moves.
- **Pingpong elevating:** z-axis bouncy (e.g. 1,3,2,3,1,2,3) gives the soaring/flight feeling. End each sequence higher than it started for net climb.
- **Difficulty progression order:** adjacency → face-diagonals → knight-jumps → length 7 → mental rotation under load → length 9 with mixed jumps → dual-channel color-coded → polyrhythm.
- **Don't add speed until topology is mastered.** Rushing collapses the motion-blur, which is the transfer mechanism.

## Current 4×7 protocol (high-difficulty pingpong rising)

All Manhattan distance ≥3, z-axis pingpongs, each ends higher than it started.

### A — Skywriter
```
111
233
122
313
221
332
113
```
z-trace: 1,3,2,3,1,2,3 — pingpong rising

### B — Falcon Dive
```
331
123
312
133
221
313
112
```
z-trace: 1,3,2,3,1,3,2 — pingpong

### C — Helical Soar
```
311
133
221
113
332
121
233
```
z-trace: 1,3,1,3,2,1,3 — pingpong rising

### D — Triple Bounce
```
331
113
332
121
333
112
133
```
z-trace: 1,3,2,1,3,2,3 — pingpong rising, two body-diagonals (rocket moves)

## Frontiers when 4×7 is solved

1. **Density:** 6×9 or 8×7 (more parallel, longer per)
2. **Interference:** sequences that share cells; disambiguate which trail "owns" a cell at recall
3. **Live trace operations:** reverse one while forwarding another, transpose (swap x↔z mid-run), mirror across y=2 plane
4. **Relational constraints:** sequence A at step k must equal sequence B at step k+2 — computing against the trace
5. **Polyrhythm:** A at 1Hz, B at 1.5Hz, both flowing simultaneously
6. **Dimensional bump:** 4×4×4 (64 cells) or 4D hypercube 3×3×3×3 = 81 cells (4th axis as time/phase/color)
7. **Cognitive load layering:** run sequences while doing serial sevens, breath-paced N-back, recalling memorized poem

## Single-sequence simple protocol (when starting cold)

1. Eyes closed, accept natural soft dark
2. Faint blue cuboid wireframe (dim, hologram-like)
3. Floor optional
4. Single golden orb lights up at coordinate
5. Previous orb fades to ~20% (ember), new one ignites at 80%
6. Comet streak between previous and current, ~half second fade
7. ~1 second per step, breath-coupled if you can
8. One 7-step sequence at a time until it feels effortless
9. Then add second sequence in cyan, parallel

## Key insight on transfer

The cursor-control transfer is real and documented (motor imagery research). Mouse work has two components: planning the trajectory + continuous correction during the move. The drill trains both — obsessive replay reinforces the smooth imagined motion as default, hand borrows from it. Same mechanism gymnasts/divers use ("kinesthetic flow"), surgeons (mental rehearsal), pianists (silent practice).

Far-transfer to general IQ is contested (same caveat as dual n-back). Near-transfer is solid.

## Related: Non-visual N-back app idea (paused)

User considered building an audio-only n-back app — speaks coordinates, listens for "match"/"no match." For phone-first, Apple's on-device Speech framework (native iOS) is best for real-time. PWA + Whisper has ~500ms latency that disrupts rhythm. Paused; might revisit.
