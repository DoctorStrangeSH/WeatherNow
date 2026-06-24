// ============================================
// WeatherNow — API-сервис
// ============================================

const API_BASE = 'https://api.openweathermap.org/data/2.5';
const GEO_BASE = 'https://api.openweathermap.org/geo/1.0';

async function fetchWeather(city) {
  const url = `${API_BASE}/weather?q=${encodeURIComponent(city)}&appid=${CONFIG.API_KEY}&units=${CONFIG.UNITS}&lang=${CONFIG.LANG}`;
  const response = await fetch(url);
  if (!response.ok) throw new Error('Город не найден');
  return await response.json();
}

async function fetchForecast(city) {
  const url = `${API_BASE}/forecast?q=${encodeURIComponent(city)}&appid=${CONFIG.API_KEY}&units=${CONFIG.UNITS}&lang=${CONFIG.LANG}`;
  const response = await fetch(url);
  if (!response.ok) throw new Error('Прогноз не найден');
  return await response.json();
}

async function getCityByCoords(lat, lon) {
  const url = `${API_BASE}/weather?lat=${lat}&lon=${lon}&appid=${CONFIG.API_KEY}&units=${CONFIG.UNITS}&lang=${CONFIG.LANG}`;
  const response = await fetch(url);
  return await response.json();
}

async function searchCities(query) {
  if (query.length < 2) return [];
  
  const url = `${GEO_BASE}/direct?q=${encodeURIComponent(query)}&limit=5&appid=${CONFIG.API_KEY}`;
  
  try {
    const response = await fetch(url);
    if (!response.ok) return [];
    return await response.json();
  } catch {
    return [];
  }
}

// Группировка 3-часового прогноза по дням (5 дней)
function groupForecastByDay(forecastData) {
  const days = {};
  
  forecastData.list.forEach(item => {
    const date = item.dt_txt.split(' ')[0];
    
    if (!days[date]) {
      days[date] = {
        date: date,
        temps: [],
        icons: [],
        descriptions: [],
        winds: [],
        humidities: []
      };
    }
    
    days[date].temps.push(item.main.temp);
    days[date].icons.push(item.weather[0].id);
    days[date].descriptions.push(item.weather[0].description);
    days[date].winds.push(item.wind.speed);
    days[date].humidities.push(item.main.humidity);
  });
  
  return Object.values(days).slice(0, 5).map(day => {
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