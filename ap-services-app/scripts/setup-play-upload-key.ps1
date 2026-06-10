# Creates Play upload keystore + PEM for Google Play Console (com.apservices.app).
$ErrorActionPreference = "Stop"
$desktop = Join-Path $env:USERPROFILE "OneDrive\Desktop"
$jks = Join-Path $desktop "ap-services-upload.jks"
$pem = Join-Path $desktop "ap-services-upload.pem"
$readme = Join-Path $desktop "ap-services-upload-READ-ME.txt"
$alias = "upload"
$storePass = "APsUpload2026Secure"
$keyPass = $storePass

if (Test-Path $jks) {
  Write-Host "Keystore already exists: $jks"
} else {
  Write-Host "Creating upload keystore ..."
  & keytool -genkeypair -v -storetype JKS -keyalg RSA -keysize 2048 -validity 10000 `
    -storepass $storePass -keypass $keyPass -alias $alias -keystore $jks `
    -dname "CN=AP Services, OU=Mobile, O=AP Services, L=India, ST=India, C=IN"
  if ($LASTEXITCODE -ne 0) { throw "keytool genkeypair failed" }
}

Write-Host "Exporting certificate PEM for Play Console ..."
& keytool -export -rfc -keystore $jks -alias $alias -file $pem -storepass $storePass
if ($LASTEXITCODE -ne 0) { throw "keytool export failed" }

$shaOut = cmd /c "keytool -list -v -keystore `"$jks`" -storepass $storePass 2>&1"
$sha1 = if ($shaOut -match "SHA1:\s*([0-9A-F:]+)") { $Matches[1] } else { "unknown" }

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
  "Play Console steps:"
  "1. Setup -> App signing -> Request upload key reset"
  "2. Export and upload a key from Java keystore"
  "3. Generate new upload key -> upload: ap-services-upload.pem"
  "4. Wait for Google approval"
  "5. npm run build:aab  (from ap-services-app)"
  ""
  "Do NOT commit .jks or this file to git."
) | Set-Content -Path $readme -Encoding UTF8

Write-Host ""
Write-Host "DONE"
Write-Host "  Upload this file in Play Console: $pem"
Write-Host "  Credentials saved: $readme"
Write-Host "  New key SHA1: $sha1"
Write-Host ""
