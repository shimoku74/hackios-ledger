# $HackiOS Ledger

The open books of the `$HackiOS` token (`0x5be8dca38cff485d3a80809195284c7f74c77777`, BNB Chain).
A static site with no backend, no wallet code, no analytics and no build step.

## What it does

| Section | What people get | Where the data comes from |
|---|---|---|
| Contract | Good and bad facts side by side, each with a link to check it | `eth_call` in the browser |
| Where the 1% goes | The tax path, step by step, and every GOOGLB transfer of the receiving wallet | `eth_call`, `data/snapshot.json` |
| Exit math | What a sale or buy really returns after tax, pool fee and price impact | Live pool reserves |
| Holders | Supply split and the full holder table | `data/snapshot.json` |
| Your wallet | Balance, value, exit estimate and rank from a pasted address, no connect | `eth_call`, `data/wallets.json` |
| Proof of work | Stars, commits and releases | GitHub API, `shipped` in `config.js` |
| Fake check | Compares any address with the official one, lists other tokens using the name | DexScreener search |
| Promises | A public list that keeps missed promises visible | `commitments` in `config.js` |

## Motion

Scenes are pinned and scrubbed with GSAP ScrollTrigger on top of Lenis smooth scroll (`assets/js/scenes.js`).
All graphics are drawn here: no images, models or text come from any other site. With
`prefers-reduced-motion`, every scene lays out as plain content instead.

## Run it

```bash
python3 scripts/serve.py
```

Then open <http://127.0.0.1:8765>.

## Refresh the holder data

```bash
python3 scripts/snapshot.py
```

It uses the Python standard library and needs no API key. It compares every computed balance with
`balanceOf()` on the chain and writes nothing if a single wallet differs.

The first full scan takes a while, because free nodes only serve older logs in narrow windows.
To skip the search for the mint, pass its block:

```bash
MINT_BLOCK=128323985 python3 scripts/snapshot.py
```

Later runs only read new blocks. `.github/workflows/snapshot.yml` does this every 6 hours once the
folder is pushed to a GitHub repository.

## Deploy

The site is static and is served by GitHub Pages from the `main` branch.
`.github/workflows/snapshot.yml` refreshes the holder data every 6 hours and commits it, which redeploys the site.

After deploying, add the address to the official site and the Telegram channel, so people can
confirm this page is yours.

## Update content by hand

Everything editable is in `assets/js/config.js`:

- `commitments`: add a promise with its date, proof link and status. Keep it there if it is missed.
- `shipped`: add a release when it is announced.
- `knownLookalikes`: add tokens reported as copies of the name.
- `repos`: choose which repositories appear.
- `telegramSubscribers`: Telegram blocks browser reads, so update this number by hand.

The team list is `TEAM` at the top of `assets/js/scenes.js`.

The page's text, in all four languages, is in `assets/js/i18n.js`.

## Rules worth keeping

- No wallet connect, signing or approvals, ever. It is the page's main safety promise.
- The Content-Security-Policy in `index.html` lists every outside host the page may talk to.
  If you add a data source, add it there, and update the privacy answer in the FAQ.
- Numbers belong to the chain. Do not hardcode them in the copy.

## Verified

- Sell and buy math matches `getAmountsOut` on the PancakeSwap router at the live reserves.
- Tax rates, owner, LP burn, tax split and vault data are read from the contracts. The token,
  tax processor and dividend sources are verified on Sourcify.
- The vault's source is not on Sourcify, so the site reads its public `description()` and
  `streamingTarget()` and does not describe its internals.
