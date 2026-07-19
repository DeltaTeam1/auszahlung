# 24/7 Betrieb (ohne laufenden PC)

## Ziel

Die App soll weiterlaufen, auch wenn dein lokaler Rechner aus ist.

## Was wurde im Code vorbereitet

`script.js` nutzt jetzt automatisch einen **Direct-Cloud-Modus**, wenn die Seite nicht auf `localhost` geoeffnet wird:

- Sync direkt gegen Google Apps Script (kein lokaler Node-Server noetig)
- Kein Fallback auf lokale `/api/*`-Routen auf statischem Hosting

## Option A (empfohlen): Statisches Hosting

Du kannst `index.html`, `styles.css` und `script.js` auf einem statischen Host deployen:

- GitHub Pages
- Netlify
- Cloudflare Pages
- Vercel (Static)

Wichtig: Die Datei `google-apps-script.gs` muss als Web App deployed sein (Google Apps Script).

## Google Apps Script Deploy

1. In Google Apps Script `google-apps-script.gs` einfügen.
2. `Bereitstellen` -> `Neue Bereitstellung` -> Typ `Web-App`.
3. Ausführen als: `Ich`.
4. Zugriff: passend zu deinem Bedarf (z. B. `Jeder mit Link`).
5. Web-App-URL kopieren.

## Optional: Eigene URL/Sheet-ID setzen

Standardwerte sind bereits in `script.js` hinterlegt. Wenn du abweichende Werte willst:

1. Seite im Browser öffnen.
2. DevTools-Konsole öffnen.
3. Befehle ausführen:

```js
localStorage.setItem('apps_script_url', 'DEINE_APPS_SCRIPT_WEBAPP_URL');
localStorage.setItem('google_sheet_id', 'DEINE_GOOGLE_SHEET_ID');
location.reload();
```

## Lokaler Betrieb bleibt moeglich

Auf deinem PC kannst du weiterhin lokal starten:

- `npm start`
- oder die Skripte in `tools/`

Lokal nutzt die App automatisch den Node-Proxy (`/api/*`).
