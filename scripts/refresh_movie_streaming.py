#!/usr/bin/env python3

import json
import os
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
from datetime import datetime, timezone


NOTION_API_VERSION = "2025-09-03"
DATA_SOURCE_ID = "97c3a6a0-6721-41cf-a65d-4fa8e188b771"
DATABASE_ID = "9414bc4b-671f-469d-b092-cda95911ed2f"
DEFAULT_REGION = "US"
NOTION_KEY_PATH = os.path.expanduser("~/.config/notion/api_key")
TMDB_TOKEN_PATH = os.path.expanduser("~/.config/tmdb/read_access_token")

STREAMING_PROVIDER_MAP = {
    "Netflix": "Netflix",
    "Amazon Prime Video": "Prime Video",
    "Amazon Prime Video with Ads": "Prime Video",
    "Disney Plus": "Disney+",
    "Hulu": "Hulu",
    "Apple TV Plus": "Apple TV+",
    "Max": "Max",
    "HBO Max": "Max",
    "Paramount Plus": "Paramount+",
    "Paramount+ Amazon Channel": "Paramount+",
    "Paramount Plus Apple TV Channel": "Paramount+",
    "Peacock Premium": "Peacock",
    "Peacock Premium Plus": "Peacock",
}

STREAMING_OPTION_ORDER = [
    "Netflix",
    "Prime Video",
    "Disney+",
    "Hulu",
    "Apple TV+",
    "Max",
    "Paramount+",
    "Peacock",
]


def read_secret(env_name: str, path: str) -> str | None:
    value = os.environ.get(env_name)
    if value:
        return value.strip()
    if os.path.exists(path):
        with open(path, "r", encoding="utf-8") as handle:
            return handle.read().strip()
    return None


def http_json(method: str, url: str, headers: dict[str, str], body: dict | None = None) -> dict:
    data = None
    req_headers = dict(headers)
    if body is not None:
        data = json.dumps(body).encode("utf-8")
        req_headers["Content-Type"] = "application/json"
    request = urllib.request.Request(url, data=data, headers=req_headers, method=method)
    try:
        with urllib.request.urlopen(request, timeout=30) as response:
            return json.loads(response.read().decode("utf-8"))
    except urllib.error.HTTPError as exc:
        payload = exc.read().decode("utf-8", errors="replace")
        raise RuntimeError(f"{method} {url} failed with {exc.code}: {payload}") from exc


def notion_headers(notion_key: str) -> dict[str, str]:
    return {
        "Authorization": f"Bearer {notion_key}",
        "Notion-Version": NOTION_API_VERSION,
    }


def tmdb_headers(tmdb_token: str) -> dict[str, str]:
    return {
        "Authorization": f"Bearer {tmdb_token}",
        "accept": "application/json",
    }


def query_all_movies(notion_key: str) -> list[dict]:
    results: list[dict] = []
    next_cursor = None
    while True:
        body = {"page_size": 100}
        if next_cursor:
            body["start_cursor"] = next_cursor
        payload = http_json(
            "POST",
            f"https://api.notion.com/v1/data_sources/{DATA_SOURCE_ID}/query",
            notion_headers(notion_key),
            body,
        )
        results.extend(payload.get("results", []))
        next_cursor = payload.get("next_cursor")
        if not payload.get("has_more"):
            break
    return results


def title_from_page(page: dict) -> str | None:
    title_items = page["properties"]["Name"]["title"]
    if title_items:
        return title_items[0].get("plain_text")
    copy_items = page["properties"].get("Name Copy", {}).get("rich_text", [])
    if copy_items:
        return copy_items[0].get("plain_text")
    return None


def year_from_page(page: dict) -> int | None:
    return page["properties"].get("Year", {}).get("number")


def tmdb_id_from_page(page: dict) -> int | None:
    return page["properties"].get("TMDb ID", {}).get("number")


def search_tmdb_movie(tmdb_token: str, title: str, year: int | None) -> int | None:
    params = {
        "query": title,
        "include_adult": "false",
    }
    if year:
        params["year"] = str(int(year))
    url = "https://api.themoviedb.org/3/search/movie?" + urllib.parse.urlencode(params)
    payload = http_json("GET", url, tmdb_headers(tmdb_token))
    results = payload.get("results", [])
    if not results:
        return None

    normalized_title = title.strip().lower()
    for item in results:
        item_title = (item.get("title") or "").strip().lower()
        release_date = item.get("release_date") or ""
        release_year = int(release_date[:4]) if len(release_date) >= 4 and release_date[:4].isdigit() else None
        if item_title == normalized_title and (year is None or release_year == int(year)):
            return item.get("id")

    if year is not None:
        for item in results:
            release_date = item.get("release_date") or ""
            release_year = int(release_date[:4]) if len(release_date) >= 4 and release_date[:4].isdigit() else None
            if release_year == int(year):
                return item.get("id")

    return results[0].get("id")


def get_streaming_on(tmdb_token: str, tmdb_id: int, region: str) -> list[str]:
    url = f"https://api.themoviedb.org/3/movie/{tmdb_id}/watch/providers"
    payload = http_json("GET", url, tmdb_headers(tmdb_token))
    region_info = payload.get("results", {}).get(region, {})
    providers = region_info.get("flatrate", []) or []
    resolved = {
        STREAMING_PROVIDER_MAP[provider["provider_name"]]
        for provider in providers
        if provider.get("provider_name") in STREAMING_PROVIDER_MAP
    }
    return [name for name in STREAMING_OPTION_ORDER if name in resolved]


def get_movie_runtime(tmdb_token: str, tmdb_id: int) -> int | None:
    url = f"https://api.themoviedb.org/3/movie/{tmdb_id}"
    payload = http_json("GET", url, tmdb_headers(tmdb_token))
    runtime = payload.get("runtime")
    if runtime in (None, 0):
        return None
    return int(runtime)


def update_page(
    notion_key: str,
    page_id: str,
    streaming_on: list[str],
    streaming_status: str,
    tmdb_id: int | None,
    running_time: int | None,
) -> None:
    now_iso = datetime.now(timezone.utc).replace(microsecond=0).isoformat()
    properties = {
        "Streaming On": {"multi_select": [{"name": name} for name in streaming_on]},
        "Streaming Status": {"select": {"name": streaming_status}},
        "Last Streaming Refresh": {"date": {"start": now_iso}},
    }
    if tmdb_id is not None:
        properties["TMDb ID"] = {"number": tmdb_id}
    if running_time is not None:
        properties["Running Time"] = {"number": running_time}
    http_json(
        "PATCH",
        f"https://api.notion.com/v1/pages/{page_id}",
        notion_headers(notion_key),
        {"properties": properties},
    )


def main() -> int:
    notion_key = read_secret("NOTION_KEY", NOTION_KEY_PATH)
    tmdb_token = read_secret("TMDB_READ_ACCESS_TOKEN", TMDB_TOKEN_PATH)

    if not notion_key:
        print("Missing Notion key at ~/.config/notion/api_key or NOTION_KEY", file=sys.stderr)
        return 1
    if not tmdb_token:
        print(
            "Missing TMDb token. Set TMDB_READ_ACCESS_TOKEN or write ~/.config/tmdb/read_access_token",
            file=sys.stderr,
        )
        return 2

    pages = query_all_movies(notion_key)
    refreshed = 0
    skipped_blank = 0
    unresolved = []
    missing_runtime = []

    for page in pages:
        title = title_from_page(page)
        if not title:
            skipped_blank += 1
            continue

        year = year_from_page(page)
        tmdb_id = tmdb_id_from_page(page)
        if tmdb_id is None:
            tmdb_id = search_tmdb_movie(tmdb_token, title, year)

        if tmdb_id is None:
            update_page(notion_key, page["id"], [], "⚪ Unknown", None, None)
            unresolved.append(title)
            refreshed += 1
            time.sleep(0.15)
            continue

        streaming_on = get_streaming_on(tmdb_token, int(tmdb_id), DEFAULT_REGION)
        running_time = get_movie_runtime(tmdb_token, int(tmdb_id))
        status = "🟢 Streamable" if streaming_on else "🔴 Not streaming"
        update_page(notion_key, page["id"], streaming_on, status, int(tmdb_id), running_time)
        if running_time is None:
            missing_runtime.append(title)
        refreshed += 1
        time.sleep(0.15)

    summary = {
        "database_id": DATABASE_ID,
        "data_source_id": DATA_SOURCE_ID,
        "region": DEFAULT_REGION,
        "refreshed": refreshed,
        "skipped_blank": skipped_blank,
        "unresolved": unresolved,
        "missing_runtime": missing_runtime,
    }
    print(json.dumps(summary, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
