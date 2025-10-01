// /api/m3u8-proxy.js - itzzzme/m3u8proxy Adapted for Vercel (HLS-Only, Auth Passthrough)
const { URL } = require('url');

const PUBLIC_URL = process.env.PUBLIC_URL || 'http://localhost:3000';
const ALLOWED_ORIGINS = (process.env.ALLOWED_ORIGINS || '').split(',').map(o => o.trim());

// Rate-limiter from repo's createRateLimitChecker.js (IP-based, in-memory for serverless)
const rateLimits = new Map();
function checkRateLimit(ip) {
  const now = Date.now();
  const window = parseInt(process.env.RATE_LIMIT_WINDOW || '60') * 1000;
  const max = parseInt(process.env.RATE_LIMIT_MAX || '100');
  let userLimits = rateLimits.get(ip) || [];
  userLimits = userLimits.filter(ts => now - ts < window);
  if (userLimits.length >= max) throw new Error('Rate limit exceeded');
  userLimits.push(now);
  rateLimits.set(ip, userLimits);
}

// CORS from withCORS.js
function addCORS(res) {
  res.setHeader('Access-Control-Allow-Origin', ALLOWED_ORIGINS[0] || '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, HEAD');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Cookie');
  return res;
}

// Host validation from isValidHostName.js
function isValidHost(host) {
  return !/^(10\.|127\.|172\.(1[6-9]|2[0-9]|3[01])\.|192\.168\.)/.test(host) && !host.endsWith('.local');
}

// Fetch from proxyRequest.js (with UA/Cookie passthrough)
async function proxyRequest(targetUrl, req) {
  const ip = req.headers['x-forwarded-for'] || 'unknown';
  checkRateLimit(ip);
  try {
    const response = await fetch(targetUrl, {
      method: req.method,
      headers: {
        'User-Agent': req.headers['user-agent'] || 'Mozilla/5.0',
        'Cookie': req.headers['cookie'] || '', // Auth passthrough for authCookie
      },
    });
    if (!response.ok) throw new Error(`Upstream: ${response.status}`);
    return response;
  } catch (err) {
    console.error(err);
    throw err;
  }
}

// Manifest rewrite from proxyM3U8.js (regex for relative/absolute URIs)
function rewriteManifest(body, baseUrl) {
  const parsedBase = new URL(baseUrl);
  return body
    .replace(/^(?!#)([^#\n]*\.ts)/gm, (match, uri) => {
      if (!uri.startsWith('http')) {
        const absUri = new URL(uri, baseUrl).href;
        return `${PUBLIC_URL}/api/ts-proxy?url=${encodeURIComponent(absUri)}`;
      }
      return match;
    })
    .replace(/^(?!#)([^#\n]*\.m3u8)/gm, (match, uri) => {
      if (!uri.startsWith('http')) {
        const absUri = new URL(uri, baseUrl).href;
        return `${PUBLIC_URL}/api/m3u8-proxy?url=${encodeURIComponent(absUri)}`;
      }
      return match;
    });
}

module.exports = async (req, res) => {
  addCORS(res);

  const urlParam = req.query.url;
  if (!urlParam) return res.status(400).end('Missing url param');

  const targetUrl = decodeURIComponent(urlParam);
  const parsed = new URL(targetUrl);
  if (!isValidHost(parsed.host)) return res.status(403).end('Invalid host');

  const isHLS = parsed.pathname.endsWith('.m3u8');
  if (!isHLS) return res.status(400).end('Only M3U8 manifests supported here');

  try {
    const upstream = await proxyRequest(targetUrl, req);
    res.status(upstream.status);

    const body = await upstream.text();
    const rewritten = rewriteManifest(body, targetUrl);
    res.setHeader('Cache-Control', 'public, max-age=5');
    res.type('application/vnd.apple.mpegurl').send(rewritten);
  } catch (err) {
    res.status(500).end('Proxy failed');
  }
};
