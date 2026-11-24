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
    ...additions,
    document: {
      addEventListener() {},
      body: { classList: { contains: () => false } },
      ...(additions.document || {})
    },
    window: {
      getComputedStyle: () => ({
        getPropertyValue(name) {
          return ({
            '--text-primary': '#f3f7fc',
            '--text-muted': '#a9bbcf',
            '--card-border': 'rgba(179, 211, 239, 0.14)'
          })[name] || '';
        }
      }),
      ...(additions.window || {})
    }
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

test('storm scene uses variable lightning profiles and irregular, bounded flash timing', () => {
  const context = loadInBrowserContext(themeSource);
  const profiles = vm.runInContext(`({
    low: getLightningFlashProfile(() => 0.05),
    high: getLightningFlashProfile(() => 0.95),
    single: getLightningFlashSequence({ secondary: false }, () => 0.5),
    double: getLightningFlashSequence({ secondary: true }, () => 0.5),
    initialDelay: getLightningDelay(() => 0.5, true),
    nextDelay: getLightningDelay(() => 0.5, false)
  })`, context);

  assert.ok(profiles.low.intensity >= 0.42 && profiles.low.intensity <= 1);
  assert.ok(profiles.high.intensity > profiles.low.intensity);
  assert.notEqual(profiles.low.boltX, profiles.high.boltX);
  assert.notEqual(profiles.low.shape, profiles.high.shape);
  assert.equal(profiles.single.length, 4);
  assert.equal(profiles.double.length, 8);
  assert.ok(profiles.single.every(step => step.duration >= 30 && step.duration <= 130));
  assert.ok(profiles.initialDelay >= 1600 && profiles.initialDelay <= 5400);
  assert.ok(profiles.nextDelay >= 3800 && profiles.nextDelay <= 12500);
  assert.match(styleSource, /#lightning\[data-flash="peak"\]/);
  assert.match(styleSource, /#lightning\[data-bolt-shape="forked"\]::before/);
  assert.match(styleSource, /#lightning::after/);
  assert.doesNotMatch(styleSource, /@keyframes lightningBolt|@keyframes lightningFlash/);
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
  assert.ok(themeSource.includes("moon.setAttribute('role', 'img')"));
  assert.ok(themeSource.includes("moon.setAttribute('aria-hidden', timeOfDay === 'night' ? 'false' : 'true')"));
  assert.ok(themeSource.includes('--moon-shadow-shift'));
  assert.ok(styleSource.includes('#sky .moon::before'));
  assert.ok(styleSource.includes('@media (prefers-reduced-motion: reduce)'));
});

test('moon accessibility follows visibility and exposes the current lunar phase', () => {
  const makeElement = () => ({
    style: { setProperty() {} },
    dataset: {},
    attributes: {},
    setAttribute(name, value) { this.attributes[name] = value; }
  });
  const sky = { dataset: {} };
  const sun = makeElement();
  const moon = makeElement();
  const stars = {
    style: {},
    attributes: {},
    setAttribute(name, value) { this.attributes[name] = value; }
  };
  const document = {
    getElementById(id) {
      return ({ sky, sun, moon, stars })[id] || null;
    }
  };
  const context = loadInBrowserContext(themeSource, { document });
  vm.runInContext('updateSkyElements("day")', context);
  assert.equal(moon.attributes.role, 'img');
  assert.equal(moon.attributes['aria-hidden'], 'true', 'The hidden daytime moon is not announced');
  assert.match(moon.attributes['aria-label'], /^Луна: /);

  vm.runInContext('updateSkyElements("night")', context);
  assert.equal(moon.attributes['aria-hidden'], 'false', 'The visible night moon is exposed to assistive technology');
  assert.match(moon.attributes['aria-label'], /^Луна: /);
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
  assert.ok(themeSource.includes('sky.dataset.timeOfDay = timeOfDay;'));
  assert.ok(themeSource.includes('updateCloudLighting(timeOfDay, currentWeatherCode);'));
  for (const period of ['morning', 'day', 'evening', 'night']) {
    assert.ok(styleSource.includes(`#sky[data-time-of-day="${period}"]`), `Missing ${period} cloud palette`);
  }
  assert.ok(styleSource.includes('--cloud-light-a'));
  assert.ok(styleSource.includes('--cloud-shadow-a'));
  assert.ok(styleSource.includes('#sky .weather-cloud-layer[data-weather="storm"]::after'));
  assert.ok(styleSource.includes('#sky .weather-cloud-layer[data-weather="snow"]::before'));
  assert.ok(styleSource.includes('#sky .weather-cloud-layer[data-weather="fog"]::before'));
});

test('storm cloud volume reacts to the same flash stage as the lightning overlay', () => {
  assert.match(styleSource, /#sky\[data-storm-flash="soft"\].*weather-cloud-layer\[data-weather="storm"\]::before/);
  assert.match(styleSource, /#sky\[data-storm-flash="peak"\].*weather-cloud-layer\[data-weather="storm"\]::before/);
  assert.match(styleSource, /#sky\[data-storm-flash="fade"\].*weather-cloud-layer\[data-weather="storm"\]::before/);
  assert.match(styleSource, /transition: filter 84ms ease/);
  assert.match(styleSource, /prefers-reduced-motion:\s*reduce\)[\s\S]*#sky \.weather-cloud-layer\[data-weather="storm"\]::before/);
  assert.match(themeSource, /sky\.dataset\.stormFlash = stage/);
  assert.match(themeSource, /stopLightningSequence\(\)/);
});

test('rain and snow particles expose four distinct depth profiles with realistic scale and motion', () => {
  const context = loadInBrowserContext(themeSource);
  const rain = [0, 1, 2, 3].map(depth => vm.runInContext(`getPrecipitationParticleProfile('rain', ${depth})`, context));
  const snow = [0, 1, 2, 3].map(depth => vm.runInContext(`getPrecipitationParticleProfile('snow', ${depth})`, context));
  const heavyRain = [0, 1, 2, 3].map(depth => vm.runInContext(`getPrecipitationParticleProfile('rain', ${depth}, true)`, context));

  assert.ok(rain.every((profile, index) => index === 0 || profile.lengthMin > rain[index - 1].lengthMin),
    'Rain streaks grow longer toward the foreground');
  assert.ok(rain.every((profile, index) => index === 0 || profile.durationMin < rain[index - 1].durationMin),
    'Foreground rain falls faster than distant rain');
  assert.ok(rain.every((profile, index) => index === 0 || profile.opacityMin > rain[index - 1].opacityMin),
    'Rain gains brightness toward the foreground');
  assert.ok(rain.every((profile, index) => index === 0 || profile.blur < rain[index - 1].blur),
    'Rain becomes sharper toward the foreground');

  assert.ok(snow.every((profile, index) => index === 0 || profile.sizeMin > snow[index - 1].sizeMin),
    'Snowflakes grow toward the foreground');
  assert.ok(snow.every((profile, index) => index === 0 || profile.durationMin < snow[index - 1].durationMin),
    'Foreground snow moves faster than distant snow');
  assert.ok(snow.every((profile, index) => index === 0 || profile.opacityMin > snow[index - 1].opacityMin),
    'Snow gains opacity toward the foreground');
  assert.ok(snow.every((profile, index) => index === 0 || profile.blur < snow[index - 1].blur),
    'Snow becomes sharper toward the foreground');
  assert.deepEqual(snow.map(profile => profile.driftScale), [0.25, 0.42, 0.68, 1]);

  assert.ok(heavyRain.every((profile, index) => profile.durationMin < rain[index].durationMin),
    'Heavy rain falls faster in every depth plane');
  assert.ok(heavyRain.every((profile, index) => profile.lengthMin > rain[index].lengthMin),
    'Heavy rain uses longer streaks');
  assert.equal(vm.runInContext("getPrecipitationParticleProfile('hail', 0)", context), null);

  for (const depth of ['0', '1', '2', '3']) {
    assert.ok(styleSource.includes(`.raindrop[data-depth="${depth}"]`), `Rain depth ${depth} has a visual profile`);
    assert.ok(styleSource.includes(`.snowflake[data-depth="${depth}"]`), `Snow depth ${depth} has a visual profile`);
  }
  assert.ok(styleSource.includes('background: radial-gradient(circle at 35% 30%'), 'Foreground snow has a softly lit surface');
  assert.match(styleSource, /prefers-reduced-motion:\s*reduce[\s\S]*?\.raindrop[\s\S]*?\.snowflake/);
});

test('weather animation visibility can pause and resume decorative layers', () => {
  const sky = { dataset: {} };
  const context = loadInBrowserContext(themeSource, {
    document: {
      hidden: false,
      addEventListener() {},
      getElementById(id) { return id === 'sky' ? sky : null; },
      body: { classList: { contains: () => false } }
    }
  });
  vm.runInContext('syncWeatherAnimationVisibility(false)', context);
  assert.equal(sky.dataset.pageVisible, 'false');
  vm.runInContext('syncWeatherAnimationVisibility(true)', context);
  assert.equal(sky.dataset.pageVisible, 'true');
  assert.ok(styleSource.includes('#sky[data-page-visible="false"] .raindrop'));
  assert.ok(styleSource.includes('#sky[data-page-visible="false"] .snowflake'));
  assert.ok(styleSource.includes('#sky[data-page-visible="false"] .weather-cloud-layer'));
});


test('weather background crossfade snapshots the old scene and respects reduced motion', () => {
  const sky = {
    dataset: { weather: 'clear', timeOfDay: 'day' },
    children: [],
    firstChild: { id: 'stars' },
    querySelector(selector) {
      return selector === '.sky-scene-transition'
        ? this.children.find(node => node.className === 'sky-scene-transition') || null
        : null;
    },
    insertBefore(node) {
      this.children.unshift(node);
      node.parentNode = this;
    }
  };
  const document = {
    getElementById(id) { return id === 'sky' ? sky : null; },
    createElement() {
      return {
        style: {},
        className: '',
        attributes: {},
        listeners: {},
        listenerOptions: {},
        setAttribute(name, value) { this.attributes[name] = value; },
        addEventListener(name, callback, options) {
          this.listeners[name] = callback;
          this.listenerOptions[name] = options;
        },
        remove() {
          const index = sky.children.indexOf(this);
          if (index !== -1) sky.children.splice(index, 1);
        }
      };
    }
  };
  const window = {
    matchMedia: () => ({ matches: false }),
    getComputedStyle: () => ({
      backgroundImage: 'linear-gradient(rgb(1, 2, 3), rgb(4, 5, 6))',
      backgroundColor: 'rgb(0, 0, 0)',
      backgroundSize: 'auto',
      backgroundPosition: '0% 0%',
      backgroundRepeat: 'repeat'
    })
  };
  const context = loadInBrowserContext(themeSource, { document, window, sky });

  vm.runInContext('startSkyBackgroundTransition(sky, "clear", "day")', context);
  assert.equal(sky.children.length, 0, 'unchanged scenes do not create a transition layer');

  vm.runInContext('startSkyBackgroundTransition(sky, "rain", "night")', context);
  const layer = sky.children[0];
  assert.equal(layer.className, 'sky-scene-transition');
  assert.equal(layer.style.backgroundImage, 'linear-gradient(rgb(1, 2, 3), rgb(4, 5, 6))');
  assert.equal(layer.attributes['aria-hidden'], 'true');
  assert.equal(layer.listenerOptions.animationend.once, true);
  assert.equal(layer.listenerOptions.animationcancel.once, true);
  layer.listeners.animationend();
  assert.equal(sky.children.length, 0, 'the old background layer is removed after its fade');

  vm.runInContext('startSkyBackgroundTransition(sky, "snow", "night")', context);
  const cancelledLayer = sky.children[0];
  cancelledLayer.listeners.animationcancel();
  assert.equal(sky.children.length, 0, 'cancelled CSS animations also clean up their background layer');

  const reducedContext = loadInBrowserContext(themeSource, {
    document,
    window: { matchMedia: () => ({ matches: true }), getComputedStyle: window.getComputedStyle },
    sky
  });
  vm.runInContext('startSkyBackgroundTransition(sky, "snow", "night")', reducedContext);
  assert.equal(sky.children.length, 0, 'reduced-motion does not create an animated background layer');
});

test('weather background crossfade CSS stays behind scene layers and pauses in hidden tabs', () => {
  const transitionStyles = styleSource.slice(styleSource.lastIndexOf('/* Crossfade the previous atmospheric background'));
  assert.match(transitionStyles, /#sky \.sky-scene-transition\s*\{[^}]*z-index:\s*0/s);
  assert.match(transitionStyles, /@keyframes skySceneCrossfade/);
  assert.match(transitionStyles, /animation-play-state:\s*paused\s*!important/);
  assert.match(transitionStyles, /prefers-reduced-motion:\s*reduce/);
});


test('switching to reduced motion removes in-flight sky transitions and prevents duplicate listeners', () => {
  const sky = {
    dataset: { weather: 'clear', timeOfDay: 'day' },
    children: [],
    firstChild: null,
    querySelector(selector) {
      return selector === '.sky-scene-transition'
        ? this.children.find(node => node.className === 'sky-scene-transition') || null
        : null;
    },
    querySelectorAll(selector) {
      return selector === '.sky-scene-transition'
        ? this.children.filter(node => node.className === 'sky-scene-transition')
        : [];
    },
    insertBefore(node) {
      this.children.unshift(node);
      node.parentNode = this;
    }
  };
  const listeners = new Set();
  let registrations = 0;
  const mediaQuery = {
    matches: false,
    addEventListener(name, callback) {
      if (name === 'change') {
        registrations += 1;
        listeners.add(callback);
      }
    }
  };
  const document = {
    getElementById(id) { return id === 'sky' ? sky : null; },
    createElement() {
      return {
        style: {},
        className: '',
        setAttribute() {},
        addEventListener() {},
        remove() {
          const index = sky.children.indexOf(this);
          if (index !== -1) sky.children.splice(index, 1);
        }
      };
    }
  };
  const window = {
    matchMedia: () => mediaQuery,
    getComputedStyle: () => ({
      backgroundImage: 'linear-gradient(#123, #456)',
      backgroundColor: 'transparent',
      backgroundSize: 'cover',
      backgroundPosition: 'center',
      backgroundRepeat: 'no-repeat'
    })
  };
  const context = loadInBrowserContext(themeSource, { document, window, sky });

  vm.runInContext('watchReducedMotionPreference(); watchReducedMotionPreference()', context);
  assert.equal(registrations, 1, 'the preference listener is registered only once');

  vm.runInContext(
    'startSkyBackgroundTransition(sky, "rain", "day"); startSkyBackgroundTransition(sky, "snow", "night")',
    context
  );
  assert.equal(sky.children.length, 1, 'rapid weather changes never stack transition layers');

  mediaQuery.matches = true;
  listeners.forEach(listener => listener({ matches: true }));
  assert.equal(sky.children.length, 0, 'enabling reduced motion removes the in-flight transition immediately');

  vm.runInContext('startSkyBackgroundTransition(sky, "clear", "night")', context);
  assert.equal(sky.children.length, 0, 'future transitions remain disabled while reduced motion is active');
});


test('moon halo intensity follows lunar illumination and atmospheric visibility', () => {
  const context = loadInBrowserContext(themeSource);
  const profiles = vm.runInContext(`({
    newMoon: getMoonHaloProfile(0, 800),
    quarterMoon: getMoonHaloProfile(0.5, 800),
    fullMoon: getMoonHaloProfile(1, 800),
    partlyCloudy: getMoonHaloProfile(1, 801),
    overcast: getMoonHaloProfile(1, 804),
    rain: getMoonHaloProfile(1, 502),
    snow: getMoonHaloProfile(1, 601),
    fog: getMoonHaloProfile(1, 741),
    clampedLow: getMoonHaloProfile(-1, 800),
    clampedHigh: getMoonHaloProfile(2, 800)
  })`, context);

  assert.equal(profiles.newMoon.opacity, 0);
  assert.ok(profiles.quarterMoon.opacity > profiles.newMoon.opacity);
  assert.ok(profiles.fullMoon.opacity > profiles.quarterMoon.opacity);
  assert.ok(profiles.fullMoon.opacity > profiles.partlyCloudy.opacity);
  assert.ok(profiles.partlyCloudy.opacity > profiles.overcast.opacity);
  assert.ok(profiles.overcast.opacity > profiles.rain.opacity);
  assert.ok(profiles.snow.opacity > profiles.fog.opacity);
  assert.equal(profiles.clampedLow.illumination, 0);
  assert.equal(profiles.clampedHigh.illumination, 1);
  assert.equal(profiles.fullMoon.spread, 48);
  assert.equal(profiles.newMoon.spread, 10);
  assert.match(styleSource, /--moon-halo-opacity/);
  assert.match(styleSource, /--moon-halo-spread/);
  assert.match(styleSource, /prefers-reduced-motion:\s*reduce/);
});


test('cloud lighting profiles follow the sun cycle and respond to atmospheric conditions', () => {
  const context = loadInBrowserContext(themeSource);
  const profiles = vm.runInContext(`({
    morning: getCloudLightingProfile('morning', 800),
    day: getCloudLightingProfile('day', 800),
    evening: getCloudLightingProfile('evening', 800),
    night: getCloudLightingProfile('night', 800),
    storm: getCloudLightingProfile('night', 211),
    rain: getCloudLightingProfile('day', 502),
    snow: getCloudLightingProfile('day', 601),
    fog: getCloudLightingProfile('morning', 741),
    partlyCloudy: getCloudLightingProfile('day', 801),
    overcast: getCloudLightingProfile('day', 804)
  })`, context);

  assert.equal(new Set(['morning', 'day', 'evening', 'night'].map(key => profiles[key].lightA)).size, 4);
  assert.notEqual(profiles.morning.rim, profiles.evening.rim);
  assert.notEqual(profiles.day.rim, profiles.night.rim);
  assert.ok(profiles.storm.lightOpacity < profiles.night.lightOpacity);
  assert.ok(profiles.rain.lightOpacity < profiles.day.lightOpacity);
  assert.ok(profiles.fog.lightOpacity < profiles.rain.lightOpacity);
  assert.ok(profiles.snow.lightOpacity > profiles.day.lightOpacity);
  assert.ok(profiles.overcast.lightOpacity < profiles.partlyCloudy.lightOpacity);
  for (const profile of Object.values(profiles)) {
    assert.ok(profile.lightOpacity >= 0 && profile.lightOpacity <= 1);
    assert.ok(profile.shadowOpacity >= 0 && profile.shadowOpacity <= 1);
    assert.ok(profile.rim.startsWith('rgba('));
  }
});

test('cloud lighting updates sky custom properties when time or weather changes', () => {
  const values = {};
  const sky = {
    dataset: { timeOfDay: 'day' },
    style: { setProperty(name, value) { values[name] = value; } }
  };
  const context = loadInBrowserContext(themeSource, {
    document: { getElementById(id) { return id === 'sky' ? sky : null; } }
  });
  vm.runInContext('updateCloudLighting("evening", 800)', context);
  assert.equal(sky.dataset.cloudLighting, 'evening');
  assert.equal(values['--cloud-light-a'], 'rgba(255, 185, 139, .5)');
  assert.equal(values['--cloud-rim'], 'rgba(255, 158, 133, .48)');
  vm.runInContext('updateCloudLighting("night", 211)', context);
  assert.equal(sky.dataset.cloudLighting, 'night');
  assert.equal(values['--cloud-light-opacity'], '0.409');
  assert.equal(values['--cloud-shadow-opacity'], '0.92');
});

test('cloud rim lighting fades smoothly and respects reduced motion', () => {
  const styles = styleSource.slice(styleSource.lastIndexOf('/* Time- and weather-aware cloud rim light'));
  assert.match(styles, /var\(--cloud-rim/);
  assert.match(styles, /transition:\s*opacity 2\.2s ease/);
  assert.match(styles, /prefers-reduced-motion:\s*reduce/);
  assert.match(styles, /transition:\s*none !important/);
});


test('fog density follows visibility and weather type while wind changes drift and speed', () => {
  const context = loadInBrowserContext(themeSource, {
    navigator: { deviceMemory: 8, hardwareConcurrency: 8 },
    window: { innerWidth: 1280, matchMedia: () => ({ matches: false }) }
  });
  const profiles = vm.runInContext(`({
    dense: getFogProfile(741, 250, 2, 225, 'day'),
    medium: getFogProfile(741, 3500, 2, 225, 'day'),
    light: getFogProfile(741, 9000, 2, 225, 'day'),
    mist: getFogProfile(701, 250, 2, 225, 'day'),
    highWind: getFogProfile(741, 250, 20, 225, 'day'),
    northWind: getFogProfile(741, 250, 8, 0, 'day'),
    southWind: getFogProfile(741, 250, 8, 180, 'day'),
    eastWind: getFogProfile(741, 250, 8, 90, 'day'),
    westWind: getFogProfile(741, 250, 8, 270, 'day'),
    morning: getFogProfile(741, 250, 2, 225, 'morning'),
    day: getFogProfile(741, 250, 2, 225, 'day'),
    evening: getFogProfile(741, 250, 2, 225, 'evening'),
    night: getFogProfile(741, 250, 2, 225, 'night'),
    invalid: getFogProfile(800, 250, 2, 225, 'day')
  })`, context);

  assert.ok(profiles.dense.density > profiles.medium.density);
  assert.ok(profiles.medium.density > profiles.light.density);
  assert.ok(profiles.dense.density > profiles.mist.density);
  assert.ok(parseFloat(profiles.highWind.css['--fog-mid-duration']) < parseFloat(profiles.dense.css['--fog-mid-duration']));
  assert.notEqual(profiles.northWind.css['--fog-end-y'], profiles.southWind.css['--fog-end-y']);
  assert.notEqual(profiles.eastWind.css['--fog-end-x'], profiles.westWind.css['--fog-end-x']);
  assert.notEqual(profiles.morning.css['--fog-base-color'], profiles.evening.css['--fog-base-color']);
  assert.notEqual(profiles.day.css['--fog-base-color'], profiles.night.css['--fog-base-color']);
  assert.equal(profiles.invalid, null);
  const mobileContext = loadInBrowserContext(themeSource, {
    navigator: { deviceMemory: 8, hardwareConcurrency: 8 },
    window: { innerWidth: 390, matchMedia: () => ({ matches: false }) }
  });
  const mobileBlur = vm.runInContext(
    "getFogProfile(741, 900, 8, 225, 'day').css",
    mobileContext
  );
  assert.equal(mobileBlur['--fog-mid-blur'], '20px');
  assert.equal(mobileBlur['--fog-near-blur'], '27px');
  for (const profile of Object.values(profiles).filter(Boolean)) {
    assert.ok(profile.density >= 0.12 && profile.density <= 0.98);
    assert.ok(Number(profile.css['--fog-mid-opacity']) >= 0 && Number(profile.css['--fog-mid-opacity']) <= 1);
    assert.ok(Number(profile.css['--fog-near-opacity']) >= 0 && Number(profile.css['--fog-near-opacity']) <= 1);
  }
});

test('fog atmosphere applies its depth, lighting and wind profile to the active fog layer', () => {
  const values = {};
  const fog = { dataset: {}, style: { setProperty(name, value) { values[name] = value; } } };
  const context = loadInBrowserContext(themeSource, {
    document: { getElementById(id) { return id === 'fog' ? fog : null; } },
    navigator: { deviceMemory: 8, hardwareConcurrency: 8 },
    window: { innerWidth: 1280, matchMedia: () => ({ matches: false }) }
  });
  const profile = vm.runInContext('updateFogAtmosphere(741, 8, 450, 225, "evening")', context);

  assert.equal(fog.dataset.density, 'dense');
  assert.equal(fog.dataset.timeOfDay, 'evening');
  assert.equal(fog.dataset.windDirection, '225');
  assert.equal(values['--fog-mid-duration'], profile.css['--fog-mid-duration']);
  assert.equal(values['--fog-tint-a'], profile.css['--fog-tint-a']);
  assert.ok(values['--fog-start-x']);
  assert.ok(values['--fog-end-y']);
});

test('volumetric fog uses three visual depth planes and remains lightweight on mobile/reduced motion', () => {
  const fogStart = styleSource.indexOf('/* Three-depth volumetric fog');
  const fogEnd = styleSource.indexOf('#lightning::before', fogStart);
  const fogStyles = styleSource.slice(fogStart, fogEnd);
  assert.match(fogStyles, /#fog\s*\{[^}]*var\(--fog-base-color/s);
  assert.match(fogStyles, /#fog::before[\s\S]*--fog-mid-opacity/);
  assert.match(fogStyles, /#fog::after[\s\S]*--fog-near-opacity/);
  assert.match(fogStyles, /@keyframes fogDriftMid/);
  assert.match(fogStyles, /@keyframes fogDriftNear/);
  assert.match(styleSource, /@media \(max-width: 767\.98px\)[\s\S]*#fog/);
  assert.match(styleSource, /@media \(max-width: 390px\)[\s\S]*#fog/);
  assert.match(styleSource, /@media \(prefers-reduced-motion: reduce\)[\s\S]*#fog::before/);
});


test('lightning flash stages illuminate the bolt and cloud layer together, then clear cleanly', () => {
  const values = {};
  const sky = { dataset: {}, style: {
    setProperty(name, value) { values[name] = value; },
    removeProperty(name) { delete values[name]; }
  } };
  const lightningValues = {};
  const lightning = {
    dataset: {},
    style: {
      setProperty(name, value) { lightningValues[name] = value; },
      removeProperty(name) { delete lightningValues[name]; }
    },
    removeAttribute(name) {
      const key = name.replace(/^data-/, '').replace(/-([a-z])/g, (_match, letter) => letter.toUpperCase());
      delete this.dataset[key];
    }
  };
  const context = loadInBrowserContext(themeSource, {
    document: { getElementById(id) { return id === 'sky' ? sky : null; } }
  });
  const profile = vm.runInContext('getLightningFlashProfile(() => 0.7)', context);
  context.applyLightningFlashStage(lightning, 'peak', profile);

  assert.equal(lightning.dataset.flash, 'peak');
  assert.equal(sky.dataset.stormFlash, 'peak');
  assert.equal(lightningValues['--lightning-bolt-x'], profile.boltX + '%');
  assert.equal(values['--storm-flash-brightness'], String(profile.cloudBrightness));
  assert.ok(Number(lightningValues['--lightning-bolt-opacity']) > 0.5);

  context.applyLightningFlashStage(lightning, 'off', profile);
  assert.equal(lightning.dataset.flash, undefined);
  assert.equal(sky.dataset.stormFlash, undefined);
  assert.equal(values['--storm-flash-brightness'], undefined);
});

test('lightning scheduler pauses on hidden tabs and resumes without duplicate timers', () => {
  const timers = new Map();
  let nextTimerId = 0;
  const sky = { dataset: {}, style: {
    setProperty() {},
    removeProperty() {}
  }, querySelector(selector) { return selector === '#lightning' ? lightning : null; } };
  const lightningValues = {};
  const lightning = {
    dataset: {},
    isConnected: true,
    style: {
      setProperty(name, value) { lightningValues[name] = value; },
      removeProperty(name) { delete lightningValues[name]; }
    },
    removeAttribute(name) { delete this.dataset[name]; }
  };
  const context = loadInBrowserContext(themeSource, {
    document: {
      hidden: false,
      getElementById(id) { return id === 'sky' ? sky : null; }
    },
    window: { matchMedia: () => ({ matches: false }) },
    setTimeout(callback, delay) {
      const id = ++nextTimerId;
      timers.set(id, { callback, delay });
      return id;
    },
    clearTimeout(id) { timers.delete(id); }
  });

  assert.equal(context.startLightningSequence(lightning, 2400), true);
  assert.equal(timers.size, 1);
  assert.equal([...timers.values()][0].delay, 2400);

  context.syncWeatherAnimationVisibility(false);
  assert.equal(timers.size, 0);
  assert.equal(lightning.dataset.flash, undefined);
  assert.equal(vm.runInContext('lightningTimerId', context), null);

  context.syncWeatherAnimationVisibility(true);
  assert.equal(timers.size, 1);
  assert.equal(vm.runInContext('lightningTimerId !== null', context), true);
  context.stopLightningSequence();
  assert.equal(timers.size, 0);
});
