#!/bin/bash
set -e
cd "$(dirname "$0")"
PY="$(command -v python3 || true)"
if [ -z "$PY" ]; then
  echo "未找到 Python 3。请先从 https://www.python.org/downloads/macos/ 安装 Python 3.11 或更高版本。"
  read -r -p "按回车退出..."
  exit 1
fi
REQ="$(pwd)/python-requirements-3.0.txt"
"$PY" -m pip install --upgrade pip
"$PY" -m pip install -r "$REQ"
"$PY" -c 'import pandas,scipy,sklearn,shap,xgboost; print("TSR Studio 3.0.2 Python高级分析环境安装成功")'
read -r -p "按回车关闭..."
