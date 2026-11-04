@echo off
REM ============================================================
REM  BrewLite - Auto zip du an (bo node_modules, build, .git...)
REM  Chi dong goi nhung file can thiet.
REM  Goi file PowerShell zip-project.ps1 cung thu muc.
REM ============================================================

powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0zip-project.ps1"

if errorlevel 1 (
  echo.
  echo  [LOI] Dong goi that bai. Xem thong bao o tren.
  echo.
  pause
  exit /b 1
)

echo.
pause
