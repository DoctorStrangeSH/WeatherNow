function getWeatherIconMarkup(code) {
  let symbol;

  if (code >= 200 && code < 300) {
    symbol = '<path class="weather-icon-cloud weather-icon-cloud--storm" d="M25 62h53a17 17 0 0 0 0-34 25 25 0 0 0-47-3A19 19 0 0 0 25 62Z"/><path class="weather-icon-bolt" d="m57 58-10 18h11l-5 16 19-24H60l7-10Z"/>';
  } else if ((code >= 300 && code < 600)) {
    symbol = '<path class="weather-icon-cloud" d="M23 54h57a18 18 0 0 0 0-36 26 26 0 0 0-49-3A20 20 0 0 0 23 54Z"/><path class="weather-icon-rain" d="m36 65-5 13m25-13-5 13m25-13-5 13"/>';
  } else if (code >= 600 && code < 700) {
    symbol = '<path class="weather-icon-cloud" d="M23 51h57a18 18 0 0 0 0-36 26 26 0 0 0-49-3A20 20 0 0 0 23 51Z"/><path class="weather-icon-snow" d="M35 66v15m-7-7 14 0m-12-5 10 10m0-10-10 10m31-13v15m-7-7h14m-12-5 10 10m0-10-10 10m25-13v15m-7-7h14m-12-5 10 10m0-10-10 10"/>';
  } else if (code >= 700 && code < 800) {
    symbol = '<path class="weather-icon-fog" d="M28 38h58M18 53h70M30 68h52"/>';
  } else if (code === 800) {
    symbol = '<circle class="weather-icon-sun" cx="60" cy="44" r="19"/><path class="weather-icon-rays" d="M60 8v10m0 52v10M24 44h10m52 0h10M34 18l8 8m36 36 8 8m0-52-8 8m-36 36-8 8"/>';
  } else if (code === 801) {
    symbol = '<circle class="weather-icon-sun" cx="43" cy="33" r="16"/><path class="weather-icon-rays" d="M43 7v7m0 38v7M17 33h7m45 0h7M25 15l5 5m26 26 5 5"/><path class="weather-icon-cloud" d="M30 72h54a17 17 0 0 0 0-34 25 25 0 0 0-46-3A19 19 0 0 0 30 72Z"/>';
  } else {
    symbol = '<path class="weather-icon-cloud" d="M23 63h57a18 18 0 0 0 0-36 26 26 0 0 0-49-3A20 20 0 0 0 23 63Z"/>';
  }

  return `<svg class="weather-icon-svg" viewBox="0 0 120 100" role="img" aria-label="${getWeatherDescription(code)}" xmlns="http://www.w3.org/2000/svg">${symbol}</svg>`;
}


function getWeatherEmoji(code) {
  if (code >= 200 && code < 300) return '⛈️';
  if (code >= 300 && code < 600) return '🌧️';
  if (code >= 600 && code < 700) return '🌨️';
  if (code >= 700 && code < 800) return '🌫️';
  if (code === 800) return '☀️';
  if (code === 801) return '🌤️';
  if (code === 802) return '⛅';
  return '☁️';
}

function getWeatherDescription(code) {
  if (code >= 200 && code < 300) return 'Гроза';
  if (code >= 300 && code < 600) return 'Дождь';
  if (code >= 600 && code < 700) return 'Снег';
  if (code >= 700 && code < 800) return 'Туман';
  if (code === 800) return 'Ясно';
  if (code === 801) return 'Небольшая облачность';
  return 'Облачно';
}

function capitalize(str) {
  if (!str) return '';
  return str.charAt(0).toUpperCase() + str.slice(1);
}

function getCountryFlag(countryCode) {
  const flags = {
    'RU': '🇷🇺', 'US': '🇺🇸', 'GB': '🇬🇧', 'DE': '🇩🇪', 'FR': '🇫🇷',
    'IT': '🇮🇹', 'ES': '🇪🇸', 'CN': '🇨🇳', 'JP': '🇯🇵', 'KR': '🇰🇷',
    'UA': '🇺🇦', 'BY': '🇧🇾', 'KZ': '🇰🇿', 'TR': '🇹🇷', 'IN': '🇮🇳',
    'BR': '🇧🇷', 'CA': '🇨🇦', 'AU': '🇦🇺', 'PL': '🇵🇱', 'CZ': '🇨🇿'
  };
  return flags[countryCode] || '';
}

function parseForecastDate(dateString) {
  const [year, month, day] = dateString.split('-').map(Number);
  if (!year || !month || !day) return new Date(NaN);
  return new Date(year, month - 1, day);
}

function formatDate(dateStr) {
  const [year, month, day] = dateStr.split('-');
  return `${parseInt(day)}.${parseInt(month)}`;
}

function groupForecastByDay(forecastData) {
  const days = {};
  forecastData.list.forEach(item => {
    const date = item.dt_txt.split(' ')[0];
    if (!days[date]) {
      days[date] = { date, temps: [], icons: [], descriptions: [], winds: [], humidities: [] };
    }
    days[date].temps.push(item.main.temp);
    days[date].icons.push(item.weather[0].id);
    days[date].descriptions.push(item.weather[0].description);
    days[date].winds.push(item.wind.speed);
    days[date].humidities.push(item.main.humidity);
  });
  
  return Object.values(days).slice(0, 7).map(day => {
    const avgTemp = day.temps.reduce((a, b) => a + b, 0) / day.temps.length;
    const minTemp = Math.min(...day.temps);
    const maxTemp = Math.max(...day.temps);
    const avgWind = day.winds.reduce((a, b) => a + b, 0) / day.winds.length;
    const avgHumidity = day.humidities.reduce((a, b) => a + b, 0) / day.humidities.length;
    
    const iconCounts = {};
    day.icons.forEach(i => iconCounts[i] = (iconCounts[i] || 0) + 1);
    const mainIcon = Object.keys(iconCounts).sort((a, b) => iconCounts[b] - iconCounts[a])[0];
    
    const descCounts = {};
    day.descriptions.forEach(d => descCounts[d] = (descCounts[d] || 0) + 1);
    const mainDesc = Object.keys(descCounts).sort((a, b) => descCounts[b] - descCounts[a])[0];
    
    return {
      date: day.date,
      temp: Math.round(avgTemp),
      minTemp: Math.round(minTemp),
      maxTemp: Math.round(maxTemp),
      icon: parseInt(mainIcon),
      description: mainDesc,
      wind: Math.round(avgWind * 10) / 10,
      humidity: Math.round(avgHumidity)
    };
  });
}

function getNext24Hours(forecastData, nowTimestamp = Math.floor(Date.now() / 1000)) {
  if (!forecastData || !Array.isArray(forecastData.list)) return [];

  const endTimestamp = nowTimestamp + 24 * 60 * 60;
  const timezoneOffset = Number(forecastData.city?.timezone) || 0;
  const cityToday = new Date((nowTimestamp + timezoneOffset) * 1000).toISOString().slice(0, 10);

  return forecastData.list
    .filter(item => Number.isFinite(item.dt) && item.dt >= nowTimestamp && item.dt <= endTimestamp)
    .slice(0, 8)
    .map(item => {
      const [localDate, localTime] = item.dt_txt.split(' ');
      return {
      dateLabel: localDate === cityToday ? 'Сегодня' : 'Завтра',
      time: localTime.slice(0, 5),
      temp: Math.round(item.main.temp),
      feels: Math.round(item.main.feels_like),
      icon: item.weather[0].id,
      description: item.weather[0].description,
      pop: Math.round((item.pop || 0) * 100),
      wind: item.wind.speed,
      humidity: item.main.humidity
      };
    });
}

function getHourlyForecast(forecastData, dayIndex = 0) {
  // dt_txt хранит локальное время города; при выборе даты учитываем смещение API.
  const timezoneOffset = Number(forecastData.city?.timezone);
  const now = new Date();
  let targetDate;

  if (Number.isFinite(timezoneOffset)) {
    const cityNow = new Date(now.getTime() + timezoneOffset * 1000);
    cityNow.setUTCDate(cityNow.getUTCDate() + dayIndex);
    targetDate = cityNow.toISOString().slice(0, 10);
  } else {
    const localDate = new Date(now.getFullYear(), now.getMonth(), now.getDate() + dayIndex);
    targetDate = [
      localDate.getFullYear(),
      String(localDate.getMonth() + 1).padStart(2, '0'),
      String(localDate.getDate()).padStart(2, '0')
    ].join('-');
  }
  
  return forecastData.list
    .filter(item => item.dt_txt.startsWith(targetDate))
    .map(item => ({
      time: item.dt_txt.split(' ')[1].slice(0, 5),
      temp: Math.round(item.main.temp),
      icon: item.weather[0].id,
      description: item.weather[0].description,
      pop: Math.round(item.pop * 100),
      wind: item.wind.speed,
      humidity: item.main.humidity
    }));
}


function formatWindDirection(degrees) {
  const value = Number(degrees);
  if (!Number.isFinite(value)) return 'Нет данных';

  const directions = [
    'С', 'ССВ', 'СВ', 'ВСВ',
    'В', 'ВЮВ', 'ЮВ', 'ЮЮВ',
    'Ю', 'ЮЮЗ', 'ЮЗ', 'ЗЮЗ',
    'З', 'ЗСЗ', 'СЗ', 'ССЗ'
  ];
  const index = Math.round(((value % 360) + 360) % 360 / 22.5) % 16;
  return directions[index];
}

function formatVisibility(meters) {
  const value = Number(meters);
  if (!Number.isFinite(value) || value < 0) return 'Нет данных';
  if (value >= 1000) return `${(value / 1000).toLocaleString('ru-RU', { maximumFractionDigits: 1 })} км`;
  return `${Math.round(value)} м`;
}

function formatCityTime(timestamp, timezoneOffset = 0) {
  const value = Number(timestamp);
  const offset = Number(timezoneOffset);
  if (!Number.isFinite(value) || !Number.isFinite(offset)) return '—';
  return new Date((value + offset) * 1000).toISOString().slice(11, 16);
}

function formatDaylightDuration(sunrise, sunset) {
  const start = Number(sunrise);
  const end = Number(sunset);
  if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) return '—';

  const minutes = Math.round((end - start) / 60);
  return `${Math.floor(minutes / 60)} ч ${minutes % 60} мин`;
}


function getForecastHighlights(hourlyData) {
  if (!Array.isArray(hourlyData) || hourlyData.length < 2) return [];

  const highlights = [];
  const rainWindow = hourlyData.find(item => Number(item.pop) >= 50);
  if (rainWindow) {
    highlights.push({
      type: 'rain',
      icon: 'bi-umbrella',
      text: `Вероятность осадков достигнет ${Math.round(rainWindow.pop)}% около ${rainWindow.time}`
    });
  }

  const firstTemp = Number(hourlyData[0].temp);
  const lastTemp = Number(hourlyData[hourlyData.length - 1].temp);
  if (Number.isFinite(firstTemp) && Number.isFinite(lastTemp)) {
    const change = lastTemp - firstTemp;
    if (change <= -4) {
      highlights.push({
        type: 'temperature',
        icon: 'bi-thermometer-snow',
        text: `За сутки похолодает примерно на ${Math.round(Math.abs(change))}°`
      });
    } else if (change >= 4) {
      highlights.push({
        type: 'temperature',
        icon: 'bi-thermometer-sun',
        text: `За сутки потеплеет примерно на ${Math.round(change)}°`
      });
    }
  }

  const strongWind = hourlyData.find(item => Number(item.wind) >= 8);
  if (strongWind) {
    highlights.push({
      type: 'wind',
      icon: 'bi-wind',
      text: `Ветер усилится до ${Number(strongWind.wind).toLocaleString('ru-RU', { maximumFractionDigits: 1 })} м/с около ${strongWind.time}`
    });
  }

  return highlights.slice(0, 3);
}
