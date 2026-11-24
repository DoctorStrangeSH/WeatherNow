const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const themeSource = fs.readFileSync(path.join(__dirname, '../js/theme.js'), 'utf8');
const chartSource = fs.readFileSync(path.join(__dirname, '../js/charts.js'), 'utf8');
const searchSource = fs.readFileSync(path.join(__dirname, '../js/search.js'), 'utf8');
const feelsLikeSource = fs.readFileSync(path.join(__dirname, '../js/feels-like.js'), 'utf8');
const styleSource = fs.readFileSync(path.join(__dirname, '../style.css'), 'utf8');

function loadInBrowserContext(source, additions = {}) {
  const context = vm.createContext({
    document: { addEventListener() {}, body: { classList: { contains: () => false } } },
    window: {
      getComputedStyle: () => ({
        getPropertyValue(name) {
          return ({
            '--text-primary': '#f3f7fc',
            '--text-muted': '#a9bbcf',
            '--card-border': 'rgba(179, 211, 239, 0.14)'
          })[name] || '';
        }
      })
    },
    ...additions
  });
  vm.runInContext(source, context);
  return context;
}

test('sun arc stays in the upper sky and never crosses the content area', () => {
  const context = loadInBrowserContext(themeSource);
  const positions = [5, 7.5, 10, 12.5, 15, 17.5, 20]
    .map(hour => vm.runInContext(`getSkyArcPosition(${hour}, 5, 20)`, context));

  assert.ok(positions.every(position => position.y >= 6 && position.y <= 24));
  assert.equal(positions[0].y, 6);
  assert.equal(positions.at(-1).y, 6);
  assert.ok(positions.some(position => position.y > 20));
});

test('chart palette follows active CSS theme tokens instead of a fixed day/night class', () => {
  const context = loadInBrowserContext(chartSource);
  const palette = vm.runInContext('getChartThemePalette()', context);

  assert.equal(palette.legend, '#f3f7fc');
  assert.equal(palette.ticks, '#a9bbcf');
  assert.equal(palette.grid, 'rgba(179, 211, 239, 0.14)');
});

test('chart palette falls back to readable colors when theme tokens are missing', () => {
  const context = loadInBrowserContext(chartSource, {
    window: { getComputedStyle: () => ({ getPropertyValue: () => '' }) }
  });
  const palette = vm.runInContext('getChartThemePalette()', context);

  assert.equal(palette.legend, '#f3f7fc');
  assert.equal(palette.ticks, '#a9bbcf');
  assert.equal(palette.grid, 'rgba(255, 255, 255, 0.14)');
});

test('closing city search invalidates pending requests and prevents stale suggestions', () => {
  const elements = {
    'search-results': { style: {}, setAttribute() {} },
    'search-results-mobile': { style: {}, setAttribute() {} }
  };
  const context = loadInBrowserContext(searchSource, {
    document: {
      addEventListener() {},
      body: { classList: { contains: () => false } },
      getElementById(id) { return elements[id] || null; }
    },
    clearTimeout() {}
  });
  vm.runInContext("searchRequestIds['search-results'] = 4; searchRequestIds['search-results-mobile'] = 2; closeSearchResults();", context);
  assert.equal(vm.runInContext("searchRequestIds['search-results']", context), 5);
  assert.equal(vm.runInContext("searchRequestIds['search-results-mobile']", context), 3);
  assert.equal(elements['search-results'].style.display, 'none');
  assert.equal(elements['search-results-mobile'].style.display, 'none');
});

test('all chart scripts use the active theme palette without stale day/night variables', () => {
  assert.doesNotMatch(chartSource, /\bisDark\b/);
  assert.doesNotMatch(feelsLikeSource, /\bisDark\b/);
  assert.match(feelsLikeSource, /color: palette\.ticks/);
});


test('ambient star count scales down on compact and low-resource devices', () => {
  const compact = loadInBrowserContext(themeSource, {
    navigator: { deviceMemory: 8, hardwareConcurrency: 8 },
    window: { innerWidth: 375, matchMedia: () => ({ matches: false }) }
  });
  assert.equal(compact.getStarCount(), 40);

  const lowResource = loadInBrowserContext(themeSource, {
    navigator: { deviceMemory: 2, hardwareConcurrency: 2 },
    window: { innerWidth: 1280, matchMedia: () => ({ matches: false }) }
  });
  assert.equal(lowResource.getStarCount(), 35);

  const desktop = loadInBrowserContext(themeSource, {
    navigator: { deviceMemory: 8, hardwareConcurrency: 8 },
    window: { innerWidth: 1440, matchMedia: () => ({ matches: false }) }
  });
  assert.equal(desktop.getStarCount(), 100);
});


test('cloud depth scales with device capability while retaining full desktop atmosphere', () => {
  const compact = loadInBrowserContext(themeSource, {
    navigator: { deviceMemory: 8, hardwareConcurrency: 8 },
    window: { innerWidth: 375, matchMedia: () => ({ matches: false }) }
  });
  assert.equal(compact.getActiveCloudLayerCount(), 1);

  const midRange = loadInBrowserContext(themeSource, {
    navigator: { deviceMemory: 4, hardwareConcurrency: 4 },
    window: { innerWidth: 1024, matchMedia: () => ({ matches: false }) }
  });
  assert.equal(midRange.getActiveCloudLayerCount(), 2);

  const desktop = loadInBrowserContext(themeSource, {
    navigator: { deviceMemory: 8, hardwareConcurrency: 8 },
    window: { innerWidth: 1440, matchMedia: () => ({ matches: false }) }
  });
  assert.equal(desktop.getActiveCloudLayerCount(), 3);
});


test('rain, snow and wind particle containers isolate layout and paint', () => {
  for (const selector of ['.rain-container', '.snow-container', '.wind-lines']) {
    const start = styleSource.indexOf(selector + ' {');
    assert.notEqual(start, -1, selector + ' rule should exist');
    const end = styleSource.indexOf('}', start);
    const rule = styleSource.slice(start, end);
    assert.match(rule, /contain:\s*layout paint;/);
    assert.match(rule, /isolation:\s*isolate;/);
  }
});


test('weather effect cleanup is idempotent and preserves permanent sky elements', () => {
  const sky = {
    children: [],
    querySelectorAll(selector) {
      const id = selector.slice(1);
      return this.children.filter(node => node.id === id);
    },
    appendChild(node) {
      this.children.push(node);
      node.remove = () => {
        const index = this.children.indexOf(node);
        if (index !== -1) this.children.splice(index, 1);
      };
    }
  };

  for (const id of ['rain-container', 'rain-container', 'snow-container', 'wind-lines', 'lightning', 'fog', 'sun', 'moon']) {
    sky.appendChild({ id });
  }

  const context = loadInBrowserContext(themeSource, {
    document: {
      addEventListener() {},
      body: { classList: { contains: () => false } },
      getElementById(id) {
        return id === 'sky' ? sky : null;
      }
    }
  });

  vm.runInContext('clearWeatherEffects()', context);
  assert.deepEqual(sky.children.map(node => node.id), ['sun', 'moon']);

  vm.runInContext('clearWeatherEffects()', context);
  assert.deepEqual(sky.children.map(node => node.id), ['sun', 'moon']);
});


test('reinitializing sky elements reuses the moon and existing star field', () => {
  const elements = new Map();
  const sky = {
    children: [],
    appendChild(node) {
      this.children.push(node);
      elements.set(node.id, node);
      node.parentNode = this;
      return node;
    },
    querySelector(selector) {
      if (selector === '.weather-cloud-layers') return this.children.find(node => node.className === 'weather-cloud-layers') || null;
      return null;
    }
  };
  const document = {
    addEventListener() {},
    body: { classList: { contains: () => false } },
    getElementById(id) { return id === 'sky' ? sky : elements.get(id) || null; },
    createElement() {
      const node = {
        children: [],
        style: { setProperty() {} },
        dataset: {},
        className: '',
        id: '',
        appendChild(child) { this.children.push(child); child.parentNode = this; },
        setAttribute() {},
        set innerHTML(value) { if (value === '') this.children = []; }
      };
      return node;
    }
  };
  const context = loadInBrowserContext(themeSource, {
    document,
    navigator: { deviceMemory: 8, hardwareConcurrency: 8 },
    window: { innerWidth: 1440, matchMedia: () => ({ matches: false }) }
  });

  vm.runInContext('createSkyElements()', context);
  const moon = elements.get('moon');
  const stars = elements.get('stars');
  const starNodes = stars.children.slice();
  const skyChildCount = sky.children.length;

  vm.runInContext('createSkyElements()', context);

  assert.equal(elements.get('moon'), moon);
  assert.equal(elements.get('stars'), stars);
  assert.deepEqual(stars.children, starNodes);
  assert.equal(sky.children.length, skyChildCount);
});


test('reinitializing theme replaces the refresh interval instead of stacking timers', () => {
  let nextTimerId = 0;
  const activeTimers = new Set();
  const clearedTimers = [];
  const document = {
    addEventListener() {},
    body: {
      classList: {
        remove() {},
        add() {},
        contains: () => false
      }
    },
    getElementById() { return null; }
  };
  const context = loadInBrowserContext(themeSource, {
    document,
    setInterval(callback, delay) {
      const id = ++nextTimerId;
      activeTimers.add(id);
      return id;
    },
    clearInterval(id) {
      activeTimers.delete(id);
      clearedTimers.push(id);
    },
    Date,
    window: { innerWidth: 1440, matchMedia: () => ({ matches: false }) },
    navigator: { deviceMemory: 8, hardwareConcurrency: 8 }
  });

  vm.runInContext('initTheme(); initTheme(); initTheme();', context);

  assert.equal(nextTimerId, 3);
  assert.deepEqual(clearedTimers, [1, 2]);
  assert.deepEqual([...activeTimers], [3]);
});


test('weather map controls occupy a separate row above the provider iframe', () => {
  const mapStyles = styleSource.slice(styleSource.lastIndexOf('/* Map controls live above the provider iframe'));
  assert.match(mapStyles, /\.map-toolbar\s*\{[^}]*position:\s*relative;/s);
  assert.match(mapStyles, /\.weather-map-container\s*\{[^}]*display:\s*flex;/s);
  assert.match(mapStyles, /#weather-map\s*\{[^}]*min-height:\s*500px;/s);
});

test('moon is layered above clouds and does not run a continuous glow animation', () => {
  const moonStyles = styleSource.slice(styleSource.lastIndexOf('/* Keep the moon visible above cloud layers'));
  assert.match(moonStyles, /#sky \.moon\s*\{[^}]*z-index:\s*3/s);
  assert.match(moonStyles, /animation:\s*none\s*!important;/);
});


test('weather sky has distinct time-of-day palettes for clear, storm, snow and fog scenes', () => {
  const sceneStyles = styleSource.slice(styleSource.lastIndexOf('/* Distinct cinematic palettes'));
  for (const token of [
    'body.theme-morning #sky[data-weather="clear"]',
    'body.theme-day #sky[data-weather="clear"]',
    'body.theme-evening #sky[data-weather="clear"]',
    'body.theme-night #sky[data-weather="clear"]',
    'body.theme-night #sky[data-weather="thunder"]',
    'body.theme-night #sky[data-weather="snow"]',
    'body.theme-night #sky[data-weather="fog"]'
  ]) {
    assert.ok(sceneStyles.includes(token), `Missing scene palette: ${token}`);
  }
  assert.match(sceneStyles, /weather-cloud-layer\[data-weather="storm"\]/);
  assert.match(sceneStyles, /weather-cloud-layer\[data-weather="rain"\]/);
});


test('fog uses layered slow atmospheric drift and respects reduced motion', () => {
  const fogStart = styleSource.indexOf('#fog {');
  const fogEnd = styleSource.indexOf('/* стеклянные эффекты */', fogStart);
  const fogStyles = styleSource.slice(fogStart, fogEnd);
  assert.match(fogStyles, /#fog::before/);
  assert.match(fogStyles, /#fog::after/);
  assert.match(fogStyles, /@keyframes fogDrift/);
  assert.match(fogStyles, /prefers-reduced-motion:\s*reduce/);
});

test('storm scene includes a visible lightning bolt with a restrained flash cycle', () => {
  const lightningStart = styleSource.indexOf('#lightning::before');
  const lightningEnd = styleSource.indexOf('/* стеклянные эффекты */', lightningStart);
  const lightningStyles = styleSource.slice(lightningStart, lightningEnd);
  assert.match(lightningStyles, /clip-path:\s*polygon/);
  assert.match(lightningStyles, /@keyframes lightningBolt/);
  assert.match(lightningStyles, /91%\s*\{/);
});


test('precipitation wind profile is bounded for calm and extreme wind', () => {
  const context = loadInBrowserContext(themeSource);
  const calm = vm.runInContext('getPrecipitationWindProfile(0)', context);
  const windy = vm.runInContext('getPrecipitationWindProfile(12)', context);
  const storm = vm.runInContext('getPrecipitationWindProfile(1000)', context);
  assert.equal(calm.rainAngle, 0);
  assert.equal(calm.snowDrift, 0);
  assert.equal(windy.rainAngle, 20);
  assert.equal(windy.snowDrift, 29);
  assert.equal(storm.rainAngle, 30);
  assert.equal(storm.snowDrift, 48);
});

test('rain and snow preserve reduced-motion support and use wind-aware transforms', () => {
  assert.match(styleSource, /rotate\(var\(--rain-angle, 0deg\)\)/);
  assert.match(styleSource, /translate3d\(var\(--snow-drift, 0px\), 100vh, 0\)/);
  assert.match(themeSource, /createRain\(Math\.round\(motionProfile\.rainCount \* effectScale\), true, precipitationWind\)/);
  assert.match(themeSource, /createSnow\(Math\.round\(motionProfile\.snowCount \* effectScale\), precipitationWind\)/);
});


test('reduced-motion keeps one static cloud layer when weather has clouds', () => {
  const layers = Array.from({ length: 3 }, () => ({
    style: { setProperty() {} },
    dataset: {}
  }));
  const sky = {
    querySelector() { return {}; },
    querySelectorAll(selector) {
      return selector === '.weather-cloud-layer' ? layers : [];
    }
  };
  const context = loadInBrowserContext(themeSource, {
    document: {
      addEventListener() {},
      getElementById(id) { return id === 'sky' ? sky : null; }
    },
    navigator: { deviceMemory: 8, hardwareConcurrency: 8 },
    window: {
      innerWidth: 1440,
      matchMedia: () => ({ matches: true })
    }
  });
  vm.runInContext('updateCloudAtmosphere(804, 5)', context);
  assert.equal(layers[0].style.display, '');
  assert.ok(Number(layers[0].style.opacity) > 0);
  assert.equal(layers[1].style.display, 'none');
  assert.equal(layers[2].style.display, 'none');
});

test('solar illumination does not animate expensive box shadows', () => {
  const styles = styleSource.slice(styleSource.lastIndexOf('/* Low-cost solar illumination:'));
  assert.match(styles, /#sky \.sun\s*\{[^}]*animation:\s*none;/s);
  assert.match(styles, /#sky \.sun::after\s*\{[^}]*animation:\s*sunAura/s);
  assert.match(styles, /prefers-reduced-motion:\s*reduce/);
});


test('cloud layers build volume from highlight and shadow pseudo-elements without extra nodes', () => {
  const volumeStyles = styleSource.slice(styleSource.lastIndexOf('/* Sculpted cloud volume:'));
  assert.match(volumeStyles, /\.weather-cloud-layer::before/);
  assert.match(volumeStyles, /\.weather-cloud-layer::after/);
  assert.match(volumeStyles, /radial-gradient\(ellipse/);
  assert.match(volumeStyles, /\[data-weather="storm"\]::after/);
  assert.match(volumeStyles, /\[data-weather="snow"\]::before/);
  assert.match(volumeStyles, /prefers-reduced-motion:\s*reduce/);
});


test('star field uses five depth levels and limits twinkle to a subset', () => {
  assert.match(themeSource, /const depth = i % 5/);
  assert.match(themeSource, /star\.dataset\.depth = String\(depth\)/);
  assert.match(themeSource, /if \(i % 5 === 0\)/);
  assert.match(themeSource, /star\.style\.animation = 'none'/);
  assert.match(styleSource, /\.star\[data-depth="4"\]/);
});

test('lunar phase calculation covers new moon, first quarter, full moon and waning phases', () => {
  const context = loadInBrowserContext(themeSource);
  const phases = vm.runInContext(`(() => {
    const epoch = Date.UTC(2000, 0, 6, 18, 14);
    const synodic = 29.530588853 * 86400000;
    return [
      getMoonPhase(new Date(epoch)),
      getMoonPhase(new Date(epoch + synodic * .25)),
      getMoonPhase(new Date(epoch + synodic * .5)),
      getMoonPhase(new Date(epoch + synodic * .75))
    ];
  })()`, context);
  assert.equal(phases[0].name, 'новолуние');
  assert.equal(phases[1].name, 'первая четверть');
  assert.equal(phases[2].name, 'полнолуние');
  assert.equal(phases[3].name, 'последняя четверть');
  assert.ok(phases[0].illumination < .01);
  assert.ok(phases[2].illumination > .99);
  assert.equal(phases[1].waxing, true);
  assert.equal(phases[3].waxing, false);
});

test('moon phase overlay is accessible, direction-aware and motion-safe', () => {
  assert.ok(themeSource.includes("moon.setAttribute('aria-label', 'Луна: ' + lunarPhase.name)"));
  assert.ok(themeSource.includes('--moon-shadow-shift'));
  assert.ok(styleSource.includes('#sky .moon::before'));
  assert.ok(styleSource.includes('@media (prefers-reduced-motion: reduce)'));
});

test('stars fade in at dusk and fade out at dawn with smooth endpoints', () => {
  const context = loadInBrowserContext(themeSource);
  const factors = vm.runInContext(`[
    getNightTransitionFactor(17),
    getNightTransitionFactor(19),
    getNightTransitionFactor(21),
    getNightTransitionFactor(5),
    getNightTransitionFactor(6.5),
    getNightTransitionFactor(8),
    getNightTransitionFactor(12)
  ]`, context);
  assert.deepEqual(Array.from(factors), [0, 0.5, 1, 1, 0.5, 0, 0]);
});

test('star visibility is multiplied by twilight progress and respects weather cloud cover', () => {
  const context = loadInBrowserContext(themeSource);
  const opacity = vm.runInContext(`getNightSkyOpacity(800) * getNightTransitionFactor(19)`, context);
  assert.equal(opacity, 0.45);
  assert.ok(themeSource.includes('updateStarsVisibility(getNightTransitionFactor(hour), currentWeatherCode)'));
});

test('cloud lighting palette follows all four local time-of-day states', () => {
  assert.ok(themeSource.includes('if (sky) sky.dataset.timeOfDay = timeOfDay;'));
  for (const period of ['morning', 'day', 'evening', 'night']) {
    assert.ok(styleSource.includes(`#sky[data-time-of-day="${period}"]`), `Missing ${period} cloud palette`);
  }
  assert.ok(styleSource.includes('--cloud-light-a'));
  assert.ok(styleSource.includes('--cloud-shadow-a'));
  assert.ok(styleSource.includes('#sky .weather-cloud-layer[data-weather="storm"]::after'));
  assert.ok(styleSource.includes('#sky .weather-cloud-layer[data-weather="snow"]::before'));
  assert.ok(styleSource.includes('#sky .weather-cloud-layer[data-weather="fog"]::before'));
});

test('storm cloud highlights flash in sync with the lightning and stop for reduced motion', () => {
  assert.match(styleSource, /\.weather-cloud-layer\[data-weather="storm"\]::before\s*\{\s*animation:\s*stormCloudIllumination 6s/);
  assert.match(styleSource, /@keyframes stormCloudIllumination/);
  assert.match(styleSource, /91%\s*\{\s*filter:\s*blur\(7px\) brightness\(1\.72\)/);
  assert.match(styleSource, /93%\s*\{\s*filter:\s*blur\(7px\) brightness\(2\.15\)/);
  assert.match(styleSource, /prefers-reduced-motion:\s*reduce\)\s*\{\s*#sky \.weather-cloud-layer\[data-weather="storm"\]::before/);
});
