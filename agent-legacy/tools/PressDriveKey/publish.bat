@echo off
chcp 65001 >nul
setlocal

echo Build de PressDriveKey (Release win-x64)...

cd /d "%~dp0"

where dotnet >nul 2>&1
if errorlevel 1 (
  echo ERREUR: le SDK .NET n'est pas installe ou n'est pas dans le PATH.
  exit /b 1
)

dotnet restore || exit /b 1
dotnet publish -c Release -r win-x64 --self-contained false -p:PublishSingleFile=true -o ..\..\tools || exit /b 1

echo.
echo Build termine. L'executable est : ..\..\tools\PressDriveKey.exe
pause
