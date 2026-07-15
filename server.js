const express = require('express');
const fs = require('fs');
const path = require('path');
const cors = require('cors');

const app = express();
const PORT = process.env.PORT || 3000;
const DATA_FILE = path.join(__dirname, 'remote-payout-data.json');

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

app.listen(PORT, () => {
  console.log(`Auszahlung Sync-Server läuft auf http://localhost:${PORT}`);
});

process.on('uncaughtException', (error) => {
  console.error('Uncaught Exception:', error);
});

process.on('unhandledRejection', (reason) => {
  console.error('Unhandled Rejection:', reason);
});
