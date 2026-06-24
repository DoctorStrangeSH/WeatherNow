<div align="center">
  <img src="assets/favicon.svg" alt="SoundWave Logo" width="80" height="80">
  
  # 🎵 SoundWave
  
  **Музыкальный плеер с живой визуализацией звука**
  
  [![GitHub Pages](https://img.shields.io/badge/Демо-GitHub%20Pages-a855f7?style=for-the-badge&logo=github)](https://github.com/DoctorStrangeSH/WeatherNow.git)
  [![JavaScript](https://img.shields.io/badge/JavaScript-ES6+-F7DF1E?style=for-the-badge&logo=javascript&logoColor=black)](https://developer.mozilla.org/ru/docs/Web/JavaScript)
  [![Web Audio API](https://img.shields.io/badge/Web_Audio-API-a855f7?style=for-the-badge)](https://developer.mozilla.org/ru/docs/Web/API/Web_Audio_API)
  [![Canvas](https://img.shields.io/badge/Canvas-API-3b82f6?style=for-the-badge)](https://developer.mozilla.org/ru/docs/Web/API/Canvas_API)
</div>

---

## 📋 О проекте

**SoundWave** — современный музыкальный плеер с живой визуализацией звука на Canvas, загрузкой аудио через Drag & Drop, режимом микрофона и PWA-поддержкой. Проект демонстрирует работу с Web Audio API, Canvas API, IndexedDB и Media Session API.

### 🎯 Что показывает проект
- Работу с низкоуровневым Web Audio API (AudioContext, AnalyserNode)
- Визуализацию данных в реальном времени на Canvas (60 FPS)
- Drag & Drop загрузку файлов
- Хранение аудио в IndexedDB
- PWA с офлайн-режимом и фоновым воспроизведением

---

## 🛠 Технический стек

<table>
  <tr>
    <td><strong>Аудио</strong></td>
    <td>
      <img src="https://img.shields.io/badge/Web_Audio_API-AudioContext,_AnalyserNode-a855f7?style=flat-square">
      <img src="https://img.shields.io/badge/Media_Session-API-3b82f6?style=flat-square">
    </td>
  </tr>
  <tr>
    <td><strong>Визуализация</strong></td>
    <td>
      <img src="https://img.shields.io/badge/Canvas_API-60_FPS,_Градиенты-3b82f6?style=flat-square">
    </td>
  </tr>
  <tr>
    <td><strong>Хранение</strong></td>
    <td>
      <img src="https://img.shields.io/badge/IndexedDB-Аудиофайлы-FFCA28?style=flat-square">
      <img src="https://img.shields.io/badge/FileReader-API-00C853?style=flat-square">
    </td>
  </tr>
  <tr>
    <td><strong>Интерфейс</strong></td>
    <td>
      <img src="https://img.shields.io/badge/Drag_&_Drop-API-7952B3?style=flat-square">
      <img src="https://img.shields.io/badge/Bootstrap-5.3-7952B3?style=flat-square&logo=bootstrap">
    </td>
  </tr>
  <tr>
    <td><strong>PWA</strong></td>
    <td>
      <img src="https://img.shields.io/badge/Service_Worker-Офлайн-222222?style=flat-square">
      <img src="https://img.shields.io/badge/Web_Manifest-Установка-222222?style=flat-square">
    </td>
  </tr>
</table>

---

## ✨ Ключевые фичи

| Фича | Описание | Технология |
|------|----------|------------|
| 🎵 **Загрузка аудио** | MP3, WAV, OGG, FLAC через Drag & Drop | FileReader + Web Audio API |
| 📊 **3 режима визуализации** | Бары, волна, круг — переключение на лету | Canvas API |
| 🌈 **4 цветовые темы** | Неон, огонь, океан, радуга | HSL + Canvas |
| 🎤 **Режим микрофона** | Визуализация голоса в реальном времени | getUserMedia + AnalyserNode |
| 💾 **Автосохранение** | Треки и плейлисты сохраняются в браузере | IndexedDB |
| 📱 **PWA** | Установка на телефон, офлайн-режим | Service Worker + Manifest |
| 🎵 **Media Session** | Управление с экрана блокировки телефона | Media Session API |
| ⌨️ **Горячие клавиши** | Пробел, стрелки для управления | Keyboard Events |
| 🔀 **Shuffle/Repeat** | Все режимы воспроизведения | Алгоритмы |
| 📋 **Экспорт/импорт** | Плейлисты в JSON для обмена | Blob + FileReader |

---

### 🧩 Принципы проектирования
- **Разделение ответственности** — аудио-движок, визуализатор, плеер, плейлист — независимые модули
- **Реактивная визуализация** — Canvas обновляется 60 раз в секунду через requestAnimationFrame
- **Progressive Web App** — работает офлайн, устанавливается на телефон
- **Graceful degradation** — при отсутствии IndexedDB треки хранятся в памяти

---

## 🔧 Быстрый старт

```bash
# 1. Клонируй репозиторий
git clone https://github.com/DoctorStrangeSH/WeatherNow.git
cd soundwave

# 2. Запусти через Live Server

# 3. Перетащи MP3-файл в зону загрузки