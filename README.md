# Tumbler

A colour-sort puzzle with a twist, for the [Connect the Thoughts](https://connectthethoughts.ca) arcade.

Pour the top colour from one urn to another to sort each urn into a single colour — but the catch is the **Rotate** button: it flips the whole rack 180° so the **bottom of every urn becomes the top**, the only way to reach colours buried at the bottom. Every pour *and* every rotate costs one move; solve in as few moves as you can.

Unlike the rest of the arcade, the daily is **replayable** — your *best* score is the one that counts, so you can keep trimming moves and climb the distribution.

## Difficulty tiers

Every day ships three boards, matching the arcade's easy→medium→hard run. Each one starts from a clean deal of **one empty tumbler** plus fully-full colour tubes, laid out as a 2×N grid:

| Tier | Colours | Tubes | Layout | Par (median) |
|---|---|---|---|---|
| Easy | 5 + 1 empty | 6 | 2×3 | ~15 |
| Medium | 7 + 1 empty | 8 | 2×4 | ~23 |
| Hard | 9 + 1 empty | 10 | 2×5 | ~31 |

Solving a tier advances to the next; clearing all three completes the daily and chains to the next arcade game. Each tier keeps its own replayable best and leaderboard board, and the leaderboard also has a **Total** tab that ranks players by their combined moves across all three tiers (submitted once the day's run is complete). Because the rack starts full, **Rotate is required on every board** — the generator only keeps boards proven unsolvable without it (hard requires ≥2 rotations). The design study behind these parameters is in [`empty-tube-study.md`](./empty-tube-study.md).

## Structure (static, no build)
- `index.html` / `styles.css` — UI, vendored arcade chrome (`tokens.css`, `chrome.css`, `arcade-components.css`, `arcade-theme.js`).
- `engine.js` — core moves (pour / rotate / solved), shared by the game and the generator.
- `game.js` — board UI, difficulty tiers, scoring, the improvement leaderboard (Supabase `arcade_scores`), share.
- `puzzles.json` — daily puzzle pools (v2: `{ tiers: { easy, medium, hard } }`, one board per tier per day, by local date).
- `empty-tube-study.md` / `empty-tube-study.mjs` — the simulations that fixed the tier parameters.

## Regenerating puzzles
```
node generate.mjs [count] [minRotHard]
```
`generate.mjs` deals each tier's beads uniformly into full tubes + one empty, then runs `solver.js` to keep boards whose par lands in the tier's window **and** that are provably unsolvable using fewer than the tier's required rotations. Defaults: `count=200` boards per tier, `minRotHard=2`.
