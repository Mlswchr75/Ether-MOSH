/* Brutalist Random Products — cycling + deferred load + shuffle + AJAX fetch + sort/filter/load-more */
/* Patched 2026-06-10: deferred activation no longer waits for window load; activated images are forced eager; client-rendered cards close their JSON script tag correctly. */
/* Patched 2026-06-14: heuristic fix — never set done=true based on initial card count alone (unless 0); always attempt page-1 AJAX fetch when Liquid rendered fewer than PAGE_SIZE cards so all products load regardless of collection size. Added retry logic (3 attempts) for network errors instead of immediately giving up. */
/* Patched 2026-06-30: FIXED image cycler — removed the auto-cycle timer that ran concurrently with manual pan/scrub. Previously, hovering started an automatic image rotation (every `cycle_speed` ms) that kept firing in the background while the user panned across the card, and ~900ms after the user stopped moving the mode silently flipped back to auto and the image would jump to whatever frame the auto-timer had reached. That race is what caused the reported "flickers to the next one but never cycles through all of them" bug. The cycler is now pure pointer-position driven: the image shown always matches where the pointer is horizontally over the card, with no background timer fighting it. Images are decoded before being swapped in (when supported) to avoid a blank/flicker frame, and pointermove updates are coalesced with requestAnimationFrame instead of a fixed ms throttle for smoother tracking. */
(function () {
  "use strict";

  const FRAME_COUNT = 12;
  const PAGE_SIZE = 50;

  const init = () => {
    document.querySelectorAll(".br-random").forEach(initSection);
  };

  const initSection = (section) => {
    if (section.dataset.brInit === "1") return;
    section.dataset.brInit = "1";

    const grid = section.querySelector("[data-br-random-grid]");
    if (!grid) return;

    const cycleSpeed = parseInt(section.dataset.cycleSpeed, 10) || 700;
    const shuffleOnLoad = section.dataset.shuffle === "1";
    const maxTotal = parseInt(section.dataset.maxTotal, 10) || 100;
    const collectionHandle = section.dataset.collectionHandle || "all";
    const currency = section.dataset.currency || "USD";
    const accent =
      (section.style.getPropertyValue("--br-accent") || "").trim() || "#FF2BD6";

    // Shared IntersectionObserver for deferred image loading.
    const cardObserver = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            activateDeferred(entry.target);
            cardObserver.unobserve(entry.target);
          }
        });
      },
      { rootMargin: "500px 0px" }
    );

    // Initial Liquid-rendered cards.
    const initialCards = Array.from(grid.children);
    if (shuffleOnLoad && initialCards.length > 1) shuffleNodes(grid, initialCards);

    initialCards.forEach((card) => {
      if (card.classList.contains("br-card--deferred")) cardObserver.observe(card);
      wireCycler(card, cycleSpeed);
      wireVideo(card);
    });

    scheduleIdleActivate(grid, cardObserver);

    // In the theme editor, reveal all deferred cards immediately so the
    // merchant can see the full grid without waiting for idle/scroll events.
    if (window.Shopify && Shopify.designMode) {
      initialCards.forEach(activateDeferred);
    }

    // Build shared fetch state.
    const seenIds = new Set(
      Array.from(grid.querySelectorAll("[data-product-id]"))
        .map((c) => c.dataset.productId)
    );

    const fetchCtx = {
      grid, cardObserver, collectionHandle, currency, accent,
      maxTotal, cycleSpeed, shuffleOnLoad,
      sectionId: section.dataset.sectionId || "",
    };
    const fetchState = {
      page: 2,
      totalLoaded: initialCards.length,
      done: initialCards.length >= maxTotal,
      loading: false,
      seenIds,
      consecutiveDupes: 0,
      retries: 0,
    };

    // FIX 2026-06-14: When Liquid renders fewer than PAGE_SIZE cards, we cannot
    // reliably know whether the collection has more products or not — Liquid may
    // have applied an initial_count limit, or the collection may genuinely be
    // small. To be safe, always reset to page 1 so the AJAX path can discover
    // any additional products. seenIds dedup ensures already-rendered products
    // are never added to the DOM twice. If the collection is truly small, the
    // AJAX path will quickly exhaust results and set done=true via consecutiveDupes.
    if (initialCards.length === 0) {
      fetchState.done = true;
    } else if (initialCards.length < PAGE_SIZE) {
      fetchState.page = 1;
      // fetchState.done stays false — AJAX will determine the real collection size.
    }
    // initialCards.length >= PAGE_SIZE: Liquid hit its limit, page 2+ logic applies.

    // --- Load More button ---
    const loadMoreWrap = section.querySelector("[data-br-loadmore-wrap]");
    const loadMoreBtn = section.querySelector("[data-br-loadmore]");
    const loadMoreText = section.querySelector("[data-br-loadmore-text]");

    const updateLoadMoreUI = () => {
      if (!loadMoreWrap) return;
      if (fetchState.done || fetchState.totalLoaded >= maxTotal) {
        loadMoreWrap.style.display = "none";
      } else if (!fetchState.loading) {
        loadMoreWrap.style.display = "";
        if (loadMoreText) loadMoreText.textContent = "LOAD MORE";
        if (loadMoreBtn) loadMoreBtn.disabled = false;
      }
    };

    if (loadMoreBtn) {
      loadMoreBtn.addEventListener("click", async () => {
        if (fetchState.loading || fetchState.done) return;
        if (loadMoreText) loadMoreText.textContent = "LOADING...";
        if (loadMoreBtn) loadMoreBtn.disabled = true;
        await fetchBatch(fetchCtx, fetchState);
        updateLoadMoreUI();
      });
    }

    // Load More button shows when fetchState.done is false.
    updateLoadMoreUI();

    // Auto-fetch page 1 immediately whenever Liquid rendered fewer than PAGE_SIZE
    // cards — this silently recovers any products that Liquid didn't render
    // (e.g. due to initial_count limiting the grid) without requiring a click.
    // seenIds dedup prevents any product from appearing twice.
    if (!fetchState.done && fetchState.page === 1) {
      setTimeout(function () {
        fetchBatch(fetchCtx, fetchState).then(function () { updateLoadMoreUI(); });
      }, 50);
    }

    // --- Sort select ---
    const sortSelect = section.querySelector("[data-br-sort]");
    if (sortSelect) {
      sortSelect.addEventListener("change", () => {
        const url = new URL(window.location.href);
        url.searchParams.set("sort_by", sortSelect.value);
        window.location.href = url.toString();
      });
    }

    // --- Filter panel toggle ---
    const filterToggle = section.querySelector("[data-br-filters-toggle]");
    const filterPanel = section.querySelector("[data-br-filter-panel]");
    if (filterToggle && filterPanel) {
      filterToggle.addEventListener("click", () => {
        const isOpen = filterToggle.getAttribute("aria-expanded") === "true";
        filterToggle.setAttribute("aria-expanded", String(!isOpen));
        filterPanel.hidden = isOpen;
      });
    }
  };

  // ------ Fetch helpers ------

  const fetchBatch = async (ctx, state) => {
    if (state.done || state.loading) return;
    state.loading = true;

    const {
      grid, cardObserver, collectionHandle, currency, accent,
      maxTotal, cycleSpeed, shuffleOnLoad, sectionId,
    } = ctx;

    try {
      const url = `/collections/${encodeURIComponent(collectionHandle)}/products.json?page=${state.page}&limit=${PAGE_SIZE}`;
      const resp = await fetch(url, {
        headers: { Accept: "application/json" },
        credentials: "same-origin",
      });
      if (!resp.ok) {
        // Retry up to 3 times on HTTP errors before giving up.
        state.retries = (state.retries || 0) + 1;
        if (state.retries >= 3) state.done = true;
        return;
      }

      const data = await resp.json();
      let products = Array.isArray(data.products) ? data.products : [];
      if (!products.length) { state.done = true; return; }

      products = products.filter((p) => !state.seenIds.has(String(p.id)));
      if (!products.length) {
        state.consecutiveDupes = (state.consecutiveDupes || 0) + 1;
        if (state.page > 50 || state.consecutiveDupes >= 3) { state.done = true; return; }
        state.page++;
        state.loading = false;
        return;
      }
      state.consecutiveDupes = 0; // reset on new products
      state.retries = 0; // reset retries on success

      const batch = shuffleOnLoad ? shuffleArray(products.slice()) : products.slice();
      const newCards = [];
      const frag = document.createDocumentFragment();

      for (const p of batch) {
        if (state.totalLoaded >= maxTotal) { state.done = true; break; }
        const card = renderCard(p, state.totalLoaded, accent, currency, sectionId);
        if (!card) continue;
        frag.appendChild(card);
        newCards.push(card);
        state.seenIds.add(String(p.id));
        state.totalLoaded++;
      }

      grid.appendChild(frag);
      newCards.forEach((card) => {
        cardObserver.observe(card);
        wireCycler(card, cycleSpeed);
        wireVideo(card);
      });

      if (products.length < PAGE_SIZE) state.done = true;
      state.page++;

    } catch (e) {
      if (window.console) console.warn("[br-random] fetch failed:", e);
      // Retry up to 3 times on network errors before giving up.
      state.retries = (state.retries || 0) + 1;
      if (state.retries >= 3) state.done = true;
    } finally {
      state.loading = false;
    }
  };

  // ------ Utility helpers ------

  const shuffleNodes = (parent, nodes) => {
    const arr = nodes.slice();
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    const frag = document.createDocumentFragment();
    arr.forEach((n) => frag.appendChild(n));
    parent.appendChild(frag);
  };

  const shuffleArray = (arr) => {
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
  };

  const activateDeferred = (card) => {
    if (card.dataset.brActivated === "1") return;
    card.dataset.brActivated = "1";
    card.querySelectorAll("img[data-src]").forEach((img) => {
      img.loading = "eager";
      if (img.dataset.src) img.src = img.dataset.src;
      if (img.dataset.srcset) img.srcset = img.dataset.srcset;
      img.removeAttribute("data-src");
      img.removeAttribute("data-srcset");
    });
    card.querySelectorAll("video source[data-src]").forEach((s) => {
      s.setAttribute("src", s.dataset.src);
      s.removeAttribute("data-src");
    });
    const v = card.querySelector("video");
    if (v) { try { v.load(); } catch (_) {} }
  };

  const scheduleIdleActivate = (grid, cardObserver) => {
    const run = () => {
      const deferred = Array.from(
        grid.querySelectorAll('.br-card--deferred:not([data-br-activated="1"])')
      );
      if (!deferred.length) return;
      const BATCH = 6;
      let i = 0;
      const step = () => {
        deferred.slice(i, i + BATCH).forEach(activateDeferred);
        i += BATCH;
        if (i < deferred.length) {
          if (window.requestIdleCallback) requestIdleCallback(step, { timeout: 600 });
          else setTimeout(step, 120);
        }
      };
      step();
    };
    // Patched: don't wait for the full window load event (it can take many
    // seconds on image-heavy pages, leaving cards white). Start activating as
    // soon as the DOM is interactive.
    if (document.readyState !== "loading") {
      setTimeout(run, 150);
    } else {
      document.addEventListener("DOMContentLoaded", () => setTimeout(run, 150), { once: true });
    }
  };

  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

  const whenLoaded = () =>
    new Promise((resolve) => {
      if (document.readyState === "complete") return resolve();
      window.addEventListener("load", () => resolve(), { once: true });
    });

  // ------ Card rendering (client-side, matches Liquid snippet output) ------

  const renderCard = (p, idx, accent, currency, sectionId) => {
    if (!p || !p.handle) return null;
    const frameN = (idx % FRAME_COUNT) + 1;
    const rot = ((idx * 137) % 11) - 5;

    let minPrice = Infinity, maxPrice = -Infinity;
    (p.variants || []).forEach((v) => {
      const price = parseFloat(v.price);
      if (!isNaN(price)) {
        if (price < minPrice) minPrice = price;
        if (price > maxPrice) maxPrice = price;
      }
    });
    let priceHtml = "";
    if (isFinite(minPrice)) {
      let priceText;
      try {
        priceText = new Intl.NumberFormat(undefined, {
          style: "currency", currency,
        }).format(minPrice);
      } catch (_) {
        priceText = "$" + minPrice.toFixed(2);
      }
      const varies = maxPrice > minPrice;
      const prefix = varies ? '<span class="br-card__price-prefix">FROM </span>' : "";
      priceHtml = `<span class="br-card__price">${prefix}${escapeHtml(priceText)}</span>`;
    }

    const images = (p.images || [])
      .map((img) => (typeof img === "string" ? img : img && img.src))
      .filter(Boolean)
      .map((url) => transformShopifyImageUrl(url, 800));
    const firstImage = images[0] || "";

    const titleEsc = escapeHtml(p.title || "");
    const href = `/products/${p.handle}`;

    const article = document.createElement("article");
    article.className = "br-card br-card--cycler br-card--deferred";
    article.style.setProperty("--br-rot", `${rot}deg`);
    article.style.setProperty("--br-clip", `url(#${sectionId ? sectionId + "-" : ""}br-frame-${frameN})`);
    article.style.setProperty("--br-accent-card", accent);
    article.dataset.idx = String(idx);
    article.dataset.productId = String(p.id || "");
    article.dataset.productHandle = p.handle;

    const mediaHtml = firstImage
      ? `<img class="br-card__media br-card__still br-card__cycle-img" data-src="${escapeAttr(firstImage)}" alt="${titleEsc}" loading="eager" fetchpriority="low" decoding="async" data-cycle-index="0">`
      : `<div class="br-card__media br-card__still br-card__placeholder" aria-hidden="true"></div>`;

    const imagesJson = JSON.stringify(images);
    const scriptOpen = '<scr' + 'ipt type="application/json" class="br-card__images-data" data-br-images>';
    const scriptClose = '</scr' + 'ipt>';

    article.innerHTML =
      `<a class="br-card__link" href="${escapeAttr(href)}" aria-label="${titleEsc}">` +
        `<div class="br-card__frame" data-cycler>` +
          mediaHtml +
          scriptOpen + imagesJson + scriptClose +
          `<span class="br-card__qv" data-br-qv data-product-handle="${escapeAttr(p.handle)}" aria-hidden="true">` +
            `<span class="br-card__qv-eye"></span>` +
          `</span>` +
        `</div>` +
        priceHtml +
        `<div class="br-card__caption"><span class="br-card__caption-text">${titleEsc}</span></div>` +
      `</a>`;

    return article;
  };

  const transformShopifyImageUrl = (url, width) => {
    if (!url) return url;
    return url.replace(
      /(\.(jpg|jpeg|png|gif|webp|avif))(\?.*)?$/i,
      (_m, ext, _ext2, query) => `_${width}x${ext}${query || ""}`
    );
  };

  const escapeHtml = (s) =>
    String(s == null ? "" : s)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");

  const escapeAttr = escapeHtml;

  // ------ Per-card cycler wiring (rewritten 2026-06-30) ------
  //
  // Pure pointer-position scrub: whichever image sits under the pointer's
  // horizontal position within the card is the one shown. No background
  // auto-advance timer — that was racing against manual panning and is what
  // produced the reported flicker / "never cycles through all of them" bug.

  const wireCycler = (card, /* cycleSpeed kept for signature compatibility, unused now */ _cycleSpeed) => {
    if (!card.classList.contains("br-card--cycler")) return;
    if (card.dataset.brCyclerWired === "1") return;
    card.dataset.brCyclerWired = "1";

    const frame = card.querySelector("[data-cycler]");
    const img = card.querySelector(".br-card__cycle-img");
    const dataEl = card.querySelector("[data-br-images]");
    if (!frame || !img || !dataEl) return;

    const toSafeImageUrl = (value) => {
      if (typeof value !== "string") return null;
      const trimmed = value.trim();
      if (!trimmed) return null;
      try {
        const u = new URL(trimmed, window.location.href);
        if (u.protocol === "http:" || u.protocol === "https:") return u.href;
      } catch (_) {}
      return null;
    };

    let images = [];
    try { images = JSON.parse(dataEl.textContent.trim()); } catch (_) { images = []; }
    if (!Array.isArray(images)) return;
    images = images.map(toSafeImageUrl).filter(Boolean);
    if (images.length < 2) return;

    let preloaded = false;
    const preloadedImages = [];
    const preload = () => {
      if (preloaded) return;
      preloaded = true;
      images.forEach((src) => {
        const i = new Image();
        i.src = src;
        preloadedImages.push(i);
      });
    };

    let currentIndex = 0;
    let pointerInside = false;
    let rafPending = false;
    let pendingIndex = null;
    const link = card.querySelector(".br-card__link");
    let pointerDownX = 0;
    let moved = false;

    const applyImage = (n) => {
      if (n === currentIndex) return;
      currentIndex = n;
      const src = images[n];
      // Decode off-DOM first (when supported) so the swap doesn't show a
      // blank/flash frame while the browser fetches or decodes the image.
      const cached = preloadedImages[n];
      if (cached && cached.decode) {
        cached.decode().catch(() => {}).finally(() => {
          if (currentIndex === n) {
            img.src = src;
            img.dataset.cycleIndex = String(n);
          }
        });
      } else {
        img.src = src;
        img.dataset.cycleIndex = String(n);
      }
    };

    const setImage = (n) => {
      if (n < 0 || n >= images.length) return;
      pendingIndex = n;
      if (rafPending) return;
      rafPending = true;
      requestAnimationFrame(() => {
        rafPending = false;
        if (pendingIndex !== null) applyImage(pendingIndex);
        pendingIndex = null;
      });
    };

    const reset = () => {
      pointerInside = false;
      pendingIndex = null;
      applyImage(0);
    };

    const mapPointerToIndex = (clientX) => {
      const rect = frame.getBoundingClientRect();
      const ratio = Math.max(0, Math.min(0.9999, (clientX - rect.left) / rect.width));
      return Math.floor(ratio * images.length);
    };

    card.addEventListener("pointerenter", () => {
      pointerInside = true;
      preload();
    });
    card.addEventListener("pointerleave", reset);
    card.addEventListener("pointermove", (e) => {
      if (!pointerInside) return;
      setImage(mapPointerToIndex(e.clientX));
      if (e.pointerType !== "mouse" && Math.abs(e.clientX - pointerDownX) > 6) moved = true;
    });
    card.addEventListener("pointerdown", (e) => {
      if (e.pointerType === "mouse") return;
      pointerInside = true;
      preload();
      pointerDownX = e.clientX;
      moved = false;
      setImage(mapPointerToIndex(e.clientX));
    });
    card.addEventListener("pointerup", (e) => {
      if (e.pointerType === "mouse") return;
      if (moved && link) {
        const suppress = (ev) => {
          ev.preventDefault(); ev.stopPropagation();
          link.removeEventListener("click", suppress, true);
        };
        link.addEventListener("click", suppress, true);
        setTimeout(() => link.removeEventListener("click", suppress, true), 350);
      }
      reset();
    });
    card.addEventListener("pointercancel", reset);
  };

  // ------ Per-card video wiring ------

  const wireVideo = (card) => {
    if (!card.dataset.hasVideo) return;
    if (card.dataset.brVideoWired === "1") return;
    card.dataset.brVideoWired = "1";

    const video = card.querySelector("video[data-hover]");
    if (!video) return;

    const link = card.querySelector(".br-card__link");
    let pointerDownX = 0;
    let moved = false;

    const play = () => {
      if (!card.dataset.brActivated) activateDeferred(card);
      card.classList.add("is-hovering");
      video.play().catch(() => {});
    };
    const stop = () => {
      card.classList.remove("is-hovering");
      video.pause();
      video.currentTime = 0;
    };

    card.addEventListener("pointerenter", (e) => {
      if (e.pointerType === "mouse") play();
    });
    card.addEventListener("pointerleave", stop);
    card.addEventListener("pointerdown", (e) => {
      if (e.pointerType === "mouse") return;
      pointerDownX = e.clientX;
      moved = false;
      play();
    });
    card.addEventListener("pointermove", (e) => {
      if (e.pointerType !== "mouse" && Math.abs(e.clientX - pointerDownX) > 6) moved = true;
    });
    card.addEventListener("pointerup", (e) => {
      if (e.pointerType === "mouse") return;
      if (moved && link) {
        const suppress = (ev) => {
          ev.preventDefault(); ev.stopPropagation();
          link.removeEventListener("click", suppress, true);
        };
        link.addEventListener("click", suppress, true);
        setTimeout(() => link.removeEventListener("click", suppress, true), 350);
      }
      stop();
    });
    card.addEventListener("pointercancel", stop);
  };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }

  if (window.Shopify && Shopify.designMode) {
    document.addEventListener("shopify:section:load", (e) => {
      // e.target may be the Shopify section wrapper OR the section element itself.
      // Always clear the init guard so re-renders in the editor re-wire correctly.
      const sec = (e.target.classList && e.target.classList.contains("br-random"))
        ? e.target
        : e.target.querySelector(".br-random");
      if (sec) {
        delete sec.dataset.brInit;
        initSection(sec);
      } else {
        document.querySelectorAll(".br-random").forEach((s) => {
          delete s.dataset.brInit;
          initSection(s);
        });
      }
    });
  }
})();
