<div align="center">
  <img src="assets/favicon.svg" alt="WeatherNow Logo" width="80" height="80">
  
  # 🌤️ WeatherNow
  
  **Красивый прогноз погоды с живой визуализацией**
  
  [![GitHub Pages](https://img.shields.io/badge/Демо-GitHub%20Pages-FF8C42?style=for-the-badge&logo=github)](https://doctorstrangesh.github.io/WeatherNow)
  [![JavaScript](https://img.shields.io/badge/JavaScript-ES6+-F7DF1E?style=for-the-badge&logo=javascript&logoColor=black)](https://developer.mozilla.org/ru/docs/Web/JavaScript)
  [![OpenWeatherMap](https://img.shields.io/badge/OpenWeather-API-FF8C42?style=for-the-badge)](https://openweathermap.org/api)
  [![Chart.js](https://img.shields.io/badge/Chart.js-4.4-FF6384?style=for-the-badge)](https://www.chartjs.org/)
  [![Bootstrap](https://img.shields.io/badge/Bootstrap-5.3-7952B3?style=for-the-badge&logo=bootstrap)](https://getbootstrap.com/)
</div>

---

## 📋 О проекте

**WeatherNow** — современное погодное приложение с анимированным небом, детальными графиками и красивым glassmorphism-дизайном. Показывает текущую погоду, прогноз на 5 дней, почасовой прогноз, карту осадков и позволяет сравнивать погоду в разных городах.

### 🎯 Возможности
- Текущая погода по геолокации или поиску города
- Прогноз на 5 дней с группировкой по дням
- Почасовой прогноз с графиком температуры и осадков
- Интерактивные графики (Chart.js)
- Карта осадков (OpenWeatherMap)
- Сравнение погоды двух городов
- Избранные города (LocalStorage)
- Push-уведомления о дожде, снеге, грозе
- Тёмная и светлая тема
- Анимированное небо с облаками и звёздами
- Полная адаптивность (mobile-first)

---

## 🛠 Технический стек

<table>
  <tr>
    <td><strong>Погода</strong></td>
    <td>
      <img src="https://img.shields.io/badge/OpenWeatherMap-API-FF8C42?style=flat-square">
      <img src="https://img.shields.io/badge/Geolocation-API-3b82f6?style=flat-square">
    </td>
  </tr>
  <tr>
    <td><strong>Графики</strong></td>
    <td>
      <img src="https://img.shields.io/badge/Chart.js-4.4-FF6384?style=flat-square">
      <img src="https://img.shields.io/badge/Canvas-API-3b82f6?style=flat-square">
    </td>
  </tr>
  <tr>
    <td><strong>Интерфейс</strong></td>
    <td>
      <img src="https://img.shields.io/badge/Bootstrap-5.3-7952B3?style=flat-square&logo=bootstrap">
      <img src="https://img.shields.io/badge/Glassmorphism-CSS-00C853?style=flat-square">
      <img src="https://img.shields.io/badge/CSS_Animations-Облака,_Звёзды-00C853?style=flat-square">
    </td>
  </tr>
  <tr>
    <td><strong>Хранение</strong></td>
    <td>
      <img src="https://img.shields.io/badge/LocalStorage-Избранное-FFCA28?style=flat-square">
    </td>
  </tr>
  <tr>
    <td><strong>Уведомления</strong></td>
    <td>
      <img src="https://img.shields.io/badge/Notifications-API-222222?style=flat-square">
    </td>
  </tr>
</table>

---

## ✨ Ключевые фичи

| Фича | Описание | Технология |
|------|----------|------------|
| 🌍 **Геолокация** | Автоопределение города | Geolocation API |
| 🔍 **Поиск городов** | С автодополнением и русскими названиями | OpenWeatherMap Geo API |
| 📊 **Графики температуры** | Макс/мин на 5 дней, почасовой с осадками | Chart.js |
| 🗺️ **Карта осадков** | Встроенная карта OpenWeatherMap | iframe |
| ⭐ **Избранное** | До 10 городов, быстрый доступ | LocalStorage |
| 🌓 **Тёмная тема** | Автосохранение выбора, звёзды ночью | CSS Variables |
| 🔔 **Уведомления** | О дожде, снеге, грозе | Notification API |
| 📱 **PWA-готовность** | Адаптивный дизайн, mobile-first | Bootstrap 5 |
| 🎨 **Glassmorphism** | Стеклянные карточки с блюром | CSS backdrop-filter |
| ☁️ **Живое небо** | Анимированные облака и звёзды | CSS Animations |
| 🆚 **Сравнение** | Погода двух городов рядом | Promise.all |

---

text

### 🧠 Принципы
- **Модульность** — каждый файл отвечает за свою зону
- **Mobile-first** — сначала мобильная вёрстка, потом десктоп
- **Graceful degradation** — если геолокация отклонена, грузится Москва по умолчанию
- **Русские названия** — используется `local_names.ru` из API

---

## 🔧 Быстрый старт

```bash
# 1. Клонируй репозиторий
git clone https://github.com/DoctorStrangeSH/WeatherNow.git
cd weathernow

# 2. Открой index.html через Live Server (или любой сервер)

# 3. Разреши геолокацию или введи город в поиске
⚠️ Для работы нужен API-ключ OpenWeatherMap. Текущий ключ в js/config.js — демонстрационный.
Получи бесплатный ключ на openweathermap.org

📱 PWA-возможности (в разработке)
Адаптивный дизайн

Офлайн-иконка

Service Worker для кеширования

Web Manifest для установки

🎨 Цветовая схема
Элемент	Светлая тема	Тёмная тема
Небо	#87CEEB → #E0F0FF	#0a0a2e → #2a2a5e
Акцент	#FF8C42	#FF8C42
Карточки	Белые полупрозрачные	Тёмные полупрозрачные
Текст	#1a1a2e	#ffffff
📄 Лицензия
MIT — делай что хочешь, только указывай автора 😊

<div align="center"> <p>Сделано с ❤️ и ☕</p> <p> <a href="https://github.com/DoctorStrangeSH">GitHub</a> • <a href="https://openweathermap.org">OpenWeatherMap</a> • <a href="https://www.chartjs.org">Chart.js</a> </p> </div> ```