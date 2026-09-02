/* Crown Hudson Law: progressive enhancement only.
   Every page is complete without this file. */
(function () {
  'use strict';
  var d = document, root = d.documentElement, w = window;
  root.classList.add('js');

  var reduce = false;
  try { reduce = w.matchMedia('(prefers-reduced-motion: reduce)').matches; } catch (e) {}

  /* 1. Mobile navigation ------------------------------------------------ */
  var toggle = d.querySelector('[data-nav-toggle]');
  var nav = d.getElementById('site-nav');
  var closer = d.querySelector('[data-nav-close]');

  function navOpen() { return root.classList.contains('nav-open'); }
  function setNav(open) {
    root.classList.toggle('nav-open', open);
    if (toggle) toggle.setAttribute('aria-expanded', open ? 'true' : 'false');
    /* keep keyboard focus inside the drawer while it is open */
    var behind = d.querySelectorAll('main, footer.site');
    for (var b = 0; b < behind.length; b++) {
      if (open) behind[b].setAttribute('inert', ''); else behind[b].removeAttribute('inert');
    }
    if (open) {
      var first = nav.querySelector('a');
      if (first) first.focus();
    } else if (toggle && d.activeElement && nav.contains(d.activeElement)) {
      toggle.focus();
    }
  }

  if (toggle && nav) {
    toggle.setAttribute('role', 'button');
    toggle.setAttribute('aria-expanded', 'false');
    toggle.setAttribute('aria-controls', 'site-nav');
    toggle.addEventListener('click', function (e) { e.preventDefault(); setNav(!navOpen()); });
    if (closer) closer.addEventListener('click', function (e) { e.preventDefault(); setNav(false); });
    d.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && navOpen()) setNav(false);
    });
    nav.addEventListener('click', function (e) {
      var a = e.target.closest ? e.target.closest('a[href]') : null;
      if (a && a !== closer && navOpen()) root.classList.remove('nav-open');
    });
    try {
      var wide = w.matchMedia('(min-width: 861px)');
      var onWide = function (ev) { if (ev.matches && navOpen()) setNav(false); };
      if (wide.addEventListener) wide.addEventListener('change', onWide);
      else if (wide.addListener) wide.addListener(onWide);
    } catch (e) {}
    /* A no-JS visit may have arrived on #site-nav; keep the URL clean. */
    if (w.location.hash === '#site-nav' && w.history && w.history.replaceState) {
      w.history.replaceState(null, '', w.location.pathname + w.location.search);
    }
  }

  /* 2. Reveal on scroll -------------------------------------------------- */
  var targets = d.querySelectorAll('.reveal');
  if (targets.length) {
    var showAll = function () { for (var i = 0; i < targets.length; i++) targets[i].classList.add('in'); };
    if (reduce || !('IntersectionObserver' in w)) {
      showAll();
    } else {
      var io = new IntersectionObserver(function (entries) {
        for (var i = 0; i < entries.length; i++) {
          if (entries[i].isIntersecting) {
            entries[i].target.classList.add('in');
            io.unobserve(entries[i].target);
          }
        }
      }, { rootMargin: '0px 0px -8% 0px', threshold: 0.06 });
      for (var j = 0; j < targets.length; j++) io.observe(targets[j]);
      /* Safety net: nothing stays hidden if the observer never fires. */
      w.setTimeout(showAll, 4000);
    }
  }

  /* 3. Article reading progress and current-section marker ------------- */
  var article = d.querySelector('article.prose');
  if (article && d.body.classList.contains('p-article')) {
    var bar = d.createElement('div');
    bar.className = 'progress';
    bar.setAttribute('aria-hidden', 'true');
    bar.innerHTML = '<span class="progress-bar"></span>';
    d.body.appendChild(bar);
    var fill = bar.firstChild, ticking = false;
    var update = function () {
      ticking = false;
      var rect = article.getBoundingClientRect();
      var top = rect.top + w.pageYOffset;
      var span = article.offsetHeight - w.innerHeight * 0.6;
      var p = span > 0 ? (w.pageYOffset - top + w.innerHeight * 0.4) / span : 1;
      p = Math.max(0, Math.min(1, p));
      fill.style.transform = 'scaleX(' + p.toFixed(4) + ')';
      bar.classList.toggle('on', w.pageYOffset > 120);
    };
    var onScroll = function () { if (!ticking) { ticking = true; w.requestAnimationFrame(update); } };
    w.addEventListener('scroll', onScroll, { passive: true });
    w.addEventListener('resize', onScroll);
    update();

    var tocLinks = d.querySelectorAll('.toc a[href^="#"]');
    var heads = article.querySelectorAll('h2[id]');
    if (tocLinks.length && heads.length && 'IntersectionObserver' in w) {
      var byId = {};
      for (var k = 0; k < tocLinks.length; k++) byId[tocLinks[k].getAttribute('href').slice(1)] = tocLinks[k];
      var current = null;
      var mark = function (id) {
        if (current) { current.classList.remove('now'); current.removeAttribute('aria-current'); }
        current = byId[id] || null;
        if (current) { current.classList.add('now'); current.setAttribute('aria-current', 'true'); }
      };
      var hio = new IntersectionObserver(function (entries) {
        for (var i = 0; i < entries.length; i++) {
          if (entries[i].isIntersecting) mark(entries[i].target.id);
        }
      }, { rootMargin: '-10% 0px -70% 0px', threshold: 0 });
      for (var m = 0; m < heads.length; m++) hio.observe(heads[m]);
    }
  }
})();
