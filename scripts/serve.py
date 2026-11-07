#!/usr/bin/env python3
"""Local preview server that forbids browser caching, so a refresh always shows the latest files.

    python3 scripts/serve.py
"""
import functools
import http.server
import os

ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..")


class NoCache(http.server.SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header("Cache-Control", "no-store")
        super().end_headers()


if __name__ == "__main__":
    handler = functools.partial(NoCache, directory=ROOT)
    with http.server.ThreadingHTTPServer(("127.0.0.1", 8765), handler) as server:
        print("http://127.0.0.1:8765")
        server.serve_forever()
