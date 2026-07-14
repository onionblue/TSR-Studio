#!/usr/bin/env bash
set -euo pipefail

if ! command -v Rscript >/dev/null 2>&1; then
  if ! command -v brew >/dev/null 2>&1; then
    echo "未找到 Rscript 或 Homebrew。请先安装 Homebrew。" >&2
    exit 1
  fi
  brew install r
fi

Rscript "$(cd "$(dirname "$0")" && pwd)/install-r-packages.R"
Rscript -e "library(DESeq2); cat('R=',R.version.string,'; DESeq2=',as.character(packageVersion('DESeq2')), '\n')"
