document.addEventListener('DOMContentLoaded', () => {
  const activeScreen = document.querySelector('.screen.active');
  if (!activeScreen) {
    showScreen('home');
  }
  
  setupSearch();
  setupCompareButton();
  initApp();
});

async function initApp() {
  const requestId = ++currentWeatherRequestId;
  forecastRequestId += 1;

  if (navigator.geolocation) {
    document.getElementById('main-city').textContent = 'Определяем город...';
    
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
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
        if (requestId === currentWeatherRequestId) loadDefaultCity(requestId);
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

async function loadDefaultCity(requestId = ++currentWeatherRequestId) {
  try {
    const data = await fetchWeather(CONFIG.DEFAULT_CITY);
    if (requestId !== currentWeatherRequestId) return;

    currentLat = data.coord.lat;
    currentLon = data.coord.lon;
    renderCurrentWeather(data);
    updateRainMap(currentLat, currentLon);
  } catch {
    if (requestId !== currentWeatherRequestId) return;

    document.getElementById('main-city').textContent = 'Не удалось загрузить';
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

function setupMapButtons() {
  document.querySelectorAll('.map-layer-btn').forEach(btn => {
    btn.addEventListener('click', function() {
    });
  });
}
