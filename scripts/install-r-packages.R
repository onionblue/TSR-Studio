options(repos=c(CRAN="https://cloud.r-project.org"))
if (!requireNamespace("BiocManager", quietly=TRUE)) install.packages("BiocManager")
cran <- c("jsonlite", "WGCNA")
missing_cran <- cran[!vapply(cran, requireNamespace, logical(1), quietly=TRUE)]
if (length(missing_cran)) install.packages(missing_cran)
BiocManager::install(c("DESeq2", "limma", "edgeR", "clusterProfiler", "org.Mm.eg.db", "org.Rn.eg.db", "org.Hs.eg.db"), ask=FALSE, update=FALSE)
required <- c("DESeq2", "limma", "edgeR", "jsonlite", "WGCNA", "clusterProfiler", "org.Mm.eg.db", "org.Rn.eg.db", "org.Hs.eg.db")
missing <- required[!vapply(required, requireNamespace, logical(1), quietly=TRUE)]
if (length(missing)) stop("安装后仍缺少: ", paste(missing, collapse=", "))
cat("TSR Studio 2.0 R核心与深度分析依赖安装完成\n")
