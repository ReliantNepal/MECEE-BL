"""
R2 sync helpers for MECEE-BL.

Two responsibilities:
  1. Talk to Cloudflare R2 via the management API (PUT/GET/HEAD/DELETE of
     objects). We use the Global API Key + email auth scheme — there is no
     public API to mint scoped R2 access keys, only the dashboard. Storing
     the Global Key in .mecee-secrets/ is the same exposure the user already
     accepted for the OpenAI key.
  2. Merge per-item snapshots (last-write-wins with tombstones). This is what
     makes "edit on phone, study on laptop, sync = both survive" work without
     a real CRDT.

The launcher.py imports this module and wires up the /api/sync/* endpoints.
"""
from __future__ import annotations

import datetime
import hashlib
import hmac
import http.client
import json
import os
import threading
import time
import urllib.parse
import xml.etree.ElementTree as ET
from dataclasses import dataclass
from typing import Any, Dict, List, Optional, Tuple


# ---------- Config loading ----------

@dataclass
class R2Config:
    account_id: str
    bucket: str
    email: str
    api_key: str
    # Optional S3-compatible credentials. Required only for multipart uploads
    # (large files >250 MB) — the management API doesn't support multipart, so
    # we fall through to R2's S3 endpoint at {account_id}.r2.cloudflarestorage.com
    # which uses AWS Sig V4 auth. Generate at:
    #   Cloudflare dashboard → R2 → Manage R2 API Tokens → Create API Token
    s3_access_key_id: str = ""
    s3_secret_access_key: str = ""

    @property
    def api_base(self) -> str:
        return f"/client/v4/accounts/{self.account_id}/r2/buckets/{self.bucket}"

    @property
    def s3_host(self) -> str:
        return f"{self.account_id}.r2.cloudflarestorage.com"

    @property
    def has_s3(self) -> bool:
        return bool(self.s3_access_key_id and self.s3_secret_access_key)


def load_r2_config(secrets_dir: str) -> Optional[R2Config]:
    """Load .mecee-secrets/R2.json + the referenced key file. Returns None if
    anything is missing — caller treats that as "sync disabled" rather than
    crashing the launcher."""
    cfg_path = os.path.join(secrets_dir, "R2.json")
    if not os.path.isfile(cfg_path):
        return None
    try:
        with open(cfg_path, "r", encoding="utf-8") as f:
            cfg = json.load(f)
    except Exception:
        return None

    key_file = cfg.get("api_key_file") or "CloudflareGLOBALAPI.txt"
    key_path = os.path.join(secrets_dir, key_file)
    if not os.path.isfile(key_path):
        return None
    try:
        with open(key_path, "r", encoding="utf-8") as f:
            raw = f.read()
        # Tolerate files that have annotations below the key (e.g. an
        # "EMAIL: foo@bar.com" line tacked on). HTTP headers can't contain
        # newlines, so we extract just the first non-empty line. Stops
        # http.client from rejecting the request with "Invalid header value".
        api_key = next((ln.strip() for ln in raw.splitlines() if ln.strip()), "")
    except Exception:
        return None

    if not (cfg.get("account_id") and cfg.get("bucket") and cfg.get("email") and api_key):
        return None

    # Optional S3 creds for large-file multipart uploads. Two forms supported:
    #   1. Inline in R2.json:  "s3_access_key_id": "...", "s3_secret_access_key": "..."
    #   2. Sidecar file:       "s3_credentials_file": "R2_S3.json"  → that file
    #      contains {"access_key_id": "...", "secret_access_key": "..."}
    s3_id = (cfg.get("s3_access_key_id") or "").strip()
    s3_secret = (cfg.get("s3_secret_access_key") or "").strip()
    if not s3_id or not s3_secret:
        sidecar = cfg.get("s3_credentials_file")
        if sidecar:
            sidecar_path = os.path.join(secrets_dir, sidecar)
            if os.path.isfile(sidecar_path):
                try:
                    with open(sidecar_path, "r", encoding="utf-8") as f:
                        s3cfg = json.load(f)
                    s3_id     = (s3cfg.get("access_key_id") or "").strip()
                    s3_secret = (s3cfg.get("secret_access_key") or "").strip()
                except Exception:
                    pass

    return R2Config(
        account_id=cfg["account_id"],
        bucket=cfg["bucket"],
        email=cfg["email"],
        api_key=api_key,
        s3_access_key_id=s3_id,
        s3_secret_access_key=s3_secret,
    )


# ---------- R2 client (Cloudflare management API) ----------

class R2Error(RuntimeError):
    """Raised when R2 returns a non-2xx. Has .status and .body for the route
    handler to surface to the browser."""
    def __init__(self, status: int, body: bytes):
        super().__init__(f"R2 returned {status}: {body[:200]!r}")
        self.status = status
        self.body = body


class R2Client:
    """Minimal R2 client over the Cloudflare management API.

    Two efficiency tricks live here:
      - Thread-local persistent HTTPS connection: the launcher uses a threaded
        TCP server, so each handler thread keeps its own keep-alive connection
        to api.cloudflare.com and reuses it across object operations. Saves
        the TLS handshake (~2 RTTs) on every call after the first.
      - In-memory ETag cache: get_object_smart() sends `If-None-Match` with the
        last-seen ETag. If R2 returns 304 we use the cached body without
        re-transferring the snapshot. On hosts that ignore If-None-Match it
        degrades gracefully to a normal 200 GET."""

    HOST = "api.cloudflare.com"

    def __init__(self, cfg: R2Config):
        self.cfg = cfg
        # Per-thread keep-alive connection. http.client.HTTPSConnection is not
        # thread-safe, so we keep one per thread rather than serialising.
        self._local = threading.local()
        # ETag cache: key -> (etag, body). Process-local, lost on restart;
        # on miss we just fall through to a normal GET.
        self._cache_lock = threading.Lock()
        self._etag_cache: Dict[str, Tuple[str, bytes]] = {}

    def _get_conn(self, timeout: int = 60) -> http.client.HTTPSConnection:
        """Per-thread keep-alive connection. The default 60s suits small JSON
        snapshots; large blob uploads (multi-hundred-MB MP3s on a slow uplink)
        need to override via the `timeout` argument. A passed-in timeout drops
        the cached conn so the new socket is created with the right value."""
        conn = getattr(self._local, "conn", None)
        if conn is not None and getattr(self._local, "timeout", 60) != timeout:
            try: conn.close()
            except Exception: pass
            conn = None
        if conn is None:
            conn = http.client.HTTPSConnection(self.HOST, timeout=timeout)
            self._local.conn = conn
            self._local.timeout = timeout
        return conn

    def _drop_conn(self) -> None:
        conn = getattr(self._local, "conn", None)
        if conn is not None:
            try:
                conn.close()
            except Exception:
                pass
            self._local.conn = None

    def _headers(self, extra: Optional[Dict[str, str]] = None) -> Dict[str, str]:
        h = {
            "X-Auth-Email": self.cfg.email,
            "X-Auth-Key":   self.cfg.api_key,
        }
        if extra:
            h.update(extra)
        return h

    def _request(self, method: str, path: str, body: Optional[bytes] = None,
                 headers: Optional[Dict[str, str]] = None,
                 timeout: int = 60) -> Tuple[http.client.HTTPResponse, bytes, Dict[str, str]]:
        """Issue a request on the thread-local connection. Retries once on a
        dropped keep-alive (server closed the socket between requests).
        `timeout` is per-call so large blob uploads can override the 60s
        default — see put_object()."""
        hdrs = headers or {}
        last_exc: Optional[BaseException] = None
        for attempt in (0, 1):
            conn = self._get_conn(timeout=timeout)
            try:
                conn.request(method, path, body=body, headers=hdrs)
                resp = conn.getresponse()
                data = resp.read()
                # Capture headers before the next call on this conn invalidates resp.
                resp_headers = {k.lower(): v for k, v in resp.getheaders()}
                return resp, data, resp_headers
            except (http.client.HTTPException, ConnectionError, OSError) as e:
                last_exc = e
                self._drop_conn()
                if attempt == 1:
                    break
        assert last_exc is not None
        raise last_exc

    # Cloudflare's R2 management API silently caps single-PUT body size at
    # ~300 MB — anything bigger fails with an SSL EOF mid-stream. The
    # management API does NOT support multipart uploads either; only the
    # S3-compatible endpoint does. So for big blobs we fall through to the
    # S3 path (which requires s3_access_key_id / s3_secret_access_key in
    # R2.json — see R2Config). 250 MB threshold leaves headroom under the
    # 300 MB single-PUT cap.
    MULTIPART_THRESHOLD = 250 * 1024 * 1024      # 250 MB
    MULTIPART_PART_SIZE =  50 * 1024 * 1024      #  50 MB per part (R2: 5 MB min, 5 GB max)

    def put_object(self, key: str, data: bytes, content_type: str = "application/octet-stream",
                   timeout: int = 60) -> Dict[str, Any]:
        """`timeout` (seconds) defaults to 60 for small JSON snapshots. Big
        blobs (MP3s, PDFs) should pass 600+ to survive slow uplinks — at
        20 Mbps a 300 MB MP3 takes 2 minutes just on the wire.

        Bodies over MULTIPART_THRESHOLD route through the S3-compatible
        endpoint via put_object_s3_multipart(). That requires S3 creds in
        the R2 config; without them we raise a clear error message."""
        if len(data) > self.MULTIPART_THRESHOLD:
            return self.put_object_s3_multipart(key, data, content_type=content_type, timeout=timeout)
        path = f"{self.cfg.api_base}/objects/{urllib.parse.quote(key, safe='/')}"
        resp, body, resp_headers = self._request("PUT", path, body=data, headers=self._headers({
            "Content-Type":   content_type,
            "Content-Length": str(len(data)),
        }), timeout=timeout)
        if resp.status >= 300:
            raise R2Error(resp.status, body)
        # Refresh cache with the newly-written object. If R2 returned an ETag
        # we'll use it on the next If-None-Match probe; otherwise drop the
        # entry so the next read goes to the wire.
        new_etag = resp_headers.get("etag")
        with self._cache_lock:
            if new_etag:
                self._etag_cache[key] = (new_etag, data)
            else:
                self._etag_cache.pop(key, None)
        try:
            return json.loads(body or b"{}")
        except Exception:
            return {}

    # ---- S3-compatible multipart upload ----------------------------------
    # The management API has no multipart endpoint, so big blobs go through
    # R2's S3-compatible endpoint at {account_id}.r2.cloudflarestorage.com,
    # which signs requests with AWS Sig V4. Implementation is straightforward
    # but tedious: sign each phase, parse a couple of XML responses.

    def _sigv4_signing_key(self, date_yyyymmdd: str, region: str, service: str) -> bytes:
        """Derive an AWS Sig V4 signing key from the secret + date + region +
        service. Same chain AWS itself uses, copied from the docs."""
        k_date    = hmac.new(("AWS4" + self.cfg.s3_secret_access_key).encode("utf-8"),
                             date_yyyymmdd.encode("utf-8"), hashlib.sha256).digest()
        k_region  = hmac.new(k_date,  region.encode("utf-8"),  hashlib.sha256).digest()
        k_service = hmac.new(k_region, service.encode("utf-8"), hashlib.sha256).digest()
        k_signing = hmac.new(k_service, b"aws4_request", hashlib.sha256).digest()
        return k_signing

    def _sigv4_sign(self, method: str, path: str, query: str, body: bytes,
                    extra_headers: Optional[Dict[str, str]] = None,
                    region: str = "auto", service: str = "s3") -> Dict[str, str]:
        """Build the Authorization header (and x-amz-* friends) for an S3 call.
        Returns the full header dict the caller should send."""
        now       = datetime.datetime.utcnow()
        amz_date  = now.strftime("%Y%m%dT%H%M%SZ")
        date_only = now.strftime("%Y%m%d")
        payload_hash = hashlib.sha256(body).hexdigest()

        headers: Dict[str, str] = dict(extra_headers or {})
        headers["host"]                 = self.cfg.s3_host
        headers["x-amz-date"]           = amz_date
        headers["x-amz-content-sha256"] = payload_hash

        # 1. Canonical request — every field needs the documented form or the
        #    signature won't match.
        canonical_uri = urllib.parse.quote(path, safe="/~")
        # Canonical query string: sort by key, encode each k/v separately.
        canonical_query = ""
        if query:
            pairs: List[Tuple[str, str]] = []
            for part in query.split("&"):
                if "=" in part:
                    k, v = part.split("=", 1)
                else:
                    k, v = part, ""
                pairs.append((urllib.parse.quote(k, safe="~"),
                              urllib.parse.quote(v, safe="~")))
            pairs.sort()
            canonical_query = "&".join(f"{k}={v}" for k, v in pairs)
        # Canonical headers: lowercase name, trimmed value, newline-separated.
        lower_hdrs = [(k.lower().strip(), str(v).strip()) for k, v in headers.items()]
        lower_hdrs.sort()
        canonical_headers = "".join(f"{k}:{v}\n" for k, v in lower_hdrs)
        signed_headers    = ";".join(k for k, _ in lower_hdrs)

        canonical_request = "\n".join([
            method.upper(),
            canonical_uri,
            canonical_query,
            canonical_headers,
            signed_headers,
            payload_hash,
        ])

        # 2. String to sign.
        scope = f"{date_only}/{region}/{service}/aws4_request"
        string_to_sign = "\n".join([
            "AWS4-HMAC-SHA256",
            amz_date,
            scope,
            hashlib.sha256(canonical_request.encode("utf-8")).hexdigest(),
        ])

        # 3. Signature + Authorization header.
        signing_key = self._sigv4_signing_key(date_only, region, service)
        signature   = hmac.new(signing_key, string_to_sign.encode("utf-8"),
                               hashlib.sha256).hexdigest()
        headers["authorization"] = (
            f"AWS4-HMAC-SHA256 Credential={self.cfg.s3_access_key_id}/{scope}, "
            f"SignedHeaders={signed_headers}, Signature={signature}"
        )
        return headers

    def _s3_request(self, method: str, path: str, query: str, body: bytes,
                    extra_headers: Optional[Dict[str, str]] = None,
                    timeout: int = 600) -> Tuple[int, bytes, Dict[str, str]]:
        """Issue a single signed request to the S3 endpoint. Uses a fresh
        connection so the big-blob socket timeout doesn't poison the keep-
        alive used for management-API calls."""
        url_path = path if not query else f"{path}?{query}"
        signed   = self._sigv4_sign(method, path, query, body, extra_headers)
        conn = http.client.HTTPSConnection(self.cfg.s3_host, timeout=timeout)
        try:
            conn.request(method, url_path, body=body, headers=signed)
            resp = conn.getresponse()
            data = resp.read()
            resp_headers = {k.lower(): v for k, v in resp.getheaders()}
            return resp.status, data, resp_headers
        finally:
            try: conn.close()
            except Exception: pass

    def put_object_s3_multipart(self, key: str, data: bytes,
                                content_type: str = "application/octet-stream",
                                timeout: int = 600) -> Dict[str, Any]:
        """Three-phase S3 multipart upload against R2's S3 endpoint:
             1. POST   ?uploads                       → UploadId
             2. PUT    ?partNumber=N&uploadId=ID      → ETag (one per part)
             3. POST   ?uploadId=ID  (body=XML)       → finalizes the object

        Used automatically by put_object() when the body exceeds
        MULTIPART_THRESHOLD. Requires S3 creds in R2Config; raises an
        instructive error if they're missing."""
        if not self.cfg.has_s3:
            raise R2Error(0, (
                b"Large blob (>250 MB) needs S3 multipart upload, but no S3 "
                b"credentials are configured. Add 's3_access_key_id' and "
                b"'s3_secret_access_key' to .mecee-secrets/R2.json. Generate "
                b"them in the Cloudflare dashboard: R2 > Manage R2 API Tokens "
                b"> Create API Token (Admin Read & Write)."
            ))

        # Path: /<bucket>/<key>. The key may contain slashes (e.g. blobs/sha) —
        # those stay unescaped per S3 conventions; everything else gets encoded.
        s3_path = "/" + self.cfg.bucket + "/" + key

        # Phase 1: initiate multipart upload.
        status, body, _ = self._s3_request(
            "POST", s3_path, "uploads=", b"",
            extra_headers={"Content-Type": content_type},
            timeout=timeout,
        )
        if status >= 300:
            raise R2Error(status, body)
        upload_id = self._parse_xml_initiate(body)
        if not upload_id:
            raise R2Error(500, b"no UploadId in InitiateMultipartUploadResult: " + body[:200])

        # Phase 2: upload each part. Part numbers start at 1.
        part_size = self.MULTIPART_PART_SIZE
        parts: List[Tuple[int, str]] = []
        offset, part_no = 0, 1
        try:
            while offset < len(data):
                chunk = data[offset:offset + part_size]
                qs = f"partNumber={part_no}&uploadId={urllib.parse.quote(upload_id, safe='')}"
                status, pbody, phdrs = self._s3_request(
                    "PUT", s3_path, qs, chunk,
                    extra_headers={"Content-Length": str(len(chunk))},
                    timeout=timeout,
                )
                if status >= 300:
                    raise R2Error(status, pbody)
                etag = (phdrs.get("etag") or "").strip('"')
                if not etag:
                    raise R2Error(500, b"missing ETag on part " + str(part_no).encode())
                parts.append((part_no, etag))
                offset += part_size
                part_no += 1
        except Exception:
            # Best-effort abort so partial uploads don't linger and rack up
            # storage charges.
            try:
                self._s3_request(
                    "DELETE", s3_path,
                    f"uploadId={urllib.parse.quote(upload_id, safe='')}", b"",
                    timeout=timeout,
                )
            except Exception:
                pass
            raise

        # Phase 3: complete. Body is XML listing every part in order.
        complete_xml = self._build_complete_xml(parts)
        qs = f"uploadId={urllib.parse.quote(upload_id, safe='')}"
        status, body, resp_headers = self._s3_request(
            "POST", s3_path, qs, complete_xml,
            extra_headers={"Content-Type": "application/xml"},
            timeout=timeout,
        )
        if status >= 300:
            raise R2Error(status, body)

        # Refresh the ETag cache like single-PUT does, so subsequent reads can
        # short-circuit via If-None-Match.
        new_etag = resp_headers.get("etag")
        with self._cache_lock:
            if new_etag:
                self._etag_cache[key] = (new_etag, data)
            else:
                self._etag_cache.pop(key, None)
        return {"ok": True, "etag": new_etag, "parts": len(parts)}

    @staticmethod
    def _parse_xml_initiate(body: bytes) -> Optional[str]:
        """Extract <UploadId> from InitiateMultipartUploadResult. S3 sticks
        the namespace into the root tag, so we strip it before lookup."""
        try:
            root = ET.fromstring(body)
        except ET.ParseError:
            return None
        for el in root.iter():
            tag = el.tag.split("}", 1)[-1]   # drop {namespace}
            if tag == "UploadId":
                return (el.text or "").strip() or None
        return None

    @staticmethod
    def _build_complete_xml(parts: List[Tuple[int, str]]) -> bytes:
        """Serialise the part list as CompleteMultipartUpload XML."""
        rows = "".join(
            f"<Part><PartNumber>{n}</PartNumber><ETag>\"{etag}\"</ETag></Part>"
            for n, etag in parts
        )
        xml = f'<?xml version="1.0" encoding="UTF-8"?><CompleteMultipartUpload>{rows}</CompleteMultipartUpload>'
        return xml.encode("utf-8")

    def get_object(self, key: str) -> Optional[bytes]:
        """Returns the raw object bytes, or None if the object doesn't exist."""
        path = f"{self.cfg.api_base}/objects/{urllib.parse.quote(key, safe='/')}"
        resp, body, _ = self._request("GET", path, headers=self._headers())
        if resp.status == 404:
            return None
        if resp.status >= 300:
            raise R2Error(resp.status, body)
        return body

    def get_object_smart(self, key: str) -> Optional[bytes]:
        """Cached GET. Sends If-None-Match with the last-seen ETag; on 304 we
        return the cached body without re-transferring it. Falls back to a
        normal GET when the cache is empty or the server ignores the header."""
        with self._cache_lock:
            cached = self._etag_cache.get(key)
        extra: Dict[str, str] = {}
        if cached:
            extra["If-None-Match"] = cached[0]
        path = f"{self.cfg.api_base}/objects/{urllib.parse.quote(key, safe='/')}"
        resp, body, resp_headers = self._request("GET", path, headers=self._headers(extra))
        if resp.status == 304 and cached:
            return cached[1]
        if resp.status == 404:
            with self._cache_lock:
                self._etag_cache.pop(key, None)
            return None
        if resp.status >= 300:
            raise R2Error(resp.status, body)
        etag = resp_headers.get("etag")
        if etag:
            with self._cache_lock:
                self._etag_cache[key] = (etag, body)
        return body

    def head_object(self, key: str) -> bool:
        """True if object exists, False if 404, raises otherwise.

        Cloudflare's management API does not support HEAD requests on objects
        (returns 404 for everything), so we do a 1-byte ranged GET instead —
        cheap enough that the savings aren't worth a custom code path."""
        path = f"{self.cfg.api_base}/objects/{urllib.parse.quote(key, safe='/')}"
        resp, _, _ = self._request("GET", path, headers=self._headers({"Range": "bytes=0-0"}))
        if resp.status == 404:
            return False
        if resp.status in (200, 206):
            return True
        raise R2Error(resp.status, b"")

    def delete_object(self, key: str) -> None:
        path = f"{self.cfg.api_base}/objects/{urllib.parse.quote(key, safe='/')}"
        resp, body, _ = self._request("DELETE", path, headers=self._headers())
        if resp.status not in (200, 204, 404):
            raise R2Error(resp.status, body)
        with self._cache_lock:
            self._etag_cache.pop(key, None)


# ---------- Snapshot merge (last-write-wins with tombstones) ----------

# Snapshot format:
#   {
#     "schema":    1,
#     "updatedAt": <unix-ms>,
#     "items": {
#       "<id>": {
#         "data":      { ... entity ... },
#         "updatedAt": <unix-ms>,
#         "deletedAt": <unix-ms> | null
#       }, ...
#     }
#   }
#
# For each id present in either side:
#   - "effective ts" = max(item.updatedAt, item.deletedAt or 0)
#   - Whichever side has the larger effective ts wins.
#   - If both sides have identical timestamps, prefer the one with the larger
#     deletedAt (deletes are sticky to avoid resurrection).

EMPTY_SNAPSHOT: Dict[str, Any] = {"schema": 1, "updatedAt": 0, "items": {}}


def _effective_ts(item: Dict[str, Any]) -> int:
    ts_u = item.get("updatedAt") or 0
    ts_d = item.get("deletedAt") or 0
    return max(ts_u, ts_d)


def merge_snapshots(local: Dict[str, Any], remote: Dict[str, Any]) -> Dict[str, Any]:
    """Per-item LWW merge. Output preserves tombstones so deletes propagate."""
    li = (local or {}).get("items", {}) or {}
    ri = (remote or {}).get("items", {}) or {}
    out: Dict[str, Any] = {}
    for key in set(li.keys()) | set(ri.keys()):
        lv, rv = li.get(key), ri.get(key)
        if lv is None:
            out[key] = rv
        elif rv is None:
            out[key] = lv
        else:
            l_ts, r_ts = _effective_ts(lv), _effective_ts(rv)
            if l_ts > r_ts:
                out[key] = lv
            elif r_ts > l_ts:
                out[key] = rv
            else:
                # Tie: prefer the side carrying a deletedAt (sticky deletes).
                out[key] = lv if (lv.get("deletedAt") or 0) >= (rv.get("deletedAt") or 0) else rv
    return {
        "schema":    1,
        "updatedAt": int(time.time() * 1000),
        "items":     out,
    }


def count_changes(before: Dict[str, Any], after: Dict[str, Any]) -> int:
    """How many ids changed going from `before` to `after`. An id counts as
    changed if it is missing on one side, or its effective timestamp differs
    between sides. Used to decide whether a sync actually moved any data."""
    changed = 0
    keys = set(before.keys()) | set(after.keys())
    for k in keys:
        b, a = before.get(k), after.get(k)
        if b is None or a is None:
            changed += 1
            continue
        if _effective_ts(b) != _effective_ts(a):
            changed += 1
    return changed


# ---------- Misc helpers ----------

def sha256_file(path: str) -> str:
    h = hashlib.sha256()
    with open(path, "rb") as f:
        for chunk in iter(lambda: f.read(1 << 20), b""):
            h.update(chunk)
    return h.hexdigest()


# Category whitelist. Mirrored on the JS side in mecee_keys.js
# (MeceeKeys.SYNC_CATEGORIES). Keep both in lockstep when adding/removing —
# Python gates which URL paths the launcher accepts; JS drives the in-app
# sync UI plan. The Python set may legitimately be a superset (a category
# the server is ready to accept before the UI exposes it).
CATEGORIES = frozenset({
    "tracker",
    "flashcards",
    "chats",
    "library",
    "library_bookmarks",
    "library_highlights",
    "chat_settings",   # API key + model + prompt, single "self" item
})


def safe_category(cat: str) -> bool:
    """Whitelist for category names — keeps URL path injection out of R2 keys."""
    return cat in CATEGORIES
