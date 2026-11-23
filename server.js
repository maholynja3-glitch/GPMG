const crypto = require('node:crypto');
const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');

const ROOT = __dirname;
const COOKIE_NAME = 'gpmg_admin_session';
const SESSION_TTL_MS = 30 * 60 * 1000;
const MAX_BODY_BYTES = 4096;
const PAGE_SIZE = 500;
const sessions = new Map();
const loginAttempts = new Map();

function loadEnvFile() {
  const envPath = path.join(ROOT, '.env');
  if (!fs.existsSync(envPath)) return;

  const lines = fs.readFileSync(envPath, 'utf8').split(/\r?\n/);
  for (const line of lines) {
    const match = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*?)\s*$/);
    if (!match || match[1] in process.env) continue;
    let value = match[2];
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    process.env[match[1]] = value;
  }
}

loadEnvFile();

const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || '';
const SESSION_SECRET = process.env.ADMIN_SESSION_SECRET || '';
const SUPABASE_URL = (process.env.SUPABASE_URL || '').replace(/\/+$/, '');
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
const PORT = Number(process.env.PORT || 8080);
const HOST = process.env.HOST || '0.0.0.0';
const secureCookies = process.env.NODE_ENV === 'production';

const missingConfig = [
  ['ADMIN_PASSWORD', ADMIN_PASSWORD],
  ['ADMIN_SESSION_SECRET', SESSION_SECRET],
  ['SUPABASE_URL', SUPABASE_URL],
  ['SUPABASE_SERVICE_ROLE_KEY', SUPABASE_SERVICE_ROLE_KEY]
].filter(([, value]) => !value).map(([name]) => name);

if (missingConfig.length) {
  console.error(`Missing required server configuration: ${missingConfig.join(', ')}`);
  process.exit(1);
}
if (SESSION_SECRET.length < 32) {
  console.error('ADMIN_SESSION_SECRET must contain at least 32 characters.');
  process.exit(1);
}
if (ADMIN_PASSWORD.length < 12) {
  console.warn('ADMIN_PASSWORD is shorter than the recommended 12 characters.');
}
if (typeof fetch !== 'function') {
  console.error('Node.js 18 or newer is required (global fetch is unavailable).');
  process.exit(1);
}

function sendJson(res, status, payload, extraHeaders = {}) {
  const body = JSON.stringify(payload);
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff',
    ...extraHeaders
  });
  res.end(body);
}

function rejectOrigin(req, res) {
  const origin = req.headers.origin;
  if (!origin) return false;
  try {
    if (new URL(origin).host === req.headers.host) return false;
  } catch (error) {
    // Invalid Origin headers are rejected below.
  }
  sendJson(res, 403, { error: 'Origin not allowed.' });
  return true;
}

function readJson(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    let tooLarge = false;

    req.on('data', chunk => {
      size += chunk.length;
      if (size > MAX_BODY_BYTES) {
        tooLarge = true;
        chunks.length = 0;
      } else if (!tooLarge) {
        chunks.push(chunk);
      }
    });
    req.on('end', () => {
      if (tooLarge) {
        reject(Object.assign(new Error('Request body is too large.'), { status: 413 }));
        return;
      }
      try {
        resolve(JSON.parse(Buffer.concat(chunks).toString('utf8')));
      } catch (error) {
        reject(Object.assign(new Error('Invalid JSON body.'), { status: 400 }));
      }
    });
    req.on('error', reject);
  });
}

function cookieValue(req, name) {
  const cookies = (req.headers.cookie || '').split(';');
  for (const cookie of cookies) {
    const separator = cookie.indexOf('=');
    if (separator < 0) continue;
    if (cookie.slice(0, separator).trim() === name) return cookie.slice(separator + 1).trim();
  }
  return '';
}

function tokenHash(token) {
  return crypto.createHash('sha256').update(token).digest('hex');
}

function getAdminSession(req) {
  const token = cookieValue(req, COOKIE_NAME);
  if (!token) return null;
  const key = tokenHash(token);
  const expiresAt = sessions.get(key);
  if (!expiresAt || expiresAt <= Date.now()) {
    sessions.delete(key);
    return null;
  }
  return key;
}

function setSessionCookie(res, token, maxAge) {
  const secure = secureCookies ? '; Secure' : '';
  res.setHeader('Set-Cookie', `${COOKIE_NAME}=${token}; HttpOnly; SameSite=Strict; Path=/; Max-Age=${maxAge}${secure}`);
}

function isRateLimited(ip) {
  const attempt = loginAttempts.get(ip);
  if (!attempt) return false;
  if (attempt.blockedUntil > Date.now()) return true;
  if (attempt.windowEndsAt <= Date.now()) loginAttempts.delete(ip);
  return false;
}

function recordFailedLogin(ip) {
  const now = Date.now();
  const current = loginAttempts.get(ip);
  const attempt = !current || current.windowEndsAt <= now
    ? { failures: 0, windowEndsAt: now + 15 * 60 * 1000, blockedUntil: 0 }
    : current;
  attempt.failures += 1;
  if (attempt.failures >= 5) attempt.blockedUntil = now + 15 * 60 * 1000;
  loginAttempts.set(ip, attempt);
}

function passwordMatches(candidate) {
  const candidateBuffer = Buffer.from(candidate);
  const expectedBuffer = Buffer.from(ADMIN_PASSWORD);
  return candidateBuffer.length === expectedBuffer.length
    && crypto.timingSafeEqual(candidateBuffer, expectedBuffer);
}

async function loadPlayers() {
  const players = [];
  for (let offset = 0; ; offset += PAGE_SIZE) {
    const url = new URL('/rest/v1/players', `${SUPABASE_URL}/`);
    url.searchParams.set('select', 'full_name,squad_name,email,phone,uid_free_fire,created_at');
    url.searchParams.set('order', 'created_at.desc,id.asc');

    const response = await fetch(url, {
      headers: {
        apikey: SUPABASE_SERVICE_ROLE_KEY,
        Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
        'Range-Unit': 'items',
        Range: `${offset}-${offset + PAGE_SIZE - 1}`
      }
    });
    if (!response.ok) {
      console.error(`Player query failed with status ${response.status}.`);
      throw new Error('Unable to load player accounts.');
    }

    const batch = await response.json();
    if (!Array.isArray(batch)) throw new Error('Unexpected player query response.');
    players.push(...batch);
    if (batch.length < PAGE_SIZE) return players;
  }
}

function serveStatic(req, res, pathname) {
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    sendJson(res, 405, { error: 'Method not allowed.' }, { Allow: 'GET, HEAD' });
    return;
  }

  let decodedPath;
  try {
    decodedPath = decodeURIComponent(pathname);
  } catch (error) {
    sendJson(res, 400, { error: 'Invalid path.' });
    return;
  }

  const relativePath = decodedPath === '/' ? 'index.html' : decodedPath.replace(/^[/\\]+/, '');
  const filePath = path.resolve(ROOT, relativePath);
  if (!filePath.startsWith(`${ROOT}${path.sep}`) || path.basename(filePath).toLowerCase() === 'server.js') {
    sendJson(res, 404, { error: 'Not found.' });
    return;
  }

  const contentTypes = {
    '.css': 'text/css; charset=utf-8',
    '.html': 'text/html; charset=utf-8',
    '.ico': 'image/x-icon',
    '.jpeg': 'image/jpeg',
    '.jpg': 'image/jpeg',
    '.js': 'text/javascript; charset=utf-8',
    '.png': 'image/png',
    '.svg': 'image/svg+xml',
    '.webm': 'video/webm',
    '.webp': 'image/webp',
    '.woff': 'font/woff',
    '.woff2': 'font/woff2'
  };
  const contentType = contentTypes[path.extname(filePath).toLowerCase()];
  if (!contentType) {
    sendJson(res, 404, { error: 'Not found.' });
    return;
  }

  fs.stat(filePath, (statError, stats) => {
    if (statError || !stats.isFile()) {
      sendJson(res, 404, { error: 'Not found.' });
      return;
    }
    res.writeHead(200, {
      'Content-Type': contentType,
      'Content-Length': stats.size,
      'X-Content-Type-Options': 'nosniff',
      'X-Frame-Options': 'DENY',
      'Referrer-Policy': 'strict-origin-when-cross-origin'
    });
    if (req.method === 'HEAD') {
      res.end();
      return;
    }
    fs.createReadStream(filePath).pipe(res);
  });
}

const server = http.createServer(async (req, res) => {
  let pathname;
  try {
    pathname = new URL(req.url, 'http://localhost').pathname;
  } catch (error) {
    sendJson(res, 400, { error: 'Invalid request URL.' });
    return;
  }

  if (pathname === '/api/admin/login' && req.method === 'POST') {
    if (rejectOrigin(req, res)) return;
    const ip = req.socket.remoteAddress || 'unknown';
    if (isRateLimited(ip)) {
      sendJson(res, 429, { error: 'Too many attempts. Try again later.' });
      return;
    }
    try {
      const body = await readJson(req);
      if (!body || typeof body.password !== 'string' || !passwordMatches(body.password)) {
        recordFailedLogin(ip);
        sendJson(res, 401, { error: 'Mot de passe incorrect.' });
        return;
      }
      loginAttempts.delete(ip);
      for (const [sessionKey, expiresAt] of sessions) {
        if (expiresAt <= Date.now()) sessions.delete(sessionKey);
      }
      const token = crypto.randomBytes(32).toString('base64url');
      const key = tokenHash(token);
      sessions.set(key, Date.now() + SESSION_TTL_MS);
      setSessionCookie(res, token, Math.floor(SESSION_TTL_MS / 1000));
      sendJson(res, 200, { authenticated: true });
    } catch (error) {
      sendJson(res, error.status || 400, { error: error.message });
    }
    return;
  }

  if (pathname === '/api/admin/session' && req.method === 'GET') {
    const authenticated = !!getAdminSession(req);
    sendJson(res, authenticated ? 200 : 401, { authenticated });
    return;
  }

  if (pathname === '/api/admin/logout' && req.method === 'POST') {
    if (rejectOrigin(req, res)) return;
    const session = getAdminSession(req);
    if (session) sessions.delete(session);
    setSessionCookie(res, '', 0);
    sendJson(res, 200, { authenticated: false });
    return;
  }

  if (pathname === '/api/admin/players' && req.method === 'GET') {
    if (!getAdminSession(req)) {
      sendJson(res, 401, { error: 'Authentification admin requise.' });
      return;
    }
    try {
      const players = await loadPlayers();
      sendJson(res, 200, { players });
    } catch (error) {
      console.error('[Admin API] Player list request failed.');
      sendJson(res, 502, { error: 'Impossible de charger les comptes joueurs.' });
    }
    return;
  }

  if (pathname.startsWith('/api/')) {
    sendJson(res, 404, { error: 'Not found.' });
    return;
  }

  serveStatic(req, res, pathname);
});

server.listen(PORT, HOST, () => {
  console.log(`GPMG site and admin API listening on ${HOST}:${PORT}.`);
});
