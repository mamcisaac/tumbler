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

    // ============================================================
    // Global leaderboard summary (launcher-only)
    // ============================================================
    // The personal click-count and the games' ?stats= "best score" payloads
    // are NOT meaningful here — raw scores only drive stars, and leaders are
    // decided by timing. So the launcher reads the SHARED leaderboard
    // (Supabase arcade_scores, anon/CORS-open — same project the games use) to
    // show, per card:
    //   • plays    — total recorded daily plays across ALL players
    //   • champion — the #1 handle on that game's most recent daily board
    //
    // One request per game. The "play board" is the per-day ranking board,
    // which differs by game scheme:
    //   tiered games  → "<date>|total" (sum of times to 3-star all 3 levels)
    //   single-board  → "<date>|daily"
    //   tumbler-style → "<date>" (bare)
    // The filter (dated board, NOT a per-difficulty easy/medium/hard board)
    // selects exactly that one board family for every game, so the same query
    // works everywhere. Results cache in localStorage with a short TTL so
    // reloads paint instantly and don't re-hit the network.
    var SUPA_URL = 'https://xqhotrcucqcwzzrfwfrf.supabase.co';
    var SUPA_KEY = 'sb_publishable_h2aOj3WG-yMJFZGlzhEuVA_3Tfaln2Q';
    var LB_KEY = 'ctt.arcade.lb';
    var LB_TTL = 5 * 60 * 1000; // 5 min
    var lbSummaries = {};       // slug -> { plays, leaders:[{handle}] }
    var MEDALS = ['🥇', '🥈', '🥉'];

    // QA / migration handles that must never surface as a leader or inflate the
    // public play count. These rows are also being purged from the DB; this is a
    // belt-and-suspenders guard so leftover (or future) test data never shows on
    // a card. The explicit map covers the known handles; the /test|preview/
    // fallback catches future QA names. Real handles (incl. auto-generated guest
    // names like "calm_finch") contain neither substring, so no false positives.
    var TEST_HANDLES = {
        'tester': 1, 'previewtest': 1, 'previewbot': 1, 'testbot': 1, 'testplayer': 1,
        'migratetest': 1, 'cttmigrate': 1, 'test_otter': 1, 'setup-bot': 1, 'timetest': 1,
        '__time_test__': 1, '__wc_time_test__': 1
    };
    function isTestHandle(h) {
        h = String(h || '').trim().toLowerCase();
        // Explicit map covers every known QA handle; the anchored regex catches
        // future ones. Anchored at the start ON PURPOSE — a bare /test/ substring
        // would also hide real superlative handles (Fastest, Greatest, Smartest…).
        return !!TEST_HANDLES[h] || /^(test|preview)/.test(h);
    }

    function loadLbCache() {
        try { return JSON.parse(localStorage.getItem(LB_KEY)) || {}; }
        catch (_) { return {}; }
    }
    function saveLbCache(data) {
        try { localStorage.setItem(LB_KEY, JSON.stringify(data)); } catch (_) {}
    }
    // UTC day-number from a board's date component. The date can sit on either
    // side of the "|": most games key "<date>|<diff>" (e.g. "2026-6-30|total"),
    // but some put it last (e.g. tumbler's "d1|2026-6-30"). Find it positionally.
    function boardDayNum(board) {
        var m = String(board).match(/(\d{4})-(\d{1,2})-(\d{1,2})/);
        if (!m) return -1;
        return Math.floor(Date.UTC(+m[1], +m[2] - 1, +m[3]) / 86400000);
    }
    function fetchGameSummary(slug) {
        // Boards carrying a calendar date (year "20xx-…" anywhere — covers both
        // "<date>|<diff>" and "<level>|<date>" layouts), minus the per-difficulty
        // component boards, so we land on each game's per-day ranking board:
        // tiered → "<date>|total", single-board → "<date>|daily", tumbler →
        // "d1|<date>", bare → "<date>". Excludes alltime (no date) and test boards.
        // Test/QA handles are excluded SERVER-SIDE so the Content-Range play
        // count is exact — old test rows sit outside the fetched page, so a
        // client-side subtraction can't see (or subtract) them. The prefix
        // filters mirror isTestHandle's regex; the not.in list carries the
        // known mid-string QA handles exactly as stored (case-sensitive).
        var q = 'game=eq.' + encodeURIComponent(slug) +
                '&board=match.20%5B0-9%5D%5B0-9%5D-' +
                '&board=not.ilike.*easy*&board=not.ilike.*medium*&board=not.ilike.*hard*' +
                '&handle=not.ilike.test*&handle=not.ilike.preview*' +
                '&handle=not.in.(MigrateTest,CttMigrate,setup-bot,timetest,__time_test__,__wc_time_test__)' +
                '&select=board,handle,score,created_at&order=created_at.desc&limit=300';
        return fetch(SUPA_URL + '/rest/v1/arcade_scores?' + q, {
            headers: {
                apikey: SUPA_KEY,
                Authorization: 'Bearer ' + SUPA_KEY,
                Prefer: 'count=exact'
            }
        }).then(function (res) {
            if (!res.ok) return null;
            // Content-Range "0-79/<total>" carries the full play count even
            // though we only pulled the most-recent page of rows.
            var total = 0;
            var cr = res.headers.get('content-range');
            if (cr && cr.indexOf('/') > -1) total = parseInt(cr.split('/')[1], 10) || 0;
            return res.json().then(function (rows) {
                if (!Array.isArray(rows)) rows = [];
                // Drop test/QA rows so they neither win nor count. (These rows
                // are few and recent, so the most-recent page reliably contains
                // them — close enough for a guard ahead of the DB purge.)
                // The server filters already excluded test rows from the count;
                // subtract any residue the client-side guard still catches (a
                // future denylist entry not yet mirrored into the query).
                var testInPage = rows.filter(function (r) { return isTestHandle(r.handle); }).length;
                var plays = Math.max(0, total - testInPage);
                // Reigning top 3 UNIQUE players. Group non-test rows by UTC day,
                // keep each handle's best (lowest = most stars, then fastest)
                // score per day, then walk days newest→oldest collecting unique
                // handles until we have 3. So today's leaders rank first; earlier
                // days only backfill remaining slots when a day is sparse.
                var byDay = {};
                rows.forEach(function (r) {
                    if (isTestHandle(r.handle) || typeof r.score !== 'number') return;
                    var d = boardDayNum(r.board); if (d < 0) return;
                    var key = r.handle.trim().toLowerCase();
                    if (!byDay[d]) byDay[d] = {};
                    var cur = byDay[d][key];
                    // Keep the handle's best; on equal scores keep the EARLIER
                    // submission (first to post a score outranks later ties —
                    // same rule the in-game boards use).
                    if (!cur || r.score < cur.score ||
                        (r.score === cur.score && r.created_at < cur.at)) {
                        byDay[d][key] = { handle: r.handle, score: r.score, at: r.created_at };
                    }
                });
                var days = Object.keys(byDay).map(Number).sort(function (a, b) { return b - a; });
                var leaders = [], seen = {};
                for (var i = 0; i < days.length && leaders.length < 3; i++) {
                    var entries = Object.keys(byDay[days[i]]).map(function (k) { return byDay[days[i]][k]; });
                    entries.sort(function (a, b) {
                        return (a.score - b.score) ||
                               (a.at < b.at ? -1 : a.at > b.at ? 1 : 0);
                    });
                    for (var j = 0; j < entries.length && leaders.length < 3; j++) {
                        var hk = entries[j].handle.trim().toLowerCase();
                        if (seen[hk]) continue;
                        seen[hk] = 1;
                        leaders.push({ handle: entries[j].handle });
                    }
                }
                return { plays: plays, leaders: leaders };
            });
        }).catch(function () { return null; });
    }
    // Refresh every launcher card's summary (parallel), honoring the TTL cache.
    function refreshSummaries() {
        var cards = Array.from(document.querySelectorAll('a.game-card'));
        var slugs = cards.map(function (c) { return slugFromUrl(c.href); })
                         .filter(function (s, i, a) { return s && a.indexOf(s) === i; });
        var cache = loadLbCache();
        var now = Date.now();
        // Seed from cache so we can paint immediately.
        slugs.forEach(function (s) { if (cache[s]) lbSummaries[s] = cache[s]; });
        renderArcadeStats();
        slugs.forEach(function (slug) {
            var c = cache[slug];
            // Require `leaders` in the freshness check so a cache written by an
            // older (champion-shaped) build is treated as stale and refetched
            // instead of leaving cards blank until the TTL expires.
            if (c && c.leaders && (now - (c.ts || 0)) < LB_TTL) return; // still fresh
            fetchGameSummary(slug).then(function (summary) {
                if (!summary) return;
                lbSummaries[slug] = summary;
                summary.ts = now;
                cache[slug] = summary;
                saveLbCache(cache);
                renderArcadeStats();
                renderStatsModal();
            });
        });
    }

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
        } catch (_) {}
    }
    document.addEventListener('mousedown', rewriteLinkOn, true);
    document.addEventListener('keydown', function (e) {
        if (e.key === 'Enter' || e.key === ' ') rewriteLinkOn(e);
    }, true);
    document.addEventListener('touchstart', rewriteLinkOn, { capture: true, passive: true });

    // Record a play only on a real activation (click), NOT touchstart — touchstart
    // fires the moment a scroll begins on a card, so scrolling would count as a play.
    // A click only fires on a genuine tap/activation (the browser cancels it when the
    // touch turns into a scroll), so scrolling no longer inflates the counter.
    document.addEventListener('click', function (ev) {
        var a = ev.target && ev.target.closest && ev.target.closest('a.game-card');
        if (a && a.href) recordClick(slugFromUrl(a.href));
    }, true);

    // ============================================================
    // Launcher "recently played" enhancements
    // ============================================================
    // Cards with click history get a subtle visit-count badge in the title
    // row. The single most-recently-played card gets a small dot marker
    // (purely visual — first-time users see no difference). Card ORDER is
    // intentionally NOT shuffled — the launcher's curated grid keeps its
    // designed sequence; the dot + badge surface returning users' history
    // without disrupting the layout.
    function renderArcadeStats() {
        var stats = loadStats();
        var cards = document.querySelectorAll('a.game-card');
        var slugs = Array.from(cards).map(function (c) { return slugFromUrl(c.href); });
        // The "last played" dot is still personal — it marks whichever card
        // THIS visitor last opened (from local click history).
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
            var summary = lbSummaries[slug];
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
                dot.title = 'You last played this';
                h2.insertBefore(dot, h2.firstChild);
            }
            var badge = h2.querySelector('.card-visits');
            if (!badge) {
                badge = document.createElement('span');
                badge.className = 'card-visits';
                h2.appendChild(badge);
            }
            // Play counts are intentionally not shown on the cards.
            badge.textContent = '';
            dot.classList.toggle('is-recent', slug === mostRecent);

            // Stat line → the reigning top 3 unique players (medal row).
            var statLine = body.querySelector('.card-stat-line');
            var leaders = (summary && summary.leaders) || [];
            if (leaders.length) {
                if (!statLine) {
                    statLine = document.createElement('span');
                    statLine.className = 'card-stat-line';
                    // Content, not decoration — screen readers should hear the
                    // champions (the emoji announce as "1st place medal" etc.).
                    // Insert before the .card-cta if present, else at the end.
                    var cta = body.querySelector('.card-cta');
                    if (cta) body.insertBefore(statLine, cta);
                    else body.appendChild(statLine);
                }
                statLine.textContent = '';
                leaders.forEach(function (l, idx) {
                    var s = document.createElement('span');
                    s.className = 'card-leader';
                    s.textContent = MEDALS[idx] + ' ' + l.handle; // textContent = injection-safe
                    statLine.appendChild(s);
                });
                statLine.title = 'Reigning top ' + leaders.length;
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
    function escapeHtml(s) {
        return String(s).replace(/[&<>"']/g, function (c) {
            return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
        });
    }
    function describeStats(entry, summary) {
        var pills = [];
        ((summary && summary.leaders) || []).forEach(function (l, i) {
            pills.push(MEDALS[i] + ' ' + escapeHtml(l.handle));
        });
        if (entry && entry.lastPlayed) {
            var ago = Math.floor((Date.now() - entry.lastPlayed) / 60000);
            var when = ago < 1 ? 'just now'
                     : ago < 60 ? ago + ' min ago'
                     : ago < 1440 ? Math.floor(ago / 60) + ' hr ago'
                     : Math.floor(ago / 1440) + ' day' + (Math.floor(ago / 1440) === 1 ? '' : 's') + ' ago';
            pills.push('You: ' + when);
        }
        if (!pills.length) return '<span class="stats-row-detail">No plays yet</span>';
        return pills.map(function (p) { return '<span class="stat-pill">' + p + '</span>'; }).join('');
    }
    function renderStatsModal() {
        var body = document.getElementById('statsModalBody');
        if (!body) return;
        var stats = loadStats();
        var cards = Array.from(document.querySelectorAll('a.game-card'));
        var anyData = cards.some(function (c) {
            var slug = slugFromUrl(c.href);
            var sum = lbSummaries[slug];
            var s = stats[slug];
            return (sum && sum.plays > 0) || (s && s.lastPlayed > 0);
        });
        if (!anyData) {
            body.innerHTML = '<div class="stats-modal-empty">No plays yet — pick a card and dive in.<br>The leaderboards will fill in here.</div>';
            return;
        }
        // "plays" is now GLOBAL (all players); sort by most plays, then by
        // whichever card THIS visitor opened most recently.
        var rows = cards.map(function (card) {
            var slug = slugFromUrl(card.href);
            var entry = stats[slug];
            var summary = lbSummaries[slug];
            var name = (card.querySelector('.card-body h3') || {}).textContent || slug || 'Unknown';
            // Strip the visit-count badge text + the most-recent dot.
            name = name.replace(/\d+\s*plays?/gi, '').trim();
            var tone = card.getAttribute('data-tone') || '';
            var url = card.href.split('?')[0];
            var plays = summary && summary.plays ? summary.plays : 0;
            return {
                slug: slug, name: name, tone: tone, url: url,
                entry: entry, summary: summary, plays: plays,
                recent: entry && entry.lastPlayed ? entry.lastPlayed : 0
            };
        });
        rows.sort(function (a, b) { return (b.plays - a.plays) || (b.recent - a.recent); });
        body.innerHTML = rows.map(function (r) {
            return '<div class="stats-row" data-tone="' + escapeHtml(r.tone) + '">' +
                   '<span class="stats-row-name"><a href="' + escapeHtml(r.url) + '">' + escapeHtml(r.name) + '</a></span>' +
                   '<span class="stats-row-detail">' + describeStats(r.entry, r.summary) + '</span>' +
                   '<span class="stats-row-plays">' + r.plays +
                     '<small>' + (r.plays === 1 ? 'play' : 'plays') + '</small>' +
                   '</span>' +
                   '</div>';
        }).join('');
    }
    function resetAllStats() {
        if (!confirm('Clear your local launcher history (the "last played" marker)? Global play counts and champions come from the shared leaderboard and are unaffected.')) return;
        try { localStorage.removeItem(STATS_KEY); } catch (_) {}
        try { localStorage.removeItem(LB_KEY); } catch (_) {}
        lbSummaries = {};
        renderArcadeStats();
        renderStatsModal();
        refreshSummaries();
    }

    function init() {
        renderArcadeStats();
        refreshSummaries(); // global plays + champions from the shared leaderboard
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
