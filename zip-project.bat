@echo off
setlocal
REM ============================================================
REM  BrewLite - Auto Zip Project (Dong goi source code sach)
REM  - Tu dong loai bo: node_modules, .git, .worktrees, .tmp, build...
REM  - Bao gom day du: Source code, docs, database, tests va .env*
REM ============================================================

title Dong goi du an BrewLite

powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\zip-project.ps1"

if errorlevel 1 (
  echo.
  echo  [LOI] Dong goi that bai. Vui long xem thong bao loi o tren.
  echo.
  pause
  exit /b 1
)

echo.
pause
