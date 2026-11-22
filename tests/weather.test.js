const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

class FixedDate extends Date {
  constructor(...args) {
    super(...(args.length ? args : ['2026-01-01T23:30:00.000Z']));
  }
}

const source = fs.readFileSync(path.join(__dirname, '../js/weather.js'), 'utf8');
const weather = vm.createContext({ Date: FixedDate });
vm.runInContext(source, weather);

test('weather conditions map to the expected symbols', () => {
  assert.equal(weather.getWeatherEmoji(800), '☀️');
  assert.equal(weather.getWeatherEmoji(502), '🌧️');
  assert.equal(weather.getWeatherEmoji(601), '🌨️');
});

test('daily forecast calculates average, minimum and maximum values', () => {
  const result = weather.groupForecastByDay({
    list: [
      {
        dt_txt: '2026-01-02 09:00:00',
        main: { temp: 4, humidity: 60 },
        weather: [{ id: 800, description: 'ясно' }],
        wind: { speed: 2 },
      },
      {
        dt_txt: '2026-01-02 12:00:00',
        main: { temp: 8, humidity: 80 },
        weather: [{ id: 500, description: 'небольшой дождь' }],
        wind: { speed: 4 },
      },
    ],
  });

  assert.equal(result.length, 1);
  assert.equal(result[0].temp, 6);
  assert.equal(result[0].minTemp, 4);
  assert.equal(result[0].maxTemp, 8);
  assert.equal(result[0].wind, 3);
  assert.equal(result[0].humidity, 70);
});

test('hourly forecast uses the selected city local date', () => {
  const result = weather.getHourlyForecast({
    city: { timezone: 2 * 60 * 60 },
    list: [
      {
        dt_txt: '2026-01-01 23:00:00',
        main: { temp: 3, humidity: 50 },
        weather: [{ id: 800, description: 'ясно' }],
        pop: 0,
        wind: { speed: 1 },
      },
      {
        dt_txt: '2026-01-02 02:00:00',
        main: { temp: 5, humidity: 55 },
        weather: [{ id: 801, description: 'малооблачно' }],
        pop: 0.25,
        wind: { speed: 2 },
      },
    ],
  });

  assert.equal(result.length, 1);
  assert.equal(result[0].time, '02:00');
  assert.equal(result[0].temp, 5);
  assert.equal(result[0].pop, 25);
});


test('weather scene key follows provider condition ranges', () => {
  const themeSource = fs.readFileSync(path.join(__dirname, '../js/theme.js'), 'utf8');
  const theme = vm.createContext({ document: { addEventListener() {} } });
  vm.runInContext(themeSource, theme);

  assert.equal(theme.getWeatherSceneKey(200), 'thunder');
  assert.equal(theme.getWeatherSceneKey(301), 'rain');
  assert.equal(theme.getWeatherSceneKey(600), 'snow');
  assert.equal(theme.getWeatherSceneKey(741), 'fog');
  assert.equal(theme.getWeatherSceneKey(800), 'clear');
  assert.equal(theme.getWeatherSceneKey(802), 'partly-cloudy');
  assert.equal(theme.getWeatherSceneKey(804), 'cloudy');
});


test('rolling 24-hour forecast selects upcoming timestamps and uses city-local day labels', () => {
  const now = Date.UTC(2026, 0, 2, 22, 0, 0) / 1000;
  const makeHour = (dt, date, time, temp) => ({
    dt,
    dt_txt: `${date} ${time}:00`,
    main: { temp, feels_like: temp - 1, humidity: 60 },
    weather: [{ id: 800, description: 'ясно' }],
    pop: 0.2,
    wind: { speed: 3 },
  });
  const forecast = {
    city: { timezone: 2 * 60 * 60 },
    list: [
      makeHour(now - 10800, '2026-01-02', '21:00', 1),
      makeHour(now, '2026-01-03', '00:00', 2),
      makeHour(now + 10800, '2026-01-03', '03:00', 3),
      makeHour(now + 86400, '2026-01-04', '00:00', 4),
      makeHour(now + 90000, '2026-01-04', '03:00', 5),
    ],
  };

  const result = weather.getNext24Hours(forecast, now);
  assert.equal(result.length, 3);
  assert.deepEqual(Array.from(result, hour => hour.temp), [2, 3, 4]);
  assert.equal(result[0].feels, 1);
  assert.equal(result[0].pop, 20);
  assert.equal(result[0].dateLabel, 'Сегодня');
  assert.equal(result[2].dateLabel, 'Завтра');
});

test('rolling 24-hour forecast safely handles missing or empty data', () => {
  assert.deepEqual(Array.from(weather.getNext24Hours(null)), []);
  assert.deepEqual(Array.from(weather.getNext24Hours({ list: [] })), []);
});


test('forecast calendar dates do not shift across local time zones', () => {
  const date = weather.parseForecastDate('2026-01-02');
  assert.equal(date.getFullYear(), 2026);
  assert.equal(date.getMonth(), 0);
  assert.equal(date.getDate(), 2);
});


test('city comparison summary identifies the warmer city and temperature gap', () => {
  const uiSource = fs.readFileSync(path.join(__dirname, '../js/ui.js'), 'utf8');
  const ui = vm.createContext({
    document: { addEventListener() {} },
    window: { addEventListener() {} },
  });
  vm.runInContext(uiSource, ui);

  const summary = ui.getComparisonSummary(
    { name: 'Берлин', main: { temp: 12, feels_like: 10 } },
    { name: 'Прага', main: { temp: 7, feels_like: 6 } }
  );

  assert.equal(summary.warmerCity, 'Берлин');
  assert.equal(summary.temperatureDifference, 5);
  assert.equal(summary.feelsDifference, 4);
  assert.equal(summary.sameTemperature, false);
});

test('city comparison summary handles ties and incomplete measurements', () => {
  const uiSource = fs.readFileSync(path.join(__dirname, '../js/ui.js'), 'utf8');
  const ui = vm.createContext({
    document: { addEventListener() {} },
    window: { addEventListener() {} },
  });
  vm.runInContext(uiSource, ui);

  const tied = ui.getComparisonSummary(
    { name: 'Берлин', main: { temp: 8 } },
    { name: 'Прага', main: { temp: 8 } }
  );
  assert.equal(tied.sameTemperature, true);
  assert.equal(tied.warmerCity, null);
  assert.equal(tied.temperatureDifference, 0);
  assert.equal(tied.feelsDifference, null);
});

test('favorite storage ignores malformed and unsafe legacy records', () => {
  const storageSource = fs.readFileSync(path.join(__dirname, '../js/storage.js'), 'utf8');
  const storage = vm.createContext({
    localStorage: { getItem: () => null, setItem() {} },
    document: { addEventListener() {} },
  });
  vm.runInContext(storageSource, storage);

  assert.deepEqual(Array.from(storage.parseFavoriteCities('{broken')), []);
  assert.deepEqual(Array.from(storage.parseFavoriteCities('{"name":"Berlin"}')), []);
  assert.deepEqual(
    JSON.parse(JSON.stringify(storage.parseFavoriteCities(JSON.stringify([
      { name: ' Berlin ', country: ' DE ' },
      { name: '', country: 'XX' },
      null,
      { name: 'Prague', country: 7 },
    ])))),
    [
      { name: 'Berlin', country: 'DE', addedAt: '' },
      { name: 'Prague', country: '', addedAt: '' },
    ]
  );
});


test('browser weather configuration never exposes an OpenWeatherMap API key', () => {
  const configSource = fs.readFileSync(path.join(__dirname, '../js/config.js'), 'utf8');
  const apiSource = fs.readFileSync(path.join(__dirname, '../js/api.js'), 'utf8');
  const client = vm.createContext({ URLSearchParams });
  vm.runInContext(configSource, client);
  vm.runInContext(apiSource, client);

  const url = vm.runInContext("buildUrl('/weather', { q: 'Berlin' })", client);
  assert.equal(vm.runInContext('CONFIG.API_KEY', client), undefined);
  assert.equal(url.includes('appid='), false);
  assert.equal(url.includes('api.openweathermap.org'), false);
  assert.equal(url, 'https://openweathermap-6310.sokrat3895.workers.dev/weather?q=Berlin');
});


test('latest city request wins when weather responses arrive out of order', async () => {
  const appSource = fs.readFileSync(path.join(__dirname, '../js/app.js'), 'utf8');
  const pending = new Map();
  const renderedCities = [];
  const context = vm.createContext({
    document: { addEventListener() {} },
    currentWeatherRequestId: 0,
    fetchWeather: city => new Promise(resolve => pending.set(city, resolve)),
    renderCurrentWeather: data => renderedCities.push(data.name),
    updateRainMap() {},
    closeSearchResults() {},
    showToast() {},
  });
  vm.runInContext(appSource, context);

  const olderRequest = context.loadCityWeather('Berlin');
  const newerRequest = context.loadCityWeather('Paris');

  pending.get('Paris')({
    name: 'Paris',
    coord: { lat: 48.8566, lon: 2.3522 },
    sys: { country: 'FR' }
  });
  await newerRequest;

  pending.get('Berlin')({
    name: 'Berlin',
    coord: { lat: 52.52, lon: 13.405 },
    sys: { country: 'DE' }
  });
  await olderRequest;

  assert.deepEqual(renderedCities, ['Paris']);
  assert.equal(context.currentLat, 48.8566);
  assert.equal(context.currentLon, 2.3522);
});


test('outfit advice uses neutral layers for mild weather', () => {
  const wardrobeSource = fs.readFileSync(path.join(__dirname, '../js/wardrobe.js'), 'utf8');
  const context = vm.createContext({});
  vm.runInContext(wardrobeSource, context);

  const advice = context.getWardrobeRecommendation(15, 13, 800, 2);

  assert.equal(advice.category, 'Свежо');
  assert.equal(advice.feelsLike, 13);
  assert.ok(advice.sections.some(section => section.items.includes('Лонгслив или тонкий свитер')));
  assert.equal(advice.sections.some(section => section.title === 'Верхняя одежда'), true);
  assert.equal('mens' in advice, false);
  assert.equal('womens' in advice, false);
});

test('outfit advice adds rain protection when conditions are wet', () => {
  const wardrobeSource = fs.readFileSync(path.join(__dirname, '../js/wardrobe.js'), 'utf8');
  const context = vm.createContext({});
  vm.runInContext(wardrobeSource, context);

  const advice = context.getWardrobeRecommendation(8, 5, 500, 4);
  const allItems = advice.sections.flatMap(section => section.items);

  assert.ok(allItems.includes('Водонепроницаемая куртка'));
  assert.ok(allItems.includes('Зонт'));
  assert.ok(allItems.includes('Непромокаемая обувь'));
});

test('outfit advice adds wind protection and cold-weather layers', () => {
  const wardrobeSource = fs.readFileSync(path.join(__dirname, '../js/wardrobe.js'), 'utf8');
  const context = vm.createContext({});
  vm.runInContext(wardrobeSource, context);

  const advice = context.getWardrobeRecommendation(-8, -10, 800, 9);
  const allItems = advice.sections.flatMap(section => section.items);

  assert.equal(advice.category, 'Очень холодно');
  assert.ok(allItems.includes('Термобельё и тёплый слой'));
  assert.ok(allItems.includes('Ветрозащитный верхний слой'));
  assert.ok(allItems.includes('Шарф или бафф'));
});


test('weather detail formatters produce readable wind and visibility values', () => {
  assert.equal(weather.formatWindDirection(270), 'З');
  assert.equal(weather.formatWindDirection(45), 'СВ');
  assert.equal(weather.formatWindDirection(undefined), 'Нет данных');
  assert.equal(weather.formatVisibility(10000), '10 км');
  assert.equal(weather.formatVisibility(850), '850 м');
  assert.equal(weather.formatVisibility(undefined), 'Нет данных');
});

test('sunrise and sunset use the city offset and calculate daylight duration', () => {
  assert.equal(weather.formatCityTime(0, 0), '00:00');
  assert.equal(weather.formatCityTime(0, 3600), '01:00');
  assert.equal(weather.formatCityTime(undefined, 3600), '—');
  assert.equal(weather.formatDaylightDuration(3600, 36000), '9 ч 0 мин');
  assert.equal(weather.formatDaylightDuration(36000, 3600), '—');
});


test('chart tooltips use the unit of each data series', () => {
  const chartSource = fs.readFileSync(path.join(__dirname, '../js/charts.js'), 'utf8');
  const context = vm.createContext({});
  vm.runInContext(chartSource, context);

  assert.equal(context.formatChartTooltip('Температура °C', 12), 'Температура °C: 12°C');
  assert.equal(context.formatChartTooltip('Осадки %', 65), 'Осадки %: 65%');
  assert.equal(context.formatChartTooltip('Макс. температура', -3), 'Макс. температура: -3°C');
  assert.equal(context.formatChartTooltip('Осадки %', null), 'Осадки %: нет данных');
});

test('weather scenes detect the reduced-motion preference', () => {
  const themeSource = fs.readFileSync(path.join(__dirname, '../js/theme.js'), 'utf8');
  const context = vm.createContext({
    document: { addEventListener() {} },
    window: { matchMedia: () => ({ matches: true }) }
  });
  vm.runInContext(themeSource, context);
  assert.equal(context.prefersReducedMotion(), true);

  context.window.matchMedia = () => ({ matches: false });
  assert.equal(context.prefersReducedMotion(), false);
});


test('forecast highlights call out rain, temperature shifts and strong wind', () => {
  const hours = [
    { time: '09:00', temp: 14, pop: 10, wind: 3 },
    { time: '12:00', temp: 12, pop: 65, wind: 4 },
    { time: '18:00', temp: 9, pop: 20, wind: 8.5 }
  ];
  const highlights = weather.getForecastHighlights(hours);

  assert.equal(highlights.length, 3);
  assert.match(highlights[0].text, /65% около 12:00/);
  assert.match(highlights[1].text, /похолодает примерно на 5°/);
  assert.match(highlights[2].text, /8,5 м\/с около 18:00/);
});

test('forecast highlights stay quiet when changes are minor or data is insufficient', () => {
  assert.deepEqual(Array.from(weather.getForecastHighlights([])), []);
  assert.deepEqual(Array.from(weather.getForecastHighlights([{ time: '09:00', temp: 10 }])), []);

  const stable = [
    { time: '09:00', temp: 10, pop: 20, wind: 3 },
    { time: '18:00', temp: 12, pop: 35, wind: 5 }
  ];
  assert.deepEqual(Array.from(weather.getForecastHighlights(stable)), []);
});


test('weather particle budget scales down on low-resource devices', () => {
  const themeSource = fs.readFileSync(path.join(__dirname, '../js/theme.js'), 'utf8');
  const context = vm.createContext({
    document: { addEventListener() {} },
    navigator: { deviceMemory: 2, hardwareConcurrency: 2, connection: { saveData: false } },
    window: { matchMedia: () => ({ matches: false }) }
  });
  vm.runInContext(themeSource, context);
  assert.equal(context.getWeatherEffectScale(), 0.35);

  context.navigator = { deviceMemory: 4, hardwareConcurrency: 4, connection: { saveData: false } };
  assert.equal(context.getWeatherEffectScale(), 0.65);

  context.navigator = { deviceMemory: 8, hardwareConcurrency: 8, connection: { saveData: false } };
  assert.equal(context.getWeatherEffectScale(), 1);

  context.navigator.connection.saveData = true;
  assert.equal(context.getWeatherEffectScale(), 0.35);
});


test('map layer configuration rejects unsupported layers', () => {
  const mapSource = fs.readFileSync(path.join(__dirname, '../js/map.js'), 'utf8');
  const context = vm.createContext({
    document: { querySelectorAll: () => [], addEventListener() {} }
  });
  vm.runInContext(mapSource, context);

  assert.equal(vm.runInContext('WINDY_LAYERS.temperature', context), 'temp');
  assert.equal(vm.runInContext('WINDY_LAYERS.precipitation', context), 'rain');
  assert.equal(vm.runInContext('WINDY_LAYERS.wind', context), 'wind');
  assert.equal(vm.runInContext('WINDY_LAYERS.clouds', context), 'clouds');
  assert.equal(vm.runInContext('WINDY_LAYERS.unknown', context), undefined);
});

test('map accepts valid zero coordinates and rejects missing coordinates', () => {
  const mapSource = fs.readFileSync(path.join(__dirname, '../js/map.js'), 'utf8');
  const context = vm.createContext({
    document: { querySelectorAll: () => [], addEventListener() {} },
    currentLat: 0,
    currentLon: 0
  });
  vm.runInContext(mapSource, context);

  assert.equal(context.hasMapCoordinates(), true);
  context.currentLat = null;
  assert.equal(context.hasMapCoordinates(), false);
  context.currentLat = 51.5;
  context.currentLon = Number.NaN;
  assert.equal(context.hasMapCoordinates(), false);
});


test('map waits until its screen is opened and tracks navigation detail', () => {
  const listeners = {};
  const classes = new Set();
  const screen = { classList: { contains: value => classes.has(value) } };
  const context = vm.createContext({
    document: {
      addEventListener: (name, callback) => { listeners[name] = callback; },
      getElementById: () => screen,
      querySelectorAll: () => []
    },
    currentLat: 51.5,
    currentLon: 0
  });
  vm.runInContext(fs.readFileSync(path.join(__dirname, '../js/map.js'), 'utf8'), context);

  assert.equal(context.isMapScreenActive(), false);
  classes.add('active');
  assert.equal(context.isMapScreenActive(), true);

  let selectedScreen = null;
  context.hasMapCoordinates = () => true;
  context.updateRainMap = () => { selectedScreen = 'rainmap'; };
  listeners.screenChanged({ detail: 'home' });
  assert.equal(selectedScreen, null);
  listeners.screenChanged({ detail: 'rainmap' });
  assert.equal(selectedScreen, 'rainmap');
});


test('map fullscreen fallback can be exited without requesting browser fullscreen', async () => {
  const classes = new Set(['map-fullscreen-fallback']);
  const attributes = {};
  const container = {
    classList: {
      contains: value => classes.has(value),
      remove: value => classes.delete(value),
      toggle: value => classes.has(value) ? classes.delete(value) : classes.add(value)
    },
    requestFullscreen: async () => { throw new Error('Should not request fullscreen'); }
  };
  const button = { setAttribute: (name, value) => { attributes[name] = value; } };
  const context = vm.createContext({
    document: {
      fullscreenElement: null,
      addEventListener() {},
      querySelector: selector => selector === '.weather-map-container' ? container : null,
      getElementById: id => id === 'map-fullscreen-btn' ? button : null
    },
    setMapStatus() {}
  });
  vm.runInContext(fs.readFileSync(path.join(__dirname, '../js/map.js'), 'utf8'), context);

  await context.toggleMapFullscreen();
  assert.equal(classes.has('map-fullscreen-fallback'), false);
  assert.equal(attributes['aria-pressed'], 'false');
});


test('sun is shown only for clear daytime conditions', () => {
  const source = fs.readFileSync(path.join(__dirname, '../js/theme.js'), 'utf8');
  const context = vm.createContext({
    document: { addEventListener() {} },
    window: { matchMedia: () => ({ matches: false }) }
  });
  vm.runInContext(source, context);

  assert.equal(context.shouldShowSun(800, 'day'), true);
  assert.equal(context.shouldShowSun(801, 'morning'), true);
  assert.equal(context.shouldShowSun(802, 'day'), false);
  assert.equal(context.shouldShowSun(500, 'day'), false);
  assert.equal(context.shouldShowSun(800, 'night'), false);
});


test('weather scene classification covers clear, clouds, rain, snow and fog', () => {
  const source = fs.readFileSync(path.join(__dirname, '../js/theme.js'), 'utf8');
  const context = vm.createContext({
    document: { addEventListener() {} },
    window: { matchMedia: () => ({ matches: false }) }
  });
  vm.runInContext(source, context);

  assert.equal(context.getWeatherSceneKey(800), 'clear');
  assert.equal(context.getWeatherSceneKey(801), 'partly-cloudy');
  assert.equal(context.getWeatherSceneKey(803), 'cloudy');
  assert.equal(context.getWeatherSceneKey(502), 'rain');
  assert.equal(context.getWeatherSceneKey(211), 'thunder');
  assert.equal(context.getWeatherSceneKey(601), 'snow');
  assert.equal(context.getWeatherSceneKey(741), 'fog');
});

test('weather effects set the active scene on the sky container', () => {
  const attributes = {};
  const sky = {
    dataset: attributes,
    querySelectorAll: () => [],
    appendChild() {}
  };
  const context = vm.createContext({
    document: {
      addEventListener() {},
      getElementById: id => id === 'sky' ? sky : null
    },
    window: { matchMedia: () => ({ matches: true }) }
  });
  vm.runInContext(fs.readFileSync(path.join(__dirname, '../js/theme.js'), 'utf8'), context);
  context.applyWeatherEffects(500, 'day');
  assert.equal(attributes.weather, 'rain');
  assert.equal(attributes.motion, 'reduced');
});


test('weather icon renderer returns accessible SVG artwork for all weather families', () => {
  const source = fs.readFileSync(path.join(__dirname, '../js/weather.js'), 'utf8');
  const context = vm.createContext({});
  vm.runInContext(source, context);

  for (const [code, label] of [
    [800, 'Ясно'],
    [801, 'Небольшая облачность'],
    [500, 'Дождь'],
    [211, 'Гроза'],
    [601, 'Снег'],
    [741, 'Туман'],
    [804, 'Облачно']
  ]) {
    const markup = context.getWeatherIconMarkup(code);
    assert.match(markup, /<svg/);
    assert.match(markup, /aria-label=/);
    assert.match(markup, new RegExp(label));
  }
});


test('weather motion profile scales rain, snow and wind to condition severity', () => {
  const source = fs.readFileSync(path.join(__dirname, '../js/theme.js'), 'utf8');
  const context = vm.createContext({
    document: { addEventListener() {} },
    window: { matchMedia: () => ({ matches: false }) }
  });
  vm.runInContext(source, context);

  assert.ok(context.getWeatherMotionProfile(502, 13).rainCount > context.getWeatherMotionProfile(500, 2).rainCount);
  assert.ok(context.getWeatherMotionProfile(602, 2).snowCount > context.getWeatherMotionProfile(600, 2).snowCount);
  assert.ok(context.getWeatherMotionProfile(800, 14).windCount > context.getWeatherMotionProfile(800, 1).windCount);
  assert.equal(context.getWeatherMotionProfile(800, 1).rainCount, 0);
  assert.equal(context.getWeatherMotionProfile(800, 1).snowCount, 0);
});


test('celestial body arc stays within the sky bounds', () => {
  const source = fs.readFileSync(path.join(__dirname, '../js/theme.js'), 'utf8');
  const context = vm.createContext({
    document: { addEventListener() {} },
    window: { matchMedia: () => ({ matches: false }) }
  });
  vm.runInContext(source, context);

  const dawn = context.getSkyArcPosition(5, 5, 20);
  const noon = context.getSkyArcPosition(12.5, 5, 20);
  const dusk = context.getSkyArcPosition(20, 5, 20);

  assert.equal(dawn.x, 8);
  assert.equal(dusk.x, 92);
  assert.ok(noon.y > dawn.y);
  assert.ok(noon.y > dusk.y);
  assert.ok([dawn, noon, dusk].every(point => point.x >= 0 && point.x <= 100 && point.y >= 0 && point.y <= 100));
});
