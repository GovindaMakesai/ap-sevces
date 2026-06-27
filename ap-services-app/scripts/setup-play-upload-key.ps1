# Creates Play upload keystore + PEM for Google Play Console (com.apservices.app).
$ErrorActionPreference = "Stop"
$appDir = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$credDir = Join-Path $appDir "credentials"
$jks = Join-Path $credDir "upload.jks"
$pem = Join-Path $credDir "upload.pem"
$readme = Join-Path $credDir "README-SIGNING.txt"
$alias = "upload"
$storePass = "APsUpload2026Secure"
$keyPass = $storePass

New-Item -ItemType Directory -Path $credDir -Force | Out-Null

if (Test-Path $jks) {
  Write-Host "Keystore already exists: $jks"
} else {
  Write-Host "Creating upload keystore ..."
  & keytool -genkeypair -v -storetype JKS -keyalg RSA -keysize 2048 -validity 10000 `
    -storepass $storePass -keypass $keyPass -alias $alias -keystore $jks `
    -dname "CN=AP Services, OU=Mobile, O=Muqaddas Technology, L=India, ST=India, C=IN"
  if ($LASTEXITCODE -ne 0) { throw "keytool genkeypair failed" }
}

Write-Host "Exporting certificate PEM for Play Console ..."
& keytool -export -rfc -keystore $jks -alias $alias -file $pem -storepass $storePass
if ($LASTEXITCODE -ne 0) { throw "keytool export failed" }

$shaOut = cmd /c "keytool -list -v -keystore `"$jks`" -storepass $storePass 2>&1"
$sha1 = if ($shaOut -match "SHA1:\s*([0-9A-F:]+)") { $Matches[1] } else { "unknown" }

$propsExample = Join-Path $PSScriptRoot "play-upload.local.properties"
$propsDest = Join-Path $PSScriptRoot "play-upload.local.properties"
if (-not (Test-Path $propsDest)) {
  @(
    "keystore=$jks",
    "alias=$alias",
    "storePassword=$storePass",
    "keyPassword=$keyPass"
  ) | Set-Content -Path $propsDest -Encoding UTF8
  Write-Host "Created $propsDest"
}

@(
  "AP Services - Play UPLOAD key (keep private)"
  "============================================"
  "Keystore: $jks"
  "PEM (upload to Play Console): $pem"
  "Alias: $alias"
  "Store password: $storePass"
  "Key password: $keyPass"
  "SHA1: $sha1"
  ""
  "Play Console: Setup -> App signing -> Upload key"
  "Then: npm run build:aab"
  ""
  "Do NOT commit .jks or play-upload.local.properties to git."
) | Set-Content -Path $readme -Encoding UTF8

Write-Host ""
Write-Host "DONE"
Write-Host "  Keystore: $jks"
Write-Host "  PEM for Play Console: $pem"
Write-Host "  npm run build:aab"
Write-Host ""
