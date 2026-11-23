const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const source = fs.readFileSync(path.join(__dirname, '../js/notifications.js'), 'utf8');

function createContext(stored = null) {
  const values = new Map();
  if (stored !== null) values.set('weathernow-notification-settings', stored);
  const notifications = [];
  class MockNotification {
    static permission = 'granted';
    static async requestPermission() { return 'granted'; }
    constructor(title, options) { notifications.push({ title, options }); }
  }
  const localStorage = {
    getItem(key) { return values.has(key) ? values.get(key) : null; },
    setItem(key, value) { values.set(key, String(value)); }
  };
  const context = vm.createContext({
    localStorage,
    Notification: MockNotification,
    window: { Notification: MockNotification },
    document: { getElementById() { return null; } },
    showToast() {},
    console
  });
  vm.runInContext(source, context);
  return { context, values, notifications };
}

function weather(code, temp = 18, wind = 3) {
  return {
    name: 'Berlin',
    weather: [{ id: code }],
    main: { temp },
    wind: { speed: wind }
  };
}

test('weather alerts detect rain, storms and snow only when enabled', () => {
  const { context } = createContext();
  const alerts = vm.runInContext(
    'getWeatherAlertCandidates(data, settings)',
    vm.createContext({
      getWeatherAlertCandidates: context.getWeatherAlertCandidates,
      data: weather(500),
      settings: { rain: true, storms: true, snow: true, wind: false, cold: false, heat: false }
    })
  );
  assert.equal(alerts.length, 1);
  assert.equal(alerts[0].type, 'rain');
});

test('wind and temperature alerts respect configured thresholds', () => {
  const { context } = createContext();
  const sandbox = vm.createContext({
    getWeatherAlertCandidates: context.getWeatherAlertCandidates,
    data: weather(800, -4, 14),
    settings: {
      rain: false, storms: false, snow: false, wind: true, windThreshold: 12,
      cold: true, coldThreshold: 0, heat: true, heatThreshold: 32
    }
  });
  const alerts = vm.runInContext('getWeatherAlertCandidates(data, settings)', sandbox);
  assert.deepEqual(Array.from(alerts, item => item.type), ['wind', 'cold']);
});

test('disabled alert categories do not generate notifications', () => {
  const { context } = createContext();
  const sandbox = vm.createContext({
    getWeatherAlertCandidates: context.getWeatherAlertCandidates,
    data: weather(211, 40, 25),
    settings: {
      rain: false, storms: false, snow: false, wind: false,
      cold: false, heat: false
    }
  });
  assert.equal(vm.runInContext('getWeatherAlertCandidates(data, settings).length', sandbox), 0);
});

test('stored thresholds are clamped to safe supported ranges', () => {
  const stored = JSON.stringify({ enabled: true, windThreshold: 999, coldThreshold: -999, heatThreshold: 999 });
  const { context } = createContext(stored);
  const settings = vm.runInContext('notificationSettings', context);
  assert.equal(settings.windThreshold, 40);
  assert.equal(settings.coldThreshold, -50);
  assert.equal(settings.heatThreshold, 55);
  assert.equal(vm.runInContext('notificationsEnabled', context), true);
});

test('notifications cannot be sent unless browser permission is granted and setting is enabled', () => {
  const { context, notifications } = createContext();
  assert.equal(vm.runInContext("sendNotification('Test', 'Body')", context), false);
  vm.runInContext('notificationsEnabled = true', context);
  assert.equal(vm.runInContext("sendNotification('Test', 'Body', 'wind')", context), true);
  assert.equal(notifications.length, 1);
  assert.equal(notifications[0].options.tag, 'weather-wind');
});
