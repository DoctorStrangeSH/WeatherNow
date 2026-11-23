import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { mkdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

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

const browser = await chromium.launch({ headless: true });
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
    Object.defineProperty(navigator, 'geolocation', {
      configurable: true,
      value: { getCurrentPosition(_success, error) { error({ code: 1, message: 'Permission denied' }); } }
    });
  });
  page.on('pageerror', error => pageErrors.push(error.message));

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

  const search = page.locator('#header-search');
  await search.fill('Berlin');
  await search.press('Enter');
  await page.waitForFunction(() => document.querySelector('#main-city')?.textContent.includes('Berlin, DE'));
  assert.equal(await page.locator('#main-temp').innerText(), '12°C');
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
  console.log('Browser smoke passed: startup, forecast, city search, 320–1440px layouts, offline/online recovery, and API-key isolation. Screenshots saved.');
  await context.close();
} finally {
  await browser.close();
  await new Promise(resolve => server.close(resolve));
}
