#!/usr/bin/env python3
"""Rebuilds data/snapshot.json and data/wallets.json from raw BNB Chain logs.

Standard library only, no API keys. Anyone can run this and compare the output
with what the site shows:

    python3 scripts/snapshot.py

Runs are incremental: the cursor lives in data/wallets.json. Delete that file to
rescan from the mint. Free nodes are unreliable for old logs in a quiet way: the
archive gateway balances across nodes, and some answer an empty list for a range
they do not hold, while the wide node returns an empty list for anything past its
retention. An empty answer therefore proves nothing and gets read again.

Set SNAPSHOT_CACHE to a file path to keep finished windows, so an interrupted
full scan resumes instead of starting over.

Because of that, nothing is trusted until it reconciles: every computed balance
is compared with balanceOf() on the chain, and the script exits without writing
anything if a single wallet differs.
"""
import concurrent.futures as cf
import json
import os
import sys
import time
import urllib.error
import urllib.request
from collections import defaultdict

TOKEN = "0x5be8dca38cff485d3a80809195284c7f74c77777"
POOL = "0xb405110399037df298051f99a53b9751aed9030a"
QUOTE = "0x3f53de71c126bdabae20f9cd64848d317f6c3238"
BENEFICIARY = "0x81c6798c46b3e714e3f4524706231d29176dec73"
TRANSFER = "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef"
ZERO = "0x" + "0" * 40
BALANCE_OF = "0x70a08231"

WIDE_RPC = "https://bsc-rpc.publicnode.com"     # 50k blocks, recent history only
ARCHIVE_RPC = "https://bsc.api.pocket.network"  # 5k blocks, full history, flaky
CALL_RPC = "https://bsc-dataseed.bnbchain.org"  # eth_call only, no logs
WIDE_SPAN = 50_000
ARCHIVE_SPAN = 5_000
WIDE_REACH = 150_000     # the wide node silently drops older logs, so stay well inside it
CONFIRMATIONS = 20       # stay behind the tip so a reorg cannot change a snapshot
WORKERS = 12

ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "data")
WALLETS = os.path.join(ROOT, "wallets.json")
SNAPSHOT = os.path.join(ROOT, "snapshot.json")


def log(msg):
    print(msg, file=sys.stderr, flush=True)


def post(url, method, params):
    req = urllib.request.Request(
        url,
        data=json.dumps({"jsonrpc": "2.0", "id": 1, "method": method, "params": params}).encode(),
        headers={"content-type": "application/json", "user-agent": "Mozilla/5.0 hackios-ledger-snapshot"},
    )
    with urllib.request.urlopen(req, timeout=40) as res:
        body = json.load(res)
    if "error" in body:
        raise RuntimeError(str(body["error"]))
    return body["result"]


def rpc(url, method, params, attempts=25):
    last = None
    for attempt in range(attempts):
        try:
            return post(url, method, params)
        except (urllib.error.URLError, RuntimeError, TimeoutError, ValueError) as err:
            last = err
            time.sleep(min(0.4 * (attempt + 1), 6))
    raise SystemExit(f"{method} failed on {url}: {last}")


def windows(start, end):
    """(from, to, url) ranges covering start..end, wide where the wide node reaches."""
    split = max(start, end - WIDE_REACH)
    out = []
    cursor = start
    while cursor < split:
        stop = min(cursor + ARCHIVE_SPAN - 1, split - 1)
        out.append((cursor, stop, ARCHIVE_RPC))
        cursor = stop + 1
    while cursor <= end:
        stop = min(cursor + WIDE_SPAN - 1, end)
        out.append((cursor, stop, WIDE_RPC))
        cursor = stop + 1
    return out


def fetch_window(address, topics, win, attempts=1):
    """Reads a window, asking again while the answer is empty: empty is not proof of absence."""
    lo, hi, url = win
    logs = []
    for _ in range(attempts):
        if url == WIDE_RPC:
            time.sleep(0.6)
        logs = rpc(url, "eth_getLogs", [{"address": address, "topics": topics, "fromBlock": hex(lo), "toBlock": hex(hi)}])
        if logs:
            break
    return logs


class ScanCache:
    """Finished non-empty windows, kept on disk only when SNAPSHOT_CACHE is set."""

    def __init__(self):
        self.path = os.environ.get("SNAPSHOT_CACHE")
        self.data = {}
        if self.path and os.path.exists(self.path):
            with open(self.path) as fh:
                raw = json.load(fh)
            # A wide-node window may have been cut off by its retention, so only narrow ones are kept.
            self.data = {k: v for k, v in raw.items() if int(k.rsplit("|", 1)[1]) - int(k.rsplit("|", 2)[1]) < ARCHIVE_SPAN}
            log(f"resuming with {len(self.data)} cached windows")

    @staticmethod
    def key(address, topics, win):
        return f"{address}|{json.dumps(topics)}|{win[0]}|{win[1]}"

    def save(self):
        if not self.path:
            return
        tmp = self.path + ".tmp"
        with open(tmp, "w") as fh:
            json.dump(self.data, fh)
        os.replace(tmp, self.path)


CACHE = ScanCache()


def get_logs(address, topics, wins, label, seen=None, attempts=1):
    """Returns deduplicated logs plus the windows that are still empty, for re-reading."""
    seen = {} if seen is None else seen
    empty = []
    done = 0

    def read(win):
        key = CACHE.key(address, topics, win)
        return CACHE.data[key] if key in CACHE.data else fetch_window(address, topics, win, attempts)

    with cf.ThreadPoolExecutor(WORKERS) as pool:
        for win, logs in zip(wins, pool.map(read, wins)):
            done += 1
            if logs:
                CACHE.data[CACHE.key(address, topics, win)] = logs
            else:
                empty.append(win)
            for entry in logs:
                seen[(entry["transactionHash"], entry["logIndex"])] = entry
            if done % 100 == 0 or done == len(wins):
                log(f"  {label}: {done}/{len(wins)} windows, {len(seen)} logs")
                CACHE.save()
    return seen, empty


def addr_topic(address):
    return "0x" + address[2:].rjust(64, "0")


def balance_of(token, wallet):
    return int(rpc(CALL_RPC, "eth_call", [{"to": token, "data": BALANCE_OF + wallet[2:].rjust(64, "0")}, "latest"]), 16)


def find_mint_block(tip):
    """The mint is the only Transfer from 0x0. Walk back until a window contains it."""
    if os.environ.get("MINT_BLOCK"):
        return int(os.environ["MINT_BLOCK"])
    hi = tip
    floor = tip - 12_000_000
    while hi > floor:
        lo = max(hi - ARCHIVE_SPAN * 12 + 1, floor)
        wins = windows_archive(lo, hi)
        logs, _ = get_logs(TOKEN, [TRANSFER, addr_topic(ZERO)], wins, f"mint search {lo}")
        if logs:
            return min(int(e["blockNumber"], 16) for e in logs.values())
        hi = lo - 1
    raise SystemExit("mint not found")


def windows_archive(start, end):
    out = []
    cursor = start
    while cursor <= end:
        stop = min(cursor + ARCHIVE_SPAN - 1, end)
        out.append((cursor, stop, ARCHIVE_RPC))
        cursor = stop + 1
    return out


class Clock:
    """Block number to unix time. Uses the log's own timestamp when the node returns one."""

    def __init__(self):
        self.cache = {}

    def exact(self, block):
        if block not in self.cache:
            # A node that has not got this block answers null instead of an error.
            for _ in range(25):
                header = rpc(ARCHIVE_RPC, "eth_getBlockByNumber", [hex(block), False])
                if header:
                    break
                time.sleep(0.5)
            else:
                raise SystemExit(f"no node returned block {block}")
            self.cache[block] = int(header["timestamp"], 16)
        return self.cache[block]

    def anchors(self, start, end, step=200_000):
        self.points = [(b, self.exact(b)) for b in list(range(start, end, step)) + [end]]

    def extend(self, block):
        if block > self.points[-1][0]:
            self.points.append((block, self.exact(block)))

    def estimate(self, block):
        pts = self.points
        for (b0, t0), (b1, t1) in zip(pts, pts[1:]):
            if b0 <= block <= b1:
                return int(t0 + (t1 - t0) * (block - b0) / max(b1 - b0, 1))
        return pts[-1][1]


def parse(entry, clock):
    block = int(entry["blockNumber"], 16)
    ts = int(entry["blockTimestamp"], 16) if entry.get("blockTimestamp") else clock.estimate(block)
    return {
        "from": "0x" + entry["topics"][1][-40:],
        "to": "0x" + entry["topics"][2][-40:],
        "value": int(entry["data"], 16),
        "block": block,
        "index": int(entry["logIndex"], 16),
        "ts": ts,
        "tx": entry["transactionHash"],
    }


def blank():
    return {"bal": 0, "in": 0, "out": 0, "first": 0, "last": 0, "n": 0}


def load_state():
    if not os.path.exists(WALLETS):
        return None
    with open(WALLETS) as fh:
        raw = json.load(fh)
    wallets = defaultdict(blank)
    for a, w in raw["wallets"].items():
        wallets[a] = {"bal": int(w[0]), "in": int(w[1]), "out": int(w[2]), "first": w[3], "last": w[4], "n": w[5]}
    return raw, wallets


def as_tokens(wei):
    return round(wei / 1e18, 6)


def apply_transfers(entries, wallets, totals, clock):
    rows = sorted((parse(e, clock) for e in entries), key=lambda t: (t["block"], t["index"]))
    flows_in, flows_out = [], []
    for t in rows:
        totals["transfers"] += 1
        for side, a in (("out", t["from"]), ("in", t["to"])):
            w = wallets[a]
            w[side] += t["value"]
            w["bal"] += t["value"] if side == "in" else -t["value"]
            w["first"] = w["first"] or t["ts"]
            w["last"] = t["ts"]
            w["n"] += 1
        if t["to"] == TOKEN:
            totals["taxTokens"] += t["value"]
        row = {"tx": t["tx"], "ts": t["ts"], "block": t["block"], "amount": as_tokens(t["value"])}
        if t["to"] == BENEFICIARY:
            flows_in.append({**row, "from": t["from"]})
        if t["from"] == BENEFICIARY:
            flows_out.append({**row, "to": t["to"]})
    return flows_in, flows_out


def head():
    return int(rpc(CALL_RPC, "eth_blockNumber", []), 16)


def reconcile(wallets):
    """Compares every computed balance with the chain. Returns the wallets that differ."""
    tip_check = [a for a, w in wallets.items() if a != ZERO and (w["bal"] != 0 or w["in"] > 0)]
    with cf.ThreadPoolExecutor(8) as pool:
        live = list(pool.map(lambda a: balance_of(TOKEN, a), tip_check))
    bad = [(a, wallets[a]["bal"], b) for a, b in zip(tip_check, live) if wallets[a]["bal"] != b]
    return bad, len(tip_check)


def main():
    os.makedirs(ROOT, exist_ok=True)
    tip = int(rpc(WIDE_RPC, "eth_blockNumber", []), 16) - CONFIRMATIONS
    state = load_state()

    if state:
        raw, wallets = state
        start = raw["cursor"] + 1
        mint_block = raw["mintBlock"]
        totals = raw["totals"]
        flows = raw["flows"]
    else:
        log("full scan: looking for the mint")
        mint_block = find_mint_block(tip)
        log(f"mint at block {mint_block}")
        start = mint_block
        wallets = defaultdict(blank)
        totals = {"transfers": 0, "taxTokens": 0}
        flows = {"in": [], "out": [], "tokenIn": [], "tokenOut": []}

    if start > tip:
        log("already up to date")
        return

    clock = Clock()
    clock.anchors(start, tip)
    wins = windows(start, tip)

    seen, empty = get_logs(TOKEN, [TRANSFER], wins, "token", attempts=4)
    # New trades keep arriving during a long scan, so catch up to the head before each comparison;
    # otherwise a wallet that traded a minute ago would look wrong.
    for attempt in range(12):
        latest = head() - 1
        if latest > tip:
            extra = windows_archive(tip + 1, latest) if latest - tip > WIDE_SPAN else [(tip + 1, latest, WIDE_RPC)]
            seen, more_empty = get_logs(TOKEN, [TRANSFER], extra, "catch up", seen, attempts=2)
            empty += more_empty
            tip = latest
            clock.extend(tip)
        trial_wallets = defaultdict(blank, {a: dict(w) for a, w in wallets.items()})
        trial_totals = dict(totals)
        token_in, token_out = apply_transfers(seen.values(), trial_wallets, trial_totals, clock)
        bad, checked = reconcile(trial_wallets)
        log(f"reconcile pass {attempt + 1}: {checked} wallets checked, {len(bad)} differ, {len(seen)} logs")
        if not bad:
            break
        before = len(seen)
        seen, empty = get_logs(TOKEN, [TRANSFER], empty, f"re-read {attempt + 1}", seen, attempts=8)
        log(f"  re-read found {len(seen) - before} more logs, {len(empty)} windows still empty")
    if bad:
        for a, mine, chain in bad[:10]:
            log(f"  {a}: computed {mine}, chain {chain}")
        raise SystemExit("balances do not reconcile; nothing was written")

    wallets, totals = trial_wallets, trial_totals
    flows["tokenIn"] += token_in
    flows["tokenOut"] += token_out

    # The tax wallet's quote token moves must also add up to its live balance.
    quote_topics = {"in": [TRANSFER, None, addr_topic(BENEFICIARY)], "out": [TRANSFER, addr_topic(BENEFICIARY)]}
    quote_wins = windows(start, tip)
    quote_rows = {}
    quote_empty = {}
    for side, topics in quote_topics.items():
        quote_rows[side], quote_empty[side] = get_logs(QUOTE, topics, quote_wins, f"quote {side}", attempts=3)

    # Incremental runs only read new blocks, so earlier runs' totals count too.
    known_in = sum(r["amount"] for r in flows["in"])
    known_out = sum(r["amount"] for r in flows["out"])

    def quote_sums():
        return (
            known_in + sum(int(e["data"], 16) for e in quote_rows["in"].values()) / 1e18,
            known_out + sum(int(e["data"], 16) for e in quote_rows["out"].values()) / 1e18,
        )

    quote_tip = tip
    for attempt in range(8):
        latest = head() - 1
        if latest > quote_tip:
            extra = windows_archive(quote_tip + 1, latest) if latest - quote_tip > WIDE_SPAN else [(quote_tip + 1, latest, WIDE_RPC)]
            for side, topics in quote_topics.items():
                quote_rows[side], more = get_logs(QUOTE, topics, extra, f"quote {side} catch up", quote_rows[side], attempts=2)
                quote_empty[side] += more
            quote_tip = latest
        quote_in, quote_out = quote_sums()
        quote_live = balance_of(QUOTE, BENEFICIARY) / 1e18
        log(f"quote flow pass {attempt + 1}: in {quote_in:.6f}, out {quote_out:.6f}, net {quote_in - quote_out:.6f}, live {quote_live:.6f}")
        if abs(quote_in - quote_out - quote_live) < 1e-4:
            break
        for side, topics in quote_topics.items():
            quote_rows[side], quote_empty[side] = get_logs(QUOTE, topics, quote_empty[side], f"quote {side} re-read", quote_rows[side], attempts=6)
    else:
        raise SystemExit("beneficiary quote flow does not reconcile; nothing was written")

    for side in ("in", "out"):
        for entry in quote_rows[side].values():
            block = int(entry["blockNumber"], 16)
            t = parse(entry, clock)
            row = {"tx": t["tx"], "log": t["index"], "ts": clock.exact(block), "block": block, "amount": as_tokens(t["value"])}
            row["from" if side == "in" else "to"] = t["from"] if side == "in" else t["to"]
            # This read can run past the token cursor, so the next run may see the same transfer again.
            # One transaction can hold two equal transfers, so the log index is part of the key.
            if not any(r["tx"] == row["tx"] and r.get("log") == row["log"] for r in flows[side]):
                flows[side].append(row)
        flows[side].sort(key=lambda r: r["block"])

    holders = sorted(
        ((a, w) for a, w in wallets.items() if w["bal"] > 0 and a != ZERO),
        key=lambda kv: -kv[1]["bal"],
    )

    with open(WALLETS, "w") as fh:
        json.dump(
            {
                "cursor": tip,
                "mintBlock": mint_block,
                "totals": totals,
                "flows": flows,
                "wallets": {
                    a: [str(w["bal"]), str(w["in"]), str(w["out"]), w["first"], w["last"], w["n"]]
                    for a, w in wallets.items() if a != ZERO
                },
            },
            fh,
            separators=(",", ":"),
        )

    with open(SNAPSHOT, "w") as fh:
        json.dump(
            {
                "block": tip,
                "mintBlock": mint_block,
                "generatedAt": int(time.time()),
                "totals": {
                    "transfers": totals["transfers"],
                    "wallets": sum(1 for a in wallets if a != ZERO),
                    "holders": len(holders),
                    "taxTokens": as_tokens(totals["taxTokens"]),
                },
                "holders": [
                    {"a": a, "b": as_tokens(w["bal"]), "first": w["first"], "in": as_tokens(w["in"]), "out": as_tokens(w["out"])}
                    for a, w in holders
                ],
                "flows": flows,
            },
            fh,
            separators=(",", ":"),
        )
    log(f"ok: block {tip}, {len(holders)} holders, {totals['transfers']} transfers, all balances match the chain")


if __name__ == "__main__":
    main()
