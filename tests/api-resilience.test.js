const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const apiSource = fs.readFileSync(path.join(__dirname, '../js/api.js'), 'utf8');

function createApiContext(fetchMock) {
  const context = vm.createContext({
    fetch: fetchMock,
    AbortController,
    URLSearchParams,
    setTimeout,
    clearTimeout,
    TypeError,
    Error
  });
  vm.runInContext(apiSource, context);
  return context;
}

test('requestJson retries a temporary provider error once and then succeeds', async () => {
  let calls = 0;
  const context = createApiContext(async () => {
    calls += 1;
    if (calls === 1) return { ok: false, status: 503 };
    return { ok: true, status: 200, json: async () => ({ temp: 21 }) };
  });
  const result = await context.requestJson('https://weather.test/weather', 'Не удалось загрузить');
  assert.equal(calls, 2);
  assert.equal(result.temp, 21);
});

test('requestJson does not retry a rate limit response', async () => {
  let calls = 0;
  const context = createApiContext(async () => { calls += 1; return { ok: false, status: 429 }; });
  await assert.rejects(() => context.requestJson('https://weather.test/weather', 'Не удалось загрузить'), /Слишком много запросов/);
  assert.equal(calls, 1);
});

test('requestJson retries a temporary network failure once', async () => {
  let calls = 0;
  const context = createApiContext(async () => {
    calls += 1;
    if (calls === 1) throw new TypeError('Network unavailable');
    return { ok: true, status: 200, json: async () => ({ city: 'Frankfurt' }) };
  });
  const result = await context.requestJson('https://weather.test/weather', 'Не удалось загрузить');
  assert.equal(calls, 2);
  assert.equal(result.city, 'Frankfurt');
});

test('forecast UI clears stale content, exposes retry and keeps retry scoped to selected city', () => {
  const uiSource = fs.readFileSync(path.join(__dirname, '../js/ui.js'), 'utf8');
  assert.match(uiSource, /currentForecastCity = city;/);
  assert.match(uiSource, /container\.dataset\.state = 'loading';/);
  assert.match(uiSource, /forecastContainer\.dataset\.state = 'error';/);
  assert.match(uiSource, /retry\.addEventListener\('click', retryForecast\);/);
  assert.match(uiSource, /function retryForecast\(\)\s*\{\s*if \(currentForecastCity\) loadForecast\(currentForecastCity\);/);
});

test('city loading surfaces the actual API error instead of always reporting city not found', () => {
  const appSource = fs.readFileSync(path.join(__dirname, '../js/app.js'), 'utf8');
  assert.match(appSource, /catch \(error\)[\s\S]*?error\.message[\s\S]*?showToast\(message, 'danger'\)/);
});

test('failed city refresh marks retained weather as stale instead of presenting it as current', () => {
  const appSource = fs.readFileSync(path.join(__dirname, '../js/app.js'), 'utf8');
  const uiSource = fs.readFileSync(path.join(__dirname, '../js/ui.js'), 'utf8');
  assert.match(uiSource, /let currentWeatherCityName = '';/);
  assert.match(uiSource, /currentWeatherCityName = data\.name \|\| '';/);
  assert.match(uiSource, /weatherHero\.dataset\.loadState = 'ready';/);
  assert.match(appSource, /hero\.dataset\.loadState = hasPreviousWeather \? 'stale' : 'error';/);
  assert.match(appSource, /Не удалось обновить · показаны последние успешные данные/);
});


test('offline mode shows a status banner and disables retry until connection returns', () => {
  const appSource = fs.readFileSync(path.join(__dirname, '../js/app.js'), 'utf8');
  const listeners = {};
  const banner = {
    hidden: true,
    classes: new Set(),
    classList: {
      add(name) { banner.classes.add(name); },
      remove(name) { banner.classes.delete(name); }
    }
  };
  const message = { textContent: '' };
  const retryButton = { disabled: false, addEventListener(type, callback) { this.callback = callback; } };
  const elements = {
    'network-status': banner,
    'network-status-message': message,
    'network-retry-btn': retryButton
  };
  const context = vm.createContext({
    document: {
      addEventListener() {},
      getElementById(id) { return elements[id] || null; },
      body: { dataset: {} }
    },
    window: { addEventListener(type, callback) { listeners[type] = callback; } },
    navigator: { onLine: false },
    currentWeatherCityName: 'Berlin',
    loadCityWeather(city) { context.refreshedCity = city; },
    initApp() { context.initializedAgain = true; }
  });

  vm.runInContext(appSource, context);
  context.setupNetworkStatus();
  assert.equal(banner.hidden, false);
  assert.equal(retryButton.disabled, true);
  assert.match(message.textContent, /Нет подключения/);
  assert.equal(context.document.body.dataset.network, 'offline');

  listeners.online();
  assert.equal(retryButton.disabled, false);
  assert.equal(context.refreshedCity, 'Berlin');
  assert.match(message.textContent, /Подключение восстановлено/);
  assert.equal(context.document.body.dataset.network, 'online');

  listeners.offline();
  assert.equal(retryButton.disabled, true);
  assert.equal(context.document.body.dataset.network, 'offline');
});

test('manual network retry refuses to send requests while browser is offline', () => {
  const appSource = fs.readFileSync(path.join(__dirname, '../js/app.js'), 'utf8');
  const banner = { hidden: true, classList: { add() {}, remove() {} } };
  const message = { textContent: '' };
  const retryButton = { disabled: false, addEventListener(type, callback) { this.callback = callback; } };
  const elements = { 'network-status': banner, 'network-status-message': message, 'network-retry-btn': retryButton };
  const context = vm.createContext({
    document: { addEventListener() {}, getElementById(id) { return elements[id] || null; }, body: { dataset: {} } },
    window: { addEventListener() {} },
    navigator: { onLine: false },
    currentWeatherCityName: 'Berlin',
    loadCityWeather() { context.requested = true; },
    initApp() { context.requested = true; }
  });
  vm.runInContext(appSource, context);
  context.setupNetworkStatus();
  retryButton.callback();
  assert.equal(context.requested, undefined);
  assert.equal(banner.hidden, false);
  assert.match(message.textContent, /Нет подключения/);
});
