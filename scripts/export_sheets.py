#!/usr/bin/env python3
"""Writes export/hackios-ledger.xlsx, ready for Google Sheets (File > Import > Upload).

Standard library only. Contract and market numbers are read live. The full holder list and the
tax wallet's history come from data/snapshot.json; until that exists, the Holders tab falls back
to the top 10 from GoPlus and says so.

    python3 scripts/export_sheets.py
"""
import datetime as dt
import json
import os
import urllib.request
import zipfile
from xml.sax.saxutils import escape

TOKEN = "0x5be8dca38cff485d3a80809195284c7f74c77777"
POOL = "0xb405110399037df298051f99a53b9751aed9030a"
QUOTE = "0x3f53de71c126bdabae20f9cd64848d317f6c3238"
VAULT = "0x4b1a623abb557c6df113938f98692d3edc2e1d4f"
TAX_PROCESSOR = "0x244122c9af9d0d2cdb836a0f382b6f6aaa0436ff"
FLAP_FEE = "0x8a08d98cbb218fceb318ecf3abc1ba43d8a7ab0e"
DEAD = "0x000000000000000000000000000000000000dead"
RPC = "https://bsc-rpc.publicnode.com"

ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..")
SNAPSHOT = os.path.join(ROOT, "data", "snapshot.json")
OUTPUT = os.path.join(ROOT, "export", "hackios-ledger.xlsx")


def fetch(url, body=None):
    req = urllib.request.Request(
        url,
        data=json.dumps(body).encode() if body else None,
        headers={"content-type": "application/json", "user-agent": "Mozilla/5.0 hackios-ledger-export"},
    )
    with urllib.request.urlopen(req, timeout=30) as res:
        return json.load(res)


def call(to, data):
    body = fetch(RPC, {"jsonrpc": "2.0", "id": 1, "method": "eth_call", "params": [{"to": to, "data": data}, "latest"]})
    if "error" in body:
        raise RuntimeError(body["error"])
    return body["result"]


def pad(address):
    return address[2:].rjust(64, "0")


def number(hex_value):
    return int(hex_value, 16)


def tokens(hex_value):
    return number(hex_value) / 1e18


def text_of(hex_value):
    raw = bytes.fromhex(hex_value[2:])
    size = int.from_bytes(raw[32:64], "big")
    return raw[64:64 + size].decode()


def utc(ts):
    return dt.datetime.fromtimestamp(ts, dt.timezone.utc).strftime("%Y-%m-%d %H:%M") if ts else ""


def token_rows():
    balance = "0x70a08231"
    reserves = call(POOL, "0x0902f1ac")
    reserve_quote = number("0x" + reserves[2:66]) / 1e18
    reserve_token = number("0x" + reserves[66:130]) / 1e18
    fee = call(TAX_PROCESSOR, "0x1e5eb1d0")
    word = lambda i: number("0x" + fee[2 + i * 64:66 + i * 64])
    lp_total = number(call(POOL, "0x18160ddd"))
    lp_dead = number(call(POOL, balance + pad(DEAD)))
    receiver = "0x" + call(VAULT, "0xf8b52c45")[-40:]

    gecko = fetch(f"https://api.geckoterminal.com/api/v2/networks/bsc/pools/{POOL}")["data"]["attributes"]
    quote_usd = float(gecko["quote_token_price_usd"])
    price = reserve_quote / reserve_token * quote_usd

    streamed = tokens(call(TAX_PROCESSOR, "0x209d2b04"))
    return [
        ["Field", "Value", "Source"],
        ["Read at (UTC)", utc(dt.datetime.now(dt.timezone.utc).timestamp()), "this export"],
        ["Contract", TOKEN, "official site"],
        ["Total supply", tokens(call(TOKEN, "0x18160ddd")), "totalSupply()"],
        ["Owner", "0x" + call(TOKEN, "0x8da5cb5b")[-40:], "owner()"],
        ["Buy tax, %", number(call(TOKEN, "0x691f224f")) / 100, "buyTaxRate()"],
        ["Sell tax, %", number(call(TOKEN, "0x24024efd")) / 100, "sellTaxRate()"],
        ["Tax ends (UTC)", utc(number(call(TOKEN, "0xb85a0638"))), "taxExpirationTime()"],
        ["Contract sells tax at, tokens", tokens(call(TOKEN, "0x4031234c")), "liquidationThreshold()"],
        ["Unsold tax now, tokens", tokens(call(TOKEN, balance + pad(TOKEN))), "balanceOf(token)"],
        ["Flap share of tax, %", word(4) / 100, "feeConfig().feeRate"],
        ["Dividend share of tax, %", word(3) / 100, "feeConfig().dividendBps"],
        ["Main pool", POOL, "mainPool()"],
        ["Pool LP burned, %", lp_dead / lp_total * 100, "balanceOf(dead) / totalSupply()"],
        ["Pool reserve, tokens", reserve_token, "getReserves()"],
        ["Pool reserve, GOOGLB", reserve_quote, "getReserves()"],
        ["GOOGLB price, USD", quote_usd, "GeckoTerminal"],
        ["Price, USD", price, "reserves x GOOGLB price"],
        ["Market value, USD", price * 1e9, "price x supply"],
        ["Liquidity, USD", reserve_quote * quote_usd * 2, "reserves x GOOGLB price x 2"],
        ["Volume 24h, USD", float(gecko["volume_usd"]["h24"]), "GeckoTerminal"],
        ["Tax receiver wallet", receiver, "streamingTarget()"],
        ["Sent to tax receiver, GOOGLB", streamed, "totalQuoteSentToMarketing()"],
        ["Sent to tax receiver, USD at today's price", streamed * quote_usd, "calculated"],
        ["Tax receiver holds now, GOOGLB", tokens(call(QUOTE, balance + pad(receiver))), "balanceOf(receiver)"],
        ["Vault description", text_of(call(VAULT, "0x7284e416")), "description()"],
    ], receiver


def label(address, receiver):
    return {POOL: "Main pool", TOKEN: "Token contract, unsold tax", FLAP_FEE: "Flap fee wallet", receiver: "Tax receiver"}.get(address, "")


def holder_rows(snapshot, receiver):
    head = ["#", "Wallet", "Label", "Tokens", "Share of supply, %", "First seen (UTC)", "Received", "Sent"]
    if snapshot:
        rows = [[f"Full list at block {snapshot['block']}, every balance checked against the chain"], head]
        for i, h in enumerate(snapshot["holders"], 1):
            rows.append([i, h["a"], label(h["a"], receiver), h["b"], h["b"] / 1e9 * 100, utc(h["first"]), h["in"], h["out"]])
        return rows
    info = fetch(f"https://api.gopluslabs.io/api/v1/token_security/56?contract_addresses={TOKEN}")["result"][TOKEN]
    rows = [[f"TOP 10 ONLY, from GoPlus. {info['holder_count']} holders in total. The full list needs data/snapshot.json."], head]
    for i, h in enumerate(info["holders"], 1):
        rows.append([i, h["address"], label(h["address"], receiver), float(h["balance"]), float(h["percent"]) * 100, "", "", ""])
    return rows


def transfer_rows(snapshot):
    if not snapshot:
        return [["Not ready: the tax wallet's history comes from data/snapshot.json, which is still being built."]]
    flows = snapshot["flows"]
    merged = [("In", r, r.get("from", "")) for r in flows["in"]] + [("Out", r, r.get("to", "")) for r in flows["out"]]
    merged.sort(key=lambda x: -x[1]["block"])
    rows = [["Date (UTC)", "Direction", "GOOGLB", "Other side", "Transaction", "Block"]]
    rows += [[utc(r["ts"]), d, r["amount"], party, r["tx"], r["block"]] for d, r, party in merged]
    return rows


def price_rows():
    data = fetch(f"https://api.geckoterminal.com/api/v2/networks/bsc/pools/{POOL}/ohlcv/day?limit=100")
    rows = [["Date (UTC)", "Open, USD", "High, USD", "Low, USD", "Close, USD", "Volume, USD"]]
    for t, o, h, l, c, v in reversed(data["data"]["attributes"]["ohlcv_list"]):
        rows.append([utc(t)[:10], o, h, l, c, v])
    return rows


TEAM = [
    ["Handle", "Role", "Country"],
    ["@netusd", "Owner", "Ukraine"],
    ["@wannqn", "Owner", "Ukraine"],
    ["@hxfuxyyXD", "Owner", "Ukraine"],
    ["@wryzzew", "Owner", "Russia"],
    ["@oodze", "Founder, owner", "Russia"],
    ["@hualuo520", "Sponsor", ""],
]


def column(i):
    name = ""
    i += 1
    while i:
        i, rem = divmod(i - 1, 26)
        name = chr(65 + rem) + name
    return name


def sheet_xml(rows):
    widths = {}
    out = []
    for r, row in enumerate(rows, 1):
        cells = []
        for c, value in enumerate(row):
            if value is None or value == "":
                continue
            ref = f"{column(c)}{r}"
            if isinstance(value, (int, float)):
                cells.append(f'<c r="{ref}"><v>{value!r}</v></c>')
                width = 16
            else:
                # Inline strings are never read as formulas, whatever they contain.
                cells.append(f'<c r="{ref}" t="inlineStr"><is><t xml:space="preserve">{escape(str(value))}</t></is></c>')
                width = min(len(str(value)) + 2, 60)
            widths[c] = max(widths.get(c, 8), width)
        out.append(f'<row r="{r}">{"".join(cells)}</row>')
    cols = "".join(f'<col min="{c + 1}" max="{c + 1}" width="{w}" customWidth="1"/>' for c, w in sorted(widths.items()))
    return (
        '<?xml version="1.0" encoding="UTF-8"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">'
        f'<cols>{cols}</cols><sheetData>{"".join(out)}</sheetData></worksheet>'
    )


def write_xlsx(path, sheets):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    names = list(sheets)
    with zipfile.ZipFile(path, "w", zipfile.ZIP_DEFLATED) as z:
        overrides = "".join(
            f'<Override PartName="/xl/worksheets/sheet{i}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>'
            for i in range(1, len(names) + 1)
        )
        z.writestr("[Content_Types].xml", (
            '<?xml version="1.0" encoding="UTF-8"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">'
            '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>'
            '<Default Extension="xml" ContentType="application/xml"/>'
            '<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>'
            f"{overrides}</Types>"
        ))
        z.writestr("_rels/.rels", (
            '<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'
            '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>'
        ))
        tabs = "".join(f'<sheet name="{escape(n)}" sheetId="{i}" r:id="rId{i}"/>' for i, n in enumerate(names, 1))
        z.writestr("xl/workbook.xml", (
            '<?xml version="1.0" encoding="UTF-8"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" '
            f'xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>{tabs}</sheets></workbook>'
        ))
        rels = "".join(
            f'<Relationship Id="rId{i}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet{i}.xml"/>'
            for i in range(1, len(names) + 1)
        )
        z.writestr("xl/_rels/workbook.xml.rels", (
            '<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'
            f"{rels}</Relationships>"
        ))
        for i, name in enumerate(names, 1):
            z.writestr(f"xl/worksheets/sheet{i}.xml", sheet_xml(sheets[name]))


def main():
    snapshot = None
    if os.path.exists(SNAPSHOT):
        with open(SNAPSHOT) as fh:
            snapshot = json.load(fh)
    facts, receiver = token_rows()
    sheets = {
        "Token": facts,
        "Holders": holder_rows(snapshot, receiver),
        "Tax wallet transfers": transfer_rows(snapshot),
        "Price daily": price_rows(),
        "Team": TEAM,
    }
    write_xlsx(OUTPUT, sheets)
    for name, rows in sheets.items():
        print(f"{name}: {len(rows)} rows")
    print("full holder list" if snapshot else "holders: top 10 only, snapshot not ready")
    print(os.path.abspath(OUTPUT))


if __name__ == "__main__":
    main()
