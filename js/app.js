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

  try {
    const data = await fetchWeather(city);
    if (requestId !== currentWeatherRequestId) return;

    currentLat = data.coord.lat;
    currentLon = data.coord.lon;
    renderCurrentWeather(data);
    updateRainMap(currentLat, currentLon);
    closeSearchResults();
  } catch {
    if (requestId === currentWeatherRequestId) {
      showToast('Город не найден 😢', 'danger');
    }
  }
}

function setupMapButtons() {
  document.querySelectorAll('.map-layer-btn').forEach(btn => {
    btn.addEventListener('click', function() {
    });
  });
}
