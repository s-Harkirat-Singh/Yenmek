const express = require("express");
const cors = require("cors");
const path = require("path");
const puppeteer = require("puppeteer");

// Load environment variables FIRST with explicit path
require("dotenv").config({ path: path.resolve(__dirname, '.env') });

// Import routes
const itineraryRoute = require("./routes/itinerary");

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
  res.sendFile(path.join(__dirname, "public", "modern-design.html"));
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




app.get("/api/hotels", async (req, res) => {
  const { location, destination, city } = req.query;

  if (!location || !destination || !city) {
    return res.status(400).json({ error: "Location, Destination, and City context are required" });
  }

  const googleApiKey = process.env.MAPS_BACKEND_KEY;
  if (!googleApiKey) {
    return res.status(500).json({ error: "Google Maps API key not configured on backend." });
  }

  let browser;
  try {
    // Step 1: Use Google Places API Text Search to find hotels NEAR the specific location, but within the destination city
    const findPlaceUrl = `https://maps.googleapis.com/maps/api/place/textsearch/json?query=hotels in ${encodeURIComponent(city)}&fields=name,rating,user_ratings_total,photos&key=${googleApiKey}`;
    const googleResponse = await axios.get(findPlaceUrl);
    const googlePlaces = googleResponse.data.results;

    if (!googlePlaces || googlePlaces.length === 0) {
  // If the specific city search fails, fall back to the overall destination
  const fallbackUrl = `https://maps.googleapis.com/maps/api/place/textsearch/json?query=hotels in ${encodeURIComponent(destination)}&fields=name,rating,user_ratings_total,photos&key=${googleApiKey}`;
  const fallbackResponse = await axios.get(fallbackUrl);
  const fallbackPlaces = fallbackResponse.data.results;
  if (!fallbackPlaces || fallbackPlaces.length === 0) {
      return res.json([]);
  }
  // Return the fallback results, formatted similarly to the primary results
  return res.json(fallbackPlaces.slice(0, 5).map(place => ({
      name: place.name,
      reviews: `${place.rating || 'N/A'} (${place.user_ratings_total || 0} reviews)`,
      image: place.photos?.[0] ? `https://maps.googleapis.com/maps/api/place/photo?maxwidth=400&photoreference=${place.photos[0].photo_reference}&key=${googleApiKey}` : 'https://placehold.co/280x160/E0E0E0/666666?text=No+Image',
      link: '',
      price: 'N/A'
  })));
}

    const hotelsWithGoogleInfo = [];
    const maxHotelsToProcess = 5;
    for (let i = 0; i < Math.min(googlePlaces.length, maxHotelsToProcess); i++) {
      const place = googlePlaces[i];
      const imageUrl = place.photos && place.photos.length > 0 ? 
                       `https://maps.googleapis.com/maps/api/place/photo?maxwidth=400&photoreference=${place.photos[0].photo_reference}&key=${googleApiKey}` : 
                       'https://placehold.co/280x160/E0E0E0/666666?text=No+Image';

      hotelsWithGoogleInfo.push({
        name: place.name,
        reviews: `${place.rating || 'N/A'} (${place.user_ratings_total || 0} reviews)`, 
        image: imageUrl,
        link: '',
        price: 'N/A'
      });
    }

    // Step 2: Use Puppeteer to get Booking.com links for each hotel
    browser = await puppeteer.launch({ headless: true, args: ["--no-sandbox", "--disable-setuid-sandbox"] });
    const finalHotels = [];
    const bookingComAffiliateId = 'YOUR_BOOKING_COM_AFFILIATE_ID';

    for (const hotel of hotelsWithGoogleInfo) {
      const page = await browser.newPage();
      await page.setUserAgent("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36");

      const today = new Date();
      const tomorrow = new Date(today);
      const dayAfter = new Date(today);
      tomorrow.setDate(today.getDate() + 1);
      dayAfter.setDate(today.getDate() + 2);
      const formatDate = (date) => `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}-${String(date.getDate()).padStart(2,'0')}`;

      // This is the key change: Search for the hotel name AND the destination city/country
      const bookingSearchUrl = `https://www.booking.com/searchresults.html?ss=${encodeURIComponent(`${hotel.name}, ${destination}`)}&checkin=${formatDate(tomorrow)}&checkout=${formatDate(dayAfter)}&group_adults=2&no_rooms=1`;

      try {
        await page.goto(bookingSearchUrl, { waitUntil: "networkidle2", timeout: 60000 });
        await page.waitForSelector('[data-testid="property-card"]', { timeout: 15000 }).catch(() => {});
        await new Promise(resolve => setTimeout(resolve, 3000)); 

        const bookingData = await page.evaluate((hotelName) => {
          let link = '';
          const hotelCard = document.querySelector('[data-testid="property-card"]');
          if (hotelCard) {
            const linkElement = hotelCard.querySelector('a');
            if (linkElement) {
              link = linkElement.href;
            }
          }
          return { link };
        }, hotel.name);

        if (bookingData.link) {
            const url = new URL(bookingData.link);
            url.searchParams.set('aid', bookingComAffiliateId);
            hotel.link = url.toString();
        }
      } catch (scrapeError) {
        console.warn(`❌ Failed to get Booking.com data for ${hotel.name}:`, scrapeError.message);
      } finally {
        await page.close();
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
      finalHotels.push(hotel);
    }

    res.json(finalHotels);
  } catch (err) {
    console.error("❌ Major Hotels API error:", err); 
    res.status(500).json({ error: "Failed to fetch hotels" });
  } finally {
    if (browser) {
      await browser.close(); 
    }
  }
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