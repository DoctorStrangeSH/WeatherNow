function getWardrobeRecommendation(temp, feelsLike, weatherCode, windSpeed) {
  const perceived = Number.isFinite(Number(feelsLike)) ? Number(feelsLike) : Number(temp);
  const code = Number(weatherCode);
  const wind = Number(windSpeed) || 0;

  let category;
  let tip;
  let baseLayers;

  if (perceived >= 27) {
    category = 'Жарко';
    tip = 'Выбирай лёгкие дышащие ткани и не забывай про защиту от солнца.';
    baseLayers = ['Футболка или лёгкая рубашка', 'Шорты или лёгкие брюки'];
  } else if (perceived >= 18) {
    category = 'Тепло';
    tip = 'Подойдёт лёгкая одежда. На вечер можно взять дополнительный слой.';
    baseLayers = ['Футболка или рубашка', 'Лёгкие брюки'];
  } else if (perceived >= 10) {
    category = 'Свежо';
    tip = 'Лучше одеться слоями: так будет комфортно при смене температуры.';
    baseLayers = ['Лонгслив или тонкий свитер', 'Джинсы или плотные брюки'];
  } else if (perceived >= 3) {
    category = 'Прохладно';
    tip = 'Тёплый средний слой и куртка помогут сохранить комфорт.';
    baseLayers = ['Свитер или худи', 'Плотные брюки'];
  } else if (perceived >= -5) {
    category = 'Холодно';
    tip = 'Одевайся тепло, закрывай шею и руки.';
    baseLayers = ['Термослой или тёплый свитер', 'Утеплённые брюки'];
  } else {
    category = 'Очень холодно';
    tip = 'Выбирай многослойную зимнюю одежду и защищай открытые участки кожи.';
    baseLayers = ['Термобельё и тёплый слой', 'Утеплённые зимние брюки'];
  }

  const outerwear = perceived < 3
    ? ['Тёплая зимняя куртка или пуховик']
    : perceived < 12
      ? ['Утеплённая куртка или пальто']
      : perceived < 19
        ? ['Лёгкая куртка или ветровка']
        : [];

  const footwear = perceived < 3
    ? ['Тёплая обувь с нескользящей подошвой']
    : ['Закрытые удобные кроссовки или ботинки'];

  const extras = [];
  const isRainy = (code >= 300 && code < 600) || (code >= 200 && code < 300);
  const isSnowy = code >= 600 && code < 700;
  const isFoggy = code >= 700 && code < 800;

  if (isRainy) {
    outerwear.push('Водонепроницаемая куртка');
    footwear.push('Непромокаемая обувь');
    extras.push('Зонт');
  }
  if (isSnowy) {
    footwear.push('Утеплённая обувь с хорошим сцеплением');
    extras.push('Перчатки');
  }
  if (wind >= 8) {
    outerwear.push('Ветрозащитный верхний слой');
    extras.push('Шарф или бафф');
  }
  if (isFoggy) extras.push('Светоотражающий элемент для видимости');

  return {
    category,
    temp: Number(temp),
    feelsLike: perceived,
    tip,
    sections: [
      { title: 'Базовый слой', icon: 'bi-layers', items: baseLayers },
      ...(outerwear.length ? [{ title: 'Верхняя одежда', icon: 'bi-wind', items: [...new Set(outerwear)] }] : []),
      { title: 'Обувь', icon: 'bi-boot', items: [...new Set(footwear)] },
      ...(extras.length ? [{ title: 'Не забудь', icon: 'bi-bag-check', items: [...new Set(extras)] }] : [])
    ]
  };
}

function renderWardrobe(data) {
  const container = document.getElementById('wardrobe-container');
  if (!container || !data?.main || !data?.weather?.[0]) return;

  const recommendation = getWardrobeRecommendation(
    data.main.temp,
    data.main.feels_like,
    data.weather[0].id,
    data.wind?.speed
  );

  const card = document.createElement('section');
  card.className = 'glass-card rounded-4 p-3 p-md-4 mt-4 wardrobe-recommendation';
  card.setAttribute('aria-labelledby', 'wardrobe-title');

  const heading = document.createElement('h4');
  heading.className = 'fw-bold mb-2';
  heading.id = 'wardrobe-title';
  heading.textContent = 'Что надеть сегодня?';

  const summary = document.createElement('div');
  summary.className = 'wardrobe-summary mb-3';

  const category = document.createElement('span');
  category.className = 'wardrobe-temperature';
  category.textContent = recommendation.category;

  const temperature = document.createElement('strong');
  temperature.textContent = `${Math.round(recommendation.feelsLike)}°C по ощущениям`;

  const tip = document.createElement('p');
  tip.className = 'mb-0';
  tip.textContent = recommendation.tip;

  summary.append(category, temperature, tip);

  const grid = document.createElement('div');
  grid.className = 'row g-2 text-start';

  recommendation.sections.forEach(section => {
    const column = document.createElement('div');
    column.className = 'col-12 col-md-6';

    const group = document.createElement('div');
    group.className = 'wardrobe-group h-100';

    const title = document.createElement('h6');
    title.className = 'fw-semibold mb-2';
    const icon = document.createElement('i');
    icon.className = `bi ${section.icon} me-2`;
    icon.setAttribute('aria-hidden', 'true');
    title.append(icon, document.createTextNode(section.title));

    const list = document.createElement('ul');
    list.className = 'wardrobe-items mb-0';
    section.items.forEach(item => {
      const entry = document.createElement('li');
      entry.textContent = item;
      list.append(entry);
    });

    group.append(title, list);
    column.append(group);
    grid.append(column);
  });

  card.append(heading, summary, grid);
  container.replaceChildren(card);
}
