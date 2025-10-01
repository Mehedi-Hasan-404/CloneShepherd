// /api/ts-proxy.js - TS Segment Proxy (from itzzzme/m3u8proxy proxyTS.js)
const { URL } = require('url');

// Reuse functions from m3u8-proxy.js (copy or import if modular)
const addCORS = (res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, HEAD');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Cookie');
  return res;
};

function isValidHost(host) {
  return !/^(10\.|127\.|172\.(1[6-9]|2[0-9]|3[01])\.|192\.168\.)/.test(host) && !host.endsWith('.local');
}

async function proxyRequest(targetUrl, req) {
  // Copy rate-limit/check from m3u8-proxy.js
  const ip = req.headers['x-forwarded-for'] || 'unknown';
  // ... (rateLimit code here)
  try {
    const response = await fetch(targetUrl, {
      method: req.method,
      headers: {
        'User-Agent': req.headers['user-agent'] || 'Mozilla/5.0',
        'Cookie': req.headers['cookie'] || '',
      },
    });
    if (!response.ok) throw new Error(`Upstream: ${response.status}`);
    return response;
  } catch (err) {
    throw err;
  }
}

module.exports = async (req, res) => {
  addCORS(res);

  const urlParam = req.query.url;
  if (!urlParam) return res.status(400).end('Missing url param');

  const targetUrl = decodeURIComponent(urlParam);
  const parsed = new URL(targetUrl);
  if (!isValidHost(parsed.host)) return res.status(403).end('Invalid host');

  if (!parsed.pathname.endsWith('.ts')) return res.status(400).end('Only TS segments supported');

  try {
    const upstream = await proxyRequest(targetUrl, req);
    res.status(upstream.status);
    upstream.headers.forEach((v, k) => res.setHeader(k, v));
    res.type('video/mp2t');
    upstream.body.pipe(res);
  } catch (err) {
    res.status(500).end('Proxy failed');
  }
};
