/*!
 * MuffinEMU site — interaction layer.
 *
 * One rAF-throttled scroll loop drives everything scroll-linked (header
 * state, progress line, parallax, the pinned feature rail). Reveals use
 * IntersectionObserver. Pointer effects only run on fine pointers, and
 * nothing here runs its motion under prefers-reduced-motion.
 */
(function () {
  "use strict";

  var doc = document, root = doc.documentElement, body = doc.body;
  var T = window.MuffinThemes;
  if (!T) return;
  // Reveal-on-scroll only hides content once this script is actually running,
  // so a browser that can't run it (or a failed load) still shows everything.
  document.documentElement.classList.add("reveal-ready");
  var base = body.getAttribute("data-base") || "";
  var reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  var finePointer = window.matchMedia("(hover: hover) and (pointer: fine)").matches;

  function $(s, c) { return (c || doc).querySelector(s); }
  function $$(s, c) { return Array.prototype.slice.call((c || doc).querySelectorAll(s)); }

  /* ---------------------------------------------------------- toast */
  // Created up front: a live region only announces changes made after it exists.
  var toastEl = doc.createElement("div"), toastTimer;
  toastEl.className = "toast";
  toastEl.setAttribute("role", "status");
  body.appendChild(toastEl);
  function toast(msg) {
    toastEl.textContent = msg;
    toastEl.classList.add("show");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { toastEl.classList.remove("show"); }, 3200);
  }

  /* ------------------------------------------- theme + mode switching */
  // A circular reveal from the point of interaction when View Transitions
  // exist; otherwise the registered colour properties cross-fade.
  var vtRunning = false;
  function withReveal(evt, fn) {
    // One reveal at a time: a switch during a running reveal just applies.
    if (reduced || vtRunning || doc.hidden || !doc.startViewTransition) { fn(); return; }
    var x = window.innerWidth / 2, y = 80;
    if (evt && evt.clientX) { x = evt.clientX; y = evt.clientY; }
    else if (evt && evt.currentTarget && evt.currentTarget.getBoundingClientRect) {
      var r = evt.currentTarget.getBoundingClientRect(); x = r.left + r.width / 2; y = r.top + r.height / 2;
    }
    var rr = Math.hypot(Math.max(x, window.innerWidth - x), Math.max(y, window.innerHeight - y));
    root.style.setProperty("--rx", x + "px");
    root.style.setProperty("--ry", y + "px");
    root.style.setProperty("--rr", rr + "px");
    root.classList.add("theme-reveal");
    vtRunning = true;
    var vt;
    try { vt = doc.startViewTransition(fn); }
    catch (e) { root.classList.remove("theme-reveal"); vtRunning = false; fn(); return; }
    vt.finished.catch(function () {}).then(function () { root.classList.remove("theme-reveal"); vtRunning = false; });
  }
  function setTheme(id, evt) {
    withReveal(evt, function () { T.setById(id, true); });
  }

  var modeBtn = $("[data-mode-cycle]");
  if (modeBtn) {
    var order = ["auto", "dark", "light"], wanted = T.getMode();
    var nextOf = function (m) { return order[(order.indexOf(m) + 1) % order.length]; };
    var labelMode = function () {
      var m = T.getMode();
      modeBtn.setAttribute("aria-label", "Colour mode: " + m + ". Switch to " + nextOf(m));
    };
    labelMode();
    modeBtn.addEventListener("click", function (e) {
      var next = wanted = nextOf(wanted);
      withReveal(e, function () { T.setMode(next, true); labelMode(); });
      toast("Colour mode: " + next);
    });
  }

  /* ---------------------------------------------------- mobile nav */
  var navToggle = $("[data-nav-toggle]");
  function closeDropdowns(except) {
    $$(".nav-dropdown[open]").forEach(function (d) { if (d !== except) d.removeAttribute("open"); });
  }
  function closeNav(refocus) {
    if (!body.classList.contains("nav-open")) return;
    body.classList.remove("nav-open");
    if (navToggle) { navToggle.setAttribute("aria-expanded", "false"); if (refocus) navToggle.focus(); }
  }
  if (navToggle) {
    navToggle.addEventListener("click", function () {
      var open = body.classList.toggle("nav-open");
      navToggle.setAttribute("aria-expanded", open ? "true" : "false");
      if (open) { var first = $(".site-nav a, .site-nav summary"); if (first) first.focus(); }
      else closeDropdowns();
    });
  }
  doc.addEventListener("click", function (e) {
    closeDropdowns(e.target.closest && e.target.closest(".nav-dropdown"));
    if (!e.target.closest(".site-header")) closeNav(false);
  });
  doc.addEventListener("focusin", function (e) {
    closeDropdowns(e.target.closest && e.target.closest(".nav-dropdown"));
    if (body.classList.contains("nav-open") && !e.target.closest(".site-header")) closeNav(false);
  });
  doc.addEventListener("keydown", function (e) {
    if (e.key !== "Escape" || (dlgOpen && dlgOpen())) return;
    var d = $(".nav-dropdown[open]");
    if (d) { d.removeAttribute("open"); d.querySelector("summary").focus(); }
    else closeNav(true);
  });
  $$(".site-nav a").forEach(function (a) { a.addEventListener("click", function () { closeNav(false); closeDropdowns(); }); });
  // Restored from the back/forward cache, or widened past the mobile layout: start closed.
  window.addEventListener("pageshow", function () { closeNav(false); closeDropdowns(); });
  var desktop = matchMedia("(min-width: 901px)");
  if (desktop.addEventListener) desktop.addEventListener("change", function (m) { if (m.matches) closeNav(false); });
  var dlgOpen = null;

  /* ----------------------------------------------------- scroll loop */
  var header = $(".site-header");
  var heroVisual = $(".hero-visual");
  var rail = $("[data-rail]");
  var railTrack = rail && $(".rail-track", rail);
  var railCount = rail && $("[data-rail-index]", rail);
  var railCards = railTrack ? $$(".card", railTrack) : [];
  var railActive = matchMedia("(min-width: 901px) and (min-height: 641px)");
  var railDistance = 0, railTop = 0;
  var progressEl = $(".progress");
  // Only the elements that use the scroll offset get it, so a scroll frame
  // restyles three elements instead of the whole page.
  var syEls = $$(".backdrop .grid-lines, .hero-visual, .scroll-cue");

  function sizeRail() {
    if (!rail) return;
    if (reduced || !railActive.matches) { rail.style.height = ""; railDistance = 0; railTrack.style.removeProperty("--rail-x"); return; }
    railDistance = Math.max(0, railTrack.scrollWidth - doc.documentElement.clientWidth);
    rail.style.height = (window.innerHeight + railDistance) + "px";
    railTop = rail.getBoundingClientRect().top + window.scrollY;
  }

  var ticking = false;
  function onScroll() {
    if (ticking) return;
    ticking = true;
    requestAnimationFrame(function () {
      ticking = false;
      var sy = window.scrollY;
      var max = Math.max(1, root.scrollHeight - window.innerHeight);
      if (progressEl) progressEl.style.setProperty("--progress", (sy / max).toFixed(4));
      if (header) body.classList.toggle("scrolled", sy > 24);
      if (!reduced && sy < 2400) syEls.forEach(function (el) { el.style.setProperty("--sy", sy.toFixed(1)); });
      if (rail && railDistance > 0) {
        var p = Math.min(1, Math.max(0, (sy - railTop) / railDistance));
        railTrack.style.setProperty("--rail-x", (-p * railDistance).toFixed(1) + "px");
        rail.style.setProperty("--rail", p.toFixed(4));
        if (railCount && railCards.length) {
          var n = Math.min(railCards.length, Math.round(p * (railCards.length - 1)) + 1);
          railCount.textContent = (n < 10 ? "0" : "") + n;
        }
      }
    });
  }
  sizeRail();
  onScroll();
  window.addEventListener("scroll", onScroll, { passive: true });
  window.addEventListener("resize", function () { sizeRail(); onScroll(); });
  railActive.addEventListener && railActive.addEventListener("change", function () { sizeRail(); onScroll(); });
  if (doc.fonts && doc.fonts.ready) doc.fonts.ready.then(function () { sizeRail(); onScroll(); });
  window.addEventListener("load", function () { sizeRail(); onScroll(); });

  // Tabbing into a rail card scrolls the page to the point where that card is
  // in view, rather than letting the browser scroll the clipped track.
  if (rail) {
    railTrack.addEventListener("focusin", function (e) {
      var c = e.target.closest(".card");
      if (!c || !railDistance) return;
      var need = c.offsetLeft + c.offsetWidth - doc.documentElement.clientWidth + 48;
      var p = Math.min(1, Math.max(0, need / railDistance));
      var y = railTop + p * railDistance;
      if ("scrollBehavior" in root.style) window.scrollTo({ top: y, behavior: reduced ? "auto" : "smooth" });
      else window.scrollTo(0, y);
    });
  }

  /* --------------------------------------------------------- reveals */
  var revealEls = $$("[data-reveal]");
  if (reduced || !("IntersectionObserver" in window)) {
    revealEls.forEach(function (el) { el.classList.add("in"); });
  } else {
    // Anything already on screen when the page loads (including a reload
    // that restores the scroll position) shows at once, without animating.
    var vh = window.innerHeight;
    // Once revealed, the element drops [data-reveal] so its own transitions
    // (card hover, lift) apply again without the reveal's delay.
    var done = function (el, wait) { setTimeout(function () { el.removeAttribute("data-reveal"); el.classList.remove("in", "instant"); }, wait); };
    revealEls.forEach(function (el) {
      var r = el.getBoundingClientRect();
      if (r.top < vh && r.bottom > 0) { el.classList.add("instant", "in"); done(el, 0); }
    });
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (en) {
        if (!en.isIntersecting) return;
        en.target.classList.add("in"); io.unobserve(en.target);
        done(en.target, 900 + (parseInt(en.target.style.getPropertyValue("--i"), 10) || 0) * 60);
      });
    }, { rootMargin: "0px 0px -8% 0px", threshold: 0.12 });
    revealEls.forEach(function (el) { if (!el.classList.contains("in")) io.observe(el); });
  }
  // Stagger siblings that share a [data-stagger] parent.
  $$("[data-stagger]").forEach(function (p) {
    $$(":scope > [data-reveal]", p).forEach(function (el, i) { el.style.setProperty("--i", i); });
  });

  /* ------------------------------------------------- pointer effects */
  if (finePointer && !reduced) {
    // One measurement per frame at most, however fast the pointer moves.
    var lastMove = null, moveQueued = false;
    doc.addEventListener("pointermove", function (e) {
      lastMove = e;
      if (moveQueued) return;
      moveQueued = true;
      requestAnimationFrame(function () {
        moveQueued = false;
        var ev = lastMove, card = ev.target.closest && ev.target.closest(".card");
        if (!card) return;
        var r = card.getBoundingClientRect();
        card.style.setProperty("--x", (ev.clientX - r.left) + "px");
        card.style.setProperty("--y", (ev.clientY - r.top) + "px");
      });
    }, { passive: true });

    $$(".btn").forEach(function (b) {
      b.addEventListener("pointermove", function (e) {
        var r = b.getBoundingClientRect();
        b.style.setProperty("--mx", ((e.clientX - r.left - r.width / 2) * 0.18).toFixed(1) + "px");
        b.style.setProperty("--my", ((e.clientY - r.top - r.height / 2) * 0.28).toFixed(1) + "px");
      });
      b.addEventListener("pointerleave", function () { b.style.setProperty("--mx", "0px"); b.style.setProperty("--my", "0px"); });
    });

  }

  /* ------------------------------------------------------ hero icon */
  /* The icon behaves like a physical object. Each property (tilt, drift,
     lift, highlight) is a damped spring stepped with the real frame time, so
     it moves the same at 60, 120 or 144 Hz and settles with a slight
     overshoot. With a mouse, the icon turns toward the cursor anywhere on the
     page (strength levels off with distance, so there is no edge to snap at),
     drifts a few pixels toward it and lifts as it gets close. With no cursor
     (touch screens, or the mouse is away) it sways gently on its own. A click
     gives it a small squash. The loop sleeps when the hero is off screen or
     the tab is hidden, and none of this runs under reduced motion. */
  var heroIcon0 = heroVisual && $(".hero-icon", heroVisual);
  if (heroIcon0 && !reduced) (function () {
    var icon = heroIcon0;
    function Spring(stiff, damp) { this.x = 0; this.v = 0; this.k = stiff; this.c = damp; this.to = 0; }
    Spring.prototype.step = function (dt) {
      var a = this.k * (this.to - this.x) - this.c * this.v;
      this.v += a * dt; this.x += this.v * dt;
    };
    Spring.prototype.rest = function () { return Math.abs(this.to - this.x) < 0.002 && Math.abs(this.v) < 0.002; };
    // Stiffness/damping: ~0.85 of critical damping gives a soft, slight overshoot.
    // Softer than before (it felt twitchy); damping kept at the same ratio of critical.
    var rx = new Spring(90, 16), ry = new Spring(90, 16);
    var tx = new Spring(75, 15), ty = new Spring(75, 15);
    var lift = new Spring(220, 22); lift.x = lift.to = 1;
    var springs = [rx, ry, tx, ty, lift];

    var pointer = null, lastMove = 0, raf = 0, last = 0, t0 = performance.now();
    var IDLE_AFTER = 2600; // ms without mouse movement before the idle sway takes over

    function aim(now) {
      var mouseActive = pointer && now - lastMove < IDLE_AFTER;
      if (mouseActive) {
        var r = heroVisual.getBoundingClientRect();
        var cx = r.left + r.width / 2, cy = r.top + r.height / 2;
        var dx = pointer.x - cx, dy = pointer.y - cy, reach = Math.max(420, r.width * 1.75);
        var dist = Math.sqrt(dx * dx + dy * dy);
        var near = Math.exp(-Math.pow(dist / (r.width * 0.42), 2)); // 1 over the icon, ~0 far away
        var max = 7 + 4.5 * near;
        ry.to = max * Math.tanh(dx / reach);
        rx.to = -max * Math.tanh(dy / reach);
        tx.to = 6 * Math.tanh(dx / reach);
        ty.to = 6 * Math.tanh(dy / reach);
        lift.to = 1 + 0.045 * near;
      } else {
        // Idle sway: two slow, unrelated sines, so it never looks like a loop.
        var t = (now - t0) / 1000;
        ry.to = 7 * Math.sin(t * 0.55) + 2 * Math.sin(t * 1.3);
        rx.to = 4.5 * Math.sin(t * 0.41 + 1.2);
        tx.to = 3 * Math.sin(t * 0.55);
        ty.to = 0;
        lift.to = 1;
      }
    }

    function frame(now) {
      raf = 0;
      if (heroVisual.classList.contains("paused") || doc.hidden) { last = 0; return; }
      var dt = last ? Math.min(0.034, (now - last) / 1000) : 1 / 60;
      last = now;
      aim(now);
      // Two half-steps per frame keep the springs stable at low frame rates.
      for (var i = 0; i < 2; i++) springs.forEach(function (s) { s.step(dt / 2); });
      icon.style.setProperty("--tiltX", rx.x.toFixed(3) + "deg");
      icon.style.setProperty("--tiltY", ry.x.toFixed(3) + "deg");
      icon.style.setProperty("--tx", tx.x.toFixed(2) + "px");
      icon.style.setProperty("--ty", ty.x.toFixed(2) + "px");
      icon.style.setProperty("--lift", lift.x.toFixed(4));
      // The highlight slides opposite the tilt, as a reflection would.
      icon.style.setProperty("--gx", (-12 - ry.x * 1.6).toFixed(2) + "%");
      icon.style.setProperty("--gy", (-12 + rx.x * 1.6).toFixed(2) + "%");
      raf = requestAnimationFrame(frame);
    }
    function wake() { if (!raf) { last = 0; raf = requestAnimationFrame(frame); } }

    if (finePointer) {
      window.addEventListener("pointermove", function (e) {
        if (e.pointerType && e.pointerType !== "mouse" && e.pointerType !== "pen") return;
        pointer = { x: e.clientX, y: e.clientY };
        lastMove = performance.now();
        wake();
      }, { passive: true });
      var away = function () { pointer = null; };
      doc.documentElement.addEventListener("mouseleave", away);
      window.addEventListener("blur", away);
    }
    // A click squashes it a little and lets the spring bounce it back.
    heroVisual.addEventListener("pointerdown", function () { lift.v -= 1.6; wake(); });

    // The pause observer toggles .paused; restart the loop when it comes back.
    if ("MutationObserver" in window) {
      new MutationObserver(function () { if (!heroVisual.classList.contains("paused")) wake(); })
        .observe(heroVisual, { attributes: true, attributeFilter: ["class"] });
    }
    doc.addEventListener("visibilitychange", function () { if (!doc.hidden) wake(); });
    wake();
  })();

  /* --------------------------------------- pause offscreen animation */
  var anims = $$("[data-anim]");
  if (anims.length && "IntersectionObserver" in window) {
    var aio = new IntersectionObserver(function (entries) {
      entries.forEach(function (en) { en.target.classList.toggle("paused", !en.isIntersecting); });
    }, { rootMargin: "100px 0px" });
    anims.forEach(function (el) { aio.observe(el); });
  }
  doc.addEventListener("visibilitychange", function () { root.classList.toggle("tab-hidden", doc.hidden); });

  /* --------------------------------------------- marquee pause button */
  $$("[data-marquee-toggle]").forEach(function (b) {
    b.addEventListener("click", function () {
      var on = b.getAttribute("aria-pressed") !== "true";
      b.setAttribute("aria-pressed", on ? "true" : "false");
      b.closest(".marquee").classList.toggle("held", on);
      b.querySelector(".visually-hidden").textContent = on ? "Play the moving highlights" : "Pause the moving highlights";
    });
  });

  /* ------------------------------------------------------ count-up */
  $$("[data-count]").forEach(function (el) {
    var target = parseInt(el.getAttribute("data-count"), 10);
    var suffix = el.getAttribute("data-suffix") || "";
    if (reduced || !("IntersectionObserver" in window)) { el.textContent = target + suffix; return; }
    el.textContent = "0" + suffix;
    var o = new IntersectionObserver(function (en) {
      if (!en[0].isIntersecting) return;
      o.disconnect();
      var t0 = performance.now(), dur = 1400;
      (function step(now) {
        var k = Math.min(1, (now - t0) / dur);
        var eased = 1 - Math.pow(1 - k, 4);
        el.textContent = Math.round(target * eased) + suffix;
        if (k < 1) requestAnimationFrame(step);
      })(t0);
    }, { threshold: 0.6 });
    o.observe(el);
  });

  /* --------------------------------------------------- copy buttons */
  $$("[data-copy]").forEach(function (b) {
    b.addEventListener("click", function () {
      var text = b.getAttribute("data-copy");
      (navigator.clipboard ? navigator.clipboard.writeText(text) : Promise.reject())
        .then(function () { toast("Source URL copied"); })
        .catch(function () {
          var code = b.parentNode.querySelector("code");
          if (code) { var r = doc.createRange(); r.selectNodeContents(code); var sel = getSelection(); sel.removeAllRanges(); sel.addRange(r); }
          toast("Press ⌘C / Ctrl+C to copy the selected URL");
        });
    });
  });

  /* ------------------------------------------------------ theme lab */
  function swatchOf(t) {
    var light = T.isLight(), k = light ? 0 : 1;
    if (t.stops) {
      var b = (light ? t.stops.light : t.stops.dark).slice(0, 7);
      return "conic-gradient(" + b.concat(b[0]).join(", ") + ")";
    }
    return "linear-gradient(135deg, " + t.top[k] + ", " + t.bottom[k] + ")";
  }
  // The app's real background for the current mode.
  function previewBg(t) { return T.backgroundOf(t, T.isLight()); }

  var orbs = $("[data-orbs]");
  var lab = $("[data-lab]");
  if (orbs) {
    T.THEMES.forEach(function (t) {
      var b = doc.createElement("button");
      b.type = "button";
      b.className = "orb-btn";
      b.style.setProperty("--sw", swatchOf(t));
      b.setAttribute("data-theme-option", t.id);
      b.setAttribute("aria-label", t.name + (t.pro ? " (Pro icon)" : ""));
      b._theme = t;
      b.title = t.name;
      if (t.pro) { var s = doc.createElement("span"); s.className = "pro"; s.textContent = "PRO"; s.title = "Pro icon, unlocked with a code"; s.setAttribute("aria-hidden", "true"); b.appendChild(s); }
      b.addEventListener("click", function (e) { setTheme(t.id, e); });
      orbs.appendChild(b);
    });
  }

  /* -------------------------------------------- docs: themes grid */
  var themeGrid = $("#themeGrid");
  if (themeGrid) {
    themeGrid.setAttribute("role", "group");
    themeGrid.setAttribute("aria-label", "All themes");
    T.THEMES.forEach(function (t) {
      var b = doc.createElement("button");
      b.type = "button"; b.className = "theme-swatch"; b.title = "Apply " + t.name;
      b.setAttribute("data-theme-option", t.id);
      var bg = doc.createElement("span"); bg.className = "swatch-bg";
      b._bg = bg; b._theme = t;
      var label = doc.createElement("span"); label.className = "swatch-label";
      var nm = doc.createElement("span"); nm.textContent = t.name; label.appendChild(nm);
      if (t.pro) { var p = doc.createElement("span"); p.className = "pro-badge"; p.textContent = "Pro icon"; label.appendChild(p); }
      b.appendChild(bg); b.appendChild(label);
      b.addEventListener("click", function (e) { setTheme(t.id, e); });
      themeGrid.appendChild(b);
    });
  }

  function syncTheme(t) {
    var k = T.isLight() ? 0 : 1;
    $$("[data-theme-option]").forEach(function (el) {
      el.setAttribute("aria-pressed", el.getAttribute("data-theme-option") === t.id ? "true" : "false");
      if (el._bg) el._bg.style.background = previewBg(el._theme);
      else if (el._theme) el.style.setProperty("--sw", swatchOf(el._theme));
    });
    $$("[data-theme-name]").forEach(function (el) { el.textContent = t.name; });
    $$("[data-palette-open='theme ']").forEach(function (b) { b.setAttribute("aria-label", "Theme: " + t.name + ". Choose a theme"); });
    var heroFace = $(".hero-face");
    if (heroFace) swapImg(heroFace, "hero-img", iconSrc(t), 192);
    if (lab) {
      // The preview is a small piece of the app in this theme: its background,
      // a card (cream, wrapper stroke, brown text) and a primary button
      // (muffinTopGradient with sparkleCream text).
      lab.style.setProperty("--lab-bg", previewBg(t));
      lab.style.setProperty("--lp-card", t.cream[k]);
      lab.style.setProperty("--lp-stroke", t.wrapper[k]);
      lab.style.setProperty("--lp-text", t.brownDarkest[k]);
      lab.style.setProperty("--lp-sub", t.brownDark[k]);
      var d = T.derive(t, k === 0);
      lab.style.setProperty("--lp-b1", d.b1);
      lab.style.setProperty("--lp-b2", d.b2);
      lab.style.setProperty("--lp-on", d.onB);
      var sw = $$(".lp-swatches i", lab);
      [[t.top, "Background"], [t.muffinTop, "Buttons"], [t.cream, "Cards"], [t.pixel, "Accent"]].forEach(function (p, i) {
        if (sw[i]) { sw[i].style.background = p[0][k]; sw[i].title = p[1] + " " + p[0][k]; }
      });
      var stage = $(".lp-stage", lab), mini = $(".lp-mini", lab);
      if (stage) swapImg(stage, "lp-icon", iconSrc(t), 192);
      if (mini) mini.src = iconSrc(t);
      var nm = $(".lp-name", lab); if (nm) nm.textContent = t.name;
      var sub = $(".lp-sub", lab);
      if (sub) sub.textContent = (T.current() + 1) + " / " + T.THEMES.length + (t.pro ? " · Pro icon, unlocked with a code" : "");
    }
  }
  // Each theme has a matching app icon with the same id (Bakery is the main icon).
  function iconSrc(t, variant) {
    var v = variant != null ? variant : (T.isLight() ? "" : "-dark");
    return base + "assets/icons/" + t.id + v + ".svg";
  }
  var preloaded = {};
  function preload(t) { if (!preloaded[t.id]) { preloaded[t.id] = new Image(); preloaded[t.id].src = iconSrc(t); } }
  // Cross-fade an icon inside `box`: the new image animates in over the old one,
  // which animates out and is removed. Swaps only once the new image has
  // decoded, so it never flashes blank.
  function swapImg(box, cls, src, size) {
    var abs = new URL(src, location.href).href;
    if (box._want === abs) return;
    var cur = $("img." + cls + ":not(.out)", box);
    if (!box._want && cur && cur.src === abs) { box._want = abs; return; }
    box._want = abs;
    var img = doc.createElement("img");
    img.className = cls + " swap-in"; img.alt = ""; img.width = size; img.height = size; img.src = src;
    function show() {
      if (box._want !== abs) return;  // a newer switch won the race
      $$("img." + cls, box).forEach(function (o) {
        if (reduced || doc.hidden) { o.remove(); return; }
        o.classList.add("out");
        o.addEventListener("animationend", function () { o.remove(); }, { once: true });
        // animationend never fires if animations are paused or disabled.
        setTimeout(function () { if (o.parentNode) o.remove(); }, 900);
      });
      box.appendChild(img);
    }
    if (img.decode) img.decode().then(show, show); else show();
  }
  if (orbs) {
    $$(".orb-btn", orbs).forEach(function (b, i) {
      var t = T.THEMES[i];
      b.addEventListener("pointerenter", function () { preload(t); });
      b.addEventListener("focus", function () { preload(t); });
    });
  }

  T.paintIcons();
  T.onChange(syncTheme);
  syncTheme(T.THEMES[T.current()]);

  /* --------------------------- docs: current page visible in the sidebar */
  var side = $(".docs-sidebar"), curLink = side && $("a[aria-current='page']", side);
  if (curLink && side.scrollWidth > side.clientWidth) {
    side.scrollLeft = curLink.offsetLeft - (side.clientWidth - curLink.offsetWidth) / 2;
  }

  /* --------------------------------------------- docs: anchors + toc */
  var usedIds = {};
  $$("[id]").forEach(function (el) { usedIds[el.id] = true; });
  function slug(text) {
    var base0 = text.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 48) || "section", id = base0, n = 2;
    while (usedIds[id]) id = base0 + "-" + n++;
    usedIds[id] = true;
    return id;
  }
  // Every visible h2 in <main> gets an id (for the palette and for linking).
  $$("main h2:not(.visually-hidden)").forEach(function (h) {
    if (!h.id && !(h.parentNode.tagName === "SECTION" && h.parentNode.id)) h.id = slug(h.textContent);
  });
  // Plain selectors (no :is()) so iOS 12-13 Safari can run this.
  $$(".docs-content h2[id], .docs-content h3[id], .docs-content section[id] > h2").forEach(function (h) {
    var a = doc.createElement("a");
    a.className = "anchor"; a.href = "#" + (h.id || h.parentNode.id); a.textContent = "#";
    a.setAttribute("aria-hidden", "true"); a.tabIndex = -1;
    h.appendChild(a);
  });
  var tocLinks = $$(".docs-toc a[href^='#']");
  if (tocLinks.length && "IntersectionObserver" in window) {
    var map = {};
    tocLinks.forEach(function (a) { map[a.getAttribute("href").slice(1)] = a; });
    var targets = Object.keys(map).map(function (id) { return doc.getElementById(id); }).filter(Boolean);
    var tio = new IntersectionObserver(function (entries) {
      entries.forEach(function (en) {
        if (en.isIntersecting) {
          tocLinks.forEach(function (a) { a.classList.remove("active"); a.removeAttribute("aria-current"); });
          map[en.target.id].classList.add("active");
          map[en.target.id].setAttribute("aria-current", "location");
        }
      });
    }, { rootMargin: "-20% 0px -70% 0px" });
    targets.forEach(function (t) { tio.observe(t); });
  }

  /* -------------------------------------------------- command palette */
  var PAGES = [
    ["Home", "index.html", "Overview, install, status"],
    ["Installation", "docs/installation.html", "SideStore, AltStore, LiveContainer, TrollStore, JIT"],
    ["Documentation", "docs/index.html", "Every guide"],
    ["Features overview", "docs/features.html", "Library, importer, packs, DLC"],
    ["Screen Layout", "docs/screen-layout.html", "TV + GamePad screens, second display"],
    ["Save States", "docs/save-states.html", "4 slots per game"],
    ["Controls & GamePad", "docs/controls.html", "Measured pad, skins, Melo-Controller"],
    ["Themes & Icons", "docs/themes.html", "31 themes"],
    ["Troubleshooting", "docs/troubleshooting.html", "Launch, JIT, logs"],
    ["FAQ", "docs/faq.html", "Common questions"],
    ["Open-source licences", "docs/licenses.html", "Third-party licences"],
    ["GitHub", "https://github.com/MuffinEMU/MuffinEMU", "Source code"],
    ["Report an issue", "https://github.com/MuffinEMU/MuffinEMU/issues", "GitHub issues"]
  ];
  var ICON_PAGE = '<svg class="ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M6 3.5h8l4 4v13H6z"/><path d="M14 3.5v4h4"/></svg>';
  var ICON_HASH = '<svg class="ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"><path d="M9 4 7 20M17 4l-2 16M4 9h16M3 15h16"/></svg>';
  var ICON_BOLT = '<svg class="ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round"><path d="M13 2.5 4.5 13.5H12l-1 8 8.5-11H12z"/></svg>';

  var dlg = $("[data-palette]");
  var openers = $$("[data-palette-open]");
  if (dlg && dlg.showModal) {
    var input = $("input", dlg), list = $(".palette-list", dlg), count = $(".palette-count", dlg);
    var items = [], sel = 0, opener = null, lastPointer = "";
    dlgOpen = function () { return dlg.open; };

    function href(u) { return /^https?:/.test(u) ? u : base + u; }
    function go(id) {
      close();
      var el = doc.getElementById(id);
      if (!el) return;
      // A heading inside the pinned rail: scroll to where the rail begins.
      var target = el.closest("[data-rail]") || el;
      target.scrollIntoView({ block: "start", behavior: reduced ? "auto" : "smooth" });
      var h = el.matches("h2") ? el : el.querySelector("h2");
      if (h) { h.setAttribute("tabindex", "-1"); h.focus({ preventScroll: true }); }
      history.replaceState(null, "", "#" + id);
    }
    // Built once per opening: pages, this page's sections, actions, themes.
    function buildItems() {
      var out = [];
      PAGES.forEach(function (p) { out.push({ group: "Pages", label: p[0], hint: p[2], icon: ICON_PAGE, run: function () { location.href = href(p[1]); } }); });
      $$("main h2:not(.visually-hidden)").forEach(function (h) {
        var id = h.id || (h.parentNode.tagName === "SECTION" && h.parentNode.id);
        var txt = h.textContent.replace(/#$/, "").trim();
        if (id && txt) out.push({ group: "On this page", label: txt, icon: ICON_HASH, run: function () { go(id); } });
      });
      out.push({ group: "Actions", label: "Cycle colour mode", hint: "auto / dark / light", icon: ICON_BOLT, run: function () { close(); if (modeBtn) modeBtn.click(); } });
      out.push({ group: "Actions", label: "Copy SideStore / AltStore source URL", icon: ICON_BOLT, run: function () {
        close();
        var c = $("[data-copy]");
        if (c) { c.click(); return; }
        var url = "https://muffinemu.github.io/MuffinEMU/apps.json";
        (navigator.clipboard ? navigator.clipboard.writeText(url) : Promise.reject())
          .then(function () { toast("Source URL copied"); }, function () { toast(url); });
      } });
      out.push({ group: "Actions", label: "Random theme", icon: ICON_BOLT, run: function () { close(); var i; do { i = Math.floor(Math.random() * T.THEMES.length); } while (i === T.current()); setTheme(T.THEMES[i].id); } });
      T.THEMES.forEach(function (t) {
        out.push({ group: "Themes", label: t.name, sw: swatchOf(t), hint: t.id === T.THEMES[T.current()].id ? "current" : (t.pro ? "Pro icon" : ""), run: function () { close(); setTheme(t.id); } });
      });
      return out;
    }
    var all = [];
    // Label matches rank above hint matches; loose (subsequence) matches need
    // at least three characters.
    function score(q, it) {
      var l = it.label.toLowerCase(), h = (it.hint || "").toLowerCase();
      if (!q) return 1;
      if (l.indexOf(q) === 0) return 5;
      if (l.indexOf(" " + q) > -1) return 4;
      if (l.indexOf(q) > -1) return 3;
      if (h.indexOf(q) > -1) return 2;
      if (q.length < 3) return 0;
      var i = 0; for (var k = 0; k < l.length && i < q.length; k++) if (l[k] === q[i]) i++;
      return i === q.length ? 1 : 0;
    }
    function render() {
      var q = input.value.trim().toLowerCase(), only = null;
      var m = /^themes?(\s+|$)/.exec(q);
      if (m) { only = "Themes"; q = q.slice(m[0].length); }
      var pool = all.filter(function (it) { return !only || it.group === only; });
      items = q ? pool.map(function (it) { return [score(q, it), it]; })
        .filter(function (x) { return x[0] > 0; })
        .sort(function (a, b) { return b[0] - a[0]; })
        .map(function (x) { return x[1]; }) : pool;
      list.textContent = "";
      input.setAttribute("aria-expanded", items.length ? "true" : "false");
      if (count) count.textContent = items.length ? items.length + (items.length === 1 ? " result" : " results") : "No results";
      if (!items.length) {
        input.removeAttribute("aria-activedescendant");
        var empty = doc.createElement("li");
        empty.className = "palette-empty"; empty.setAttribute("role", "presentation"); empty.textContent = "Nothing matches.";
        list.appendChild(empty);
        return;
      }
      var group = null, groupList = list;
      items.forEach(function (it, i) {
        if (it.group !== group) {
          group = it.group;
          var g = doc.createElement("li"), gid = "pg-" + i;
          g.setAttribute("role", "presentation");
          g.innerHTML = '<div class="palette-group" id="' + gid + '"></div><ul role="group"></ul>';
          g.firstChild.textContent = group;
          g.lastChild.setAttribute("aria-labelledby", gid);
          list.appendChild(g);
          groupList = g.lastChild;
        }
        var li = doc.createElement("li");
        li.className = "palette-item"; li.id = "pi-" + i; li.setAttribute("role", "option");
        li.innerHTML = (it.sw ? '<span class="sw" aria-hidden="true"></span>' : it.icon) + "<span></span>" + (it.hint ? '<span class="hint"></span>' : "");
        if (it.sw) li.firstChild.style.background = it.sw;
        li.children[1].textContent = it.label;
        if (it.hint) li.lastChild.textContent = it.hint;
        li.addEventListener("mousedown", function (e) { e.preventDefault(); });  // keep focus in the input
        li.addEventListener("click", function () { it.run(); });
        li.addEventListener("pointermove", function (e) {
          // Only a real pointer move selects (not the list scrolling under a still mouse).
          var at = e.clientX + "," + e.clientY;
          if (at !== lastPointer && sel !== i) select(i, false);
          lastPointer = at;
        });
        groupList.appendChild(li);
      });
      select(0, true);
    }
    function select(i, scroll) {
      if (!items.length) return;
      sel = (i + items.length) % items.length;  // wraps at both ends
      $$(".palette-item", list).forEach(function (el) { el.setAttribute("aria-selected", el.id === "pi-" + sel ? "true" : "false"); });
      var el = doc.getElementById("pi-" + sel);
      if (el) { input.setAttribute("aria-activedescendant", el.id); if (scroll) el.scrollIntoView({ block: "nearest" }); }
    }
    function open(prefill) {
      if (dlg.open) return;
      closeNav(false); closeDropdowns();
      opener = doc.activeElement;
      all = buildItems();
      input.value = prefill || "";
      render();
      dlg.showModal();
      root.classList.add("palette-open");
      input.focus();
      if (prefill) input.setSelectionRange(prefill.length, prefill.length);
    }
    function close() { if (dlg.open) dlg.close(); }
    dlg.addEventListener("close", function () {
      root.classList.remove("palette-open");
      if (opener && opener.focus && doc.contains(opener)) opener.focus({ preventScroll: true });
    });

    openers.forEach(function (b) {
      b.addEventListener("click", function () { open(b.getAttribute("data-palette-open") || ""); });
    });
    input.addEventListener("input", render);
    input.addEventListener("keydown", function (e) {
      if (e.isComposing) return;
      if (e.key === "ArrowDown") { e.preventDefault(); select(sel + 1, true); }
      else if (e.key === "ArrowUp") { e.preventDefault(); select(sel - 1, true); }
      else if (e.key === "Home" && e.ctrlKey) { e.preventDefault(); select(0, true); }
      else if (e.key === "End" && e.ctrlKey) { e.preventDefault(); select(items.length - 1, true); }
      else if (e.key === "Enter") { e.preventDefault(); if (items[sel]) items[sel].run(); }
    });
    // Close on a click that starts and ends on the backdrop (not a drag out of the input).
    var downOn = null;
    dlg.addEventListener("mousedown", function (e) { downOn = e.target; });
    dlg.addEventListener("click", function (e) { if (e.target === dlg && downOn === dlg) close(); });
    doc.addEventListener("keydown", function (e) {
      var k = (e.key || "").toLowerCase(), a = doc.activeElement;
      var typing = a && (/^(input|textarea|select)$/i.test(a.tagName) || a.isContentEditable);
      if ((e.metaKey || e.ctrlKey) && !e.altKey && k === "k") { e.preventDefault(); dlg.open ? close() : open(); }
      else if (k === "/" && !e.metaKey && !e.ctrlKey && !e.altKey && !dlg.open && !typing) { e.preventDefault(); open(); }
    });
    // Show the shortcut the way this platform writes it.
    if (!/Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent)) {
      $$(".kbd[data-shortcut]").forEach(function (el) { el.textContent = "Ctrl K"; });
    }
  } else {
    openers.forEach(function (b) { b.hidden = true; });
  }

  /* ------------------------------------------- other tabs stay in step */
  window.addEventListener("storage", function (e) {
    if (e.key === T.STORE_KEY && e.newValue) T.setById(e.newValue, false);
    else if (e.key === "muffinemu.site.mode") T.setMode(e.newValue || "auto", false);
  });
})();
