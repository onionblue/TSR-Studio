@echo off
setlocal EnableExtensions
cd /d "%~dp0"
title TSR Studio 3.0.2 Windows Local Builder

echo ==============================================
echo  TSR Studio 3.0.2 Windows Local Builder
echo ==============================================

where node >nul 2>nul
if errorlevel 1 (
  echo Node.js was not found.
  echo Please install the LTS version from https://nodejs.org/
  echo Then double-click this file again.
  pause
  exit /b 1
)

echo [1/3] Installing build dependencies...
call npm ci
if errorlevel 1 (
  echo 检测到依赖锁文件与npm仓库不一致，正在自动重建锁文件并重试...
  if exist node_modules rmdir /s /q node_modules
  call npm install --package-lock-only --ignore-scripts
  if errorlevel 1 goto :error
  call npm ci
)
if errorlevel 1 goto :error
if errorlevel 1 goto :failed

echo [2/3] Compiling TSR Studio...
call npm run build
if errorlevel 1 goto :failed

echo [3/3] Creating Windows installer and portable EXE...
if exist release rmdir /s /q release
call npx electron-builder --win nsis portable --x64 --publish never
if errorlevel 1 goto :failed

set "DEST=%USERPROFILE%\Desktop\TSR-Studio-3.0.2-Windows-x64"
if not exist "%DEST%" mkdir "%DEST%"
copy /y "release\*.exe" "%DEST%\" >nul

echo.
echo Build completed: %DEST%
start "" "%DEST%"
pause
exit /b 0

:failed
echo.
echo Build failed. Please take a screenshot of the last 20 lines.
pause
exit /b 1
