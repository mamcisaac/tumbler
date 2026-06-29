# Tumbler

A colour-sort puzzle with a twist, for the [Connect the Thoughts](https://connectthethoughts.ca) arcade.

Pour the top colour from one urn to another to sort each urn into a single colour — but the catch is the **Rotate** button: it flips the whole rack 180° so the **bottom of every urn becomes the top**, the only way to reach colours buried at the bottom. Every pour *and* every rotate costs one move; solve in as few moves as you can.

Unlike the rest of the arcade, the daily is **replayable** — your *best* score is the one that counts, so you can keep trimming moves and climb the distribution.

## Structure (static, no build)
- `index.html` / `styles.css` — UI, vendored arcade chrome (`tokens.css`, `chrome.css`, `arcade-components.css`, `arcade.js`).
- `engine.js` — core moves (pour / rotate / solved), shared by the game and the generator.
- `game.js` — board UI, scoring, the improvement leaderboard (Supabase `arcade_scores`), share.
- `puzzles.json` — daily puzzle pool (one per day, by UTC date).

## Regenerating puzzles
```
node generate.mjs [count] [colors] [empty] [scramble] [minPar] [maxPar]
```
`generate.mjs` reverse-scrambles from a solved board (so every puzzle is solvable), then runs `solver.js` to confirm a strong solution and keep boards whose par lands in the target window and that genuinely use a rotation. Default config (`8 1 …`) yields ~30-move boards on a phone-friendly 3×3 rack.
