const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const searchSource = fs.readFileSync(path.join(__dirname, '../js/search.js'), 'utf8');

function loadSearch() {
  const context = vm.createContext({});
  vm.runInContext(searchSource, context);
  return context;
}

test('partial Russian search finds Saint Petersburg before requiring the full name', () => {
  const search = loadSearch();
  for (const query of ['сан', 'санкт', 'петер', 'петербург', 'спб', 'питер', 'САНКТ-ПЕТЕРБУРГ']) {
    const results = search.searchLocalDictionary(query);
    assert.ok(
      results.some(city => city.name === 'Saint Petersburg' && city.localName === 'Санкт-Петербург'),
      `Expected Санкт-Петербург for query: ${query}`
    );
  }
});

test('city search normalization ignores case, ё, spaces and hyphens', () => {
  const search = loadSearch();
  assert.equal(search.normalizeCitySearchText('Санкт-Петербург'), 'санктпетербург');
  assert.equal(search.normalizeCitySearchText('САНКТ ПЕТЕРБУРГ'), 'санктпетербург');
  assert.equal(search.normalizeCitySearchText('Ёлки'), 'елки');
});

test('local Russian dictionary provides common cities for partial queries', () => {
  const search = loadSearch();
  const cases = [
    ['моск', 'Moscow'],
    ['каз', 'Kazan'],
    ['новосиб', 'Novosibirsk'],
    ['екат', 'Yekaterinburg'],
    ['краснод', 'Krasnodar'],
    ['сочи', 'Sochi'],\n    ['ростов', 'Rostov-on-Don'],\n    ['влад', 'Vladivostok'],\n    ['мурм', 'Murmansk']
  ];
  for (const [query, expectedName] of cases) {
    assert.ok(search.searchLocalDictionary(query).some(city => city.name === expectedName), query);
  }
});
