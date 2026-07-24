options(repos=c(CRAN="https://cloud.r-project.org"))
if (!requireNamespace("BiocManager", quietly=TRUE)) install.packages("BiocManager")
cran <- c("jsonlite", "WGCNA")
missing_cran <- cran[!vapply(cran, requireNamespace, logical(1), quietly=TRUE)]
if (length(missing_cran)) install.packages(missing_cran)
BiocManager::install(c("DESeq2", "limma", "edgeR", "clusterProfiler", "org.Mm.eg.db", "org.Rn.eg.db", "org.Hs.eg.db", "MOFA2", "mixOmics", "basilisk"), ask=FALSE, update=FALSE)
required <- c("DESeq2", "limma", "edgeR", "jsonlite", "WGCNA", "clusterProfiler", "org.Mm.eg.db", "org.Rn.eg.db", "org.Hs.eg.db", "MOFA2", "mixOmics", "basilisk")
missing <- required[!vapply(required, requireNamespace, logical(1), quietly=TRUE)]
if (length(missing)) stop("安装后仍缺少: ", paste(missing, collapse=", "))
cat("TSR Studio 3.0.2 R核心、多组学整合与深度分析依赖安装完成\n")
