let feelsLikeChartInstance = null;
let feelsLikeData = null;

function renderFeelsLikeSection(forecastData) {
  const container = document.getElementById('feels-like-container');
  if (!container || !forecastData) return;
  
  const next24Hours = getNext24Hours(forecastData);
  feelsLikeData = next24Hours.map(hour => ({
    time: hour.time,
    temp: hour.temp,
    feels: hour.feels,
    wind: hour.wind,
    humidity: hour.humidity
  }));

  if (feelsLikeData.length === 0) {
    container.innerHTML = `
      <div class="forecast-empty-state mt-3">
        <i class="bi bi-thermometer-half" aria-hidden="true"></i>
        <p class="fw-semibold mb-1">Данные об ощущаемой температуре появятся позже</p>
        <small>Не удалось получить почасовые значения</small>
      </div>
    `;
    return;
  }
  
  container.innerHTML = `
    <div class="glass-card rounded-4 p-4 mt-4">
      <div class="d-flex justify-content-between align-items-center mb-3">
        <h5 class="fw-bold mb-0">
          <i class="bi bi-thermometer-sun me-2"></i>Температура и ощущения · 24 часа
        </h5>
        <div class="btn-group btn-group-sm">
          <button class="btn btn-glass active" onclick="switchFeelsLikeView('chart')">
            <i class="bi bi-graph-up"></i>
          </button>
          <button class="btn btn-glass" onclick="switchFeelsLikeView('cards')">
            <i class="bi bi-grid-3x3-gap"></i>
          </button>
        </div>
      </div>
      
      <div id="feels-like-chart-container" class="hourly-chart-wrap">
        <canvas id="feelsLikeChart" role="img" aria-label="Сравнение температуры воздуха и ощущаемой температуры на ближайшие 24 часа"></canvas>
      </div>
      
      
      <div id="feels-like-cards" class="hourly-scroll d-flex gap-2 overflow-auto pb-2 d-none mt-3">
        ${feelsLikeData.map(hour => `
          <div class="glass-card rounded-4 p-3 text-center flex-shrink-0" style="min-width: 90px;">
            <small class="text-muted d-block mb-1">${hour.time}</small>
            <div class="mb-1">
              <span class="fw-bold fs-5">${hour.temp}°</span>
            </div>
            <div class="small text-muted mb-1">
              Ощущ. <span class="fw-bold ${hour.feels < hour.temp ? 'text-primary' : 'text-danger'}">${hour.feels}°</span>
            </div>
            <div class="d-flex justify-content-center gap-2 small text-muted">
              <span title="Ветер">💨${hour.wind}</span>
              <span title="Влажность">💧${hour.humidity}%</span>
            </div>
          </div>
        `).join('')}
      </div>
      
      <div class="text-center mt-2 small text-muted">
        <i class="bi bi-info-circle me-1"></i>
        Разница из-за ветра (${feelsLikeData[0].wind} м/с) и влажности (${feelsLikeData[0].humidity}%)
      </div>
    </div>
  `;
  
  renderFeelsLikeChart(feelsLikeData);
}

function switchFeelsLikeView(view) {
  const chartContainer = document.getElementById('feels-like-chart-container');
  const cardsContainer = document.getElementById('feels-like-cards');
  const buttons = document.querySelectorAll('#feels-like-container .btn-glass');
  
  buttons.forEach(btn => btn.classList.remove('active'));
  
  if (view === 'chart') {
    chartContainer.classList.remove('d-none');
    cardsContainer.classList.add('d-none');
    buttons[0].classList.add('active');
    if (feelsLikeData) renderFeelsLikeChart(feelsLikeData);
  } else {
    chartContainer.classList.add('d-none');
    cardsContainer.classList.remove('d-none');
    buttons[1].classList.add('active');
  }
}

function renderFeelsLikeChart(data) {
  const canvas = document.getElementById('feelsLikeChart');
  if (!canvas || !data) return;
  
  const ctx = canvas.getContext('2d');
  if (feelsLikeChartInstance) feelsLikeChartInstance.destroy();
  
  const isDark = document.body.classList.contains('theme-night');
  
  feelsLikeChartInstance = new Chart(ctx, {
    type: 'line',
    data: {
      labels: data.map(d => d.time),
      datasets: [
        {
          label: 'Реальная температура',
          data: data.map(d => d.temp),
          borderColor: '#FF8C42',
          backgroundColor: createGradient(ctx, 'rgba(255, 140, 66, 0.3)', 'rgba(255, 140, 66, 0.0)'),
          fill: true,
          borderWidth: 3,
          pointRadius: 5,
          tension: 0.4,
        },
        {
          label: 'Ощущается как',
          data: data.map(d => d.feels),
          borderColor: '#42A5F5',
          backgroundColor: createGradient(ctx, 'rgba(66, 165, 245, 0.3)', 'rgba(66, 165, 245, 0.0)'),
          fill: true,
          borderWidth: 3,
          borderDash: [8, 4],
          pointRadius: 5,
          tension: 0.4,
        }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: {
          labels: {
            usePointStyle: true,
            color: isDark ? '#fff' : '#1a1a2e',
            padding: 20,
          }
        },
        tooltip: {
          callbacks: {
            label: (ctx) => {
              const diff = Math.abs(data[ctx.dataIndex].temp - data[ctx.dataIndex].feels);
              return `${ctx.dataset.label}: ${ctx.parsed.y}°C (разница ${diff}°)`;
            }
          }
        }
      },
      scales: {
        x: { grid: { display: false }, ticks: { color: isDark ? '#ccc' : '#666' } },
        y: {
          grid: { color: isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.06)' },
          ticks: { callback: v => v + '°', color: isDark ? '#ccc' : '#666' }
        }
      }
    }
  });
}

function createGradient(ctx, color1, color2) {
  const gradient = ctx.createLinearGradient(0, 0, 0, 250);
  gradient.addColorStop(0, color1);
  gradient.addColorStop(1, color2);
  return gradient;
}
