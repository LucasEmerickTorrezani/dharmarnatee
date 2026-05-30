import os
import json
import logging
import unicodedata
from datetime import datetime, timezone, timedelta
from pathlib import Path

import requests
from flask import Flask, jsonify, request
from flask_cors import CORS
from dotenv import load_dotenv

load_dotenv()

app = Flask(__name__)
# CORS_ORIGINS: "*" para todos (dev) ou domínio específico em produção.
# Exemplo: CORS_ORIGINS=https://yourusername.github.io (defina no Vercel)
_cors_origins_env = os.getenv("CORS_ORIGINS", "*")
_cors_origins = (
    _cors_origins_env
    if _cors_origins_env == "*"
    else [o.strip() for o in _cors_origins_env.split(",")]
)
CORS(app, origins=_cors_origins)

BASE_DIR = Path(__file__).parent
CACHE_DIR = BASE_DIR / "cache"
LOCATIONS_FILE = BASE_DIR / "locations.json"

STORMGLASS_API_KEY = os.getenv("STORMGLASS_API_KEY", "")
# Clima, vento e ondas mudam com frequência → TTL curto (padrão: 1h)
WEATHER_MARINE_CACHE_TTL_HOURS = int(os.getenv("WEATHER_MARINE_CACHE_TTL_HOURS", "1"))
# Maré é previsível e muda pouco ao longo do dia → TTL longo (padrão: 24h)
TIDE_CACHE_TTL_HOURS = int(os.getenv("TIDE_CACHE_TTL_HOURS", "24"))
DEBUG_MODE = os.getenv("FLASK_ENV", "development") == "development"

# Cache backend — "file" (padrão, dev) ou "redis" (produção)
CACHE_BACKEND = os.getenv("CACHE_BACKEND", "file").lower()
UPSTASH_REDIS_URL = os.getenv("UPSTASH_REDIS_REST_URL", "").rstrip("/")
UPSTASH_REDIS_TOKEN = os.getenv("UPSTASH_REDIS_REST_TOKEN", "")

logging.basicConfig(
    level=logging.DEBUG if DEBUG_MODE else logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
)
logger = logging.getLogger(__name__)

# ─────────────────────────────────────────────────────────────────────────────
# Location helpers
# ─────────────────────────────────────────────────────────────────────────────

_locations_cache = None


def load_locations() -> dict:
    global _locations_cache
    if _locations_cache is None:
        with open(LOCATIONS_FILE, "r", encoding="utf-8") as f:
            _locations_cache = json.load(f)
    return _locations_cache


def normalize_text(text: str) -> str:
    """Lowercase, strip accents, replace underscores with spaces."""
    text = text.lower().replace("_", " ").strip()
    nfd = unicodedata.normalize("NFD", text)
    return "".join(c for c in nfd if unicodedata.category(c) != "Mn")


def search_location(query: str) -> list:
    """
    Search locations.json by id, name, or alias.
    Returns exact matches first, then partial matches.
    """
    locations = load_locations()
    q = normalize_text(query)

    exact_results = []
    partial_results = []
    seen_ids = set()

    for loc_id, loc in locations.items():
        norm_id = normalize_text(loc_id)
        norm_name = normalize_text(loc.get("name", ""))
        norm_aliases = [normalize_text(a) for a in loc.get("aliases", [])]

        if norm_id == q or norm_name == q or q in norm_aliases:
            if loc_id not in seen_ids:
                exact_results.append({**loc})
                seen_ids.add(loc_id)
        elif q in norm_id or q in norm_name or any(q in a for a in norm_aliases):
            if loc_id not in seen_ids:
                partial_results.append({**loc})
                seen_ids.add(loc_id)

    return exact_results + partial_results


def get_location_by_id(location_id: str):
    return load_locations().get(location_id)


# ─────────────────────────────────────────────────────────────────────────────
# Geocoding fallback (Open-Meteo — only for coordinate lookup, NOT weather)
# ─────────────────────────────────────────────────────────────────────────────

def geocode_with_open_meteo_fallback(query: str) -> list:
    """Use Open-Meteo Geocoding API only as coordinate fallback."""
    url = "https://geocoding-api.open-meteo.com/v1/search"
    try:
        resp = requests.get(
            url,
            params={"name": query, "count": 5, "language": "pt", "format": "json"},
            timeout=10,
        )
        resp.raise_for_status()
        data = resp.json()
        results = []
        for item in data.get("results", []):
            results.append({
                "id": f"geo_{item.get('id', '')}",
                "name": item.get("name", ""),
                "region": item.get("admin2", item.get("admin1", "")),
                "state": item.get("admin1", ""),
                "country": item.get("country", ""),
                "latitude": item.get("latitude"),
                "longitude": item.get("longitude"),
                "source": "open-meteo-geocoding",
            })
        return results
    except requests.exceptions.RequestException as e:
        logger.error(f"Geocoding fallback error: {e}")
        return []


# ─────────────────────────────────────────────────────────────────────────────
# Cache helpers
# ─────────────────────────────────────────────────────────────────────────────

def normalize_coordinates(lat: float, lng: float) -> tuple:
    """Round to 3 decimal places for cache key."""
    return round(lat, 3), round(lng, 3)


def get_cache_key(lat: float, lng: float, date_str: str, kind: str) -> str:
    """
    Build a filesystem/Redis-safe cache key.
    kind: "wm"   → weather + marine (clima, vento, ondas)
          "tide" → maré
    """
    lat_r, lng_r = normalize_coordinates(lat, lng)
    lat_s = f"{lat_r:.3f}".replace("-", "m").replace(".", "d")
    lng_s = f"{lng_r:.3f}".replace("-", "m").replace(".", "d")
    return f"dm_{lat_s}_{lng_s}_{date_str}_{kind}"


# ── File cache ────────────────────────────────────────────────────────────────

def _file_get_cached(cache_key: str):
    cache_file = CACHE_DIR / f"{cache_key}.json"
    if cache_file.exists():
        try:
            with open(cache_file, "r", encoding="utf-8") as f:
                return json.load(f)
        except Exception as e:
            logger.warning(f"File cache read error [{cache_key}]: {e}")
    return None


def _file_save_cached(cache_key: str, data: dict, ttl_hours: int) -> None:
    CACHE_DIR.mkdir(exist_ok=True)
    cache_file = CACHE_DIR / f"{cache_key}.json"
    record = {
        "savedAt": datetime.now(timezone.utc).isoformat(),
        "ttlHours": ttl_hours,
        "data": data,
    }
    try:
        with open(cache_file, "w", encoding="utf-8") as f:
            json.dump(record, f, ensure_ascii=False, indent=2)
        logger.debug(f"File cache SAVE: {cache_key}")
    except Exception as e:
        logger.warning(f"File cache write error [{cache_key}]: {e}")


# ── Redis cache (Upstash REST API) ────────────────────────────────────────────

def _redis_command(*args):
    """
    Execute a single Redis command via Upstash REST API.
    Sends: POST {UPSTASH_REDIS_URL}  body=["COMMAND", arg1, arg2, ...]
    Returns the "result" field from the JSON response.
    Raises RuntimeError for misconfiguration, requests exceptions for network errors.
    """
    if not UPSTASH_REDIS_URL or not UPSTASH_REDIS_TOKEN:
        raise RuntimeError(
            "CACHE_BACKEND=redis requer UPSTASH_REDIS_REST_URL e "
            "UPSTASH_REDIS_REST_TOKEN configurados no .env"
        )
    resp = requests.post(
        UPSTASH_REDIS_URL,
        json=list(args),
        headers={
            "Authorization": f"Bearer {UPSTASH_REDIS_TOKEN}",
            "Content-Type": "application/json",
        },
        timeout=10,
    )
    resp.raise_for_status()
    return resp.json().get("result")


def _redis_get_cached(cache_key: str):
    try:
        raw = _redis_command("GET", cache_key)
        if raw is None:
            logger.info(f"Redis cache MISS: {cache_key}")
            return None
        logger.info(f"Redis cache HIT: {cache_key}")
        return json.loads(raw)
    except RuntimeError as e:
        logger.error(f"Redis cache ERROR — configuração inválida: {e}")
        return None
    except Exception as e:
        logger.error(f"Redis cache ERROR (GET {cache_key}): {e}")
        return None


def _redis_save_cached(cache_key: str, data: dict, ttl_hours: int) -> None:
    record = {
        "savedAt": datetime.now(timezone.utc).isoformat(),
        "ttlHours": ttl_hours,
        "data": data,
    }
    ex_seconds = max(60, int(ttl_hours * 3600))
    try:
        _redis_command(
            "SET", cache_key,
            json.dumps(record, ensure_ascii=False),
            "EX", ex_seconds,
        )
        logger.info(f"Redis cache SAVE: {cache_key} (TTL {ttl_hours}h / {ex_seconds}s)")
    except RuntimeError as e:
        logger.error(f"Redis cache ERROR — configuração inválida: {e}")
    except Exception as e:
        logger.error(f"Redis cache ERROR (SET {cache_key}): {e}")


# ── Public cache API — dispatches to file or Redis ────────────────────────────

def get_cached_data(cache_key: str):
    """
    Fetch cached record by key.
    CACHE_BACKEND=file  → JSON file em backend/cache/
    CACHE_BACKEND=redis → Upstash Redis via REST API
    Returns the stored record dict (with keys "savedAt", "ttlHours", "data"),
    or None if not found.
    """
    if CACHE_BACKEND == "redis":
        return _redis_get_cached(cache_key)
    return _file_get_cached(cache_key)


def save_cached_data(cache_key: str, data: dict, ttl_hours: int = 24) -> None:
    """
    Persist data to cache with the given TTL.
    CACHE_BACKEND=file  → JSON file em backend/cache/
    CACHE_BACKEND=redis → Upstash Redis com expiração automática via EX
    """
    if CACHE_BACKEND == "redis":
        _redis_save_cached(cache_key, data, ttl_hours)
    else:
        _file_save_cached(cache_key, data, ttl_hours)


def is_cache_fresh(cached_record: dict) -> bool:
    """
    Determine if a cached record is still valid.
    - Redis: TTL nativo garante que chaves expiradas nunca são retornadas → sempre True
    - File: compara savedAt + ttlHours com o tempo atual
    """
    if CACHE_BACKEND == "redis":
        return True  # Redis TTL faz a expiração; se a chave existe, está fresca
    try:
        saved_at = datetime.fromisoformat(cached_record["savedAt"])
        ttl_hours = cached_record.get("ttlHours", 24)
        age = datetime.now(timezone.utc) - saved_at
        return age < timedelta(hours=ttl_hours)
    except Exception:
        return False


# ─────────────────────────────────────────────────────────────────────────────
# Direction and temperature helpers
# ─────────────────────────────────────────────────────────────────────────────

def degrees_to_direction_text(degrees) -> str | None:
    """Convert compass degrees to Portuguese direction name (8 points)."""
    if degrees is None:
        return None
    directions = ["Norte", "Nordeste", "Leste", "Sudeste", "Sul", "Sudoeste", "Oeste", "Noroeste"]
    return directions[round(float(degrees) / 45) % 8]


def calculate_apparent_temperature(temp_c, humidity) -> float | None:
    """
    Apparent temperature (heat index) via NOAA Rothfusz regression.
    Only meaningful when T > 27°C and RH > 40%; returns temp_c otherwise.
    """
    if temp_c is None or humidity is None:
        return None
    if temp_c < 27 or humidity < 40:
        return round(float(temp_c), 1)
    T = float(temp_c) * 9 / 5 + 32
    RH = float(humidity)
    HI = (
        -42.379 + 2.04901523 * T + 10.14333127 * RH
        - 0.22475541 * T * RH - 0.00683783 * T * T
        - 0.05481717 * RH * RH + 0.00122874 * T * T * RH
        + 0.00085282 * T * RH * RH - 0.00000199 * T * T * RH * RH
    )
    return round((HI - 32) * 5 / 9, 1)


# ─────────────────────────────────────────────────────────────────────────────
# Stormglass helpers
# ─────────────────────────────────────────────────────────────────────────────

def _sg_value(data_point, preferred_sources=None) -> float | None:
    """
    Extract a numeric value from a Stormglass hourly data point.
    Stormglass returns values keyed by source model, e.g. {"noaa": 5.1, "sg": 4.8}.
    """
    if not isinstance(data_point, dict):
        return None
    sources = list(preferred_sources or []) + [s for s in data_point.keys() if s not in (preferred_sources or [])]
    for src in sources:
        val = data_point.get(src)
        if val is not None and isinstance(val, (int, float)):
            return float(val)
    return None


def get_stormglass_weather_and_marine(lat: float, lng: float) -> dict:
    """
    Fetch weather and marine parameters from Stormglass /v2/weather/point.
    Wind speed is converted from m/s to knots (1 m/s = 1.94384 kn).

    If field names or sources differ from what is documented here, enable DEBUG
    logging to inspect the raw Stormglass response and adjust accordingly.
    """
    if not STORMGLASS_API_KEY:
        return {"error": "api_key_missing"}

    params_list = [
        "airTemperature", "humidity",
        "windSpeed", "windDirection", "gust",
        "waveHeight", "wavePeriod", "waveDirection",
    ]
    now = datetime.now(timezone.utc)
    url = "https://api.stormglass.io/v2/weather/point"
    req_params = {
        "lat": lat,
        "lng": lng,
        "params": ",".join(params_list),
        "start": now.isoformat(),
        "end": (now + timedelta(hours=2)).isoformat(),
    }
    headers = {"Authorization": STORMGLASS_API_KEY}

    try:
        resp = requests.get(url, params=req_params, headers=headers, timeout=20)
        logger.debug(f"[SG weather] status={resp.status_code} lat={lat} lng={lng}")

        if resp.status_code in (402, 429):
            return {"error": "quota_exceeded"}

        resp.raise_for_status()
        raw = resp.json()

        if DEBUG_MODE:
            logger.debug(f"[SG weather raw] {json.dumps(raw)[:1500]}")

        hours = raw.get("hours", [])
        if not hours:
            return {"error": "no_data"}

        h = hours[0]
        preferred = ["sg", "noaa", "icon", "meto", "meteo", "fcoo", "dwd"]

        wind_ms = _sg_value(h.get("windSpeed", {}), preferred)
        gust_ms = _sg_value(h.get("gust", {}), preferred)
        temp = _sg_value(h.get("airTemperature", {}), preferred)
        humidity = _sg_value(h.get("humidity", {}), preferred)

        return {
            "airTemperature": round(temp, 1) if temp is not None else None,
            "humidity": round(humidity) if humidity is not None else None,
            "windSpeed": round(wind_ms * 1.94384, 1) if wind_ms is not None else None,
            "windDirection": _sg_value(h.get("windDirection", {}), preferred),
            "gusts": round(gust_ms * 1.94384, 1) if gust_ms is not None else None,
            "waveHeight": _sg_value(h.get("waveHeight", {}), preferred),
            "wavePeriod": _sg_value(h.get("wavePeriod", {}), preferred),
            "waveDirection": _sg_value(h.get("waveDirection", {}), preferred),
            "updatedAt": h.get("time"),
        }

    except requests.exceptions.Timeout:
        return {"error": "timeout"}
    except requests.exceptions.RequestException as e:
        logger.error(f"[SG weather] request failed: {e}")
        return {"error": "request_failed"}


def get_stormglass_tide(lat: float, lng: float) -> dict:
    """
    Fetch next high/low tide events from Stormglass /v2/tide/extremes/point.
    The first extreme event in the sorted list determines current tide trend:
    - Next event = high → water is rising → "Subindo"
    - Next event = low  → water is falling → "Descendo"
    """
    if not STORMGLASS_API_KEY:
        return {"error": "api_key_missing"}

    now = datetime.now(timezone.utc)
    url = "https://api.stormglass.io/v2/tide/extremes/point"
    req_params = {
        "lat": lat,
        "lng": lng,
        "start": now.isoformat(),
        "end": (now + timedelta(hours=48)).isoformat(),
    }
    headers = {"Authorization": STORMGLASS_API_KEY}

    try:
        resp = requests.get(url, params=req_params, headers=headers, timeout=20)
        logger.debug(f"[SG tide] status={resp.status_code} lat={lat} lng={lng}")

        if resp.status_code in (402, 429):
            return {"error": "quota_exceeded"}

        resp.raise_for_status()
        raw = resp.json()

        if DEBUG_MODE:
            logger.debug(f"[SG tide raw] {json.dumps(raw)[:1000]}")

        extremes = raw.get("data", [])
        if not extremes:
            return {"error": "no_tide_data"}

        next_high = None
        next_low = None
        first_event_type = None

        for i, event in enumerate(extremes):
            event_type = event.get("type", "").lower()
            if i == 0:
                first_event_type = event_type

            try:
                event_time = datetime.fromisoformat(
                    event.get("time", "").replace("Z", "+00:00")
                )
            except Exception:
                continue

            h = event.get("height")
            height_val = round(float(h), 2) if h is not None else None

            if event_type == "high" and next_high is None:
                next_high = {"isoTime": event_time.isoformat(), "height": height_val}
            elif event_type == "low" and next_low is None:
                next_low = {"isoTime": event_time.isoformat(), "height": height_val}

            if next_high and next_low:
                break

        trend = None
        if first_event_type == "high":
            trend = "Subindo"
        elif first_event_type == "low":
            trend = "Descendo"

        return {"nextHigh": next_high, "nextLow": next_low, "trend": trend}

    except requests.exceptions.Timeout:
        return {"error": "timeout"}
    except requests.exceptions.RequestException as e:
        logger.error(f"[SG tide] request failed: {e}")
        return {"error": "request_failed"}


# ─────────────────────────────────────────────────────────────────────────────
# Response formatter
# ─────────────────────────────────────────────────────────────────────────────

def format_conditions_response(
    location_info: dict,
    marine_data: dict,
    tide_data: dict,
    marine_from_cache: bool,
    tide_from_cache: bool,
) -> dict:
    """Assemble the complete conditions response in the format expected by the frontend."""
    coord_source = location_info.get("coordinateSource", "desconhecido")

    temp = marine_data.get("airTemperature")
    humidity = marine_data.get("humidity")

    weather = {
        "temperature": temp,
        "feelsLike": calculate_apparent_temperature(temp, humidity),
        "humidity": humidity,
        # Stormglass does not provide a text weather condition label
        "condition": None,
    }

    wind_dir = marine_data.get("windDirection")
    wind = {
        "speed": marine_data.get("windSpeed"),
        "unit": "nós",
        "direction": round(float(wind_dir)) if wind_dir is not None else None,
        "directionText": degrees_to_direction_text(wind_dir),
        "gusts": marine_data.get("gusts"),
    }

    wave_dir = marine_data.get("waveDirection")
    wave_period = marine_data.get("wavePeriod")
    wave_height = marine_data.get("waveHeight")
    waves = {
        "height": round(float(wave_height), 2) if wave_height is not None else None,
        "period": round(float(wave_period)) if wave_period is not None else None,
        "direction": round(float(wave_dir)) if wave_dir is not None else None,
        "directionText": degrees_to_direction_text(wave_dir),
    }

    nh = tide_data.get("nextHigh")
    nl = tide_data.get("nextLow")
    tide = {
        "nextHigh": nh["isoTime"] if nh else None,
        "nextHighHeight": nh["height"] if nh else None,
        "nextLow": nl["isoTime"] if nl else None,
        "nextLowHeight": nl["height"] if nl else None,
        # Current tide level requires /v2/tide/sea-level/point (not yet implemented)
        "level": None,
        "trend": tide_data.get("trend"),
        "error": tide_data.get("error"),
    }

    updated_at = marine_data.get("updatedAt") or datetime.now(timezone.utc).isoformat()

    return {
        "location": {
            "id": location_info.get("id"),
            "name": location_info.get("name"),
            "region": location_info.get("region"),
            "state": location_info.get("state"),
            "country": location_info.get("country"),
            "latitude": location_info.get("latitude"),
            "longitude": location_info.get("longitude"),
            "coordinateSource": coord_source,
        },
        "weather": weather,
        "wind": wind,
        "waves": waves,
        "tide": tide,
        "source": {
            "provider": "Stormglass",
            "updatedAt": updated_at,
            "coordinates": f"{location_info.get('latitude')}, {location_info.get('longitude')}",
            "coordinateSource": coord_source,
            # Cache status por tipo de dado
            "weatherMarineFromCache": marine_from_cache,
            "tideFromCache": tide_from_cache,
            # True somente se ambos vieram do cache (útil para badge genérico no frontend)
            "fromCache": marine_from_cache and tide_from_cache,
            "marineDataError": marine_data.get("error"),
            "note": "Dados informativos/modelados. Não utilizar para navegação.",
        },
    }


# ─────────────────────────────────────────────────────────────────────────────
# API endpoints
# ─────────────────────────────────────────────────────────────────────────────

@app.route("/api/search-location")
def api_search_location():
    query = request.args.get("query", "").strip()
    if not query:
        return jsonify({"error": "Parâmetro 'query' é obrigatório."}), 400
    if len(query) < 2:
        return jsonify({"results": []})

    local_results = search_location(query)
    if local_results:
        formatted = [
            {
                "id": loc.get("id"),
                "name": loc.get("name"),
                "region": loc.get("region"),
                "state": loc.get("state"),
                "country": loc.get("country"),
                "latitude": loc.get("latitude"),
                "longitude": loc.get("longitude"),
                "source": "locations.json",
            }
            for loc in local_results
        ]
        return jsonify({"results": formatted})

    logger.info(f"Local search miss for '{query}' — using geocoding fallback")
    geo_results = geocode_with_open_meteo_fallback(query)
    return jsonify({"results": geo_results})


@app.route("/api/conditions")
def api_conditions():
    location_id = request.args.get("locationId")
    lat_param = request.args.get("lat")
    lng_param = request.args.get("lng")
    name_param = request.args.get("name", "Local desconhecido")

    if location_id:
        loc = get_location_by_id(location_id)
        if not loc:
            return jsonify({"error": f"Local '{location_id}' não encontrado."}), 404
        location_info = {**loc, "coordinateSource": "locations.json"}

    elif lat_param and lng_param:
        try:
            lat = float(lat_param)
            lng = float(lng_param)
        except ValueError:
            return jsonify({"error": "Coordenadas inválidas."}), 400
        location_info = {
            "id": None,
            "name": name_param,
            "region": None,
            "state": None,
            "country": None,
            "latitude": lat,
            "longitude": lng,
            "coordinateSource": "open-meteo-geocoding",
        }
    else:
        return jsonify({"error": "Informe 'locationId' ou coordenadas 'lat'+'lng'."}), 400

    lat = location_info["latitude"]
    lng = location_info["longitude"]
    today = datetime.now(timezone.utc).strftime("%Y-%m-%d")

    # ── Cache de weather/marine (clima, vento, ondas) ─────────────────────────
    wm_key = get_cache_key(lat, lng, today, "wm")
    wm_cached = get_cached_data(wm_key)

    if wm_cached and is_cache_fresh(wm_cached):
        logger.info(f"Weather/marine cache HIT: {wm_key}")
        marine_data = wm_cached["data"]
        marine_from_cache = True
    else:
        logger.info(f"Weather/marine cache MISS: {wm_key} — fetching from Stormglass")
        marine_data = get_stormglass_weather_and_marine(lat, lng)
        marine_from_cache = False
        if marine_data.get("error") == "quota_exceeded":
            return jsonify({
                "error": "quota_exceeded",
                "message": "Limite da API Stormglass atingido. Tente novamente mais tarde.",
            }), 429
        if not marine_data.get("error"):
            save_cached_data(wm_key, marine_data, ttl_hours=WEATHER_MARINE_CACHE_TTL_HOURS)

    # ── Cache de maré ─────────────────────────────────────────────────────────
    tide_key = get_cache_key(lat, lng, today, "tide")
    tide_cached = get_cached_data(tide_key)

    if tide_cached and is_cache_fresh(tide_cached):
        logger.info(f"Tide cache HIT: {tide_key}")
        tide_data = tide_cached["data"]
        tide_from_cache = True
    else:
        logger.info(f"Tide cache MISS: {tide_key} — fetching from Stormglass")
        tide_data = get_stormglass_tide(lat, lng)
        tide_from_cache = False
        if not tide_data.get("error"):
            save_cached_data(tide_key, tide_data, ttl_hours=TIDE_CACHE_TTL_HOURS)

    result = format_conditions_response(
        location_info, marine_data, tide_data, marine_from_cache, tide_from_cache
    )
    return jsonify(result)


@app.route("/api/health")
def api_health():
    cache_info = {"backend": CACHE_BACKEND}
    if CACHE_BACKEND == "redis":
        cache_info["redisUrlConfigured"] = bool(UPSTASH_REDIS_URL)
        cache_info["redisTokenConfigured"] = bool(UPSTASH_REDIS_TOKEN)
    else:
        cache_info["cacheDir"] = str(CACHE_DIR)
    return jsonify({
        "status": "ok",
        "apiKeyConfigured": bool(STORMGLASS_API_KEY),
        "cache": cache_info,
        "ttl": {
            "weatherMarineHours": WEATHER_MARINE_CACHE_TTL_HOURS,
            "tideHours": TIDE_CACHE_TTL_HOURS,
        },
    })


if __name__ == "__main__":
    if CACHE_BACKEND == "redis":
        if not UPSTASH_REDIS_URL or not UPSTASH_REDIS_TOKEN:
            raise RuntimeError(
                "CACHE_BACKEND=redis requer UPSTASH_REDIS_REST_URL e "
                "UPSTASH_REDIS_REST_TOKEN no arquivo .env"
            )
        logger.info(f"Cache backend: Redis (Upstash) — {UPSTASH_REDIS_URL[:40]}...")
    else:
        CACHE_DIR.mkdir(exist_ok=True)
        logger.info(f"Cache backend: arquivo local — {CACHE_DIR}")

    port = int(os.getenv("PORT", 5000))
    app.run(debug=DEBUG_MODE, host="0.0.0.0", port=port)
