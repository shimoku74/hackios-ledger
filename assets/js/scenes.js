// Pinned, scroll-scrubbed scenes built on GSAP ScrollTrigger. Each scene is one full screen
// whose timeline is driven by the scrollbar. Without motion, CSS shows the same content flat.
(() => {
  const { t } = window.I18n;
  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const $ = (id) => document.getElementById(id);
  const clamp = (v, lo, hi) => Math.min(Math.max(v, lo), hi);

  function el(tag, props = {}, ...children) {
    const node = document.createElement(tag);
    for (const [k, v] of Object.entries(props)) {
      if (k === 'class') node.className = v;
      else if (k === 'text') node.textContent = v;
      else node.setAttribute(k, v);
    }
    for (const c of children) if (c !== null && c !== undefined) node.append(c);
    return node;
  }

  /* ---------- Content ---------- */

  const TEAM = [
    { handle: '@netusd', country: 'ua', no: 1 },
    { handle: '@wannqn', country: 'ua', no: 2 },
    { handle: '@oodze', country: 'ru', no: 5, founder: true },
    { handle: '@hxfuxyyXD', country: 'ua', no: 3 },
    { handle: '@wryzzew', country: 'ru', no: 4 },
  ];

  const HOW = ['goal', 'code', 'phone', 'team', 'token', 'tax', 'holders', 'site'];
  let howVars = { tax: '1', fee: '10', supply: '1B' };

  const howItems = (key) => [1, 2, 3].map((n) => t(`how_${key}_${n}`, howVars));

  const NUMBERS = [
    { key: 'num_stars', glyph: 'star' },
    { key: 'num_forks', glyph: 'fork' },
    { key: 'num_tg', glyph: 'send' },
    { key: 'num_holders', glyph: 'dots' },
    { key: 'num_repos', glyph: 'stack' },
    { key: 'num_owners', glyph: 'rings', value: String(TEAM.length) },
  ];
  const numberValues = {};

  const GLYPHS = {
    star: '<path d="M50 14l11 24 26 3-19 18 5 26-23-13-23 13 5-26-19-18 26-3z"/>',
    fork: '<circle cx="30" cy="22" r="8"/><circle cx="70" cy="22" r="8"/><circle cx="50" cy="80" r="8"/><path d="M30 30v8c0 12 20 12 20 24v10M70 30v8c0 12-20 12-20 24"/>',
    send: '<path d="M12 50L88 16 72 86 46 62 34 78 32 58z"/><path d="M32 58l56-42-42 46"/>',
    dots: '<circle cx="50" cy="50" r="9"/><circle cx="50" cy="50" r="24"/><circle cx="50" cy="50" r="38"/><circle cx="74" cy="50" r="4"/><circle cx="28" cy="20" r="4"/><circle cx="24" cy="76" r="4"/>',
    stack: '<path d="M50 14l36 18-36 18-36-18z"/><path d="M14 50l36 18 36-18"/><path d="M14 68l36 18 36-18"/>',
    rings: '<circle cx="34" cy="38" r="15"/><circle cx="66" cy="38" r="15"/><path d="M10 84c0-16 11-24 24-24s24 8 24 24"/><path d="M60 60c15 0 30 8 30 24"/>',
  };

  // Static markup we own; nothing from a network response ever reaches this.
  function svgFrom(markup, cls) {
    const holder = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    holder.setAttribute('viewBox', '0 0 100 100');
    holder.setAttribute('class', cls);
    holder.setAttribute('aria-hidden', 'true');
    const doc = new DOMParser().parseFromString(`<svg xmlns="http://www.w3.org/2000/svg">${markup}</svg>`, 'image/svg+xml');
    [...doc.documentElement.childNodes].forEach((n) => holder.append(document.importNode(n, true)));
    return holder;
  }

  function flag(code) {
    const stripes = code === 'ua' ? ['#2f6fb5', '#e8c32c'] : ['#f1eee3', '#2f55a4', '#c7342c'];
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('viewBox', '0 0 30 18');
    svg.setAttribute('class', 'flag');
    svg.setAttribute('aria-hidden', 'true');
    stripes.forEach((fill, i) => {
      const r = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
      r.setAttribute('x', 0);
      r.setAttribute('y', (18 / stripes.length) * i);
      r.setAttribute('width', 30);
      r.setAttribute('height', 18 / stripes.length);
      r.setAttribute('fill', fill);
      svg.append(r);
    });
    return svg;
  }

  /* ---------- Rendering that follows the language ---------- */

  function renderNumbers() {
    const row = $('numbersRow');
    if (!row.children.length) {
      NUMBERS.forEach((n) => {
        const tile = el('div', { class: 'ncard__tile' }, svgFrom(GLYPHS[n.glyph], 'ncard__glyph'));
        row.append(el('article', { class: 'ncard', 'data-key': n.key }, tile,
          el('strong', { class: 'ncard__v' }, el('span'), el('i', { class: 'dot' })),
          el('span', { class: 'ncard__k' })));
      });
    }
    [...row.children].forEach((card, i) => {
      const n = NUMBERS[i];
      card.querySelector('.ncard__k').textContent = t(n.key);
      card.querySelector('.ncard__v span').textContent = n.value ?? numberValues[n.key] ?? '—';
    });
  }

  function renderHow() {
    const nodes = $('howNodes');
    if (!nodes.children.length) {
      HOW.forEach((key, i) => nodes.append(el('span', { class: 'how__node', 'data-i': String(i) })));
    }
    [...nodes.children].forEach((node, i) => { node.textContent = t(`how_${HOW[i]}`); });
    $('howStatic').replaceChildren(...HOW.map((key) => el('li', {},
      el('b', { text: t(`how_${key}`) }),
      ...howItems(key).map((line) => el('span', { text: line })))));
    paintHow(howActive, true);
  }

  function renderTeam() {
    const stage = $('teamStage');
    if (!stage.children.length) {
      TEAM.forEach((m, i) => {
        const card = el('article', { class: `tm tm--${i}${m.founder ? ' tm--founder' : ''}` },
          el('div', { class: 'tm__ball', 'aria-hidden': 'true' }, el('i')),
          el('div', { class: 'tm__ret', 'aria-hidden': 'true' }, el('i'), el('i'), el('b')),
          el('div', { class: 'tm__label' },
            el('span', { class: 'tm__tick', 'aria-hidden': 'true' }),
            el('small', { text: 'HAKIOS_TEAM_' }),
            el('small', { class: 'tm__role' }),
            el('strong', { text: m.handle }),
            el('span', { class: 'tm__from' }, flag(m.country), el('span', { class: 'tm__country' }))));
        stage.append(card);
      });
    }
    [...stage.children].forEach((card, i) => {
      const m = TEAM[i];
      const role = m.founder ? `${t('team_founder')}: NO_00${m.no}` : `${t('team_owner')}: NO_00${m.no}`;
      card.querySelector('.tm__role').textContent = role;
      card.querySelector('.tm__country').textContent = t(`team_${m.country}`);
    });
  }

  function renderTabs(getLabels) {
    const tabs = $('flowTabs');
    const labels = getLabels();
    if (!tabs.children.length) labels.forEach(() => tabs.append(el('li')));
    [...tabs.children].forEach((li, i) => { li.textContent = labels[i]; });
  }

  function render() {
    renderNumbers();
    renderHow();
    renderTeam();
    renderTabs(() => ['tab_trade', 'tab_swap', 'tab_flap', 'tab_vault', 'tab_wallet'].map((k) => t(k)));
    renderMarquee();
  }

  function renderMarquee() {
    const text = 'OPEN SOURCE ■ FREE FOR EVERYONE ■ XNU ■ METAL ■ ANDROID ■ ';
    document.querySelectorAll('.bigm__row').forEach((row) => {
      if (!row.children.length) row.append(el('span', { text: text.repeat(4) }));
    });
  }

  /* ---------- Sun and orbits ---------- */

  let howActive = 0;
  let howAngle = 0;
  const RING_STEP = [0.74, 1, 1.26];

  function paintHow(index, force) {
    if (index === howActive && !force) return;
    howActive = index;
    const key = HOW[index];
    const list = $('howList');
    const pill = $('howPill');
    pill.textContent = t(`how_${key}`);
    list.replaceChildren(...howItems(key).map((line) => el('li', { text: line })));
    if (!reduced && !force && window.gsap) {
      gsap.fromTo(list.children, { opacity: 0, x: -10 }, { opacity: 1, x: 0, duration: 0.45, stagger: 0.06, overwrite: true });
      gsap.fromTo(pill, { xPercent: -12, opacity: 0.4 }, { xPercent: 0, opacity: 1, duration: 0.45, overwrite: true });
    }
    document.querySelectorAll('.how__node').forEach((n, i) => n.classList.toggle('is-active', i === index));
  }

  function placeNodes() {
    const nodes = document.querySelectorAll('.how__node');
    const rings = $('howRings');
    if (!rings) return;
    const base = rings.offsetWidth / 2;
    const count = nodes.length;
    nodes.forEach((node, i) => {
      const angle = (i / count) * Math.PI * 2 + howAngle + Math.PI;
      const r = base * RING_STEP[i % RING_STEP.length] * 0.62;
      const x = Math.cos(angle) * r;
      const y = Math.sin(angle) * r;
      node.style.transform = `translate(-50%, -50%) translate(${x.toFixed(1)}px, ${y.toFixed(1)}px)`;
      // The node passing the fixed pill on the left is hidden; the pill stands in for it.
      const left = Math.abs(Math.atan2(Math.sin(angle - Math.PI), Math.cos(angle - Math.PI)));
      node.style.opacity = String(clamp((left - 0.14) * 3, 0, 1));
    });
  }

  function drawStars() {
    const canvas = $('howStars');
    const ctx = canvas.getContext('2d');
    const rect = canvas.getBoundingClientRect();
    const dpr = Math.min(devicePixelRatio || 1, 2);
    canvas.width = rect.width * dpr;
    canvas.height = rect.height * dpr;
    ctx.scale(dpr, dpr);
    // Seeded, so the star field does not jump on resize.
    let seed = 7;
    const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
    for (let i = 0; i < 520; i++) {
      ctx.fillStyle = `rgba(200,189,150,${0.08 + rnd() * 0.42})`;
      ctx.beginPath();
      ctx.arc(rnd() * rect.width, rnd() * rect.height, 0.4 + rnd() * 1.3, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  function sceneHow(mobile) {
    const steps = HOW.length;
    const tl = gsap.timeline({
      defaults: { ease: 'none' },
      scrollTrigger: {
        trigger: '#how',
        start: 'top top',
        end: mobile ? '+=320%' : '+=420%',
        pin: true,
        scrub: 0.5,
        anticipatePin: 1,
        onUpdate: (self) => {
          const rotation = clamp((self.progress - 0.26) / 0.72, 0, 1);
          howAngle = -rotation * ((steps - 1) / steps) * Math.PI * 2;
          placeNodes();
          paintHow(clamp(Math.round(rotation * (steps - 1)), 0, steps - 1));
        },
      },
    });
    tl.fromTo('#howTitle', { yPercent: 0, opacity: 1 }, { yPercent: -60, opacity: 0, duration: 16 }, 12);
    tl.fromTo('#howDome', { yPercent: 62, scale: 3 }, { yPercent: 0, scale: 1, duration: 26 }, 0);
    tl.fromTo('#howGlow', { opacity: 0.35 }, { opacity: 1, duration: 26 }, 0);
    tl.fromTo('#howStars', { yPercent: 8 }, { yPercent: -8, duration: 100 }, 0);
    tl.fromTo('#howRings', { scale: 0.55, opacity: 0 }, { scale: 1, opacity: 1, duration: 16 }, 16);
    tl.fromTo('#howNodes', { opacity: 0 }, { opacity: 1, duration: 8 }, 24);
    tl.fromTo('#howCore', { opacity: 0 }, { opacity: 1, duration: 8 }, 24);
    tl.to({}, { duration: 72 }, 28);
    placeNodes();
  }

  /* ---------- Numbers along an arc ---------- */

  function sceneNumbers(mobile) {
    const cards = gsap.utils.toArray('.ncard');
    const place = (progress) => {
      const W = innerWidth;
      const H = innerHeight;
      const gap = mobile ? W * 0.62 : Math.max(W * 0.25, 300);
      const travel = W + gap * (cards.length - 1) + (mobile ? W * 0.2 : 200);
      cards.forEach((card, i) => {
        const x = W + gap * i - progress * travel;
        const offset = (x + card.offsetWidth / 2 - W / 2) / (W / 2);
        // The cards ride a curve that dips in the middle of the screen, drawn by the red arc.
        const y = H * (mobile ? 0.42 : 0.3) + (1 - offset * offset) * H * (mobile ? 0.06 : 0.16);
        const rot = offset * -3;
        card.style.transform = `translate3d(${x.toFixed(1)}px, ${y.toFixed(1)}px, 0) rotate(${rot.toFixed(2)}deg)`;
      });
    };
    place(0);
    gsap.timeline({
      defaults: { ease: 'none' },
      scrollTrigger: {
        trigger: '#numbers',
        start: 'top top',
        end: mobile ? '+=180%' : '+=220%',
        pin: true,
        scrub: 0.5,
        anticipatePin: 1,
        onUpdate: (self) => place(self.progress),
      },
    }).fromTo('#numbersArc', { strokeDashoffset: 1 }, { strokeDashoffset: 0, duration: 40 }, 0)
      .fromTo('#numbersGlow', { yPercent: -40, opacity: 0.2 }, { yPercent: 0, opacity: 1, duration: 60 }, 0)
      .to({}, { duration: 40 }, 60);
  }

  /* ---------- Team ---------- */

  function sceneTeam() {
    const tl = gsap.timeline({
      defaults: { ease: 'power2.out' },
      scrollTrigger: {
        trigger: '#team',
        start: 'top top',
        end: '+=160%',
        pin: true,
        scrub: 1,
        anticipatePin: 1,
      },
    });
    tl.fromTo('#teamGlow', { yPercent: -30, opacity: 0.35 }, { yPercent: 0, opacity: 1, duration: 30 }, 0);
    tl.fromTo('.tm__ball', { y: () => innerHeight * 0.75 }, { y: 0, duration: 40, stagger: 4 }, 8);
    tl.fromTo('.tm__ret', { scale: 0.4, opacity: 0 }, { scale: 1, opacity: 1, duration: 14, stagger: 3 }, 42);
    tl.fromTo('.tm__label', { opacity: 0, y: 14 }, { opacity: 1, y: 0, duration: 12, stagger: 3 }, 48);
    tl.fromTo('#teamNote', { opacity: 0, y: 20 }, { opacity: 1, y: 0, duration: 14 }, 66);
    tl.to({}, { duration: 14 }, 86);
  }

  /* ---------- Hero ---------- */

  function sceneHero(mobile) {
    const tl = gsap.timeline({
      defaults: { ease: 'none' },
      scrollTrigger: {
        trigger: '.hero',
        start: 'top top',
        end: mobile ? '+=120%' : '+=170%',
        pin: true,
        scrub: 0.5,
        anticipatePin: 1,
        onUpdate: (self) => window.Orbit.setScroll(self.progress),
      },
    });
    tl.to('.hero__row, .hero__foot', { opacity: 0, y: -24, duration: 14 }, 6);
    tl.to('.hero__fit', { yPercent: -112, duration: 26, ease: 'power1.in' }, 22);
    tl.fromTo('#heroSecond .hero2__a', { xPercent: -8, opacity: 0 }, { xPercent: 0, opacity: 1, duration: 18 }, 42);
    tl.fromTo('#heroSecond .hero2__b', { xPercent: 8, opacity: 0 }, { xPercent: 0, opacity: 1, duration: 18 }, 50);
    tl.fromTo('#heroSecond .hero2__note', { opacity: 0, y: 12 }, { opacity: 1, y: 0, duration: 14 }, 60);
    tl.to({}, { duration: 22 }, 78);
  }

  /* ---------- Money flow: pinned, with tabs along the bottom ---------- */

  let flowActive = -1;
  let flowBigFor = () => ({ value: '', note: '' });

  function paintFlow(index, animate = true) {
    const steps = document.querySelectorAll('.flow__step');
    if (!steps.length) return;
    flowActive = index;
    steps.forEach((s, i) => s.classList.toggle('on', i === index));
    document.querySelectorAll('#flowTabs li').forEach((tab, i) => tab.classList.toggle('on', i === index));
    $('flow').dataset.tone = String(index);
    const figure = flowBigFor(index);
    const big = $('flowBig');
    big.textContent = '';
    big.append(el('span', { text: figure.value }), el('small', { text: figure.note }));
    if (animate && !reduced && window.gsap) {
      gsap.fromTo(big.firstChild, { yPercent: 26, opacity: 0 }, { yPercent: 0, opacity: 1, duration: 0.6, ease: 'expo.out', overwrite: true });
    }
  }

  function sceneFlowPinned() {
    const count = () => document.querySelectorAll('.flow__step').length || 5;
    ScrollTrigger.create({
      trigger: '#flow',
      start: 'top top',
      end: '+=380%',
      pin: true,
      scrub: 0.5,
      anticipatePin: 1,
      onUpdate: (self) => {
        const n = count();
        const i = clamp(Math.floor(self.progress * n), 0, n - 1);
        if (i !== flowActive) paintFlow(i);
        gsap.set('#flowFill', { scaleX: self.progress });
      },
    });
    paintFlow(0, false);
  }

  function sceneFlowList() {
    ScrollTrigger.create({
      trigger: '#flow',
      start: 'top 52%',
      end: 'bottom 52%',
      onUpdate: (self) => {
        gsap.set('#flowFill', { scaleY: self.progress });
        const track = $('flowDot').parentElement;
        gsap.set('#flowDot', { y: self.progress * track.offsetHeight });
        const probe = innerHeight * 0.52;
        let current = 0;
        document.querySelectorAll('.flow__step').forEach((s, i) => { if (s.getBoundingClientRect().top < probe) current = i; });
        if (current !== flowActive) paintFlow(current);
      },
    });
    paintFlow(0, false);
  }

  /* ---------- Big scrolling words with floating commits ---------- */

  function sceneMarquee() {
    gsap.fromTo('.bigm__row--a span', { xPercent: 0 }, {
      xPercent: -22,
      ease: 'none',
      scrollTrigger: { trigger: '#marquee', start: 'top bottom', end: 'bottom top', scrub: 0.5 },
    });
    gsap.fromTo('.bigm__row--b span', { xPercent: -24 }, {
      xPercent: -2,
      ease: 'none',
      scrollTrigger: { trigger: '#marquee', start: 'top bottom', end: 'bottom top', scrub: 0.5 },
    });
  }

  function floatCommits(commits) {
    const host = $('marqueeFloats');
    if (!host) return;
    host.replaceChildren(...commits.slice(0, 5).map((c, i) => el('a', {
      class: `mfloat mfloat--${i}`, href: c.url, target: '_blank', rel: 'noopener',
    }, el('small', { text: `${c.repo} · ${c.sha}` }), el('span', { text: c.message }))));
    if (reduced || !window.gsap) return;
    gsap.utils.toArray('.mfloat').forEach((card, i) => {
      gsap.fromTo(card, { x: 170 - i * 60, y: 40 * (i % 2 ? 1 : -1) }, {
        x: i * 60 - 170,
        y: 40 * (i % 2 ? -1 : 1),
        ease: 'none',
        scrollTrigger: { trigger: '#marquee', start: 'top bottom', end: 'bottom top', scrub: 0.5 + i * 0.25 },
      });
    });
    ScrollTrigger.refresh();
  }

  /* ---------- Hanging pass: a damped spring, pushed by scrolling and by the pointer ---------- */

  function initPass() {
    const pass = $('pass');
    if (!pass) return;
    let angle = 0;
    let velocity = 0;
    let visible = false;
    let lastY = scrollY;
    new IntersectionObserver(([e]) => { visible = e.isIntersecting; }).observe(pass);
    pass.addEventListener('pointermove', (e) => {
      const r = pass.getBoundingClientRect();
      velocity += ((e.clientX - (r.left + r.width / 2)) / r.width) * 0.35 * Math.sign(e.movementX || 1);
    });
    gsap.ticker.add(() => {
      if (!visible) { lastY = scrollY; return; }
      velocity += clamp((scrollY - lastY) * 0.012, -1.6, 1.6);
      lastY = scrollY;
      velocity += -angle * 0.018;
      velocity *= 0.965;
      angle = clamp(angle + velocity, -22, 22);
      pass.style.transform = `rotate(${angle.toFixed(2)}deg)`;
    });
  }

  function setPass(rows) {
    const body = $('passRows');
    if (body) body.replaceChildren(...rows.map(([k, v]) => el('div', {}, el('dt', { text: k }), el('dd', { text: v }))));
  }

  /* ---------- Text that types itself in when it arrives ---------- */

  function typeIn(node) {
    if (reduced || !window.gsap || node.dataset.typed === node.textContent) return;
    const text = node.textContent;
    node.dataset.typed = text;
    const spans = [...text].map((ch) => {
      const s = document.createElement('span');
      s.textContent = ch;
      return s;
    });
    node.setAttribute('aria-label', text);
    node.replaceChildren(...spans);
    gsap.fromTo(spans, { opacity: 0 }, {
      opacity: 1,
      duration: 0.01,
      stagger: { each: Math.min(0.9 / spans.length, 0.012) },
      onComplete: () => { node.textContent = text; node.removeAttribute('aria-label'); },
    });
  }

  /* ---------- Setup ---------- */

  function init({ flowFigure }) {
    flowBigFor = flowFigure;
    render();
    drawStars();
    addEventListener('resize', () => { drawStars(); placeNodes(); });

    if (reduced || !window.gsap || !window.ScrollTrigger) {
      document.body.classList.add('no-motion');
      paintFlow(0, false);
      document.querySelectorAll('.flow__step').forEach((s) => s.classList.add('on'));
      return;
    }

    gsap.registerPlugin(ScrollTrigger);
    initPass();
    sceneMarquee();
    const mm = gsap.matchMedia();
    mm.add('(min-width: 900px)', () => {
      sceneHero(false);
      sceneNumbers(false);
      sceneHow(false);
      sceneTeam();
      sceneFlowPinned();
    });
    mm.add('(max-width: 899px)', () => {
      sceneHero(true);
      sceneNumbers(true);
      sceneHow(true);
      sceneFlowList();
    });

    const io = new IntersectionObserver((entries) => {
      entries.forEach((e) => {
        if (e.isIntersecting) { typeIn(e.target); io.unobserve(e.target); }
      });
    }, { rootMargin: '0px 0px -10% 0px' });
    document.querySelectorAll('.lead, .note span:last-child, .small[data-type]').forEach((n) => io.observe(n));
  }

  window.Scenes = {
    init,
    render,
    flowRefresh() {
      if (flowActive < 0) { paintFlow(0, false); return; }
      paintFlow(flowActive, false);
    },
    setHowVars(v) { howVars = { ...howVars, ...v }; paintHow(howActive, true); renderHow(); },
    setNumber(key, value) { numberValues[key] = value; renderNumbers(); },
    setPass,
    floatCommits,
    refresh() { if (window.ScrollTrigger) ScrollTrigger.refresh(); },
  };
})();
