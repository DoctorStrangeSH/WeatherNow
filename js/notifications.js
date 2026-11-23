const NOTIFICATION_SETTINGS_KEY = 'weathernow-notification-settings';
const NOTIFICATION_HISTORY_KEY = 'weathernow-notification-history';
const DEFAULT_NOTIFICATION_SETTINGS = Object.freeze({
  enabled: false,
  rain: true,
  storms: true,
  snow: true,
  wind: true,
  windThreshold: 12,
  cold: false,
  coldThreshold: 0,
  heat: false,
  heatThreshold: 32
});

let notificationSettings = loadNotificationSettings();
const notificationInFlight = new Set();
let notificationsEnabled = notificationSettings.enabled && typeof Notification !== 'undefined'
  && Notification.permission === 'granted';

function loadNotificationSettings() {
  try {
    const stored = JSON.parse(localStorage.getItem(NOTIFICATION_SETTINGS_KEY) || '{}');
    const numberOrDefault = (value, fallback, min, max) => {
      const number = Number(value);
      return Number.isFinite(number) ? Math.min(max, Math.max(min, number)) : fallback;
    };
    return {
      ...DEFAULT_NOTIFICATION_SETTINGS,
      ...stored,
      enabled: stored.enabled === true,
      rain: stored.rain !== false,
      storms: stored.storms !== false,
      snow: stored.snow !== false,
      wind: stored.wind !== false,
      windThreshold: numberOrDefault(stored.windThreshold, 12, 1, 40),
      cold: stored.cold === true,
      coldThreshold: numberOrDefault(stored.coldThreshold, 0, -50, 20),
      heat: stored.heat === true,
      heatThreshold: numberOrDefault(stored.heatThreshold, 32, 15, 55)
    };
  } catch {
    return { ...DEFAULT_NOTIFICATION_SETTINGS };
  }
}

function getWeatherAlertCandidates(data, settings = notificationSettings) {
  if (!data || !data.main || !data.wind || !Array.isArray(data.weather) || !data.weather[0]) return [];
  const code = Number(data.weather[0].id);
  const temperature = Number(data.main.temp);
  const windSpeed = Number(data.wind.speed);
  const alerts = [];
  if (settings.storms && code >= 200 && code < 300) {
    alerts.push({ type: 'storm', title: 'Гроза', body: `В городе ${data.name} возможна гроза. Будьте осторожны.` });
  } else if (settings.rain && code >= 500 && code < 600) {
    alerts.push({ type: 'rain', title: 'Ожидается дождь', body: `В городе ${data.name} ожидается дождь. Не забудьте зонт.` });
  } else if (settings.snow && code >= 600 && code < 700) {
    alerts.push({ type: 'snow', title: 'Снегопад', body: `В городе ${data.name} ожидается снег.` });
  }
  if (settings.wind && Number.isFinite(windSpeed) && windSpeed >= settings.windThreshold) {
    alerts.push({ type: 'wind', title: 'Сильный ветер', body: `В городе ${data.name} ветер ${windSpeed.toLocaleString('ru-RU')} м/с.` });
  }
  if (settings.cold && Number.isFinite(temperature) && temperature <= settings.coldThreshold) {
    alerts.push({ type: 'cold', title: 'Похолодание', body: `В городе ${data.name} температура ${Math.round(temperature)}°C.` });
  }
  if (settings.heat && Number.isFinite(temperature) && temperature >= settings.heatThreshold) {
    alerts.push({ type: 'heat', title: 'Жаркая погода', body: `В городе ${data.name} температура ${Math.round(temperature)}°C.` });
  }
  return alerts;
}

function openWeatherNotificationSettings() {
  const dialog = document.getElementById('notification-settings-dialog');
  if (!dialog) return;
  const fields = {
    'notification-enabled': notificationSettings.enabled,
    'notification-rain': notificationSettings.rain,
    'notification-storms': notificationSettings.storms,
    'notification-snow': notificationSettings.snow,
    'notification-wind': notificationSettings.wind,
    'notification-cold': notificationSettings.cold,
    'notification-heat': notificationSettings.heat
  };
  Object.entries(fields).forEach(([id, checked]) => {
    const input = document.getElementById(id);
    if (input) input.checked = checked;
  });
  const numbers = {
    'notification-wind-threshold': notificationSettings.windThreshold,
    'notification-cold-threshold': notificationSettings.coldThreshold,
    'notification-heat-threshold': notificationSettings.heatThreshold
  };
  Object.entries(numbers).forEach(([id, value]) => {
    const input = document.getElementById(id);
    if (input) input.value = String(value);
  });
  if (typeof dialog.showModal === 'function') dialog.showModal();
  else dialog.setAttribute('open', '');
}

async function saveWeatherNotificationSettings() {
  const readChecked = id => Boolean(document.getElementById(id)?.checked);
  const readNumber = (id, fallback, min, max) => {
    const value = Number(document.getElementById(id)?.value);
    return Number.isFinite(value) ? Math.min(max, Math.max(min, value)) : fallback;
  };
  const next = {
    enabled: readChecked('notification-enabled'),
    rain: readChecked('notification-rain'),
    storms: readChecked('notification-storms'),
    snow: readChecked('notification-snow'),
    wind: readChecked('notification-wind'),
    windThreshold: readNumber('notification-wind-threshold', 12, 1, 40),
    cold: readChecked('notification-cold'),
    coldThreshold: readNumber('notification-cold-threshold', 0, -50, 20),
    heat: readChecked('notification-heat'),
    heatThreshold: readNumber('notification-heat-threshold', 32, 15, 55)
  };

  if (next.enabled) {
    if (!('Notification' in window)) {
      showToast('Этот браузер не поддерживает уведомления.', 'warning');
      next.enabled = false;
    } else {
      let permission = Notification.permission;
      if (permission !== 'granted' && permission !== 'denied') {
        permission = await Notification.requestPermission();
      }
      if (permission !== 'granted') {
        next.enabled = false;
        showToast(permission === 'denied'
          ? 'Разрешите уведомления в настройках браузера.'
          : 'Разрешение на уведомления не получено.', 'info');
      }
    }
  }

  notificationSettings = next;
  notificationsEnabled = next.enabled;
  try {
    localStorage.setItem(NOTIFICATION_SETTINGS_KEY, JSON.stringify(notificationSettings));
  } catch {
    showToast('Не удалось сохранить настройки уведомлений.', 'warning');
  }

  const dialog = document.getElementById('notification-settings-dialog');
  if (dialog?.open && typeof dialog.close === 'function') dialog.close();
  showToast(notificationsEnabled ? 'Настройки уведомлений сохранены.' : 'Уведомления выключены.', 'success');
  if (notificationsEnabled && typeof currentWeatherCityName === 'string' && currentWeatherCityName) {
    checkWeatherForAlerts();
  }
}

async function checkWeatherForAlerts(weatherData = null) {
  if (!notificationsEnabled || typeof Notification === 'undefined' || Notification.permission !== 'granted') return;
  try {
    const cityName = document.getElementById('main-city')?.textContent.split(',')[0]?.trim();
    if (!cityName) return;
    const data = weatherData || await fetchWeather(cityName);
    const alerts = getWeatherAlertCandidates(data);
    let history = {};
    try {
      history = JSON.parse(localStorage.getItem(NOTIFICATION_HISTORY_KEY) || '{}') || {};
    } catch {
      history = {};
    }
    const today = new Date().toISOString().slice(0, 10);
    for (const alert of alerts) {
      const key = `${today}:${String(data.name).toLocaleLowerCase('ru-RU')}:${alert.type}`;
      if (history[key] || notificationInFlight.has(key)) continue;
      notificationInFlight.add(key);
      try {
        sendNotification(alert.title, alert.body, alert.type);
        history[key] = true;
      } finally {
        notificationInFlight.delete(key);
      }
    }
    try {
      const keys = Object.keys(history).sort().slice(-60);
      localStorage.setItem(NOTIFICATION_HISTORY_KEY, JSON.stringify(
        Object.fromEntries(keys.map(key => [key, history[key]]))
      ));
    } catch {
      // Notification delivery must not depend on storage availability.
    }
  } catch {
    showToast('Не удалось проверить погодные предупреждения.', 'warning');
  }
}

function sendNotification(title, body, type = 'weather-alert') {
  if (!notificationsEnabled || typeof Notification === 'undefined' || Notification.permission !== 'granted') return false;
  new Notification(title, {
    body,
    icon: 'assets/favicon.svg',
    badge: 'assets/favicon.svg',
    tag: `weather-${type}`
  });
  return true;
}
