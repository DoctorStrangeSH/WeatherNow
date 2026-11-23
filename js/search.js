let searchTimeout;
const searchRequestIds = Object.create(null);

const RU_CITY_ALIASES = [
  { aliases: ['санкт-петербург', 'санкт петербург', 'санкт', 'сан', 'петер', 'петербург', 'спб', 'питер'], name: 'Saint Petersburg', localName: 'Санкт-Петербург', country: 'RU' },
  { aliases: ['москва', 'моск'], name: 'Moscow', localName: 'Москва', country: 'RU' },
  { aliases: ['казань', 'каз'], name: 'Kazan', localName: 'Казань', country: 'RU' },
  { aliases: ['новосибирск', 'новосиб'], name: 'Novosibirsk', localName: 'Новосибирск', country: 'RU' },
  { aliases: ['екатеринбург', 'екат'], name: 'Yekaterinburg', localName: 'Екатеринбург', country: 'RU' },
  { aliases: ['нижний новгород', 'нижний', 'нижн'], name: 'Nizhny Novgorod', localName: 'Нижний Новгород', country: 'RU' },
  { aliases: ['краснодар', 'краснод'], name: 'Krasnodar', localName: 'Краснодар', country: 'RU' },
  { aliases: ['сочи'], name: 'Sochi', localName: 'Сочи', country: 'RU' }
];

function normalizeCitySearchText(value) {
  return String(value || '')
    .toLocaleLowerCase('ru-RU')
    .replace(/ё/g, 'е')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[\s\u2010-\u2015-]+/g, '')
    .replace(/[^\p{L}\p{N}]/gu, '');
}
const US_STATES = {
  'колорадо': 'Denver',
  'калифорния': 'Sacramento',
  'пенсильвания': 'Harrisburg',
  'техас': 'Austin',
  'флорида': 'Tallahassee',
  'нью-йорк': 'Albany',
  'иллинойс': 'Springfield',
  'огайо': 'Columbus',
  'джорджия': 'Atlanta',
  'северная каролина': 'Raleigh',
  'мичиган': 'Lansing',
  'вашингтон': 'Olympia',
  'аризона': 'Phoenix',
  'массачусетс': 'Boston',
  'вирджиния': 'Richmond',
  'орегон': 'Salem',
  'невада': 'Carson City',
  'гавайи': 'Honolulu',
  'аляска': 'Juneau',
  'монтана': 'Helena'
};

const US_CITIES = {
  'нью-йорк': 'New York',
  'лос-анджелес': 'Los Angeles',
  'чикаго': 'Chicago',
  'хьюстон': 'Houston',
  'финикс': 'Phoenix',
  'филадельфия': 'Philadelphia',
  'сан-антонио': 'San Antonio',
  'сан-диего': 'San Diego',
  'даллас': 'Dallas',
  'сан-хосе': 'San Jose',
  'сан-франциско': 'San Francisco',
  'майами': 'Miami',
  'сиэтл': 'Seattle',
  'бостон': 'Boston',
  'детройт': 'Detroit',
  'атланта': 'Atlanta',
  'вашингтон': 'Washington',
  'портленд': 'Portland',
  'лас-вегас': 'Las Vegas',
  'солт-лейк-сити': 'Salt Lake City',
  'денвер': 'Denver',
  'сакраменто': 'Sacramento',
  'харрисберг': 'Harrisburg',
  'остин': 'Austin',
  'таллахасси': 'Tallahassee',
  'олбани': 'Albany',
  'спрингфилд': 'Springfield',
  'колумбус': 'Columbus',
  'роли': 'Raleigh',
  'лансинг': 'Lansing',
  'олимпия': 'Olympia',
  'ричмонд': 'Richmond',
  'сейлем': 'Salem',
  'карсон-сити': 'Carson City',
  'гонолулу': 'Honolulu',
  'джуно': 'Juneau',
  'хелена': 'Helena'
};

function setupSearch() {
  const inputs = [
    { input: document.getElementById('header-search'), resultsId: 'search-results' },
    { input: document.getElementById('mobile-search'), resultsId: 'search-results-mobile' }
  ];

  inputs.forEach(({ input, resultsId }) => {
    if (!input) return;

    input.setAttribute('autocomplete', 'off');
    input.setAttribute('autocorrect', 'off');
    input.setAttribute('autocapitalize', 'off');
    input.setAttribute('spellcheck', 'false');
    input.setAttribute('role', 'combobox');
    input.setAttribute('aria-haspopup', 'listbox');
    input.setAttribute('aria-expanded', 'false');
    input.setAttribute('aria-autocomplete', 'list');

    input.addEventListener('input', () => {
      clearTimeout(searchTimeout);
      const query = input.value.trim();

      if (query.length < 2) {
        searchRequestIds[resultsId] = (searchRequestIds[resultsId] || 0) + 1;
        closeSearchResults();
        return;
      }

      searchTimeout = setTimeout(() => searchCitiesAndShow(query, resultsId), 300);
    });

    input.addEventListener('keydown', event => {
      if (event.key === 'ArrowDown') {
        event.preventDefault();
        document.getElementById(resultsId)?.querySelector('[role="option"]')?.focus();
        return;
      }

      if (event.key === 'Escape') {
        closeSearchResults();
        return;
      }

      if (event.key !== 'Enter' || !input.value.trim()) return;
      event.preventDefault();
      loadCityWeather(input.value.trim());
      input.value = '';
      closeSearchResults();
    });

    input.addEventListener('focus', () => {
      const query = input.value.trim();
      if (query.length >= 2) searchCitiesAndShow(query, resultsId);
    });
  });

  document.addEventListener('click', event => {
    if (!event.target.closest('.search-results') && !event.target.closest('#header-search, #mobile-search')) {
      closeSearchResults();
    }
  });
}

async function searchCitiesAndShow(query, resultsId = 'search-results') {
  const resultsEl = document.getElementById(resultsId);
  if (!resultsEl) return;

  const normalizedQuery = normalizeCitySearchText(query);
  const requestId = (searchRequestIds[resultsId] || 0) + 1;
  searchRequestIds[resultsId] = requestId;

  const results = searchLocalDictionary(normalizedQuery);
  if (results.length) renderSearchResults(resultsEl, results.slice(0, 8), query, resultsId);

  const apiCities = await searchCities(query);
  if (searchRequestIds[resultsId] !== requestId) return;

  const seen = new Set(results.map(city => `${normalizeCitySearchText(city.localName)}:${city.country}`));
  apiCities.forEach(city => {
    const localName = city.local_names?.ru || city.name;
    const englishName = city.name || '';
    const country = city.country || '';
    const matchesQuery =
      normalizeCitySearchText(localName).includes(normalizedQuery) ||
      normalizeCitySearchText(englishName).includes(normalizedQuery);

    if (!matchesQuery) return;

    const key = `${normalizeCitySearchText(localName)}:${country}`;
    if (seen.has(key)) return;

    seen.add(key);
    results.push({
      name: englishName,
      localName,
      country,
      flag: getCountryFlag(country)
    });
  });

  renderSearchResults(resultsEl, results.slice(0, 8), query, resultsId);
}

function renderSearchResults(container, cities, query, resultsId) {
  container.replaceChildren();

  if (cities.length === 0) {
    const empty = document.createElement('div');
    empty.className = 'p-3 text-center text-muted';
    empty.textContent = 'Город не найден';
    container.appendChild(empty);
    container.style.display = 'block';
    setSearchExpanded(container.id, true);
    return;
  }

  cities.forEach(city => {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'search-item d-flex align-items-center gap-3 p-3 rounded-3 w-100 text-start border-0';
    button.setAttribute('role', 'option');
    button.setAttribute('aria-selected', 'false');
    button.addEventListener('click', () => handleSearchClick(city.name, resultsId));
    button.addEventListener('keydown', event => {
      const options = [...container.querySelectorAll('[role="option"]')];
      const index = options.indexOf(button);

      if (event.key === 'ArrowDown') {
        event.preventDefault();
        options[Math.min(index + 1, options.length - 1)]?.focus();
      } else if (event.key === 'ArrowUp') {
        event.preventDefault();
        if (index === 0) {
          document.getElementById(resultsId === 'search-results' ? 'header-search' : 'mobile-search')?.focus();
        } else {
          options[index - 1]?.focus();
        }
      } else if (event.key === 'Escape') {
        closeSearchResults();
        document.getElementById(resultsId === 'search-results' ? 'header-search' : 'mobile-search')?.focus();
      }
    });

    const flag = document.createElement('span');
    flag.className = 'fs-5';
    flag.textContent = city.flag || '🏙️';

    const details = document.createElement('span');
    details.className = 'flex-grow-1';

    const name = document.createElement('span');
    name.className = 'd-block fw-bold';
    appendHighlightedText(name, city.localName, query);

    const country = document.createElement('small');
    country.className = 'd-block text-muted';
    country.textContent = city.country;

    details.append(name, country);
    button.append(flag, details);
    container.appendChild(button);
  });

  container.style.display = 'block';
  setSearchExpanded(container.id, true);
}

function setSearchExpanded(resultsId, expanded) {
  const inputId = resultsId === 'search-results' ? 'header-search' : 'mobile-search';
  document.getElementById(inputId)?.setAttribute('aria-expanded', String(expanded));
}

function appendHighlightedText(container, value, query) {
  const text = String(value || '');
  const index = text.toLocaleLowerCase().indexOf(String(query || '').toLocaleLowerCase());

  if (!query || index < 0) {
    container.textContent = text;
    return;
  }

  container.append(
    document.createTextNode(text.slice(0, index))
  );

  const mark = document.createElement('span');
  mark.className = 'text-accent';
  mark.textContent = text.slice(index, index + query.length);

  container.append(
    mark,
    document.createTextNode(text.slice(index + query.length))
  );
}

function searchLocalDictionary(query) {
  const results = [];
  const normalizedQuery = normalizeCitySearchText(query);
  if (!normalizedQuery) return results;

  RU_CITY_ALIASES.forEach(city => {
    const matches = city.aliases.some(alias => normalizeCitySearchText(alias).includes(normalizedQuery)
      || normalizedQuery.includes(normalizeCitySearchText(alias)));
    if (!matches) return;
    results.push({ ...city, flag: '🇷🇺' });
  });

  Object.entries(US_STATES).forEach(([state, capital]) => {
    if (!normalizeCitySearchText(state).includes(normalizedQuery)) return;

    const stateName = state.charAt(0).toLocaleUpperCase() + state.slice(1);
    results.push({
      name: capital,
      localName: `${stateName} (столица)`,
      country: 'US',
      flag: '🇺🇸'
    });
  });

  Object.entries(US_CITIES).forEach(([localName, englishName]) => {
    if (!normalizeCitySearchText(localName).includes(normalizedQuery)) return;

    results.push({
      name: englishName,
      localName: localName.charAt(0).toLocaleUpperCase() + localName.slice(1),
      country: 'US',
      flag: '🇺🇸'
    });
  });

  return results;
}

function handleSearchClick(cityName, resultsId) {
  loadCityWeather(cityName);

  const inputId = resultsId === 'search-results' ? 'header-search' : 'mobile-search';
  const input = document.getElementById(inputId);

  if (input) input.value = '';
  closeSearchResults();
}

function closeSearchResults() {
  clearTimeout(searchTimeout);
  ['search-results', 'search-results-mobile'].forEach(id => {
    searchRequestIds[id] = (searchRequestIds[id] || 0) + 1;
    const element = document.getElementById(id);
    if (element) {
      element.style.display = 'none';
      setSearchExpanded(id, false);
    }
  });
}
