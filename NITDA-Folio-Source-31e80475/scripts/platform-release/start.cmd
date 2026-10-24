@echo off
rem Start the Folio platforms from this package. No arguments starts all eight.
cd /d "%~dp0"
where node >nul 2>nul || (echo Node.js 22+ is required: https://nodejs.org & pause & exit /b 1)
if "%~1"=="" (node scripts\run-platform.mjs --all) else (node scripts\run-platform.mjs %*)
pause
