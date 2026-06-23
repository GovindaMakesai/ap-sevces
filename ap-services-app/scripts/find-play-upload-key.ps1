# Find a .jks/.keystore whose SHA1 matches Google Play's expected upload certificate.
$ErrorActionPreference = "Continue"
$expected = "D1:22:D9:AD:C3:E5:D5:FF:34:6B:32:C0:41:3F:5C:F3:A3:CC:46:58"
$wrong = "29:E2:29:CC:D5:E0:2D:94:9C:68:1C:5E:7C:AC:EE:51:F3:3D:7F:7E"

Write-Host "Play Console expects upload cert SHA1:"
Write-Host "  $expected"
Write-Host ""
Write-Host "Local ap-services-upload.jks / EAS download (wrong for Play if SHA1 differs):"
Write-Host "  $wrong"
Write-Host ""

$roots = @(
  (Join-Path $PSScriptRoot ".."),
  (Join-Path $PSScriptRoot "..\.."),
  "$env:USERPROFILE\OneDrive\Desktop",
  "$env:USERPROFILE\Downloads",
  "C:\aps-build",
  "C:\aps-release"
)

$seen = @{}
foreach ($root in $roots) {
  if (-not (Test-Path $root)) { continue }
  Get-ChildItem $root -Recurse -Include *.jks,*.keystore -ErrorAction SilentlyContinue | ForEach-Object {
    if ($seen[$_.FullName]) { return }
    $seen[$_.FullName] = $true
    $sha = $null
    foreach ($pass in @("c108416c5d1bd07f00af1221c49d50e8", "android", "")) {
      $args = @("-list", "-v", "-keystore", $_.FullName)
      if ($pass) { $args += @("-storepass", $pass) }
      $out = & keytool @args 2>$null | Out-String
      if ($out -match "SHA1:\s*([0-9A-F:]+)") { $sha = $Matches[1]; break }
    }
    if (-not $sha) {
      Write-Host "SKIP (need password): $($_.FullName)"
      return
    }
    $tag = if ($sha -eq $expected) { ">>> MATCH - USE THIS KEY <<<" } elseif ($sha -eq $wrong) { "EAS/repo key (wrong for Play)" } else { "other" }
    Write-Host "$tag"
    Write-Host "  $($_.FullName)"
    Write-Host "  SHA1: $sha"
    Write-Host ""
  }
}

Write-Host "If no MATCH: use the keystore from your first Play upload, or request an upload key reset in Play Console -> Setup -> App signing."
