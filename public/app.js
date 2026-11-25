const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];
const storage = {
  read(key, fallback) {
    try { return JSON.parse(localStorage.getItem(key)) ?? fallback; } catch { return fallback; }
  },
  write(key, value) {
    try { localStorage.setItem(key, JSON.stringify(value)); } catch { showToast("Your browser couldn't save this preference."); }
  }
};

const state = {
  location: null,
  weather: null,
  air: null,
  unit: storage.read("skycast-unit", "C"),
  favorites: storage.read("skycast-favorites", []),
  recents: storage.read("skycast-recents", []),
  activeView: "home",
  hourly: [],
  days: []
};

const weatherCodeIcons = {
  clear: "sun", few: "cloud-sun", cloud: "cloud", rain: "cloud-rain",
  drizzle: "cloud-drizzle", snow: "cloud-snow", thunder: "cloud-lightning",
  mist: "cloud-fog", night: "moon"
};
const aqiNames = ["Good", "Fair", "Moderate", "Poor", "Very poor"];
let searchTimer;
let toastTimer;

function showToast(message) {
  const toast = $("#toast");
  toast.textContent = message;
  toast.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.remove("show"), 2800);
}

async function api(url) {
  const response = await fetch(url);
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || "Something went wrong. Please try again.");
  return data;
}

function toDisplay(temp) {
  return state.unit === "C" ? temp : temp * 9 / 5 + 32;
}
function degrees(temp, digits = 0) {
  return `${Math.round(toDisplay(temp).toFixed(digits))}°`;
}
function setTemp(element, temp, suffix = "") {
  if (element) element.textContent = `${degrees(temp)}${suffix}`;
}
function dateTime(timestamp, timezone, options) {
  const hasOffset = typeof timezone === "number";
  const date = new Date(timestamp * 1000 + (hasOffset ? timezone * 1000 : 0));
  return new Intl.DateTimeFormat(undefined, { ...options, timeZone: hasOffset ? "UTC" : timezone }).format(date);
}
function timezoneFor(location) { return location.timezone || "UTC"; }
function weatherKind(description = "") {
  const word = description.toLowerCase();
  if (word.includes("thunder")) return "thunder";
  if (word.includes("snow") || word.includes("sleet")) return "snow";
  if (word.includes("drizzle")) return "drizzle";
  if (word.includes("rain")) return "rain";
  if (word.includes("mist") || word.includes("fog") || word.includes("haze") || word.includes("smoke")) return "mist";
  if (word.includes("cloud")) return word.includes("few") || word.includes("scattered") ? "few" : "cloud";
  return "clear";
}
function iconName(kind, hour = 12) {
  return hour < 6 || hour >= 20 ? "moon" : weatherCodeIcons[kind] || "sun";
}
function iconMarkup(kind, hour) {
  return `<i data-lucide="${iconName(kind, hour)}"></i>`;
}
function weatherAdvice(current, forecast) {
  const kind = weatherKind(current.weather[0].description);
  const maxPop = Math.max(0, ...forecast.list.slice(0, 8).map(item => item.pop || 0));
  if (kind === "rain" || kind === "drizzle" || maxPop >= .45) {
    return ["Don't forget your umbrella", "There’s a chance of rain today. Keep an umbrella close, just in case."];
  }
  if (kind === "snow") return ["Bundle up out there", "Snowy weather calls for a warm coat and shoes with good grip."];
  if (current.main.temp >= 28) return ["Keep cool & hydrated", "It’s a warm one. Drink water and reach for something light."];
  if (current.main.temp <= 8) return ["Layer up today", "A cool day ahead. A cozy extra layer will go a long way."];
  if (current.wind.speed >= 8) return ["A breezy day ahead", "Wind speeds are up. A light jacket will keep you comfortable."];
  return ["Lovely weather to step out", "Conditions look pleasant. Enjoy a little time under the open sky."];
}
function directionFromDegrees(deg) {
  return ["N","NE","E","SE","S","SW","W","NW"][Math.round(deg / 45) % 8];
}
function setWeatherBackground(description) {
  const kind = weatherKind(description);
  const hero = $("#hero-card");
  hero.classList.remove("weather-rain", "weather-snow", "weather-clear");
  if (kind === "rain" || kind === "drizzle" || kind === "thunder") hero.classList.add("weather-rain");
  else if (kind === "snow") hero.classList.add("weather-snow");
  else if (kind === "clear") hero.classList.add("weather-clear");
  const art = $("#weather-art");
  art.className = `weather-art condition-${kind === "few" ? "cloud" : kind === "clear" ? "clear" : kind}`;
  art.innerHTML = `<div class="sun-halo"></div>${iconMarkup(kind, new Date().getHours())}`;
  lucide.createIcons();
}

function updateTemperatureDisplay() {
  if (!state.weather) return;
  const { current, forecast } = state.weather;
  setTemp($("#temperature"), current.main.temp);
  setTemp($("#feels-like"), current.main.feels_like);
  setTemp($("#high-temp"), current.main.temp_max);
  setTemp($("#low-temp"), current.main.temp_min);
  renderHourly(forecast.list);
  renderDays(forecast.list);
  drawChart(forecast.list.slice(0, 8));
}

function renderCurrent(current) {
  const location = state.location;
  const timezone = timezoneFor(current);
  $("#current-location").textContent = location.name || current.name;
  $("#country-code").textContent = location.country || current.sys.country || "";
  $("#condition").textContent = current.weather[0].description.replace(/\b\w/g, char => char.toUpperCase());
  $("#humidity").innerHTML = `${current.main.humidity}<small>%</small>`;
  $("#humidity-meter").style.width = `${current.main.humidity}%`;
  $("#humidity-foot").textContent = current.main.humidity > 70 ? "A little muggy" : current.main.humidity < 35 ? "Dry air today" : "Comfortable air";
  $("#wind-speed").innerHTML = `${Math.round(current.wind.speed * 3.6)}<small> km/h</small>`;
  $("#wind-direction").textContent = `${directionFromDegrees(current.wind.deg || 0)} · ${Math.round(current.wind.speed * 3.6)} km/h`;
  $("#wind-arrow").style.transform = `rotate(${current.wind.deg || 0}deg)`;
  $("#pressure").innerHTML = `${current.main.pressure}<small> hPa</small>`;
  $("#visibility").innerHTML = `${(current.visibility / 1000).toFixed(1)}<small> km</small>`;
  $("#visibility-foot").textContent = current.visibility >= 9000 ? "Lovely, clear views" : current.visibility >= 5000 ? "Slightly hazy" : "Reduced visibility";
  $("#sunrise").textContent = dateTime(current.sys.sunrise, timezone, { hour: "numeric", minute: "2-digit" });
  $("#sunset").textContent = dateTime(current.sys.sunset, timezone, { hour: "numeric", minute: "2-digit" });
  $("#today-date").textContent = dateTime(current.dt, timezone, { weekday: "long", month: "long", day: "numeric" }).toUpperCase();
  setWeatherBackground(current.weather[0].description);
  $("#favorite-button").classList.toggle("saved", isFavorite(location));
  $("#favorite-button").innerHTML = `<i data-lucide="heart"></i>`;
  $("#favorite-button").setAttribute("aria-label", isFavorite(location) ? "Remove from favorites" : "Add to favorites");
  lucide.createIcons();
}

function renderHourly(items) {
  const container = $("#hourly-list");
  state.hourly = items.slice(0, 8);
  container.innerHTML = state.hourly.map((item, index) => {
    const hour = new Date(item.dt * 1000).getHours();
    const time = index === 0 ? "Now" : dateTime(item.dt, timezoneFor(state.weather.current), { hour: "numeric" });
    const kind = weatherKind(item.weather[0].description);
    const rain = Math.round((item.pop || 0) * 100);
    return `<div class="hour-item"><span class="hour-time">${time}</span>${iconMarkup(kind, hour)}<span class="rain-percent">${rain ? `${rain}%` : "&nbsp;"}</span><b class="hour-temp">${degrees(item.main.temp)}</b></div>`;
  }).join("");
  lucide.createIcons();
}

function renderDays(items) {
  const grouped = new Map();
  for (const item of items) {
    const key = dateTime(item.dt, timezoneFor(state.weather.current), { year: "numeric", month: "2-digit", day: "2-digit" });
    if (!grouped.has(key)) grouped.set(key, []);
    grouped.get(key).push(item);
  }
  state.days = [...grouped.values()].slice(0, 5).map((entries, index) => {
    const midday = entries.reduce((closest, item) => {
      const localHour = Number(dateTime(item.dt, timezoneFor(state.weather.current), { hour: "numeric", hourCycle: "h23" }));
      const closestHour = Number(dateTime(closest.dt, timezoneFor(state.weather.current), { hour: "numeric", hourCycle: "h23" }));
      return Math.abs(localHour - 12) < Math.abs(closestHour - 12) ? item : closest;
    }, entries[0]);
    return { date: entries[0].dt, high: Math.max(...entries.map(item => item.main.temp_max)), low: Math.min(...entries.map(item => item.main.temp_min)), rain: Math.round(Math.max(...entries.map(item => item.pop || 0)) * 100), kind: weatherKind(midday.weather[0].description), description: midday.weather[0].description, index };
  });
  $("#weekly-list").innerHTML = state.days.map((day, index) => `<div class="day-row"><span class="day-name">${index === 0 ? "Today" : dateTime(day.date, timezoneFor(state.weather.current), { weekday: "short" })}</span>${iconMarkup(day.kind, 12)}<span class="day-range"><span>${degrees(day.low)}</span><span>${degrees(day.high)}</span></span><span class="day-rain">${day.rain ? `💧 ${day.rain}%` : ""}</span></div>`).join("");
  const [title, tip] = weatherAdvice(state.weather.current, state.weather.forecast);
  $("#tip-title").textContent = title;
  $("#weather-tip").textContent = tip;
  lucide.createIcons();
}

function drawChart(items) {
  const canvas = $("#temperature-chart");
  if (!canvas || !items.length) return;
  const width = canvas.clientWidth || 500;
  const height = 62;
  const ratio = window.devicePixelRatio || 1;
  canvas.width = width * ratio;
  canvas.height = height * ratio;
  const ctx = canvas.getContext("2d");
  ctx.scale(ratio, ratio);
  const values = items.map(item => toDisplay(item.main.temp));
  const min = Math.min(...values) - 2;
  const max = Math.max(...values) + 2;
  const points = values.map((value, index) => ({
    x: index * width / Math.max(1, values.length - 1),
    y: height - 11 - ((value - min) / Math.max(1, max - min)) * (height - 24)
  }));
  const fill = ctx.createLinearGradient(0, 5, 0, height);
  fill.addColorStop(0, "rgba(167,139,250,.2)");
  fill.addColorStop(1, "rgba(167,139,250,0)");
  ctx.beginPath();
  points.forEach((point, index) => index ? ctx.lineTo(point.x, point.y) : ctx.moveTo(point.x, point.y));
  ctx.lineTo(width, height);
  ctx.lineTo(0, height);
  ctx.closePath();
  ctx.fillStyle = fill;
  ctx.fill();
  ctx.beginPath();
  points.forEach((point, index) => index ? ctx.lineTo(point.x, point.y) : ctx.moveTo(point.x, point.y));
  ctx.strokeStyle = "#b39af8";
  ctx.lineWidth = 2;
  ctx.lineJoin = "round";
  ctx.stroke();
  points.forEach((point, index) => {
    ctx.beginPath();
    ctx.arc(point.x, point.y, 2.5, 0, Math.PI * 2);
    ctx.fillStyle = "#d1c4ff";
    ctx.fill();
    ctx.font = "9px DM Sans";
    ctx.fillStyle = "#a9a7b5";
    ctx.textAlign = index === 0 ? "left" : index === points.length - 1 ? "right" : "center";
    ctx.fillText(`${Math.round(values[index])}°`, point.x, point.y - 7);
  });
}

function renderAir(air) {
  state.air = air;
  const item = air.list?.[0];
  if (!item) return;
  const index = Math.max(1, Math.min(5, item.main.aqi));
  $("#aqi-number").textContent = index;
  $("#aqi-label").textContent = aqiNames[index - 1];
  const descriptions = ["Air quality is ideal for outdoor activities.", "Air quality is generally good.", "Sensitive people may notice mild effects.", "Consider limiting prolonged outdoor activity.", "Reduce outdoor activity if possible."];
  $("#aqi-description").textContent = descriptions[index - 1];
  $("#aqi-number").style.color = ["#75d7b1", "#b8d878", "#efc16b", "#ed9874", "#d87994"][index - 1];
  $("#aqi-marker").style.left = `${(index - 1) * 24 + 3}%`;
  const components = item.components;
  $("#air-pollutants").innerHTML = `<span>PM2.5 <b>${components.pm2_5.toFixed(1)}</b></span><span>PM10 <b>${components.pm10.toFixed(1)}</b></span><span>NO₂ <b>${components.no2.toFixed(1)}</b></span>`;
}

async function loadLocation(location, label = "city") {
  hideSearchResults();
  $("#notice").classList.remove("show");
  $("#current-location").textContent = "Getting your forecast...";
  $("#hourly-list").innerHTML = '<div class="loading-row">Gathering your hourly forecast...</div>';
  try {
    const data = await api(`/api/weather?lat=${encodeURIComponent(location.lat)}&lon=${encodeURIComponent(location.lon)}`);
    state.location = location;
    state.weather = data;
    renderCurrent(data.current);
    updateTemperatureDisplay();
    try {
      renderAir(await api(`/api/air-quality?lat=${encodeURIComponent(location.lat)}&lon=${encodeURIComponent(location.lon)}`));
    } catch (error) {
      $("#aqi-label").textContent = "Air quality unavailable";
      $("#aqi-description").textContent = error.message;
    }
    if (label === "city") {
      state.recents = [location, ...state.recents.filter(item => !(item.lat === location.lat && item.lon === location.lon))].slice(0, 5);
      storage.write("skycast-recents", state.recents);
    }
  } catch (error) {
    $("#current-location").textContent = "Weather unavailable";
    $("#hourly-list").innerHTML = `<div class="loading-row">${escapeHtml(error.message)}</div>`;
    $("#notice").textContent = error.message;
    $("#notice").classList.add("show");
    showToast(error.message);
  }
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, char => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char]);
}
function formatPlace(place) {
  return { name: place.name, country: place.country, state: place.state || "", lat: place.lat, lon: place.lon };
}
async function searchCities(query) {
  if (query.trim().length < 2) { hideSearchResults(); return; }
  try {
    const results = await api(`/api/geocode?q=${encodeURIComponent(query.trim())}`);
    const container = $("#search-results");
    if (!results.length) {
      container.innerHTML = '<div class="search-result"><span>No cities found. Try another spelling.</span></div>';
      container.classList.add("open");
      return;
    }
    container.innerHTML = results.map((place, index) => `<button class="search-result" data-index="${index}" role="option"><i data-lucide="map-pin"></i><span>${escapeHtml(place.name)}</span><small>${escapeHtml([place.state, place.country].filter(Boolean).join(", "))}</small></button>`).join("");
    container._places = results.map(formatPlace);
    container.classList.add("open");
    lucide.createIcons();
  } catch (error) {
    $("#search-results").innerHTML = `<div class="search-result"><span>${escapeHtml(error.message)}</span></div>`;
    $("#search-results").classList.add("open");
  }
}
function hideSearchResults() { $("#search-results").classList.remove("open"); }
function isFavorite(location) { return state.favorites.some(item => item.lat === location.lat && item.lon === location.lon); }

function showView(name) {
  state.activeView = name;
  const isHome = name === "home";
  $("#home-view").classList.toggle("active-view", isHome);
  $("#detail-view").classList.toggle("active-view", !isHome);
  $$(".nav-link[data-view]").forEach(link => link.classList.toggle("active", link.dataset.view === name));
  const labels = { hourly: "Hourly Forecast", weekly: "5-Day Forecast", air: "Air Quality", favorites: "Favorite Cities", settings: "Settings" };
  $("#breadcrumb-city").textContent = labels[name] || state.location?.name || "Overview";
  if (isHome) return;
  $("#detail-title").textContent = labels[name] || "Forecast";
  $("#detail-eyebrow").textContent = name === "air" ? "BREATHE EASY" : name === "favorites" ? "YOUR SAVED PLACES" : "PLAN AHEAD";
  $("#detail-description").textContent = name === "air" ? "A real-time look at the air around you." : name === "favorites" ? "The places you want to keep close." : "A little more detail for the days ahead.";
  renderDetail(name);
}

function renderDetail(name) {
  const container = $("#detail-content");
  if (!state.weather && name !== "settings" && name !== "favorites") {
    container.innerHTML = '<div class="detail-panel"><p>Search for a city to see your forecast.</p></div>';
    return;
  }
  if (name === "hourly") {
    const hours = state.weather.forecast.list.slice(0, 8);
    container.innerHTML = `<div class="detail-panel"><h2>Next 24 hours in ${escapeHtml(state.location.name)}</h2><p>Temperature, rain chance, and conditions every three hours.</p><div class="hourly-list">${hours.map((item, index) => {
      const time = index ? dateTime(item.dt, timezoneFor(state.weather.current), { weekday: "short", hour: "numeric" }) : "Now";
      const kind = weatherKind(item.weather[0].description);
      return `<div class="hour-item"><span class="hour-time">${time}</span>${iconMarkup(kind, new Date(item.dt * 1000).getHours())}<span class="rain-percent">${Math.round((item.pop || 0) * 100)}% rain</span><b class="hour-temp">${degrees(item.main.temp)}</b></div>`;
    }).join("")}</div></div><div class="detail-panel"><h2>Temperature trend</h2><p>Forecast temperatures in ${state.unit === "C" ? "Celsius" : "Fahrenheit"}.</p><div class="chart-wrap"><canvas id="detail-chart" style="width:100%;height:140px" aria-label="Hourly temperature forecast"></canvas></div></div>`;
    lucide.createIcons();
    requestAnimationFrame(() => drawDetailChart(hours));
    return;
  }
  if (name === "weekly") {
    container.innerHTML = `<div class="detail-panel"><h2>The next five days</h2><p>Daily conditions and temperature range for ${escapeHtml(state.location.name)}.</p><div class="weekly-list">${state.days.map((day, index) => `<div class="day-row"><span class="day-name">${index === 0 ? "Today" : dateTime(day.date, timezoneFor(state.weather.current), { weekday: "long" })}</span>${iconMarkup(day.kind)}<span class="day-range"><span>Low ${degrees(day.low)}</span><span>High ${degrees(day.high)}</span></span><span class="day-rain">${day.rain ? `💧 ${day.rain}%` : ""}</span></div>`).join("")}</div></div><div class="detail-panel"><h2>Forecast notes</h2><p>${escapeHtml($("#weather-tip").textContent)}</p><div class="recommendation"><div class="recommend-icon"><i data-lucide="sparkles"></i></div><div><b>${escapeHtml($("#tip-title").textContent)}</b><p>Check back as conditions update throughout the day.</p></div></div></div>`;
    lucide.createIcons();
    return;
  }
  if (name === "air") {
    if (!state.air) {
      container.innerHTML = '<div class="detail-panel"><h2>Air quality data unavailable</h2><p>Air quality is temporarily unavailable for this location. Please try again later.</p></div>';
      return;
    }
    const item = state.air.list[0];
    container.innerHTML = `<div class="detail-panel"><h2>Air quality in ${escapeHtml(state.location.name)}</h2><p>Updated with the latest readings from OpenWeather.</p><div class="detail-aqi-big"><strong>${item.main.aqi}</strong><span>${aqiNames[item.main.aqi - 1]}<small>Air Quality Index</small></span></div><p>${escapeHtml($("#aqi-description").textContent)}</p></div><div class="detail-panel"><h2>Pollutant levels</h2><p>Concentration in μg/m³.</p><div class="air-pollutants" style="flex-wrap:wrap;gap:17px;margin-top:20px">${Object.entries(item.components).map(([key, value]) => `<span>${escapeHtml(key.toUpperCase())} <b>${Number(value).toFixed(2)}</b></span>`).join("")}</div></div>`;
    return;
  }
  if (name === "favorites") {
    container.innerHTML = state.favorites.length
      ? `<div class="detail-panel"><h2>Your favorite cities</h2><p>Tap a city to see its latest weather.</p>${state.favorites.map((place, index) => `<div class="favorite-city"><button class="favorite-open" data-index="${index}">${escapeHtml(place.name)}${place.state ? `, ${escapeHtml(place.state)}` : ""} <small>${escapeHtml(place.country || "")}</small></button><button class="favorite-remove" data-index="${index}" aria-label="Remove ${escapeHtml(place.name)}"><i data-lucide="heart-off"></i></button></div>`).join("")}</div>`
      : '<div class="detail-panel empty-state"><i data-lucide="heart"></i><b>Your favorite places, all in one sky.</b><p>Search for a city and tap the heart to save it here.</p></div>';
    lucide.createIcons();
    return;
  }
  if (name === "settings") {
    container.innerHTML = `<div class="detail-panel"><h2>Appearance</h2><p>Make SkyCast feel like your kind of sky.</p><div class="favorite-city"><span>Color theme <small>${document.body.classList.contains("light-mode") ? "Light" : "Dark"} mode</small></span><button data-setting="theme" aria-label="Toggle color theme"><i data-lucide="${document.body.classList.contains("light-mode") ? "sun" : "moon"}"></i></button></div><div class="favorite-city"><span>Temperature units <small>Currently ${state.unit === "C" ? "Celsius (°C)" : "Fahrenheit (°F)"}</small></span><button data-setting="unit" aria-label="Switch temperature unit"><b>°${state.unit === "C" ? "F" : "C"}</b></button></div></div><div class="detail-panel"><h2>Your data</h2><p>Favorites and recent searches are stored in this browser only.</p><div class="favorite-city"><span>Recent searches <small>${state.recents.length} ${state.recents.length === 1 ? "city" : "cities"} saved</small></span><button data-setting="clear-recents">Clear</button></div><div class="favorite-city"><span>Location access <small>Only used when you choose the location button.</small></span><button data-setting="location" aria-label="Use my location"><i data-lucide="locate-fixed"></i></button></div></div>`;
    lucide.createIcons();
  }
}

function drawDetailChart(items) {
  const canvas = $("#detail-chart");
  if (!canvas) return;
  const width = canvas.clientWidth || 400;
  const height = 130;
  const ratio = window.devicePixelRatio || 1;
  canvas.width = width * ratio;
  canvas.height = height * ratio;
  const ctx = canvas.getContext("2d");
  ctx.scale(ratio, ratio);
  const values = items.map(item => toDisplay(item.main.temp));
  const min = Math.min(...values) - 3;
  const max = Math.max(...values) + 3;
  const points = values.map((value, index) => ({ x: index * width / Math.max(1, values.length - 1), y: height - 14 - (value - min) / Math.max(1, max - min) * (height - 35) }));
  ctx.beginPath();
  points.forEach((point, index) => index ? ctx.lineTo(point.x, point.y) : ctx.moveTo(point.x, point.y));
  ctx.strokeStyle = "#ac92f5";
  ctx.lineWidth = 2.5;
  ctx.stroke();
  points.forEach((point, index) => {
    ctx.beginPath(); ctx.arc(point.x, point.y, 3, 0, Math.PI * 2); ctx.fillStyle = "#d1c4ff"; ctx.fill();
    ctx.fillStyle = "#9c9eac"; ctx.font = "10px DM Sans"; ctx.textAlign = index === 0 ? "left" : index === points.length - 1 ? "right" : "center";
    ctx.fillText(`${Math.round(values[index])}° · ${dateTime(items[index].dt, timezoneFor(state.weather.current), { hour: "numeric" })}`, point.x, point.y - 9);
  });
}

async function requestLocation() {
  if (!navigator.geolocation) { showToast("Location isn't available in this browser."); return; }
  showToast("Finding your location...");
  navigator.geolocation.getCurrentPosition(
    position => loadLocation({ name: "Your location", country: "", lat: position.coords.latitude, lon: position.coords.longitude }, "gps"),
    error => showToast(error.code === 1 ? "Location permission was denied." : "We couldn't find your location. Try searching for a city."),
    { timeout: 10000, maximumAge: 300000 }
  );
}

function escapeForShare() {
  const current = state.weather.current;
  const text = `It’s ${degrees(current.main.temp)} and ${current.weather[0].description} in ${state.location.name}. ${current.main.humidity}% humidity, winds ${Math.round(current.wind.speed * 3.6)} km/h. See beyond the clouds with SkyCast.`;
  if (navigator.share) navigator.share({ title: "SkyCast Weather", text }).catch(() => {});
  else if (navigator.clipboard) navigator.clipboard.writeText(text).then(() => showToast("Weather copied to your clipboard.")).catch(() => showToast(text));
  else showToast(text);
}

function setTheme() {
  const light = storage.read("skycast-theme", "dark") === "light";
  document.body.classList.toggle("light-mode", light);
  $("#theme-toggle").innerHTML = `<i data-lucide="${light ? "moon" : "sun"}"></i>`;
  $("#theme-toggle").setAttribute("aria-label", light ? "Switch to dark mode" : "Switch to light mode");
}

function wireEvents() {
  $("#city-search").addEventListener("input", event => {
    clearTimeout(searchTimer);
    searchTimer = setTimeout(() => searchCities(event.target.value), 300);
  });
  $("#city-search").addEventListener("keydown", event => {
    if (event.key === "Escape") hideSearchResults();
    if (event.key === "Enter") {
      const first = $("#search-results .search-result[data-index]");
      if (first) first.click();
      else if (event.target.value.trim().length >= 2) searchCities(event.target.value);
    }
  });
  $("#search-results").addEventListener("click", event => {
    const button = event.target.closest("[data-index]");
    if (!button) return;
    const place = $("#search-results")._places?.[Number(button.dataset.index)];
    if (place) {
      $("#city-search").value = "";
      loadLocation(place);
      showView("home");
    }
  });
  document.addEventListener("click", event => {
    if (!event.target.closest(".search-wrap")) hideSearchResults();
  });
  $$(".nav-link[data-view]").forEach(link => link.addEventListener("click", () => showView(link.dataset.view)));
  $$("[data-open-view]").forEach(button => button.addEventListener("click", () => showView(button.dataset.openView)));
  $("#weekly-arrow").addEventListener("click", () => showView("weekly"));
  $("#favorite-button").addEventListener("click", () => {
    if (!state.location) return;
    if (isFavorite(state.location)) state.favorites = state.favorites.filter(item => !(item.lat === state.location.lat && item.lon === state.location.lon));
    else state.favorites = [state.location, ...state.favorites].slice(0, 10);
    storage.write("skycast-favorites", state.favorites);
    $("#favorite-count").textContent = state.favorites.length;
    $("#favorite-button").classList.toggle("saved", isFavorite(state.location));
    showToast(isFavorite(state.location) ? "Added to your favorite cities." : "Removed from your favorites.");
    if (state.activeView === "favorites") renderDetail("favorites");
  });
  $("#detail-content").addEventListener("click", event => {
    const open = event.target.closest(".favorite-open");
    const remove = event.target.closest(".favorite-remove");
    if (open) {
      const place = state.favorites[Number(open.dataset.index)];
      if (place) { loadLocation(place); showView("home"); }
    } else if (remove) {
      state.favorites.splice(Number(remove.dataset.index), 1);
      storage.write("skycast-favorites", state.favorites);
      $("#favorite-count").textContent = state.favorites.length;
      renderDetail("favorites");
    }
  });
  $("#location-button").addEventListener("click", requestLocation);
  $("#unit-toggle").addEventListener("click", () => {
    state.unit = state.unit === "C" ? "F" : "C";
    storage.write("skycast-unit", state.unit);
    $("#unit-toggle").textContent = `°${state.unit}`;
    if (state.weather) updateTemperatureDisplay();
    if (state.activeView !== "home") renderDetail(state.activeView);
  });
  $("#theme-toggle").addEventListener("click", () => {
    const next = document.body.classList.contains("light-mode") ? "dark" : "light";
    storage.write("skycast-theme", next);
    setTheme();
    lucide.createIcons();
  });
  $("#share-button").addEventListener("click", () => state.weather ? escapeForShare() : showToast("Load a city forecast before sharing."));
  $("#detail-content").addEventListener("click", event => {
    const setting = event.target.closest("[data-setting]")?.dataset.setting;
    if (setting === "theme") {
      const next = document.body.classList.contains("light-mode") ? "dark" : "light";
      storage.write("skycast-theme", next);
      setTheme();
      lucide.createIcons();
      renderDetail("settings");
    } else if (setting === "unit") {
      $("#unit-toggle").click();
      renderDetail("settings");
    } else if (setting === "clear-recents") {
      state.recents = [];
      storage.write("skycast-recents", state.recents);
      showToast("Recent searches cleared.");
      renderDetail("settings");
    } else if (setting === "location") {
      requestLocation();
    }
  });
  document.addEventListener("keydown", event => {
    if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
      event.preventDefault();
      $("#city-search").focus();
    }
  });
  window.addEventListener("resize", () => { if (state.weather) drawChart(state.weather.forecast.list.slice(0, 8)); });
}

async function start() {
  lucide.createIcons();
  wireEvents();
  setTheme();
  lucide.createIcons();
  $("#unit-toggle").textContent = `°${state.unit}`;
  $("#favorite-count").textContent = state.favorites.length;
  $("#breadcrumb-city").textContent = "Overview";
  const defaultLocation = { name: "New York", state: "New York", country: "US", lat: 40.7128, lon: -74.006 };
  await loadLocation(state.recents[0] || defaultLocation, "initial");
}

start();
