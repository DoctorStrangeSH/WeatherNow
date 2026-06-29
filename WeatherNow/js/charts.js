// ============================================
// WeatherNow — Графики (Chart.js)
// ============================================

let tempChartInstance = null;
let hourlyChartInstance = null;

function renderTempChart(days) {
  const canvas = document.getElementById('tempChart');
  if (!canvas || days.length === 0) return;
  const ctx = canvas.getContext('2d');
  if (tempChartInstance) tempChartInstance.destroy();

  const dayNames = ['Вс', 'Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб'];
  const labels = days.map((day, i) => {
    if (i === 0) return 'Сегодня';
    if (i === 1) return 'Завтра';
    const date = new Date(day.date);
    return dayNames[date.getDay()];
  });

  const maxTemps = days.map(d => d.maxTemp);
  const minTemps = days.map(d => d.minTemp);

  const isDark = document.body.classList.contains('theme-night');

  tempChartInstance = new Chart(ctx, {
    type: 'line',
    data: {
      labels,
      datasets: [
        {
          label: 'Макс. температура',
          data: maxTemps,
          borderColor: '#FF8C42',
          backgroundColor: createGradient(ctx, 'rgba(255, 140, 66, 0.4)', 'rgba(255, 140, 66, 0.0)'),
          fill: true,
          borderWidth: 3,
          pointBackgroundColor: '#FF8C42',
          pointBorderColor: '#ffffff',
          pointBorderWidth: 2,
          pointRadius: 6,
          tension: 0.4,
        },
        {
          label: 'Мин. температура',
          data: minTemps,
          borderColor: '#42A5F5',
          backgroundColor: createGradient(ctx, 'rgba(66, 165, 245, 0.4)', 'rgba(66, 165, 245, 0.0)'),
          fill: true,
          borderWidth: 3,
          pointBackgroundColor: '#42A5F5',
          pointBorderColor: '#ffffff',
          pointBorderWidth: 2,
          pointRadius: 6,
          tension: 0.4,
        }
      ]
    },
    options: getChartOptions(isDark)
  });
}

function renderHourlyChart(hourlyData) {
  const canvas = document.getElementById('hourlyChart');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  if (hourlyChartInstance) hourlyChartInstance.destroy();

  const isDark = document.body.classList.contains('theme-night');

  hourlyChartInstance = new Chart(ctx, {
    type: 'line',
    data: {
      labels: hourlyData.map(h => h.time),
      datasets: [
        {
          label: 'Температура °C',
          data: hourlyData.map(h => h.temp),
          borderColor: '#FF8C42',
          backgroundColor: createGradient(ctx, 'rgba(255, 140, 66, 0.3)', 'rgba(255, 140, 66, 0.0)'),
          fill: true,
          borderWidth: 2,
          pointRadius: 3,
          tension: 0.4,
          yAxisID: 'y'
        },
        {
          label: 'Осадки %',
          data: hourlyData.map(h => h.pop),
          borderColor: '#42A5F5',
          backgroundColor: 'rgba(66, 165, 245, 0.1)',
          fill: true,
          borderWidth: 2,
          borderDash: [5, 5],
          pointRadius: 2,
          tension: 0.4,
          yAxisID: 'y1'
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
            color: isDark ? '#fff' : '#1a1a2e'
          }
        }
      },
      scales: {
        x: { grid: { display: false }, ticks: { color: isDark ? '#aaa' : '#666' } },
        y: {
          position: 'left',
          grid: { color: isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.06)' },
          ticks: { callback: v => v + '°', color: isDark ? '#aaa' : '#666' }
        },
        y1: {
          position: 'right',
          max: 100,
          grid: { display: false },
          ticks: { callback: v => v + '%', color: isDark ? '#aaa' : '#666' }
        }
      }
    }
  });
}

function createGradient(ctx, color1, color2) {
  const gradient = ctx.createLinearGradient(0, 0, 0, 300);
  gradient.addColorStop(0, color1);
  gradient.addColorStop(1, color2);
  return gradient;
}

function getChartOptions(isDark) {
  return {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: {
        labels: { usePointStyle: true, padding: 20, color: isDark ? '#fff' : '#1a1a2e' }
      },
      tooltip: {
        backgroundColor: 'rgba(26, 26, 46, 0.9)',
        padding: 12,
        cornerRadius: 8,
        callbacks: {
          label: (ctx) => ctx.dataset.label + ': ' + ctx.parsed.y + '°C'
        }
      }
    },
    scales: {
      x: {
        grid: { display: false },
        ticks: { color: isDark ? '#aaa' : '#666' }
      },
      y: {
        grid: { color: isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.06)' },
        ticks: { callback: v => v + '°C', color: isDark ? '#aaa' : '#666' }
      }
    },
    interaction: { intersect: false, mode: 'index' }
  };
}

function updateChartTheme() {
  const isDark = document.body.classList.contains('theme-night');

  [tempChartInstance, hourlyChartInstance].forEach(chart => {
    if (chart) {
      // Обновляем цвета сетки
      chart.options.scales.y.grid.color = isDark ? 'rgba(255,255,255,0.15)' : 'rgba(0,0,0,0.08)';

      // Обновляем цвет текста на осях
      if (chart.options.scales.x) {
        chart.options.scales.x.ticks.color = isDark ? '#ccc' : '#666';
      }
      if (chart.options.scales.y) {
        chart.options.scales.y.ticks.color = isDark ? '#ccc' : '#666';
      }

      // Обновляем цвет легенды
      if (chart.options.plugins && chart.options.plugins.legend) {
        chart.options.plugins.legend.labels.color = isDark ? '#fff' : '#1a1a2e';
      }

      chart.update();
    }
  });
}