const API_TIMEOUT_MS = 12000;

async function requestJson(url, fallbackMessage) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), API_TIMEOUT_MS);

  try {
    const response = await fetch(url, { signal: controller.signal });
    if (!response.ok) {
      if (response.status === 404) throw new Error('Город или прогноз не найден');
      if (response.status === 401 || response.status === 403) {
        throw new Error('Проблема с доступом к погодному сервису');
      }
      if (response.status === 429) throw new Error('Слишком много запросов. Попробуйте позже');
      throw new Error(fallbackMessage);
    }
    return await response.json();
  } catch (error) {
    if (error.name === 'AbortError') {
      throw new Error('Сервис погоды отвечает слишком долго. Попробуйте ещё раз');
    }
    if (error instanceof TypeError) {
      throw new Error('Нет соединения с сервисом погоды');
    }
    throw error;
  } finally {
    clearTimeout(timeoutId);
  }
}

async function fetchWeather(city) {
  return requestJson(buildUrl('/weather', { q: city }), 'Не удалось загрузить погоду');
}

async function fetchForecast(city) {
  return requestJson(buildUrl('/forecast', { q: city }), 'Не удалось загрузить прогноз');
}

async function getCityByCoords(lat, lon) {
  return requestJson(buildUrl('/weather', { lat, lon }), 'Не удалось определить город');
}

async function searchCities(query) {
  if (query.trim().length < 2) return [];

  try {
    return await requestJson(
      buildUrl('/direct', { q: query.trim(), limit: 5 }),
      'Не удалось выполнить поиск'
    );
  } catch {
    return [];
  }
}

function buildUrl(path, params) {
  if (!CONFIG.PROXY_URL) {
    throw new Error('Погодный сервис не настроен: отсутствует адрес защищённого proxy');
  }

  const queryString = new URLSearchParams(params).toString();
  return `${CONFIG.PROXY_URL.replace(/\/$/, '')}${path}?${queryString}`;
}
