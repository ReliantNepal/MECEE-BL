"""One-shot diagnostic: report which Playlist/ blobs are present in R2.

Hashes every MP3 + cover in Playlist/, then HEADs each sha against the
mecee-sync bucket and prints a table. No writes, no side effects.
"""
import os, sys, mecee_sync

ROOT        = os.path.dirname(os.path.abspath(__file__))
SECRETS_DIR = os.path.normpath(os.path.join(ROOT, "..", ".mecee-secrets"))

cfg = mecee_sync.load_r2_config(SECRETS_DIR)
if not cfg:
    print("R2 config not found in", SECRETS_DIR); sys.exit(1)
client = mecee_sync.R2Client(cfg)

COVER_EXTS = (".webp", ".jpg", ".jpeg", ".png")
playlist_root = os.path.join(ROOT, "Playlist")
blobs = []   # (kind, title, size, sha)

def hash_and_record(path, kind, title):
    if not os.path.isfile(path): return
    sha = mecee_sync.sha256_file(path)
    blobs.append((kind, title, os.path.getsize(path), sha))

def walk(folder):
    for name in sorted(os.listdir(folder)):
        full = os.path.join(folder, name)
        if os.path.isdir(full):
            walk(full); continue
        if name.lower().endswith(".mp3"):
            hash_and_record(full, "mp3", os.path.splitext(name)[0])
            stem = os.path.splitext(name)[0]
            for ext in COVER_EXTS:
                cov = os.path.join(folder, stem + ext)
                if os.path.isfile(cov):
                    hash_and_record(cov, "cover", stem + ext)
                    break

print("Hashing local files…")
walk(playlist_root)
print(f"  {len(blobs)} blobs to check\n")

print(f"{'kind':<6} {'present':<9} {'size':>10}  title")
print("-" * 80)
present_n = missing_n = 0
for kind, title, size, sha in blobs:
    try:
        ok = client.head_object(f"blobs/{sha}")
    except mecee_sync.R2Error as e:
        ok = False
    flag = "[YES]" if ok else "[NO ]"
    present_n += 1 if ok else 0
    missing_n += 0 if ok else 1
    mb = f"{size/1024/1024:.1f} MB"
    short = (title[:55] + "…") if len(title) > 56 else title
    print(f"{kind:<6} {flag:<9} {mb:>10}  {short}")
    if ok:
        print(f"       sha=blobs/{sha}")

print()
print(f"Summary: {present_n} present, {missing_n} missing (of {len(blobs)} blobs)")
