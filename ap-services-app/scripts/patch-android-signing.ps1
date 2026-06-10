# Re-apply release signing after expo prebuild --clean (prebuild resets to debug).
$ErrorActionPreference = "Stop"
$gradle = Join-Path $PSScriptRoot "..\android\app\build.gradle"
if (-not (Test-Path $gradle)) { exit 0 }
$content = Get-Content $gradle -Raw
if ($content -match "signingConfigs\.release") { exit 0 }
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
Set-Content $gradle $content -NoNewline
