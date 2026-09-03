import re
from datetime import datetime

import httpx

from src.schema import Startup

# Community-maintained static mirror of YC's directory: one request, no key, no anti-bot.
_YC_ALL_URL = "https://yc-oss.github.io/api/companies/all.json"
USER_AGENT = "ISRA-Bot/0.1 (+https://github.com/prayagtushar/startupindex.git)"

_YEAR_RE = re.compile(r"\b(?:19|20)\d{2}\b")

def _founded_year(batch: str | None) -> int | None:
    """Parse the year out of a YC batch label like 'Winter 2015'."""
    if not batch:
        return None
    match = _YEAR_RE.search(batch)
    return int(match.group()) if match else None

def _tidy(text: str) -> str:
    """Repair spacing in self-submitted copy, which also stops FTS indexing "rewards&flexible"."""
    text = re.sub(r"(?<=\w)&(?=\w)", " & ", text)
    return re.sub(r"[ \t]{2,}", " ", text).strip()

def build_startup(company: dict) -> Startup:
    """Map one yc-oss company record onto the Startup model."""
    name = (company.get("name") or "").strip()
    slug = company.get("slug")

    description = _tidy(company.get("long_description") or company.get("one_liner") or "")
    if len(description) < 5:
        industries = company.get("industries") or ["technology"]
        batch = company.get("batch") or "an unknown batch"
        description = (
            f"{name} is an Indian startup backed by Y Combinator ({batch}), "
            f"operating in {', '.join(industries)}."
        )

    source_url = (
        f"https://www.ycombinator.com/companies/{slug}"
        if slug
        else (company.get("website") or "https://www.ycombinator.com/companies")
    )

    return Startup(
        name=name,
        normalized_name=name,                       # schema normalizes to lowercase alphanumerics
        one_liner=_tidy(company.get("one_liner") or "") or None,
        source_url=source_url,
        description=description,
        founders=["Unknown"],                       # yc-oss records carry no founder names
        founded_year=_founded_year(company.get("batch")),
        headquarters=company.get("all_locations") or None,
        sectors=company.get("industries") or [],
        tags=company.get("tags") or [],
        scraped_date=datetime.now(),
    )

def _is_india(company: dict) -> bool:
    return "India" in (company.get("regions") or [])

def scrape_yc_startups(limit: int | None = 50) -> list[Startup]:
    """Indian YC companies mapped to the Startup model, notable-first, in one HTTP request."""
    with httpx.Client(timeout=60, headers={"User-Agent": USER_AGENT}, follow_redirects=True) as client:
        resp = client.get(_YC_ALL_URL)
        resp.raise_for_status()
        companies = resp.json()

    india = [c for c in companies if _is_india(c)]
    india.sort(
        key=lambda c: (bool(c.get("top_company")), c.get("team_size") or 0),
        reverse=True,
    )
    if limit is not None:
        india = india[:limit]

    startups: list[Startup] = []
    for company in india:
        if not (company.get("name") or "").strip():
            continue
        try:
            startups.append(build_startup(company))
        except Exception as exc:
            print(f"skip YC {company.get('name')}: {exc}")
    return startups
