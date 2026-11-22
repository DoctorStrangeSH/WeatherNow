let currentWeatherCode = 800;
let currentTimezone = 0;
let currentWindSpeed = 0;

function initTheme() {
  createSkyElements();
  applyTimeTheme();
  setInterval(applyTimeTheme, 600000);
}

function applyTimeTheme(timezoneOffset = currentTimezone) {
  currentTimezone = timezoneOffset;
  
  const now = new Date();
  const utc = now.getTime() + (now.getTimezoneOffset() * 60000);
  const cityTime = new Date(utc + (timezoneOffset * 1000));
  const hours = cityTime.getHours();
  
  document.body.classList.remove('theme-morning', 'theme-day', 'theme-evening', 'theme-night');
  
  let timeOfDay;
  if (hours >= 5 && hours < 8) {
    timeOfDay = 'morning';
    document.body.classList.add('theme-morning');
  } else if (hours >= 8 && hours < 17) {
    timeOfDay = 'day';
    document.body.classList.add('theme-day');
  } else if (hours >= 17 && hours < 21) {
    timeOfDay = 'evening';
    document.body.classList.add('theme-evening');
  } else {
    timeOfDay = 'night';
    document.body.classList.add('theme-night');
  }
  
  updateSkyElements(timeOfDay);
  applyWeatherEffects(currentWeatherCode, timeOfDay, currentWindSpeed);
  
  if (typeof updateChartTheme === 'function') {
    updateChartTheme();
  }
  
}

function getWeatherSceneKey(weatherCode) {
  if (weatherCode >= 200 && weatherCode < 300) return 'thunder';
  if (weatherCode >= 300 && weatherCode < 600) return 'rain';
  if (weatherCode >= 600 && weatherCode < 700) return 'snow';
  if (weatherCode >= 700 && weatherCode < 800) return 'fog';
  if (weatherCode === 800) return 'clear';
  if (weatherCode <= 802) return 'partly-cloudy';
  return 'cloudy';
}

function updateWeatherTheme(weatherCode, timezoneOffset, windSpeed) {
  currentWeatherCode = weatherCode;
  if (timezoneOffset !== undefined) currentTimezone = timezoneOffset;
  if (Number.isFinite(Number(windSpeed))) currentWindSpeed = Number(windSpeed);

  const hero = document.querySelector('.weather-hero');
  if (hero) hero.dataset.weather = getWeatherSceneKey(weatherCode);

  applyTimeTheme(currentTimezone);
}

function shouldShowSun(weatherCode, timeOfDay) {
  return (weatherCode === 800 || weatherCode === 801) && timeOfDay !== 'night';
}

function getSkyArcPosition(hour, startHour, endHour) {
  const progress = Math.max(0, Math.min(1, (hour - startHour) / (endHour - startHour)));
  const x = 8 + progress * 84;
  const y = 14 + Math.sin(progress * Math.PI) * 42;
  return { x: Number(x.toFixed(2)), y: Number(y.toFixed(2)) };
}

function updateSkyElements(timeOfDay) {
  const sun = document.getElementById('sun');
  const moon = document.getElementById('moon');
  
  if (!sun || !moon) return;
  
  const localNow = new Date(Date.now() + (new Date().getTimezoneOffset() * 60000) + (currentTimezone * 1000));
  const hour = localNow.getHours() + localNow.getMinutes() / 60;
  const sunVisible = shouldShowSun(currentWeatherCode, timeOfDay);
  const sunPosition = getSkyArcPosition(hour, 5, 20);
  const moonHour = hour < 5 ? hour + 24 : hour;
  const moonPosition = getSkyArcPosition(moonHour, 20, 29);

  sun.style.left = `${sunPosition.x}%`;
  sun.style.right = 'auto';
  sun.style.top = `${sunPosition.y}%`;
  sun.style.opacity = sunVisible ? (timeOfDay === 'evening' ? '0.68' : '0.92') : '0';
  sun.style.transform = 'translate(-50%, -50%)';
  moon.style.left = `${moonPosition.x}%`;
  moon.style.right = 'auto';
  moon.style.top = `${moonPosition.y}%`;
  moon.style.opacity = timeOfDay === 'night' ? '0.88' : '0';
  moon.style.transform = 'translate(-50%, -50%)';
  
  updateStarsVisibility(timeOfDay === 'night');
}

function getWeatherMotionProfile(weatherCode, windSpeed = 0) {
  const code = Number(weatherCode);
  const wind = Math.max(0, Number(windSpeed) || 0);
  const rain = code >= 500 && code < 600;
  const drizzle = code >= 300 && code < 400;
  const snow = code >= 600 && code < 700;
  const thunder = code >= 200 && code < 300;
  const rainCount = rain ? (code === 502 || code === 503 || code === 504 || code === 522 ? 68 : code === 500 || code === 501 || code === 520 || code === 521 ? 42 : 30) : drizzle ? 18 : thunder ? 72 : 0;
  const snowCount = snow ? (code === 602 || code === 622 ? 72 : code === 601 || code === 621 ? 48 : 28) : 0;
  return {
    rainCount,
    snowCount,
    windCount: wind >= 12 ? 22 : wind >= 8 ? 16 : wind >= 4 ? 10 : 4,
    heavyRain: rainCount >= 42 || thunder
  };
}

function applyWeatherEffects(weatherCode, timeOfDay, windSpeed = currentWindSpeed) {
  const sky = document.getElementById('sky');
  if (!sky) return;

  sky.dataset.weather = getWeatherSceneKey(weatherCode);
  clearWeatherEffects();

  const clouds = sky.querySelectorAll('.cloud');
  if (prefersReducedMotion()) {
    sky.dataset.motion = 'reduced';
    clouds.forEach(cloud => {
      cloud.style.animation = 'none';
      cloud.style.opacity = weatherCode >= 801 ? '0.45' : '0';
    });
    return;
  }
  
  sky.dataset.motion = 'full';
  const effectScale = getWeatherEffectScale();
  const motionProfile = getWeatherMotionProfile(weatherCode, windSpeed);

  if (weatherCode >= 200 && weatherCode < 300) {
    clouds.forEach((c, i) => {
      c.style.background = '#455A64';
      c.style.opacity = '0.9';
      c.style.animationDuration = (20 + i * 5) + 's';
    });
    createRain(Math.round(motionProfile.rainCount * effectScale), true);
    createLightning();
    createWindLines(Math.round(motionProfile.windCount * effectScale));
  } else if (weatherCode >= 300 && weatherCode < 400) {
    clouds.forEach((c, i) => {
      c.style.opacity = '0.7';
      c.style.background = '#90A4AE';
    });
    createRain(Math.round(motionProfile.rainCount * effectScale), false);
  } else if (weatherCode >= 500 && weatherCode < 600) {
    clouds.forEach((c, i) => {
      c.style.background = '#78909C';
      c.style.opacity = '0.85';
      c.style.animationDuration = (22 + i * 5) + 's';
    });
    createRain(Math.round(motionProfile.rainCount * effectScale), motionProfile.heavyRain);
    createWindLines(Math.round(motionProfile.windCount * effectScale));
  } else if (weatherCode >= 600 && weatherCode < 700) {
    clouds.forEach((c, i) => {
      c.style.background = '#B0BEC5';
      c.style.opacity = '0.8';
    });
    createSnow(Math.round(motionProfile.snowCount * effectScale));
  } else if (weatherCode >= 700 && weatherCode < 800) {
    clouds.forEach(c => c.style.opacity = '0.3');
    createFog();
  } else if (weatherCode === 800) {
    clouds.forEach(c => c.style.opacity = '0');
  } else if (weatherCode === 801) {
    clouds.forEach((c, i) => {
      c.style.background = 'white';
      c.style.opacity = i < 2 ? '0.5' : '0';
    });
  } else if (weatherCode === 802) {
    clouds.forEach((c, i) => {
      c.style.background = 'white';
      c.style.opacity = i < 3 ? '0.6' : '0.2';
    });
  } else {
    clouds.forEach(c => {
      c.style.background = '#B0BEC5';
      c.style.opacity = '0.8';
      c.style.animationDuration = '25s';
    });
  }
}

function createRain(intensity, heavy = false) {
  const container = document.createElement('div');
  container.className = 'rain-container';
  container.id = 'rain-container';
  
  const sky = document.getElementById('sky');
  if (!sky) return;
  
  for (let i = 0; i < intensity; i++) {
    const drop = document.createElement('div');
    drop.className = 'raindrop';
    drop.style.left = Math.random() * 100 + '%';
    drop.style.animationDuration = (Math.random() * 0.3 + (heavy ? 0.3 : 0.5)) + 's';
    drop.style.animationDelay = Math.random() * 1 + 's';
    drop.style.height = (Math.random() * 10 + (heavy ? 15 : 8)) + 'px';
    drop.style.width = (heavy ? '2px' : '1.5px');
    drop.style.opacity = Math.random() * 0.4 + (heavy ? 0.4 : 0.2);
    container.appendChild(drop);
  }
  
  sky.appendChild(container);
}

function createSnow(intensity) {
  const container = document.createElement('div');
  container.className = 'snow-container';
  container.id = 'snow-container';
  
  const sky = document.getElementById('sky');
  if (!sky) return;
  
  for (let i = 0; i < intensity; i++) {
    const flake = document.createElement('div');
    flake.className = 'snowflake';
    const size = Math.random() * 4 + 2;
    flake.style.width = size + 'px';
    flake.style.height = size + 'px';
    flake.style.left = Math.random() * 100 + '%';
    flake.style.animationDuration = (Math.random() * 3 + 3) + 's';
    flake.style.animationDelay = Math.random() * 5 + 's';
    flake.style.opacity = Math.random() * 0.4 + 0.4;
    flake.style.boxShadow = '0 0 3px rgba(255,255,255,0.5)';
    container.appendChild(flake);
  }
  
  sky.appendChild(container);
}

function createWindLines(intensity) {
  const container = document.createElement('div');
  container.className = 'wind-lines';
  container.id = 'wind-lines';
  
  const sky = document.getElementById('sky');
  if (!sky) return;
  
  for (let i = 0; i < intensity; i++) {
    const line = document.createElement('div');
    line.className = 'wind-line';
    line.style.top = Math.random() * 70 + '%';
    line.style.width = (Math.random() * 100 + 50) + 'px';
    line.style.animationDuration = (Math.random() * 2 + 2) + 's';
    line.style.animationDelay = Math.random() * 3 + 's';
    line.style.height = (Math.random() * 1.5 + 0.5) + 'px';
    container.appendChild(line);
  }
  
  sky.appendChild(container);
}

function createLightning() {
  const sky = document.getElementById('sky');
  if (!sky) return;
  
  const lightning = document.createElement('div');
  lightning.id = 'lightning';
  sky.appendChild(lightning);
}

function createFog() {
  const sky = document.getElementById('sky');
  if (!sky) return;
  
  const fog = document.createElement('div');
  fog.id = 'fog';
  sky.appendChild(fog);
}

function getWeatherEffectScale() {
  if (typeof navigator === 'undefined') return 1;
  const memory = Number(navigator.deviceMemory) || 4;
  const cores = Number(navigator.hardwareConcurrency) || 4;
  const saveData = Boolean(navigator.connection?.saveData);
  if (saveData || memory <= 2 || cores <= 2) return 0.35;
  if (memory <= 4 || cores <= 4) return 0.65;
  return 1;
}

function prefersReducedMotion() {
  return typeof window !== 'undefined'
    && typeof window.matchMedia === 'function'
    && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

function clearWeatherEffects() {
  ['rain-container', 'snow-container', 'wind-lines', 'lightning', 'fog'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.remove();
  });
}

function createSkyElements() {
  const sky = document.getElementById('sky');
  if (!sky) return;
  
  const oldMoon = document.getElementById('moon');
  if (oldMoon) oldMoon.remove();
  
  let sun = document.getElementById('sun');
  if (!sun) {
    sun = document.createElement('div');
    sun.className = 'sun';
    sun.id = 'sun';
    sky.appendChild(sun);
  }
  
  const moon = document.createElement('div');
  moon.className = 'moon';
  moon.id = 'moon';
  sky.appendChild(moon);
  
  let starsContainer = document.getElementById('stars');
  if (!starsContainer) {
    starsContainer = document.createElement('div');
    starsContainer.className = 'stars-container';
    starsContainer.id = 'stars';
    sky.appendChild(starsContainer);
  }
  
  createStars();
}

function createStars() {
  const container = document.getElementById('stars');
  if (!container) return;
  
  container.innerHTML = '';
  for (let i = 0; i < 100; i++) {
    const star = document.createElement('div');
    star.className = 'star';
    const size = Math.random() * 2.5 + 1;
    star.style.width = size + 'px';
    star.style.height = size + 'px';
    star.style.left = Math.random() * 100 + '%';
    star.style.top = Math.random() * 60 + '%';
    star.style.animationDelay = Math.random() * 4 + 's';
    star.style.animationDuration = (Math.random() * 2 + 1.5) + 's';
    container.appendChild(star);
  }
}

function updateStarsVisibility(visible) {
  const stars = document.getElementById('stars');
  if (stars) {
    stars.style.opacity = visible ? '0.9' : '0';
  }
}

document.addEventListener('DOMContentLoaded', initTheme);
