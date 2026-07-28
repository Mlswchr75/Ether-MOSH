/* ============================================================
   BRUTALIST QUICK VIEW
   Center-of-card tap zone -> modal with full gallery, options,
   pricing and add-to-cart. No page reloads.

   Design notes:
   - All card binding is delegated from `document`, so cards added
     later by the Load More AJAX need no re-wiring.
   - Only `click` is intercepted. pointerdown/move deliberately pass
     through so the existing horizontal image-scrub still works when
     a drag starts on the center zone.
   ============================================================ */
(function () {
  "use strict";

  if (window.__brQuickViewBooted) return;
  window.__brQuickViewBooted = true;

  var DRAG_TOLERANCE = 8; // px of movement that reclassifies a tap as a scrub
  var cache = Object.create(null);

  var state = {
    root: null,
    dialog: null,
    open: false,
    product: null,
    variant: null,
    selection: [],
    opener: null,
    fetchAbort: null,
    reqToken: 0,
    downX: 0,
    downY: 0,
    moved: false,
  };

  /* ---------------- helpers ---------------- */

  function routeRoot() {
    var r = (window.Shopify && window.Shopify.routes && window.Shopify.routes.root) || "/";
    return r.charAt(r.length - 1) === "/" ? r : r + "/";
  }

  function currencyCode() {
    var showcase = document.querySelector("[data-currency]");
    return (
      (window.Shopify && window.Shopify.currency && window.Shopify.currency.active) ||
      (showcase && showcase.getAttribute("data-currency")) ||
      "USD"
    );
  }

  function formatMoney(cents) {
    var amount = (Number(cents) || 0) / 100;
    try {
      return new Intl.NumberFormat(undefined, {
        style: "currency",
        currency: currencyCode(),
      }).format(amount);
    } catch (_) {
      return "$" + amount.toFixed(2);
    }
  }

  function sizeImage(url, width) {
    if (!url) return "";
    return String(url).replace(
      /(\.(jpg|jpeg|png|gif|webp|avif))(\?.*)?$/i,
      function (_m, ext, _e2, query) {
        return "_" + width + "x" + ext + (query || "");
      }
    );
  }

  function el(tag, className, text) {
    var node = document.createElement(tag);
    if (className) node.className = className;
    if (text != null) node.textContent = text;
    return node;
  }

  /* ---------------- modal shell ---------------- */

  function buildRoot() {
    if (state.root) return state.root;

    var root = el("div", "br-qv");
    root.setAttribute("aria-hidden", "true");
    root.innerHTML =
      '<div class="br-qv__backdrop" data-br-qv-close></div>' +
      '<div class="br-qv__dialog" role="dialog" aria-modal="true" aria-label="Product quick view">' +
      '<button type="button" class="br-qv__close" data-br-qv-close aria-label="Close quick view">&#10005;</button>' +
      '<div class="br-qv__body" data-br-qv-content></div>' +
      "</div>";

    document.body.appendChild(root);

    state.root = root;
    state.dialog = root.querySelector(".br-qv__dialog");

    root.addEventListener("click", function (e) {
      if (e.target.closest("[data-br-qv-close]")) {
        e.preventDefault();
        close();
      }
    });

    // Never let modal scrolling leak to the page behind it.
    root.addEventListener("wheel", function (e) { e.stopPropagation(); }, { passive: true });

    return root;
  }

  function content() {
    return state.root.querySelector("[data-br-qv-content]");
  }

  function lockScroll(on) {
    document.documentElement.classList.toggle("br-qv-locked", on);
    document.body.classList.toggle("br-qv-locked", on);
  }

  /* ---------------- open / close ---------------- */

  function open(handle, href, accent, opener) {
    if (!handle) {
      if (href) window.location.href = href;
      return;
    }

    buildRoot();
    state.opener = opener || null;
    state.root.style.setProperty("--br-qv-accent", accent || "#FF2BD6");

    if (!state.open) {
      state.open = true;
      state.root.classList.add("is-open");
      state.root.setAttribute("aria-hidden", "false");
      lockScroll(true);
      document.addEventListener("keydown", onKeydown, true);
    }

    var token = ++state.reqToken;
    renderLoading();

    if (state.fetchAbort) state.fetchAbort.abort();
    var ctrl = ("AbortController" in window) ? new AbortController() : null;
    state.fetchAbort = ctrl;

    var done = function (product) {
      if (token !== state.reqToken) return; // a newer open() superseded this one
      if (!product) return renderError(href);
      cache[handle] = product;
      renderProduct(product, href);
    };

    if (cache[handle]) return done(cache[handle]);

    fetch(routeRoot() + "products/" + encodeURIComponent(handle) + ".js", {
      credentials: "same-origin",
      headers: { Accept: "application/json" },
      signal: ctrl ? ctrl.signal : undefined,
    })
      .then(function (r) {
        if (!r.ok) throw new Error("HTTP " + r.status);
        return r.json();
      })
      .then(done)
      .catch(function (err) {
        if (err && err.name === "AbortError") return;
        if (token === state.reqToken) renderError(href);
      });
  }

  function close() {
    if (!state.open) return;
    state.open = false;
    state.reqToken++;
    if (state.fetchAbort) {
      state.fetchAbort.abort();
      state.fetchAbort = null;
    }
    state.root.classList.remove("is-open");
    state.root.setAttribute("aria-hidden", "true");
    lockScroll(false);
    document.removeEventListener("keydown", onKeydown, true);

    var opener = state.opener;
    state.opener = null;
    state.product = null;
    state.variant = null;

    // Return focus where the shopper left off.
    if (opener && document.contains(opener)) {
      var link = opener.closest(".br-card") &&
        opener.closest(".br-card").querySelector(".br-card__link");
      if (link && link.focus) {
        try { link.focus({ preventScroll: true }); } catch (_) { link.focus(); }
      }
    }
  }

  function onKeydown(e) {
    if (!state.open) return;
    if (e.key === "Escape" || e.key === "Esc") {
      e.preventDefault();
      close();
      return;
    }
    if (e.key !== "Tab") return;

    var focusables = state.dialog.querySelectorAll(
      'a[href], button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea:not(:disabled), [tabindex]:not([tabindex="-1"])'
    );
    if (!focusables.length) return;
    var first = focusables[0];
    var last = focusables[focusables.length - 1];

    if (e.shiftKey && document.activeElement === first) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault();
      first.focus();
    } else if (!state.dialog.contains(document.activeElement)) {
      e.preventDefault();
      first.focus();
    }
  }

  /* ---------------- render states ---------------- */

  function renderLoading() {
    content().innerHTML = '<div class="br-qv__loading">Loading</div>';
  }

  function renderError(href) {
    var box = el("div", "br-qv__error");
    box.appendChild(document.createTextNode("Could not load this product."));
    if (href) {
      var a = el("a", "br-qv__ghost", "Open full product page");
      a.href = href;
      a.style.marginTop = "18px";
      a.style.display = "inline-block";
      box.appendChild(a);
    }
    var c = content();
    c.innerHTML = "";
    c.appendChild(box);
    var closeBtn = state.dialog.querySelector(".br-qv__close");
    if (closeBtn) closeBtn.focus();
  }

  function renderProduct(product, href) {
    state.product = product;

    var variants = product.variants || [];
    var options = product.options || [];
    // Shopify returns options as strings on some versions, objects on others.
    var optionNames = options.map(function (o) {
      return typeof o === "string" ? o : (o && o.name) || "";
    });
    var hasRealOptions =
      optionNames.length > 0 &&
      !(optionNames.length === 1 &&
        variants.length === 1 &&
        (variants[0].title === "Default Title" || !variants[0].title));

    // Start on the first available variant, else the first one.
    var initial = null;
    for (var i = 0; i < variants.length; i++) {
      if (variants[i].available) { initial = variants[i]; break; }
    }
    if (!initial) initial = variants[0] || null;
    state.variant = initial;
    state.selection = initial ? (initial.options || []).slice() : [];

    var c = content();
    c.innerHTML = "";

    /* --- gallery --- */
    var gallery = el("div", "br-qv__gallery");
    gallery.setAttribute("data-br-qv-gallery", "");
    var imgs = (product.images || []).filter(Boolean);
    if (!imgs.length && product.featured_image) imgs = [product.featured_image];

    imgs.forEach(function (src, idx) {
      var im = el("img", "br-qv__img");
      im.src = sizeImage(src, 900);
      im.alt = (product.title || "") + " — image " + (idx + 1);
      im.loading = idx < 2 ? "eager" : "lazy";
      im.decoding = "async";
      im.setAttribute("data-src-key", String(src).split("?")[0]);
      gallery.appendChild(im);
    });
    c.appendChild(gallery);

    /* --- info --- */
    var info = el("div", "br-qv__info");

    var title = el("h2", "br-qv__title", product.title || "");
    info.appendChild(title);
    state.dialog.setAttribute("aria-label", (product.title || "Product") + " quick view");

    var price = el("div", "br-qv__price");
    price.setAttribute("data-br-qv-price", "");
    info.appendChild(price);

    if (hasRealOptions) {
      optionNames.forEach(function (name, optIndex) {
        var group = el("div", "br-qv__optgroup");
        group.appendChild(el("div", "br-qv__optname", name));

        var wrap = el("div", "br-qv__opts");
        var seen = Object.create(null);
        variants.forEach(function (v) {
          var value = (v.options || [])[optIndex];
          if (value == null || seen[value]) return;
          seen[value] = true;

          var btn = el("button", "br-qv__opt", value);
          btn.type = "button";
          btn.setAttribute("data-opt-index", String(optIndex));
          btn.setAttribute("data-opt-value", value);
          btn.setAttribute("aria-pressed", "false");
          btn.addEventListener("click", function () {
            state.selection[optIndex] = value;
            resolveVariant();
          });
          wrap.appendChild(btn);
        });

        group.appendChild(wrap);
        info.appendChild(group);
      });
    }

    var atc = el("button", "br-qv__atc", "Add to cart");
    atc.type = "button";
    atc.setAttribute("data-br-qv-atc", "");
    atc.addEventListener("click", addToCart);
    info.appendChild(atc);

    var status = el("div", "br-qv__status");
    status.setAttribute("data-br-qv-status", "");
    status.setAttribute("role", "status");
    status.setAttribute("aria-live", "polite");
    info.appendChild(status);

    var actions = el("div", "br-qv__actions");
    var cartLink = el("a", "br-qv__ghost", "View cart");
    cartLink.href = routeRoot() + "cart";
    actions.appendChild(cartLink);

    var full = el("a", "br-qv__ghost", "Full details");
    full.href = href || routeRoot() + "products/" + product.handle;
    actions.appendChild(full);

    var keep = el("button", "br-qv__ghost", "Keep browsing");
    keep.type = "button";
    keep.addEventListener("click", close);
    actions.appendChild(keep);
    info.appendChild(actions);

    if (product.description) {
      var desc = el("div", "br-qv__desc");
      desc.innerHTML = product.description;
      // Any link inside the description leaves the modal — make that explicit.
      desc.querySelectorAll("a[href]").forEach(function (a) {
        a.setAttribute("rel", "noopener");
      });
      info.appendChild(desc);
    }

    c.appendChild(info);

    syncOptionButtons();
    syncVariantUI();

    var firstOpt = info.querySelector(".br-qv__opt:not([data-unavailable='1'])") || atc;
    if (firstOpt && firstOpt.focus) {
      try { firstOpt.focus({ preventScroll: true }); } catch (_) {}
    }
  }

  /* ---------------- variant logic ---------------- */

  function resolveVariant() {
    var variants = (state.product && state.product.variants) || [];
    var sel = state.selection;

    var match = null;
    for (var i = 0; i < variants.length; i++) {
      var opts = variants[i].options || [];
      var ok = true;
      for (var j = 0; j < sel.length; j++) {
        if (sel[j] != null && opts[j] !== sel[j]) { ok = false; break; }
      }
      if (ok) { match = variants[i]; break; }
    }

    state.variant = match;
    syncOptionButtons();
    syncVariantUI();
    scrollGalleryToVariant();
  }

  // A value is offerable if some *available* variant carries it while
  // honouring every other currently-selected option.
  function syncOptionButtons() {
    if (!state.root) return;
    var variants = (state.product && state.product.variants) || [];
    var buttons = state.root.querySelectorAll(".br-qv__opt");

    buttons.forEach(function (btn) {
      var idx = parseInt(btn.getAttribute("data-opt-index"), 10);
      var value = btn.getAttribute("data-opt-value");

      btn.setAttribute("aria-pressed", state.selection[idx] === value ? "true" : "false");

      var offerable = variants.some(function (v) {
        if (!v.available) return false;
        var opts = v.options || [];
        if (opts[idx] !== value) return false;
        for (var j = 0; j < state.selection.length; j++) {
          if (j === idx) continue;
          if (state.selection[j] != null && opts[j] !== state.selection[j]) return false;
        }
        return true;
      });

      if (offerable) btn.removeAttribute("data-unavailable");
      else btn.setAttribute("data-unavailable", "1");
    });
  }

  function syncVariantUI() {
    if (!state.root) return;
    var priceBox = state.root.querySelector("[data-br-qv-price]");
    var atc = state.root.querySelector("[data-br-qv-atc]");
    var v = state.variant;

    if (priceBox) {
      priceBox.innerHTML = "";
      if (v) {
        priceBox.appendChild(document.createTextNode(formatMoney(v.price)));
        if (v.compare_at_price && Number(v.compare_at_price) > Number(v.price)) {
          priceBox.appendChild(el("span", "br-qv__price-compare", formatMoney(v.compare_at_price)));
          var pct = Math.round((1 - Number(v.price) / Number(v.compare_at_price)) * 100);
          if (pct > 0) priceBox.appendChild(el("span", "br-qv__badge", "Save " + pct + "%"));
        }
      } else {
        priceBox.textContent = "—";
      }
    }

    if (atc) {
      if (!v) {
        atc.disabled = true;
        atc.textContent = "Unavailable";
      } else if (!v.available) {
        atc.disabled = true;
        atc.textContent = "Sold out";
      } else {
        atc.disabled = false;
        atc.textContent = "Add to cart";
      }
    }

    setStatus("", null);
  }

  function scrollGalleryToVariant() {
    var v = state.variant;
    var gallery = state.root && state.root.querySelector("[data-br-qv-gallery]");
    if (!v || !gallery || !v.featured_image || !v.featured_image.src) return;
    var key = String(v.featured_image.src).split("?")[0];
    var target = gallery.querySelector('[data-src-key="' + key.replace(/"/g, '\\"') + '"]');
    if (target) gallery.scrollTo({ top: target.offsetTop - gallery.offsetTop, behavior: "smooth" });
  }

  function setStatus(msg, tone) {
    var box = state.root && state.root.querySelector("[data-br-qv-status]");
    if (!box) return;
    box.textContent = msg || "";
    if (tone) box.setAttribute("data-tone", tone);
    else box.removeAttribute("data-tone");
  }

  /* ---------------- add to cart ---------------- */

  function addToCart() {
    var v = state.variant;
    if (!v || !v.available) return;

    var atc = state.root.querySelector("[data-br-qv-atc]");
    if (atc) {
      atc.disabled = true;
      atc.textContent = "Adding…";
    }
    setStatus("", null);

    fetch(routeRoot() + "cart/add.js", {
      method: "POST",
      credentials: "same-origin",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({ items: [{ id: v.id, quantity: 1 }] }),
    })
      .then(function (r) {
        return r.json().then(function (data) {
          if (!r.ok) throw new Error(data && data.description ? data.description : "Could not add to cart");
          return data;
        });
      })
      .then(function () {
        setStatus("Added to cart", "ok");
        if (atc) {
          atc.textContent = "Added ✓";
          setTimeout(function () {
            if (!state.root || !state.open) return;
            var cur = state.root.querySelector("[data-br-qv-atc]");
            if (cur === atc && state.variant && state.variant.available) {
              atc.disabled = false;
              atc.textContent = "Add to cart";
            }
          }, 1600);
        }
        return refreshCart();
      })
      .catch(function (err) {
        setStatus((err && err.message) || "Could not add to cart", "err");
        if (atc) {
          atc.disabled = false;
          atc.textContent = "Add to cart";
        }
      });
  }

  // Tell the surrounding theme the cart changed, without assuming which
  // cart implementation it uses.
  function refreshCart() {
    return fetch(routeRoot() + "cart.js", {
      credentials: "same-origin",
      headers: { Accept: "application/json" },
    })
      .then(function (r) { return r.json(); })
      .then(function (cart) {
        var count = cart && typeof cart.item_count === "number" ? cart.item_count : null;
        if (count != null) {
          document
            .querySelectorAll(
              ".cart-count, .cart-count-bubble span:not(.visually-hidden), [data-cart-count], .js-cart-count, #CartCount"
            )
            .forEach(function (node) {
              node.textContent = String(count);
              node.classList.remove("hidden", "is-empty");
            });
        }
        document.dispatchEvent(new CustomEvent("cart:updated", { detail: { cart: cart } }));
        document.dispatchEvent(new CustomEvent("cart:refresh", { bubbles: true }));
        if (window.PubSub && typeof window.PubSub.publish === "function") {
          try { window.PubSub.publish("cart-update", { cart: cart }); } catch (_) {}
        }
        return cart;
      })
      .catch(function () { /* count refresh is best-effort */ });
  }

  /* ---------------- card binding (delegated) ---------------- */

  // Track drag distance so a horizontal image-scrub that starts on the
  // center zone never opens the modal.
  document.addEventListener(
    "pointerdown",
    function (e) {
      var zone = e.target.closest && e.target.closest("[data-br-qv]");
      if (!zone) return;
      state.downX = e.clientX;
      state.downY = e.clientY;
      state.moved = false;
    },
    true
  );

  document.addEventListener(
    "pointermove",
    function (e) {
      if (state.moved) return;
      if (
        Math.abs(e.clientX - state.downX) > DRAG_TOLERANCE ||
        Math.abs(e.clientY - state.downY) > DRAG_TOLERANCE
      ) {
        state.moved = true;
      }
    },
    true
  );

  // Capture phase: run before the card's own handlers and before the
  // wrapping <a> can navigate.
  document.addEventListener(
    "click",
    function (e) {
      var zone = e.target.closest && e.target.closest("[data-br-qv]");
      if (!zone) return;

      e.preventDefault();
      e.stopPropagation();

      if (state.moved) {
        state.moved = false;
        return; // that was a scrub, not a tap
      }

      var card = zone.closest(".br-card");
      var link = card && card.querySelector(".br-card__link");
      var handle =
        zone.getAttribute("data-product-handle") ||
        (card && card.getAttribute("data-product-handle")) ||
        handleFromHref(link && link.getAttribute("href"));
      var accent =
        (card && getComputedStyle(card).getPropertyValue("--br-accent-card").trim()) || "";

      open(handle, link && link.getAttribute("href"), accent, zone);
    },
    true
  );

  function handleFromHref(href) {
    if (!href) return "";
    var m = String(href).match(/\/products\/([^/?#]+)/);
    return m ? m[1] : "";
  }

  // Expose a tiny API for debugging / other sections.
  window.BrutalistQuickView = { open: open, close: close };
})();
