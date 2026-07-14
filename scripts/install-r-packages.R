options(repos=c(CRAN="https://cloud.r-project.org"))
if (!requireNamespace("BiocManager", quietly=TRUE)) install.packages("BiocManager")
BiocManager::install(c("DESeq2", "limma", "edgeR"), ask=FALSE, update=FALSE)
required <- c("DESeq2", "limma", "edgeR")
missing <- required[!vapply(required, requireNamespace, logical(1), quietly=TRUE)]
if (length(missing)) stop("安装后仍缺少: ", paste(missing, collapse=", "))
cat("TSR Studio R核心依赖安装完成\n")
