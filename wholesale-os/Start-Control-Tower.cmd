@echo off
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
  echo Install Node.js 24 LTS from https://nodejs.org/ and run this again.
  pause
  exit /b 1
)
if not exist node_modules\pg\package.json (
  call npm.cmd ci
  if errorlevel 1 (
    pause
    exit /b 1
  )
)
node scripts\local-start.mjs --open
pause
