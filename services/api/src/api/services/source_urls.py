from urllib.parse import parse_qsl, urlencode, urlsplit

_TRACKING_PARAMS = {"fbclid", "igshid", "gclid", "ref"}


def _is_tracking_param(name: str) -> bool:
    lowered = name.lower()
    return lowered.startswith("utm_") or lowered in _TRACKING_PARAMS


def source_url_host(url: str) -> str:
    return (urlsplit(url.strip()).hostname or "").lower().removeprefix("www.")


def normalize_source_url(url: str) -> str:
    parts = urlsplit(url.strip())
    host = source_url_host(url)
    port = f":{parts.port}" if parts.port else ""
    query = sorted((name, value) for name, value in parse_qsl(parts.query, keep_blank_values=True) if not _is_tracking_param(name))
    query_string = f"?{urlencode(query)}" if query else ""
    return f"{parts.scheme.lower()}://{host}{port}{parts.path.rstrip('/')}{query_string}"
