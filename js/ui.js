let currentLat = null;
let currentLon = null;
let currentForecastData = null;
let currentForecastCity = '';
let currentWeatherCityName = '';
let currentWeatherRequestId = 0;
let forecastRequestId = 0;

function showScreen(screenName) {
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
  const screen = document.getElementById(`screen-${screenName}`);
  if (screen) {
    screen.classList.add('active');
  }
  document.dispatchEvent(new CustomEvent('screenChanged', { detail: screenName }));

  localStorage.setItem('weathernow-screen', screenName);

  if (screenName !== localStorage.getItem('weathernow-screen-restore')) {
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }
  localStorage.removeItem('weathernow-screen-restore');
}

function createWeatherInsight(label, value, icon, note = '') {
  const column = document.createElement('div');
  column.className = 'col-6 col-md-4';

  const card = document.createElement('article');
  card.className = 'weather-insight-card h-100';

  const symbol = document.createElement('span');
  symbol.className = 'weather-insight-icon';
  const iconElement = document.createElement('i');
  iconElement.className = `bi ${icon}`;
  iconElement.setAttribute('aria-hidden', 'true');
  symbol.append(iconElement);

  const title = document.createElement('p');
  title.className = 'weather-insight-label';
  title.textContent = label;

  const reading = document.createElement('strong');
  reading.className = 'weather-insight-value';
  reading.textContent = value;

  card.append(symbol, title, reading);

  if (note) {
    const detail = document.createElement('small');
    detail.className = 'weather-insight-note';
    detail.textContent = note;
    card.append(detail);
  }

  column.append(card);
  return column;
}

function renderWeatherInsights(data) {
  const grid = document.getElementById('weather-insights-grid');
  if (!grid) return;

  const pressure = Number.isFinite(Number(data.main?.pressure))
    ? `${Math.round(Number(data.main.pressure))} гПа`
    : 'Нет данных';
  const windDirection = formatWindDirection(data.wind?.deg);
  const windGust = Number.isFinite(Number(data.wind?.gust))
    ? `${Number(data.wind.gust).toLocaleString('ru-RU', { maximumFractionDigits: 1 })} м/с`
    : 'Нет данных';
  const daylight = formatDaylightDuration(data.sys?.sunrise, data.sys?.sunset);
  const timezone = Number(data.timezone) || 0;

  const sunrise = formatCityTime(data.sys?.sunrise, timezone);
  const sunset = formatCityTime(data.sys?.sunset, timezone);
  const sunNote = sunrise !== '—' && sunset !== '—'
    ? `Световой день: ${daylight}`
    : 'Время города';

  const items = [
    createWeatherInsight('Давление', pressure, 'bi-speedometer2', 'Атмосферное давление'),
    createWeatherInsight('Видимость', formatVisibility(data.visibility), 'bi-eye', 'Дальность обзора'),
    createWeatherInsight('Направление ветра', windDirection, 'bi-compass', 'Откуда дует ветер'),
    createWeatherInsight('Порывы ветра', windGust, 'bi-wind', 'Максимальные порывы'),
    createWeatherInsight('Восход', sunrise, 'bi-sunrise', 'Местное время'),
    createWeatherInsight('Закат', sunset, 'bi-sunset', sunNote)
  ];

  grid.replaceChildren(...items);
}

function renderCurrentWeather(data, options = {}) {
  currentForecastData = null;
  if (options.cached !== true && typeof saveLastWeatherSnapshot === 'function') {
    saveLastWeatherSnapshot(data);
  }
  currentWeatherCityName = data.name || '';
  const weatherHero = document.querySelector('.weather-hero');
  if (weatherHero) weatherHero.dataset.loadState = 'ready';
  if (typeof dismissNetworkStatus === 'function') dismissNetworkStatus();
  document.getElementById('main-city').textContent = `${data.name}, ${data.sys.country}`;
  document.getElementById('main-temp').textContent = `${Math.round(data.main.temp)}°C`;
  const weatherDescription = capitalize(data.weather[0].description);
  const mainDescription = document.getElementById('main-desc');
  if (mainDescription) {
    mainDescription.textContent = options.cached === true
      ? `${weatherDescription} · сохранено ${new Date(options.savedAt).toLocaleString('ru-RU', { dateStyle: 'short', timeStyle: 'short' })}`
      : weatherDescription;
  }
  document.getElementById('detail-humidity').textContent = `${data.main.humidity}%`;
  document.getElementById('detail-wind').textContent = `${data.wind.speed} м/с`;
  document.getElementById('detail-feels').textContent = `${Math.round(data.main.feels_like)}°C`;
  renderWeatherInsights(data);

  document.getElementById('main-icon').innerHTML = getWeatherIconMarkup(data.weather[0].id);

  if (typeof updateWeatherTheme === 'function') {
    updateWeatherTheme(data.weather[0].id, data.timezone, data.wind?.speed);
  }

  if (options.cached === true) {
    if (!restoreCachedForecast(data.name)) {
      const forecastContainer = document.getElementById('forecast-container');
      if (forecastContainer) {
        forecastContainer.dataset.state = 'offline';
        forecastContainer.textContent = 'Прогноз пока недоступен без подключения к интернету.';
      }
    }
  } else {
    loadForecast(data.name);
  }

  if (typeof renderFeelsLikeSection === 'function' && currentForecastData) {
    renderFeelsLikeSection(currentForecastData);
  }

  if (typeof renderWardrobe === 'function') {
    renderWardrobe(data);
  }

  const favBtn = document.getElementById('favorite-btn');
  if (favBtn) {
    favBtn.onclick = () => toggleFavorite(data.name, data.sys.country);
    updateFavoriteButton(data.name);
  }

  const rainMapScreen = document.getElementById('screen-rainmap');
  if (rainMapScreen && rainMapScreen.classList.contains('active')) {
    if (typeof updateRainMap === 'function') {
      updateRainMap(data.coord.lat, data.coord.lon);
    }
  }
}

async function loadForecast(city) {
  const requestId = ++forecastRequestId;
  currentForecastCity = city;

  const container = document.getElementById('forecast-container');
  if (container) {
    container.dataset.state = 'loading';
    container.textContent = 'Загружаем прогноз…';
  }

  try {
    const forecastData = await fetchForecast(city);
    if (requestId !== forecastRequestId) return;

    currentForecastData = forecastData;
    if (typeof saveLastForecastSnapshot === 'function') {
      saveLastForecastSnapshot(city, forecastData);
    }
    const forecastContainer = document.getElementById('forecast-container');
    if (forecastContainer) forecastContainer.dataset.state = 'ready';
    const dailyForecast = groupForecastByDay(forecastData);
    renderForecast(dailyForecast);
    
    if (typeof renderFeelsLikeSection === 'function') {
      renderFeelsLikeSection(forecastData);
    }

  } catch (error) {
    if (requestId !== forecastRequestId) return;

    const forecastContainer = document.getElementById('forecast-container');
    if (forecastContainer) {
      forecastContainer.dataset.state = 'error';
      const message = document.createElement('p');
      message.className = 'col-12 text-center text-muted py-3 mb-2';
      message.textContent = error instanceof Error && error.message
        ? error.message
        : 'Не удалось загрузить прогноз';

      const retry = document.createElement('button');
      retry.type = 'button';
      retry.className = 'btn btn-glass btn-sm rounded-pill mx-auto';
      retry.textContent = 'Повторить загрузку';
      retry.addEventListener('click', retryForecast);
      forecastContainer.replaceChildren(message, retry);
    }
  }
}

function retryForecast() {
  if (currentForecastCity) loadForecast(currentForecastCity);
}

function renderForecast(days) {
  const container = document.getElementById('forecast-container');
  if (!container) return;

  const dayNames = ['Вс', 'Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб'];
  const monthNames = ['янв', 'фев', 'мар', 'апр', 'мая', 'июн', 'июл', 'авг', 'сен', 'окт', 'ноя', 'дек'];

  container.innerHTML = days.map((day, index) => {
    const date = parseForecastDate(day.date);
    const dayName = index === 0 ? 'Сегодня' : index === 1 ? 'Завтра' : dayNames[date.getDay()];
    const dateStr = `${date.getDate()} ${monthNames[date.getMonth()]}`;

    return `
      <div class="col-6 col-md-4 col-lg">
        <div class="glass-card rounded-4 p-2 p-md-3 text-center h-100 forecast-card">
          <p class="fw-bold small mb-1">${dayName}</p>
          <p class="text-muted small mb-2">${dateStr}</p>
          <div class="fs-2 mb-2">${getWeatherIconMarkup(day.icon)}</div>
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
  const container = document.getElementById('hourly-container');
  if (!container || !currentForecastData) return;

  const hourlyData = getNext24Hours(currentForecastData);

  if (hourlyData.length === 0) {
    container.innerHTML = `
      <div class="forecast-empty-state">
        <i class="bi bi-clock-history" aria-hidden="true"></i>
        <p class="fw-semibold mb-1">Почасовой прогноз пока недоступен</p>
        <small>Обновите данные немного позже</small>
      </div>
    `;
    return;
  }

  container.innerHTML = `
    <div class="d-flex justify-content-between align-items-center mb-2 flex-wrap gap-2">
      <h5 class="fw-bold mb-0"><i class="bi bi-clock-history me-2"></i>Ближайшие 24 часа</h5>
      <span class="forecast-section-meta">Шаг прогноза · 3 часа</span>
    </div>
    <div class="hourly-chart-wrap mb-3">
      <canvas id="hourlyChart" role="img" aria-label="График температуры и вероятности осадков на ближайшие 24 часа"></canvas>
    </div>
    <div class="hourly-scroll d-flex gap-2 overflow-auto pb-2" aria-label="Почасовой прогноз на ближайшие 24 часа">
      ${hourlyData.map(hour => `
        <article class="hourly-forecast-item flex-shrink-0">
          <small class="hourly-forecast-day">${hour.dateLabel}</small>
          <span class="hourly-forecast-time">${hour.time}</span>
          <span class="hourly-forecast-icon" aria-hidden="true">${getWeatherIconMarkup(hour.icon)}</span>
          <p class="fw-bold mb-0">${hour.temp}°</p>
          <small class="hourly-forecast-rain ${hour.pop > 0 ? 'is-visible' : ''}">${hour.pop > 0 ? `<i class="bi bi-droplet-fill" aria-hidden="true"></i> ${hour.pop}%` : 'Без осадков'}</small>
        </article>
      `).join('')}
    </div>
  `;

  const highlights = getForecastHighlights(hourlyData);
  if (highlights.length) {
    const panel = document.createElement('section');
    panel.className = 'forecast-highlights';
    panel.setAttribute('aria-label', 'Важные изменения погоды');

    const heading = document.createElement('p');
    heading.className = 'forecast-highlights-title';
    heading.textContent = 'На что обратить внимание';
    panel.append(heading);

    highlights.forEach(highlight => {
      const item = document.createElement('p');
      item.className = 'forecast-highlight-item';
      const icon = document.createElement('i');
      icon.className = `bi ${highlight.icon}`;
      icon.setAttribute('aria-hidden', 'true');
      const text = document.createElement('span');
      text.textContent = highlight.text;
      item.append(icon, text);
      panel.append(item);
    });

    const chart = container.querySelector('.hourly-chart-wrap');
    if (chart) chart.after(panel);
  }

  if (typeof renderHourlyChart === 'function') {
    renderHourlyChart(hourlyData);
  }
}

function setupCompareButton() {
  const compareBtn = document.getElementById('compare-btn');
  if (compareBtn) {
    compareBtn.addEventListener('click', compareCities);
  }
}

let compareRequestId = 0;

function getComparisonSummary(first, second) {
  const firstTemp = Number(first?.main?.temp);
  const secondTemp = Number(second?.main?.temp);
  const firstFeels = Number(first?.main?.feels_like);
  const secondFeels = Number(second?.main?.feels_like);

  if (![firstTemp, secondTemp].every(Number.isFinite)) return null;

  const difference = Math.round(firstTemp - secondTemp);
  const warmerCity = difference === 0
    ? null
    : difference > 0 ? first.name : second.name;

  return {
    temperatureDifference: Math.abs(difference),
    warmerCity,
    sameTemperature: difference === 0,
    feelsDifference: Number.isFinite(firstFeels) && Number.isFinite(secondFeels)
      ? Math.abs(Math.round(firstFeels - secondFeels))
      : null
  };
}

function createCompareMetric(label, value, icon) {
  const metric = document.createElement('div');
  metric.className = 'compare-metric';

  const symbol = document.createElement('i');
  symbol.className = `bi ${icon}`;
  symbol.setAttribute('aria-hidden', 'true');

  const copy = document.createElement('span');
  copy.className = 'compare-metric-copy';

  const metricLabel = document.createElement('small');
  metricLabel.textContent = label;

  const metricValue = document.createElement('strong');
  metricValue.textContent = value;

  copy.append(metricLabel, metricValue);
  metric.append(symbol, copy);
  return metric;
}

function createCompareCityCard(data) {
  const column = document.createElement('div');
  column.className = 'col-12 col-md-6';

  const card = document.createElement('article');
  card.className = 'compare-city-card h-100';

  const header = document.createElement('div');
  header.className = 'compare-city-header';

  const cityName = document.createElement('h3');
  cityName.className = 'compare-city-name';
  cityName.textContent = [data.name, data.sys?.country].filter(Boolean).join(', ');

  const condition = document.createElement('p');
  condition.className = 'compare-city-condition';
  condition.textContent = capitalize(data.weather?.[0]?.description || 'Нет описания');

  const icon = document.createElement('span');
  icon.className = 'compare-city-icon';
  icon.textContent = getWeatherIconMarkup(data.weather?.[0]?.id);
  icon.setAttribute('aria-hidden', 'true');

  header.append(cityName, condition);
  const temperature = document.createElement('p');
  temperature.className = 'compare-city-temperature';
  temperature.textContent = Number.isFinite(Number(data.main?.temp))
    ? `${Math.round(Number(data.main.temp))}°`
    : '—';

  const metrics = document.createElement('div');
  metrics.className = 'compare-metrics';
  metrics.append(
    createCompareMetric('Ощущается', Number.isFinite(Number(data.main?.feels_like)) ? `${Math.round(Number(data.main.feels_like))}°C` : '—', 'bi-thermometer-half'),
    createCompareMetric('Влажность', Number.isFinite(Number(data.main?.humidity)) ? `${data.main.humidity}%` : '—', 'bi-droplet'),
    createCompareMetric('Ветер', Number.isFinite(Number(data.wind?.speed)) ? `${data.wind.speed} м/с` : '—', 'bi-wind'),
    createCompareMetric('Давление', Number.isFinite(Number(data.main?.pressure)) ? `${data.main.pressure} гПа` : '—', 'bi-speedometer2')
  );

  card.append(header, icon, temperature, metrics);
  column.appendChild(card);
  return column;
}

function renderCompareLoading(container) {
  const loading = document.createElement('div');
  loading.className = 'col-12 compare-loading';
  loading.setAttribute('role', 'status');

  const spinner = document.createElement('span');
  spinner.className = 'spinner-border text-accent';
  spinner.setAttribute('aria-hidden', 'true');

  const message = document.createElement('p');
  message.textContent = 'Сравниваем погоду в двух городах…';

  loading.append(spinner, message);
  container.replaceChildren(loading);
}

function renderCompareError(container, message) {
  const error = document.createElement('div');
  error.className = 'col-12 compare-error';
  error.setAttribute('role', 'alert');

  const icon = document.createElement('i');
  icon.className = 'bi bi-exclamation-circle';
  icon.setAttribute('aria-hidden', 'true');

  const text = document.createElement('p');
  text.textContent = message;

  error.append(icon, text);
  container.replaceChildren(error);
}

function renderCompareResults(container, first, second) {
  const fragment = document.createDocumentFragment();
  const summary = getComparisonSummary(first, second);

  if (summary) {
    const insight = document.createElement('div');
    insight.className = 'col-12 compare-insight';

    const icon = document.createElement('i');
    icon.className = 'bi bi-stars';
    icon.setAttribute('aria-hidden', 'true');

    const message = document.createElement('p');
    message.textContent = summary.sameTemperature
      ? 'В обоих городах сейчас одинаковая температура.'
      : `${summary.warmerCity} теплее на ${summary.temperatureDifference}°C.`;

    insight.append(icon, message);
    fragment.appendChild(insight);
  }

  fragment.append(createCompareCityCard(first), createCompareCityCard(second));
  container.replaceChildren(fragment);
}

async function compareCities() {
  const firstInput = document.getElementById('compare-city-1');
  const secondInput = document.getElementById('compare-city-2');
  const container = document.getElementById('compare-results');
  const compareButton = document.getElementById('compare-btn');

  if (!firstInput || !secondInput || !container || !compareButton) return;

  const city1 = firstInput.value.trim();
  const city2 = secondInput.value.trim();

  if (!city1 || !city2) {
    showToast('Введи оба города для сравнения', 'warning');
    return;
  }

  if (city1.localeCompare(city2, undefined, { sensitivity: 'base' }) === 0) {
    showToast('Выбери два разных города', 'warning');
    return;
  }

  const requestId = ++compareRequestId;
  compareButton.disabled = true;
  compareButton.setAttribute('aria-busy', 'true');
  compareButton.dataset.originalLabel ||= compareButton.textContent.trim();
  compareButton.textContent = 'Сравниваем…';
  renderCompareLoading(container);

  try {
    const [first, second] = await Promise.all([fetchWeather(city1), fetchWeather(city2)]);
    if (requestId !== compareRequestId) return;
    renderCompareResults(container, first, second);
  } catch {
    if (requestId === compareRequestId) {
      renderCompareError(container, 'Не удалось загрузить погоду. Проверь названия городов и попробуй ещё раз.');
    }
  } finally {
    if (requestId === compareRequestId) {
      compareButton.disabled = false;
      compareButton.removeAttribute('aria-busy');
      compareButton.textContent = compareButton.dataset.originalLabel || 'Сравнить';
    }
  }
}

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

window.addEventListener('beforeunload', () => {
  const activeScreen = document.querySelector('.screen.active');
  if (activeScreen) {
    localStorage.setItem('weathernow-screen', activeScreen.id.replace('screen-', ''));
  }
  localStorage.setItem('weathernow-scroll', window.scrollY);
});

function restoreState() {
  const savedScreen = localStorage.getItem('weathernow-screen');
  const savedScroll = localStorage.getItem('weathernow-scroll');

  if (savedScreen && savedScreen !== 'home') {
    localStorage.setItem('weathernow-screen-restore', 'true');
    showScreen(savedScreen);
  }

  if (savedScroll) {
    setTimeout(() => {
      window.scrollTo({ top: parseInt(savedScroll), behavior: 'instant' });
    }, 150);
  }
}

document.addEventListener('DOMContentLoaded', () => {
  setTimeout(restoreState, 50);
});


function restoreCachedForecast(city) {
  if (typeof getLastForecastSnapshot !== 'function') return false;
  const snapshot = getLastForecastSnapshot(city);
  if (!snapshot) return false;

  currentForecastCity = city;
  currentForecastData = snapshot.data;
  const container = document.getElementById('forecast-container');
  if (container) {
    container.dataset.state = 'cached';
    renderForecast(groupForecastByDay(snapshot.data));
    const notice = document.createElement('p');
    notice.className = 'forecast-cache-note';
    notice.textContent = `Прогноз сохранён ${new Date(snapshot.savedAt).toLocaleString('ru-RU', { dateStyle: 'short', timeStyle: 'short' })}`;
    container.prepend(notice);
  }

  if (typeof renderFeelsLikeSection === 'function') {
    renderFeelsLikeSection(snapshot.data);
  }
  return true;
}
