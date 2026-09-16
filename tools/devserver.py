"""Кэшгүй статик сервер — зөвхөн хөгжүүлэлтэд.

`python -m http.server` нь Last-Modified явуулдаг тул browser засварыг
хараахгүй хуучин CSS/JS-ээ барьсаар байдаг. Загвар тааруулж байхад энэ
нь хамгийн их цаг иддэг алдаа тул энд бүх хариултад no-store тавина.
"""

import sys
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer


class NoCacheHandler(SimpleHTTPRequestHandler):
    extensions_map = {
        **SimpleHTTPRequestHandler.extensions_map,
        ".mjs": "text/javascript",
        ".js": "text/javascript",
    }

    def end_headers(self):
        self.send_header("Cache-Control", "no-store, must-revalidate")
        self.send_header("Pragma", "no-cache")
        self.send_header("Expires", "0")
        super().end_headers()

    def log_message(self, fmt, *args):  # чимээгүй
        pass


if __name__ == "__main__":
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 5173
    root = sys.argv[2] if len(sys.argv) > 2 else "."
    handler = partial(NoCacheHandler, directory=root)
    print(f"no-cache server on http://localhost:{port} serving {root}")
    ThreadingHTTPServer(("127.0.0.1", port), handler).serve_forever()
