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
const DATA_FILE = path.join(__dirname, 'remote-payout-data.json');
const DIVISION_KEYS = ['hr', 'sf', 'mp', 'af', 'inf', 'mpy'];

// --- Google Sheets credentials (server-side only, never exposed to client) ---
const GOOGLE_SHEET_ID = process.env.GOOGLE_SHEET_ID || '1caffNc0TQMuvZTdptFPRnD-5CefuS9Eqs4kr91BkDKY';
const GOOGLE_SHEET_TAB_NAME = process.env.GOOGLE_SHEET_TAB_NAME || 'Data';
const GOOGLE_APPS_SCRIPT_URL = process.env.GOOGLE_APPS_SCRIPT_URL || 'https://script.google.com/macros/s/AKfycbxUKzUqJ5LaLBuo6uz9bSdtG5jFygJVspw-Z5lwV992mWXv54idcjivz2dfPfc7cTSTIg/exec';

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
  methods: ['GET', 'POST', 'PUT', 'OPTIONS'],
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

// Helper: forward a request to an external URL and pipe the response back
function proxyRequest(targetUrl, method, body, res) {
  const url = new URL(targetUrl);
  const lib = url.protocol === 'https:' ? https : http;
  const options = {
    hostname: url.hostname,
    path: url.pathname + url.search,
    method: method || 'GET',
    headers: {
      'Content-Type': 'application/json',
      'Accept': 'application/json'
    }
  };
  const bodyStr = body ? JSON.stringify(body) : null;
  if (bodyStr) options.headers['Content-Length'] = Buffer.byteLength(bodyStr);

  const req = lib.request(options, (proxyRes) => {
    res.status(proxyRes.statusCode);
    proxyRes.pipe(res, { end: true });
  });
  req.on('error', (err) => {
    console.error('Proxy-Fehler:', err);
    if (!res.headersSent) res.status(502).json({ error: 'Proxy-Verbindung fehlgeschlagen' });
  });
  if (bodyStr) req.write(bodyStr);
  req.end();
}

function readRemoteData() {
  try {
    if (!fs.existsSync(DATA_FILE)) {
      fs.writeFileSync(DATA_FILE, JSON.stringify(DEFAULT_DATA, null, 2));
      return DEFAULT_DATA;
    }
    const raw = fs.readFileSync(DATA_FILE, 'utf8');
    const parsed = JSON.parse(raw || JSON.stringify(DEFAULT_DATA));
    return {
      payout_history: parsed.payout_history || DEFAULT_DATA.payout_history,
      division_passwords: parsed.division_passwords || DEFAULT_DATA.division_passwords,
      deleted_ids: Array.isArray(parsed.deleted_ids) ? parsed.deleted_ids : [],
      lastModified: parsed.lastModified || new Date().toISOString()
    };
  } catch (error) {
    console.error('Fehler beim Lesen der Remote-Daten:', error);
    return DEFAULT_DATA;
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

function writeRemoteData(data) {
  try {
    fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2));
    return true;
  } catch (error) {
    console.error('Fehler beim Schreiben der Remote-Daten:', error);
    return false;
  }
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

app.get('/api/payout-sync', (req, res) => {
  const data = readRemoteData();
  res.json(data);
});

app.put('/api/payout-sync', (req, res) => {
  const payload = req.body;
  if (!payload || typeof payload !== 'object') {
    return res.status(400).json({ error: 'Ungültige Nutzlast' });
  }

  const updatedData = {
    payout_history: sanitizePayoutHistory(payload.payout_history),
    division_passwords: sanitizeDivisionPasswords(payload.division_passwords),
    deleted_ids: sanitizeDeletedIds(payload.deleted_ids),
    lastModified: payload.lastModified || new Date().toISOString()
  };

  if (!writeRemoteData(updatedData)) {
    return res.status(500).json({ error: 'Speichern der Daten fehlgeschlagen' });
  }

  res.json({ success: true, lastModified: updatedData.lastModified });
});

// --- Proxy: POST to Apps Script (export) ---
app.post('/api/sheet-sync', (req, res) => {
  if (!GOOGLE_APPS_SCRIPT_URL) return res.status(503).json({ error: 'Apps Script nicht konfiguriert' });

  // Keep local mirror in sync as automatic backup whenever clients push to Google.
  const backupSnapshot = toServerDataSnapshot(req.body || {});
  if (!writeRemoteData(backupSnapshot)) {
    console.warn('Warnung: Lokales Backup konnte vor Google-Proxy nicht geschrieben werden.');
  }

  proxyRequest(GOOGLE_APPS_SCRIPT_URL, 'POST', req.body, res);
});

// --- Proxy: GET from Apps Script (import) ---
app.get('/api/sheet-import', (req, res) => {
  if (!GOOGLE_APPS_SCRIPT_URL) return res.status(503).json({ error: 'Apps Script nicht konfiguriert' });
  proxyRequest(`${GOOGLE_APPS_SCRIPT_URL}?t=${Date.now()}`, 'GET', null, res);
});

// --- Proxy: GViz fallback read ---
app.get('/api/sheet-gviz', (req, res) => {
  if (!GOOGLE_SHEET_ID) return res.status(503).json({ error: 'Sheet ID nicht konfiguriert' });
  const gvizUrl = `https://docs.google.com/spreadsheets/d/${GOOGLE_SHEET_ID}/gviz/tq?tqx=out:json&sheet=${encodeURIComponent(GOOGLE_SHEET_TAB_NAME)}&t=${Date.now()}`;
  proxyRequest(gvizUrl, 'GET', null, res);
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
