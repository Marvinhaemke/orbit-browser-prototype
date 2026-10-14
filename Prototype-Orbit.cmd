@echo off
setlocal
cd /d "%~dp0"
if exist ".venv\Scripts\python.exe" (
  ".venv\Scripts\python.exe" -u scripts\prototype.py --open %*
) else (
  py -3 -u scripts\prototype.py --open %*
)
if errorlevel 1 pause
