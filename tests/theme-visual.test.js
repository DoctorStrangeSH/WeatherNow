const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const themeSource = fs.readFileSync(path.join(__dirname, '../js/theme.js'), 'utf8');
const chartSource = fs.readFileSync(path.join(__dirname, '../js/charts.js'), 'utf8');
const searchSource = fs.readFileSync(path.join(__dirname, '../js/search.js'), 'utf8');
const feelsLikeSource = fs.readFileSync(path.join(__dirname, '../js/feels-like.js'), 'utf8');

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
  assert.doesNotMatch(chartSource, /\\bisDark\\b/);
  assert.doesNotMatch(feelsLikeSource, /\\bisDark\\b/);
  assert.match(feelsLikeSource, /color: palette\\.ticks/);
});
