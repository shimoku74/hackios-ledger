// Hero visual. Every dot is one real holder from the snapshot: distance from the centre
// follows rank, size follows balance, and the fixed angle comes from the address itself.
(() => {
  const INK = '23,24,15';
  const RED = '#e8170f';
  let canvas, ctx, tip, width = 0, height = 0, dpr = 1;
  let dots = [];
  let pointer = null;
  let hovered = null;
  let pool = null;
  let clickHandler = () => {};
  let running = false;
  let visible = true;
  let scrollAmount = 0;
  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;

  function center() {
    return { x: width / 2, y: height * (width < 720 ? 0.62 : 0.6) };
  }

  function radiusScale() {
    return Math.min(width * 0.46, height * 0.46);
  }

  function resize() {
    const r = canvas.getBoundingClientRect();
    width = r.width;
    height = r.height;
    dpr = Math.min(devicePixelRatio || 1, 2);
    canvas.width = Math.round(width * dpr);
    canvas.height = Math.round(height * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    if (reduced || !running) draw(0);
  }

  function angleOf(address) {
    return (parseInt(address.slice(2, 10), 16) / 0xffffffff) * Math.PI * 2;
  }

  function setHolders(holders, poolAddress, tokenAddress) {
    pool = holders.find((h) => h.a === poolAddress) || null;
    const rest = holders.filter((h) => h.a !== poolAddress && h.a !== tokenAddress);
    const total = rest.length || 1;
    dots = rest.map((h, i) => {
      const rank = i / total;
      return {
        h,
        rank: i + 1,
        // Rank 1 sits closest to the pool; spacing widens towards the tail.
        orbit: 0.2 + 0.8 * Math.pow(rank, 0.62),
        angle: angleOf(h.a),
        size: Math.min(1.4 + Math.pow(h.b / 1e6, 0.42) * 1.15, 9),
        speed: 0.018 + 0.05 * (1 - rank),
      };
    });
    if (reduced || !running) draw(0);
  }

  function position(d, time) {
    const c = center();
    const R = radiusScale() * (1 + scrollAmount * 0.45);
    // Scrolling turns the whole system and tips it towards the viewer, like a model on a stage.
    const a = d.angle + (reduced ? 0 : time * d.speed) + scrollAmount * Math.PI * 1.2;
    const tilt = 0.92 - scrollAmount * 0.56;
    return { x: c.x + Math.cos(a) * d.orbit * R * 1.5, y: c.y + Math.sin(a) * d.orbit * R * tilt };
  }

  function draw(time) {
    ctx.clearRect(0, 0, width, height);
    const c = center();
    const R = radiusScale() * (1 + scrollAmount * 0.45);
    const tilt = 0.92 - scrollAmount * 0.56;

    ctx.lineWidth = 1;
    for (let i = 1; i <= 5; i++) {
      ctx.strokeStyle = `rgba(${INK},${0.2 - i * 0.022})`;
      ctx.beginPath();
      ctx.ellipse(c.x, c.y, (R * 1.5 * i) / 5, (R * tilt * i) / 5, 0, 0, Math.PI * 2);
      ctx.stroke();
    }

    let nearest = null;
    let nearestDist = 26;
    for (const d of dots) {
      const p = position(d, time);
      d.px = p;
      if (pointer) {
        const dist = Math.hypot(p.x - pointer.x, p.y - pointer.y);
        if (dist < nearestDist) { nearest = d; nearestDist = dist; }
      }
      ctx.fillStyle = `rgba(${INK},${d === hovered ? 1 : 0.82})`;
      ctx.beginPath();
      ctx.arc(p.x, p.y, d.size, 0, Math.PI * 2);
      ctx.fill();
    }

    // The pool: red centre, sized by its real share of supply.
    const share = pool ? pool.b / 1e9 : 0.7;
    // The pool swells as the scene plays, handing over to the sun in the next scene.
    const poolR = Math.max(10, Math.sqrt(share) * radiusScale() * 0.17) * (1 + scrollAmount * 0.9);
    ctx.fillStyle = RED;
    ctx.beginPath();
    ctx.arc(c.x, c.y, poolR, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = 'rgba(232,23,15,.35)';
    ctx.beginPath();
    ctx.arc(c.x, c.y, poolR + 8 + Math.sin(time * 1.4) * 2, 0, Math.PI * 2);
    ctx.stroke();

    setHover(nearest);
    if (hovered) {
      const p = hovered.px;
      ctx.strokeStyle = RED;
      for (const r of [hovered.size + 12, hovered.size + 28]) {
        ctx.beginPath();
        ctx.arc(p.x, p.y, r, 0, Math.PI * 2);
        ctx.stroke();
      }
      tip.style.left = `${Math.min(p.x + hovered.size + 28, width - 170)}px`;
      tip.style.top = `${p.y}px`;
    }
  }

  function setHover(next) {
    if (next === hovered) return;
    hovered = next;
    canvas.style.cursor = next ? 'pointer' : '';
    if (!next) { tip.hidden = true; return; }
    tip.hidden = false;
    tip.textContent = '';
    const b = document.createElement('b');
    b.textContent = `${next.h.a.slice(0, 6)}…${next.h.a.slice(-4)}`;
    const line = document.createElement('span');
    line.textContent = `#${next.rank} · ${((next.h.b / 1e9) * 100).toFixed(3)}%`;
    tip.append(b, line);
  }

  function loop(ms) {
    if (visible && !document.hidden) draw(ms / 1000);
    requestAnimationFrame(loop);
  }

  function init(onClick) {
    canvas = document.getElementById('orbit');
    tip = document.getElementById('orbitTip');
    ctx = canvas.getContext('2d');
    clickHandler = onClick;
    resize();
    addEventListener('resize', resize);
    const hero = canvas.parentElement;
    // The hero's text layer ignores the pointer, so the canvas keeps receiving it.
    hero.addEventListener('pointermove', (e) => {
      const r = canvas.getBoundingClientRect();
      pointer = { x: e.clientX - r.left, y: e.clientY - r.top };
      if (reduced) draw(0);
    });
    hero.addEventListener('pointerleave', () => { pointer = null; if (reduced) draw(0); });
    canvas.addEventListener('click', () => { if (hovered) clickHandler(hovered.h.a); });
    new IntersectionObserver(([e]) => { visible = e.isIntersecting; }).observe(canvas);
    if (!reduced) { running = true; requestAnimationFrame(loop); }
  }

  window.Orbit = {
    init,
    setHolders,
    setScroll(v) { scrollAmount = v; },
  };
})();
