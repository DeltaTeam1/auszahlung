# 24/7 Betrieb mit Supabase (sichere Server-Anbindung)

## Ziel

Die App soll 24/7 laufen, auch wenn dein lokaler Rechner aus ist, und Daten sicher serverseitig in Supabase speichern.

## Architektur

- Browser spricht nur mit deinem Node-Server (`/api/payout-sync`).
- Node-Server spricht mit Supabase per `SUPABASE_SERVICE_ROLE_KEY`.
- Kein direkter Browser-Zugriff auf Supabase-Daten.

## 1) Supabase Schema einrichten

1. In Supabase SQL Editor den Inhalt aus `supabase-schema.sql` ausführen.
2. Prüfen, dass Tabelle `public.app_state` existiert.
3. Prüfen, dass Datensatz mit `id = 'global'` vorhanden ist.

## 2) Server-Umgebung konfigurieren

1. `.env.example` nach `.env` kopieren.
2. In `.env` mindestens setzen:

```env
SUPABASE_URL=https://zbhevvjhapozcujmgaao.supabase.co
SUPABASE_SERVICE_ROLE_KEY=DEIN_SERVICE_ROLE_KEY
SUPABASE_TABLE=app_state
SUPABASE_ROW_ID=global
```

Wichtig: `SUPABASE_SERVICE_ROLE_KEY` darf nur auf dem Server liegen, nie im Frontend.

## 3) Server deployen (24/7)

Deploye dieses Projekt auf einem Node-Host (z. B. Render, Railway, Fly.io, VPS).

Startkommando:

```bash
npm start
```

### Empfohlene schnelle Variante: Render

Im Repository liegt bereits `render.yaml`.

1. Repository bei Render als neues Web Service Projekt verbinden.
2. Render erkennt `render.yaml` automatisch.
3. In Render den geheimen Wert `SUPABASE_SERVICE_ROLE_KEY` setzen.
4. Nach dem ersten Deploy die oeffentliche Backend-URL kopieren, z. B. `https://auszahlung-api.onrender.com`.

## 4) Frontend an den Server binden

Die App ruft standardmäßig `/api/payout-sync` auf.
Wenn Frontend und Backend auf unterschiedlichen Domains laufen, setze in `window.AUSZAHLUNG_CONFIG.apiBaseUrl` die Backend-URL.

### GitHub Pages anbinden

Fuer GitHub Pages liegt bereits `app-config.js` im Projekt.

1. Oeffne `app-config.js`.
2. Trage deine oeffentliche Backend-URL ein:

```js
window.AUSZAHLUNG_CONFIG = {
	apiBaseUrl: 'https://DEIN-BACKEND.example.com'
};
```

3. Committen und nach GitHub Pages veroeffentlichen.

Danach nutzt die Seite auf GitHub Pages automatisch dein oeffentliches Backend.

## Lokaler Test

```powershell
npm start
```

Dann im Browser öffnen:

- `http://localhost:3000`

## Hinweise zur Migration

- Beim ersten erfolgreichen `GET /api/payout-sync` ohne vorhandene Supabase-Zeile migriert der Server automatisch Daten aus `remote-payout-data.json` nach Supabase.
- Danach ist `remote-payout-data.json` nur noch Legacy-Backup.
