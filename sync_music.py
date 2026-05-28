"""Upload Playlist/ MP3 + cover-image files to the mecee-music Worker.

Walks Syllabus/Playlist/ recursively, hashes each .mp3 and recognised cover,
HEADs the Worker to see what's already present in music-sync/<sha>.<ext>,
and PUTs only the missing ones. One-way: never pulls, never deletes.

Reads Worker URL + token from .mecee-secrets/worker_music.json:

    {
      "url":        "https://mecee-music.<account>.workers.dev",
      "token_file": "WORKER_TOKEN.txt"
    }

The deploy step writes worker_music.json automatically.
"""
from __future__ import annotations

import hashlib
import json
import os
import sys
import urllib.parse
import urllib.request

# Windows console defaults to cp1252; Playlist/ filenames contain emoji and
# fullwidth punctuation, so force UTF-8 here so prints don't crash.
try:
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
    sys.stderr.reconfigure(encoding="utf-8", errors="replace")
except Exception:
    pass


ROOT         = os.path.dirname(os.path.abspath(__file__))
PLAYLIST_DIR = os.path.join(ROOT, "Playlist")
SECRETS_DIR  = os.path.normpath(os.path.join(ROOT, "..", ".mecee-secrets"))

COVER_EXTS = (".webp", ".jpg", ".jpeg", ".png", ".gif")
ALLOWED    = (".mp3",) + COVER_EXTS

# Cloudflare Workers request-body limit: 100 MB on Free / 500 MB on Standard.
# We default to the Free ceiling (with a small safety margin) so the script
# doesn't surprise-fail mid-upload. Override via MECEE_MUSIC_MAX_MB env var.
DEFAULT_MAX_MB = 95
MAX_BYTES = int(os.environ.get("MECEE_MUSIC_MAX_MB", DEFAULT_MAX_MB)) * 1024 * 1024

EXT_FOR_SUFFIX = {
    ".jpeg": "jpg",   # collapse jpeg → jpg to match the Worker's allowlist key
}


def _load_config() -> tuple[str, str]:
    cfg_path = os.path.join(SECRETS_DIR, "worker_music.json")
    if not os.path.isfile(cfg_path):
        sys.exit(f"missing {cfg_path} — deploy the worker first")
    with open(cfg_path, "r", encoding="utf-8") as f:
        cfg = json.load(f)
    url = (cfg.get("url") or "").rstrip("/")
    if not url:
        sys.exit("worker_music.json missing 'url'")
    token_file = cfg.get("token_file") or "WORKER_TOKEN.txt"
    token_path = os.path.join(SECRETS_DIR, token_file)
    if not os.path.isfile(token_path):
        sys.exit(f"missing token file {token_path}")
    with open(token_path, "r", encoding="utf-8") as f:
        token = next((ln.strip() for ln in f if ln.strip()), "")
    if not token:
        sys.exit(f"token file {token_path} is empty")
    return url, token


def _sha256(path: str) -> str:
    h = hashlib.sha256()
    with open(path, "rb") as f:
        for chunk in iter(lambda: f.read(1024 * 1024), b""):
            h.update(chunk)
    return h.hexdigest()


def _walk_playlist() -> list[tuple[str, str, str]]:
    """Return [(abs_path, sha, ext_no_dot)] for every uploadable file."""
    out: list[tuple[str, str, str]] = []
    if not os.path.isdir(PLAYLIST_DIR):
        return out
    for dirpath, _dirs, files in os.walk(PLAYLIST_DIR):
        for name in sorted(files):
            lower = name.lower()
            suf = os.path.splitext(lower)[1]
            if suf not in ALLOWED:
                continue
            full = os.path.join(dirpath, name)
            ext = EXT_FOR_SUFFIX.get(suf, suf.lstrip("."))
            out.append((full, _sha256(full), ext))
    return out


def _request(method: str, url: str, token: str, body: bytes | None = None,
             extra_headers: dict | None = None, timeout: int = 900) -> tuple[int, bytes]:
    req = urllib.request.Request(url, data=body, method=method)
    req.add_header("Authorization", f"Bearer {token}")
    # Cloudflare's edge bot-check (error code 1010) rejects the default
    # `Python-urllib/X.Y` user-agent. A normal browser-like UA gets past it.
    req.add_header("User-Agent", "mecee-music-sync/1.0")
    if extra_headers:
        for k, v in extra_headers.items():
            req.add_header(k, v)
    try:
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            return resp.status, resp.read()
    except urllib.error.HTTPError as e:
        return e.code, e.read() if e.fp else b""


def main() -> int:
    base, token = _load_config()

    # Health probe so a misconfigured Worker fails fast instead of mid-loop.
    code, body = _request("GET", base + "/health", token)
    if code != 200:
        print(f"health check failed: HTTP {code} {body[:200]!r}", file=sys.stderr)
        return 1

    # Pull the current key set so we can skip HEADs entirely for known files.
    code, body = _request("GET", base + "/list", token)
    if code != 200:
        print(f"list failed: HTTP {code} {body[:200]!r}", file=sys.stderr)
        return 1
    listing = json.loads(body.decode("utf-8"))
    present = {obj["key"] for obj in listing.get("objects", [])}
    print(f"R2 music-sync/ currently has {len(present)} object(s).")

    files = _walk_playlist()
    if not files:
        print("no music files found under Playlist/")
        return 0
    print(f"Local Playlist/ has {len(files)} file(s) to consider.")

    uploaded = skipped = failed = oversize = 0
    for path, sha, ext in files:
        key = f"music-sync/{sha}.{ext}"
        rel = os.path.relpath(path, ROOT).replace(os.sep, "/")
        if key in present:
            skipped += 1
            continue
        size = os.path.getsize(path)
        if size > MAX_BYTES:
            oversize += 1
            print(f"  ! {rel}  ({size/1024/1024:.1f} MB) > {MAX_BYTES/1024/1024:.0f} MB cap — skipped")
            continue
        print(f"  > {rel}  ({size/1024/1024:.1f} MB)")
        with open(path, "rb") as f:
            body = f.read()
        qs = urllib.parse.urlencode({"sha": sha, "ext": ext})
        try:
            code, resp = _request(
                "PUT",
                f"{base}/upload?{qs}",
                token,
                body=body,
                extra_headers={"Content-Type": "application/octet-stream"},
            )
        except Exception as e:
            failed += 1
            print(f"    failed: {type(e).__name__}: {e}", file=sys.stderr)
            continue
        if code == 200:
            uploaded += 1
        else:
            failed += 1
            print(f"    failed: HTTP {code} {resp[:200]!r}", file=sys.stderr)

    parts = [f"{uploaded} uploaded", f"{skipped} already present"]
    if oversize: parts.append(f"{oversize} skipped (over {MAX_BYTES/1024/1024:.0f} MB cap)")
    if failed:   parts.append(f"{failed} failed")
    print("\nDone: " + ", ".join(parts) + ".")
    return 0 if failed == 0 else 1


if __name__ == "__main__":
    sys.exit(main())
