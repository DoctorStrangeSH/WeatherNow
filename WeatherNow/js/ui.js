// ============================================
// WeatherNow — UI (рендеринг, навигация)
// ============================================

let currentLat = null;
let currentLon = null;
let currentForecastData = null;
let currentHourlyDay = 0;

// ========== НАВИГАЦИЯ ==========

function showScreen(screenName) {
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
  const screen = document.getElementById(`screen-${screenName}`);
  if (screen) {
    screen.classList.add('active');
  }
  document.dispatchEvent(new CustomEvent('screenChanged', { detail: screenName }));

  // Сохраняем текущий экран
  localStorage.setItem('weathernow-screen', screenName);

  // Скролл наверх при смене экрана (только если перешли сами, не при загрузке)
  if (screenName !== localStorage.getItem('weathernow-screen-restore')) {
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }
  localStorage.removeItem('weathernow-screen-restore');
}

// ========== РЕНДЕРИНГ ПОГОДЫ ==========

function renderCurrentWeather(data) {
  document.getElementById('main-city').textContent = `${data.name}, ${data.sys.country}`;
  document.getElementById('main-temp').textContent = `${Math.round(data.main.temp)}°C`;
  document.getElementById('main-desc').textContent = capitalize(data.weather[0].description);
  document.getElementById('detail-humidity').textContent = `${data.main.humidity}%`;
  document.getElementById('detail-wind').textContent = `${data.wind.speed} м/с`;
  document.getElementById('detail-feels').textContent = `${Math.round(data.main.feels_like)}°C`;

  document.getElementById('main-icon').innerHTML = getWeatherEmoji(data.weather[0].id);

  // Обновляем тему
  if (typeof updateWeatherTheme === 'function') {
    updateWeatherTheme(data.weather[0].id, data.timezone);
  }

  // Загружаем прогноз
  loadForecast(data.name);

  // Рендерим "Ощущается как"
  if (typeof renderFeelsLikeSection === 'function' && currentForecastData) {
    renderFeelsLikeSection(currentForecastData);
  }

  // Рендерим гардероб
  if (typeof renderWardrobe === 'function') {
    renderWardrobe(data);
  }

  // Обновляем кнопку избранного
  const favBtn = document.getElementById('favorite-btn');
  if (favBtn) {
    favBtn.onclick = () => toggleFavorite(data.name, data.sys.country);
    updateFavoriteButton(data.name);
  }

  // Обновляем карту только если мы на экране карты
  const rainMapScreen = document.getElementById('screen-rainmap');
  if (rainMapScreen && rainMapScreen.classList.contains('active')) {
    if (typeof updateRainMap === 'function') {
      updateRainMap(data.coord.lat, data.coord.lon);
    }
  }
}

// ========== ПРОГНОЗ ==========

async function loadForecast(city) {
  try {
    const forecastData = await fetchForecast(city);
    currentForecastData = forecastData;
    const dailyForecast = groupForecastByDay(forecastData);
    renderForecast(dailyForecast);
    
    if (typeof renderFeelsLikeSection === 'function') {
      renderFeelsLikeSection(forecastData);
    }

  } catch (error) {
    console.error('Ошибка загрузки прогноза:', error);
    const container = document.getElementById('forecast-container');
    if (container) {
      container.innerHTML = `
        <div class="col-12 text-center text-muted py-3">
          <i class="bi bi-exclamation-circle me-2"></i>Не удалось загрузить прогноз
        </div>
      `;
    }
  }
}

function renderForecast(days) {
  const container = document.getElementById('forecast-container');
  if (!container) return;

  const dayNames = ['Вс', 'Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб'];
  const monthNames = ['янв', 'фев', 'мар', 'апр', 'мая', 'июн', 'июл', 'авг', 'сен', 'окт', 'ноя', 'дек'];

  container.innerHTML = days.map((day, index) => {
    const date = new Date(day.date);
    const dayName = index === 0 ? 'Сегодня' : index === 1 ? 'Завтра' : dayNames[date.getDay()];
    const dateStr = `${date.getDate()} ${monthNames[date.getMonth()]}`;

    return `
      <div class="col-6 col-md-4 col-lg">
        <div class="glass-card rounded-4 p-2 p-md-3 text-center h-100 forecast-card">
          <p class="fw-bold small mb-1">${dayName}</p>
          <p class="text-muted small mb-2">${dateStr}</p>
          <div class="fs-2 mb-2">${getWeatherEmoji(day.icon)}</div>
          <div class="temp-range">
            <div class="temp-high" title="Максимальная">
              <i class="bi bi-arrow-up text-danger" style="font-size: 0.6rem;"></i>
              <span class="fw-bold">${day.maxTemp}°</span>
            </div>
            <div class="temp-low" title="Минимальная">
              <i class="bi bi-arrow-down text-primary" style="font-size: 0.6rem;"></i>
              <span class="text-muted">${day.minTemp}°</span>
            </div>
          </div>
          <small class="text-muted d-none d-md-block">${capitalize(day.description)}</small>
          <div class="d-flex justify-content-center gap-2 mt-2 small text-muted">
            <span title="Ветер"><i class="bi bi-wind me-1"></i>${day.wind}</span>
            <span title="Влажность"><i class="bi bi-droplet me-1"></i>${day.humidity}%</span>
          </div>
        </div>
      </div>
    `;
  }).join('');

  if (typeof renderTempChart === 'function') {
    renderTempChart(days);
  }
  renderHourlyForecast();
}

function renderHourlyForecast() {
  if (!currentForecastData) return;

  const hourlyData = getHourlyForecast(currentForecastData, currentHourlyDay);
  const container = document.getElementById('hourly-container');
  if (!container) return;

  container.innerHTML = `
    <div class="d-flex justify-content-between align-items-center mb-3 flex-wrap gap-2">
      <h5 class="fw-bold mb-0"><i class="bi bi-clock-history me-2"></i>Почасовой прогноз</h5>
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
        <div class="glass-card rounded-4 p-2 text-center flex-shrink-0" style="min-width: 70px;">
          <small class="text-muted d-block">${hour.time}</small>
          <span class="fs-5 d-block my-1">${getWeatherEmoji(hour.icon)}</span>
          <p class="fw-bold small mb-0">${hour.temp}°</p>
          ${hour.pop > 30 ? `<small class="text-info">💧${hour.pop}%</small>` : ''}
        </div>
      `).join('')}
    </div>
  `;

  if (typeof renderHourlyChart === 'function') {
    renderHourlyChart(hourlyData);
  }
}

function switchHourlyDay(day) {
  currentHourlyDay = day;
  renderHourlyForecast();
}

// ========== СРАВНЕНИЕ ==========

function setupCompareButton() {
  const compareBtn = document.getElementById('compare-btn');
  if (compareBtn) {
    compareBtn.addEventListener('click', compareCities);
  }
}

async function compareCities() {
  const city1 = document.getElementById('compare-city-1').value.trim();
  const city2 = document.getElementById('compare-city-2').value.trim();

  if (!city1 || !city2) {
    showToast('Введи оба города для сравнения', 'warning');
    return;
  }

  const container = document.getElementById('compare-results');
  if (!container) return;

  container.innerHTML = `
    <div class="col-12 text-center py-4">
      <div class="spinner-border text-accent" role="status"></div>
      <p class="text-muted mt-2">Сравниваем погоду...</p>
    </div>
  `;

  try {
    const [data1, data2] = await Promise.all([fetchWeather(city1), fetchWeather(city2)]);

    container.innerHTML = `
      <div class="col-12 col-md-6 mb-3 mb-md-0">
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
      <div class="col-12 col-md-6">
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

// ========== СОХРАНЕНИЕ СОСТОЯНИЯ ==========

// Сохраняем текущий экран и позицию скролла перед уходом
window.addEventListener('beforeunload', () => {
  const activeScreen = document.querySelector('.screen.active');
  if (activeScreen) {
    localStorage.setItem('weathernow-screen', activeScreen.id.replace('screen-', ''));
  }
  localStorage.setItem('weathernow-scroll', window.scrollY);
});

// Восстанавливаем состояние при загрузке
function restoreState() {
  const savedScreen = localStorage.getItem('weathernow-screen');
  const savedScroll = localStorage.getItem('weathernow-scroll');

  if (savedScreen && savedScreen !== 'home') {
    // Устанавливаем флаг, чтобы showScreen не скроллил наверх
    localStorage.setItem('weathernow-screen-restore', 'true');
    showScreen(savedScreen);
  }

  // Восстанавливаем позицию скролла
  if (savedScroll) {
    setTimeout(() => {
      window.scrollTo({ top: parseInt(savedScroll), behavior: 'instant' });
    }, 150);
  }
}

// Вызываем восстановление при загрузке
document.addEventListener('DOMContentLoaded', () => {
  // Небольшая задержка, чтобы DOM полностью загрузился
  setTimeout(restoreState, 50);
});