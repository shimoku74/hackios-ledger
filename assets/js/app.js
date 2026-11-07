(() => {
  const C = window.LEDGER;
  const { t } = window.I18n;
  const $ = (id) => document.getElementById(id);

  const store = {
    chain: null,
    market: null,
    snapshot: null,
    snapshotFailed: false,
    history: null,
    lookalikes: null,
    repos: null,
    reposFailed: false,
  };

  // All dynamic text goes through textContent, including commit messages and API fields.
  function el(tag, props = {}, ...children) {
    const node = document.createElement(tag);
    for (const [k, v] of Object.entries(props)) {
      if (k === 'class') node.className = v;
      else if (k === 'text') node.textContent = v;
      else if (k === 'on') for (const [ev, fn] of Object.entries(v)) node.addEventListener(ev, fn);
      else node.setAttribute(k, v);
    }
    for (const c of children) if (c !== null && c !== undefined) node.append(c);
    return node;
  }

  const ext = (href, text, cls) => el('a', { href, text, target: '_blank', rel: 'noopener', ...(cls ? { class: cls } : {}) });
  const scan = (path) => `https://bscscan.com/${path}`;
  const short = (a) => `${a.slice(0, 6)}…${a.slice(-4)}`;
  const na = () => t('unavailable');
  const loc = () => window.I18n.locale;

  const fmt = {
    num: (v, digits = 0) => (v == null ? na() : new Intl.NumberFormat(loc(), { maximumFractionDigits: digits }).format(v)),
    compact: (v) => (v == null ? na() : new Intl.NumberFormat(loc(), { notation: 'compact', maximumFractionDigits: 2 }).format(v)),
    usd: (v) => {
      if (v == null) return na();
      const digits = Math.abs(v) >= 100 ? 0 : 2;
      return new Intl.NumberFormat(loc(), { style: 'currency', currency: 'USD', maximumFractionDigits: digits, minimumFractionDigits: digits }).format(v);
    },
    price: (v) => {
      if (v == null) return na();
      if (v >= 0.01) return `$${v.toFixed(4)}`;
      const zeros = Math.max(0, -Math.floor(Math.log10(v)) - 1);
      return `$${v.toFixed(zeros + 3)}`;
    },
    tick: (v) => `$${new Intl.NumberFormat('en-US', { maximumSignificantDigits: 3, maximumFractionDigits: 12 }).format(v)}`,
    quote: (v) => (v == null ? na() : new Intl.NumberFormat(loc(), { maximumFractionDigits: v < 1 ? 4 : 2 }).format(v)),
    pct: (v, digits = 2) => (v == null ? na() : `${new Intl.NumberFormat(loc(), { maximumFractionDigits: digits }).format(v)}%`),
    date: (ts) => (ts ? new Intl.DateTimeFormat(loc(), { day: 'numeric', month: 'short', year: 'numeric' }).format(ts * 1000) : na()),
  };

  // Round axis steps: 1, 2, 2.5 or 5 times a power of ten, from zero up past the maximum.
  function niceTicks(max, count = 4) {
    const rough = max / count;
    const power = Math.pow(10, Math.floor(Math.log10(rough)));
    const step = [1, 2, 2.5, 5, 10].map((m) => m * power).find((v) => v >= rough);
    const ticks = [];
    for (let i = 0; ticks.length < 8; i++) {
      ticks.push(Number((i * step).toPrecision(6)));
      if (i * step >= max) break;
    }
    return ticks;
  }

  function usdQuote() { return store.market?.quoteUsd ?? null; }

  // Price and liquidity come from the pool's own reserves when possible; DexScreener is the fallback.
  function livePrice() {
    const r = store.chain?.reserves;
    const q = usdQuote();
    if (r && q && r.token > 0) return (r.quote / r.token) * q;
    return store.market?.priceUsd ?? null;
  }
  function liveLiquidity() {
    const r = store.chain?.reserves;
    const q = usdQuote();
    if (r && q) return r.quote * q * 2;
    return store.market?.liquidityUsd ?? null;
  }
  function liveFdv() {
    const p = livePrice();
    const s = store.chain?.supply;
    return p && s ? p * s : store.market?.fdv ?? null;
  }

  /* ---------- Shell ---------- */

  const SECTIONS = [
    ['how', 'nav_how'], ['team', 'nav_team'], ['why', 'nav_why'], ['facts', 'nav_facts'], ['money', 'nav_money'], ['exit', 'nav_exit'], ['holders', 'nav_holders'],
    ['wallet', 'nav_wallet'], ['work', 'nav_work'], ['shield', 'nav_shield'], ['promises', 'nav_promises'], ['faq', 'nav_faq'],
  ];

  function renderMenu() {
    $('menuList').replaceChildren(...SECTIONS.map(([id, key], i) => {
      const a = el('a', { href: `#${id}` }, el('small', { text: `NO_${String(i + 1).padStart(3, '0')}` }), t(key));
      a.style.setProperty('--i', i);
      return el('li', {}, a);
    }));
    const names = { en: 'EN', ru: 'RU', ua: 'UA', zh: '中文' };
    $('langs').replaceChildren(...window.I18n.langs.map((code) =>
      el('button', { type: 'button', text: names[code], 'aria-pressed': String(code === window.I18n.lang), on: { click: () => window.I18n.set(code) } })));
  }

  function syncScenes() {
    const c = store.chain;
    window.Scenes.setHowVars({
      tax: c?.buyTax != null ? String(c.buyTax / 100) : '?',
      fee: c?.fee ? String(c.fee.protocol / 100) : '?',
      supply: c?.supply ? fmt.compact(c.supply) : '?',
    });
    window.Scenes.setNumber('num_tg', fmt.compact(C.telegramSubscribers));
    if (store.snapshot) window.Scenes.setNumber('num_holders', fmt.num(store.snapshot.totals.holders));
    const kernel = store.repos?.repos.find((r) => r.name === 'hakios-xnu-kernel');
    if (kernel) {
      window.Scenes.setNumber('num_stars', fmt.num(kernel.stars));
      window.Scenes.setNumber('num_forks', fmt.num(kernel.forks));
    }
    if (store.repos?.publicRepos != null) window.Scenes.setNumber('num_repos', fmt.num(store.repos.publicRepos));
    window.Scenes.setPass([
      ['OWNER', c?.owner ? short(c.owner) : na()],
      ['SUPPLY', c?.supply ? fmt.compact(c.supply) : na()],
      ['TAX', c?.buyTax != null ? `${c.buyTax / 100}% / ${c.sellTax / 100}%` : na()],
      ['LP BURNED', c?.lpBurnedPct != null ? fmt.pct(c.lpBurnedPct, 1) : na()],
    ]);
  }

  function renderWhy() {
    const c = store.chain;
    const vars = {
      tax: c?.buyTax != null ? c.buyTax / 100 : '?',
      fee: c?.fee ? c.fee.protocol / 100 : '?',
    };
    $('whyList').replaceChildren(...[1, 2, 3].map((n) => el('li', { class: 'fact' },
      el('span', { class: 'fact__no', text: `NO-${String(n).padStart(3, '0')}` }),
      el('div', { class: 'fact__body' },
        el('h3', { class: 'fact__t', text: t(`why_${n}_t`) }),
        el('p', { class: 'fact__d', text: t(`why_${n}_d`, vars) })),
    )));
    $('whyUse').textContent = C.taxUse ? (C.taxUse[window.I18n.lang] || C.taxUse.en) : t('why_use_none');
    motion?.observe($('whyList'));
  }

  function renderStats() {
    const m = store.market;
    const rows = [
      ['s_price', fmt.price(livePrice())],
      ['s_fdv', fmt.usd(liveFdv())],
      ['s_liq', fmt.usd(liveLiquidity())],
      ['s_vol', fmt.usd(m?.volume24)],
      ['s_holders', store.snapshot ? fmt.num(store.snapshot.totals.holders) : na()],
      ['s_block', store.chain?.block ? fmt.num(store.chain.block) : na()],
    ];
    $('stats').replaceChildren(...rows.map(([k, v]) => el('div', {}, el('dt', { text: t(k) }), el('dd', { text: v }))));

    const c = store.chain;
    const parts = [
      [t('s_price'), fmt.price(livePrice())],
      [t('s_liq'), fmt.usd(liveLiquidity())],
      ['TAX', c?.buyTax != null ? `${c.buyTax / 100}% / ${c.sellTax / 100}%` : na()],
      ['OWNER', c?.owner ? short(c.owner) : na()],
      ['LP BURNED', c?.lpBurnedPct != null ? fmt.pct(c.lpBurnedPct) : na()],
      [t('s_block'), c?.block ? fmt.num(c.block) : na()],
      ['CA', short(C.token)],
    ];
    const group = () => parts.flatMap(([k, v]) => [el('span', {}, `${k} `, el('b', { text: v }))]);
    $('ticker').replaceChildren(...group(), ...group(), ...group(), ...group());
    $('footBlock').textContent = c?.block ? `BLOCK #${c.block} · CHAIN 56` : 'CHAIN 56';
  }

  /* ---------- Facts ---------- */

  function facts() {
    const c = store.chain;
    if (!c) return [];
    const tax = c.buyTax != null ? c.buyTax / 100 : null;
    const year = c.taxExpiry ? new Date(c.taxExpiry * 1000).getUTCFullYear() : na();
    const liq = liveLiquidity();
    return [
      { key: 'owner', verdict: c.owner === `0x${'0'.repeat(40)}` ? 'ok' : 'risk', title: t('f_owner_t'), desc: t('f_owner_d'), link: scan(`address/${C.token}#readProxyContract`) },
      { key: 'supply', verdict: 'ok', title: t('f_supply_t'), desc: t('f_supply_d', { supply: fmt.num(c.supply) }), link: C.links.sourcify },
      { key: 'lp', verdict: c.lpBurnedPct != null && c.lpBurnedPct >= 99.9 ? 'ok' : 'risk', title: t('f_lp_t'), desc: t('f_lp_d', { pct: fmt.num(c.lpBurnedPct, 2) }), link: scan(`token/${C.pool}#balances`) },
      { key: 'code', verdict: 'ok', title: t('f_code_t'), desc: t('f_code_d'), link: C.links.sourcify },
      { key: 'tax', verdict: 'warn', title: t('f_tax_t', { buy: tax ?? '?' }), desc: t('f_tax_d', { year }), link: scan(`address/${C.token}#readProxyContract`) },
      { key: 'split', verdict: 'warn', title: t('f_split_t'), desc: t('f_split_d'), link: scan(`address/${C.taxProcessor}#readProxyContract`) },
      { key: 'div', verdict: 'warn', title: t('f_div_t'), desc: t('f_div_d', { div: c.fee ? c.fee.dividend / 100 : '?' }), link: scan(`address/${C.taxProcessor}#readProxyContract`) },
      { key: 'liq', verdict: liq != null && liq < 100000 ? 'risk' : 'warn', title: t('f_liq_t'), desc: t('f_liq_d', { liq: fmt.usd(liq), fdv: fmt.usd(liveFdv()) }), link: C.links.dex },
      { key: 'quote', verdict: 'warn', title: t('f_quote_t'), desc: t('f_quote_d'), link: scan(`token/${C.quote}`) },
    ];
  }

  function renderFacts() {
    const label = { ok: 'v_ok', warn: 'v_warn', risk: 'v_risk' };
    const list = facts();
    if (!list.length) {
      $('factsList').replaceChildren(el('li', { class: 'msg', text: t('live_err') }));
      return;
    }
    $('factsList').replaceChildren(...list.map((f, i) => el('li', { class: 'fact' },
      el('span', { class: 'fact__no', text: `NO-${String(i + 1).padStart(3, '0')}` }),
      el('div', { class: 'fact__body' }, el('h3', { class: 'fact__t', text: f.title }), el('p', { class: 'fact__d', text: f.desc })),
      el('span', { class: 'fact__v' }, el('span', { class: `badge badge--${f.verdict}`, text: t(label[f.verdict]) })),
      ext(f.link, `${t('verify')} ↗`, 'fact__a'),
    )));
    motion?.observe($('factsList'));
  }

  /* ---------- Money flow ---------- */

  function flowFigures() {
    const c = store.chain;
    const tax = c?.buyTax != null ? `${c.buyTax / 100}%` : '—';
    return [
      { value: tax, note: 'buyTaxRate() · sellTaxRate()' },
      { value: c?.threshold ? fmt.compact(c.threshold) : '—', note: 'liquidationThreshold()' },
      { value: c?.fee ? `${c.fee.protocol / 100}%` : '—', note: 'feeConfig().feeRate' },
      { value: c?.streamed != null ? fmt.quote(c.streamed) : '—', note: 'GOOGLB · totalQuoteSentToMarketing()' },
      { value: benefBalance != null ? fmt.quote(benefBalance) : '—', note: 'GOOGLB · balanceOf()' },
    ];
  }

  let benefBalance = null;

  function renderFlow() {
    const c = store.chain;
    const q = usdQuote();
    const beneficiary = c?.beneficiary;
    const steps = [
      { title: t('m1_t'), text: t('m1_d', { pending: fmt.num(c?.pendingTax) }), addr: C.token },
      { title: t('m2_t'), text: t('m2_d', { threshold: fmt.num(c?.threshold) }), addr: C.taxProcessor },
      { title: t('m3_t'), text: t('m3_d', { protocol: c?.fee ? c.fee.protocol / 100 : '?' }), addr: C.flapFee },
      { title: t('m4_t'), text: t('m4_d', { streamed: fmt.quote(c?.streamed), usd: c?.streamed != null && q ? fmt.usd(c.streamed * q) : na() }), addr: C.vault },
      { title: t('m5_t'), text: t('m5_d', { balance: fmt.quote(benefBalance) }), addr: beneficiary },
    ];
    $('flowSteps').replaceChildren(...steps.map((s) => el('li', { class: 'flow__step' },
      el('h3', { text: s.title }),
      el('p', { text: s.text }),
      s.addr ? ext(scan(`address/${s.addr}`), s.addr, 'addr') : null,
    )));
    window.Scenes.flowRefresh();
  }

  let ledgerOpen = false;

  function renderLedger() {
    const beneficiary = store.chain?.beneficiary;
    $('ledgerAddr').replaceChildren(beneficiary ? ext(scan(`address/${beneficiary}`), beneficiary) : '');
    const flows = store.snapshot?.flows;
    const table = $('ledgerTable');
    const more = $('ledgerMore');
    if (!flows) {
      $('ledgerTiles').replaceChildren();
      table.replaceChildren(el('caption', { class: 'msg', text: store.snapshotFailed ? t('no_snapshot') : '…' }));
      more.hidden = true;
      return;
    }
    const q = usdQuote();
    const sum = (rows) => rows.reduce((s, r) => s + r.amount, 0);
    const tile = (k, v) => el('div', {}, el('dt', { text: t(k) }), el('dd', {}, `${fmt.quote(v)} GOOGLB`, el('small', { text: q && v != null ? `≈ ${fmt.usd(v * q)}` : '' })));
    $('ledgerTiles').replaceChildren(tile('ledger_in', sum(flows.in)), tile('ledger_out', sum(flows.out)), tile('ledger_now', benefBalance));

    const rows = [
      ...flows.in.map((r) => ({ ...r, dir: 'in', party: r.from })),
      ...flows.out.map((r) => ({ ...r, dir: 'out', party: r.to })),
    ].sort((a, b) => b.block - a.block);
    const shown = ledgerOpen ? rows : rows.slice(0, 8);
    const partyLabel = (a) => (a === C.vault ? 'Vault' : a === C.taxProcessor ? 'TaxProcessor' : a === C.pool ? 'Pool' : short(a));
    table.replaceChildren(
      el('thead', {}, el('tr', {}, ...['th_date', 'th_dir', 'th_amount', 'th_party', 'th_tx'].map((k) => el('th', { text: t(k), class: k === 'th_amount' ? 'num' : '' })))),
      el('tbody', {}, ...shown.map((r) => el('tr', {},
        el('td', { text: fmt.date(r.ts) }),
        el('td', {}, el('span', { class: `dir dir--${r.dir}`, text: t(r.dir === 'in' ? 'dir_in' : 'dir_out') })),
        el('td', { class: 'num', text: fmt.quote(r.amount) }),
        el('td', {}, ext(scan(`address/${r.party}`), partyLabel(r.party))),
        el('td', {}, ext(scan(`tx/${r.tx}`), short(r.tx))),
      ))),
    );
    more.hidden = rows.length <= 8;
    more.textContent = ledgerOpen ? t('ledger_less') : t('ledger_more', { n: rows.length });
  }

  /* ---------- Exit calculator ---------- */

  const calc = { mode: 'sell', amount: 1000000 };
  const RANGE = { sell: [1000, 200000000], buy: [1, 20000] };

  const rangeToAmount = (v, mode) => {
    const [lo, hi] = RANGE[mode];
    return lo * Math.pow(hi / lo, v / 1000);
  };
  const amountToRange = (a, mode) => {
    const [lo, hi] = RANGE[mode];
    return Math.round((Math.log(Math.min(Math.max(a, lo), hi) / lo) / Math.log(hi / lo)) * 1000);
  };

  function renderCalcFrame() {
    const c = store.chain;
    $('exitLead').textContent = t('exit_lead', { tax: c?.sellTax != null ? c.sellTax / 100 : 1 });
    $('calcLabel').textContent = t(calc.mode === 'sell' ? 'in_tokens' : 'in_usd');
    document.querySelectorAll('#calcMode button').forEach((b) => b.classList.toggle('on', b.dataset.mode === calc.mode));
    const presets = calc.mode === 'sell'
      ? [[100000, '100K'], [1000000, '1M · 0.1%'], [10000000, '10M · 1%'], [50000000, '50M · 5%']]
      : [[10, '$10'], [100, '$100'], [1000, '$1K'], [5000, '$5K']];
    $('calcPresets').replaceChildren(...presets.map(([v, label]) => el('button', {
      type: 'button',
      text: label,
      on: { click: () => setAmount(v) },
    })));
  }

  function setAmount(v, fromRange) {
    calc.amount = v;
    $('calcAmount').value = String(Math.round(v * 100) / 100);
    if (!fromRange) $('calcRange').value = amountToRange(v, calc.mode);
    renderCalcResult();
  }

  function renderCalcResult() {
    const c = store.chain;
    const q = usdQuote();
    const r = c?.reserves;
    const empty = () => ['calcOut', 'calcSpot', 'calcLoss', 'calcAfter'].forEach((id) => { $(id).textContent = na(); });
    if (!r || !q || c.sellTax == null || !(calc.amount > 0)) { empty(); $('calcOutAlt').textContent = ''; return; }
    if (calc.mode === 'sell') {
      const res = window.Chain.quoteSell(calc.amount, r, c.sellTax);
      $('calcOut').textContent = fmt.usd(res.out * q);
      $('calcOutAlt').textContent = `${fmt.quote(res.out)} GOOGLB`;
      $('calcSpot').textContent = fmt.usd(res.spot * q);
      $('calcLoss').textContent = fmt.pct(res.loss * 100, 1);
      const taxed = calc.amount - res.taxTokens;
      $('calcAfter').textContent = fmt.price(((r.quote - res.out) / (r.token + taxed)) * q);
    } else {
      const spend = calc.amount / q;
      const res = window.Chain.quoteBuy(spend, r, c.buyTax);
      $('calcOut').textContent = `${fmt.compact(res.out)}`;
      $('calcOutAlt').textContent = `${fmt.num(res.out)} $HackiOS · ${fmt.quote(spend)} GOOGLB`;
      $('calcSpot').textContent = fmt.compact(res.spot);
      $('calcLoss').textContent = fmt.pct(res.loss * 100, 1);
      const gross = res.out + res.taxTokens;
      $('calcAfter').textContent = fmt.price(((r.quote + spend) / (r.token - gross)) * q);
    }
  }

  function renderCurve() {
    const c = store.chain;
    const q = usdQuote();
    const host = $('curvePlot');
    if (!c?.reserves || !q || c.sellTax == null) { host.textContent = t('live_err'); return; }
    const points = [];
    for (let i = 0; i <= 48; i++) {
      const pct = 0.001 * Math.pow(10, (i / 48) * Math.log10(25 / 0.001));
      const amount = (pct / 100) * c.supply;
      const res = window.Chain.quoteSell(amount, c.reserves, c.sellTax);
      points.push({ x: pct, y: res.loss * 100, amount, out: res.out * q });
    }
    const label = (v) => `${v}%`;
    const lossTicks = niceTicks(Math.max(...points.map((p) => p.y)));
    window.Charts.lineChart(host, {
      points,
      xScale: 'log',
      xTicks: [0.001, 0.01, 0.1, 1, 10].map((x) => ({ x, label: label(x) })),
      yTicks: lossTicks.map((y) => ({ y, label: `${y}%` })),
      axisTitle: t('curve_x'),
      ariaLabel: t('curve_title'),
      tooltip: (p) => [fmt.pct(p.y, 1), `${t('th_size')}: ${fmt.pct(p.x, 3)} · ${fmt.compact(p.amount)}`, `${t('r_get')}: ${fmt.usd(p.out)}`],
    });
    const sample = points.filter((_, i) => i % 6 === 0);
    $('curveTable').replaceChildren(
      el('thead', {}, el('tr', {}, el('th', { text: t('th_size') }), el('th', { text: t('th_tokens'), class: 'num' }), el('th', { text: t('th_loss'), class: 'num' }), el('th', { text: t('r_get'), class: 'num' }))),
      el('tbody', {}, ...sample.map((p) => el('tr', {}, el('td', { text: fmt.pct(p.x, 3) }), el('td', { class: 'num', text: fmt.compact(p.amount) }), el('td', { class: 'num', text: fmt.pct(p.y, 1) }), el('td', { class: 'num', text: fmt.usd(p.out) })))),
    );
  }

  function renderPrice() {
    const h = store.history;
    const host = $('pricePlot');
    if (!h || !h.length) { host.textContent = t('live_err'); $('athDrop').textContent = '—'; return; }
    const ath = Math.max(...h.map((d) => d.high));
    const current = livePrice() ?? h[h.length - 1].close;
    $('athDrop').textContent = fmt.pct(((current - ath) / ath) * 100, 1);
    const points = h.map((d) => ({ x: d.t, y: d.close, volume: d.volume }));
    const dateShort = (ts) => new Intl.DateTimeFormat(loc(), { day: 'numeric', month: 'short' }).format(ts * 1000);
    const stride = Math.max(1, Math.floor(points.length / 6));
    window.Charts.lineChart(host, {
      points,
      xScale: 'linear',
      xTicks: points.filter((_, i) => i % stride === 0).map((p) => ({ x: p.x, label: dateShort(p.x) })),
      yTicks: niceTicks(Math.max(...points.map((p) => p.y))).map((y) => ({ y, label: y === 0 ? '$0' : fmt.tick(y) })),
      endLabel: fmt.price(points[points.length - 1].y),
      ariaLabel: t('price_title'),
      tooltip: (p) => [fmt.price(p.y), fmt.date(p.x), `${t('s_vol')}: ${fmt.usd(p.volume)}`],
    });
    $('priceTable').replaceChildren(
      el('thead', {}, el('tr', {}, el('th', { text: t('th_date') }), el('th', { text: t('th_close'), class: 'num' }), el('th', { text: t('s_vol'), class: 'num' }))),
      el('tbody', {}, ...[...points].reverse().map((p) => el('tr', {}, el('td', { text: fmt.date(p.x) }), el('td', { class: 'num', text: fmt.price(p.y) }), el('td', { class: 'num', text: fmt.usd(p.volume) })))),
    );
  }

  /* ---------- Holders ---------- */

  let holdersOpen = false;

  function holderLabel(a) {
    if (a === C.pool) return t('lbl_pool');
    if (a === C.token) return t('lbl_contract');
    if (a === C.flapFee) return t('lbl_flap');
    if (a === store.chain?.beneficiary) return t('lbl_benef');
    return null;
  }

  function renderHolders() {
    const s = store.snapshot;
    const table = $('holdersTable');
    if (!s) {
      $('holdersLead').textContent = store.snapshotFailed ? t('no_snapshot') : '…';
      table.replaceChildren();
      $('dist').replaceChildren();
      $('distLegend').replaceChildren();
      $('holdersMore').hidden = true;
      return;
    }
    $('holdersLead').textContent = t('holders_lead', { block: fmt.num(s.block), when: fmt.date(s.generatedAt) });
    const supply = store.chain?.supply || 1e9;
    const share = (b) => (b / supply) * 100;
    const poolEntry = s.holders.find((h) => h.a === C.pool);
    const rest = s.holders.filter((h) => h.a !== C.pool);
    const top10 = rest.slice(0, 10).reduce((sum, h) => sum + h.b, 0);
    const others = rest.slice(10).reduce((sum, h) => sum + h.b, 0);
    const segments = [
      { key: 'seg_pool', v: share(poolEntry?.b || 0), color: 'var(--seg-1)', ink: 'var(--paper)' },
      { key: 'seg_top', v: share(top10), color: 'var(--seg-2)', ink: 'var(--paper)' },
      { key: 'seg_rest', v: share(others), color: 'var(--seg-3)', ink: 'var(--paper)' },
    ];
    const dist = $('dist');
    dist.replaceChildren(...segments.map((seg) => {
      const b = el('button', { type: 'button', 'aria-label': `${t(seg.key)}: ${fmt.pct(seg.v, 1)}` });
      b.style.flex = `${Math.max(seg.v, 0.6)} 1 0`;
      b.style.background = seg.color;
      b.style.color = seg.ink;
      const showTip = (e) => {
        const r = b.getBoundingClientRect();
        window.Charts.showTooltip([fmt.pct(seg.v, 2), t(seg.key)], e.clientX ?? r.left + r.width / 2, e.clientY ?? r.top);
      };
      b.addEventListener('pointermove', showTip);
      b.addEventListener('focus', showTip);
      b.addEventListener('pointerleave', window.Charts.hideTooltip);
      b.addEventListener('blur', window.Charts.hideTooltip);
      return b;
    }));
    // A label only goes inside a segment once it is measured to fit.
    requestAnimationFrame(() => {
      [...dist.children].forEach((b, i) => {
        const label = fmt.pct(segments[i].v, 1);
        if (b.getBoundingClientRect().width > label.length * 9 + 24) b.textContent = label;
      });
    });
    $('distLegend').replaceChildren(...segments.map((seg) => {
      const swatch = el('i');
      swatch.style.background = seg.color;
      return el('li', {}, swatch, `${t(seg.key)} · ${fmt.pct(seg.v, 1)}`);
    }));
    motion?.observe(dist.parentElement);

    const shown = holdersOpen ? s.holders : s.holders.slice(0, 20);
    table.replaceChildren(
      el('thead', {}, el('tr', {}, ...[['th_rank'], ['th_wallet'], ['th_tokens', 'num'], ['th_share', 'num'], ['th_first']].map(([k, cls]) => el('th', { text: t(k), ...(cls ? { class: cls } : {}) })))),
      el('tbody', {}, ...shown.map((h, i) => {
        const label = holderLabel(h.a);
        return el('tr', {},
          el('td', { text: String(i + 1) }),
          el('td', {}, ext(scan(`token/${C.token}?a=${h.a}`), short(h.a)), label ? el('span', { class: 'lbl', text: label }) : null),
          el('td', { class: 'num', text: fmt.num(h.b) }),
          el('td', { class: 'num', text: fmt.pct(share(h.b), 3) }),
          el('td', { text: fmt.date(h.first) }),
        );
      })),
    );
    const more = $('holdersMore');
    more.hidden = s.holders.length <= 20;
    more.textContent = holdersOpen ? t('ledger_less') : t('holders_more', { n: s.holders.length });
  }

  /* ---------- Wallet check ---------- */

  const isAddress = (v) => /^0x[0-9a-fA-F]{40}$/.test(v);
  let walletIndex = null;
  let lastWallet = null;

  async function loadWalletIndex() {
    if (walletIndex) return walletIndex;
    try {
      walletIndex = (await window.Chain.getJSON('data/wallets.json', 15000)).wallets;
    } catch {
      return null;
    }
    return walletIndex;
  }

  async function checkWallet(raw) {
    const address = raw.trim().toLowerCase();
    const msg = $('walletMsg');
    const tiles = $('walletTiles');
    tiles.hidden = true;
    if (!isAddress(address)) { msg.textContent = t('wallet_bad'); lastWallet = null; return; }
    msg.textContent = '…';
    const [live, index] = await Promise.all([window.Chain.readWallet(address), loadWalletIndex()]);
    if (live.balance == null) { msg.textContent = t('wallet_err'); return; }
    lastWallet = { address, live, historyKnown: index !== null, record: index?.[address] || null };
    renderWallet();
  }

  function renderWallet() {
    if (!lastWallet) return;
    const { address, live, record, historyKnown } = lastWallet;
    const msg = $('walletMsg');
    const tiles = $('walletTiles');
    const s = store.snapshot;
    const c = store.chain;
    const q = usdQuote();
    if (!historyKnown) {
      msg.textContent = t('w_nohistory');
    } else if (live.balance === 0) {
      msg.textContent = record ? t('w_gone') : t('w_none');
    } else if (!record && s) {
      msg.textContent = t('w_new', { block: fmt.num(s.block) });
    } else {
      msg.textContent = '';
    }
    if (live.balance === 0 && !record && historyKnown) { tiles.hidden = true; return; }
    const price = livePrice();
    const exitUsd = c?.reserves && q && live.balance > 0 ? window.Chain.quoteSell(live.balance, c.reserves, c.sellTax).out * q : 0;
    const rank = s ? s.holders.findIndex((h) => h.a === address) : -1;
    const toTokens = (wei) => Number(BigInt(wei) / 10n ** 12n) / 1e6;
    const rows = [
      ['w_balance', fmt.num(live.balance, 2)],
      ['w_value', price ? fmt.usd(live.balance * price) : na()],
      ['w_exit', fmt.usd(exitUsd)],
      ['w_share', fmt.pct((live.balance / (c?.supply || 1e9)) * 100, 4)],
      ['w_rank', rank >= 0 ? `#${rank + 1}` : na()],
      ['w_first', record ? fmt.date(record[3]) : na()],
      ['w_flow', record ? `${fmt.compact(toTokens(record[1]))} / ${fmt.compact(toTokens(record[2]))}` : na()],
      ['w_div', `${fmt.quote(live.withdrawable ?? 0)} GOOGLB`],
    ];
    tiles.replaceChildren(...rows.map(([k, v]) => el('div', {}, el('dt', { text: t(k) }), el('dd', { text: v }))));
    tiles.hidden = false;
    tiles.dataset.addr = address;
  }

  /* ---------- Work ---------- */

  function renderWork() {
    const r = store.repos;
    $('workMsg').textContent = store.reposFailed ? t('work_err') : '';
    if (r) {
      $('repos').replaceChildren(...r.repos.map((repo) => el('li', {}, el('a', { href: repo.url, target: '_blank', rel: 'noopener' },
        el('b', { text: repo.name }),
        el('strong', { text: fmt.num(repo.stars) }),
        el('small', { text: `${t('work_stars')} · ${t('work_forks')}: ${fmt.num(repo.forks)}` }),
      ))));
      $('commits').replaceChildren(...r.commits.map((co) => el('li', {},
        el('span', { class: 'when', text: fmt.date(Date.parse(co.date) / 1000) }),
        el('div', {}, ext(co.url, co.message), el('small', { text: `${co.repo} · ${co.sha}` })),
      )));
    }
    $('shipped').replaceChildren(...C.shipped.map((item) => el('li', {},
      el('span', { class: 'when', text: fmt.date(Date.parse(item.date) / 1000) }),
      el('div', {}, ext(item.url, item.title), el('small', { text: item.text[window.I18n.lang] || item.text.en })),
    )));
  }

  /* ---------- Fake check ---------- */

  let shieldValue = '';

  function renderShield() {
    $('caAddr').textContent = C.token;
    const msg = $('shieldMsg');
    msg.className = 'verdict';
    if (!shieldValue) { msg.textContent = ''; } else if (!isAddress(shieldValue)) {
      msg.textContent = t('wallet_bad');
    } else if (shieldValue.toLowerCase() === C.token) {
      msg.textContent = t('shield_yes');
      msg.classList.add('yes');
    } else {
      msg.textContent = t('shield_no');
      msg.classList.add('no');
    }
    const list = store.lookalikes;
    const items = list?.length
      ? list.map((x) => el('li', {},
          el('span', { class: 'when', text: x.chain }),
          el('div', {}, ext(x.url, x.address), el('small', { text: `${x.symbol}${x.liquidity != null ? ` · ${t('s_liq')} ${fmt.usd(x.liquidity)}` : ''}` })),
        ))
      : [el('li', {}, el('span', { text: list ? t('shield_empty') : '…' }))];
    $('lookalikes').replaceChildren(...items);
  }

  /* ---------- Promises ---------- */

  function renderPromises() {
    const body = $('promisesBody');
    if (!C.commitments.length) {
      body.replaceChildren(el('p', { class: 'promise-empty', text: t('promises_empty') }));
      return;
    }
    const status = { open: 'st_open', done: 'st_done', missed: 'st_missed' };
    const verdict = { open: 'warn', done: 'ok', missed: 'risk' };
    body.replaceChildren(el('ol', { class: 'facts' }, ...C.commitments.map((p, i) => el('li', { class: 'fact in' },
      el('span', { class: 'fact__no', text: `NO-${String(i + 1).padStart(3, '0')}` }),
      el('div', { class: 'fact__body' }, el('h3', { class: 'fact__t', text: p.text[window.I18n.lang] || p.text.en }), el('p', { class: 'fact__d', text: fmt.date(Date.parse(p.date) / 1000) })),
      el('span', { class: 'fact__v' }, el('span', { class: `badge badge--${verdict[p.status]}`, text: t(status[p.status]) })),
      ext(p.proof, `${t('proof')} ↗`, 'fact__a'),
    ))));
  }

  /* ---------- Orchestration ---------- */

  let motion = null;

  function renderLive() {
    renderStats();
    renderFacts();
    renderFlow();
    renderLedger();
    renderCalcFrame();
    renderCalcResult();
    renderCurve();
    renderPrice();
    renderHolders();
    renderWallet();
  }

  function renderAll() {
    renderMenu();
    window.Scenes.render();
    syncScenes();
    renderLive();
    renderWhy();
    renderWork();
    renderShield();
    renderPromises();
    motion?.observe();
    window.Scenes.refresh();
  }

  function bind() {
    $('ledgerMore').addEventListener('click', () => { ledgerOpen = !ledgerOpen; renderLedger(); });
    $('holdersMore').addEventListener('click', () => { holdersOpen = !holdersOpen; renderHolders(); });
    $('calcMode').addEventListener('click', (e) => {
      const b = e.target.closest('button');
      if (!b) return;
      calc.mode = b.dataset.mode;
      renderCalcFrame();
      setAmount(calc.mode === 'sell' ? 1000000 : 100);
    });
    $('calcForm').addEventListener('submit', (e) => e.preventDefault());
    $('calcAmount').addEventListener('input', (e) => {
      const v = Number(e.target.value.replace(/[\s,]/g, ''));
      calc.amount = v;
      if (v > 0) $('calcRange').value = amountToRange(v, calc.mode);
      renderCalcResult();
    });
    $('calcRange').addEventListener('input', (e) => {
      const raw = rangeToAmount(Number(e.target.value), calc.mode);
      const magnitude = Math.pow(10, Math.floor(Math.log10(raw)) - 1);
      setAmount(Math.round(raw / magnitude) * magnitude, true);
    });
    $('walletForm').addEventListener('submit', (e) => { e.preventDefault(); checkWallet($('walletInput').value); });
    $('shieldForm').addEventListener('submit', (e) => { e.preventDefault(); shieldValue = $('shieldInput').value.trim(); renderShield(); });
    $('caCopy').addEventListener('click', async () => {
      const button = $('caCopy');
      try {
        await navigator.clipboard.writeText(C.token);
        button.textContent = t('copied');
      } catch {
        // Clipboard can be blocked; selecting the text still lets the reader copy by hand.
        getSelection()?.selectAllChildren($('caAddr'));
      }
      setTimeout(() => { button.textContent = t('copy'); }, 1600);
    });
    document.addEventListener('langchange', renderAll);
    let resizeTimer;
    addEventListener('resize', () => {
      clearTimeout(resizeTimer);
      resizeTimer = setTimeout(() => { renderCurve(); renderPrice(); }, 180);
    });
  }

  const cached = (key, ms, loader) => {
    try {
      const raw = sessionStorage.getItem(key);
      if (raw) {
        const { at, value } = JSON.parse(raw);
        if (Date.now() - at < ms) return Promise.resolve(value);
      }
    } catch { /* storage may be blocked */ }
    return loader().then((value) => {
      try { sessionStorage.setItem(key, JSON.stringify({ at: Date.now(), value })); } catch { /* same */ }
      return value;
    });
  };

  async function refreshLive() {
    const [chain, market] = await Promise.all([window.Chain.readState(), window.Chain.readMarket().catch(() => store.market)]);
    if (chain) store.chain = chain;
    if (market) store.market = market;
    if (chain?.beneficiary) benefBalance = await window.Chain.readBeneficiaryQuote(chain.beneficiary);
    renderStats();
    renderFlowNumbers();
    renderCalcResult();
  }

  // On refresh only the numbers change: rebuilding the steps would interrupt reading.
  function renderFlowNumbers() {
    if (document.hidden) return;
    const active = document.querySelector('.flow__step.on');
    const index = active ? [...active.parentElement.children].indexOf(active) : -1;
    renderFlow();
    if (index >= 0) document.querySelectorAll('.flow__step')[index]?.classList.add('on');
  }

  async function start() {
    window.I18n.apply();
    motion = window.Motion.start();
    window.Scenes.init({ flowFigure: (i) => flowFigures()[i] || { value: '', note: '' } });
    window.Orbit.init((address) => {
      $('walletInput').value = address;
      checkWallet(address);
      window.Motion.goTo('#wallet');
    });
    bind();
    renderMenu();
    renderWhy();
    renderWork();
    renderShield();
    renderPromises();

    const CHAIN_READS = 19;
    const loader = window.Motion.createLoader(CHAIN_READS + 3);
    let finished = false;
    const finish = () => { if (!finished) { finished = true; loader.finish(); } };
    // Never trap people behind the loader if a public endpoint is slow.
    const guard = setTimeout(finish, 6500);

    const chainP = window.Chain.readState(loader.step).then((v) => { store.chain = v; });
    const marketP = window.Chain.readMarket().then((v) => { store.market = v; }).catch(() => {}).finally(loader.step);
    const snapP = window.Chain.getJSON('data/snapshot.json', 8000)
      .then((v) => { store.snapshot = v; window.Orbit.setHolders(v.holders, C.pool, C.token); })
      .catch(() => { store.snapshotFailed = true; })
      .finally(loader.step);
    const histP = window.Chain.readPriceHistory().then((v) => { store.history = v; }).catch(() => {}).finally(loader.step);

    await Promise.all([chainP, marketP, snapP, histP]);
    if (store.chain?.beneficiary) benefBalance = await window.Chain.readBeneficiaryQuote(store.chain.beneficiary);
    clearTimeout(guard);
    renderAll();
    finish();

    window.Chain.readLookalikes().then((v) => { store.lookalikes = v; }).catch(() => { store.lookalikes = C.knownLookalikes.map((address) => ({ address, chain: 'bsc', symbol: '?', liquidity: null, url: `https://dexscreener.com/bsc/${address}` })); }).finally(renderShield);
    cached('repos', 600000, window.Chain.readRepos).then((v) => { store.repos = v; store.reposFailed = !v.repos.length; }).catch(() => { store.reposFailed = true; }).finally(() => {
      renderWork();
      syncScenes();
      if (store.repos?.commits.length) window.Scenes.floatCommits(store.repos.commits);
    });

    setInterval(() => { if (!document.hidden) refreshLive().catch(() => {}); }, 60000);
  }

  // Scripts use defer, so the DOM is parsed by the time this runs.
  start();
})();
