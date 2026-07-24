# Design study: the colour-ramp tier ladder

> **Revised twice — read the end of this document for what actually ships.**
> The ladder these opening sections arrive at (colours 6→7→8 over depths
> 3/4/5, tuned with the short-colour dial) shipped briefly, then went through
> two rounds of playtest feedback:
>
> 1. **Revision 1** — short colours read as confusing and asymmetric, so they
>    were dropped for full stacks (every colour exactly tube-height).
> 2. **Revision 2** — spreading the slack left the OPENING nearly forced, so
>    one tumbler is pinned empty again.
>
> The CURRENT design is therefore **6 / 7 / 8 colours over 7 / 8 / 9 tumblers,
> all 3-deep, every colour a full stack, one tumbler starting empty**. Both
> dated Revision sections at the end carry the research and shipped numbers.

**Question:** the shipped generator ramps difficulty by tube HEIGHT — all three
tiers use the same 7 colours + 1 pinned-empty tube (8 tubes, 2×4), and only K
(beads per colour) grows 3→4→5. Should difficulty instead ramp by COLOUR
COUNT, with slack spread by a uniform deal (no pinned empty tube) and a
short-colour dial to tune each tier independently?

**Short answer:** yes — colour count is the right axis, and it needs a second
dial (short colours) to be usable. A grid sweep over (colours C, tubes
T=C+1, depth K, short-colours m) found that C and K COMPOUND rather than add:
at fixed slack, every extra colour costs ~3pp of forgiveness at K=3 but ~17pp
at K=5. So the ladder can't just push C or K further — it needs a slack knob
per tier, and short colours (m of C colours dealt one bead short) turned out
to be exactly that knob, cleanly separable from C/T/K. The shipped ladder
rides colours 6→7→8 across modest depths 3/4/5, with m=0/1/4 tuning each
tier's forgiveness independently. A sibling idea — short TUBES instead of
short colours — was also tested and rejected (see below): it buys the same
slack but costs up to 33 points of forgiveness for zero rotate-requirement
gain.

Reproduce all numbers below with `node tier-ladder-study.mjs [N] [playouts]`
(defaults 150/30, matching the sweep this study reports; the frontier cells
were additionally confirmed at N=300). All figures are measured, not
estimated — see the per-section notes for exactly which run produced them.

## Methodology: the persistent-random player model

Every forgiveness number below is a **persistent-random** playout: a player
that uniformly picks among legal pruned pours plus Rotate (never re-rotating
immediately) — and, the one deviation from a "canonical" random player, if
that menu would ever be *empty* (just rotated, zero legal pours), it rotates
again instead of giving up. A playout ends only by solving, by hitting a
TRUE dead end (zero legal pours in **both** orientations — an absorbing
state, since Rotate is its own inverse), or by a 1000-move cap.

Why not the simpler "canonical" player that just stops when its menu is
empty? Because canonical turns out to be a badly pessimistic proxy. Measured
on the OLD shipped pool (200 boards/tier, 30 playouts/board, 1000-move cap):

| | canonical solve% | persistent solve% |
|---|---|---|
| Easy  | 39.5% | 87.3% |
| Medium | 18.7% | 61.2% |
| Hard  | 7.6%  | 39.1% |

That's not because canonical's give-ups are real dead ends: a direct check —
at every point a canonical playout would stop (zero pruned pours right after
a rotate), rotate once more and see if a legal pour appears — across the
whole old shipped pool (30 playouts × 200 boards/tier) found **100% of
canonical's give-ups are one-rotate-escapable** (easy 9,183/9,183, medium
139,050/139,050, hard 269,924/269,924 give-up states checked, zero
exceptions). Persistent's only behavioural change from canonical is to take
that extra rotate instead of stopping, so it is the more honest forgiveness
proxy, and is what this study and `empty-tube-study.mjs` before it report
throughout.

## The shipped baseline (today's depth ramp) under the persistent model

Measured on the current shipped `puzzles.json` (200 boards/tier, 30
playouts/board):

| Tier | stored par (mean) | persistent solve% | dead ends (hard-stuck) % |
|---|---|---|---|
| Easy (K=3)   | 15.8 | 87% | 12% |
| Medium (K=4) | 22.8 | 61% | 26% |
| Hard (K=5)   | 30.3 | 39% | 34% |

This is the depth ramp's real cost: pushing K from 3 to 5 alone (same 7
colours + 1 empty tube every tier) more than doubles the true-dead-end rate
and roughly halves forgiveness twice over. It's the baseline the colour-ramp
ladder needs to land somewhere sane relative to.

## The grid sweep: colour count vs. depth vs. short-colour slack

The sweep varies four knobs: colour count C ∈ {5,6,7,8}, tube count T = C+1
(core cells) or T = C+2 (reference cells), depth K ∈ {3,4,5}, and
short-colours m (0 up to K−1 or K, i.e. up to all-but-one colour short).
`slack = (T−C)·K + m`. Every cell is 150 uniform deals (dealCustom: shuffle
beads+blanks together, chop into T tubes of K slots, no pinned empty tube),
scored for W2 par, provably-needs-Rotate% (exhaustive pour-only proof, not a
budget guess), and persistent solve%.

### The trade-off wall

Within any single (C, T, K), sliding m is a **single** dial and it moves
forgiveness and rotate-necessity in *opposite* directions — you cannot buy
more of one without giving up the other at that fixed colour/tube/depth
point. K5, C=8, T=9 (the hard tier's rack) across its whole m range:

| m | slack | persistent solve% | provably needs Rotate% |
|---|---|---|---|
| 0 | 5 | 31.4% | 100% |
| 1 | 6 | 50.6% | 84% |
| 2 | 7 | 69.8% | 57.3% |
| 3 | 8 | 82.9% | 25.3% |
| 4 | 9 | 90.5% | 12.7% |

More slack always means softer *and* less rotate-mandatory — there is no
point on this line that is both forgiving and highly rotate-required. The
only way past the wall is to change WHICH (C, T, K) you're sliding m on —
which is exactly what the C-axis (next section) and the ladder's per-tier m
choice do.

### The short-colour slack dial

Within a fixed (C, T, K), m is the gentle, controllable half of the wall —
moving it one step at a time buys back forgiveness in smooth, predictable
increments (as the K5/C8/T9 table above shows: +19.2pp forgiveness per step
from m=0→1, +19.2pp again m=1→2, +13.1pp m=2→3, +7.6pp m=3→4 — diminishing
but always monotonic and smooth). Compare this to the C axis:

### The C-axis compounding finding

Holding m=0 and stepping C from 5→8 (T=C+1 in every case) costs forgiveness
at a rate that gets much steeper as K grows — colours and depth compound
rather than add:

| K | C=5 | C=6 | C=7 | C=8 | total drop (C5→C8) | per colour |
|---|---|---|---|---|---|---|
| 3 | 98.8% | 96.1% | 92.9% | 89.4% | −9.4pp | ~−3.1pp |
| 4 | 90.2% | 82.3% | 71.4% | 59.8% | −30.5pp | ~−10.2pp |
| 5 | 82.6% | 64.8% | 50.3% | 31.4% | ~−51.2pp | ~−17.1pp |

At K=3 an extra colour is nearly free; at K=5 it's five to six times as
expensive. This is why the ladder keeps K modest (3/4/5, not pushed higher to
"make room" for more colours) and leans on colours + the m dial instead of
depth to separate the three tiers.

### Follow-up: short TUBES instead of short colours? (rejected)

A tempting alternative slack source: instead of (or in addition to) dealing
some colours one bead short, physically cap `s` of the tubes at K−1 instead
of K (a "short tumbler"). At equal total slack, does this behave like the
all-long short-colour config, or do short tubes act as traps? Measured
mixed-capacity racks (s short tubes, m short colours, `slack = K + m − s`)
against the equal-slack all-long baseline (same slack, s=0):

| cell | slack | persistent solve% | equal-slack all-long baseline | Δ solve% | accept% mixed / baseline |
|---|---|---|---|---|---|
| K4, m=2, s=2 | 4 | 37.2% | K4 m=0: 69.8% | **−32.6pp** | 96% / 96% |
| K5, m=3, s=3 | 5 | 17.8% | K5 m=0: 49.0% | **−31.2pp** | 94% / 98% |
| K4, m=1, s=1 | 4 | 62.0% | K4 m=0: 69.8% | −7.8pp | 92.7% / 96% |
| K5, m=2, s=1 | 6 | 61.9% | K5 m=1: 65.9% | −4.0pp | 72% / 74% |

The worst mixed-capacity cells lose up to **33 points of forgiveness** at
*identical* slack, and the accept% (rotate-required) column is never higher
on the mixed rack than the equal-slack all-long baseline — it's the same or
lower in every cell measured. Short tubes are genuine traps (a long-colour
bead that lands in one is stuck until freed), and they buy **zero**
rotate-necessity gain for that forgiveness cost — if anything the mixed
rack is slightly harder to generate too. Rejected: the ladder uses short
COLOURS only, never short tubes.

## The chosen ladder's frontier cells

Three cells, one per tier, selected from the grid's blended frontier (par in
a sane range, rotate-required acceptance fast enough to generate, persistent
solve% in a comfortable band per tier). Easy and hard are the N=150 grid
numbers; medium was re-run at N=300 to firm up its acceptance estimate.

| Tier | cell | slack | par (W2/opt) | accept% (rotate filter) | filtered persistent solve% | filtered par p10–p90 | filtered mean rotates |
|---|---|---|---|---|---|---|---|
| Easy   | C6 T7 K3 m0 | 3 | 12.3 / 12.1 | **78%** (N=150) | **96.1%** | 11–14 | 1.57 |
| Medium | C7 T8 K4 m1 | 5 | 20.4 / 20.2 | **66.7%** (N=300) | **82.4%** | 18–23 | 1.96 |
| Hard   | C8 T9 K5 m4 | 9 | 27.8 / 27.3 | **12.7%** (N=150) | **85.3%** | 24.8–30.2 | 1.89 |

("filtered" = the subset that provably requires Rotate. The shipped pools
apply one more filter on top — the per-tier par window — which trims some of
the hardest tail, so the pools measure slightly friendlier than these cell
estimates: re-running the same persistent-playout model on the shipped
`puzzles.json` gives ≈96% / 85% / 88–89% for easy/medium/hard.)

### Dials kept in reserve

Two neighbouring cells were also measured, one per tunable tier, as the
"softer" and "harder" alternates if the shipped defaults ever need
retuning:

- **Medium comfort option — m=2** (`K4_C7_T8_m2`): slack 6, par 18.9, accept
  only 33.3% (slower generation) but filtered persistent solve% rises to
  93.8% — a gentler medium if 66.7%/82.4% ever feels too sharp a step down
  from easy's 96%.
- **Hard harder option — m=3** (`K5_C8_T9_m3`): slack 8, par 28.8, accept
  rises to 25.3% (faster generation than m=4's 12.7%) but filtered
  persistent solve% drops to 79.1% — a spikier hard if the shipped 85.3%
  ever feels too forgiving for a flagship tier.

Both are one line to swap in `generate.mjs`'s `TIERS[…].short` — no other
code changes needed, since m only ever changes the deal, not the schema.

### Par drift vs. the old depth ramp

Switching axes moves the daily's move-count centre down a bit: the old
depth-ramp pool averaged stored par 15.8 / 22.8 / 30.3 (≈16/23/30) across
easy/medium/hard; the new colour-ramp cells' raw uniform-deal par (before
windowing) average 12.3 / 20.4 / 27.8 (≈12/20/28) — three-ish moves shorter
per tier. `generate.mjs`'s par windows (10–15 / 17–23 / 24–31) are centred on
these new means with headroom either side, non-overlapping so tiers stay
cleanly separated by par.

## Recommendation (implemented)

Shipped as three colour-ramp tiers, uniform deal (no pinned empty tube),
every board provably requiring Rotate:

- **Easy — 6 colours × 3 beads, 7 tubes, cap 3** (`m=0`). Par ~10–15,
  ~96% persistent-forgiving on the filtered pool.
- **Medium — 7 colours × 4 beads (1 short), 8 tubes, cap 4** (`m=1`). Par
  ~17–23, ~82% filtered-forgiving.
- **Hard — 8 colours × 5 beads (4 short), 9 tubes, cap 5** (`m=4`). Par
  ~24–31, ~85% filtered-forgiving — hard needs the deepest short-colour dial
  of the three tiers precisely because C=8/K=5 alone (`m=0`) is so punishing
  (see the C-axis compounding table): at m=0 every deal is rotate-required
  but only 31.4% forgiving, crushingly harsh. Spending the dial down to m=4
  buys forgiveness back up to 90.5% while accept% (12.7%) stays high enough
  to generate 200 boards in a few seconds.

What we did **not** do: grow tube count for extra slack instead of using the
m dial (T=C+2 reference cells are rotate-dead — 0% acceptance in nearly
every K/C combination measured, since the extra tube alone hands plain water
sort enough room to solve almost everything); and we did not use short
TUBES as a slack source (up to −33pp forgiveness for zero rotate gain, see
above). Difficulty rides colour count across a modest, ladder-appropriate
depth; the m dial tunes each tier's forgiveness independently of the other
two; and the rotate-required filter guarantees the signature mechanic
matters on every board, easy included.

## 2026-07-24 — Revision: the full-stack colour ladder

**Question:** the short-colour dial above (`m`) was the ladder's second axis
— it's what let hard reach 8 colours at K=5 without collapsing to 31%
forgiveness. Design review rejected short colours outright: not on the
numbers, but on the player experience — a colour that never fills its
capped tube reads as a bug ("why won't this one finish?"), not as a
difficulty knob, and it's asymmetric in a way nothing else in the board is.
With `m` off the table for every tier, does the colour-count axis alone
still produce a usable three-tier ladder, and is there another slack source
that could stand in for `m`?

**Short answer:** yes to the first, no to the second. Colour count alone,
at a single fixed cap (K=3, "full-stack" — every colour dealt exactly `cap`
beads, so a solved tumbler is exactly full), reproduces a clean,
monotonically-tightening frontier across C=5..9 with no depth growth at
all. The tempting substitute for `m` — "headroom" (short every colour by
one bead, but recover the lost slack by pushing K up instead of holding it
flat) — was measured and rejected: it collapses rotate-requirement to
0–3% acceptance, and a follow-up check found the ONE prior result that
looked promising for this shape (the original sweep's "regime E") was
itself a bug, not a signal. The shipped ladder now rides colour count only
(6 → 8 → 9), cap pinned at 3 for all three tiers, no short colours anywhere.

### Short colours are gone: design feedback, not data

To be explicit about the reason for the change, since it isn't visible in
any of the numbers below: short colours were not rejected because they
measured badly (the opposite — the shipped `m=1`/`m=4` ladder in the
section above hit its forgiveness targets exactly as designed). They were
rejected on design/UX grounds — a colour that's "short" by definition never
fills its tube even when the puzzle is otherwise solved, which reads as
broken rather than intentional. `generate.mjs` keeps the short-colour
machinery (`beadsShortRandom`, the `short` field on each tier) in place —
it's harmless dead capability, fully documented — but every shipped tier
now runs with `short: 0`.

### Re-litigating the slack problem: the "headroom" alternative (rejected)

With `m` off the table, the natural substitute is to buy slack the other
way: short every colour by one bead (`m = C`, i.e. every colour is short),
but recover the lost fill by pushing K up a notch, on the theory that maybe
a slightly-deeper, all-short rack could still be usefully rotate-required.
Measured directly (family **H**, `uniform/results.json`, N=150/cell):

| cell | K | C | T | m | slack | accept% (rotate filter) | filtered persistent solve% |
|---|---|---|---|---|---|---|---|
| H_C6_T7_B3_cap4 | 4 | 6 | 7 | 6 | 10 | 0.7% | 100% |
| H_C7_T8_B3_cap4 | 4 | 7 | 8 | 7 | 11 | 0% | — (filterN=0) |
| H_C8_T9_B3_cap4 | 4 | 8 | 9 | 8 | 12 | 0.7% | 100% |
| H_C6_T7_B4_cap5 | 5 | 6 | 7 | 6 | 11 | 0.7% | 100% |
| H_C7_T8_B4_cap5 | 5 | 7 | 8 | 7 | 12 | 0.7% | 100% |
| H_C8_T9_B4_cap5 | 5 | 8 | 9 | 8 | 13 | 2% | 93.3% |
| H_C7_T8_B5_cap6 | 6 | 7 | 8 | 7 | 13 | 0% | — (filterN=0) |
| H_C8_T9_B5_cap6 | 6 | 8 | 9 | 8 | 14 | 2.7% | 100% |

Every headroom cell lands at **0–3% rotate-filter acceptance** — nowhere
near usable for daily generation (compare the chosen full-stack cells
below, all ≥78%). Extra depth with every colour already short just hands
plain water-sort enough room to solve almost everything without ever
touching Rotate. Headroom is rejected as a slack source.

### The regime-E false lead, found and fixed

One number looked like it contradicted the table above: the original
`sweep/sweep.mjs`'s "regime E" cells (a same-shaped short/higher-K attempt,
`sweep/sweep.out`) reported **64% / 92% / 98.7%** rotate-filter acceptance
at K=3/4/5 — the opposite conclusion from family H. Chasing the
discrepancy (`uniform/verify-sweepE.mjs`) found the cause: `sweep.mjs`'s
regime E passed the wrong capacity into the pour-only prover — it called
`solveNoRotate` with `K = beadsPerColor` (e.g. 3) instead of the deal's
actual tube cap (`beadsPerColor + 1` = 4), so the prover thought every tube
had one less slot of room than it really did and over-reported "provably
needs Rotate" on boards that were actually pour-solvable. Reproducing the
exact bug at C=7, T=8, beadsPerColor=3, cap=4 (N=300, freshly re-run for
this revision):

- **Buggy** (prover sees cap=3, deal's real cap=4): provably-needs-Rotate =
  **74.0%** (determined=300) — matches the shape of sweep.mjs's inflated
  regime-E numbers.
- **Fixed** (prover sees the deal's real cap=4, matched): provably-needs-Rotate
  = **0.0%** (determined=300) — matches family H's near-zero numbers exactly.

Confirmed: the original regime-E acceptance figures were a capacity-mismatch
artifact, not a real design opportunity. Headroom stays rejected on the
corrected (family H) numbers.

### The full-stack frontier

With `m` fixed at 0 everywhere, the remaining question is purely: which
(colours C, cap K) cells make a usable three-rung ladder? The frontier
below holds every colour full-stack (every colour dealt exactly `cap`
beads) and sweeps C at each of K=3/4/5 (`grid/results.json`'s `F_known`
family, N=150/cell, T=C+1 throughout), plus two new C=9 cells run for this
revision (`uniform/results.json`'s `F_new`, N=150):

| K (=cap) | C | T | accept% (rotate filter) | filtered persistent solve% | par (W2 mean / opt mean) |
|---|---|---|---|---|---|
| 3 | 5 | 6  | 65.3% | 99.83% | 10.06 / 10.10 |
| 3 | 6 | 7  | 78.0% | 96.21% | 12.30 / 12.13 |
| 3 | 7 | 8  | 84.7% | 92.81% | 14.65 / 14.55 |
| 3 | 8 | 9  | 90.0% | 88.79% | 17.17 / 17.05 |
| 3 | 9 | 10 | 95.3% | 84.03% | 19.59 / 19.48 |
| 4 | 5 | 6  | 68.0% | 88.37% | 14.46 / 14.50 |
| 4 | 6 | 7  | 78.7% | 81.50% | 17.88 / 17.73 |
| 4 | 7 | 8  | 92.7% | 70.05% | 21.67 / 21.40 |
| 4 | 8 | 9  | 95.3% | 59.25% | 25.20 / 24.65 |
| 4 | 9 | 10 | 98.7% | 43.54% | 29.77 / 29.15 |
| 5 | 5 | 6  | 76.0% | 80.41% | 18.75 / 18.25 |
| 5 | 6 | 7  | 93.3% | 64.43% | 23.52 / 23.40 |
| 5 | 7 | 8  | 94.0% | 50.00% | 28.77 / 28.32 |
| 5 | 8 | 9  | 100%  | 31.40% | 33.77 / 33.45 |

The pattern is the same C-axis compounding the original study found: at any
fixed K, accept% rises and filtered solve% falls as C grows, and the whole
curve gets steeper at higher K. At K=3 the curve is gentle enough to cover
all three tiers (C=6 → 96.2% forgiving down to C=9 → 84.0% forgiving)
without ever leaving a comfortable band — which is exactly why the revised
ladder holds K=3 for every tier rather than climbing it per tier as before.

Two of the K=4/K=5 cells (`C6_T7_cap4`, `C5_T6_cap5`) and the K=3 `C8_T9`
and `C9_T10` cells were re-confirmed at larger N to settle sampling noise
(`uniform/results.json`'s `settle500`/`settle300`):

| cell | N | accept% | filtered persistent solve% |
|---|---|---|---|
| C6 T7 K4 (cap4) | 500 | 86.2% | 78.65% (was 79.38% @N300) |
| C5 T6 K5 (cap5) | 500 | 79.4% | 81.86% (was 81.06% @N300) |
| C8 T9 K3 (cap3) | 500 | 93.0% | 89.03% (was 88.72% @N300) |
| C9 T10 K3 (cap3) | 300 | 97.3% | 82.88% |

All four settle runs confirm their N=150 estimates were not sampling noise.
The K=4/K=5 candidates were carried into this settle pass because a
depth-plus-colour ladder was still on the table early in this revision; the
final brief calls for a single flat cap across all three tiers instead, so
only the two K=3 rows (C8T9, C9T10) feed the shipped ladder below.

### The chosen ladder (implemented)

Three colour counts at one fixed cap, tubes = colours + 1, full palette
(no short colours) — every completed tumbler is exactly full:

| Tier | cell | slack | filtered par (W2/opt) | accept% (rotate filter) | filtered persistent solve% | filtered par p10–p90 | filtered mean rotates |
|---|---|---|---|---|---|---|---|
| Easy   | C6 T7 K3 | 3 | 12.38 / 12.09 | **78.0%** (N=150) | **96.2%** | 11–14 | 1.57 |
| Medium | C8 T9 K3 | 3 | 17.24 / 17.13 | **93.0%** (N=500) | **89.0%** | 15–19 | 2.23 |
| Hard   | C9 T10 K3 | 3 | 19.85 / 19.82 | **97.3%** (N=300) | **82.9%** | 18–22 | 2.73 |

(Par columns here are the FILTERED subset's means — the boards the generator
ships — so they differ a hair from the all-deals frontier table above.)
Re-running the persistent-playout model on the actually-shipped v4
`puzzles.json` (200 boards/tier × 30 playouts) confirms the cell estimates:
**96.1% / 89.5% / 83.6%**. `generate.mjs`'s par windows (10–15 / 15–20 /
17–23) are centred on these means with headroom either side; unlike the
original ladder's windows they overlap at the edges — tiers separate by
MEDIAN par (13 / 17 / 20), not by disjoint ranges.

### The acknowledged trade-off: depth is no longer a lever

The clearest cost of dropping short colours: hard's par drops from ~24–31
(the old `C8 K5 m4` cell, mean 27.8) to ~17–23 (the new `C9 K3` cell, mean
19.85) — roughly eight fewer moves at the top of the ladder. That's the
direct consequence of pinning every tier to cap 3: without a short-colour
dial to buy back forgiveness at higher K, depth stops being a usable lever
at all — pushing K up alone at full-stack (m=0) costs forgiveness far too
fast per the frontier table above (e.g. C8 goes from 88.8% forgiving at K=3
to 59.3% at K=4 to 31.4% at K=5) to spend on a "harder" tier without also
growing accept% uncomfortably close to 100% (i.e., every deal becoming
essentially guaranteed rotate-required, which flattens the tier's texture).
Hard's difficulty now comes entirely from colour count (9, the most any
tier has shipped) and the tightened par window, not from tube depth. If a
future revision wants more move-count headroom at the top of the ladder
without reintroducing short colours, growing colour count further (C=10+)
is the only remaining axis — the frontier table above suggests it should
still be usable, since the K=3 row's accept%/solve% curve is the gentlest
of the three depths measured.

## 2026-07-24 — Revision 2: the pinned empty tumbler

> **Revised again.** The full-stack colour ladder above (6/8/9 colours,
> uniform deal, no pinned empty tube) shipped as v4 and is superseded by
> this revision. The CURRENT design pins one tube empty at deal time and
> rides colours 6/7/8. `puzzles.json` is now v5.

**Question:** the uniform deal above spreads a tier's whole slack budget
across every tube in the shuffle. Does that leave the OPENING move — the
very first decision a player makes — a real choice, or does spreading the
slack thin enough that most boards just start pre-solved into a forced
line?

**Short answer:** forced, badly. Measured across the 600 boards the v4
generator actually shipped (200/tier, 30 playouts/board doesn't even enter
into it — this is just counting legal first moves on the stored board),
the opening offered a MEDIAN of 2 legal pours, tier over tier:

| Tier | opening pours (median) | % boards opening at ≤1 pour | % boards opening at 0 pours (Rotate-only) |
|---|---|---|---|
| Easy (C6)   | 2 | **40%** | **12.5%** |
| Medium (C8) | 2 | **32.5%** | **7.5%** |
| Hard (C9)   | 2 | **38.5%** | **7%** |

Nearly four in ten easy boards, and roughly one in eight, opened with the
game already deciding the first move for the player. A mechanic whose
signature moment — move one — is usually not a choice at all undersells
itself before the player has done anything.

The fix is structural rather than another filter: pin exactly ONE tube
empty at deal time (this is not a new idea for this project — an earlier,
pre-colour-ramp version of the generator pinned an empty tube too, see the
top of this document — but it was dropped when the axis moved to colour
count, and this revision restores it deliberately). At cap 3, tubes =
colours+1, pinning one tube empty fully determines the rest of the deal:
slack equals cap exactly, so every other tube is dealt completely full.
Every full tube is unconditionally a legal pour into the one empty tube (a
stack pouring into empty space is never blocked by a colour mismatch), so
the opening becomes exactly C-way on every single board — measured 0% of
boards (any tier, any cap-3 colour count from 5 to 9, N=150 each) open at
≤1 pour, down from 32.5–40% under the spread deal. Opening variance goes
from "usually forced" to "exactly zero" by construction.

### The honest limitation: this is a move-0 fix, not a whole-game one

Pinning only touches the deal, so it only guarantees ONE thing: move zero.
By move one, mean branching under the pinned design has already dropped
back into the same range the old spread design occupied at that depth, and
from there on the two designs are statistically indistinguishable. Move-index
branching, pinned pipeline-realistic pools (C6/C7/C8, the shipped ladder)
against spread's old shipped pools (C6/C8/C9):

| move index | 0 | 1 | 2 | 3 | 5 | 10 |
|---|---|---|---|---|---|---|
| Spread easy (C6)   | 1.90 | 1.97 | 1.83 | 1.73 | 1.57 | 1.52 |
| Pinned easy (C6)   | 6.00 | 1.98 | 1.47 | 1.64 | 1.61 | 1.53 |
| Pinned medium (C7) | 7.00 | 1.98 | 1.44 | 1.67 | 1.57 | 1.45 |
| Spread medium (C8) | 2.07 | 1.87 | 1.72 | 1.68 | 1.52 | 1.43 |
| Pinned hard (C8)   | 8.00 | 2.04 | 1.45 | 1.66 | 1.55 | 1.44 |
| Spread hard (C9)   | 1.85 | 1.79 | 1.78 | 1.69 | 1.55 | 1.39 |

Move 0 is where pinning does all of its work (6/8/9 vs ~1.85–2.07 for
spread at the same slot). By move 1 pinned has already fallen to ~1.98–2.04
— the same neighbourhood spread's move-0/move-1 values occupy — and by
move 3 onward the two designs track within a couple hundredths of each
other. Pinning buys a guaranteed opening; it does not make the midgame or
endgame meaningfully more open than the design it replaces.

### Mid-game branching gets MORE forced as colour count grows — a second reason to step down

A separate finding from the same pipeline-realistic branching traces:
holding cap and pinning fixed, the share of positions with 3-or-more legal
pours (the "real choice, not just a fork" band) falls steadily as colour
count rises:

| colours | % positions with ≥3 legal pours |
|---|---|
| C5 | 16.2% |
| C6 | 15.2% |
| C7 | 12.2% |
| C8 | 9.1% |
| C9 | 7.7% |

More colours means more tubes to track but, per position, FEWER live
options — the same colour-count compounding the original study found for
forgiveness shows up in raw branching texture too. This is a second,
independent argument (alongside the forgiveness bar below) for keeping the
ladder's top end at 8 colours rather than 9: not only does C9 solve worse,
its mid-game is also the most forced of the five colour counts measured.

### The pinned quality table

Pipeline-realistic runs (deal → W2-solve → rotate-required filter → per-C
par window → 200 survivors, the exact `generate.mjs` pipeline) across the
full C5–C9 frontier at cap 3:

| colours | tubes | par (median) | pipeline-realistic persistent solve% |
|---|---|---|---|
| C5 | 6  | 11 | **94.5%** |
| C6 | 7  | 13 | **92.0%** |
| C7 | 8  | 16 | **86.8%** |
| C8 | 9  | 18 | **80.7%** |
| C9 | 10 | 21 | **79.1%** |

A larger, N=500 settle pass (board-clustered bootstrap, 5000 reps) confirms
C7 and C8 aren't sampling noise, and puts a number on how forced C9 really
is:

| colours | N | filtered persistent solve% | 95% CI |
|---|---|---|---|
| C7 | 500 (389 filtered) | 86.2% | [84.65, 87.79] |
| C8 | 500 (438 filtered) | 82.8% | [81.19, 84.41] |
| C9 | 500 (466 filtered) | 73.8% | [71.82, 75.68] |

(The N=500 pass reuses the same par windows as the 200-survivor pipeline
runs above, so C7/C8's point estimates move a hair between runs — 86.2%
vs. 86.8%, 82.8% vs. 80.7% — purely from independent-sample noise; both
runs agree C9 sits meaningfully lower, and its N=500 CI doesn't even
overlap 80%.)

### What pinning costs

Pinning is not free. Compared at the SAME colour count, the pinned deal
costs a handful of forgiveness points and a bit of extra par versus the old
uniform spread (spread numbers from this document's full-stack frontier
table above; pinned numbers from the pinned-empty frontier, both filtered
to the rotate-required subset):

| colours | spread filtered solve% | pinned filtered solve% | Δ forgiveness | spread filtered par (opt) | pinned filtered par (opt) | Δ par |
|---|---|---|---|---|---|---|
| C6 | 96.2% | 90.8% | −5.5pp | 12.1 | 13.3 | +1.2 |
| C7 | 92.8% | 88.9% | −3.9pp | 14.6 | 15.5 | +1.0 |
| C8 | 88.8% | 79.3% | −9.5pp | 17.1 | 18.2 | +1.1 |
| C9 | 84.0% | 75.2% | −8.8pp | 19.5 | 20.3 | +0.8 |

Pinning costs roughly **4–9 points of forgiveness** and **about one extra
move of par** versus spreading the same slack, at every colour count
measured. That's the price of guaranteeing a real opening on every board:
concentrating the slack into one tube instead of spreading it thin makes
the rest of the rack a hair less forgiving and a hair longer, on top of
whatever colour count alone already costs.

### The chosen ladder (implemented)

Colours 6 → 7 → 8, tubes = colours+1, cap 3 throughout, one pinned empty
tube per deal:

| Tier | colours | tubes | par window | par (median) | overall generator acceptance | pipeline-realistic persistent solve% |
|---|---|---|---|---|---|---|
| Easy   | 6 | 7 | [10, 16] | 13 | **62.9%** | **92.0%** |
| Medium | 7 | 8 | [13, 19] | 16 | **77.5%** | **86.8%** |
| Hard   | 8 | 9 | [15, 21] | 18 | **85.1%** | **80.7%** |

Every board on every tier: exactly one empty tube at deal time, every other
tube exactly full, every colour exactly a 3-stack, provably rotate-required
(exhaustive pour-only proof, never a budget guess), and — the headline
property this revision exists for — an opening that offers exactly as many
legal pours as the tier has colours, on every single board, no exceptions.

**Rejected: keeping hard at 9 colours.** The C9 cell was measured
side-by-side with C8 through every table above, and it loses on both axes
that matter for a flagship "hard" tier: its pipeline-realistic solve rate
(79.1%) sits just under the 80% forgiveness bar the ladder holds every
tier to (and the N=500 pass confirms this isn't noise — CI [71.82, 75.68]
on that run, comfortably below 80% either way), and its mid-game branching
profile (7.7% of positions with ≥3 legal pours) is the most forced of the
five colour counts measured — the worst of both worlds, not a trade worth
making for one more colour. Hard stops at 8.
