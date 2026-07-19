param(
    [string]$CertPath = "..\certs\rootCA.pem"
)

$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$resolvedCertPath = [System.IO.Path]::GetFullPath((Join-Path $scriptDir $CertPath))

if (!(Test-Path $resolvedCertPath)) {
    Write-Error "Root-CA nicht gefunden: $resolvedCertPath"
    exit 1
}

$currentIdentity = [Security.Principal.WindowsIdentity]::GetCurrent()
$principal = New-Object Security.Principal.WindowsPrincipal($currentIdentity)
$isAdmin = $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)

if (-not $isAdmin) {
    Write-Host "Starte mit Administratorrechten neu..."
    $argList = "-ExecutionPolicy Bypass -File `"$PSCommandPath`" -CertPath `"$CertPath`""
    Start-Process -FilePath "powershell.exe" -ArgumentList $argList -Verb RunAs
    exit 0
}

Write-Host "Importiere Root-CA: $resolvedCertPath"
$importOutput = certutil -addstore -f Root "$resolvedCertPath"
$importText = $importOutput | Out-String

if ($LASTEXITCODE -ne 0) {
    Write-Error "Import fehlgeschlagen. certutil ExitCode: $LASTEXITCODE"
    Write-Host $importText
    exit $LASTEXITCODE
}

Write-Host "Root-CA erfolgreich importiert."
Write-Host "Bitte Browser auf diesem PC neu starten."
exit 0
