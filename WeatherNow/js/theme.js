// ============================================
// WeatherNow — Динамическая тема и погодные эффекты
// ============================================

let currentWeatherCode = 800;
let currentTimezone = 0;

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
  applyWeatherEffects(currentWeatherCode, timeOfDay);
  
  if (typeof updateChartTheme === 'function') {
    updateChartTheme();
  }
  
  console.log('Тема обновлена:', timeOfDay, 'часы:', hours);
}

function updateWeatherTheme(weatherCode, timezoneOffset) {
  currentWeatherCode = weatherCode;
  if (timezoneOffset !== undefined) currentTimezone = timezoneOffset;
  applyTimeTheme(currentTimezone);
}

function updateSkyElements(timeOfDay) {
  const sun = document.getElementById('sun');
  const moon = document.getElementById('moon');
  
  if (!sun || !moon) return;
  
  switch(timeOfDay) {
    case 'morning':
      sun.style.cssText = 'opacity: 0.9; top: 25%; right: 15%; transform: scale(1);';
      moon.style.cssText = 'opacity: 0.2; top: 20%; right: 25%; transform: scale(0.8);';
      break;
    case 'day':
      sun.style.cssText = 'opacity: 1; top: 5%; right: 15%; transform: scale(1.1);';
      moon.style.cssText = 'opacity: 0; top: 20%; right: 25%;';
      break;
    case 'evening':
      sun.style.cssText = 'opacity: 0.7; top: 60%; right: 15%; transform: scale(1);';
      moon.style.cssText = 'opacity: 0.6; top: 12%; right: 18%; transform: scale(0.95);';
      break;
    case 'night':
      sun.style.cssText = 'opacity: 0; top: 100%; right: 15%;';
      moon.style.cssText = 'opacity: 1; top: 8%; right: 16%; transform: scale(1);';
      break;
  }
  
  updateStarsVisibility(timeOfDay === 'night');
}

function applyWeatherEffects(weatherCode, timeOfDay) {
  const sky = document.getElementById('sky');
  if (!sky) return;
  
  clearWeatherEffects();
  
  const clouds = sky.querySelectorAll('.cloud');
  
  if (weatherCode >= 200 && weatherCode < 300) {
    clouds.forEach((c, i) => {
      c.style.background = '#455A64';
      c.style.opacity = '0.9';
      c.style.animationDuration = (20 + i * 5) + 's';
    });
    createRain(50, true);
    createLightning();
    createWindLines(15);
  } else if (weatherCode >= 300 && weatherCode < 400) {
    clouds.forEach((c, i) => {
      c.style.opacity = '0.7';
      c.style.background = '#90A4AE';
    });
    createRain(20, false);
  } else if (weatherCode >= 500 && weatherCode < 600) {
    clouds.forEach((c, i) => {
      c.style.background = '#78909C';
      c.style.opacity = '0.85';
      c.style.animationDuration = (22 + i * 5) + 's';
    });
    createRain(40, true);
    createWindLines(10);
  } else if (weatherCode >= 600 && weatherCode < 700) {
    clouds.forEach((c, i) => {
      c.style.background = '#B0BEC5';
      c.style.opacity = '0.8';
    });
    createSnow(40);
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