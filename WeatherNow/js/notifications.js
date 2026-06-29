// ============================================
// WeatherNow — Push-уведомления о погоде
// ============================================

let notificationsEnabled = false;

function requestNotificationPermission() {
  if (!('Notification' in window)) {
    showToast('Твой браузер не поддерживает уведомления 😢', 'warning');
    return;
  }
  
  Notification.requestPermission().then(permission => {
    if (permission === 'granted') {
      notificationsEnabled = true;
      showToast('Уведомления включены! 🔔', 'success');
      checkWeatherForAlerts();
    } else {
      showToast('Уведомления отключены', 'info');
    }
  });
}

async function checkWeatherForAlerts() {
  if (!notificationsEnabled) return;
  
  try {
    const cityName = document.getElementById('main-city').textContent.split(',')[0];
    const data = await fetchWeather(cityName);
    const weatherCode = data.weather[0].id;
    
    if (weatherCode >= 500 && weatherCode < 600) {
      sendNotification('🌧️ Внимание!', `В городе ${data.name} ожидается дождь. Не забудь зонт!`);
    } else if (weatherCode >= 200 && weatherCode < 300) {
      sendNotification('⛈️ Штормовое предупреждение!', `В городе ${data.name} гроза. Будь осторожен!`);
    } else if (weatherCode >= 600 && weatherCode < 700) {
      sendNotification('🌨️ Снегопад!', `В городе ${data.name} идёт снег. Одевайся теплее!`);
    }
  } catch (error) {
    console.log('Ошибка проверки погоды для уведомлений');
  }
}

function sendNotification(title, body) {
  if (!notificationsEnabled) return;
  
  new Notification(title, {
    body: body,
    icon: 'assets/favicon.svg',
    badge: 'assets/favicon.svg',
    tag: 'weather-alert'
  });
}