# HTTPS LAN Setup

## Server starten (Host-PC)

### Option 1: Ohne Zertifikat (kein Import auf anderen PCs noetig)

```powershell
.\tools\start-lan-http.cmd
```

Oder mit npm:

```powershell
npm run start:lan:http
```

Erreichbar unter:

- `http://<HOST-LAN-IP>:3000`
- Beispiel: `http://192.168.178.21:3000`

Hinweis: Diese Variante ist unverschluesselt (nur im vertrauenswuerdigen lokalen Netz verwenden).

### Option 2: Mit HTTPS (Zertifikat)

1. Im Projektordner ausfuehren:

```powershell
npm run start:https:lan
```

Falls `npm` auf dem Host nicht gefunden wird:

```powershell
.\tools\start-https-lan.cmd
```

Alternativ direkt per PowerShell:

```powershell
powershell -ExecutionPolicy Bypass -File .\tools\start-https-lan.ps1
```

1. App ist dann erreichbar unter:

- `https://<HOST-LAN-IP>:3443`
- Beispiel: `https://192.168.178.21:3443`

HTTP auf Port `3000` leitet automatisch auf HTTPS um.

## Zertifikat auf anderen PCs vertrauen

Nur fuer Option 2 (HTTPS) erforderlich.

Damit Browserwarnungen auf anderen Rechnern verschwinden, muss die Root-CA einmal importiert werden.

Datei im Projekt:

- `certs/rootCA.pem`

### Ein-Klick Variante (empfohlen)

1. Projektordner auf dem Client-PC oeffnen.
2. `tools/install-root-ca.cmd` per Rechtsklick als Administrator ausfuehren.
3. Browser danach neu starten.

Alternativ per PowerShell:

```powershell
powershell -ExecutionPolicy Bypass -File .\tools\install-root-ca.ps1
```

### Variante A (GUI)

1. `certs/rootCA.pem` auf den Client-PC kopieren.
2. Datei doppelklicken.
3. "Zertifikat installieren".
4. Speicherort: "Lokaler Computer" (oder "Aktueller Benutzer").
5. "Alle Zertifikate in folgendem Speicher speichern".
6. Speicher: "Vertrauenswuerdige Stammzertifizierungsstellen".
7. Assistent abschliessen.

### Variante B (PowerShell als Admin)

```powershell
certutil -addstore -f Root "C:\Pfad\zu\rootCA.pem"
```

## Browser-Hinweis

- Browser nach Import einmal neu starten.
- Danach sollte die Seite ohne TLS-Warnung geladen werden.

## Funktionstest

Auf dem Host-PC:

```powershell
npm run check:https
```

Der Check bestaetigt HTTP-Redirect (308) und HTTPS-Antwort (200).

## Zertifikat erneuern

Falls sich die Server-IP aendert, neues Zertifikat erzeugen:

```powershell
"C:\Users\carre\AppData\Local\Microsoft\WinGet\Packages\FiloSottile.mkcert_Microsoft.Winget.Source_8wekyb3d8bbwe\mkcert.exe" -cert-file certs/lan-cert.pem -key-file certs/lan-key.pem localhost 127.0.0.1 ::1 <NEUE-LAN-IP>
```
