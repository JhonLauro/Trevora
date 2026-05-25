Set-Location $PSScriptRoot
$envFile = Join-Path $PSScriptRoot '.env'
if (Test-Path $envFile) {
  Get-Content $envFile | ForEach-Object {
    $line=$_.Trim()
    if ($line -and -not $line.StartsWith('#') -and $line.Contains('=')) {
      $parts=$line.Split('=',2)
      [Environment]::SetEnvironmentVariable($parts[0].Trim(), $parts[1].Trim().Trim('"'), 'Process')
    }
  }
}
.\mvnw.cmd spring-boot:run *> backend-run.log
