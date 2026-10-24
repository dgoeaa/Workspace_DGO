@echo off
rem NITDA Folio Administrator Toolkit: starts, configures and opens Folio Administration (the Administration Centre and
rem the Folio Vault) on this computer only, in one step. Read 00 Read Me First.pdf first. Press Ctrl-C, or close this
rem window, to stop. Everything it keeps is in %USERPROFILE%\NITDA-Folio-Tools-Data (set FOLIO_TOOLS_DATA to move it).
setlocal
where node >nul 2>nul
if errorlevel 1 (
  echo Node.js 22 or later is needed: https://nodejs.org/
  pause
  exit /b 1
)
cd /d "%~dp0Programs"
node scripts\folio-admin.mjs %*
pause
