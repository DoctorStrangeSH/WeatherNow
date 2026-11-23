document.addEventListener('DOMContentLoaded', () => {
  const activeScreen = document.querySelector('.screen.active');
  if (!activeScreen) {
    showScreen('home');
  }
  
  setupSearch();
  setupNetworkStatus();
  if (navigator.onLine === false && restoreCachedWeather()) return;
  initApp();
});

async function initApp() {
  const requestId = ++currentWeatherRequestId;
  forecastRequestId += 1;

  if (navigator.geolocation) {
    const cityLabel = document.getElementById('main-city');
    if (cityLabel) cityLabel.textContent = 'Определяем город...';

    // Start the default-city request immediately instead of waiting for the
    // geolocation permission prompt or its 15-second timeout.
    let geolocationResolved = false;
    loadDefaultCity(requestId, () => !geolocationResolved);

    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        geolocationResolved = true;
        try {
          const data = await getCityByCoords(pos.coords.latitude, pos.coords.longitude);
          if (requestId !== currentWeatherRequestId) return;

          currentLat = data.coord.lat;
          currentLon = data.coord.lon;
          renderCurrentWeather(data);
          updateRainMap(currentLat, currentLon);
          const retryBtn = document.getElementById('retry-geo-btn');
          if (retryBtn) retryBtn.classList.add('d-none');
        } catch {
          if (requestId === currentWeatherRequestId) loadDefaultCity(requestId);
        }
      },
      () => {
        const retryBtn = document.getElementById('retry-geo-btn');
        if (retryBtn) retryBtn.classList.remove('d-none');
      },
      { timeout: 15000, enableHighAccuracy: true, maximumAge: 300000 }
    );
  } else {
    loadDefaultCity(requestId);
  }
}

function retryGeolocation() {
  showToast('Запрашиваю геолокацию...', 'info');
  const retryBtn = document.getElementById('retry-geo-btn');
  if (retryBtn) retryBtn.classList.add('d-none');
  initApp();
}

async function loadDefaultCity(requestId = ++currentWeatherRequestId, canApply = () => true) {
  try {
    const data = await fetchWeather(CONFIG.DEFAULT_CITY);
    if (requestId !== currentWeatherRequestId || !canApply()) return;

    currentLat = data.coord.lat;
    currentLon = data.coord.lon;
    renderCurrentWeather(data);
    updateRainMap(currentLat, currentLon);
  } catch {
    if (requestId !== currentWeatherRequestId || !canApply()) return;

    if (restoreCachedWeather(CONFIG.DEFAULT_CITY)) return;
    const cityLabel = document.getElementById('main-city');
    if (cityLabel) cityLabel.textContent = 'Не удалось загрузить';
    const retryBtn = document.getElementById('retry-geo-btn');
    if (retryBtn) retryBtn.classList.remove('d-none');
  }
}

async function loadCityWeather(city) {
  const requestId = ++currentWeatherRequestId;
  forecastRequestId += 1;
  const previousCityName = currentWeatherCityName || '';
  const hero = document.querySelector('.weather-hero');
  const cityLabel = document.getElementById('main-city');
  if (hero) hero.dataset.loadState = 'loading';
  if (cityLabel) cityLabel.textContent = `Загружаем ${city}…`;

  try {
    const data = await fetchWeather(city);
    if (requestId !== currentWeatherRequestId) return;

    currentLat = data.coord.lat;
    currentLon = data.coord.lon;
    renderCurrentWeather(data);
    updateRainMap(currentLat, currentLon);
    closeSearchResults();
  } catch (error) {
    if (requestId === currentWeatherRequestId) {
      // Prefer a city-matched snapshot even when another city's weather is still visible.
      if (restoreCachedWeather(city)) return;
      const hasPreviousWeather = Boolean(previousCityName);
      if (hero) hero.dataset.loadState = hasPreviousWeather ? 'stale' : 'error';
      if (cityLabel) cityLabel.textContent = previousCityName || 'Не удалось загрузить';
      const description = document.getElementById('main-desc');
      if (description) {
        description.textContent = hasPreviousWeather
          ? 'Не удалось обновить · показаны последние успешные данные'
          : 'Погодные данные пока недоступны';
      }

      const message = error instanceof Error && error.message
        ? error.message
        : 'Не удалось загрузить погоду. Попробуйте ещё раз';
      showToast(message, 'danger');
    }
  }
}

function setupNetworkStatus() {
  const banner = document.getElementById('network-status');
  const message = document.getElementById('network-status-message');
  const retryButton = document.getElementById('network-retry-btn');
  if (!banner) return;

  const setOfflineState = () => {
    banner.hidden = false;
    banner.classList.remove('is-online');
    if (message) message.textContent = 'Нет подключения к интернету. Показываем последние загруженные данные.';
    if (retryButton) retryButton.disabled = true;
    document.body.dataset.network = 'offline';
  };

  const setOnlineState = () => {
    banner.hidden = false;
    banner.classList.add('is-online');
    if (message) message.textContent = 'Подключение восстановлено. Обновляем погоду…';
    if (retryButton) retryButton.disabled = false;
    document.body.dataset.network = 'online';

    if (currentWeatherCityName) {
      loadCityWeather(currentWeatherCityName);
    } else {
      initApp();
    }
  };

  window.addEventListener('offline', setOfflineState);
  window.addEventListener('online', setOnlineState);

  if (retryButton) {
    retryButton.addEventListener('click', () => {
      if (!navigator.onLine) {
        setOfflineState();
        return;
      }
      if (currentWeatherCityName) loadCityWeather(currentWeatherCityName);
      else initApp();
    });
  }

  if (navigator.onLine === false) setOfflineState();
  else document.body.dataset.network = 'online';
}

function dismissNetworkStatus() {
  const banner = document.getElementById('network-status');
  if (banner && navigator.onLine !== false) banner.hidden = true;
}

function restoreCachedWeather(expectedCity) {
  if (typeof getLastWeatherSnapshot !== 'function') return false;
  const snapshot = getLastWeatherSnapshot();
  if (!snapshot) return false;

  const data = snapshot.data;
  if (expectedCity && String(data.name).trim().toLocaleLowerCase('ru-RU') !==
      String(expectedCity).trim().toLocaleLowerCase('ru-RU')) return false;
  currentLat = data.coord.lat;
  currentLon = data.coord.lon;
  renderCurrentWeather(data, { cached: true, savedAt: snapshot.savedAt, stale: snapshot.stale });
  updateRainMap(currentLat, currentLon);
  return true;
}
