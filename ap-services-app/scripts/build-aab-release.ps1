# Signed multi-ABI Play Store AAB for com.apservices.app
# Builds under C:\aps-build (off OneDrive) so CMake/Ninja is not broken by OneDrive file locks.
# ABIs: armeabi-v7a + arm64-v8a + x86_64 (emulators). Pure x86 omitted (unused).
# R8 minify + resource shrink forced OFF (WebView hybrid blank-screen safety).
$ErrorActionPreference = "Stop"
$src = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$dest = "C:\aps-build"
$propsFile = Join-Path $PSScriptRoot "play-upload.local.properties"

# Real devices: 32-bit ARM + 64-bit ARM. Emulators: x86_64 (Play filters delivery by device ABI).
$TARGET_ABIS = "armeabi-v7a,arm64-v8a,x86_64"

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

function Remove-NativeCxxCaches([string]$root) {
  Write-Host "Cleaning native .cxx caches under $root ..."
  if (-not (Test-Path $root)) { return }
  Get-ChildItem -Path $root -Directory -Recurse -Force -ErrorAction SilentlyContinue |
    Where-Object { $_.Name -in @('.cxx', '.externalNativeBuild', 'CMakeFiles') } |
    ForEach-Object {
      try { Remove-Item -LiteralPath $_.FullName -Recurse -Force -ErrorAction SilentlyContinue } catch {}
    }
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
$versionCode = [int]$appJson.expo.android.versionCode
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

if (Test-Path $dest) {
  Write-Host "Removing previous $dest ..."
  cmd /c "rmdir /s /q `"$dest`"" | Out-Null
  Start-Sleep -Seconds 2
  if (Test-Path $dest) { Remove-Item -LiteralPath $dest -Recurse -Force -ErrorAction SilentlyContinue }
}
New-Item -ItemType Directory -Path $dest -Force | Out-Null

Write-Host "Copying project to $dest (off OneDrive) ..."
# Do NOT junction node_modules back to OneDrive. Junction caused:
# ninja: error: manifest 'build.ninja' still dirty after 100 tries
# because CMake wrote into OneDrive-synced node_modules.
robocopy $src $dest /E /XD .git .gradle build dist node_modules "android\app\build" "android\build" "android\.gradle" .cxx .externalNativeBuild /NFL /NDL /NJH /NJS /nc /ns /np /R:2 /W:2 | Out-Null
if ($LASTEXITCODE -ge 8) { throw "robocopy project failed with exit $LASTEXITCODE" }

Write-Host "Copying node_modules as real files (exclude .cxx) ..."
$nmSrc = Join-Path $src "node_modules"
$nmDest = Join-Path $dest "node_modules"
if (-not (Test-Path $nmSrc)) { throw "node_modules missing - run npm install in ap-services-app first" }
robocopy $nmSrc $nmDest /E /XD .cxx .externalNativeBuild /NFL /NDL /NJH /NJS /nc /ns /np /R:1 /W:1 | Out-Null
if ($LASTEXITCODE -ge 8) { throw "robocopy node_modules failed with exit $LASTEXITCODE" }

Copy-Item -LiteralPath $keystoreApp -Destination "$dest\android\app\upload.jks" -Force
Remove-NativeCxxCaches $dest

$gradleProps = Join-Path $dest "android\gradle.properties"
$lines = Get-Content $gradleProps
$lines = $lines | Where-Object {
  $_ -notmatch '^MYAPP_UPLOAD_STORE_FILE=' -and
  $_ -notmatch '^MYAPP_UPLOAD_KEY_ALIAS=' -and
  $_ -notmatch '^MYAPP_UPLOAD_STORE_PASSWORD=' -and
  $_ -notmatch '^MYAPP_UPLOAD_KEY_PASSWORD=' -and
  $_ -notmatch '^reactNativeArchitectures=' -and
  $_ -notmatch '^android\.enableMinifyInReleaseBuilds=' -and
  $_ -notmatch '^android\.enableShrinkResourcesInReleaseBuilds=' -and
  $_ -notmatch '^org\.gradle\.parallel=' -and
  $_ -notmatch '^org\.gradle\.workers\.max='
}
$lines += @(
  "reactNativeArchitectures=$TARGET_ABIS",
  "android.enableMinifyInReleaseBuilds=false",
  "android.enableShrinkResourcesInReleaseBuilds=false",
  "org.gradle.parallel=false",
  "org.gradle.workers.max=2",
  "MYAPP_UPLOAD_STORE_FILE=upload.jks",
  "MYAPP_UPLOAD_KEY_ALIAS=$alias",
  "MYAPP_UPLOAD_STORE_PASSWORD=$storePass",
  "MYAPP_UPLOAD_KEY_PASSWORD=$keyPass"
)
$lines | Set-Content $gradleProps -Encoding UTF8
Write-Host "Config: ABIs=$TARGET_ABIS | R8 minify=OFF | shrink=OFF | workers=2"

$buildGradle = Join-Path $dest "android\app\build.gradle"
if (Test-Path $buildGradle) {
  $bg = Get-Content $buildGradle -Raw
  $bg = $bg -replace 'versionCode\s+\d+', "versionCode $versionCode"
  $bg = $bg -replace 'versionName\s+"[^"]*"', "versionName `"$version`""
  Set-Content $buildGradle $bg -NoNewline
  Write-Host "Synced android version: $version ($versionCode)"
}

$env:ANDROID_HOME = "$env:LOCALAPPDATA\Android\Sdk"
$env:ANDROID_SDK_ROOT = $env:ANDROID_HOME
# Keep normal Gradle home so we reuse already-downloaded distributions/caches.
# (A fresh GRADLE_USER_HOME under C:\aps-build caused download timeouts.)
if (-not $env:GRADLE_USER_HOME) {
  $env:GRADLE_USER_HOME = Join-Path $env:USERPROFILE ".gradle"
}
$env:NODE_ENV = "production"
$env:CI = "1"

Set-Location (Join-Path $dest "android")
Write-Host "Building multi-ABI release AAB v$version package=$($appJson.expo.android.package)"
Write-Host "Expect 25-50 minutes for v7a + arm64 + x86_64 native compile."

.\gradlew.bat bundleRelease --no-daemon --max-workers=2 "-PreactNativeArchitectures=$TARGET_ABIS"
if ($LASTEXITCODE -ne 0) { throw "gradlew bundleRelease failed with exit $LASTEXITCODE" }

$merged = "$dest\android\app\build\intermediates\merged_manifests\release\processReleaseManifest\AndroidManifest.xml"
& powershell -ExecutionPolicy Bypass -File (Join-Path $PSScriptRoot "verify-play-permissions.ps1") $merged
if ($LASTEXITCODE -ne 0) { throw "Play permission verification failed" }

$aab = "$dest\android\app\build\outputs\bundle\release\app-release.aab"
if (-not (Test-Path $aab)) { throw "AAB not found at $aab" }

$inspectDir = Join-Path $dest "aab-inspect"
if (Test-Path $inspectDir) { Remove-Item $inspectDir -Recurse -Force }
New-Item -ItemType Directory -Path $inspectDir -Force | Out-Null
$zipCopy = Join-Path $inspectDir "app-release.zip"
Copy-Item $aab $zipCopy -Force
Expand-Archive -LiteralPath $zipCopy -DestinationPath (Join-Path $inspectDir "unzipped") -Force

$libRoot = Join-Path $inspectDir "unzipped\base\lib"
$abisFound = @()
if (Test-Path $libRoot) {
  $abisFound = @(Get-ChildItem $libRoot -Directory | ForEach-Object { $_.Name } | Sort-Object)
  Write-Host ""
  Write-Host "AAB native ABI folders (base/lib):"
  foreach ($abi in $abisFound) {
    $count = @(Get-ChildItem (Join-Path $libRoot $abi) -Filter "*.so" -ErrorAction SilentlyContinue).Count
    Write-Host ("  - {0}: {1} .so files" -f $abi, $count)
  }
} else {
  Write-Host "base/lib missing - scanning all .so entries..."
  $sos = Get-ChildItem (Join-Path $inspectDir "unzipped") -Recurse -Filter "*.so" -ErrorAction SilentlyContinue
  $abisFound = @($sos | ForEach-Object {
    if ($_.FullName -match '\\(armeabi-v7a|arm64-v8a|x86_64|x86)\\') { $Matches[1] }
  } | Select-Object -Unique | Sort-Object)
  foreach ($abi in $abisFound) { Write-Host "  - $abi" }
}

$required = @('armeabi-v7a', 'arm64-v8a')
$missing = @($required | Where-Object { $abisFound -notcontains $_ })
if ($missing.Count -gt 0) {
  throw "AAB missing required ABIs: $($missing -join ', '). Found: $($abisFound -join ', ')"
}

$outDir = Join-Path $src "dist"
New-Item -ItemType Directory -Path $outDir -Force | Out-Null
$outFile = Join-Path $outDir "ap-services-$version-release.aab"
$desktopCopy = Join-Path $env:USERPROFILE "OneDrive\Desktop\ap-services-$version-release.aab"
$abiReport = Join-Path $outDir "ap-services-$version-abi-report.txt"
Copy-Item $aab $outFile -Force
Copy-Item $outFile $desktopCopy -Force

@(
  "version=$version",
  "versionCode=$versionCode",
  "abis=$($abisFound -join ',')",
  "minify=false",
  "shrink=false",
  "built_at=$(Get-Date -Format o)"
) | Set-Content $abiReport -Encoding UTF8

Write-Host ""
Write-Host "SUCCESS - multi-ABI AAB ready:"
Write-Host "  $outFile"
Write-Host "  $desktopCopy"
Write-Host "  ABI report: $abiReport"
Write-Host "  ABIs: $($abisFound -join ', ')"
