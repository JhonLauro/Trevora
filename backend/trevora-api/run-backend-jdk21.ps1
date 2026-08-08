$jdk21 = "C:\Program Files\Eclipse Adoptium\jdk-21.0.12.8-hotspot"
$env:JAVA_HOME = $jdk21
$env:Path = "$jdk21\bin;" + $env:Path
Set-Location $PSScriptRoot
& .\run-backend-local.ps1
