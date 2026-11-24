const API_BASE = 'https://api.openweathermap.org';
const UPSTREAM_TIMEOUT_MS = 8000;
const DEFAULT_ORIGINS = [
  'https://doctorstrangesh.github.io',
  'http://localhost:5500',
  'http://127.0.0.1:5500',
  'http://localhost:8000',
  'http://127.0.0.1:8000'
];

const ROUTES = {
  '/weather': { path: '/data/2.5/weather', ttl: 60, validate: validateWeather },
  '/forecast': { path: '/data/2.5/forecast', ttl: 300, validate: validateForecast },
  '/direct': { path: '/geo/1.0/direct', ttl: 86400, validate: validateGeocoding }
};

function json(body, status = 200, headers = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff',
      ...headers
    }
  });
}

function allowedOrigins(env) {
  const configured = typeof env.ALLOWED_ORIGINS === 'string'
    ? env.ALLOWED_ORIGINS.split(',').map(value => value.trim()).filter(Boolean)
    : [];
  return new Set(configured.length ? configured : DEFAULT_ORIGINS);
}

function corsHeaders(origin, env) {
  const headers = { Vary: 'Origin' };
  if (origin && allowedOrigins(env).has(origin)) {
    headers['Access-Control-Allow-Origin'] = origin;
    headers['Access-Control-Allow-Methods'] = 'GET, OPTIONS';
    headers['Access-Control-Allow-Headers'] = 'Content-Type';
    headers['Access-Control-Max-Age'] = '86400';
  }
  return headers;
}

function validateCityQuery(params) {
  const query = params.get('q');
  if (params.getAll('q').length !== 1) {
    return { error: 'Параметр города должен быть указан один раз' };
  }
  if (!query || query.trim().length < 2 || query.length > 100) {
    return { error: 'Укажите название города (от 2 до 100 символов)' };
  }
  if ([...params.keys()].some(key => key !== 'q')) {
    return { error: 'Переданы неподдерживаемые параметры' };
  }
  return { params: { q: query.trim() } };
}

function validateWeather(params) {
  const keys = [...params.keys()];
  if (keys.some(key => !['q', 'lat', 'lon'].includes(key))) {
    return { error: 'Переданы неподдерживаемые параметры' };
  }

  const hasCity = params.has('q');
  const hasLat = params.has('lat');
  const hasLon = params.has('lon');

  if (['q', 'lat', 'lon'].some(key => params.getAll(key).length > 1)) {
    return { error: 'Параметры запроса не должны повторяться' };
  }
  if (hasCity && (hasLat || hasLon)) {
    return { error: 'Используйте город или координаты, но не оба варианта' };
  }
  if (hasCity) return validateCityQuery(params);
  if (!hasLat || !hasLon) return { error: 'Нужен город или обе координаты' };

  const lat = Number(params.get('lat'));
  const lon = Number(params.get('lon'));
  if (!Number.isFinite(lat) || lat < -90 || lat > 90 ||
      !Number.isFinite(lon) || lon < -180 || lon > 180) {
    return { error: 'Некорректные координаты' };
  }
  return { params: { lat: String(lat), lon: String(lon) } };
}

function validateForecast(params) {
  return validateCityQuery(params);
}

function validateGeocoding(params) {
  if ([...params.keys()].some(key => !['q', 'limit'].includes(key))) {
    return { error: 'Переданы неподдерживаемые параметры' };
  }
  const query = params.get('q');
  if (params.getAll('q').length !== 1 || params.getAll('limit').length > 1) {
    return { error: 'Параметры запроса не должны повторяться' };
  }
  if (!query || query.trim().length < 2 || query.length > 100) {
    return { error: 'Укажите название города (от 2 до 100 символов)' };
  }
  const requestedLimit = params.has('limit') ? Number(params.get('limit')) : 5;
  if (!Number.isInteger(requestedLimit) || requestedLimit < 1 || requestedLimit > 5) {
    return { error: 'Количество результатов должно быть от 1 до 5' };
  }
  return { params: { q: query.trim(), limit: String(requestedLimit) } };
}

function withoutTrackingParams(params) {
  const cleaned = new URLSearchParams(params);
  for (const key of [...cleaned.keys()]) {
    if (/^utm_[a-z0-9_]+$/i.test(key)) cleaned.delete(key);
  }
  return cleaned;
}

function cacheKey(url) {
  const keyUrl = new URL(url);
  keyUrl.searchParams.sort();
  return new Request(keyUrl.toString(), { method: 'GET' });
}

async function getCached(cache, key) {
  if (!cache || typeof cache.match !== 'function') return null;
  try {
    return await cache.match(key);
  } catch {
    return null;
  }
}

async function putCached(cache, key, response) {
  if (!cache || typeof cache.put !== 'function') return;
  try {
    await cache.put(key, response);
  } catch {
    // Cache is an optimization; an unavailable cache must not break weather data.
  }
}

export default {
  async fetch(request, env = {}, ctx = {}) {
    const url = new URL(request.url);
    const origin = request.headers.get('Origin');
    const cors = corsHeaders(origin, env);

    if (origin && !allowedOrigins(env).has(origin)) {
      return json({ error: 'Origin is not allowed' }, 403, { Vary: 'Origin' });
    }

    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: cors });
    }
    if (request.method !== 'GET') {
      return json({ error: 'Method not allowed' }, 405, { Allow: 'GET, OPTIONS', ...cors });
    }

    const route = ROUTES[url.pathname];
    if (!route) {
      return json({ error: 'Not found' }, 404, cors);
    }

    if (!env.OPENWEATHER_API_KEY || typeof env.OPENWEATHER_API_KEY !== 'string') {
      return json({ error: 'Weather service is not configured' }, 503, cors);
    }

    const validated = route.validate(withoutTrackingParams(url.searchParams));
    if (validated.error) return json({ error: validated.error }, 400, cors);

    if (env.WEATHER_RATE_LIMITER) {
      const clientIp = request.headers.get('CF-Connecting-IP') || 'unknown';
      try {
        const { success } = await env.WEATHER_RATE_LIMITER.limit({ key: clientIp });
        if (!success) {
          return json({ error: 'Слишком много запросов. Попробуйте позже' }, 429, {
            ...cors,
            'Retry-After': '60'
          });
        }
      } catch {
        return json({ error: 'Weather service is temporarily unavailable' }, 503, cors);
      }
    }

    const upstreamUrl = new URL(route.path, API_BASE);
    for (const [key, value] of Object.entries(validated.params)) {
      upstreamUrl.searchParams.set(key, value);
    }
    upstreamUrl.searchParams.set('appid', env.OPENWEATHER_API_KEY);
    upstreamUrl.searchParams.set('units', 'metric');
    upstreamUrl.searchParams.set('lang', 'ru');

    const key = cacheKey(`https://weather-cache.invalid${url.pathname}?${new URLSearchParams(validated.params)}`);
    const cache = typeof caches !== 'undefined' && caches.default ? caches.default : null;
    const cached = await getCached(cache, key);
    if (cached) {
      const headers = new Headers(cached.headers);
      for (const [name, value] of Object.entries(cors)) headers.set(name, value);
      return new Response(cached.body, { status: cached.status, headers });
    }

    try {
      const upstream = await fetch(upstreamUrl.toString(), {
        headers: { Accept: 'application/json' },
        signal: AbortSignal.timeout(UPSTREAM_TIMEOUT_MS),
        cf: { cacheTtl: route.ttl, cacheEverything: true }
      });
      if (!upstream.ok) {
        const status = upstream.status === 404 ? 404
          : upstream.status === 429 ? 429
          : upstream.status === 401 || upstream.status === 403 ? 502
          : 502;
        return json({
          error: status === 404 ? 'City or forecast not found'
            : status === 429 ? 'Weather provider rate limit reached'
            : 'Weather provider is temporarily unavailable'
        }, status, cors);
      }

      const data = await upstream.json();
      const response = json(data, 200, {
        ...cors,
        'Cache-Control': `public, max-age=${route.ttl}`
      });
      if (ctx && typeof ctx.waitUntil === 'function') {
        ctx.waitUntil(putCached(cache, key, response.clone()));
      } else {
        await putCached(cache, key, response.clone());
      }
      return response;
    } catch {
      return json({ error: 'Weather provider is temporarily unavailable' }, 502, cors);
    }
  }
};
