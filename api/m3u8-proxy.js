// /api/m3u8-proxy.js - New file: Vercel Serverless Function for M3U8 Proxy
const { URL } = require('url');

const PUBLIC_URL = process.env.PUBLIC_URL || 'http://localhost:3000';
const ALLOWED_ORIGINS = (process.env.ALLOWED_ORIGINS || '').split(',').map(o => o.trim());

function withCORS(res) {
  res.setHeader('Access-Control-Allow-Origin', ALLOWED_ORIGINS[0] || '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, HEAD');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  return res;
}

async function proxyRequest(targetUrl, req) {
  try {
    const response = await fetch(targetUrl, {
      method: req.method,
      headers: {
        'User-Agent': req.headers['user-agent'] || 'Mozilla/5.0',
      },
    });

    if (!response.ok) {
      return new Response(`Proxy fetch failed: ${response.status}`, { status: response.status });
    }

    const contentType = response.headers.get('Content-Type') || '';
    const res = new Response(response.body, {
      status: response.status,
      headers: response.headers,
    });

    return withCORS(res);
  } catch (error) {
    console.error('Proxy error:', error);
    return new Response('Fetch error', { status: 500 });
  }
}

function rewriteM3U8Urls(body, baseUrl, proxyPath) {
  return body
    .split('\n')
    .map(line => {
      if (line.startsWith('#EXTINF') || line.startsWith('#EXT-X') || line.startsWith('#')) {
        return line;
      }
      if (line.trim() && !line.startsWith('http')) {
        const absUrl = new URL(line.trim(), baseUrl).href;
        return `${proxyPath}?url=${encodeURIComponent(absUrl)}`;
      }
      return line;
    })
    .join('\n');
}

module.exports = async (req, res) => {
  const origin = req.headers.origin || '';
  if (!ALLOWED_ORIGINS.includes(new URL(origin).hostname)) {
    return res.status(403).send('Origin not allowed');
  }

  const urlParam = req.query.url;
  if (!urlParam) {
    return res.status(400).send('Missing url param');
  }

  const targetUrl = decodeURIComponent(urlParam);
  const parsed = new URL(targetUrl);
  const isM3U8 = parsed.pathname.endsWith('.m3u8');
  const contentType = isM3U8 ? 'application/vnd.apple.mpegurl' : 'video/mp2t';

  if (isM3U8) {
    // Proxy M3U8 manifest
    const proxyRes = await proxyRequest(targetUrl, req);
    const text = await proxyRes.text();
    const rewritten = rewriteM3U8Urls(text, targetUrl, `${PUBLIC_URL}/api/m3u8-proxy`);
    res.setHeader('Content-Type', contentType);
    return res.status(proxyRes.status).send(rewritten);
  } else {
    // Proxy TS segment
    const proxyRes = await proxyRequest(targetUrl, req);
    res.setHeader('Content-Type', contentType);
    proxyRes.body.pipe(res);
  }
};
