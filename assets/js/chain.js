// Read-only access to BNB Chain. There is no wallet code and no signing anywhere on
// this site: the only JSON-RPC methods it can call are the two in `call` and `blockNumber`.
(() => {
  const C = window.LEDGER;

  const SEL = {
    buyTaxRate: '0x691f224f', sellTaxRate: '0x24024efd', owner: '0x8da5cb5b',
    totalSupply: '0x18160ddd', state: '0xc19d93fb', taxExpirationTime: '0xb85a0638',
    liquidationThreshold: '0x4031234c', balanceOf: '0x70a08231', getReserves: '0x0902f1ac',
    totalQuoteSentToMarketing: '0x209d2b04', totalQuoteSentToDividend: '0x2b44a6ad',
    feeConfig: '0x1e5eb1d0', totalShares: '0x3a98ef39', minimumShareBalance: '0x7eb0ac5f',
    withdrawableDividends: '0xdb90127e', withdrawnDividends: '0xde3aaf61',
    description: '0x7284e416', streamingTarget: '0xf8b52c45',
  };

  let rpcIndex = 0;

  async function rpc(method, params) {
    let lastError;
    for (let i = 0; i < C.rpcs.length; i++) {
      const url = C.rpcs[(rpcIndex + i) % C.rpcs.length];
      try {
        const ctrl = new AbortController();
        const timer = setTimeout(() => ctrl.abort(), 7000);
        const res = await fetch(url, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
          signal: ctrl.signal,
        });
        clearTimeout(timer);
        const body = await res.json();
        if (body.error) throw new Error(body.error.message);
        rpcIndex = (rpcIndex + i) % C.rpcs.length;
        return body.result;
      } catch (err) {
        lastError = err;
      }
    }
    throw lastError;
  }

  const padAddr = (a) => a.slice(2).toLowerCase().padStart(64, '0');
  const call = (to, data) => rpc('eth_call', [{ to, data }, 'latest']);
  const callAddr = (to, sel, addr) => call(to, sel + padAddr(addr));
  const big = (hex) => (!hex || hex === '0x' ? 0n : BigInt(hex));
  const toAddr = (hex) => '0x' + hex.slice(-40).toLowerCase();

  // 18-decimal integer to a JS number. Only used for display and estimates.
  const units = (v) => Number(v / 10n ** 10n) / 1e8;

  function decodeString(hex) {
    const raw = hex.slice(2);
    const len = parseInt(raw.slice(64, 128), 16);
    const bytes = raw.slice(128, 128 + len * 2).match(/../g) || [];
    return new TextDecoder().decode(new Uint8Array(bytes.map((b) => parseInt(b, 16))));
  }

  // Each read fails on its own so one dead call cannot blank the page.
  const safe = (p, map) => p.then(map).catch(() => null);

  async function readState(onStep = () => {}) {
    const step = (p) => p.finally(onStep);
    const T = C.token, P = C.pool, TP = C.taxProcessor;
    const [
      block, buyTax, sellTax, owner, supply, state, taxExpiry, threshold, pendingTax,
      reserves, lpSupply, lpDead, streamed, toDividend, fee, shares, minShare,
      description, beneficiary,
    ] = await Promise.all([
      step(safe(rpc('eth_blockNumber', []), (r) => parseInt(r, 16))),
      step(safe(call(T, SEL.buyTaxRate), (r) => Number(big(r)))),
      step(safe(call(T, SEL.sellTaxRate), (r) => Number(big(r)))),
      step(safe(call(T, SEL.owner), toAddr)),
      step(safe(call(T, SEL.totalSupply), (r) => units(big(r)))),
      step(safe(call(T, SEL.state), (r) => Number(big(r)))),
      step(safe(call(T, SEL.taxExpirationTime), (r) => Number(big(r)))),
      step(safe(call(T, SEL.liquidationThreshold), (r) => units(big(r)))),
      step(safe(callAddr(T, SEL.balanceOf, T), (r) => units(big(r)))),
      step(safe(call(P, SEL.getReserves), (r) => ({
        // token0 is the quote token, token1 is HackiOS
        quote: units(BigInt('0x' + r.slice(2, 66))),
        token: units(BigInt('0x' + r.slice(66, 130))),
      }))),
      step(safe(call(P, SEL.totalSupply), big)),
      step(safe(callAddr(P, SEL.balanceOf, C.dead), big)),
      step(safe(call(TP, SEL.totalQuoteSentToMarketing), (r) => units(big(r)))),
      step(safe(call(TP, SEL.totalQuoteSentToDividend), (r) => units(big(r)))),
      step(safe(call(TP, SEL.feeConfig), (r) => {
        const word = (i) => Number(BigInt('0x' + r.slice(2 + i * 64, 66 + i * 64)));
        return { market: word(0), deflation: word(1), lp: word(2), dividend: word(3), protocol: word(4) };
      })),
      step(safe(call(C.dividend, SEL.totalShares), (r) => units(big(r)))),
      step(safe(call(C.dividend, SEL.minimumShareBalance), (r) => units(big(r)))),
      step(safe(call(C.vault, SEL.description), decodeString)),
      step(safe(call(C.vault, SEL.streamingTarget), toAddr)),
    ]);

    const lpBurnedPct = lpSupply && lpDead !== null ? Number((lpDead * 1000000n) / lpSupply) / 10000 : null;

    return {
      block, buyTax, sellTax, owner, supply, state, taxExpiry, threshold, pendingTax,
      reserves, lpBurnedPct, streamed, toDividend, fee, shares, minShare, description, beneficiary,
    };
  }

  async function readWallet(addr) {
    const [balance, withdrawable, withdrawn] = await Promise.all([
      safe(callAddr(C.token, SEL.balanceOf, addr), (r) => units(big(r))),
      safe(callAddr(C.dividend, SEL.withdrawableDividends, addr), (r) => units(big(r))),
      safe(callAddr(C.dividend, SEL.withdrawnDividends, addr), (r) => units(big(r))),
    ]);
    return { balance, withdrawable, withdrawn };
  }

  const readBeneficiaryQuote = (addr) => safe(callAddr(C.quote, SEL.balanceOf, addr), (r) => units(big(r)));

  // Pool arithmetic. Pancake V2 keeps 0.25% for LPs; the token takes its tax on the way
  // in (sell) or out (buy), as in FlapTaxTokenV3._taxedTransfer.
  const LP_FEE = 0.0025;

  function quoteSell(amount, reserves, sellTaxBps) {
    const taxed = amount * (1 - sellTaxBps / 10000);
    const inWithFee = taxed * (1 - LP_FEE);
    const out = (inWithFee * reserves.quote) / (reserves.token + inWithFee);
    const spot = amount * (reserves.quote / reserves.token);
    return { out, spot, loss: spot > 0 ? 1 - out / spot : 0, taxTokens: amount - taxed };
  }

  function quoteBuy(spend, reserves, buyTaxBps) {
    const inWithFee = spend * (1 - LP_FEE);
    const gross = (inWithFee * reserves.token) / (reserves.quote + inWithFee);
    const out = gross * (1 - buyTaxBps / 10000);
    const spot = spend * (reserves.token / reserves.quote);
    return { out, spot, loss: spot > 0 ? 1 - out / spot : 0, taxTokens: gross - out };
  }

  async function getJSON(url, ms = 8000) {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), ms);
    try {
      const res = await fetch(url, { signal: ctrl.signal });
      if (!res.ok) throw new Error(String(res.status));
      return await res.json();
    } finally {
      clearTimeout(timer);
    }
  }

  async function readMarket() {
    const dex = await getJSON(`https://api.dexscreener.com/latest/dex/tokens/${C.token}`).catch(() => null);
    const pair = dex?.pairs?.find((p) => p.pairAddress.toLowerCase() === C.pool) || null;
    const gecko = await getJSON(`https://api.geckoterminal.com/api/v2/networks/bsc/pools/${C.pool}`).catch(() => null);
    const quoteUsd = Number(gecko?.data?.attributes?.quote_token_price_usd) ||
      (pair ? Number(pair.priceUsd) / Number(pair.priceNative) : null);
    return {
      priceUsd: pair ? Number(pair.priceUsd) : null,
      fdv: pair?.fdv ?? null,
      liquidityUsd: pair?.liquidity?.usd ?? null,
      volume24: pair?.volume?.h24 ?? (Number(gecko?.data?.attributes?.volume_usd?.h24) || null),
      change24: pair?.priceChange?.h24 ?? null,
      txns24: pair?.txns?.h24 ?? null,
      quoteUsd,
    };
  }

  async function readPriceHistory() {
    const r = await getJSON(`https://api.geckoterminal.com/api/v2/networks/bsc/pools/${C.pool}/ohlcv/day?limit=60`);
    return r.data.attributes.ohlcv_list
      .map(([t, , h, , c, v]) => ({ t, high: h, close: c, volume: v }))
      .reverse();
  }

  // Live search for tokens that reuse the project's name.
  async function readLookalikes() {
    const results = await Promise.all(['hackios', 'hakios'].map((q) =>
      getJSON(`https://api.dexscreener.com/latest/dex/search?q=${q}`).catch(() => ({ pairs: [] }))));
    const found = new Map();
    for (const addr of C.knownLookalikes) found.set(addr, { address: addr, chain: 'bsc', symbol: '?', liquidity: null, url: `https://dexscreener.com/bsc/${addr}` });
    for (const { pairs } of results) {
      for (const p of pairs || []) {
        const address = p.baseToken.address.toLowerCase();
        if (address === C.token) continue;
        if (!/ha[c]?kios/i.test(p.baseToken.symbol + p.baseToken.name)) continue;
        found.set(address, { address, chain: p.chainId, symbol: p.baseToken.symbol, liquidity: p.liquidity?.usd ?? null, url: p.url });
      }
    }
    return [...found.values()];
  }

  async function readRepos() {
    const repos = await Promise.all(C.repos.map((name) =>
      getJSON(`https://api.github.com/repos/oosexgang/${name}`).catch(() => null)));
    // GitHub answers 403 once the anonymous quota is gone; this must not be cached as "no repos".
    if (!repos.some(Boolean)) throw new Error('github unavailable');
    const commits = await Promise.all(C.repos.slice(0, 3).map((name) =>
      getJSON(`https://api.github.com/repos/oosexgang/${name}/commits?per_page=5`)
        .then((list) => list.map((c) => ({
          repo: name,
          sha: c.sha.slice(0, 7),
          url: c.html_url,
          date: c.commit.author.date,
          message: c.commit.message.split('\n')[0],
        })))
        .catch(() => [])));
    const org = await getJSON('https://api.github.com/users/oosexgang').catch(() => null);
    return {
      publicRepos: org?.public_repos ?? null,
      repos: repos.filter(Boolean).map((r) => ({ name: r.name, stars: r.stargazers_count, forks: r.forks_count, pushed: r.pushed_at, url: r.html_url })),
      commits: commits.flat().sort((a, b) => b.date.localeCompare(a.date)).slice(0, 8),
    };
  }

  window.Chain = {
    readState, readWallet, readBeneficiaryQuote, readMarket, readPriceHistory,
    readLookalikes, readRepos, quoteSell, quoteBuy, getJSON,
  };
})();
