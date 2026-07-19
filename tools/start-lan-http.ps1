param(
    [int]$HttpPort = 3000
)

$ErrorActionPreference = 'Stop'

$projectRoot = [System.IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$serverPath = Join-Path $projectRoot 'server.js'

if (-not (Test-Path $serverPath)) {
    Write-Error "server.js nicht gefunden: $serverPath"
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

$env:PORT = [string]$HttpPort
Remove-Item Env:ENABLE_HTTPS -ErrorAction SilentlyContinue
Remove-Item Env:FORCE_HTTPS -ErrorAction SilentlyContinue
Remove-Item Env:SSL_KEY_PATH -ErrorAction SilentlyContinue
Remove-Item Env:SSL_CERT_PATH -ErrorAction SilentlyContinue

Write-Host "Starte HTTP-Server mit Node: $nodePath"
Write-Host "LAN-URL (ohne Zertifikat): http://<HOST-LAN-IP>:$HttpPort"

& $nodePath $serverPath
exit $LASTEXITCODE
