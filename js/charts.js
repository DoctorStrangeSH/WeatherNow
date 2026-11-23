let tempChartInstance = null;
let hourlyChartInstance = null;

function getChartThemePalette() {
  const styles = window.getComputedStyle(document.body);
  return {
    legend: styles.getPropertyValue('--text-primary').trim() || '#f3f7fc',
    ticks: styles.getPropertyValue('--text-muted').trim() || '#a9bbcf',
    grid: styles.getPropertyValue('--card-border').trim() || 'rgba(255, 255, 255, 0.14)'
  };
}

function renderTempChart(days) {
  const canvas = document.getElementById('tempChart');
  if (!canvas || days.length === 0) return;
  const ctx = canvas.getContext('2d');
  if (tempChartInstance) tempChartInstance.destroy();

  const dayNames = ['Вс', 'Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб'];
  const labels = days.map((day, i) => {
    if (i === 0) return 'Сегодня';
    if (i === 1) return 'Завтра';
    const date = parseForecastDate(day.date);
    return dayNames[date.getDay()];
  });

  const maxTemps = days.map(d => d.maxTemp);
  const minTemps = days.map(d => d.minTemp);

  const palette = getChartThemePalette();

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
    options: getChartOptions(palette)
  });
}

function renderHourlyChart(hourlyData) {
  const canvas = document.getElementById('hourlyChart');
  if (!canvas || !Array.isArray(hourlyData) || hourlyData.length === 0) return;
  const ctx = canvas.getContext('2d');
  if (hourlyChartInstance) hourlyChartInstance.destroy();

  const palette = getChartThemePalette();

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
            color: palette.legend
          }
        },
        tooltip: {
          callbacks: {
            label: context => formatChartTooltip(context.dataset.label, context.parsed.y)
          }
        }
      },
      scales: {
        x: { grid: { display: false }, ticks: { color: palette.ticks } },
        y: {
          position: 'left',
          grid: { color: palette.grid },
          ticks: { callback: v => v + '°', color: palette.ticks }
        },
        y1: {
          position: 'right',
          min: 0,
          max: 100,
          grid: { display: false },
          ticks: { callback: v => v + '%', color: palette.ticks }
        }
      }
    }
  });
}

function formatChartTooltip(label, value) {
  if (value === null || value === undefined || value === '' || !Number.isFinite(Number(value))) return label + ': нет данных';
  const unit = label.includes('Осадки') ? '%' : '°C';
  return `${label}: ${value}${unit}`;
}

function createGradient(ctx, color1, color2) {
  const gradient = ctx.createLinearGradient(0, 0, 0, 300);
  gradient.addColorStop(0, color1);
  gradient.addColorStop(1, color2);
  return gradient;
}

function getChartOptions(palette) {
  return {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: {
        labels: { usePointStyle: true, padding: 20, color: palette.legend }
      },
      tooltip: {
        backgroundColor: 'rgba(26, 26, 46, 0.9)',
        padding: 12,
        cornerRadius: 8,
        callbacks: {
          label: (ctx) => formatChartTooltip(ctx.dataset.label, ctx.parsed.y)
        }
      }
    },
    scales: {
      x: {
        grid: { display: false },
        ticks: { color: palette.ticks }
      },
      y: {
        grid: { color: palette.grid },
        ticks: { callback: v => v + '°C', color: palette.ticks }
      }
    },
    interaction: { intersect: false, mode: 'index' }
  };
}

function updateChartTheme() {
  const palette = getChartThemePalette();

  [tempChartInstance, hourlyChartInstance].forEach(chart => {
    if (chart) {
      chart.options.scales.y.grid.color = palette.grid;

      if (chart.options.scales.x) {
        chart.options.scales.x.ticks.color = palette.ticks;
      }
      if (chart.options.scales.y) {
        chart.options.scales.y.ticks.color = palette.ticks;
      }
      if (chart.options.scales.y1) {
        chart.options.scales.y1.ticks.color = palette.ticks;
        chart.options.scales.y1.grid.color = palette.grid;
      }

      if (chart.options.plugins && chart.options.plugins.legend) {
        chart.options.plugins.legend.labels.color = palette.legend;
      }

      chart.update();
    }
  });
}
