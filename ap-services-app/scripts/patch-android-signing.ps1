# Re-apply release signing + standalone debug bundle after expo prebuild --clean.
$ErrorActionPreference = "Stop"
$gradle = Join-Path $PSScriptRoot "..\android\app\build.gradle"
if (-not (Test-Path $gradle)) { exit 0 }
$content = Get-Content $gradle -Raw

if ($content -notmatch 'debuggableVariants\s*=\s*\[\s*\]') {
    if ($content -match 'bundleCommand = "export:embed"') {
        $content = $content -replace '(bundleCommand = "export:embed")', @"
`$1

    // Embed JS in debug APK so the app works on a phone without Metro / npm start.
    debuggableVariants = []
"@
    }
}

if ($content -notmatch "signingConfigs\.release") {
    $content = $content -replace "(?s)signingConfigs \{\s*debug \{[^}]+\}\s*\}", @"
signingConfigs {
        debug {
            storeFile file('debug.keystore')
            storePassword 'android'
            keyAlias 'androiddebugkey'
            keyPassword 'android'
        }
        release {
            if (project.hasProperty('MYAPP_UPLOAD_STORE_FILE')) {
                storeFile file(MYAPP_UPLOAD_STORE_FILE)
                storePassword MYAPP_UPLOAD_STORE_PASSWORD
                keyAlias MYAPP_UPLOAD_KEY_ALIAS
                keyPassword MYAPP_UPLOAD_KEY_PASSWORD
            }
        }
    }
"@
    $content = $content -replace "release \{\s*// Caution![^\n]*\n\s*// see[^\n]*\n\s*signingConfig signingConfigs\.debug", "release {`n            signingConfig signingConfigs.release"
}

Set-Content $gradle $content -NoNewline

$manifest = Join-Path $PSScriptRoot "..\android\app\src\main\AndroidManifest.xml"
if (Test-Path $manifest) {
  $m = Get-Content $manifest -Raw
  if ($m -notmatch 'xmlns:tools=') {
    $m = $m -replace '(<manifest[^>]*)(>)', '$1 xmlns:tools="http://schemas.android.com/tools"$2'
  }
  foreach ($perm in @(
    'android.permission.RECORD_AUDIO',
    'android.permission.MODIFY_AUDIO_SETTINGS'
  )) {
    if ($m -notmatch [regex]::Escape($perm)) {
      $m = $m -replace '(<uses-permission android:name="android.permission.CAMERA"/>)', "`$1`n  <uses-permission android:name=`"$perm`"/>"
    }
  }
  $blocked = @(
    'android.permission.READ_MEDIA_IMAGES',
    'android.permission.READ_MEDIA_VIDEO',
    'android.permission.READ_MEDIA_VISUAL_USER_SELECTED',
    'android.permission.READ_EXTERNAL_STORAGE',
    'android.permission.WRITE_EXTERNAL_STORAGE'
  )
  foreach ($blockedPerm in $blocked) {
    $m = $m -replace "\s*<uses-permission[^>]*android:name=`"$blockedPerm`"[^>]*/>\s*", "`n"
    $removeTag = "<uses-permission android:name=`"$blockedPerm`" tools:node=`"remove`" />"
    if ($m -notmatch [regex]::Escape($removeTag)) {
      $m = $m -replace '(<application\b)', "$removeTag`n  `$1"
    }
  }
  Set-Content $manifest $m -NoNewline
}
