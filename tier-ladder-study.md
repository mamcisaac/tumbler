# Design study: the colour-ramp tier ladder

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
