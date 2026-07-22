# Odysseuss — SearXNG Integration Technical Documentation

## 1. Overview

Odysseus integrates **SearXNG** as its primary web search provider. SearXNG is a self-hosted, privacy-respecting metasearch engine. The integration supports both **JSON API** and **HTML scrape fallback** for maximum reliability.

### Key Features
- Self-hosted via Docker Compose (default `http://localhost:8080`)
- JSON API for structured results
- HTML parsing fallback when JSON API fails
- Multi-engine fallback strategy (general ? language-pinned ? default)
- Rate limiting and analytics
- Search query enhancement (entity extraction, time filters)
- Configurable via environment variables and admin settings

---

## 2. Architecture

### 2.1 Component Stack
```
docker-compose.yml ? searxng:8080 (service)
                          ?
           config/searxng/settings.yml (template)
                          ?
        services/search/ (Python search abstraction layer)
                          ?
        routes/search_routes.py (API endpoints)
                          ?
        src/deep_research.py (deep research engine)
```

### 2.2 Docker Configuration

**docker-compose.yml** (relevant section):
```yaml
searxng:
  image: docker.io/searxng/searxng:2026.5.31-7159b8aed
  ports:
    - "127.0.0.1:8080:8080"
  volumes:
    - searxng-data:/etc/searxng
    - ./config/searxng/settings.yml:/tmp/searxng-settings.yml.template:ro,z
  environment:
    - SEARXNG_BASE_URL=http://localhost:8080/
    - SEARXNG_SECRET=${SEARXNG_SECRET:-}
  healthcheck:
    test: ["CMD-SHELL", "python -c \"import urllib.request; urllib.request.urlopen('http://localhost:8080/', timeout=5).read(1)\""]
    interval: 5s
    timeout: 6s
    retries: 20
    start_period: 10s
```

### 2.3 Environment Variables

| Variable | Default | Purpose |
|----------|---------|---------|
| `SEARXNG_INSTANCE` | `http://localhost:8080` | SearXNG URL (overridden to `http://searxng:8080` in Docker) |
| `SEARXNG_SECRET` | auto-generated | CSRF secret for SearXNG |
| `SEARXNG_GENERAL_ENGINES` | `bing,mojeek,presearch` | Comma-separated engine list for general searches |

---

## 3. Search Service Layer

### 3.1 Module Structure
```
services/search/
+-- __init__.py          # Public API exports
+-- core.py              # Search orchestrators (comprehensive_web_search, searxng_search_results)
+-- providers.py         # Provider implementations (SearXNG JSON API + HTML fallback)
+-- query.py             # Query enhancement (entity extraction)
+-- analytics.py         # Rate limiting, error tracking, search stats
+-- cache.py             # Search result caching
+-- content.py           # Webpage content fetching/extraction
+-- ranking.py           # Result ranking
+-- service.py           # SearchService class
```

### 3.2 Data Flow

```
User Query ? search_routes.py
                  ?
        comprehensive_web_search() / _call_provider()
                  ?
        searxng_search_results() or direct searxng_search_api()
                  ?
        searxng_search_api() — JSON API attempt
                  ? (on failure)
        searxng_search() — HTML scrape fallback
                  ?
        Response: [{title, url, snippet}, ...]
```

### 3.3 Primary Search Function: `comprehensive_web_search()`

Located in `services/search/core.py`:

1. Gets search settings from app config
2. Determines active provider (default: `searxng`)
3. Delegates to provider-specific function:
   - `searxng`: `searxng_search_results()`
   - `brave`: `brave_search()`
   - `duckduckgo`: `duckduckgo_search()`
   - `google_pse`: `google_pse_search()`
4. Falls back to DuckDuckGo if SearXNG returns empty results

### 3.4 SearXNG JSON API: `searxng_search_api()`

Located in `services/search/providers.py`:

```python
def searxng_search_api(query, count=None, categories="general", time_filter=None):
```

**Parameters:**
- `query`: Search query string
- `count`: Number of results (default from settings)
- `categories`: "general" | "news"
- `time_filter`: "day" | "week" | "month" | "year" | None

**Query Parameters Sent to SearXNG:**
```python
params = {
    "q": query,
    "format": "json",
    "language": "en-US",
    "safesearch": "2",           # strict
    "categories": "general",     # or "news"
    "pageno": 1,
    "engines": "bing,mojeek,presearch",  # from SEARXNG_GENERAL_ENGINES
}
```

**Fallback Strategy (4 levels):**
1. **Primary**: Language-pinned (`en-US`) + pinned engines
2. **News fallback**: If news category returns 0 results ? retry with general engines
3. **Language fallback**: If 0 results ? retry without language pin
4. **Engine fallback**: If pinned engines return 0 ? retry with default engines

**Error Handling:**
- JSON parsing errors ? `logger.warning` + fallback to HTML scrape
- HTTP errors ? same fallback
- Timeout: `REQUEST_TIMEOUT` (configurable)

### 3.5 HTML Scrape Fallback: `searxng_search()`

```python
def searxng_search(query, max_results=10):
```

**Process:**
1. GET request to SearXNG instance with `q={query}` 
2. Parse HTML with BeautifulSoup
3. Extract results from `.result` elements:
   - Title from `h3 a`
   - URL from `a[href]`
   - Snippet from `.content`
4. Returns up to `max_results` results

**When triggered:**
- JSON API throws exception (network error, non-JSON response)
- JSON API returns empty after all fallbacks

---

## 4. Search Routes

### 4.1 Endpoints

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/api/search` | POST | Standalone web search (returns context string + sources) |
| `/api/search/config` | GET | Get search configuration |
| `/api/search/providers` | GET | List available providers with config status |
| `/api/search/query` | POST | Search with a specific provider (compare mode) |

### 4.2 Route Implementation (`routes/search_routes.py`)

**`POST /api/search`**: 
- Accepts JSON, FormData, or query params (flexible input handler)
- Parameters: `query`/`q`, `time_filter`
- Calls `comprehensive_web_search(query, return_sources=True)`
- Returns `{context, sources}`

**`POST /api/search/query`**:
- For compare mode — search with a specific provider
- Parameters: `query`/`q`, `provider`
- Calls `_call_provider(provider, query, ...)`
- Returns `{results, provider, time, error?}`

---

## 5. Deep Research Integration

### 5.1 Research Pipeline

The Deep Research engine (`src/deep_research.py`) uses an iterative Think?Search?Extract?Synthesize loop:

```
1. RESEARCH_PLAN_PROMPT ? Generate research plan
2. RESEARCH_QUERY_PROMPT ? Generate search queries (up to 4)
3. Web search (via comprehensive_web_search ? SearXNG)
4. Content extraction from search results
5. RESEARCH_UPDATE_PROMPT ? Update research report
6. RESEARCH_COMPLETE_PROMPT ? Check if comprehensive enough
7. RESEARCH_FINAL_PROMPT ? Write final report
8. Repeat steps 2-6 until complete or max rounds reached
```

### 5.2 Integration Point
Deep research calls the same search pipeline via `services.search.comprehensive_web_search()`, which defaults to SearXNG when configured as the primary provider.

---

## 6. Configuration

### 6.1 Admin Settings
Users can configure SearXNG URL via the admin UI. Settings are stored in the app database and override environment variables when set.

```python
def _get_search_instance():
    settings = _get_search_settings()
    url = settings.get("search_url") or ""
    if url:
        return url
    return SEARXNG_INSTANCE  # from env or default
```

### 6.2 Provider Info
```python
PROVIDER_INFO = {
    "searxng":      ("SearXNG",           False, True),   # (label, needs_api_key, needs_url)
    "brave":        ("Brave Search",      True,  False),
    "duckduckgo":   ("DuckDuckGo",        False, False),
    "google_pse":   ("Google PSE",        True,  False),
    "tavily":       ("Tavily",            True,  False),
    "serper":        ("Serper",           True,  False),
    "disabled":     ("Disabled",          False, False),
}
```

### 6.3 Safe Search Levels
```python
_safesearch_for("searxng") ? "2" (strict) | "1" (moderate) | "0" (off)
```

---

## 7. Settings Template

The SearXNG settings template is at `config/searxng/settings.yml`. On container startup:
1. If `settings.yml` doesn't exist or contains the old template marker, generate from template
2. Replace `__SEARXNG_SECRET__` with actual secret (from env or auto-generated)
3. Start SearXNG normally

---

## 8. Maintenance & Troubleshooting

### Restarting SearXNG
```bash
docker compose restart searxng
```

### Viewing Logs
```bash
docker compose logs searxng -f
```

### Common Issues
| Symptom | Likely Cause | Fix |
|---------|-------------|-----|
| Search returns 0 results | All engines unresponsive | Check SearXNG logs; verify engine config |
| JSON API fails, HTML fallback used | Network issue or JSON parse error | Check SearXNG instance health |
| "SearXNG unresponsive engines" | Individual engine timeouts | May be transient; retry or adjust timeouts |
| Search fails in Docker but works on host | Docker networking | Ensure `searxng` hostname resolves; check `depends_on` |

### Upgrading
The SearXNG image is pinned (`2026.5.31-7159b8aed`), not `:latest`. Bump deliberately after verifying the new tag boots clean to avoid healthcheck failures blocking app startup.

---

## 9. Security Considerations

- SearXNG instance is bound to `127.0.0.1:8080` in Docker (not exposed externally)
- No API key required for SearXNG (unlike Brave/Tavily/Google PSE)
- Safe search is set to "strict" by default
- User query sanitization prevents injection attacks
- Rate limiting is enforced at the search service level
