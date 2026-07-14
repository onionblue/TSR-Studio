#!/bin/bash
set -euo pipefail

cd "$(dirname "$0")"
echo "TSR Studio 1.0 macOS 构建器"
echo "工作目录：$PWD"

if ! command -v brew >/dev/null 2>&1; then
  echo "没有检测到 Homebrew。请先从 https://brew.sh 安装 Homebrew，然后重新双击本文件。"
  read -r -p "按回车退出…"
  exit 1
fi

if ! command -v node >/dev/null 2>&1; then
  echo "正在安装 Node.js…"
  brew install node@22
  brew link --overwrite node@22
fi

echo "正在部署 R 及 DESeq2/limma/edgeR…"
bash scripts/deploy-r-macos.sh

echo "正在安装桌面程序依赖…"
npm ci
npm run build

ARCH="$(uname -m)"
if [ "$ARCH" = "arm64" ]; then
  TARGET="arm64"
else
  TARGET="x64"
fi

echo "正在构建 $TARGET 架构的DMG和ZIP…"
npx electron-builder --mac dmg zip --"$TARGET"

DEST="$HOME/Desktop/TSR-Studio-1.0-macOS-$TARGET"
mkdir -p "$DEST"
cp -R release/*.dmg release/*.zip "$DEST/"

echo
echo "构建完成：$DEST"
echo "首次打开未签名应用时，请按住Control点击应用，选择“打开”。"
open "$DEST"
read -r -p "按回车关闭窗口…"
