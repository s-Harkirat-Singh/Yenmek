const express = require("express");
const cors = require("cors");
const path = require("path");

// Load environment variables FIRST with explicit path
require("dotenv").config({ path: path.resolve(__dirname, '.env') });

// Import routes
const itineraryRoute = require("./routes/itinerary");
// const redditRoute = require('./routes/reddit');
const app = express();
const PORT = process.env.PORT || 5000;
const thrillophiliaRoute = require('./routes/thrillophilia');
const insightRoute = require('./routes/insights');

// Enhanced logging
console.log("=== SERVER STARTUP ===");
console.log("Timestamp:", new Date().toISOString());
console.log("Node Version:", process.version);
console.log("Environment:", process.env.NODE_ENV || 'development');
console.log("Port:", PORT);
console.log("Working Directory:", process.cwd());
console.log("Env file path:", path.resolve(__dirname, '.env'));

// Check if .env file exists
const fs = require('fs');
const envPath = path.resolve(__dirname, '.env');
console.log("Env file exists:", fs.existsSync(envPath) ? "✅ Yes" : "❌ No");

if (fs.existsSync(envPath)) {
  const envContent = fs.readFileSync(envPath, 'utf8');
  const lines = envContent.split('\n').filter(line => line.trim() && !line.startsWith('#'));
  console.log("Env file contains", lines.length, "configuration lines");
  
  // Check for required variables without exposing values
  const hasGroqKey = envContent.includes('GROQ_API_KEY=');
  const hasPexelsKey = envContent.includes('PEXELS_API_KEY=');
  console.log("GROQ_API_KEY found in .env:", hasGroqKey ? "✅ Yes" : "❌ No");
  console.log("PEXELS_API_KEY found in .env:", hasPexelsKey ? "✅ Yes" : "❌ No");
}
console.log("======================");

// Middleware
app.use(cors({
  origin: process.env.FRONTEND_URL || "*", // Allow all origins in development
  credentials: true
}));

app.use(express.static(path.join(__dirname, 'public')));



app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Request logging middleware
app.use((req, res, next) => {
  console.log(`${new Date().toISOString()} - ${req.method} ${req.originalUrl}`);
  if (req.method === 'POST') {
    console.log("Request body keys:", Object.keys(req.body || {}));
  }
  next();
});

// Routes
app.use("/api/itinerary", itineraryRoute);
// app.use('/api/reddit-summary', redditRoute);
app.use('/api/thrillophilia-links', thrillophiliaRoute);
app.use('/api/insights', insightRoute);
// Root endpoint with comprehensive information


// app.get("/", (req, res) => {
//   const serverInfo = {
//     message: "Travel Itinerary API Server",
//     status: "Running",
//     timestamp: new Date().toISOString(),
//     version: "1.0.0",
//     endpoints: {
//       itinerary: "POST /api/itinerary",
//       health: "GET /api/itinerary/health",
//       test: "GET /api/itinerary/test"
//     },
//     documentation: {
//       createItinerary: {
//         method: "POST",
//         url: "/api/itinerary",
//         body: {
//           destination: "string (required) - The destination city/country",
//           days: "number (required) - Number of days (1-30)"
//         },
//         example: {
//           destination: "Paris, France",
//           days: 5
//         }
//       }
//     },
//     environment: {
//       nodeVersion: process.version,
//       platform: process.platform,
//       uptime: Math.floor(process.uptime())
//     }
//   };

//   res.json(serverInfo);
// });




// Serve index.html at root
app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "modern-sesign.html"));
});


app.get("/config/maps-api-key", (req, res) => {
  res.json({ key: process.env.MAPS_FRONTEND_KEY || "" });
});

const axios = require('axios');

app.get("/api/photo", async (req, res) => {
  const ref = req.query.ref;
  if (!ref) return res.status(400).send("Missing photo reference");

  const apiKey = process.env.MAPS_BACKEND_KEY;

  const url = `https://maps.googleapis.com/maps/api/place/photo?maxwidth=600&photo_reference=${ref}&key=${apiKey}`;

  try {
    const response = await axios({
      method: 'GET',
      url,
      responseType: 'stream',
    });

    res.setHeader('Content-Type', response.headers['content-type']);
    response.data.pipe(res);
  } catch (err) {
    console.error("❌ Error fetching photo:", err.message);
    res.status(500).send("Failed to fetch photo");
  }
});
app.get('/api/reverse-geocode', async (req, res) => {
  const { lat, lng } = req.query;
  const apiKey = process.env.OPENCAGE_API_KEY;

  if (!lat || !lng || !apiKey) {
    return res.status(400).json({ error: 'Missing required parameters' });
  }

  try {
    const url = `https://api.opencagedata.com/geocode/v1/json?q=${lat}+${lng}&key=${apiKey}`;
    const response = await fetch(url);
    const data = await response.json();

    const components = data.results[0]?.components;
    const location = components.city || components.town || components.state || components.country || "India";

    res.json({ location });
  } catch (err) {
    res.status(500).json({ error: 'Reverse geocoding failed', details: err.message });
  }
});


app.get('/api/hotels', async (req, res) => {
  const { location, lat, lng, checkIn, checkOut } = req.query;
  const token = process.env.HOTELLOOK_API_KEY;
console.log("TOKEN FROM ENV:", token);

  if (!checkIn || !checkOut || !token || (!location && (!lat || !lng))) {
    return res.status(400).json({
      error: 'Missing required parameters',
      debug: {
        checkIn,
        checkOut,
        location,
        lat,
        lng,
        tokenExists: !!token
      }
    });
  }
console.log("TOKEN FROM ENV:", token);

  const locationQuery = location ? location : `${lat},${lng}`;
  const url = `https://engine.hotellook.com/api/v2/cache.json?location=${locationQuery}&currency=inr&limit=4&checkIn=${checkIn}&checkOut=${checkOut}&token=${token}`;

  try {
    const response = await fetch(url);
    const data = await response.json();

    if (Array.isArray(data)) return res.json(data);
    if (Array.isArray(data.results)) return res.json(data.results);
    return res.json([]);
  } catch (error) {
    res.status(500).json({ error: 'API fetch failed', details: error.message });
  }
});



// Handle 404 for any other routes
app.use((req, res) => {
  console.log(`404 - Route not found: ${req.method} ${req.originalUrl}`);
  res.status(404).json({
    error: "Route not found",
    success: false,
    requestedPath: req.originalUrl,
    availableEndpoints: [
      "GET /",
      "POST /api/itinerary",
      "GET /api/itinerary/health",
      "GET /api/itinerary/test"
    ],
    timestamp: new Date().toISOString()
  });
});

// Global error handler
app.use((error, req, res, next) => {
  console.error("=== GLOBAL ERROR HANDLER ===");
  console.error("Timestamp:", new Date().toISOString());
  console.error("Request:", req.method, req.originalUrl);
  console.error("Error:", error.message);
  console.error("Stack:", error.stack);
  console.error("==============================");
  
  res.status(error.status || 500).json({
    error: "Internal Server Error",
    success: false,
    message: process.env.NODE_ENV === 'development' ? error.message : 'Something went wrong',
    timestamp: new Date().toISOString()
  });
});

// Graceful shutdown handling
process.on('SIGTERM', () => {
  console.log('SIGTERM received, shutting down Successfully');
  process.exit(0);
});

process.on('SIGINT', () => {
  console.log('SIGINT received, shutting down Successfully');
  process.exit(0);
});

// Unhandled promise rejection handler
process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection at:', promise, 'reason:', reason);
});

// Uncaught exception handler
process.on('uncaughtException', (error) => {
  console.error('Uncaught Exception:', error);
  process.exit(1);
});

// Start server
app.listen(PORT, () => {
  console.log(` Server running on port ${PORT}`);
  // console.log(` API URL: http://localhost:${PORT}`);
  // console.log(` Health Check: http://localhost:${PORT}/api/itinerary/health`);
  // console.log(` Test Endpoint: http://localhost:${PORT}/api/itinerary/test`);
  // console.log(`Documentation: http://localhost:${PORT}/`);
  // console.log(`Started at: ${new Date().toISOString()}`);
});