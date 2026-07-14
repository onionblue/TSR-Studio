args <- commandArgs(trailingOnly=TRUE)
if (length(args) < 6) stop("usage: deseq2_runner.R counts.csv samples.csv output.csv control model treatments_csv")
if (!requireNamespace("DESeq2", quietly=TRUE)) stop("DESeq2未安装；转录组任务未运行，也未使用t检验替代")
counts <- read.csv(args[1], row.names=1, check.names=FALSE)
samples <- read.csv(args[2], row.names=1, check.names=FALSE, stringsAsFactors=TRUE)
if (!all(colnames(counts) %in% rownames(samples))) stop("counts样本列与样本表不一致")
samples <- samples[colnames(counts),,drop=FALSE]
samples$group <- factor(samples$group)
if (any(counts < 0, na.rm=TRUE) || any(abs(counts-round(counts)) > 1e-8, na.rm=TRUE)) stop("DESeq2仅接受非负整数raw counts")
dds <- DESeq2::DESeqDataSetFromMatrix(round(as.matrix(counts)), samples, design=~group)
keep <- rowSums(DESeq2::counts(dds) >= 10) >= max(2, floor(ncol(dds)*0.25))
dds <- dds[keep,]
if (nrow(dds) < 2) stop("低计数过滤后特征不足")
dds <- tryCatch(DESeq2::DESeq(dds, quiet=TRUE), error=function(e) {
  if (!grepl("all gene-wise dispersion estimates", conditionMessage(e), fixed=TRUE)) stop(e)
  message("默认离散度曲线不可拟合，改用DESeq2基因级离散度估计")
  x <- DESeq2::estimateSizeFactors(dds)
  x <- DESeq2::estimateDispersionsGeneEst(x, quiet=TRUE)
  SummarizedExperiment::mcols(x)$dispersion <- SummarizedExperiment::mcols(x)$dispGeneEst
  DESeq2::nbinomWaldTest(x, quiet=TRUE)
})
norm <- DESeq2::counts(dds, normalized=TRUE)
control <- args[4]; model <- args[5]; treatments <- Filter(nzchar, strsplit(args[6], ",", fixed=TRUE)[[1]])
pairs <- list(c(control,model)); if(length(treatments)) for(x in treatments) pairs[[length(pairs)+1]] <- c(model,x)
if(length(treatments)>=2) for(z in combn(treatments,2,simplify=FALSE)) pairs[[length(pairs)+1]] <- z
out <- list()
for(pair in pairs){
  ga <- pair[1]; gb <- pair[2]
  if(!all(c(ga,gb) %in% levels(samples$group))) next
  res <- as.data.frame(DESeq2::results(dds, contrast=c("group",gb,ga), independentFiltering=TRUE, alpha=.05))
  ia <- rownames(samples)[samples$group==ga]; ib <- rownames(samples)[samples$group==gb]
  scope <- if(ga %in% treatments && gb %in% treatments) "treatment_pairwise" else "primary"
  rec <- data.frame(featureId=rownames(res),label=rownames(res),comparison=paste0(gb,"_vs_",ga),comparisonScope=scope,meanA=rowMeans(norm[,ia,drop=FALSE]),meanB=rowMeans(norm[,ib,drop=FALSE]),effect=res$log2FoldChange,t=res$stat,pValue=res$pvalue,fdr=res$padj,hedgesG=NA_real_,recovery=NA_real_,baseMean=res$baseMean,lfcSE=res$lfcSE)
  out[[length(out)+1]] <- rec
}
if(!length(out)) stop("没有可运行的预设比较；请检查组名映射")
write.csv(do.call(rbind,out),args[3],row.names=FALSE,na="")
