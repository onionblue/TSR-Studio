args <- commandArgs(trailingOnly=TRUE)
if (length(args) < 6) stop("usage: limma_proteomics_runner.R matrix.csv samples.csv output.csv control model treatments_csv")
if (!requireNamespace("limma", quietly=TRUE)) stop("limma未安装；蛋白组正式模型未运行")
x <- read.csv(args[1], row.names=1, check.names=FALSE)
samples <- read.csv(args[2], row.names=1, check.names=FALSE, stringsAsFactors=FALSE)
if (!all(colnames(x) %in% rownames(samples))) stop("蛋白矩阵样本列与样本表不一致")
samples <- samples[colnames(x),,drop=FALSE]
x <- as.matrix(x); storage.mode(x) <- "numeric"
keep <- rowMeans(is.finite(x)) >= 0.5
x <- x[keep,,drop=FALSE]
if (nrow(x) < 2) stop("缺失率过滤后蛋白不足")
positive <- x[is.finite(x) & x > 0]
transformed <- length(positive) && unname(quantile(positive,.95)) > 100
if (transformed) x <- log2(x + 1)
group <- factor(samples$group)
design <- model.matrix(~0+group); colnames(design) <- levels(group)
fit <- limma::lmFit(x, design)
fit <- limma::eBayes(fit, robust=TRUE, trend=TRUE)
control <- args[4]; model <- args[5]; treatments <- Filter(nzchar, strsplit(args[6],",",fixed=TRUE)[[1]])
pairs <- list(c(control,model)); if(length(treatments)) for(z in treatments) pairs[[length(pairs)+1]] <- c(model,z)
if(length(treatments)>=2) for(z in combn(treatments,2,simplify=FALSE)) pairs[[length(pairs)+1]] <- z
out <- list()
for(pair in pairs){
  a <- pair[1]; b <- pair[2]; if(!all(c(a,b) %in% colnames(design))) next
  contrast <- limma::makeContrasts(contrasts=paste0("`",b,"`-`",a,"`"), levels=design)
  f <- limma::eBayes(limma::contrasts.fit(fit,contrast),robust=TRUE,trend=TRUE)
  tab <- limma::topTable(f,number=Inf,sort.by="none",adjust.method="BH")
  ia <- rownames(samples)[group==a]; ib <- rownames(samples)[group==b]
  scope <- if(a %in% treatments && b %in% treatments) "treatment_pairwise" else "primary"
  out[[length(out)+1]] <- data.frame(featureId=rownames(tab),label=rownames(tab),comparison=paste0(b,"_vs_",a),comparisonScope=scope,meanA=rowMeans(x[,ia,drop=FALSE],na.rm=TRUE),meanB=rowMeans(x[,ib,drop=FALSE],na.rm=TRUE),effect=tab$logFC,t=tab$t,pValue=tab$P.Value,fdr=tab$adj.P.Val,hedgesG=NA_real_,recovery=NA_real_,AveExpr=tab$AveExpr,B=tab$B,log2Transformed=transformed)
}
if(!length(out)) stop("没有可运行的预设比较；请检查组名")
write.csv(do.call(rbind,out),args[3],row.names=FALSE,na="")
