"""
Dedicated PDF page-rendering service for MECEE-BL.

Why this exists:
  PDF.js rasterizes pages on the *browser's* main thread. When the browser
  runs on the VPS itself (a single CPU core), rendering a range of book/note
  pages for flashcard creation floods that one core and freezes the tab.
  PyMuPDF (MuPDF) renders the same page in ~7 ms server-side vs ~50-200 ms in
  PDF.js, and — crucially — it happens in this separate Python process, so the
  browser just receives ready-made JPEGs and never blocks.

Security:
  Binds 127.0.0.1 ONLY — it is unreachable from the LAN or the internet. The
  only way in is via launcher.py's /api/render proxy on port 8000 (same origin
  as the app). Paths are constrained to books/ under the project root, must end
  in .pdf, and reject any ".." traversal.

Endpoints (GET):
  /healthz                         → 200 "ok"  (liveness probe used by launcher)
  /render?file=<rel>&page=<n>&w=<width>[&q=<1-100>]
                                   → image/jpeg of that single page

Run via the project venv so PyMuPDF (fitz) is importable:
  /root/Desktop/Syllabus/.venv/bin/python render_service.py
launcher.py starts this automatically; running it by hand is only for debugging.
"""
import os
import sys
import threading
import urllib.parse
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

try:
    import fitz  # PyMuPDF
except Exception as e:  # pragma: no cover - surfaced via launcher log
    sys.stderr.write(f"[render] PyMuPDF (fitz) import failed: {e}\n")
    raise

ROOT = os.path.dirname(os.path.abspath(__file__))
HOST = "127.0.0.1"          # device-only: never bind 0.0.0.0 here
PORT = 8001

# Only PDFs under books/ may be rendered. Books, PDF notes, and synced library
# PDFs all live here; nothing else should be rasterizable through this service.
ALLOWED_ROOT = os.path.join(ROOT, "books")

MIN_W, MAX_W = 64, 2000     # clamp requested width to sane raster bounds
DEFAULT_W = 768             # matches PAGE_RENDER_WIDTH in flashcards.html
DEFAULT_Q = 82              # JPEG quality — same as the old client toBlob path

# Small in-memory LRU of encoded pages, keyed by (path, mtime, page, w, q).
# mtime in the key means an edited/replaced PDF auto-invalidates. A re-render of
# the same range (common when the user tweaks the page selection) is then a pure
# memory hit — no MuPDF work at all.
_CACHE_MAX = 240
_cache: "dict[tuple, bytes]" = {}
_order: "list[tuple]" = []
_lock = threading.Lock()


def _resolve(rel: str):
    """Map a client-supplied relative path to a safe absolute file under
    books/. Returns the absolute path, or None if it's outside the sandbox,
    not a .pdf, or doesn't exist."""
    rel = urllib.parse.unquote(rel or "").replace("\\", "/")
    if not rel or ".." in rel.split("/"):
        return None
    # Strip any leading slash so os.path.join treats it as relative to ROOT.
    full = os.path.normpath(os.path.join(ROOT, rel.lstrip("/")))
    allowed = os.path.normpath(ALLOWED_ROOT)
    if full != allowed and not full.startswith(allowed + os.sep):
        return None
    if not full.lower().endswith(".pdf") or not os.path.isfile(full):
        return None
    return full


def _render(full: str, page: int, w: int, q: int) -> bytes:
    """Render one page (1-based) to JPEG bytes, using/populating the LRU."""
    mtime = os.path.getmtime(full)
    key = (full, mtime, page, w, q)
    with _lock:
        hit = _cache.get(key)
    if hit is not None:
        return hit

    doc = fitz.open(full)
    try:
        if page < 1 or page > doc.page_count:
            raise ValueError(f"page {page} out of range (1..{doc.page_count})")
        pg = doc[page - 1]
        # Cap the raster at the requested logical width (no DPR multiplier —
        # these are thumbnails + vision-model inputs, not crisp on-screen reads).
        scale = (w / pg.rect.width) if pg.rect.width else 1.0
        scale = min(2.0, scale)
        pix = pg.get_pixmap(matrix=fitz.Matrix(scale, scale), alpha=False)
        jpg = pix.tobytes("jpeg", jpg_quality=q)
    finally:
        doc.close()

    with _lock:
        _cache[key] = jpg
        _order.append(key)
        while len(_order) > _CACHE_MAX:
            _cache.pop(_order.pop(0), None)
    return jpg


class Handler(BaseHTTPRequestHandler):
    # Silence the default per-request stderr spam; launcher captures our stdout.
    def log_message(self, fmt, *args):
        pass

    def _send(self, code, body: bytes, ctype="application/octet-stream"):
        self.send_response(code)
        self.send_header("Content-Type", ctype)
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        try:
            self.wfile.write(body)
        except Exception:
            pass  # client went away mid-write

    def do_GET(self):  # noqa: N802 (stdlib name)
        parsed = urllib.parse.urlparse(self.path)
        if parsed.path == "/healthz":
            return self._send(200, b"ok", "text/plain; charset=utf-8")
        if parsed.path != "/render":
            return self._send(404, b"not found", "text/plain; charset=utf-8")

        qs = urllib.parse.parse_qs(parsed.query)
        rel = (qs.get("file", [""])[0] or "")
        full = _resolve(rel)
        if not full:
            return self._send(400, b"invalid or disallowed file", "text/plain; charset=utf-8")
        try:
            page = int(qs.get("page", ["1"])[0])
        except ValueError:
            return self._send(400, b"bad page", "text/plain; charset=utf-8")
        try:
            w = int(qs.get("w", [str(DEFAULT_W)])[0])
        except ValueError:
            w = DEFAULT_W
        w = max(MIN_W, min(MAX_W, w))
        try:
            q = int(qs.get("q", [str(DEFAULT_Q)])[0])
        except ValueError:
            q = DEFAULT_Q
        q = max(1, min(100, q))

        try:
            jpg = _render(full, page, w, q)
        except ValueError as e:
            return self._send(400, str(e).encode("utf-8"), "text/plain; charset=utf-8")
        except Exception as e:
            sys.stderr.write(f"[render] error rendering {rel} p{page}: {e}\n")
            return self._send(500, b"render failed", "text/plain; charset=utf-8")
        return self._send(200, jpg, "image/jpeg")


def main() -> int:
    class _Server(ThreadingHTTPServer):
        allow_reuse_address = True

    try:
        httpd = _Server((HOST, PORT), Handler)
    except OSError as e:
        # Port busy (likely a stale instance). Exit non-zero; launcher's health
        # probe will notice and the frontend falls back to in-browser PDF.js.
        sys.stderr.write(f"[render] cannot bind {HOST}:{PORT}: {e}\n")
        return 1
    httpd.daemon_threads = True
    sys.stdout.write(f"[render] PyMuPDF service on http://{HOST}:{PORT} (books/ only)\n")
    sys.stdout.flush()
    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        httpd.server_close()
    return 0


if __name__ == "__main__":
    sys.exit(main())
