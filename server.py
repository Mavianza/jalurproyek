"""Peluncur lokal JalurProyek. Python 3.10+, tanpa dependensi eksternal."""

import argparse
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
import sys
from threading import Timer
from urllib.parse import unquote, urlsplit
import webbrowser

WEB = Path(__file__).resolve().parent / "web"
ASSETS = frozenset({
    "index.html", "styles.css", "icon.svg", "app.mjs", "model.mjs",
    "planner.mjs", "storage.mjs", "diagrams.mjs", "example.mjs",
})


class AppHandler(SimpleHTTPRequestHandler):
    extensions_map = {**SimpleHTTPRequestHandler.extensions_map, ".mjs": "text/javascript"}

    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(WEB), **kwargs)

    def end_headers(self):
        self.send_header("Cache-Control", "no-store")
        self.send_header("X-Content-Type-Options", "nosniff")
        self.send_header("Referrer-Policy", "no-referrer")
        self.send_header("Content-Security-Policy", "default-src 'none'; script-src 'self'; style-src 'self'; img-src 'self' blob:; connect-src 'none'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'")
        super().end_headers()

    def send_head(self):
        path = unquote(urlsplit(self.path).path)
        name = "index.html" if path == "/" else path[1:] if path.startswith("/") else ""
        if name not in ASSETS:
            self.send_error(404, "Berkas tidak ditemukan.")
            return None
        # Jalur terdekode harus sama dengan jalur literal; cegah direktori dan alias.
        self.path = "/" + name
        return super().send_head()

    def log_message(self, format, *args):
        # URL aplikasi lokal boleh tampil; tidak ada log isi rencana pengguna.
        sys.stderr.write("JalurProyek: " + (format % args) + "\n")


class AppServer(ThreadingHTTPServer):
    daemon_threads = True


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--port", type=int, default=8753, help="Port lokal (default: 8753).")
    parser.add_argument("--no-browser", action="store_true", help="Jalankan tanpa membuka tab otomatis.")
    args = parser.parse_args(argv)
    if not 1 <= args.port <= 65535:
        parser.error("Port harus 1–65535.")
    missing = sorted(name for name in ASSETS if not (WEB / name).is_file())
    if missing:
        print("Instalasi belum lengkap: " + ", ".join(missing), file=sys.stderr)
        return 1
    try:
        server = AppServer(("127.0.0.1", args.port), AppHandler)
    except OSError as exc:
        print(f"Tidak dapat membuka port {args.port}: {exc}. Coba --port 8754.", file=sys.stderr)
        return 1
    url = f"http://127.0.0.1:{args.port}/"
    print(f"JalurProyek siap: {url}\nTekan Ctrl+C untuk berhenti.", flush=True)
    if not args.no_browser:
        timer = Timer(.3, partial(webbrowser.open, url))
        timer.daemon = True
        timer.start()
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\nJalurProyek dihentikan.")
    finally:
        server.server_close()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
