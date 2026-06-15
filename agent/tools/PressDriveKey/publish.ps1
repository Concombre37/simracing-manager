#Requires -Version 5.1
$ErrorActionPreference = 'Stop'

$here = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $here

if (-not (Get-Command dotnet -ErrorAction SilentlyContinue)) {
    Write-Error "Le SDK .NET n'est pas installe ou n'est pas dans le PATH."
}

Write-Host "Restauration des packages NuGet..."
dotnet restore | Out-Host

Write-Host "Publication de PressDriveKey (Release, win-x64)..."
dotnet publish -c Release -r win-x64 --self-contained false -p:PublishSingleFile=true -o ..\..\tools | Out-Host

Write-Host "Build termine. Executable : ..\..\tools\PressDriveKey.exe"
