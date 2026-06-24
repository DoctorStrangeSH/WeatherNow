// ============================================
// WeatherNow — Управление экранами и UI
// ============================================

let searchTimeout;
let tempChartInstance = null;
let hourlyChartInstance = null;
let currentForecastData = null;
let currentHourlyDay = 0;

document.addEventListener('DOMContentLoaded', () => {
  initApp();
  setupSearch();
  setupCompareButton();
});

async function initApp() {
  if (navigator.geolocation) {
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        try {
          const data = await getCityByCoords(pos.coords.latitude, pos.coords.longitude);
          renderCurrentWeather(data);
        } catch {
          loadDefaultCity();
        }
      },
      () => loadDefaultCity()
    );
  } else {
    loadDefaultCity();
  }
}

async function loadDefaultCity() {
  try {
    const data = await fetchWeather(CONFIG.DEFAULT_CITY);
    renderCurrentWeather(data);
  } catch {
    document.getElementById('main-city').textContent = 'Не удалось загрузить';
  }
}

async function loadCityWeather(city) {
  try {
    const data = await fetchWeather(city);
    renderCurrentWeather(data);
    closeSearchResults();
  } catch {
    showToast('Город не найден 😢', 'danger');
  }
}

function renderCurrentWeather(data) {
  document.getElementById('main-city').textContent = `${data.name}, ${data.sys.country}`;
  document.getElementById('main-temp').textContent = `${Math.round(data.main.temp)}°C`;
  document.getElementById('main-desc').textContent = capitalize(data.weather[0].description);
  document.getElementById('detail-humidity').textContent = `${data.main.humidity}%`;
  document.getElementById('detail-wind').textContent = `${data.wind.speed} м/с`;
  document.getElementById('detail-feels').textContent = `${Math.round(data.main.feels_like)}°C`;
  
  const icon = document.getElementById('main-icon');
  icon.innerHTML = getWeatherEmoji(data.weather[0].id);
  
  updateSkyBackground(data.weather[0].id);
  
  // Загружаем прогноз
  loadForecast(data.name);
  
  // Обновляем кнопку избранного
  const favBtn = document.getElementById('favorite-btn');
  if (favBtn) {
    favBtn.onclick = () => toggleFavorite(data.name, data.sys.country);
    updateFavoriteButton(data.name);
  }
}

// ========== ПОИСК ==========

function setupSearch() {
  const headerSearch = document.getElementById('header-search');
  const mobileSearch = document.getElementById('mobile-search');
  
  [headerSearch, mobileSearch].forEach(input => {
    if (!input) return;
    
    input.addEventListener('input', function() {
      clearTimeout(searchTimeout);
      const query = this.value.trim();
      
      if (query.length < 2) {
        closeSearchResults();
        return;
      }
      
      searchTimeout = setTimeout(() => searchCitiesAndShow(query), 300);
    });
    
    input.addEventListener('keypress', function(e) {
      if (e.key === 'Enter' && this.value.trim()) {
        loadCityWeather(this.value.trim());
        this.value = '';
      }
    });
  });
  
  document.addEventListener('click', (e) => {
    if (!e.target.closest('.search-results') && !e.target.closest('input')) {
      closeSearchResults();
    }
  });
}

async function searchCitiesAndShow(query) {
  const cities = await searchCities(query);
  
  if (cities.length === 0) {
    closeSearchResults();
    return;
  }
  
  let resultsEl = document.getElementById('search-results');
  
  if (!resultsEl) {
    resultsEl = document.createElement('div');
    resultsEl.id = 'search-results';
    resultsEl.className = 'search-results glass-card rounded-4 p-2 mt-2';
    resultsEl.style.cssText = 'position: absolute; z-index: 100; width: 280px; max-height: 300px; overflow-y: auto;';
    
    const headerSearch = document.getElementById('header-search');
    const mobileSearch = document.getElementById('mobile-search');
    
    if (document.activeElement === headerSearch) {
      headerSearch.parentElement.parentElement.appendChild(resultsEl);
    } else if (document.activeElement === mobileSearch) {
      mobileSearch.parentElement.parentElement.appendChild(resultsEl);
    }
  }
  
  resultsEl.innerHTML = cities.map(city => `
    <div class="search-item d-flex align-items-center gap-3 p-2 rounded-3" 
         onclick="loadCityWeather('${city.name}')" style="cursor: pointer;">
      <span class="fs-5">🏙️</span>
      <div>
        <p class="fw-bold mb-0 small">${city.name}</p>
        <small class="text-muted">${city.state || ''} ${city.country}</small>
      </div>
    </div>
  `).join('');
  
  resultsEl.style.display = 'block';
}

function closeSearchResults() {
  const results = document.getElementById('search-results');
  if (results) {
    results.style.display = 'none';
  }
}

// ========== ФОН ПО ПОГОДЕ ==========

function updateSkyBackground(weatherCode) {
  const sky = document.getElementById('sky');
  if (!sky) return;
  
  if (isDarkMode) {
    updateSkyForTheme();
    return;
  }
  
  if (weatherCode >= 200 && weatherCode < 600) {
    sky.style.background = 'linear-gradient(180deg, #6b7b8d 0%, #8e9eab 100%)';
  } else if (weatherCode >= 600 && weatherCode < 700) {
    sky.style.background = 'linear-gradient(180deg, #cfd8dc 0%, #eceff1 100%)';
  } else if (weatherCode >= 700 && weatherCode < 800) {
    sky.style.background = 'linear-gradient(180deg, #b0bec5 0%, #d7ccc8 100%)';
  } else if (weatherCode === 800) {
    sky.style.background = 'linear-gradient(180deg, #4facfe 0%, #00f2fe 100%)';
  } else {
    sky.style.background = 'linear-gradient(180deg, #87CEEB 0%, #E0F0FF 100%)';
  }
}

// ========== ЭМОДЗИ ПОГОДЫ ==========

function getWeatherEmoji(code) {
  if (code >= 200 && code < 300) return '⛈️';
  if (code >= 300 && code < 500) return '🌧️';
  if (code >= 500 && code < 600) return '🌧️';
  if (code >= 600 && code < 700) return '🌨️';
  if (code >= 700 && code < 800) return '🌫️';
  if (code === 800) return '☀️';
  if (code === 801) return '🌤️';
  if (code === 802) return '⛅';
  return '☁️';
}

// ========== НАВИГАЦИЯ ==========

function showScreen(screenName) {
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
  document.getElementById(`screen-${screenName}`)?.classList.add('active');
  document.dispatchEvent(new CustomEvent('screenChanged', { detail: screenName }));
}

function capitalize(str) {
  return str.charAt(0).toUpperCase() + str.slice(1);
}

// ========== ПРОГНОЗ ==========

async function loadForecast(city) {
  try {
    const forecastData = await fetchForecast(city);
    currentForecastData = forecastData;
    const dailyForecast = groupForecastByDay(forecastData);
    renderForecast(dailyForecast);
  } catch (error) {
    console.error('Ошибка загрузки прогноза:', error);
    document.getElementById('forecast-container').innerHTML = `
      <div class="col-12 text-center text-muted py-3">
        <i class="bi bi-exclamation-circle me-2"></i>Не удалось загрузить прогноз
      </div>
    `;
  }
}

function renderForecast(days) {
  const container = document.getElementById('forecast-container');
  if (!container) return;
  
  const dayNames = ['Вс', 'Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб'];
  
  container.innerHTML = days.map((day, index) => {
    const date = new Date(day.date);
    const dayName = index === 0 ? 'Сегодня' : index === 1 ? 'Завтра' : dayNames[date.getDay()];
    
    return `
      <div class="col-6 col-md-4 col-lg">
        <div class="glass-card rounded-4 p-3 text-center h-100 forecast-card">
          <p class="fw-bold small mb-2">${dayName}</p>
          <p class="text-muted small mb-2">${formatDate(day.date)}</p>
          <div class="fs-2 mb-2">${getWeatherEmoji(day.icon)}</div>
          <p class="fw-bold mb-1">${day.maxTemp}° <span class="text-muted small">${day.minTemp}°</span></p>
          <small class="text-muted d-block">${capitalize(day.description)}</small>
          <div class="d-flex justify-content-center gap-3 mt-2 small text-muted">
            <span title="Ветер"><i class="bi bi-wind me-1"></i>${day.wind}</span>
            <span title="Влажность"><i class="bi bi-droplet me-1"></i>${day.humidity}%</span>
          </div>
        </div>
      </div>
    `;
  }).join('');
  
  renderTempChart(days);
  renderHourlyForecast();
}

function formatDate(dateStr) {
  const [year, month, day] = dateStr.split('-');
  return `${parseInt(day)}.${parseInt(month)}`;
}

// ========== ГРАФИК ТЕМПЕРАТУРЫ ==========

function renderTempChart(days) {
  const canvas = document.getElementById('tempChart');
  if (!canvas || days.length === 0) return;
  
  const ctx = canvas.getContext('2d');
  
  if (tempChartInstance) tempChartInstance.destroy();
  
  const dayNames = ['Вс', 'Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб'];
  const labels = days.map((day, i) => {
    if (i === 0) return 'Сегодня';
    if (i === 1) return 'Завтра';
    const date = new Date(day.date);
    return dayNames[date.getDay()];
  });
  
  const maxTemps = days.map(d => d.maxTemp);
  const minTemps = days.map(d => d.minTemp);
  
  const maxGradient = ctx.createLinearGradient(0, 0, 0, 250);
  maxGradient.addColorStop(0, 'rgba(255, 140, 66, 0.4)');
  maxGradient.addColorStop(1, 'rgba(255, 140, 66, 0.0)');
  
  const minGradient = ctx.createLinearGradient(0, 0, 0, 250);
  minGradient.addColorStop(0, 'rgba(66, 165, 245, 0.4)');
  minGradient.addColorStop(1, 'rgba(66, 165, 245, 0.0)');
  
  tempChartInstance = new Chart(ctx, {
    type: 'line',
    data: {
      labels: labels,
      datasets: [
        {
          label: 'Макс. температура',
          data: maxTemps,
          borderColor: '#FF8C42',
          backgroundColor: maxGradient,
          fill: true,
          borderWidth: 3,
          pointBackgroundColor: '#FF8C42',
          pointBorderColor: '#ffffff',
          pointBorderWidth: 2,
          pointRadius: 6,
          pointHoverRadius: 9,
          tension: 0.4,
          order: 1
        },
        {
          label: 'Мин. температура',
          data: minTemps,
          borderColor: '#42A5F5',
          backgroundColor: minGradient,
          fill: true,
          borderWidth: 3,
          pointBackgroundColor: '#42A5F5',
          pointBorderColor: '#ffffff',
          pointBorderWidth: 2,
          pointRadius: 6,
          pointHoverRadius: 9,
          tension: 0.4,
          order: 1
        }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: {
          position: 'top',
          labels: {
            usePointStyle: true,
            padding: 20,
            font: { family: "'Nunito', sans-serif", size: 12 },
            color: isDarkMode ? '#fff' : '#1a1a2e'
          }
        },
        tooltip: {
          backgroundColor: 'rgba(26, 26, 46, 0.9)',
          titleFont: { family: "'Nunito', sans-serif", size: 13 },
          bodyFont: { family: "'Nunito', sans-serif", size: 12 },
          padding: 12,
          cornerRadius: 8,
          callbacks: {
            label: function(context) {
              return context.dataset.label + ': ' + context.parsed.y + '°C';
            }
          }
        }
      },
      scales: {
        x: {
          grid: { display: false },
          ticks: { 
            font: { family: "'Nunito', sans-serif", size: 12 },
            color: isDarkMode ? '#aaa' : '#666'
          }
        },
        y: {
          grid: { color: isDarkMode ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.06)' },
          ticks: {
            font: { family: "'Nunito', sans-serif", size: 11 },
            callback: function(value) { return value + '°C'; },
            color: isDarkMode ? '#aaa' : '#666'
          }
        }
      },
      interaction: { intersect: false, mode: 'index' }
    }
  });
}

// ========== ПОЧАСОВОЙ ПРОГНОЗ ==========

function renderHourlyForecast() {
  if (!currentForecastData) return;
  
  const hourlyData = getHourlyForecast(currentForecastData, currentHourlyDay);
  
  const container = document.getElementById('hourly-container');
  if (!container) return;
  
  container.innerHTML = `
    <div class="d-flex justify-content-between align-items-center mb-3">
      <h5 class="fw-bold mb-0">
        <i class="bi bi-clock-history me-2"></i>Почасовой прогноз
      </h5>
      <div class="btn-group btn-group-sm">
        <button class="btn btn-glass ${currentHourlyDay === 0 ? 'active' : ''}" onclick="switchHourlyDay(0)">Сегодня</button>
        <button class="btn btn-glass ${currentHourlyDay === 1 ? 'active' : ''}" onclick="switchHourlyDay(1)">Завтра</button>
      </div>
    </div>
    
    <div style="position: relative; height: 220px;" class="mb-3">
      <canvas id="hourlyChart"></canvas>
    </div>
    
    <div class="hourly-scroll d-flex gap-2 overflow-auto pb-2">
      ${hourlyData.map(hour => `
        <div class="glass-card rounded-4 p-2 text-center flex-shrink-0" style="min-width: 75px;">
          <small class="text-muted d-block">${hour.time}</small>
          <span class="fs-5 d-block my-1">${getWeatherEmoji(hour.icon)}</span>
          <p class="fw-bold small mb-0">${hour.temp}°</p>
          ${hour.pop > 30 ? `<small class="text-info">💧${hour.pop}%</small>` : ''}
        </div>
      `).join('')}
    </div>
  `;
  
  renderHourlyChart(hourlyData);
}

function switchHourlyDay(day) {
  currentHourlyDay = day;
  renderHourlyForecast();
}

function renderHourlyChart(hourlyData) {
  const canvas = document.getElementById('hourlyChart');
  if (!canvas) return;
  
  const ctx = canvas.getContext('2d');
  
  if (hourlyChartInstance) hourlyChartInstance.destroy();
  
  const gradient = ctx.createLinearGradient(0, 0, 0, 220);
  gradient.addColorStop(0, 'rgba(255, 140, 66, 0.3)');
  gradient.addColorStop(1, 'rgba(255, 140, 66, 0.0)');
  
  hourlyChartInstance = new Chart(ctx, {
    type: 'line',
    data: {
      labels: hourlyData.map(h => h.time),
      datasets: [
        {
          label: 'Температура °C',
          data: hourlyData.map(h => h.temp),
          borderColor: '#FF8C42',
          backgroundColor: gradient,
          fill: true,
          borderWidth: 2,
          pointRadius: 3,
          pointHoverRadius: 6,
          tension: 0.4,
          yAxisID: 'y'
        },
        {
          label: 'Осадки %',
          data: hourlyData.map(h => h.pop),
          borderColor: '#42A5F5',
          backgroundColor: 'rgba(66, 165, 245, 0.1)',
          fill: true,
          borderWidth: 2,
          borderDash: [5, 5],
          pointRadius: 2,
          tension: 0.4,
          yAxisID: 'y1'
        }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: {
          position: 'top',
          labels: {
            usePointStyle: true,
            padding: 15,
            font: { family: "'Nunito', sans-serif", size: 11 },
            color: isDarkMode ? '#fff' : '#1a1a2e'
          }
        }
      },
      scales: {
        x: { grid: { display: false } },
        y: {
          type: 'linear',
          position: 'left',
          grid: { color: isDarkMode ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.06)' },
          ticks: { 
            callback: v => v + '°',
            color: isDarkMode ? '#aaa' : '#666'
          }
        },
        y1: {
          type: 'linear',
          position: 'right',
          max: 100,
          grid: { display: false },
          ticks: { 
            callback: v => v + '%',
            color: isDarkMode ? '#aaa' : '#666'
          }
        }
      }
    }
  });
}

// ========== СРАВНЕНИЕ ГОРОДОВ ==========

function setupCompareButton() {
  document.getElementById('compare-btn')?.addEventListener('click', compareCities);
}

async function compareCities() {
  const city1 = document.getElementById('compare-city-1').value.trim();
  const city2 = document.getElementById('compare-city-2').value.trim();
  
  if (!city1 || !city2) {
    showToast('Введи оба города для сравнения', 'warning');
    return;
  }
  
  const container = document.getElementById('compare-results');
  container.innerHTML = `
    <div class="col-12 text-center py-4">
      <div class="spinner-border text-accent" role="status"></div>
      <p class="text-muted mt-2">Сравниваем погоду...</p>
    </div>
  `;
  
  try {
    const [data1, data2] = await Promise.all([
      fetchWeather(city1),
      fetchWeather(city2)
    ]);
    
    container.innerHTML = `
      <div class="col-md-6">
        <div class="glass-card rounded-4 p-4 text-center h-100">
          <h4 class="fw-bold mb-3">${data1.name}, ${data1.sys.country}</h4>
          <div class="fs-1 mb-2">${getWeatherEmoji(data1.weather[0].id)}</div>
          <p class="display-5 fw-bold">${Math.round(data1.main.temp)}°C</p>
          <p class="text-muted">${capitalize(data1.weather[0].description)}</p>
          <hr>
          <div class="row g-2 small">
            <div class="col-6">💧 ${data1.main.humidity}%</div>
            <div class="col-6">💨 ${data1.wind.speed} м/с</div>
            <div class="col-6">🌡️ ${Math.round(data1.main.feels_like)}°C</div>
            <div class="col-6">📊 ${data1.main.pressure} гПа</div>
          </div>
        </div>
      </div>
      <div class="col-md-6">
        <div class="glass-card rounded-4 p-4 text-center h-100">
          <h4 class="fw-bold mb-3">${data2.name}, ${data2.sys.country}</h4>
          <div class="fs-1 mb-2">${getWeatherEmoji(data2.weather[0].id)}</div>
          <p class="display-5 fw-bold">${Math.round(data2.main.temp)}°C</p>
          <p class="text-muted">${capitalize(data2.weather[0].description)}</p>
          <hr>
          <div class="row g-2 small">
            <div class="col-6">💧 ${data2.main.humidity}%</div>
            <div class="col-6">💨 ${data2.wind.speed} м/с</div>
            <div class="col-6">🌡️ ${Math.round(data2.main.feels_like)}°C</div>
            <div class="col-6">📊 ${data2.main.pressure} гПа</div>
          </div>
        </div>
      </div>
    `;
  } catch {
    container.innerHTML = `
      <div class="col-12 text-center text-danger py-4">
        <i class="bi bi-exclamation-circle fs-1 d-block mb-2"></i>
        Не удалось загрузить данные. Проверь названия городов.
      </div>
    `;
  }
}

// ========== ТОСТЫ ==========

function showToast(message, type = 'info') {
  let container = document.getElementById('toast-container');
  if (!container) {
    container = document.createElement('div');
    container.id = 'toast-container';
    container.className = 'toast-container position-fixed bottom-0 end-0 p-3';
    container.style.zIndex = '9999';
    document.body.appendChild(container);
  }
  
  const colors = {
    success: 'bg-success text-white',
    danger: 'bg-danger text-white',
    info: 'bg-info text-white',
    warning: 'bg-warning text-dark'
  };
  
  const toastEl = document.createElement('div');
  toastEl.className = `toast align-items-center border-0 shadow-lg ${colors[type] || colors.info}`;
  toastEl.setAttribute('role', 'alert');
  toastEl.innerHTML = `
    <div class="d-flex">
      <div class="toast-body">${message}</div>
      <button type="button" class="btn-close me-2 m-auto" data-bs-dismiss="toast" aria-label="Закрыть"></button>
    </div>
  `;
  
  container.appendChild(toastEl);
  const toast = new bootstrap.Toast(toastEl, { delay: 3000 });
  toast.show();
  toastEl.addEventListener('hidden.bs.toast', () => toastEl.remove());
}