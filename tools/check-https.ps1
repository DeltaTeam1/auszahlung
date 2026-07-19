param(
    [string]$HostIp = "192.168.178.21",
    [int]$HttpsPort = 3443,
    [int]$HttpPort = 3000
)

$httpsUrl = "https://$HostIp`:$HttpsPort/"
$httpUrl = "http://$HostIp`:$HttpPort/"

Write-Host "Pruefe HTTP Redirect: $httpUrl"
$httpHeaders = & curl.exe -sS -I --max-redirs 0 $httpUrl 2>&1
$httpText = ($httpHeaders | Out-String)
Write-Host $httpText

Write-Host "Pruefe HTTPS Antwort: $httpsUrl"
$httpsHeaders = & curl.exe -sS --ssl-no-revoke -I $httpsUrl 2>&1
$httpsText = ($httpsHeaders | Out-String)
Write-Host $httpsText

if ($httpText -match "308" -and $httpsText -match "200") {
    Write-Host "HTTPS-Check erfolgreich."
    exit 0
}

Write-Error "HTTPS-Check fehlgeschlagen."
exit 1
