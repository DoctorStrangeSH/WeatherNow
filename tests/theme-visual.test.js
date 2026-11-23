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
