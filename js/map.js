// ============================================
// WeatherNow — Карта погоды (Windy.com)
// ============================================

let currentMapLayer = 'temp';
let lastMapUpdate = 0;
let mapIframe = null;

// Маппинг кнопок на слои Windy
const WINDY_LAYERS = {
  'temperature': 'temp',
  'wind': 'wind',
  'precipitation': 'rain',
  'clouds': 'clouds'
};

function switchMapLayer(layer) {
  const newLayer = WINDY_LAYERS[layer];
  if (!newLayer) return;
  
  // Если слой не изменился — выходим
  if (newLayer === currentMapLayer && mapIframe) return;
  
  currentMapLayer = newLayer;
  
  // Обновляем активную кнопку
  document.querySelectorAll('.map-layer-btn').forEach(btn => btn.classList.remove('active'));
  const activeBtn = document.querySelector(`[onclick*="'${layer}'"]`);
  if (activeBtn) activeBtn.classList.add('active');
  
  // Обновляем только iframe без пересоздания контейнера
  if (typeof currentLat !== 'undefined' && typeof currentLon !== 'undefined') {
    updateRainMap(currentLat, currentLon);
  }
}

function updateRainMap(lat, lon) {
  const mapContainer = document.getElementById('weather-map');
  if (!mapContainer || !lat || !lon) return;
  
  const zoom = window.innerWidth < 768 ? 7 : 9;
  
  const mapUrl = `https://embed.windy.com/embed2.html?lat=${lat}&lon=${lon}&detailLat=${lat}&detailLon=${lon}&width=100%&height=100%&zoom=${zoom}&level=surface&overlay=${currentMapLayer}&product=ecmwf&calendar=now&pressure=true&type=map&location=coordinates&metricWind=default&metricTemp=%C2%B0C&radarRange=-1`;
  
  // Если iframe уже существует — обновляем src
  if (mapIframe && mapIframe.parentNode) {
    mapIframe.src = mapUrl;
  } else {
    // Создаём новый iframe
    mapContainer.innerHTML = '';
    mapIframe = document.createElement('iframe');
    mapIframe.src = mapUrl;
    mapIframe.width = '100%';
    mapIframe.height = '100%';
    mapIframe.style.cssText = 'border: none; min-height: 450px; border-radius: 1rem;';
    mapIframe.setAttribute('allowfullscreen', '');
    mapIframe.setAttribute('loading', 'lazy');
    mapContainer.appendChild(mapIframe);
  }
  
  updateMapInfo(lat, lon);
}

async function updateMapInfo(lat, lon) {
  try {
    // Проверяем, не обновляли ли недавно
    const now = Date.now();
    if (updateMapInfo.lastUpdate && now - updateMapInfo.lastUpdate < 10000) return;
    updateMapInfo.lastUpdate = now;
    
    const data = await getCityByCoords(lat, lon);
    const mapCity = document.getElementById('map-city');
    const mapTemp = document.getElementById('map-temp');
    const mapWind = document.getElementById('map-wind');
    const mapHumidity = document.getElementById('map-humidity');
    
    if (mapCity) mapCity.textContent = `${data.name}, ${data.sys.country}`;
    if (mapTemp) mapTemp.textContent = `${Math.round(data.main.temp)}°C`;
    if (mapWind) mapWind.textContent = `${data.wind.speed} м/с`;
    if (mapHumidity) mapHumidity.textContent = `${data.main.humidity}%`;
  } catch {
    console.log('Информация о городе не обновлена');
  }
}