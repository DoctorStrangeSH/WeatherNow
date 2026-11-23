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
      querySelector() { return { dataset: {} }; },
      body: { dataset: {} }
    },
    window: { addEventListener(type, callback) { listeners[type] = callback; } },
    navigator: { onLine: false },
    currentWeatherCityName: 'Berlin',
    currentWeatherRequestId: 0,
    forecastRequestId: 0,
    fetchWeather(city) {
      context.refreshedCity = city;
      return Promise.resolve({ name: city, coord: { lat: 1, lon: 2 } });
    },
    renderCurrentWeather() {},
    updateRainMap() {},
    closeSearchResults() {},
    showToast() {},
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
    document: { addEventListener() {}, getElementById(id) { return elements[id] || null; }, querySelector() { return { dataset: {} }; }, body: { dataset: {} } },
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


test('last successful weather snapshot survives reload and rejects malformed cache data', () => {
  const storageSource = fs.readFileSync(path.join(__dirname, '../js/storage.js'), 'utf8');
  const values = new Map();
  const context = vm.createContext({
    localStorage: {
      getItem(key) { return values.get(key) ?? null; },
      setItem(key, value) { values.set(key, value); }
    },
    document: { addEventListener() {} },
    Date
  });
  vm.runInContext(storageSource, context);

  const weather = {
    name: 'Berlin',
    coord: { lat: 52.52, lon: 13.405 },
    main: { temp: 12, humidity: 70 },
    weather: [{ id: 800, description: 'ясно' }],
    sys: { country: 'DE' }
  };
  context.saveLastWeatherSnapshot(weather);
  const restored = context.getLastWeatherSnapshot();
  assert.equal(restored.data.name, 'Berlin');
  assert.equal(restored.data.main.temp, 12);
  assert.ok(Number.isFinite(Date.parse(restored.savedAt)));

  values.set('weathernow-last-weather', '{broken json');
  assert.equal(context.getLastWeatherSnapshot(), null);
});

test('offline startup restores the cached snapshot instead of starting a fresh geolocation request', () => {
  const appSource = fs.readFileSync(path.join(__dirname, '../js/app.js'), 'utf8');
  assert.match(appSource, /if \(navigator\.onLine === false && restoreCachedWeather\(\)\) return;/);
  assert.match(appSource, /renderCurrentWeather\(data, \{ cached: true, savedAt: snapshot\.savedAt, stale: snapshot\.stale \}\);/);
});


test('cached forecast is restored only for the matching city', () => {
  const storageSource = fs.readFileSync(path.join(__dirname, '../js/storage.js'), 'utf8');
  const values = new Map();
  const context = vm.createContext({
    localStorage: {
      getItem(key) { return values.get(key) ?? null; },
      setItem(key, value) { values.set(key, value); }
    },
    document: { addEventListener() {} },
    Date
  });
  vm.runInContext(storageSource, context);

  const forecast = {
    city: { name: 'Berlin', country: 'DE' },
    list: [{ dt: 1795435200, main: { temp: 8 }, weather: [{ description: 'облачно' }] }]
  };
  context.saveLastForecastSnapshot('Berlin', forecast);
  const restored = context.getLastForecastSnapshot('Berlin');
  assert.equal(restored.data.city.name, 'Berlin');
  assert.equal(restored.data.list.length, 1);
  assert.equal(context.getLastForecastSnapshot('Paris'), null);

  values.set('weathernow-last-forecast', '{invalid');
  assert.equal(context.getLastForecastSnapshot('Berlin'), null);
});


test('forecast cache keeps several recently viewed cities and evicts the oldest beyond its limit', () => {
  const storageSource = fs.readFileSync(path.join(__dirname, '../js/storage.js'), 'utf8');
  const values = new Map();
  const context = vm.createContext({
    localStorage: {
      getItem(key) { return values.get(key) ?? null; },
      setItem(key, value) { values.set(key, value); }
    },
    document: { addEventListener() {} },
    Date
  });
  vm.runInContext(storageSource, context);

  for (let index = 1; index <= 9; index += 1) {
    const city = `City ${index}`;
    context.saveLastForecastSnapshot(city, {
      city: { name: city },
      list: [{ dt: index, main: { temp: 10 }, weather: [{ id: 800, description: 'ясно' }] }]
    });
  }

  assert.equal(context.getLastForecastSnapshot('City 9').data.city.name, 'City 9');
  assert.equal(context.getLastForecastSnapshot('City 2').data.city.name, 'City 2');
  assert.equal(context.getLastForecastSnapshot('City 1'), null);
  assert.equal(context.getLastForecastSnapshot('City 9 ').data.city.name, 'City 9');

  context.saveLastForecastSnapshot('City 2', {
    city: { name: 'City 2' },
    list: [{ dt: 22, main: { temp: 10 }, weather: [{ id: 800, description: 'ясно' }] }]
  });
  assert.equal(context.getLastForecastSnapshot('City 2').data.list[0].dt, 22);
});


test('weather and forecast snapshots expose stale state after their freshness windows', () => {
  const storageSource = fs.readFileSync(path.join(__dirname, '../js/storage.js'), 'utf8');
  const values = new Map();
  const fixedNow = Date.parse('2026-11-23T12:00:00.000Z');
  class FixedDate extends Date {
    static now() { return fixedNow; }
  }
  const context = vm.createContext({
    localStorage: {
      getItem(key) { return values.get(key) ?? null; },
      setItem(key, value) { values.set(key, value); }
    },
    document: { addEventListener() {} },
    Date: FixedDate
  });
  vm.runInContext(storageSource, context);

  const weather = {
    name: 'Berlin',
    coord: { lat: 52.52, lon: 13.405 },
    main: { temp: 12 },
    weather: [{ id: 800, description: 'ясно' }]
  };
  context.saveLastWeatherSnapshot(weather);
  const freshWeather = context.getLastWeatherSnapshot();
  assert.equal(freshWeather.stale, false);

  const oldWeather = JSON.parse(values.get('weathernow-last-weather'));
  oldWeather.savedAt = new Date(fixedNow - 7 * 60 * 60 * 1000).toISOString();
  values.set('weathernow-last-weather', JSON.stringify(oldWeather));
  assert.equal(context.getLastWeatherSnapshot().stale, true);

  context.saveLastForecastSnapshot('Berlin', {
    city: { name: 'Berlin' },
    list: [{ dt: 1, main: { temp: 10 }, weather: [{ id: 800, description: 'ясно' }] }]
  });
  const freshForecast = context.getLastForecastSnapshot('Berlin');
  assert.equal(freshForecast.stale, false);

  const forecastCache = JSON.parse(values.get('weathernow-last-forecast'));
  forecastCache.cities.berlin.savedAt = new Date(fixedNow - 13 * 60 * 60 * 1000).toISOString();
  values.set('weathernow-last-forecast', JSON.stringify(forecastCache));
  assert.equal(context.getLastForecastSnapshot('Berlin').stale, true);
});

test('forecast cache refuses an oversized city payload without throwing or writing it', () => {
  const storageSource = fs.readFileSync(path.join(__dirname, '../js/storage.js'), 'utf8');
  const values = new Map();
  const context = vm.createContext({
    localStorage: {
      getItem(key) { return values.get(key) ?? null; },
      setItem(key, value) { values.set(key, value); }
    },
    document: { addEventListener() {} },
    Date
  });
  vm.runInContext(storageSource, context);

  context.saveLastForecastSnapshot('Huge City', {
    city: { name: 'Huge City' },
    list: [{ dt: 1, main: { temp: 10 }, weather: [{ id: 800, description: 'x'.repeat(600 * 1024) }] }]
  });
  assert.equal(values.has('weathernow-last-forecast'), false);
});

test('cache storage quota failures never interrupt weather rendering', () => {
  const storageSource = fs.readFileSync(path.join(__dirname, '../js/storage.js'), 'utf8');
  const context = vm.createContext({
    localStorage: {
      getItem() { return null; },
      setItem() { throw new Error('QuotaExceededError'); }
    },
    document: { addEventListener() {} },
    Date
  });
  vm.runInContext(storageSource, context);
  assert.doesNotThrow(() => context.saveLastWeatherSnapshot({
    name: 'Berlin',
    coord: { lat: 52.52, lon: 13.405 },
    main: { temp: 12 },
    weather: [{ id: 800 }]
  }));
  assert.doesNotThrow(() => context.saveLastForecastSnapshot('Berlin', {
    city: { name: 'Berlin' },
    list: [{ dt: 1, main: { temp: 10 }, weather: [{ id: 800, description: 'ясно' }] }]
  }));
});


test('network failures fall back only to a cached snapshot for the requested city', () => {
  const appSource = fs.readFileSync(path.join(__dirname, '../js/app.js'), 'utf8');
  assert.match(appSource, /if \(!hasPreviousWeather && restoreCachedWeather\(city\)\) return;/);
  assert.match(appSource, /if \(restoreCachedWeather\(CONFIG\.DEFAULT_CITY\)\) return;/);
  assert.match(appSource, /function restoreCachedWeather\(expectedCity\)/);
  assert.match(appSource, /String\(data\.name\).*toLocaleLowerCase\('ru-RU'\)/);
});

test('private browsing storage access failures are treated as an empty cache', () => {
  const storageSource = fs.readFileSync(path.join(__dirname, '../js/storage.js'), 'utf8');
  const context = vm.createContext({
    get localStorage() {
      throw new Error('SecurityError: storage is unavailable');
    },
    document: { addEventListener() {} },
    Date
  });
  vm.runInContext(storageSource, context);

  assert.equal(context.getLastWeatherSnapshot(), null);
  assert.equal(context.getLastForecastSnapshot('Berlin'), null);
  assert.doesNotThrow(() => context.saveLastWeatherSnapshot({
    name: 'Berlin',
    coord: { lat: 52.52, lon: 13.405 },
    main: { temp: 12 },
    weather: [{ id: 800 }]
  }));
  assert.doesNotThrow(() => context.saveLastForecastSnapshot('Berlin', {
    city: { name: 'Berlin' },
    list: [{ dt: 1, main: { temp: 10 }, weather: [{ id: 800, description: 'ясно' }] }]
  }));
});

test('forecast cache migration preserves a valid legacy single-city snapshot', () => {
  const storageSource = fs.readFileSync(path.join(__dirname, '../js/storage.js'), 'utf8');
  const legacy = {
    city: 'Berlin',
    savedAt: '2026-11-23T10:00:00.000Z',
    data: { city: { name: 'Berlin' }, list: [{ dt: 1, main: { temp: 10 }, weather: [{ id: 800, description: 'ясно' }] }] }
  };
  const values = new Map([['weathernow-last-forecast', JSON.stringify(legacy)]]);
  const context = vm.createContext({
    localStorage: {
      getItem(key) { return values.get(key) ?? null; },
      setItem(key, value) { values.set(key, value); }
    },
    document: { addEventListener() {} },
    Date
  });
  vm.runInContext(storageSource, context);

  assert.equal(context.getLastForecastSnapshot('Berlin').data.city.name, 'Berlin');
  context.saveLastForecastSnapshot('Paris', {
    city: { name: 'Paris' },
    list: [{ dt: 2, main: { temp: 10 }, weather: [{ id: 800, description: 'ясно' }] }]
  });
  const migrated = JSON.parse(values.get('weathernow-last-forecast'));
  assert.equal(migrated.version, 2);
  assert.ok(migrated.cities.berlin);
  assert.ok(migrated.cities.paris);
});


test('forecast cache rejects partially corrupted entries and empty forecast lists', () => {
  const storageSource = fs.readFileSync(path.join(__dirname, '../js/storage.js'), 'utf8');
  const validItem = { dt: 1, main: { temp: 10 }, weather: [{ id: 800, description: 'ясно' }] };
  const validSnapshot = {
    city: 'Berlin',
    savedAt: '2026-11-23T10:00:00.000Z',
    data: { city: { name: 'Berlin' }, list: [validItem] }
  };
  const values = new Map();
  const context = vm.createContext({
    localStorage: {
      getItem(key) { return values.get(key) ?? null; },
      setItem(key, value) { values.set(key, value); }
    },
    document: { addEventListener() {} },
    Date
  });
  vm.runInContext(storageSource, context);

  values.set('weathernow-last-forecast', JSON.stringify({
    version: 2,
    cities: {
      berlin: validSnapshot,
      paris: { ...validSnapshot, data: { city: { name: 'Paris' }, list: [validItem, null] } },
      tokyo: { ...validSnapshot, data: { city: { name: 'Tokyo' }, list: [] } },
      rome: { ...validSnapshot, data: { city: { name: 'Rome' }, list: [{ dt: 1, main: {}, weather: [] }] } }
    }
  }));

  assert.equal(context.getLastForecastSnapshot('Berlin').data.city.name, 'Berlin');
  assert.equal(context.getLastForecastSnapshot('Paris'), null);
  assert.equal(context.getLastForecastSnapshot('Tokyo'), null);
  assert.equal(context.getLastForecastSnapshot('Rome'), null);
});
