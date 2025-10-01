// /api/m3u8-proxy.js - HLS-Only Proxy (Vercel Serverless, with m3u8-parser)
const { URL } = require('url');
const Parser = require('m3u8-parser');

const PUBLIC_URL = process.env.PUBLIC_URL || 'http://localhost:3000';
const ALLOWED_ORIGINS = (process.env.ALLOWED_ORIGINS || '').split(',').map(o => o.trim());

function addCORS(res) {
  res.setHeader('Access-Control-Allow-Origin', ALLOWED_ORIGINS[0] || '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, HEAD');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-Auth-Cookie');
  return res;
}

function isValidHost(host) {
  return !/^(10\.|127\.|172\.(1[6-9]|2[0-9]|3[01])\.|192\.168\.)/.test(host) && !host.endsWith('.local');
}

async function proxyRequest(targetUrl, req) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 10000); // 10s timeout

  try {
    const response = await fetch(targetUrl, {
      method: req.method,
      signal: controller.signal,
      headers: {
        'User-Agent': req.headers['user-agent'] || 'Mozilla/5.0',
        'Cookie': req.headers['x-auth-cookie'] || req.headers['cookie'] || '', // Passthrough authCookie
      },
    });
    clearTimeout(timeoutId);
    if (!response.ok) throw new Error(`Upstream: ${response.status}`);
    return response;
  } catch (err) {
    clearTimeout(timeoutId);
    console.error(err);
    throw err;
  }
}

function rewriteManifest(body, baseUrl) {
  const parser = new Parser();
  parser.push(body);
  parser.end();
  if (!parser.manifest.segments) return body; // Not valid M3U8

  parser.manifest.segments.forEach(seg => {
    if (seg.uri && !seg.uri.startsWith('http')) {
      const absUri = new URL(seg.uri, baseUrl).href;
      seg.uri = `${PUBLIC_URL}/api/m3u8-proxy?url=${encodeURIComponent(absUri)}`;
    }
  });

  // Handle playlist variants if master manifest
  if (parser.manifest.playlists) {
    parser.manifest.playlists.forEach(playlist => {
      if (playlist.uri && !playlist.uri.startsWith('http')) {
        const absUri = new URL(playlist.uri, baseUrl).href;
        playlist.uri = `${PUBLIC_URL}/api/m3u8-proxy?url=${encodeURIComponent(absUri)}`;
      }
    });
  }

  return parser.manifest.toString();
}

module.exports = async (req, res) => {
  addCORS(res);

  const urlParam = req.query.url;
  if (!urlParam) return res.status(400).end('Missing url param');

  const targetUrl = decodeURIComponent(urlParam);
  const parsed = new URL(targetUrl);
  if (!isValidHost(parsed.host)) return res.status(403).end('Invalid host');

  const isHLS = parsed.pathname.endsWith('.m3u8') || parsed.pathname.endsWith('.ts');
  if (!isHLS) return res.status(400).end('Only HLS supported');

  try {
    const upstream = await proxyRequest(targetUrl, req);
    res.status(upstream.status);

    if (parsed.pathname.endsWith('.m3u8')) {
      const body = await upstream.text();
      const rewritten = rewriteManifest(body, targetUrl);
      res.setHeader('Cache-Control', 'public, max-age=5');
      res.type('application/vnd.apple.mpegurl').send(rewritten);
    } else {
      // TS binary stream
      upstream.headers.forEach((v, k) => res.setHeader(k, v));
      res.type('video/mp2t');
      upstream.body.pipe(res);
    }
  } catch (err) {
    res.status(500).end('Proxy failed');
  }
};
