# Standalone installable APK for phone testing (builds off OneDrive at C:\aps-build).
# Default: release APK (production WebView). Pass -Debug for a faster debug APK.
param([switch]$Debug)

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
$variant = if ($Debug) { "Debug" } else { "Release" }
$variantLower = $variant.ToLower()
$keystoreApp = Join-Path $src "android\app\upload.jks"

if (-not (Test-Path (Join-Path $src "android\gradlew.bat"))) {
  Write-Host "Running expo prebuild ..."
  Set-Location $src
  $env:CI = "1"
  npx expo prebuild --platform android --no-install
  if ($LASTEXITCODE -ne 0) { throw "expo prebuild failed" }
}
& powershell -ExecutionPolicy Bypass -File (Join-Path $PSScriptRoot "patch-android-signing.ps1") | Out-Null

if (-not $Debug) {
  if (-not (Test-Path $keystoreSrc)) { throw "Upload keystore not found: $keystoreSrc" }
  if (-not $storePass) { throw "Set store password in scripts\play-upload.local.properties" }
  New-Item -ItemType Directory -Path (Split-Path $keystoreApp) -Force | Out-Null
  Copy-Item -LiteralPath $keystoreSrc -Destination $keystoreApp -Force
}

if (Test-Path $dest) { Remove-Item -Recurse -Force $dest -ErrorAction SilentlyContinue }
New-Item -ItemType Directory -Path $dest -Force | Out-Null
Write-Host "Copying to $dest (off OneDrive) ..."
robocopy $src $dest /E /XD node_modules .gradle build .cxx dist "android\app\build" "android\build" /NFL /NDL /NJH /NJS /nc /ns /np | Out-Null
if ($LASTEXITCODE -ge 8) { throw "robocopy failed with exit $LASTEXITCODE" }

cmd /c "mklink /J `"$dest\node_modules`" `"$src\node_modules`"" | Out-Null

if (-not $Debug) {
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
    "reactNativeArchitectures=armeabi-v7a,arm64-v8a,x86_64",
    "android.enableMinifyInReleaseBuilds=false",
    "android.enableShrinkResourcesInReleaseBuilds=false",
    "MYAPP_UPLOAD_STORE_FILE=upload.jks",
    "MYAPP_UPLOAD_KEY_ALIAS=$alias",
    "MYAPP_UPLOAD_STORE_PASSWORD=$storePass",
    "MYAPP_UPLOAD_KEY_PASSWORD=$keyPass"
  )
  $lines | Set-Content $gradleProps -Encoding UTF8
} else {
  $gradleProps = Join-Path $dest "android\gradle.properties"
  $lines = Get-Content $gradleProps | Where-Object { $_ -notmatch '^reactNativeArchitectures=' }
  $lines += "reactNativeArchitectures=arm64-v8a"
  $lines | Set-Content $gradleProps -Encoding UTF8
}

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

Write-Host "Building $variant APK v$version ($($appJson.expo.android.package)) ..."
.\gradlew.bat "assemble$variant" --no-daemon

$apkName = if ($Debug) { "app-debug.apk" } else { "app-release.apk" }
$apk = "$dest\android\app\build\outputs\apk\$variantLower\$apkName"
if (-not (Test-Path $apk)) { throw "APK not found at $apk" }

$outDir = Join-Path $src "dist"
New-Item -ItemType Directory -Path $outDir -Force | Out-Null
$suffix = if ($Debug) { "debug" } else { "release" }
$outFile = Join-Path $outDir "ap-services-$version-$suffix.apk"
$desktopCopy = Join-Path $env:USERPROFILE "OneDrive\Desktop\ap-services-$version-$suffix.apk"
Copy-Item $apk $outFile -Force
Copy-Item $outFile $desktopCopy -Force

Write-Host ""
Write-Host "SUCCESS - APK ready:"
Write-Host "  $outFile"
Write-Host "  $desktopCopy"
Write-Host ""
Write-Host "Install: copy to phone, or: adb install -r `"$outFile`""
