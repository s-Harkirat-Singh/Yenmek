const express = require("express");
const router = express.Router();
const path = require('path');
const fetch = (...args) => import('node-fetch').then(({ default: fetch }) => fetch(...args));

require('dotenv').config({ path: path.resolve(__dirname, '../.env') });


const PEXELS_API_KEY = process.env.PEXELS_API_KEY; 
const GROQ_API_KEY = process.env.GROQ_API_KEY;
const MAPS_FRONTEND_KEY = process.env.MAPS_FRONTEND_KEY; 
const MAPS_BACKEND_KEY = process.env.MAPS_BACKEND_KEY;
// Enhanced Debug: Check if API keys are loaded
// console.log("=== API KEYS DEBUG ===");
// console.log("Pexels API Key loaded:", PEXELS_API_KEY ? "✅ Yes" : "❌ No (Not used for images anymore)");
// console.log("Groq API Key loaded:", GROQ_API_KEY ? "✅ Yes" : "❌ No");
// console.log("Google Maps API Key loaded:", MAPS_FRONTEND_KEY ? "✅ Yes" : "❌ No"); 
// console.log("Google backend key Maps API Key loaded:", MAPS_FRONTEND_KEY ? "✅ Yes" : "❌ No"); 

// console.log("========================");


async function getImagesFromGooglePlaces(locationName, destinationContext) {
  if (!MAPS_FRONTEND_KEY) {
    console.warn("Google Maps API key is not configured - skipping Google image fetch.");
    return [];
  }

  
  let searchQuery = `${locationName}, ${destinationContext}`;
  if (!destinationContext || destinationContext.trim() === '') { 
      searchQuery = locationName;
  }

  // console.log(`Searching Google Places for: ${searchQuery}`);
  const findPlaceUrl = `https://maps.googleapis.com/maps/api/place/findplacefromtext/json?input=${encodeURIComponent(searchQuery)}&inputtype=textquery&fields=photos,place_id&key=${MAPS_BACKEND_KEY}`; 


  try {
    const placeResponse = await fetch(findPlaceUrl);
    if (!placeResponse.ok) {
      const errorText = await placeResponse.text();
      console.error(`Google Find Place API error for "${searchQuery}":`, placeResponse.status, errorText);
     
      if (destinationContext && destinationContext.trim() !== '') {
        // console.log(`Retrying search for "${locationName}" without destination context.`);
        return getImagesFromGooglePlaces(locationName, ''); 
      }
      return [];
    }

    const placeData = await placeResponse.json();

    if (placeData.status !== "OK" || !placeData.candidates || placeData.candidates.length === 0) {
      console.warn(`No place found or error for "${searchQuery}":`, placeData.status, placeData.error_message || '');
      
      if (destinationContext && destinationContext.trim() !== '' && placeData.status !== "ZERO_RESULTS") { 
        // console.log(`Retrying search for "${locationName}" without destination context due to status: ${placeData.status}`);
        return getImagesFromGooglePlaces(locationName, '');
      }
      return [];
    }

    const candidate = placeData.candidates[0];
    if (!candidate.photos || candidate.photos.length === 0) {
      // console.log(`No Google photos found for "${searchQuery}" (Place ID: ${candidate.place_id})`);
      
      if (destinationContext && destinationContext.trim() !== '') {
        // console.log(`Retrying search for "${locationName}" (no photos) without destination context.`);
        return getImagesFromGooglePlaces(locationName, '');
      }
      return [];
    }

    
    const photoReferences = candidate.photos.slice(0, 4);
    const imageUrls = photoReferences.map(photo => {
      // adjustment of maxwidth/maxheight (important) .
      
     return `https://maps.googleapis.com/maps/api/place/photo?maxwidth=400&photoreference=${photo.photo_reference}&key=${MAPS_BACKEND_KEY}`;

    });

    // console.log(`Found ${imageUrls.length} Google Places images for ${searchQuery}`);
    return imageUrls;

  } catch (error) {
    console.error(`Error fetching Google Places images for ${searchQuery}:`, error.message);
    // Fallback attempt 
    if (destinationContext && destinationContext.trim() !== '') {
        // console.log(`Error occurred, retrying search for "${locationName}" without destination context.`);
        return getImagesFromGooglePlaces(locationName, '');
    }
    return [];
  }
}


async function getItineraryFromAI(destination, days) {

  if (!GROQ_API_KEY) {
    throw new Error("Groq API key is not configured. Please check your .env file and ensure GROQ_API_KEY is set.");
  }

  if (!GROQ_API_KEY.startsWith('gsk_')) {
    throw new Error("Invalid Groq API key format. Key should start with 'gsk_'. Please verify your API key.");
  }

//   const prompt = `You are a travel expert planning a ${days}-day itinerary for a traveler visiting ${destination}.

// All locations MUST be strictly within ${destination}. Do not suggest places that exist in other countries, even if they share the same name.

// For each day, suggest 2-3 important and famous locations that should not be missed. For every location, include:
// - The name of the location
// - Why it's important (history, culture, significance)
// - What the user can do there (activities within 2-3 hours)

// Make the descriptions concise but informative - 2-3 sentences maximum.

// Prioritize famous landmarks, cultural experiences, and unique spots. Focus on must-visit places.

// Format your response EXACTLY like this:

// Day 1
// Location: Red Fort
// Description: Historic Mughal fortress and UNESCO World Heritage site. Explore the beautiful architecture, museums, and learn about India's rich history. Spend 2-3 hours walking through the complex.

// Day 1  
// Location: India Gate
// Description: Iconic war memorial and popular gathering spot. Great for evening walks and photography. Visit nearby Rajpath for a complete experience.

// Continue this format for all days...`;
const prompt = `You are a travel expert planning a ${days}-day itinerary for a traveler visiting ${destination}. 
For each day, suggest 2-3 important and famous locations that should not be missed. For every location, include:
- The name of the location
- Why it's important (history, culture, significance)
- What the user can do there (activities within 2-3 hours)

Prioritize famous landmarks, cultural experiences, and unique spots. Focus on must-visit places.

Return each location with its full name including city and country. For example:
"Rock Garden of Chandigarh, Chandigarh, India"

Use specific Google-mappable names for each location. Try to Avoid vague region names. Prefer names that match how they appear in Google Maps or Google Places.


⚠️ IMPORTANT:
- Only include locations INSIDE ${destination}.
- Output must be valid JSON. No markdown, no explanations, no notes.
- Do NOT include places from other countries, even if they have the same name.
- Respond ONLY with a JSON array. Do NOT add "Sure!" or "Here's your itinerary:".

JSON format example:
[
  {
    "day": "Day 1",
    "location": "Hassan II Mosque, country name",
    "description": "One of the largest mosques in the world, located by the Atlantic Ocean. Tourists can admire its architecture and sea views."
  },
  {
    "day": "Day 1",
    "location": "Rick’s Café Casablanca, country name",
    "description": "Inspired by the movie Casablanca, this café recreates the ambiance with Moroccan cuisine and music."
  },
  {
    "day": "Day 2",
    "location": "Chefchaouen (The Blue City), country name",
    "description": "Famous for its vibrant blue-painted streets and buildings. Ideal for walking tours and photography."
  }
]

Now provide a ${days}-day itinerary for ${destination} in that exact JSON format.`;

  try {
    // console.log("Making request to Groq API...");
    const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${GROQ_API_KEY}`,
      },
      body: JSON.stringify({
        model: "llama3-8b-8192",
        messages: [{ role: "user", content: prompt }],
        temperature: 0.7,
        max_tokens: 2000
      })
    });

    // console.log("Groq API Response Status:", response.status);

    if (!response.ok) {
      const errorText = await response.text();
      console.error("Groq API Response Headers:", Object.fromEntries(response.headers.entries()));
      console.error("Groq API Error Response:", errorText);
      if (response.status === 401) {
        throw new Error("Invalid or expired Groq API key. Please verify your API key is correct and active.");
      } else if (response.status === 429) {
        throw new Error("Groq API rate limit exceeded. Please try again in a few minutes.");
      } else {
        throw new Error(`Groq API error: ${response.status} - ${errorText}`);
      }
    }

    const completion = await response.json();
    if (!completion.choices || !completion.choices[0] || !completion.choices[0].message) {
      console.error("Invalid Groq API response structure:", completion);
      throw new Error("Invalid response format from Groq API");
    }
    
    // console.log("✅ Successfully received response from Groq API");
    return completion.choices[0].message.content;
    
  } catch (error) {
    console.error("Error in getItineraryFromAI:", error.message);
    throw error;
  }
}



// function parseItinerary(rawText) {
//   const lines = rawText.split("\n").filter(line => line.trim() !== "");
//   const itinerary = [];
//   let currentDay = "";
//   let currentLocation = "";
//   let description = "";

//   for (let i = 0; i < lines.length; i++) {
//     const line = lines[i].trim();

//     if (/^day\s*\d+/i.test(line)) {
//       currentDay = line;
//     } else if (/^location:/i.test(line)) {
//       if (currentLocation && description && currentDay) {
//         itinerary.push({
//           day: currentDay,
//           location: currentLocation,
//           description: description.trim()
//         });
//       }
//       currentLocation = line.replace(/location:/i, "").trim();
//       description = ""; // reset description
//     } else if (/^description:/i.test(line)) {
//       description = line.replace(/description:/i, "").trim();
//     } else {
//       description += " " + line;
//     }
//   }

//   // Push last one
//   if (currentLocation && description && currentDay) {
//     itinerary.push({
//       day: currentDay,
//       location: currentLocation,
//       description: description.trim()
//     });
//   }

//   console.log(`✅ Parsed ${itinerary.length} locations`);
//   return itinerary;
// }

function parseItinerary(rawText) {
  try {
    const parsed = JSON.parse(rawText);
    
    // Ensure all required fields are present
    const valid = parsed.every(item =>
      item.day && item.location && item.description
    );

    if (!valid) {
      throw new Error("Some entries are missing fields.");
    }

    return parsed;
  } catch (err) {
    console.error("❌ Failed to parse JSON:", err.message);
    return [];
  }
}




// Main route
router.post("/", async (req, res) => {
  try {
    console.log("=== NEW ITINERARY REQUEST ===");
    const { destination, days } = req.body;

    if (!destination || !days) {
      return res.status(400).json({ error: "Destination and number of days are required.", success: false });
    }
    const numDays = parseInt(days);
    if (isNaN(numDays) || numDays <= 0 || numDays > 30) {
      return res.status(400).json({ error: "Days must be a positive number between 1 and 30.", success: false });
    }

    console.log(` Generating ${numDays}-day itinerary for ${destination}...`);
    const rawText = await getItineraryFromAI(destination, numDays);
    const itinerary = parseItinerary(rawText);
    
    if (itinerary.length === 0) {
  return res.status(500).json({ 
    error: "Failed to parse JSON itinerary from AI response. The response may be malformed.",
    success: false,
    rawResponse: rawText.substring(0, 500) + "..."
  });
}

    console.log("Fetching images for all locations using Google Places...");
    for (let i = 0; i < itinerary.length; i++) {
      const item = itinerary[i];
      console.log(`Fetching Google Places images for: ${item.location} (${i + 1}/${itinerary.length})`);
      
      try {
        // Call the new function to get images from Google Places
        // Pass item.location and the overall destination as context
        item.images = await getImagesFromGooglePlaces(item.location, destination);
        
        console.log(`✅ Found ${item.images.length} Google images for ${item.location}`);
      } catch (imageError) {
        console.error(`❌ Failed to fetch Google images for ${item.location}:`, imageError.message);
        item.images = []; // Fallback to empty array
      }
      
      // Optional: Add a small delay to avoid hitting rate limits if processing many locations quickly
      // For Google Places, direct photo URLs don't usually need this as much as sequential API calls,
      // but the Find Place call itself might benefit if you had hundreds of locations.
      if (i < itinerary.length - 1) {
        await new Promise(resolve => setTimeout(resolve, 100)); // 100ms delay
      }
    }

    console.log("✅ Itinerary generation completed successfully");
    res.json({
      success: true,
      destination: destination,
      days: numDays,
      totalLocations: itinerary.length,
      itinerary: itinerary,
      generatedAt: new Date().toISOString()
    });

  } catch (error) {
    console.error("❌ DETAILED ERROR:", error.message, error.stack);
    let statusCode = 500;
    if (error.message.includes("API key") || error.message.includes("401")) statusCode = 401;
    else if (error.message.includes("rate limit") || error.message.includes("429")) statusCode = 429;
    
    res.status(statusCode).json({ 
      error: error.message,
      success: false
    });
  }
});
router.get("/geocode", async (req, res) => {
  const place = req.query.place;
  const key = process.env.MAPS_BACKEND_KEY;

  // console.log("📍 Geocode called for:", place);
  // console.log("🔑 Backend key loaded:", key ? "YES" : "NO");

  if (!place || !key) {
    return res.status(400).json({ error: "Missing place or API key" });
  }

  try {
    const geoRes = await fetch(`https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(place)}&key=${key}`);
    const geoData = await geoRes.json();
    // console.log("📦 Geocoding response:", geoData);

    if (geoData.status !== "OK") {
      return res.status(500).json({ error: geoData.status });
    }

    res.json(geoData);
  } catch (err) {
    console.error("❌ Geocode fetch failed:", err.message);
    res.status(500).json({ error: "Geocoding failed" });
  }
});









// Health check endpoint
router.get("/health", (req, res) => {
  const healthCheck = {
    status: "OK", 
    message: "Itinerary service is running",
    timestamp: new Date().toISOString(),
    apiKeys: {
      groq: GROQ_API_KEY ? "✅ Configured" : "❌ Missing",
      
      googleMaps: MAPS_FRONTEND_KEY ? "✅ Configured" : "❌ Missing"
    }
  };
  res.json(healthCheck);
});



// Test endpoint (remains the same)
router.get("/test", async (req, res) => {
  try {
    const testData = {
      timestamp: new Date().toISOString(),
      apiKeysStatus: {
        groq: { exists: !!GROQ_API_KEY, length: GROQ_API_KEY ? GROQ_API_KEY.length : 0, startsWithGsk: GROQ_API_KEY ? GROQ_API_KEY.startsWith('gsk_') : false },
        // pexels: { exists: !!PEXELS_API_KEY, length: PEXELS_API_KEY ? PEXELS_API_KEY.length : 0 }, // Optional
        googleMaps: { exists: !!MAPS_FRONTEND_KEY, length: MAPS_FRONTEND_KEY ? MAPS_FRONTEND_KEY.length : 0 }
      }
    };
    res.json(testData);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;