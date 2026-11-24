import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { mkdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium, firefox, webkit } from 'playwright';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const WORKER_ORIGIN = 'https://openweathermap-6310.sokrat3895.workers.dev';
const APP_ORIGIN = 'http://127.0.0.1:5500';
const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon'
};

function createWeather(city) {
  const berlin = city.toLocaleLowerCase().includes('berlin');
  return {
    name: berlin ? 'Berlin' : 'Москва',
    coord: berlin ? { lat: 52.52, lon: 13.405 } : { lat: 55.7558, lon: 37.6173 },
    weather: [{ id: 800, main: 'Clear', description: 'ясно' }],
    main: {
      temp: berlin ? 12 : 8,
      feels_like: berlin ? 10 : 6,
      temp_min: berlin ? 9 : 5,
      temp_max: berlin ? 14 : 10,
      pressure: 1015,
      humidity: 68
    },
    wind: { speed: 3.5, deg: 220, gust: 5.2 },
    clouds: { all: 0 },
    visibility: 10000,
    sys: {
      country: berlin ? 'DE' : 'RU',
      sunrise: 1795410000,
      sunset: 1795440000
    },
    timezone: berlin ? 3600 : 10800,
    dt: Math.floor(Date.now() / 1000)
  };
}

function createForecast(city) {
  const weather = createWeather(city);
  const now = Math.floor(Date.now() / 1000);
  const timezone = weather.timezone;
  const list = Array.from({ length: 8 }, (_, index) => {
    const dt = now + 3600 + index * 10800;
    const localDateTime = new Date((dt + timezone) * 1000).toISOString().replace('T', ' ').slice(0, 19);
    return {
      dt,
      dt_txt: localDateTime,
      main: { temp: weather.main.temp + (index % 3) - 1, feels_like: weather.main.feels_like, humidity: 68 },
      weather: [{ id: 800, main: 'Clear', description: 'ясно' }],
      wind: { speed: 3.5, deg: 220 },
      pop: index % 2 ? 0.15 : 0
    };
  });
  return {
    city: { name: weather.name, country: weather.sys.country, timezone },
    list
  };
}

const server = createServer(async (request, response) => {
  try {
    const pathname = decodeURIComponent(new URL(request.url, APP_ORIGIN).pathname);
    const target = path.resolve(ROOT, `.${pathname}`);
    if (target !== ROOT && !target.startsWith(ROOT + path.sep)) {
      response.writeHead(403).end('Forbidden');
      return;
    }
    const filePath = pathname.endsWith('/') ? path.join(target, 'index.html') : target;
    const content = await readFile(filePath);
    response.writeHead(200, { 'Content-Type': MIME_TYPES[path.extname(filePath)] || 'application/octet-stream' });
    response.end(content);
  } catch {
    response.writeHead(404).end('Not found');
  }
});

const browserName = process.env.BROWSER || 'chromium';
const browserEngine = { chromium, firefox, webkit }[browserName];
if (!browserEngine) throw new Error(`Unsupported BROWSER value: ${browserName}`);
const browser = await browserEngine.launch({ headless: true });
const pageErrors = [];
const workerRequests = [];
const screenshotDir = process.env.SCREENSHOT_DIR || path.join(ROOT, 'artifacts', 'browser-smoke');

try {
  await mkdir(screenshotDir, { recursive: true });
  await new Promise(resolve => server.listen(5500, '127.0.0.1', resolve));
  const context = await browser.newContext({
    viewport: { width: 1440, height: 1000 },
    reducedMotion: 'reduce'
  });
  const page = await context.newPage();
  await page.addInitScript(() => {
    window.__weatherNotifications = [];
    class TestNotification {
      static permission = 'granted';
      static async requestPermission() { return 'granted'; }
      constructor(title, options) { window.__weatherNotifications.push({ title, options }); }
    }
    Object.defineProperty(window, 'Notification', { configurable: true, value: TestNotification });
    Object.defineProperty(navigator, 'geolocation', {
      configurable: true,
      value: { getCurrentPosition(_success, error) { error({ code: 1, message: 'Permission denied' }); } }
    });
  });
  page.on('pageerror', error => pageErrors.push(error.message));

  await page.route('https://embed.windy.com/**', route => route.fulfill({
    status: 200,
    contentType: 'text/html',
    body: '<!doctype html><html><body>Mock Windy map</body></html>'
  }));

  await page.route(`${WORKER_ORIGIN}/**`, async route => {
    const url = new URL(route.request().url());
    workerRequests.push(url);
    const origin = route.request().headers().origin || APP_ORIGIN;
    const headers = {
      'content-type': 'application/json; charset=utf-8',
      'access-control-allow-origin': origin,
      'vary': 'Origin'
    };
    const city = url.searchParams.get('q') || 'Москва';
    if (url.pathname === '/weather') {
      await route.fulfill({ status: 200, headers, body: JSON.stringify(createWeather(city)) });
    } else if (url.pathname === '/forecast') {
      await route.fulfill({ status: 200, headers, body: JSON.stringify(createForecast(city)) });
    } else if (url.pathname === '/direct') {
      await route.fulfill({ status: 200, headers, body: JSON.stringify([{ name: 'Berlin', country: 'DE', lat: 52.52, lon: 13.405 }]) });
    } else {
      await route.fulfill({ status: 404, headers, body: JSON.stringify({ error: 'Not found' }) });
    }
  });

  await page.goto(APP_ORIGIN, { waitUntil: 'domcontentloaded' });
  // Wait for both asynchronously loaded font stylesheets before visual snapshots.
  await page.waitForFunction(() => {
    const fontStylesheet = document.querySelector('link[href*="fonts.googleapis.com/css2"]');
    const iconStylesheet = document.querySelector('link[href*="bootstrap-icons"]');
    return Boolean(fontStylesheet?.sheet && iconStylesheet?.sheet);
  }, null, { timeout: 15000 });
  await page.evaluate(async () => {
    await Promise.all([
      document.fonts.load('400 16px Nunito'),
      document.fonts.load('1em bootstrap-icons')
    ]);
    await document.fonts.ready;
  });
  await page.waitForFunction(() => {
    const city = document.querySelector('#main-city')?.textContent || '';
    const temperature = document.querySelector('#main-temp')?.textContent || '';
    return city.includes(',') && /^-?[0-9]+°C$/.test(temperature);
  }, null, { timeout: 20000 });

  assert.match(await page.locator('#main-city').innerText(), /Москва, RU/);
  assert.equal(await page.locator('#main-temp').innerText(), '8°C');
  assert.equal(await page.locator('.weather-hero').getAttribute('data-load-state'), 'ready');
  await page.waitForFunction(() => document.querySelector('#forecast-container')?.children.length > 0);
  assert.ok(await page.locator('#hourly-container').count() === 1, 'hourly forecast container is present');
  await page.waitForFunction(() => window.Chart && Chart.getChart('tempChart') && Chart.getChart('hourlyChart'), { timeout: 15000 });
  assert.ok(await page.evaluate(() => Boolean(Chart.getChart('tempChart'))), 'Daily temperature chart renders after lazy loading');
  assert.ok(await page.evaluate(() => Boolean(Chart.getChart('hourlyChart'))), 'Hourly chart renders after lazy loading');

  await page.addScriptTag({ path: path.join(ROOT, 'node_modules', 'axe-core', 'axe.min.js') });
  const homeA11y = await page.evaluate(async () => {
    const result = await axe.run(document, { runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'] } });
    return { violations: result.violations.map(item => ({ id: item.id, impact: item.impact, description: item.help, nodes: item.nodes.map(node => ({ target: node.target, html: node.html, summary: node.failureSummary })) })), passes: result.passes.length };
  });
  console.log('axe-core home audit:', JSON.stringify(homeA11y));
  assert.equal(homeA11y.violations.filter(item => ['critical', 'serious'].includes(item.impact)).length, 0, 'Home screen must have no critical or serious WCAG violations');

  // Exercise animated weather scenes first, then reduced-motion separately.
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  for (const width of [390, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    for (const [name, code, hourTheme] of [
      ['clear-day', 800, 'day'],
      ['cloudy-night', 804, 'night'],
      ['rain-day', 502, 'day'],
      ['snow-night', 601, 'night'],
      ['storm-night', 211, 'night'],
      ['fog-morning', 741, 'morning']
    ]) {
      const state = await page.evaluate(async ({ code, hourTheme }) => {
        currentWeatherCode = code;
        currentWindSpeed = 8;
        currentVisibility = code === 741 ? 900 : 10000;
        currentWindDirection = 225;
        document.body.classList.remove('theme-morning', 'theme-day', 'theme-evening', 'theme-night');
        document.body.classList.add('theme-' + hourTheme);
        updateSkyElements(hourTheme);
        applyWeatherEffects(code, hourTheme, 8);
        // Keep production transitions intact; disable only this test's interpolation
        // so assertions inspect the final weather state deterministically.
        document.querySelectorAll('.weather-cloud-layer').forEach(layer => {
          layer.style.transition = 'none';
        });
        const sky = document.getElementById('sky');
        const moon = document.getElementById('moon');
        const sun = document.getElementById('sun');
        const clouds = [...sky.querySelectorAll('.weather-cloud-layer')];
        const visibleClouds = clouds.filter(layer =>
          getComputedStyle(layer).display !== 'none' &&
          Number(getComputedStyle(layer).opacity) > 0
        );
        return {
          scene: sky.dataset.weather,
          background: getComputedStyle(sky).backgroundImage,
          moonOpacity: Number(getComputedStyle(moon).opacity),
          moonInlineOpacity: Number(moon.style.opacity),
          sunAnimation: getComputedStyle(sun).animationName,
          cloudCount: visibleClouds.length,
          cloudsStatic: visibleClouds.every(layer => getComputedStyle(layer).animationName === 'none'),
          viewport: document.documentElement.clientWidth,
          documentWidth: document.documentElement.scrollWidth,
          effectLayerIds: [...sky.querySelectorAll('#rain-container, #snow-container, #wind-lines, #lightning, #fog')].map(layer => layer.id).sort(),
          fogLayer: (() => {
            const fog = sky.querySelector('#fog');
            if (!fog) return null;
            return {
              background: getComputedStyle(fog).backgroundImage,
              density: fog.dataset.density,
              midOpacity: fog.style.getPropertyValue('--fog-mid-opacity'),
              nearOpacity: fog.style.getPropertyValue('--fog-near-opacity'),
              driftX: fog.style.getPropertyValue('--fog-end-x'),
              driftY: fog.style.getPropertyValue('--fog-end-y'),
              tint: fog.style.getPropertyValue('--fog-tint-a')
            };
          })(),
          lightningBolt: sky.querySelector('#lightning') ? getComputedStyle(sky.querySelector('#lightning'), '::before').clipPath : '',
          stormCloudTransition: sky.querySelector('.weather-cloud-layer[data-weather="storm"]') ? getComputedStyle(sky.querySelector('.weather-cloud-layer[data-weather="storm"]'), '::before').transitionDuration : '',
          lightningSchedulePending: code >= 200 && code < 300 ? lightningTimerId !== null : false,
          rainAngle: sky.querySelector('.raindrop')?.style.getPropertyValue('--rain-angle') || '',
          rainDepthCount: sky.querySelectorAll('.raindrop[data-depth]').length,
          snowDepthCount: sky.querySelectorAll('.snowflake[data-depth]').length,
          rainDepthBands: [...new Set([...sky.querySelectorAll('.raindrop')].map(drop => drop.dataset.depth))].length,
          snowDepthBands: [...new Set([...sky.querySelectorAll('.snowflake')].map(flake => flake.dataset.depth))].length,
          rainProfiles: [0, 1, 2, 3].map(depth => {
            const drop = sky.querySelector(`.raindrop[data-depth="${depth}"]`);
            return drop ? { length: parseFloat(drop.style.height), duration: parseFloat(drop.style.animationDuration), opacity: parseFloat(drop.style.opacity), blur: parseFloat(drop.style.getPropertyValue('--rain-blur')) } : null;
          }),
          snowProfiles: [0, 1, 2, 3].map(depth => {
            const flake = sky.querySelector(`.snowflake[data-depth="${depth}"]`);
            return flake ? { size: parseFloat(flake.style.width), duration: parseFloat(flake.style.animationDuration), opacity: parseFloat(flake.style.opacity), blur: parseFloat(flake.style.getPropertyValue('--snow-blur')) } : null;
          })
        };
      }, { code, hourTheme });
      assert.equal(state.scene, ({
        800: 'clear', 804: 'cloudy', 502: 'rain',
        601: 'snow', 211: 'thunder', 741: 'fog'
      })[code], `Scene key for ${name}`);
      assert.match(state.background, /gradient/i, `Background for ${name}`);
      assert.ok(state.documentWidth <= state.viewport + 1, `No overflow for ${name} at ${width}px`);
      const expectedEffectLayers = code >= 200 && code < 300
        ? ['lightning', 'rain-container', 'wind-lines']
        : code >= 500 && code < 600
          ? ['rain-container', 'wind-lines']
          : code >= 600 && code < 700
            ? ['snow-container']
            : code >= 700 && code < 800
              ? ['fog']
              : [];
      assert.deepEqual(state.effectLayerIds, expectedEffectLayers,
        `Expected weather effect layers for ${name}, without stale or duplicate containers`);
      if (hourTheme === 'night') {
        assert.ok(state.moonInlineOpacity > 0.85, `Moon receives visible night opacity for ${name}`);
      }
      if (code === 804 || code === 502 || code === 601 || code === 211 || code === 741) {
        assert.ok(state.cloudCount >= 1, `Cloud layer visible for ${name}`);
      }
      assert.equal(state.sunAnimation, 'none', `Sun glow is lightweight for ${name}`);
      if (code >= 700 && code < 800) {
        assert.match(state.fogLayer.background, /radial-gradient/i, 'Fog uses a distant atmospheric veil');
        assert.equal(state.fogLayer.density, 'dense', 'Visibility controls the fog density class');
        assert.ok(Number(state.fogLayer.midOpacity) > Number(state.fogLayer.nearOpacity) * 0.8);
        assert.ok(state.fogLayer.driftX && state.fogLayer.driftY, 'Wind direction moves fog banks across both axes');
        assert.match(state.fogLayer.tint, /rgba/i, 'Fog tint follows the local time-of-day palette');
      }
      if (code >= 600 && code < 700) {
        assert.ok(state.snowDepthCount > 0 && state.snowDepthBands === 4, 'Snow has four depth bands');
        assert.ok(state.snowProfiles.every(Boolean), 'All four snow depth profiles are populated');
        for (let index = 1; index < state.snowProfiles.length; index++) {
          assert.ok(state.snowProfiles[index].size > state.snowProfiles[index - 1].size, 'Snowflakes grow toward the foreground');
          assert.ok(state.snowProfiles[index].duration < state.snowProfiles[index - 1].duration, 'Foreground snow falls faster');
          assert.ok(state.snowProfiles[index].opacity > state.snowProfiles[index - 1].opacity, 'Foreground snow is brighter');
          assert.ok(state.snowProfiles[index].blur < state.snowProfiles[index - 1].blur, 'Foreground snow is sharper');
        }
      }
      if (code >= 200 && code < 300) {
        assert.match(state.lightningBolt, /polygon/i, 'Storm contains a shaped lightning bolt');
        assert.notEqual(state.stormCloudTransition, '0s', 'Storm cloud volume can react to each irregular flash');
        assert.equal(state.lightningSchedulePending, true, 'Storm creates one pending irregular strike sequence');
      }
      if (code >= 300 && code < 600) {
        assert.match(state.rainAngle, /deg$/, 'Rain angle responds to wind');
        assert.ok(state.rainDepthCount > 0 && state.rainDepthBands === 4, 'Rain has four depth bands');
        assert.ok(state.rainProfiles.every(Boolean), 'All four rain depth profiles are populated');
        for (let index = 1; index < state.rainProfiles.length; index++) {
          assert.ok(state.rainProfiles[index].length > state.rainProfiles[index - 1].length, 'Rain streaks grow toward the foreground');
          assert.ok(state.rainProfiles[index].duration < state.rainProfiles[index - 1].duration, 'Foreground rain falls faster');
          assert.ok(state.rainProfiles[index].opacity > state.rainProfiles[index - 1].opacity, 'Foreground rain is brighter');
          assert.ok(state.rainProfiles[index].blur < state.rainProfiles[index - 1].blur, 'Foreground rain is sharper');
        }
      }
      if (width === 390) {
        await page.screenshot({ path: path.join(screenshotDir, `scene-${name}-390.png`), fullPage: false });
      }
    }
  }

  await page.evaluate(() => {
    updateWeatherTheme(211, 0, 8);
    const sky = document.getElementById('sky');
    const lightning = sky.querySelector('#lightning');
    const profile = getLightningFlashProfile(() => 0.7);
    applyLightningFlashStage(lightning, 'peak', profile);
  });
  // Let the short 34–84ms CSS transitions reach their intended flash intensity.
  await page.waitForTimeout(110);
  const dynamicStormFlash = await page.evaluate(() => {
    const sky = document.getElementById('sky');
    const lightning = sky.querySelector('#lightning');
    const cloud = sky.querySelector('.weather-cloud-layer[data-weather="storm"]');
    const peak = {
      lightningStage: lightning.dataset.flash,
      skyStage: sky.dataset.stormFlash,
      cloudFilter: getComputedStyle(cloud, '::before').filter,
      cloudBrightnessVar: cloud.style.getPropertyValue('--storm-flash-brightness'),
      boltOpacity: Number(getComputedStyle(lightning, '::before').opacity),
      parentOpacity: Number(getComputedStyle(lightning).opacity),
      inlineOpacity: lightning.style.getPropertyValue('opacity'),
      inlineBackground: lightning.style.getPropertyValue('background-color'),
      matchesPeak: lightning.matches('#lightning[data-flash="peak"]'),
      skyMatchesPeak: sky.matches('#sky[data-storm-flash="peak"]'),
      boltX: lightning.style.getPropertyValue('--lightning-bolt-x'),
      secondary: lightning.dataset.secondary
    };
    applyLightningFlashStage(lightning, 'off');
    return {
      ...peak,
      cleared: !lightning.dataset.flash && !sky.dataset.stormFlash
    };
  });
  assert.equal(dynamicStormFlash.lightningStage, 'peak');
  assert.equal(dynamicStormFlash.skyStage, 'peak');
  assert.match(dynamicStormFlash.cloudFilter, /brightness\(/,
    'Cloud volume brightens during the same lightning strike');
  console.log('Storm flash style debug:', JSON.stringify(dynamicStormFlash));
  assert.ok(dynamicStormFlash.inlineOpacity, 'The flash overlay receives an inline peak opacity');
  assert.ok(dynamicStormFlash.boltOpacity > 0.5, 'The bolt becomes visible at peak intensity');
  assert.match(dynamicStormFlash.boltX, /%$/, 'Bolt position changes between strikes');
  assert.equal(dynamicStormFlash.cleared, true, 'Flash state is cleared after the strike');

  const fullSceneMatrix = await page.evaluate(() => {
    const sky = document.getElementById('sky');
    const periods = ['morning', 'day', 'evening', 'night'];
    const scenes = [
      { name: 'clear', code: 800, expectedLayers: [] },
      { name: 'cloudy', code: 804, expectedLayers: [] },
      { name: 'rain', code: 502, expectedLayers: ['rain-container', 'wind-lines'] },
      { name: 'thunder', code: 211, expectedLayers: ['lightning', 'rain-container', 'wind-lines'] },
      { name: 'snow', code: 601, expectedLayers: ['snow-container'] },
      { name: 'fog', code: 741, expectedLayers: ['fog'] }
    ];
    const results = [];
    let persistentChildCount = null;

    for (const scene of scenes) {
      for (const period of periods) {
        document.body.classList.remove('theme-morning', 'theme-day', 'theme-evening', 'theme-night');
        document.body.classList.add('theme-' + period);
        currentWeatherCode = scene.code;
        currentWindSpeed = 8;
        currentVisibility = scene.code === 741 ? 900 : 10000;
        currentWindDirection = 225;
        updateSkyElements(period);
        applyWeatherEffects(scene.code, period, 8);

        const effectLayerIds = [...sky.querySelectorAll(
          '#rain-container, #snow-container, #wind-lines, #lightning, #fog'
        )].map(layer => layer.id).sort();
        const childCountWithoutEffects = sky.children.length - effectLayerIds.length;
        if (persistentChildCount === null) persistentChildCount = childCountWithoutEffects;

        results.push({
          scene: scene.name,
          period,
          expectedLayers: [...scene.expectedLayers].sort(),
          effectLayerIds,
          childCountWithoutEffects,
          documentWidth: document.documentElement.scrollWidth,
          viewportWidth: document.documentElement.clientWidth,
          sunOpacity: Number(document.getElementById('sun').style.opacity),
          moonOpacity: Number(document.getElementById('moon').style.opacity),
          cloudLayerCount: sky.querySelectorAll('.weather-cloud-layers').length,
          visibleCloudCount: [...sky.querySelectorAll('.weather-cloud-layer')]
            .filter(layer => getComputedStyle(layer).display !== 'none' &&
              Number(getComputedStyle(layer).opacity) > 0).length,
          rainParticles: sky.querySelectorAll('#rain-container .raindrop').length,
          snowParticles: sky.querySelectorAll('#snow-container .snowflake').length
        });
      }
    }

    return {
      results,
      persistentChildCount,
      fixedLayerCounts: {
        sun: sky.querySelectorAll('#sun').length,
        moon: sky.querySelectorAll('#moon').length,
        stars: sky.querySelectorAll('#stars').length,
        clouds: sky.querySelectorAll('.weather-cloud-layers').length
      }
    };
  });

  assert.equal(fullSceneMatrix.results.length, 24, 'All six weather scenes are tested in all four local-time periods');
  for (const state of fullSceneMatrix.results) {
    assert.deepEqual(state.effectLayerIds, state.expectedLayers,
      `Correct effect layers for ${state.scene} during ${state.period}`);
    assert.equal(state.childCountWithoutEffects, fullSceneMatrix.persistentChildCount,
      `Persistent sky DOM remains stable for ${state.scene} during ${state.period}`);
    assert.ok(state.documentWidth <= state.viewportWidth + 1,
      `No horizontal overflow for ${state.scene} during ${state.period}`);
    assert.equal(state.cloudLayerCount, 1, 'Cloud wrapper is never duplicated');
    if (state.scene === 'clear') {
      assert.equal(state.sunOpacity > 0, state.period !== 'night',
        `Sun visibility follows the time period for ${state.period}`);
    } else {
      assert.equal(state.sunOpacity, 0, `Sun is hidden in the ${state.scene} scene`);
      assert.ok(state.visibleCloudCount > 0, `Atmospheric cloud layers remain visible in ${state.scene}`);
    }
    assert.equal(state.moonOpacity > 0, state.period === 'night',
      `Moon visibility follows the time period for ${state.period}`);
    assert.ok(state.rainParticles <= 100 && state.snowParticles <= 100,
      'Particle counts stay within their hard caps');
  }
  assert.deepEqual(fullSceneMatrix.fixedLayerCounts, { sun: 1, moon: 1, stars: 1, clouds: 1 },
    'Celestial and cloud roots remain unique after all 24 scene combinations');

  const repeatedSceneCycles = await page.evaluate(() => {
    const sky = document.getElementById('sky');
    const codes = [800, 502, 601, 211, 741, 804];
    const expected = {
      800: [],
      502: ['rain-container', 'wind-lines'],
      601: ['snow-container'],
      211: ['lightning', 'rain-container', 'wind-lines'],
      741: ['fog'],
      804: []
    };
    let persistentChildren = null;
    const samples = [];

    for (let index = 0; index < 20; index++) {
      const code = codes[index % codes.length];
      currentWeatherCode = code;
      currentWindSpeed = 8;
      applyWeatherEffects(code, 'day', 8);
      const ids = [...sky.querySelectorAll(
        '#rain-container, #snow-container, #wind-lines, #lightning, #fog'
      )].map(layer => layer.id).sort();
      const stableChildren = sky.children.length - ids.length;
      if (persistentChildren === null) persistentChildren = stableChildren;
      samples.push({
        ids,
        expected: [...expected[code]].sort(),
        stableChildren,
        rainCount: sky.querySelectorAll('#rain-container .raindrop').length,
        snowCount: sky.querySelectorAll('#snow-container .snowflake').length
      });
    }
    return { samples, persistentChildren, totalChildren: sky.children.length };
  });

  for (const [index, sample] of repeatedSceneCycles.samples.entries()) {
    assert.deepEqual(sample.ids, sample.expected,
      `Weather cycle ${index + 1} has only its expected effect layers`);
    assert.equal(sample.stableChildren, repeatedSceneCycles.persistentChildren,
      `Weather cycle ${index + 1} does not grow persistent sky DOM`);
    assert.ok(sample.rainCount <= 100 && sample.snowCount <= 100,
      `Weather cycle ${index + 1} respects particle limits`);
  }

  const stableSkyChildren = await page.evaluate(() => document.getElementById('sky').children.length);
  await page.evaluate(() => {
    for (let index = 0; index < 20; index++) {
      const code = [800, 502, 601, 211, 741, 804][index % 6];
      currentWeatherCode = code;
      applyWeatherEffects(code, 'day', 8);
    }
  });
  assert.equal(await page.evaluate(() => document.getElementById('sky').children.length), stableSkyChildren,
    'Twenty additional weather changes do not accumulate DOM nodes');

  const starVisibilityProfiles = await page.evaluate(() => {
    const stars = document.getElementById('stars');
    const samples = [
      { label: 'dusk-clear', hour: 17, code: 800, expected: 0 },
      { label: 'twilight-clear', hour: 19, code: 800, expected: 0.45 },
      { label: 'night-clear', hour: 23, code: 800, expected: 0.9 },
      { label: 'dawn-clear', hour: 6.5, code: 800, expected: 0.45 },
      { label: 'day-clear', hour: 12, code: 800, expected: 0 },
      { label: 'night-partly-cloudy', hour: 23, code: 801, expected: 0.62 },
      { label: 'night-cloudy', hour: 23, code: 802, expected: 0.36 },
      { label: 'night-overcast', hour: 23, code: 804, expected: 0.04 },
      { label: 'night-rain', hour: 23, code: 502, expected: 0.04 },
      { label: 'night-fog', hour: 23, code: 741, expected: 0.02 }
    ];

    return samples.map(sample => {
      updateStarsVisibility(getNightTransitionFactor(sample.hour), sample.code);
      return {
        ...sample,
        actual: Number(stars.style.opacity),
        ariaHidden: stars.getAttribute('aria-hidden')
      };
    });
  });
  for (const sample of starVisibilityProfiles) {
    assert.ok(Math.abs(sample.actual - sample.expected) < 0.001,
      `Star visibility for ${sample.label}: expected ${sample.expected}, got ${sample.actual}`);
    assert.equal(sample.ariaHidden, sample.expected <= 0.005 ? 'true' : 'false',
      `Star accessibility state for ${sample.label}`);
  }

  const lunarHaloProfiles = await page.evaluate(() => {
    const moon = document.getElementById('moon');
    const readHalo = () => ({
      opacity: Number(moon.style.getPropertyValue('--moon-halo-opacity')),
      spread: parseFloat(moon.style.getPropertyValue('--moon-halo-spread')),
      illumination: Number(moon.dataset.illumination)
    });
    const profiles = {};
    for (const [name, code] of [
      ['clear', 800],
      ['partlyCloudy', 801],
      ['overcast', 804],
      ['rain', 502],
      ['snow', 601],
      ['fog', 741]
    ]) {
      currentWeatherCode = code;
      updateSkyElements('night');
      profiles[name] = readHalo();
    }
    return profiles;
  });
  assert.ok(lunarHaloProfiles.clear.opacity > lunarHaloProfiles.partlyCloudy.opacity);
  assert.ok(lunarHaloProfiles.partlyCloudy.opacity > lunarHaloProfiles.overcast.opacity);
  assert.ok(lunarHaloProfiles.overcast.opacity > lunarHaloProfiles.rain.opacity);
  assert.ok(lunarHaloProfiles.snow.opacity > lunarHaloProfiles.fog.opacity);
  for (const profile of Object.values(lunarHaloProfiles)) {
    assert.ok(profile.opacity >= 0 && profile.opacity <= 0.58);
    assert.ok(profile.spread >= 10 && profile.spread <= 48);
    assert.ok(profile.illumination >= 0 && profile.illumination <= 1);
  }

  const celestialAccessibility = await page.evaluate(() => {
    const moon = document.getElementById('moon');
    const stars = document.getElementById('stars');
    const previousStarsOpacity = stars.style.opacity;
    updateSkyElements('day');
    const day = {
      moonRole: moon.getAttribute('role'),
      moonHidden: moon.getAttribute('aria-hidden'),
      moonLabel: moon.getAttribute('aria-label')
    };
    updateSkyElements('night');
    const night = {
      moonRole: moon.getAttribute('role'),
      moonHidden: moon.getAttribute('aria-hidden'),
      moonLabel: moon.getAttribute('aria-label')
    };
    stars.style.opacity = previousStarsOpacity;
    return { day, night };
  });
  assert.equal(celestialAccessibility.day.moonRole, 'img');
  assert.equal(celestialAccessibility.day.moonHidden, 'true',
    'The invisible daytime moon is hidden from assistive technology');
  assert.equal(celestialAccessibility.night.moonRole, 'img');
  assert.equal(celestialAccessibility.night.moonHidden, 'false',
    'The visible nighttime moon is announced');
  assert.match(celestialAccessibility.night.moonLabel, /^Луна: /);

  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await page.evaluate(() => updateWeatherTheme(800, 0, 8));
  const celestialMotion = await page.evaluate(() => ({
    starsTransition: getComputedStyle(document.getElementById('stars')).transitionDuration,
    moonTransition: getComputedStyle(document.getElementById('moon')).transitionDuration,
    starAnimation: getComputedStyle(document.querySelector('#stars .star')).animationName
  }));
  assert.notEqual(celestialMotion.starsTransition, '0s',
    'Stars use a gradual opacity transition when motion is allowed');
  await page.emulateMedia({ reducedMotion: 'reduce' });
  const reducedCelestialMotion = await page.evaluate(() => ({
    starsTransition: getComputedStyle(document.getElementById('stars')).transitionDuration,
    moonTransition: getComputedStyle(document.getElementById('moon')).transitionDuration,
    starAnimation: getComputedStyle(document.querySelector('#stars .star')).animationName
  }));
  assert.equal(reducedCelestialMotion.starsTransition, '0s',
    'Reduced motion disables star fade transitions');
  assert.equal(reducedCelestialMotion.moonTransition, '0s',
    'Reduced motion disables moon movement transitions');
  assert.equal(reducedCelestialMotion.starAnimation, 'none',
    'Reduced motion disables star twinkle animations');

  const lightingProfiles = await page.evaluate(() => {
    const sky = document.getElementById('sky');
    return ['morning', 'day', 'evening', 'night'].map(timeOfDay => {
      sky.dataset.timeOfDay = timeOfDay;
      const style = getComputedStyle(sky);
      return {
        timeOfDay,
        rain: style.getPropertyValue('--rain-streak-core').trim(),
        snow: style.getPropertyValue('--snow-fill').trim(),
        lightning: style.getPropertyValue('--lightning-flash-strong').trim(),
        storm: style.getPropertyValue('--storm-flash-peak').trim()
      };
    });
  });
  for (const key of ['rain', 'snow', 'lightning', 'storm']) {
    assert.ok(lightingProfiles.every(profile => profile[key]), `Missing ${key} lighting profile`);
    assert.equal(new Set(lightingProfiles.map(profile => profile[key])).size, 4,
      `${key} lighting changes across morning, day, evening and night`);
  }

  const cloudLightingMatrix = await page.evaluate(() => {
    const sky = document.getElementById('sky');
    const read = () => ({
      period: sky.dataset.cloudLighting,
      highlight: sky.style.getPropertyValue('--cloud-light-a').trim(),
      rim: sky.style.getPropertyValue('--cloud-rim').trim(),
      lightOpacity: Number(sky.style.getPropertyValue('--cloud-light-opacity')),
      shadowOpacity: Number(sky.style.getPropertyValue('--cloud-shadow-opacity'))
    });
    const profiles = {};
    for (const [name, period, code] of [
      ['morning', 'morning', 800],
      ['day', 'day', 800],
      ['evening', 'evening', 800],
      ['night', 'night', 800],
      ['storm', 'night', 211],
      ['rain', 'day', 502],
      ['snow', 'day', 601],
      ['fog', 'morning', 741],
      ['overcast', 'day', 804]
    ]) {
      currentWeatherCode = code;
      updateSkyElements(period);
      updateCloudAtmosphere(code, 5);
      profiles[name] = read();
    }
    return profiles;
  });
  assert.equal(new Set(['morning', 'day', 'evening', 'night']
    .map(key => cloudLightingMatrix[key].highlight)).size, 4,
  'Cloud highlights use four distinct solar color profiles');
  assert.notEqual(cloudLightingMatrix.morning.rim, cloudLightingMatrix.evening.rim);
  assert.ok(cloudLightingMatrix.storm.lightOpacity < cloudLightingMatrix.night.lightOpacity);
  assert.ok(cloudLightingMatrix.rain.lightOpacity < cloudLightingMatrix.day.lightOpacity);
  assert.ok(cloudLightingMatrix.fog.lightOpacity < cloudLightingMatrix.rain.lightOpacity);
  assert.ok(cloudLightingMatrix.snow.lightOpacity > cloudLightingMatrix.day.lightOpacity);
  assert.ok(cloudLightingMatrix.overcast.lightOpacity < cloudLightingMatrix.day.lightOpacity);
  for (const profile of Object.values(cloudLightingMatrix)) {
    assert.ok(profile.lightOpacity >= 0 && profile.lightOpacity <= 1);
    assert.ok(profile.shadowOpacity >= 0 && profile.shadowOpacity <= 1);
  }

  const fogProfileMatrix = await page.evaluate(() => {
    const visibilityLevels = [250, 1500, 4000, 8000, 10000];
    const visibility = visibilityLevels.map(meters => {
      const profile = getFogProfile(741, meters, 6, 225, 'day');
      return { meters, density: profile.density };
    });
    const calm = getFogProfile(741, 900, 0, 0, 'morning');
    const windy = getFogProfile(741, 900, 20, 225, 'morning');
    const night = getFogProfile(741, 900, 20, 225, 'night');
    return {
      visibility,
      calmDuration: calm.css['--fog-mid-duration'],
      windyDuration: windy.css['--fog-mid-duration'],
      morningTint: calm.css['--fog-base-color'],
      nightTint: night.css['--fog-base-color'],
      driftX: windy.css['--fog-end-x'],
      driftY: windy.css['--fog-end-y']
    };
  });
  for (let index = 1; index < fogProfileMatrix.visibility.length; index++) {
    assert.ok(fogProfileMatrix.visibility[index - 1].density > fogProfileMatrix.visibility[index].density,
      'Fog density decreases as visibility improves');
  }
  assert.ok(parseFloat(fogProfileMatrix.windyDuration) < parseFloat(fogProfileMatrix.calmDuration),
    'Stronger wind accelerates fog movement');
  assert.notEqual(fogProfileMatrix.morningTint, fogProfileMatrix.nightTint,
    'Fog scattering color follows the local time of day');
  assert.ok(fogProfileMatrix.driftX && fogProfileMatrix.driftY,
    'Wind direction produces two-axis fog drift');

  const scenePaletteMatrix = await page.evaluate(() => {
    const sky = document.getElementById('sky');
    const periods = ['morning', 'day', 'evening', 'night'];
    const scenes = ['clear', 'cloudy', 'rain', 'thunder', 'snow', 'fog'];
    return scenes.map(scene => ({
      scene,
      palettes: periods.map(period => {
        document.body.classList.remove('theme-morning', 'theme-day', 'theme-evening', 'theme-night');
        document.body.classList.add('theme-' + period);
        sky.dataset.weather = scene;
        sky.dataset.timeOfDay = period;
        return {
          period,
          background: getComputedStyle(sky).backgroundImage
        };
      })
    }));
  });
  for (const scene of scenePaletteMatrix) {
    assert.ok(scene.palettes.every(palette => /gradient/i.test(palette.background)),
      `Every ${scene.scene} time period has an atmospheric background`);
    assert.equal(new Set(scene.palettes.map(palette => palette.background)).size, 4,
      `${scene.scene} has four distinct morning/day/evening/night palettes`);
  }
  const sceneTransition = await page.evaluate(() => {
    const sky = document.getElementById('sky');
    sky.querySelector('.sky-scene-transition')?.remove();
    document.body.classList.remove('theme-morning', 'theme-day', 'theme-evening', 'theme-night');
    document.body.classList.add('theme-day');
    sky.dataset.weather = 'clear';
    sky.dataset.timeOfDay = 'day';
    const previousBackground = getComputedStyle(sky).backgroundImage;

    updateWeatherTheme(502, 0, 8);
    const layer = sky.querySelector('.sky-scene-transition');
    const result = layer ? {
      previousBackground,
      capturedBackground: layer.style.backgroundImage,
      animation: getComputedStyle(layer).animationName,
      zIndex: getComputedStyle(layer).zIndex,
      targetScene: sky.dataset.weather
    } : null;
    layer?.dispatchEvent(new Event('animationend'));
    return { ...result, removedAfterFade: !sky.querySelector('.sky-scene-transition') };
  });
  assert.ok(sceneTransition, 'A weather change creates a background crossfade layer');
  assert.equal(sceneTransition.capturedBackground, sceneTransition.previousBackground,
    'The transition layer preserves the exact previous atmospheric gradient');
  assert.equal(sceneTransition.animation, 'skySceneCrossfade');
  assert.equal(sceneTransition.zIndex, '0', 'The crossfade remains behind stars, celestial bodies and clouds');
  assert.equal(sceneTransition.targetScene, 'rain');
  assert.equal(sceneTransition.removedAfterFade, true, 'The previous scene layer is cleaned up after the fade');

  await page.emulateMedia({ reducedMotion: 'reduce' });
  const reducedSceneTransition = await page.evaluate(() => {
    const sky = document.getElementById('sky');
    updateWeatherTheme(601, 0, 8);
    return Boolean(sky.querySelector('.sky-scene-transition'));
  });
  assert.equal(reducedSceneTransition, false, 'Reduced motion skips the background crossfade');

  await page.emulateMedia({ reducedMotion: 'no-preference' });
  const rapidSceneTransitions = await page.evaluate(() => {
    const sky = document.getElementById('sky');
    updateWeatherTheme(800, 0, 8);
    updateWeatherTheme(502, 0, 8);
    return sky.querySelectorAll('.sky-scene-transition').length;
  });
  assert.equal(rapidSceneTransitions, 1, 'Rapid weather changes keep at most one crossfade layer');

  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.waitForFunction(
    () => !document.querySelector('#sky .sky-scene-transition'),
    null,
    { timeout: 1500 }
  );
  const midFlightReducedMotionCleanup = await page.evaluate(
    () => !document.querySelector('#sky .sky-scene-transition')
  );
  assert.equal(midFlightReducedMotionCleanup, true,
    'Enabling reduced motion mid-transition removes the old scene layer immediately');

  const reducedStormFlash = await page.evaluate(() => {
    updateWeatherTheme(211, 0, 8);
    const sky = document.getElementById('sky');
    return {
      lightningLayer: Boolean(sky.querySelector('#lightning')),
      timerPending: lightningTimerId !== null,
      flashStage: sky.dataset.stormFlash || ''
    };
  });
  assert.equal(reducedStormFlash.lightningLayer, false,
    'Reduced motion does not create an animated lightning layer');
  assert.equal(reducedStormFlash.timerPending, false,
    'Reduced motion does not schedule lightning timers');
  assert.equal(reducedStormFlash.flashStage, '',
    'Reduced motion leaves the storm cloud volume unflashed');
  const reducedPrecipitation = await page.evaluate(() => {
    updateWeatherTheme(502, 0, 8);
    const rainParticles = document.querySelectorAll('#sky .raindrop').length;
    updateWeatherTheme(601, 0, 8);
    const snowParticles = document.querySelectorAll('#sky .snowflake').length;
    return { rainParticles, snowParticles };
  });
  assert.equal(reducedPrecipitation.rainParticles, 0, 'Reduced motion does not create animated rain particles');
  assert.equal(reducedPrecipitation.snowParticles, 0, 'Reduced motion does not create animated snow particles');

  const reducedClouds = await page.evaluate(() => {
    updateCloudAtmosphere(804, 8);
    const layers = [...document.querySelectorAll('#sky .weather-cloud-layer')];
    return layers.map(layer => ({
      display: getComputedStyle(layer).display,
      opacity: Number(getComputedStyle(layer).opacity),
      animation: getComputedStyle(layer).animationName
    }));
  });
  assert.equal(reducedClouds.filter(layer => layer.display !== 'none' && layer.opacity > 0).length, 1,
    'Reduced motion keeps one visible atmospheric cloud layer');
  assert.ok(reducedClouds.filter(layer => layer.display !== 'none').every(layer => layer.animation === 'none'),
    'Reduced-motion clouds remain static');
  await page.emulateMedia({ reducedMotion: 'no-preference' });

  // Verify decorative weather motion pauses in a background tab and resumes on return.
  await page.evaluate(() => {
    updateWeatherTheme(502, 0, 2);
    syncWeatherAnimationVisibility(false);
  });
  const pausedRain = await page.evaluate(() => ({
    visible: document.getElementById('sky').dataset.pageVisible,
    animation: getComputedStyle(document.querySelector('#sky .raindrop')).animationPlayState
  }));
  assert.equal(pausedRain.visible, 'false');
  assert.equal(pausedRain.animation, 'paused', 'Rain animation pauses when the tab is hidden');
  const resumedRain = await page.evaluate(() => {
    syncWeatherAnimationVisibility(true);
    return {
      visible: document.getElementById('sky').dataset.pageVisible,
      animation: getComputedStyle(document.querySelector('#sky .raindrop')).animationPlayState
    };
  });
  assert.equal(resumedRain.visible, 'true');
  assert.equal(resumedRain.animation, 'running', 'Rain animation resumes when the tab is visible');

  // Pseudo-elements own independent animations and must pause with their scene.
  const pausedStorm = await page.evaluate(() => {
    updateWeatherTheme(211, 0, 8);
    syncWeatherAnimationVisibility(false);
    const sky = document.getElementById('sky');
    const cloud = sky.querySelector('.weather-cloud-layer[data-weather="storm"]');
    const read = (element, pseudo = '') => {
      if (!element) return 'missing';
      return (pseudo ? getComputedStyle(element, pseudo) : getComputedStyle(element)).animationPlayState;
    };
    return {
      lightningTimerPending: lightningTimerId !== null,
      lightningFlashStage: sky.querySelector('#lightning')?.dataset.flash || '',
      stormCloud: read(cloud),
      wind: read(sky.querySelector('.wind-line')),
      sunAura: read(sky.querySelector('#sun'), '::after'),
      starTwinkle: read(sky.querySelector('#stars .star'))
    };
  });
  assert.equal(pausedStorm.lightningTimerPending, false,
    'The irregular lightning scheduler stops while the tab is hidden');
  assert.equal(pausedStorm.lightningFlashStage, '',
    'An in-progress flash is cleared when the tab is hidden');
  assert.ok(['stormCloud', 'wind', 'sunAura', 'starTwinkle'].every(key => pausedStorm[key] === 'paused'),
    `Cloud, wind, sun and star animations pause in background: ${JSON.stringify(pausedStorm)}`);

  const resumedStorm = await page.evaluate(() => {
    syncWeatherAnimationVisibility(true);
    const sky = document.getElementById('sky');
    const cloud = sky.querySelector('.weather-cloud-layer[data-weather="storm"]');
    const read = (element, pseudo = '') => {
      if (!element) return 'missing';
      return (pseudo ? getComputedStyle(element, pseudo) : getComputedStyle(element)).animationPlayState;
    };
    return {
      lightningTimerPending: lightningTimerId !== null,
      cloud: read(cloud),
      wind: read(sky.querySelector('.wind-line')),
      sunAura: read(sky.querySelector('#sun'), '::after'),
      starTwinkle: read(sky.querySelector('#stars .star'))
    };
  });
  assert.equal(resumedStorm.lightningTimerPending, true,
    'The irregular lightning scheduler resumes when the tab becomes visible');
  assert.ok(['cloud', 'wind', 'sunAura', 'starTwinkle'].every(key => resumedStorm[key] === 'running'),
    `Storm scene animations resume when visible: ${JSON.stringify(resumedStorm)}`);

  const pausedFog = await page.evaluate(() => {
    updateWeatherTheme(741, 0, 2);
    syncWeatherAnimationVisibility(false);
    const fog = document.getElementById('fog');
    return fog ? [
      getComputedStyle(fog, '::before').animationPlayState,
      getComputedStyle(fog, '::after').animationPlayState
    ] : ['missing', 'missing'];
  });
  assert.deepEqual(pausedFog, ['paused', 'paused'], 'Both volumetric fog layers pause in background');

  const resumedFog = await page.evaluate(() => {
    syncWeatherAnimationVisibility(true);
    const fog = document.getElementById('fog');
    return fog ? [
      getComputedStyle(fog, '::before').animationPlayState,
      getComputedStyle(fog, '::after').animationPlayState
    ] : ['missing', 'missing'];
  });
  assert.deepEqual(resumedFog, ['running', 'running'], 'Both volumetric fog layers resume on return');

  const pausedSnow = await page.evaluate(() => {
    updateWeatherTheme(601, 0, 2);
    syncWeatherAnimationVisibility(false);
    return getComputedStyle(document.querySelector('#sky .snowflake')).animationPlayState;
  });
  assert.equal(pausedSnow, 'paused', 'Snow particles pause in background');
  const resumedSnow = await page.evaluate(() => {
    syncWeatherAnimationVisibility(true);
    return getComputedStyle(document.querySelector('#sky .snowflake')).animationPlayState;
  });
  assert.equal(resumedSnow, 'running', 'Snow particles resume on return');
  await page.evaluate(() => updateWeatherTheme(800, 0, 2));

  // Restore the API-backed city scene before the rest of browser smoke.
  await page.evaluate(() => updateWeatherTheme(800, 0, 2));

  const search = page.locator('#header-search');
  await search.fill('Berlin');
  await search.press('Enter');
  await page.waitForFunction(() => document.querySelector('#main-city')?.textContent.includes('Berlin, DE'));
  await page.waitForFunction(() => document.querySelector('#search-results')?.style.display === 'none');
  assert.equal(await page.locator('#main-temp').innerText(), '12°C');
  assert.equal(await page.locator('#search-results').isVisible(), false, 'City suggestions close after selection');
  await page.screenshot({ path: path.join(screenshotDir, 'desktop-1440.png'), fullPage: true });

  for (const width of [320, 375, 390, 768, 1024, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    await page.waitForTimeout(100);
    const dimensions = await page.evaluate(() => ({
      viewport: document.documentElement.clientWidth,
      document: document.documentElement.scrollWidth
    }));
    await page.screenshot({ path: path.join(screenshotDir, `viewport-${width}.png`), fullPage: true });
    if (dimensions.document > dimensions.viewport + 1) {
      const offenders = await page.evaluate(() => {
        const viewportWidth = document.documentElement.clientWidth;
        return [...document.body.querySelectorAll('*')]
          .map(element => {
            const rect = element.getBoundingClientRect();
            const style = getComputedStyle(element);
            return {
              tag: element.tagName.toLowerCase(),
              id: element.id || '',
              className: typeof element.className === 'string' ? element.className.slice(0, 100) : '',
              left: Math.round(rect.left),
              right: Math.round(rect.right),
              width: Math.round(rect.width),
              overflowX: style.overflowX
            };
          })
          .filter(item => item.width > 0 && (item.left < -1 || item.right > viewportWidth + 1))
          .sort((a, b) => b.right - a.right)
          .slice(0, 15);
      });
      throw new Error(`Horizontal overflow at ${width}px: document ${dimensions.document}px, viewport ${dimensions.viewport}px. Offending elements: ${JSON.stringify(offenders)}`);
    }
    assert.ok(await page.locator('#main-city').isVisible(), `City label is visible at ${width}px`);
    assert.ok(await page.locator('#main-temp').isVisible(), `Temperature is visible at ${width}px`);
    if (width < 992) {
      assert.ok(await page.locator('#mobile-search').isVisible(), `Compact tablet/mobile search is visible at ${width}px`);
    } else {
      assert.ok(await page.locator('#header-search').isVisible(), `Desktop search is visible at ${width}px`);
    }
  }

  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({ path: path.join(screenshotDir, 'mobile-390.png'), fullPage: true });

  await page.evaluate(() => showScreen('rainmap'));
  await page.waitForFunction(() => document.querySelector('#screen-rainmap')?.classList.contains('active'));
  await page.waitForSelector('#weather-map iframe');
  assert.equal(await page.locator('[data-layer="precipitation"]').getAttribute('aria-pressed'), 'true');
  assert.ok(await page.locator('[data-layer="precipitation"]').evaluate(button => button.classList.contains('active')));
  assert.equal(await page.locator('[data-layer="temperature"]').getAttribute('aria-pressed'), 'false');
  assert.ok(!(await page.locator('[data-layer="temperature"]').evaluate(button => button.classList.contains('active'))));
  assert.match(await page.locator('#weather-map iframe').getAttribute('src'), /overlay=rain/);
  for (const [layer, overlay] of [['wind', 'wind'], ['temperature', 'temp'], ['clouds', 'clouds'], ['precipitation', 'rain']]) {
    await page.locator(`[data-layer="${layer}"]`).click();
    await page.waitForFunction(expected => document.querySelector('#weather-map iframe')?.src.includes(`overlay=${expected}`), overlay);
    assert.equal(await page.locator(`[data-layer="${layer}"]`).getAttribute('aria-pressed'), 'true');
    assert.ok(await page.locator(`[data-layer="${layer}"]`).evaluate(button => button.classList.contains('active')));
  }
  assert.ok(await page.locator('#weather-map iframe').isVisible(), 'Weather map is visible on mobile');
  assert.ok(await page.locator('.map-toolbar').isVisible(), 'Map controls remain visible on mobile');

  const fullscreenButton = page.locator('#map-fullscreen-btn');
  await fullscreenButton.click();
  await page.waitForFunction(() => {
    const container = document.querySelector('.weather-map-container');
    return document.fullscreenElement === container || container?.classList.contains('map-fullscreen-fallback');
  });
  assert.ok(await page.locator('.map-toolbar').isVisible(), 'Map controls remain visible in fullscreen');
  assert.ok(await fullscreenButton.isVisible(), 'Fullscreen exit control remains available');
  assert.equal(await fullscreenButton.getAttribute('aria-pressed'), 'true');
  await fullscreenButton.click();
  await page.waitForFunction(() => {
    const container = document.querySelector('.weather-map-container');
    return document.fullscreenElement !== container && !container?.classList.contains('map-fullscreen-fallback');
  });
  assert.equal(await fullscreenButton.getAttribute('aria-pressed'), 'false');
  await page.screenshot({ path: path.join(screenshotDir, 'mobile-map-390.png'), fullPage: true });

  await page.evaluate(() => showScreen('home'));
  await page.locator('#favorite-btn').click();
  await page.waitForFunction(() => JSON.parse(localStorage.getItem('weathernow-favorites') || '[]').some(city => city.name === 'Berlin'));
  await page.evaluate(() => showScreen('favorites'));
  await page.waitForSelector('.favorite-city-card');
  assert.match(await page.locator('.favorite-city-name').first().innerText(), /Berlin/);
  await page.screenshot({ path: path.join(screenshotDir, 'favorites-390.png'), fullPage: true });
  await page.locator('.favorite-city-remove').first().click();
  await page.waitForFunction(() => document.querySelectorAll('.favorite-city-card').length === 0);

  assert.equal(await page.locator('#screen-compare').count(), 0, 'Removed comparison screen must not return');
  assert.equal(await page.locator('button[onclick*="compare"]').count(), 0, 'No navigation button should target the removed screen');

  await page.evaluate(() => showScreen('home'));
  const citySearch = page.locator('#mobile-search');
  await citySearch.fill('петер');
  await page.waitForFunction(() => {
    const results = document.querySelector('#search-results-mobile');
    return results && results.textContent.includes('Санкт-Петербург');
  });
  assert.match(await page.locator('#search-results-mobile').innerText(), /Санкт-Петербург/);
  await page.screenshot({ path: path.join(screenshotDir, 'city-search-390.png'), fullPage: true });

  await page.evaluate(() => openWeatherNotificationSettings());
  await page.waitForSelector('#notification-settings-dialog[open]');
  const dialogA11y = await page.evaluate(async () => {
    const dialog = document.querySelector('#notification-settings-dialog');
    const result = await axe.run(dialog, { runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'] } });
    return { violations: result.violations.map(item => ({ id: item.id, impact: item.impact, description: item.help, nodes: item.nodes.map(node => ({ target: node.target, html: node.html, summary: node.failureSummary })) })), passes: result.passes.length };
  });
  console.log('axe-core notification dialog audit:', JSON.stringify(dialogA11y));
  assert.equal(dialogA11y.violations.filter(item => ['critical', 'serious'].includes(item.impact)).length, 0, 'Notification dialog must have no critical or serious WCAG violations');
  assert.equal(await page.locator('#notification-enabled').isChecked(), false);
  await page.locator('#notification-enabled').check();
  await page.locator('#notification-wind-threshold').fill('2');
  await page.locator('#notification-wind').check();
  await page.locator('#notification-settings-dialog button[type="submit"]').click();
  await page.waitForFunction(() => JSON.parse(localStorage.getItem('weathernow-notification-settings') || '{}').enabled === true);
  await page.waitForFunction(() => window.__weatherNotifications.length > 0);
  assert.match(await page.evaluate(() => window.__weatherNotifications[0].title), /ветер/i);
  await page.screenshot({ path: path.join(screenshotDir, 'notifications-390.png'), fullPage: true });

  await context.setOffline(true);
  await page.waitForFunction(() => document.body.dataset.network === 'offline');
  assert.equal(await page.locator('#network-status').isVisible(), true);
  assert.equal(await page.locator('#network-retry-btn').isDisabled(), true);

  await context.setOffline(false);
  await page.waitForFunction(() => document.body.dataset.network === 'online');
  await page.waitForFunction(() => document.querySelector('#main-city')?.textContent.includes('Berlin, DE'));
  assert.equal(await page.locator('#network-retry-btn').isDisabled(), false);

  assert.ok(workerRequests.some(url => url.pathname === '/weather' && url.searchParams.get('q') === 'Москва'));
  assert.ok(workerRequests.some(url => url.pathname === '/weather' && url.searchParams.get('q') === 'Berlin'));
  assert.ok(workerRequests.some(url => url.pathname === '/forecast' && url.searchParams.get('q') === 'Berlin'));
  assert.ok(workerRequests.every(url => !url.searchParams.has('appid')), 'Browser requests must never expose an upstream API key');

  assert.deepEqual(pageErrors, [], `Browser runtime errors: ${pageErrors.join('; ')}`);
  console.log('Browser smoke passed: startup, forecast, city search, 320–1440px layouts, precipitation map and layer switching, favorites add/remove, instant Russian city search, configurable weather notifications, offline/online recovery, and API-key isolation. Screenshots saved.');
  await context.close();
} finally {
  await browser.close();
  await new Promise(resolve => server.close(resolve));
}
