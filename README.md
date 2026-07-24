# Tumbler

A colour-sort puzzle with a twist, for the [Connect the Thoughts](https://connectthethoughts.ca) arcade.

Pour the top colour from one urn to another to sort each urn into a single colour — but the catch is the **Rotate** button: it flips the whole rack 180° so the **bottom of every urn becomes the top**, the only way to reach colours buried at the bottom. Every pour *and* every rotate costs one move; solve in as few moves as you can.

Unlike the rest of the arcade, the daily is **replayable** — your *best* score is the one that counts, so you can keep trimming moves and climb the distribution. Undo/redo are unlimited, and the game subtly outlines possible moves by default — including when it's time to **Rotate** or **Restart** — with an off switch in "How to play".

## Difficulty tiers

Every day ships three boards, matching the arcade's easy→medium→hard run. Difficulty is a **colour ramp**: each tier climbs in colour count (and grows a little taller too), laid out as a 2×N grid:

| Tier | Colours | Tumblers | Layout | Par (median) |
|---|---|---|---|---|
| Easy | 6 | 7 | 2×4−1 | ~13 |
| Medium | 7 | 8 | 2×4 | ~20 |
| Hard | 8 | 9 | 2×5−1 | ~28 |

Each board's beads are dealt with **spread slack**, not a guaranteed empty tumbler: the free space is shuffled across the whole rack, and on Medium and Hard a few colours land one bead short of a full stack (which colours come up short varies board to board). Solving a tier advances to the next; clearing all three completes the daily and chains to the next arcade game. Each tier keeps its own replayable best and leaderboard board, and the leaderboard also has a **Total** tab that ranks players by their combined moves across all three tiers (submitted once the day's run is complete). **Rotate is required on every board** — the generator only keeps boards proven unsolvable without it. The design studies behind these parameters are [`empty-tube-study.md`](./empty-tube-study.md) (the earlier depth-ramp design) and [`tier-ladder-study.md`](./tier-ladder-study.md) (the colour ramp).

## Structure (static, no build)
- `index.html` / `styles.css` — UI, vendored arcade chrome (`tokens.css`, `chrome.css`, `arcade-components.css`, `arcade-theme.js`).
- `engine.js` — core moves (pour / rotate / solved), shared by the game and the generator.
- `game.js` — board UI, move hints, difficulty tiers, scoring, the improvement leaderboard (Supabase `arcade_scores`), share.
- `puzzles.json` — daily puzzle pools (v3: `{ tiers: { easy, medium, hard } }`, one board per tier per day, by local date).
- `empty-tube-study.md` and `tier-ladder-study.md` — the simulations that fixed the tier parameters (depth-ramp and colour-ramp designs respectively).

## Regenerating puzzles
```
node generate.mjs [count] [seed]
```
`generate.mjs` deals each tier's beads uniformly across all its tumblers — spreading the slack across the deal rather than setting aside one empty tumbler, with Medium/Hard drawing a few colours one bead short — then runs `solver.js` to keep boards whose par lands in the tier's window **and** that are provably unsolvable without Rotate. Defaults: `count=200` boards per tier, fixed seed (reproducible pools).
