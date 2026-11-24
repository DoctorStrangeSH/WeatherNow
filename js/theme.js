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

  let timeOfDay;
  if (hours >= 5 && hours < 8) {
    timeOfDay = 'morning';
  } else if (hours >= 8 && hours < 17) {
    timeOfDay = 'day';
  } else if (hours >= 17 && hours < 21) {
    timeOfDay = 'evening';
  } else {
    timeOfDay = 'night';
  }

  // Capture the previous sky before changing either the weather or local-time palette.
  const sky = document.getElementById('sky');
  if (sky) startSkyBackgroundTransition(sky, getWeatherSceneKey(currentWeatherCode), timeOfDay);

  document.body.classList.remove('theme-morning', 'theme-day', 'theme-evening', 'theme-night');
  document.body.classList.add('theme-' + timeOfDay);

  updateSkyElements(timeOfDay);
  applyWeatherEffects(currentWeatherCode, timeOfDay, currentWindSpeed);
  
  if (typeof updateChartTheme === 'function') {
    updateChartTheme();
  }
  
}

function startSkyBackgroundTransition(sky, nextScene, nextTimeOfDay) {
  if (!sky || !sky.dataset || !sky.dataset.weather) return;

  const sceneChanged = sky.dataset.weather !== nextScene;
  const timeChanged = sky.dataset.timeOfDay !== nextTimeOfDay;
  if (!sceneChanged && !timeChanged) return;

  const activeTransition = typeof sky.querySelector === 'function'
    ? sky.querySelector('.sky-scene-transition')
    : null;
  if (activeTransition) {
    if (prefersReducedMotion() && typeof activeTransition.remove === 'function') {
      activeTransition.remove();
    }
    return;
  }

  if (prefersReducedMotion()
    || typeof window === 'undefined'
    || typeof window.getComputedStyle !== 'function'
    || typeof document.createElement !== 'function') {
    return;
  }

  const previousBackground = window.getComputedStyle(sky);
  if (!previousBackground || !previousBackground.backgroundImage || previousBackground.backgroundImage === 'none') return;

  const layer = document.createElement('div');
  layer.className = 'sky-scene-transition';
  layer.setAttribute('aria-hidden', 'true');
  layer.style.backgroundImage = previousBackground.backgroundImage;
  layer.style.backgroundColor = previousBackground.backgroundColor;
  layer.style.backgroundSize = previousBackground.backgroundSize;
  layer.style.backgroundPosition = previousBackground.backgroundPosition;
  layer.style.backgroundRepeat = previousBackground.backgroundRepeat;
  layer.addEventListener('animationend', () => {
    if (typeof layer.remove === 'function') {
      layer.remove();
    } else if (layer.parentNode && typeof layer.parentNode.removeChild === 'function') {
      layer.parentNode.removeChild(layer);
    }
  }, { once: true });

  // Keep the previous sky below stars, the sun/moon and the weather-effect layers.
  sky.insertBefore(layer, sky.firstChild || null);
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

function getPrecipitationParticleProfile(kind, depth, heavy = false) {
  const band = Math.max(0, Math.min(3, Math.floor(Number(depth) || 0)));
  const profiles = {
    rain: [
      { lengthMin: 6, lengthRange: 3, widthMin: 0.8, widthRange: 0.2, durationMin: 1.1, durationRange: 0.3, opacityMin: 0.12, opacityRange: 0.08, blur: 0.75, glow: 0.16 },
      { lengthMin: 10, lengthRange: 3, widthMin: 1, widthRange: 0.25, durationMin: 0.88, durationRange: 0.2, opacityMin: 0.22, opacityRange: 0.1, blur: 0.45, glow: 0.22 },
      { lengthMin: 14, lengthRange: 4, widthMin: 1.3, widthRange: 0.3, durationMin: 0.66, durationRange: 0.18, opacityMin: 0.36, opacityRange: 0.12, blur: 0.2, glow: 0.3 },
      { lengthMin: 21, lengthRange: 7, widthMin: 1.7, widthRange: 0.7, durationMin: 0.44, durationRange: 0.18, opacityMin: 0.56, opacityRange: 0.18, blur: 0.05, glow: 0.42 }
    ],
    snow: [
      { sizeMin: 1.4, sizeRange: 0.8, durationMin: 7.5, durationRange: 1.5, opacityMin: 0.2, opacityRange: 0.1, blur: 1.2, driftScale: 0.25, glow: 0 },
      { sizeMin: 2.4, sizeRange: 0.8, durationMin: 6, durationRange: 1.3, opacityMin: 0.34, opacityRange: 0.12, blur: 0.7, driftScale: 0.42, glow: 0.18 },
      { sizeMin: 3.5, sizeRange: 0.9, durationMin: 4.8, durationRange: 1, opacityMin: 0.5, opacityRange: 0.14, blur: 0.25, driftScale: 0.68, glow: 0.38 },
      { sizeMin: 5, sizeRange: 1.5, durationMin: 3.4, durationRange: 1.1, opacityMin: 0.7, opacityRange: 0.16, blur: 0.05, driftScale: 1, glow: 0.68 }
    ]
  };
  const profile = profiles[kind]?.[band];
  if (!profile) return null;

  const result = { ...profile };
  if (kind === 'rain' && heavy) {
    result.lengthMin *= 1.1;
    result.lengthRange *= 1.1;
    result.durationMin *= 0.85;
    result.durationRange *= 0.85;
    result.opacityMin = Math.min(0.82, result.opacityMin + 0.08);
  }
  return result;
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
    const profile = getPrecipitationParticleProfile('rain', depth, heavy);
    drop.dataset.depth = String(depth);
    drop.style.left = Math.random() * 100 + '%';
    drop.style.setProperty('--rain-angle', wind.rainAngle + 'deg');
    drop.style.setProperty('--rain-blur', profile.blur + 'px');
    drop.style.setProperty('--rain-glow', `rgba(190, 215, 255, ${profile.glow})`);
    drop.style.animationDuration = (Math.random() * profile.durationRange + profile.durationMin) + 's';
    drop.style.animationDelay = Math.random() * 1 + 's';
    drop.style.height = (Math.random() * profile.lengthRange + profile.lengthMin) + 'px';
    drop.style.width = (Math.random() * profile.widthRange + profile.widthMin) + 'px';
    drop.style.opacity = String(Math.min(0.92, Math.random() * profile.opacityRange + profile.opacityMin));
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
    const depth = i % 4;
    const profile = getPrecipitationParticleProfile('snow', depth);
    flake.dataset.depth = String(depth);
    const size = Math.random() * profile.sizeRange + profile.sizeMin;
    flake.style.width = size + 'px';
    flake.style.height = size + 'px';
    flake.style.left = Math.random() * 100 + '%';
    const drift = Math.round(wind.snowDrift * profile.driftScale);
    flake.style.setProperty('--snow-drift', drift + 'px');
    flake.style.setProperty('--snow-drift-q1', Math.round(drift * .25) + 'px');
    flake.style.setProperty('--snow-drift-half', Math.round(drift * .5) + 'px');
    flake.style.setProperty('--snow-drift-q3', Math.round(drift * .75) + 'px');
    flake.style.setProperty('--snow-blur', profile.blur + 'px');
    flake.style.setProperty('--snow-foreground-glow', `rgba(255, 255, 255, ${profile.glow})`);
    flake.style.animationDuration = (Math.random() * profile.durationRange + profile.durationMin) + 's';
    flake.style.animationDelay = Math.random() * 5 + 's';
    flake.style.opacity = String(Math.min(0.9, Math.random() * profile.opacityRange + profile.opacityMin));
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
