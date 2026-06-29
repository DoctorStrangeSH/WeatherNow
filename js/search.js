// ============================================
// WeatherNow — Поиск городов (только на русском)
// ============================================

let searchTimeout;

// Словарь штатов США и их столиц
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
  'монтана': 'Helena',
};

// Крупные города США (русское написание → английское для API)
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
  'финикс': 'Phoenix',
  'ричмонд': 'Richmond',
  'сейлем': 'Salem',
  'карсон-сити': 'Carson City',
  'гонолулу': 'Honolulu',
  'джуно': 'Juneau',
  'хелена': 'Helena',
};

function setupSearch() {
  const headerSearch = document.getElementById('header-search');
  const mobileSearch = document.getElementById('mobile-search');
  
  const setupInput = (input, resultsId) => {
    if (!input) return;
    
    input.setAttribute('autocomplete', 'off');
    input.setAttribute('autocorrect', 'off');
    input.setAttribute('autocapitalize', 'off');
    input.setAttribute('spellcheck', 'false');
    input.setAttribute('role', 'presentation');
    input.setAttribute('aria-autocomplete', 'none');
    
    input.addEventListener('input', function() {
      clearTimeout(searchTimeout);
      const query = this.value.trim();
      if (query.length < 2) { 
        closeSearchResults(); 
        return; 
      }
      searchTimeout = setTimeout(() => searchCitiesAndShow(query, resultsId), 300);
    });
    
    input.addEventListener('keypress', function(e) {
      if (e.key === 'Enter' && this.value.trim()) {
        loadCityWeather(this.value.trim());
        this.value = '';
        closeSearchResults();
      }
    });
    
    input.addEventListener('focus', function() {
      const query = this.value.trim();
      if (query.length >= 2) searchCitiesAndShow(query, resultsId);
    });
  };
  
  setupInput(headerSearch, 'search-results');
  setupInput(mobileSearch, 'search-results-mobile');
  
  document.addEventListener('click', (e) => {
    if (!e.target.closest('.search-results') && !e.target.closest('input[type="text"]')) {
      closeSearchResults();
    }
  });
}

async function searchCitiesAndShow(query, resultsId = 'search-results') {
  const resultsEl = document.getElementById(resultsId);
  if (!resultsEl) return;
  
  const queryLower = query.toLowerCase().trim();
  
  // Сначала проверяем локальный словарь (штаты и города США)
  const localResults = searchLocalDictionary(queryLower);
  
  // Затем ищем через API
  const apiCities = await searchCities(query);
  
  // Объединяем результаты
  let allResults = [];
  
  // Добавляем локальные результаты
  localResults.forEach(item => {
    allResults.push({
      name: item.apiName,
      localName: item.displayName,
      country: item.country,
      flag: item.flag,
      isLocal: true
    });
  });
  
  // Фильтруем API-результаты — ТОЛЬКО русские города
  const seen = new Set();
  
  apiCities.forEach(city => {
    const localName = city.local_names?.ru;
    const country = city.country || '';
    const key = (localName || city.name).toLowerCase() + '_' + country.toLowerCase();
    
    // Пропускаем, если уже есть
    if (seen.has(key)) return;
    
    // Показываем только если есть русское название
    if (!localName) return;
    
    // Проверяем совпадение с запросом
    if (!localName.toLowerCase().includes(queryLower)) return;
    
    seen.add(key);
    
    allResults.push({
      name: city.name,
      localName: localName,
      country: country,
      flag: getCountryFlag(country),
      isLocal: false
    });
  });
  
  // Убираем дубликаты по названию
  const uniqueResults = [];
  const nameSeen = new Set();
  allResults.forEach(item => {
    const nameKey = item.localName.toLowerCase();
    if (!nameSeen.has(nameKey)) {
      nameSeen.add(nameKey);
      uniqueResults.push(item);
    }
  });
  
  if (uniqueResults.length === 0) {
    resultsEl.innerHTML = `
      <div class="p-3 text-center text-muted">
        <i class="bi bi-search me-2"></i>Город не найден
      </div>
    `;
    resultsEl.style.display = 'block';
    return;
  }
  
  // Показываем не больше 8 результатов
  const displayResults = uniqueResults.slice(0, 8);
  
  resultsEl.innerHTML = displayResults.map(city => {
    const highlightedName = highlightMatch(city.localName, query);
    
    return `
      <div class="search-item d-flex align-items-center gap-3 p-3 rounded-3" 
           onclick="handleSearchClick('${city.name.replace(/'/g, "\\'")}', '${resultsId}')" 
           style="cursor: pointer;">
        <span class="fs-5">${city.flag || '🏙️'}</span>
        <div class="flex-grow-1">
          <p class="fw-bold mb-0">${highlightedName}</p>
          <small class="text-muted">${city.country}</small>
        </div>
      </div>
    `;
  }).join('');
  
  resultsEl.style.display = 'block';
}

function searchLocalDictionary(query) {
  const results = [];
  const queryLower = query.toLowerCase();
  
  // Ищем штаты
  Object.entries(US_STATES).forEach(([state, capital]) => {
    if (state.includes(queryLower)) {
      const stateName = state.charAt(0).toUpperCase() + state.slice(1);
      results.push({
        apiName: capital,
        displayName: `${stateName} (столица)`,
        country: 'US',
        flag: '🇺🇸'
      });
    }
  });
  
  // Ищем крупные города
  Object.entries(US_CITIES).forEach(([ruName, enName]) => {
    if (ruName.includes(queryLower)) {
      results.push({
        apiName: enName,
        displayName: ruName.charAt(0).toUpperCase() + ruName.slice(1),
        country: 'US',
        flag: '🇺🇸'
      });
    }
  });
  
  return results;
}

function highlightMatch(text, query) {
  if (!query || !text) return text;
  const escapedQuery = query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const regex = new RegExp(`(${escapedQuery})`, 'gi');
  return text.replace(regex, '<span class="text-accent fw-bold">$1</span>');
}

function handleSearchClick(cityName, resultsId) {
  loadCityWeather(cityName);
  const input = resultsId === 'search-results' 
    ? document.getElementById('header-search')
    : document.getElementById('mobile-search');
  if (input) input.value = '';
  closeSearchResults();
}

function closeSearchResults() {
  ['search-results', 'search-results-mobile'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.style.display = 'none';
  });
}