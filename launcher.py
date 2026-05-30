"""
Launch the MECEE-BL Syllabus app.

What this does:
  1. Auto-refreshes the music playlist manifest (so anything new in Playlist/
     shows up in the player).
  2. Serves this folder over HTTP on port 8000 — fixed so localStorage stays
     on a single origin across launches (PDF.js also needs HTTP, since Chrome
     blocks fetch() for local file:// PDFs).
  3. Opens index.html in the default browser. An optional argument deep-links
     into a page hash (e.g. `python launcher.py library`).
  4. Stays running until you hit Ctrl+C.

Usage:
    python launcher.py            # opens index.html
    python launcher.py library    # opens index.html#library (Library page)
"""
import email.utils
import gzip
import http.server
import json
import os
import re
import socket
import socketserver
import sys
import threading
import time
import urllib.parse
import uuid
import webbrowser

import mecee_sync

ROOT = os.path.dirname(os.path.abspath(__file__))
# Fixed port so localStorage (bookmarks, highlights, progress) stays on a single
# origin across launches — different ports = different origins = different data.
PORT = 8000

# Where user-added PDFs (books/notes) get tracked. The PDFs themselves go into
# books/<subject>/<filename>.pdf — this JSON only stores their metadata.
METADATA_PATH = os.path.join(ROOT, "books", "user-library.json")
SAFE_SUBJECTS = {"biology", "physics", "chemistry", "math"}

# R2 sync config lives one directory up, in .mecee-secrets/. None means sync is
# disabled (the launcher still serves everything else normally).
SECRETS_DIR = os.path.normpath(os.path.join(ROOT, "..", ".mecee-secrets"))
R2_CONFIG  = mecee_sync.load_r2_config(SECRETS_DIR)
R2_CLIENT  = mecee_sync.R2Client(R2_CONFIG) if R2_CONFIG else None



def load_user_library():
    if not os.path.isfile(METADATA_PATH):
        return []
    try:
        with open(METADATA_PATH, "r", encoding="utf-8") as f:
            data = json.load(f)
            return data if isinstance(data, list) else []
    except Exception:
        return []


def save_user_library(items):
    os.makedirs(os.path.dirname(METADATA_PATH), exist_ok=True)
    with open(METADATA_PATH, "w", encoding="utf-8") as f:
        json.dump(items, f, indent=2, ensure_ascii=False)


def sanitize_filename(name):
    # Strip any path components, keep word chars + dash + dot + space.
    base = os.path.basename(name or "")
    base = re.sub(r"[^\w\-. ]+", "_", base).strip()
    return base or "untitled.pdf"


def sanitize_music_filename(name):
    """Leniently sanitize a music or cover-image filename.
    Keeps Unicode letters/emoji but removes null bytes, control characters,
    and chars invalid on Windows filesystems (< > : " / \\ | ? *)."""
    base = os.path.basename(name or "")
    base = re.sub(r"[\x00-\x1f\x7f]", "", base)
    base = re.sub(r'[<>:"/\\|?*]', "_", base)
    base = base.strip(". ")
    return base or "untitled"


def ensure_port_free(p: int) -> None:
    # Bind-check on 0.0.0.0 because that's what the real server will bind to —
    # checking 127.0.0.1 alone misses the case where the port is taken on
    # another interface but free on loopback.
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
        try:
            s.bind(("0.0.0.0", p))
        except OSError as e:
            raise RuntimeError(
                f"port {p} is already in use.\n"
                f"  - if MECEE-BL is already running in another window, just use that one.\n"
                f"  - otherwise close whatever is using port {p} and try again.\n"
                f"  (raw error: {e})"
            ) from e


def lan_ips() -> list[str]:
    """Best-effort IPv4 addresses this host is reachable on from the LAN.
    Trick: open a UDP socket and 'connect' it to a sentinel public address.
    No packet is sent, but the kernel assigns a local endpoint — which is
    the IP the OS would use for outbound traffic on the default interface.
    Combined with getaddrinfo(hostname) we catch most multi-NIC setups
    (e.g. Wi-Fi + Ethernet) without depending on platform-specific tools."""
    ips: set[str] = set()
    try:
        with socket.socket(socket.AF_INET, socket.SOCK_DGRAM) as s:
            s.connect(("8.8.8.8", 53))
            ips.add(s.getsockname()[0])
    except OSError:
        pass
    try:
        for info in socket.getaddrinfo(socket.gethostname(), None, family=socket.AF_INET):
            ip = info[4][0]
            if ip and not ip.startswith("127."):
                ips.add(ip)
    except OSError:
        pass
    return sorted(ips)


def refresh_playlist() -> None:
    script = os.path.join(ROOT, "update_playlist.py")
    if not os.path.isfile(script):
        return
    playlist_dir = os.path.join(ROOT, "Playlist")
    if not os.path.isdir(playlist_dir):
        os.makedirs(playlist_dir, exist_ok=True)
    try:
        sys.path.insert(0, ROOT)
        import update_playlist
        update_playlist.main()
    except SystemExit:
        pass
    except Exception as e:
        print(f"[launcher] playlist refresh skipped: {e}")
    finally:
        try:
            sys.path.remove(ROOT)
        except ValueError:
            pass


class QuietHandler(http.server.SimpleHTTPRequestHandler):
    """SimpleHTTPRequestHandler with quieter logging + tiered cache headers
    + on-the-fly gzip for text assets."""

    # Big binary assets — PDFs, audio, images, fonts — almost never change in
    # place (new files get new names), so cache hard. Code assets (.js/.css)
    # may be edited so let the browser revalidate cheaply with If-Modified-Since.
    # HTML and JSON API responses stay fresh on every load.
    _IMMUTABLE_EXT = (".pdf", ".mp3", ".webp", ".png", ".jpg", ".jpeg",
                      ".gif", ".woff", ".woff2", ".ttf", ".ico")
    _REVALIDATE_EXT = (".js", ".css")
    # Text-ish file types that benefit from gzip. HTML/CSS/JS shrink to roughly
    # 15-25 % of their original size; for flashcards.html (~4300 lines) that
    # turns a ~150 KB transfer into ~25 KB.
    _COMPRESS_EXT = (".html", ".htm", ".css", ".js", ".json", ".svg")

    # Class-level LRU-ish cache of gzipped responses keyed by (path, mtime).
    # Stops us from re-compressing the same file on every request — but auto
    # invalidates when the file is edited (different mtime = different key).
    _gzip_cache: "dict[tuple[str, int], bytes]" = {}
    _gzip_cache_lock = threading.Lock()

    def send_response(self, code, message=None):  # noqa: N802 — stdlib name
        # Track the status so end_headers can avoid slapping aggressive cache
        # headers (max-age=30d, immutable) onto error responses — a cached 404
        # for a .pdf URL is otherwise honored for 30 days even after the file
        # exists, because "immutable" tells the browser not to revalidate.
        self._last_status = code
        super().send_response(code, message)

    def end_headers(self) -> None:
        code = getattr(self, "_last_status", 200)
        path = self.path.split("?", 1)[0].split("#", 1)[0].lower()
        if code >= 400:
            # Never cache errors — otherwise a stale 404 blocks a now-valid file.
            self.send_header("Cache-Control", "no-store")
        elif path.startswith("/api/"):
            self.send_header("Cache-Control", "no-store")
        elif path.endswith("/sw.js"):
            # Service worker bytes must always be re-checked so a new version
            # actually deploys. Browsers do their own SW byte-check too, but
            # no-cache here removes any HTTP-layer cache confusion.
            self.send_header("Cache-Control", "no-cache")
        elif path.endswith(self._IMMUTABLE_EXT):
            if path.endswith(".pdf"):
                # All PDFs use no-cache so the browser always revalidates with
                # If-Modified-Since before serving from its HTTP cache. This
                # means a corrupted cached copy is replaced on the very next
                # request rather than surviving for days under an immutable TTL.
                # The server returns 304 Not Modified when nothing changed, so
                # repeat opens are still fast (no body re-download).
                self.send_header("Cache-Control", "no-cache")
            else:
                # Audio, images, fonts — new files always get new names, so
                # hard-cache them for 30 days as immutable.
                self.send_header("Cache-Control", "public, max-age=2592000, immutable")
            # Advertise range-request support so PDF.js can fetch pages on
            # demand instead of downloading the whole file up front.
            _, ext = os.path.splitext(path)
            if ext in {'.pdf', '.mp3', '.webp', '.png', '.jpg', '.jpeg', '.gif'}:
                self.send_header("Accept-Ranges", "bytes")
        elif path.endswith(self._REVALIDATE_EXT):
            # 5 minutes — long enough that nav-between-pages is a pure cache hit
            # (no conditional GET roundtrip), short enough that edits show up
            # after a brief pause. The service worker is the primary cache layer
            # in practice; this is the fallback path before SW is installed.
            self.send_header("Cache-Control", "public, max-age=300")
        else:
            # HTML and everything else — always check, but allow 304.
            self.send_header("Cache-Control", "no-cache")
        super().end_headers()

    def log_message(self, fmt: str, *args) -> None:
        # One concise line per request; skip noisy 200 OKs for static assets if desired.
        sys.stdout.write(f"[{self.log_date_time_string()}] {fmt % args}\n")

    # ---------------- Library API ----------------
    # GET    /api/library          → JSON list of user-added PDFs
    # POST   /api/upload-pdf?...   → save raw PDF body into books/<subject>/
    # DELETE /api/delete-pdf?id=…  → remove a user-added PDF + its metadata

    # Files we never want served — even if they're moved out of the root,
    # this guards against future drops of secrets into the directory.
    _BLOCKED_EXT = (".txt", ".env", ".pem", ".key")

    def do_GET(self):  # noqa: N802 (stdlib name)
        parsed = urllib.parse.urlparse(self.path)
        if parsed.path == "/api/library":
            return self._api_list()
        if parsed.path == "/api/sync/status":
            return self._sync_status()
        if parsed.path == "/api/worker-config":
            return self._worker_config()
        if parsed.path == "/api/openai-key":
            return self._openai_key()
        if parsed.path.startswith("/api/sync/state/"):
            return self._sync_state_pull(parsed.path[len("/api/sync/state/"):])
        if parsed.path.startswith("/api/sync/pdf/"):
            return self._sync_pdf_get(parsed.path[len("/api/sync/pdf/"):])
        if parsed.path.startswith("/api/sync/blob/"):
            return self._sync_blob_get(parsed.path[len("/api/sync/blob/"):])
        if parsed.path.lower().endswith(self._BLOCKED_EXT):
            return self._json(403, {"error": "forbidden"})
        if self._serve_static_compressed(parsed):
            return
        # Cloud-uploaded library items reference /books/<id>.pdf and /blobs/<id>.<ext>
        # which don't exist on local disk. Proxy from R2 and cache to disk so the
        # next request is local.
        if (parsed.path.startswith("/books/") or parsed.path.startswith("/blobs/")) \
                and self._books_blobs_r2_fallback(parsed):
            return
        if self._try_range_request(parsed):
            return
        return super().do_GET()

    # File extensions for which we support HTTP range requests.
    # PDF.js uses Range to fetch only the xref table + requested page streams
    # instead of downloading the whole file — a 29 MB PDF can show page 1 in
    # under a second once range support is detected.
    _RANGE_EXT = frozenset({'.pdf', '.mp3', '.webp', '.png', '.jpg', '.jpeg', '.gif'})

    def _try_range_request(self, parsed) -> bool:
        """Serve a partial (206) response for a Range: bytes=… request.
        Returns True if the request was handled (including 416 errors), False
        to fall through to the normal full-file handler."""
        range_hdr = self.headers.get('Range', '')
        if not range_hdr:
            return False

        path_lower = parsed.path.lower().split('?', 1)[0]
        _, ext = os.path.splitext(path_lower)
        if ext not in self._RANGE_EXT:
            return False

        fs_path = self.translate_path(self.path)
        if not os.path.isfile(fs_path):
            return False  # let R2 fallback / 404 handle it

        try:
            file_size = os.path.getsize(fs_path)
            mtime     = os.path.getmtime(fs_path)
        except OSError:
            return False

        if not range_hdr.startswith('bytes='):
            return False

        spec = range_hdr[6:].strip()
        try:
            if spec.startswith('-'):          # suffix:   bytes=-1024
                n     = int(spec[1:])
                start = max(0, file_size - n)
                end   = file_size - 1
            elif spec.endswith('-'):          # open-end: bytes=1024-
                start = int(spec[:-1])
                end   = file_size - 1
            else:                             # explicit: bytes=0-1023
                lo, hi = spec.split('-', 1)
                start  = int(lo)
                end    = int(hi)
        except (ValueError, IndexError):
            return False

        if start < 0 or start > end or start >= file_size:
            self.send_response(416)
            self.send_header('Content-Range', f'bytes */{file_size}')
            self.end_headers()
            return True

        end    = min(end, file_size - 1)
        length = end - start + 1

        ctype = self.guess_type(fs_path)
        self.send_response(206)
        self.send_header('Content-Type',   ctype)
        self.send_header('Content-Length', str(length))
        self.send_header('Content-Range',  f'bytes {start}-{end}/{file_size}')
        self.send_header('Last-Modified',  email.utils.formatdate(mtime, usegmt=True))
        self.end_headers()

        try:
            with open(fs_path, 'rb') as fh:
                fh.seek(start)
                remaining = length
                while remaining > 0:
                    chunk = fh.read(min(65536, remaining))
                    if not chunk:
                        break
                    self.wfile.write(chunk)
                    remaining -= len(chunk)
        except OSError:
            pass  # client closed connection mid-stream
        return True

    _R2_PROXY_MIME = {
        ".pdf":  "application/pdf",
        ".png":  "image/png",
        ".jpg":  "image/jpeg",
        ".jpeg": "image/jpeg",
        ".webp": "image/webp",
        ".gif":  "image/gif",
    }

    def _books_blobs_r2_fallback(self, parsed) -> bool:
        """Serve /books/<name> or /blobs/<name> from R2 when not present on disk.
        Returns True if the request was handled (success or terminal failure).
        False means fall through to super().do_GET() (which will 404 locally).

        Cloud-uploaded items use UUID filenames written to R2 at pdfs/<uuid>.pdf
        and blobs/<uuid>.<ext>. Local-uploaded items use SHA-256 keys at
        pdfs/<sha>.pdf and blobs/<sha>. Try the obvious candidates in order."""
        rel = parsed.path[1:]  # "books/foo.pdf" or "blobs/bar.png"
        full = os.path.join(ROOT, rel.replace("/", os.sep))
        if os.path.isfile(full):
            return False  # local copy exists — let static handler serve it
        if R2_CLIENT is None:
            return False  # no sync configured — let super() 404

        # Only single-segment paths are cloud-style (nested ones live on disk).
        if parsed.path.startswith("/books/"):
            name = parsed.path[len("/books/"):]
            if "/" in name:
                return False  # nested like /books/biology/foo.pdf — local only
            stem = os.path.splitext(name)[0]
            candidates = [f"pdfs/{name}", f"pdfs/{stem}.pdf", f"books/{name}"]
        else:  # /blobs/
            name = parsed.path[len("/blobs/"):]
            if "/" in name:
                return False
            stem = os.path.splitext(name)[0]
            candidates = [f"blobs/{name}", f"blobs/{stem}"]

        data = None
        for key in candidates:
            try:
                data = R2_CLIENT.get_object(key)
            except mecee_sync.R2Error:
                continue
            except Exception:
                continue
            if data is not None:
                break

        if data is None:
            return False  # let super() emit the 404

        ext = os.path.splitext(rel)[1].lower()
        mime = self._R2_PROXY_MIME.get(ext, "application/octet-stream")

        # Cache to disk so future requests don't hit R2. Best-effort — if the
        # write fails (read-only fs, permission, etc.), still serve the response.
        try:
            os.makedirs(os.path.dirname(full), exist_ok=True)
            with open(full, "wb") as f:
                f.write(data)
        except Exception:
            pass

        try:
            self.send_response(200)
            self.send_header("Content-Type", mime)
            self.send_header("Content-Length", str(len(data)))
            self.send_header("Cache-Control", "public, max-age=2592000, immutable")
            self.end_headers()
            self.wfile.write(data)
        except Exception:
            pass
        return True

    def _gzip_bytes_for(self, fs_path: str, mtime: int) -> bytes:
        """Return gzipped bytes for fs_path, using/populating the class cache.
        Keyed by (path, mtime) so edits auto-invalidate. compresslevel=6 is the
        zlib default — best balance of speed vs ratio for text payloads."""
        key = (fs_path, mtime)
        cached = self._gzip_cache.get(key)
        if cached is not None:
            return cached
        with open(fs_path, "rb") as f:
            raw = f.read()
        compressed = gzip.compress(raw, compresslevel=6)
        with self._gzip_cache_lock:
            # Bounded cap so we don't grow forever if many files get edited.
            if len(self._gzip_cache) >= 64:
                self._gzip_cache.clear()
            self._gzip_cache[key] = compressed
        return compressed

    def _serve_static_compressed(self, parsed) -> bool:
        """Serve a compressible static file with on-the-fly gzip. Returns True
        if the request was handled here (caller should not fall through to the
        parent handler). False means 'not eligible — let super() do it.'"""
        path_lower = parsed.path.lower()
        if not path_lower.endswith(self._COMPRESS_EXT):
            return False
        if "gzip" not in self.headers.get("Accept-Encoding", ""):
            return False

        fs_path = self.translate_path(self.path)
        if not os.path.isfile(fs_path):
            return False
        try:
            st = os.stat(fs_path)
        except OSError:
            return False
        mtime = int(st.st_mtime)

        # Honor If-Modified-Since like the parent class does for non-gzipped
        # responses — saves the body bytes on revalidation hits.
        ims = self.headers.get("If-Modified-Since")
        if ims:
            try:
                ims_dt = email.utils.parsedate_to_datetime(ims)
                if ims_dt is not None and int(ims_dt.timestamp()) >= mtime:
                    self.send_response(304)
                    self.send_header("Last-Modified", email.utils.formatdate(mtime, usegmt=True))
                    self.end_headers()
                    return True
            except Exception:
                pass

        try:
            compressed = self._gzip_bytes_for(fs_path, mtime)
        except OSError:
            return False

        ctype = self.guess_type(fs_path)
        self.send_response(200)
        self.send_header("Content-Type", ctype)
        self.send_header("Content-Encoding", "gzip")
        self.send_header("Content-Length", str(len(compressed)))
        self.send_header("Last-Modified", email.utils.formatdate(mtime, usegmt=True))
        # Vary tells caches the response varies by Accept-Encoding — so a proxy
        # won't hand the gzipped bytes to a client that didn't ask for them.
        self.send_header("Vary", "Accept-Encoding")
        self.end_headers()
        self.wfile.write(compressed)
        return True

    def do_POST(self):  # noqa: N802
        parsed = urllib.parse.urlparse(self.path)
        if parsed.path == "/api/upload-pdf":
            return self._api_upload(parsed)
        if parsed.path == "/api/upload-blob":
            return self._api_upload_blob(parsed)
        if parsed.path == "/api/create-note":
            return self._api_create_note()
        if parsed.path.startswith("/api/sync/state/"):
            return self._sync_state_push(parsed.path[len("/api/sync/state/"):])
        if parsed.path == "/api/sync/library":
            return self._sync_library_push()
        if parsed.path == "/api/playlists/rescan":
            return self._api_playlists_rescan()
        if parsed.path == "/api/upload-music":
            return self._api_upload_music(parsed)
        self._json(404, {"error": "not found"})

    def _api_playlists_rescan(self):
        """Re-run update_playlist.py so newly-dropped folders/MP3s show up in
        the picker without restarting the launcher. The picker UI refetches
        Playlist/tracks.js (cache-busted) immediately after this returns."""
        try:
            refresh_playlist()
            self._json(200, {"ok": True})
        except Exception as e:
            self._json(500, {"error": str(e)})

    _MUSIC_AUDIO_EXTS = {".mp3"}
    _MUSIC_IMAGE_EXTS = {".jpg", ".jpeg", ".png", ".webp"}
    _MUSIC_MAX_BYTES  = 500 * 1024 * 1024   # 500 MB

    def _api_upload_music(self, parsed):
        """Save an MP3 or cover image into Playlist/.
        Query: ?filename=<original-name>
        Body:  raw bytes of the file.
        Cover images should be sent with a filename whose stem matches the MP3
        (the browser-side JS renames them automatically).
        Returns: {"ok": true, "file": "Playlist/<saved-name>"}"""
        try:
            qs = urllib.parse.parse_qs(parsed.query)
            filename = (qs.get("filename", [""])[0] or "").strip()
            if not filename:
                return self._json(400, {"error": "filename is required"})

            base = sanitize_music_filename(filename)
            ext  = os.path.splitext(base)[1].lower()
            all_exts = self._MUSIC_AUDIO_EXTS | self._MUSIC_IMAGE_EXTS
            if ext not in all_exts:
                return self._json(400, {"error": f"unsupported file type '{ext}' — allowed: {sorted(all_exts)}"})
            if not os.path.splitext(base)[0]:
                return self._json(400, {"error": "filename has no stem"})

            length = int(self.headers.get("Content-Length", "0") or "0")
            if length <= 0:
                return self._json(400, {"error": "empty body"})
            if length > self._MUSIC_MAX_BYTES:
                return self._json(413, {"error": f"file too large (>{self._MUSIC_MAX_BYTES // (1024*1024)} MB)"})

            data = self.rfile.read(length)

            # Light magic-byte validation for images; MP3 has too many valid headers.
            if ext == ".png" and not data.startswith(b"\x89PNG\r\n\x1a\n"):
                return self._json(400, {"error": "not a PNG image"})
            if ext in (".jpg", ".jpeg") and not data.startswith(b"\xff\xd8\xff"):
                return self._json(400, {"error": "not a JPEG image"})
            if ext == ".webp" and not (data[:4] == b"RIFF" and data[8:12] == b"WEBP"):
                return self._json(400, {"error": "not a WebP image"})

            playlist_dir = os.path.join(ROOT, "Playlist")
            os.makedirs(playlist_dir, exist_ok=True)

            # Avoid overwriting an existing file by appending (1), (2), …
            # For cover images, we intentionally overwrite a same-name image so
            # a re-upload replaces the old thumbnail without leaving orphans.
            final = base
            if ext in self._MUSIC_AUDIO_EXTS:
                i = 1
                while os.path.exists(os.path.join(playlist_dir, final)):
                    stem, e = os.path.splitext(base)
                    final = f"{stem} ({i}){e}"
                    i += 1

            full = os.path.join(playlist_dir, final)
            with open(full, "wb") as f:
                f.write(data)

            self._json(200, {"ok": True, "file": f"Playlist/{final}"})
        except Exception as e:
            self._json(500, {"error": str(e)})

    def do_DELETE(self):  # noqa: N802
        parsed = urllib.parse.urlparse(self.path)
        if parsed.path == "/api/delete-pdf":
            return self._api_delete(parsed)
        self._json(404, {"error": "not found"})

    def do_HEAD(self):  # noqa: N802
        parsed = urllib.parse.urlparse(self.path)
        if parsed.path.startswith("/api/sync/pdf/"):
            return self._sync_pdf_head(parsed.path[len("/api/sync/pdf/"):])
        if parsed.path.startswith("/api/sync/blob/"):
            return self._sync_blob_head(parsed.path[len("/api/sync/blob/"):])
        return super().do_HEAD()

    def _json(self, code: int, payload) -> None:
        body = json.dumps(payload).encode("utf-8")
        self.send_response(code)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def _api_list(self):
        try:
            self._json(200, load_user_library())
        except Exception as e:
            self._json(500, {"error": str(e)})

    def _api_upload(self, parsed):
        try:
            qs = urllib.parse.parse_qs(parsed.query)
            subject = (qs.get("subject", [""])[0] or "").lower()
            title = (qs.get("title", [""])[0] or "").strip()
            kind = (qs.get("type", ["book"])[0] or "book").lower()
            subtitle = (qs.get("subtitle", [""])[0] or "").strip()
            filename = (qs.get("filename", [""])[0] or "").strip()
            try:
                pages = int(qs.get("pages", ["0"])[0] or "0")
            except ValueError:
                pages = 0

            if subject not in SAFE_SUBJECTS:
                return self._json(400, {"error": f"invalid subject: {subject}"})
            if not title:
                return self._json(400, {"error": "title is required"})
            if kind not in {"book", "note"}:
                kind = "book"

            length = int(self.headers.get("Content-Length", "0") or "0")
            if length <= 0:
                return self._json(400, {"error": "empty body"})
            if length > 250 * 1024 * 1024:
                return self._json(413, {"error": "PDF too large (>250 MB)"})

            data = self.rfile.read(length)
            if data[:4] != b"%PDF":
                return self._json(400, {"error": "not a PDF (missing %PDF header)"})

            subdir = os.path.join(ROOT, "books", subject)
            os.makedirs(subdir, exist_ok=True)

            base = sanitize_filename(filename or title)
            if not base.lower().endswith(".pdf"):
                base += ".pdf"
            # Avoid overwriting an existing file by appending " (1)", " (2)", …
            final = base
            i = 1
            while os.path.exists(os.path.join(subdir, final)):
                root, ext = os.path.splitext(base)
                final = f"{root} ({i}){ext}"
                i += 1

            full = os.path.join(subdir, final)
            with open(full, "wb") as f:
                f.write(data)

            item = {
                "id":       uuid.uuid4().hex[:12],
                "subject":  subject,
                "title":    title,
                "type":     kind,
                "subtitle": subtitle,
                "file":     f"books/{subject}/{final}",
                "pages":    pages,
                "addedAt":  int(time.time()),
            }
            items = load_user_library()
            items.append(item)
            save_user_library(items)
            self._json(200, item)
        except Exception as e:
            self._json(500, {"error": str(e)})

    # File extensions accepted as note attachments. Anything outside this set
    # is rejected at upload time. Books are still PDF-only via _api_upload.
    NOTE_BLOB_EXTS = {".pdf", ".jpg", ".jpeg", ".png", ".webp"}
    NOTE_BLOB_MIMES = {
        ".pdf":  "application/pdf",
        ".jpg":  "image/jpeg",
        ".jpeg": "image/jpeg",
        ".png":  "image/png",
        ".webp": "image/webp",
    }
    MAX_NOTE_BLOB_BYTES = 250 * 1024 * 1024   # same cap as PDF uploads

    def _api_upload_blob(self, parsed):
        """Save a single image (or PDF) into books/<subject>/ and return the
        relative path. Used by the gallery-note flow, which uploads each
        image individually and then calls /api/create-note to bundle them
        into a single library item."""
        try:
            qs = urllib.parse.parse_qs(parsed.query)
            subject  = (qs.get("subject", [""])[0] or "").lower()
            filename = (qs.get("filename", [""])[0] or "").strip()

            if subject not in SAFE_SUBJECTS:
                return self._json(400, {"error": f"invalid subject: {subject}"})

            length = int(self.headers.get("Content-Length", "0") or "0")
            if length <= 0:
                return self._json(400, {"error": "empty body"})
            if length > self.MAX_NOTE_BLOB_BYTES:
                return self._json(413, {"error": f"file too large (>{self.MAX_NOTE_BLOB_BYTES // (1024*1024)} MB)"})

            base = sanitize_filename(filename or "blob")
            ext = os.path.splitext(base)[1].lower()
            if ext not in self.NOTE_BLOB_EXTS:
                return self._json(400, {"error": f"unsupported file type: {ext or '(none)'}"})

            data = self.rfile.read(length)
            # Light magic-byte sanity check so a renamed .png isn't actually a script.
            if ext == ".pdf"  and not data.startswith(b"%PDF"):
                return self._json(400, {"error": "not a PDF (missing %PDF header)"})
            if ext == ".png"  and not data.startswith(b"\x89PNG\r\n\x1a\n"):
                return self._json(400, {"error": "not a PNG image"})
            if ext in (".jpg", ".jpeg") and not data.startswith(b"\xff\xd8\xff"):
                return self._json(400, {"error": "not a JPEG image"})
            if ext == ".webp" and not (data[:4] == b"RIFF" and data[8:12] == b"WEBP"):
                return self._json(400, {"error": "not a WEBP image"})

            subdir = os.path.join(ROOT, "books", subject)
            os.makedirs(subdir, exist_ok=True)

            final = base
            i = 1
            while os.path.exists(os.path.join(subdir, final)):
                stem, e = os.path.splitext(base)
                final = f"{stem} ({i}){e}"
                i += 1

            full = os.path.join(subdir, final)
            with open(full, "wb") as f:
                f.write(data)

            rel = f"books/{subject}/{final}"
            self._json(200, {
                "file": rel,
                "mime": self.NOTE_BLOB_MIMES.get(ext, "application/octet-stream"),
                "size": len(data),
            })
        except Exception as e:
            self._json(500, {"error": str(e)})

    def _api_create_note(self):
        """Create a library item from already-uploaded blob paths. Used by the
        gallery-note flow after each image has been POSTed to /api/upload-blob."""
        try:
            raw = self._read_body()
            payload = json.loads(raw.decode("utf-8") or "{}")
            subject  = (payload.get("subject") or "").lower()
            title    = (payload.get("title")   or "").strip()
            subtitle = (payload.get("subtitle") or "").strip()
            kind     = (payload.get("kind")    or "gallery").lower()
            files    = payload.get("files") or []

            if subject not in SAFE_SUBJECTS:
                return self._json(400, {"error": f"invalid subject: {subject}"})
            if not title:
                return self._json(400, {"error": "title is required"})
            if not isinstance(files, list) or not files:
                return self._json(400, {"error": "files[] is required"})
            if kind not in {"gallery", "image", "pdf"}:
                kind = "gallery"

            # Validate every path lives under books/<subject>/ and exists on disk.
            for rel in files:
                if not isinstance(rel, str) or not rel.startswith(f"books/{subject}/") or ".." in rel:
                    return self._json(400, {"error": f"invalid path: {rel}"})
                if not os.path.isfile(os.path.join(ROOT, rel.replace("/", os.sep))):
                    return self._json(400, {"error": f"missing file: {rel}"})

            item = {
                "id":       uuid.uuid4().hex[:12],
                "subject":  subject,
                "title":    title,
                "type":     "note",
                "kind":     kind,             # 'gallery' | 'image' | 'pdf'
                "subtitle": subtitle,
                "files":    files,            # canonical list for galleries
                "file":     files[0],         # back-compat: first file as primary
                "pages":    len(files),       # used by the bookshelf "N pages" caption
                "addedAt":  int(time.time()),
            }
            items = load_user_library()
            items.append(item)
            save_user_library(items)
            self._json(200, item)
        except Exception as e:
            self._json(500, {"error": str(e)})

    def _api_delete(self, parsed):
        try:
            qs = urllib.parse.parse_qs(parsed.query)
            item_id = (qs.get("id", [""])[0] or "").strip()
            if not item_id:
                return self._json(400, {"error": "id is required"})
            items = load_user_library()
            target = next((x for x in items if x.get("id") == item_id), None)
            if not target:
                return self._json(404, {"error": "not found"})
            # Gallery notes have a files[] list; single-file items have just `file`.
            # Delete every blob on disk, guarded so we only touch books/<subject>/.
            blobs = list(target.get("files") or [])
            if not blobs and target.get("file"):
                blobs = [target["file"]]
            for rel in blobs:
                if not isinstance(rel, str): continue
                allowed = rel.startswith("books/") and ".." not in rel
                if not allowed: continue
                full = os.path.join(ROOT, rel.replace("/", os.sep))
                if os.path.isfile(full):
                    try:
                        os.remove(full)
                    except Exception:
                        pass
            save_user_library([x for x in items if x.get("id") != item_id])
            self._json(200, {"ok": True})
        except Exception as e:
            self._json(500, {"error": str(e)})

    # ---------------- Sync API ----------------
    # GET    /api/sync/status              → { enabled, bucket, lastError }
    # GET    /api/sync/state/<category>    → remote snapshot for that category
    # POST   /api/sync/state/<category>    → body = local snapshot; returns merged
    # POST   /api/sync/library             → special-case for library (orchestrates
    #                                         PDF upload after metadata merge)
    # GET    /api/sync/pdf/<sha256>        → download a PDF by content hash
    # HEAD   /api/sync/pdf/<sha256>        → just check existence (no body)

    def _read_body(self) -> bytes:
        length = int(self.headers.get("Content-Length", "0") or "0")
        if length <= 0:
            return b""
        # 50 MB cap for snapshot payloads — well above realistic flashcard JSON,
        # but stops accidental gigantic uploads from chewing memory.
        if length > 50 * 1024 * 1024:
            raise ValueError("snapshot too large (>50 MB)")
        return self.rfile.read(length)

    def _r2_or_503(self) -> bool:
        if R2_CLIENT is None:
            self._json(503, {"error": "sync disabled — .mecee-secrets/R2.json missing"})
            return False
        return True

    def _sync_status(self) -> None:
        if R2_CONFIG is None:
            return self._json(200, {"enabled": False, "reason": "no R2.json"})
        self._json(200, {
            "enabled": True,
            "bucket":  R2_CONFIG.bucket,
            "account": R2_CONFIG.account_id,
        })

    def _worker_config(self) -> None:
        """Hand the flashcards page everything it needs to talk to the
        Cloudflare Worker in 'cloud' mode. We read .mecee-secrets/worker.json
        + the referenced token file at request time so rotating the token
        doesn't require a launcher restart. Returns {enabled:false} when the
        files are missing — frontend uses that to grey out the toggle."""
        cfg_path = os.path.join(SECRETS_DIR, "worker.json")
        if not os.path.isfile(cfg_path):
            return self._json(200, {"enabled": False, "reason": "no worker.json"})
        try:
            with open(cfg_path, "r", encoding="utf-8") as f:
                cfg = json.load(f)
        except Exception as e:
            return self._json(200, {"enabled": False, "reason": f"worker.json unreadable: {e}"})
        url = cfg.get("url")
        tok_file = cfg.get("token_file") or "WORKER_TOKEN.txt"
        tok_path = os.path.join(SECRETS_DIR, tok_file)
        if not url or not os.path.isfile(tok_path):
            return self._json(200, {"enabled": False, "reason": "missing url or token file"})
        try:
            # utf-8-sig swallows a UTF-8 BOM if one was written by an editor
            # (PowerShell's Set-Content -Encoding utf8 does this). A leading
            # ﻿ in the token would otherwise survive .strip() and ride
            # all the way into the browser's Authorization header — which
            # fetch() refuses because ﻿ is outside ISO-8859-1.
            with open(tok_path, "r", encoding="utf-8-sig") as f:
                token = f.read().strip().lstrip("﻿")
        except Exception as e:
            return self._json(200, {"enabled": False, "reason": f"token unreadable: {e}"})
        if not token:
            return self._json(200, {"enabled": False, "reason": "token empty"})
        self._json(200, {"enabled": True, "url": url, "token": token})

    def _openai_key(self) -> None:
        """Return the OpenAI API key stored in .mecee-secrets/OPENAIAPI.txt.
        This is the permanent source of truth — the browser fetches it on
        every load so a hard refresh never loses the key, and the user only
        edits the file to change it. Returns {enabled:false} when missing
        so the frontend can fall back to whatever's in localStorage."""
        key_path = os.path.join(SECRETS_DIR, "OPENAIAPI.txt")
        if not os.path.isfile(key_path):
            return self._json(200, {"enabled": False, "reason": "no OPENAIAPI.txt"})
        try:
            # utf-8-sig drops a BOM if Notepad/PowerShell wrote one. Strip the
            # leading zero-width-BOM char too (PowerShell Set-Content -Encoding
            # utf8 emits ﻿ which would otherwise ride into the Authorization
            # header and fetch() would refuse it as non-ISO-8859-1.)
            with open(key_path, "r", encoding="utf-8-sig") as f:
                key = f.read().strip().lstrip("﻿")
        except Exception as e:
            return self._json(200, {"enabled": False, "reason": f"unreadable: {e}"})
        if not key:
            return self._json(200, {"enabled": False, "reason": "empty file"})
        # Sanity: OpenAI keys all start with "sk-". Don't ship anything else;
        # a typo'd path that points at the wrong file shouldn't leak its
        # contents into the browser.
        if not key.startswith("sk-"):
            return self._json(200, {"enabled": False, "reason": "not an OpenAI key"})
        self._json(200, {"enabled": True, "key": key})

    def _sync_state_pull(self, category: str) -> None:
        if not self._r2_or_503(): return
        if not mecee_sync.safe_category(category):
            return self._json(400, {"error": f"unknown category: {category}"})
        try:
            data = R2_CLIENT.get_object(f"state/{category}.json")
            if data is None:
                return self._json(200, mecee_sync.EMPTY_SNAPSHOT)
            try:
                self._json(200, json.loads(data))
            except Exception:
                self._json(200, mecee_sync.EMPTY_SNAPSHOT)
        except mecee_sync.R2Error as e:
            self._json(502, {"error": "r2 pull failed", "status": e.status})
        except Exception as e:
            self._json(500, {"error": str(e)})

    def _sync_state_push(self, category: str) -> None:
        if not self._r2_or_503(): return
        if not mecee_sync.safe_category(category):
            return self._json(400, {"error": f"unknown category: {category}"})
        try:
            body = self._read_body()
            try:
                local = json.loads(body or b"{}")
            except Exception:
                return self._json(400, {"error": "invalid JSON snapshot"})
            key = f"state/{category}.json"
            remote_raw = R2_CLIENT.get_object_smart(key)
            try:
                remote = json.loads(remote_raw) if remote_raw else mecee_sync.EMPTY_SNAPSHOT
            except Exception:
                remote = mecee_sync.EMPTY_SNAPSHOT
            merged = mecee_sync.merge_snapshots(local, remote)
            # Count what changed in each direction so the UI can show "up to date"
            # when both sides agreed and nothing had to move. Cheap diff —
            # snapshots stay small for these categories.
            pushed = mecee_sync.count_changes(remote.get("items") or {}, merged.get("items") or {})
            pulled = mecee_sync.count_changes(local.get("items") or {},  merged.get("items") or {})
            # Skip the network write if nothing changed in either direction —
            # saves an R2 PUT on a no-op sync.
            if pushed > 0:
                R2_CLIENT.put_object(key, json.dumps(merged, separators=(",", ":")).encode("utf-8"),
                                     content_type="application/json")
            self._json(200, {"snapshot": merged, "pushed": pushed, "pulled": pulled})
        except mecee_sync.R2Error as e:
            self._json(502, {"error": "r2 push failed", "status": e.status})
        except Exception as e:
            self._json(500, {"error": str(e)})

    def _sync_library_push(self) -> None:
        """Library sync is special: the client sends the metadata snapshot, but
        the actual PDFs live on the server filesystem (books/<subj>/*.pdf), so
        we orchestrate the PDF uploads here.

        Algorithm:
          1. Merge metadata snapshot per-item LWW (same as other categories).
          2. For every non-tombstoned entry that points at a local file, ensure
             it has a `sha256`. Compute and stamp it if missing.
          3. For every such entry, HEAD the corresponding pdfs/<sha>.pdf in R2 —
             upload if missing.
          4. Write merged metadata back to R2 AND to local books/user-library.json
             so subsequent /api/library calls reflect what we just synced.
          5. Return the merged snapshot + a short upload report to the client.
        """
        if not self._r2_or_503(): return
        try:
            body = self._read_body()
            try:
                local = json.loads(body or b"{}")
            except Exception:
                return self._json(400, {"error": "invalid JSON snapshot"})

            key = "state/library.json"
            remote_raw = R2_CLIENT.get_object_smart(key)
            try:
                remote = json.loads(remote_raw) if remote_raw else mecee_sync.EMPTY_SNAPSHOT
            except Exception:
                remote = mecee_sync.EMPTY_SNAPSHOT

            merged = mecee_sync.merge_snapshots(local, remote)
            pushed_meta = mecee_sync.count_changes(remote.get("items") or {}, merged.get("items") or {})
            pulled_meta = mecee_sync.count_changes(local.get("items") or {},  merged.get("items") or {})
            uploads, missing_locally = [], []

            # PDFs live at `pdfs/<sha>.pdf` for back-compat with the original
            # sync layer. Everything else (images for gallery notes) lives at
            # `blobs/<sha>` with content-type stored per-file in the snapshot.
            EXT_MIME = {
                ".pdf":  "application/pdf",
                ".jpg":  "image/jpeg",
                ".jpeg": "image/jpeg",
                ".png":  "image/png",
                ".webp": "image/webp",
            }

            def r2_key_for(rel_path: str, sha: str) -> tuple[str, str]:
                ext = os.path.splitext(rel_path)[1].lower()
                if ext == ".pdf":
                    return (f"pdfs/{sha}.pdf", "application/pdf")
                return (f"blobs/{sha}", EXT_MIME.get(ext, "application/octet-stream"))

            for item_id, wrapper in list(merged.get("items", {}).items()):
                if wrapper.get("deletedAt"):
                    continue
                data = wrapper.get("data") or {}

                # Collect every blob the item references. Single-file items (books
                # and PDF notes) carry `file`; gallery notes carry `files[]`.
                # `shas[]` parallels `files[]` for galleries so each blob's content
                # hash survives sync to other devices.
                file_list: list[str] = []
                if isinstance(data.get("files"), list) and data["files"]:
                    file_list = [f for f in data["files"] if isinstance(f, str)]
                elif data.get("file"):
                    file_list = [data["file"]]

                if not file_list:
                    continue

                is_gallery = isinstance(data.get("files"), list) and len(data["files"]) > 1
                shas_list  = list(data.get("shas") or [])
                changed    = False

                for idx, rel in enumerate(file_list):
                    full = os.path.join(ROOT, rel.replace("/", os.sep))
                    if not os.path.isfile(full):
                        # Local file missing — note any known hash so a future
                        # device can detect the gap.
                        known = (shas_list[idx] if idx < len(shas_list) else None) or (data.get("sha256") if not is_gallery else None)
                        if known:
                            missing_locally.append({"id": item_id, "sha": known, "file": rel})
                        continue

                    # Resolve / compute the content hash for this blob.
                    if is_gallery:
                        sha = shas_list[idx] if idx < len(shas_list) else None
                    else:
                        sha = data.get("sha256")
                    if not sha:
                        sha = mecee_sync.sha256_file(full)
                        if is_gallery:
                            while len(shas_list) <= idx:
                                shas_list.append(None)
                            shas_list[idx] = sha
                        else:
                            data["sha256"] = sha
                        changed = True

                    key, mime = r2_key_for(rel, sha)
                    try:
                        if not R2_CLIENT.head_object(key):
                            with open(full, "rb") as f:
                                R2_CLIENT.put_object(key, f.read(), content_type=mime)
                            uploads.append({"id": item_id, "sha": sha, "size": os.path.getsize(full), "file": rel})
                    except mecee_sync.R2Error:
                        # Don't abort the whole sync just because one blob failed.
                        pass

                if is_gallery:
                    data["shas"] = shas_list
                if changed:
                    wrapper["data"] = data
                    # Bump updatedAt only if metadata changed — don't fight other writers.
                    wrapper["updatedAt"] = max(wrapper.get("updatedAt") or 0, int(time.time() * 1000))

            # Write merged metadata back to R2.
            R2_CLIENT.put_object(key, json.dumps(merged, separators=(",", ":")).encode("utf-8"),
                                 content_type="application/json")

            # Also reflect the merged user-library into the local file so the
            # existing /api/library endpoint stays in sync.
            local_items = []
            for wrapper in merged.get("items", {}).values():
                if wrapper.get("deletedAt"):
                    continue
                d = wrapper.get("data") or {}
                if d.get("id"):
                    local_items.append(d)
            save_user_library(local_items)

            self._json(200, {
                "snapshot":        merged,
                "uploaded":        uploads,
                "missing_locally": missing_locally,
                "pushed":          pushed_meta + len(uploads),
                "pulled":          pulled_meta,
            })
        except mecee_sync.R2Error as e:
            self._json(502, {"error": "r2 library sync failed", "status": e.status})
        except Exception as e:
            self._json(500, {"error": str(e)})


    def _sync_pdf_get(self, sha: str) -> None:
        if not self._r2_or_503(): return
        sha = (sha or "").lower().strip()
        # 64 hex chars only — defensive against URL path injection.
        if len(sha) != 64 or any(c not in "0123456789abcdef" for c in sha):
            return self._json(400, {"error": "invalid sha"})
        try:
            data = R2_CLIENT.get_object(f"pdfs/{sha}.pdf")
            if data is None:
                return self._json(404, {"error": "not found"})
            self.send_response(200)
            self.send_header("Content-Type", "application/pdf")
            self.send_header("Content-Length", str(len(data)))
            self.end_headers()
            self.wfile.write(data)
        except mecee_sync.R2Error as e:
            self._json(502, {"error": "r2 pdf get failed", "status": e.status})
        except Exception as e:
            self._json(500, {"error": str(e)})

    def _sync_pdf_head(self, sha: str) -> None:
        if R2_CLIENT is None:
            self.send_response(503); self.end_headers(); return
        sha = (sha or "").lower().strip()
        if len(sha) != 64 or any(c not in "0123456789abcdef" for c in sha):
            self.send_response(400); self.end_headers(); return
        try:
            exists = R2_CLIENT.head_object(f"pdfs/{sha}.pdf")
            self.send_response(200 if exists else 404)
            self.end_headers()
        except Exception:
            self.send_response(502)
            self.end_headers()

    # Generic blob storage (images for gallery notes). Same shape as the PDF
    # endpoints — content-type comes back from R2's stored metadata.
    def _sync_blob_get(self, sha: str) -> None:
        if not self._r2_or_503(): return
        sha = (sha or "").lower().strip()
        if len(sha) != 64 or any(c not in "0123456789abcdef" for c in sha):
            return self._json(400, {"error": "invalid sha"})
        try:
            data = R2_CLIENT.get_object(f"blobs/{sha}")
            if data is None:
                return self._json(404, {"error": "not found"})
            # Sniff content-type from magic bytes since R2's metadata isn't
            # round-tripped by get_object here. Cheap and covers our 3 formats.
            mime = "application/octet-stream"
            if data[:8] == b"\x89PNG\r\n\x1a\n":     mime = "image/png"
            elif data[:3] == b"\xff\xd8\xff":        mime = "image/jpeg"
            elif data[:4] == b"RIFF" and data[8:12] == b"WEBP": mime = "image/webp"
            elif data[:4] == b"%PDF":                mime = "application/pdf"
            self.send_response(200)
            self.send_header("Content-Type", mime)
            self.send_header("Content-Length", str(len(data)))
            self.end_headers()
            self.wfile.write(data)
        except mecee_sync.R2Error as e:
            self._json(502, {"error": "r2 blob get failed", "status": e.status})
        except Exception as e:
            self._json(500, {"error": str(e)})

    def _sync_blob_head(self, sha: str) -> None:
        if R2_CLIENT is None:
            self.send_response(503); self.end_headers(); return
        sha = (sha or "").lower().strip()
        if len(sha) != 64 or any(c not in "0123456789abcdef" for c in sha):
            self.send_response(400); self.end_headers(); return
        try:
            exists = R2_CLIENT.head_object(f"blobs/{sha}")
            self.send_response(200 if exists else 404)
            self.end_headers()
        except Exception:
            self.send_response(502)
            self.end_headers()


def main() -> int:
    os.chdir(ROOT)
    refresh_playlist()

    # Optional hash (e.g. "library", "routine") passed through as the deep-link
    # fragment so index.html opens on that page. Used by the file:// fallback in
    # index.html, which redirects to /index.html#library when the user clicks
    # the library link before the server is running.
    page = sys.argv[1] if len(sys.argv) > 1 else ""
    page = page.lstrip("#")

    try:
        ensure_port_free(PORT)
    except RuntimeError as e:
        print(f"[launcher] {e}", file=sys.stderr)
        # If a server is already running on 8000, try to just open the browser
        # to it — that's almost certainly the user's previous launcher.
        url = f"http://localhost:{PORT}/index.html" + (f"#{page}" if page else "")
        print(f"[launcher] attempting to open {url} in case it's already running", file=sys.stderr)
        webbrowser.open(url)
        return 1

    url = f"http://localhost:{PORT}/index.html" + (f"#{page}" if page else "")

    # Bind 0.0.0.0 so phones / other devices on the same Wi-Fi can reach the
    # app at http://<pc-lan-ip>:8000. ThreadingTCPServer also lets the browser
    # load multiple resources concurrently.
    httpd = socketserver.ThreadingTCPServer(("0.0.0.0", PORT), QuietHandler)
    httpd.allow_reuse_address = True
    # Daemon threads so per-request handlers don't block Ctrl+C shutdown.
    httpd.daemon_threads = True

    print(f"[launcher] serving {ROOT}")
    print(f"[launcher] this PC:   {url}")
    ips = lan_ips()
    if ips:
        print(f"[launcher] LAN (open on phone, same Wi-Fi):")
        for ip in ips:
            print(f"[launcher]   http://{ip}:{PORT}/index.html" + (f"#{page}" if page else ""))
        print(f"[launcher]   ⚠ anyone on this Wi-Fi can reach the app — use trusted networks only")
    if R2_CONFIG is not None:
        print(f"[launcher] sync: enabled → r2://{R2_CONFIG.bucket}")
    else:
        print(f"[launcher] sync: disabled (no .mecee-secrets/R2.json found)")
    print(f"[launcher] press Ctrl+C to stop")

    # Open the browser shortly after the server is up.
    threading.Timer(0.5, lambda: webbrowser.open(url)).start()

    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        print("\n[launcher] shutting down")
    finally:
        httpd.shutdown()
        httpd.server_close()
    return 0


if __name__ == "__main__":
    sys.exit(main())
