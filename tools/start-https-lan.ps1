param(
    [int]$HttpsPort = 3443
)

$ErrorActionPreference = 'Stop'

$projectRoot = [System.IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$serverPath = Join-Path $projectRoot 'server.js'
$keyPath = Join-Path $projectRoot 'certs/lan-key.pem'
$certPath = Join-Path $projectRoot 'certs/lan-cert.pem'

if (-not (Test-Path $serverPath)) {
    Write-Error "server.js nicht gefunden: $serverPath"
    exit 1
}

if (-not (Test-Path $keyPath) -or -not (Test-Path $certPath)) {
    Write-Error "LAN-Zertifikate fehlen. Erwartet: $keyPath und $certPath"
    exit 1
}

$nodeCandidates = @(
    (Join-Path $env:ProgramFiles 'nodejs/node.exe'),
    (Join-Path $env:LOCALAPPDATA 'Programs/nodejs/node.exe')
)

$nodePath = $null
foreach ($candidate in $nodeCandidates) {
    if ($candidate -and (Test-Path $candidate)) {
        $nodePath = $candidate
        break
    }
}

if (-not $nodePath) {
    try {
        $nodeCmd = Get-Command node -ErrorAction Stop
        if ($nodeCmd -and $nodeCmd.Source) {
            $nodePath = $nodeCmd.Source
        }
    }
    catch {
    }
}

if (-not $nodePath) {
    Write-Error 'Node.js wurde nicht gefunden. Bitte Node.js installieren oder PATH korrigieren.'
    exit 1
}

$env:HTTPS_PORT = [string]$HttpsPort
$env:SSL_KEY_PATH = $keyPath
$env:SSL_CERT_PATH = $certPath
$env:ENABLE_HTTPS = '1'

$env:FORCE_HTTPS = '1'

Write-Host "Starte Server mit Node: $nodePath"
Write-Host "HTTPS: https://localhost:$HttpsPort"
Write-Host "LAN-URL: https://<HOST-LAN-IP>:$HttpsPort"

& $nodePath $serverPath --https
exit $LASTEXITCODE
