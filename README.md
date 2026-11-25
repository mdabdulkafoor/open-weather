# SkyCast — See Beyond the Clouds

A responsive weather dashboard built with HTML, CSS, browser JavaScript, and a small Express server. The server keeps the OpenWeather API key private and proxies geocoding, current weather, five-day forecast, and air-quality requests.

## Requirements

- Node.js 18.17 or newer (the server uses Node's built-in `fetch`)
- An OpenWeatherMap API key with access to Current Weather, 5 Day / 3 Hour Forecast, Geocoding, and Air Pollution

## Setup

1. Install dependencies:

   ```sh
   npm install
   ```

2. Copy `.env.example` to `.env` and add your API key:

   ```env
   OPENWEATHER_API_KEY=your_real_api_key
   PORT=3000
   ```

   `.env` is ignored by Git. Set `OPENWEATHER_API_KEY` and `PORT` in your hosting provider's environment settings when deploying.

3. Start the server:

   ```sh
   npm start
   ```

4. Open [http://localhost:3000](http://localhost:3000).

For automatic server restarts during development, use `npm run dev`.

## Features

- Live conditions, feels-like, daily high/low, humidity, wind, pressure, visibility, and sunrise/sunset
- City search with geocoded suggestions and browser geolocation
- Three-hour forecast for the next 24 hours, five-day forecast, and a temperature chart
- Live Air Quality Index and pollutant details
- Favorite cities and recent searches saved in browser local storage
- Celsius/Fahrenheit, light/dark theme, weather-based advice, and share
- Responsive dashboard and dedicated forecast, air-quality, and favorites views

The initial city is New York unless a recent search exists. Location access requires the user's permission and a secure context (localhost or HTTPS).
