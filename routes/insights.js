const express = require('express');
const fetch = (...args) => import('node-fetch').then(({ default: fetch }) => fetch(...args));
require('dotenv').config();

const router = express.Router();

function buildHTML(summary, destination) {
  return `
    <div class="ai-summary-box">
      <h2 style="color: #33577e; font-size: 26px; margin-bottom: 15px;">
        Expert Travel Insights for ${destination.toLowerCase()}
      </h2>

      <h4 style="color: #ffa500;"> Must-Do Activities</h4>
      <ul>${summary.must_do.map(item => `<li>${item}</li>`).join('')}</ul>

      <h4 style="color: #ffa500;"> Hidden Gem</h4>
      <p>${summary.hidden_gem}</p>

      <h4 style="color: #ffa500;"> Local Tips & Cultural Advice</h4>
      <ul>${summary.local_tips.map(item => `<li>${item}</li>`).join('')}</ul>

      <h4 style="color: #ffa500;"> Best Food to Eat</h4>
      <p>${summary["best_food to eat"]}</p>

      
    </div>
  `;
}

router.get('/', async (req, res) => {
  const destination = req.query.destination;
  if (!destination) return res.status(400).json({ success: false, error: 'Destination is required.' });

  try {
    const searchURL = `https://www.googleapis.com/customsearch/v1?q=things to do in ${encodeURIComponent(destination)} site:thrillophilia.com&key=${process.env.MAPS_BACKEND_KEY}&cx=${process.env.GOOGLE_CSE_ID}`;
    const searchRes = await fetch(searchURL);
    const searchData = await searchRes.json();
    const items = searchData.items || [];

    const bestMatch = items.find(i => i.link.includes('thrillophilia.com')) || items[0];
    if (!bestMatch) return res.json({ success: false, error: 'No links found.' });

const prompt = `
You're a travel expert. Summarize this blog about ${destination}:

${bestMatch.link}

Use this format (fill missing parts using your own knowledge):

MUST-DO (Give some unique must to do things, if not continue with general response):
- ...
- ...

HIDDEN GEM:
...

LOCAL TIPS:
- ...
- ...

BEST FOOD TO EAT:
...

Return only plain text in that format.

`.trim();

const parseInsights = (text) => {
  const lines = text.split('\n');
  const summary = {
    must_do: [],
    hidden_gem: '',
    local_tips: [],
    "best_food to eat": '' // Note: this should match the key used in buildHTML
  };

  let current = '';

  for (const line of lines) {
    if (line.startsWith('MUST-DO:')) current = 'must_do';
    else if (line.startsWith('HIDDEN GEM:')) current = 'hidden_gem';
    else if (line.startsWith('LOCAL TIPS:')) current = 'local_tips';
    else if (line.startsWith('BEST FOOD TO EAT:')) current = 'best_food_to_eat';
    else if (line.startsWith('-') && current === 'must_do') summary.must_do.push(line.slice(1).trim());
    else if (line.startsWith('-') && current === 'local_tips') summary.local_tips.push(line.slice(1).trim());
    else if (current === 'hidden_gem') summary.hidden_gem += line.trim() + ' ';
    else if (current === 'best_food_to_eat') summary["best_food to eat"] += line.trim() + ' ';
  }

  // Clean up the strings
  summary.hidden_gem = summary.hidden_gem.trim();
  summary["best_food to eat"] = summary["best_food to eat"].trim();
  
  return summary;
};


const aiRes = await fetch("https://api.groq.com/openai/v1/chat/completions", {
  method: "POST",
  headers: {
    "Content-Type": "application/json",
    Authorization: `Bearer ${process.env.GROQ_API_KEY}`
  },
  body: JSON.stringify({
    model: "llama3-8b-8192",
    messages: [{ role: "user", content: prompt }],
    temperature: 0.7,
    max_tokens: 900
  })
});

const aiData = await aiRes.json();
const content = aiData?.choices?.[0]?.message?.content;

if (!content || typeof content !== 'string') {
  console.error("❌ AI returned empty or invalid response");
  return res.status(500).json({ success: false, error: "AI returned empty response" });
}


const summary = parseInsights(content.trim());

// console.log("✅ Raw AI Response:", content);

res.json({ success: true, html: buildHTML(summary, destination, bestMatch.link) });

  } catch (err) {
    console.error("Insight error:", err.message);
    res.status(500).json({ success: false, error: 'Server error while generating insights.' });
  }
});

module.exports = router;
