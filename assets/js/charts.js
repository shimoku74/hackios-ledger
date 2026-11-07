// Small single-series line chart in SVG: 2px line, 10% area wash, recessive grid,
// a crosshair that snaps to the nearest point, and the same readout on keyboard focus.
(() => {
  const NS = 'http://www.w3.org/2000/svg';

  function svgEl(name, attrs = {}) {
    const el = document.createElementNS(NS, name);
    for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v);
    return el;
  }

  const tooltipEl = () => document.getElementById('tooltip');

  function showTooltip(rows, clientX, clientY) {
    const tip = tooltipEl();
    tip.textContent = '';
    rows.forEach((row, i) => {
      const line = document.createElement(i === 0 ? 'b' : 'span');
      line.textContent = row;
      tip.append(line);
      if (i > 0 && i < rows.length - 1) tip.append(document.createElement('br'));
    });
    tip.hidden = false;
    const { width, height } = tip.getBoundingClientRect();
    const x = Math.min(Math.max(clientX + 14, 8), innerWidth - width - 8);
    const y = Math.max(clientY - height - 12, 8);
    tip.style.left = `${x}px`;
    tip.style.top = `${y}px`;
  }

  const hideTooltip = () => { tooltipEl().hidden = true; };

  // spec: { points: [{ x, y }], xTicks: [{ x, label }], yTicks: [{ y, label }], xScale: 'linear' | 'log',
  //         endLabel?: string, tooltip: (point) => string[], ariaLabel, axisTitle? }
  function lineChart(host, spec) {
    host.textContent = '';
    const width = Math.max(host.clientWidth, 280);
    const narrow = width < 560;
    const height = narrow ? 240 : 340;
    const m = { top: 18, right: spec.endLabel ? (narrow ? 12 : 92) : 12, bottom: spec.axisTitle ? 54 : 30, left: narrow ? 58 : 76 };
    const innerW = width - m.left - m.right;
    const innerH = height - m.top - m.bottom;

    const tx = (v) => (spec.xScale === 'log' ? Math.log10(v) : v);
    const xs = spec.points.map((p) => tx(p.x));
    const minX = Math.min(...xs), maxX = Math.max(...xs);
    const ys = [...spec.points.map((p) => p.y), ...spec.yTicks.map((t) => t.y)];
    const minY = Math.min(...ys), maxY = Math.max(...ys);
    const sx = (v) => m.left + ((tx(v) - minX) / (maxX - minX || 1)) * innerW;
    const sy = (v) => m.top + innerH - ((v - minY) / (maxY - minY || 1)) * innerH;

    const svg = svgEl('svg', { viewBox: `0 0 ${width} ${height}`, role: 'img', 'aria-label': spec.ariaLabel, tabindex: '0' });

    for (const t of spec.yTicks) {
      svg.append(svgEl('line', { x1: m.left, x2: width - m.right, y1: sy(t.y), y2: sy(t.y), stroke: 'var(--line)', 'stroke-width': 1 }));
      const label = svgEl('text', { x: m.left - 10, y: sy(t.y) + 4, 'text-anchor': 'end', 'font-size': 11.5, fill: 'var(--fg-2)' });
      label.textContent = t.label;
      svg.append(label);
    }
    const visibleTicks = narrow ? spec.xTicks.filter((_, i) => i % 2 === 0) : spec.xTicks;
    for (const t of visibleTicks) {
      const label = svgEl('text', { x: sx(t.x), y: height - m.bottom + 20, 'text-anchor': 'middle', 'font-size': 11.5, fill: 'var(--fg-2)' });
      label.textContent = t.label;
      svg.append(label);
    }
    if (spec.axisTitle) {
      const title = svgEl('text', { x: m.left + innerW / 2, y: height - 8, 'text-anchor': 'middle', 'font-size': 12, fill: 'var(--fg-2)' });
      title.textContent = spec.axisTitle;
      svg.append(title);
    }

    const path = spec.points.map((p, i) => `${i ? 'L' : 'M'}${sx(p.x).toFixed(1)} ${sy(p.y).toFixed(1)}`).join(' ');
    const last = spec.points[spec.points.length - 1];
    svg.append(svgEl('path', { d: `${path} L${sx(last.x)} ${m.top + innerH} L${sx(spec.points[0].x)} ${m.top + innerH} Z`, fill: 'var(--fg)', opacity: 0.1 }));
    svg.append(svgEl('path', { d: path, fill: 'none', stroke: 'var(--fg)', 'stroke-width': 2, 'stroke-linejoin': 'round', 'stroke-linecap': 'round' }));

    svg.append(svgEl('circle', { cx: sx(last.x), cy: sy(last.y), r: 5, fill: 'var(--red)', stroke: 'var(--bg)', 'stroke-width': 2 }));
    if (spec.endLabel && !narrow) {
      const end = svgEl('text', { x: sx(last.x) + 12, y: sy(last.y) + 4, 'font-size': 12.5, 'font-weight': 700, fill: 'var(--fg)' });
      end.textContent = spec.endLabel;
      svg.append(end);
    }

    const cross = svgEl('line', { y1: m.top, y2: m.top + innerH, stroke: 'var(--fg)', 'stroke-width': 1, visibility: 'hidden' });
    const marker = svgEl('circle', { r: 5, fill: 'var(--fg)', stroke: 'var(--bg)', 'stroke-width': 2, visibility: 'hidden' });
    svg.append(cross, marker);

    let index = spec.points.length - 1;

    const select = (i, clientX, clientY) => {
      index = i;
      const p = spec.points[i];
      cross.setAttribute('x1', sx(p.x));
      cross.setAttribute('x2', sx(p.x));
      cross.setAttribute('visibility', 'visible');
      marker.setAttribute('cx', sx(p.x));
      marker.setAttribute('cy', sy(p.y));
      marker.setAttribute('visibility', 'visible');
      showTooltip(spec.tooltip(p), clientX, clientY);
    };

    const clear = () => {
      cross.setAttribute('visibility', 'hidden');
      marker.setAttribute('visibility', 'hidden');
      hideTooltip();
    };

    svg.addEventListener('pointermove', (e) => {
      const r = svg.getBoundingClientRect();
      const px = ((e.clientX - r.left) / r.width) * width;
      let best = 0;
      let bestDist = Infinity;
      spec.points.forEach((p, i) => {
        const d = Math.abs(sx(p.x) - px);
        if (d < bestDist) { bestDist = d; best = i; }
      });
      select(best, e.clientX, e.clientY);
    });
    svg.addEventListener('pointerleave', clear);
    svg.addEventListener('blur', clear);
    svg.addEventListener('focus', () => {
      const r = svg.getBoundingClientRect();
      select(index, r.left + (sx(spec.points[index].x) / width) * r.width, r.top + 20);
    });
    svg.addEventListener('keydown', (e) => {
      if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
      e.preventDefault();
      const next = Math.min(Math.max(index + (e.key === 'ArrowRight' ? 1 : -1), 0), spec.points.length - 1);
      const r = svg.getBoundingClientRect();
      select(next, r.left + (sx(spec.points[next].x) / width) * r.width, r.top + 20);
    });

    host.append(svg);
  }

  window.Charts = { lineChart, showTooltip, hideTooltip };
})();
