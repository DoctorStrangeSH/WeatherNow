// ============================================
// WeatherNow — Обработка данных погоды
// ============================================

function getWeatherEmoji(code) {
  if (code >= 200 && code < 300) return '⛈️';
  if (code >= 300 && code < 400) return '🌦️';
  if (code >= 500 && code < 600) return '🌧️';
  if (code >= 600 && code < 700) return '🌨️';
  if (code >= 700 && code < 800) return '🌫️';
  if (code === 800) return '☀️';
  if (code === 801) return '🌤️';
  if (code === 802) return '⛅';
  return '☁️';
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

function formatDate(dateStr) {
  const [year, month, day] = dateStr.split('-');
  return `${parseInt(day)}.${parseInt(month)}`;
}

// Группировка прогноза по дням (7 дней)
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

// Почасовой прогноз
function getHourlyForecast(forecastData, dayIndex = 0) {
  const today = new Date();
  today.setDate(today.getDate() + dayIndex);
  const targetDate = today.toISOString().split('T')[0];
  
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