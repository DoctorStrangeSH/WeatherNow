// ============================================
// WeatherNow — Избранные города
// ============================================

let favoriteCities = JSON.parse(localStorage.getItem('weathernow-favorites') || '[]');

function addToFavorites(cityName, country) {
  if (favoriteCities.some(c => c.name.toLowerCase() === cityName.toLowerCase())) {
    showToast('Этот город уже в избранном! ⭐', 'warning');
    return false;
  }
  
  if (favoriteCities.length >= 10) {
    showToast('Максимум 10 городов в избранном 😅', 'warning');
    return false;
  }
  
  favoriteCities.push({
    name: cityName,
    country: country || '',
    addedAt: new Date().toISOString()
  });
  
  saveFavorites();
  updateFavoriteButton(cityName, true);
  showToast(`${cityName} добавлен в избранное! ⭐`, 'success');
  return true;
}

function removeFromFavorites(cityName) {
  favoriteCities = favoriteCities.filter(c => c.name.toLowerCase() !== cityName.toLowerCase());
  saveFavorites();
  updateFavoriteButton(cityName, false);
  showToast(`${cityName} удалён из избранного`, 'info');
}

function toggleFavorite(cityName, country) {
  if (isFavorite(cityName)) {
    removeFromFavorites(cityName);
  } else {
    addToFavorites(cityName, country);
  }
}

function isFavorite(cityName) {
  return favoriteCities.some(c => c.name.toLowerCase() === cityName.toLowerCase());
}

function saveFavorites() {
  localStorage.setItem('weathernow-favorites', JSON.stringify(favoriteCities));
}

function updateFavoriteButton(cityName, isFav) {
  const btn = document.getElementById('favorite-btn');
  if (!btn) return;
  
  if (isFav || isFavorite(cityName)) {
    btn.innerHTML = '<i class="bi bi-heart-fill text-danger fs-4"></i>';
    btn.title = 'Удалить из избранного';
  } else {
    btn.innerHTML = '<i class="bi bi-heart fs-4"></i>';
    btn.title = 'Добавить в избранное';
  }
}

function renderFavorites() {
  const container = document.getElementById('screen-favorites');
  if (!container) return;
  
  if (favoriteCities.length === 0) {
    container.innerHTML = `
      <div class="text-center py-5">
        <i class="bi bi-heartbreak fs-1 text-muted d-block mb-3"></i>
        <h3 class="fw-bold">Пока пусто</h3>
        <p class="text-muted mb-4">Добавляй города в избранное, чтобы быстро переключаться между ними</p>
        <button class="btn btn-accent rounded-pill px-4" onclick="showScreen('home')">
          <i class="bi bi-search me-2"></i>Найти город
        </button>
      </div>
    `;
    return;
  }
  
  container.innerHTML = `
    <div class="row justify-content-center">
      <div class="col-lg-6">
        
        <h3 class="fw-bold mb-4 text-center">
          <i class="bi bi-heart-fill text-danger me-2"></i>Избранные города
        </h3>
        
        <div class="d-grid gap-2">
          ${favoriteCities.map((city, index) => `
            <div class="glass-card rounded-4 p-3 d-flex align-items-center justify-content-between favorite-item">
              <div class="d-flex align-items-center gap-3" onclick="loadCityWeather('${city.name}'); showScreen('home');" style="cursor: pointer; flex: 1;">
                <span class="fs-4">🏙️</span>
                <div>
                  <p class="fw-bold mb-0">${city.name}</p>
                  <small class="text-muted">${city.country}</small>
                </div>
              </div>
              <button class="btn btn-sm text-danger" onclick="removeFromFavorites('${city.name}'); renderFavorites(); event.stopPropagation();" title="Удалить">
                <i class="bi bi-trash3"></i>
              </button>
            </div>
          `).join('')}
        </div>
        
        <div class="text-center mt-4">
          <small class="text-muted">${favoriteCities.length} из 10 городов</small>
        </div>
        
      </div>
    </div>
  `;
}

document.addEventListener('screenChanged', (e) => {
  if (e.detail === 'favorites') {
    renderFavorites();
  }
});