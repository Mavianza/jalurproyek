"""Integrasi HTTP nyata pada loopback dengan port sementara."""

import contextlib
import io
import json
from pathlib import Path
import threading
import unittest
from urllib.error import HTTPError
from urllib.request import urlopen

import server


class ServerTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.httpd = server.AppServer(("127.0.0.1", 0), server.AppHandler)
        cls.thread = threading.Thread(target=cls.httpd.serve_forever, daemon=True)
        cls.thread.start()
        cls.base = f"http://127.0.0.1:{cls.httpd.server_port}"

    @classmethod
    def tearDownClass(cls):
        cls.httpd.shutdown()
        cls.httpd.server_close()
        cls.thread.join(timeout=3)

    def test_html_dan_mime_module(self):
        with urlopen(self.base + "/", timeout=3) as response:
            self.assertEqual(response.status, 200)
            self.assertIn(b'lang="id"', response.read())
        with urlopen(self.base + "/planner.mjs", timeout=3) as response:
            self.assertEqual(response.headers.get_content_type(), "text/javascript")
            self.assertIn(b"planProject", response.read())

    def test_semua_asset_yang_dibutuhkan_tersedia(self):
        for name in sorted(server.ASSETS):
            with self.subTest(name=name), urlopen(self.base + "/" + name, timeout=3) as response:
                self.assertEqual(response.read(), (server.WEB / name).read_bytes())

    def test_tidak_menyajikan_directory_dan_source_di_luar_web(self):
        for path in ["/../server.py", "/%2e%2e/server.py", "/web/", "/.git/config", "/tests/", "/missing", "/model.mjs/../index.html"]:
            with self.subTest(path=path), self.assertRaises(HTTPError) as caught:
                urlopen(self.base + path, timeout=3)
            self.assertEqual(caught.exception.code, 404)

    def test_header_membatasi_koneksi_dan_mematikan_cache(self):
        with urlopen(self.base + "/", timeout=3) as response:
            self.assertEqual(response.headers["Cache-Control"], "no-store")
            self.assertEqual(response.headers["X-Content-Type-Options"], "nosniff")
            self.assertIn("connect-src 'none'", response.headers["Content-Security-Policy"])
            self.assertIn("frame-ancestors 'none'", response.headers["Content-Security-Policy"])

    def test_port_invalid_ditolak(self):
        with contextlib.redirect_stderr(io.StringIO()), self.assertRaises(SystemExit) as caught:
            server.main(["--port", "0", "--no-browser"])
        self.assertEqual(caught.exception.code, 2)

    def test_port_yang_sudah_dipakai_dilaporkan(self):
        with contextlib.redirect_stderr(io.StringIO()) as error:
            self.assertEqual(server.main(["--port", str(self.httpd.server_port), "--no-browser"]), 1)
        self.assertIn("Tidak dapat membuka port", error.getvalue())


if __name__ == "__main__":
    unittest.main()
