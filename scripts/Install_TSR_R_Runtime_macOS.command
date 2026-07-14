#!/bin/bash
set -euo pipefail

R_PKG_URL="https://cran.r-project.org/bin/macosx/big-sur-arm64/base/R-4.6.1-arm64.pkg"
R_PKG_SHA1="fc9f4ada15589e8e037b9bf05563d21e97181635"
TMP_PKG="${TMPDIR:-/tmp}/TSR-R-4.6.1-arm64.pkg"

echo "TSR Studio macOS R 环境安装/修复"
echo "将安装官方 CRAN R 4.6.1 ARM64，以及 TSR Studio 2.0 的差异、富集与 WGCNA 依赖。"

if [[ ! -x /Library/Frameworks/R.framework/Resources/bin/Rscript ]]; then
  /usr/bin/curl --fail --location --retry 3 "$R_PKG_URL" --output "$TMP_PKG"
  ACTUAL_SHA1=$(/usr/bin/shasum -a 1 "$TMP_PKG" | /usr/bin/awk '{print $1}')
  if [[ "$ACTUAL_SHA1" != "$R_PKG_SHA1" ]]; then
    echo "校验失败：下载文件不是预期的官方安装包。" >&2
    exit 1
  fi
  sudo /usr/sbin/installer -pkg "$TMP_PKG" -target /
fi

RSCRIPT=/Library/Frameworks/R.framework/Resources/bin/Rscript
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
if [[ -f "$SCRIPT_DIR/install-r-packages.R" ]]; then
  "$RSCRIPT" "$SCRIPT_DIR/install-r-packages.R"
else
  "$RSCRIPT" -e 'options(repos=c(CRAN="https://cloud.r-project.org")); if(!requireNamespace("BiocManager",quietly=TRUE)) install.packages("BiocManager"); install.packages(c("jsonlite","WGCNA")); BiocManager::install(c("DESeq2","limma","edgeR","clusterProfiler","org.Mm.eg.db","org.Rn.eg.db","org.Hs.eg.db"),ask=FALSE,update=FALSE)'
fi

echo
echo "安装完成。请完全退出 TSR Studio，重新打开后点击‘检测运行环境’。"
read -r -p "按回车键关闭窗口。"
