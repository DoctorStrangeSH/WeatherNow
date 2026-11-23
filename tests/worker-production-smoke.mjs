import assert from 'node:assert/strict';

const BASE_URL = 'https://openweathermap-6310.sokrat3895.workers.dev';
const ALLOWED_ORIGIN = 'https://doctorstrangesh.github.io';
const BLOCKED_ORIGIN = 'https://example.com';

async function request(path, options = {}) {
  const response = await fetch(`${BASE_URL}${path}`, {
    ...options,
    signal: AbortSignal.timeout(20000)
  });
  return response;
}

async function retryableGet(path) {
  let lastResponse;
  for (let attempt = 0; attempt < 2; attempt += 1) {
    lastResponse = await request(path, { headers: { Accept: 'application/json' } });
    if (lastResponse.status < 500 && lastResponse.status !== 429) return lastResponse;
    if (attempt === 0) await new Promise(resolve => setTimeout(resolve, 1500));
  }
  return lastResponse;
}

const weatherResponse = await retryableGet('/weather?q=Berlin');
assert.equal(weatherResponse.status, 200, 'Production /weather endpoint must return HTTP 200');
const weather = await weatherResponse.json();
assert.ok(['berlin', 'берлин'].includes(String(weather.name).toLocaleLowerCase('ru-RU')));
assert.ok(Number.isFinite(weather.main?.temp), 'Current temperature must be numeric');
assert.ok(Number.isFinite(weather.coord?.lat) && Number.isFinite(weather.coord?.lon));
assert.ok(Array.isArray(weather.weather) && weather.weather.length > 0);

const forecastResponse = await retryableGet('/forecast?q=Berlin');
assert.equal(forecastResponse.status, 200, 'Production /forecast endpoint must return HTTP 200');
const forecast = await forecastResponse.json();
assert.ok(['berlin', 'берлин'].includes(String(forecast.city?.name).toLocaleLowerCase('ru-RU')));
assert.ok(Array.isArray(forecast.list) && forecast.list.length > 0);

const directResponse = await retryableGet('/direct?q=Berlin&limit=5');
assert.equal(directResponse.status, 200, 'Production /direct endpoint must return HTTP 200');
const cities = await directResponse.json();
assert.ok(Array.isArray(cities) && cities.length > 0);
assert.ok(cities.some(city => ['berlin', 'берлин'].includes(String(city.name).toLocaleLowerCase('ru-RU'))));

const preflight = await request('/weather?q=Berlin', {
  method: 'OPTIONS',
  headers: { Origin: ALLOWED_ORIGIN, 'Access-Control-Request-Method': 'GET' }
});
assert.equal(preflight.status, 204);
assert.equal(preflight.headers.get('access-control-allow-origin'), ALLOWED_ORIGIN);

const blockedOrigin = await request('/weather?q=Berlin', {
  headers: { Origin: BLOCKED_ORIGIN }
});
assert.equal(blockedOrigin.status, 403, 'Unapproved origins must be rejected');

const unsupportedMethod = await request('/weather?q=Berlin', {
  method: 'POST',
  headers: { Origin: ALLOWED_ORIGIN }
});
assert.equal(unsupportedMethod.status, 405);

const invalidQuery = await request('/weather?q=x');
assert.equal(invalidQuery.status, 400);

const unexpectedParameter = await request('/weather?q=Berlin&unexpected=value');
assert.equal(unexpectedParameter.status, 400);

console.log('Production Worker smoke passed: /weather, /forecast, /direct, CORS allow/deny, method and parameter validation.');
