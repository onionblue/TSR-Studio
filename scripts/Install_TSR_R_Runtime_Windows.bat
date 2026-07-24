@echo off
setlocal EnableExtensions
cd /d "%~dp0"
title TSR Studio 3.0.2 Windows R Runtime Installer

echo ==============================================
echo  TSR Studio 3.0.2 Windows R environment
echo ==============================================
echo This installer checks R and installs DESeq2, limma, edgeR,
echo jsonlite, WGCNA, clusterProfiler and species annotation packages.
echo.

where powershell.exe >nul 2>nul
if errorlevel 1 (
  echo PowerShell was not found. Installation cannot continue.
  pause
  exit /b 1
)

powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0deploy-r-windows.ps1"
if errorlevel 1 (
  echo.
  echo R environment installation failed. Keep this window and send its last lines to the developer.
  pause
  exit /b 1
)

echo.
echo Installation completed. Fully quit TSR Studio, reopen it, and run environment diagnostics.
pause
exit /b 0
