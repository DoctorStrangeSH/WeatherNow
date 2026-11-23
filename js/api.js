const API_TIMEOUT_MS = 12000;

async function requestJson(url, fallbackMessage) {
  const maxAttempts = 2;

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), API_TIMEOUT_MS);

    try {
      const response = await fetch(url, { signal: controller.signal });
      if (!response.ok) {
        const error = response.status === 404
          ? new Error('Город или прогноз не найден')
          : response.status === 401 || response.status === 403
            ? new Error('Проблема с доступом к погодному сервису')
            : response.status === 429
              ? new Error('Слишком много запросов. Попробуйте позже')
              : new Error(fallbackMessage);

        error.retryable = response.status >= 500 && response.status <= 504;
        throw error;
      }

      return await response.json();
    } catch (error) {
      const isTimeout = error.name === 'AbortError';
      const isNetworkError = error instanceof TypeError;
      const retryable = error.retryable === true || isTimeout || isNetworkError;

      if (attempt < maxAttempts && retryable) {
        await new Promise(resolve => setTimeout(resolve, 350));
        continue;
      }

      if (isTimeout) {
        throw new Error('Сервис погоды отвечает слишком долго. Попробуйте ещё раз');
      }
      if (isNetworkError) {
        throw new Error('Нет соединения с сервисом погоды');
      }
      throw error;
    } finally {
      clearTimeout(timeoutId);
    }
  }

  throw new Error(fallbackMessage);
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
