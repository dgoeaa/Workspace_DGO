@echo off
rem folio — administer the Folio platform suite. folio help lists every command.
cd /d "%~dp0"
where node >nul 2>nul || (echo Node.js 22+ is required: https://nodejs.org & exit /b 1)
node scripts\folio.mjs %*
