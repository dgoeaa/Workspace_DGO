@echo off
rem Automatic setup: sign in once, and the seven flows, the SharePoint lists, the first admin
rem operator and the mailer ready to publish are all done. Safe to run again at any time.
cd /d "%~dp0"
where node >nul 2>nul || (echo Node.js 18+ is required: https://nodejs.org & pause & exit /b 1)
node tools\setup.mjs %*
if errorlevel 1 (echo. & echo Setup stopped. Read the lines above, fix what they say, and run setup.cmd again. & pause & exit /b 1)
echo.
echo Opening the folder to publish. Upload mailer.html into the folder that holds the platform's index.html.
explorer "%~dp0..\dgo-mailer-publish"
pause
