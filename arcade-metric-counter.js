(function () {
'use strict';
// Connect the Thoughts — shared live metric counter.
//
// One component for every in-play "ranked metric" readout (the number the
// game's leaderboard ranks by, shown live while you play). Three kinds:
//
//   'tally'  — counts up from 0, no target (ctt mistakes, tumbler moves).
//              Optional `clean` predicate marks the flawless-so-far state
//              (rendered with the is-match "satisfied" green — same semantics).
//   'exact'  — current / target that must MATCH exactly (switchback cells,
//              turns). under = warn "N to go", match = good "matches",
//              over = bad "N over".
//   'budget' — current / target where at-or-under is fine and only overshoot
//              is flagged (mosaic moves vs optimal). under = neutral,
//              match = good, over = bad "N over".
//
// Renders the standard `.con` markup (arcade-components.css) into `mount`,
// or adopts a game-skinned DOM via `els` (the game keeps its own typography;
// this module still owns the text + state classes so the LOGIC is shared).
//
//   const c = createMetricCounter({ mount, label: 'Mistakes', kind: 'tally',
//                                   clean: (n) => n === 0 });
//   c.set(3);            // → "3", classes updated
//   c.setTarget(8);      // exact/budget kinds; re-renders
//
// Not this component: countdown budgets of a NON-ranked resource (word-crush
// moves-left) and history chips (ladder guesses) — different primitives.

// Pure tri-state: where `now` stands against `target`.
function metricState(now, target) {
  if (now < target) return 'under';
  if (now === target) return 'match';
  return 'over';
}

const STATE_CLASSES = ['is-under', 'is-match', 'is-over'];

const DEFAULT_NOTES = {
  exact: {
    under: (now, target) => (target - now) + ' to go',
    match: () => 'matches',
    over: (now, target) => (now - target) + ' over',
  },
  budget: {
    under: () => '',
    match: () => 'at target',
    over: (now, target) => (now - target) + ' over',
  },
};

function createMetricCounter(opts) {
  const kind = opts.kind || 'tally';
  const notes = Object.assign({}, DEFAULT_NOTES[kind], opts.notes || {});
  let target = opts.target != null ? opts.target : null;

  let root, valueEl, noteEl;
  if (opts.els) {
    // Adopt game-skinned DOM: the game owns markup/CSS, we own text + classes.
    root = opts.els.root;
    valueEl = opts.els.value;
    noteEl = opts.els.note || null;
  } else {
    root = opts.mount;
    root.classList.add('con');
    root.setAttribute('aria-live', 'polite');
    root.innerHTML =
      '<span class="con-label"></span>' +
      '<span class="con-value"></span>' +
      '<span class="con-note"></span>';
    root.querySelector('.con-label').textContent = opts.label || '';
    valueEl = root.querySelector('.con-value');
    noteEl = root.querySelector('.con-note');
  }

  function set(now, newTarget) {
    if (newTarget != null) target = newTarget;
    const fmt = opts.format;
    valueEl.textContent = fmt
      ? fmt(now, target)
      : (kind === 'tally' || target == null ? String(now) : now + ' / ' + target);

    STATE_CLASSES.forEach((c) => root.classList.remove(c));
    let noteText = '';
    if (kind === 'tally') {
      // Flawless-so-far = the "satisfied" tri-state (green), no new CSS state.
      if (opts.clean && opts.clean(now)) root.classList.add('is-match');
    } else if (target != null) {
      const st = metricState(now, target);
      // Budget: being under is normal-in-progress — no state class, no colour.
      if (!(kind === 'budget' && st === 'under')) root.classList.add('is-' + st);
      const note = notes[st];
      noteText = typeof note === 'function' ? note(now, target) : (note || '');
    }
    if (noteEl) noteEl.textContent = noteText;
    return set; // chainable-ish; also handy in tests
  }

  return { set, setTarget: (t) => { target = t; }, el: root, metricState };
}


window.ArcadeMetricCounter = { metricState, createMetricCounter };
})();
