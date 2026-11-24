const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const appSource = fs.readFileSync(path.join(__dirname, '../js/app.js'), 'utf8');

function createAppHarness() {
  let resolveDefaultWeather;
  let geoSuccess;
  let geoError;
  const renderedCities = [];
  const cityLabel = { textContent: '' };
  const retryButton = { classList: { add() {}, remove() {} } };

  const context = vm.createContext({
    navigator: {
      geolocation: {
        getCurrentPosition(success, error, options) {
          geoSuccess = success;
          geoError = error;
          context.geolocationOptions = options;
        },
      },
    },
    document: {
      addEventListener() {},
      getElementById(id) {
        if (id === 'main-city') return cityLabel;
        if (id === 'retry-geo-btn') return retryButton;
        return null;
      },
    },
    CONFIG: { DEFAULT_CITY: 'Berlin' },
    currentWeatherRequestId: 0,
    forecastRequestId: 0,
    currentLat: null,
    currentLon: null,
    fetchWeather(city) {
      context.requestedCity = city;
      return new Promise(resolve => { resolveDefaultWeather = resolve; });
    },
    getCityByCoords: async () => ({
      name: 'Frankfurt',
      coord: { lat: 50.11, lon: 8.68 },
    }),
    renderCurrentWeather(data) {
      renderedCities.push(data.name);
    },
    updateRainMap() {},
    restoreCachedWeather() { return false; },
  });

  vm.runInContext(appSource, context);
  return {
    context,
    renderedCities,
    resolveDefaultWeather: data => resolveDefaultWeather(data),
    resolveGeolocation: () => geoSuccess({ coords: { latitude: 50.11, longitude: 8.68 } }),
    rejectGeolocation: () => geoError(),
  };
}

const flushPromises = () => new Promise(resolve => setImmediate(resolve));

test('default city loads while the geolocation prompt is still pending', async () => {
  const app = createAppHarness();
  await app.context.initApp();

  assert.equal(app.context.requestedCity, 'Berlin');
  app.resolveDefaultWeather({ name: 'Berlin', coord: { lat: 52.52, lon: 13.4 } });
  await flushPromises();

  assert.deepEqual(app.renderedCities, ['Berlin']);
});

test('late default-city response cannot overwrite a successful geolocation result', async () => {
  const app = createAppHarness();
  await app.context.initApp();

  app.resolveGeolocation();
  await flushPromises();
  assert.deepEqual(app.renderedCities, ['Frankfurt']);

  app.resolveDefaultWeather({ name: 'Berlin', coord: { lat: 52.52, lon: 13.4 } });
  await flushPromises();
  assert.deepEqual(app.renderedCities, ['Frankfurt']);
});
