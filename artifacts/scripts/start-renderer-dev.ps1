$root = Resolve-Path (Join-Path $PSScriptRoot "..\\..")
$stdout = Join-Path $root "artifacts\\logs\\renderer-stdout.log"
$stderr = Join-Path $root "artifacts\\logs\\renderer-stderr.log"

if (Test-Path $stdout) {
  Remove-Item $stdout -Force
}

if (Test-Path $stderr) {
  Remove-Item $stderr -Force
}

$command = "Set-Location '$root'; npm run dev:renderer 1> '$stdout' 2> '$stderr'"
$encodedCommand = [Convert]::ToBase64String([Text.Encoding]::Unicode.GetBytes($command))

$psi = New-Object System.Diagnostics.ProcessStartInfo
$psi.FileName = "powershell.exe"
$psi.Arguments = "-NoProfile -WindowStyle Hidden -EncodedCommand $encodedCommand"
$psi.UseShellExecute = $true

$process = [System.Diagnostics.Process]::Start($psi)
$process.Id
