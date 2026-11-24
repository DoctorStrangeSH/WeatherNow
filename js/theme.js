let currentWeatherCode = 800;
let currentTimezone = 0;
let currentWindSpeed = 0;
let themeRefreshInterval = null;

function initTheme() {
  createSkyElements();
  syncWeatherAnimationVisibility();
  applyTimeTheme();
  if (themeRefreshInterval !== null) clearInterval(themeRefreshInterval);
  themeRefreshInterval = setInterval(applyTimeTheme, 600000);
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
  const parsedCode = Number(weatherCode);
  currentWeatherCode = Number.isFinite(parsedCode) ? parsedCode : 800;

  // API-поля могут отсутствовать в отдельных ответах: не переносим значения прошлого города.
  const parsedTimezone = Number(timezoneOffset);
  currentTimezone = timezoneOffset !== undefined && Number.isFinite(parsedTimezone) ? parsedTimezone : 0;
  const parsedWind = Number(windSpeed);
  currentWindSpeed = windSpeed !== undefined && Number.isFinite(parsedWind) ? Math.max(0, parsedWind) : 0;

  const hero = document.querySelector('.weather-hero');
  if (hero) hero.dataset.weather = getWeatherSceneKey(currentWeatherCode);

  applyTimeTheme(currentTimezone);
}

function shouldShowSun(weatherCode, timeOfDay) {
  return (weatherCode === 800 || weatherCode === 801) && timeOfDay !== 'night';
}

function getSkyArcPosition(hour, startHour, endHour) {
  const progress = Math.max(0, Math.min(1, (hour - startHour) / (endHour - startHour)));
  const x = 8 + progress * 84;
  const y = 6 + Math.sin(progress * Math.PI) * 18;
  return { x: Number(x.toFixed(2)), y: Number(y.toFixed(2)) };
}

function getMoonPhase(date = new Date()) {
  const synodicMonth = 29.530588853;
  const knownNewMoon = Date.UTC(2000, 0, 6, 18, 14);
  const timestamp = date instanceof Date ? date.getTime() : new Date(date).getTime();
  const daysSinceKnownNewMoon = (timestamp - knownNewMoon) / 86400000;
  const phase = ((daysSinceKnownNewMoon / synodicMonth) % 1 + 1) % 1;
  const illumination = (1 - Math.cos(phase * Math.PI * 2)) / 2;
  let name;

  if (phase < 0.035 || phase >= 0.965) name = 'новолуние';
  else if (phase < 0.22) name = 'растущий серп';
  else if (phase < 0.28) name = 'первая четверть';
  else if (phase < 0.47) name = 'растущая луна';
  else if (phase < 0.53) name = 'полнолуние';
  else if (phase < 0.72) name = 'убывающая луна';
  else if (phase < 0.78) name = 'последняя четверть';
  else name = 'убывающий серп';

  return { phase, illumination, waxing: phase < 0.5, name };
}
function updateSkyElements(timeOfDay) {
  const sky = document.getElementById('sky');
  if (sky) sky.dataset.timeOfDay = timeOfDay;
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
  sun.style.opacity = sunVisible ? (timeOfDay === 'evening' ? '0.5' : '0.72') : '0';
  sun.style.transform = 'translate(-50%, -50%)';
  moon.style.left = `${moonPosition.x}%`;
  moon.style.right = 'auto';
  moon.style.top = `${moonPosition.y}%`;
  moon.style.opacity = timeOfDay === 'night' ? '0.94' : '0';
  moon.style.transform = 'translate(-50%, -50%)';
  const lunarPhase = getMoonPhase();
  moon.dataset.phase = lunarPhase.name;
  moon.setAttribute('aria-label', 'Луна: ' + lunarPhase.name);
  const shadowShift = (lunarPhase.illumination * (lunarPhase.waxing ? -100 : 100)).toFixed(1);
  moon.style.setProperty('--moon-shadow-shift', shadowShift + '%');
  moon.style.setProperty('--moon-shadow-opacity', lunarPhase.illumination > 0.985 ? '0' : '0.92');
  
  updateStarsVisibility(getNightTransitionFactor(hour), currentWeatherCode);
  if (typeof updateChartTheme === 'function') updateChartTheme();
  if (typeof updateFeelsLikeChartTheme === 'function') updateFeelsLikeChartTheme();
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

function getPrecipitationWindProfile(windSpeed = 0) {
  const speed = Math.max(0, Math.min(30, Number(windSpeed) || 0));
  return {
    rainAngle: Math.round(Math.min(30, speed * 1.7)),
    snowDrift: Math.round(Math.min(48, speed * 2.4))
  };
}

function applyWeatherEffects(weatherCode, timeOfDay, windSpeed = currentWindSpeed) {
  const sky = document.getElementById('sky');
  if (!sky) return;

  sky.dataset.weather = getWeatherSceneKey(weatherCode);
  updateCloudAtmosphere(weatherCode, windSpeed);
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
  const precipitationWind = getPrecipitationWindProfile(windSpeed);

  if (weatherCode >= 200 && weatherCode < 300) {
    clouds.forEach((c, i) => {
      c.style.background = '#455A64';
      c.style.opacity = '0.9';
      c.style.animationDuration = (20 + i * 5) + 's';
    });
    createRain(Math.round(motionProfile.rainCount * effectScale), true, precipitationWind);
    createLightning();
    createWindLines(Math.round(motionProfile.windCount * effectScale));
  } else if (weatherCode >= 300 && weatherCode < 400) {
    clouds.forEach((c, i) => {
      c.style.opacity = '0.7';
      c.style.background = '#90A4AE';
    });
    createRain(Math.round(motionProfile.rainCount * effectScale), false, precipitationWind);
  } else if (weatherCode >= 500 && weatherCode < 600) {
    clouds.forEach((c, i) => {
      c.style.background = '#78909C';
      c.style.opacity = '0.85';
      c.style.animationDuration = (22 + i * 5) + 's';
    });
    createRain(Math.round(motionProfile.rainCount * effectScale), motionProfile.heavyRain, precipitationWind);
    createWindLines(Math.round(motionProfile.windCount * effectScale));
  } else if (weatherCode >= 600 && weatherCode < 700) {
    clouds.forEach((c, i) => {
      c.style.background = '#B0BEC5';
      c.style.opacity = '0.8';
    });
    createSnow(Math.round(motionProfile.snowCount * effectScale), precipitationWind);
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

function createRain(intensity, heavy = false, wind = getPrecipitationWindProfile(currentWindSpeed)) {
  const sky = document.getElementById('sky');
  if (!sky) return;

  const count = Math.max(0, Math.min(100, Math.floor(Number(intensity) || 0)));
  const container = document.createElement('div');
  container.className = 'rain-container';
  container.id = 'rain-container';

  for (let i = 0; i < count; i++) {
    const drop = document.createElement('div');
    drop.className = 'raindrop';
    const depth = i % 4;
    const foreground = depth === 3;
    drop.dataset.depth = String(depth);
    drop.style.left = Math.random() * 100 + '%';
    drop.style.setProperty('--rain-angle', wind.rainAngle + 'deg');
    drop.style.animationDuration = (Math.random() * 0.22 + (foreground ? 0.28 : heavy ? 0.42 : 0.58)) + 's';
    drop.style.animationDelay = Math.random() * 1 + 's';
    drop.style.height = (Math.random() * (foreground ? 12 : 8) + (foreground ? heavy ? 22 : 17 : heavy ? 12 : 8)) + 'px';
    drop.style.width = (foreground ? heavy ? 2.4 : 1.9 : heavy ? 1.6 : 1.2) + 'px';
    drop.style.opacity = String(Math.random() * (foreground ? 0.22 : 0.16) + (foreground ? heavy ? 0.68 : 0.48 : heavy ? 0.34 : 0.2));
    container.appendChild(drop);
  }

  sky.appendChild(container);
}

function createSnow(intensity, wind = getPrecipitationWindProfile(currentWindSpeed)) {
  const sky = document.getElementById('sky');
  if (!sky) return;

  const count = Math.max(0, Math.min(100, Math.floor(Number(intensity) || 0)));
  const container = document.createElement('div');
  container.className = 'snow-container';
  container.id = 'snow-container';

  for (let i = 0; i < count; i++) {
    const flake = document.createElement('div');
    flake.className = 'snowflake';
    // Four depth bands add scale and drift variation without extra particle layers.
    const depth = i % 4;
    const foreground = depth === 3;
    flake.dataset.depth = String(depth);
    const size = foreground ? Math.random() * 2.5 + 4 : Math.random() * (depth === 0 ? 1.2 : 1.8) + (depth === 0 ? 1.2 : 1.7);
    flake.style.width = size + 'px';
    flake.style.height = size + 'px';
    flake.style.left = Math.random() * 100 + '%';
    const drift = foreground ? wind.snowDrift : Math.round(wind.snowDrift * 0.55);
    flake.style.setProperty('--snow-drift', drift + 'px');
    flake.style.setProperty('--snow-drift-q1', Math.round(drift * .25) + 'px');
    flake.style.setProperty('--snow-drift-half', Math.round(drift * .5) + 'px');
    flake.style.setProperty('--snow-drift-q3', Math.round(drift * .75) + 'px');
    flake.style.animationDuration = (Math.random() * 3 + (foreground ? 3 : 5)) + 's';
    flake.style.animationDelay = Math.random() * 5 + 's';
    flake.style.opacity = foreground ? '0.85' : '0.48';
    flake.style.boxShadow = foreground ? '0 0 5px rgba(255,255,255,0.55)' : 'none';
    container.appendChild(flake);
  }

  sky.appendChild(container);
}

function createWindLines(intensity) {
  const sky = document.getElementById('sky');
  if (!sky) return;

  const count = Math.max(0, Math.min(40, Math.floor(Number(intensity) || 0)));
  const container = document.createElement('div');
  container.className = 'wind-lines';
  container.id = 'wind-lines';

  for (let i = 0; i < count; i++) {
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
  const memory = typeof navigator === 'undefined' ? 4 : Number(navigator.deviceMemory) || 4;
  const cores = typeof navigator === 'undefined' ? 4 : Number(navigator.hardwareConcurrency) || 4;
  const saveData = typeof navigator !== 'undefined' && Boolean(navigator.connection?.saveData);
  let scale = saveData || memory <= 2 || cores <= 2 ? 0.35 : memory <= 4 || cores <= 4 ? 0.65 : 1;

  // На небольших экранах уменьшаем число частиц независимо от мощности устройства.
  const viewportWidth = typeof window !== 'undefined' ? Number(window.innerWidth) : 0;
  if (viewportWidth > 0 && viewportWidth <= 390) scale = Math.min(scale, 0.4);
  else if (viewportWidth > 0 && viewportWidth <= 767) scale = Math.min(scale, 0.55);

  return scale;
}

function getStarCount() {
  return Math.round(100 * getWeatherEffectScale());
}

function getActiveCloudLayerCount() {
  const scale = getWeatherEffectScale();
  if (scale <= 0.4) return 1;
  if (scale <= 0.65) return 2;
  return 3;
}

function prefersReducedMotion() {
  return typeof window !== 'undefined'
    && typeof window.matchMedia === 'function'
    && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

function clearWeatherEffects() {
  const sky = document.getElementById('sky');
  if (!sky) return;

  ['rain-container', 'snow-container', 'wind-lines', 'lightning', 'fog'].forEach(id => {
    sky.querySelectorAll(`#${id}`).forEach(element => element.remove());
  });
}

function createSkyElements() {
  const sky = document.getElementById('sky');
  if (!sky) return;
  
  let sun = document.getElementById('sun');
  if (!sun) {
    sun = document.createElement('div');
    sun.className = 'sun';
    sun.id = 'sun';
    sky.appendChild(sun);
  }
  
  let moon = document.getElementById('moon');
  if (!moon) {
    moon = document.createElement('div');
    moon.className = 'moon';
    moon.id = 'moon';
    sky.appendChild(moon);
  }
  
  let starsContainer = document.getElementById('stars');
  if (!starsContainer) {
    starsContainer = document.createElement('div');
    starsContainer.className = 'stars-container';
    starsContainer.id = 'stars';
    sky.appendChild(starsContainer);
  }
  
  createStars();
  createCloudLayers();
}



function createCloudLayers() {
  const sky = document.getElementById('sky');
  if (!sky || sky.querySelector('.weather-cloud-layers')) return;

  const layers = document.createElement('div');
  layers.className = 'weather-cloud-layers';
  layers.setAttribute('aria-hidden', 'true');

  ['back', 'middle', 'front'].forEach((depth, index) => {
    const layer = document.createElement('div');
    layer.className = `weather-cloud-layer weather-cloud-layer--${depth}`;
    layer.dataset.depth = String(index);
    layers.appendChild(layer);
  });

  sky.appendChild(layers);
}

function updateCloudAtmosphere(weatherCode, windSpeed = 0) {
  const sky = document.getElementById('sky');
  if (!sky) return;

  createCloudLayers();
  const layers = sky.querySelectorAll('.weather-cloud-layer');
  const code = Number(weatherCode);
  const wind = Math.max(0, Number(windSpeed) || 0);
  const cloudy = code >= 801 && code < 900;
  const storm = code >= 200 && code < 300;
  const rain = code >= 300 && code < 600;
  const snow = code >= 600 && code < 700;
  const fog = code >= 700 && code < 800;
  const coverage = code === 801 ? 0.28 : code === 802 ? 0.48 : code === 803 ? 0.7 : code === 804 ? 0.9 : storm ? 1 : rain ? 0.82 : snow ? 0.76 : fog ? 0.58 : 0;
  // Reduced motion keeps one static atmospheric layer rather than a flat empty sky.
  const activeLayerCount = prefersReducedMotion() ? 1 : getActiveCloudLayerCount();

  layers.forEach((layer, index) => {
    const depth = index + 1;
    const isActive = index < activeLayerCount;
    layer.style.display = isActive ? '' : 'none';
    layer.style.opacity = isActive ? String(coverage * (0.42 + depth * 0.19)) : '0';
    layer.style.setProperty('--cloud-speed', `${Math.max(22, 76 - wind * 2 + index * 15)}s`);
    layer.style.setProperty('--cloud-drift', `${wind >= 10 ? 34 : wind >= 5 ? 22 : 12}px`);
    layer.dataset.weather = storm ? 'storm' : rain ? 'rain' : snow ? 'snow' : fog ? 'fog' : cloudy ? 'cloudy' : 'clear';
  });
}

function createStars() {
  const container = document.getElementById('stars');
  if (!container) return;
  
  // Keep the star field atmospheric without running 100 twinkle animations
  // on compact screens, low-memory devices, or data-saving connections.
  const starCount = getStarCount();
  if (container.children.length === starCount) return;

  container.innerHTML = '';
  for (let i = 0; i < starCount; i++) {
    const star = document.createElement('div');
    star.className = 'star';
    const size = Math.random() * 2.5 + 1;
    star.style.width = size + 'px';
    star.style.height = size + 'px';
    star.style.left = Math.random() * 100 + '%';
    star.style.top = Math.random() * 60 + '%';
    const depth = i % 5;
    star.dataset.depth = String(depth);
    star.style.opacity = String([0.34, 0.48, 0.62, 0.78, 0.94][depth]);
    // Twinkle only a small foreground subset; the rest stay crisp and static.
    if (i % 5 === 0) {
      star.style.animationDelay = Math.random() * 4 + 's';
      star.style.animationDuration = (Math.random() * 2 + 3.5) + 's';
    } else {
      star.style.animation = 'none';
    }
    container.appendChild(star);
  }
}

function getNightSkyOpacity(weatherCode) {
  const code = Number(weatherCode);
  if (code >= 200 && code < 800) return code >= 700 && code < 800 ? 0.02 : 0.04;
  if (code === 800) return 0.9;
  if (code === 801) return 0.62;
  if (code === 802) return 0.36;
  if (code === 803) return 0.14;
  if (code === 804) return 0.04;
  return 0;
}

function getNightTransitionFactor(hour) {
  const normalizedHour = ((Number(hour) % 24) + 24) % 24;
  const smoothstep = (value) => {
    const t = Math.max(0, Math.min(1, value));
    return t * t * (3 - 2 * t);
  };

  if (normalizedHour >= 21 || normalizedHour < 5) return 1;
  if (normalizedHour >= 17) return smoothstep((normalizedHour - 17) / 4);
  if (normalizedHour >= 5 && normalizedHour < 8) return 1 - smoothstep((normalizedHour - 5) / 3);
  return 0;
}

function updateStarsVisibility(transitionFactor, weatherCode = currentWeatherCode) {
  const stars = document.getElementById('stars');
  if (!stars) return;

  const factor = Math.max(0, Math.min(1, Number(transitionFactor) || 0));
  const opacity = factor * getNightSkyOpacity(weatherCode);
  stars.style.opacity = String(opacity);
  stars.setAttribute('aria-hidden', opacity <= 0.005 ? 'true' : 'false');
}

function syncWeatherAnimationVisibility(isVisible = !document.hidden) {
  const sky = document.getElementById('sky');
  if (!sky) return;
  sky.dataset.pageVisible = isVisible ? 'true' : 'false';
}

document.addEventListener('visibilitychange', () => {
  syncWeatherAnimationVisibility();
});

document.addEventListener('DOMContentLoaded', initTheme);
