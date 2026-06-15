@echo off
chcp 65001 >nul
setlocal

cd /d "%~dp0"

set EXE=ViGEmBus_1.22.0_x64_x86_arm64.exe

if not exist "%EXE%" (
  echo ERREUR: %EXE% introuvable dans ce dossier.
  echo Telechargez-le depuis : https://github.com/nefarius/ViGEmBus/releases/download/v1.22.0/%EXE%
  pause
  exit /b 1
)

echo Installation de ViGEmBus...
"%EXE%" /S

if errorlevel 1 (
  echo ERREUR lors de l'installation.
  pause
  exit /b 1
)

echo Installation terminee. Redemarrez le PC si necessaire.
pause
