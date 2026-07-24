@echo off
chcp 65001 >nul
setlocal
cd /d "%~dp0"
where py >nul 2>nul
if %errorlevel%==0 (set "PY=py -3") else (set "PY=python")
%PY% --version >nul 2>nul
if errorlevel 1 (
  echo 未找到 Python 3。请先从 https://www.python.org/downloads/windows/ 安装 Python 3.11 或更高版本，并勾选 Add Python to PATH。
  pause
  exit /b 1
)
%PY% -m pip install --upgrade pip
%PY% -m pip install -r "%~dp0python-requirements-3.0.txt"
%PY% -c "import pandas,scipy,sklearn,shap,xgboost; print('TSR Studio 3.0.2 Python高级分析环境安装成功')"
if errorlevel 1 exit /b 1
pause
