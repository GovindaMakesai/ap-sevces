# Signed Play Store AAB for com.apservices.app (builds off OneDrive at C:\aps-build)
$ErrorActionPreference = "Stop"
$src = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$dest = "C:\aps-build"
$propsFile = Join-Path $PSScriptRoot "play-upload.local.properties"

function Read-Props([string]$path) {
  $h = @{}
  if (-not (Test-Path $path)) { return $h }
  Get-Content $path | ForEach-Object {
    if ($_ -match '^\s*#' -or $_ -notmatch '=') { return }
    $k, $v = $_ -split '=', 2
    $h[$k.Trim()] = $v.Trim()
  }
  $h
}

$props = Read-Props $propsFile
$keystoreSrc = $env:PLAY_UPLOAD_KEYSTORE
if (-not $keystoreSrc) { $keystoreSrc = $props['keystore'] }
$alias = $props['alias']
if (-not $alias) { $alias = 'upload' }
$storePass = $env:PLAY_UPLOAD_STORE_PASSWORD
if (-not $storePass) { $storePass = $props['storePassword'] }
$keyPass = $props['keyPassword']
if (-not $keyPass) { $keyPass = $storePass }

$appJson = Get-Content (Join-Path $src "app.json") -Raw | ConvertFrom-Json
$version = $appJson.expo.version
$keystoreApp = Join-Path $src "android\app\upload.jks"

if (-not (Test-Path (Join-Path $src "android\gradlew.bat"))) {
  Write-Host "Running expo prebuild ..."
  Set-Location $src
  $env:CI = "1"
  npx expo prebuild --platform android --no-install
  if ($LASTEXITCODE -ne 0) { throw "expo prebuild failed" }
}
& powershell -ExecutionPolicy Bypass -File (Join-Path $PSScriptRoot "patch-android-signing.ps1") | Out-Null

if (-not (Test-Path $keystoreSrc)) { throw "Upload keystore not found: $keystoreSrc" }
if (-not $storePass) { throw "Set store password in scripts\play-upload.local.properties" }

$shaOut = cmd /c "keytool -list -v -keystore `"$keystoreSrc`" -storepass $storePass 2>&1"
$m = [regex]::Match($shaOut, "SHA1:\s*([0-9A-F:]+)")
if ($m.Success) { Write-Host "Signing with upload key SHA1: $($m.Groups[1].Value)" }

New-Item -ItemType Directory -Path (Split-Path $keystoreApp) -Force | Out-Null
Copy-Item -LiteralPath $keystoreSrc -Destination $keystoreApp -Force

if (Test-Path $dest) { Remove-Item -Recurse -Force $dest -ErrorAction SilentlyContinue }
New-Item -ItemType Directory -Path $dest -Force | Out-Null
Write-Host "Copying to $dest (off OneDrive) ..."
robocopy $src $dest /E /XD node_modules .gradle build .cxx dist "android\app\build" "android\build" /NFL /NDL /NJH /NJS /nc /ns /np | Out-Null
if ($LASTEXITCODE -ge 8) { throw "robocopy failed with exit $LASTEXITCODE" }

cmd /c "mklink /J `"$dest\node_modules`" `"$src\node_modules`"" | Out-Null
Copy-Item -LiteralPath $keystoreApp -Destination "$dest\android\app\upload.jks" -Force

$gradleProps = Join-Path $dest "android\gradle.properties"
$lines = Get-Content $gradleProps
$lines = $lines | Where-Object {
  $_ -notmatch '^MYAPP_UPLOAD_STORE_FILE=' -and
  $_ -notmatch '^MYAPP_UPLOAD_KEY_ALIAS=' -and
  $_ -notmatch '^MYAPP_UPLOAD_STORE_PASSWORD=' -and
  $_ -notmatch '^MYAPP_UPLOAD_KEY_PASSWORD=' -and
  $_ -notmatch '^reactNativeArchitectures=' -and
  $_ -notmatch '^android\.enableMinifyInReleaseBuilds=' -and
  $_ -notmatch '^android\.enableShrinkResourcesInReleaseBuilds='
}
$lines += @(
  "reactNativeArchitectures=arm64-v8a",
  "android.enableMinifyInReleaseBuilds=true",
  "android.enableShrinkResourcesInReleaseBuilds=true",
  "MYAPP_UPLOAD_STORE_FILE=upload.jks",
  "MYAPP_UPLOAD_KEY_ALIAS=$alias",
  "MYAPP_UPLOAD_STORE_PASSWORD=$storePass",
  "MYAPP_UPLOAD_KEY_PASSWORD=$keyPass"
)
$lines | Set-Content $gradleProps -Encoding UTF8
Write-Host "R8 minify + resource shrink enabled for release"

$buildGradle = Join-Path $dest "android\app\build.gradle"
if (Test-Path $buildGradle) {
  $bg = Get-Content $buildGradle -Raw
  $versionCode = [int]$appJson.expo.android.versionCode
  $versionName = $appJson.expo.version
  $bg = $bg -replace 'versionCode\s+\d+', "versionCode $versionCode"
  $bg = $bg -replace 'versionName\s+"[^"]*"', "versionName `"$versionName`""
  Set-Content $buildGradle $bg -NoNewline
  Write-Host "Synced android version: $versionName ($versionCode)"
}

Set-Location (Join-Path $dest "android")
$env:ANDROID_HOME = "$env:LOCALAPPDATA\Android\Sdk"
$env:ANDROID_SDK_ROOT = $env:ANDROID_HOME

Write-Host "Building release AAB v$version ($($appJson.expo.android.package)) ..."
$env:NODE_ENV = "production"
$env:CI = "1"
.\gradlew.bat bundleRelease --no-daemon

$merged = "$dest\android\app\build\intermediates\merged_manifests\release\processReleaseManifest\AndroidManifest.xml"
& powershell -ExecutionPolicy Bypass -File (Join-Path $PSScriptRoot "verify-play-permissions.ps1") $merged
if ($LASTEXITCODE -ne 0) { throw "Play permission verification failed" }

$aab = "$dest\android\app\build\outputs\bundle\release\app-release.aab"
if (-not (Test-Path $aab)) { throw "AAB not found at $aab" }

$outDir = Join-Path $src "dist"
New-Item -ItemType Directory -Path $outDir -Force | Out-Null
$outFile = Join-Path $outDir "ap-services-$version-release.aab"
$desktopCopy = Join-Path $env:USERPROFILE "OneDrive\Desktop\ap-services-$version-release.aab"
Copy-Item $aab $outFile -Force
Copy-Item $outFile $desktopCopy -Force

Write-Host ""
Write-Host "SUCCESS - AAB ready:"
Write-Host "  $outFile"
Write-Host "  $desktopCopy"
