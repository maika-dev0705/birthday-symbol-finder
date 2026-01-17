import json
import re
import time
import urllib.request
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
DATA_PATH = ROOT / "content" / "birthdata.json"


def fetch(url, timeout=30):
    req = urllib.request.Request(
        url,
        headers={
            "User-Agent": "Mozilla/5.0",
            "Accept": "text/html",
        },
    )
    with urllib.request.urlopen(req, timeout=timeout) as resp:
        return resp.read().decode("utf-8", errors="ignore")


def parse_color_code(html):
    match = re.search(
        r"<th[^>]*>\s*カラーコード\s*</th>\s*<td[^>]*>(#[0-9A-Fa-f]{6})",
        html,
    )
    if match:
        return match.group(1).strip()
    match = re.search(r"background:\s*(#[0-9A-Fa-f]{6})", html)
    if match:
        return match.group(1).strip()
    return ""


def main():
    data = json.loads(DATA_PATH.read_text(encoding="utf-8"))
    dates = data.get("dates", {})
    cache = {}
    updated = 0

    for date_key, date_data in dates.items():
        colors = date_data.get("color")
        if not isinstance(colors, list) or not colors:
            continue
        source = ""
        for item in colors:
            if isinstance(item, dict) and item.get("source"):
                source = str(item.get("source"))
                break
        if not source:
            continue
        if source in cache:
            code = cache[source]
        else:
            html = fetch(source)
            code = parse_color_code(html)
            cache[source] = code
            time.sleep(0.2)
        if not code:
            continue
        for item in colors:
            if isinstance(item, dict):
                item["colorCode"] = code
                updated += 1

    DATA_PATH.write_text(
        json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8"
    )
    print(f"Updated color codes for {updated} items.")


if __name__ == "__main__":
    main()
