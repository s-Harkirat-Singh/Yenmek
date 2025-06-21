const express = require('express');
const axios = require('axios');

const router = express.Router();

// Add this route to check your server's public IP
router.get('/check-ip', async (req, res) => {
  try {
    console.log('=== SERVER IP CHECK ===');
    
    // Check IPv4
    try {
      const ipv4Response = await axios.get('https://api.ipify.org?format=json');
      console.log('IPv4 Address:', ipv4Response.data.ip);
    } catch (err) {
      console.log('IPv4 check failed:', err.message);
    }

    // Check IPv6
    try {
      const ipv6Response = await axios.get('https://api6.ipify.org?format=json');
      console.log('IPv6 Address:', ipv6Response.data.ip);
    } catch (err) {
      console.log('IPv6 check failed:', err.message);
    }

    // Alternative IP check
    try {
      const altResponse = await axios.get('https://httpbin.org/ip');
      console.log('Alternative IP check:', altResponse.data);
    } catch (err) {
      console.log('Alternative IP check failed:', err.message);
    }

    res.json({ 
      message: 'Check server console for IP addresses',
      detectedFromError: '2402:8100:2af3:929f:5d5a:5f9f:dc84:7f22'
    });
  } catch (err) {
    console.error('IP check error:', err.message);
    res.status(500).json({ error: 'IP check failed' });
  }
});

// Your existing route with IP logging
router.get('/', async (req, res) => {
  const { destination } = req.query;

  if (!destination) {
    return res.status(400).json({ error: 'Missing destination parameter' });
  }

  // Log request details
  console.log('=== REQUEST INFO ===');
  console.log('Request IP (from req.ip):', req.ip);
  console.log('Request IPs (from req.ips):', req.ips);
  console.log('X-Forwarded-For:', req.headers['x-forwarded-for']);
  console.log('X-Real-IP:', req.headers['x-real-ip']);

  const query = `things to do in ${destination} site:thrillophilia.com`;
  const url = `https://www.googleapis.com/customsearch/v1?q=${encodeURIComponent(query)}&key=${process.env.MAPS_BACKEND_KEY}&cx=${process.env.GOOGLE_CSE_ID}`;

  try {
    const response = await axios.get(url);
    const items = response.data.items || [];

    const links = items
      .filter(i => i.link.includes('thrillophilia.com'))
      .slice(0, 2)
      .map(i => ({
        title: i.title,
        url: i.link,
        snippet: i.snippet
      }));

    res.json({ destination, count: links.length, links });
  } catch (err) {
    console.error('=== ERROR DETAILS ===');
    console.error('Error message:', err.message);
    console.error('Response status:', err.response?.status);
    console.error('Response data:', JSON.stringify(err.response?.data, null, 2));
    
    res.status(500).json({ 
      error: 'Google Search failed',
      details: {
        message: err.message,
        status: err.response?.status,
        data: err.response?.data
      }
    });
  }
});

module.exports = router;