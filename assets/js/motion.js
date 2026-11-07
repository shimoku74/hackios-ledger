// Page shell: smooth scroll, loader, menu, reveals. Scroll-driven scenes live in scenes.js.
(() => {
  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
  let lenis = null;

  function fitHero() {
    const word = document.getElementById('heroWord');
    const fit = document.getElementById('heroFit');
    if (!word || !fit) return;
    const available = word.clientWidth;
    let size = 100;
    // Glyph metrics do not scale perfectly linearly, so converge in a few passes.
    for (let pass = 0; pass < 4; pass++) {
      fit.style.fontSize = `${size}px`;
      size *= (available * 0.995) / fit.offsetWidth;
    }
    fit.style.fontSize = `${size}px`;
  }

  function splitHero() {
    const fit = document.getElementById('heroFit');
    const text = fit.textContent;
    fit.textContent = '';
    [...text].forEach((ch, i) => {
      const s = document.createElement('span');
      s.className = 'ch';
      s.style.setProperty('--i', i);
      s.textContent = ch;
      fit.append(s);
    });
  }

  function initLenis() {
    if (reduced || !window.Lenis || !window.gsap) return;
    lenis = new window.Lenis({ duration: 1.15, smoothWheel: true });
    // One clock for smooth scroll and the timelines, so pinned scenes never lag behind the wheel.
    lenis.on('scroll', () => window.ScrollTrigger?.update());
    gsap.ticker.add((time) => lenis.raf(time * 1000));
    gsap.ticker.lagSmoothing(0);
    lenis.stop();
  }

  function goTo(target) {
    const el = typeof target === 'string' ? document.querySelector(target) : target;
    if (!el) return;
    if (lenis) lenis.scrollTo(el, { offset: 0 });
    else el.scrollIntoView({ behavior: reduced ? 'auto' : 'smooth' });
  }

  function initAnchors() {
    document.addEventListener('click', (e) => {
      const a = e.target.closest('a[href^="#"]');
      if (!a) return;
      const id = a.getAttribute('href');
      const el = document.querySelector(id);
      if (!el) return;
      e.preventDefault();
      closeMenu();
      goTo(el);
      history.replaceState(null, '', id);
    });
  }

  // Menu
  let menu, menuBtn;
  function openMenu() {
    menu.hidden = false;
    menu.getBoundingClientRect();
    menu.classList.add('is-open');
    menuBtn.setAttribute('aria-expanded', 'true');
    document.getElementById('menuLabel').textContent = window.I18n.t('close');
    const bar = document.getElementById('bar');
    bar.dataset.menu = '1';
    bar.dataset.on = 'night';
    delete bar.dataset.clear;
    lenis?.stop();
  }
  function closeMenu() {
    if (!menu || menu.hidden) return;
    menu.classList.remove('is-open');
    menuBtn.setAttribute('aria-expanded', 'false');
    document.getElementById('menuLabel').textContent = window.I18n.t('menu');
    delete document.getElementById('bar').dataset.menu;
    lenis?.start();
    setTimeout(() => { if (!menu.classList.contains('is-open')) menu.hidden = true; }, reduced ? 0 : 800);
    updateBar();
  }
  function initMenu() {
    menu = document.getElementById('menu');
    menuBtn = document.getElementById('menuBtn');
    menuBtn.addEventListener('click', () => (menu.classList.contains('is-open') ? closeMenu() : openMenu()));
    addEventListener('keydown', (e) => { if (e.key === 'Escape') closeMenu(); });
  }

  // The bar follows whichever section sits under it. Sections can nest, so the last match wins.
  let themed = [];
  function updateBar() {
    const bar = document.getElementById('bar');
    if (bar.dataset.menu) return;
    const y = 30;
    let current = null;
    for (const s of themed) {
      const r = s.getBoundingClientRect();
      if (r.top <= y && r.bottom > y) current = s;
    }
    if (!current) return;
    bar.dataset.on = current.dataset.theme;
    if (current.dataset.bar === 'clear') bar.dataset.clear = '1';
    else delete bar.dataset.clear;
  }

  function initReveal() {
    const io = new IntersectionObserver((entries) => {
      for (const e of entries) {
        if (e.isIntersecting) { e.target.classList.add('in'); io.unobserve(e.target); }
      }
    }, { rootMargin: '0px 0px -8% 0px' });
    const observe = (root = document) =>
      root.querySelectorAll('.reveal, .fact, .dist').forEach((el) => { if (!el.classList.contains('in')) io.observe(el); });
    observe();
    return observe;
  }

  function initMagnetic() {
    if (reduced || matchMedia('(pointer: coarse)').matches) return;
    document.querySelectorAll('[data-magnetic]').forEach((el) => {
      el.addEventListener('pointermove', (e) => {
        const r = el.getBoundingClientRect();
        const x = e.clientX - r.left - r.width / 2;
        const y = e.clientY - r.top - r.height / 2;
        el.style.transform = `translate(${x * 0.22}px, ${y * 0.22}px)`;
      });
      el.addEventListener('pointerleave', () => { el.style.transform = ''; });
    });
  }

  function onScroll() {
    const max = document.documentElement.scrollHeight - innerHeight;
    const p = max > 0 ? scrollY / max : 0;
    document.getElementById('barLine').style.transform = `scaleX(${p})`;
    updateBar();
  }

  // The project's mark as a dot grid that fills from the bottom as real reads finish.
  function createMarkArt() {
    const canvas = document.getElementById('loaderArt');
    if (!canvas) return () => {};
    const size = Math.min(innerWidth * 0.8, innerHeight * 0.58);
    const dpr = Math.min(devicePixelRatio || 1, 2);
    canvas.width = canvas.height = size * dpr;
    canvas.style.width = canvas.style.height = `${size}px`;
    const ctx = canvas.getContext('2d');
    ctx.scale(dpr, dpr);

    const probe = document.createElement('canvas');
    probe.width = probe.height = 120;
    const p = probe.getContext('2d');
    p.scale(120 / 64, 120 / 64);
    p.lineWidth = 8;
    p.lineCap = 'round';
    p.lineJoin = 'round';
    p.stroke(new Path2D('M22 14v36M22 33c0-6 4.5-9.5 9.5-9.5S41 27 41 33v17'));
    p.beginPath();
    p.arc(46, 16.5, 5.5, 0, Math.PI * 2);
    p.fill();
    const pixels = p.getImageData(0, 0, 120, 120).data;
    const cell = size / 120;
    const dots = [];
    for (let y = 0; y < 120; y += 2) {
      for (let x = 0; x < 120; x += 2) {
        if (pixels[(y * 120 + x) * 4 + 3] > 120) dots.push({ x: x * cell, y: y * cell, row: y / 120 });
      }
    }
    return (progress) => {
      ctx.clearRect(0, 0, size, size);
      for (const d of dots) {
        const lit = 1 - d.row <= progress;
        ctx.fillStyle = lit ? '#e8170f' : 'rgba(200,189,150,.08)';
        ctx.beginPath();
        ctx.arc(d.x, d.y, cell * 0.72, 0, Math.PI * 2);
        ctx.fill();
      }
    };
  }

  // Loader percentage follows real reads finishing, with a floor so it never jumps.
  function createLoader(totalSteps) {
    const num = document.getElementById('loaderNum');
    const bar = document.getElementById('loaderBar');
    const paintArt = createMarkArt();
    let done = 0;
    let shown = 0;
    let target = 0;
    let finished = false;
    const tick = () => {
      shown += (target - shown) * 0.14;
      if (target - shown < 0.5) shown = target;
      num.textContent = Math.round(shown);
      bar.style.transform = `scaleX(${shown / 100})`;
      paintArt(shown / 100);
      if (shown < 100 || !finished) requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
    return {
      step() { done += 1; target = Math.min(99, (done / totalSteps) * 100); },
      finish() {
        target = 100;
        finished = true;
        const wait = reduced ? 0 : 450;
        setTimeout(() => {
          document.getElementById('loader').classList.add('is-done');
          document.body.classList.remove('is-loading');
          document.body.classList.add('is-ready');
          lenis?.start();
          fitHero();
          window.Scenes?.refresh();
          onScroll();
          // A link like #team has to land after pinned scenes have added their scroll length.
          if (location.hash) requestAnimationFrame(() => goTo(location.hash));
          setTimeout(() => document.getElementById('loader').remove(), 1300);
        }, wait);
      },
    };
  }

  window.Motion = {
    start() {
      splitHero();
      fitHero();
      // The word is measured in its real font, so measure again whenever a font arrives.
      document.fonts?.addEventListener?.('loadingdone', () => { fitHero(); window.Scenes?.refresh(); });
      document.fonts?.load?.('900 100px Unbounded', '$HACKIOS').then(fitHero);
      addEventListener('resize', fitHero);
      initLenis();
      initAnchors();
      initMenu();
      themed = [...document.querySelectorAll('[data-theme]')];
      const observe = initReveal();
      initMagnetic();
      addEventListener('scroll', onScroll, { passive: true });
      addEventListener('resize', onScroll);
      return { observe };
    },
    createLoader,
    goTo,
    fitHero,
    closeMenu,
  };
})();
