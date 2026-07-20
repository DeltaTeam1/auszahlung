require('dotenv').config();

const express = require('express');
const fs = require('fs');
const path = require('path');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const selfsigned = require('selfsigned');
const https = require('https');
const http = require('http');

const app = express();
const PORT = process.env.PORT || 3000;
const HTTPS_PORT = parseInt(process.env.HTTPS_PORT || '3443', 10);
const ENABLE_HTTPS = process.argv.includes('--https') || ['1', 'true', 'yes'].includes(String(process.env.ENABLE_HTTPS || '').toLowerCase());
const FORCE_HTTPS = ['1', 'true', 'yes'].includes(String(process.env.FORCE_HTTPS || '').toLowerCase());
const SSL_KEY_PATH = process.env.SSL_KEY_PATH || path.join(__dirname, 'certs', 'server-key.pem');
const SSL_CERT_PATH = process.env.SSL_CERT_PATH || path.join(__dirname, 'certs', 'server-cert.pem');
const DIVISION_KEYS = ['hr', 'sf', 'mp', 'af', 'inf', 'mpy'];

// --- Supabase settings (service key stays on server only) ---
const SUPABASE_URL = process.env.SUPABASE_URL || 'https://zbhevvjhapozcujmgaao.supabase.co';
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
const SUPABASE_TABLE = process.env.SUPABASE_TABLE || 'app_state';
const SUPABASE_ROW_ID = process.env.SUPABASE_ROW_ID || 'global';

const DEFAULT_DATA = {
  payout_history: {
    hr: [],
    sf: [],
    mp: [],
    af: [],
    inf: [],
    mpy: []
  },
  division_passwords: {
    hr: '',
    sf: '',
    mp: '',
    af: '',
    inf: '',
    mpy: ''
  },
  deleted_ids: [],
  lastModified: new Date().toISOString()
};

app.disable('x-powered-by');
app.set('trust proxy', 1);

app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      imgSrc: ["'self'", 'data:'],
      connectSrc: ["'self'"],
      objectSrc: ["'none'"],
      baseUri: ["'self'"],
      frameAncestors: ["'none'"]
    }
  },
  crossOriginEmbedderPolicy: false
}));

app.use(cors({
  origin: true,
  methods: ['GET', 'PUT', 'OPTIONS'],
  allowedHeaders: ['Content-Type']
}));

app.use(express.json({ limit: '2mb' }));

const apiLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 240,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Zu viele Anfragen. Bitte kurz warten.' }
});

app.use('/api/', apiLimiter);

app.use((req, res, next) => {
  if (req.path.startsWith('/api/')) {
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');
  }
  next();
});

app.use(express.static(__dirname, {
  etag: true,
  lastModified: true,
  setHeaders: (res, filePath) => {
    const ext = path.extname(filePath).toLowerCase();
    if (ext === '.html') {
      res.setHeader('Cache-Control', 'no-store');
      return;
    }
    if (ext === '.js' || ext === '.css') {
      res.setHeader('Cache-Control', 'no-cache, must-revalidate');
      return;
    }
    res.setHeader('Cache-Control', 'public, max-age=86400');
  }
}));

function requireSupabaseConfig() {
  if (!SUPABASE_URL) {
    throw new Error('SUPABASE_URL fehlt');
  }
  if (!SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error('SUPABASE_SERVICE_ROLE_KEY fehlt');
  }
}

function sanitizeTransaction(row) {
  if (!row || typeof row !== 'object') return null;

  const recipient = row.recipient ? String(row.recipient).slice(0, 200) : '';
  const purpose = row.purpose ? String(row.purpose).slice(0, 500) : '';
  const status = row.status ? String(row.status).slice(0, 50) : 'Bearbeitung';
  const timestamp = row.timestamp ? String(row.timestamp) : new Date().toISOString();
  const id = row.id ? String(row.id).slice(0, 300) : `${recipient}|${row.amount || 0}|${purpose}|${timestamp}`;
  const amountNum = Number(row.amount);
  const amount = Number.isFinite(amountNum) ? amountNum : 0;

  if (!recipient) return null;

  return {
    id,
    recipient,
    amount,
    purpose,
    status,
    timestamp
  };
}

function sanitizePayoutHistory(rawHistory) {
  const safeHistory = {};
  DIVISION_KEYS.forEach((key) => {
    const rows = rawHistory && Array.isArray(rawHistory[key]) ? rawHistory[key] : [];
    safeHistory[key] = rows
      .map(sanitizeTransaction)
      .filter(Boolean);
  });
  return safeHistory;
}

function sanitizeDivisionPasswords(rawPasswords) {
  const safePasswords = {};
  DIVISION_KEYS.forEach((key) => {
    const value = rawPasswords && rawPasswords[key] ? String(rawPasswords[key]) : '';
    safePasswords[key] = value.slice(0, 200);
  });
  return safePasswords;
}

function sanitizeDeletedIds(rawDeletedIds) {
  if (!Array.isArray(rawDeletedIds)) return [];
  return Array.from(new Set(rawDeletedIds.map((id) => String(id).slice(0, 300)).filter(Boolean)));
}

function extractDeletedIdsFromPayload(payload = {}) {
  const explicit = Array.isArray(payload.deleted_ids)
    ? payload.deleted_ids
    : Array.isArray(payload.deletedIds)
      ? payload.deletedIds
      : [];

  const payoutHistory = payload.payoutHistory || payload.payout_history || {};
  const tombstones = Array.isArray(payoutHistory.__deleted__)
    ? payoutHistory.__deleted__
        .map((row) => (row && row.recipient ? String(row.recipient) : ''))
        .filter(Boolean)
    : [];

  return sanitizeDeletedIds([...explicit, ...tombstones]);
}

function toServerDataSnapshot(payload = {}) {
  const payoutHistoryRaw = payload.payout_history || payload.payoutHistory || {};
  const passwordsRaw = payload.division_passwords || payload.divisionPasswords || {};

  return {
    payout_history: sanitizePayoutHistory(payoutHistoryRaw),
    division_passwords: sanitizeDivisionPasswords(passwordsRaw),
    deleted_ids: extractDeletedIdsFromPayload(payload),
    lastModified: payload.lastModified || payload.lastUpdated || new Date().toISOString()
  };
}

function buildSupabaseHeaders(extra = {}) {
  return {
    apikey: SUPABASE_SERVICE_ROLE_KEY,
    Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
    'Content-Type': 'application/json',
    ...extra
  };
}

function toSupabaseRow(data) {
  return {
    id: SUPABASE_ROW_ID,
    payout_history: data.payout_history,
    division_passwords: data.division_passwords,
    deleted_ids: data.deleted_ids,
    last_modified: data.lastModified || new Date().toISOString()
  };
}

function fromSupabaseRow(row) {
  return {
    payout_history: sanitizePayoutHistory(row && row.payout_history),
    division_passwords: sanitizeDivisionPasswords(row && row.division_passwords),
    deleted_ids: sanitizeDeletedIds(row && row.deleted_ids),
    lastModified: (row && row.last_modified) || new Date().toISOString()
  };
}

async function getSupabaseState() {
  requireSupabaseConfig();

  const select = encodeURIComponent('id,payout_history,division_passwords,deleted_ids,last_modified');
  const url = `${SUPABASE_URL}/rest/v1/${encodeURIComponent(SUPABASE_TABLE)}?id=eq.${encodeURIComponent(SUPABASE_ROW_ID)}&select=${select}&limit=1`;

  const response = await fetch(url, {
    method: 'GET',
    headers: buildSupabaseHeaders()
  });

  if (!response.ok) {
    const details = await response.text().catch(() => '');
    throw new Error(`Supabase-GET fehlgeschlagen (${response.status}): ${details}`);
  }

  const rows = await response.json();
  if (!Array.isArray(rows) || rows.length === 0) {
    const initial = DEFAULT_DATA;
    await upsertSupabaseState(initial);
    return initial;
  }

  return fromSupabaseRow(rows[0]);
}

async function upsertSupabaseState(payload = {}) {
  requireSupabaseConfig();

  const sanitized = toServerDataSnapshot(payload);
  const body = JSON.stringify(toSupabaseRow(sanitized));
  const url = `${SUPABASE_URL}/rest/v1/${encodeURIComponent(SUPABASE_TABLE)}?on_conflict=id`;

  const response = await fetch(url, {
    method: 'POST',
    headers: buildSupabaseHeaders({
      Prefer: 'resolution=merge-duplicates,return=representation'
    }),
    body
  });

  if (!response.ok) {
    const details = await response.text().catch(() => '');
    throw new Error(`Supabase-Upsert fehlgeschlagen (${response.status}): ${details}`);
  }

  const rows = await response.json().catch(() => []);
  if (Array.isArray(rows) && rows.length > 0) {
    return fromSupabaseRow(rows[0]);
  }

  return sanitized;
}

function ensureHttpsCredentials() {
  if (fs.existsSync(SSL_KEY_PATH) && fs.existsSync(SSL_CERT_PATH)) {
    return {
      key: fs.readFileSync(SSL_KEY_PATH),
      cert: fs.readFileSync(SSL_CERT_PATH)
    };
  }

  const certDir = path.dirname(SSL_KEY_PATH);
  if (!fs.existsSync(certDir)) {
    fs.mkdirSync(certDir, { recursive: true });
  }

  const attrs = [{ name: 'commonName', value: 'localhost' }];
  const pems = selfsigned.generate(attrs, {
    keySize: 2048,
    days: 365,
    algorithm: 'sha256',
    extensions: [
      {
        name: 'subjectAltName',
        altNames: [
          { type: 2, value: 'localhost' },
          { type: 2, value: '127.0.0.1' }
        ]
      }
    ]
  });

  fs.writeFileSync(SSL_KEY_PATH, pems.private, { mode: 0o600 });
  fs.writeFileSync(SSL_CERT_PATH, pems.cert, { mode: 0o644 });

  console.warn('HTTPS Zertifikat automatisch erzeugt:', SSL_CERT_PATH);
  console.warn('Hinweis: Dieses Zertifikat ist selbstsigniert und muss ggf. im Browser bestaetigt werden.');

  return {
    key: pems.private,
    cert: pems.cert
  };
}

function startHttpServer() {
  const server = http.createServer(app);
  server.listen(PORT, () => {
    console.log(`Auszahlung Sync-Server läuft auf http://localhost:${PORT}`);
  });
  return server;
}

function startHttpsServer() {
  const credentials = ensureHttpsCredentials();
  const server = https.createServer(credentials, app);
  server.listen(HTTPS_PORT, () => {
    console.log(`Auszahlung Sync-Server läuft auf https://localhost:${HTTPS_PORT}`);
  });
  return server;
}

function startHttpRedirectServer() {
  const redirectApp = express();
  redirectApp.disable('x-powered-by');
  redirectApp.use((req, res) => {
    const hostHeader = req.headers.host || `localhost:${PORT}`;
    const hostWithoutPort = hostHeader.split(':')[0] || 'localhost';
    const target = `https://${hostWithoutPort}:${HTTPS_PORT}${req.originalUrl}`;
    res.redirect(308, target);
  });

  const server = http.createServer(redirectApp);
  server.listen(PORT, () => {
    console.log(`HTTP Redirect aktiv auf http://localhost:${PORT} -> https://localhost:${HTTPS_PORT}`);
  });
  return server;
}

app.get('/api/payout-sync', async (req, res) => {
  try {
    const data = await getSupabaseState();
    res.json(data);
  } catch (error) {
    console.error('GET /api/payout-sync Fehler:', error);
    res.status(503).json({ error: error.message || 'Supabase nicht erreichbar' });
  }
});

app.put('/api/payout-sync', async (req, res) => {
  const payload = req.body;
  if (!payload || typeof payload !== 'object') {
    return res.status(400).json({ error: 'Ungültige Nutzlast' });
  }

  try {
    const data = await upsertSupabaseState(payload);
    res.json({ success: true, lastModified: data.lastModified });
  } catch (error) {
    console.error('PUT /api/payout-sync Fehler:', error);
    res.status(503).json({ error: error.message || 'Supabase nicht erreichbar' });
  }
});

if (ENABLE_HTTPS) {
  startHttpsServer();
  if (FORCE_HTTPS) {
    startHttpRedirectServer();
  } else {
    startHttpServer();
  }
} else {
  startHttpServer();
}

process.on('uncaughtException', (error) => {
  console.error('Uncaught Exception:', error);
});

process.on('unhandledRejection', (reason) => {
  console.error('Unhandled Rejection:', reason);
});
