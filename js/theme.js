// ============================================
// WeatherNow — Переключатель темы
// ============================================

let isDarkMode = localStorage.getItem('weathernow-theme') === 'dark';

document.addEventListener('DOMContentLoaded', () => {
  initTheme();
});

function initTheme() {
  const themeToggle = document.getElementById('theme-toggle');
  if (!themeToggle) return;
  
  if (isDarkMode) {
    document.body.classList.add('dark-theme');
    updateThemeIcon(true);
  }
  
  themeToggle.addEventListener('click', () => {
    isDarkMode = !isDarkMode;
    
    if (isDarkMode) {
      document.body.classList.add('dark-theme');
      localStorage.setItem('weathernow-theme', 'dark');
    } else {
      document.body.classList.remove('dark-theme');
      localStorage.setItem('weathernow-theme', 'light');
    }
    
    updateThemeIcon(isDarkMode);
    updateSkyForTheme();
    updateChartForTheme();
  });
  
  createStars();
  updateStarsVisibility();
}

function updateThemeIcon(isDark) {
  const icon = document.querySelector('#theme-toggle i');
  if (!icon) return;
  
  if (isDark) {
    icon.className = 'bi bi-sun-fill';
  } else {
    icon.className = 'bi bi-moon-stars-fill';
  }
}

function createStars() {
  const starsContainer = document.getElementById('stars');
  if (!starsContainer) return;
  
  for (let i = 0; i < 50; i++) {
    const star = document.createElement('div');
    star.className = 'star';
    
    const size = Math.random() * 3 + 1;
    const left = Math.random() * 100;
    const top = Math.random() * 60;
    const delay = Math.random() * 4;
    
    star.style.cssText = `
      position: absolute;
      width: ${size}px;
      height: ${size}px;
      left: ${left}%;
      top: ${top}%;
      background: white;
      border-radius: 50%;
      animation: twinkle 2s ease-in-out ${delay}s infinite;
    `;
    
    starsContainer.appendChild(star);
  }
}

function updateStarsVisibility() {
  const stars = document.getElementById('stars');
  if (stars) {
    stars.style.opacity = isDarkMode ? '0.8' : '0';
  }
}

function updateSkyForTheme() {
  const sky = document.getElementById('sky');
  if (!sky) return;
  
  if (isDarkMode) {
    sky.style.background = 'linear-gradient(180deg, #0a0a2e 0%, #1a1a4e 50%, #2a2a5e 100%)';
  } else {
    sky.style.background = 'linear-gradient(180deg, var(--sky-top) 0%, var(--sky-bottom) 100%)';
  }
  
  updateStarsVisibility();
}

function updateChartForTheme() {
  [tempChartInstance, hourlyChartInstance].forEach(chart => {
    if (chart) {
      chart.options.scales.y.grid.color = isDarkMode ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.06)';
      chart.options.scales.x.ticks.color = isDarkMode ? '#aaa' : '#666';
      chart.options.scales.y.ticks.color = isDarkMode ? '#aaa' : '#666';
      chart.options.plugins.legend.labels.color = isDarkMode ? '#fff' : '#1a1a2e';
      chart.update();
    }
  });
}