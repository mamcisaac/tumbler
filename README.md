# Tumbler

A colour-sort puzzle with a twist, for the [Connect the Thoughts](https://connectthethoughts.ca) arcade.

Pour the top colour from one urn to another to sort each urn into a single colour — but the catch is the **Rotate** button: it flips the whole rack 180° so the **bottom of every urn becomes the top**, the only way to reach colours buried at the bottom. Every pour *and* every rotate costs one move; solve in as few moves as you can.

Unlike the rest of the arcade, the daily is **replayable** — your *best* score is the one that counts, so you can keep trimming moves and climb the distribution. Undo/redo are unlimited, and the game subtly outlines possible moves by default — including when it's time to **Rotate** or **Restart** — with an off switch in "How to play".

## Difficulty tiers

Every day ships three boards, matching the arcade's easy→medium→hard run. Difficulty is a **colour ramp**: every tier is 3-deep, and each one climbs in colour count (with a tumbler added to match), laid out as a 2×N grid:

| Tier | Colours | Tumblers | Layout | Par (median) |
|---|---|---|---|---|
| Easy | 6 | 7 | 2×4−1 | ~13 |
| Medium | 8 | 9 | 2×5−1 | ~17 |
| Hard | 9 | 10 | 2×5 | ~20 |

Every colour is a **full stack** — dealt exactly tube-height (3 beads) — so there are no short colours: a solved tumbler is always exactly full. The only slack is the one spare tumbler's worth of empty space, which is shuffled across the whole rack rather than parked as one guaranteed-empty tumbler, so there's no free "spare" slot to lean on — which is why a solved rack always leaves exactly one empty tumbler. Solving a tier advances to the next; clearing all three completes the daily and chains to the next arcade game. Each tier keeps its own replayable best and leaderboard board, and the leaderboard also has a **Total** tab that ranks players by their combined moves across all three tiers (submitted once the day's run is complete). **Rotate is required on every board** — the generator only keeps boards proven unsolvable without it. The design studies behind these parameters are [`empty-tube-study.md`](./empty-tube-study.md) (the earlier depth-ramp design) and [`tier-ladder-study.md`](./tier-ladder-study.md) (the colour ramp).

## Structure (static, no build)
- `index.html` / `styles.css` — UI, vendored arcade chrome (`tokens.css`, `chrome.css`, `arcade-components.css`, `arcade-theme.js`).
- `engine.js` — core moves (pour / rotate / solved), shared by the game and the generator.
- `game.js` — board UI, move hints, difficulty tiers, scoring, the improvement leaderboard (Supabase `arcade_scores`), share.
- `puzzles.json` — daily puzzle pools (v4: `{ tiers: { easy, medium, hard } }`, one board per tier per day, by local date).
- `empty-tube-study.md` and `tier-ladder-study.md` — the simulations that fixed the tier parameters (depth-ramp and colour-ramp designs respectively).

## Regenerating puzzles
```
node generate.mjs [count] [seed]
```
`generate.mjs` deals each tier's beads uniformly across all its tumblers — spreading the slack across the deal rather than setting aside one empty tumbler — then runs `solver.js` to keep boards whose par lands in the tier's window **and** that are provably unsolvable without Rotate. Defaults: `count=200` boards per tier, fixed seed (reproducible pools).
