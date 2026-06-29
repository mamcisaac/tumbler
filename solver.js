/* Tumbler — solver. Weighted A* over pour + rotate moves. Used by the generator
 * to (a) confirm a board is solvable and (b) estimate "par" (a strong solution
 * length). Not guaranteed optimal — par is an upper bound that the leaderboard's
 * crowd "global best" can beat, exactly like the reference game. */
(function (root, factory) {
  const api = factory(typeof require === 'function' ? require('./engine.js') : root.TumblerEngine);
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (root) root.TumblerSolver = api;
})(typeof window !== 'undefined' ? window : (typeof globalThis !== 'undefined' ? globalThis : this), function (E) {

  // Min-heap keyed by f.
  function Heap() { this.a = []; }
  Heap.prototype.push = function (f, item) {
    const a = this.a; a.push([f, item]); let i = a.length - 1;
    while (i > 0) { const p = (i - 1) >> 1; if (a[p][0] <= a[i][0]) break; const t = a[p]; a[p] = a[i]; a[i] = t; i = p; }
  };
  Heap.prototype.pop = function () {
    const a = this.a; if (a.length === 0) return null;
    const top = a[0], last = a.pop();
    if (a.length) { a[0] = last; let i = 0; const n = a.length;
      while (true) { let l = 2 * i + 1, r = l + 1, s = i;
        if (l < n && a[l][0] < a[s][0]) s = l;
        if (r < n && a[r][0] < a[s][0]) s = r;
        if (s === i) break; const t = a[s]; a[s] = a[i]; a[i] = t; i = s; } }
    return top[1];
  };
  Heap.prototype.size = function () { return this.a.length; };

  function heuristic(board) {
    let breaks = 0;
    const colorTubes = {};
    let nonEmpty = 0;
    for (const t of board) {
      if (t.length === 0) continue;
      nonEmpty++;
      const seen = {};
      for (let i = 0; i < t.length; i++) {
        if (i > 0 && t[i] !== t[i - 1]) breaks++;
        seen[t[i]] = true;
      }
      for (const c in seen) colorTubes[c] = (colorTubes[c] || 0) + 1;
    }
    let merges = 0;
    for (const c in colorTubes) merges += colorTubes[c] - 1;
    return breaks + merges;
  }

  // Returns { moves: [...], length } or null. W>1 trades optimality for speed.
  function solve(startBoard, K, opts) {
    opts = opts || {};
    const W = opts.weight || 2;
    const cap = opts.nodeCap || 400000;
    if (E.solved(startBoard)) return { moves: [], length: 0 };

    const heap = new Heap();
    const gMap = new Map();
    const parent = new Map();      // key -> { pkey, move }
    const boards = new Map();      // key -> board (for reconstruction & expansion)

    const sKey = E.key(startBoard);
    gMap.set(sKey, 0); boards.set(sKey, startBoard);
    heap.push(W * heuristic(startBoard), { key: sKey, lastRotate: false });

    let nodes = 0;
    while (heap.size()) {
      const cur = heap.pop();
      nodes++;
      if (nodes > cap) return null;
      const board = boards.get(cur.key);
      const g = gMap.get(cur.key);

      // generate neighbours
      const moves = E.legalPours(board, K, { prune: true });
      // rotate (skip if we just rotated — it's an involution)
      if (!cur.lastRotate) moves.push({ type: 'rotate' });

      for (const mv of moves) {
        const nb = E.applyMove(board, mv, K);
        if (!nb) continue;
        const nk = E.key(nb);
        const ng = g + 1;
        if (gMap.has(nk) && gMap.get(nk) <= ng) continue;
        gMap.set(nk, ng);
        boards.set(nk, nb);
        parent.set(nk, { pkey: cur.key, move: mv });
        if (E.solved(nb)) {
          // reconstruct
          const path = [];
          let k = nk;
          while (parent.has(k)) { const p = parent.get(k); path.push(p.move); k = p.pkey; }
          path.reverse();
          return { moves: path, length: path.length };
        }
        heap.push(ng + W * heuristic(nb), { key: nk, lastRotate: mv.type === 'rotate' });
      }
    }
    return null;
  }

  return { solve: solve, heuristic: heuristic };
});
