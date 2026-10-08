@echo off
cd /d "%~dp0"
if exist "dist\RevolaMapDrawer-win32-x64\RevolaMapDrawer.exe" (
  start "" "dist\RevolaMapDrawer-win32-x64\RevolaMapDrawer.exe"
  exit /b
)
if not exist "node_modules\electron\dist\electron.exe" (
  echo Installing development dependencies...
  call npm ci
  if errorlevel 1 (
    pause
    exit /b 1
  )
)
call npm start
if errorlevel 1 pause
