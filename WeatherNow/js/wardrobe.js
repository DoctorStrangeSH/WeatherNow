// ============================================
// WeatherNow — Гардероб (мужское и женское)
// ============================================

function getWardrobeRecommendation(temp, feelsLike, weatherCode, windSpeed, humidity, precipProb) {
  const feelsTemp = feelsLike !== undefined ? feelsLike : temp;
  
  // Определяем сезон и категорию
  let category;
  if (feelsTemp >= 28) category = 'very_hot';
  else if (feelsTemp >= 22) category = 'hot';
  else if (feelsTemp >= 16) category = 'warm';
  else if (feelsTemp >= 10) category = 'mild';
  else if (feelsTemp >= 3) category = 'cool';
  else if (feelsTemp >= -5) category = 'cold';
  else if (feelsTemp >= -15) category = 'very_cold';
  else category = 'extreme_cold';
  
  const isRainy = (weatherCode >= 300 && weatherCode < 600);
  const isStormy = (weatherCode >= 200 && weatherCode < 300);
  const isSnowy = (weatherCode >= 600 && weatherCode < 700);
  const isWindy = windSpeed > 8;
  const isFoggy = (weatherCode >= 700 && weatherCode < 800);
  
  return {
    category,
    temp,
    feelsLike: feelsTemp,
    isRainy,
    isStormy,
    isSnowy,
    isWindy,
    isFoggy,
    windSpeed,
    humidity,
    precipProb,
    mens: getMensClothing(category, isRainy, isSnowy, isWindy, isStormy),
    womens: getWomensClothing(category, isRainy, isSnowy, isWindy, isStormy),
    unisex: getUnisexItems(category, isRainy, isSnowy, isWindy, isStormy, isFoggy),
    tip: getTip(category, isRainy, isStormy, isSnowy, isWindy)
  };
}

function getMensClothing(category, isRainy, isSnowy, isWindy, isStormy) {
  const clothing = {
    head: [],
    top: [],
    outerwear: [],
    bottom: [],
    footwear: [],
    accessories: []
  };
  
  switch(category) {
    case 'very_hot':
      clothing.head = ['Бейсболка', 'Панама'];
      clothing.top = ['Майка', 'Футболка', 'Поло'];
      clothing.bottom = ['Шорты', 'Лёгкие брюки чинос'];
      clothing.footwear = ['Сандалии', 'Шлёпанцы', 'Лёгкие кеды'];
      clothing.accessories = ['Солнцезащитные очки', 'Солнцезащитный крем'];
      break;
    case 'hot':
      clothing.head = ['Кепка', 'Бейсболка'];
      clothing.top = ['Футболка', 'Поло', 'Льняная рубашка'];
      clothing.bottom = ['Шорты', 'Чинос', 'Лёгкие джинсы'];
      clothing.footwear = ['Кеды', 'Кроссовки', 'Мокасины'];
      clothing.accessories = ['Солнцезащитные очки'];
      break;
    case 'warm':
      clothing.top = ['Футболка', 'Рубашка с коротким рукавом', 'Поло'];
      clothing.outerwear = ['Лёгкая ветровка', 'Джинсовая куртка'];
      clothing.bottom = ['Джинсы', 'Чинос', 'Брюки'];
      clothing.footwear = ['Кроссовки', 'Кеды', 'Лоферы'];
      break;
    case 'mild':
      clothing.top = ['Рубашка', 'Свитшот', 'Тонкий свитер'];
      clothing.outerwear = ['Ветровка', 'Лёгкая куртка', 'Бомбер'];
      clothing.bottom = ['Джинсы', 'Брюки'];
      clothing.footwear = ['Кроссовки', 'Ботинки челси'];
      break;
    case 'cool':
      clothing.top = ['Свитер', 'Толстовка', 'Худи'];
      clothing.outerwear = ['Куртка', 'Пальто', 'Парка'];
      clothing.bottom = ['Джинсы', 'Тёплые брюки'];
      clothing.footwear = ['Ботинки', 'Кроссовки утеплённые'];
      clothing.accessories = ['Шарф (по желанию)'];
      break;
    case 'cold':
      clothing.head = ['Шапка'];
      clothing.top = ['Термобельё', 'Свитер', 'Толстовка'];
      clothing.outerwear = ['Пуховик', 'Тёплая парка', 'Зимняя куртка'];
      clothing.bottom = ['Тёплые джинсы', 'Утеплённые брюки'];
      clothing.footwear = ['Зимние ботинки', 'Утеплённые кроссовки'];
      clothing.accessories = ['Шарф', 'Перчатки'];
      break;
    case 'very_cold':
      clothing.head = ['Тёплая шапка'];
      clothing.top = ['Термобельё', 'Толстый свитер', 'Флисовая кофта'];
      clothing.outerwear = ['Тёплый пуховик', 'Зимняя куртка с капюшоном'];
      clothing.bottom = ['Термобельё + джинсы', 'Утеплённые штаны'];
      clothing.footwear = ['Зимние ботинки на меху', 'Угги'];
      clothing.accessories = ['Шарф', 'Тёплые перчатки', 'Балаклава'];
      break;
    case 'extreme_cold':
      clothing.head = ['Тёплая шапка', 'Балаклава'];
      clothing.top = ['Термобельё', 'Шерстяной свитер', 'Флис'];
      clothing.outerwear = ['Экстремальный пуховик', 'Шуба', 'Тулуп'];
      clothing.bottom = ['Термобельё + утеплённые штаны', 'Лыжные штаны'];
      clothing.footwear = ['Валенки', 'Зимние ботинки -40°C'];
      clothing.accessories = ['Шарф', 'Варежки', 'Термоперчатки'];
      break;
  }
  
  // Корректировка по погоде
  if (isRainy) {
    clothing.outerwear.push('Водонепроницаемая куртка', 'Дождевик');
    clothing.footwear.push('Непромокаемые ботинки');
    clothing.accessories.push('Зонт');
  }
  if (isSnowy) {
    clothing.footwear = ['Тёплые непромокаемые ботинки', 'Зимние ботинки'];
    clothing.accessories.push('Перчатки', 'Шарф');
  }
  if (isWindy && category !== 'extreme_cold') {
    clothing.outerwear.push('Ветрозащитная куртка');
    clothing.accessories.push('Шарф');
  }
  if (isStormy) {
    clothing.accessories.push('Зонт', 'Водонепроницаемая обувь');
  }
  
  return clothing;
}

function getWomensClothing(category, isRainy, isSnowy, isWindy, isStormy) {
  const clothing = {
    head: [],
    top: [],
    outerwear: [],
    bottom: [],
    dress: [],
    footwear: [],
    accessories: []
  };
  
  switch(category) {
    case 'very_hot':
      clothing.head = ['Шляпа', 'Панама', 'Кепка'];
      clothing.top = ['Топ', 'Майка', 'Футболка'];
      clothing.bottom = ['Шорты', 'Юбка мини', 'Лёгкие брюки'];
      clothing.dress = ['Сарафан', 'Лёгкое платье'];
      clothing.footwear = ['Босоножки', 'Сандалии', 'Шлёпанцы', 'Эспадрильи'];
      clothing.accessories = ['Солнцезащитные очки', 'Солнцезащитный крем', 'Пляжная сумка'];
      break;
    case 'hot':
      clothing.head = ['Шляпа', 'Кепка'];
      clothing.top = ['Футболка', 'Блузка', 'Топ'];
      clothing.bottom = ['Шорты', 'Юбка', 'Лёгкие джинсы'];
      clothing.dress = ['Сарафан', 'Платье'];
      clothing.footwear = ['Балетки', 'Кеды', 'Босоножки'];
      clothing.accessories = ['Солнцезащитные очки'];
      break;
    case 'warm':
      clothing.top = ['Футболка', 'Блузка', 'Топ'];
      clothing.outerwear = ['Лёгкий кардиган', 'Джинсовая куртка', 'Жилет'];
      clothing.bottom = ['Джинсы', 'Юбка', 'Брюки капри'];
      clothing.dress = ['Платье миди'];
      clothing.footwear = ['Кеды', 'Балетки', 'Лоферы', 'Туфли на низком каблуке'];
      break;
    case 'mild':
      clothing.top = ['Блузка', 'Свитшот', 'Тонкий свитер'];
      clothing.outerwear = ['Кардиган', 'Косуха', 'Тренч'];
      clothing.bottom = ['Джинсы', 'Брюки', 'Юбка миди'];
      clothing.dress = ['Платье + колготки'];
      clothing.footwear = ['Кроссовки', 'Ботильоны', 'Туфли'];
      break;
    case 'cool':
      clothing.top = ['Свитер', 'Водолазка', 'Толстовка'];
      clothing.outerwear = ['Пальто', 'Куртка', 'Парка'];
      clothing.bottom = ['Джинсы', 'Тёплые брюки', 'Юбка + плотные колготки'];
      clothing.dress = ['Тёплое платье + колготки'];
      clothing.footwear = ['Ботинки', 'Ботильоны', 'Утеплённые кроссовки'];
      clothing.accessories = ['Шарф', 'Шейный платок'];
      break;
    case 'cold':
      clothing.head = ['Шапка', 'Берет'];
      clothing.top = ['Водолазка', 'Свитер', 'Термобельё'];
      clothing.outerwear = ['Пуховик', 'Шуба', 'Тёплое пальто'];
      clothing.bottom = ['Утеплённые джинсы', 'Тёплые брюки', 'Юбка + термоколготки'];
      clothing.dress = ['Тёплое платье + термоколготки'];
      clothing.footwear = ['Зимние ботинки', 'Сапоги', 'Угги'];
      clothing.accessories = ['Шарф', 'Перчатки', 'Варежки'];
      break;
    case 'very_cold':
      clothing.head = ['Тёплая шапка', 'Меховая шапка'];
      clothing.top = ['Термобельё', 'Шерстяной свитер', 'Флис'];
      clothing.outerwear = ['Тёплый пуховик', 'Шуба', 'Дублёнка'];
      clothing.bottom = ['Термобельё + джинсы', 'Утеплённые лосины'];
      clothing.footwear = ['Зимние сапоги на меху', 'Угги', 'Тёплые ботинки'];
      clothing.accessories = ['Шарф', 'Тёплые перчатки', 'Муфта'];
      break;
    case 'extreme_cold':
      clothing.head = ['Тёплая шапка', 'Меховая шапка', 'Капюшон'];
      clothing.top = ['Термобельё', 'Шерстяной свитер', 'Пуховый жилет'];
      clothing.outerwear = ['Экстремальный пуховик', 'Шуба до пят', 'Тулуп'];
      clothing.bottom = ['Термобельё + утеплённые штаны', 'Лыжные штаны'];
      clothing.footwear = ['Валенки', 'Унты', 'Зимние сапоги -40°C'];
      clothing.accessories = ['Шарф', 'Варежки', 'Термоперчатки', 'Муфта'];
      break;
  }
  
  // Корректировка по погоде
  if (isRainy) {
    clothing.outerwear.push('Дождевик', 'Водонепроницаемый плащ');
    clothing.footwear.push('Резиновые сапоги', 'Непромокаемые ботинки');
    clothing.accessories.push('Зонт');
  }
  if (isSnowy) {
    clothing.footwear = ['Зимние сапоги', 'Тёплые ботинки'];
    clothing.accessories.push('Перчатки', 'Шарф');
  }
  if (isWindy && category !== 'extreme_cold') {
    clothing.outerwear.push('Ветрозащитная куртка');
    clothing.accessories.push('Шарф', 'Платок');
  }
  if (isStormy) {
    clothing.accessories.push('Зонт', 'Водонепроницаемая обувь');
  }
  
  return clothing;
}

function getUnisexItems(category, isRainy, isSnowy, isWindy, isStormy, isFoggy) {
  const items = [];
  
  if (isRainy) items.push('Зонт', 'Дождевик');
  if (isSnowy) items.push('Снегоступы (если много снега)');
  if (isFoggy) items.push('Светоотражающие элементы', 'Фонарик');
  if (isWindy && category === 'very_hot') items.push('Ветрозащитные очки');
  
  return items;
}

function getTip(category, isRainy, isStormy, isSnowy, isWindy) {
  const tips = {
    'very_hot': '🌡️ Очень жарко! Пей больше воды, избегай солнца с 11 до 16.',
    'hot': '☀️ Жарко. Отличная погода для пляжа или прогулки в парке!',
    'warm': '🌸 Комфортная погода. Идеально для прогулок и спорта на улице.',
    'mild': '🍂 Прохладно. Одевайся слоями, чтобы можно было снять лишнее.',
    'cool': '❄️ Прохладно. Не забудь тёплую кофту или куртку!',
    'cold': '🥶 Холодно! Шапка, шарф и перчатки обязательны.',
    'very_cold': '❄️ Очень холодно! Максимально утепляйся, береги открытые участки кожи.',
    'extreme_cold': '⚠️ Экстремальный холод! Лучше остаться дома. Если выходишь — одевайся как на Северный полюс!'
  };
  
  let tip = tips[category] || '';
  
  if (isRainy) tip += ' 🌧️ Возьми зонт и надень непромокаемую обувь.';
  if (isStormy) tip += ' ⛈️ Гроза! Лучше оставаться в помещении.';
  if (isSnowy) tip += ' 🌨️ Снегопад. Будь осторожен на дорогах!';
  if (isWindy) tip += ' 💨 Сильный ветер. Одевайся плотнее!';
  
  return tip;
}

function renderWardrobe(data) {
  const container = document.getElementById('wardrobe-container');
  if (!container) return;
  
  const temp = Math.round(data.main.temp);
  const feelsLike = Math.round(data.main.feels_like);
  const weatherCode = data.weather[0].id;
  const windSpeed = data.wind.speed;
  const humidity = data.main.humidity;
  const precipProb = data.pop ? Math.round(data.pop * 100) : 0;
  
  const wardrobe = getWardrobeRecommendation(temp, feelsLike, weatherCode, windSpeed, humidity, precipProb);
  
  container.innerHTML = `
    <div class="glass-card rounded-4 p-4 mt-4">
      <h4 class="fw-bold mb-3 text-center">
        <i class="bi bi-handbag me-2"></i>Что надеть?
      </h4>
      
      <!-- Совет -->
      <div class="text-center mb-4">
        <div class="d-inline-block px-4 py-3 rounded-4" style="background: var(--accent-glow); max-width: 500px;">
          <p class="fw-bold mb-1">${wardrobe.tip}</p>
          <small class="text-muted">Ощущается как ${wardrobe.feelsLike}°C (реальная ${wardrobe.temp}°C)</small>
        </div>
      </div>
      
      <!-- Табы: Мужское / Женское -->
      <div class="d-flex justify-content-center gap-2 mb-4">
        <button class="btn btn-glass active wardrobe-tab" onclick="switchWardrobeTab('mens')">
          <i class="bi bi-gender-male me-1"></i>Мужское
        </button>
        <button class="btn btn-glass wardrobe-tab" onclick="switchWardrobeTab('womens')">
          <i class="bi bi-gender-female me-1"></i>Женское
        </button>
      </div>
      
      <!-- Мужская одежда -->
      <div id="wardrobe-mens" class="wardrobe-tab-content">
        ${renderClothingSection(wardrobe.mens, '👔 Мужская одежда')}
      </div>
      
      <!-- Женская одежда -->
      <div id="wardrobe-womens" class="wardrobe-tab-content d-none">
        ${renderClothingSection(wardrobe.womens, '👗 Женская одежда')}
      </div>
      
      <!-- Общие предметы -->
      ${wardrobe.unisex.length > 0 ? `
        <div class="mt-4">
          <h6 class="fw-bold mb-2 text-muted">🎒 Общие рекомендации</h6>
          <div class="d-flex flex-wrap gap-2">
            ${wardrobe.unisex.map(item => `
              <span class="badge rounded-pill px-3 py-2" style="background: var(--card-bg); border: 1px solid var(--card-border); color: var(--text-primary); font-size: 0.85rem;">${item}</span>
            `).join('')}
          </div>
        </div>
      ` : ''}
    </div>
  `;
}

function renderClothingSection(clothing, title) {
  const sections = [
    { key: 'head', icon: '🧢', title: 'Головной убор' },
    { key: 'top', icon: '👕', title: 'Верх' },
    { key: 'outerwear', icon: '🧥', title: 'Верхняя одежда' },
    { key: 'dress', icon: '👗', title: 'Платья / Сарафаны' },
    { key: 'bottom', icon: '👖', title: 'Низ' },
    { key: 'footwear', icon: '👟', title: 'Обувь' },
    { key: 'accessories', icon: '👜', title: 'Аксессуары' }
  ];
  
  return `
    <div class="row g-3">
      ${sections.map(section => {
        const items = clothing[section.key];
        if (!items || items.length === 0) return '';
        
        return `
          <div class="col-12 col-md-6 col-lg-4">
            <div class="glass-card rounded-4 p-3 h-100">
              <h6 class="fw-bold mb-3">
                <span class="me-2">${section.icon}</span>${section.title}
              </h6>
              <div class="d-flex flex-wrap gap-2">
                ${items.map(item => `
                  <span class="badge rounded-pill px-3 py-2" style="background: var(--card-bg); border: 1px solid var(--card-border); color: var(--text-primary); font-size: 0.85rem; white-space: normal; text-align: left;">
                    ${item}
                  </span>
                `).join('')}
              </div>
            </div>
          </div>
        `;
      }).join('')}
    </div>
  `;
}

function switchWardrobeTab(tab) {
  document.querySelectorAll('.wardrobe-tab').forEach(btn => btn.classList.remove('active'));
  document.querySelectorAll('.wardrobe-tab-content').forEach(el => el.classList.add('d-none'));
  
  if (tab === 'mens') {
    document.querySelector('.wardrobe-tab:first-child').classList.add('active');
    document.getElementById('wardrobe-mens').classList.remove('d-none');
  } else {
    document.querySelector('.wardrobe-tab:last-child').classList.add('active');
    document.getElementById('wardrobe-womens').classList.remove('d-none');
  }
}