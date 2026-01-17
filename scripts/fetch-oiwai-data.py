import json
import re
import html as html_lib
import time
import urllib.request
from datetime import date
from pathlib import Path

BASE_OIWAI = "https://www.oiwai-item.com"
ANDPLANTS_BASE = "https://andplants.jp"
ANDPLANTS_INDEX = (
    "https://andplants.jp/blogs/magazine/birthflower-365"
    "?srsltid=AfmBOoprWGgZLnKc5TAGDV2PtFz9nyx8YvmQmHZHvmdTsbFUhQbq-Prq#h3-1"
)
BIRD_INDEX = "https://monokotoba.com/bird"
FISH_INDEX = "https://aqsakana.com/words/"
FISH_MONTH_URL = "https://aqsakana.com/words/index/{month}"
BIRTHSTONE_BASE = "https://birthstone.jp"
BIRTHSTONE_MONTH_SLUGS = [
    "january",
    "february",
    "march",
    "april",
    "may",
    "june",
    "july",
    "august",
    "september",
    "october",
    "november",
    "december",
]

OIWAI_CATEGORIES = {
    "stone": "stone",
    "color": "color",
    "tree": "plant",
    "alcohol": "alcohol",
    "sushi": "sushi",
    "fruit": "fruit",
    "star": "star",
}

DAYS_IN_MONTH = [31, 29, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31]

ROOT = Path(__file__).resolve().parents[1]
META_PATH = ROOT / "content" / "meta.json"
OUT_PATH = ROOT / "content" / "birthdata.json"


def fetch(url, timeout=30):
    req = urllib.request.Request(
        url,
        headers={
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)",
        },
    )
    with urllib.request.urlopen(req, timeout=timeout) as resp:
        return resp.read().decode("utf-8", errors="ignore")


def clean(text):
    text = re.sub(r"<br\s*/?>", "\n", text)
    text = re.sub(r"<[^>]+>", "", text)
    text = html_lib.unescape(text)
    text = text.replace("\r", "\n")
    text = re.sub(r"\s+", " ", text)
    return text.strip()


def ensure_url(href, base):
    if href.startswith("//"):
        return "https:" + href
    if href.startswith("/"):
        return base + href
    return href


def parse_oiwai_month(html):
    table_match = re.search(r"<table class=\"detail\"[\s\S]*?</table>", html)
    if not table_match:
        return []
    table = table_match.group(0)
    rows = re.findall(r"<tr>[\s\S]*?</tr>", table)

    items = []
    current_day = None
    current_source = None

    for row in rows:
        day_match = re.search(
            r"<th[^>]*colspan=\"2\"[^>]*>\s*<a[^>]*href=\"([^\"]+)\"[^>]*>(\d+)\u65e5",
            row,
        )
        if day_match:
            current_source = ensure_url(day_match.group(1), BASE_OIWAI)
            current_day = int(day_match.group(2))
            continue

        if current_day is None:
            continue

        tds = re.findall(r"<td class=\"data\"[^>]*>(.*?)</td>", row, re.S)
        if not tds:
            continue

        name = clean(tds[0]) if len(tds) >= 1 else ""
        meaning = clean(tds[1]) if len(tds) >= 2 else ""
        if not name:
            current_day = None
            current_source = None
            continue

        items.append(
            {
                "day": current_day,
                "name": name,
                "meaning": [meaning] if meaning else [],
                "source": current_source or "",
            }
        )
        current_day = None
        current_source = None

    return items


def parse_oiwai_color_code(html):
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


def parse_andplants_index(html):
    day_links = {}
    pattern = re.compile(
        r'href="([^"]*birthflower-(\d{2})(\d{2})[^"]*)"'
    )
    for url, month, day in pattern.findall(html):
        key = f"{int(month):02d}-{int(day):02d}"
        day_links[key] = ensure_url(url, ANDPLANTS_BASE)
    return day_links


def split_andplants_meaning(text):
    if not text:
        return []
    matches = re.findall(r"「([^」]+)」", text)
    if matches:
        return [item.strip() for item in matches if item.strip()]
    parts = re.split(r"[、,/・／]+", text)
    return [part.strip() for part in parts if part.strip()]


def split_birthstone_words(text):
    if not text:
        return []
    parts = re.split(r"[、,/・／]+", text)
    return [part.strip() for part in parts if part.strip()]


def parse_birthstone_month(html):
    sections = re.findall(
        r"(<h2[^>]*>[\s\S]*?</h2>)([\s\S]*?)(?=<h2[^>]*>|$)",
        html,
    )
    items = []
    for header, body in sections:
        name_match = re.search(r"「([^」]+)」", header)
        if not name_match:
            continue
        name = clean(name_match.group(1))
        if not name:
            continue
        words_match = re.search(r"石言葉</h3>\s*([^<]+)", body)
        words = clean(words_match.group(1)) if words_match else ""
        meanings = split_birthstone_words(words)
        if not meanings:
            continue
        items.append(
            {
                "name": name,
                "meaning": meanings,
            }
        )
    return items


def parse_andplants_day(html, month, day):
    tables = re.findall(r"<table[^>]*>[\s\S]*?</table>", html)
    target = f"{month}月{day}日"
    items = []
    for table in tables:
        if "誕生花" not in table or "花言葉" not in table:
            continue
        rows = re.findall(r"<tr>[\s\S]*?</tr>", table)
        for row in rows:
            cells = re.findall(r"<t[dh][^>]*>(.*?)</t[dh]>", row, re.S)
            if len(cells) < 3:
                continue
            date_text = clean(cells[0])
            if target not in date_text:
                if "月日" in date_text or "日付" in date_text:
                    continue
                continue
            name = clean(cells[1])
            meaning_text = clean(cells[2])
            meaning = split_andplants_meaning(meaning_text)
            if not name:
                continue
            items.append(
                {
                    "name": name,
                    "meaning": meaning,
                }
            )
        if items:
            break
    return items


def get_monokotoba_month_urls():
    html = fetch(BIRD_INDEX)
    pattern = re.compile(
        r'<a href="(https://monokotoba\.com/archives/bird/\d+)"[^>]*>[\s\S]*?<img[^>]+alt="([^"]+)"',
        re.S,
    )
    month_urls = {}
    for url, alt in pattern.findall(html):
        match = re.search(r"(\d+)\u6708", alt)
        if not match:
            continue
        month = int(match.group(1))
        month_urls[month] = url

    if len(month_urls) >= 12:
        return month_urls

    link_pattern = re.compile(
        r'<a href="(https://monokotoba\.com/archives/bird/\d+)"[^>]*>([^<]+)</a>'
    )
    for url, text in link_pattern.findall(html):
        match = re.search(r"(\d+)\u6708", text)
        if not match:
            continue
        month = int(match.group(1))
        month_urls[month] = url

    return month_urls


def parse_monokotoba_month(html, month):
    table_match = re.search(r"<table[\s\S]*?</table>", html)
    if not table_match:
        return []
    table = table_match.group(0)
    rows = re.findall(
        r"<tr>\s*<td[^>]*>(.*?)</td>\s*<td[^>]*>(.*?)</td>\s*<td[^>]*>(.*?)</td>\s*</tr>",
        table,
        re.S,
    )

    items = []
    for date_cell, name_cell, meaning_cell in rows:
        date_text = clean(date_cell)
        match = re.search(r"(\d+)\u6708(\d+)\u65e5", date_text)
        if not match:
            continue
        month_value = int(match.group(1))
        day_value = int(match.group(2))
        if month_value != month:
            continue

        name = clean(name_cell)
        meaning = clean(meaning_cell)
        if not name:
            continue

        items.append(
            {
                "day": day_value,
                "name": name,
                "meaning": [meaning] if meaning else [],
                "source": "",
            }
        )

    return items


def parse_aqsakana_month(html, month):
    table_match = re.search(r"<table[\s\S]*?</table>", html)
    if not table_match:
        return []
    table = table_match.group(0)
    rows = re.findall(
        r"<tr>\s*<td[^>]*>(.*?)</td>\s*<td[^>]*>(.*?)</td>\s*<td[^>]*>(.*?)</td>\s*</tr>",
        table,
        re.S,
    )

    items = []
    for date_cell, name_cell, meaning_cell in rows:
        date_text = clean(date_cell)
        match = re.search(r"(\d+)\u6708(\d+)\u65e5", date_text)
        if not match:
            continue
        month_value = int(match.group(1))
        day_value = int(match.group(2))
        if month_value != month:
            continue

        name = clean(name_cell)
        meaning = clean(meaning_cell)
        if not name:
            continue

        items.append(
            {
                "day": day_value,
                "name": name,
                "meaning": [meaning] if meaning else [],
                "source": "",
            }
        )

    return items


def main():
    meta = json.loads(META_PATH.read_text(encoding="utf-8-sig"))
    category_keys = [item["key"] for item in meta.get("categories", [])]

    dates = {}
    for month in range(1, 13):
        for day in range(1, DAYS_IN_MONTH[month - 1] + 1):
            key = f"{month:02d}-{day:02d}"
            dates[key] = {category_key: [] for category_key in category_keys}

    for category_key, path in OIWAI_CATEGORIES.items():
        for month in range(1, 13):
            url = f"{BASE_OIWAI}/{path}/{month}"
            html = fetch(url)
            items = parse_oiwai_month(html)
            for entry in items:
                date_key = f"{month:02d}-{entry['day']:02d}"
                color_code = ""
                if category_key == "color" and entry.get("source"):
                    color_html = fetch(entry["source"])
                    color_code = parse_oiwai_color_code(color_html)
                dates[date_key][category_key].append(
                    {
                        "name": entry["name"],
                        "meaning": entry["meaning"],
                        **({"colorCode": color_code} if color_code else {}),
                        "source": entry["source"],
                    }
                )
                if category_key == "color":
                    time.sleep(0.15)
            time.sleep(0.25)

    try:
        andplants_html = fetch(ANDPLANTS_INDEX)
        andplants_days = parse_andplants_index(andplants_html)
    except Exception:
        andplants_days = {}
    if not andplants_days:
        for month in range(1, 13):
            for day in range(1, DAYS_IN_MONTH[month - 1] + 1):
                key = f"{month:02d}-{day:02d}"
                andplants_days[key] = (
                    f"{ANDPLANTS_BASE}/blogs/magazine/birthflower-{month:02d}{day:02d}"
                )

    for date_key, url in sorted(andplants_days.items()):
        month, day = map(int, date_key.split("-"))
        html = fetch(url)
        items = parse_andplants_day(html, month, day)
        for entry in items:
            dates[date_key]["flower"].append(
                {
                    "name": entry["name"],
                    "meaning": entry["meaning"],
                    "source": url,
                }
            )
        time.sleep(0.25)

    bird_month_urls = get_monokotoba_month_urls()
    for month in range(1, 13):
        url = bird_month_urls.get(month)
        if not url:
            continue
        html = fetch(url)
        items = parse_monokotoba_month(html, month)
        for entry in items:
            date_key = f"{month:02d}-{entry['day']:02d}"
            dates[date_key]["bird"].append(
                {
                    "name": entry["name"],
                    "meaning": entry["meaning"],
                    "source": "",
                }
            )
        time.sleep(0.25)

    for month in range(1, 13):
        fish_html = fetch(FISH_MONTH_URL.format(month=month))
        fish_items = parse_aqsakana_month(fish_html, month)
        for entry in fish_items:
            date_key = f"{month:02d}-{entry['day']:02d}"
            dates[date_key]["fish"].append(
                {
                    "name": entry["name"],
                    "meaning": entry["meaning"],
                    "source": "",
                }
            )
        time.sleep(0.25)

    monthly_birthstones = {}
    for month in range(1, 13):
        slug = BIRTHSTONE_MONTH_SLUGS[month - 1]
        url = f"{BIRTHSTONE_BASE}/{slug}.html"
        html = fetch(url)
        items = parse_birthstone_month(html)
        if items:
            monthly_birthstones[month] = {
                "items": items,
                "source": url,
            }
        time.sleep(0.25)

    for month, payload in monthly_birthstones.items():
        for day in range(1, DAYS_IN_MONTH[month - 1] + 1):
            date_key = f"{month:02d}-{day:02d}"
            for item in payload["items"]:
                dates[date_key]["stone_monthly"].append(
                    {
                        "name": item["name"],
                        "meaning": item["meaning"],
                        "source": payload["source"],
                    }
                )

    payload = {
        "meta": {
            "locale": "ja-JP",
            "updated": date.today().isoformat(),
            "note": "Generated from andplants.jp, oiwai-item.com, monokotoba.com, aqsakana.com, and birthstone.jp.",
        },
        "dates": dates,
    }

    OUT_PATH.write_text(
        json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8"
    )
    print("Saved", OUT_PATH)


if __name__ == "__main__":
    main()
