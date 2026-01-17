import json
import os
import shutil
import subprocess
import tempfile
import re
import urllib.parse
import urllib.request
import urllib.error
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
URLS_PATH = ROOT / "content" / "category-image-urls.json"
OUT_PATH = ROOT / "content" / "category-images.json"
IMAGES_ROOT = ROOT / "public" / "images" / "categories"

HTML_HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
        "AppleWebKit/537.36 (KHTML, like Gecko) "
        "Chrome/123.0.0.0 Safari/537.36"
    ),
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    "Accept-Language": "ja-JP,ja;q=0.9,en-US;q=0.8,en;q=0.7",
    "Referer": "https://pixabay.com/",
}

FILE_HEADERS = {
    "User-Agent": "Mozilla/5.0",
    "Accept": "*/*",
}

DOWNLOAD_HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
        "AppleWebKit/537.36 (KHTML, like Gecko) "
        "Chrome/123.0.0.0 Safari/537.36"
    ),
    "Accept": "image/avif,image/webp,image/apng,image/*,*/*;q=0.8",
    "Accept-Language": "ja-JP,ja;q=0.9,en-US;q=0.8,en;q=0.7",
}


def ensure_magick():
    if shutil.which("magick") is None:
        raise RuntimeError("ImageMagick is not installed or not in PATH.")


def read_urls():
    if not URLS_PATH.exists():
        raise FileNotFoundError(f"{URLS_PATH} not found.")
    return json.loads(URLS_PATH.read_text(encoding="utf-8"))


def load_existing():
    if not OUT_PATH.exists():
        return {}
    data = json.loads(OUT_PATH.read_text(encoding="utf-8"))
    return data if isinstance(data, dict) else {}


def normalize_source(url):
    return str(url or "").strip().rstrip("/")


def build_headers(base_headers, referer=None):
    headers = dict(base_headers)
    if referer:
        headers["Referer"] = referer
    return headers


def fetch_to_temp(url, referer=None):
    last_exc = None
    referers = [referer]
    if "pixabay.com" in urllib.parse.urlparse(url).netloc:
        referers.append("https://pixabay.com/")
    referers.append(None)

    for ref in referers:
        headers = build_headers(DOWNLOAD_HEADERS, ref)
        req = urllib.request.Request(url, headers=headers)
        try:
            with urllib.request.urlopen(req, timeout=30) as resp:
                data = resp.read()
            break
        except urllib.error.HTTPError as exc:
            last_exc = exc
            if exc.code in (403, 429):
                continue
            raise
    else:
        raise last_exc
    fd, path = tempfile.mkstemp(suffix=".jpg")
    with os.fdopen(fd, "wb") as out:
        out.write(data)
    return path


def run_magick(args):
    subprocess.run(["magick", *args], check=True)


def fetch_text(url):
    req = urllib.request.Request(url, headers=HTML_HEADERS)
    try:
        with urllib.request.urlopen(req, timeout=30) as resp:
            return resp.read().decode("utf-8", errors="ignore")
    except urllib.error.HTTPError as exc:
        if exc.code in (403, 429):
            return ""
        raise


def fetch_pixabay_oembed(photo_url):
    oembed_url = (
        "https://pixabay.com/api/oembed/?url="
        + urllib.parse.quote(photo_url, safe="")
    )
    req = urllib.request.Request(oembed_url, headers={"User-Agent": "Mozilla/5.0"})
    with urllib.request.urlopen(req, timeout=30) as resp:
        return json.loads(resp.read().decode("utf-8"))


def parse_pixabay_author(html):
    match = re.search(r'<meta[^>]+name="author"[^>]+content="([^"]+)"', html)
    if match:
        return match.group(1).strip()
    match = re.search(
        r'href="[^"]*/users/[^"]+"[^>]*>\\s*<span[^>]*>([^<]+)</span>',
        html,
    )
    if match:
        return match.group(1).strip()
    return ""


def parse_og_image(html):
    match = re.search(
        r'<meta[^>]+property="og:image"[^>]+content="([^"]+)"', html
    )
    if match:
        return match.group(1).strip()
    return ""


def is_image_url(url):
    return bool(re.search(r"\.(?:jpe?g|png|webp)(?:\\?|$)", url, re.I))


def extract_pixabay_meta(photo_url):
    author = ""
    image_url = ""
    oembed = {}
    try:
        oembed = fetch_pixabay_oembed(photo_url)
    except Exception:
        oembed = {}
    if oembed:
        author = str(oembed.get("author_name", "")).strip()
        image_url = str(oembed.get("thumbnail_url", "")).strip()

    html = ""
    if not author or not image_url:
        html = fetch_text(photo_url)
    if not author:
        author = parse_pixabay_author(html)
    if not image_url:
        image_url = parse_og_image(html)
    if not image_url:
        candidate = str(oembed.get("url", "")).strip()
        if is_image_url(candidate):
            image_url = candidate
    return {
        "photographer": author,
        "source": photo_url,
        "image_url": image_url,
    }


def fetch_with_candidates(candidates, referer=None):
    last_exc = None
    for candidate in candidates:
        if not candidate:
            continue
        try:
            return fetch_to_temp(candidate, referer=referer)
        except urllib.error.HTTPError as exc:
            last_exc = exc
            if exc.code in (403, 429):
                continue
            raise
    if last_exc:
        raise last_exc
    raise ValueError("No download URL candidates.")


def get_next_index(items, category):
    max_index = 0
    pattern = re.compile(
        rf"/{re.escape(category)}-(\d+)\.(?:webp|jpg|jpeg|png)$"
    )
    for item in items:
        if not isinstance(item, dict):
            continue
        src = str(item.get("src", ""))
        match = pattern.search(src)
        if not match:
            continue
        try:
            value = int(match.group(1))
            max_index = max(max_index, value)
        except ValueError:
            continue
    return max_index + 1


def main():
    ensure_magick()
    payload = read_urls()
    if not isinstance(payload, dict):
        raise ValueError("category-image-urls.json must be an object.")

    result = load_existing()
    skipped = []
    for category, items in payload.items():
        if not isinstance(items, list):
            continue
        if not items:
            continue
        category_dir = IMAGES_ROOT / category
        category_dir.mkdir(parents=True, exist_ok=True)
        existing_items = result.get(category, [])
        if not isinstance(existing_items, list):
            existing_items = []
        existing_sources = {
            normalize_source(item.get("source"))
            for item in existing_items
            if isinstance(item, dict)
        }
        next_index = get_next_index(existing_items, category)

        for entry in items:
            if isinstance(entry, dict):
                url = str(entry.get("url", "")).strip()
                override_photographer = str(entry.get("photographer", "")).strip()
                override_source = str(entry.get("source", "")).strip()
            else:
                url = str(entry).strip()
                override_photographer = ""
                override_source = ""
            if not url:
                continue
            if normalize_source(url) in existing_sources:
                continue
            if "pixabay.com" in urllib.parse.urlparse(url).netloc:
                meta = extract_pixabay_meta(url)
                if not meta["image_url"]:
                    raise ValueError(f"Could not find image URL: {url}")
                photographer = override_photographer or meta["photographer"]
                source = override_source or meta["source"] or url
                download_candidates = [meta["image_url"]]
            else:
                raise ValueError(
                    f"Supported URLs are Pixabay photo pages only. Unsupported: {url}"
                )

            try:
                temp_path = fetch_with_candidates(
                    download_candidates, referer=source or url
                )
            except urllib.error.HTTPError as exc:
                skipped.append({"url": url, "reason": f"HTTP {exc.code}"})
                print(f"Skip ({exc.code}): {url}")
                continue
            jpg_name = f"{category}-{next_index:02d}.jpg"
            webp_name = f"{category}-{next_index:02d}.webp"
            jpg_path = category_dir / jpg_name
            webp_path = category_dir / webp_name

            run_magick([temp_path, "-resize", "1200x", "-quality", "82", str(jpg_path)])
            run_magick([str(jpg_path), "-quality", "80", str(webp_path)])

            os.remove(temp_path)

            existing_items.append(
                {
                    "src": f"/images/categories/{category}/{webp_name}",
                    "photographer": photographer,
                    "source": source,
                }
            )
            existing_sources.add(normalize_source(source))
            next_index += 1

        result[category] = existing_items

    OUT_PATH.write_text(
        json.dumps(result, ensure_ascii=False, indent=2), encoding="utf-8"
    )
    print("Saved", OUT_PATH)
    if skipped:
        print("Skipped URLs:")
        for item in skipped:
            print(f"- {item['url']} ({item['reason']})")


if __name__ == "__main__":
    main()
