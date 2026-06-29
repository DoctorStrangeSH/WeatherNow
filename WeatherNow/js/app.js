// ============================================
// WeatherNow — Инициализация приложения
// ============================================

document.addEventListener('DOMContentLoaded', () => {
  // Не переопределяем экран, если он уже восстановлен
  const activeScreen = document.querySelector('.screen.active');
  if (!activeScreen) {
    showScreen('home');
  }
  
  setupSearch();
  setupCompareButton();
  initApp();
});

async function initApp() {
  if (navigator.geolocation) {
    document.getElementById('main-city').textContent = 'Определяем город...';
    
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        currentLat = pos.coords.latitude;
        currentLon = pos.coords.longitude;
        try {
          const data = await getCityByCoords(currentLat, currentLon);
          renderCurrentWeather(data);
          updateRainMap(currentLat, currentLon);
          const retryBtn = document.getElementById('retry-geo-btn');
          if (retryBtn) retryBtn.classList.add('d-none');
        } catch {
          loadDefaultCity();
        }
      },
      () => {
        loadDefaultCity();
        const retryBtn = document.getElementById('retry-geo-btn');
        if (retryBtn) retryBtn.classList.remove('d-none');
      },
      { timeout: 15000, enableHighAccuracy: true, maximumAge: 300000 }
    );
  } else {
    loadDefaultCity();
  }
}

function retryGeolocation() {
  showToast('Запрашиваю геолокацию...', 'info');
  const retryBtn = document.getElementById('retry-geo-btn');
  if (retryBtn) retryBtn.classList.add('d-none');
  initApp();
}

async function loadDefaultCity() {
  try {
    const data = await fetchWeather(CONFIG.DEFAULT_CITY);
    currentLat = data.coord.lat;
    currentLon = data.coord.lon;
    renderCurrentWeather(data);
    updateRainMap(currentLat, currentLon);
  } catch {
    document.getElementById('main-city').textContent = 'Не удалось загрузить';
    const retryBtn = document.getElementById('retry-geo-btn');
    if (retryBtn) retryBtn.classList.remove('d-none');
  }
}

async function loadCityWeather(city) {
  try {
    const data = await fetchWeather(city);
    currentLat = data.coord.lat;
    currentLon = data.coord.lon;
    renderCurrentWeather(data);
    updateRainMap(currentLat, currentLon);
    closeSearchResults();
  } catch {
    showToast('Город не найден 😢', 'danger');
  }
}

function setupMapButtons() {
  document.querySelectorAll('.map-layer-btn').forEach(btn => {
    btn.addEventListener('click', function() {
      // Убираем старый обработчик, используем onclick из HTML
    });
  });
}