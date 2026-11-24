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
          effectCount: sky.querySelectorAll('#rain-container, #snow-container, #wind-lines, #lightning, #fog').length,
          fogLayer: sky.querySelector('#fog') ? getComputedStyle(sky.querySelector('#fog'), '::before').backgroundImage : '',
          lightningBolt: sky.querySelector('#lightning') ? getComputedStyle(sky.querySelector('#lightning'), '::before').clipPath : '',
          stormCloudAnimation: sky.querySelector('.weather-cloud-layer[data-weather="storm"]') ? getComputedStyle(sky.querySelector('.weather-cloud-layer[data-weather="storm"]'), '::before').animationName : '',
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
      assert.ok(state.effectCount <= 1, `No leftover particle layers for ${name}`);
      if (hourTheme === 'night') {
        assert.ok(state.moonInlineOpacity > 0.85, `Moon receives visible night opacity for ${name}`);
      }
      if (code === 804 || code === 502 || code === 601 || code === 211 || code === 741) {
        assert.ok(state.cloudCount >= 1, `Cloud layer visible for ${name}`);
      }
      assert.equal(state.sunAnimation, 'none', `Sun glow is lightweight for ${name}`);
      if (code >= 700 && code < 800) {
        assert.match(state.fogLayer, /radial-gradient/i, 'Fog uses layered atmospheric gradients');
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
        assert.equal(state.stormCloudAnimation, 'stormCloudIllumination', 'Storm cloud highlights flash in sync with lightning');
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
    const sky = document.getElementById('sky');
    currentWeatherCode = 211;
    updateCloudAtmosphere(211, 8);
    const cloud = sky.querySelector('.weather-cloud-layer[data-weather="storm"]');
    return cloud ? getComputedStyle(cloud, '::before').animationName : '';
  });
  assert.equal(reducedStormFlash, 'none', 'Storm cloud flashes stop when reduced motion is enabled');
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
      lightning: read(sky.querySelector('#lightning')),
      lightningBolt: read(sky.querySelector('#lightning'), '::before'),
      stormCloud: read(cloud),
      stormCloudLight: read(cloud, '::before'),
      wind: read(sky.querySelector('.wind-line')),
      sunAura: read(sky.querySelector('#sun'), '::after'),
      starTwinkle: read(sky.querySelector('#stars .star'))
    };
  });
  assert.ok(Object.values(pausedStorm).every(state => state === 'paused'),
    `Storm, cloud, wind, sun and star motion pauses in background: ${JSON.stringify(pausedStorm)}`);

  const resumedStorm = await page.evaluate(() => {
    syncWeatherAnimationVisibility(true);
    const sky = document.getElementById('sky');
    const cloud = sky.querySelector('.weather-cloud-layer[data-weather="storm"]');
    const read = (element, pseudo = '') => {
      if (!element) return 'missing';
      return (pseudo ? getComputedStyle(element, pseudo) : getComputedStyle(element)).animationPlayState;
    };
    return [
      read(sky.querySelector('#lightning')),
      read(sky.querySelector('#lightning'), '::before'),
      read(cloud),
      read(cloud, '::before'),
      read(sky.querySelector('.wind-line')),
      read(sky.querySelector('#sun'), '::after'),
      read(sky.querySelector('#stars .star'))
    ];
  });
  assert.ok(resumedStorm.every(state => state === 'running'),
    `Storm scene motion resumes when visible: ${JSON.stringify(resumedStorm)}`);

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
