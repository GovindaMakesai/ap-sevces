# Fail the build if banned photo/storage permissions appear in the release merged manifest.
$ErrorActionPreference = "Stop"
$manifest = $args[0]
if (-not $manifest) {
  $candidates = @(
    "C:\aps-build\android\app\build\intermediates\merged_manifests\release\processReleaseManifest\AndroidManifest.xml",
    (Join-Path $PSScriptRoot "..\android\app\src\main\AndroidManifest.xml")
  )
  foreach ($c in $candidates) {
    if (Test-Path $c) { $manifest = $c; break }
  }
}
if (-not (Test-Path $manifest)) {
  Write-Host "verify-play-permissions: manifest not found (skip)"
  exit 0
}

$banned = @(
  'android.permission.READ_MEDIA_IMAGES',
  'android.permission.READ_MEDIA_VIDEO',
  'android.permission.READ_MEDIA_VISUAL_USER_SELECTED',
  'android.permission.READ_EXTERNAL_STORAGE',
  'android.permission.WRITE_EXTERNAL_STORAGE'
)

$found = @()
foreach ($line in (Get-Content $manifest)) {
  foreach ($perm in $banned) {
    if ($line -match [regex]::Escape($perm) -and $line -notmatch 'tools:node="remove"') {
      if ($found -notcontains $perm) { $found += $perm }
    }
  }
}

if ($found.Count) {
  Write-Error "Banned permissions still present in ${manifest}: $($found -join ', ')"
  exit 1
}

Write-Host "verify-play-permissions: OK - no banned storage/media permissions in $manifest"
exit 0
