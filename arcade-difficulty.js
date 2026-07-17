(function () {
'use strict';
// ============================================================
// Shared difficulty selector (Easy / Medium / Hard, or any tier list).
//
// The arcade's daily games ship a fixed run of difficulty tiers. This factory
// owns the .diff-row / .diff-btn markup (styled in arcade-components.css) so a
// game needs no hardcoded buttons — it hands over a container plus its tier
// list and gets back a picker whose selection stays in sync with the game.
//
// A game opts in by:
//   1. giving it a container element (typically an empty .diff-row),
//   2. supplying difficulties (ordered ids) + onSelect(id),
//   3. optionally labels/subs for each id, and the current selection.
//
// The picker owns the active/aria-pressed state and skips onSelect when the
// already-active tier is re-tapped. When the game changes tier on its own
// (first-unsolved snap on daily entry, a results "next tier" jump), it calls
// picker.sync(id) to move the highlight without firing onSelect back.
// ============================================================

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
}[c]));

function createDifficulty(config) {
  const {
    container, difficulties, onSelect,
    labels = {}, subs = {}, current = (difficulties && difficulties[0]),
    ariaLabel = 'Difficulty',
  } = config;
  if (!container || !Array.isArray(difficulties) || !difficulties.length) {
    throw new Error('createDifficulty: container + difficulties are required');
  }

  let selected = difficulties.indexOf(current) >= 0 ? current : difficulties[0];

  // The container IS the row: keep it a role="group" .diff-row and fill it with
  // the tier buttons (idempotent — safe if the container already carries them).
  container.classList.add('diff-row');
  container.setAttribute('role', 'group');
  container.setAttribute('aria-label', ariaLabel);
  container.innerHTML = difficulties.map((d) => {
    const on = d === selected;
    const sub = subs[d] ? '<span class="diff-sub">' + esc(subs[d]) + '</span>' : '';
    return '<button class="diff-btn' + (on ? ' active' : '') + '" data-diff="' + esc(d) + '"' +
      ' type="button" aria-pressed="' + on + '">' + esc(labels[d] || d) + sub + '</button>';
  }).join('');

  function paint() {
    container.querySelectorAll('.diff-btn').forEach((b) => {
      const on = b.dataset.diff === selected;
      b.classList.toggle('active', on);
      b.setAttribute('aria-pressed', on);
    });
  }

  container.querySelectorAll('.diff-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      const d = btn.dataset.diff;
      if (d === selected) return;            // re-tapping the active tier is a no-op
      selected = d; paint();
      if (onSelect) onSelect(d);
    });
  });

  // Move the highlight to `d` WITHOUT firing onSelect (the game changed tier).
  function sync(d) {
    if (difficulties.indexOf(d) < 0 || d === selected) return;
    selected = d; paint();
  }

  return { sync, get current() { return selected; } };
}

window.ArcadeDifficulty = { createDifficulty };
})();
