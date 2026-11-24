@echo off
rem Startet Plenum aus dem Projektordner mit dem offiziellen (signierten) Electron –
rem zum Ausprobieren auf diesem PC, bevor die Store-Version installiert ist.
set ELECTRON_RUN_AS_NODE=
if not exist "%~dp0node_modules\electron\dist\electron.exe" (
  echo Electron fehlt. Bitte einmalig im Ordner "%~dp0" ausfuehren:  npm install
  pause
  exit /b 1
)
start "" "%~dp0node_modules\electron\dist\electron.exe" "%~dp0."
