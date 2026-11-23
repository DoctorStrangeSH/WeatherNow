import test from 'node:test';
import assert from 'node:assert/strict';
import worker from '../src/index.mjs';

const allowedOrigin = 'https://doctorstrangesh.github.io';
const env = {
  OPENWEATHER_API_KEY: 'test-secret-only',
  ALLOWED_ORIGINS: allowedOrigin
};

function request(path, options = {}) {
  return new Request(`https://weather-worker.test${path}`, {
    method: options.method || 'GET',
    headers: options.headers || { Origin: allowedOrigin }
  });
}

test('weather endpoint injects secret server-side and returns JSON', async () => {
  const originalFetch = globalThis.fetch;
  let upstreamUrl;

  globalThis.fetch = async url => {
    upstreamUrl = new URL(url);
    return new Response(JSON.stringify({ name: 'Berlin', main: { temp: 12 } }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });
  };

  try {
    const response = await worker.fetch(request('/weather?q=Berlin'), env);
    const body = await response.json();

    assert.equal(response.status, 200);
    assert.equal(body.name, 'Berlin');
    assert.equal(upstreamUrl.pathname, '/data/2.5/weather');
    assert.equal(upstreamUrl.searchParams.get('appid'), env.OPENWEATHER_API_KEY);
    assert.equal(upstreamUrl.searchParams.get('units'), 'metric');
    assert.equal(upstreamUrl.searchParams.get('lang'), 'ru');
    assert.equal(response.headers.get('Access-Control-Allow-Origin'), allowedOrigin);
    assert.equal(JSON.stringify(body).includes(env.OPENWEATHER_API_KEY), false);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('forecast endpoint accepts the documented city query', async () => {
  const originalFetch = globalThis.fetch;
  let upstreamUrl;

  globalThis.fetch = async url => {
    upstreamUrl = new URL(url);
    return new Response(JSON.stringify({ list: [], city: { name: 'Berlin' } }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });
  };

  try {
    const response = await worker.fetch(request('/forecast?q=Berlin'), env);
    const body = await response.json();

    assert.equal(response.status, 200);
    assert.equal(body.city.name, 'Berlin');
    assert.equal(upstreamUrl.pathname, '/data/2.5/forecast');
    assert.equal(upstreamUrl.searchParams.get('q'), 'Berlin');
    assert.equal(upstreamUrl.searchParams.get('appid'), env.OPENWEATHER_API_KEY);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('geocoding endpoint accepts a bounded result count', async () => {
  const originalFetch = globalThis.fetch;
  let upstreamUrl;

  globalThis.fetch = async url => {
    upstreamUrl = new URL(url);
    return new Response('[]', { status: 200 });
  };

  try {
    const response = await worker.fetch(request('/direct?q=Berlin&limit=5'), env);
    assert.equal(response.status, 200);
    assert.equal(upstreamUrl.pathname, '/geo/1.0/direct');
    assert.equal(upstreamUrl.searchParams.get('q'), 'Berlin');
    assert.equal(upstreamUrl.searchParams.get('limit'), '5');
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('rate limiter rejects clients over the configured limit', async () => {
  const originalFetch = globalThis.fetch;
  let upstreamCalled = false;
  globalThis.fetch = async () => {
    upstreamCalled = true;
    return new Response(JSON.stringify({ name: 'Berlin' }), { status: 200 });
  };

  const limitedEnv = {
    ...env,
    WEATHER_RATE_LIMITER: {
      limit: async ({ key }) => {
        assert.equal(key, '203.0.113.10');
        return { success: false };
      }
    }
  };

  try {
    const response = await worker.fetch(new Request(
      'https://weather-worker.test/weather?q=Berlin',
      { headers: { Origin: allowedOrigin, 'CF-Connecting-IP': '203.0.113.10' } }
    ), limitedEnv);
    const body = await response.json();

    assert.equal(response.status, 429);
    assert.equal(response.headers.get('Retry-After'), '60');
    assert.equal(body.error, 'Слишком много запросов. Попробуйте позже');
    assert.equal(upstreamCalled, false);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('rate limiter failures fail closed without contacting upstream', async () => {
  const originalFetch = globalThis.fetch;
  let upstreamCalled = false;
  globalThis.fetch = async () => {
    upstreamCalled = true;
    return new Response('{}');
  };

  try {
    const response = await worker.fetch(request('/weather?q=Berlin'), {
      ...env,
      WEATHER_RATE_LIMITER: { limit: async () => { throw new Error('binding unavailable'); } }
    });
    assert.equal(response.status, 503);
    assert.equal(upstreamCalled, false);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('upstream requests have a bounded timeout', async () => {
  const originalFetch = globalThis.fetch;
  let timeoutSignal;

  globalThis.fetch = async (_url, options = {}) => {
    timeoutSignal = options.signal;
    return new Response(JSON.stringify({ name: 'Berlin' }), { status: 200 });
  };

  try {
    const response = await worker.fetch(request('/weather?q=Berlin'), env);
    assert.equal(response.status, 200);
    assert.ok(timeoutSignal instanceof AbortSignal);
    assert.equal(timeoutSignal.aborted, false);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('upstream timeout or network failure returns a safe 502 response', async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => {
    throw new DOMException('The operation was aborted', 'AbortError');
  };

  try {
    const response = await worker.fetch(request('/weather?q=Berlin'), env);
    const body = await response.json();
    assert.equal(response.status, 502);
    assert.equal(body.error, 'Weather provider is temporarily unavailable');
    assert.equal(JSON.stringify(body).includes(env.OPENWEATHER_API_KEY), false);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('invalid coordinates are rejected before calling upstream', async () => {
  const originalFetch = globalThis.fetch;
  let called = false;
  globalThis.fetch = async () => {
    called = true;
    return new Response('{}');
  };

  try {
    const response = await worker.fetch(request('/weather?lat=120&lon=10'), env);
    assert.equal(response.status, 400);
    assert.equal(called, false);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('unknown routes and methods are rejected', async () => {
  const unknown = await worker.fetch(request('/admin'), env);
  const method = await worker.fetch(request('/weather?q=Berlin', { method: 'POST' }), env);

  assert.equal(unknown.status, 404);
  assert.equal(method.status, 405);
  assert.equal(method.headers.get('Allow'), 'GET, OPTIONS');
});

test('unapproved origins are rejected', async () => {
  const response = await worker.fetch(request('/weather?q=Berlin', {
    headers: { Origin: 'https://evil.example' }
  }), env);

  assert.equal(response.status, 403);
  assert.equal(response.headers.get('Access-Control-Allow-Origin'), null);
});

test('missing server secret produces a configuration error', async () => {
  const response = await worker.fetch(request('/weather?q=Berlin'), {
    ALLOWED_ORIGINS: allowedOrigin
  });

  assert.equal(response.status, 503);
});

test('preflight responds only with the configured origin', async () => {
  const response = await worker.fetch(request('/weather', { method: 'OPTIONS' }), env);

  assert.equal(response.status, 204);
  assert.equal(response.headers.get('Access-Control-Allow-Origin'), allowedOrigin);
  assert.equal(response.headers.get('Access-Control-Allow-Methods'), 'GET, OPTIONS');
});


test('repeated and unexpected query parameters are rejected', async () => {
  const originalFetch = globalThis.fetch;
  let called = false;
  globalThis.fetch = async () => {
    called = true;
    return new Response('{}');
  };

  try {
    const repeatedCity = await worker.fetch(request('/weather?q=Berlin&q=Paris'), env);
    const unexpected = await worker.fetch(request('/forecast?q=Berlin&appid=client-value'), env);

    assert.equal(repeatedCity.status, 400);
    assert.equal(unexpected.status, 400);
    assert.equal(called, false);
  } finally {
    globalThis.fetch = originalFetch;
  }
});


test('weather endpoint ignores UTM tracking parameters added to shared links', async () => {
  const originalFetch = globalThis.fetch;
  let upstreamUrl;

  globalThis.fetch = async url => {
    upstreamUrl = new URL(url);
    return new Response(JSON.stringify({ name: 'Berlin', cod: 200 }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });
  };

  try {
    const response = await worker.fetch(
      request('/weather?q=Berlin&utm_source=chatgpt.com&utm_campaign=weather-now'),
      env
    );
    const body = await response.json();

    assert.equal(response.status, 200);
    assert.equal(body.name, 'Berlin');
    assert.equal(upstreamUrl.searchParams.get('q'), 'Berlin');
    assert.equal(upstreamUrl.searchParams.has('utm_source'), false);
    assert.equal(upstreamUrl.searchParams.has('utm_campaign'), false);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('unknown non-tracking parameters are still rejected', async () => {
  const originalFetch = globalThis.fetch;
  let called = false;
  globalThis.fetch = async () => {
    called = true;
    return new Response('{}');
  };

  try {
    const response = await worker.fetch(
      request('/weather?q=Berlin&unexpected=value'),
      env
    );

    assert.equal(response.status, 400);
    assert.equal(called, false);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
