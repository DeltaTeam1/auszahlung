const express = require('express');
const fs = require('fs');
const path = require('path');
const cors = require('cors');
const https = require('https');
const http = require('http');

const app = express();
const PORT = process.env.PORT || 3000;
const DATA_FILE = path.join(__dirname, 'remote-payout-data.json');

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
  lastModified: new Date().toISOString()
};

app.use(cors());
app.use(express.json({ limit: '2mb' }));

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
    return JSON.parse(raw || JSON.stringify(DEFAULT_DATA));
  } catch (error) {
    console.error('Fehler beim Lesen der Remote-Daten:', error);
    return DEFAULT_DATA;
  }
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
    payout_history: payload.payout_history || DEFAULT_DATA.payout_history,
    division_passwords: payload.division_passwords || DEFAULT_DATA.division_passwords,
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

app.listen(PORT, () => {
  console.log(`Auszahlung Sync-Server läuft auf http://localhost:${PORT}`);
});

process.on('uncaughtException', (error) => {
  console.error('Uncaught Exception:', error);
});

process.on('unhandledRejection', (reason) => {
  console.error('Unhandled Rejection:', reason);
});
