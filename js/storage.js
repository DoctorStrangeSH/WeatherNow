function parseFavoriteCities(rawValue) {
  if (!rawValue) return [];

  try {
    const parsed = JSON.parse(rawValue);
    if (!Array.isArray(parsed)) return [];

    return parsed
      .filter(city => city && typeof city.name === 'string' && city.name.trim())
      .slice(0, 10)
      .map(city => ({
        name: city.name.trim(),
        country: typeof city.country === 'string' ? city.country.trim() : '',
        addedAt: typeof city.addedAt === 'string' ? city.addedAt : ''
      }));
  } catch {
    return [];
  }
}

let favoriteCities = [];
try {
  favoriteCities = parseFavoriteCities(localStorage.getItem('weathernow-favorites'));
} catch {
  favoriteCities = [];
}

function addToFavorites(cityName, country) {
  if (favoriteCities.some(c => c.name.toLowerCase() === cityName.toLowerCase())) {
    showToast('Этот город уже в избранном! ⭐', 'warning');
    return false;
  }
  
  if (favoriteCities.length >= 10) {
    showToast('Максимум 10 городов в избранном 😅', 'warning');
    return false;
  }
  
  favoriteCities.push({
    name: cityName,
    country: country || '',
    addedAt: new Date().toISOString()
  });
  
  saveFavorites();
  updateFavoriteButton(cityName, true);
  showToast(`${cityName} добавлен в избранное! ⭐`, 'success');
  return true;
}

function removeFromFavorites(cityName) {
  favoriteCities = favoriteCities.filter(c => c.name.toLowerCase() !== cityName.toLowerCase());
  saveFavorites();
  updateFavoriteButton(cityName, false);
  showToast(`${cityName} удалён из избранного`, 'info');
}

function toggleFavorite(cityName, country) {
  if (isFavorite(cityName)) {
    removeFromFavorites(cityName);
  } else {
    addToFavorites(cityName, country);
  }
}

function isFavorite(cityName) {
  return favoriteCities.some(c => c.name.toLowerCase() === cityName.toLowerCase());
}

function saveFavorites() {
  localStorage.setItem('weathernow-favorites', JSON.stringify(favoriteCities));
}

function updateFavoriteButton(cityName, isFav) {
  const btn = document.getElementById('favorite-btn');
  if (!btn) return;
  
  if (isFav || isFavorite(cityName)) {
    btn.innerHTML = '<i class="bi bi-heart-fill text-danger fs-4" aria-hidden="true"></i>';
    btn.title = 'Удалить из избранного';
    btn.setAttribute('aria-label', 'Удалить город из избранного');
  } else {
    btn.innerHTML = '<i class="bi bi-heart fs-4" aria-hidden="true"></i>';
    btn.title = 'Добавить в избранное';
    btn.setAttribute('aria-label', 'Добавить город в избранное');
  }
}

function renderFavorites() {
  const container = document.getElementById('screen-favorites');
  if (!container) return;

  container.replaceChildren();

  const page = document.createElement('section');
  page.className = 'favorites-page';

  const heading = document.createElement('div');
  heading.className = 'favorites-heading';

  const title = document.createElement('h2');
  title.className = 'favorites-title';
  title.textContent = 'Избранные города';

  const count = document.createElement('span');
  count.className = 'favorites-count';
  count.textContent = `${favoriteCities.length} из 10`;

  heading.append(title, count);
  page.appendChild(heading);

  if (favoriteCities.length === 0) {
    const empty = document.createElement('div');
    empty.className = 'favorites-empty';

    const icon = document.createElement('i');
    icon.className = 'bi bi-heartbreak';
    icon.setAttribute('aria-hidden', 'true');

    const emptyTitle = document.createElement('h3');
    emptyTitle.textContent = 'Пока здесь тихо';

    const description = document.createElement('p');
    description.textContent = 'Добавляйте любимые города, чтобы быстро узнавать погоду в них';

    const findButton = document.createElement('button');
    findButton.type = 'button';
    findButton.className = 'btn btn-accent rounded-pill px-4';
    findButton.textContent = 'Найти город';
    findButton.addEventListener('click', () => showScreen('home'));

    empty.append(icon, emptyTitle, description, findButton);
    page.appendChild(empty);
    container.appendChild(page);
    return;
  }

  const list = document.createElement('div');
  list.className = 'favorites-grid';
  list.setAttribute('aria-label', 'Список избранных городов');

  favoriteCities.forEach(city => {
    const card = document.createElement('article');
    card.className = 'favorite-city-card';

    const openButton = document.createElement('button');
    openButton.type = 'button';
    openButton.className = 'favorite-city-open';
    openButton.addEventListener('click', () => {
      loadCityWeather(city.name);
      showScreen('home');
    });

    const icon = document.createElement('span');
    icon.className = 'favorite-city-icon';
    icon.textContent = '🏙️';
    icon.setAttribute('aria-hidden', 'true');

    const details = document.createElement('span');
    details.className = 'favorite-city-details';

    const name = document.createElement('span');
    name.className = 'favorite-city-name';
    name.textContent = String(city.name || 'Без названия');

    const country = document.createElement('span');
    country.className = 'favorite-city-country';
    country.textContent = String(city.country || 'Страна не указана');

    details.append(name, country);
    openButton.append(icon, details);

    const removeButton = document.createElement('button');
    removeButton.type = 'button';
    removeButton.className = 'favorite-city-remove';
    removeButton.title = 'Удалить из избранного';
    removeButton.setAttribute('aria-label', `Удалить ${String(city.name || 'город')} из избранного`);

    const removeIcon = document.createElement('i');
    removeIcon.className = 'bi bi-trash3';
    removeIcon.setAttribute('aria-hidden', 'true');
    removeButton.appendChild(removeIcon);
    removeButton.addEventListener('click', () => {
      removeFromFavorites(city.name);
      renderFavorites();
    });

    card.append(openButton, removeButton);
    list.appendChild(card);
  });

  page.appendChild(list);
  container.appendChild(page);
}

document.addEventListener('screenChanged', (e) => {
  if (e.detail === 'favorites') {
    renderFavorites();
  }
});


const LAST_WEATHER_CACHE_KEY = 'weathernow-last-weather';
const MAX_WEATHER_CACHE_AGE_MS = 6 * 60 * 60 * 1000;
const MAX_WEATHER_CACHE_BYTES = 128 * 1024;

function saveLastWeatherSnapshot(data) {
  if (!data || !data.name || !data.main || !Array.isArray(data.weather) || !data.weather[0] || !data.coord) return;
  try {
    const serialized = JSON.stringify({ savedAt: new Date().toISOString(), data });
    if (serialized.length * 2 > MAX_WEATHER_CACHE_BYTES) return;
    localStorage.setItem(LAST_WEATHER_CACHE_KEY, serialized);
  } catch {
    // Storage may be unavailable or full; live weather must still work.
  }
}

function getLastWeatherSnapshot() {
  try {
    const raw = localStorage.getItem(LAST_WEATHER_CACHE_KEY);
    if (!raw) return null;
    const snapshot = JSON.parse(raw);
    const data = snapshot?.data;
    const savedAt = Date.parse(snapshot?.savedAt || '');
    if (!data || typeof data.name !== 'string' || !data.main ||
        !Number.isFinite(Number(data.main.temp)) ||
        !Array.isArray(data.weather) || !data.weather[0] ||
        !data.coord || !Number.isFinite(Number(data.coord.lat)) ||
        !Number.isFinite(Number(data.coord.lon)) || !Number.isFinite(savedAt)) {
      return null;
    }
    const ageMs = Math.max(0, Date.now() - savedAt);
    return {
      data,
      savedAt: new Date(savedAt).toISOString(),
      ageMs,
      stale: ageMs > MAX_WEATHER_CACHE_AGE_MS
    };
  } catch {
    return null;
  }
}


const LAST_FORECAST_CACHE_KEY = 'weathernow-last-forecast';
const MAX_CACHED_FORECAST_CITIES = 8;
const MAX_FORECAST_CACHE_AGE_MS = 12 * 60 * 60 * 1000;
const MAX_FORECAST_CACHE_BYTES = 1024 * 1024;

function normalizeForecastCity(city) {
  return String(city || '').trim().toLocaleLowerCase('ru-RU');
}

function isValidForecastSnapshot(snapshot) {
  const savedAt = Date.parse(snapshot?.savedAt || '');
  return Boolean(snapshot && snapshot.data &&
    Array.isArray(snapshot.data.list) && snapshot.data.city &&
    Number.isFinite(savedAt));
}

function readForecastCache() {
  try {
    const raw = localStorage.getItem(LAST_FORECAST_CACHE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);

    // Migrate the previous single-city cache format without losing its data.
    if (parsed && parsed.city && isValidForecastSnapshot(parsed)) {
      return { [normalizeForecastCity(parsed.city)]: parsed };
    }

    if (!parsed || parsed.version !== 2 || !parsed.cities ||
        typeof parsed.cities !== 'object' || Array.isArray(parsed.cities)) return {};

    return Object.fromEntries(
      Object.entries(parsed.cities).filter(([city, snapshot]) =>
        Boolean(city) && isValidForecastSnapshot(snapshot))
    );
  } catch {
    return {};
  }
}

function saveLastForecastSnapshot(city, data) {
  const cityKey = normalizeForecastCity(city);
  if (!cityKey || !data || !Array.isArray(data.list) || !data.city) return;

  try {
    const cities = readForecastCache();
    // Reinsert to preserve true recency even when two saves share a timestamp.
    delete cities[cityKey];
    cities[cityKey] = { savedAt: new Date().toISOString(), data };

    // Keep recent cities and enforce a conservative per-cache size budget.
    let recentCities = Object.entries(cities).slice(-MAX_CACHED_FORECAST_CITIES);
    let serialized = '';

    while (recentCities.length > 0) {
      serialized = JSON.stringify({
        version: 2,
        cities: Object.fromEntries(recentCities)
      });
      // UTF-16 length * 2 is a conservative approximation of storage bytes.
      if (serialized.length * 2 <= MAX_FORECAST_CACHE_BYTES) break;
      recentCities = recentCities.slice(1);
    }

    if (recentCities.length === 0 || !recentCities.some(([key]) => key === cityKey)) {
      return;
    }

    localStorage.setItem(LAST_FORECAST_CACHE_KEY, serialized);
  } catch {
    // Forecast caching is optional; do not interrupt live rendering.
  }
}

function getLastForecastSnapshot(city) {
  const cityKey = normalizeForecastCity(city);
  if (!cityKey) return null;

  const snapshot = readForecastCache()[cityKey];
  if (!isValidForecastSnapshot(snapshot)) return null;

  const savedAtMs = Date.parse(snapshot.savedAt);
  const ageMs = Math.max(0, Date.now() - savedAtMs);
  return {
    data: snapshot.data,
    savedAt: new Date(savedAtMs).toISOString(),
    ageMs,
    stale: ageMs > MAX_FORECAST_CACHE_AGE_MS
  };
}
