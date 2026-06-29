/* ============================================================
   Connect the Thoughts — shared arcade behaviour
   Source of truth for theme bootstrap + persistence. Each game
   vendors this file (or its bundler-friendly equivalent) so
   theme preference is preserved when navigating between games
   AND when crossing from the launcher (a different origin) into
   any game.

   Usage:
     1. Add the pre-paint bootstrap inline in <head> (prevents flash).
        The URL-param read is what carries theme across origins.
        Default is DARK — system preference is ignored.
          <script>
            (function () {
              try {
                var url = new URLSearchParams(location.search).get('theme');
                if (url === 'dark' || url === 'light') {
                  localStorage.setItem('ctt.theme', url);
                }
              } catch (_) {}
              var s = localStorage.getItem('ctt.theme');
              document.documentElement.setAttribute('data-theme', s || 'dark');
            })();
          </script>
     2. Load this file after DOM ready (or with `defer`) to wire toggles
        and listen for system preference changes.
     3. Any element with id="themeToggle" or [data-arcade-theme-toggle]
        becomes a toggle. Style is up to the game.
     4. On the launcher (or any page with cross-origin outbound game links),
        mark each link with `data-arcade-pass-theme` (or use `a.game-card`)
        — this script will keep ?theme= up to date on those hrefs so the
        current theme carries to the destination on first paint.
   ============================================================ */

(function () {
    'use strict';

    var STORAGE_KEY = 'ctt.theme';
    var root = document.documentElement;

    function current() {
        return root.getAttribute('data-theme') === 'dark' ? 'dark' : 'light';
    }

    function setTheme(theme, persist) {
        root.setAttribute('data-theme', theme);
        if (persist !== false) {
            try { localStorage.setItem(STORAGE_KEY, theme); } catch (_) {}
        }
        document.querySelectorAll('[aria-pressed]').forEach(function (el) {
            if (el.id === 'themeToggle' || el.hasAttribute('data-arcade-theme-toggle')) {
                el.setAttribute('aria-pressed', theme === 'dark' ? 'true' : 'false');
            }
        });
        document.dispatchEvent(new CustomEvent('arcade:themechange', { detail: { theme: theme } }));
    }

    // ============================================================
    // Per-card visit tracking (launcher-only) + stats return-channel.
    // ============================================================
    //
    // The launcher and games live on different origins, so the launcher
    // can't read each game's localStorage directly. What the launcher
    // CAN do:
    //   1. Track its own click history — count + lastPlayed timestamp
    //      per game-card slug.
    //   2. Receive richer stats from a game via ?stats=<base64-json>
    //      when the user clicks "back to arcade" — games opt in by
    //      passing arcade.js's helper from their side.
    //
    // Both signals get merged into ctt.arcade.stats keyed by slug.
    var STATS_KEY = 'ctt.arcade.stats';

    function loadStats() {
        try {
            var raw = localStorage.getItem(STATS_KEY);
            return raw ? JSON.parse(raw) : {};
        } catch (_) { return {}; }
    }
    function saveStats(data) {
        try { localStorage.setItem(STATS_KEY, JSON.stringify(data)); } catch (_) {}
    }
    function slugFromUrl(href) {
        try {
            var u = new URL(href, location.href);
            // mamcisaac.github.io/turn-based-soccer/  → "turn-based-soccer"
            var m = u.pathname.match(/^\/([^\/]+)/);
            return m ? m[1].toLowerCase() : null;
        } catch (_) { return null; }
    }
    function recordClick(slug) {
        if (!slug) return;
        var s = loadStats();
        var entry = s[slug] || { clicks: 0, lastPlayed: 0 };
        entry.clicks += 1;
        entry.lastPlayed = Date.now();
        s[slug] = entry;
        saveStats(s);
        document.dispatchEvent(new CustomEvent('arcade:statsupdate', { detail: { slug: slug, stats: s } }));
    }

    // On launcher load, ingest any ?stats= sent back from a game.
    (function ingestReturnStats() {
        try {
            var raw = new URLSearchParams(location.search).get('stats');
            if (!raw) return;
            var payload = JSON.parse(atob(raw));
            if (!payload || typeof payload !== 'object') return;
            // Payload shape: { slug: "turn-based-soccer", best: 1234, wins: 3, ... }
            if (!payload.slug) return;
            var s = loadStats();
            var entry = s[payload.slug] || {};
            // Merge — favor latest values for known fields, preserve clicks/lastPlayed.
            Object.assign(entry, payload, {
                clicks: entry.clicks || 0,
                lastPlayed: entry.lastPlayed || 0
            });
            s[payload.slug] = entry;
            saveStats(s);
            // Strip the param so it doesn't persist in history.
            var url = new URL(location.href);
            url.searchParams.delete('stats');
            history.replaceState({}, '', url.toString());
        } catch (_) {}
    })();

    // Public stats API
    window.ArcadeStats = {
        get: loadStats,
        getSlug: function (slug) { return loadStats()[slug] || null; },
        clear: function () { try { localStorage.removeItem(STATS_KEY); } catch (_) {} },
        // For games: encode a stats payload and produce a return-URL fragment.
        encode: function (payload) {
            try { return '?stats=' + btoa(JSON.stringify(payload)); }
            catch (_) { return ''; }
        }
    };

    // Canonical arcade keyboard shortcuts — every game inherits these
    // when it vendors arcade.js. Games opt in by giving their help button
    // id="helpButton" (or [data-arcade-help]) and modal close buttons
    // [data-arcade-close] (or matching one of the common selectors below).
    //   ?, h, H  → click the help button (open / focus help modal)
    //   Escape   → click the topmost overlay's close
    function isTypingTarget(t) {
        if (!t || !t.tagName) return false;
        var tag = t.tagName;
        if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return true;
        return t.isContentEditable === true;
    }
    document.addEventListener('keydown', function (e) {
        if (e.defaultPrevented) return;
        if (isTypingTarget(e.target)) return;
        if (e.metaKey || e.ctrlKey || e.altKey) return;

        if (e.key === '?' || e.key === 'h' || e.key === 'H') {
            var help = document.querySelector('[data-arcade-help], #helpButton, #help-button');
            if (help) { help.click(); e.preventDefault(); }
            return;
        }
        if (e.key === 'Escape') {
            // Try a series of known overlay-close selectors. First match wins.
            var sels = [
                '[data-arcade-overlay]:not([hidden]):not(.hidden) [data-arcade-close]',
                '.overlay:not([hidden]):not(.hidden) [data-close]',
                '.overlay:not([hidden]):not(.hidden) .modal-close-x',
                '.overlay:not([hidden]):not(.hidden) [data-help-close]',
                '.modal-backdrop:not([hidden]):not(.hidden) [data-close]',
                '.modal-backdrop:not([hidden]):not(.hidden) .modal-close-x'
            ];
            for (var i = 0; i < sels.length; i++) {
                var btn = document.querySelector(sels[i]);
                if (btn) { btn.click(); e.preventDefault(); return; }
            }
        }
    });

    // Intercepted at click/auxclick time so we never depend on init() having
    // run successfully on first paint. Mutates the href just before the
    // browser follows it, so the destination receives ?theme=<current> and
    // can match the launcher's theme on first paint.
    function rewriteLinkOn(ev) {
        var a = ev.target && ev.target.closest && ev.target.closest('a.game-card, a[data-arcade-pass-theme]');
        if (!a || !a.href) return;
        try {
            var u = new URL(a.href, location.href);
            u.searchParams.set('theme', current());
            a.href = u.toString();
            // Also record the click for the launcher's "recently played" panel.
            if (a.classList.contains('game-card')) {
                recordClick(slugFromUrl(a.href));
            }
        } catch (_) {}
    }
    document.addEventListener('mousedown', rewriteLinkOn, true);
    document.addEventListener('keydown', function (e) {
        if (e.key === 'Enter' || e.key === ' ') rewriteLinkOn(e);
    }, true);
    document.addEventListener('touchstart', rewriteLinkOn, { capture: true, passive: true });

    // ============================================================
    // Launcher "recently played" enhancements
    // ============================================================
    // Cards with click history get a subtle visit-count badge in the title
    // row. The single most-recently-played card gets a small dot marker
    // (purely visual — first-time users see no difference). Card ORDER is
    // intentionally NOT shuffled — the launcher's curated grid keeps its
    // designed sequence; the dot + badge surface returning users' history
    // without disrupting the layout.
    // Format a stats entry's "headline" for a launcher card. Picks the most
    // interesting field the game sent and presents it humanly. Order tried:
    //   bestTimeFormatted (pre-formatted "0:42") → bestTime (ms) → bestScore
    //   → currentStreak / bestStreak → lastResult
    function formatStatsLine(entry) {
        if (!entry) return '';
        if (entry.bestTimeFormatted) return 'Best: ' + entry.bestTimeFormatted;
        if (typeof entry.bestTime === 'number') {
            var s = Math.max(0, entry.bestTime) / 1000;
            var m = Math.floor(s / 60), sec = Math.floor(s - m * 60);
            return 'Best: ' + m + ':' + String(sec).padStart(2, '0');
        }
        if (typeof entry.best === 'number') {
            // ms heuristic: if it's huge, it's a time. Otherwise a score.
            if (entry.best > 1000) {
                var s2 = Math.max(0, entry.best) / 1000;
                var m2 = Math.floor(s2 / 60), sec2 = Math.floor(s2 - m2 * 60);
                return 'Best: ' + m2 + ':' + String(sec2).padStart(2, '0');
            }
            return 'Best: ' + entry.best;
        }
        if (typeof entry.bestScore === 'number') return 'Best: ' + entry.bestScore;
        if (typeof entry.bestStreak === 'number' && entry.bestStreak > 0)
            return 'Best streak: ' + entry.bestStreak;
        if (typeof entry.currentStreak === 'number' && entry.currentStreak > 0)
            return entry.currentStreak + '-day streak';
        if (entry.lastResult) return 'Last: ' + entry.lastResult;
        return '';
    }

    function renderArcadeStats() {
        var stats = loadStats();
        var cards = document.querySelectorAll('a.game-card');
        var slugs = Array.from(cards).map(function (c) { return slugFromUrl(c.href); });
        // Find the most recent slug that exists in stats
        var mostRecent = null, mostRecentTime = 0;
        slugs.forEach(function (s) {
            var e = stats[s];
            if (e && e.lastPlayed > mostRecentTime) {
                mostRecentTime = e.lastPlayed;
                mostRecent = s;
            }
        });
        cards.forEach(function (card, i) {
            var slug = slugs[i];
            var entry = stats[slug];
            // Card titles are <h3> (under the <h2> group headings) — see index.html.
            var h2 = card.querySelector('.card-body h3');
            var body = card.querySelector('.card-body');
            if (!h2 || !body) return;
            // Ensure dot + badge nodes exist
            var dot = h2.querySelector('.card-last-played');
            if (!dot) {
                dot = document.createElement('span');
                dot.className = 'card-last-played';
                dot.setAttribute('aria-hidden', 'true');
                dot.title = 'Most recently played';
                h2.insertBefore(dot, h2.firstChild);
            }
            var badge = h2.querySelector('.card-visits');
            if (!badge) {
                badge = document.createElement('span');
                badge.className = 'card-visits';
                badge.setAttribute('aria-hidden', 'true');
                h2.appendChild(badge);
            }
            // Populate visit badge
            if (entry && entry.clicks > 0) {
                badge.textContent = entry.clicks === 1 ? '1 play' : entry.clicks + ' plays';
            } else {
                badge.textContent = '';
            }
            dot.classList.toggle('is-recent', slug === mostRecent);

            // Rich stats line — sits between the description and the CTA.
            var statLine = body.querySelector('.card-stat-line');
            var statText = formatStatsLine(entry);
            if (statText) {
                if (!statLine) {
                    statLine = document.createElement('span');
                    statLine.className = 'card-stat-line';
                    statLine.setAttribute('aria-hidden', 'true');
                    // Insert before the .card-cta if present, else at the end.
                    var cta = body.querySelector('.card-cta');
                    if (cta) body.insertBefore(statLine, cta);
                    else body.appendChild(statLine);
                }
                statLine.textContent = statText;
            } else if (statLine) {
                statLine.remove();
            }
        });
    }

    // -------- Stats modal (launcher) --------
    // Lazy-render the per-game summary inside #statsModal when it opens.
    // Card data (name, tagline, tone, url) is read from the live DOM so a
    // future game appears here automatically once it's in the launcher.
    function statsModalEl() { return document.getElementById('statsModal'); }
    function openStatsModal() {
        var m = statsModalEl();
        if (!m) return;
        renderStatsModal();
        m.hidden = false;
    }
    function closeStatsModal() {
        var m = statsModalEl();
        if (m) m.hidden = true;
    }
    function describeStats(entry) {
        if (!entry) return '<span class="stats-row-detail">Never played</span>';
        var pills = [];
        if (typeof entry.best === 'number') {
            if (entry.best > 1000) {
                // Heuristic: ms duration → format as time
                var s = Math.max(0, entry.best) / 1000;
                var m = Math.floor(s / 60), sec = Math.floor(s - m * 60);
                pills.push('Best ' + m + ':' + String(sec).padStart(2, '0'));
            } else {
                pills.push('Best ' + entry.best);
            }
        }
        if (typeof entry.bestScore === 'number') pills.push('Best ' + entry.bestScore);
        if (typeof entry.bestTime === 'number') {
            var s2 = Math.max(0, entry.bestTime) / 1000;
            var m2 = Math.floor(s2 / 60), sec2 = Math.floor(s2 - m2 * 60);
            pills.push('Best ' + m2 + ':' + String(sec2).padStart(2, '0'));
        }
        if (typeof entry.bestStreak === 'number' && entry.bestStreak > 0)
            pills.push('Streak ' + entry.bestStreak);
        if (entry.lastResult) pills.push('Last: ' + entry.lastResult);
        if (entry.lastPlayed) {
            var ago = Math.floor((Date.now() - entry.lastPlayed) / 60000);
            var when = ago < 1 ? 'just now'
                     : ago < 60 ? ago + ' min ago'
                     : ago < 1440 ? Math.floor(ago / 60) + ' hr ago'
                     : Math.floor(ago / 1440) + ' day' + (Math.floor(ago / 1440) === 1 ? '' : 's') + ' ago';
            pills.push('Played ' + when);
        }
        return pills.map(function (p) { return '<span class="stat-pill">' + p + '</span>'; }).join('');
    }
    function renderStatsModal() {
        var body = document.getElementById('statsModalBody');
        if (!body) return;
        var stats = loadStats();
        var cards = Array.from(document.querySelectorAll('a.game-card'));
        var anyPlayed = cards.some(function (c) {
            var s = stats[slugFromUrl(c.href)];
            return s && (s.clicks > 0 || s.lastPlayed > 0);
        });
        if (!anyPlayed) {
            body.innerHTML = '<div class="stats-modal-empty">No plays yet — pick a card and dive in.<br>Your records will land here.</div>';
            return;
        }
        // Sort: most-recently-played first, then never-played at the bottom.
        var rows = cards.map(function (card) {
            var slug = slugFromUrl(card.href);
            var entry = stats[slug];
            var name = (card.querySelector('.card-body h3') || {}).textContent || slug || 'Unknown';
            // Strip the visit-count badge text + the most-recent dot.
            name = name.replace(/\d+\s*plays?/gi, '').trim();
            var tone = card.getAttribute('data-tone') || '';
            var url = card.href.split('?')[0];
            var sortKey = entry && entry.lastPlayed ? entry.lastPlayed : 0;
            var plays = entry && entry.clicks ? entry.clicks : 0;
            return {
                slug: slug, name: name, tone: tone, url: url, entry: entry,
                sortKey: sortKey, plays: plays
            };
        });
        rows.sort(function (a, b) { return b.sortKey - a.sortKey; });
        body.innerHTML = rows.map(function (r) {
            return '<div class="stats-row" data-tone="' + r.tone + '">' +
                   '<span class="stats-row-name"><a href="' + r.url + '">' + r.name + '</a></span>' +
                   '<span class="stats-row-detail">' + describeStats(r.entry) + '</span>' +
                   '<span class="stats-row-plays">' + r.plays +
                     '<small>' + (r.plays === 1 ? 'play' : 'plays') + '</small>' +
                   '</span>' +
                   '</div>';
        }).join('');
    }
    function resetAllStats() {
        if (!confirm('Reset all arcade play counts and stats? This affects only what the launcher shows; each game keeps its own records.')) return;
        try { localStorage.removeItem(STATS_KEY); } catch (_) {}
        renderArcadeStats();
        renderStatsModal();
    }

    function init() {
        renderArcadeStats();
        document.addEventListener('arcade:statsupdate', renderArcadeStats);

        // Stats modal wiring
        var statsBtn = document.getElementById('statsButton');
        if (statsBtn) statsBtn.addEventListener('click', openStatsModal);
        var modal = statsModalEl();
        if (modal) {
            modal.addEventListener('click', function (e) {
                if (e.target === modal) closeStatsModal();
                var closeBtn = e.target.closest && e.target.closest('[data-arcade-close]');
                if (closeBtn) closeStatsModal();
            });
        }
        var resetBtn = document.getElementById('statsResetButton');
        if (resetBtn) resetBtn.addEventListener('click', resetAllStats);

        // First-visit welcome ribbon — auto-show once, then hidden forever
        // via localStorage["ctt.welcomeSeen"]. Dismiss button persists the
        // flag immediately so a quick reload doesn't show it again.
        var ribbon = document.getElementById('welcomeRibbon');
        var dismissBtn = document.getElementById('welcomeRibbonDismiss');
        if (ribbon && dismissBtn) {
            try {
                if (!localStorage.getItem('ctt.welcomeSeen')) {
                    ribbon.hidden = false;
                }
            } catch (_) {}
            dismissBtn.addEventListener('click', function () {
                ribbon.hidden = true;
                try { localStorage.setItem('ctt.welcomeSeen', '1'); } catch (_) {}
            });
        }

        var toggles = document.querySelectorAll('#themeToggle, [data-arcade-theme-toggle]');
        toggles.forEach(function (t) {
            t.setAttribute('aria-pressed', current() === 'dark' ? 'true' : 'false');
            t.addEventListener('click', function () {
                setTheme(current() === 'dark' ? 'light' : 'dark');
            });
        });

        // System-preference auto-tracking deliberately removed — the arcade
        // defaults to dark regardless of the user's OS setting. The toggle
        // is the only way to override; their choice persists in
        // localStorage["ctt.theme"].
    }

    // Expose for game code that wants programmatic access
    window.Arcade = {
        getTheme: current,
        setTheme: function (t) { setTheme(t === 'dark' ? 'dark' : 'light'); }
    };

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();
