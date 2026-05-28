"""
Scans Playlist/ for music and writes Playlist/tracks.js with the playlists every
HTML page can consume via `window.PLAYLIST_GROUPS`.

Folder layout:
    Playlist/
        song.mp3                 ← loose root files become a "Default" playlist
        song.webp                ← per-track cover (optional)
        Lofi Rain/
            cover.jpg            ← playlist cover (optional; otherwise the first
                                   track's per-track cover is used)
            track1.mp3
            track1.webp
            track2.mp3

Run this whenever you add/remove music in Playlist/:
    python update_playlist.py
"""
import json
import os
import sys

ROOT = os.path.dirname(os.path.abspath(__file__))
PLAYLIST_DIR = os.path.join(ROOT, "Playlist")
OUTPUT = os.path.join(PLAYLIST_DIR, "tracks.js")

COVER_EXTS = (".webp", ".jpg", ".jpeg", ".png")
COVER_NAMES = ("cover", "folder", "playlist")   # base filenames to try for playlist cover
ROOT_PLAYLIST_NAME = "Default"


def _rel(path: str) -> str:
    """POSIX-style path relative to the project root — what the browser fetches."""
    return os.path.relpath(path, ROOT).replace(os.sep, "/")


def find_track_cover(folder: str, stem: str) -> str | None:
    for ext in COVER_EXTS:
        p = os.path.join(folder, stem + ext)
        if os.path.isfile(p):
            return _rel(p)
    return None


def find_playlist_cover(folder: str, first_track_cover: str | None) -> str:
    for base in COVER_NAMES:
        for ext in COVER_EXTS:
            p = os.path.join(folder, base + ext)
            if os.path.isfile(p):
                return _rel(p)
    return first_track_cover or ""


def pretty_title(stem: str) -> str:
    return " ".join(stem.split()).strip()


def collect_tracks(folder: str) -> list[dict]:
    """List MP3s in `folder` (non-recursive), paired with per-track covers."""
    tracks = []
    try:
        names = sorted(os.listdir(folder))
    except OSError:
        return tracks
    for name in names:
        if not name.lower().endswith(".mp3"):
            continue
        full = os.path.join(folder, name)
        if not os.path.isfile(full):
            continue
        stem = os.path.splitext(name)[0]
        tracks.append({
            "title": pretty_title(stem),
            "file":  _rel(full),
            "cover": find_track_cover(folder, stem) or "",
        })
    return tracks


def collect_groups() -> list[dict]:
    """One playlist per subfolder + a 'Default' playlist for loose root files.

    Order: Default first (only if it has tracks), then subfolders alphabetically.
    """
    groups: list[dict] = []

    root_tracks = collect_tracks(PLAYLIST_DIR)
    if root_tracks:
        cover = find_playlist_cover(PLAYLIST_DIR, root_tracks[0].get("cover"))
        groups.append({
            "id":     "default",
            "name":   ROOT_PLAYLIST_NAME,
            "cover":  cover,
            "tracks": root_tracks,
        })

    try:
        subnames = sorted(os.listdir(PLAYLIST_DIR))
    except OSError:
        subnames = []
    for name in subnames:
        sub = os.path.join(PLAYLIST_DIR, name)
        if not os.path.isdir(sub):
            continue
        tracks = collect_tracks(sub)
        if not tracks:
            continue
        cover = find_playlist_cover(sub, tracks[0].get("cover"))
        groups.append({
            "id":     name,
            "name":   pretty_title(name),
            "cover":  cover,
            "tracks": tracks,
        })

    return groups


def _dir_signature() -> str:
    """mtime+size of every relevant file under PLAYLIST_DIR (one level deep).
    Skips the rewrite when nothing has changed so launches stay snappy."""
    parts = []
    try:
        for name in sorted(os.listdir(PLAYLIST_DIR)):
            full = os.path.join(PLAYLIST_DIR, name)
            if os.path.isdir(full):
                # Walk into the playlist subfolder.
                try:
                    for sub in sorted(os.listdir(full)):
                        if not sub.lower().endswith((".mp3",) + COVER_EXTS):
                            continue
                        p = os.path.join(full, sub)
                        try:
                            st = os.stat(p)
                            parts.append(f"{name}/{sub}:{st.st_size}:{int(st.st_mtime)}")
                        except OSError:
                            pass
                except OSError:
                    pass
            else:
                if not name.lower().endswith((".mp3",) + COVER_EXTS):
                    continue
                try:
                    st = os.stat(full)
                    parts.append(f"{name}:{st.st_size}:{int(st.st_mtime)}")
                except OSError:
                    pass
    except OSError:
        pass
    return "|".join(parts)


def main() -> int:
    if not os.path.isdir(PLAYLIST_DIR):
        print(f"error: {PLAYLIST_DIR} does not exist", file=sys.stderr)
        return 1

    sig = _dir_signature()
    sig_marker = f"/* sig: {sig} */\n"

    if os.path.isfile(OUTPUT):
        try:
            with open(OUTPUT, "r", encoding="utf-8") as f:
                first = f.readline()
                second = f.readline()
            if second == sig_marker:
                return 0
        except OSError:
            pass

    groups = collect_groups()

    # Legacy flat list — first playlist's tracks — kept for older pages that
    # haven't been updated to read PLAYLIST_GROUPS yet.
    legacy_tracks = groups[0]["tracks"] if groups else []

    body_groups = json.dumps(groups,       indent=2, ensure_ascii=False)
    body_legacy = json.dumps(legacy_tracks, indent=2, ensure_ascii=False)

    with open(OUTPUT, "w", encoding="utf-8") as f:
        f.write("/* Auto-generated by update_playlist.py — do not edit by hand. */\n")
        f.write(sig_marker)
        f.write(f"window.PLAYLIST_GROUPS = {body_groups};\n")
        f.write(f"window.PLAYLIST_TRACKS = {body_legacy};\n")

    total = sum(len(g["tracks"]) for g in groups)
    print(f"Wrote {len(groups)} playlist(s), {total} track(s) total to {os.path.relpath(OUTPUT, ROOT)}")
    for g in groups:
        safe = g["name"].encode(sys.stdout.encoding or "utf-8", errors="replace").decode(sys.stdout.encoding or "utf-8")
        print(f"  - {safe} ({len(g['tracks'])} tracks)")
    return 0


if __name__ == "__main__":
    sys.exit(main())
