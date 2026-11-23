let currentMapLayer = 'rain';
let mapIframe = null;
let mapInfoRequestId = 0;

const WINDY_LAYERS = { temperature: 'temp', wind: 'wind', precipitation: 'rain', clouds: 'clouds' };

function switchMapLayer(layer) {
  const newLayer = WINDY_LAYERS[layer];
  if (!newLayer) return;
  currentMapLayer = newLayer;
  document.querySelectorAll('.map-layer-btn').forEach(button => {
    const active = button.dataset.layer === layer;
    button.classList.toggle('active', active);
    button.setAttribute('aria-pressed', String(active));
  });
  if (hasMapCoordinates()) updateRainMap(currentLat, currentLon);
}

function isMapScreenActive() {
  const screen = document.getElementById('screen-rainmap');
  return Boolean(screen && screen.classList.contains('active'));
}

document.addEventListener('screenChanged', event => {
  if (event.detail === 'rainmap' && hasMapCoordinates()) updateRainMap(currentLat, currentLon);
});

function hasMapCoordinates() {
  return typeof currentLat === 'number' && Number.isFinite(currentLat)
    && typeof currentLon === 'number' && Number.isFinite(currentLon);
}

function updateRainMap(lat, lon) {
  if (!isMapScreenActive()) return;
  const mapContainer = document.getElementById('weather-map');
  if (!mapContainer || !Number.isFinite(Number(lat)) || !Number.isFinite(Number(lon))) {
    setMapStatus('Сначала выберите город или разрешите определение местоположения.', 'info');
    return;
  }
  const latitude = Number(lat);
  const longitude = Number(lon);
  const params = new URLSearchParams({
    lat: String(latitude), lon: String(longitude), detailLat: String(latitude), detailLon: String(longitude),
    width: '100%', height: '100%', zoom: String(window.innerWidth < 768 ? 7 : 9),
    level: 'surface', overlay: currentMapLayer, product: 'ecmwf', calendar: 'now',
    pressure: 'true', type: 'map', location: 'coordinates', metricWind: 'default', metricTemp: '°C', radarRange: '-1'
  });
  const mapUrl = 'https://embed.windy.com/embed2.html?' + params.toString();
  setMapStatus('Загружаем погодную карту…', 'loading');
  if (mapIframe && mapIframe.isConnected) {
    mapIframe.src = mapUrl;
  } else {
    mapContainer.replaceChildren();
    mapIframe = document.createElement('iframe');
    mapIframe.title = 'Интерактивная карта погоды';
    mapIframe.width = '100%';
    mapIframe.height = '100%';
    mapIframe.loading = 'lazy';
    mapIframe.referrerPolicy = 'strict-origin-when-cross-origin';
    mapIframe.allowFullscreen = true;
    mapIframe.addEventListener('load', () => setMapStatus('', ''));
    mapIframe.addEventListener('error', () => setMapStatus('Не удалось загрузить карту. Проверьте соединение и попробуйте ещё раз.', 'error'));
    mapContainer.appendChild(mapIframe);
    mapIframe.src = mapUrl;
  }
  updateMapInfo(latitude, longitude);
}

async function toggleMapFullscreen() {
  const container = document.querySelector('.weather-map-container');
  if (!container) return;

  try {
    if (container.classList.contains('map-fullscreen-fallback')) {
      container.classList.remove('map-fullscreen-fallback');
    } else if (document.fullscreenElement === container) {
      await document.exitFullscreen();
    } else if (container.requestFullscreen) {
      await container.requestFullscreen();
    } else {
      container.classList.toggle('map-fullscreen-fallback');
    }
    updateFullscreenButton();
  } catch {
    // Some browsers expose the Fullscreen API but reject it for embedded or
    // restricted contexts. Keep the map usable with the CSS fullscreen fallback.
    if (container.classList.contains('map-fullscreen-fallback')) {
      container.classList.remove('map-fullscreen-fallback');
    } else {
      container.classList.add('map-fullscreen-fallback');
    }
    updateFullscreenButton();
  }
}

function updateFullscreenButton() {
  const button = document.getElementById('map-fullscreen-btn');
  if (!button) return;
  const active = document.fullscreenElement === document.querySelector('.weather-map-container')
    || document.querySelector('.weather-map-container')?.classList.contains('map-fullscreen-fallback');
  button.setAttribute('aria-pressed', String(Boolean(active)));
  button.innerHTML = active
    ? '<i class="bi bi-fullscreen-exit me-1" aria-hidden="true"></i>Обычный режим'
    : '<i class="bi bi-arrows-fullscreen me-1" aria-hidden="true"></i>На весь экран';
}

document.addEventListener('fullscreenchange', updateFullscreenButton);

function setMapStatus(message, state) {
  const status = document.getElementById('map-status');
  if (!status) return;
  status.textContent = message;
  status.dataset.state = state || '';
  status.hidden = !message;
}

async function updateMapInfo(lat, lon) {
  const requestId = ++mapInfoRequestId;
  try {
    const data = await getCityByCoords(lat, lon);
    if (requestId !== mapInfoRequestId) return;
    const mapCity = document.getElementById('map-city');
    const mapTemp = document.getElementById('map-temp');
    const mapWind = document.getElementById('map-wind');
    const mapHumidity = document.getElementById('map-humidity');
    if (mapCity) mapCity.textContent = [data.name, data.sys && data.sys.country].filter(Boolean).join(', ');
    if (mapTemp) mapTemp.textContent = Number.isFinite(Number(data.main && data.main.temp)) ? Math.round(data.main.temp) + '°C' : '—';
    if (mapWind) mapWind.textContent = Number.isFinite(Number(data.wind && data.wind.speed)) ? data.wind.speed + ' м/с' : '—';
    if (mapHumidity) mapHumidity.textContent = Number.isFinite(Number(data.main && data.main.humidity)) ? data.main.humidity + '%' : '—';
  } catch {
    if (requestId === mapInfoRequestId) {
      const mapCity = document.getElementById('map-city');
      if (mapCity) mapCity.textContent = 'Не удалось загрузить данные города';
    }
  }
}