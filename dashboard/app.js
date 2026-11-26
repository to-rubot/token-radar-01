// Launch Radar's dashboard. It reads window.RADAR (written beside dashboard/ by main.ts from the
// same board that board.json carries) and renders the ranked board, its filters, a per-protocol
// detail drawer with the model's own factor breakdown and the protocol's farm plan, a live-token
// comparison view, and the peer table the model was calibrated from. No network: every byte it
// shows is in data.js, and every farm plan shown is the exact string board.json carries.
(function () {
  'use strict';

  var DATA = window.RADAR;
  if (!DATA) return;
  var app = document.getElementById('board');
  var state = { q: '', category: 'all', chain: 'all', band: 'all', watch: false, tab: 'pre', sort: 'implied', dir: -1, selected: null };

  var usdFmt = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });
  function fmtUsd(n) {
    if (n === null || n === undefined || !isFinite(n)) return 'n/a';
    if (Math.abs(n) >= 1e9) return '$' + (n / 1e9).toFixed(2) + 'B';
    if (Math.abs(n) >= 1e6) return '$' + (n / 1e6).toFixed(1) + 'M';
    if (Math.abs(n) >= 1e3) return '$' + Math.round(n / 1e3) + 'K';
    return usdFmt.format(n);
  }
  function fmtPct(n) {
    if (n === null || n === undefined || !isFinite(n)) return 'n/a';
    return (n > 0 ? '+' : '') + n.toFixed(2) + '%';
  }
  function fmtAge(days) {
    if (days === null || days === undefined) return 'unknown';
    if (days >= 365) return (days / 365).toFixed(1) + 'y';
    return Math.max(0, Math.round(days)) + 'd';
  }
  function fmtX(n) { return 'x' + Number(n).toFixed(n >= 1 ? 2 : 3); }

  function el(tag, attrs) {
    var node = document.createElement(tag);
    if (attrs) {
      Object.keys(attrs).forEach(function (k) {
        if (k === 'class') node.className = attrs[k];
        else if (k === 'text') node.textContent = attrs[k];
        else if (k.slice(0, 2) === 'on') node.addEventListener(k.slice(2), attrs[k]);
        else if (attrs[k] !== null && attrs[k] !== undefined) node.setAttribute(k, attrs[k]);
      });
    }
    for (var i = 2; i < arguments.length; i++) {
      var child = arguments[i];
      if (child === null || child === undefined) continue;
      if (Array.isArray(child)) child.forEach(function (c) { if (c) node.appendChild(c); });
      else if (typeof child === 'string') node.appendChild(document.createTextNode(child));
      else node.appendChild(child);
    }
    return node;
  }

  function readHash() {
    var hash = window.location.hash.replace(/^#/, '');
    if (!hash) return;
    var params = new URLSearchParams(hash);
    if (params.get('q')) state.q = params.get('q');
    if (params.get('p')) state.selected = params.get('p');
    if (params.get('category')) state.category = params.get('category');
    if (params.get('chain')) state.chain = params.get('chain');
    if (params.get('band')) state.band = params.get('band');
  }
  function writeHash() {
    var params = new URLSearchParams();
    if (state.q) params.set('q', state.q);
    if (state.category !== 'all') params.set('category', state.category);
    if (state.chain !== 'all') params.set('chain', state.chain);
    if (state.band !== 'all') params.set('band', state.band);
    if (state.selected) params.set('p', state.selected);
    var next = params.toString();
    if (next) window.history.replaceState(null, '', '#' + next);
    else window.history.replaceState(null, '', window.location.pathname + window.location.search);
  }

  var BANDS = [
    { id: 'all', label: 'Any TVL', test: function () { return true; } },
    { id: 'xl', label: 'TVL $500M+', test: function (r) { return r.tvl_usd >= 5e8; } },
    { id: 'lg', label: 'TVL $50M to $500M', test: function (r) { return r.tvl_usd >= 5e7 && r.tvl_usd < 5e8; } },
    { id: 'md', label: 'TVL $10M to $50M', test: function (r) { return r.tvl_usd >= 1e7 && r.tvl_usd < 5e7; } },
    { id: 'sm', label: 'TVL under $10M', test: function (r) { return r.tvl_usd < 1e7; } }
  ];
  function bandOf(id) {
    for (var i = 0; i < BANDS.length; i++) if (BANDS[i].id === id) return BANDS[i];
    return BANDS[0];
  }

  function rows() {
    var q = state.q.trim().toLowerCase();
    var band = bandOf(state.band);
    return DATA.rows.filter(function (r) {
      if (state.watch && !r.on_watchlist) return false;
      if (state.category !== 'all' && (r.category || 'Other') !== state.category) return false;
      if (state.chain !== 'all' && (r.chains || []).indexOf(state.chain) < 0) return false;
      if (!band.test(r)) return false;
      if (!q) return true;
      var hay = [r.name, r.slug, r.category || '', (r.chains || []).join(' ')].join(' ').toLowerCase();
      return hay.indexOf(q) >= 0;
    });
  }
  function sortedRows(list) {
    var key = state.sort;
    return list.slice().sort(function (a, b) {
      var av, bv;
      if (key === 'name') { av = a.name.toLowerCase(); bv = b.name.toLowerCase(); }
      else if (key === 'tvl') { av = a.tvl_usd; bv = b.tvl_usd; }
      else if (key === 'growth') { av = a.change_7d === null ? -Infinity : a.change_7d; bv = b.change_7d === null ? -Infinity : b.change_7d; }
      else if (key === 'age') { av = a.age_days === null ? Infinity : a.age_days; bv = b.age_days === null ? Infinity : b.age_days; }
      else if (key === 'peer') { av = a.peer_multiple; bv = b.peer_multiple; }
      else { av = a.implied_value_usd; bv = b.implied_value_usd; }
      if (av < bv) return -state.dir;
      if (av > bv) return state.dir;
      return a.slug < b.slug ? -1 : a.slug > b.slug ? 1 : 0;
    });
  }
  function rowBySlug(slug) {
    for (var i = 0; i < DATA.rows.length; i++) if (DATA.rows[i].slug === slug) return DATA.rows[i];
    return null;
  }

  function header() {
    return el('header', { class: 'top' },
      el('div', { class: 'brand' },
        el('span', { class: 'scope', 'aria-hidden': 'true' }),
        el('div', null,
          el('div', { class: 'brand-name', text: 'LAUNCH RADAR' }),
          el('div', { class: 'brand-sub', text: 'pre-token protocols, ranked by implied launch value' })
        )
      ),
      el('div', { class: 'top-meta' },
        el('span', { text: 'Snapshot ' + DATA.as_of }),
        el('span', { text: 'DefiLlama protocol index, sealed' }),
        el('span', { text: 'Model ' + DATA.model_version })
      )
    );
  }

  function lede() {
    return el('section', { class: 'lede' },
      el('div', null,
        el('h1', { text: 'Which protocol with no token yet is worth farming next?' }),
        el('p', null,
          'Every protocol below records no token. The radar prices each one as if it launched at what the market already pays for live protocols in its category, then adjusts for its week, its years without a token and its chain reach. ',
          el('b', { text: 'Implied value is this model\u2019s claim, not a promise, and it never predicts whether or when a token is issued.' })
        ),
        el('div', { class: 'formula' },
          el('b', { text: 'implied' }), ' = TVL x ', el('b', { text: 'peer multiple' }),
          ' (median mcap/TVL of live peers in the category, global x' + DATA.peers.global_multiple.toFixed(3) + ' from ' + DATA.peers.global_count + ' peers) x ',
          el('b', { text: 'growth' }), ' (7d TVL change, clamped) x ', el('b', { text: 'maturity' }),
          ' (log of days with no token) x ', el('b', { text: 'breadth' }), ' (chains). ',
          el('span', { class: 'warn', text: 'Rows flagged verify-first look like wrapped or staked products of a token that already trades.' })
        )
      ),
      el('div', { class: 'facts' },
        el('div', { class: 'fact' }, el('span', { text: 'Watchlist covered' }), el('b', null, el('em', { text: DATA.watchlist_size + ' / ' + DATA.watchlist_size }))),
        el('div', { class: 'fact' }, el('span', { text: 'Pre-token rows ranked' }), el('b', { text: String(DATA.board_size) })),
        el('div', { class: 'fact' }, el('span', { text: 'Early rows below the $' + Math.round(DATA.floor_usd / 1e6) + 'M floor' }), el('b', { text: String(DATA.early_size) })),
        el('div', { class: 'fact' }, el('span', { text: 'Board TVL tracked' }), el('b', { text: fmtUsd(DATA.total_tvl_usd) })),
        el('div', { class: 'fact' }, el('span', { text: 'Total implied value' }), el('b', { text: fmtUsd(DATA.total_implied_usd) })),
        el('div', { class: 'fact' }, el('span', { text: 'Live-token peers calibrating' }), el('b', { text: String(DATA.peers.global_count) }))
      )
    );
  }

  function selectField(id, label, options, value, onChange) {
    var select = el('select', { id: id, 'aria-label': label },
      options.map(function (o) {
        var attrs = { value: o.id, text: o.label };
        if (o.id === value) attrs.selected = 'selected';
        return el('option', attrs);
      })
    );
    select.addEventListener('change', function () { onChange(select.value); });
    return el('div', { class: 'field' }, el('label', { for: id, text: label }), select);
  }

  function controls() {
    var categories = Array.from(new Set(DATA.rows.map(function (r) { return r.category || 'Other'; }))).sort();
    var chainCounts = {};
    DATA.rows.forEach(function (r) { (r.chains || []).forEach(function (c) { chainCounts[c] = (chainCounts[c] || 0) + 1; }); });
    var chains = Object.keys(chainCounts).sort(function (a, b) { return chainCounts[b] - chainCounts[a] || (a < b ? -1 : 1); }).slice(0, 18);

    var search = el('input', { type: 'search', id: 'q', placeholder: 'Search name, category or chain', value: state.q, 'aria-label': 'Search the board' });
    search.addEventListener('input', function () { state.q = search.value; writeHash(); render(); });
    var watchBox = el('input', { type: 'checkbox', id: 'watch' });
    if (state.watch) watchBox.setAttribute('checked', 'checked');
    watchBox.addEventListener('change', function () { state.watch = watchBox.checked; render(); });
    var pre = el('button', { type: 'button', 'aria-pressed': state.tab === 'pre' ? 'true' : 'false', text: 'Pre-token board', onclick: function () { state.tab = 'pre'; render(); } });
    var live = el('button', { type: 'button', 'aria-pressed': state.tab === 'live' ? 'true' : 'false', text: 'Live-token peers', onclick: function () { state.tab = 'live'; render(); } });

    return el('div', { class: 'controls' },
      el('div', { class: 'field' }, el('label', { for: 'q', text: 'Search' }), search),
      selectField('category', 'Category', [{ id: 'all', label: 'All categories' }].concat(categories.map(function (c) { return { id: c, label: c }; })), state.category,
        function (v) { state.category = v; writeHash(); render(); }),
      selectField('chain', 'Chain', [{ id: 'all', label: 'All chains' }].concat(chains.map(function (c) { return { id: c, label: c }; })), state.chain,
        function (v) { state.chain = v; writeHash(); render(); }),
      selectField('band', 'Size', BANDS.map(function (b) { return { id: b.id, label: b.label }; }), state.band,
        function (v) { state.band = v; writeHash(); render(); }),
      el('label', { class: 'check' }, watchBox, el('span', { text: 'Watchlist only' })),
      el('div', { class: 'field' }, el('span', { class: 'lab', text: 'View' }), el('div', { class: 'tabs' }, pre, live)),
      el('span', { class: 'count', text: state.tab === 'pre' ? rows().length + ' of ' + DATA.board_size + ' rows shown' : DATA.live.length + ' live-token protocols' })
    );
  }

  function sortHeader(key, label) {
    return el('th', { scope: 'col' },
      el('button', { type: 'button', onclick: function () {
        if (state.sort === key) state.dir = -state.dir;
        else { state.sort = key; state.dir = key === 'name' ? 1 : -1; }
        render();
      } }, label, state.sort === key ? el('span', { 'aria-hidden': 'true', text: state.dir < 0 ? ' \u25bc' : ' \u25b2' }) : null)
    );
  }

  function tagsFor(r) {
    var tags = [r.on_watchlist
      ? el('span', { class: 'tag watch', text: 'watchlist' })
      : el('span', { class: 'tag early', text: 'early' })];
    if (r.product_like) tags.push(el('span', { class: 'tag risk', text: 'verify first' }));
    return el('span', { class: 'tags' }, tags);
  }

  function boardTable() {
    var list = sortedRows(rows());
    if (list.length === 0) {
      return el('div', { class: 'panel' }, el('div', { class: 'empty' },
        el('h2', { text: 'No protocol matches that filter' }),
        el('p', { text: 'Clear the search or widen the filters to see the board again.' }),
        el('button', { class: 'button primary', type: 'button', text: 'Clear filters', onclick: function () {
          state.q = ''; state.category = 'all'; state.chain = 'all'; state.band = 'all'; state.watch = false; writeHash(); render();
        } })
      ));
    }
    var max = 0;
    list.forEach(function (r) { if (r.implied_value_usd > max) max = r.implied_value_usd; });
    var tbody = el('tbody');
    list.forEach(function (r) {
      var growthClass = r.change_7d === null ? '' : r.change_7d >= 0 ? 'pos' : 'neg';
      var tr = el('tr', {
        'data-selected': state.selected === r.slug ? 'true' : 'false',
        tabindex: '0',
        onclick: function () { openDetail(r.slug); },
        onkeydown: function (e) { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openDetail(r.slug); } }
      },
        el('td', { class: 'num rank', text: '#' + r.rank }),
        el('td', null, el('div', { class: 'name' },
          el('b', { text: r.name }),
          el('span', { class: 'sub', text: (r.category || 'Other') + ' \u00b7 ' + (r.chains && r.chains.length ? r.chains.slice(0, 3).join(', ') : 'chain n/a') })
        )),
        el('td', { class: 'num', text: fmtUsd(r.tvl_usd) }),
        el('td', { class: 'num ' + growthClass, text: fmtPct(r.change_7d) }),
        el('td', { class: 'num', text: fmtAge(r.age_days) }),
        el('td', { class: 'num', text: fmtX(r.peer_multiple) }),
        el('td', null, el('div', { class: 'implied' },
          el('div', { class: 'bar', 'aria-hidden': 'true' }, el('i', { style: 'width:' + Math.max(2, Math.round((r.implied_value_usd / (max || 1)) * 100)) + '%' })),
          el('span', { class: 'num', text: fmtUsd(r.implied_value_usd) })
        )),
        el('td', null, tagsFor(r))
      );
      tbody.appendChild(tr);
    });
    return el('div', { class: 'panel' }, el('div', { class: 'table-wrap' },
      el('table', null,
        el('caption', { text: 'Pre-token protocols ranked by implied value. Select any row for its model breakdown and farm plan.' }),
        el('thead', null, el('tr', null,
          sortHeader('implied', 'Rank'), sortHeader('name', 'Protocol'), sortHeader('tvl', 'TVL'),
          sortHeader('growth', '7d'), sortHeader('age', 'Age'), sortHeader('peer', 'Peer x'),
          sortHeader('implied', 'Implied value'), el('th', { scope: 'col', text: 'Radar' })
        )),
        tbody
      )
    ));
  }

  function liveTable() {
    var tbody = el('tbody');
    DATA.live.forEach(function (r) {
      tbody.appendChild(el('tr', null,
        el('td', null, el('div', { class: 'name' },
          el('b', { text: r.name }),
          el('span', { class: 'sub', text: (r.category || 'Other') + ' \u00b7 ' + (r.chains && r.chains.length ? r.chains.slice(0, 3).join(', ') : 'chain n/a') })
        )),
        el('td', { class: 'num', text: fmtUsd(r.tvl_usd) }),
        el('td', { class: 'num', text: fmtUsd(r.mcap_usd) }),
        el('td', { class: 'num', text: r.multiple === null ? 'n/a' : fmtX(r.multiple) }),
        el('td', { class: 'num ' + (r.change_7d === null ? '' : r.change_7d >= 0 ? 'pos' : 'neg'), text: fmtPct(r.change_7d) })
      ));
    });
    return el('div', null,
      el('div', { class: 'panel' }, el('div', { class: 'table-wrap' },
        el('table', null,
          el('caption', { text: 'These protocols already trade, so they are never ranked: the market prices them. Their mcap/TVL ratios are the peers the model calibrates each category from.' }),
          el('thead', null, el('tr', null,
            el('th', { scope: 'col', text: 'Protocol' }), el('th', { scope: 'col', text: 'TVL' }),
            el('th', { scope: 'col', text: 'Market cap' }), el('th', { scope: 'col', text: 'Mcap / TVL' }),
            el('th', { scope: 'col', text: '7d' })
          )),
          tbody
        )
      ))
    );
  }

  function modelSection() {
    var chips = DATA.peers.categories.slice(0, 14).map(function (c) {
      return el('span', { class: 'peer' }, el('b', { text: c.category }), ' x' + c.multiple.toFixed(3) + ' \u00b7 ' + c.peers + ' peers');
    });
    return el('section', { class: 'panel model-sec' },
      el('h2', { text: 'How the radar prices a launch that does not exist yet' }),
      el('p', null,
        el('b', { text: 'Peers, not guesses. ' }),
        'For every category, the model reads the protocols in the same sealed snapshot whose token already trades, takes the median of market cap over TVL, and shrinks it toward the global median (x' + DATA.peers.global_multiple.toFixed(3) + ', ' + DATA.peers.global_count + ' peers) when a category has few peers, hardest when it has one or two. A pre-token lending market is priced like lending markets trade, not like a bridge.'
      ),
      el('div', { class: 'peers' }, chips),
      el('p', null,
        el('b', { text: 'Then the protocol\u2019s own record adjusts it. ' }),
        'Growth uses the 7-day TVL change clamped to -60% and +150% so one absurd week cannot carry a ranking. Maturity pays for years survived with no token, on a log curve that rewards the first year most. Breadth adds 3% per extra chain, up to five. The detail view shows every factor for the row you pick, plus a range (x' + DATA.model.range_low_factor + ' to x' + DATA.model.range_high_factor + ') around the point estimate.'
      ),
      el('p', null,
        el('b', { text: 'The watchlist is the floor, never the ceiling. ' }),
        'All ' + DATA.watchlist_size + ' watchlist protocols are ranked, and the radar also scores every rankable pre-token protocol below the $' + Math.round(DATA.floor_usd / 1e6) + 'M floor (' + DATA.early_size + ' early rows). Protocols above the floor that the watchlist rule left out are wrapped, staked, bridged or versioned products of tokens that already trade, so they are not launches waiting to happen and stay off the board. A record says a protocol records no token, never that it has none.'
      )
    );
  }

  function detailNode(r) {
    var span = Math.max(1, r.implied_high_usd - r.implied_low_usd);
    var marker = Math.min(98, Math.max(1, ((r.implied_value_usd - r.implied_low_usd) / span) * 100));
    var children = [
      el('div', { class: 'detail-head' },
        el('div', null,
          el('span', { class: 'tag ' + (r.on_watchlist ? 'watch' : 'early'), text: r.on_watchlist ? 'watchlist \u00b7 rank #' + r.rank : 'early radar \u00b7 rank #' + r.rank }),
          el('h2', { text: r.name }),
          el('div', { class: 'sub', text: (r.category || 'Other') + ' \u00b7 ' + (r.chains && r.chains.length ? r.chains.join(', ') : 'chain n/a') })
        ),
        el('button', { class: 'close', type: 'button', text: 'Close', onclick: closeDetail })
      ),
      el('div', { class: 'detail-sec' },
        el('h3', { text: 'The record' }),
        el('div', { class: 'meta-grid' },
          el('div', null, el('span', { text: 'TVL' }), el('b', { text: fmtUsd(r.tvl_usd) })),
          el('div', null, el('span', { text: 'TVL change, 7d' }), el('b', { text: fmtPct(r.change_7d) })),
          el('div', null, el('span', { text: 'Tracked since' }), el('b', { text: r.listed_at || 'n/a' })),
          el('div', null, el('span', { text: 'Age, no token' }), el('b', { text: fmtAge(r.age_days) })),
          el('div', null, el('span', { text: 'Token on record' }), el('b', { text: 'none recorded' })),
          el('div', null, el('span', { text: 'Chains' }), el('b', { text: String((r.chains || []).length) }))
        )
      )
    ];
    if (r.product_like) {
      children.push(el('div', { class: 'detail-sec' },
        el('div', { class: 'note', text: 'Verify first: this record looks like a wrapped, staked or bridged product, or a bridge or staking category, so its launch may belong to a token that already trades. The radar ranks it on its own record, but check the protocol\u2019s own pages before farming it as a future launch.' })
      ));
    }
    children.push(
      el('div', { class: 'detail-sec' },
        el('h3', { text: 'Implied value, factor by factor' }),
        el('div', { class: 'eq' },
          el('div', null, el('span', { text: 'TVL' }), el('b', { text: fmtUsd(r.tvl_usd) })),
          el('div', null, el('span', { text: 'Peer multiple (' + (r.category || 'category n/a') + ', ' + r.peer_count + (r.peer_count === 1 ? ' live peer' : ' live peers') + ')' }), el('b', { text: fmtX(r.peer_multiple) })),
          el('div', null, el('span', { text: 'Growth (7d ' + fmtPct(r.change_7d) + ', clamped)' }), el('b', { text: fmtX(r.growth_multiplier) })),
          el('div', null, el('span', { text: 'Maturity (' + fmtAge(r.age_days) + ' with no token)' }), el('b', { text: fmtX(r.maturity_multiplier) })),
          el('div', null, el('span', { text: 'Breadth (' + (r.chains || []).length + ' chains)' }), el('b', { text: fmtX(r.breadth_multiplier) })),
          el('div', { class: 'total' }, el('span', { text: 'Implied value' }), el('b', { text: fmtUsd(r.implied_value_usd) }))
        ),
        el('div', { class: 'range', 'aria-hidden': 'true' },
          el('i', { style: 'left:0%;width:100%' }),
          el('b', { style: 'left:' + marker + '%' })
        ),
        el('div', { class: 'range-lab' },
          el('span', { text: 'low ' + fmtUsd(r.implied_low_usd) }),
          el('span', { text: 'range around the estimate' }),
          el('span', { text: 'high ' + fmtUsd(r.implied_high_usd) })
        )
      ),
      el('div', { class: 'detail-sec' },
        el('h3', { text: 'How to farm it' }),
        el('ol', { class: 'steps' }, r.farm_steps.map(function (s) { return el('li', { text: s }); }))
      ),
      el('div', { class: 'detail-sec' },
        el('p', { class: 'sub', text: 'Implied value is the radar model\u2019s own claim from the sealed snapshot of ' + DATA.as_of + '. It is not a prediction that a token will be issued, and farming any protocol carries smart-contract and market risk.' })
      )
    );
    var node = el('aside', { class: 'detail', 'aria-label': 'Protocol detail' }, children);
    return node;
  }

  var detailEl = null;
  function openDetail(slug) {
    state.selected = slug;
    writeHash();
    render();
    var node = document.querySelector('.detail');
    if (node) node.scrollTop = 0;
  }
  function closeDetail() {
    state.selected = null;
    writeHash();
    render();
  }

  function render() {
    var shell = el('div', { class: 'shell' },
      header(),
      lede(),
      controls(),
      state.tab === 'pre' ? boardTable() : liveTable(),
      modelSection(),
      el('footer', { class: 'foot' },
        el('span', { text: 'Source: the sealed DefiLlama protocol snapshot of ' + DATA.as_of + ', read once by the program that wrote this page. Nothing on this page loads from a network.' }),
        el('span', { text: 'A protocol here records no token in that snapshot. That is the snapshot\u2019s record, not proof that no token exists.' })
      )
    );
    app.textContent = '';
    app.appendChild(shell);
    if (state.selected) {
      var r = rowBySlug(state.selected);
      if (r) {
        detailEl = detailNode(r);
        app.appendChild(detailEl);
      } else state.selected = null;
    }
    app.setAttribute('aria-busy', 'false');
  }

  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && state.selected) closeDetail();
  });

  readHash();
  render();
})();
