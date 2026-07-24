#!/bin/bash
set -euo pipefail

SOURCE_DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$SOURCE_DIR"
VERSION="$(node -p "require('./package.json').version" 2>/dev/null || echo 3.0.2)"
ARCH="$(uname -m)"
TARGET="x64"
[ "$ARCH" = "arm64" ] && TARGET="arm64"

pause_on_error() {
  code=$?
  echo
  echo "构建未完成。请把本窗口最后20行截图发给开发者。"
  read -r -p "按回车关闭窗口…"
  exit "$code"
}
trap pause_on_error ERR

# 在移动硬盘、U盘或非APFS磁盘中，macOS会产生._* AppleDouble元数据文件。
# electron-builder可能把它们误认为应用资源，随后在chmod阶段报ENOENT。
# 因此全部构建工作在Mac内部临时目录完成，并禁止复制扩展属性。
export COPYFILE_DISABLE=1
export COPY_EXTENDED_ATTRIBUTES_DISABLE=1
STAGE=""
cleanup() {
  if [ -n "${STAGE:-}" ] && [ -d "$STAGE" ]; then
    rm -rf "$STAGE"
  fi
}
trap cleanup EXIT

echo "=============================================="
echo " TSR Studio $VERSION macOS 本地双击构建器"
echo " 架构：$TARGET"
echo "=============================================="

if ! command -v node >/dev/null 2>&1; then
  if ! command -v brew >/dev/null 2>&1; then
    echo "未检测到Node.js或Homebrew。"
    echo "请先安装 https://nodejs.org/ 的LTS版本，然后重新双击本文件。"
    read -r -p "按回车关闭窗口…"
    exit 1
  fi
  echo "正在通过Homebrew安装Node.js LTS…"
  brew install node@22
  brew link --overwrite node@22
fi

echo "[0/4] 创建Mac内部无隐藏元数据的临时构建目录…"
STAGE="$(mktemp -d "${TMPDIR:-/tmp}/TSR-Studio-build.XXXXXX")"
rsync -a \
  --exclude '.git' \
  --exclude 'node_modules' \
  --exclude 'node_modules.partial' \
  --exclude 'release' \
  --exclude '._*' \
  --exclude '.DS_Store' \
  "$SOURCE_DIR/" "$STAGE/"
cd "$STAGE"

# 双重清理，确保压缩包或外部磁盘带入的AppleDouble文件不会参与封装。
find . -type f \( -name '._*' -o -name '.DS_Store' \) -delete

echo "[1/4] 安装构建依赖（首次运行时间较长）…"
if ! npm ci; then
  echo "检测到依赖锁文件与npm仓库不一致，正在自动重建锁文件并重试…"
  rm -rf node_modules
  npm install --package-lock-only --ignore-scripts
  npm ci
fi

echo "[2/4] 编译TSR Studio…"
npm run build

echo "[3/4] 生成macOS应用目录…"
npx electron-builder --mac dir --"$TARGET" --publish never

APP="$(find release -maxdepth 3 -type d -name 'TSR Studio.app' -print -quit)"
if [ -z "$APP" ]; then
  echo "未找到构建后的TSR Studio.app。"
  exit 1
fi

echo "[4/4] 本机临时签名并生成DMG/ZIP…"
codesign --force --deep --sign - "$APP"
xattr -cr "$APP"

DEST="$HOME/Desktop/TSR-Studio-$VERSION-macOS-$TARGET"
mkdir -p "$DEST"
ditto -c -k --sequesterRsrc --keepParent "$APP" "$DEST/TSR-Studio-$VERSION-macOS-$TARGET.zip"
hdiutil create -volname "TSR Studio" -srcfolder "$APP" -ov -format UDZO "$DEST/TSR-Studio-$VERSION-macOS-$TARGET.dmg"
xattr -cr "$DEST"

echo
echo "构建完成：$DEST"
echo "该版本已进行本机临时签名，仅供本机和科研团队内部使用。"
echo "首次打开若被拦截：按住Control点击应用 → 打开。"
open "$DEST"
read -r -p "按回车关闭窗口…"
