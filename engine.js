/* Tumbler — core engine (shared by the game UI and the Node generator).
 *
 * State model:
 *   board = array of tubes; each tube = array of color ints, BOTTOM -> TOP.
 *   K     = capacity (max balls per tube). Empty slots are implicit at the open
 *           (top) end, i.e. a tube with fewer than K balls has room.
 *
 * Moves (each costs one move in scoring):
 *   pour(board, i, j, K)  — move the top same-colour run from tube i to tube j
 *                           (as many as fit). Returns a NEW board or null if illegal.
 *   rotate(board)         — 180° board flip: reverse every tube at once (the old
 *                           bottom becomes the new top). Global; its own inverse.
 */
(function (root, factory) {
  const api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (root) root.TumblerEngine = api;
})(typeof window !== 'undefined' ? window : (typeof globalThis !== 'undefined' ? globalThis : this), function () {

  function clone(board) { return board.map(function (t) { return t.slice(); }); }

  function topRun(tube) {
    if (tube.length === 0) return { color: -1, len: 0 };
    const c = tube[tube.length - 1];
    let n = 1;
    for (let i = tube.length - 2; i >= 0 && tube[i] === c; i--) n++;
    return { color: c, len: n };
  }

  // Is pouring i -> j legal? Returns the number of balls that would move (0 = illegal).
  function pourCount(board, i, j, K) {
    if (i === j) return 0;
    const ti = board[i], tj = board[j];
    if (ti.length === 0) return 0;
    const room = K - tj.length;
    if (room <= 0) return 0;
    const run = topRun(ti);
    if (tj.length > 0 && tj[tj.length - 1] !== run.color) return 0;
    return Math.min(run.len, room);
  }

  function pour(board, i, j, K) {
    const n = pourCount(board, i, j, K);
    if (n === 0) return null;
    const nb = clone(board);
    const color = nb[i][nb[i].length - 1];
    nb[i].length -= n;
    for (let k = 0; k < n; k++) nb[j].push(color);
    return nb;
  }

  function rotate(board) {
    return board.map(function (t) { const r = t.slice(); r.reverse(); return r; });
  }

  // Solved when every non-empty tube is a single colour and no colour is split.
  function solved(board) {
    const seen = {};
    for (const t of board) {
      if (t.length === 0) continue;
      const c = t[0];
      for (let i = 1; i < t.length; i++) if (t[i] !== c) return false;
      if (seen[c]) return false;
      seen[c] = true;
    }
    return true;
  }

  // A "useful" pour is one that isn't pointlessly shuffling: skip pouring a tube
  // that is already a complete single colour into an empty tube, and skip pours
  // that just split a run across two tubes for no reason (kept lenient for play).
  function legalPours(board, K, opts) {
    opts = opts || {};
    const out = [];
    for (let i = 0; i < board.length; i++) {
      if (board[i].length === 0) continue;
      const run = topRun(board[i]);
      // tube already a finished single colour -> never worth disturbing (solver only)
      const wholeMono = run.len === board[i].length;
      for (let j = 0; j < board.length; j++) {
        if (i === j) continue;
        const n = pourCount(board, i, j, K);
        if (n === 0) continue;
        if (opts.prune) {
          if (wholeMono && board[j].length === 0) continue;      // mono->empty: no progress
          if (n === run.len && board[j].length === 0 && run.len === board[i].length) continue;
        }
        out.push({ type: 'pour', i: i, j: j, n: n });
      }
    }
    return out;
  }

  function key(board) {
    // Orientation-agnostic-ish canonical key: sort tube strings so tube order
    // doesn't multiply the state space. (Rotation is handled as an explicit move.)
    return board.map(function (t) { return t.join(','); }).sort().join('|');
  }

  function applyMove(board, mv, K) {
    if (mv.type === 'rotate') return rotate(board);
    return pour(board, mv.i, mv.j, K);
  }

  function colorsOf(board) {
    const s = {};
    for (const t of board) for (const c of t) s[c] = true;
    return Object.keys(s).map(Number);
  }

  return {
    clone: clone, topRun: topRun, pourCount: pourCount, pour: pour, rotate: rotate,
    solved: solved, legalPours: legalPours, key: key, applyMove: applyMove, colorsOf: colorsOf
  };
});
