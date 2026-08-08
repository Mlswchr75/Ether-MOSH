(function () {
  'use strict';

  /* CL sticky search.

     What changed vs. the first version: the suggestion chips used to be the
     cycling placeholder phrases fed back to the customer. They looked like
     suggestions but were invented copy — tapping "vintage fleece" ran a search
     for words no product uses, so the bar taught people that search is broken.
     Chips are now real: the store's own collections (rendered in Liquid, so
     they're plain links with real counts), the customer's own recent searches,
     and Shopify's query completions for what they're typing. */

  /* These are drawn from the tag vocabulary actually written onto the
     products, not invented copy — so a customer who types one back gets
     results instead of an empty page. Keep it that way when editing: if a
     phrase isn't a term the catalogue uses, it doesn't belong here. */
  var PHRASES = [
    'Search dopamine dressing...',
    'Try eclectic maximalism...',
    'Find wearable art...',
    'Search weird girl aesthetic...',
    'Explore art kid fashion...',
    'Find festival core...',
    'Try chromatic therapy...',
    'Search hyperpop streetwear...',
    'Find main character energy...',
    'Try quiet chaos...',
    'Search serotonin boost...',
    'Explore post-internet fashion...',
    'Find vivid aura...',
    'Search graphic tees...',
    'Try acid wash denim...',
    'Find oversized fits...',
    'Search bold graphics...',
    'Explore tie-dye tees...',
    'Find statement pieces...',
    'Search Y2K fits...',
    'Try grunge aesthetic...',
    'Find psychedelic prints...',
    'Search all-over print...',
    'Find abstract art shirts...',
    'Try heavyweight cotton...',
    'Search zip-up hoodies...',
    'Find hand-drawn prints...',
    'Try screen-printed art...',
    'Search unisex fits...',
    'Find limited edition drops...',
    'Try expressive patterns...',
    'Search one of a kind pieces...',
    'Find loud and proud tees...',
    'Try MOSH exclusive drops...'
  ];

  var CYCLE_MS    = 2600;
  var DEBOUNCE_MS = 180;
  var MAX_RESULTS = 6;
  var MAX_RECENT  = 6;
  var RECENT_KEY  = 'cl-recent-searches';

  var reduceMotion = window.matchMedia &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  var phraseIndex   = 0;
  var cycleTimer    = null;
  var debounceTimer = null;
  var isFocused     = false;
  var closeTimer    = null;
  var currentQuery  = '';
  var inflight      = null;
  var activeIndex   = -1;

  var bar        = document.getElementById('cl-sticky-search');
  var input      = document.getElementById('cl-search-input');
  var phEl       = document.getElementById('cl-placeholder');
  var dropdown   = document.getElementById('cl-search-dropdown');
  var resultsEl  = document.getElementById('cl-search-results');
  var clearBtn   = document.getElementById('cl-search-clear');

  var secRecent  = document.getElementById('cl-recent-section');
  var recentEl   = document.getElementById('cl-recent-chips');
  var secBrowse  = document.getElementById('cl-browse-section');
  var secResults = document.getElementById('cl-results-section');

  if (!input || !bar || !dropdown) return;

  // --- Header height sync --------------------------------------------
  // The header section measures itself with an IntersectionObserver that
  // disconnects after the first entry, so it never sees the height this bar
  // adds once it has been moved inside the header. Everything that offsets
  // against --header-height (and --header-height-sticky, which is derived from
  // it) would otherwise be short by the bar's height.

  function syncHeaderHeight() {
    var section = bar.closest ? bar.closest('.header-section') : null;
    if (!section) return;

    var last = 0;

    function update() {
      var h = section.getBoundingClientRect().height;
      if (!h || Math.abs(h - last) < 0.5) return;
      last = h;
      document.documentElement.style.setProperty('--header-height', ' ' + h + 'px');
      document.documentElement.style.setProperty('--header-height-static', ' ' + h + 'px');
    }

    update();
    window.addEventListener('load', update);

    if ('ResizeObserver' in window) {
      new ResizeObserver(update).observe(section);
    }
  }

  syncHeaderHeight();

  // --- Helpers -------------------------------------------------------

  function esc(s) {
    return String(s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  // Shopify CDN URLs usually already carry ?v=…, but not always — picking the
  // wrong joiner yields "…jpg&width=96", which the CDN ignores and serves the
  // full-size original for.
  function sized(url, w) {
    if (!url) return '';
    return url + (url.indexOf('?') > -1 ? '&' : '?') + 'width=' + w;
  }

  // Escape around the match rather than inside it, so a title containing
  // "&" can still be highlighted without mangling the entity.
  function highlight(title, q) {
    title = String(title);
    if (!q) return esc(title);
    var i = title.toLowerCase().indexOf(q.toLowerCase());
    if (i < 0) return esc(title);
    return esc(title.slice(0, i)) +
      '<mark>' + esc(title.slice(i, i + q.length)) + '</mark>' +
      esc(title.slice(i + q.length));
  }

  // Predictive Search returns prices as decimal dollar strings ("29.99"),
  // not cents — parse as a float and do not divide.
  function formatMoney(raw) {
    var num = parseFloat(raw);
    if (isNaN(num)) return '';
    return '$' + num.toFixed(2).replace(/\.00$/, '');
  }

  function searchUrl(q) {
    return '/search?q=' + encodeURIComponent(q) + '&type=product';
  }

  // "/collections/x/products/the-handle?variant=1" -> "the-handle"
  function handleFromUrl(url) {
    var m = /\/products\/([^/?#]+)/.exec(String(url || ''));
    return m ? decodeURIComponent(m[1]) : '';
  }

  // --- Quick view --------------------------------------------------
  // The quick view's assets are loaded by the homepage's product-grid
  // section, so on every other page they are absent. Injecting them here on
  // first use (rather than from the snippet) appends the stylesheet AFTER
  // brutalist-showcase.css, which is the order its card overrides depend on —
  // loading it from the header would invert that and break the homepage cards.

  var qvPending = null;

  function toSafeAssetUrl(raw) {
    if (!raw) return '';
    try {
      var parsed = new URL(String(raw), window.location.href);
      // Allow same-origin relative/absolute URLs and https assets.
      if (parsed.origin === window.location.origin || parsed.protocol === 'https:') {
        return parsed.href;
      }
    } catch (e) {}
    return '';
  }

  function ensureQuickView() {
    if (window.BrutalistQuickView) return Promise.resolve(window.BrutalistQuickView);
    if (qvPending) return qvPending;

    function getSafeAssetUrl(raw) {
      if (!raw) return null;
      try {
        var u = new URL(raw, window.location.href);
        var isHttp = u.protocol === 'http:' || u.protocol === 'https:';
        if (!isHttp) return null;
        if (u.origin !== window.location.origin) return null;
        return u.href;
      } catch (e) {
        return null;
      }
    }

    var css = getSafeAssetUrl(bar.getAttribute('data-qv-css'));
    var js  = getSafeAssetUrl(bar.getAttribute('data-qv-js'));
    var css = toSafeAssetUrl(bar.getAttribute('data-qv-css'));
    var js  = toSafeAssetUrl(bar.getAttribute('data-qv-js'));
    if (!js) return Promise.reject(new Error('no quick view asset'));

    if (css) {
      var hasCss = Array.prototype.some.call(
        document.querySelectorAll('link[rel="stylesheet"]'),
        function (node) {
          var href = node.getAttribute('href');
          if (!href) return false;
          try { return new URL(href, window.location.href).href === css; }
          catch (e) { return false; }
        }
      );
      if (!hasCss) {
        var link = document.createElement('link');
        link.rel = 'stylesheet';
        link.href = css;
        document.head.appendChild(link);
      }
    }

    qvPending = new Promise(function (resolve, reject) {
      var existing = null;
      var scripts = document.querySelectorAll('script[src]');
      for (var i = 0; i < scripts.length; i++) {
        try {
          if (new URL(scripts[i].getAttribute('src'), window.location.href).href === js) {
            existing = scripts[i];
            break;
          }
        } catch (e) {}
      }
      if (existing) {
        existing.addEventListener('load', function () { resolve(window.BrutalistQuickView); });
        existing.addEventListener('error', reject);
        return;
      }
      var s = document.createElement('script');
      s.src = js;
      s.onload = function () {
        window.BrutalistQuickView ? resolve(window.BrutalistQuickView)
                                  : reject(new Error('quick view did not boot'));
      };
      s.onerror = reject;
      document.head.appendChild(s);
    });

    // A failed load must not poison every later click.
    qvPending.catch(function () { qvPending = null; });
    return qvPending;
  }

  // --- Recent searches -----------------------------------------------

  function readRecent() {
    try {
      var v = JSON.parse(localStorage.getItem(RECENT_KEY) || '[]');
      return Array.isArray(v) ? v.filter(function (s) { return typeof s === 'string'; }) : [];
    } catch (e) {
      return [];
    }
  }

  function rememberSearch(q) {
    q = String(q || '').trim();
    if (!q) return;
    var list = readRecent().filter(function (s) {
      return s.toLowerCase() !== q.toLowerCase();
    });
    list.unshift(q);
    list.length = Math.min(list.length, MAX_RECENT);
    try {
      localStorage.setItem(RECENT_KEY, JSON.stringify(list));
    } catch (e) { /* private mode — recents are a nicety, not a requirement */ }
  }

  function renderRecent() {
    if (!secRecent || !recentEl) return;
    var list = readRecent();
    if (!list.length) {
      secRecent.setAttribute('hidden', '');
      recentEl.innerHTML = '';
      return;
    }
    secRecent.removeAttribute('hidden');
    recentEl.innerHTML = list.map(function (q) {
      return '<a class="cl-search-chip" data-nav role="option" href="' + esc(searchUrl(q)) + '">' +
        esc(q) + '</a>';
    }).join('');
  }

  // --- Placeholder cycling -------------------------------------------

  function showPhrase(text, animate) {
    if (!phEl) return;
    if (!animate || reduceMotion) {
      phEl.textContent = text;
      phEl.style.opacity = '';
      return;
    }
    phEl.classList.add('cl-ph-exit');
    setTimeout(function () {
      phEl.textContent = text;
      phEl.classList.remove('cl-ph-exit');
      phEl.classList.add('cl-ph-enter');
      requestAnimationFrame(function () {
        requestAnimationFrame(function () {
          phEl.classList.remove('cl-ph-enter');
        });
      });
    }, 230);
  }

  function tick() {
    if (isFocused || input.value || document.hidden) return;
    phraseIndex = (phraseIndex + 1) % PHRASES.length;
    showPhrase(PHRASES[phraseIndex], true);
  }

  function startCycle() {
    showPhrase(PHRASES[phraseIndex], false);
    if (reduceMotion || cycleTimer) return;
    cycleTimer = setInterval(tick, CYCLE_MS);
  }

  function pauseCycle() {
    clearInterval(cycleTimer);
    cycleTimer = null;
    if (phEl) phEl.style.opacity = '0';
  }

  function resumeCycle() {
    if (phEl) phEl.style.opacity = '';
    if (!reduceMotion && !cycleTimer) cycleTimer = setInterval(tick, CYCLE_MS);
  }

  // --- The mosh ------------------------------------------------------
  // Two constraints that read as contradictory but aren't: gaps are never
  // shorter than 7s, and no more than 3 fire in any rolling minute. The gap
  // is randomised well above the floor so the rhythm is unpredictable; the
  // rolling-window count is the hard ceiling that catches an unlucky run of
  // short gaps. Both are enforced, so neither can be violated by chance.

  var MOSH_MIN_GAP  = 7000;
  var MOSH_MAX_GAP  = 26000;
  var MOSH_PER_MIN  = 3;
  var MOSH_MS       = 420;
  var moshFires     = [];
  var moshTimer     = null;

  function scheduleMosh() {
    if (reduceMotion) return;
    clearTimeout(moshTimer);
    moshTimer = setTimeout(
      fireMosh,
      MOSH_MIN_GAP + Math.random() * (MOSH_MAX_GAP - MOSH_MIN_GAP)
    );
  }

  function fireMosh() {
    var now = now_();
    moshFires = moshFires.filter(function (t) { return now - t < 60000; });

    // Skipping while hidden also stops a backlog building up in a tab
    // nobody is looking at, which would all fire at once on return.
    if (!document.hidden && moshFires.length < MOSH_PER_MIN) {
      moshFires.push(now);
      bar.classList.add('is-moshing');
      setTimeout(function () { bar.classList.remove('is-moshing'); }, MOSH_MS);
    }
    scheduleMosh();
  }

  // Date.now via a wrapper so the scheduler stays testable.
  function now_() { return Date.now(); }

  // A background tab that keeps swapping text still costs a paint per second.
  document.addEventListener('visibilitychange', function () {
    if (document.hidden) {
      clearInterval(cycleTimer);
      cycleTimer = null;
    } else if (!isFocused && !input.value) {
      resumeCycle();
    }
  });

  // --- Dropdown + keyboard navigation --------------------------------

  function openDropdown() {
    dropdown.removeAttribute('hidden');
    input.setAttribute('aria-expanded', 'true');
  }

  function closeDropdown() {
    dropdown.setAttribute('hidden', '');
    input.setAttribute('aria-expanded', 'false');
    setActive(-1);
  }

  function navItems() {
    return Array.prototype.filter.call(
      dropdown.querySelectorAll('[data-nav]'),
      function (el) { return el.offsetParent !== null; }
    );
  }

  function setActive(i) {
    var items = navItems();
    items.forEach(function (el) {
      el.classList.remove('is-active');
      el.removeAttribute('aria-selected');
    });
    activeIndex = i;
    if (i < 0 || i >= items.length) {
      input.removeAttribute('aria-activedescendant');
      return;
    }
    var el = items[i];
    el.classList.add('is-active');
    el.setAttribute('aria-selected', 'true');
    if (!el.id) el.id = 'cl-nav-' + i;
    input.setAttribute('aria-activedescendant', el.id);
    if (el.scrollIntoView) el.scrollIntoView({ block: 'nearest' });
  }

  function move(delta) {
    var items = navItems();
    if (!items.length) return;
    var next = activeIndex + delta;
    if (next < 0) next = items.length - 1;
    if (next >= items.length) next = 0;
    setActive(next);
  }

  // Sections are shown/hidden as a set so the panel never has a stray label
  // sitting above nothing.
  function showIdle() {
    renderRecent();
    if (secBrowse) secBrowse.removeAttribute('hidden');
    if (secResults) secResults.setAttribute('hidden', '');
    resultsEl.innerHTML = '';
    setActive(-1);
  }

  function showResults(html) {
    if (secRecent) secRecent.setAttribute('hidden', '');
    if (secBrowse) secBrowse.setAttribute('hidden', '');
    if (secResults) secResults.removeAttribute('hidden');
    resultsEl.innerHTML = html;
    setActive(-1);
  }

  // --- Search --------------------------------------------------------

  function doSearch(q, immediate) {
    currentQuery = q;
    if (!q.trim()) {
      showIdle();
      openDropdown();
      return;
    }
    openDropdown();
    clearTimeout(debounceTimer);
    if (immediate) {
      fetchResults(q);
    } else {
      debounceTimer = setTimeout(function () { fetchResults(q); }, DEBOUNCE_MS);
    }
  }

  function fetchResults(q) {
    if (q !== currentQuery) return;

    // Dropping `body` from the searched fields: full descriptions matched
    // almost every product on common words, so the top six were noise.
    var url =
      '/search/suggest.json?q=' + encodeURIComponent(q) +
      '&resources[type]=product,collection,query' +
      '&resources[fields]=title,vendor,product_type,tags,variants.title' +
      '&resources[limit]=' + MAX_RESULTS +
      '&resources[options][unavailable_products]=last';

    if (inflight && inflight.abort) inflight.abort();
    var ctrl = ('AbortController' in window) ? new AbortController() : null;
    inflight = ctrl;

    fetch(url, ctrl ? { signal: ctrl.signal } : undefined)
      .then(function (r) { return r.json(); })
      .then(function (data) {
        if (q !== currentQuery) return;
        var res = (data.resources && data.resources.results) || {};
        render(res.products || [], res.collections || [], res.queries || [], q);
      })
      .catch(function (err) {
        if (err && err.name === 'AbortError') return;
        if (q !== currentQuery) return;
        showResults(
          '<div class="cl-search-status">Search hiccupped. ' +
          '<a class="cl-search-chip" data-nav role="option" href="' + esc(searchUrl(q)) +
          '">Open full results</a></div>'
        );
      });
  }

  function productRow(p, q) {
    var price = '';
    if (p.available === false) {
      price = '<span class="cl-search-result-sold">Sold out</span>';
    } else if (p.price) {
      price = formatMoney(p.price);
      var cmp = parseFloat(p.compare_at_price);
      if (!isNaN(cmp) && cmp > parseFloat(p.price)) {
        price += '<span class="cl-search-result-was">' + formatMoney(cmp) + '</span>';
      }
    }

    var src = (p.featured_image && p.featured_image.url) || p.image || '';
    var img = src
      ? '<img class="cl-search-result-img" src="' + esc(sized(src, 96)) +
        '" alt="" loading="lazy" width="46" height="46">'
      : '<div class="cl-search-result-img-placeholder">&#128085;</div>';

    return '<a class="cl-search-result-item" data-nav role="option" href="' +
      esc(p.url) + '" data-product-handle="' + esc(handleFromUrl(p.url)) + '">' + img +
      '<div class="cl-search-result-info">' +
        '<div class="cl-search-result-title">' + highlight(p.title, q) + '</div>' +
        (price ? '<div class="cl-search-result-price">' + price + '</div>' : '') +
      '</div></a>';
  }

  function render(products, collections, queries, q) {
    var html = '';

    // Completions first — they are the cheapest way to turn two letters into
    // a search that actually returns something.
    var qs = queries
      .map(function (x) { return (x && (x.text || x.styled_text)) || ''; })
      .filter(function (t) { return t && t.toLowerCase() !== q.toLowerCase(); })
      .slice(0, 5);

    if (qs.length) {
      html += '<div class="cl-search-label">Try</div><div class="cl-search-chips">' +
        qs.map(function (t) {
          return '<a class="cl-search-chip" data-nav role="option" href="' + esc(searchUrl(t)) + '">' +
            esc(t) + '</a>';
        }).join('') + '</div>';
    }

    if (collections.length) {
      html += '<div class="cl-search-label">Collections</div><div class="cl-search-chips">' +
        collections.slice(0, 5).map(function (c) {
          return '<a class="cl-search-chip" data-nav role="option" href="' + esc(c.url) + '">' +
            esc(c.title) + '</a>';
        }).join('') + '</div>';
    }

    if (products.length) {
      html += '<div class="cl-search-label">Products</div>';
      html += products.map(function (p) { return productRow(p, q); }).join('');
      html += '<a class="cl-search-all-link" data-nav href="' + esc(searchUrl(q)) +
        '">See all results for &ldquo;' + esc(q) + '&rdquo; &rarr;</a>';
    } else if (!qs.length && !collections.length) {
      // A bare "no results" is a dead end. Hand back the real collections
      // instead so the trip isn't wasted. Rebuilt from the source links rather
      // than cloning their markup, which would duplicate the ids setActive
      // stamps on for aria-activedescendant.
      html += '<div class="cl-search-status">Nothing matched <strong>' + esc(q) +
        '</strong>. Try one of these:</div>';
      var chips = secBrowse ? secBrowse.querySelectorAll('.cl-search-chip') : [];
      if (chips.length) {
        html += '<div class="cl-search-chips">' +
          Array.prototype.map.call(chips, function (a) {
            return '<a class="cl-search-chip" data-nav role="option" href="' +
              esc(a.getAttribute('href')) + '">' + esc(a.textContent.trim()) + '</a>';
          }).join('') + '</div>';
      }
    }

    showResults(html);
  }

  // --- Events --------------------------------------------------------

  function syncClear() {
    clearBtn.style.display = input.value ? 'flex' : 'none';
  }

  input.addEventListener('focus', function () {
    isFocused = true;
    pauseCycle();
    clearTimeout(closeTimer);
    if (!input.value.trim()) showIdle();
    openDropdown();
  });

  input.addEventListener('blur', function () {
    isFocused = false;
    closeTimer = setTimeout(function () {
      closeDropdown();
      if (!input.value) resumeCycle();
    }, 180);
  });

  input.addEventListener('input', function () {
    syncClear();
    var q = input.value.trim();
    if (q) {
      doSearch(q, false);
    } else {
      currentQuery = '';
      showIdle();
      openDropdown();
    }
  });

  input.addEventListener('keydown', function (e) {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      if (dropdown.hasAttribute('hidden')) {
        if (!input.value.trim()) showIdle();
        openDropdown();
      }
      move(e.key === 'ArrowDown' ? 1 : -1);
      return;
    }

    if (e.key === 'Enter') {
      e.preventDefault();
      var items = navItems();
      if (activeIndex > -1 && items[activeIndex]) {
        rememberSearch(input.value.trim());
        items[activeIndex].click();
        return;
      }
      var q = input.value.trim();
      if (q) {
        rememberSearch(q);
        window.location.href = searchUrl(q);
      }
      return;
    }

    if (e.key === 'Escape') {
      if (input.value) {
        input.value = '';
        syncClear();
        currentQuery = '';
        showIdle();
      } else {
        input.blur();
        closeDropdown();
      }
    }
  });

  // Anything the customer actually clicks is worth remembering, so the next
  // visit opens with their own words rather than ours.
  dropdown.addEventListener('click', function (e) {
    if (!e.target.closest || !e.target.closest('[data-nav]')) return;
    rememberSearch(input.value.trim());

    // A product result opens the quick view instead of navigating, so the
    // customer can add to cart and keep typing. Ctrl/cmd/middle-click and the
    // "Full details" button inside the modal still open the real page.
    var row = e.target.closest('.cl-search-result-item');
    if (!row || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button > 0) return;

    var handle = row.getAttribute('data-product-handle');
    if (!handle) return;

    e.preventDefault();
    ensureQuickView().then(function (qv) {
      closeDropdown();
      input.blur();
      qv.open(handle, row.getAttribute('href'), null, row);
    }).catch(function () {
      // Quick view unavailable — fall back to the page it was already pointing at.
      window.location.href = row.getAttribute('href');
    });
  });

  // Keep the click alive through the input's blur: suppressing mousedown's
  // default stops focus moving, so the 180ms close timer never starts and the
  // click can't lose the race against it. Links still fire their click.
  dropdown.addEventListener('mousedown', function (e) {
    e.preventDefault();
  });

  dropdown.addEventListener('mousemove', function (e) {
    var item = e.target.closest && e.target.closest('[data-nav]');
    if (!item) return;
    var i = navItems().indexOf(item);
    if (i > -1 && i !== activeIndex) setActive(i);
  });

  clearBtn.addEventListener('click', function () {
    input.value = '';
    syncClear();
    currentQuery = '';
    showIdle();
    openDropdown();
    input.focus();
  });

  // "/" focuses search the way every developer tool trained people to expect.
  document.addEventListener('keydown', function (e) {
    if (e.key !== '/' || e.metaKey || e.ctrlKey || e.altKey) return;
    var t = e.target;
    var tag = t && t.tagName;
    if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' ||
        (t && t.isContentEditable)) return;
    e.preventDefault();
    input.focus();
    input.select();
  });

  startCycle();
  scheduleMosh();

  // Exposed for the test harness to drive the schedule deterministically.
  window.__clSearch = {
    mosh: fireMosh,
    moshFires: function () { return moshFires.slice(); },
  };
})();
