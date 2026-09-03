import copy
import re
from dataclasses import dataclass, replace
from datetime import datetime
from typing import List

import httpx
from bs4 import BeautifulSoup

from src.schema import Startup
from src.sectors import normalize_sectors

USER_AGENT = "ISRA-Bot/0.1 {+https://github.com/prayagtushar/startupindex.git}"

_LIST_URL = "https://en.wikipedia.org/wiki/List_of_unicorn_startup_companies"

_NON_ALNUM = re.compile(r"[^a-z0-9]+")
# Footnotes and editorial markers, enumerated so a bracket a company wrote survives.
_CITATION = re.compile(
    r"\[\s*(?:\d+|[a-z]|note\s+\d+|update|citation needed|clarify|sic|"
    r"who\?|when\?|why\?|where\?|according to whom\?)\s*\]",
    re.IGNORECASE,
)
_SPLIT_RE = re.compile(r"[,;&]")

@dataclass(frozen=True)
class UnicornRecord:
    name: str
    slug: str | None = None
    valuation: float | None = None
    sectors: list[str] | None = None
    founders: list[str] | None = None

def _clean(value: str) -> str:
    value = _CITATION.sub("", value)
    value = re.sub(r"\s+", " ", value)
    value = re.sub(r"\s+,", ",", value)
    value = re.sub(r",\s+", ", ", value)
    return value.strip(" ,;")

def _split_multi(value: str) -> list[str]:
    parts = _SPLIT_RE.split(value)
    return [_clean(p) for p in parts if _clean(p)]

def _list_cell(cell) -> list[str]:
    """Read a multi-value cell however the page separates it: commas, <br>, or a <ul>."""
    cell = copy.copy(cell)
    for sup in cell.find_all("sup"):
        sup.decompose()
    return [value for value in _split_multi(cell.get_text(separator=", ")) if _has_letter(value)]

def _has_letter(value: str) -> bool:
    """Reject markup fragments: a sector name has a letter, punctuation and digits alone do not."""
    return any(char.isalpha() for char in value)

def _parse_valuation(value: str) -> float | None:
    value = _clean(value)
    match = re.search(r"[\d.]+", value)
    if not match:
        return None
    try:
        return float(match.group())
    except ValueError:
        return None

def _link_matches_name(name: str, slug: str, title: str) -> bool:
    """Trust a row's link only if the company and article names overlap."""
    def norm(value: str) -> str:
        return re.sub(r"[^a-z0-9]", "", value.lower())

    name_n = norm(name)
    for target in (norm(slug), norm(title)):
        if not target:
            continue
        if name_n in target or target in name_n:
            return True
        for token in re.split(r"[^a-z0-9]+", name.lower()):
            if len(token) >= 3 and token in target:
                return True
    return False

def resolve_slug(name: str, query_json: dict) -> str | None:
    """Find the article for a company whose row had no usable link. A matching title beats a redirect."""
    if not name.strip():
        return None

    query = query_json.get("query") or {}
    target = re.sub(r"[^a-z0-9]", "", name.lower())

    for page in (query.get("pages") or {}).values():
        if "missing" in page:
            continue
        # Wikipedia flags disambiguation pages itself, which beats guessing from the text.
        if "disambiguation" in (page.get("pageprops") or {}):
            continue
        title = page.get("title") or ""
        # Titles disambiguate with a parenthetical, which should not count against the match.
        bare = re.sub(r"\s*\([^)]*\)\s*$", "", title)
        candidate = re.sub(r"[^a-z0-9]", "", bare.lower())
        if candidate and (target in candidate or candidate in target):
            return title.replace(" ", "_")

    # No article carries this name. A redirect is the remaining evidence.
    redirects = {r.get("from"): r.get("to") for r in query.get("redirects") or []}
    if name in redirects:
        return str(redirects[name]).replace(" ", "_")
    return None

def parse_unicorn_table(html: str) -> list[UnicornRecord]:
    """Extract unicorn rows, keeping only tables shaped like the per-company list."""
    soup = BeautifulSoup(html, "lxml")
    records: list[UnicornRecord] = []

    for table in soup.find_all("table", {"class": "wikitable"}):
        rows = table.find_all("tr")
        if len(rows) < 2:
            continue

        for row in rows[1:]:
            cells = row.find_all(["td", "th"])
            if len(cells) < 6:
                continue

            country = _clean(cells[4].get_text())
            if "india" not in country.lower():
                continue

            name_cell = cells[0]
            link = name_cell.find("a")
            name = _clean(name_cell.get_text())
            if not name:
                continue
            slug = link["href"].split("/wiki/")[-1] if link and link.get("href") else None
            if slug and not _link_matches_name(name, slug, link.get("title", "")):
                slug = None

            valuation = _parse_valuation(cells[1].get_text())
            sectors = _list_cell(cells[3])
            founders = _list_cell(cells[5]) or ["Unknown"]

            records.append(UnicornRecord(name=name, slug=slug, valuation=valuation, sectors=sectors, founders=founders))

    return records

def parse_infobox(html: str) -> dict:
    soup = BeautifulSoup(html, "lxml")
    info = {}
    infobox = soup.find("table", {"class": "infobox"})
    if not infobox:
        return info

    for row in infobox.find_all("tr"):
        header = row.find("th")
        data = row.find("td")
        if not header or not data:
            continue

        key = header.get_text(strip=True).lower()
        value = _clean(data.get_text())

        if key == "industry":
            info["industry"] = _list_cell(data)
        elif key == "type of site" and "industry" not in info:
            # {{infobox website}} has no Industry row; "type of site" is its equivalent. Industry still wins.
            info["industry"] = _list_cell(data)
        elif key == "founded":
            match = re.search(r"\b(\d{4})\b", value)
            if match:
                info["founded_year"] = int(match.group(1))
        elif key in ("founder", "founders"):
            info["founders"] = _list_cell(data)
        elif key == "headquarters":
            # Scalar, and often "City, State, Country", so read it without the inserted separators.
            info["headquarters"] = value

    return info

def _extract_lead(html: str) -> str:
    soup = BeautifulSoup(html, "lxml")
    for tag in soup(["script", "style", "nav", "footer", "header", "table"]):
        tag.decompose()
    paragraphs = soup.find_all("p")
    for p in paragraphs:
        text = re.sub(r"\s+", " ", p.get_text())
        text = _clean(text)
        if text:
            return text
    return ""

def _stub_description(record: UnicornRecord, info: dict) -> str:
    """Describe a company from what its row and infobox knew, with no filler shared between stubs."""
    # Canonical spellings, so the prose matches the sector shown beside it.
    sectors = normalize_sectors(record.sectors or [])
    sentences = []

    opening = f"{record.name} is an Indian startup"
    if sectors:
        opening += f" in {_join(sectors)}"
    founded = info.get("founded_year")
    if founded:
        opening += f", founded in {founded}"
    sentences.append(opening + ".")

    if record.valuation:
        # The figure only: filler repeated across stubs cost measurable retrieval quality.
        sentences.append(f"It is valued at about US${record.valuation:g} billion.")

    founders = [f for f in (record.founders or info.get("founders") or []) if f != "Unknown"]
    if founders:
        sentences.append(f"{record.name} was founded by {_join(founders)}.")

    headquarters = info.get("headquarters")
    if headquarters:
        sentences.append(f"It is headquartered in {headquarters}.")

    return " ".join(sentences)

def _join(items: list[str]) -> str:
    """Comma-separate a list, with "and" before the last item."""
    if len(items) == 1:
        return items[0]
    return f"{', '.join(items[:-1])} and {items[-1]}"

def build_startup(record: UnicornRecord, article_html: str | None = None) -> Startup:
    now = datetime.now()
    info = parse_infobox(article_html) if article_html else {}

    description = _extract_lead(article_html) if article_html else ""
    if not description:
        description = _stub_description(record, info)

    source_url = f"https://en.wikipedia.org/wiki/{record.slug}" if record.slug else _LIST_URL

    return Startup(
        name=record.name,
        normalized_name=record.name,
        source_url=source_url,
        description=description,
        founders=info.get("founders", record.founders or ["Unknown"]),
        sectors=info.get("industry", record.sectors or []),
        founded_year=info.get("founded_year"),
        headquarters=info.get("headquarters"),
        fundings=record.valuation * 1_000_000_000 if record.valuation else None,
        scraped_date=now,
    )

def _fetch(url: str) -> str:
    with httpx.Client(headers={"User-Agent": USER_AGENT}, timeout=30) as client:
        r = client.get(url)
        r.raise_for_status()
        return r.text

def _lookup_slug(name: str) -> str | None:
    """Ask Wikipedia whether an article exists, querying the plain and "(company)" spellings."""
    params = {
        "action": "query",
        # pageprops carries the disambiguation flag.
        "prop": "info|pageprops",
        "titles": f"{name}|{name} (company)",
        "redirects": "1",
        "format": "json",
    }
    try:
        with httpx.Client(headers={"User-Agent": USER_AGENT}, timeout=30) as client:
            r = client.get("https://en.wikipedia.org/w/api.php", params=params)
            r.raise_for_status()
            return resolve_slug(name, r.json())
    except Exception as exc:
        print(f"article lookup failed for {name}: {exc}")
        return None

def _extract_text(html: str) -> str:
    soup = BeautifulSoup(html, "lxml")
    for tag in soup(["script", "style", "nav", "footer", "header"]):
        tag.decompose()
    return re.sub(r"\s+", " ", soup.get_text(separator=" ")).strip()

def scrape_wikipedia(startup_slug: str, startup_name: str) -> Startup:
    url = f"https://en.wikipedia.org/wiki/{startup_slug}"
    html = _fetch(url)
    text = _extract_text(html)
    description = " ".join(text.split()[:1000])

    return Startup(
        name=startup_name,
        normalized_name=startup_name,
        source_url=url,
        description=description,
        founders=["Unknown"],
        scraped_date=datetime.now(),
    )

def scrape_startups(limit: int | None = None, fetch_articles: bool = True) -> list[Startup]:
    """Scrape Indian unicorns from the Wikipedia list, richest valuations first."""
    records = parse_unicorn_table(_fetch(_LIST_URL))

    seen: set[str] = set()
    unique: list[UnicornRecord] = []
    for record in records:
        key = record.name.lower()
        if key and key not in seen:
            seen.add(key)
            unique.append(record)

    if limit is not None:
        unique = unique[:limit]

    startups: list[Startup] = []
    stubbed: list[str] = []
    for record in unique:
        # Look the title up before falling back to a stub; resolve_slug rejects a mismatch.
        slug = record.slug
        if fetch_articles and not slug:
            slug = _lookup_slug(record.name)
            if slug:
                record = replace(record, slug=slug)

        article_html = None
        if fetch_articles and slug:
            try:
                article_html = _fetch(f"https://en.wikipedia.org/wiki/{slug}")
            except Exception as exc:
                print(f"article fetch failed for {record.name}: {exc}")
        try:
            startup = build_startup(record, article_html)
            startups.append(startup)
            if not article_html:
                stubbed.append(record.name)
        except Exception as exc:
            print(f"skip {record.name}: {exc}")

    if stubbed:
        # Worth printing: each of these has only a generated stub to retrieve on.
        print(f"no article found for {len(stubbed)}/{len(unique)}: {', '.join(stubbed)}")

    return startups

# Well-known companies the unicorn list does not reliably yield.
NOTABLE_NAMES = [
    "Ola Electric",
    "Paytm",
    "PharmEasy",
    "Zomato",
    "Zepto",
    "Zerodha",
    "Swiggy",
    "Flipkart",
]

def seed_details() -> list[Startup]:
    """Scrape the companies the unicorn list misses. Names, not slugs, so a rename is followed."""
    result: list[Startup] = []
    for name in NOTABLE_NAMES:
        try:
            slug = _lookup_slug(name)
            if not slug:
                print(f"no article for {name}; leaving it to the unicorn list")
                continue
            article = _fetch(f"https://en.wikipedia.org/wiki/{slug}")
            result.append(build_startup(UnicornRecord(name=name, slug=slug), article))
        except Exception as exc:
            print(f"failed to scrape {name}: {exc}")
    return result
