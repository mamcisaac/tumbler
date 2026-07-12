# Design study: always start with one empty tumbler

**Question:** could every daily start with one guaranteed-empty tumbler, laid out as
two rows of 4 with the empty one centred vertically to the right? What would that
change about expected moves and difficulty?

**Short answer:** yes, it's feasible — and it's a *bigger* change than it looks.
Total slack is unchanged (9 tubes × capacity 4 − 32 beads = 4 free slots either way),
but concentrating all of it in one tube means the other 8 tubes start **completely
full**. Today the reverse-scrambler spreads that slack around: **92% of the shipped
pool (249/270 puzzles) starts with zero fully-empty tubes.** So this proposal changes
the opening structure of every single daily.

Reproduce all numbers below with `node empty-tube-study.mjs` (150 boards per regime;
par = the generator's weight-2 A* solution, same as the shipped `par` field).

## Findings

| Metric | Current (slack spread) | Proposed (8 full + 1 empty) |
|---|---|---|
| Optimal solution length (mean) | 24.9 | 26.4 |
| Generator par, W=2 (mean / median) | 25.6 / 26 | 26.5 / 26 |
| Raw boards landing in the 28–40 par window | ~15% | ~33% |
| Provably unsolvable *without* Rotate | 100% | ~97% |
| Solutions using ≥1 rotate (mean rotates) | 100% (3.3) | 100% (3.3) |
| Useful opening moves (pours + rotate) | 5.3 | 9.0 |
| Random-play solve rate (300-move cap) | 25.4% | 11.9% |
| Solvability (with Rotate) | guaranteed by construction | 500/500 uniform deals solved |

### Expected moves: up slightly (~+1.5)
Optimal par rises from ~25 to ~26.5, median generator par barely moves. Starting
from 8 full tubes costs a couple of extra moves because every bead is boxed in at
move 0 — nothing is pre-staged the way a half-scrambled rack can be.

### Difficulty: harder in *feel* than par suggests
The random-playout solve rate — a proxy for how forgiving a board is to aimless
play — **halves** (25% → 12%). With one buffer tube, the opening pour is a real
commitment: which colour gets the only workspace. Bad early banking chokes the rack
in a way today's scattered partial tubes don't. Paradoxically the opening *offers
more* legal moves (9 vs ~5) — any of the 8 tops can pour into the empty — but
they're strategically weightier and more symmetric, so the puzzle reads as one
clean decision ("which colour do I free first?") instead of hunting for the few
colour-matched pours on a messy rack.

### The Rotate identity survives — in fact it's what makes this viable
Classic water sort with 8 colours and a **single** empty tube is essentially
unplayable — ~97–100% of these boards are *provably* unsolvable without Rotate
(exhaustive search, not a budget miss). With Rotate, every one of 500 uniform
deals solved. So a one-empty layout is only possible *because* of the game's
signature mechanic, and every daily would still require it (100% of solutions
rotate, ~3.3 times on average — unchanged).

### Generation gets easier and simpler
~33% of uniform full deals land in the current 28–40 par window vs ~15% of raw
scrambles, and reverse-scrambling becomes unnecessary: deal 32 beads into 8 tubes
uniformly, keep boards the solver confirms (all of them, in practice) inside the
par window and using a rotation. Note the reverse-scrambler *cannot* be adapted by
"reserving" a tube: if 8 tubes are full and the 9th must stay empty, there is no
room anywhere, so no reverse pour exists — the uniform deal (or filtering scrambles
that happen to end with an empty tube, ~8% do) is the way.

A side-benefit for the replayable daily: the W=2 par overshoots the true optimum
by ~0.7 moves on these boards (vs ~0.1 today), leaving the crowd a little more
room to trim under par — which is the daily's whole loop.

### Consistency and legibility
- Every daily opens from the same silhouette: 8 full, 1 empty. Day-to-day pars
  become more comparable, and the start reads as "untouched puzzle" rather than
  "game already in progress". It also matches the water-sort convention every
  player already knows, which shortens the tutorial's job.
- The flip side: openings get more same-y. All variety lives in the colour
  arrangement; the current messy racks arguably offer more day-to-day texture.

## Layout: 2×4 + empty centred right

Works cleanly. The rack is 5 columns wide either way (today: flex-wrap 5+4), so
phone width is unchanged. Implementation is small:

- `generate.mjs`: deal full boards, pin the empty tube at index 8 (today the tube
  order is shuffled, so the empty can be anywhere).
- `styles.css`: replace the wrap with a 2-row grid — tubes 0–7 in a 4×2 block,
  tube 8 in a fifth column spanning both rows, `align-self: center`.
- Rotate flips tube *contents*, not positions, so the side tumbler stays put.

One caveat: the side tube is only "the empty one" at move 0. After the first pour
it's an ordinary tumbler, and other tubes empty out during play — the special
position is a nice opening affordance, not a persistent rule. Worth keeping its
styling identical to the rest so it doesn't read as mechanically different.

## Follow-up: would 7 colours soften the forgiveness drop?

Measured (`node empty-tube-study.mjs 150 7` — same 9-tube rack, 28 beads, 8 free
slots, in both the "7 full + 2 empty" and "1 guaranteed side empty + slack spread
in the grid" arrangements). It overshoots badly — the extra slack doesn't soften
the game, it collapses it:

| Metric | 8 colours, 1 empty | 7 colours (either arrangement) |
|---|---|---|
| Optimal par (mean) | 26.4 | 21–22 |
| Boards in the 28–40 par window | ~33% | **0%** |
| Provably unsolvable without Rotate | ~97% | **0%** |
| Solutions using ≥1 rotate | 100% | 27–29% |
| Random-play solve rate | 12% | ~96% |

With 8 free slots every board is solvable as plain water sort, so Rotate — the
game's whole identity — becomes decorative, and near-random play wins 96% of the
time. 7 colours is not a viable difficulty lever on this rack; the free-slack knob
is extremely steep (4 slots → 8 slots swings random-play solvability from 12% to
96%). Difficulty tuning should stay at 8 colours and use the par window instead.

## Follow-up: does picking low-par boards restore forgiveness?

Only partially. Bucketing 400 boards per regime by par (40 random playouts each,
300-move cap): forgiveness falls gently with par (r ≈ −0.25) in both regimes, and
in the proposed regime it runs ≈19% for par ≤22 down to ≈8% for par ≥29. Even the
*easiest* one-empty bucket is less forgiving than the *hardest* current-regime
bucket (≈24%) — the forgiveness drop is a property of the all-full opening, not of
par, so the par window can trim difficulty at the margin but not buy the old
forgiveness back. Random wins take ~1.6–1.7× par in both regimes (≈36–45 moves),
so the drop is purely in how often aimless play gets through, not in how long the
wins take.

## Follow-up: 9 colours + 1 empty (10-tube rack)

Measured (`node empty-tube-study.mjs 150 9` — 36 beads, same 4 free slots, rack
grows to 2×5 or 2×4+2). Growing the rack does NOT restore forgiveness — it goes
the other way: the same one-tube buffer now has to service nine colours instead
of eight.

| Metric | 8 col + 1 empty (9 tubes) | 9 col + 1 empty (10 tubes) |
|---|---|---|
| Optimal par (mean) | 26.4 | 29.6 |
| W=2 par (mean) | 26.5 | 30.5 |
| Boards in the 28–40 par window | ~33% | **90%** |
| Provably unsolvable without Rotate | ~97% | ~99% |
| Mean rotates per solution | 3.3 | 4.2 |
| Random-play solve rate | ~12% | **6%** |
| …for its lowest-par bucket | ~19% (par ≤22) | ~11% (par ≤26) |

Forgiveness is governed by the slack-to-colours ratio, not rack size: 4 free
slots over 9 colours is tighter still, and even the easiest 9-colour boards are
only as forgiving as *average* 8-colour ones. Random wins still take ~1.5–1.7×
par. The upside, if a harder flagship daily is ever wanted: 9+1 lands 90% of raw
deals in the current par window (generation nearly filter-free), pars are
~4 moves longer, and rotation is used more per solve. As a like-for-like
replacement for today's difficulty, though, 8+1 remains the right shape.

## Follow-up: 7 colours + 1 empty on a 2×4 rack (8 tubes)

Measured (`node empty-tube-study.mjs 150 7 8` — 28 beads, 4 free slots). Unlike
7 colours on the 9-tube rack (which collapsed the game), shrinking the rack keeps
the slack at 4 slots and the game intact — and this turns out to be the most
forgiving one-empty configuration. The one-empty ladder, all with a single empty
tube and 4 free slots:

| | 7+1 (2×4) | 8+1 (2×4 + side) | 9+1 (2×5) | current shipped |
|---|---|---|---|---|
| Optimal par (mean) | 22.7 | 26.4 | 29.6 | ~25 (pool par 29–35) |
| Random-play solve rate | 18–19% | ~12% | 6.6% | ~25–29% |
| …lowest-par bucket | 23% | 19% | 11% | 36% |
| Provably unsolvable without Rotate | 93% | 97% | 99% | 100% |
| Mean rotates per solution | 2.7 | 3.3 | 4.2 | 3.3 |
| Raw deals in the 28–40 window | 3% | 33% | 90% | 15% |

Each added colour roughly halves forgiveness (19% → 11% → 7%) — the
slack-to-colours ratio is the difficulty dial, in smooth steps. 7+1 gets within
striking distance of today's forgiveness (19% vs ~25%), keeps Rotate essentially
mandatory (93% of boards, 99% of solutions), and has the cleanest layout of all:
a plain 2×4 grid, four columns instead of five, so tumblers can render larger on
phones. The trade-offs: dailies get ~3 moves shorter (par ~23 vs the shipped
pool's 29–35, so the par window must move to roughly 20–26), and the rotate
requirement is a notch weaker — worth keeping the generator's uses-rotation
filter, and possibly tightening it to require rotation (discard the ~7% of deals
solvable without it, which the no-rotate prover in this script can check).

## Follow-up: 5 colours + 1 empty on a 2×3 rack (6 tubes)

Measured (`node empty-tube-study.mjs 150 5 6` — 20 beads, 4 free slots, slack
ratio 0.8). This extends the ladder into genuinely casual territory, and it's the
first point where the Rotate identity visibly frays rather than just easing:

| | 5+1 (2×3) | 7+1 (2×4) | 8+1 | 9+1 |
|---|---|---|---|---|
| Optimal par (mean) | 15.3 | 22.7 | 26.4 | 29.6 |
| Random-play solve rate | **43–45%** | 18–19% | ~12% | 6.6% |
| Provably unsolvable without Rotate | **75%** | 93% | 97% | 99% |
| Solutions using ≥1 rotate (mean rotates) | 91% (1.4) | 99% (2.7) | 100% (3.3) | 100% (4.2) |

Nearly half of aimless playouts win, puzzles run ~15 moves, and a quarter of raw
deals are solvable as plain water sort (a require-rotation generator filter can
discard those, but organic rotate usage still halves to ~1.4 per solve). Too
soft for the flagship daily, but a good shape for a tutorial or a quick "casual
mode": short, forgiving, still rotation-flavoured, and a 2×3 rack renders huge
on phones. Between 5+1 and 7+1, note 6+1 (2×3+side or 2×4 with a gap) as the
remaining interpolation point if a middle step is ever wanted.

## Recommendation

Feasible and attractive: a cleaner, more legible opening, a stronger showcase for
Rotate (it becomes visibly load-bearing from move 1), simpler generation, and only
~+1.5 moves of par. The real design decision is the forgiveness drop, and the
follow-ups above map the whole dial. Keep exactly one empty tube and 4 free slots,
and pick a colour count:

- **7+1 on a 2×4 rack** — closest to today's forgiveness (19% vs ~25%), shorter
  dailies (par ~23), largest tumblers on phones. The "keep the feel" option.
- **8+1 on 2×4 + side tube** — like-for-like par (~+1.5 moves), ~2× less
  forgiving. The "keep the length" option, and the layout the proposal described.
- **9+1 on 2×5** — hard mode: par +4, forgiveness 7%, near-free generation.

Adding slack instead (7 colours on the 9-tube rack) breaks the game — Rotate goes
optional and random play wins 96% of the time — and the par window only trims
forgiveness at the margin (r ≈ −0.25). The colour count is the one honest dial.
