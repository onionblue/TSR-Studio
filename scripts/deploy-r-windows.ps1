$ErrorActionPreference = "Stop"

if (-not (Get-Command Rscript.exe -ErrorAction SilentlyContinue)) {
  if (-not (Get-Command winget.exe -ErrorAction SilentlyContinue)) {
    throw "未找到 Rscript 或 winget。请先安装 R 4.3+。"
  }
  winget install --id RProject.R --exact --accept-package-agreements --accept-source-agreements
  $r = Get-ChildItem "C:\Program Files\R" -Filter Rscript.exe -Recurse |
    Sort-Object FullName -Descending | Select-Object -First 1
  if (-not $r) { throw "R 已安装，但没有找到 Rscript.exe。请重新打开终端。" }
  $env:Path = "$(Split-Path $r.FullName);$env:Path"
}

$rscript = (Get-Command Rscript.exe -ErrorAction Stop).Source
& $rscript "$PSScriptRoot\install-r-packages.R"
if ($LASTEXITCODE -ne 0) { throw "R package installation returned exit code $LASTEXITCODE" }
& $rscript -e "p<-c('DESeq2','limma','edgeR','jsonlite','WGCNA','clusterProfiler','org.Mm.eg.db','org.Rn.eg.db','org.Hs.eg.db'); ok<-vapply(p,requireNamespace,logical(1),quietly=TRUE); print(ok); if(!all(ok)) quit(status=2); cat(R.version.string,' | all TSR Studio dependencies=TRUE\n')"
if ($LASTEXITCODE -ne 0) { throw "R dependency verification failed" }
