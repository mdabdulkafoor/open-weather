require("dotenv").config();

const express = require("express");
const path = require("path");

const app = express();
const port = Number(process.env.PORT) || 3000;
const apiKey = process.env.OPENWEATHER_API_KEY;
const apiBase = "https://api.openweathermap.org";
const publicDirectory = path.join(__dirname, "public");

app.disable("x-powered-by");
app.use(express.static(publicDirectory));

async function openWeather(pathname, query) {
  if (!apiKey) {
    const error = new Error("Weather service is not configured. Add OPENWEATHER_API_KEY to your environment.");
    error.status = 503;
    throw error;
  }

  const url = new URL(pathname, apiBase);
  url.search = new URLSearchParams({ ...query, appid: apiKey }).toString();

  let response;
  try {
    response = await fetch(url, { signal: AbortSignal.timeout(10000) });
  } catch {
    const error = new Error("Weather service is temporarily unreachable. Please try again.");
    error.status = 502;
    throw error;
  }

  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(
      response.status === 404
        ? "We couldn't find that city. Check the spelling and try again."
        : body.message || "The weather service couldn't complete your request."
    );
    error.status = response.status === 404 ? 404 : 502;
    throw error;
  }
  return body;
}

app.get("/api/geocode", async (req, res) => {
  const q = String(req.query.q || "").trim();
  if (q.length < 2 || q.length > 100) {
    return res.status(400).json({ error: "Enter at least two characters to search." });
  }
  try {
    const results = await openWeather("/geo/1.0/direct", { q, limit: "5" });
    res.json(results);
  } catch (error) {
    res.status(error.status || 500).json({ error: error.message });
  }
});

app.get("/api/weather", async (req, res) => {
  const lat = Number(req.query.lat);
  const lon = Number(req.query.lon);
  if (!Number.isFinite(lat) || !Number.isFinite(lon) || Math.abs(lat) > 90 || Math.abs(lon) > 180) {
    return res.status(400).json({ error: "A valid location is required." });
  }

  try {
    const [current, forecast] = await Promise.all([
      openWeather("/data/2.5/weather", { lat: String(lat), lon: String(lon), units: "metric" }),
      openWeather("/data/2.5/forecast", { lat: String(lat), lon: String(lon), units: "metric" })
    ]);
    res.json({ current, forecast });
  } catch (error) {
    res.status(error.status || 500).json({ error: error.message });
  }
});

app.get("/api/air-quality", async (req, res) => {
  const lat = Number(req.query.lat);
  const lon = Number(req.query.lon);
  if (!Number.isFinite(lat) || !Number.isFinite(lon) || Math.abs(lat) > 90 || Math.abs(lon) > 180) {
    return res.status(400).json({ error: "A valid location is required." });
  }
  try {
    const air = await openWeather("/data/2.5/air_pollution", { lat: String(lat), lon: String(lon) });
    res.json(air);
  } catch (error) {
    res.status(error.status || 500).json({ error: error.message });
  }
});

app.get("*", (_req, res) => res.sendFile(path.join(publicDirectory, "index.html")));

app.listen(port, () => {
  console.log(`SkyCast is ready at http://localhost:${port}`);
  if (!apiKey) console.warn("Set OPENWEATHER_API_KEY in your environment to enable live weather.");
});
